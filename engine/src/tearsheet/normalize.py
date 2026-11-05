"""Financial statement normalization (design item 22, Technical Plan §3 step 3).

Maps SEC company-facts XBRL tags to standard line items. Each item lists its tags in order of
preference; the first tag with current values is used, and the tag is kept with each value.
The company and every peer go through the same list. A change to the list raises
METHOD_CODE_VERSION.

* Flow items (revenue, profit, cash flow) are trailing 12 months: the latest fiscal year,
  plus this year to date, minus last year's same period.
* Balance items are the latest reported value; "a year ago" is the value about 12 months
  before it.
* Point in time: only facts filed on or before the run date are used, and for each period the
  latest such filing wins, so later restatements are recorded but not used for earlier dates.
* Splits: share counts are multiplied, and per-share values divided, by every split between
  the fact's filing date and the price date.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

# Standard items and their tags, in order of preference. FLOW items are durations summed to
# trailing 12 months; AVERAGE items are durations read for the latest period (weighted share
# counts, per-share figures); BALANCE items are instants.
FLOW: dict[str, tuple[str, ...]] = {
    "revenue": (
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "Revenues",
        "RevenueFromContractWithCustomerIncludingAssessedTax",
        "SalesRevenueNet",
        "RevenuesNetOfInterestExpense",
    ),
    "cost_of_revenue": (
        "CostOfRevenue",
        "CostOfGoodsAndServicesSold",
        "CostOfGoodsSold",
        "CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization",
    ),
    "gross_profit_reported": ("GrossProfit",),
    "operating_income": ("OperatingIncomeLoss",),
    "net_income": ("NetIncomeLoss", "ProfitLoss"),
    "net_income_common": ("NetIncomeLossAvailableToCommonStockholdersBasic", "NetIncomeLoss"),
    "pretax_income": (
        "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
        "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
        "IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic",
    ),
    "income_tax": ("IncomeTaxExpenseBenefit",),
    "interest_expense": (
        "InterestExpense",
        "InterestExpenseNonoperating",
        "InterestExpenseDebt",
        "InterestAndDebtExpense",
    ),
    "depreciation_amortization": (
        "DepreciationDepletionAndAmortization",
        "DepreciationAmortizationAndAccretionNet",
        "DepreciationAndAmortization",
        "Depreciation",
    ),
    "operating_cash_flow": (
        "NetCashProvidedByUsedInOperatingActivities",
        "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
    ),
    "capital_spending": (
        "PaymentsToAcquirePropertyPlantAndEquipment",
        "PaymentsToAcquireProductiveAssets",
    ),
    "dividends_paid": ("PaymentsOfDividends", "PaymentsOfDividendsCommonStock"),
    "stock_based_pay": ("ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"),
    "operating_lease_cost": ("OperatingLeaseCost", "OperatingLeaseExpense"),
    # Per-share; trailing 12 months the same way (the four quarters' figures add up closely).
    "diluted_eps": ("EarningsPerShareDiluted",),
}
AVERAGE: dict[str, tuple[str, ...]] = {
    "diluted_shares": ("WeightedAverageNumberOfDilutedSharesOutstanding",),
}
BALANCE: dict[str, tuple[str, ...]] = {
    "total_assets": ("Assets",),
    "common_equity": ("StockholdersEquity",),
    "total_equity": (
        "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
        "StockholdersEquity",
    ),
    "minority_interest": ("MinorityInterest",),
    "preferred_stock": ("PreferredStockValue", "PreferredStockValueOutstanding"),
    "cash_only": (
        "CashAndCashEquivalentsAtCarryingValue",
        "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
        "Cash",
    ),
    "short_term_investments": (
        "ShortTermInvestments",
        "MarketableSecuritiesCurrent",
        "AvailableForSaleSecuritiesDebtSecuritiesCurrent",
    ),
    "debt_current": ("DebtCurrent",),
    "long_term_debt_current": ("LongTermDebtCurrent",),
    "commercial_paper": ("CommercialPaper",),
    "short_term_borrowings": ("ShortTermBorrowings",),
    "long_term_debt_noncurrent": (
        "LongTermDebtNoncurrent",
        "LongTermDebtAndCapitalLeaseObligations",
    ),
    "long_term_debt_total": ("LongTermDebt",),
    "lease_liability_total": ("OperatingLeaseLiability",),
    "lease_liability_current": ("OperatingLeaseLiabilityCurrent",),
    "lease_liability_noncurrent": ("OperatingLeaseLiabilityNoncurrent",),
    "right_of_use_assets": ("OperatingLeaseRightOfUseAsset",),
}
DEI_BALANCE: dict[str, tuple[str, ...]] = {
    "shares_outstanding": ("EntityCommonStockSharesOutstanding",),
}
SHARE_ITEMS = {"diluted_shares", "shares_outstanding"}
PER_SHARE_ITEMS = {"diluted_eps"}

YEAR = timedelta(days=365)
YEAR_TOLERANCE = timedelta(days=45)
# A tag whose newest value is this much older than the newest value of any tag for the
# item is stale (a tag the company stopped using).
STALE_TAG = timedelta(days=400)


def _days(start: date, end: date) -> int:
    return (end - start).days


def _is_annual(start: date, end: date) -> bool:
    return 340 <= _days(start, end) <= 390


def _is_quarter(start: date, end: date) -> bool:
    return 80 <= _days(start, end) <= 100


@dataclass(frozen=True)
class Value:
    item: str
    value: float
    tag: str
    end: date
    filed: date
    start: date | None = None
    accn: str = ""

    def scaled(self, factor: float) -> Value:
        return Value(
            self.item, self.value * factor, self.tag, self.end, self.filed, self.start, self.accn
        )


@dataclass(frozen=True)
class _Fact:
    start: date | None
    end: date
    value: float
    filed: date
    accn: str


def _parse_rows(rows: list[dict[str, Any]], as_of: date) -> list[_Fact]:
    """Facts filed by the run date; for each period, the latest such filing."""
    best: dict[tuple[date | None, date], _Fact] = {}
    for row in rows:
        filed = date.fromisoformat(row["filed"])
        if filed > as_of or row.get("val") is None:
            continue
        start = date.fromisoformat(row["start"]) if row.get("start") else None
        end = date.fromisoformat(row["end"])
        fact = _Fact(start, end, float(row["val"]), filed, row.get("accn", ""))
        key = (start, end)
        if key not in best or (fact.filed, fact.accn) > (best[key].filed, best[key].accn):
            best[key] = fact
    return sorted(best.values(), key=lambda f: (f.end, f.start or f.end))


class Financials:
    """One company's normalized facts as of a run date."""

    def __init__(
        self,
        company_facts: dict[str, Any],
        *,
        as_of: date,
        split_factor: Callable[[date, date], float] | None = None,
    ):
        self.as_of = as_of
        self.name = company_facts.get("entityName", "")
        self._split_factor = split_factor or (lambda after, up_to: 1.0)
        self._tags: dict[str, dict[str, list[_Fact]]] = {}
        for ns in ("us-gaap", "dei"):
            for tag, entry in (company_facts.get("facts", {}).get(ns) or {}).items():
                units = entry.get("units") or {}
                rows = next((units[u] for u in ("USD", "shares", "USD/shares") if u in units), None)
                if rows is None and units:
                    rows = next(iter(units.values()))
                self._tags[tag] = {"facts": _parse_rows(rows or [], as_of)}

    # --- choosing a tag ---------------------------------------------------------------------

    def _facts(self, tag: str) -> list[_Fact]:
        entry = self._tags.get(tag)
        return entry["facts"] if entry else []

    def _company_latest(self) -> date | None:
        """The end of the company's newest reported period (by its total assets or revenue)."""
        if not hasattr(self, "_latest_cache"):
            ends = [
                self._facts(t)[-1].end
                for t in (*BALANCE["total_assets"], *FLOW["revenue"])
                if self._facts(t)
            ]
            self._latest_cache = max(ends) if ends else None
        return self._latest_cache

    def _candidates(self, tags: tuple[str, ...]) -> list[str]:
        """Tags with values, in order of preference, leaving out stale ones: a tag whose newest
        value is much older than the company's newest period (a tag it stopped using)."""
        present = [(t, self._facts(t)[-1].end) for t in tags if self._facts(t)]
        if not present:
            return []
        newest = max(end for _, end in present)
        company = self._company_latest()
        if company is not None:
            newest = max(newest, company)
        return [t for t, end in present if newest - end <= STALE_TAG]

    # --- flow items -------------------------------------------------------------------------

    def _ttm_from(self, tag: str, ending_by: date | None) -> Value | None:
        facts = [
            f for f in self._facts(tag) if f.start and (ending_by is None or f.end <= ending_by)
        ]
        if not facts:
            return None
        end = max(f.end for f in facts)
        at_end = [f for f in facts if f.end == end]
        annual = next((f for f in at_end if _is_annual(f.start, f.end)), None)
        if annual:
            return Value("", annual.value, tag, end, annual.filed, annual.start, annual.accn)
        # This year to date + the last full year − last year's same period.
        for ytd in sorted(at_end, key=lambda f: f.start):
            years = [
                f
                for f in facts
                if _is_annual(f.start, f.end) and abs((ytd.start - f.end).days) <= 7
            ]
            if not years:
                continue
            year = years[-1]
            prior = [
                f
                for f in facts
                if f.start
                and abs((f.start - year.start).days) <= 7
                and abs((f.end - (end - YEAR)).days) <= 10
            ]
            if prior:
                value = year.value + ytd.value - prior[-1].value
                return Value("", value, tag, end, max(ytd.filed, year.filed), ytd.start, ytd.accn)
        # Four quarters in a row ending at `end`.
        quarters = [f for f in facts if _is_quarter(f.start, f.end)]
        chain, cursor = [], end
        for _ in range(4):
            q = next((f for f in reversed(quarters) if abs((f.end - cursor).days) <= 7), None)
            if q is None:
                return None
            chain.append(q)
            cursor = q.start - timedelta(days=1)
        return Value(
            "", sum(q.value for q in chain), tag, end, max(q.filed for q in chain), chain[-1].start
        )

    def _ttm_item(self, item: str, ending_by: date | None) -> Value | None:
        results = [
            v for v in (self._ttm_from(t, ending_by) for t in self._candidates(FLOW[item])) if v
        ]
        if not results:
            return None
        newest = max(v.end for v in results)
        best = next(v for v in results if v.end == newest)
        return Value(item, best.value, best.tag, best.end, best.filed, best.start, best.accn)

    def ttm(self, item: str, *, ending_by: date | None = None) -> Value | None:
        if item == "gross_profit":
            reported = self._ttm_item("gross_profit_reported", ending_by)
            revenue = self._ttm_item("revenue", ending_by)
            if reported and (revenue is None or reported.end >= revenue.end):
                return Value(
                    "gross_profit", reported.value, reported.tag, reported.end, reported.filed
                )
            cost = self._ttm_item("cost_of_revenue", ending_by)
            if revenue and cost and cost.end == revenue.end:
                return Value(
                    "gross_profit",
                    revenue.value - cost.value,
                    f"{revenue.tag} − {cost.tag}",
                    revenue.end,
                    max(revenue.filed, cost.filed),
                )
            return None
        if item == "free_cash_flow":
            ocf = self._ttm_item("operating_cash_flow", ending_by)
            capex = self._ttm_item("capital_spending", ending_by)
            if ocf is None:
                return None
            spent = capex.value if capex and capex.end == ocf.end else 0.0
            tag = f"{ocf.tag} − {capex.tag}" if capex else ocf.tag
            return Value("free_cash_flow", ocf.value - spent, tag, ocf.end, ocf.filed)
        if item == "operating_income":
            reported = self._ttm_item("operating_income", ending_by)
            if reported is not None:
                return reported
            # Some companies (IBM, KLA) report no operating income line: EBIT is then
            # pre-tax income plus interest expense.
            pretax = self._ttm_item("pretax_income", ending_by)
            if pretax is None:
                return None
            interest = self._ttm_item("interest_expense", ending_by)
            add = interest.value if interest and interest.end == pretax.end else 0.0
            tag = (
                f"{pretax.tag} + {interest.tag}"
                if interest and interest.end == pretax.end
                else f"{pretax.tag} + 0 interest"
            )
            return Value("operating_income", pretax.value + add, tag, pretax.end, pretax.filed)
        if item in FLOW:
            return self._ttm_item(item, ending_by)
        raise KeyError(item)

    def ttm_tags(self, tags: tuple[str, ...], *, item: str = "custom") -> Value | None:
        """Trailing 12 months for a tag list given at run time (the FFO tags in valuation.yaml)."""
        results = [v for v in (self._ttm_from(tag, None) for tag in self._candidates(tags)) if v]
        if not results:
            return None
        newest = max(v.end for v in results)
        best = next(v for v in results if v.end == newest)
        return Value(item, best.value, best.tag, best.end, best.filed, best.start, best.accn)

    def ttm_year_ago(self, item: str) -> Value | None:
        now = self.ttm(item)
        if now is None:
            return None
        earlier = self.ttm(item, ending_by=now.end - YEAR + YEAR_TOLERANCE)
        if earlier and abs((earlier.end - (now.end - YEAR)).days) <= YEAR_TOLERANCE.days:
            return earlier
        return None

    def annual(self, item: str) -> list[Value]:
        """Fiscal-year values, oldest first, from the preferred tag that has the latest year."""
        tags = FLOW.get(item, ())
        best: list[Value] = []
        for tag in self._candidates(tags):
            years = [
                Value(item, f.value, tag, f.end, f.filed, f.start, f.accn)
                for f in self._facts(tag)
                if f.start and _is_annual(f.start, f.end)
            ]
            if years and (not best or years[-1].end > best[-1].end):
                best = years
        return best

    def growth(self, item: str, *, years: int) -> float | None:
        """Compound annual growth over `years` fiscal years."""
        series = self.annual(item)
        if len(series) < 2:
            return None
        latest = series[-1]
        target = latest.end - timedelta(days=round(365.25 * years))
        base = next((v for v in series if abs((v.end - target).days) <= 20), None)
        if base is None or base.value <= 0 or latest.value <= 0:
            return None
        return (latest.value / base.value) ** (1 / years) - 1

    # --- balance and average items ----------------------------------------------------------

    def _instant(self, item: str, tags: tuple[str, ...], near: date | None) -> Value | None:
        for tag in self._candidates(tags):
            facts = [f for f in self._facts(tag) if f.start is None]
            if near is not None:
                facts = [f for f in facts if abs((f.end - near).days) <= YEAR_TOLERANCE.days]
                facts.sort(key=lambda f: abs((f.end - near).days))
                pick = facts[0] if facts else None
            else:
                pick = facts[-1] if facts else None
                if pick and item in DEI_BALANCE:
                    # Companies with several share classes report one count per class.
                    same = [f for f in facts if f.end == pick.end and f.accn == pick.accn]
                    if len(same) > 1:
                        return Value(
                            item,
                            sum(f.value for f in same),
                            tag,
                            pick.end,
                            pick.filed,
                            None,
                            pick.accn,
                        )
            if pick:
                return Value(item, pick.value, tag, pick.end, pick.filed, None, pick.accn)
        return None

    def _latest_duration(self, item: str, tags: tuple[str, ...], near: date | None) -> Value | None:
        for tag in self._candidates(tags):
            facts = [
                f
                for f in self._facts(tag)
                if f.start and (_is_quarter(f.start, f.end) or _is_annual(f.start, f.end))
            ]
            if near is not None:
                facts = [f for f in facts if abs((f.end - near).days) <= YEAR_TOLERANCE.days]
                facts.sort(key=lambda f: (abs((f.end - near).days), _days(f.start, f.end)))
                pick = facts[0] if facts else None
            else:
                end = max((f.end for f in facts), default=None)
                at_end = sorted(
                    (f for f in facts if f.end == end), key=lambda f: _days(f.start, f.end)
                )
                pick = at_end[0] if at_end else None
            if pick:
                return Value(item, pick.value, tag, pick.end, pick.filed, pick.start, pick.accn)
        return None

    def _composite(self, item: str, near: date | None) -> Value | None:
        get = lambda name: self._instant(name, BALANCE[name], near)  # noqa: E731
        if item == "total_debt":
            noncurrent = get("long_term_debt_noncurrent")
            parts = []
            if noncurrent:
                parts.append(noncurrent)
                current = get("debt_current")
                if current:
                    parts.append(current)
                else:
                    parts += [
                        v
                        for v in (
                            get("long_term_debt_current"),
                            get("commercial_paper"),
                            get("short_term_borrowings"),
                        )
                        if v
                    ]
            else:
                total = get("long_term_debt_total")
                parts += [
                    v for v in (total, get("commercial_paper"), get("short_term_borrowings")) if v
                ]
                if not total:
                    current = get("debt_current")
                    if current:
                        parts = [current]
            if not parts:
                return None
            return Value(
                item,
                sum(p.value for p in parts),
                " + ".join(p.tag for p in parts),
                max(p.end for p in parts),
                max(p.filed for p in parts),
            )
        if item == "lease_liabilities":
            total = get("lease_liability_total")
            if total:
                return Value(item, total.value, total.tag, total.end, total.filed)
            parts = [
                v for v in (get("lease_liability_current"), get("lease_liability_noncurrent")) if v
            ]
            if not parts:
                return None
            return Value(
                item,
                sum(p.value for p in parts),
                " + ".join(p.tag for p in parts),
                max(p.end for p in parts),
                max(p.filed for p in parts),
            )
        if item == "cash":
            parts = [v for v in (get("cash_only"), get("short_term_investments")) if v]
            if not parts:
                return None
            return Value(
                item,
                sum(p.value for p in parts),
                " + ".join(p.tag for p in parts),
                max(p.end for p in parts),
                max(p.filed for p in parts),
            )
        raise KeyError(item)

    COMPOSITES = ("total_debt", "lease_liabilities", "cash")

    def latest(self, item: str, *, near: date | None = None) -> Value | None:
        if item in self.COMPOSITES:
            return self._composite(item, near)
        if item in BALANCE:
            return self._instant(item, BALANCE[item], near)
        if item in DEI_BALANCE:
            return self._instant(item, DEI_BALANCE[item], near)
        if item in AVERAGE:
            return self._latest_duration(item, AVERAGE[item], near)
        raise KeyError(item)

    def year_ago(self, item: str) -> Value | None:
        now = self.latest(item)
        if now is None:
            return None
        return self.latest(item, near=now.end - YEAR)

    def average(self, item: str) -> float | None:
        """The mean of the latest value and the value 12 months earlier."""
        now, before = self.latest(item), self.year_ago(item)
        if now is None or before is None:
            return None
        return (now.value + before.value) / 2

    # --- split adjustment -------------------------------------------------------------------

    def shares(self, item: str, *, price_date: date, year_ago: bool = False) -> Value | None:
        """A share count or per-share value, adjusted for splits after its filing date."""
        value = self.year_ago(item) if year_ago else self.latest(item)
        if value is None:
            return None
        factor = self._split_factor(value.filed, price_date)
        if item in PER_SHARE_ITEMS:
            return value.scaled(1 / factor)
        return value.scaled(factor)

    def per_share_ttm(self, item: str, *, price_date: date) -> Value | None:
        """A trailing-12-month per-share figure, adjusted for splits after its filing date."""
        value = self.ttm(item)
        if value is None:
            return None
        return value.scaled(1 / self._split_factor(value.filed, price_date))

    def latest_period_end(self) -> date | None:
        revenue = self.ttm("revenue")
        return revenue.end if revenue else None
