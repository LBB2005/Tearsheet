"""The app ↔ engine protocol (design item 37, Technical Plan §2)."""

from __future__ import annotations

import asyncio
import json
import subprocess
import sys
from contextlib import asynccontextmanager

import pytest

from tearsheet import ENGINE_VERSION, PROTOCOL_VERSION, config
from tearsheet.ai.client import AIClient, AIUsageLimit, ToolState
from tearsheet.protocol import ERROR_CODES, METHODS, schema
from tearsheet.server import Server
from tests.fakes.ai import FakeConnector
from tests.test_pipeline import NOW, FakeData, clean_ai


class Harness:
    def __init__(
        self,
        tmp_path,
        *,
        ai_default=clean_ai,
        data_cls=FakeData,
        delay_s: float = 0.0,
        log_predictions: bool | None = None,
    ):
        self.messages: list[dict] = []
        self.paths = config.Paths(tmp_path / "data").ensure()
        self.ai_default = ai_default

        @asynccontextmanager
        async def data_factory(run_id, conn, rawstore):
            yield data_cls()

        def ai_factory(conn, tool):
            state = ToolState(conn, "claude")
            state.record_check(version="1.0", model_ids=["fake-small"], form="full", passed=True)
            return AIClient(
                FakeConnector(default=self.ai_default, delay_s=delay_s), state, retry_wait_s=0
            )

        self.server = Server(
            self.paths,
            write=self.messages.append,
            data_factory=data_factory,
            ai_factory=ai_factory,
            now=lambda: NOW,
            log_predictions=log_predictions,
        )

    async def call(self, method: str, params: dict | None = None, *, id_: int = 1) -> dict:
        start = len(self.messages)
        await self.server.handle(
            json.dumps({"jsonrpc": "2.0", "id": id_, "method": method, "params": params or {}})
        )
        # Most replies are written before handle() returns; grade_due's comes from a task.
        for _ in range(2000):
            reply = next((m for m in self.messages[start:] if m.get("id") == id_), None)
            if reply is not None:
                return reply
            await asyncio.sleep(0.005)
        raise AssertionError(f"no reply to {method}")

    async def finish(self) -> None:
        await self.server.wait_for_job()

    def notes(self, method: str) -> list[dict]:
        return [m["params"] for m in self.messages if m.get("method") == method]


def run(coro):
    return asyncio.run(coro)


def test_hello_comes_first(tmp_path):
    h = Harness(tmp_path)
    run(h.server.start())
    first = h.messages[0]
    assert first["method"] == "hello" and "id" not in first
    assert first["params"]["engine_version"] == ENGINE_VERSION
    assert first["params"]["protocol_version"] == PROTOCOL_VERSION
    assert len(first["params"]["methodology_hash"]) == 64
    h.server.close()


def test_run_report_then_report_ready_and_get_report(tmp_path):
    h = Harness(tmp_path)

    async def go():
        await h.server.start()
        started = await h.call("run_report", {"query": "T0"})
        await h.finish()
        ready = h.notes("report_ready")
        got = await h.call("get_report", {"report_id": ready[0]["report_id"]}, id_=2)
        listed = await h.call("list_reports", {}, id_=3)
        return started, ready, got, listed

    started, ready, got, listed = run(go())
    assert started["result"]["run_id"].startswith("run-")
    assert ready[0]["run_id"] == started["result"]["run_id"]
    progress = h.notes("progress")
    assert {p["state"] for p in progress} >= {"started", "done"}
    assert progress[0]["step"] == 1 and progress[0]["step_name"] == "resolve"
    html = got["result"]["html"]
    assert "tearsheet://flag/" in html  # app mode
    assert got["result"]["ticker"] == "T0"
    assert listed["result"][0]["report_id"] == ready[0]["report_id"]
    assert listed["result"][0]["rating"] in ("Buy", "Hold", "Sell")
    h.server.close()


def test_one_job_at_a_time(tmp_path):
    h = Harness(tmp_path, delay_s=0.05)  # slow enough that the first run is still going

    async def go():
        await h.server.start()
        await h.call("run_report", {"query": "T0"})
        second = await h.call("run_report", {"query": "T1"}, id_=2)
        await h.finish()
        return second

    second = run(go())
    assert second["error"]["code"] == -32000
    assert second["error"]["data"]["code"] == "RUN_IN_PROGRESS"
    h.server.close()


def test_a_company_outside_the_index_is_not_covered(tmp_path):
    h = Harness(tmp_path)

    async def go():
        await h.server.start()
        return await h.call("run_report", {"query": "Zzzz Widgets"})

    reply = run(go())
    assert reply["error"]["data"]["code"] == "NOT_COVERED"
    h.server.close()


def test_a_usage_limit_sends_run_failed_with_the_reset_time(tmp_path):
    def limited(request):
        if request.task == "narrate":
            return AIUsageLimit(
                "You've hit your limit. Resets 3am", reset_at="2026-11-06T03:00:00-05:00"
            )
        return clean_ai(request)

    h = Harness(tmp_path, ai_default=limited)

    async def go():
        await h.server.start()
        await h.call("run_report", {"query": "T0"})
        await h.finish()

    run(go())
    failed = h.notes("run_failed")
    assert (
        failed
        and failed[0]["code"] == "USAGE_LIMIT"
        and failed[0]["reset_at"].startswith("2026-11-06")
    )
    assert h.notes("report_ready")  # the partial report is still saved
    h.server.close()


def test_flag_reread_settings_and_keys(tmp_path, monkeypatch):
    h = Harness(tmp_path)

    async def go():
        await h.server.start()
        await h.call("run_report", {"query": "T0"})
        await h.finish()
        report_id = h.notes("report_ready")[0]["report_id"]
        claim = h.server.db.conn.execute(
            "SELECT claim_id FROM claims WHERE removed = 0 AND report_id = ? LIMIT 1", (report_id,)
        ).fetchone()[0]
        flagged = await h.call("flag_claim", {"claim_id": claim, "note": "looks off"}, id_=2)
        reread = await h.call("reread_filing", {"accession": "0001-26-000001"}, id_=3)
        key = await h.call("set_key", {"service": "fred", "key": "abc123secret"}, id_=4)
        setting = await h.call("set_setting", {"key": "goal1_round", "value": "2"}, id_=5)
        bad = await h.call("set_setting", {"key": "massive_calls_per_minute", "value": "9"}, id_=6)
        settings = await h.call("get_settings", {}, id_=7)
        return flagged, reread, key, setting, bad, settings

    flagged, reread, key, setting, bad, settings = run(go())
    assert flagged["result"]["review_id"].startswith("rev-")
    assert reread["result"]["deleted"] > 0
    assert key["result"] == {"ok": True}
    assert config.get_key("fred") == "abc123secret"
    assert all("abc123secret" not in json.dumps(m) for m in h.messages)
    assert setting["result"] == {"ok": True}
    assert bad["error"]["code"] == -32602
    s = settings["result"]
    assert s["keys"]["fred"] == "set" and s["keys"]["massive"] == "missing"
    assert s["raw_cap"] > 0 and "backup_in_icloud" in s and s["services"]
    from tearsheet.protocol import SettingsResult

    SettingsResult.model_validate(s)
    assert set(s["lockdown"]) <= {"claude", "codex"}
    h.server.close()


def test_unknown_methods_and_bad_requests(tmp_path):
    h = Harness(tmp_path)

    async def go():
        await h.server.start()
        await h.server.handle("not json")
        await h.call("no_such_method", {}, id_=2)
        await h.call("get_report", {"report_id": 5, "extra": 1}, id_=3)
        await h.call("get_report", {"report_id": "rep-none"}, id_=4)

    run(go())
    errors = {m.get("id"): m["error"]["code"] for m in h.messages if "error" in m}
    assert errors == {None: -32700, 2: -32601, 3: -32602, 4: -32000}
    h.server.close()


def test_every_method_and_error_code_is_declared():
    assert set(METHODS) >= {
        "run_report",
        "cancel",
        "resume",
        "get_report",
        "list_reports",
        "list_predictions",
        "flag_claim",
        "reread_filing",
        "set_key",
        "get_settings",
        "set_setting",
        "grade_due",
    }
    assert set(ERROR_CODES) == {
        "NOT_COVERED",
        "RUN_IN_PROGRESS",
        "NO_TOOL",
        "NOT_RESUMABLE",
        "USAGE_LIMIT",
        "AUTH_EXPIRED",
        "LOCKDOWN_FAILED",
        "AI_UNAVAILABLE",
        "BUDGET_EXHAUSTED",
        "SEC_BLOCKED",
        "ENGINE_ERROR",
    }
    s = schema()
    assert "Hello" in s["$defs"] and "RunReportParams" in s["$defs"]


def test_serve_writes_only_protocol_messages_to_standard_output(tmp_path):
    lines = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "list_reports", "params": {}}) + "\n"
    out = subprocess.run(
        [sys.executable, "-m", "tearsheet.cli", "--data-dir", str(tmp_path / "d"), "serve"],
        input=lines,
        capture_output=True,
        text=True,
        timeout=60,
    )
    messages = [json.loads(line) for line in out.stdout.splitlines()]
    assert messages[0]["method"] == "hello"
    assert messages[1] == {"jsonrpc": "2.0", "id": 1, "result": []}
    assert all(m.get("jsonrpc") == "2.0" for m in messages)


@pytest.mark.parametrize("state", ["started", "done", "skipped", "retrying", "failed"])
def test_progress_states(state):
    from tearsheet.protocol import Progress

    assert Progress(run_id="r", step=1, step_name="resolve", state=state).state == state


def test_grade_due_with_no_predictions(tmp_path):
    h = Harness(tmp_path)

    async def go():
        await h.server.start()
        return await h.call("grade_due", {})

    reply = run(go())
    assert reply["result"] == {"graded": 0, "note": "No predictions are logged yet."}
    h.server.close()


def test_the_log_lists_each_grade_with_its_hit(tmp_path):
    from tearsheet.protocol import PredictionSummary
    from tests.test_db import insert_prediction

    h = Harness(tmp_path)

    async def go():
        await h.server.start()
        conn = h.server.db.conn
        with conn:
            insert_prediction(conn, prediction_id="p1", run_id="r1")
            conn.execute(
                "INSERT INTO grades VALUES ('p1', 3, '2026-04-01T00:00:00+00:00', 1, 100.0, ?)",
                (
                    json.dumps(
                        {
                            "hit": True,
                            "excess": 0.04,
                            "company_return": 0.07,
                            "end_date": "2026-03-31",
                            "range": {"inside": False},
                        }
                    ),
                ),
            )
        return await h.call("list_predictions", {})

    reply = run(go())
    [row] = reply["result"]
    PredictionSummary.model_validate(row)
    assert row["grades"] == [
        {
            "horizon_months": 3,
            "graded_at": "2026-04-01T00:00:00+00:00",
            "grading_version": 1,
            "start_price": 100.0,
            "hit": True,
            "excess": 0.04,
            "company_return": 0.07,
            "end_date": "2026-03-31",
            "inside_range": False,
        }
    ]
    h.server.close()


def test_settings_show_each_tools_lock_down_state(tmp_path):
    from tearsheet.ai.client import ToolState

    h = Harness(tmp_path)

    async def go():
        await h.server.start()
        conn = h.server.db.conn
        ToolState(conn, "claude").record_check(
            version="2.1.0", model_ids=["m"], form="full", passed=True
        )
        ToolState(conn, "codex").record_check(
            version="codex-cli 0.165.0", model_ids=[], form="full", passed=False
        )
        return await h.call("get_settings", {})

    lockdown = run(go())["result"]["lockdown"]
    assert lockdown["claude"]["passed"] is True and lockdown["claude"]["version"] == "2.1.0"
    assert lockdown["codex"]["passed"] is False
    assert lockdown["codex"]["blocked_reason"] == "lockdown_failed"
    h.server.close()


def test_a_report_from_the_app_logs_its_prediction_for_the_log_screen(tmp_path):
    from tearsheet import config as cfg
    from tests.test_pipeline import WithFilingList

    h = Harness(tmp_path, data_cls=WithFilingList, log_predictions=True)

    async def go():
        await h.server.start()
        cfg.Settings(h.server.db.conn).set("backup_dir", str(tmp_path / "backups"))
        await h.call("run_report", {"query": "T0"})
        await h.finish()
        return await h.call("list_predictions", {}, id_=2)

    listed = run(go())["result"]
    assert len(listed) == 1 and listed[0]["ticker"] == "T0" and listed[0]["grades"] == []
    assert list((tmp_path / "backups").glob("tearsheet-*.sqlite"))
    h.server.close()


def test_the_app_with_injected_test_data_logs_nothing(tmp_path):
    h = Harness(tmp_path)

    async def go():
        await h.server.start()
        await h.call("run_report", {"query": "T0"})
        await h.finish()
        return await h.call("list_predictions", {}, id_=2)

    assert run(go())["result"] == []
    h.server.close()


def test_the_safety_checks_stop_and_progress_and_the_test_copy_code():
    """First-run design item 17."""
    from pydantic import ValidationError

    from tearsheet.protocol import (
        ALL_MODELS,
        CancelSafetyCheckResult,
        NoParams,
        RunFailedNote,
        SafetyRunning,
        SettingsResult,
    )

    assert METHODS["cancel_safety_check"] is NoParams
    assert CancelSafetyCheckResult(stopping=True).stopping is True
    running = SafetyRunning(tool="codex", n=3, total=25, started_at="2026-11-08T20:00:00+00:00")
    assert running.model_dump() == {
        "tool": "codex",
        "n": 3,
        "total": 25,
        "started_at": "2026-11-08T20:00:00+00:00",
    }
    with pytest.raises(ValidationError):
        SafetyRunning(tool="other", n=0, total=25, started_at="x")
    assert {CancelSafetyCheckResult, SafetyRunning} <= set(ALL_MODELS)
    defs = schema()["$defs"]
    assert "CancelSafetyCheckResult" in defs and "SafetyRunning" in defs
    note = RunFailedNote(run_id="r", step=None, message="Reports are off.", code="TEST_COPY")
    assert note.code == "TEST_COPY"
    # Raised to 4 for these messages, and to 5 for the big line's (batch.py).
    assert PROTOCOL_VERSION >= 4
    assert schema()["description"] == f"App-engine protocol, version {PROTOCOL_VERSION}."
    # Settings from an engine before the field (and the app's fixtures) still parse.
    old = {
        "keys": {"massive": "set"},
        "rejected_keys": [],
        "raw_bytes": 0,
        "raw_cap": 5.0,
        "backup_dir": "/b",
        "backup_in_icloud": False,
        "primary_tool": None,
        "sec_contact_email": None,
        "goal1_round": 1,
        "setup_done": False,
        "fred_skipped": False,
        "services": [],
        "price_download": {"state": "no_key", "companies_ready": 0, "companies": 500},
    }
    assert SettingsResult.model_validate(old).safety_running is None
    with_check = SettingsResult.model_validate({**old, "safety_running": running.model_dump()})
    assert with_check.safety_running == running
