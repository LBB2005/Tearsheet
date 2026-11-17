"""A Dig deeper snapshot: every part built (each in its own try, so one failure stays in its
part), a failed part carried from the previous snapshot as "stale", the whole checked against
protocol.DigSnapshot, and saved once in dig_snapshots.

The snapshot's id is also the run id of its fetches, so the bytes it was built from are kept
in the raw-data folder with fetch_log rows (replay-dig rebuilds it from them)."""

from __future__ import annotations

import hashlib
import json
import logging
import secrets
import sqlite3
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from functools import cache
from pathlib import Path
from typing import Any

from tearsheet import __version__
from tearsheet.data.articles import Allowlist
from tearsheet.data.membership import Holdings
from tearsheet.data.prices import PriceStore, last_completed_session
from tearsheet.dig import DIG_CODE_VERSION
from tearsheet.dig.analysts import analysts_part
from tearsheet.dig.insiders import INSIDER_DAYS, insiders_part
from tearsheet.dig.market import market_part, rates_part
from tearsheet.dig.news import news_part, tone_counts
from tearsheet.dig.peers import peers_part
from tearsheet.dig.sector import sector_part
from tearsheet.dig.target import Target
from tearsheet.http import EASTERN
from tearsheet.methodology import load as load_methodology
from tearsheet.protocol import DigSnapshot

log = logging.getLogger(__name__)

PARTS = ("sector", "market", "rates", "peers", "analysts", "insiders", "news")
SOURCE_NAMES = {
    "sector": "Prices from Massive",
    "market": "Prices from Massive",
    "rates": "FRED",
    "peers": "The report’s stored numbers",
    "analysts": "analystdb",
    "insiders": "SEC Form 4 filings",
    "news": "Massive news",
}
# Each part's fields when its builder gave only a state and a note.
EMPTY: dict[str, dict[str, Any]] = {
    "sector": {
        "sector": None,
        "members": 0,
        "left_out": 0,
        "dates": [],
        "stock": [],
        "sector_line": [],
        "spy": [],
        "returns": [],
        "rank": None,
        "rank_of": None,
    },
    "market": {
        "spy_12m": None,
        "volatility_percentile": None,
        "scaling_on": None,
        "scaling_note": None,
    },
    "rates": {"rates": []},
    "peers": {
        "run_id": None,
        "report_date": None,
        "price_date": None,
        "columns": [],
        "rows": [],
        "median": {},
        "recomputed_note": None,
    },
    "analysts": {"view": None, "ours": None},
    "insiders": {
        "days": INSIDER_DAYS,
        "buys": None,
        "sells": None,
        "rows": [],
        "routine_free_buyers": [],
    },
    "news": {"since": None, "items": [], "tone": tone_counts([]), "source": "Massive"},
}
NEWS_DAYS_WITHOUT_REPORT = 30


@dataclass
class Sources:
    """What a refresh fetches through: the run's HTTP client (news), its LiveData (Form 4,
    FRED), the settings, the raw store, analystdb, and which keys are saved."""

    http: Any
    live: Any
    settings: Any
    rawstore: Any
    analystdb: Any
    fred_key: bool
    massive_key: bool


@cache
def shipped_news_sites() -> tuple[str, ...]:
    """The news allowlist as shipped, without the user's allowlist.local.yaml: the app's main
    process opens links only for these (app/src/main/newsSites.ts), so a news link is marked
    openable only for these too."""
    return tuple(load_methodology().allowlist_sites())


def new_snapshot_id(cik: int, now: datetime) -> str:
    return f"dig-{cik}-{now.astimezone(UTC):%Y%m%dT%H%M%SZ}-{secrets.token_hex(3)}"


def _down(part: str, note: str | None = None) -> dict[str, Any]:
    return {"state": "down", "note": note or f"{SOURCE_NAMES[part]} couldn’t be read."}


def _built(part: str, make: Callable[[], dict[str, Any]]) -> dict[str, Any]:
    try:
        return make()
    except Exception:  # noqa: BLE001 - one part's failure never stops the others
        log.warning("Dig deeper's %s part failed", part, exc_info=True)
        return _down(part)


async def _fetched(part: str, make: Callable[[], Awaitable[dict[str, Any]]]) -> dict[str, Any]:
    try:
        return await make()
    except Exception:  # noqa: BLE001
        log.warning("Dig deeper's %s part failed", part, exc_info=True)
        return _down(part)


async def _or_none(make: Callable[[], Awaitable[Any]]) -> Any:
    try:
        return await make()
    except Exception:  # noqa: BLE001 - the part says its source didn't answer
        log.warning("A Dig deeper fetch failed", exc_info=True)
        return None


def carry_forward(part: str, fresh: dict[str, Any], previous: dict[str, Any] | None):
    """A part that failed now takes the previous snapshot's copy, marked stale, when that one
    had data (ok or stale). Its `as_of` stays that copy's time."""
    if fresh["state"] != "down" or not previous:
        return fresh
    before = previous.get(part)
    if not isinstance(before, dict) or before.get("state") not in ("ok", "stale"):
        return fresh
    return {**before, "state": "stale", "note": fresh.get("note")}


def _news_since(target: Target, today: date) -> date:
    if target.shown.made_at:
        try:
            return datetime.fromisoformat(target.shown.made_at).astimezone(UTC).date()
        except ValueError:
            pass
    return today - timedelta(days=NEWS_DAYS_WITHOUT_REPORT)


async def build(
    conn: sqlite3.Connection,
    raw_dir: Path,
    holdings: Holdings,
    method,
    target: Target,
    sources: Sources,
    *,
    now: datetime,
    snapshot_id: str,
    previous: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """The snapshot as protocol.DigSnapshot's JSON. Fetches through `sources` under
    `snapshot_id`; writes no row (save does)."""
    created = now.astimezone(UTC).isoformat(timespec="seconds")
    today = now.astimezone(EASTERN).date()
    up_to = target.close[0] if target.close else last_completed_session(now)
    prices = PriceStore(conn)
    cik, ticker = target.cik, target.ticker
    parts: dict[str, dict[str, Any]] = {
        "sector": _built("sector", lambda: sector_part(prices, holdings, target, up_to=up_to)),
        "market": _built(
            "market",
            lambda: market_part(prices, method.weights["momentum_scaling"], up_to=up_to),
        ),
        "peers": _built(
            "peers",
            lambda: peers_part(
                conn, raw_dir, target, prices, holdings, up_to=up_to, before=created
            ),
        ),
    }
    macro = await _or_none(lambda: sources.live.macro(today)) if sources.fred_key else {}
    parts["rates"] = rates_part(macro, fred_key=sources.fred_key)
    trades = await _or_none(lambda: sources.live.form4_amounts(cik, today=today))
    parts["insiders"] = insiders_part(trades, today=today)

    async def analysts() -> dict[str, Any]:
        view = await sources.analystdb.saved_view(ticker, today, sources.rawstore, snapshot_id)
        return analysts_part(
            {"report_id": target.shown.report_id or "", **view}, target.levels_today
        )

    parts["analysts"] = await _fetched("analysts", analysts)
    parts["news"] = await _fetched(
        "news",
        lambda: news_part(
            sources.http,
            sources.settings,
            ticker,
            since=_news_since(target, today),
            today=today,
            allowlist=Allowlist(shipped_news_sites()),
            has_key=sources.massive_key,
        ),
    )
    complete = {}
    for name in PARTS:
        fresh = {**EMPTY[name], "note": None, **parts[name], "as_of": created}
        complete[name] = carry_forward(name, fresh, previous)
    close = target.close
    out = {
        "snapshot_id": snapshot_id,
        "cik": cik,
        "created_at": created,
        "close_date": close[0].isoformat() if close else None,
        "report_id": target.shown.report_id,
        "run_id": target.shown.run_id,
        "versions": {"dig_code": DIG_CODE_VERSION, "engine": __version__},
        "header": {
            "cik": cik,
            "ticker": ticker,
            "name": target.name,
            "sector": target.sector,
            "close": close[1] if close else None,
            "close_date": close[0].isoformat() if close else None,
            "since_report": target.since_report,
            "made_at": target.shown.made_at,
            "levels": target.levels_today,
        },
        **complete,
        "sources": [
            {
                "part": name,
                "name": SOURCE_NAMES[name],
                "state": complete[name]["state"],
                "as_of": complete[name]["as_of"],
            }
            for name in PARTS
        ],
    }
    return DigSnapshot.model_validate(out).model_dump(mode="json")


def inputs_hash(
    conn: sqlite3.Connection,
    snapshot_id: str,
    *,
    report_id: str | None,
    run_id: str | None,
    close_date: str | None,
) -> str:
    """The hash of what a snapshot was built from: its fetched bytes (by address) and the
    report it read."""
    fetched = sorted(
        (r[0], r[1])
        for r in conn.execute(
            "SELECT request_key, raw_hash FROM fetch_log WHERE run_id = ?", (snapshot_id,)
        )
    )
    blob = json.dumps(
        {"fetched": fetched, "report_id": report_id, "run_id": run_id, "close_date": close_date},
        sort_keys=True,
    )
    return hashlib.sha256(blob.encode()).hexdigest()


def save(conn: sqlite3.Connection, snapshot: dict[str, Any]) -> None:
    """Saves the snapshot once; a second save of the same id raises (write-once)."""
    with conn:
        conn.execute(
            "INSERT INTO dig_snapshots (snapshot_id, cik, created_at, close_date, report_id,"
            " run_id, versions_json, inputs_hash, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                snapshot["snapshot_id"],
                snapshot["cik"],
                snapshot["created_at"],
                snapshot["close_date"],
                snapshot["report_id"],
                snapshot["run_id"],
                json.dumps(snapshot["versions"], sort_keys=True),
                inputs_hash(
                    conn,
                    snapshot["snapshot_id"],
                    report_id=snapshot["report_id"],
                    run_id=snapshot["run_id"],
                    close_date=snapshot["close_date"],
                ),
                json.dumps(snapshot, sort_keys=True),
            ),
        )


def newest(conn: sqlite3.Connection, cik: int) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT json FROM dig_snapshots WHERE cik = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
        (cik,),
    ).fetchone()
    return json.loads(row[0]) if row else None


def count(conn: sqlite3.Connection, cik: int) -> int:
    return conn.execute("SELECT COUNT(*) FROM dig_snapshots WHERE cik = ?", (cik,)).fetchone()[0]
