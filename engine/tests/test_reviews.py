"""Reader flags, spot-checks, per-report answers and the Goal 1 tally (design item 36)."""

from __future__ import annotations

import json
import sqlite3

import pytest

from tearsheet.goal1 import add_review, citations_to_check, counted_reports, tally


def report(
    conn,
    n: int,
    *,
    cik: int,
    sector: str,
    financial_class: str = "",
    citations: int = 8,
    mode: str = "full",
    round_: int = 1,
):
    run_id, report_id = f"run-{n}", f"rep-{n}"
    conn.execute(
        "INSERT OR IGNORE INTO companies (cik, name, sic, sector, financial_class) VALUES (?, ?, 1, ?, ?)",
        (cik, f"Co {cik}", sector, financial_class),
    )
    conn.execute(
        "INSERT INTO runs (run_id, cik, mode, started_at, status, engine_version, method_code_version, methodology_hash, reference_version) VALUES (?, ?, ?, ?, 'done', '0', 1, 'm', 'r')",
        (run_id, cik, mode, f"2026-11-{n:02d}T10:00:00+00:00"),
    )
    conn.execute(
        "INSERT INTO reports (report_id, run_id, created_at, narrative_complete, goal1_round) VALUES (?, ?, ?, 1, ?)",
        (report_id, run_id, f"2026-11-{n:02d}T10:05:00+00:00", round_),
    )
    for c in range(citations // 2):
        conn.execute(
            "INSERT INTO claims VALUES (?, ?, 'business', ?, 'neutral', ?, '{}', 0)",
            (
                f"{report_id}:business.{c + 1}",
                report_id,
                f"business.{c + 1}",
                json.dumps([f"p{c}a", f"p{c}b"]),
            ),
        )
    return report_id


@pytest.fixture
def five_reports(database):
    conn = database.conn
    with conn:
        ids = [
            report(conn, 1, cik=1, sector="Information Technology"),
            report(conn, 2, cik=2, sector="Financials", financial_class="bank"),
            report(conn, 3, cik=3, sector="Health Care"),
            report(conn, 4, cik=4, sector="Energy"),
            report(conn, 5, cik=1, sector="Information Technology"),
            report(conn, 6, cik=9, sector="Utilities", mode="slice"),  # slice reports don't count
        ]
    return conn, ids


def test_only_full_reports_in_the_round_count(five_reports):
    conn, ids = five_reports
    assert counted_reports(conn, goal1_round=1) == ids[:5]


def test_every_citation_in_the_first_3_reports_then_5_at_random(five_reports):
    conn, ids = five_reports
    first = citations_to_check(conn, ids[0], goal1_round=1)
    assert len(first) == 8  # 4 claims × 2 citations
    later = citations_to_check(conn, ids[3], goal1_round=1)
    assert len(later) == 5
    assert later == citations_to_check(conn, ids[3], goal1_round=1)  # the report ID is the seed


def test_reviews_are_add_only(five_reports):
    conn, ids = five_reports
    review = add_review(
        conn,
        report_id=ids[0],
        claim_id=f"{ids[0]}:business.1",
        origin="reader_flag",
        label="open",
        note="looks off",
    )
    with pytest.raises(sqlite3.IntegrityError, match="add-only"):
        with conn:
            conn.execute("DELETE FROM claim_reviews WHERE review_id = ?", (review,))
    with pytest.raises(ValueError):
        add_review(conn, report_id=ids[0], origin="spot_check", label="maybe")


def test_the_tally(five_reports):
    conn, ids = five_reports
    flag = add_review(
        conn,
        report_id=ids[0],
        claim_id=f"{ids[0]}:business.1",
        origin="reader_flag",
        label="open",
        note="?",
    )
    add_review(
        conn,
        report_id=ids[0],
        claim_id=f"{ids[0]}:business.1",
        origin="reader_flag",
        label="confirmed_error",
        resolves=flag,
    )
    add_review(
        conn,
        report_id=ids[1],
        claim_id=f"{ids[1]}:business.1",
        citation_index=0,
        origin="spot_check",
        label="not_supported",
    )
    add_review(
        conn,
        report_id=ids[1],
        claim_id=f"{ids[1]}:business.2",
        citation_index=0,
        origin="spot_check",
        label="supported",
    )
    add_review(
        conn,
        report_id=ids[2],
        claim_id=f"{ids[2]}:business.2",
        citation_index=1,
        origin="spot_check",
        label="wrong",
    )
    for i, answer in zip(ids[:5], ["yes", "yes", "no", "yes", "yes"], strict=True):
        add_review(conn, report_id=i, origin="report_answer", label=answer)
    t = tally(conn, goal1_round=1)
    assert (t.reports, t.companies, t.sectors, t.has_bank_or_reit) == (5, 4, 4, True)
    assert t.confirmed_errors == 2  # the confirmed flag and the "wrong" spot-check
    assert t.failed_citations == 1
    assert t.yes_share == pytest.approx(0.8)
    assert t.outside_checker_share == pytest.approx(1 / 3)
    assert not t.passed  # errors and a failed citation; also fewer than 10 reports


def test_flag_spot_check_and_goal1_commands(tmp_path, monkeypatch, capsys):
    import asyncio

    from tearsheet import cli
    from tearsheet.ai.client import AIClient, ToolState
    from tearsheet.db import open_database
    from tearsheet.methodology import load
    from tearsheet.pipeline import Run
    from tests.fakes.ai import FakeConnector
    from tests.test_pipeline import NOW, FakeData, clean_ai

    data_dir = tmp_path / "d"
    db = open_database(data_dir / "tearsheet.sqlite")
    state = ToolState(db.conn, "claude")
    state.record_check(version="1.0", model_ids=["fake-small"], form="full", passed=True)
    run = Run(
        db.conn,
        FakeData(),
        AIClient(FakeConnector(default=clean_ai), state, retry_wait_s=0),
        load(),
        mode="full",
        now=NOW,
        out_dir=None,
    )
    result = asyncio.run(run.run("T0"))
    claim = db.conn.execute("SELECT claim_id FROM claims WHERE removed = 0 LIMIT 1").fetchone()[0]
    db.close()

    assert cli.main(["--data-dir", str(data_dir), "flag", claim, "check this"]) == 0
    answers = iter(["s"] * 100)
    replies = {"flag": "n", "better": "y"}

    def fake_input(prompt):
        if "Your flag" in prompt:
            return replies["flag"]
        if "better than my usual sources" in prompt:
            return replies["better"]
        return next(answers)

    monkeypatch.setattr("builtins.input", fake_input)
    assert cli.main(["--data-dir", str(data_dir), "spot-check"]) == 0
    capsys.readouterr()
    assert cli.main(["--data-dir", str(data_dir), "goal1"]) == 0
    out = capsys.readouterr().out
    assert "Reports counted: 1" in out and "100% yes" in out and "Confirmed errors: 0" in out
    db = open_database(data_dir / "tearsheet.sqlite")
    labels = [r[0] for r in db.conn.execute("SELECT label FROM claim_reviews ORDER BY created_at")]
    db.close()
    assert labels[0] == "open" and "not_an_error" in labels and labels[-1] == "yes"
    assert result.report_id
