"""Valuation: the DCF and combining methods (design item 27)."""

from __future__ import annotations

from dataclasses import replace

import pytest

from tearsheet.methodology import load
from tearsheet.valuation.combine import combine
from tearsheet.valuation.common import (
    GroupStats,
    MethodValue,
    ValuationInputs,
    cost_of_debt,
    cost_of_equity,
)
from tearsheet.valuation.dcf import dcf

SETTINGS = load().valuation

COMPANY = ValuationInputs(
    cik=1,
    price=100.0,
    shares=10.0,
    market_value=1_000.0,
    revenue=500.0,
    ebit=100.0,
    operating_lease_cost=0.0,
    tax_rate=0.20,
    revenue_growth_3y=0.05,
    interest_expense=4.0,
    total_debt=100.0,
    total_debt_year_ago=100.0,
    lease_liabilities=0.0,
    minority_interest=0.0,
    preferred_stock=0.0,
    cash=50.0,
    volatility=0.25,
    free_cash_flow=60.0,
    free_cash_flow_3y_average=55.0,
    dividend_yield=0.01,
)
STATS = GroupStats(growth_p90=0.20, median_margin=0.20, median_sales_to_capital=2.0)


@pytest.mark.parametrize(
    ("vol", "rate"), [(0.10, 0.075), (0.20, 0.09), (0.279, 0.09), (0.28, 0.11), (0.40, 0.135)]
)
def test_cost_of_equity_by_volatility(vol, rate):
    assert cost_of_equity(vol, SETTINGS) == rate


def test_cost_of_debt_is_kept_near_the_10_year_yield():
    assert cost_of_debt(4.0, 100.0, 100.0, risk_free=0.04, settings=SETTINGS) == pytest.approx(0.04)
    assert cost_of_debt(1.0, 100.0, 100.0, risk_free=0.04, settings=SETTINGS) == pytest.approx(
        0.04
    )  # floor
    assert cost_of_debt(20.0, 100.0, 100.0, risk_free=0.04, settings=SETTINGS) == pytest.approx(
        0.10
    )  # cap
    assert cost_of_debt(None, 0.0, 0.0, risk_free=0.04, settings=SETTINGS) == pytest.approx(0.04)


def by_hand(c: ValuationInputs, s: GroupStats, risk_free: float) -> float:
    """The item 27 DCF, written out year by year."""
    terminal = min(0.025, risk_free)
    coe = cost_of_equity(c.volatility, SETTINGS)
    cod = cost_of_debt(
        c.interest_expense,
        c.total_debt,
        c.total_debt_year_ago,
        risk_free=risk_free,
        settings=SETTINGS,
    )
    debt = c.total_debt + c.lease_liabilities
    rate = coe * c.market_value / (c.market_value + debt) + cod * (1 - c.tax_rate) * debt / (
        c.market_value + debt
    )
    terminal = min(terminal, rate - 0.03)
    g0 = min(max(c.revenue_growth_3y, -0.10), s.growth_p90)
    m0 = (c.ebit + c.operating_lease_cost) / c.revenue
    rev, pv = c.revenue, 0.0
    for year in range(1, 12):
        g = g0 if year <= 5 else (g0 + (terminal - g0) * (year - 5) / 5 if year <= 10 else terminal)
        margin = m0 + (s.median_margin - m0) * min(year, 5) / 5
        new = rev * (1 + g)
        flow = new * margin * (1 - c.tax_rate) - (new - rev) / s.median_sales_to_capital
        if year <= 10:
            pv += flow / (1 + rate) ** year
        else:
            pv += flow / (rate - terminal) / (1 + rate) ** 10
        rev = new
    equity = (
        pv - c.total_debt - c.lease_liabilities - c.minority_interest - c.preferred_stock + c.cash
    )
    return equity / c.shares


def test_the_dcf_matches_the_formulas_by_hand():
    result = dcf(COMPANY, STATS, risk_free=0.04, settings=SETTINGS)
    assert result.valid
    assert result.value == pytest.approx(by_hand(COMPANY, STATS, 0.04))
    assert 0 < result.details["terminal_share"] < 1
    assert result.details["terminal_growth"] == 0.025


def test_growth_is_capped_at_the_peer_90th_percentile_and_floored():
    fast = dcf(replace(COMPANY, revenue_growth_3y=0.80), STATS, risk_free=0.04, settings=SETTINGS)
    assert fast.details["growth"] == 0.20
    slow = dcf(replace(COMPANY, revenue_growth_3y=-0.40), STATS, risk_free=0.04, settings=SETTINGS)
    assert slow.details["growth"] == -0.10


def test_terminal_growth_is_the_lower_of_the_cap_and_the_yield():
    assert (
        dcf(COMPANY, STATS, risk_free=0.018, settings=SETTINGS).details["terminal_growth"] == 0.018
    )


def test_the_guardrail_lowers_terminal_growth():
    calm = replace(
        COMPANY, volatility=0.10, total_debt=900.0, total_debt_year_ago=900.0, interest_expense=10.0
    )
    result = dcf(calm, STATS, risk_free=0.02, settings=SETTINGS)
    rate = result.details["discount_rate"]
    assert result.details["terminal_growth"] == pytest.approx(min(0.02, rate - 0.03))
    assert rate - result.details["terminal_growth"] >= 0.03 - 1e-12


def test_the_dcf_is_not_meaningful_when_free_cash_flow_is_negative():
    burning = replace(COMPANY, free_cash_flow=-10.0, free_cash_flow_3y_average=-5.0)
    result = dcf(burning, STATS, risk_free=0.04, settings=SETTINGS)
    assert not result.valid and "free cash flow" in result.reason
    one_bad_year = replace(COMPANY, free_cash_flow=-10.0, free_cash_flow_3y_average=5.0)
    assert dcf(one_bad_year, STATS, risk_free=0.04, settings=SETTINGS).valid


def test_lease_cost_is_added_back_to_ebit():
    with_leases = dcf(
        replace(COMPANY, operating_lease_cost=10.0), STATS, risk_free=0.04, settings=SETTINGS
    )
    assert with_leases.details["start_margin"] == pytest.approx(110 / 500)


def test_combining_methods():
    a, b, c = (
        MethodValue(n, v, None, {})
        for n, v in (("dcf", 100.0), ("residual_income", 120.0), ("multiples", 160.0))
    )
    combined = combine([a, b, c], SETTINGS, terminal_share=0.5)
    assert combined.value == 120.0
    assert combined.spread == pytest.approx((160 - 100) / 120)
    assert combined.triggers == ["method_spread"]
    two = combine(
        [a, b, MethodValue("multiples", None, "too few peers", {})], SETTINGS, terminal_share=0.9
    )
    assert two.value == 110.0 and set(two.triggers) == {"terminal_share"}
    one = combine([a], SETTINGS, terminal_share=0.5)
    assert one.value == 100.0 and one.triggers == ["one_method"]
    none = combine(
        [MethodValue("dcf", None, "negative free cash flow", {})], SETTINGS, terminal_share=None
    )
    assert none.value is None and not none.valid
