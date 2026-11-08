"""The line: several reports, one after another (batch.py and the server's line methods).

Every run here uses the fake companies T0, T1, … and the fake AI tool; nothing is fetched live.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import date

import pytest

from tearsheet import config
from tearsheet.ai.client import AIUsageLimit
from tearsheet.batch import MAX_WAITING, REOPENED, SETTING, Entry, ReportLine
from tearsheet.data import membership
from tearsheet.data.membership import HoldingRow, Holdings
from tearsheet.db import open_database
from tests.test_pipeline import NOW, N, clean_ai
from tests.test_protocol import Harness, run


def fake_holdings() -> Holdings:
    rows = [
        HoldingRow(f"T{i}", 1000 + i, f"Company {i}", "Industrials", float(100 - i))
        for i in range(N)
    ]
    return Holdings(date(2026, 11, 3), "bundled", rows)


@pytest.fixture
def fake_list(monkeypatch):
    """The look-up list is the fake companies', as the fake data's step 1 sees them."""
    monkeypatch.setattr(membership, "load_bundled", fake_holdings)


def plan(line: ReportLine, queries: list[str], conn):
    holdings = fake_holdings()
    return line.plan(
        queries,
        holdings=holdings,
        tickers={r.ticker: r.cik for r in holdings.rows},
        aliases={"widgets": 1003},
        conn=conn,
        now=NOW,
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


def test_plan_keeps_to_the_limit(tmp_path):
    db = open_database(tmp_path / "t.sqlite")
    line = ReportLine()
    line.waiting = [Entry(f"T{i}", f"Company {i}", 1000 + i, True) for i in range(MAX_WAITING - 1)]
    entries, skipped = plan(line, ["T15", "T16"], db.conn)
    assert [e.ticker for e in entries] == ["T15"]
    assert skipped[0].query == "T16" and f"holds {MAX_WAITING} at a time" in skipped[0].reason
    db.close()


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
    assert cleared["result"] == {
        "waiting": [],
        "writing": None,
        "finished": [],
        "paused": None,
        "limit": MAX_WAITING,
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
