"""Jobs beside the request loop: grading answers off the loop, so look-ups and settings answer
while it fetches prices, and no run starts while it goes; and the order of a stopped run's notes."""

from __future__ import annotations

import asyncio
import json

from tearsheet.ai.client import AIUsageLimit
from tests.test_pipeline import clean_ai
from tests.test_protocol import Harness, run


def _slow_grading(monkeypatch, calls: list[str], busy):
    import tearsheet.grading as grading

    gate: dict[str, asyncio.Event] = {}

    async def slow(conn, data, rules, *, now, backup_dir):
        calls.append("busy" if busy() else "free")
        await gate["open"].wait()
        return {"graded": 2}

    monkeypatch.setattr(grading, "grade_job", slow)
    return gate


def _send(h: Harness, id_: int, method: str, params: dict | None = None):
    return h.server.handle(
        json.dumps({"jsonrpc": "2.0", "id": id_, "method": method, "params": params or {}})
    )


def test_look_ups_answer_while_grading_and_runs_wait_for_it(tmp_path, monkeypatch):
    h = Harness(tmp_path)
    calls: list[str] = []
    gate = _slow_grading(monkeypatch, calls, h.server._busy)

    async def go():
        gate["open"] = asyncio.Event()
        await h.server.start()
        await _send(h, 1, "grade_due")
        await asyncio.sleep(0.01)
        pending = [m for m in h.messages if m.get("id") == 1]
        hit = await h.call("search_companies", {"query": "nvda"}, id_=2)
        settings = await h.call("get_settings", {}, id_=3)
        refused = {
            method: await h.call(method, params, id_=i)
            for i, (method, params) in enumerate(
                [
                    ("run_report", {"query": "T0"}),
                    ("resume", {"run_id": "run-x"}),
                    ("run_safety_check", {"tool": "claude"}),
                    ("fetch_history", {"report_id": "rep-x"}),
                ],
                start=4,
            )
        }
        gate["open"].set()
        await h.server.wait_for_grading()
        graded = [m for m in h.messages if m.get("id") == 1]
        after = await h.call("run_report", {"query": "T0"}, id_=9)
        await h.finish()
        return pending, hit, settings, refused, graded, after

    pending, hit, settings, refused, graded, after = run(go())
    assert pending == []  # grading was still going
    assert hit["result"][0]["ticker"] == "NVDA"
    assert "keys" in settings["result"]
    for method, reply in refused.items():
        assert reply["error"]["data"]["code"] == "GRADING_IN_PROGRESS", method
        assert "grading" in reply["error"]["message"].lower()
    assert graded == [{"jsonrpc": "2.0", "id": 1, "result": {"graded": 2}}]
    assert after["result"]["ticker"] == "T0"  # runs start again once grading is done
    h.server.close()


def test_grading_asked_for_during_a_run_waits_for_it_off_the_loop(tmp_path, monkeypatch):
    h = Harness(tmp_path, delay_s=0.02)  # a run slow enough to still be going
    calls: list[str] = []
    gate = _slow_grading(monkeypatch, calls, h.server._busy)

    async def go():
        gate["open"] = asyncio.Event()
        gate["open"].set()
        await h.server.start()
        await h.call("run_report", {"query": "T0"})
        await _send(h, 2, "grade_due")
        hit = await h.call("search_companies", {"query": "nvda"}, id_=3)
        running = h.server._busy()
        await h.finish()
        await h.server.wait_for_grading()
        return hit, running

    hit, running = run(go())
    assert running and hit["result"][0]["ticker"] == "NVDA"  # answered while the run went on
    assert calls == ["free"]  # grading began only after the run
    assert next(m for m in h.messages if m.get("id") == 2)["result"] == {"graded": 2}
    h.server.close()


def test_a_second_grade_due_shares_the_grading_under_way(tmp_path, monkeypatch):
    h = Harness(tmp_path)
    calls: list[str] = []
    gate = _slow_grading(monkeypatch, calls, h.server._busy)

    async def go():
        gate["open"] = asyncio.Event()
        await h.server.start()
        await _send(h, 1, "grade_due")
        await _send(h, 2, "grade_due")
        await asyncio.sleep(0.01)
        gate["open"].set()
        await h.server.wait_for_grading()
        await asyncio.sleep(0.01)

    run(go())
    assert calls == ["free"]
    assert [m["result"] for m in h.messages if m.get("id") in (1, 2)] == [{"graded": 2}] * 2
    h.server.close()


def test_a_stopped_run_says_so_before_its_report_so_far(tmp_path):
    def limited(request):
        if request.task == "narrate":
            return AIUsageLimit("You've hit your limit. Resets 3am")
        return clean_ai(request)

    h = Harness(tmp_path, ai_default=limited)

    async def go():
        await h.server.start()
        await h.call("run_report", {"query": "T0"})
        await h.finish()

    run(go())
    order = [m["method"] for m in h.messages if m.get("method") in ("run_failed", "report_ready")]
    assert order == ["run_failed", "report_ready"]
    assert h.notes("run_failed")[0]["step"] == "narrate"
    h.server.close()
