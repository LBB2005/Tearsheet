"""Dig deeper's take: the placeholders it may use and the Buy price line code writes."""

from __future__ import annotations

import pytest

from tearsheet.dig.levels import levels_of, placeholders, price_line
from tests.dig_sample import levels, part_off, sample_snapshot


def with_levels(close=250.1, **changes):
    snap = sample_snapshot()
    snap["header"]["close"] = close
    snap["header"]["levels"] = levels(**changes)
    return snap


def test_levels_of_reads_a_snapshots_levels_as_the_watchlist_does():
    lv = levels_of(levels(buy_reachable=False))
    assert lv.trigger("buy") is None
    assert lv.trigger("sell") == 201.0
    assert lv.report_id == "rep-a2"


def test_the_buy_price_line_above_the_trigger():
    assert price_line(with_levels(close=250.1)) == (
        "Our numbers turn Buy at $238.00",
        "Today’s close: $250.10",
    )


@pytest.mark.parametrize("close", [238.0, 236.5])
def test_the_buy_price_line_at_or_below_the_trigger(close):
    line, today = price_line(with_levels(close=close))
    assert line == "Our numbers turn Buy at $238.00"
    assert today == f"Today’s close: ${close:,.2f}, below that price"


def test_a_red_flag_holds_the_rating_whatever_the_price():
    assert price_line(with_levels(capped=True)) == (
        "A red flag holds our rating at Hold, whatever the price.",
        None,
    )


def test_a_buy_not_reachable_by_price_says_why():
    assert price_line(with_levels(buy_reachable=False)) == (
        "No price alone turns our numbers to Buy: the score is below the Buy line.",
        None,
    )


def test_no_levels_or_no_trigger_says_the_report_has_no_buy_price():
    snap = sample_snapshot()
    snap["header"]["levels"] = None
    assert price_line(snap) == ("The report has no Buy price.", None)
    assert price_line(with_levels(buy_trigger=None, buy_reachable=None)) == (
        "The report has no Buy price.",
        None,
    )


def test_the_placeholders_cover_every_part_and_hold_no_empty_value():
    found = placeholders(sample_snapshot())
    assert found["level:buy_trigger"].value == 238.0
    assert found["level:close"].kind == "price"
    assert found["level:since_report"].kind == "percent"
    assert found["level:report_date"].kind == "date"
    assert found["dig:stock_12m"].value == 0.123
    assert found["dig:sector_12m"].value == 0.189
    assert found["dig:spy_1m"].value == 0.008
    assert found["dig:sector_rank"].value == 41
    assert found["dig:volatility_percentile"].kind == "count"
    assert found["macro:DGS10"].value == 0.0412
    assert found["metric:operating_margin"].kind == "percent"
    assert found["metric:interest_coverage"].kind == "ratio"
    assert found["peer_median:operating_margin"].value == 0.62
    assert "peer_median:interest_coverage" not in found  # no peer has one
    assert found["dig:score"].value == 72.5
    assert found["dig:insider_sells"].value == 2
    assert found["dig:insider_sell_value"].kind == "amount"
    assert found["dig:news_negative"].value == 1
    assert found["dig:analyst_firms"].kind == "count"
    assert all(p.value is not None for p in found.values())
    assert all(key == p.key for key, p in found.items())


def test_an_unreachable_trigger_gives_no_placeholder():
    found = placeholders(with_levels(buy_reachable=False))
    assert "level:buy_trigger" not in found
    assert "level:sell_trigger" in found


def test_a_part_that_is_off_gives_no_placeholders_and_a_stale_one_still_does():
    snap = sample_snapshot(
        rates=part_off("Add a FRED key in Settings to see rates.", rates=[]),
    )
    snap["news"]["state"] = "stale"
    found = placeholders(snap)
    assert not [k for k in found if k.startswith("macro:")]
    assert "dig:news_positive" in found
