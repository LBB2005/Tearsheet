"""Each report's levels as numbers (report_levels.py): written at save from the run's own rating,
filled once for older reports from their code-written lines, erased with the report, and never
part of what replay compares."""

from __future__ import annotations

import json

from tearsheet import report_levels
from tearsheet.rating import NOT_REACHABLE
from tearsheet.replay import replay
from tearsheet.report_marks import erase, hide
from tests.test_pipeline import FakeData, WeakControls, run_full, run_slice
from tests.test_replay import counts, logged_run

NUMBERS = ("price", "estimate", "bear", "base", "bull", "buy_trigger", "sell_trigger")


def levels(conn, report_id: str) -> dict:
    row = conn.execute("SELECT * FROM report_levels WHERE report_id = ?", (report_id,)).fetchone()
    return dict(row) if row else {}


def refill(conn, report_id: str) -> dict:
    """The row as an older report gets it: deleted, then filled from the stored lines."""
    with conn:
        conn.execute("DELETE FROM report_levels WHERE report_id = ?", (report_id,))
    assert report_levels.fill(conn) == 1
    return levels(conn, report_id)


def test_a_full_run_stores_its_rating_range_and_triggers_exactly(database, tmp_path):
    run, result = run_full(database, tmp_path)
    rating, rng = run.rated
    row = levels(database.conn, result.report_id)
    assert row["source"] == "run" and row["cik"] == run.cik and row["run_id"] == run.run_id
    assert row["price_date"] == run.price_date.isoformat()
    assert row["rating"] == rating.rating and row["capped"] == 0
    assert (row["bear"], row["base"], row["bull"]) == (rng.bear, rng.base, rng.bull)
    company = run.members[run.cik]
    assert row["price"] == company.price[1] and row["estimate"] == company.valuation.value
    for side in ("buy", "sell"):
        value = rating.triggers[side]
        if isinstance(value, float):
            assert row[f"{side}_trigger"] == value and row[f"{side}_reachable"] == 1
        else:
            assert value == NOT_REACHABLE
            assert row[f"{side}_trigger"] is None and row[f"{side}_reachable"] == 0
    assert row["score_percentile"] == int(f"{run.score_result.composite[run.cik]:.0f}")
    assert row["uncertainty"] in ("low", "medium", "high", "very_high")


def test_the_lines_of_an_older_report_give_the_same_levels_to_the_cent(database, tmp_path):
    run, result = run_full(database, tmp_path)
    exact = levels(database.conn, result.report_id)
    parsed = refill(database.conn, result.report_id)
    assert parsed["source"] == "parsed"
    for key in NUMBERS:
        want = None if exact[key] is None else round(exact[key], 2)
        assert parsed[key] == want, key
    for key in (
        "rating",
        "capped",
        "uncertainty",
        "score_percentile",
        "buy_reachable",
        "sell_reachable",
        "price_date",
        "cik",
        "run_id",
    ):
        assert parsed[key] == exact[key], key


def test_a_red_flag_cap_is_kept(database, tmp_path):
    run, result = run_full(database, tmp_path, data=WeakControls())
    rating, _ = run.rated
    row = levels(database.conn, result.report_id)
    assert row["capped"] == int(rating.uncapped != rating.rating)
    assert refill(database.conn, result.report_id)["capped"] == row["capped"]


def test_withheld_sections_store_no_rating_range_or_triggers(database, tmp_path):
    _, result, _ = run_slice(database, tmp_path, data=FakeData(stale_company=True))
    row = levels(database.conn, result.report_id)
    assert row["source"] == "run"
    assert all(row[k] is None for k in (*NUMBERS, "rating", "score_percentile", "uncertainty"))
    assert row["buy_reachable"] is None and row["sell_reachable"] is None
    parsed = refill(database.conn, result.report_id)
    assert all(parsed[k] is None for k in (*NUMBERS, "rating", "score_percentile"))


def test_a_run_without_its_render_step_is_filled_from_the_report_itself(database, tmp_path):
    run, result = run_full(database, tmp_path)
    from_render = refill(database.conn, result.report_id)
    with database.conn:
        database.conn.execute("DELETE FROM step_outputs WHERE step = 'render'")
    assert refill(database.conn, result.report_id) == from_render


def test_the_fill_is_idempotent_and_skips_reports_with_a_row(database, tmp_path):
    run_full(database, tmp_path)
    assert report_levels.fill(database.conn) == 0


def test_erasing_a_report_erases_its_levels(database, tmp_path):
    _, result = run_full(database, tmp_path)
    hide(database.conn, [result.report_id])
    assert erase(database.conn, [result.report_id])["erased"] == [result.report_id]
    assert levels(database.conn, result.report_id) == {}


def test_the_levels_are_no_step_output_so_replay_is_still_identical(
    database, tmp_path, monkeypatch
):
    run = logged_run(database, tmp_path, monkeypatch)
    report_id = database.conn.execute(
        "SELECT report_id FROM reports WHERE run_id = ?", (run.run_id,)
    ).fetchone()[0]
    assert levels(database.conn, report_id)["source"] == "run"
    steps = {
        r[0]: json.loads(r[1])
        for r in database.conn.execute(
            "SELECT step, json FROM step_outputs WHERE run_id = ?", (run.run_id,)
        )
    }
    assert set(steps["rate"]) == {"rating", "uncertainty", "gap_percentile"}
    assert set(steps["render"]) == {"code_sections", "risk_lines", "triggers"}
    before = counts(database.conn)
    result = replay(database.path, run.run_id, raw_dir=tmp_path / "data" / "raw")
    assert result.identical, result.differences
    assert counts(database.conn) == before
