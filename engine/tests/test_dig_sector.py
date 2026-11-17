"""Dig deeper's sector part (dig/sector.py): the stock against its S&P 500 sector and SPY."""

from __future__ import annotations

from datetime import date

import pytest

from tearsheet.charts import SPY_CIK
from tearsheet.data.membership import HoldingRow, Holdings
from tearsheet.data.prices import PriceStore
from tearsheet.dig.sector import months_back, period_returns, sector_part
from tearsheet.dig.target import Target
from tearsheet.watchlist import Shown
from tests.test_companies import add_close

UP_TO = date(2026, 11, 9)
SECTOR = "Industrials"
A, B, C, D = 11, 22, 33, 44
# One close before each period's start (12, 6, 3 and 1 months back), then one on UP_TO.
POINTS = ["2025-11-01", "2026-05-01", "2026-08-01", "2026-10-01", "2026-11-09"]


def holdings(*ciks):
    rows = [
        HoldingRow(f"T{c}", c, f"Company {c}", SECTOR, 1.0 / (i + 1)) for i, c in enumerate(ciks)
    ]
    return Holdings(date(2026, 11, 3), "bundled", rows)


def target_for(cik, sector=SECTOR):
    return Target(
        cik,
        f"T{cik}",
        f"Company {cik}",
        sector,
        Shown(None, None, None, None, None, None),
        None,
        None,
        None,
    )


def priced(conn, cik, last, *, first=100.0, days=POINTS):
    for day in days[:-1]:
        add_close(conn, cik, day, first)
    add_close(conn, cik, days[-1], last)


@pytest.fixture
def three(database):
    conn = database.conn
    priced(conn, A, 110.0)
    priced(conn, B, 120.0)
    priced(conn, C, 100.0)
    priced(conn, SPY_CIK, 105.0)
    return conn


def test_lines_start_at_100_and_share_the_stocks_dates(three):
    part = sector_part(PriceStore(three), holdings(A, B, C), target_for(A), up_to=UP_TO)
    assert part["state"] == "ok" and part["sector"] == SECTOR
    assert part["dates"] == ["2026-05-01", "2026-08-01", "2026-10-01", "2026-11-09"]
    for line in ("stock", "sector_line", "spy"):
        assert len(part[line]) == len(part["dates"]) and part[line][0] == 100.0
    assert part["stock"][-1] == 110.0 and part["spy"][-1] == 105.0
    assert part["sector_line"][-1] == pytest.approx(110.0)  # (110 + 120 + 100) / 3
    assert (part["members"], part["left_out"]) == (3, 0)


def test_returns_and_rank(three):
    part = sector_part(PriceStore(three), holdings(A, B, C), target_for(A), up_to=UP_TO)
    rows = {r["period"]: r for r in part["returns"]}
    assert list(rows) == ["1M", "3M", "6M", "12M"]
    assert rows["12M"]["stock"] == pytest.approx(0.10)
    assert rows["12M"]["sector_median"] == pytest.approx(0.10)
    assert rows["12M"]["spy"] == pytest.approx(0.05)
    assert (part["rank"], part["rank_of"]) == (2, 3)


def test_a_member_with_no_closes_is_left_out_without_blanking_the_line(three):
    part = sector_part(PriceStore(three), holdings(A, B, C, D), target_for(A), up_to=UP_TO)
    assert (part["members"], part["left_out"]) == (3, 1)
    assert part["sector_line"][-1] == pytest.approx(110.0)
    assert part["rank_of"] == 3


def test_a_member_listed_after_the_window_start_is_left_out_of_the_line(three):
    priced(three, D, 200.0, first=100.0, days=["2026-10-01", "2026-11-09"])
    part = sector_part(PriceStore(three), holdings(A, B, C, D), target_for(A), up_to=UP_TO)
    assert (part["members"], part["left_out"]) == (3, 1)
    assert part["sector_line"][0] == 100.0 and part["sector_line"][-1] == pytest.approx(110.0)
    # It still counts where it has a return: 1 month, +100%, so the median of 0, 10, 20, 100%.
    assert {r["period"]: r for r in part["returns"]}["1M"]["sector_median"] == pytest.approx(0.15)


def test_closes_after_the_snapshot_day_change_nothing(three):
    before = sector_part(PriceStore(three), holdings(A, B, C), target_for(A), up_to=UP_TO)
    add_close(three, B, "2026-11-10", 300.0)
    add_close(three, A, "2026-11-10", 1.0)
    after = sector_part(PriceStore(three), holdings(A, B, C), target_for(A), up_to=UP_TO)
    assert after == before


def test_period_returns_match_total_return(three):
    store = PriceStore(three)
    got = period_returns(store, B, UP_TO)
    for label, months in (("1M", 1), ("3M", 3), ("6M", 6), ("12M", 12)):
        assert got[label] == pytest.approx(
            store.total_return(B, "", months_back(UP_TO, months), UP_TO)
        )


def test_a_stock_with_no_closes_is_down(three):
    part = sector_part(PriceStore(three), holdings(A, B, C, D), target_for(D), up_to=UP_TO)
    assert part["state"] == "down" and part["note"] == "No stored prices for this company yet."


def test_a_company_with_no_sector_is_off(three):
    part = sector_part(
        PriceStore(three), holdings(A, B, C), target_for(A, sector=None), up_to=UP_TO
    )
    assert part["state"] == "off" and part["note"] == "Not in an S&P 500 sector."


def test_months_back_clamps_to_the_month_end():
    assert months_back(date(2026, 5, 31), 3) == date(2026, 2, 28)
    assert months_back(date(2026, 11, 9), 12) == date(2025, 11, 9)
    assert months_back(date(2026, 1, 15), 1) == date(2025, 12, 15)
