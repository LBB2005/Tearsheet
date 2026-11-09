"""The sidebar's marks: hiding, bringing back and erasing reports, and pinning companies.

The prediction log must never lose an official prediction, and deleting a report must never let
a new run become official inside the 30-day window."""

from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime, timedelta

import pytest

from tearsheet.companies import list_companies, search_companies
from tearsheet.goal1 import add_review
from tearsheet.predictions import log_if_official, slot_open
from tearsheet.report_marks import erase, hide, kept_because, set_pinned, show
from tests.test_companies import add_close, add_report
from tests.test_predictions import prediction
from tests.test_protocol import Harness, run

NVDA, JPM, AAPL = 1045810, 19617, 320193


def count(conn, table: str, where: str = "", args: tuple = ()) -> int:
    return conn.execute(f"SELECT COUNT(*) FROM {table} {where}", args).fetchone()[0]


def add_contents(conn, run_id: str, report_id: str, cik: int) -> None:
    """The rows a finished run leaves besides its report: text, claims, results and a fetch."""
    with conn:
        conn.execute(
            "INSERT INTO sections (report_id, key, json) VALUES (?, 'thesis', '{}')", (report_id,)
        )
        conn.execute(
            "INSERT INTO claims (claim_id, report_id, section, sentence_id, stance,"
            " citations_json, check_results_json) VALUES (?, ?, 'thesis', 's1', 'for', '[]', '{}')",
            (f"c-{report_id}", report_id),
        )
        conn.execute(
            "INSERT INTO step_outputs (run_id, step, json) VALUES (?, 'rate', ?)",
            (run_id, json.dumps({"rating": "Buy"})),
        )
        conn.execute(
            "INSERT INTO metrics (run_id, cik, name, value, inputs_json) VALUES (?, ?, 'pe', 20, '{}')",
            (run_id, cik),
        )
        conn.execute(
            "INSERT INTO peer_groups (run_id, cik, peer_cik, weight) VALUES (?, ?, 1, 0.5)",
            (run_id, cik),
        )
        conn.execute(
            "INSERT OR IGNORE INTO raw_objects VALUES ('h1', 'sec', 'json', 1, 1, ?, '2026-11-01')",
            (run_id,),
        )
        conn.execute(
            "INSERT INTO fetch_log (run_id, provider, request_key, raw_hash, fetched_at)"
            " VALUES (?, 'sec', 'https://data.sec.gov/x', 'h1', '2026-11-01')",
            (run_id,),
        )


def test_a_hidden_report_leaves_the_lists_and_comes_back(database):
    conn = database.conn
    add_report(conn, "run-1", "rep-1", NVDA, "NVDA", "2026-11-01T10:00:00+00:00")
    add_report(conn, "run-2", "rep-2", JPM, "JPM", "2026-11-02T10:00:00+00:00")
    assert hide(conn, ["rep-2", "rep-nope"]) == {"hidden": ["rep-2"], "erasable": ["rep-2"]}
    assert [r["ticker"] for r in list_companies(conn)] == ["NVDA"]
    # The look-up box no longer offers to open it.
    assert search_companies(conn, "jpm")[0]["report_id"] is None
    assert show(conn, ["rep-2", "rep-2", "rep-1"]) == ["rep-2"]
    assert [r["ticker"] for r in list_companies(conn)] == ["JPM", "NVDA"]
    assert search_companies(conn, "jpm")[0]["report_id"] == "rep-2"


def test_a_company_row_follows_its_newest_report_on_show(database):
    conn = database.conn
    add_report(conn, "run-1", "rep-1", NVDA, "NVDA", "2026-11-01T10:00:00+00:00")
    add_report(conn, "run-3", "rep-3", NVDA, "NVDA", "2026-11-03T10:00:00+00:00")
    (row,) = list_companies(conn)
    assert row["report_id"] == "rep-3" and row["report_ids"] == ["rep-3", "rep-1"]
    assert row["reports"] == 2 and row["created_at"] == "2026-11-03T10:00:00+00:00"
    hide(conn, ["rep-3"])
    (row,) = list_companies(conn)
    assert row["report_id"] == "rep-1" and row["report_ids"] == ["rep-1"] and row["reports"] == 1
    assert row["report_date"] == "2026-11-01"


def test_erasing_removes_the_report_and_its_run_but_keeps_the_shared_caches(database):
    conn = database.conn
    add_report(conn, "run-1", "rep-1", NVDA, "NVDA", "2026-11-01T10:00:00+00:00")
    add_contents(conn, "run-1", "rep-1", NVDA)
    hide(conn, ["rep-1"])
    assert erase(conn, ["rep-1"]) == {"erased": ["rep-1"], "kept": []}
    for table, key in (
        ("reports", "report_id"),
        ("sections", "report_id"),
        ("claims", "report_id"),
        ("hidden_reports", "report_id"),
    ):
        assert count(conn, table, f"WHERE {key} = ?", ("rep-1",)) == 0, table
    for table in ("step_outputs", "metrics", "peer_groups", "runs"):
        assert count(conn, table, "WHERE run_id = ?", ("run-1",)) == 0, table
    # Later runs reuse its downloads through fetch_log, so the cache stays.
    assert count(conn, "fetch_log", "WHERE run_id = ?", ("run-1",)) == 1
    assert count(conn, "raw_objects") == 1
    assert list_companies(conn) == []


def test_only_a_hidden_report_is_erased(database):
    conn = database.conn
    add_report(conn, "run-1", "rep-1", NVDA, "NVDA", "2026-11-01T10:00:00+00:00")
    assert erase(conn, ["rep-1", "rep-nope"]) == {"erased": [], "kept": ["rep-1"]}
    assert count(conn, "reports") == 1


def test_an_official_report_is_only_hidden_and_its_prediction_still_counts(database, tmp_path):
    conn = database.conn
    at = datetime(2026, 11, 5, 14, 0, tzinfo=UTC)
    add_report(conn, "run-1", "rep-1", AAPL, "AAPL", at.isoformat())
    add_contents(conn, "run-1", "rep-1", AAPL)
    assert log_if_official(conn, prediction(at, run_id="run-1"), backup_dir=tmp_path / "b")
    assert kept_because(conn, "rep-1") == "official"
    assert hide(conn, ["rep-1"]) == {"hidden": ["rep-1"], "erasable": []}
    assert erase(conn, ["rep-1"]) == {"erased": [], "kept": ["rep-1"]}
    # Everything the log and grading read is still there.
    assert count(conn, "reports") == 1 and count(conn, "sections") == 1
    assert count(conn, "runs", "WHERE run_id = 'run-1'") == 1
    assert count(conn, "peer_groups", "WHERE run_id = 'run-1'") == 1
    assert count(conn, "predictions", "WHERE run_id = 'run-1'") == 1
    # A hidden official report still holds the company's 30-day slot.
    assert list_companies(conn) == []
    assert not slot_open(conn, AAPL, at + timedelta(days=1))
    assert (
        log_if_official(
            conn, prediction(at + timedelta(days=2), run_id="run-2"), backup_dir=tmp_path / "b"
        )
        is None
    )
    # And the log is still write-once.
    with pytest.raises(sqlite3.DatabaseError, match="write-once"):
        with conn:
            conn.execute("DELETE FROM predictions")


def test_a_reviewed_report_is_only_hidden(database):
    conn = database.conn
    add_report(conn, "run-1", "rep-1", NVDA, "NVDA", "2026-11-01T10:00:00+00:00")
    add_contents(conn, "run-1", "rep-1", NVDA)
    add_review(conn, report_id="rep-1", claim_id="c-rep-1", origin="reader_flag", label="open")
    assert kept_because(conn, "rep-1") == "reviewed"
    assert hide(conn, ["rep-1"])["erasable"] == []
    assert erase(conn, ["rep-1"]) == {"erased": [], "kept": ["rep-1"]}
    assert count(conn, "claims") == 1 and count(conn, "claim_reviews") == 1


def test_pinning_a_company(database):
    conn = database.conn
    add_report(conn, "run-1", "rep-1", NVDA, "NVDA", "2026-11-01T10:00:00+00:00")
    set_pinned(conn, NVDA, True)
    set_pinned(conn, NVDA, True)
    assert list_companies(conn)[0]["pinned"] is True
    set_pinned(conn, NVDA, False)
    assert list_companies(conn)[0]["pinned"] is False


def test_a_company_row_has_its_rating_mark_sector_and_move(database, tmp_path):
    conn = database.conn
    # The run started at 8 pm New York time on Tuesday, after the close was ready (7 pm), so
    # the report was priced at Tuesday's close.
    started = "2026-11-04T01:00:00+00:00"
    add_report(conn, "run-1", "rep-1", NVDA, "NVDA", started)
    add_contents(conn, "run-1", "rep-1", NVDA)
    add_close(conn, NVDA, "2026-11-02", 150.0)
    add_close(conn, NVDA, "2026-11-03", 200.0)
    add_close(conn, NVDA, "2026-11-06", 55.0)
    # A 4-for-1 split on Thursday: $55 is $220 in the report's shares, 10% up.
    with conn:
        conn.execute(
            "INSERT INTO corporate_actions VALUES (?, '', '2026-11-05', 'split', 4, 't')", (NVDA,)
        )
    (row,) = list_companies(conn)
    assert row["rating"] == "Buy" and row["official"] is False
    assert row["sector"] == "Information Technology"
    assert row["since_report"] == pytest.approx(0.10)
    log_if_official(
        conn,
        prediction(datetime.fromisoformat(started), run_id="run-1", cik=NVDA),
        backup_dir=tmp_path / "b",
    )
    assert list_companies(conn)[0]["official"] is True


def test_no_move_without_a_close_at_the_report(database):
    conn = database.conn
    add_report(conn, "run-1", "rep-1", NVDA, "NVDA", "2026-11-03T23:00:00+00:00")
    add_close(conn, NVDA, "2026-11-06", 55.0)
    (row,) = list_companies(conn)
    assert row["since_report"] is None and row["rating"] is None


# --- the methods ---------------------------------------------------------------------------


def test_the_methods_hide_bring_back_and_keep_an_official_report(tmp_path, monkeypatch):
    from tearsheet import config as cfg
    from tests.test_pipeline import WithFilingList

    h = Harness(tmp_path, data_cls=WithFilingList, log_predictions=True)
    monkeypatch.setattr(cfg, "home_folder", lambda: tmp_path)

    async def go():
        await h.server.start()
        cfg.Settings(h.server.db.conn).set("backup_dir", str(tmp_path / "backups"))
        await h.call("run_report", {"query": "T0"})
        await h.finish()
        rid = h.notes("report_ready")[0]["report_id"]
        (row,) = (await h.call("list_companies", id_=2))["result"]
        hid = await h.call("hide_reports", {"report_ids": [rid]}, id_=3)
        gone = await h.call("list_companies", id_=4)
        hidden = await h.call("list_reports", {"hidden": True}, id_=5)
        shown = await h.call("list_reports", {}, id_=6)
        erased = await h.call("erase_reports", {"report_ids": [rid]}, id_=7)
        # A second report on the same day saves no new prediction.
        await h.call("run_report", {"query": "T0"}, id_=8)
        await h.finish()
        logged = await h.call("list_predictions", id_=9)
        back = await h.call("show_reports", {"report_ids": [rid]}, id_=10)
        pin = await h.call("pin_company", {"cik": row["cik"], "pinned": True}, id_=11)
        after = await h.call("list_companies", id_=12)
        return row, rid, hid, gone, hidden, shown, erased, logged, back, pin, after

    row, rid, hid, gone, hidden, shown, erased, logged, back, pin, after = run(go())
    assert row["official"] is True and row["report_ids"] == [rid]
    assert hid["result"] == {"hidden": [rid], "erasable": []}
    assert gone["result"] == []
    assert [(r["report_id"], r["kept_because"]) for r in hidden["result"]] == [(rid, "official")]
    assert rid not in [r["report_id"] for r in shown["result"]]
    assert erased["result"] == {"erased": [], "kept": [rid]}
    assert len(logged["result"]) == 1
    assert back["result"] == {"shown": [rid]}
    assert pin["result"] == {"ok": True}
    (top,) = after["result"]
    assert top["pinned"] is True and top["reports"] == 2 and rid in top["report_ids"]
    h.server.close()


def test_the_methods_erase_an_ordinary_report(tmp_path):
    h = Harness(tmp_path)

    async def go():
        await h.server.start()
        await h.call("run_report", {"query": "T0"})
        await h.finish()
        rid = h.notes("report_ready")[0]["report_id"]
        hid = await h.call("hide_reports", {"report_ids": [rid]}, id_=2)
        erased = await h.call("erase_reports", {"report_ids": [rid]}, id_=3)
        missing = await h.call("get_report", {"report_id": rid}, id_=4)
        empty = await h.call("hide_reports", {"report_ids": []}, id_=5)
        return rid, hid, erased, missing, empty

    rid, hid, erased, missing, empty = run(go())
    assert hid["result"] == {"hidden": [rid], "erasable": [rid]}
    assert erased["result"] == {"erased": [rid], "kept": []}
    assert "error" in missing
    assert empty["error"]["code"] == -32602
    h.server.close()
