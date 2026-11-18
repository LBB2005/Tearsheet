"""Dig deeper's AI take in the engine: write_take starts one take at a time in its own job,
refreshes a stale snapshot first, notes its steps, and saves the take; a take and a report (or
the safety check) never run at once; cancel and a usage limit end it with nothing saved."""

from __future__ import annotations

import asyncio

from tearsheet import config
from tearsheet.ai.client import AIClient, AIUsageLimit, ToolState
from tearsheet.ai.schemas import SkepticReport, TakeDraft
from tearsheet.data.analystdb import BASE_URL
from tearsheet.protocol import TakeList
from tests.fakes.ai import FakeConnector, answer
from tests.test_protocol import Harness, run
from tests.test_server_dig import T0, counts, with_fake_sources
from tests.test_server_lookups import _one_report


def plain_draft() -> TakeDraft:
    one = [{"text": "It sells things.", "citations": ["dig:today#p1"], "stance": "neutral"}]
    return TakeDraft.model_validate(
        {
            "answers": [
                {"question": q, "sentences": one}
                for q in ("business", "price", "risks", "backdrop", "sell")
            ],
            "check_first": one,
            "proven_wrong": one,
        }
    )


def with_ai(h: Harness, script=None, *, delay_s: float = 0.0) -> list[AIClient]:
    made: list[AIClient] = []
    script = (
        script
        if script is not None
        else [answer(plain_draft()), answer(SkepticReport(findings=[]))]
    )

    def factory(conn, tool):
        state = ToolState(conn, "claude")
        state.record_check(version="1.0", model_ids=["fake"], form="full", passed=True)
        client = AIClient(
            FakeConnector(list(script), delay_s=delay_s),
            state,
            retry_wait_s=0,
            budget=config.TAKE_CALL_BUDGET,
        )
        made.append(client)
        return client

    h.server.take_ai_factory = factory
    h.server.checker_factory = lambda conn, ai: None
    return made


def harness(tmp_path, **kw) -> Harness:
    h = Harness(tmp_path, log_predictions=True, **kw)
    with_fake_sources(h)
    return h


def code_of(reply: dict) -> str:
    return reply["error"]["data"]["code"]


def test_a_take_refreshes_writes_checks_and_saves(tmp_path):
    h = harness(tmp_path)
    clients = with_ai(h)

    async def go():
        await _one_report(h)
        before = counts(h)
        started = await h.call("write_take", {"cik": T0}, id_=2)
        await h.server.wait_for_take()
        listed = await h.call("list_takes", {"cik": T0}, id_=3)
        return before, started, listed

    before, started, listed = run(go())
    take_id = started["result"]["take_id"]
    assert started["result"] == {"take_id": take_id, "cik": T0}
    assert [n["step"] for n in h.notes("take_progress")] == [
        "refreshing",
        "writing",
        "checking",
        "saving",
    ]
    assert h.notes("take_done") == [
        {
            "take_id": take_id,
            "cik": T0,
            "saved": True,
            "code": None,
            "message": None,
            "reset_at": None,
        }
    ]
    page = TakeList.model_validate(listed["result"])
    assert [t.take_id for t in page.takes] == [take_id]
    assert page.running is None and page.blocked is None
    assert page.takes[0].answers[0].sentences[0].text == "It sells things."
    assert counts(h) == before
    assert clients[0].budget == config.TAKE_CALL_BUDGET
    h.server.close()


def test_a_fresh_snapshot_is_used_as_it_is(tmp_path):
    h = harness(tmp_path)
    with_ai(h)

    async def go():
        await _one_report(h)
        await h.call("refresh_dig_deeper", {"cik": T0}, id_=2)
        await h.call("write_take", {"cik": T0}, id_=3)
        await h.server.wait_for_take()

    run(go())
    assert [n["step"] for n in h.notes("take_progress")][0] == "writing"
    assert h.server.db.conn.execute("SELECT COUNT(*) FROM dig_snapshots").fetchone()[0] == 1
    h.server.close()


def test_the_analyst_answers_are_stored_before_the_ai_is_called(tmp_path):
    h = harness(tmp_path)
    seen: list[int] = []

    def draft_after_checking(request):
        snapshot_id = h.server.db.conn.execute(
            "SELECT snapshot_id FROM dig_snapshots ORDER BY created_at DESC LIMIT 1"
        ).fetchone()[0]
        stored = h.server.db.conn.execute(
            "SELECT COUNT(*) FROM fetch_log WHERE run_id = ? AND provider = 'analystdb'"
            " AND request_key LIKE ?",
            (snapshot_id, f"{BASE_URL}%"),
        ).fetchone()[0]
        seen.append(stored)
        return answer(plain_draft())

    with_ai(h, [draft_after_checking, answer(SkepticReport(findings=[]))])

    async def go():
        await _one_report(h)
        await h.call("write_take", {"cik": T0}, id_=2)
        await h.server.wait_for_take()

    run(go())
    assert seen and seen[0] >= 1
    assert h.notes("take_done")[0]["saved"] is True
    h.server.close()


def test_a_report_and_the_safety_check_refuse_while_a_take_runs(tmp_path):
    h = harness(tmp_path)
    with_ai(h, delay_s=0.3)

    async def go():
        await _one_report(h)
        await h.call("write_take", {"cik": T0}, id_=2)
        report = await h.call("run_report", {"query": "T0"}, id_=3)
        resume = await h.call("resume", {"run_id": "run-x"}, id_=4)
        safety = await h.call("run_safety_check", {"tool": "claude"}, id_=5)
        busy = h.server._something_running()
        await h.server.wait_for_take()
        return report, resume, safety, busy

    report, resume, safety, busy = run(go())
    assert code_of(report) == "TAKE_IN_PROGRESS"
    assert code_of(resume) == "TAKE_IN_PROGRESS"
    assert code_of(safety) == "TAKE_IN_PROGRESS"
    assert busy  # so the line's next report waits
    h.server.close()


def test_a_take_refuses_while_a_report_runs(tmp_path):
    h = harness(tmp_path, delay_s=0.3)
    with_ai(h)

    async def go():
        await _one_report(h)
        await h.call("run_report", {"query": "T0"}, id_=2)
        refused = await h.call("write_take", {"cik": T0}, id_=3)
        listed = await h.call("list_takes", {"cik": T0}, id_=4)
        await h.finish()
        return refused, listed

    refused, listed = run(go())
    assert code_of(refused) == "RUN_IN_PROGRESS"
    assert (
        listed["result"]["blocked"] == "A report is running. You can write the take when it’s done."
    )
    assert not h.notes("take_progress")
    h.server.close()


def test_one_take_at_a_time(tmp_path):
    h = harness(tmp_path)
    with_ai(h, delay_s=0.3)

    async def go():
        await _one_report(h)
        first = await h.call("write_take", {"cik": T0}, id_=2)
        again = await h.call("write_take", {"cik": T0}, id_=3)
        other = await h.call("write_take", {"cik": 999}, id_=4)
        mine = await h.call("list_takes", {"cik": T0}, id_=5)
        theirs = await h.call("list_takes", {"cik": 999}, id_=6)
        await h.server.wait_for_take()
        return first, again, other, mine, theirs

    first, again, other, mine, theirs = run(go())
    assert again["result"] == first["result"]
    assert code_of(other) == "TAKE_IN_PROGRESS"
    assert "writing a take on T0" in other["error"]["message"]
    assert mine["result"]["running"]["take_id"] == first["result"]["take_id"]
    assert mine["result"]["blocked"] is None
    assert theirs["result"]["blocked"] == "Dig deeper needs a report on this company first."
    assert len(h.notes("take_done")) == 1
    h.server.close()


def test_cancel_ends_the_take_with_nothing_saved(tmp_path):
    h = harness(tmp_path)
    with_ai(h, delay_s=5.0)

    async def go():
        await _one_report(h)
        await h.call("write_take", {"cik": T0}, id_=2)
        for _ in range(500):
            if h.notes("take_progress") and h.notes("take_progress")[-1]["step"] == "writing":
                break
            await asyncio.sleep(0.01)
        cancelled = await h.call("cancel_take", {"cik": T0}, id_=3)
        await h.server.wait_for_take()
        return cancelled

    cancelled = run(go())
    assert cancelled["result"] == {"ok": True}
    done = h.notes("take_done")[0]
    assert (done["saved"], done["code"]) == (False, "CANCELLED")
    assert h.server.db.conn.execute("SELECT COUNT(*) FROM dig_takes").fetchone()[0] == 0
    h.server.close()


def test_a_usage_limit_ends_the_take_with_its_reset_time(tmp_path):
    h = harness(tmp_path)
    with_ai(h, [AIUsageLimit("Usage limit reached.", reset_at="2026-11-18T03:00:00Z")])

    async def go():
        await _one_report(h)
        await h.call("write_take", {"cik": T0}, id_=2)
        await h.server.wait_for_take()

    run(go())
    done = h.notes("take_done")[0]
    assert (done["saved"], done["code"], done["reset_at"]) == (
        False,
        "USAGE_LIMIT",
        "2026-11-18T03:00:00Z",
    )
    assert h.server.db.conn.execute("SELECT COUNT(*) FROM dig_takes").fetchone()[0] == 0
    h.server.close()


def test_no_report_and_no_tool_are_refused(tmp_path):
    h = harness(tmp_path)

    async def go():
        await _one_report(h)
        none = await h.call("write_take", {"cik": 999}, id_=2)
        no_tool = await h.call("write_take", {"cik": T0}, id_=3)  # the live factory: no tool
        return none, no_tool

    none, no_tool = run(go())
    assert code_of(none) == "NO_REPORT"
    assert code_of(no_tool) == "NO_TOOL"
    h.server.close()


def test_a_test_copy_writes_no_take(tmp_path, monkeypatch):
    h = harness(tmp_path)
    clients = with_ai(h)

    async def go():
        await _one_report(h)
        monkeypatch.setenv(config.TEST_TOOLS_ENV, str(tmp_path / "tools"))
        await h.call("write_take", {"cik": T0}, id_=2)
        await h.server.wait_for_take()

    run(go())
    done = h.notes("take_done")[0]
    assert (done["saved"], done["code"]) == (False, "TEST_COPY")
    assert done["message"] == "AI takes are off in a test copy."
    assert not clients
    h.server.close()
