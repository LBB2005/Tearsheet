"""Dig deeper's market part (dig/market.py): SPY, its volatility, and the FRED figures."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from tearsheet.charts import SPY_CIK
from tearsheet.data.prices import PriceStore
from tearsheet.dig.market import market_part, rates_part
from tearsheet.methodology import load
from tearsheet.pipeline import twelve_month_return
from tearsheet.scoring import momentum_scaling
from tests.test_companies import add_close

UP_TO = date(2026, 11, 9)
RULES = load().weights["momentum_scaling"]


def spy(conn, days, *, start=100.0, step=1.001):
    first = UP_TO - timedelta(days=days - 1)
    for i in range(days):
        add_close(conn, SPY_CIK, (first + timedelta(days=i)).isoformat(), start * step**i)


def test_market_reads_spy_up_to_the_close_date(database):
    conn = database.conn
    spy(conn, 400)
    add_close(conn, SPY_CIK, "2026-11-10", 1.0)  # after the snapshot day: not read
    store = PriceStore(conn)
    part = market_part(store, RULES, up_to=UP_TO)
    scaling = momentum_scaling(
        store.log_returns(SPY_CIK, up_to=UP_TO),
        spy_12m_return=twelve_month_return(store, SPY_CIK, UP_TO),
        rules=RULES,
    )
    assert part["state"] == "ok"
    assert part["spy_12m"] == pytest.approx(twelve_month_return(store, SPY_CIK, UP_TO))
    assert part["scaling_on"] is False and part["scaling_note"] == scaling.note
    assert part["volatility_percentile"] == scaling.volatility_percentile


def test_market_with_too_little_spy_history_says_so(database):
    spy(database.conn, 30)
    part = market_part(PriceStore(database.conn), RULES, up_to=UP_TO)
    assert part["state"] == "ok" and part["spy_12m"] is None
    assert part["scaling_note"].startswith("Momentum scaling is off: only 29 trading days")


def test_market_without_spy_prices_is_down(database):
    part = market_part(PriceStore(database.conn), RULES, up_to=UP_TO)
    assert part["state"] == "down" and part["note"] == "No stored SPY prices yet."


MACRO = {
    "DGS10": ("percent", 0.0412, date(2026, 11, 6)),
    "UNRATE": ("percent", 0.041, date(2026, 10, 1)),
    "CPIAUCSL": ("percent", 0.029, date(2026, 9, 1)),
}


def test_rates_are_labelled_in_the_reports_order():
    part = rates_part(MACRO, fred_key=True)
    assert part["state"] == "ok"
    assert part["rates"] == [
        {"id": "UNRATE", "label": "Unemployment rate", "value": 0.041, "date": "2026-10-01"},
        {"id": "DGS10", "label": "10-year Treasury yield", "value": 0.0412, "date": "2026-11-06"},
        {
            "id": "CPIAUCSL",
            "label": "Consumer prices, past year",
            "value": 0.029,
            "date": "2026-09-01",
        },
    ]


def test_rates_are_off_without_a_fred_key():
    part = rates_part({}, fred_key=False)
    assert part == {"state": "off", "note": "Add a FRED key in Settings to see rates.", "rates": []}


def test_rates_are_down_when_fred_failed():
    part = rates_part(None, fred_key=True)
    assert part["state"] == "down" and part["note"] == "FRED didn’t answer."
