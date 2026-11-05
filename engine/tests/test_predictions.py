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
