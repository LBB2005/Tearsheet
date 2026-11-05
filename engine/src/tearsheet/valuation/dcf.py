"""The DCF (design item 27, Technical Plan §8).

Free cash flow to the whole firm after stock-based pay (already a cost inside EBIT). Revenue
grows at the 3-year rate, capped at the peer group's 90th percentile and floored at −10%, held
for years 1-5 and faded in a straight line to the terminal rate by year 10. The margin moves in
a straight line from today's (EBIT plus operating lease cost) to the peer median by year 5.
Reinvestment is the revenue increase ÷ the peer median sales-to-capital ratio. Terminal growth
is the lower of 2.5% and the 10-year yield, and the discount rate must exceed it by 3 points.
"""

from __future__ import annotations

from typing import Any

from tearsheet.valuation.common import (
    GroupStats,
    MethodValue,
    ValuationInputs,
    cost_of_debt,
    cost_of_equity,
)

METHOD = "dcf"


def discount_rate(
    c: ValuationInputs, *, risk_free: float, settings: dict[str, Any]
) -> tuple[float, dict[str, float]]:
    coe = cost_of_equity(c.volatility, settings)
    cod = cost_of_debt(
        c.interest_expense,
        c.total_debt,
        c.total_debt_year_ago,
        risk_free=risk_free,
        settings=settings,
    )
    debt = (c.total_debt or 0.0) + (c.lease_liabilities or 0.0)
    equity = c.market_value
    total = equity + debt
    weight_debt = debt / total if total > 0 else 0.0
    rate = coe * (1 - weight_debt) + cod * (1 - c.tax_rate) * weight_debt
    return rate, {"cost_of_equity": coe, "cost_of_debt": cod, "debt_weight": weight_debt}


def dcf(
    c: ValuationInputs, stats: GroupStats, *, risk_free: float, settings: dict[str, Any]
) -> MethodValue:
    s = settings["dcf"]
    if (
        c.free_cash_flow is not None
        and c.free_cash_flow < 0
        and c.free_cash_flow_3y_average is not None
        and c.free_cash_flow_3y_average < 0
    ):
        return MethodValue(
            METHOD, None, "trailing and 3-year average free cash flow are both negative"
        )
    margin0 = c.start_margin
    if margin0 is None or c.revenue is None:
        return MethodValue(METHOD, None, "no revenue or operating income")
    if c.shares <= 0:
        return MethodValue(METHOD, None, "no share count")
    sales_to_capital = stats.median_sales_to_capital or c.sales_to_capital
    if not sales_to_capital or sales_to_capital <= 0:
        return MethodValue(METHOD, None, "no sales-to-capital ratio for reinvestment")
    target_margin = stats.median_margin if stats.median_margin is not None else margin0

    growth = c.revenue_growth_3y if c.revenue_growth_3y is not None else 0.0
    growth = max(growth, float(s["growth_floor"]))
    if stats.growth_p90 is not None:
        growth = min(growth, stats.growth_p90)

    rate, parts = discount_rate(c, risk_free=risk_free, settings=settings)
    terminal = min(float(s["terminal_growth_cap"]), risk_free)
    gap = float(s["min_rate_over_terminal"])
    if rate - terminal < gap:
        terminal = rate - gap

    years, flat, margin_years = int(s["years"]), int(s["growth_years"]), int(s["margin_years"])
    revenue, pv, flows = c.revenue, 0.0, []
    for year in range(1, years + 2):
        if year <= flat:
            g = growth
        elif year <= years:
            g = growth + (terminal - growth) * (year - flat) / (years - flat)
        else:
            g = terminal
        margin = margin0 + (target_margin - margin0) * min(year, margin_years) / margin_years
        new = revenue * (1 + g)
        flow = new * margin * (1 - c.tax_rate) - (new - revenue) / sales_to_capital
        if year <= years:
            pv += flow / (1 + rate) ** year
            flows.append(flow)
        else:
            terminal_value = flow / (rate - terminal)
            pv_terminal = terminal_value / (1 + rate) ** years
        revenue = new
    firm = pv + pv_terminal
    equity = c.equity_bridge(firm)
    value = equity / c.shares
    details = {
        "growth": growth,
        "start_margin": margin0,
        "target_margin": target_margin,
        "sales_to_capital": sales_to_capital,
        "terminal_growth": terminal,
        "discount_rate": rate,
        "firm_value": firm,
        "terminal_share": pv_terminal / firm if firm > 0 else None,
        **parts,
    }
    if value <= 0:
        return MethodValue(METHOD, None, "the equity value is zero or below", details)
    return MethodValue(METHOD, value, None, details)
