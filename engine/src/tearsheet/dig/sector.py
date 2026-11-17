"""The sector part: the stock, its S&P 500 sector (equal-weighted) and SPY over 12 months,
their 1, 3, 6 and 12-month total returns, and the stock's 12-month rank in its sector."""

from __future__ import annotations

import calendar
import statistics
from datetime import date
from typing import Any

from tearsheet.charts import SPY_CIK, _index
from tearsheet.data.membership import Holdings
from tearsheet.data.prices import PriceStore
from tearsheet.dig.target import Target

PERIODS = (("1M", 1), ("3M", 3), ("6M", 6), ("12M", 12))
LINE_PLACES = 4


def months_back(day: date, n: int) -> date:
    """The same day `n` months earlier, or that month's last day when it is shorter."""
    month = day.month - n
    year = day.year + (month - 1) // 12
    month = (month - 1) % 12 + 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def period_returns(prices: PriceStore, cik: int, up_to: date) -> dict[str, float | None]:
    """Total return (splits and dividends) over each period to `up_to`, as
    PriceStore.total_return measures it, from one read of the closes."""
    closes = prices.closes(cik, up_to=up_to)
    gross = prices.daily_gross_returns(cik, up_to=up_to)
    out: dict[str, float | None] = {}
    for label, months in PERIODS:
        start = months_back(up_to, months)
        if not closes or closes[0][0] > start:
            out[label] = None
            continue
        growth = 1.0
        for day, g in gross:
            if day > start:
                growth *= g
        out[label] = growth - 1.0
    return out


def _line(values: list[float | None]) -> list[float | None]:
    return [None if v is None else round(v, LINE_PLACES) for v in values]


def sector_part(
    prices: PriceStore, holdings: Holdings, target: Target, *, up_to: date
) -> dict[str, Any]:
    """Reads only prices up to `up_to`, so a later close changes nothing."""
    if not target.sector:
        return {"state": "off", "note": "Not in an S&P 500 sector.", "sector": None}
    own = prices.closes(target.cik, up_to=up_to)
    if not own:
        return {
            "state": "down",
            "note": "No stored prices for this company yet.",
            "sector": target.sector,
        }
    start = months_back(up_to, 12)
    dates = [d.isoformat() for d, _ in own if d >= start]
    members = holdings.sector_members(target.sector)
    # A member with no closes, or one listed after the window starts, would blank or shorten
    # the whole equal-weighted line (charts._index), so it is left out of the line.
    in_line = []
    for m in members:
        first = prices.closes(m.cik, up_to=up_to)[:1]
        if first and first[0][0] <= start:
            in_line.append(m.cik)
    returns = {m.cik: period_returns(prices, m.cik, up_to) for m in members}
    mine = returns.get(target.cik) or period_returns(prices, target.cik, up_to)
    spy = period_returns(prices, SPY_CIK, up_to)
    rows = []
    for label, _ in PERIODS:
        values = [r[label] for r in returns.values() if r[label] is not None]
        rows.append(
            {
                "period": label,
                "stock": mine[label],
                "sector_median": statistics.median(values) if values else None,
                "spy": spy[label],
            }
        )
    year = [r["12M"] for r in returns.values() if r["12M"] is not None]
    rank = None
    if mine["12M"] is not None:
        rank = 1 + sum(1 for v in year if v > mine["12M"])
    return {
        "state": "ok",
        "note": None,
        "sector": target.sector,
        "members": len(in_line),
        "left_out": len(members) - len(in_line),
        "dates": dates,
        "stock": _line(_index(prices, [target.cik], dates)),
        "sector_line": _line(_index(prices, in_line, dates)),
        "spy": _line(_index(prices, [SPY_CIK], dates)),
        "returns": rows,
        "rank": rank,
        "rank_of": len(year) if rank is not None else None,
    }
