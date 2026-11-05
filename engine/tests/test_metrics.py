"""Factor metrics (design item 25)."""

from __future__ import annotations

import math
from dataclasses import replace

import pytest

from tearsheet.metrics import DIRECTION, CompanyInputs, compute_metrics, tax_rate

BASE = CompanyInputs(
    cik=1,
    price=50.0,
    market_value=5_000.0,
    revenue=1_000.0,
    gross_profit=400.0,
    ebit=200.0,
    depreciation_amortization=50.0,
    net_income=150.0,
    net_income_common=150.0,
    operating_cash_flow=180.0,
    capital_spending=40.0,
    interest_expense=20.0,
    income_tax=30.0,
    pretax_income=180.0,
    diluted_eps=1.5,
    total_assets=2_000.0,
    total_assets_year_ago=1_800.0,
    total_equity=900.0,
    total_equity_year_ago=800.0,
    common_equity=880.0,
    common_equity_year_ago=780.0,
    total_debt=400.0,
    total_debt_year_ago=380.0,
    lease_liabilities=50.0,
    lease_liabilities_year_ago=40.0,
    cash=150.0,
    cash_year_ago=120.0,
    minority_interest=20.0,
    preferred_stock=0.0,
    diluted_shares=100.0,
    diluted_shares_year_ago=102.0,
    momentum_12m=0.12,
)


def test_profitability_metrics():
    m = compute_metrics(BASE)
    assert m["operating_margin"].value == pytest.approx(0.20)
    assert m["gross_profit_to_assets"].value == pytest.approx(0.20)
    tax = 30 / 180
    invested_now = 900 + 400 + 50 - 150
    invested_before = 800 + 380 + 40 - 120
    assert m["return_on_invested_capital"].value == pytest.approx(
        200 * (1 - tax) / ((invested_now + invested_before) / 2)
    )


def test_valuation_metrics_use_enterprise_value():
    m = compute_metrics(BASE)
    ev = 5_000 + 400 + 50 + 20 + 0 - 150
    assert m["earnings_yield"].value == pytest.approx(1.5 / 50)
    assert m["free_cash_flow_yield"].value == pytest.approx((180 - 40) / 5_000)
    assert m["ebit_to_ev"].value == pytest.approx(200 / ev)
    assert m["sales_to_ev"].value == pytest.approx(1_000 / ev)
    assert m["ebit_to_ev"].inputs["enterprise_value"] == pytest.approx(ev)


def test_capital_discipline_balance_sheet_and_earnings_quality():
    m = compute_metrics(BASE)
    assert m["net_share_issuance"].value == pytest.approx(100 / 102 - 1)
    assert m["asset_growth"].value == pytest.approx(2_000 / 1_800 - 1)
    assert m["net_debt_to_ebitda"].value == pytest.approx((400 + 50 - 150) / 250)
    assert m["interest_coverage"].value == pytest.approx(10.0)
    assert m["accruals_to_assets"].value == pytest.approx((150 - 180) / 1_900)
    assert m["operating_cash_flow_to_net_income"].value == pytest.approx(1.2)
    assert m["momentum_12m"].value == 0.12


def test_the_edge_rules():
    m = compute_metrics(replace(BASE, depreciation_amortization=-250.0))  # EBITDA of zero
    assert m["net_debt_to_ebitda"].value == math.inf  # ranks worst (lower is better)
    m = compute_metrics(replace(BASE, interest_expense=None))
    assert m["interest_coverage"].value == math.inf  # no interest expense ranks best
    m = compute_metrics(replace(BASE, net_income=-5.0))
    assert m["operating_cash_flow_to_net_income"].value is None


def test_missing_inputs_give_no_value():
    m = compute_metrics(replace(BASE, revenue=None))
    assert m["operating_margin"].value is None and m["sales_to_ev"].value is None


def test_banks_and_insurers_use_return_on_equity():
    m = compute_metrics(BASE, financial_class="bank")
    assert m["return_on_equity"].value == pytest.approx(150 / 830)
    for left_out in (
        "gross_profit_to_assets",
        "return_on_invested_capital",
        "operating_margin",
        "free_cash_flow_yield",
        "ebit_to_ev",
        "sales_to_ev",
        "net_debt_to_ebitda",
        "interest_coverage",
        "operating_cash_flow_to_net_income",
    ):
        assert m[left_out].value is None, left_out
        assert "banks and insurers" in m[left_out].note
    for used in (
        "momentum_12m",
        "earnings_yield",
        "net_share_issuance",
        "asset_growth",
        "accruals_to_assets",
    ):
        assert m[used].value is not None, used
    # Every company also gets return on equity, so a bank can be ranked against its peers.
    assert compute_metrics(BASE)["return_on_equity"].value == pytest.approx(150 / 830)


@pytest.mark.parametrize(
    ("tax", "pretax", "expected"),
    [
        (30.0, 180.0, 30 / 180),
        (80.0, 180.0, 0.30),
        (-5.0, 180.0, 0.0),
        (10.0, -4.0, 0.21),
        (None, 180.0, 0.21),
    ],
)
def test_the_tax_rate_rule(tax, pretax, expected):
    assert tax_rate(tax, pretax) == pytest.approx(expected)


def test_every_metric_has_a_direction():
    assert set(compute_metrics(BASE)) == set(DIRECTION)
