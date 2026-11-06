"""The price store (design item 19, Technical Plan §5).

Daily unadjusted closes, splits and dividends, keyed by company (CIK) and share class, with
the source on each row. Total return is computed from these, with each dividend reinvested at
the close on its ex-dividend date. Prices are current when the latest stored close is from
the last completed NYSE session before the run time, or the session before it.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterable
from datetime import UTC, date, datetime, time, timedelta
from functools import cache
from math import log
from typing import Any

from tearsheet import config
from tearsheet.http import EASTERN, HttpClient

SOURCE = "massive"
# Phase 0 (2026-11-04) saw that day's close available by 18:46 New York time.
CLOSE_READY = time(19, 0)
SPLIT_CHECK_MOVE = 0.40
FIRST_FILL_MONTHS = 14
SPY_FILL_YEARS = 2
SPY_CIK = 884394  # SPDR S&P 500 ETF Trust


@cache
def _nyse():
    import exchange_calendars as xcals

    return xcals.get_calendar("XNYS")


def ms_to_eastern_date(ms: int) -> date:
    """Massive's daily bars start at midnight New York time, in milliseconds since 1970."""
    return datetime.fromtimestamp(ms / 1000, tz=UTC).astimezone(EASTERN).date()


def is_session(day: date) -> bool:
    return bool(_nyse().is_session(day.isoformat()))


def previous_session(day: date) -> date:
    """The NYSE session before `day` (which needn't be a session itself)."""
    candidate = day - timedelta(days=1)
    while not is_session(candidate):
        candidate -= timedelta(days=1)
    return candidate


def last_completed_session(now: datetime) -> date:
    """The latest NYSE session whose close is available at `now`."""
    local = now.astimezone(EASTERN)
    today = local.date()
    if is_session(today) and local.time() >= CLOSE_READY:
        return today
    return previous_session(today)


def sessions_between(start: date, end: date) -> list[date]:
    """NYSE sessions from `start` to `end`, both included."""
    return [ts.date() for ts in _nyse().sessions_in_range(start.isoformat(), end.isoformat())]


class PriceStore:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    # --- storing Massive's answers ---------------------------------------------------------

    def store_bars(self, cik: int, share_class: str, data: dict[str, Any], *, raw_hash: str) -> int:
        rows = [
            (
                cik,
                share_class,
                ms_to_eastern_date(b["t"]).isoformat(),
                float(b["c"]),
                b.get("v"),
                SOURCE,
                raw_hash,
            )
            for b in data.get("results") or []
            if b.get("c") is not None
        ]
        with self.conn:
            # Stored prices are never overwritten.
            self.conn.executemany(
                "INSERT OR IGNORE INTO prices_daily VALUES (?, ?, ?, ?, ?, ?, ?)", rows
            )
        return len(rows)

    def store_dividends(self, cik: int, share_class: str, data: dict[str, Any]) -> int:
        rows = [
            (cik, share_class, d["ex_dividend_date"], "dividend", float(d["cash_amount"]), SOURCE)
            for d in data.get("results") or []
            if d.get("ex_dividend_date") and d.get("cash_amount") is not None
        ]
        with self.conn:
            self.conn.executemany(
                "INSERT OR IGNORE INTO corporate_actions VALUES (?, ?, ?, ?, ?, ?)", rows
            )
        return len(rows)

    def store_splits(self, data: dict[str, Any], tickers: dict[str, tuple[int, str]]) -> int:
        """Market-wide splits; only those for the given tickers (Massive spelling) are kept."""
        rows = []
        for s in data.get("results") or []:
            key = tickers.get(s.get("ticker", ""))
            if key and s.get("split_from") and s.get("split_to"):
                ratio = float(s["split_to"]) / float(s["split_from"])
                rows.append((key[0], key[1], s["execution_date"], "split", ratio, SOURCE))
        with self.conn:
            self.conn.executemany(
                "INSERT OR IGNORE INTO corporate_actions VALUES (?, ?, ?, ?, ?, ?)", rows
            )
        return len(rows)

    # --- reading ---------------------------------------------------------------------------

    def closes(
        self, cik: int, share_class: str = "", *, up_to: date | None = None
    ) -> list[tuple[date, float]]:
        query = "SELECT date, close_unadjusted FROM prices_daily WHERE cik = ? AND share_class = ?"
        args: list[Any] = [cik, share_class]
        if up_to is not None:
            query += " AND date <= ?"
            args.append(up_to.isoformat())
        rows = self.conn.execute(query + " ORDER BY date", args).fetchall()
        return [(date.fromisoformat(r[0]), float(r[1])) for r in rows]

    def latest_close(
        self, cik: int, share_class: str = "", *, up_to: date | None = None
    ) -> tuple[date, float] | None:
        found = self.closes(cik, share_class, up_to=up_to)
        return found[-1] if found else None

    def _actions(self, cik: int, share_class: str, kind: str) -> dict[date, float]:
        rows = self.conn.execute(
            "SELECT date, ratio_or_amount FROM corporate_actions WHERE cik = ? AND share_class = ? AND kind = ?",
            (cik, share_class, kind),
        ).fetchall()
        out: dict[date, float] = {}
        for r in rows:
            day = date.fromisoformat(r[0])
            out[day] = out.get(day, 1.0 if kind == "split" else 0.0)
            out[day] = out[day] * float(r[1]) if kind == "split" else out[day] + float(r[1])
        return out

    def splits(self, cik: int, share_class: str = "") -> dict[date, float]:
        return self._actions(cik, share_class, "split")

    def dividends(self, cik: int, share_class: str = "") -> dict[date, float]:
        return self._actions(cik, share_class, "dividend")

    def split_factor(self, cik: int, *, after: date, up_to: date, share_class: str = "") -> float:
        """New shares per old share for splits after `after`, up to and including `up_to`.
        Share counts and per-share filing values are adjusted with it (Technical Plan §5)."""
        factor = 1.0
        for day, ratio in self.splits(cik, share_class).items():
            if after < day <= up_to:
                factor *= ratio
        return factor

    def daily_gross_returns(
        self, cik: int, share_class: str = "", *, up_to: date | None = None
    ) -> list[tuple[date, float]]:
        """(day, total return factor from the previous stored close to this one)."""
        closes = self.closes(cik, share_class, up_to=up_to)
        splits, dividends = self.splits(cik, share_class), self.dividends(cik, share_class)
        out = []
        for (_, before), (day, close) in zip(closes, closes[1:], strict=False):
            ratio = splits.get(day, 1.0)
            out.append((day, ratio * (close + dividends.get(day, 0.0)) / before))
        return out

    def total_return(self, cik: int, share_class: str, start: date, end: date) -> float | None:
        """Total return from the close on or before `start` to the close on or before `end`."""
        closes = self.closes(cik, share_class, up_to=end)
        if not closes or closes[0][0] > start:
            return None
        growth = 1.0
        for day, gross in self.daily_gross_returns(cik, share_class, up_to=end):
            if day > start:
                growth *= gross
        return growth - 1.0

    def log_returns(
        self, cik: int, share_class: str = "", *, up_to: date | None = None
    ) -> list[float]:
        return [log(g) for _, g in self.daily_gross_returns(cik, share_class, up_to=up_to) if g > 0]

    def unexplained_moves(self, cik: int, share_class: str = "") -> list[date]:
        """Days with a one-day move over 40% that no stored split explains."""
        return [
            day
            for day, gross in self.daily_gross_returns(cik, share_class)
            if abs(gross - 1.0) > SPLIT_CHECK_MOVE
        ]

    def is_stale(self, cik: int, share_class: str, now: datetime) -> bool:
        latest = self.latest_close(cik, share_class)
        if latest is None:
            return True
        last = last_completed_session(now)
        return latest[0] < previous_session(last)


# --- fetching from Massive (live runs) ----------------------------------------------------


def _url(path: str, **parts: Any) -> str:
    return config.MASSIVE_BASE_URL + path.format(**parts)


async def fetch_company(
    http: HttpClient,
    store: PriceStore,
    cik: int,
    share_class: str,
    massive_ticker: str,
    *,
    start: date,
    end: date,
) -> None:
    """Daily bars and dividends for one share class, from `start` to `end`."""
    fetched = await http.fetch(
        "massive",
        _url(
            config.MASSIVE_DAILY_BARS,
            ticker=massive_ticker,
            start=start.isoformat(),
            end=end.isoformat(),
        ),
        kind="daily_bars",
        params={"adjusted": "false", "sort": "asc", "limit": "50000"},
    )
    store.store_bars(cik, share_class, fetched.json(), raw_hash=fetched.raw_hash)
    dividends = await http.fetch(
        "massive",
        _url(config.MASSIVE_DIVIDENDS),
        kind="dividends",
        params={
            "ticker": massive_ticker,
            "ex_dividend_date.gte": start.isoformat(),
            "limit": "1000",
        },
    )
    store.store_dividends(cik, share_class, dividends.json())


HISTORY_START = date(2000, 1, 1)


async def fetch_history_bars(
    http: HttpClient,
    store: PriceStore,
    cik: int,
    share_class: str,
    ticker: str,
    *,
    end: date | None = None,
) -> int:
    """The full daily history from 2000-01-01 in one call. Returns the rows stored."""
    end = end or datetime.now(EASTERN).date()
    fetched = await http.fetch(
        "massive",
        _url(
            config.MASSIVE_DAILY_BARS,
            ticker=ticker,
            start=HISTORY_START.isoformat(),
            end=end.isoformat(),
        ),
        kind="daily_bars",
        params={"adjusted": "false", "sort": "asc", "limit": "50000"},
    )
    return store.store_bars(cik, share_class, fetched.json(), raw_hash=fetched.raw_hash)


async def fetch_splits(
    http: HttpClient,
    store: PriceStore,
    tickers: dict[str, tuple[int, str]],
    *,
    start: date,
    end: date,
) -> None:
    """Splits for the whole market over the dates, paged."""
    url: str | None = _url(config.MASSIVE_SPLITS)
    params: dict[str, str] | None = {
        "execution_date.gte": start.isoformat(),
        "execution_date.lte": end.isoformat(),
        "limit": "1000",
    }
    while url:
        fetched = await http.fetch("massive", url, kind="splits", params=params)
        data = fetched.json()
        store.store_splits(data, tickers)
        url, params = data.get("next_url"), None


def needed_start(
    store: PriceStore, cik: int, share_class: str, end: date, *, months: int
) -> date | None:
    """Where a fetch must start: the full window on a first run, then only new days."""
    latest = store.latest_close(cik, share_class)
    if latest is None:
        return end - timedelta(days=round(months * 30.44))
    if latest[0] >= end:
        return None
    return latest[0] + timedelta(days=1)


def tickers_with_prices(store: PriceStore, ciks: Iterable[int]) -> set[int]:
    return {cik for cik in ciks if store.latest_close(cik) is not None}
