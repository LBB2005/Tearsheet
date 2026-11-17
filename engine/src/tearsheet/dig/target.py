"""The stock a Dig deeper page is about: its names, its report on show (as the watchlist
chooses it), today's close, and the report's levels in today's shares."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import date
from typing import Any

from tearsheet import watchlist
from tearsheet.companies import display_name
from tearsheet.data import membership
from tearsheet.data.prices import PriceStore, split_factor_after


class NoReport(Exception):
    """The company has neither a report on show nor an official prediction."""


@dataclass(frozen=True)
class Target:
    cik: int
    ticker: str
    name: str
    sector: str | None
    shown: watchlist.Shown
    close: tuple[date, float] | None
    # The move from the close the report was priced at, splits taken out (4 places).
    since_report: float | None
    # protocol.WatchLevels: in the last close's shares when there is a close.
    levels_today: dict[str, Any] | None


def _ticker(conn: sqlite3.Connection, holdings: membership.Holdings, cik: int, shown) -> str:
    if holdings.has(cik):
        return holdings.tickers_of(cik)[0]
    row = conn.execute(
        "SELECT ticker FROM tickers WHERE cik = ? ORDER BY date_from DESC LIMIT 1", (cik,)
    ).fetchone()
    if row:
        return row[0]
    if shown.prediction is not None:
        return shown.prediction["ticker"]
    return str(cik)


def target(conn: sqlite3.Connection, cik: int, holdings: membership.Holdings) -> Target:
    """Reads only. Raises NoReport when there is nothing to dig from."""
    shown = watchlist.levels_for(conn, cik)
    if shown.report_id is None and shown.prediction is None:
        raise NoReport(f"No report or prediction for company {cik}.")
    stored = conn.execute("SELECT name, sector FROM companies WHERE cik = ?", (cik,)).fetchone()
    ticker = _ticker(conn, holdings, cik, shown)
    name = display_name(holdings, cik, stored[0] if stored else None) or ticker
    sector = (
        holdings.company(cik).sector or None
        if holdings.has(cik)
        else (stored[1] if stored else None)
    )
    recent = watchlist._recent(conn, cik, 1)
    close = recent[0] if recent else None
    splits = PriceStore(conn).splits(cik)
    since = None
    if close is not None and shown.then is not None:
        factor = split_factor_after(splits, shown.then[0], up_to=close[0])
        since = round(close[1] * factor / shown.then[1] - 1, 4)
    levels_today = None
    if shown.levels is not None:
        at = watchlist._at(shown.levels, splits, close[0]) if close is not None else None
        levels_today = watchlist._levels_out(shown.levels, at)
    return Target(cik, ticker, name, sector, shown, close, since, levels_today)
