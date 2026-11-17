"""Dig deeper's subject (dig/target.py): the company, its report on show, and today's close."""

from __future__ import annotations

from datetime import date

import pytest

from tearsheet.data import membership
from tearsheet.dig.target import NoReport, target
from tests.test_watchlist import AAPL, closes, report


def split(conn, cik, day, ratio):
    with conn:
        conn.execute(
            "INSERT INTO corporate_actions VALUES (?, '', ?, 'split', ?, 't')", (cik, day, ratio)
        )


def test_target_names_the_company_and_its_close(database):
    conn = database.conn
    report(conn)
    closes(conn, AAPL, [("2026-11-03", 100.0), ("2026-11-09", 110.0)])
    t = target(conn, AAPL, membership.load_bundled())
    assert (t.ticker, t.name, t.sector) == ("AAPL", "Apple Inc.", "Information Technology")
    assert t.close == (date(2026, 11, 9), 110.0)
    assert t.since_report == 0.1
    assert t.levels_today["base"] == 110.0 and t.levels_today["report_date"] == "2026-11-04"


def test_target_puts_the_levels_in_todays_shares_after_a_split(database):
    conn = database.conn
    report(conn)
    closes(conn, AAPL, [("2026-11-03", 100.0), ("2026-11-09", 55.0)])
    split(conn, AAPL, "2026-11-05", 2.0)
    t = target(conn, AAPL, membership.load_bundled())
    assert t.levels_today["base"] == 55.0 and t.levels_today["buy_trigger"] == 45.0
    assert t.levels_today["report_price"] == 50.0
    assert t.since_report == 0.1  # 55 × 2 ÷ 100 − 1


def test_target_without_a_close_still_has_the_report_levels(database):
    conn = database.conn
    report(conn)
    t = target(conn, AAPL, membership.load_bundled())
    assert t.close is None and t.since_report is None
    assert t.levels_today["base"] == 110.0


def test_target_without_report_or_prediction_is_no_report(database):
    with pytest.raises(NoReport):
        target(database.conn, AAPL, membership.load_bundled())
