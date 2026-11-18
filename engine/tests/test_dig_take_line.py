"""Dig deeper's take line (dig/take_line.py): the Watchlist's companies, one take after another,
with the report line's pauses."""

from __future__ import annotations

from datetime import timedelta

from tearsheet.batch import REOPENED, _day
from tearsheet.data import membership
from tearsheet.dig.take_line import TAKE_DAYS, TakeLine
from tests.test_watchlist import AAPL, JPM, NOW, NVDA, report


def take_row(conn, cik, at):
    with conn:
        conn.execute(
            "INSERT INTO dig_takes VALUES (?, ?, 'dig-x', NULL, ?, '{}', '{}', '{}')",
            (f"take-{cik}-{at:%Y%m%dT%H%M%SZ}-aaaaaa", cik, at.isoformat()),
        )


def plan(conn, line, ciks):
    return line.plan_ciks(conn, ciks, holdings=membership.load_bundled(), now=NOW)


def test_plan_takes_the_companies_with_a_report_in_order_and_says_why_others_are_left_out(
    database,
):
    conn = database.conn
    report(conn)  # AAPL
    report(conn, NVDA, "NVDA", run_id="run-n", report_id="rep-n")
    report(conn, JPM, "JPM", run_id="run-j", report_id="rep-j")
    take_row(conn, JPM, NOW - timedelta(days=2))
    line = TakeLine()
    entries, skipped = plan(conn, line, [NVDA, AAPL, JPM, 1652044, AAPL])
    assert [(e.ticker, e.cik, e.official) for e in entries] == [
        ("NVDA", NVDA, False),
        ("AAPL", AAPL, False),
    ]
    assert [(s.query, s.kind) for s in skipped] == [
        ("JPM", "recent"),
        ("GOOGL", "no_report"),
        ("AAPL", "twice"),
    ]
    assert skipped[0].reason == f"JPM has a take from {_day(NOW - timedelta(days=2))}."
    assert skipped[1].reason == "GOOGL has no report to write a take from."
    line.add(entries)
    again, skipped = plan(conn, line, [AAPL])
    assert again == [] and skipped[0].reason == "AAPL is already in the line."


def test_a_take_older_than_a_week_is_taken_again(database):
    conn = database.conn
    report(conn)
    take_row(conn, AAPL, NOW - timedelta(days=TAKE_DAYS, hours=1))
    entries, skipped = plan(conn, TakeLine(), [AAPL])
    assert [e.ticker for e in entries] == ["AAPL"] and skipped == []


def test_a_take_done_note_ends_its_entry(database):
    report(database.conn)
    line = TakeLine()
    line.add(plan(database.conn, line, [AAPL])[0])
    entry = line.take_next()
    entry.run_id = "take-1"
    line.end(
        entry,
        TakeLine.ended({"saved": True, "code": None, "message": None, "reset_at": None}),
        now=NOW,
    )
    assert (entry.outcome, entry.resumable, line.paused) == ("ready", False, None)


def test_a_usage_limit_pauses_until_it_resets_and_the_company_goes_back_first(database):
    conn = database.conn
    report(conn)
    report(conn, NVDA, "NVDA", run_id="run-n", report_id="rep-n")
    line = TakeLine()
    line.add(plan(conn, line, [AAPL, NVDA])[0])
    entry = line.take_next()
    entry.run_id = "take-1"
    done = {
        "saved": False,
        "code": "USAGE_LIMIT",
        "message": "Usage limit reached.",
        "reset_at": "2026-11-10T03:00:00Z",
    }
    line.end(entry, TakeLine.ended(done), now=NOW)
    assert line.paused.code == "USAGE_LIMIT" and line.paused.wait_until is not None
    assert line.paused.run_id is None  # a take never resumes; it is written again
    line.carry_on(NOW)
    assert [e.ticker for e in line.waiting] == ["AAPL", "NVDA"]
    assert line.waiting[0].run_id is None


def test_cancelled_and_failed_takes_end_their_entries(database):
    report(database.conn)
    line = TakeLine()
    for done, outcome in (
        ({"saved": False, "code": "CANCELLED", "message": "The take was cancelled."}, "cancelled"),
        ({"saved": False, "code": "ENGINE_ERROR", "message": "Oops."}, "failed"),
    ):
        line.add(plan(database.conn, line, [AAPL])[0])
        entry = line.take_next()
        line.end(entry, TakeLine.ended({"reset_at": None, **done}), now=NOW)
        assert entry.outcome == outcome and line.paused is None


def test_after_a_quit_the_line_comes_back_paused_with_its_take_dropped(database):
    conn = database.conn
    report(conn)
    report(conn, NVDA, "NVDA", run_id="run-n", report_id="rep-n")
    line = TakeLine()
    line.add(plan(conn, line, [AAPL, NVDA])[0])
    line.take_next().run_id = "take-unfinished"
    back = TakeLine.loads(line.dumps())
    assert isinstance(back, TakeLine)
    assert back.paused.code == REOPENED
    assert back.paused.message == "2 takes were waiting when Tearsheet closed."
    assert [(e.ticker, e.run_id) for e in back.waiting] == [("AAPL", None), ("NVDA", None)]
    assert TakeLine.loads(None).idle()
