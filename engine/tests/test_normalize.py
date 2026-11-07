"""Financial statement normalization (design item 22)."""

from __future__ import annotations

from datetime import date

import pytest

from tearsheet.normalize import Financials


def fact(start, end, val, filed, *, form="10-Q", fp="Q1", accn=None):
    row = {
        "end": end,
        "val": val,
        "filed": filed,
        "form": form,
        "fp": fp,
        "accn": accn or f"a-{filed}",
    }
    if start:
        row["start"] = start
    return row


def facts(us_gaap: dict, dei: dict | None = None) -> dict:
    def units(tag_rows):
        return {tag: {"units": {unit: rows}} for tag, (unit, rows) in tag_rows.items()}

    return {
        "cik": 1,
        "entityName": "Example Co",
        "facts": {"us-gaap": units(us_gaap), "dei": units(dei or {})},
    }


# A September fiscal year, like Apple's.
REVENUE = (
    "USD",
    [
        fact("2024-09-29", "2025-09-27", 400.0, "2025-10-31", form="10-K", fp="FY"),
        fact("2024-09-29", "2024-12-28", 120.0, "2025-01-31"),
        fact("2024-09-29", "2025-03-29", 220.0, "2025-05-02", fp="Q2"),
        fact("2024-09-29", "2025-06-28", 310.0, "2025-08-01", fp="Q3"),
        fact("2025-09-28", "2025-12-27", 140.0, "2026-01-30"),
        fact("2025-09-28", "2026-03-28", 250.0, "2026-05-01", fp="Q2"),
        fact("2025-12-28", "2026-03-28", 110.0, "2026-05-01", fp="Q2"),
    ],
)


def test_trailing_12_months_from_the_year_and_the_year_to_date():
    f = Financials(
        facts({"RevenueFromContractWithCustomerExcludingAssessedTax": REVENUE}),
        as_of=date(2026, 6, 1),
    )
    ttm = f.ttm("revenue")
    # 400 + 250 (this year to date) − 220 (last year to date).
    assert ttm.value == pytest.approx(430.0)
    assert ttm.end == date(2026, 3, 28)
    assert ttm.tag == "RevenueFromContractWithCustomerExcludingAssessedTax"


def test_trailing_12_months_at_a_year_end_is_the_year():
    f = Financials(facts({"Revenues": REVENUE}), as_of=date(2025, 11, 15))
    assert f.ttm("revenue").value == 400.0
    assert f.ttm("revenue").end == date(2025, 9, 27)


def test_a_value_filed_after_the_run_date_is_not_used():
    restated = (
        "USD",
        [
            *REVENUE[1],
            fact("2024-09-29", "2025-09-27", 390.0, "2026-06-15", form="10-K/A", fp="FY"),
        ],
    )
    before = Financials(facts({"Revenues": restated}), as_of=date(2026, 6, 1))
    after = Financials(facts({"Revenues": restated}), as_of=date(2026, 7, 1))
    assert before.ttm("revenue").value == pytest.approx(430.0)
    assert after.ttm("revenue").value == pytest.approx(420.0)  # the restatement is used once filed


def test_the_first_tag_with_current_values_is_used():
    stale = ("USD", [fact("2018-09-30", "2019-09-28", 260.0, "2019-11-01", form="10-K", fp="FY")])
    f = Financials(
        facts({"Revenues": stale, "RevenueFromContractWithCustomerExcludingAssessedTax": REVENUE}),
        as_of=date(2026, 6, 1),
    )
    assert f.ttm("revenue").tag == "RevenueFromContractWithCustomerExcludingAssessedTax"


def _scaled(series, k: float):
    unit, rows = series
    return unit, [{**r, "val": r["val"] * k} for r in rows]


def test_total_revenue_comes_before_revenue_from_contracts_with_customers():
    # Like Berkshire: contracts with customers are only part of the total (premiums, rent and
    # interest are the rest), and both are reported for the same periods.
    f = Financials(
        facts(
            {
                "RevenueFromContractWithCustomerExcludingAssessedTax": _scaled(REVENUE, 0.7),
                "Revenues": REVENUE,
            }
        ),
        as_of=date(2026, 6, 1),
    )
    assert f.ttm("revenue").tag == "Revenues"
    assert f.ttm("revenue").value == pytest.approx(430.0)


def test_a_banks_revenue_net_of_interest_expense_comes_first():
    f = Financials(
        facts({"Revenues": _scaled(REVENUE, 1.5), "RevenuesNetOfInterestExpense": REVENUE}),
        as_of=date(2026, 6, 1),
    )
    assert f.ttm("revenue").tag == "RevenuesNetOfInterestExpense"


def test_balance_items_now_and_a_year_earlier():
    assets = (
        "USD",
        [
            fact(None, "2025-03-29", 900.0, "2025-05-02"),
            fact(None, "2025-09-27", 950.0, "2025-10-31", form="10-K", fp="FY"),
            fact(None, "2026-03-28", 1000.0, "2026-05-01", fp="Q2"),
        ],
    )
    f = Financials(facts({"Assets": assets}), as_of=date(2026, 6, 1))
    assert f.latest("total_assets").value == 1000.0
    assert f.year_ago("total_assets").value == 900.0
    assert f.average("total_assets") == pytest.approx(950.0)


def test_total_debt_adds_the_parts_and_leaves_out_leases():
    instant = lambda v: ("USD", [fact(None, "2026-03-28", v, "2026-05-01", fp="Q2")])  # noqa: E731
    f = Financials(
        facts(
            {
                "LongTermDebtNoncurrent": instant(80.0),
                "LongTermDebtCurrent": instant(10.0),
                "CommercialPaper": instant(5.0),
                "OperatingLeaseLiabilityNoncurrent": instant(7.0),
                "OperatingLeaseLiabilityCurrent": instant(1.0),
            }
        ),
        as_of=date(2026, 6, 1),
    )
    assert f.latest("total_debt").value == 95.0
    assert f.latest("lease_liabilities").value == 8.0


def test_debt_current_is_used_whole_when_reported():
    instant = lambda v: ("USD", [fact(None, "2026-03-28", v, "2026-05-01", fp="Q2")])  # noqa: E731
    f = Financials(
        facts(
            {
                "LongTermDebtNoncurrent": instant(80.0),
                "DebtCurrent": instant(12.0),
                "LongTermDebtCurrent": instant(10.0),
            }
        ),
        as_of=date(2026, 6, 1),
    )
    assert f.latest("total_debt").value == 92.0


def test_gross_profit_falls_back_to_revenue_less_cost():
    cost = ("USD", [(dict(r, val=r["val"] / 2)) for r in REVENUE[1]])
    f = Financials(facts({"Revenues": REVENUE, "CostOfRevenue": cost}), as_of=date(2026, 6, 1))
    assert f.ttm("gross_profit").value == pytest.approx(215.0)


def test_diluted_shares_are_the_latest_quarter_and_split_adjusted():
    shares = (
        "shares",
        [
            fact("2024-12-29", "2025-03-29", 100.0, "2025-05-02", fp="Q2"),
            fact("2025-12-28", "2026-03-28", 98.0, "2026-05-01", fp="Q2"),
        ],
    )

    def split_factor(after: date, up_to: date) -> float:
        return 4.0 if after < date(2026, 5, 20) <= up_to else 1.0

    f = Financials(
        facts({"WeightedAverageNumberOfDilutedSharesOutstanding": shares}),
        as_of=date(2026, 6, 1),
        split_factor=split_factor,
    )
    now = f.shares("diluted_shares", price_date=date(2026, 6, 1))
    assert now.value == 392.0  # filed before the split, so adjusted
    assert now.end == date(2026, 3, 28)
    earlier = f.shares("diluted_shares", price_date=date(2026, 6, 1), year_ago=True)
    assert earlier.value == 400.0


def test_annual_values_for_growth():
    years = (
        "USD",
        [
            fact(
                f"{y - 1}-09-29",
                f"{y}-09-27",
                100.0 * (1.1 ** (y - 2022)),
                f"{y}-10-31",
                form="10-K",
                fp="FY",
            )
            for y in range(2022, 2026)
        ],
    )
    f = Financials(facts({"Revenues": years}), as_of=date(2026, 1, 15))
    annual = f.annual("revenue")
    assert [v.end.year for v in annual] == [2022, 2023, 2024, 2025]
    assert f.growth("revenue", years=3) == pytest.approx(0.1)


def test_missing_items_are_none():
    f = Financials(facts({}), as_of=date(2026, 6, 1))
    assert f.ttm("revenue") is None
    assert f.latest("total_assets") is None
    assert f.growth("revenue", years=3) is None


def test_a_tag_the_company_stopped_using_is_stale():
    old_interest = (
        "USD",
        [fact("2022-09-25", "2023-09-30", 3.9, "2023-11-03", form="10-K", fp="FY")],
    )
    f = Financials(
        facts({"InterestExpense": old_interest, "Revenues": REVENUE}), as_of=date(2026, 6, 1)
    )
    assert f.ttm("interest_expense") is None


def test_earnings_per_share_is_trailing_12_months():
    eps = (
        "USD/shares",
        [
            fact("2024-09-29", "2025-09-27", 4.0, "2025-10-31", form="10-K", fp="FY"),
            fact("2024-09-29", "2025-03-29", 2.2, "2025-05-02", fp="Q2"),
            fact("2025-09-28", "2026-03-28", 2.5, "2026-05-01", fp="Q2"),
            fact("2025-12-28", "2026-03-28", 1.1, "2026-05-01", fp="Q2"),
        ],
    )
    f = Financials(facts({"EarningsPerShareDiluted": eps}), as_of=date(2026, 6, 1))
    assert f.ttm("diluted_eps").value == pytest.approx(4.3)
    assert f.per_share_ttm("diluted_eps", price_date=date(2026, 6, 1)).value == pytest.approx(4.3)


def test_ebit_falls_back_to_pretax_income_plus_interest():
    scale = lambda k: ("USD", [dict(r, val=r["val"] * k) for r in REVENUE[1]])  # noqa: E731
    f = Financials(
        facts(
            {
                "Revenues": REVENUE,
                "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest": scale(
                    0.2
                ),
                "InterestExpense": scale(0.01),
            }
        ),
        as_of=date(2026, 6, 1),
    )
    ebit = f.ttm("operating_income")
    assert ebit.value == pytest.approx(430 * 0.21)
    assert "+" in ebit.tag


def _mcd_like(shares: float, *, eps: float | None = 3.14):
    q = ("2026-04-01", "2026-06-30")
    tags = {
        "WeightedAverageNumberOfDilutedSharesOutstanding": (
            "shares",
            [fact(*q, shares, "2026-08-07", fp="Q2")],
        ),
        "NetIncomeLoss": ("USD", [fact(*q, 2_250_000_000.0, "2026-08-07", fp="Q2")]),
    }
    if eps is not None:
        tags["EarningsPerShareDiluted"] = ("USD/shares", [fact(*q, eps, "2026-08-07", fp="Q2")])
    return Financials(facts(tags), as_of=date(2026, 11, 5))


def test_a_share_count_filed_in_millions_is_put_right():
    # McDonald's files 711.1 for 711.1 million diluted shares.
    f = _mcd_like(711.1)
    shares = f.shares("diluted_shares", price_date=date(2026, 11, 5))
    assert shares.value == pytest.approx(711_100_000.0)
    assert len(f.corrections) == 1 and "in millions" in f.corrections[0]
    f.shares("diluted_shares", price_date=date(2026, 11, 5))
    assert len(f.corrections) == 1  # noted once


def test_a_share_count_filed_in_thousands_is_put_right():
    f = _mcd_like(716_600.0)
    assert f.latest("diluted_shares").value == pytest.approx(716_600_000.0)
    assert "in thousands" in f.corrections[0]


def test_a_right_share_count_or_one_with_nothing_to_check_against_is_kept():
    assert _mcd_like(716_600_000.0).latest("diluted_shares").value == 716_600_000.0
    unchecked = _mcd_like(711.1, eps=None)
    assert unchecked.latest("diluted_shares").value == 711.1 and not unchecked.corrections
    # A count no scale explains (a hundred times off) is left as filed.
    assert _mcd_like(7_166_000.0).latest("diluted_shares").value == 7_166_000.0


def _exxon_like(*, basic_eps: float | None = 1.88, diluted_eps: float | None = 1.88, **extra):
    # Exxon files only its basic average count: nothing it has would add shares.
    q, q_ago = ("2026-07-01", "2026-09-30"), ("2025-07-01", "2025-09-30")
    tags = {
        "WeightedAverageNumberOfSharesOutstandingBasic": (
            "shares",
            [
                fact(*q_ago, 4_310_000_000.0, "2025-11-03", fp="Q3"),
                fact(*q, 4_200_000_000.0, "2026-11-03", fp="Q3"),
            ],
        ),
        "NetIncomeLoss": ("USD", [fact(*q, 7_896_000_000.0, "2026-11-03", fp="Q3")]),
        **extra,
    }
    for tag, eps in (
        ("EarningsPerShareBasic", basic_eps),
        ("EarningsPerShareDiluted", diluted_eps),
    ):
        if eps is not None:
            tags[tag] = (
                "USD/shares",
                [fact(*q_ago, 1.76, "2025-11-03", fp="Q3"), fact(*q, eps, "2026-11-03", fp="Q3")],
            )
    return Financials(facts(tags), as_of=date(2026, 11, 5))


def test_the_basic_count_is_used_when_basic_and_diluted_earnings_per_share_match():
    f = _exxon_like()
    now = f.latest("diluted_shares")
    assert (
        now.value == 4_200_000_000.0 and now.tag == "WeightedAverageNumberOfSharesOutstandingBasic"
    )
    assert f.year_ago("diluted_shares").value == 4_310_000_000.0
    assert len(f.corrections) == 1 and "basic average share count" in f.corrections[0]


def test_the_basic_count_is_not_used_when_earnings_per_share_differ_or_are_missing():
    assert _exxon_like(diluted_eps=1.85).latest("diluted_shares") is None
    assert _exxon_like(diluted_eps=None).latest("diluted_shares") is None
    assert _exxon_like(basic_eps=None).latest("diluted_shares") is None


def test_a_filed_diluted_count_comes_before_the_basic_count():
    q = ("2026-07-01", "2026-09-30")
    combined = (
        "shares",
        [fact(*q, 4_250_000_000.0, "2026-11-03", fp="Q3")],
    )
    f = _exxon_like(WeightedAverageNumberOfShareOutstandingBasicAndDiluted=combined)
    assert f.latest("diluted_shares").value == 4_250_000_000.0 and not f.corrections


def test_the_newest_period_counts_only_facts_filed_by_the_run_date():
    from tearsheet.normalize import newest_period

    data = facts({"Revenues": REVENUE})
    assert newest_period(data, as_of=date(2026, 6, 1)) == date(2026, 3, 28)
    assert newest_period(data, as_of=date(2026, 2, 1)) == date(2025, 12, 27)
    assert newest_period(facts({}), as_of=date(2026, 6, 1)) is None


def test_a_proxy_statements_rounded_figure_does_not_replace_the_10k():
    # JPMorgan's 2025 proxy tags net income as $57,000 million, filed after the 10-K's $57,048.
    year = ("2025-01-01", "2025-12-31")
    rows = [
        fact(*year, 57_048.0, "2026-02-13", form="10-K", fp="FY"),
        fact(*year, 57_000.0, "2026-04-07", form="DEF 14A", fp="FY"),
        fact(*year, 56_900.0, "2026-04-20", form="PRE 14C", fp="FY"),
    ]
    f = Financials(facts({"NetIncomeLoss": ("USD", rows)}), as_of=date(2026, 11, 5))
    assert f.ttm("net_income").value == 57_048.0


def test_the_newest_period_leaves_out_proxy_statements():
    from tearsheet.normalize import newest_period

    rows = [*REVENUE[1], fact("2025-12-28", "2026-06-27", 90.0, "2026-07-01", form="DEF 14A")]
    assert newest_period(facts({"Revenues": ("USD", rows)}), as_of=date(2026, 8, 1)) == date(
        2026, 3, 28
    )
