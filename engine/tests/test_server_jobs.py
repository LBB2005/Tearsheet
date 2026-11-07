"""Jobs beside the request loop: grading answers off the loop, so look-ups and settings answer
while it fetches prices, and no run starts while it goes; and the order of a stopped run's notes."""

from __future__ import annotations

import asyncio
import json

from tearsheet import config
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


# --- the full price history and the key checks, off the loop ----------------------------------


class _SlowHttp:
    """Massive, slowed: every call waits for the gate (a first full download is about a minute
    of calls at the plan's pace)."""

    def __init__(self):
        from tests.test_server_lookups import FakeHttp

        self.inner = FakeHttp()
        self.gate = asyncio.Event()

    async def fetch(self, *args, **kwargs):
        await self.gate.wait()
        return await self.inner.fetch(*args, **kwargs)


def _history_harness(tmp_path):
    from contextlib import asynccontextmanager

    from tests.test_charts import seed

    http = _SlowHttp()

    @asynccontextmanager
    async def http_factory(run_id, conn, rawstore):
        yield http

    config.set_key("massive", "test-massive-key")
    h = Harness(tmp_path)
    h.server.http_factory = http_factory
    seed(h.server.db.conn)
    with h.server.db.conn:
        h.server.db.conn.execute(
            "INSERT INTO step_outputs VALUES ('run-1', 'resolve', '{\"ticker\": \"ABC\"}')"
        )
        # A second report of the same company.
        h.server.db.conn.execute(
            "INSERT INTO reports (report_id, run_id, created_at, narrative_complete)"
            " VALUES ('rep-2', 'run-1', '2026-10-31T01:00:00+00:00', 1)"
        )
    return h, http


def _reply(h: Harness, id_: int) -> dict | None:
    return next((m for m in h.messages if m.get("id") == id_), None)


def test_look_ups_answer_while_a_history_download_goes_and_runs_wait_for_it(tmp_path):
    h, http = _history_harness(tmp_path)

    async def go():
        await h.server.start()
        # handle() returns at once: the download is answered off the loop.
        await asyncio.wait_for(_send(h, 1, "fetch_history", {"report_id": "rep-1"}), 1)
        await asyncio.sleep(0.01)
        pending = _reply(h, 1)
        companies = await asyncio.wait_for(h.call("list_companies", id_=2), 1)
        hit = await asyncio.wait_for(h.call("search_companies", {"query": "nvda"}, id_=3), 1)
        settings = await asyncio.wait_for(h.call("get_settings", id_=4), 1)
        refused_run = await h.call("run_report", {"query": "T0"}, id_=5)
        refused_resume = await h.call("resume", {"run_id": "run-1"}, id_=6)
        http.gate.set()
        await h.server.wait_for_grading()
        done = _reply(h, 1)
        after = await h.call("run_report", {"query": "T0"}, id_=7)
        await h.finish()
        return pending, companies, hit, settings, refused_run, refused_resume, done, after

    pending, companies, hit, settings, refused_run, refused_resume, done, after = run(go())
    assert pending is None  # the download was still going
    assert companies["result"][0]["report_id"] == "rep-2"
    assert hit["result"][0]["ticker"] == "NVDA"
    assert "keys" in settings["result"]
    for refused in (refused_run, refused_resume):
        assert refused["error"]["data"]["code"] == "HISTORY_DOWNLOADING"
        assert "price history" in refused["error"]["message"]
    assert done["result"]["first_date"] <= "2000-01-05"
    assert after["result"]["ticker"] == "T0"  # runs start again once the download is done
    h.server.close()


def test_two_history_downloads_for_one_company_share_one(tmp_path):
    h, http = _history_harness(tmp_path)

    async def go():
        await h.server.start()
        await asyncio.wait_for(_send(h, 1, "fetch_history", {"report_id": "rep-1"}), 1)
        await asyncio.wait_for(_send(h, 2, "fetch_history", {"report_id": "rep-2"}), 1)
        await asyncio.sleep(0.01)
        http.gate.set()
        await h.server.wait_for_grading()

    run(go())
    first, second = _reply(h, 1), _reply(h, 2)
    assert first["result"] == second["result"] and first["result"]["days"] >= 2
    # One download's calls: the company's splits and two pages of dividends, SPY's three, and
    # the company's bars.
    assert len(http.inner.calls) == 7
    h.server.close()


def test_a_key_check_answers_off_the_loop(tmp_path, monkeypatch):
    import tearsheet.setup_checks as setup_checks

    gate: dict[str, asyncio.Event] = {}

    async def slow_check(http, service, key):
        await gate["open"].wait()
        return f"{service} answered"

    monkeypatch.setattr(setup_checks, "check_key", slow_check)
    h = Harness(tmp_path)

    async def go():
        gate["open"] = asyncio.Event()
        await h.server.start()
        await asyncio.wait_for(
            _send(h, 1, "check_key", {"service": "massive", "key": " new-key\n"}), 1
        )
        await asyncio.sleep(0.01)
        pending = _reply(h, 1)
        hit = await asyncio.wait_for(h.call("search_companies", {"query": "nvda"}, id_=2), 1)
        gate["open"].set()
        await h.server.wait_for_grading()
        return pending, hit

    pending, hit = run(go())
    assert pending is None
    assert hit["result"][0]["ticker"] == "NVDA"
    assert _reply(h, 1)["result"] == {"proof": "massive answered"}
    from tearsheet import config

    assert config.get_key("massive") == "new-key"
    h.server.close()


def test_a_stopped_run_names_the_step_it_stopped_at(tmp_path):
    """A usage limit during extract says extract, though the pipeline goes on to fill in the
    numbers, check and save the report so far."""

    def limited(request):
        if request.task == "extract":
            return AIUsageLimit("You've hit your limit. Resets 3am")
        return clean_ai(request)

    h = Harness(tmp_path, ai_default=limited)

    async def go():
        await h.server.start()
        await h.call("run_report", {"query": "T0"})
        await h.finish()

    run(go())
    failed = h.notes("run_failed")
    assert len(failed) == 1 and failed[0]["code"] == "USAGE_LIMIT"
    assert failed[0]["step"] == "extract"
    started = [p["step_name"] for p in h.notes("progress") if p["state"] == "started"]
    assert started[-1] == "save"  # the steps after the stop still ran
    h.server.close()


def _backfill_harness(tmp_path, monkeypatch, *, delay_s=0.0):
    import tearsheet.data.market as market
    import tearsheet.server as server_module

    monkeypatch.setattr(server_module, "BACKFILL_POLL_S", 0.005)
    config.set_key("massive", "test-key")
    h = Harness(tmp_path, delay_s=delay_s)
    h.server.backfill_enabled = True
    seen: list[str] = []

    async def fake_backfill(http, rawstore, store, wanted, *, end, gate, progress, **_):
        seen.append("busy" if h.server._others_running() else "free")
        return market.BackfillResult(
            sessions=1, calls=1, reused=0, ready=len(wanted), wanted=len(wanted)
        )

    monkeypatch.setattr(market, "backfill", fake_backfill)
    return h, seen


def test_the_backfill_waits_for_a_report_and_never_blocks_it(tmp_path, monkeypatch):
    h, seen = _backfill_harness(tmp_path, monkeypatch, delay_s=0.02)

    async def go():
        await h.server.start()
        reply = await h.call("run_report", {"query": "T0"})
        await h.finish()
        result = await asyncio.wait_for(h.server.backfill_job, 5)
        return reply, result

    reply, result = run(go())
    assert reply["result"]["ticker"] == "T0"  # the report started at once
    assert seen == ["free"]  # the backfill went only after it
    assert result["ready"] == result["wanted"]
    assert config.Settings(h.server.db.conn).get("prices_backfill_completed")
    h.server.close()
    # Once it has covered every member, the next start doesn't run it again.
    again = Harness(tmp_path)
    again.server.backfill_enabled = True
    run(again.server.start())
    assert again.server.backfill_job is None
    again.server.close()


def test_the_backfill_stays_off_when_switched_off_or_with_no_key(tmp_path, monkeypatch):
    h, seen = _backfill_harness(tmp_path, monkeypatch)
    config.Settings(h.server.db.conn).set("prices_backfill", "off")
    run(h.server.start())
    assert h.server.backfill_job is None
    h.server.close()
    config.set_key("massive", "")
    other = Harness(tmp_path / "other")
    other.server.backfill_enabled = True
    run(other.server.start())
    assert other.server.backfill_job is None and seen == []
    other.server.close()
