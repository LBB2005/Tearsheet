"""The Watchlist's Write takes in the engine: start_take_line writes a take on each company in
turn, waits for any report and for the report line, pauses as the report line does, and Cancel
all stops the take under way."""

from __future__ import annotations

import asyncio

from tearsheet.ai.client import AIUsageLimit
from tearsheet.batch import Entry
from tearsheet.protocol import LinePlan, LineState
from tests.test_batch import fake_list  # noqa: F401 - the look-up list is the fake companies'
from tests.test_protocol import Harness, run
from tests.test_server_dig import T0, with_fake_sources
from tests.test_server_take import with_ai

T1 = 1001


def harness(tmp_path, **kw) -> Harness:
    h = Harness(tmp_path, log_predictions=True, **kw)
    with_fake_sources(h)
    h.server.line_poll_s = 0.01
    return h


async def two_reports(h: Harness) -> None:
    await h.server.start()
    for n, query in enumerate(("T0", "T1"), start=100):
        await h.call("run_report", {"query": query}, id_=n)
        await h.finish()


def line_notes(h: Harness) -> list[dict]:
    return h.notes("take_line_changed")


def test_the_take_line_writes_a_take_on_each_company_in_turn(tmp_path):
    h = harness(tmp_path)
    with_ai(h)

    async def go():
        await two_reports(h)
        started = await h.call("start_take_line", {"ciks": [T0, T1, 999]}, id_=2)
        await h.server.wait_for_take_line()
        now = await h.call("get_take_line", {}, id_=3)
        return started, now

    started, now = run(go())
    plan = LinePlan.model_validate(started["result"])
    assert [i.ticker for i in plan.items] == ["T0", "T1"]
    assert [(s.query, s.kind) for s in plan.skipped] == [("999", "no_report")]
    state = LineState.model_validate(now["result"])
    assert [(i.ticker, i.outcome) for i in state.finished] == [("T0", "ready"), ("T1", "ready")]
    assert state.waiting == [] and state.writing is None and state.paused is None
    assert [n["saved"] for n in h.notes("take_done")] == [True, True]
    assert line_notes(h)
    assert h.server.db.conn.execute("SELECT COUNT(*) FROM dig_takes").fetchone()[0] == 2
    h.server.close()


def test_takes_wait_for_a_running_report(tmp_path):
    h = harness(tmp_path, delay_s=0.2)
    with_ai(h)

    async def go():
        await two_reports(h)
        await h.call("run_report", {"query": "T0"}, id_=2)
        await h.call("start_take_line", {"ciks": [T1]}, id_=3)
        await asyncio.sleep(0.05)
        during = list(h.notes("take_progress"))
        await h.finish()
        await h.server.wait_for_take_line()
        return during

    during = run(go())
    assert during == []
    assert h.notes("take_done")[0]["saved"] is True
    h.server.close()


def test_takes_wait_while_the_report_line_is_going(tmp_path):
    h = harness(tmp_path)
    with_ai(h)

    async def go():
        await two_reports(h)
        h.server.line.add([Entry("T1", "Company 1", T1, True)])  # waiting, not started
        await h.call("start_take_line", {"ciks": [T0]}, id_=2)
        await asyncio.sleep(0.1)
        during = list(h.notes("take_progress"))
        h.server.line.clear()
        await h.server.wait_for_take_line()
        return during

    during = run(go())
    assert during == []
    assert h.notes("take_done")[0]["saved"] is True
    h.server.close()


def test_a_usage_limit_pauses_the_take_line_until_it_resets(tmp_path):
    h = harness(tmp_path)
    with_ai(h, [AIUsageLimit("Usage limit reached.", reset_at="2026-11-18T03:00:00Z")])

    async def go():
        await two_reports(h)
        await h.call("start_take_line", {"ciks": [T0, T1]}, id_=2)
        await h.server.wait_for_take_line()
        return await h.call("get_take_line", {}, id_=3)

    state = LineState.model_validate(run(go())["result"])
    assert state.paused is not None and state.paused.code == "USAGE_LIMIT"
    assert state.paused.wait_until is not None
    assert [i.ticker for i in state.waiting] == ["T1"]
    assert len(h.notes("take_done")) == 1
    h.server.close()


def test_cancel_all_stops_the_take_under_way_and_starts_no_more(tmp_path):
    h = harness(tmp_path)
    with_ai(h, delay_s=5.0)

    async def go():
        await two_reports(h)
        await h.call("start_take_line", {"ciks": [T0, T1]}, id_=2)
        for _ in range(500):
            if any(n["step"] == "writing" for n in h.notes("take_progress")):
                break
            await asyncio.sleep(0.01)
        removed = await h.call("remove_from_take_line", {"ticker": "T1"}, id_=3)
        cleared = await h.call("clear_take_line", {}, id_=4)
        await h.server.wait_for_take()
        await h.server.wait_for_take_line()
        return removed, cleared

    removed, cleared = run(go())
    assert removed["result"]["waiting"] == []
    assert cleared["result"]["writing"] is None and cleared["result"]["waiting"] == []
    done = h.notes("take_done")
    assert [(n["cik"], n["code"]) for n in done] == [(T0, "CANCELLED")]
    assert h.server.db.conn.execute("SELECT COUNT(*) FROM dig_takes").fetchone()[0] == 0
    h.server.close()


def test_the_watchlist_rows_show_each_companys_take_and_its_place_in_the_line(tmp_path, fake_list):  # noqa: F811
    h = harness(tmp_path)
    with_ai(h)

    async def go():
        await two_reports(h)
        await h.call("add_to_watchlist", {"queries": ["T0", "T1"]}, id_=2)
        await h.call("write_take", {"cik": T0}, id_=3)
        await h.server.wait_for_take()
        h.server.take_line.add([Entry("T1", "Company 1", T1, False)])
        return await h.call("get_watchlist", {}, id_=4)

    page = run(go())["result"]
    rows = {r["ticker"]: r for r in page["rows"]}
    assert rows["T0"]["take_at"] is not None and rows["T0"]["take_queued"] is None
    assert rows["T1"]["take_at"] is None and rows["T1"]["take_queued"] == "waiting"
    h.server.close()
