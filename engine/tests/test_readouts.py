import pytest

from tearsheet import readouts as r

CASES = [
    (r.ordinal(1), "1st"),
    (r.ordinal(2), "2nd"),
    (r.ordinal(3), "3rd"),
    (r.ordinal(4), "4th"),
    (r.ordinal(11), "11th"),
    (r.ordinal(12), "12th"),
    (r.ordinal(13), "13th"),
    (r.ordinal(21), "21st"),
    (r.ordinal(93), "93rd"),
    (r.ordinal(101), "101st"),
    (
        r.score(74),
        "Score: 74th percentile. Better than 74 of 100 peers on the weighted factors.",
    ),
    (
        r.factor("profitability", 79, 0.2),
        "Profitability: 79th percentile. Better than 79 of 100 peers. Counts for 20% of the score.",
    ),
    (
        r.factor("balance sheet", 76, 0.075),
        "Balance sheet: 76th percentile. Better than 76 of 100 peers. Counts for 7.5% of the score.",
    ),
    (
        r.metric("Operating margin", "65.2%", "28.3%", 95, "NVDA"),
        "Operating margin: 65.2%. The peer median is 28.3%. 95% of peers are below NVDA.",
    ),
    (
        r.metric("Interest coverage", "425.8×", None, None, "NVDA"),
        "Interest coverage: 425.8×. No peer values are stored.",
    ),
    (
        r.peer_metric("AMD", "Operating margin", "12.0%", "65.2%", "NVDA"),
        "AMD: operating margin 12.0%, against 65.2% for NVDA.",
    ),
    (
        r.week("2025-11-14", 162.4, 187.2),
        "Close on 14 Nov 2025: $162.40, 13% below today’s $187.20.",
    ),
    (
        r.week("2025-11-14", 200.0, 187.2),
        "Close on 14 Nov 2025: $200.00, 7% above today’s $187.20.",
    ),
    (
        r.week("2026-11-06", 187.2, 187.2),
        "Close on 6 Nov 2026: $187.20, about the same as today’s $187.20.",
    ),
    (r.week("2025-11-14", 162.4, None), "Close on 14 Nov 2025: $162.40."),
    (
        r.target("bull", 419.62, 200.13),
        "Bull case: $419.62 in 12 months, 110% above today’s $200.13. "
        "The top of the range, its 90th percentile.",
    ),
    (
        r.target("base", 233.70, 200.13),
        "Base case: $233.70 in 12 months, 17% above today’s $200.13. "
        "The middle of the range, its 50th percentile.",
    ),
    (
        r.target("bear", 130.16, 200.13),
        "Bear case: $130.16 in 12 months, 35% below today’s $200.13. "
        "The bottom of the range, its 10th percentile.",
    ),
    (
        r.target("bull", 419.62, None),
        "Bull case: $419.62 in 12 months. The top of the range, its 90th percentile.",
    ),
    (
        r.past_year(180.0, 231.0, 130.16, 419.62),
        "Past year: $180.00 to $231.00, up 28%. The 12-month range runs from $130.16 to $419.62.",
    ),
    (r.past_year(200.0, 150.0, None, None), "Past year: $200.00 to $150.00, down 25%."),
    (
        r.past_year(200.0, 200.5, None, None),
        "Past year: $200.00 to $200.50, about level.",
    ),
    (
        r.past_year(None, None, 130.16, 419.62),
        "The 12-month range runs from $130.16 to $419.62.",
    ),
    (
        r.total_return("NVDA", -3.0, 1),
        "NVDA: down 3.0% over the past year, with dividends.",
    ),
    (
        r.total_return("Peer group", 45.2, 1, group=True),
        "Peer group: up 45.2% over the past year, with dividends, each peer weighted the same.",
    ),
    (
        r.total_return("S&P 500", 13.4, 1),
        "S&P 500: up 13.4% over the past year, with dividends.",
    ),
    (
        r.total_return("NVDA", 210.46, 3),
        "NVDA: up 210.5% over the past 3 years, with dividends.",
    ),
    (
        r.total_return("NVDA", 0.04, 1),
        "NVDA: unchanged over the past year, with dividends.",
    ),
    (r.total_return("NVDA", None, 5), "NVDA: not stored for the past 5 years."),
    (
        r.method("DCF", 115.24, 200.13),
        "Discounted cash flow: $115.24 a share, 42% below today’s $200.13.",
    ),
    (r.method("RESIDUAL_INCOME", 546.10, None), "Residual income: $546.10 a share."),
    (r.method_label("EARNINGS_POWER"), "Earnings power"),
    (r.method_label("MULTIPLES"), "Multiples"),
    (r.price(200.13, "4 Nov 2026"), "Price: $200.13 on 4 Nov 2026."),
    (r.price(200.13, None), "Price: $200.13."),
    (
        r.estimate(236.36, 200.13),
        "Estimated value: $236.36 a share, 18% above today’s $200.13.",
    ),
    (
        r.band(130.16, 419.62),
        "12-month range: $130.16 to $419.62, from the bear case to the bull case.",
    ),
    (
        r.trigger(263.73, "$263.73"),
        "Buy trigger: $263.73. The price at which the rating would turn Buy, "
        "with the score and the peer value gaps held fixed.",
    ),
    (
        r.trigger(None, "not reachable by price alone"),
        "Buy trigger: not reachable by price alone.",
    ),
    (
        r.gap(82),
        "Value gap percentile: 82. The gap between estimated value and price is at "
        "the 82nd percentile of the valued peers.",
    ),
    (r.gap(None), "Value gap percentile: not available."),
    (
        r.rating("Hold", True, 74),
        "Rating: Hold, capped by a red flag. Score: 74th percentile of its peer group.",
    ),
    (r.rating("Buy", False, None), "Rating: Buy."),
    (
        r.red_flag("Going concern", False),
        "Going concern: clear. Any red flag found caps the rating at Hold.",
    ),
    (
        r.red_flag("Risk-factor change", True),
        "Risk-factor change: found. It caps the rating at Hold.",
    ),
    (
        r.red_flags(1, 4),
        "1 of 4 checks found a red flag. Any one caps the rating at Hold.",
    ),
    (r.red_flags(0, 4), "No red flags found in 4 checks."),
    (
        r.economy("10-year Treasury yield", "4.9%", "4 Nov 2026"),
        "10-year Treasury yield: 4.9% on 4 Nov 2026, from FRED.",
    ),
    (r.peer_rating("Buy", 8, 41), "Buy: 8 of 41 peers, rated before red-flag caps."),
    (r.claims("kept", 41, 53), "Kept: 41 of 53 claims passed every check."),
    (
        r.claims("removed", 12, 53),
        "Removed: 12 of 53 claims failed a check and were taken out.",
    ),
    (r.kept_item("Business", 4), "Business: 4 claims kept."),
    (r.kept_item("Business", 1), "Business: 1 claim kept."),
    (
        r.removed_item("Revenue rose 12%.", ["number not in source", "no citation"]),
        "Revenue rose 12%. Removed: number not in source; no citation.",
    ),
    (r.removed_item("Revenue rose 12%.", []), "Revenue rose 12%. Removed."),
    (
        r.table_row(["Factor", "Percentile", "Weight used"], ["profitability", "93", "30.0%"]),
        "Profitability: percentile 93, weight used 30.0%.",
    ),
    (
        r.table_row(["Method", "Value per share", "Note"], ["DCF", "$115.24", ""]),
        "DCF: value per share $115.24.",
    ),
    (r.table_row(["Year", "EPS"], ["2025", "$4.10"]), "2025: EPS $4.10."),
    (r.table_row(["Method"], ["DCF", "$115.24"]), "DCF: $115.24."),
]


@pytest.mark.parametrize(("got", "expected"), CASES)
def test_readout_wording(got: str, expected: str) -> None:
    assert got == expected


def test_no_readout_holds_markup_of_its_own() -> None:
    results = [
        r.ordinal(5),
        r.score(50),
        r.factor("quality", 50, 0.1),
        r.metric("Margin", "10.0%", "9.0%", 50, "ABC"),
        r.metric("Margin", "10.0%", None, None, "ABC"),
        r.peer_metric("XYZ", "Margin", "10.0%", "11.0%", "ABC"),
        r.week("2026-01-02", 10.0, 11.0),
        r.week("2026-01-02", 10.0, None),
        *(r.target(c, 10.0, 9.0) for c in ("bull", "base", "bear")),
        r.target("base", 10.0, None),
        r.past_year(9.0, 10.0, 8.0, 12.0),
        r.past_year(None, None, None, None),
        r.total_return("ABC", 1.0, 1),
        r.total_return("ABC", None, 3, group=True),
        r.method_label("DCF"),
        r.method("DCF", 10.0, 9.0),
        r.price(10.0, "1 Jan 2026"),
        r.estimate(10.0, 9.0),
        r.band(8.0, 12.0),
        r.trigger(10.0, "$10.00"),
        r.gap(50),
        r.rating("Hold", True, 50),
        r.red_flag("Check", True),
        r.red_flags(1, 4),
        r.economy("Rate", "1.0%", "1 Jan 2026"),
        r.peer_rating("Buy", 1, 2),
        r.claims("kept", 1, 2),
        r.kept_item("Business", 2),
        r.removed_item("A claim.", ["a reason"]),
        r.table_row(["A", "B"], ["x", "y"]),
    ]
    for text in results:
        assert not any(ch in text for ch in "<>&"), text
