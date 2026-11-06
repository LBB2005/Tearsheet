"""The company list and the look-up box (the sidebar of the app).

`list_companies` is every company that has a stored report. `search_companies` looks the S&P 500
list up by ticker, by brand alias, then by name, and says which results already have a report
and, in plain words, which companies each would be compared with (the peer-group rule).
"""

from __future__ import annotations

import json
import sqlite3
from importlib import resources
from typing import Any

import yaml

from tearsheet.data import membership
from tearsheet.data.prices import PriceStore
from tearsheet.peers import build_peer_group


def normalise_ticker(text: str) -> str:
    """Upper-case, trimmed, with `-` and `.` treated as the same (stored as `.`)."""
    return text.strip().upper().replace("-", ".")


def _aliases() -> dict[str, int]:
    text = (resources.files("tearsheet.methodology") / "aliases.yaml").read_text(encoding="utf-8")
    found = (yaml.safe_load(text) or {}).get("aliases") or {}
    return {str(k).lower(): int(v) for k, v in found.items()}


def bundled_peer_cap() -> int:
    """The most peers a group has (peers.yaml's peer_cap)."""
    text = (resources.files("tearsheet.methodology") / "peers.yaml").read_text(encoding="utf-8")
    return int((yaml.safe_load(text) or {})["peer_cap"])


def peer_rule(holdings: membership.Holdings, cik: int, cap: int) -> str | None:
    """The peer-group rule for a company, in plain words, from the same rule a run uses
    (peers.build_peer_group): the largest other members of its sector by index weight, up to
    the cap. None when the list gives it no sector."""
    sector = holdings.company(cik).sector
    if not sector:
        return None
    peers = len(build_peer_group(holdings, cik, cap=cap, trend=0).peers)
    others = len(holdings.sector_members(sector)) - 1
    where = f"S&P 500 {sector}"
    if peers == 0:
        return f"No other {where} companies to compare with"
    if others > peers:
        return f"Compared with the {peers} largest other {where} companies, by index weight"
    if peers == 1:
        return f"Compared with the one other {where} company"
    return f"Compared with the other {peers} {where} companies"


def _report_rows(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    """Every stored report with its company and ticker, newest first."""
    rows = conn.execute(
        "SELECT r.report_id, r.created_at, u.cik, u.run_id, c.name,"
        " (SELECT json FROM step_outputs s WHERE s.run_id = r.run_id AND s.step = 'resolve')"
        "   AS resolve"
        " FROM reports r JOIN runs u ON u.run_id = r.run_id"
        " LEFT JOIN companies c ON c.cik = u.cik"
        " WHERE u.cik IS NOT NULL ORDER BY r.created_at DESC, r.rowid DESC"
    ).fetchall()
    return rows


def _ticker_of(row: sqlite3.Row, holdings: membership.Holdings) -> str:
    try:
        ticker = json.loads(row["resolve"] or "{}").get("ticker")
    except (ValueError, AttributeError):
        ticker = None
    if ticker:
        return str(ticker)
    if holdings.has(row["cik"]):
        return holdings.tickers_of(row["cik"])[0]
    return ""


def run_company(conn: sqlite3.Connection, run_id: str) -> dict[str, str | None]:
    """The company a run resolved in step 1: its ticker, and its name as the look-up list gives
    it (the name the person just picked), else the name SEC gave it. Both are None until step 1
    has finished."""
    row = conn.execute(
        "SELECT json FROM step_outputs WHERE run_id = ? AND step = 'resolve'", (run_id,)
    ).fetchone()
    try:
        resolved = json.loads(row[0]) if row else {}
    except ValueError:
        resolved = {}
    ticker = resolved.get("ticker") or None
    cik = resolved.get("cik")
    if not isinstance(cik, int):
        return {"ticker": ticker, "name": ticker}
    holdings = membership.load_bundled()
    if holdings.has(cik):
        return {"ticker": ticker, "name": holdings.name_of(cik)}
    stored = conn.execute("SELECT name FROM companies WHERE cik = ?", (cik,)).fetchone()
    return {"ticker": ticker, "name": (stored[0] if stored else None) or ticker}


def list_companies(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    holdings = membership.load_bundled()
    prices = PriceStore(conn)
    out: dict[int, dict[str, Any]] = {}
    for row in _report_rows(conn):
        cik = row["cik"]
        if cik in out:
            out[cik]["reports"] += 1
            continue
        ticker = _ticker_of(row, holdings)
        name = row["name"] or (holdings.company(cik).name if holdings.has(cik) else ticker)
        latest = prices.latest_close(cik)
        out[cik] = {
            "cik": cik,
            "ticker": ticker,
            "name": name,
            "report_id": row["report_id"],
            "report_date": row["created_at"][:10],
            "reports": 1,
            "price": latest[1] if latest else None,
            "price_date": latest[0].isoformat() if latest else None,
        }
    return list(out.values())  # already newest report first


def search_companies(
    conn: sqlite3.Connection | None, query: str, limit: int = 5, *, peer_cap: int | None = None
) -> list[dict[str, Any]]:
    text = query.strip()
    if not text:
        return []
    holdings = membership.load_bundled()
    ticker_query = normalise_ticker(text)
    lowered = text.lower()
    rows = sorted(holdings.rows, key=lambda r: (-r.weight, r.ticker))

    ordered: list[membership.HoldingRow] = []
    seen: set[str] = set()

    def take(candidates: list[membership.HoldingRow]) -> None:
        for row in candidates:
            if row.ticker not in seen:
                seen.add(row.ticker)
                ordered.append(row)

    exact = [r for r in rows if r.ticker == ticker_query]
    take(exact)
    take([r for r in rows if r.ticker.startswith(ticker_query)])
    alias_ciks = [cik for alias, cik in _aliases().items() if alias.startswith(lowered)]
    for cik in alias_ciks:
        if holdings.has(cik):
            first = holdings.tickers_of(cik)[0]
            take([r for r in rows if r.ticker == first])
    take([r for r in rows if lowered in r.name.lower()])

    cap = peer_cap if peer_cap is not None else bundled_peer_cap()
    reports: dict[int, tuple[str, str]] = {}
    if conn is not None:
        for row in reversed(_report_rows(conn)):  # oldest first, so the newest wins
            reports[row["cik"]] = (row["report_id"], row["created_at"][:10])
    return [
        {
            "ticker": r.ticker,
            "name": r.name,
            "sector": r.sector,
            "cik": r.cik,
            "report_id": reports[r.cik][0] if r.cik in reports else None,
            "report_date": reports[r.cik][1] if r.cik in reports else None,
            "peer_rule": peer_rule(holdings, r.cik, cap),
        }
        for r in ordered[:limit]
    ]
