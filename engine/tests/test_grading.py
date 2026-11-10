"""Grading predictions (design item 48, Technical Plan §10)."""

from __future__ import annotations

import json
import math
from datetime import UTC, date, datetime, timedelta

import pytest

from tearsheet.data.prices import SPY_CIK, PriceStore, sessions_between
from tearsheet.grading import (
    add_months,
    grade_due,
    headline,
    hold_band,
    horizon_range,
    is_hit,
    load_rules,
    start_point,
    summary,
)
from tests.test_db import insert_prediction

RULES = load_rules()
COMPANY, PEERS = 320193, [1001, 1002, 1003]
RUN_AT = datetime(2025, 1, 6, 15, 0, tzinfo=UTC)  # 10am in New York, Monday 6 Jan 2025
ACCEPTED = datetime(2025, 1, 6, 21, 30, tzinfo=UTC)  # a filing accepted that evening


def fill(
    store: PriceStore,
    cik: int,
    daily: float,
    *,
    until: date = date(2026, 3, 31),
    start: float = 100.0,
) -> None:
    days = sessions_between(date(2024, 12, 2), until)
    rows, price = [], start
    for day in days:
        price *= 1 + daily
        rows.append(
            {
                "t": int(datetime(day.year, day.month, day.day, 5, tzinfo=UTC).timestamp() * 1000),
                "c": price,
            }
        )
    store.store_bars(cik, "", {"results": rows}, raw_hash="t")


def setup(
    database,
    *,
    rating="Buy",
    company_daily=0.0010,
    valued=True,
    delist_company=False,
    prediction_id="p1",
    run_at=RUN_AT,
):
    store = PriceStore(database.conn)
    fill(
        store,
        COMPANY,
        company_daily,
        until=date(2025, 5, 30) if delist_company else date(2026, 3, 31),
    )
    for i, cik in enumerate(PEERS):
        fill(store, cik, 0.0004 + 0.0001 * i)
    fill(store, SPY_CIK, 0.0003)
    with database.conn:
        insert_prediction(
            database.conn,
            prediction_id=prediction_id,
            run_id=f"run-{prediction_id}",
            rating=rating,
            run_at=run_at.isoformat(),
            latest_acceptance_at=ACCEPTED.isoformat(),
            uncertainty="medium",
            probability=0.62 if valued else None,
            bear=80.0 if valued else None,
            base=112.0 if valued else None,
            bull=150.0 if valued else None,
        )
        database.conn.executemany(
            "INSERT OR IGNORE INTO peer_groups (run_id, cik, peer_cik, weight) VALUES (?, ?, ?, ?)",
            [(f"run-{prediction_id}", COMPANY, p, 1 / 3) for p in PEERS],
        )
    return store


def grades(database):
    rows = database.conn.execute(
        "SELECT prediction_id, horizon_months, grading_version, start_price, results_json FROM grades ORDER BY horizon_months"
    ).fetchall()
    return [(r[0], r[1], r[2], r[3], json.loads(r[4])) for r in rows]


def test_the_start_price_is_the_first_close_after_the_run_and_the_filing(database):
    store = setup(database)
    # The run was at 10am and the filing accepted after the close, so the 6 Jan close is too early.
    day, _ = start_point(store, COMPANY, after=max(RUN_AT, ACCEPTED))
    assert day == date(2025, 1, 7)


def test_end_prices_and_due_dates_at_each_horizon(database):
    store = setup(database)
    graded = grade_due(database.conn, store, RULES, now=datetime(2026, 4, 1, tzinfo=UTC))
    assert graded == 3
    rows = grades(database)
    assert [r[1] for r in rows] == [3, 6, 12]
    three = rows[0][4]
    assert three["start_date"] == "2025-01-07"
    assert three["end_target"] == "2025-04-07"
    assert three["end_date"] <= "2025-04-07"
    assert rows[0][2] == RULES["version"]


def test_nothing_is_graded_before_it_is_due(database):
    store = setup(database)
    with database.conn:
        database.conn.execute("DELETE FROM prices_daily WHERE date > '2025-06-30'")
    assert (
        grade_due(database.conn, store, RULES, now=datetime(2025, 7, 1, tzinfo=UTC)) == 1
    )  # only 3 months


def test_add_months_keeps_to_the_end_of_short_months():
    assert add_months(date(2025, 1, 31), 1) == date(2025, 2, 28)
    assert add_months(date(2025, 11, 7), 3) == date(2026, 2, 7)


@pytest.mark.parametrize(
    ("months", "expected"), [(12, 0.075), (6, 0.075 * math.sqrt(0.5)), (3, 0.075 * 0.5)]
)
def test_the_hold_band_is_scaled_at_3_and_6_months(months, expected):
    assert hold_band("medium", months, RULES) == pytest.approx(expected)


def test_hits():
    assert is_hit("Buy", 0.01, 0.05) and not is_hit("Buy", -0.01, 0.05)
    assert is_hit("Sell", -0.01, 0.05) and not is_hit("Sell", 0.01, 0.05)
    assert is_hit("Hold", 0.04, 0.05) and not is_hit("Hold", -0.06, 0.05)


def test_the_range_spread_is_scaled_by_the_square_root_of_time():
    bear, base, bull = horizon_range(start_price=100.0, bear=80.0, base=112.0, bull=150.0, months=3)
    assert base == pytest.approx(103.0)  # a straight line a quarter of the way to 112
    vol = math.log(150.0 / 112.0) / 1.2816
    assert bull == pytest.approx(103.0 * math.exp(1.2816 * vol * 0.5))
    assert bear == pytest.approx(103.0 * math.exp(-1.2816 * vol * 0.5))
    assert horizon_range(start_price=100.0, bear=80.0, base=112.0, bull=150.0, months=12)[
        1
    ] == pytest.approx(112.0)


def test_a_bought_out_company_is_held_at_its_last_price(database):
    store = setup(database, delist_company=True)
    grade_due(database.conn, store, RULES, now=datetime(2026, 4, 1, tzinfo=UTC))
    twelve = [r for r in grades(database) if r[1] == 12][0][4]
    assert twelve["end_date"] <= "2025-05-30"
    closes = dict(store.closes(COMPANY))
    assert twelve["company_return"] == pytest.approx(
        closes[date(2025, 5, 30)] / closes[date(2025, 1, 7)] - 1
    )


def test_a_no_valuation_hold_is_graded_for_its_rating_only(database):
    store = setup(database, rating="Hold", valued=False)
    grade_due(database.conn, store, RULES, now=datetime(2026, 4, 1, tzinfo=UTC))
    twelve = [r for r in grades(database) if r[1] == 12][0][4]
    assert "hit" in twelve and twelve["range"] is None and twelve["brier"] is None


def test_regrading_after_a_rule_change_adds_rows_and_overwrites_none(database):
    store = setup(database)
    grade_due(database.conn, store, RULES, now=datetime(2026, 4, 1, tzinfo=UTC))
    first = grades(database)
    changed = {
        **RULES,
        "version": RULES["version"] + 1,
        "hold_band_points": {**RULES["hold_band_points"], "medium": 2.0},
    }
    assert grade_due(database.conn, store, changed, now=datetime(2026, 4, 1, tzinfo=UTC)) == 3
    after = grades(database)
    assert len(after) == 6
    assert [r for r in after if r[2] == RULES["version"]] == first
    assert grade_due(database.conn, store, changed, now=datetime(2026, 4, 1, tzinfo=UTC)) == 0


def test_the_headline_filter_keeps_one_per_company_per_rolling_year():
    t = datetime(2025, 1, 1, tzinfo=UTC)
    rows = [
        {"prediction_id": "a", "cik": 1, "run_at": t.isoformat()},
        {"prediction_id": "b", "cik": 1, "run_at": (t + timedelta(days=100)).isoformat()},
        {"prediction_id": "c", "cik": 1, "run_at": (t + timedelta(days=365)).isoformat()},
        {"prediction_id": "d", "cik": 1, "run_at": (t + timedelta(days=500)).isoformat()},
        {"prediction_id": "e", "cik": 2, "run_at": (t + timedelta(days=100)).isoformat()},
    ]
    assert {r["prediction_id"] for r in headline(rows, min_gap_days=365)} == {"a", "c", "e"}


def test_the_seeded_baseline_gives_the_same_numbers_on_a_regrade(database):
    store = setup(database)
    for n, (rating, daily) in enumerate(
        [("Sell", -0.0005), ("Hold", 0.0004), ("Buy", 0.002)], start=2
    ):
        setup_more(database, store, f"p{n}", rating, 1000 + 10 * n, daily)
    grade_due(database.conn, store, RULES, now=datetime(2026, 4, 1, tzinfo=UTC))
    first = summary(database.conn, RULES, store=store)
    second = summary(database.conn, RULES, store=store)
    assert first == second
    group = first["groups"][0]
    twelve = group["horizons"]["12"]
    assert twelve["count"] == 4
    assert (
        "random_mix_hit_rate" in twelve["baselines"]
        and "always_hold_hit_rate" in twelve["baselines"]
    )
    assert (
        0
        <= twelve["hit_rate"]["low"]
        <= twelve["hit_rate"]["value"]
        <= twelve["hit_rate"]["high"]
        <= 1
    )
    assert first["label"] == "descriptive, not conclusive"


def setup_more(database, store, prediction_id, rating, cik, daily):
    fill(store, cik, daily)
    with database.conn:
        insert_prediction(
            database.conn,
            prediction_id=prediction_id,
            run_id=f"run-{prediction_id}",
            cik=cik,
            ticker=f"T{cik}",
            rating=rating,
            run_at=RUN_AT.isoformat(),
            latest_acceptance_at=ACCEPTED.isoformat(),
            uncertainty="medium",
            probability=0.5,
            bear=80.0,
            base=105.0,
            bull=140.0,
        )
        database.conn.executemany(
            "INSERT INTO peer_groups (run_id, cik, peer_cik, weight) VALUES (?, ?, ?, ?)",
            [(f"run-{prediction_id}", cik, p, 1 / 3) for p in PEERS],
        )


def test_the_grading_job_tops_up_prices_grades_and_backs_up(database, tmp_path):
    import asyncio

    from tearsheet.grading import grade_job

    setup(database)

    class Data:
        def __init__(self):
            self.asked = None

        async def fill_prices(self, store, members, *, end):
            self.asked = (dict(members), end)

    with database.conn:  # runs record every member's ticker (item 17)
        database.conn.executemany(
            "INSERT INTO tickers (ticker, cik, share_class, conversion_ratio, date_from) VALUES (?, ?, '', 1, '2025-01-01')",
            [(f"P{cik}", cik) for cik in PEERS],
        )
    data = Data()
    result = asyncio.run(
        grade_job(
            database.conn,
            data,
            RULES,
            now=datetime(2026, 4, 1, tzinfo=UTC),
            backup_dir=tmp_path / "b",
        )
    )
    assert result["graded"] == 3
    members, end = data.asked
    assert set(members) == {COMPANY, *PEERS}
    # Midnight UTC on 1 April is 8pm on 31 March in New York: the newest closed session.
    assert end == date(2026, 3, 31)
    assert list((tmp_path / "b").glob("tearsheet-*.sqlite"))
    again = asyncio.run(
        grade_job(
            database.conn,
            data,
            RULES,
            now=datetime(2026, 4, 1, tzinfo=UTC),
            backup_dir=tmp_path / "b",
        )
    )
    assert again["graded"] == 0


def test_a_company_whose_prices_just_stopped_waits_instead_of_being_held_as_cash(database):
    # Closes that stop a few days before the 3-month target may just not be fetched yet;
    # a grade is permanent, so it waits until the market has gone on 30 days without them.
    store = setup(database)
    target = add_months(date(2025, 1, 7), 3)
    database.conn.execute(
        "DELETE FROM prices_daily WHERE cik = ? AND date > ?", (PEERS[0], "2025-04-01")
    )
    database.conn.execute(
        "DELETE FROM prices_daily WHERE cik = ? AND date > ?", (SPY_CIK, "2025-04-20")
    )
    database.conn.commit()
    assert target.isoformat() == "2025-04-07"
    grade_due(database.conn, store, RULES, now=datetime(2025, 4, 21, tzinfo=UTC))
    assert [r[1] for r in grades(database)] == []
    fill(store, SPY_CIK, 0.0003, until=date(2025, 5, 15))
    grade_due(database.conn, store, RULES, now=datetime(2025, 5, 16, tzinfo=UTC))
    assert [r[1] for r in grades(database)] == [3]
