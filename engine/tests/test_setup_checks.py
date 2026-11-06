"""Setup in the engine: key checks, the safety check and the setup settings."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime

import httpx
import pytest
import respx

from tearsheet import config
from tearsheet.ai.client import CallRequest
from tearsheet.ai.schemas import Link, LinkList, LockdownProbe
from tearsheet.data.fred import FRED_URL
from tearsheet.http import HttpClient
from tearsheet.protocol import SettingsResult
from tearsheet.server import EngineError
from tearsheet.setup_checks import check_key
from tests.fakes.ai import FakeConnector, answer
from tests.test_protocol import Harness, run

PROBE = LockdownProbe(summary="The passage asks the reader to open files.", has_instructions=True)
LINKS = LinkList(links=[Link(url="https://reuters.com/a", title="A", publisher="Reuters")])
MASSIVE_URL = config.MASSIVE_BASE_URL + "/v2/aggs/ticker/SPY/range/"


def clean(request: CallRequest):
    if request.allow_web_search:
        return answer(LINKS, tool_events=["WebSearch"], model_id="fake-large")
    return answer(PROBE)


def bars() -> dict:
    start = datetime.fromisoformat("2026-11-05T05:00:00+00:00")
    return {
        "status": "OK",
        "results": [{"t": int(start.timestamp() * 1000), "c": 735.59, "o": 1, "h": 1, "l": 1}],
    }


def make_http(rawstore):
    return HttpClient(rawstore, "check", sleep=lambda s: asyncio.sleep(0))


def test_check_key_massive_proof(rawstore):
    async def go():
        with respx.mock:
            route = respx.get(url__startswith=MASSIVE_URL).mock(
                return_value=httpx.Response(200, json=bars())
            )
            async with make_http(rawstore) as http:
                return await check_key(http, "massive", "pasted-key"), route

    proof, route = run(go())
    assert proof == "Works. SPY closed at $735.59 on Nov 5."
    assert route.calls[0].request.headers["authorization"] == "Bearer pasted-key"


def test_check_key_fred_proof(rawstore):
    body = {
        "observations": [
            {"date": "2026-11-03", "value": "4.85"},
            {"date": "2026-11-04", "value": "4.9"},
            {"date": "2026-11-05", "value": "."},
        ]
    }

    async def go():
        with respx.mock:
            route = respx.get(url__startswith=FRED_URL).mock(
                return_value=httpx.Response(200, json=body)
            )
            async with make_http(rawstore) as http:
                return await check_key(http, "fred", "fred-key"), route

    proof, route = run(go())
    assert proof == "Works. The 10-year Treasury yield is 4.9%."
    assert route.calls[0].request.url.params["api_key"] == "fred-key"


@pytest.mark.parametrize("status", [401, 403])
def test_check_key_rejected_statuses(rawstore, status):
    async def go():
        with respx.mock:
            respx.get(url__startswith=MASSIVE_URL).mock(return_value=httpx.Response(status))
            async with make_http(rawstore) as http:
                await check_key(http, "massive", "bad")

    with pytest.raises(EngineError) as err:
        run(go())
    assert err.value.code == "KEY_REJECTED"


def test_check_key_rejected_by_the_services_own_error(rawstore):
    async def go():
        with respx.mock:
            respx.get(url__startswith=MASSIVE_URL).mock(
                return_value=httpx.Response(
                    200, json={"status": "NOT_AUTHORIZED", "message": "Unknown API Key"}
                )
            )
            async with make_http(rawstore) as http:
                await check_key(http, "massive", "bad")

    with pytest.raises(EngineError) as err:
        run(go())
    assert err.value.code == "KEY_REJECTED"


def test_check_key_fred_bad_key_is_rejected(rawstore):
    async def go():
        with respx.mock:
            respx.get(url__startswith=FRED_URL).mock(
                return_value=httpx.Response(
                    400,
                    json={"error_code": 400, "error_message": "Bad Request. api_key is invalid."},
                )
            )
            async with make_http(rawstore) as http:
                await check_key(http, "fred", "bad")

    with pytest.raises(EngineError) as err:
        run(go())
    assert err.value.code == "KEY_REJECTED"


def test_check_key_unreachable_differs(rawstore):
    async def go(response):
        with respx.mock:
            respx.get(url__startswith=MASSIVE_URL).mock(**response)
            async with make_http(rawstore) as http:
                await check_key(http, "massive", "any")

    for response in (
        {"side_effect": httpx.ConnectError("down")},
        {"side_effect": httpx.ReadTimeout("slow")},
        {"return_value": httpx.Response(503)},
    ):
        with pytest.raises(EngineError) as err:
            run(go(response))
        assert err.value.code == "SERVICE_UNREACHABLE"


def key_harness(tmp_path, rawstore_unused=None):
    h = Harness(tmp_path)

    @asynccontextmanager
    async def http_factory(run_id, conn, rawstore):
        async with HttpClient(rawstore, run_id, sleep=lambda s: asyncio.sleep(0)) as http:
            yield http

    h.server.http_factory = http_factory
    return h


def test_check_key_rejected_is_not_saved(tmp_path):
    h = key_harness(tmp_path)

    async def go():
        with respx.mock:
            respx.get(url__startswith=MASSIVE_URL).mock(return_value=httpx.Response(401))
            return await h.call("check_key", {"service": "massive", "key": "bad-key"})

    reply = run(go())
    assert reply["error"]["data"]["code"] == "KEY_REJECTED"
    assert config.get_key("massive") is None
    assert "bad-key" not in str(reply)
    h.server.close()


def test_check_key_saves_only_after_it_passes(tmp_path):
    h = key_harness(tmp_path)

    async def go():
        with respx.mock:
            respx.get(url__startswith=MASSIVE_URL).mock(
                return_value=httpx.Response(200, json=bars())
            )
            return await h.call("check_key", {"service": "massive", "key": "good-key"})

    reply = run(go())
    assert reply["result"] == {"proof": "Works. SPY closed at $735.59 on Nov 5."}
    assert config.get_key("massive") == "good-key"
    assert "good-key" not in str(h.messages)
    h.server.close()


def test_check_key_unreachable_is_not_saved(tmp_path):
    h = key_harness(tmp_path)

    async def go():
        with respx.mock:
            respx.get(url__startswith=FRED_URL).mock(side_effect=httpx.ConnectError("down"))
            return await h.call("check_key", {"service": "fred", "key": "k"})

    reply = run(go())
    assert reply["error"]["data"]["code"] == "SERVICE_UNREACHABLE"
    assert config.get_key("fred") is None
    h.server.close()


def safety_harness(tmp_path, monkeypatch, *, delay_s: float = 0.0, harness_delay: float = 0.0):
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    (tmp_path / "home").mkdir()
    h = Harness(tmp_path, delay_s=harness_delay)
    h.connector = FakeConnector(default=clean, delay_s=delay_s)
    h.server.safety_connector_factory = lambda conn, tool: h.connector
    return h


def test_safety_check_emits_progress_and_done(tmp_path, monkeypatch):
    h = safety_harness(tmp_path, monkeypatch)

    async def go():
        reply = await h.call("run_safety_check", {"tool": "claude"})
        await h.server.wait_for_safety_check()
        return reply

    reply = run(go())
    assert reply["result"] == {"started": True}
    progress = h.notes("safety_progress")
    assert len(progress) == 25
    assert [p["n"] for p in progress] == list(range(1, 26))
    assert all(p["total"] == 25 and p["tool"] == "claude" and p["ok"] is True for p in progress)
    assert all(p["name"] for p in progress)
    done = h.notes("safety_done")
    assert done == [{"tool": "claude", "passed": True, "reason": None}]
    assert h.messages[-1]["method"] == "safety_done"
    state = h.server.db.conn.execute(
        "SELECT lockdown_passed, lockdown_form FROM tool_versions WHERE tool = 'claude'"
    ).fetchone()
    assert tuple(state) == (1, "full")
    h.server.close()


def test_safety_check_failure_reports_a_reason(tmp_path, monkeypatch):
    h = safety_harness(tmp_path, monkeypatch)
    h.connector.default = lambda request: answer(LinkList(links=[]))  # never matches the schema

    async def go():
        await h.call("run_safety_check", {"tool": "claude"})
        await h.server.wait_for_safety_check()

    run(go())
    done = h.notes("safety_done")[0]
    assert done["passed"] is False and done["reason"]
    h.server.close()


def test_safety_check_refuses_while_busy(tmp_path, monkeypatch):
    h = safety_harness(tmp_path, monkeypatch, delay_s=0.05, harness_delay=0.3)

    async def go():
        await h.server.start()
        await h.call("run_report", {"query": "T0"})
        during_report = await h.call("run_safety_check", {"tool": "claude"}, id_=2)
        await h.finish()
        first = await h.call("run_safety_check", {"tool": "claude"}, id_=3)
        second = await h.call("run_safety_check", {"tool": "claude"}, id_=4)
        report = await h.call("run_report", {"query": "T0"}, id_=5)
        await h.server.wait_for_safety_check()
        return during_report, first, second, report

    during_report, first, second, report = run(go())
    assert during_report["error"]["data"]["code"] == "RUN_IN_PROGRESS"
    assert first["result"] == {"started": True}
    assert second["error"]["data"]["code"] == "SAFETY_CHECK_RUNNING"
    assert report["error"]["data"]["code"] == "SAFETY_CHECK_RUNNING"
    h.server.close()


def test_setup_settings_round_trip(tmp_path):
    h = Harness(tmp_path)

    async def go():
        before = await h.call("get_settings")
        await h.call("set_setting", {"key": "setup_done", "value": "1"}, id_=2)
        await h.call("set_setting", {"key": "fred_skipped", "value": "1"}, id_=3)
        mid = await h.call("get_settings", id_=4)
        await h.call("set_setting", {"key": "setup_done", "value": "0"}, id_=5)
        bad = await h.call("set_setting", {"key": "setup_done", "value": "yes"}, id_=6)
        after = await h.call("get_settings", id_=7)
        return before, mid, bad, after

    before, mid, bad, after = run(go())
    assert before["result"]["setup_done"] is False and before["result"]["fred_skipped"] is False
    assert mid["result"]["setup_done"] is True and mid["result"]["fred_skipped"] is True
    assert "error" in bad
    assert after["result"]["setup_done"] is False
    SettingsResult.model_validate(mid["result"])
    h.server.close()
