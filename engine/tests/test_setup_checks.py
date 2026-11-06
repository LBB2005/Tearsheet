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
    assert done == [{"tool": "claude", "passed": True, "reason": None, "finished": True}]
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
    assert done["finished"] is True  # it ran to the end and didn't pass
    h.server.close()


def test_a_check_stopped_by_a_usage_limit_is_not_finished(tmp_path, monkeypatch):
    """A usage limit (or a sign-out) part way gives no verdict: the app shows the check as not
    finished, not as failed, and nothing is recorded."""
    from tearsheet.ai.client import AIUsageLimit

    h = safety_harness(tmp_path, monkeypatch)
    calls = []

    def limited(request):
        calls.append(request)
        return (
            AIUsageLimit("You've hit your limit. Resets 3am") if len(calls) == 4 else clean(request)
        )

    h.connector.default = limited

    async def go():
        await h.call("run_safety_check", {"tool": "claude"})
        await h.server.wait_for_safety_check()

    run(go())
    done = h.notes("safety_done")[0]
    assert done["passed"] is False and done["finished"] is False
    assert "couldn't finish" in done["reason"]
    stored = h.server.db.conn.execute(
        "SELECT COUNT(*) FROM tool_versions WHERE tool = 'claude' AND lockdown_form = 'full'"
    ).fetchone()[0]
    assert stored == 0
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


@pytest.mark.parametrize(
    ("response", "code"),
    [
        (
            httpx.Response(
                200, text="<html>Down for maintenance</html>", headers={"content-type": "text/html"}
            ),
            "SERVICE_UNREACHABLE",
        ),
        (
            httpx.Response(200, content=b"", headers={"content-type": "application/json"}),
            "SERVICE_UNREACHABLE",
        ),
        (
            httpx.Response(200, json={"status": "ERROR", "error": "Internal failure, try later"}),
            "SERVICE_UNREACHABLE",
        ),
        (httpx.Response(200, json={"status": "NOT_AUTHORIZED"}), "KEY_REJECTED"),
        (httpx.Response(200, json={"status": "ERROR", "error": "Unknown API Key"}), "KEY_REJECTED"),
    ],
)
def test_massive_faults_are_told_apart_from_a_bad_key(rawstore, response, code):
    async def go():
        with respx.mock:
            respx.get(url__startswith=MASSIVE_URL).mock(return_value=response)
            async with make_http(rawstore) as http:
                await check_key(http, "massive", "k")

    with pytest.raises(EngineError) as err:
        run(go())
    assert err.value.code == code


def test_pasted_key_is_trimmed_and_an_empty_one_is_rejected(tmp_path):
    h = key_harness(tmp_path)

    async def go():
        with respx.mock:
            route = respx.get(url__startswith=MASSIVE_URL).mock(
                return_value=httpx.Response(200, json=bars())
            )
            ok = await h.call("check_key", {"service": "massive", "key": "  good-key\n"})
            empty = await h.call("check_key", {"service": "fred", "key": " \n"}, id_=2)
            return ok, empty, route

    ok, empty, route = run(go())
    assert "result" in ok and config.get_key("massive") == "good-key"
    assert route.calls[0].request.headers["authorization"] == "Bearer good-key"
    assert empty["error"]["data"]["code"] == "KEY_REJECTED"
    assert config.get_key("fred") is None
    h.server.close()


def test_resume_refuses_during_a_safety_check(tmp_path, monkeypatch):
    h = safety_harness(tmp_path, monkeypatch, delay_s=0.05)

    async def go():
        await h.call("run_safety_check", {"tool": "claude"})
        reply = await h.call("resume", {"run_id": "run-x"}, id_=2)
        await h.server.wait_for_safety_check()
        return reply

    reply = run(go())
    assert reply["error"]["data"]["code"] == "SAFETY_CHECK_RUNNING"
    h.server.close()


def test_a_crashing_check_ends_with_a_reason_and_frees_the_server(tmp_path, monkeypatch):
    h = safety_harness(tmp_path, monkeypatch)
    calls = []

    def crash(request):
        calls.append(request)
        if len(calls) == 3:
            raise RuntimeError("")
        return clean(request)

    h.connector.default = crash

    async def go():
        await h.call("run_safety_check", {"tool": "claude"})
        await h.server.wait_for_safety_check()
        h.connector.default = clean
        again = await h.call("run_safety_check", {"tool": "claude"}, id_=2)
        await h.server.wait_for_safety_check()
        return again

    again = run(go())
    first, second = h.notes("safety_done")
    assert first["passed"] is False and first["reason"]
    assert first["finished"] is False  # a crash is no verdict
    assert again["result"] == {"started": True}
    assert second["passed"] is True
    h.server.close()


# --- a stored key that stops working, and an install set up before setup existed -------------


def live_harness(tmp_path):
    """The server's own HTTP client, with the Massive limiter fast enough for a test."""
    h = Harness(tmp_path)
    config.Settings(h.server.db.conn).set("massive_calls_per_minute", "600000")
    return h


def test_a_refused_stored_key_shows_until_a_call_with_it_works(tmp_path):
    h = live_harness(tmp_path)
    config.set_key("massive", "stored-key")
    url = MASSIVE_URL + "1/day/2026-11-01/2026-11-05"

    async def fetch(response):
        with respx.mock:
            respx.get(url__startswith=MASSIVE_URL).mock(return_value=response)
            async with h.server._live_http("r1", h.server.db.conn, h.server.rawstore) as http:
                try:
                    await http.fetch("massive", url, kind="daily_bars")
                except Exception:
                    pass

    async def go():
        await fetch(httpx.Response(401, json={"status": "ERROR", "error": "Unknown API Key"}))
        refused = await h.call("get_settings", id_=2)
        await fetch(httpx.Response(200, json=bars()))
        works = await h.call("get_settings", id_=3)
        return refused, works

    refused, works = run(go())
    assert refused["result"]["rejected_keys"] == ["massive"]
    assert refused["result"]["keys"]["massive"] == "set"
    assert works["result"]["rejected_keys"] == []
    SettingsResult.model_validate(refused["result"])
    h.server.close()


def test_a_new_key_clears_the_refusal_and_a_refused_pasted_key_leaves_the_stored_one_alone(
    tmp_path,
):
    h = live_harness(tmp_path)
    config.set_key("massive", "stored-key")
    conn = h.server.db.conn

    async def go():
        with respx.mock:
            respx.get(url__startswith=MASSIVE_URL).mock(return_value=httpx.Response(401))
            await h.call("check_key", {"service": "massive", "key": "pasted-bad"})
        after_bad_paste = await h.call("get_settings", id_=2)
        config.note_key_answers(config.Settings(conn), refused={"massive"}, worked=set())
        noted = await h.call("get_settings", id_=3)
        await h.call("set_key", {"service": "massive", "key": "new-key"}, id_=4)
        after_new_key = await h.call("get_settings", id_=5)
        return after_bad_paste, noted, after_new_key

    after_bad_paste, noted, after_new_key = run(go())
    assert after_bad_paste["result"]["rejected_keys"] == []
    assert config.get_key("massive") == "new-key"
    assert noted["result"]["rejected_keys"] == ["massive"]
    assert after_new_key["result"]["rejected_keys"] == []
    h.server.close()


def test_a_missing_key_is_missing_not_refused(tmp_path):
    h = Harness(tmp_path)
    config.note_key_answers(config.Settings(h.server.db.conn), refused={"fred"}, worked=set())

    async def go():
        return await h.call("get_settings")

    s = run(go())["result"]
    assert s["keys"]["fred"] == "missing" and s["rejected_keys"] == []
    h.server.close()


def test_an_install_that_already_has_reports_opens_on_home(tmp_path):
    """Reports written before the app had a setup (the terminal, or the first app) mean the
    install is set up: it is marked so once, and opens on the home page."""
    h = Harness(tmp_path)

    async def go():
        before = await h.call("get_settings")
        await h.call("run_report", {"query": "T0"}, id_=2)
        await h.finish()
        after = await h.call("get_settings", id_=3)
        return before, after

    before, after = run(go())
    assert before["result"]["setup_done"] is False
    assert after["result"]["setup_done"] is True
    assert config.Settings(h.server.db.conn).get("setup_done") == "1"
    h.server.close()


def test_setup_asked_for_again_is_respected_even_with_reports(tmp_path):
    h = Harness(tmp_path)

    async def go():
        await h.call("run_report", {"query": "T0"})
        await h.finish()
        await h.call("set_setting", {"key": "setup_done", "value": "0"}, id_=2)
        return await h.call("get_settings", id_=3)

    assert run(go())["result"]["setup_done"] is False
    h.server.close()
