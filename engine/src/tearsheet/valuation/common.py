"""Shared valuation inputs and rules (design item 27)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ValuationInputs:
    """One company's numbers for valuation, in the rated class's price and share units."""

    cik: int
    price: float
    shares: float  # diluted shares across all classes, split-adjusted, in rated-class units
    market_value: float
    revenue: float | None
    ebit: float | None
    operating_lease_cost: float | None
    tax_rate: float
    revenue_growth_3y: float | None
    interest_expense: float | None
    total_debt: float | None
    total_debt_year_ago: float | None
    lease_liabilities: float | None
    minority_interest: float | None
    preferred_stock: float | None
    cash: float | None
    volatility: float | None  # annualized 12-month volatility
    free_cash_flow: float | None  # trailing 12 months
    free_cash_flow_3y_average: float | None
    dividend_yield: float
    invested_capital: float | None = None
    common_equity: float | None = None
    return_on_equity: float | None = None
    payout: float | None = None
    diluted_eps: float | None = None

    @property
    def start_margin(self) -> float | None:
        if self.revenue is None or self.ebit is None or self.revenue <= 0:
            return None
        return (self.ebit + (self.operating_lease_cost or 0.0)) / self.revenue

    @property
    def sales_to_capital(self) -> float | None:
        if self.revenue is None or not self.invested_capital or self.invested_capital <= 0:
            return None
        return self.revenue / self.invested_capital

    def equity_bridge(self, firm_value: float) -> float:
        """Firm value − total debt − lease liabilities − minority interest − preferred + cash."""
        return (
            firm_value
            - (self.total_debt or 0.0)
            - (self.lease_liabilities or 0.0)
            - (self.minority_interest or 0.0)
            - (self.preferred_stock or 0.0)
            + (self.cash or 0.0)
        )


@dataclass(frozen=True)
class GroupStats:
    """Peer-group figures from the run's peer group (the company and its peers)."""

    growth_p90: float | None = None
    median_margin: float | None = None
    median_sales_to_capital: float | None = None
    median_return_on_equity: float | None = None
    median_volatility: float | None = None


@dataclass(frozen=True)
class MethodValue:
    method: str
    value: float | None  # per share, rated-class price
    reason: str | None  # why it is "not meaningful"
    details: dict[str, Any] = field(default_factory=dict)

    @property
    def valid(self) -> bool:
        return self.value is not None


def cost_of_equity(volatility: float | None, settings: dict[str, Any]) -> float:
    """From annualized 12-month volatility; each range includes its lower end."""
    table = settings["cost_of_equity"]
    vol = volatility if volatility is not None else float("inf")
    for row in table:
        if row["below"] is None or vol < float(row["below"]):
            return float(row["rate"])
    return float(table[-1]["rate"])


def cost_of_debt(
    interest_expense: float | None,
    total_debt: float | None,
    total_debt_year_ago: float | None,
    *,
    risk_free: float,
    settings: dict[str, Any],
) -> float:
    """Interest expense ÷ average total debt, kept between the 10-year yield and the yield plus
    the spread in valuation.yaml."""
    cap = risk_free + float(settings["cost_of_debt_max_spread"])
    debts = [d for d in (total_debt, total_debt_year_ago) if d is not None]
    average = sum(debts) / len(debts) if debts else 0.0
    if not interest_expense or average <= 0:
        return risk_free
    return min(max(interest_expense / average, risk_free), cap)


def median(values: list[float]) -> float | None:
    values = sorted(values)
    if not values:
        return None
    mid = len(values) // 2
    return values[mid] if len(values) % 2 else (values[mid - 1] + values[mid]) / 2


def percentile_value(values: list[float], pct: float) -> float | None:
    """Linear interpolation between closest ranks (the usual 'pth percentile' of a sample)."""
    values = sorted(values)
    if not values:
        return None
    if len(values) == 1:
        return values[0]
    k = (len(values) - 1) * pct / 100
    lo = int(k)
    hi = min(lo + 1, len(values) - 1)
    return values[lo] + (values[hi] - values[lo]) * (k - lo)
