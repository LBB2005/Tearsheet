"""Wall Street analyst ratings from analystdb (design item 20; Open Questions, analyst ratings).

analystdb is Liam's own project: a local, read-only API at http://127.0.0.1:8765 with analyst
ratings, price targets and firm track records for S&P 500 stocks. It needs no key and answers
only on this Mac (its guide: ~/code/analysis-rating-stock/docs/USING-THE-API.md).

Tearsheet asks it when a report opens, as of the report's price date, and shows the answer beside
the report's own numbers: a panel in the numbers column, and a bigger view in the side panel. It
never feeds the rating, score, range, prediction, narrative or checks, and nothing from it is
stored, so a report and its replay are the same with or without it. The report's own section 1
still says the consensus is not available (data/analyst.py); the app hides that line while this
panel shows.

analystdb may be off, slow or broken, and a report must then open just as it always has. So
every call has a half-second limit, nothing here raises, and a failure gives a quiet line instead
of the panel; after a failure analystdb isn't asked again for a minute. Answers are kept in
memory for four hours, since analystdb changes once each weekday evening. Only analystdb's own
address is ever asked: no redirect is followed, no proxy setting applies, and nothing is sent but
the ticker and the date.
"""

from __future__ import annotations

import asyncio
import logging
import math
import re
import time
from collections.abc import Callable
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

import httpx

from tearsheet import readouts
from tearsheet.render import format_value

log = logging.getLogger(__name__)

BASE_URL = "http://127.0.0.1:8765"
TIME_LIMIT_S = 0.5
KEEP_S = 4 * 60 * 60
QUIET_S = 60
CHANGES = 20  # recent changes shown
MIN_CALLS = 20  # firms with fewer closed calls have no track record in the scorecards
EASTERN = ZoneInfo("America/New_York")  # analystdb's dates are Eastern trading days

# A ticker as analystdb spells it: a dot for a share class (BRK.B). Anything else is never put in
# an address.
_TICKER = re.compile(r"[A-Z0-9]{1,6}(\.[A-Z]{1,2})?")

SIDES = ("buy", "hold", "sell")
_SCORE_SIDE = {1: "buy", 2: "buy", 3: "hold", 4: "sell", 5: "sell"}
ACTIONS = {
    "up": "Upgrade",
    "down": "Downgrade",
    "init": "Initiated",
    "main": "Maintained",
    "reit": "Reiterated",
}
# The trust check's rows, from S&P Global's figures: (measure, label, in dollars).
CHECKS = (
    ("target_mean", "Average target", True),
    ("target_median", "Median target", True),
    ("target_high", "High target", True),
    ("target_low", "Low target", True),
    ("buy_side", "Buy-side firms", False),
    ("hold", "Hold firms", False),
    ("sell_side", "Sell-side firms", False),
    ("n_with_target", "Firms with a target", False),
)
NOT_LOADED = "—"


def down_note() -> str:
    return "Analyst ratings: analystdb isn’t answering."


def missing_note(ticker: str, asof_text: str) -> str:
    return f"Analyst ratings: analystdb has none for {ticker} as of {asof_text}."


def part_note(part: str) -> str:
    return f"{part} didn’t load: analystdb isn’t answering."


class _Gone(Exception):
    """analystdb gave no usable answer: off, slow, an error or an answer of the wrong shape."""


class _Missing(Exception):
    """analystdb answered that it has nothing for this ticker or day."""


_MISSING = object()  # a kept 404 or 422


# --- reading the answers --------------------------------------------------------------------------


def _count(value: Any) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"not a count: {value!r}")
    return value


def _number(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"not a number: {value!r}")
    return float(value)


def _text(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def _excess(value: Any) -> float | None:
    """A firm's average excess return; None when too few calls to judge (`null`, or a metric
    marked insufficient_data)."""
    if value is None or isinstance(value, dict):
        return None
    return _number(value)


def _eastern_day(stamp: Any) -> date:
    moment = datetime.fromisoformat(str(stamp).replace("Z", "+00:00"))
    return moment.astimezone(EASTERN).date() if moment.tzinfo else moment.date()


def _half_up(value: float, places: int = 1) -> Decimal:
    return Decimal(repr(value)).quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)


def _signed_percent(fraction: float) -> str:
    """−0.5%, +3.0%: one place, rounded half up, with a true minus sign."""
    tenths = _half_up(fraction * 100)
    sign = "+" if tenths > 0 else "−" if tenths < 0 else ""
    return f"{sign}{abs(tenths)}%"


def _dollars(value: float | None) -> str:
    """A target in a table: whole dollars when it is whole ($700), else to the cent ($12.50)."""
    if value is None:
        return NOT_LOADED
    return f"${value:,.0f}" if value == round(value) else f"${value:,.2f}"


def symbol_for(ticker: str) -> str | None:
    """The ticker as analystdb spells it, or None for anything that isn't a ticker."""
    spelled = ticker.strip().upper().replace("-", ".")
    return spelled if _TICKER.fullmatch(spelled) else None


def _quiet(state: str, ticker: str, day: date) -> dict:
    asof_text = format_value("date", day)
    return {
        "state": state,
        "note": down_note() if state == "down" else missing_note(ticker, asof_text),
        "ticker": ticker,
        "asof": day.isoformat(),
        "asof_text": asof_text,
        "rebuilt": False,
        "stale": [],
        "n_firms": None,
        "sides": None,
        "target": None,
    }


def _head(ticker: str, envelope: dict) -> dict:
    """The panel's figures from a /consensus answer. Raises _Missing when no firm covers it."""
    data = envelope["data"]
    n_firms = _count(data["n_firms"])
    if n_firms == 0:
        raise _Missing
    sides = {side: _count(data["sides"][side]) for side in SIDES}
    target = data["target"]
    asof = date.fromisoformat(envelope["asof"])
    stale = [
        source["name"]
        for source in envelope.get("sources") or []
        if isinstance(source, dict) and source.get("stale") is True and _text(source.get("name"))
    ]
    return {
        "state": "ok",
        "note": None,
        "ticker": ticker,
        "asof": asof.isoformat(),
        "asof_text": format_value("date", asof),
        "rebuilt": envelope.get("rebuilt") is True,
        "stale": stale,
        "n_firms": n_firms,
        "sides": sides,
        "target": {
            **{k: _number(target.get(k)) for k in ("mean", "median", "high", "low")},
            "n": _count(target.get("n", 0)),
        },
    }


def _firm(row: dict, tracks: dict[str, dict] | None, ranked_of: int | None) -> dict:
    slug = str(row["firm_slug"])
    firm, label = str(row["firm"]), str(row["label"])
    target = _number(row.get("target"))
    day = _eastern_day(row["published_at"])
    day_text = format_value("date", day)
    card = tracks.get(slug) if tracks is not None else None
    rank = card.get("rank") if card else None
    rank = None if isinstance(rank, bool) or not isinstance(rank, int) else rank
    excess = _excess(card.get("avg_excess")) if card else None
    if tracks is None:
        rank_text = excess_text = NOT_LOADED
    else:
        rank_text = f"#{rank} of {ranked_of}" if rank is not None else "not ranked"
        excess_text = _signed_percent(excess) if excess is not None else "not enough data"
    return {
        "firm": firm,
        "firm_slug": slug,
        "label": label,
        "side": _SCORE_SIDE.get(row.get("score")),
        "target": target,
        "target_text": _dollars(target),
        "date": day.isoformat(),
        "date_text": day_text,
        "rank": rank,
        "rank_text": rank_text,
        "avg_excess": excess,
        "excess_text": excess_text,
        "readout": readouts.analyst_firm(
            firm,
            label,
            target,
            day_text,
            rank,
            ranked_of if tracks is not None else None,
            _signed_percent(excess) if excess is not None else None,
        ),
    }


def _change(item: dict) -> dict:
    day = _eastern_day(item["published_at"])
    day_text = format_value("date", day)
    firm, action = str(item["firm"]), str(item["action"])
    before, after = _text(item.get("from_label")), _text(item.get("to_label"))
    prior, current = _number(item.get("target_prior")), _number(item.get("target_current"))
    if before and after and before != after:
        rating_text = f"{before} → {after}"
    else:
        rating_text = after or before or NOT_LOADED
    if current is None:
        target_text = NOT_LOADED
    elif prior is None or prior == current:
        target_text = _dollars(current)
    else:
        target_text = f"{_dollars(prior)} → {_dollars(current)}"
    return {
        "date": day.isoformat(),
        "date_text": day_text,
        "firm": firm,
        "action": action,
        "action_label": ACTIONS.get(action, action.capitalize()),
        "from_label": before,
        "to_label": after,
        "rating_text": rating_text,
        "target_prior": prior,
        "target_current": current,
        "target_text": target_text,
        "readout": readouts.analyst_change(firm, action, before, after, prior, current, day_text),
    }


def _check_row(measure: str, label: str, money: bool, row: dict) -> dict:
    ours, theirs = _number(row.get("ours")), _number(row["theirs"])
    within = row["within_tolerance"] is True
    tolerance, unit = _number(row.get("tolerance")), str(row.get("tolerance_unit") or "")

    def shown(v: float | None) -> str:
        if v is None:
            return "not available"
        return format_value("price", v) if money else f"{v:,.0f}"

    gap_text, gap_words = NOT_LOADED, None
    if ours is not None and money and theirs:
        fraction = ours / theirs - 1
        tenths = _half_up(abs(fraction) * 100)
        gap_text = _signed_percent(fraction)
        gap_words = (
            "the same" if tenths == 0 else f"{tenths}% {'higher' if fraction > 0 else 'lower'}"
        )
    elif ours is not None and not money:
        diff = round(ours - theirs)
        gap_text = f"{diff:+d}".replace("-", "−") if diff else "0"
        gap_words = "the same" if diff == 0 else f"{abs(diff)} {'more' if diff > 0 else 'fewer'}"
    if tolerance is None:
        tolerance_text = "stated"
    elif unit == "fraction":
        tolerance_text = f"{tolerance * 100:g}%"
    elif unit == "firms":
        tolerance_text = f"{tolerance:g}-firm"
    else:
        tolerance_text = f"{tolerance:g} {unit}".strip()
    ours_text, theirs_text = shown(ours), shown(theirs)
    return {
        "measure": measure,
        "label": label,
        "money": money,
        "ours": ours,
        "theirs": theirs,
        "ours_text": ours_text,
        "theirs_text": theirs_text,
        # analystdb's own gap and verdict; gap_text is worked out from ours and theirs, rounded
        # half up, so the table and the readout always agree.
        "diff_fraction": _number(row.get("diff_fraction")),
        "gap_text": gap_text,
        "within_tolerance": within,
        "tolerance_text": tolerance_text,
        "readout": readouts.analyst_check(
            label, ours_text, theirs_text, gap_words, within, tolerance_text
        ),
    }


def _check(ticker: str, asof_text: str, envelope: dict) -> tuple[dict | None, str | None]:
    rows = {
        row["measure"]: row
        for row in envelope["data"]
        if isinstance(row, dict) and row.get("supplier") == "spglobal"
    }
    found = [_check_row(m, label, money, rows[m]) for m, label, money in CHECKS if m in rows]
    if not found:
        return None, f"S&P Global has no figures for {ticker} as of {asof_text}."
    fetched = max(_eastern_day(rows[r["measure"]]["their_fetched_at"]) for r in found)
    return {
        "supplier": "S&P Global",
        "fetched": fetched.isoformat(),
        "fetched_text": format_value("date", fetched),
        "rows": found,
    }, None


# --- the client -----------------------------------------------------------------------------------


class AnalystDB:
    """analystdb's answers, kept in memory. One per engine; `transport` and `clock` are for
    tests."""

    def __init__(
        self,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        clock: Callable[[], float] = time.monotonic,
        time_limit: float = TIME_LIMIT_S,
    ) -> None:
        self._transport = transport
        self._clock = clock
        self._time_limit = time_limit
        self._kept: dict[str, tuple[float, Any]] = {}
        self._quiet_until = -math.inf

    def _resting(self) -> bool:
        return self._clock() < self._quiet_until

    def _rest(self) -> None:
        self._quiet_until = self._clock() + QUIET_S

    async def _get(self, path: str, params: dict[str, str], *, resting: bool) -> Any:
        """One answer's envelope, from memory when asked for within KEEP_S. Raises _Missing for
        a 404 or 422, and _Gone for anything else that isn't a usable answer, or while resting
        after a failure."""
        key = f"{path}?{urlencode(sorted(params.items()))}"
        kept = self._kept.get(key)
        if kept is not None and self._clock() - kept[0] < KEEP_S:
            if kept[1] is _MISSING:
                raise _Missing
            return kept[1]
        if resting:
            raise _Gone
        try:
            async with httpx.AsyncClient(
                base_url=BASE_URL,
                transport=self._transport,
                timeout=self._time_limit,
                trust_env=False,
                follow_redirects=False,
            ) as client:
                response = await asyncio.wait_for(client.get(path, params=params), self._time_limit)
            if response.status_code in (404, 422):
                self._kept[key] = (self._clock(), _MISSING)
                raise _Missing
            if response.status_code != 200:
                raise _Gone(f"status {response.status_code}")
            envelope = response.json()
            if not isinstance(envelope, dict) or not isinstance(envelope.get("data"), dict | list):
                raise _Gone("an answer of the wrong shape")
        except _Missing:
            raise
        except Exception as exc:  # noqa: BLE001 - whatever went wrong, the report goes on
            log.info("analystdb %s: %s", path, exc or type(exc).__name__)
            self._rest()
            raise _Gone from exc
        self._kept[key] = (self._clock(), envelope)
        return envelope

    async def panel(self, ticker: str, day: date) -> dict:
        """The numbers column's panel: the firm count, Buy / Hold / Sell, and the targets, as
        of `day`; or the quiet line. Never raises."""
        symbol = symbol_for(ticker)
        if symbol is None:
            return _quiet("missing", ticker.strip().upper()[:12], day)
        try:
            envelope = await self._get(
                f"/consensus/{symbol}", {"asof": day.isoformat()}, resting=self._resting()
            )
            return _head(symbol, envelope)
        except _Missing:
            return _quiet("missing", symbol, day)
        except Exception:  # noqa: BLE001 - an odd answer gives the quiet line, never an error
            log.info("analystdb: no usable consensus for %s", symbol, exc_info=True)
            return _quiet("down", symbol, day)

    async def view(self, ticker: str, day: date) -> dict:
        """The side panel's view: the panel's figures, every firm with its track record, the
        recent changes and the trust check. A part that fails is None with a note saying so;
        without the ratings themselves, the whole view is the quiet line. Never raises.

        It is opened on purpose and answered off the engine's request loop, so it asks even in
        the minute after a failure: the side panel's Try again really asks again."""
        empty = {
            "firms": None,
            "firms_note": None,
            "ranked_of": None,
            "tracks_asof_text": None,
            "changes": None,
            "changes_note": None,
            "check": None,
            "check_note": None,
        }
        symbol = symbol_for(ticker)
        if symbol is None:
            return {**_quiet("missing", ticker.strip().upper()[:12], day), **empty}
        iso = day.isoformat()
        consensus, cards, events, checks = await asyncio.gather(
            self._get(f"/consensus/{symbol}", {"asof": iso}, resting=False),
            self._get("/scorecards/firms", {"min_calls": str(MIN_CALLS)}, resting=False),
            self._get(f"/events/{symbol}", {"until": iso, "limit": str(CHANGES)}, resting=False),
            self._get(f"/crosscheck/{symbol}", {"asof": iso}, resting=False),
            return_exceptions=True,
        )
        try:
            if isinstance(consensus, BaseException):
                raise consensus
            head = _head(symbol, consensus)
            firm_rows = [row for row in consensus["data"]["firms"] if isinstance(row, dict)]
        except _Missing:
            return {**_quiet("missing", symbol, day), **empty}
        except Exception:  # noqa: BLE001
            log.info("analystdb: no usable consensus for %s", symbol, exc_info=True)
            return {**_quiet("down", symbol, day), **empty}
        out = {**head, **empty}

        tracks: dict[str, dict] | None = None
        try:
            if isinstance(cards, BaseException):
                raise cards
            tracks = {str(row["firm_slug"]): row for row in cards["data"] if isinstance(row, dict)}
            out["ranked_of"] = sum(1 for row in tracks.values() if row.get("rank") is not None)
            out["tracks_asof_text"] = format_value("date", date.fromisoformat(cards["asof"]))
        except Exception:  # noqa: BLE001
            tracks, out["ranked_of"], out["tracks_asof_text"] = None, None, None
            out["firms_note"] = part_note("Track records")
        firms = []
        for row in firm_rows:
            try:
                firms.append(_firm(row, tracks, out["ranked_of"]))
            except Exception:  # noqa: BLE001 - one odd row is left out, not the table
                log.info("analystdb: left out an odd firm row for %s", symbol, exc_info=True)
        out["firms"] = sorted(firms, key=lambda f: f["date"], reverse=True)

        try:
            if isinstance(events, BaseException):
                raise events
            out["changes"] = [_change(item) for item in events["data"]["items"]][:CHANGES]
        except Exception:  # noqa: BLE001
            out["changes_note"] = part_note("Recent changes")

        try:
            if isinstance(checks, BaseException):
                raise checks
            out["check"], out["check_note"] = _check(symbol, head["asof_text"], checks)
        except Exception:  # noqa: BLE001
            out["check"], out["check_note"] = None, part_note("The trust check")
        return out
