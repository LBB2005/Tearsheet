"""Residual income (design item 27, Technical Plan §8).

Equity value = today's book value + the present value, at the cost of equity, of each year's
(return on equity − cost of equity) × the previous year's book value, for years 1-10. Return on
equity fades in a straight line to the peer median by year 10; after year 10 excess profit is
zero. Book value grows by return on equity × (1 − payout); buybacks are left out.
"""

from __future__ import annotations

from typing import Any

from tearsheet.valuation.common import GroupStats, MethodValue, ValuationInputs

METHOD = "residual_income"


def residual_income(
    c: ValuationInputs, stats: GroupStats, *, cost_of_equity: float, settings: dict[str, Any]
) -> MethodValue:
    book = c.common_equity
    if book is None or book <= 0:
        return MethodValue(METHOD, None, "book value is zero or below")
    if c.return_on_equity is None:
        return MethodValue(METHOD, None, "no return on equity")
    years = int(settings["residual_income"]["years"])
    target = (
        stats.median_return_on_equity
        if stats.median_return_on_equity is not None
        else c.return_on_equity
    )
    payout = min(max(c.payout or 0.0, 0.0), 1.0)
    value, bv = book, book
    for t in range(1, years + 1):
        roe = c.return_on_equity + (target - c.return_on_equity) * t / years
        value += (roe - cost_of_equity) * bv / (1 + cost_of_equity) ** t
        bv *= 1 + roe * (1 - payout)
    per_share = value / c.shares
    details = {
        "book_value": book,
        "start_roe": c.return_on_equity,
        "target_roe": target,
        "payout": payout,
        "cost_of_equity": cost_of_equity,
    }
    if per_share <= 0:
        return MethodValue(METHOD, None, "the equity value is zero or below", details)
    return MethodValue(METHOD, per_share, None, details)
