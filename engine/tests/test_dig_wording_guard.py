"""Dig deeper's take: the guard that removes advice and verdict wording (the AI gives no
second rating, and never tells the reader what to do)."""

from __future__ import annotations

import pytest

from tearsheet.dig.wording_guard import check


@pytest.mark.parametrize(
    "text",
    [
        "You should buy the shares while they are cheap.",
        "Investors should consider selling.",
        "We recommend holding through the quarter.",
        "This looks like a strong buy.",
        "At this price it is a sell.",
        "The shares are worth buying below {{level:buy_trigger}}.",
        "We rate the stock attractive.",
        "Analysts would call it overweight, and so do we.",
        "It may be time to take profits.",
        "Now is a good time to sell.",
        "Buy the stock before the next report.",
        "Avoid the stock until margins recover.",
        "A good entry point is near {{level:bear}}.",
    ],
)
def test_advice_and_verdicts_are_removed(text):
    reasons = check(text)
    assert reasons and reasons[0].startswith("advice wording: ")


@pytest.mark.parametrize(
    "text",
    [
        "The company kept up a buyback through the year.",
        "A sell-off in chip stocks pulled the sector down.",
        "The stock outperformed the sector over {{dig:stock_12m}}.",
        "Analysts rate it mostly positively, with {{dig:analyst_buy}} on the buy side.",
        "Insiders sold shares under trading plans.",
        "Our numbers turn Buy at {{level:buy_trigger}}.",
        "A close above {{level:sell_trigger}} would turn our numbers to Sell.",
        "The report holds a Buy rating from code.",
    ],
)
def test_plain_description_is_kept(text):
    assert check(text) == []


def test_the_reason_quotes_what_was_found():
    assert check("You should buy it.") == ["advice wording: 'You should buy'"]
