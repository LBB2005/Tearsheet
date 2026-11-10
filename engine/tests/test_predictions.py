"""The prediction log (design item 35, Technical Plan §10)."""

from __future__ import annotations

import csv
import json
import sqlite3
from datetime import UTC, datetime, timedelta

import pytest

from tearsheet.predictions import (
    Prediction,
    export_log,
    log_if_official,
    previous_official,
    slot_open,
)

T0 = datetime(2026, 11, 5, 14, 0, tzinfo=UTC)


def prediction(
    run_at: datetime,
    *,
    run_id: str = "r1",
    rating: str = "Buy",
    valued: bool = True,
    cik: int = 320193,
) -> Prediction:
    return Prediction(
        run_id=run_id,
        cik=cik,
        ticker="AAPL",
        share_class="",
        run_at=run_at,
        score=72.0,
        rating=rating,
        probability=0.61 if valued else None,
        bear=200.0 if valued else None,
        base=300.0 if valued else None,
        bull=420.0 if valued else None,
        uncertainty="medium",
        percentile_lines={"buy": 65, "sell": 35},
        accessions=["0000320193-26-000026"],
        latest_acceptance_at=datetime(2026, 11, 3, 16, 30, tzinfo=UTC),
        methodology_hash="m" * 64,
        method_code_version=1,
        engine_version="0.0.1",
        ai_tool="claude",
        model_ids=["claude-haiku-5-5"],
        inputs_hash="i" * 64,
    )


def test_the_first_rated_run_is_official_and_opens_a_30_day_window(database, tmp_path):
    first = log_if_official(database.conn, prediction(T0), backup_dir=tmp_path / "b")
    assert first is not None
    assert not slot_open(database.conn, 320193, T0 + timedelta(days=29, hours=23))
    assert (
        log_if_official(
            database.conn,
            prediction(T0 + timedelta(days=3), run_id="r2"),
            backup_dir=tmp_path / "b",
        )
        is None
    )
    # The window runs 30 × 24 hours from the official run's start.
    assert slot_open(database.conn, 320193, T0 + timedelta(days=30))
    assert database.conn.execute("SELECT COUNT(*) FROM predictions").fetchone()[0] == 1


def test_each_company_has_its_own_window(database, tmp_path):
    log_if_official(database.conn, prediction(T0), backup_dir=tmp_path / "b")
    assert slot_open(database.conn, 789019, T0)


def test_a_no_valuation_hold_is_logged_with_no_range(database, tmp_path):
    pid = log_if_official(
        database.conn, prediction(T0, rating="Hold", valued=False), backup_dir=tmp_path / "b"
    )
    row = database.conn.execute(
        "SELECT rating, bear, base, bull, probability FROM predictions WHERE prediction_id = ?",
        (pid,),
    ).fetchone()
    assert tuple(row) == ("Hold", None, None, None, None)


def test_the_previous_rating_is_shown(database, tmp_path):
    log_if_official(database.conn, prediction(T0, rating="Hold"), backup_dir=tmp_path / "b")
    later = T0 + timedelta(days=40)
    assert previous_official(database.conn, 320193, later) == ("Hold", T0.isoformat())
    pid = log_if_official(database.conn, prediction(later, run_id="r3"), backup_dir=tmp_path / "b")
    row = database.conn.execute(
        "SELECT previous_rating, previous_rating_at FROM predictions WHERE prediction_id = ?",
        (pid,),
    ).fetchone()
    assert tuple(row) == ("Hold", T0.isoformat())


def test_logged_rows_cannot_be_changed(database, tmp_path):
    log_if_official(database.conn, prediction(T0), backup_dir=tmp_path / "b")
    with pytest.raises(sqlite3.IntegrityError):
        with database.conn:
            database.conn.execute("UPDATE predictions SET rating = 'Sell'")


def test_each_official_prediction_is_backed_up(database, tmp_path):
    log_if_official(database.conn, prediction(T0), backup_dir=tmp_path / "b")
    copies = list((tmp_path / "b").glob("tearsheet-*.sqlite"))
    assert len(copies) == 1
    copy = sqlite3.connect(copies[0])
    assert copy.execute("SELECT COUNT(*) FROM predictions").fetchone()[0] == 1
    copy.close()


def test_export_writes_csv_and_json(database, tmp_path):
    log_if_official(database.conn, prediction(T0), backup_dir=tmp_path / "b")
    csv_path, json_path = export_log(database.conn, tmp_path / "export")
    rows = list(csv.DictReader(csv_path.open()))
    assert rows[0]["ticker"] == "AAPL" and rows[0]["rating"] == "Buy"
    data = json.loads(json_path.read_text())
    assert data["predictions"][0]["accessions"] == ["0000320193-26-000026"]
    assert data["grades"] == []


# --- the prediction log page -------------------------------------------------------------------


def _log_page_db(conn, *, split=False):
    from tests.test_charts import _actions, seed
    from tests.test_db import insert_prediction

    seed(conn)
    with conn:
        conn.execute(
            "INSERT OR REPLACE INTO companies (cik, name, sector) VALUES (1, 'One Co', 'Energy')"
        )
        insert_prediction(
            conn,
            cik=1,
            ticker="ONE",
            run_id="run-1",
            run_at="2026-10-27T20:00:00+00:00",
            bear=8.0,
            base=15.0,
            bull=30.0,
            probability=0.6,
            score=55.0,
            uncertainty="high",
        )
    if split:
        _actions(conn, 1, [("2026-10-29", "split", 2.0)])


def _counts(conn):
    return [
        conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in ("predictions", "grades")
    ]


def test_summary_extras_name_the_company_report_and_price(database):
    from tearsheet.predictions import summary_extras

    conn = database.conn
    _log_page_db(conn)
    row = conn.execute("SELECT * FROM predictions").fetchone()
    before = _counts(conn)
    extras = summary_extras(conn, row)
    assert extras == {
        "name": "One Co",
        "sector": "Energy",
        "share_class": "",
        "score": 55.0,
        "probability": 0.6,
        "uncertainty": "high",
        "report_id": "rep-1",
        "price": 11.0,
        "price_date": "2026-10-30",
    }
    assert _counts(conn) == before


def test_todays_price_is_put_back_into_the_predictions_shares(database):
    from tearsheet.predictions import summary_extras

    conn = database.conn
    _log_page_db(conn, split=True)
    row = conn.execute("SELECT * FROM predictions").fetchone()
    # A 2-for-1 split after the prediction: 11 in today's shares is 22 in the prediction's.
    assert summary_extras(conn, row)["price"] == 22.0


def test_summary_extras_without_company_report_or_prices(database):
    from tearsheet.predictions import summary_extras
    from tests.test_db import insert_prediction

    conn = database.conn
    with conn:
        insert_prediction(conn, cik=999, run_id="nowhere")
    row = conn.execute("SELECT * FROM predictions").fetchone()
    extras = summary_extras(conn, row)
    assert extras["name"] is None and extras["report_id"] is None
    assert extras["price"] is None and extras["price_date"] is None


def test_compare_prices_gives_each_line_on_spys_days(database):
    from tearsheet.predictions import compare_prices
    from tests.test_charts import DAYS

    conn = database.conn
    _log_page_db(conn)
    before = _counts(conn)
    out = compare_prices(conn, [1, 2, 1], "2026-10-27")
    assert out["dates"] == DAYS[1:]
    assert [s["cik"] for s in out["series"]] == [1, 2]
    assert out["spy"][0] == 100.0 and round(out["spy"][-1], 6) == round(100 * 103 / 101, 6)
    one = out["series"][0]["total"]
    assert one[0] == 100.0 and round(one[-1], 6) == 110.0
    assert compare_prices(conn, [42], "2026-10-27")["series"][0]["total"] == [None] * 4
    assert _counts(conn) == before


def test_the_log_methods_answer_on_the_protocol(tmp_path):
    from tearsheet.protocol import PredictionPrices, PredictionSummary
    from tests.test_protocol import Harness, run

    h = Harness(tmp_path)
    _log_page_db(h.server.db.conn)

    async def go():
        listed = await h.call("list_predictions", {})
        prices = await h.call("prediction_prices", {"ciks": [1], "since": "2026-10-26"}, id_=2)
        bad = await h.call("prediction_prices", {"ciks": [1], "since": "soon"}, id_=3)
        return listed, prices, bad

    listed, prices, bad = run(go())
    [row] = listed["result"]
    PredictionSummary.model_validate(row)
    assert row["sector"] == "Energy" and row["price"] == 11.0 and row["report_id"] == "rep-1"
    PredictionPrices.model_validate(prices["result"])
    assert bad["error"]["code"] == -32602
    h.server.close()


def test_a_prediction_cannot_be_replaced(database, tmp_path):
    # INSERT OR REPLACE skips the delete trigger; the insert trigger refuses it.
    pid = log_if_official(database.conn, prediction(T0), backup_dir=tmp_path / "b")
    row = dict(database.conn.execute("SELECT * FROM predictions").fetchone())
    row["rating"] = "Sell"
    with pytest.raises(sqlite3.IntegrityError):
        with database.conn:
            database.conn.execute(
                f"INSERT OR REPLACE INTO predictions ({', '.join(row)}) "
                f"VALUES ({', '.join('?' * len(row))})",
                list(row.values()),
            )
    assert (
        database.conn.execute(
            "SELECT rating FROM predictions WHERE prediction_id = ?", (pid,)
        ).fetchone()[0]
        == "Buy"
    )


def test_grades_cannot_be_changed_or_replaced(database, tmp_path):
    pid = log_if_official(database.conn, prediction(T0), backup_dir=tmp_path / "b")
    insert = (
        "INSERT {} INTO grades (prediction_id, horizon_months, graded_at, grading_version,"
        " start_price, results_json) VALUES (?, 3, '2027-02-05', 1, 100, '{{}}')"
    )
    with database.conn:
        database.conn.execute(insert.format(""), (pid,))
    for sql in (
        insert.format("OR REPLACE"),
        "UPDATE grades SET start_price = 1",
        "DELETE FROM grades",
    ):
        with pytest.raises(sqlite3.IntegrityError):
            with database.conn:
                database.conn.execute(sql, (pid,) if "?" in sql else ())
    assert database.conn.execute("SELECT start_price FROM grades").fetchone()[0] == 100


def test_a_run_that_started_first_but_rated_second_does_not_log_twice(database, tmp_path):
    # The line and a terminal run on one company: the later-started run logs first.
    first = log_if_official(
        database.conn, prediction(T0 + timedelta(hours=1), run_id="later"), backup_dir=tmp_path
    )
    second = log_if_official(database.conn, prediction(T0, run_id="earlier"), backup_dir=tmp_path)
    assert first is not None and second is None
    assert database.conn.execute("SELECT COUNT(*) FROM predictions").fetchone()[0] == 1


def test_two_connections_cannot_both_log(tmp_path):
    from tearsheet.db import open_database

    path = tmp_path / "data" / "t.sqlite"
    a, b = open_database(path), open_database(path)
    first = log_if_official(a.conn, prediction(T0, run_id="a"), backup_dir=tmp_path / "b")
    second = log_if_official(b.conn, prediction(T0, run_id="b"), backup_dir=tmp_path / "b")
    assert first is not None and second is None
    assert a.conn.execute("SELECT COUNT(*) FROM predictions").fetchone()[0] == 1
    a.close()
    b.close()


def test_a_failed_backup_keeps_the_prediction_and_the_run(database, tmp_path):
    blocker = tmp_path / "not-a-folder"
    blocker.write_text("x")
    pid = log_if_official(database.conn, prediction(T0), backup_dir=blocker / "b")
    assert pid is not None
    assert database.conn.execute("SELECT COUNT(*) FROM predictions").fetchone()[0] == 1
