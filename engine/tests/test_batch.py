"""The line: several reports, one after another (batch.py and the server's line methods).

Every run here uses the fake companies T0, T1, … and the fake AI tool; nothing is fetched live.
"""

from __future__ import annotations

import asyncio
import dataclasses
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, timedelta, timezone

import pytest

from tearsheet import config
from tearsheet.ai.client import AIUsageLimit, RawAnswer
from tearsheet.batch import (
    REOPENED,
    SETTING,
    USAGE_HIGH,
    USAGE_WEEK,
    Entry,
    Reading,
    ReportLine,
    reset_moment,
    typical_report,
    usage_readings,
)
from tearsheet.data import membership
from tearsheet.data.membership import HoldingRow, Holdings
from tearsheet.db import open_database
from tests.test_pipeline import NOW, N, clean_ai
from tests.test_protocol import Harness, run


def fake_holdings(n: int = N) -> Holdings:
    """The fake companies: T0 to T9 are Industrials, the rest Utilities."""
    rows = [
        HoldingRow(
            f"T{i}",
            1000 + i,
            f"Company {i}",
            "Industrials" if i < 10 else "Utilities",
            float(1000 - i),
        )
        for i in range(n)
    ]
    return Holdings(date(2026, 11, 3), "bundled", rows)


@pytest.fixture
def fake_list(monkeypatch):
    """The look-up list is the fake companies', as the fake data's step 1 sees them."""
    monkeypatch.setattr(membership, "load_bundled", fake_holdings)


def plan(line: ReportLine, queries: list[str], conn, *, n: int = N, skip_recent: bool = False):
    holdings = fake_holdings(n)
    return line.plan(
        queries,
        holdings=holdings,
        tickers={r.ticker: r.cik for r in holdings.rows},
        aliases={"widgets": 1003},
        conn=conn,
        now=NOW,
        skip_recent=skip_recent,
    )


def finished_report(conn, run_id: str, cik: int, at: datetime, *, complete: bool = True) -> None:
    """A finished report on a company, as the reports list and the line see it."""
    with conn:
        conn.execute(
            "INSERT INTO runs (run_id, cik, mode, started_at, ended_at, status, engine_version,"
            " method_code_version, methodology_hash, reference_version, ai_calls)"
            " VALUES (?, ?, 'full', ?, ?, 'done', 'test', 1, 'h', 'r', 34)",
            (run_id, cik, (at - timedelta(minutes=4)).isoformat(), at.isoformat()),
        )
        conn.execute(
            "INSERT INTO reports (report_id, run_id, created_at, narrative_complete) VALUES (?, ?, ?, ?)",
            (f"rep-{run_id}", run_id, at.isoformat(), int(complete)),
        )


# --- the line on its own -----------------------------------------------------------------------


def test_plan_looks_each_company_up_and_says_why_one_is_left_out(tmp_path):
    db = open_database(tmp_path / "t.sqlite")
    line = ReportLine()
    line.waiting = [Entry("T5", "Company 5", 1005, True)]
    entries, skipped = plan(line, ["t1", " T2 ", "widgets", "", "T1", "T5", "ZZZZ"], db.conn)
    assert [(e.ticker, e.cik, e.official) for e in entries] == [
        ("T1", 1001, True),
        ("T2", 1002, True),
        ("T3", 1003, True),  # by its alias
    ]
    reasons = {s.query: s.reason for s in skipped}
    assert reasons["T1"] == "T1 is listed twice."
    assert reasons["T5"] == "T5 is already in the line."
    assert "No S&P 500 company matches" in reasons["ZZZZ"]
    assert line.waiting[0].ticker == "T5" and len(line.waiting) == 1  # plan changes nothing
    db.close()


def test_plan_says_a_refresh_is_official_again_once_30_days_have_passed(tmp_path):
    """The app's Refresh asks plan before writing a company again (8 Nov 2026): an official
    prediction over 30 days old leaves room for a new one; a younger one doesn't."""
    from datetime import timedelta

    from tearsheet.predictions import log_if_official
    from tests.test_predictions import prediction

    db = open_database(tmp_path / "t.sqlite")
    for run_id, cik, days in (("old", 1001, 31), ("young", 1002, 10)):
        p = prediction(NOW - timedelta(days=days), run_id=run_id, cik=cik)
        assert log_if_official(db.conn, p, backup_dir=tmp_path / "b") is not None
    entries, _ = plan(ReportLine(), ["T1", "T2", "T3"], db.conn)
    assert [(e.ticker, e.official) for e in entries] == [("T1", True), ("T2", False), ("T3", True)]
    db.close()


def test_the_line_holds_as_many_as_are_added(tmp_path):
    """No 10 at a time any more (8 Nov 2026): the whole S&P 500 fits in one line."""
    db = open_database(tmp_path / "t.sqlite")
    line = ReportLine()
    line.add([Entry(f"T{i}", f"Company {i}", 1000 + i, True) for i in range(10)])
    entries, skipped = plan(line, [f"T{i}" for i in range(10, 503)], db.conn, n=503)
    assert len(entries) == 493 and skipped == []
    line.add(entries)
    assert len(line.waiting) == 503
    assert "limit" not in line.state()
    db.close()


def test_tickers_pasted_with_spaces_or_new_lines_are_one_company_each(tmp_path):
    db = open_database(tmp_path / "t.sqlite")
    entries, skipped = plan(
        ReportLine(), ["T1 T2  t7", "T4\tT5 ZZZZ", "widgets", "Company 6"], db.conn
    )
    assert [e.ticker for e in entries] == ["T1", "T2", "T7", "T4", "T5", "T3", "T6"]
    assert [(s.query, s.kind) for s in skipped] == [("ZZZZ", "unknown")]
    db.close()


def test_what_is_left_out_is_grouped_by_why(tmp_path):
    db = open_database(tmp_path / "t.sqlite")
    line = ReportLine()
    line.waiting = [Entry("T5", "Company 5", 1005, True)]
    _, skipped = plan(line, ["T1", "T1", "T5", "nope"], db.conn)
    assert [(s.query, s.kind) for s in skipped] == [
        ("T1", "twice"),
        ("T5", "in_line"),
        ("nope", "unknown"),
    ]
    db.close()


def test_skip_recent_leaves_out_companies_with_a_report_from_the_last_30_days(tmp_path):
    from tearsheet.predictions import log_if_official
    from tests.test_predictions import prediction

    db = open_database(tmp_path / "t.sqlite")
    finished_report(db.conn, "r1", 1001, NOW - timedelta(days=3))  # recent: left out
    finished_report(db.conn, "r2", 1002, NOW - timedelta(days=40))  # old: written again
    finished_report(db.conn, "r4", 1004, NOW - timedelta(days=2), complete=False)  # stopped
    # An official prediction 10 days old, from a report since hidden or stopped, counts too.
    p = prediction(NOW - timedelta(days=10), run_id="r3", cik=1003)
    assert log_if_official(db.conn, p, backup_dir=tmp_path / "b") is not None
    queries = ["T1", "T2", "T3", "T4", "T5"]
    entries, skipped = plan(ReportLine(), queries, db.conn, skip_recent=True)
    assert [e.ticker for e in entries] == ["T2", "T4", "T5"]
    assert [(s.query, s.kind) for s in skipped] == [("T1", "recent"), ("T3", "recent")]
    assert skipped[0].reason.startswith("T1 has a report from Nov ")
    # Off (as Refresh asks): all five, T3 not a new official prediction.
    entries, skipped = plan(ReportLine(), queries, db.conn)
    assert [(e.ticker, e.official) for e in entries] == [
        ("T1", True),
        ("T2", True),
        ("T3", False),
        ("T4", True),
        ("T5", True),
    ]
    db.close()


def test_a_typical_report_is_taken_from_the_latest_finished_runs(tmp_path):
    db = open_database(tmp_path / "t.sqlite")
    assert typical_report(db.conn) is None
    for k in range(4):
        finished_report(db.conn, f"r{k}", 1000 + k, NOW - timedelta(days=k))
    assert typical_report(db.conn) == {"seconds": 240, "ai_calls": 34, "runs": 4}
    db.close()


# --- usage limits and the plan's 80% -------------------------------------------------------------

LA = timezone(timedelta(hours=-8))


def test_reset_times_are_read_from_what_the_tool_said():
    assert reset_moment("3am", NOW, local=LA) == datetime(2026, 11, 5, 11, 0, tzinfo=UTC)
    # A time already past today is tomorrow's: NOW is 5pm on 4 Nov in Los Angeles.
    assert reset_moment("3:40 pm", NOW, local=LA) == datetime(2026, 11, 5, 23, 40, tzinfo=UTC)
    assert reset_moment("3pm (Europe/London)", NOW, local=LA) == datetime(
        2026, 11, 5, 15, 0, tzinfo=UTC
    )
    assert reset_moment("Nov 10, 3pm", NOW, local=LA) == datetime(2026, 11, 10, 23, 0, tzinfo=UTC)
    assert reset_moment("1793768400", NOW) == datetime.fromtimestamp(1793768400, UTC)
    assert reset_moment(1793768400, NOW) == datetime.fromtimestamp(1793768400, UTC)
    assert reset_moment("2026-11-05T03:00:00+00:00", NOW) == datetime(2026, 11, 5, 3, tzinfo=UTC)
    for unreadable in (None, "", "soon", "in 2 hours", "7", "13pm"):
        assert reset_moment(unreadable, NOW, local=LA) is None


def test_a_usage_limit_pauses_until_it_resets_and_no_reset_time_waits_an_hour():
    line = ReportLine()
    line.add([Entry("T1", "Company 1", 1001, True), Entry("T2", "Company 2", 1002, True)])
    first = line.take_next()
    first.run_id = "run-1"
    reset = "2026-11-05T03:00:00+00:00"
    line.end(first, {"how": "stopped", "code": "USAGE_LIMIT", "reset_at": reset}, now=NOW)
    assert line.paused.wait_until == "2026-11-05T03:02:00+00:00"  # two minutes past the reset
    assert line.wake() == "run-1"  # resumed by the server
    # No reset time: an hour from now. A reset already past: no sooner than five minutes.
    for reset_at, wait in (
        (None, "2026-11-05T02:00:00+00:00"),
        (NOW.isoformat(), "2026-11-05T01:05:00+00:00"),
    ):
        line = ReportLine()
        line.add([Entry("T1", "Company 1", 1001, True)])
        line.end(
            line.take_next(),
            {"how": "stopped", "code": "USAGE_LIMIT", "reset_at": reset_at},
            now=NOW,
        )
        assert line.paused.wait_until == wait
    # A sign-out waits for Liam.
    line = ReportLine()
    line.add([Entry("T1", "Company 1", 1001, True)])
    line.end(line.take_next(), {"how": "stopped", "code": "AUTH_EXPIRED"}, now=NOW)
    assert line.paused.wait_until is None and line.wake() is None and line.paused is not None


def test_a_company_that_never_started_goes_back_first_when_the_wait_ends():
    line = ReportLine()
    line.add([Entry("T1", "Company 1", 1001, True), Entry("T2", "Company 2", 1002, True)])
    line.end(line.take_next(), {"how": "failed", "code": "USAGE_LIMIT"}, now=NOW)
    assert line.paused.run_id is None and line.paused.wait_until
    assert line.wake() is None
    assert line.paused is None and [e.ticker for e in line.waiting] == ["T1", "T2"]
    assert line.finished == [] and line.waiting[0].outcome is None


def test_a_wait_for_a_usage_limit_comes_back_paused_after_a_quit():
    line = ReportLine()
    line.add([Entry("T1", "Company 1", 1001, True), Entry("T2", "Company 2", 1002, True)])
    first = line.take_next()
    first.run_id = "run-1"
    line.end(first, {"how": "stopped", "code": "USAGE_LIMIT", "message": "Limit."}, now=NOW)
    assert line.paused.wait_until is not None
    back = ReportLine.loads(line.dumps())
    assert back.paused.code == "USAGE_LIMIT" and back.paused.wait_until is None
    assert back.wake() is None and back.paused is not None  # waits for Liam
    assert back.resume("run-1").ticker == "T1"


def test_the_tools_usage_readings():
    claude = [
        {"status": "allowed", "type": "seven_day", "utilization": None, "resets_at": None},
        {
            "status": "allowed_warning",
            "type": "five_hour",
            "utilization": 0.83,
            "resets_at": 1793768400,
        },
        {
            "status": "allowed_warning",
            "type": "seven_day_opus",
            "utilization": None,
            "resets_at": None,
        },
        None,
    ]
    got = usage_readings(claude)
    assert got["5h"] == Reading(
        "5h", 0.83, datetime.fromtimestamp(1793768400, UTC).isoformat(), True
    )
    assert got["week"].used is None and got["week"].warned and got["week"].high()
    codex = [
        {
            "status": "allowed",
            "windows": [
                {"window": "5h", "used": 0.4, "resets_at": 1793768400},
                {"window": "week", "used": 0.81, "resets_at": 1794000000},
            ],
        }
    ]
    got = usage_readings(codex)
    assert not got["5h"].high() and got["week"].high()


def _line_of(n: int) -> ReportLine:
    line = ReportLine()
    line.add([Entry(f"T{i}", f"Company {i}", 1000 + i, True) for i in range(n)])
    return line


def test_past_80_percent_of_the_5_hour_window_the_line_waits_for_its_reset():
    line = _line_of(2)
    reset = (NOW + timedelta(hours=2)).isoformat()
    line.check_usage({"5h": Reading("5h", 0.79, reset)}, NOW)
    assert line.paused is None
    line.check_usage({"5h": Reading("5h", 0.84, reset)}, NOW)
    assert line.paused.code == USAGE_HIGH and line.paused.used == 0.84
    assert line.paused.wait_until == "2026-11-05T03:02:00+00:00"
    assert line.paused.message == "Your plan's 5-hour usage is at 84%."
    assert line.wake() is None and line.paused is None  # nothing to resume: it just goes on
    # A reading whose window has already reset says nothing; nor does a line with nothing left.
    line.check_usage({"5h": Reading("5h", 0.9, (NOW - timedelta(minutes=1)).isoformat())}, NOW)
    assert line.paused is None
    ReportLine().check_usage({"5h": Reading("5h", 0.9, reset)}, NOW)


def test_past_80_percent_of_the_week_the_line_asks_once_a_week():
    line = _line_of(3)
    week_reset = (NOW + timedelta(days=3)).isoformat()
    readings = {"week": Reading("week", 0.82, week_reset), "5h": Reading("5h", 0.9, None)}
    line.check_usage(readings, NOW)
    assert line.paused.code == USAGE_WEEK and line.paused.wait_until is None
    assert line.paused.message == "Your plan's weekly usage is at 82%."
    assert line.wake() is None and line.paused is not None  # only Liam carries it on
    line.carry_on(NOW)
    assert line.week_ok_until == week_reset
    # Asked once: the same week past 80% again doesn't ask, though the 5-hour rule still holds.
    line.check_usage(readings, NOW + timedelta(hours=1))
    assert line.paused.code == USAGE_HIGH
    line.carry_on(NOW)
    # The yes is kept through a quit, and ends when the week resets.
    back = ReportLine.loads(line.dumps())
    assert back.week_ok_until == week_reset
    back.carry_on(NOW)  # past the line's pause for opening again
    back.check_usage({"week": Reading("week", 0.85, None)}, NOW + timedelta(days=4))
    assert back.paused.code == USAGE_WEEK


def test_a_problem_that_would_stop_the_rest_pauses_the_line_and_resume_takes_it_back():
    line = ReportLine()
    line.add([Entry("T1", "Company 1", 1001, True), Entry("T2", "Company 2", 1002, True)])
    first = line.take_next()
    first.run_id = "run-1"
    line.end(
        first, {"how": "stopped", "code": "USAGE_LIMIT", "message": "Limit.", "reset_at": "3am"}
    )
    assert line.writing is None and line.paused is not None
    assert (line.paused.code, line.paused.run_id, line.paused.reset_at) == (
        "USAGE_LIMIT",
        "run-1",
        "3am",
    )
    assert line.resume("run-other") is None
    again = line.resume("run-1")
    assert again is first and line.writing is first and line.paused is None
    assert line.finished == [] and first.outcome is None
    # A problem with one company only: marked, and the line isn't paused.
    line.end(first, {"how": "failed", "code": "ENGINE_ERROR", "message": "Bad filing."})
    assert line.paused is None and line.finished[0].outcome == "failed"


def test_a_new_line_puts_the_last_ones_done_list_away():
    line = ReportLine()
    line.add([Entry("T1", "Company 1", 1001, True)])
    line.end(line.take_next(), {"how": "ready", "report_id": "rep-1"})
    line.add([Entry("T2", "Company 2", 1002, False)])
    assert line.finished == [] and [e.ticker for e in line.waiting] == ["T2"]


def test_remove_and_clear():
    line = ReportLine()
    line.add([Entry("T1", "Company 1", 1001, True), Entry("T2", "Company 2", 1002, True)])
    line.take_next()
    assert line.remove("T2") and not line.remove("T9")
    before = line.round
    line.clear()
    assert line.idle() and line.round == before + 1


def test_the_line_comes_back_paused_with_the_report_being_written_first():
    line = ReportLine()
    line.add([Entry("T1", "Company 1", 1001, True), Entry("T2", "Company 2", 1002, False)])
    line.take_next().run_id = "run-1"
    back = ReportLine.loads(line.dumps())
    assert [(e.ticker, e.run_id, e.official) for e in back.waiting] == [
        ("T1", None, True),
        ("T2", None, False),
    ]
    assert back.writing is None and back.paused.code == REOPENED
    assert back.paused.message == "2 reports were waiting when Tearsheet closed."
    # Nothing waiting: nothing to come back to.
    assert ReportLine.loads(ReportLine().dumps()).idle()
    assert ReportLine.loads("not json").idle() and ReportLine.loads(None).idle()


def test_a_line_paused_by_a_stopped_report_keeps_its_resume():
    line = ReportLine()
    line.add([Entry("T1", "Company 1", 1001, True)])
    first = line.take_next()
    first.run_id = "run-1"
    line.end(first, {"how": "stopped", "code": "AUTH_EXPIRED", "message": "Sign in."})
    back = ReportLine.loads(line.dumps())
    assert back.paused.code == "AUTH_EXPIRED" and back.paused.run_id == "run-1"
    assert back.resume("run-1").ticker == "T1"


def test_a_pause_from_outside_the_line_needs_a_report_waiting_and_no_pause_set():
    from tearsheet.batch import SAFETY_CHECK_STOPPED, SAFETY_CHECK_UNFINISHED

    empty = ReportLine()
    assert not empty.pause(SAFETY_CHECK_STOPPED, "You stopped the safety check.")
    assert empty.paused is None and empty.idle()

    line = ReportLine()
    line.add([Entry("T1", "Company 1", 1001, True), Entry("T2", "Company 2", 1002, True)])
    first = line.take_next()
    first.run_id = "run-1"
    line.end(first, {"how": "stopped", "code": "USAGE_LIMIT", "message": "Limit."})
    assert not line.pause(SAFETY_CHECK_UNFINISHED, "The check couldn't finish.")
    # The stopped report's Resume is kept.
    assert (line.paused.code, line.paused.run_id) == ("USAGE_LIMIT", "run-1")

    waiting = ReportLine()
    waiting.add([Entry("T3", "Company 3", 1003, True)])
    assert waiting.pause(SAFETY_CHECK_STOPPED, "You stopped the safety check.")
    assert (waiting.paused.code, waiting.paused.message, waiting.paused.run_id) == (
        SAFETY_CHECK_STOPPED,
        "You stopped the safety check.",
        None,
    )
    back = ReportLine.loads(waiting.dumps())  # kept when Tearsheet closes
    assert back.paused.code == SAFETY_CHECK_STOPPED


# --- through the engine ---------------------------------------------------------------------


def _line_notes(h: Harness) -> list[dict]:
    return h.notes("line_changed")


async def _writing(h: Harness) -> dict:
    """The line's report once its run has started (after step 1)."""
    for _ in range(2000):
        found = [n["writing"] for n in _line_notes(h) if n["writing"] and n["writing"]["run_id"]]
        if found:
            return found[-1]
        await asyncio.sleep(0.005)
    raise AssertionError("the line's report never started")


def test_the_line_writes_each_report_in_turn(tmp_path, fake_list):
    h = Harness(tmp_path)

    async def go():
        await h.server.start()
        planned = await h.call("plan_line", {"queries": ["T1", "T2", "nope"]})
        nothing_yet = await h.call("get_line", {}, id_=2)
        added = await h.call("add_to_line", {"queries": ["T1", "T2"]}, id_=3)
        await h.server.wait_for_line()
        return planned, nothing_yet, added

    planned, nothing_yet, added = run(go())
    assert [i["ticker"] for i in planned["result"]["items"]] == ["T1", "T2"]
    assert planned["result"]["skipped"][0]["query"] == "nope"
    assert nothing_yet["result"]["waiting"] == [] and nothing_yet["result"]["writing"] is None
    assert [i["ticker"] for i in added["result"]["items"]] == ["T1", "T2"]
    ready = h.notes("report_ready")
    assert len(ready) == 2
    final = _line_notes(h)[-1]
    assert final["waiting"] == [] and final["writing"] is None and final["paused"] is None
    assert [(i["ticker"], i["outcome"]) for i in final["finished"]] == [
        ("T1", "ready"),
        ("T2", "ready"),
    ]
    assert [i["report_id"] for i in final["finished"]] == [r["report_id"] for r in ready]
    # One after another: T2's run started only once T1's report was ready.
    starts = [m for m in h.messages if m.get("method") == "progress" and m["params"]["step"] == 1]
    first_ready = next(k for k, m in enumerate(h.messages) if m.get("method") == "report_ready")
    second_start = [k for k, m in enumerate(h.messages) if m in starts][-1]
    assert second_start > first_ready
    # Each report being written is named, with its run.
    writing = [n["writing"] for n in _line_notes(h) if n["writing"] and n["writing"]["run_id"]]
    assert [w["ticker"] for w in writing] == ["T1", "T2"]
    # The line is kept in the settings table as it goes.
    kept = ReportLine.loads(config.Settings(h.server.db.conn).get(SETTING))
    assert kept.idle()
    h.server.close()


def test_a_company_that_isnt_found_at_step_1_is_marked_and_the_line_moves_on(tmp_path, monkeypatch):
    def with_extra() -> Holdings:
        rows = [
            *fake_holdings().rows,
            HoldingRow("ZZ", 999, "Not In The Fake Data", "Industrials", 1.0),
        ]
        return Holdings(date(2026, 11, 3), "bundled", rows)

    monkeypatch.setattr(membership, "load_bundled", with_extra)
    h = Harness(tmp_path)

    async def go():
        await h.server.start()
        await h.call("add_to_line", {"queries": ["ZZ", "T1"]})
        await h.server.wait_for_line()

    run(go())
    final = _line_notes(h)[-1]
    assert [(i["ticker"], i["outcome"], i["code"]) for i in final["finished"]] == [
        ("ZZ", "failed", "NOT_COVERED"),
        ("T1", "ready", None),
    ]
    assert final["paused"] is None
    h.server.close()


def test_a_usage_limit_pauses_the_line_and_resume_carries_on(tmp_path, fake_list, monkeypatch):
    from tests.test_replay import LoggedData

    monkeypatch.setattr(membership, "MIN_ROWS", 1)

    def limited(request):
        if request.task == "narrate":
            return AIUsageLimit("You've hit your limit. Resets 3am")
        return clean_ai(request)

    h = Harness(tmp_path, ai_default=limited)

    @asynccontextmanager
    async def logged(run_id, conn, rawstore):
        yield LoggedData(rawstore, run_id)

    h.server.data_factory = logged

    async def go():
        await h.server.start()
        await h.call("add_to_line", {"queries": ["T0", "T1"]})
        await h.server.wait_for_line()
        paused = _line_notes(h)[-1]
        h.ai_default = clean_ai
        resumed = await h.call("resume", {"run_id": paused["paused"]["run_id"]}, id_=2)
        await h.server.wait_for_line()
        return paused, resumed

    paused, resumed = run(go())
    assert paused["paused"]["code"] == "USAGE_LIMIT"
    assert [i["ticker"] for i in paused["waiting"]] == ["T1"]  # T1 never started
    assert [(i["ticker"], i["outcome"]) for i in paused["finished"]] == [("T0", "stopped")]
    assert resumed["result"]["ticker"] == "T0"
    final = _line_notes(h)[-1]
    assert final["paused"] is None and final["waiting"] == []
    assert [(i["ticker"], i["outcome"]) for i in final["finished"]] == [
        ("T0", "ready"),
        ("T1", "ready"),
    ]
    h.server.close()


def test_carry_on_goes_past_a_stopped_report(tmp_path, fake_list):
    def limited(request):
        if request.task == "narrate":
            return AIUsageLimit("You've hit your limit. Resets 3am")
        return clean_ai(request)

    h = Harness(tmp_path, ai_default=limited)

    async def go():
        await h.server.start()
        await h.call("add_to_line", {"queries": ["T0", "T1"]})
        await h.server.wait_for_line()
        h.ai_default = clean_ai
        await h.call("carry_on_line", {}, id_=2)
        await h.server.wait_for_line()

    run(go())
    final = _line_notes(h)[-1]
    assert [(i["ticker"], i["outcome"]) for i in final["finished"]] == [
        ("T0", "stopped"),
        ("T1", "ready"),
    ]
    h.server.close()


def test_cancel_run_stops_only_the_report_being_written(tmp_path, fake_list):
    h = Harness(tmp_path, delay_s=0.02)

    async def go():
        await h.server.start()
        await h.call("add_to_line", {"queries": ["T1", "T2"]})
        writing = await _writing(h)
        await h.call("cancel", {"run_id": writing["run_id"]}, id_=2)
        await h.server.wait_for_line()

    run(go())
    final = _line_notes(h)[-1]
    assert [(i["ticker"], i["outcome"]) for i in final["finished"]] == [
        ("T1", "cancelled"),
        ("T2", "ready"),
    ]
    h.server.close()


def test_cancel_all_stops_the_report_and_empties_the_line(tmp_path, fake_list):
    h = Harness(tmp_path, delay_s=0.02)

    async def go():
        await h.server.start()
        await h.call("add_to_line", {"queries": ["T1", "T2", "T3"]})
        await _writing(h)
        removed = await h.call("remove_from_line", {"ticker": "T3"}, id_=2)
        cleared = await h.call("clear_line", {}, id_=3)
        await h.server.wait_for_line()
        await h.finish()
        return removed, cleared

    removed, cleared = run(go())
    assert [i["ticker"] for i in removed["result"]["waiting"]] == ["T2"]
    assert {k: v for k, v in cleared["result"].items() if k != "typical"} == {
        "waiting": [],
        "writing": None,
        "finished": [],
        "paused": None,
    }
    assert h.notes("report_ready") == []  # T1 was stopped; T2 never started
    assert _line_notes(h)[-1]["finished"] == []
    h.server.close()


def test_the_line_waits_for_a_single_report_already_running(tmp_path, fake_list):
    h = Harness(tmp_path, delay_s=0.01)

    async def go():
        await h.server.start()
        h.server.line_poll_s = 0.01
        single = await h.call("run_report", {"query": "T4"})
        await h.call("add_to_line", {"queries": ["T1"]}, id_=2)
        await h.server.wait_for_line()
        return single

    single = run(go())
    ready = h.notes("report_ready")
    assert [r["run_id"] for r in ready][0] == single["result"]["run_id"]
    assert len(ready) == 2
    h.server.close()


def test_official_predictions_are_said_before_the_line_starts(tmp_path, fake_list):
    h = Harness(tmp_path, log_predictions=True)

    async def go():
        await h.server.start()
        await h.call("run_report", {"query": "T0"})
        await h.finish()
        return await h.call("plan_line", {"queries": ["T0", "T1"]}, id_=2)

    planned = run(go())
    assert [(i["ticker"], i["official"]) for i in planned["result"]["items"]] == [
        ("T0", False),  # rated in the last 30 days
        ("T1", True),
    ]
    h.server.close()


def test_a_line_left_when_tearsheet_closed_waits_to_be_carried_on(tmp_path, fake_list):
    first = Harness(tmp_path)
    left = ReportLine()
    left.add([Entry("T1", "Company 1", 1001, True)])
    config.Settings(first.server.db.conn).set_internal(SETTING, left.dumps())
    first.server.close()

    h = Harness(tmp_path)

    async def go():
        await h.server.start()
        reopened = await h.call("get_line", {})
        await h.server.wait_for_line()
        nothing_ran = h.notes("report_ready")
        await h.call("carry_on_line", {}, id_=2)
        await h.server.wait_for_line()
        return reopened, nothing_ran

    reopened, nothing_ran = run(go())
    assert reopened["result"]["paused"]["code"] == REOPENED
    assert nothing_ran == []
    assert [(i["ticker"], i["outcome"]) for i in _line_notes(h)[-1]["finished"]] == [
        ("T1", "ready")
    ]
    h.server.close()


def test_a_new_list_carries_on_a_line_left_from_last_time(tmp_path, fake_list):
    first = Harness(tmp_path)
    left = ReportLine()
    left.add([Entry("T1", "Company 1", 1001, True)])
    config.Settings(first.server.db.conn).set_internal(SETTING, left.dumps())
    first.server.close()
    h = Harness(tmp_path)

    async def go():
        await h.server.start()
        await h.call("add_to_line", {"queries": ["T2"]})
        await h.server.wait_for_line()

    run(go())
    final = _line_notes(h)[-1]
    assert [(i["ticker"], i["outcome"]) for i in final["finished"]] == [
        ("T1", "ready"),
        ("T2", "ready"),
    ]
    h.server.close()


def test_a_new_list_waits_behind_a_usage_limit(tmp_path, fake_list):
    def limited(request):
        if request.task == "narrate":
            return AIUsageLimit("You've hit your limit. Resets 3am")
        return clean_ai(request)

    h = Harness(tmp_path, ai_default=limited)

    async def go():
        await h.server.start()
        await h.call("add_to_line", {"queries": ["T0"]})
        await h.server.wait_for_line()
        await h.call("add_to_line", {"queries": ["T1"]}, id_=2)
        await h.server.wait_for_line()

    run(go())
    final = _line_notes(h)[-1]
    assert final["paused"]["code"] == "USAGE_LIMIT"
    assert [i["ticker"] for i in final["waiting"]] == ["T1"]
    assert len(h.notes("report_ready")) == 1  # T0's report so far; T1 never started
    h.server.close()


def test_no_ai_tool_pauses_the_line(tmp_path, fake_list):
    from tearsheet.server import EngineError

    h = Harness(tmp_path)

    def no_tool(conn, tool):
        raise EngineError("NO_TOOL", "Connect Claude Code or Codex first.")

    h.server.ai_factory = no_tool

    async def go():
        await h.server.start()
        await h.call("add_to_line", {"queries": ["T1", "T2"]})
        await h.server.wait_for_line()

    run(go())
    final = _line_notes(h)[-1]
    assert final["paused"]["code"] == "NO_TOOL" and final["paused"]["run_id"] is None
    assert [i["ticker"] for i in final["waiting"]] == ["T2"]
    h.server.close()


# --- usage limits and the 80% rule, through the engine ---------------------------------------


async def _settle(h: Harness) -> None:
    """Until the line has nothing more to do by itself: no report to start, no wait to end."""
    for _ in range(200):
        await h.server.wait_for_line()
        wake = h.server.line_wake
        if wake is not None and not wake.done():
            await asyncio.wait({wake})
        elif h.server.line_job is None or h.server.line_job.done():
            return
    raise AssertionError("the line never settled")


def _fast_clock(h: Harness, then=None) -> list[datetime]:
    """A clock the line's waits move on, instead of sleeping; `then` runs once a wait starts."""
    clock = [NOW]
    h.server.now = lambda: clock[0]

    async def sleep(seconds: float) -> None:
        clock[0] += timedelta(seconds=seconds)
        if then is not None:
            then()
        await asyncio.sleep(0)

    h.server.line_sleep = sleep
    return clock


def _with_usage(info: dict):
    """The fake AI's clean answers, each with this usage reading from the tool."""

    def ai(request):
        out = clean_ai(request)
        return dataclasses.replace(out, rate_limit=info) if isinstance(out, RawAnswer) else out

    return ai


def test_a_usage_limit_waits_for_the_reset_then_resumes_by_itself(tmp_path, fake_list, monkeypatch):
    from tests.test_replay import LoggedData

    monkeypatch.setattr(membership, "MIN_ROWS", 1)
    reset = "2026-11-05T03:00:00+00:00"

    def limited(request):
        if request.task == "narrate":
            return AIUsageLimit("Your plan's usage limit is reached.", reset_at=reset)
        return clean_ai(request)

    h = Harness(tmp_path, ai_default=limited)

    @asynccontextmanager
    async def logged(run_id, conn, rawstore):
        yield LoggedData(rawstore, run_id)

    h.server.data_factory = logged

    def limit_over():
        h.ai_default = clean_ai

    clock = _fast_clock(h, limit_over)

    async def go():
        await h.server.start()
        await h.call("add_to_line", {"queries": ["T0", "T1"]})
        await _settle(h)

    run(go())
    paused = next(n for n in _line_notes(h) if n["paused"])
    assert paused["paused"]["code"] == "USAGE_LIMIT"
    assert paused["paused"]["wait_until"] == "2026-11-05T03:02:00+00:00"
    assert clock[0] >= datetime(2026, 11, 5, 3, 2, tzinfo=UTC)
    final = _line_notes(h)[-1]
    assert final["paused"] is None and final["waiting"] == []
    assert [(i["ticker"], i["outcome"]) for i in final["finished"]] == [
        ("T0", "ready"),
        ("T1", "ready"),
    ]
    # T0 was resumed, not started again.
    assert final["finished"][0]["run_id"] == paused["paused"]["run_id"]
    h.server.close()


def test_a_real_problem_still_waits_for_liam(tmp_path, fake_list):
    from tearsheet.ai.client import AIAuthError

    def signed_out(request):
        if request.task == "narrate":
            return AIAuthError("Sign in again.", fix="fake login")
        return clean_ai(request)

    h = Harness(tmp_path, ai_default=signed_out)
    _fast_clock(h)

    async def go():
        await h.server.start()
        await h.call("add_to_line", {"queries": ["T0", "T1"]})
        await _settle(h)

    run(go())
    final = _line_notes(h)[-1]
    assert final["paused"]["code"] == "AUTH_EXPIRED" and final["paused"]["wait_until"] is None
    assert h.server.line_wake is None
    assert [i["ticker"] for i in final["waiting"]] == ["T1"]
    h.server.close()


def test_past_80_percent_of_the_5_hour_window_the_line_waits_then_goes_on(tmp_path, fake_list):
    reset = int((NOW + timedelta(hours=1)).timestamp())
    h = Harness(
        tmp_path,
        ai_default=_with_usage(
            {
                "status": "allowed_warning",
                "type": "five_hour",
                "utilization": 0.9,
                "resets_at": reset,
            }
        ),
    )

    def window_reset():
        h.ai_default = clean_ai

    _fast_clock(h, window_reset)

    async def go():
        await h.server.start()
        await h.call("add_to_line", {"queries": ["T0", "T1"]})
        await _settle(h)

    run(go())
    pauses = [n["paused"] for n in _line_notes(h) if n["paused"]]
    assert [p["code"] for p in pauses] == [USAGE_HIGH]
    assert pauses[0]["used"] == 0.9 and pauses[0]["run_id"] is None
    assert pauses[0]["wait_until"] == "2026-11-05T02:02:00+00:00"
    final = _line_notes(h)[-1]
    assert [(i["ticker"], i["outcome"]) for i in final["finished"]] == [
        ("T0", "ready"),
        ("T1", "ready"),
    ]
    h.server.close()


def test_past_80_percent_of_the_week_the_line_asks_then_doesnt_ask_again(tmp_path, fake_list):
    reset = int((NOW + timedelta(days=3)).timestamp())
    h = Harness(
        tmp_path,
        ai_default=_with_usage(
            {
                "status": "allowed_warning",
                "type": "seven_day",
                "utilization": 0.85,
                "resets_at": reset,
            }
        ),
    )
    _fast_clock(h)

    async def go():
        await h.server.start()
        await h.call("add_to_line", {"queries": ["T0", "T1", "T2"]})
        await _settle(h)
        asked = _line_notes(h)[-1]
        await h.call("carry_on_line", {}, id_=2)
        await _settle(h)
        return asked

    asked = run(go())
    assert asked["paused"]["code"] == USAGE_WEEK and asked["paused"]["wait_until"] is None
    assert asked["paused"]["used"] == 0.85
    assert [i["ticker"] for i in asked["waiting"]] == ["T1", "T2"]
    final = _line_notes(h)[-1]
    assert final["paused"] is None
    assert [(i["ticker"], i["outcome"]) for i in final["finished"]] == [
        ("T0", "ready"),
        ("T1", "ready"),
        ("T2", "ready"),
    ]
    h.server.close()


def test_cancel_all_ends_a_wait(tmp_path, fake_list):
    def limited(request):
        if request.task == "narrate":
            return AIUsageLimit("Your plan's usage limit is reached.")
        return clean_ai(request)

    h = Harness(tmp_path, ai_default=limited)

    async def go():
        await h.server.start()
        await h.call("add_to_line", {"queries": ["T0", "T1"]})
        await h.server.wait_for_line()
        wake = h.server.line_wake
        assert wake is not None and not wake.done()
        await h.call("clear_line", {}, id_=2)
        await asyncio.sleep(0)
        return wake

    wake = run(go())
    assert wake.cancelled() and h.server.line_wake is None
    assert _line_notes(h)[-1]["paused"] is None
    h.server.close()


# --- the quick adds and the 30-day skip, through the engine --------------------------------------


def test_quick_adds_the_whole_list_a_sector_or_the_rest(tmp_path, fake_list):
    h = Harness(tmp_path)

    async def go():
        await h.server.start()
        before = await h.call("line_groups", {})
        await h.call("run_report", {"query": "T0"}, id_=2)
        await h.finish()
        after = await h.call("line_groups", {}, id_=3)
        everything = await h.call("plan_line", {"group": "all"}, id_=4)
        sector = await h.call("plan_line", {"group": "sector", "sector": "Utilities"}, id_=5)
        rest = await h.call("plan_line", {"group": "rest", "queries": ["T1"]}, id_=6)
        fresh = await h.call("plan_line", {"group": "all", "skip_recent": True}, id_=7)
        nowhere = await h.call("plan_line", {"group": "sector", "sector": "Nowhere"}, id_=8)
        return before, after, everything, sector, rest, fresh, nowhere

    before, after, everything, sector, rest, fresh, nowhere = run(go())
    assert before["result"] == {
        "all": 20,
        "rest": 20,
        "sectors": [{"name": "Industrials", "count": 10}, {"name": "Utilities", "count": 10}],
    }
    assert after["result"]["rest"] == 19  # T0 has a finished report now
    assert [i["ticker"] for i in everything["result"]["items"]] == [f"T{i}" for i in range(20)]
    assert [i["ticker"] for i in sector["result"]["items"]] == [f"T{i}" for i in range(10, 20)]
    tickers = [i["ticker"] for i in rest["result"]["items"]]
    assert "T0" not in tickers and len(tickers) == 19
    assert rest["result"]["skipped"] == [
        {"query": "T1", "reason": "T1 is listed twice.", "kind": "twice"}
    ]
    assert len(fresh["result"]["items"]) == 19
    assert [(s["query"], s["kind"]) for s in fresh["result"]["skipped"]] == [("T0", "recent")]
    assert "Nowhere" in nowhere["error"]["message"]
    # A typical report, once a few have finished, rides along with the line.
    assert everything["result"]["line"]["typical"] is None
    h.server.close()


def test_carry_on_after_a_report_that_couldnt_start_writes_that_company_too():
    # No AI tool connected, or SEC blocked: Liam fixes it and presses Carry on.
    for code in ("NO_TOOL", "SEC_BLOCKED", "AUTH_EXPIRED"):
        line = ReportLine()
        line.add([Entry("T1", "Company 1", 1001, True), Entry("T2", "Company 2", 1002, True)])
        line.end(line.take_next(), {"how": "failed", "code": code}, now=NOW)
        assert line.paused is not None and line.paused.run_id is None
        line.carry_on(NOW)
        assert line.paused is None
        assert [e.ticker for e in line.waiting] == ["T1", "T2"] and line.finished == []


def test_carry_on_past_a_stopped_report_still_leaves_it_behind():
    line = ReportLine()
    line.add([Entry("T1", "Company 1", 1001, True), Entry("T2", "Company 2", 1002, True)])
    first = line.take_next()
    first.run_id = "run-1"
    line.end(first, {"how": "stopped", "code": "AUTH_EXPIRED"}, now=NOW)
    line.carry_on(NOW)
    assert [e.ticker for e in line.waiting] == ["T2"]
    assert [e.ticker for e in line.finished] == ["T1"]


def test_a_low_model_only_weekly_window_does_not_hide_a_full_one():
    got = usage_readings(
        [
            {"status": "allowed_warning", "type": "seven_day", "utilization": 0.85},
            {"status": "allowed", "type": "seven_day_opus", "utilization": 0.1},
        ]
    )
    assert got["week"].used == 0.85 and got["week"].high()
    # A later reading of the same window still replaces the earlier one.
    got = usage_readings(
        [
            {"status": "allowed_warning", "type": "seven_day", "utilization": 0.85},
            {"status": "allowed", "type": "seven_day", "utilization": 0.2},
        ]
    )
    assert got["week"].used == 0.2


def test_reset_times_that_cant_be_dates_are_unreadable_not_a_crash():
    for text in ("Nov 31, 3pm", "Feb 30, 1am"):
        assert reset_moment(text, NOW, local=LA) is None


def test_a_reset_clock_time_across_a_clock_change_keeps_its_wall_time(monkeypatch):
    # The Mac's own zone (no zone given): 1 Nov 2026 ends summer time in Los Angeles, so "3am"
    # the next morning is 11:00 UTC, not the 10:00 a fixed summer-time offset gave.
    import time

    monkeypatch.setenv("TZ", "America/Los_Angeles")
    time.tzset()
    try:
        before = datetime(2026, 11, 1, 6, 0, tzinfo=UTC)  # 11pm on 31 Oct, summer time
        assert reset_moment("3am", before) == datetime(2026, 11, 1, 11, 0, tzinfo=UTC)
    finally:
        monkeypatch.undo()
        time.tzset()


def test_no_internet_pauses_the_line_and_writes_those_companies_again():
    line = _line_of(4)
    for _ in range(2):
        line.end(
            line.take_next(), {"how": "failed", "code": "ENGINE_ERROR", "connection": True}, now=NOW
        )
    assert line.paused is not None and line.paused.code == "OFFLINE"
    assert line.paused.wait_until == (NOW + timedelta(minutes=15)).isoformat()
    assert [e.ticker for e in line.waiting] == ["T2", "T3"]
    assert line.wake() is None and line.paused is None
    assert [e.ticker for e in line.waiting] == ["T0", "T1", "T2", "T3"]
    assert line.finished == [] and line.waiting[0].code is None


def test_one_report_that_couldnt_connect_doesnt_pause_the_line():
    line = _line_of(3)
    line.end(
        line.take_next(), {"how": "failed", "code": "ENGINE_ERROR", "connection": True}, now=NOW
    )
    line.end(line.take_next(), {"how": "ready"}, now=NOW)
    line.end(
        line.take_next(), {"how": "failed", "code": "ENGINE_ERROR", "connection": True}, now=NOW
    )
    assert line.paused is None


def test_no_internet_through_the_engine_pauses_instead_of_failing_every_company(
    tmp_path, fake_list
):
    from tearsheet.http import HTTPFailure
    from tests.test_pipeline import FakeData

    class Down(FakeData):
        async def sec_tickers(self):
            raise HTTPFailure("sec", "https://www.sec.gov/files/company_tickers.json", "no answer")

    h = Harness(tmp_path, data_cls=Down)

    async def go():
        await h.server.start()
        await h.call("add_to_line", {"queries": [f"T{i}" for i in range(1, 6)]})
        await h.server.wait_for_line()

    run(go())
    final = _line_notes(h)[-1]
    assert final["paused"]["code"] == "OFFLINE" and final["paused"]["wait_until"]
    assert [i["ticker"] for i in final["waiting"]] == ["T3", "T4", "T5"]
    assert [(i["ticker"], i["code"]) for i in final["finished"]] == [
        ("T1", "OFFLINE"),
        ("T2", "OFFLINE"),
    ]
    h.server.close()
