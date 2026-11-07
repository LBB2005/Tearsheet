"""Whole-market prices from Massive (Technical Plan §5, the fast path).

Massive's all-stocks daily summary gives every US stock's unadjusted close for one session in
one call, and its dividends and splits can be asked for the whole market by date. A run uses
them when they need fewer calls than two per stock (`summary_is_cheaper`), and the app's
background backfill fills 14 months for every S&P 500 company once (`backfill`).

Every stock's stored closes stay a gap-free run of sessions, as the per-stock path keeps them
(`prices.needed_start` relies on it): a session's close is added only when it follows the
stock's latest stored close, or when it is the window's first session and the stock has none.
A stock that a summary leaves out (halted, renamed, missing) is left for its own per-stock call.
Dividends and splits for a span are stored before its closes, so a stored close always has its
dividends and splits beside it.
"""

from __future__ import annotations

import json
import math
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

import httpx

from tearsheet import config
from tearsheet.data.prices import (
    FIRST_FILL_MONTHS,
    SPY_CIK,
    PriceStore,
    ms_to_eastern_date,
    previous_session,
    sessions_between,
)
from tearsheet.http import HttpClient

# A stock counts as having the window's history when its first stored close is no later than
# this many days after the window's first session (the per-stock fill starts on a calendar day,
# so its first close can fall a few days in).
HISTORY_SLACK_DAYS = 10


def _url(path: str, **parts: Any) -> str:
    return config.MASSIVE_BASE_URL + path.format(**parts)


def dividend_pages_for(sessions: int) -> int:
    """The whole-market dividend pages expected for this many sessions (at least one)."""
    return max(1, math.ceil(sessions * config.MARKET_DIVIDENDS_PER_DAY / config.MASSIVE_PAGE_LIMIT))


def summary_is_cheaper(sessions: int, stocks: int) -> bool:
    """Whether a session's summary each, plus whole-market dividends, needs fewer calls than
    two per stock (its bars and its dividends). Splits cost the same either way."""
    return sessions + dividend_pages_for(sessions) < 2 * stocks


class Tally:
    """The network calls a fill makes and the stored answers it reuses. `gate` is awaited
    before every call (the backfill waits there while a report runs); it returns True when it
    had to wait, and `paused` stays set until the caller clears it."""

    def __init__(self, gate: Callable[[], Awaitable[bool]] | None = None):
        self.gate = gate
        self.made = 0
        self.reused = 0
        self.paused = False

    async def before_call(self) -> None:
        if self.gate is not None and await self.gate():
            self.paused = True
        self.made += 1


def _full_url(url: str, params: dict[str, str] | None) -> str:
    # The address as HttpClient.fetch logs it, so a stored answer can be found again.
    return str(httpx.URL(url, params=params)) if params else url


def _stored(rawstore, url: str) -> tuple[Any, str] | None:
    """A stored answer for the address and its raw hash, or None (also when its file has gone
    from the raw folder, so it is asked for again)."""
    if rawstore is None:
        return None
    raw_hash = rawstore.latest(url)
    if not raw_hash:
        return None
    try:
        return json.loads(rawstore.get(raw_hash)), raw_hash
    except (OSError, ValueError):
        return None


async def paged(
    http: HttpClient,
    rawstore,
    url: str,
    params: dict[str, str] | None,
    *,
    kind: str,
    tally: Tally,
    reuse: bool,
) -> AsyncIterator[dict[str, Any]]:
    """Every page of a Massive list. With `reuse`, a page already in the raw store is read
    from there (a past span's dividends and splits don't change)."""
    next_url: str | None = url
    next_params = params
    while next_url:
        stored = _stored(rawstore, _full_url(next_url, next_params)) if reuse else None
        if stored is None:
            await tally.before_call()
            data = (await http.fetch("massive", next_url, kind=kind, params=next_params)).json()
        else:
            data = stored[0]
            tally.reused += 1
        yield data
        next_url, next_params = data.get("next_url"), None


async def fetch_day(
    http: HttpClient, rawstore, day: date, *, tally: Tally, reuse: bool = True
) -> tuple[list[dict[str, Any]], str]:
    """One session's all-stocks summary: (its rows, the raw hash they are stored under)."""
    url = _url(config.MASSIVE_DAILY_SUMMARY, day=day.isoformat())
    params = {"adjusted": "false"}
    stored = _stored(rawstore, _full_url(url, params)) if reuse else None
    if stored is not None:
        tally.reused += 1
        return stored[0].get("results") or [], stored[1]
    await tally.before_call()
    fetched = await http.fetch("massive", url, kind="daily_summary", params=params)
    return fetched.json().get("results") or [], fetched.raw_hash


async def store_actions(
    http: HttpClient,
    rawstore,
    store: PriceStore,
    tickers: dict[str, tuple[int, str]],
    start: date,
    end: date,
    *,
    tally: Tally,
    reuse: bool = True,
) -> None:
    """Whole-market dividends and splits from `start` to `end`, kept for `tickers` only."""
    limit = str(config.MASSIVE_PAGE_LIMIT)
    async for page in paged(
        http,
        rawstore,
        _url(config.MASSIVE_DIVIDENDS),
        {
            "ex_dividend_date.gte": start.isoformat(),
            "ex_dividend_date.lte": end.isoformat(),
            "limit": limit,
        },
        kind="dividends",
        tally=tally,
        reuse=reuse,
    ):
        store.store_market_dividends(page, tickers)
    async for page in paged(
        http,
        rawstore,
        _url(config.MASSIVE_SPLITS),
        {
            "execution_date.gte": start.isoformat(),
            "execution_date.lte": end.isoformat(),
            "limit": limit,
        },
        kind="splits",
        tally=tally,
        reuse=reuse,
    ):
        store.store_splits(page, tickers)


class Extender:
    """Adds summary closes to the stocks in `wanted` (Massive spelling → (CIK, share class))
    without leaving a gap. A stock with no stored close may start only on `first_session`, and
    never one in `no_start` (SPY, which needs two years, not the window)."""

    def __init__(
        self,
        store: PriceStore,
        wanted: dict[str, tuple[int, str]],
        *,
        first_session: date | None = None,
        no_start: frozenset[str] = frozenset(),
    ):
        self.store = store
        self.wanted = wanted
        self.first_session = first_session
        self.no_start = no_start
        self.refresh()

    def refresh(self) -> None:
        """Re-read each stock's latest stored close (after something else stored prices)."""
        latest = self.store.latest_dates()
        self.through: dict[str, date | None] = {t: latest.get(k) for t, k in self.wanted.items()}

    def apply(self, day: date, results: list[dict[str, Any]], raw_hash: str) -> int:
        before = previous_session(day)
        rows = []
        for bar in results:
            ticker = bar.get("T")
            key = self.wanted.get(ticker) if ticker else None
            if key is None or bar.get("c") is None or bar.get("t") is None:
                continue
            if ms_to_eastern_date(bar["t"]) != day:
                continue
            have = self.through.get(ticker)
            starts = have is None and day == self.first_session and ticker not in self.no_start
            if have == before or starts:
                rows.append((key[0], key[1], bar))
                self.through[ticker] = day
        return self.store.store_bar_rows(rows, raw_hash=raw_hash)


async def top_up(
    http: HttpClient,
    rawstore,
    store: PriceStore,
    wanted: dict[str, tuple[int, str]],
    days: list[date],
    *,
    tally: Tally | None = None,
) -> dict[str, date | None]:
    """A run's top-up for stocks that already have prices: the span's dividends and splits,
    then each session's summary. Returns each stock's latest stored close afterwards."""
    tally = tally or Tally()
    await store_actions(http, rawstore, store, wanted, days[0], days[-1], tally=tally)
    extender = Extender(store, wanted)
    for day in days:
        results, raw_hash = await fetch_day(http, rawstore, day, tally=tally)
        extender.apply(day, results, raw_hash)
    return extender.through


def catch_up(
    store: PriceStore,
    wanted: dict[str, tuple[int, str]],
    *,
    end: date,
    max_sessions: int = 30,
) -> tuple[dict[str, tuple[int, str]], list[date]]:
    """The stored companies among `wanted`, and the sessions to add so they reach `end`: from
    the earliest of their latest closes, or, when that is more than `max_sessions` behind (a
    long-halted stock), from the most common one. No sessions when they are all current."""
    from collections import Counter

    latest = store.latest_dates()
    have = {t: key for t, key in wanted.items() if key in latest}
    behind = Counter(latest[key] for key in have.values() if latest[key] < end)
    if not behind:
        return have, []
    for start in (min(behind), behind.most_common(1)[0][0]):
        days = sessions_between(start + timedelta(days=1), end)
        if days and len(days) <= max_sessions:
            return have, days
    return have, []


def window_start(end: date, months: int = FIRST_FILL_MONTHS) -> date:
    """Where the window of history a peer needs begins (the per-stock first fill's start)."""
    return end - timedelta(days=round(months * 30.44))


def ready(
    store: PriceStore,
    wanted: dict[str, tuple[int, str]],
    *,
    end: date,
    months: int = FIRST_FILL_MONTHS,
) -> int:
    """How many of the wanted stocks have the whole window, up to `end`."""
    first = sessions_between(window_start(end, months), end)[0]
    spans = {
        (int(r[0]), r[1]): (date.fromisoformat(r[2]), date.fromisoformat(r[3]))
        for r in store.conn.execute(
            "SELECT cik, share_class, MIN(date), MAX(date) FROM prices_daily GROUP BY cik, share_class"
        )
    }
    count = 0
    for key in wanted.values():
        span = spans.get(key)
        if span and span[0] <= first + timedelta(days=HISTORY_SLACK_DAYS) and span[1] >= end:
            count += 1
    return count


def wanted_members(holdings) -> dict[str, tuple[int, str]]:
    """Every S&P 500 company's rated class, in Massive's spelling, and SPY."""
    from tearsheet.resolve import ticker_for

    out = {ticker_for("massive", c.tickers[0]): (c.cik, "") for c in holdings.companies()}
    out["SPY"] = (SPY_CIK, "")
    return out


# The settings key that records a finished backfill: the session it reached and the tickers it
# covered. A later start fills again only when the index gains a company it didn't cover; reports
# keep every stored company current with whole-market top-ups.
COMPLETED_SETTING = "prices_backfill_completed"
# "off" stops the background backfill.
SWITCH_SETTING = "prices_backfill"


def backfill_needed(settings, wanted: dict[str, tuple[int, str]]) -> bool:
    if (settings.get(SWITCH_SETTING) or "").lower() == "off":
        return False
    done = json.loads(settings.get(COMPLETED_SETTING) or "{}")
    return not set(wanted) <= set(done.get("tickers", []))


def record_backfill(settings, wanted: dict[str, tuple[int, str]], end: date) -> None:
    settings.set_internal(
        COMPLETED_SETTING, json.dumps({"end": end.isoformat(), "tickers": sorted(wanted)})
    )


@dataclass
class BackfillResult:
    sessions: int
    calls: int
    reused: int
    ready: int
    wanted: int


def _months(sessions: list[date]) -> list[list[date]]:
    out: list[list[date]] = []
    for day in sessions:
        if out and (out[-1][0].year, out[-1][0].month) == (day.year, day.month):
            out[-1].append(day)
        else:
            out.append([day])
    return out


async def backfill(
    http: HttpClient,
    rawstore,
    store: PriceStore,
    wanted: dict[str, tuple[int, str]],
    *,
    end: date,
    months: int = FIRST_FILL_MONTHS,
    gate: Callable[[], Awaitable[bool]] | None = None,
    progress: Callable[[int, int, Tally], None] | None = None,
) -> BackfillResult:
    """The one-time fill (Technical Plan §5): `months` of closes, dividends and splits for every
    wanted stock, month by month from the oldest, each month's dividends and splits before its
    closes. Answers already in the raw store are reused, so a fill cut short resumes where it
    stopped without asking Massive again."""
    tally = Tally(gate)
    sessions = sessions_between(window_start(end, months), end)
    no_start = frozenset(t for t, key in wanted.items() if key[0] == SPY_CIK)
    extender = Extender(store, wanted, first_session=sessions[0], no_start=no_start)
    done = 0
    for month in _months(sessions):
        await store_actions(http, rawstore, store, wanted, month[0], month[-1], tally=tally)
        for day in month:
            results, raw_hash = await fetch_day(http, rawstore, day, tally=tally)
            if tally.paused:
                # A report or grading ran while this waited and may have stored prices.
                extender.refresh()
                tally.paused = False
            extender.apply(day, results, raw_hash)
            done += 1
            if progress is not None:
                progress(done, len(sessions), tally)
    return BackfillResult(
        sessions=len(sessions),
        calls=tally.made,
        reused=tally.reused,
        ready=ready(store, wanted, end=end, months=months),
        wanted=len(wanted),
    )
