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


# --- stopping the check, its endings and the line (first-run design §5) ----------------------


@pytest.fixture
def fake_list(monkeypatch):
    """The line's look-up list is the fake companies'."""
    from tearsheet.data import membership
    from tests.test_batch import fake_holdings

    monkeypatch.setattr(membership, "load_bundled", fake_holdings)


def line_harness(tmp_path, monkeypatch, *, writing_tool: str = "claude", delay_s: float = 0.02):
    """The safety harness, with a writing tool chosen and the line looking again quickly."""
    h = safety_harness(tmp_path, monkeypatch, delay_s=delay_s)
    config.Settings(h.server.db.conn).set("primary_tool", writing_tool)
    h.server.line_poll_s = 0.01
    return h


def tool_rows(h) -> list[tuple]:
    return [
        tuple(r) for r in h.server.db.conn.execute("SELECT tool, lockdown_form FROM tool_versions")
    ]


async def wait_for_progress(h, count: int) -> None:
    for _ in range(2000):
        if len(h.notes("safety_progress")) >= count:
            return
        await asyncio.sleep(0.002)
    raise AssertionError("the check never got that far")


def test_cancel_stops_after_the_call_in_progress_and_records_nothing(tmp_path, monkeypatch):
    import json

    from tearsheet.ai.lockdown import STOPPED

    h = safety_harness(tmp_path, monkeypatch, delay_s=0.03)

    async def go():
        idle = await h.call("cancel_safety_check")
        await h.call("run_safety_check", {"tool": "claude"}, id_=2)
        await wait_for_progress(h, 2)
        stopping = await h.call("cancel_safety_check", id_=3)
        await h.server.wait_for_safety_check()
        return idle, stopping

    idle, stopping = run(go())
    assert idle["result"] == {"stopping": False}
    assert stopping["result"] == {"stopping": True}
    progress = h.notes("safety_progress")
    # The call in progress ended normally (it is reported), and no other started.
    assert 2 <= len(progress) < 25
    assert len(h.connector.requests) == len(progress) and h.connector.active == 0
    assert not h.server.safety_job.cancelled()
    done = h.notes("safety_done")
    assert done == [{"tool": "claude", "passed": False, "reason": f"{STOPPED}.", "finished": False}]
    assert tool_rows(h) == []
    # The report file, named as the command-line check names it.
    [path] = (tmp_path / "data" / "logs").glob("lockdown-claude-full-*.json")
    saved = json.loads(path.read_text())
    assert saved["inconclusive"] == STOPPED and len(saved["probes"]) == len(progress)
    assert all("rate_limit" in p for p in saved["probes"])
    h.server.close()


def test_a_failed_check_pauses_the_reports_waiting_through_the_existing_block(
    tmp_path, monkeypatch, fake_list
):
    from tearsheet.ai.client import AIClient, ToolState
    from tests.test_pipeline import clean_ai

    h = line_harness(tmp_path, monkeypatch)
    h.connector.default = lambda request: answer(LinkList(links=[]))  # never matches the schema
    # The line's report runs on the tool as the check left it (the harness's own AI marks it
    # checked, which would hide the block).
    h.server.ai_factory = lambda conn, tool: AIClient(
        FakeConnector(default=clean_ai), ToolState(conn, "claude"), retry_wait_s=0
    )

    async def go():
        await h.call("run_safety_check", {"tool": "claude"})
        await h.call("add_to_line", {"queries": ["T1", "T2"]}, id_=2)
        await h.server.wait_for_safety_check()
        await h.server.wait_for_line()

    run(go())
    assert h.notes("safety_done")[0]["finished"] is True
    blocked = h.server.db.conn.execute(
        "SELECT blocked_reason FROM tool_versions WHERE tool = 'claude'"
    ).fetchone()[0]
    assert blocked == "lockdown_failed"
    final = h.notes("line_changed")[-1]
    assert final["paused"]["code"] == "LOCKDOWN_FAILED"
    assert final["paused"]["run_id"]  # Resume writes it once a full check passes
    assert [(i["ticker"], i["code"]) for i in final["finished"]] == [("T1", "LOCKDOWN_FAILED")]
    assert [i["ticker"] for i in final["waiting"]] == ["T2"]
    h.server.close()


def usage_limit_at_call(n: int):
    from tearsheet.ai.client import AIUsageLimit

    calls = []

    def limited(request):
        calls.append(request)
        return (
            AIUsageLimit("You've hit your limit. Resets 3am") if len(calls) == n else clean(request)
        )

    return limited


async def check_with_reports_waiting(h, ending: str, tool: str = "claude") -> None:
    """A check on `tool` that the person stops, or that a usage limit stops, with T1 and T2
    waiting in the line."""
    if ending == "unfinished":
        h.connector.default = usage_limit_at_call(3)
    await h.call("run_safety_check", {"tool": tool})
    await h.call("add_to_line", {"queries": ["T1", "T2"]}, id_=2)
    if ending == "stopped":
        await wait_for_progress(h, 1)
        await h.call("cancel_safety_check", id_=3)
    await h.server.wait_for_safety_check()


@pytest.mark.parametrize(
    ("ending", "code"),
    [("stopped", "SAFETY_CHECK_STOPPED"), ("unfinished", "SAFETY_CHECK_UNFINISHED")],
)
def test_a_check_that_doesnt_finish_on_a_never_checked_writing_tool_pauses_the_line(
    tmp_path, monkeypatch, fake_list, ending, code
):
    h = line_harness(tmp_path, monkeypatch)

    async def go():
        await check_with_reports_waiting(h, ending)
        await h.server.wait_for_line()

    run(go())
    done = h.notes("safety_done")[0]
    assert done["finished"] is False
    paused = h.notes("line_changed")[-1]
    assert paused["paused"]["code"] == code
    assert paused["paused"]["message"] == done["reason"]
    assert paused["paused"]["run_id"] is None
    # Paused before any report started: both still wait, and nothing was written or recorded.
    assert [i["ticker"] for i in paused["waiting"]] == ["T1", "T2"]
    assert paused["writing"] is None and paused["finished"] == []
    assert not h.notes("progress") and tool_rows(h) == []
    # The pause is kept, as any pause is, when Tearsheet closes.
    from tearsheet.batch import SETTING, ReportLine

    kept = ReportLine.loads(config.Settings(h.server.db.conn).get(SETTING))
    assert kept.paused.code == code
    h.server.close()


@pytest.mark.parametrize("ending", ["stopped", "unfinished"])
@pytest.mark.parametrize("case", ["checked before", "checking tool"])
def test_a_check_that_doesnt_finish_otherwise_changes_nothing(
    tmp_path, monkeypatch, fake_list, ending, case
):
    """A tool checked before keeps its short check before the next report; and the checking
    tool's check never holds up the writing tool's reports."""
    from tearsheet.ai.client import ToolState

    h = line_harness(
        tmp_path, monkeypatch, writing_tool="claude" if case == "checked before" else "codex"
    )
    if case == "checked before":
        ToolState(h.server.db.conn, "claude").record_check(
            version="1.0", model_ids=["m"], form="short", passed=True
        )

    async def go():
        await check_with_reports_waiting(h, ending)
        await h.server.wait_for_line()

    run(go())
    assert h.notes("safety_done")[0]["finished"] is False
    final = h.notes("line_changed")[-1]
    assert final["paused"] is None and final["waiting"] == []
    assert [(i["ticker"], i["outcome"]) for i in final["finished"]] == [
        ("T1", "ready"),
        ("T2", "ready"),
    ]
    h.server.close()


def test_neither_ending_replaces_a_pause_already_set(tmp_path, monkeypatch, fake_list):
    from tearsheet.batch import Pause

    h = line_harness(tmp_path, monkeypatch)

    async def go():
        await h.call("add_to_line", {"queries": ["T1"]})
        h.server.line.paused = Pause("USAGE_LIMIT", "Limit.", run_id="run-x")
        before = len(h.notes("line_changed"))
        h.connector.default = usage_limit_at_call(2)
        await h.call("run_safety_check", {"tool": "claude"}, id_=2)
        await h.server.wait_for_safety_check()
        return before

    before = run(go())
    assert h.notes("safety_done")[0]["finished"] is False
    assert h.server.line.paused.code == "USAGE_LIMIT" and h.server.line.paused.run_id == "run-x"
    assert len(h.notes("line_changed")) == before  # nothing changed, so nothing was said
    h.server.close()


def test_a_full_pass_carries_the_line_on_and_restarts_it(tmp_path, monkeypatch, fake_list):
    h = line_harness(tmp_path, monkeypatch)

    async def go():
        await check_with_reports_waiting(h, "stopped")
        await h.server.wait_for_line()
        paused = h.notes("line_changed")[-1]
        h.connector.default = clean
        await h.call("run_safety_check", {"tool": "claude"}, id_=4)
        await h.server.wait_for_safety_check()
        await h.server.wait_for_line()
        return paused

    paused = run(go())
    assert paused["paused"]["code"] == "SAFETY_CHECK_STOPPED"
    assert h.notes("safety_done")[-1]["passed"] is True
    final = h.notes("line_changed")[-1]
    assert final["paused"] is None and final["waiting"] == []
    assert [(i["ticker"], i["outcome"]) for i in final["finished"]] == [
        ("T1", "ready"),
        ("T2", "ready"),
    ]
    h.server.close()


def test_a_full_pass_keeps_a_lockdown_failed_pause_for_its_resume(tmp_path, monkeypatch, fake_list):
    from tearsheet.batch import Pause

    h = line_harness(tmp_path, monkeypatch)

    async def go():
        await h.call("add_to_line", {"queries": ["T1"]})
        h.server.line.paused = Pause("LOCKDOWN_FAILED", "Blocked.", run_id="run-x")
        await h.call("run_safety_check", {"tool": "claude"}, id_=2)
        await h.server.wait_for_safety_check()

    run(go())
    assert h.notes("safety_done")[0]["passed"] is True
    assert h.server.line.paused.code == "LOCKDOWN_FAILED"
    h.server.close()


def test_settings_show_the_check_under_way_and_the_new_services(tmp_path, monkeypatch):
    from tests.test_pipeline import NOW

    h = safety_harness(tmp_path, monkeypatch, delay_s=0.02)

    async def go():
        before = await h.call("get_settings")
        await h.call("run_safety_check", {"tool": "claude"}, id_=2)
        just_started = await h.call("get_settings", id_=3)
        await wait_for_progress(h, 3)
        during = await h.call("get_settings", id_=4)
        await h.server.wait_for_safety_check()
        after = await h.call("get_settings", id_=5)
        return before, just_started, during, after

    before, just_started, during, after = run(go())
    started_at = NOW.isoformat(timespec="seconds")
    assert before["result"]["safety_running"] is None
    assert just_started["result"]["safety_running"] == {
        "tool": "claude",
        "n": 0,
        "total": 25,
        "started_at": started_at,
    }
    running = during["result"]["safety_running"]
    assert running["n"] >= 3 and running["total"] == 25 and running["started_at"] == started_at
    assert after["result"]["safety_running"] is None
    for reply in (before, during, after):
        SettingsResult.model_validate(reply["result"])
    names = [s["name"] for s in after["result"]["services"]]
    assert "GitHub (Tearsheet's off switch)" in names
    assert "claude.ai and chatgpt.com install scripts" in names
    off_switch = next(s for s in after["result"]["services"] if s["name"].startswith("GitHub"))
    assert off_switch["key"] == "None" and off_switch["cost"] == "Free"
    assert "no personal data" in off_switch["sent"]
    h.server.close()


# --- a test copy (config.test_mode(), first-run design §6) ------------------------------------


@pytest.fixture
def copy_state(tmp_path, monkeypatch):
    """The test folder a test copy runs from, with its state file; returns a setter for it."""
    folder = tmp_path / "test-tools"
    folder.mkdir()
    monkeypatch.setenv(config.TEST_TOOLS_ENV, str(folder))
    monkeypatch.setenv(config.CLAUDE_BIN_ENV, str(folder / "tools" / "claude"))
    monkeypatch.setenv(config.KEYCHAIN_SERVICE_ENV, "Tearsheet-test")

    def state(**values: str) -> None:
        (folder / "state").write_text("".join(f"{k}={v}\n" for k, v in values.items()))

    state(claude="signed_in")
    return state


def copy_harness(tmp_path, monkeypatch):
    """The safety harness in a test copy: no AI tool or data may be reached at all."""
    from tearsheet.ai.client import ToolState

    h = line_harness(tmp_path, monkeypatch)
    h.server.canned_check_step_s = 0

    def never(*args):
        raise AssertionError("a test copy reached an AI tool or data")

    h.server.safety_connector_factory = never
    h.server.ai_factory = never
    h.server.data_factory = never
    h.recorded = []
    monkeypatch.setattr(ToolState, "record_check", lambda self, **kw: h.recorded.append(kw))
    return h


@pytest.mark.parametrize(
    ("ending", "passed", "finished", "code"),
    [
        ("pass", True, True, None),
        ("fail", False, True, "LOCKDOWN_FAILED"),
        ("unfinished", False, False, "SAFETY_CHECK_UNFINISHED"),
    ],
)
def test_the_canned_check_ends_as_the_state_file_says_and_records_nothing(
    tmp_path, monkeypatch, fake_list, copy_state, ending, passed, finished, code
):
    from tearsheet.ai.lockdown import load_prompts

    if ending != "pass":  # pass is also what a state file without check= gives
        copy_state(claude="signed_in", check=ending)
    h = copy_harness(tmp_path, monkeypatch)

    async def go():
        await h.call("run_safety_check", {"tool": "claude"})
        await h.call("add_to_line", {"queries": ["T1"]}, id_=2)
        await h.server.wait_for_safety_check()
        await h.server.wait_for_line()

    run(go())
    progress = h.notes("safety_progress")
    prompts = load_prompts()
    assert [p["name"] for p in progress] == [p.name for p in prompts.probes + prompts.link_probes]
    assert [p["n"] for p in progress] == list(range(1, 26))
    [done] = h.notes("safety_done")
    assert (done["passed"], done["finished"]) == (passed, finished)
    assert h.recorded == [] and tool_rows(h) == []
    assert not list((tmp_path / "data" / "logs").glob("lockdown-*.json"))
    final = h.notes("line_changed")[-1]
    if code is None:
        # Passed: the report runs, and ends at once as a test copy's does.
        assert final["paused"] is None
        assert [(i["ticker"], i["code"]) for i in final["finished"]] == [("T1", "TEST_COPY")]
    else:
        assert final["paused"]["code"] == code and final["paused"]["message"] == done["reason"]
        assert [i["ticker"] for i in final["waiting"]] == ["T1"]
    h.server.close()


def test_the_canned_check_can_be_stopped(tmp_path, monkeypatch, fake_list, copy_state):
    h = copy_harness(tmp_path, monkeypatch)
    h.server.canned_check_step_s = 0.01

    async def go():
        await h.call("run_safety_check", {"tool": "claude"})
        await h.call("add_to_line", {"queries": ["T1"]}, id_=2)
        await wait_for_progress(h, 2)
        stopping = await h.call("cancel_safety_check", id_=3)
        await h.server.wait_for_safety_check()
        return stopping

    assert run(go())["result"] == {"stopping": True}
    assert len(h.notes("safety_progress")) < 25
    assert h.notes("safety_done")[0]["finished"] is False
    assert h.server.line.paused.code == "SAFETY_CHECK_STOPPED"
    assert h.recorded == []
    h.server.close()


def test_a_test_copys_reports_end_before_any_data_or_ai_call(
    tmp_path, monkeypatch, fake_list, copy_state
):
    from tearsheet.protocol import RunFailedNote

    h = copy_harness(tmp_path, monkeypatch)

    async def go():
        started = await h.call("run_report", {"query": "T0"})
        await h.finish()
        await h.call("add_to_line", {"queries": ["T1", "T2"]}, id_=2)
        await h.server.wait_for_line()
        # Not held back by a check either: it ends at once.
        h.server.canned_check_step_s = 0.01
        await h.call("run_safety_check", {"tool": "claude"}, id_=3)
        during = await h.call("run_report", {"query": "T0"}, id_=4)
        await h.server.wait_for_safety_check()
        return started, during

    started, during = run(go())
    assert started["result"]["run_id"].startswith("run-") and started["result"]["ticker"] is None
    assert "result" in during
    failed = h.notes("run_failed")
    assert len(failed) == 4 and all(f["code"] == "TEST_COPY" for f in failed)
    assert failed[0] == {
        "run_id": started["result"]["run_id"],
        "step": None,
        "message": "Reports are off in a test copy.",
        "code": "TEST_COPY",
        "reset_at": None,
        "fix_command": None,
    }
    RunFailedNote.model_validate(failed[0])
    # The reply came first, then the note.
    reply_at = next(k for k, m in enumerate(h.messages) if m.get("id") == 1)
    note_at = next(k for k, m in enumerate(h.messages) if m.get("method") == "run_failed")
    assert reply_at < note_at
    assert not h.notes("report_ready") and not h.notes("progress")
    final = h.notes("line_changed")[-1]
    assert final["paused"] is None  # each company is marked, and the line moves on
    assert [(i["ticker"], i["outcome"], i["code"]) for i in final["finished"]] == [
        ("T1", "failed", "TEST_COPY"),
        ("T2", "failed", "TEST_COPY"),
    ]
    assert h.server.db.conn.execute("SELECT COUNT(*) FROM runs").fetchone()[0] == 0
    h.server.close()


def test_a_test_copy_never_grades_or_downloads_prices(tmp_path, monkeypatch, copy_state):
    from tearsheet.server import Server

    messages: list[dict] = []

    @asynccontextmanager
    async def http_factory(run_id, conn, rawstore):
        async with HttpClient(rawstore, run_id, sleep=lambda s: asyncio.sleep(0)) as http:
            yield http

    config.set_key("massive", "stored-key")
    server = Server(
        config.Paths(tmp_path / "data"),
        write=messages.append,
        http_factory=http_factory,
        backfill=True,
    )
    # The harness's request helper, on this server (the harness's own injects data, which
    # turns the price download off by itself).
    h = Harness.__new__(Harness)
    h.messages, h.server = messages, server

    async def go():
        await server.start()
        await h.call("set_key", {"service": "massive", "key": "new-key"})
        with respx.mock:
            respx.get(url__startswith=MASSIVE_URL).mock(
                return_value=httpx.Response(200, json=bars())
            )
            checked = await h.call("check_key", {"service": "massive", "key": "good-key"}, id_=2)
        graded = await h.call("grade_due", id_=3)
        return checked, graded

    checked, graded = run(go())
    assert server.backfill_enabled is False and server.backfill_job is None
    assert checked["result"]["proof"].startswith("Works.")
    assert graded["result"] == {
        "graded": 0,
        "note": "Nothing is due: grading is off in a test copy.",
    }
    assert server.grading_job is None
    # The key went to the test copy's own Keychain name.
    assert config.keychain_service() == "Tearsheet-test" and config.get_key("massive") == "good-key"
    server.close()


def test_a_program_path_alone_is_not_a_test_copy(tmp_path, monkeypatch):
    from tearsheet.server import Server

    monkeypatch.setenv(config.CLAUDE_BIN_ENV, str(tmp_path / "tools" / "claude"))
    assert not config.test_mode()
    server = Server(config.Paths(tmp_path / "other"), write=lambda m: None, backfill=True)
    assert server.backfill_enabled is True
    server.close()
    h = safety_harness(tmp_path, monkeypatch)

    async def go():
        await h.call("run_safety_check", {"tool": "claude"})
        await h.server.wait_for_safety_check()
        await h.call("run_report", {"query": "T0"}, id_=2)
        await h.finish()

    run(go())
    assert h.notes("safety_done")[0]["passed"] is True
    assert len(h.connector.requests) == 25  # the real check, on the tool
    assert ("claude", "full") in tool_rows(h)
    assert h.notes("report_ready") and not h.notes("run_failed")
    h.server.close()
