"""The 12-month range and the rating (design item 28, Technical Plan §7)."""

from __future__ import annotations

import math

import pytest

from tearsheet.methodology import load
from tearsheet.rating import (
    PeerGap,
    RatingInputs,
    gap_percentile,
    probability,
    rate,
    trigger_prices,
    value_gap,
)
from tearsheet.valuation.range import RangeInputs, twelve_month_range, uncertainty_level

LINES = load().rating_lines


# --- range --------------------------------------------------------------------------------


def test_the_base_case_and_the_percentiles():
    r = twelve_month_range(
        RangeInputs(
            price=100.0,
            value=130.0,
            cost_of_equity=0.09,
            dividend_yield=0.02,
            volatility=0.30,
            peer_median_volatility=0.20,
        ),
        LINES,
    )
    base = 100 * (1 + 0.09 - 0.02) + (130 - 100) / 3
    assert r.base == pytest.approx(base)
    vol = 0.25  # moved halfway toward the peer median
    assert r.volatility == pytest.approx(vol)
    assert r.bear == pytest.approx(base * math.exp(-1.2816 * vol))
    assert r.bull == pytest.approx(base * math.exp(1.2816 * vol))


def test_no_valuation_gives_no_range():
    assert (
        twelve_month_range(
            RangeInputs(
                price=100.0,
                value=None,
                cost_of_equity=0.09,
                dividend_yield=0.0,
                volatility=0.3,
                peer_median_volatility=0.2,
            ),
            LINES,
        )
        is None
    )


@pytest.mark.parametrize(
    ("vol", "level"),
    [
        (0.10, "low"),
        (0.20, "medium"),
        (0.2999, "medium"),
        (0.30, "high"),
        (0.45, "very_high"),
        (0.9, "very_high"),
    ],
)
def test_uncertainty_cutoffs_include_their_lower_end(vol, level):
    assert uncertainty_level(vol, [], LINES) == level


def test_each_trigger_raises_the_level_one_step_up_to_extreme():
    assert uncertainty_level(0.10, ["one_method"], LINES) == "medium"
    assert (
        uncertainty_level(
            0.10,
            ["one_method", "terminal_share", "method_spread", "negative_free_cash_flow"],
            LINES,
        )
        == "extreme"
    )
    assert uncertainty_level(0.50, ["one_method", "terminal_share"], LINES) == "extreme"


# --- rating -------------------------------------------------------------------------------


def peers(gaps):
    return [PeerGap(cik=100 + i, gap=g) for i, g in enumerate(gaps)]


TWENTY = peers([i / 100 for i in range(-10, 10)])  # -0.10 ... 0.09


def test_value_gap_is_the_value_gap_part_over_price():
    assert value_gap(price=100.0, value=130.0, years=3) == pytest.approx(0.10)


def test_the_gap_percentile_leaves_the_company_out():
    gaps = [g.gap for g in TWENTY]
    assert gap_percentile(0.05, gaps) == pytest.approx(100 * 15.5 / 20)
    assert gap_percentile(0.055, gaps) == pytest.approx(100 * 16 / 20)


def inputs(**kw):
    base = dict(
        price=100.0,
        value=130.0,
        score=70.0,
        uncertainty="low",
        peer_gaps=TWENTY,
        red_flags=[],
        volatility=0.15,
    )
    base.update(kw)
    return RatingInputs(**base)


def test_buy_needs_both_the_gap_and_the_score():
    assert rate(inputs(value=130.0), LINES).rating == "Buy"  # gap 0.10: top of the group
    assert rate(inputs(value=130.0, score=59.0), LINES).rating == "Hold"
    assert rate(inputs(value=70.0, score=30.0), LINES).rating == "Sell"  # gap -0.10
    assert rate(inputs(value=70.0, score=41.0), LINES).rating == "Hold"


def test_the_lines_move_with_uncertainty():
    # A gap equal to the 13th of 20 peer gaps: the 62.5th percentile, so Buy at low
    # uncertainty (line 60) and Hold at medium (line 65).
    value = 106.0
    assert rate(inputs(value=value), LINES).rating == "Buy"
    assert rate(inputs(value=value, uncertainty="medium"), LINES).rating == "Hold"


def test_the_same_gap_with_another_dividend_and_volatility_gives_the_same_rating():
    a = rate(inputs(volatility=0.15), LINES)
    b = rate(inputs(volatility=0.18), LINES)
    assert a.rating == b.rating and a.gap_percentile == b.gap_percentile


def test_fewer_than_15_valued_peers_withholds_the_rating():
    result = rate(inputs(peer_gaps=TWENTY[:14]), LINES)
    assert result.rating is None and "15" in result.withheld


def test_red_flags_cap_the_rating_at_hold():
    result = rate(inputs(red_flags=["going_concern"]), LINES)
    assert result.rating == "Hold" and result.uncapped == "Buy"


def test_no_valid_valuation_is_a_hold_with_nothing_else():
    result = rate(inputs(value=None), LINES)
    assert result.rating == "Hold"
    assert result.gap_percentile is None and result.probability is None and result.triggers == {}


def test_trigger_prices_change_the_gap_condition_just_past_them():
    gaps = sorted(g.gap for g in TWENTY)
    value = 120.0
    t = trigger_prices(value=value, peer_gaps=gaps, buy_line=60, sell_line=40, years=3)
    buy, sell = t["buy"], t["sell"]
    assert gap_percentile(value_gap(price=buy * 0.999, value=value, years=3), gaps) >= 60
    assert gap_percentile(value_gap(price=buy * 1.001, value=value, years=3), gaps) < 60
    assert gap_percentile(value_gap(price=sell * 1.001, value=value, years=3), gaps) <= 40
    assert gap_percentile(value_gap(price=sell * 0.999, value=value, years=3), gaps) > 40


def test_a_score_that_misses_its_line_is_not_reachable_by_price_alone():
    result = rate(inputs(score=50.0), LINES)
    assert result.triggers["buy"] == "not reachable by price alone"
    assert result.triggers["sell"] == "not reachable by price alone"
    hold = rate(inputs(score=70.0), LINES)
    assert (
        isinstance(hold.triggers["buy"], float)
        and hold.triggers["sell"] == "not reachable by price alone"
    )


def test_the_probability_is_capped():
    assert (
        probability(gap=1.0, peer_median_gap=0.0, volatility=0.2, rules=LINES["probability"])
        == 0.75
    )
    assert (
        probability(gap=-1.0, peer_median_gap=0.0, volatility=0.2, rules=LINES["probability"])
        == 0.25
    )
    z = 0.02 / (0.2 * math.sqrt(0.6))
    assert probability(
        gap=0.02, peer_median_gap=0.0, volatility=0.2, rules=LINES["probability"]
    ) == pytest.approx(1 / (1 + math.exp(-z)))
