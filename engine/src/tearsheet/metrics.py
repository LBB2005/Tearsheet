"""Factor metrics (design item 25, Technical Plan §7).

Computed the same way for the company and every peer. Flow items are trailing 12 months;
balance items are the latest reported value; "average" is the mean of the latest value and
the value 12 months earlier. Each metric keeps its inputs, so the report can show its working.

Shared terms: EBIT is operating income; EBITDA is EBIT plus depreciation and amortization;
total debt is short- and long-term debt, not counting leases; cash includes short-term
investments; enterprise value is market value of all share classes + total debt + lease
liabilities + minority interest + preferred stock − cash; invested capital is total equity +
total debt + lease liabilities − cash.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from datetime import date
from typing import Any

from tearsheet.normalize import Financials

# Which way is better for each metric, for ranking.
DIRECTION = {
    "gross_profit_to_assets": "higher",
    "return_on_invested_capital": "higher",
    "operating_margin": "higher",
    "return_on_equity": "higher",
    "momentum_12m": "higher",
    "earnings_yield": "higher",
    "free_cash_flow_yield": "higher",
    "ebit_to_ev": "higher",
    "sales_to_ev": "higher",
    "net_share_issuance": "lower",
    "asset_growth": "lower",
    "net_debt_to_ebitda": "lower",
    "interest_coverage": "higher",
    "accruals_to_assets": "lower",
    "operating_cash_flow_to_net_income": "higher",
}
# Left out for banks and insurers (item 25): debt is part of their operations.
LEFT_OUT_FOR_FINANCIALS = {
    "gross_profit_to_assets",
    "return_on_invested_capital",
    "operating_margin",
    "free_cash_flow_yield",
    "ebit_to_ev",
    "sales_to_ev",
    "net_debt_to_ebitda",
    "interest_coverage",
    "operating_cash_flow_to_net_income",
}
TAX_FLOOR, TAX_CAP, TAX_DEFAULT = 0.0, 0.30, 0.21
MOMENTUM_FROM_DAYS, MOMENTUM_TO_DAYS = 252, 21


@dataclass(frozen=True)
class Metric:
    name: str
    value: float | None
    inputs: dict[str, Any]
    note: str | None = None


@dataclass(frozen=True)
class CompanyInputs:
    """The normalized numbers the metrics need, for one company on one run date."""

    cik: int
    price: float | None = None
    market_value: float | None = None
    revenue: float | None = None
    gross_profit: float | None = None
    ebit: float | None = None
    depreciation_amortization: float | None = None
    net_income: float | None = None
    net_income_common: float | None = None
    operating_cash_flow: float | None = None
    capital_spending: float | None = None
    interest_expense: float | None = None
    income_tax: float | None = None  # latest fiscal year, for the tax rate
    pretax_income: float | None = None  # latest fiscal year, for the tax rate
    diluted_eps: float | None = None  # trailing 12 months, split-adjusted to the price date
    total_assets: float | None = None
    total_assets_year_ago: float | None = None
    total_equity: float | None = None
    total_equity_year_ago: float | None = None
    common_equity: float | None = None
    common_equity_year_ago: float | None = None
    total_debt: float | None = None
    total_debt_year_ago: float | None = None
    lease_liabilities: float | None = None
    lease_liabilities_year_ago: float | None = None
    cash: float | None = None
    cash_year_ago: float | None = None
    minority_interest: float | None = None
    preferred_stock: float | None = None
    diluted_shares: float | None = None  # split-adjusted
    diluted_shares_year_ago: float | None = None  # split-adjusted
    momentum_12m: float | None = None

    @property
    def ebitda(self) -> float | None:
        if self.ebit is None or self.depreciation_amortization is None:
            return None
        return self.ebit + self.depreciation_amortization

    @property
    def enterprise_value(self) -> float | None:
        if self.market_value is None:
            return None
        return (
            self.market_value
            + (self.total_debt or 0.0)
            + (self.lease_liabilities or 0.0)
            + (self.minority_interest or 0.0)
            + (self.preferred_stock or 0.0)
            - (self.cash or 0.0)
        )

    def invested_capital(self, *, year_ago: bool = False) -> float | None:
        if year_ago:
            equity, debt, lease, cash = (
                self.total_equity_year_ago,
                self.total_debt_year_ago,
                self.lease_liabilities_year_ago,
                self.cash_year_ago,
            )
        else:
            equity, debt, lease, cash = (
                self.total_equity,
                self.total_debt,
                self.lease_liabilities,
                self.cash,
            )
        if equity is None:
            return None
        return equity + (debt or 0.0) + (lease or 0.0) - (cash or 0.0)


def tax_rate(income_tax: float | None, pretax_income: float | None) -> float:
    """Income tax ÷ pre-tax income for the latest fiscal year, kept between 0% and 30%; 21% when
    pre-tax income is zero or below or the rate can't be worked out (item 27)."""
    if income_tax is None or pretax_income is None or pretax_income <= 0:
        return TAX_DEFAULT
    return min(max(income_tax / pretax_income, TAX_FLOOR), TAX_CAP)


def _ratio(a: float | None, b: float | None) -> float | None:
    if a is None or b is None or b == 0:
        return None
    return a / b


def _mean(a: float | None, b: float | None) -> float | None:
    return None if a is None or b is None else (a + b) / 2


def compute_metrics(c: CompanyInputs, *, financial_class: str = "") -> dict[str, Metric]:
    ev = c.enterprise_value
    tax = tax_rate(c.income_tax, c.pretax_income)
    ic_avg = _mean(c.invested_capital(), c.invested_capital(year_ago=True))
    assets_avg = _mean(c.total_assets, c.total_assets_year_ago)
    equity_avg = _mean(c.common_equity, c.common_equity_year_ago)
    ebitda = c.ebitda

    def m(name: str, value: float | None, **inputs: Any) -> Metric:
        return Metric(name, value, inputs)

    out = {
        "gross_profit_to_assets": m(
            "gross_profit_to_assets",
            _ratio(c.gross_profit, c.total_assets),
            gross_profit=c.gross_profit,
            total_assets=c.total_assets,
        ),
        "return_on_invested_capital": m(
            "return_on_invested_capital",
            _ratio(None if c.ebit is None else c.ebit * (1 - tax), ic_avg),
            ebit=c.ebit,
            tax_rate=tax,
            average_invested_capital=ic_avg,
        ),
        "operating_margin": m(
            "operating_margin", _ratio(c.ebit, c.revenue), ebit=c.ebit, revenue=c.revenue
        ),
        "return_on_equity": m(
            "return_on_equity",
            _ratio(c.net_income_common, equity_avg),
            net_income_common=c.net_income_common,
            average_common_equity=equity_avg,
        ),
        "momentum_12m": m(
            "momentum_12m",
            c.momentum_12m,
            from_trading_days=MOMENTUM_FROM_DAYS,
            to_trading_days=MOMENTUM_TO_DAYS,
        ),
        "earnings_yield": m(
            "earnings_yield",
            _ratio(c.diluted_eps, c.price),
            diluted_eps=c.diluted_eps,
            price=c.price,
        ),
        "free_cash_flow_yield": m(
            "free_cash_flow_yield",
            _ratio(
                None
                if c.operating_cash_flow is None
                else c.operating_cash_flow - (c.capital_spending or 0.0),
                c.market_value,
            ),
            operating_cash_flow=c.operating_cash_flow,
            capital_spending=c.capital_spending,
            market_value=c.market_value,
        ),
        "ebit_to_ev": m("ebit_to_ev", _ratio(c.ebit, ev), ebit=c.ebit, enterprise_value=ev),
        "sales_to_ev": m(
            "sales_to_ev", _ratio(c.revenue, ev), revenue=c.revenue, enterprise_value=ev
        ),
        "net_share_issuance": m(
            "net_share_issuance",
            None
            if _ratio(c.diluted_shares, c.diluted_shares_year_ago) is None
            else c.diluted_shares / c.diluted_shares_year_ago - 1,
            diluted_shares=c.diluted_shares,
            diluted_shares_year_ago=c.diluted_shares_year_ago,
        ),
        "asset_growth": m(
            "asset_growth",
            None
            if _ratio(c.total_assets, c.total_assets_year_ago) is None
            else c.total_assets / c.total_assets_year_ago - 1,
            total_assets=c.total_assets,
            total_assets_year_ago=c.total_assets_year_ago,
        ),
    }
    net_debt = (
        None
        if c.total_debt is None and c.lease_liabilities is None
        else (c.total_debt or 0.0) + (c.lease_liabilities or 0.0) - (c.cash or 0.0)
    )
    if ebitda is None or net_debt is None:
        nd_ebitda = None
    elif ebitda <= 0:
        nd_ebitda = math.inf  # EBITDA of zero or below ranks worst
    else:
        nd_ebitda = net_debt / ebitda
    out["net_debt_to_ebitda"] = m("net_debt_to_ebitda", nd_ebitda, net_debt=net_debt, ebitda=ebitda)
    if c.ebit is None:
        coverage = None
    elif not c.interest_expense:
        coverage = math.inf  # no interest expense ranks best
    else:
        coverage = c.ebit / c.interest_expense
    out["interest_coverage"] = m(
        "interest_coverage", coverage, ebit=c.ebit, interest_expense=c.interest_expense
    )
    out["accruals_to_assets"] = m(
        "accruals_to_assets",
        _ratio(
            None
            if c.net_income is None or c.operating_cash_flow is None
            else c.net_income - c.operating_cash_flow,
            assets_avg,
        ),
        net_income=c.net_income,
        operating_cash_flow=c.operating_cash_flow,
        average_total_assets=assets_avg,
    )
    ocf_ni = (
        None
        if c.net_income is None or c.net_income <= 0
        else _ratio(c.operating_cash_flow, c.net_income)
    )
    out["operating_cash_flow_to_net_income"] = m(
        "operating_cash_flow_to_net_income",
        ocf_ni,
        operating_cash_flow=c.operating_cash_flow,
        net_income=c.net_income,
    )

    if financial_class in ("bank", "insurer"):
        for name in LEFT_OUT_FOR_FINANCIALS:
            out[name] = Metric(name, None, out[name].inputs, "left out for banks and insurers")
    return out


# --- from normalized facts ----------------------------------------------------------------


def _v(value) -> float | None:
    return None if value is None else value.value


def inputs_from(
    fin: Financials,
    *,
    cik: int,
    price: float | None,
    price_date: date,
    market_value: float | None,
    momentum: float | None,
) -> CompanyInputs:
    """The metric inputs from one company's normalized facts."""
    years = fin.annual("income_tax"), fin.annual("pretax_income")
    tax = years[0][-1].value if years[0] else None
    pretax = years[1][-1].value if years[1] else None
    eps = fin.per_share_ttm("diluted_eps", price_date=price_date)
    shares_now = fin.shares("diluted_shares", price_date=price_date)
    shares_before = fin.shares("diluted_shares", price_date=price_date, year_ago=True)
    return CompanyInputs(
        cik=cik,
        price=price,
        market_value=market_value,
        revenue=_v(fin.ttm("revenue")),
        gross_profit=_v(fin.ttm("gross_profit")),
        ebit=_v(fin.ttm("operating_income")),
        depreciation_amortization=_v(fin.ttm("depreciation_amortization")),
        net_income=_v(fin.ttm("net_income")),
        net_income_common=_v(fin.ttm("net_income_common")),
        operating_cash_flow=_v(fin.ttm("operating_cash_flow")),
        capital_spending=_v(fin.ttm("capital_spending")),
        interest_expense=_v(fin.ttm("interest_expense")),
        income_tax=tax,
        pretax_income=pretax,
        diluted_eps=_v(eps),
        total_assets=_v(fin.latest("total_assets")),
        total_assets_year_ago=_v(fin.year_ago("total_assets")),
        total_equity=_v(fin.latest("total_equity")),
        total_equity_year_ago=_v(fin.year_ago("total_equity")),
        common_equity=_v(fin.latest("common_equity")),
        common_equity_year_ago=_v(fin.year_ago("common_equity")),
        total_debt=_v(fin.latest("total_debt")),
        total_debt_year_ago=_v(fin.year_ago("total_debt")),
        lease_liabilities=_v(fin.latest("lease_liabilities")),
        lease_liabilities_year_ago=_v(fin.year_ago("lease_liabilities")),
        cash=_v(fin.latest("cash")),
        cash_year_ago=_v(fin.year_ago("cash")),
        minority_interest=_v(fin.latest("minority_interest")),
        preferred_stock=_v(fin.latest("preferred_stock")),
        diluted_shares=_v(shares_now),
        diluted_shares_year_ago=_v(shares_before),
        momentum_12m=momentum,
    )


def inputs_dict(c: CompanyInputs) -> dict[str, Any]:
    return asdict(c)
