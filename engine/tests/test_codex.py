"""The Codex connector against a scripted fake `codex app-server` (design items 10 and 13)."""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

import pytest

from tearsheet import config
from tearsheet.ai import codex as codex_module
from tearsheet.ai.client import (
    SYSTEM_PROMPT,
    SYSTEM_PROMPT_WEB_SEARCH,
    AIAuthError,
    AILockdownFailed,
    AIToolUseAttempt,
    AIUnavailable,
    AIUsageLimit,
    CallRequest,
    Source,
    classify_error,
    parse_answer,
)
from tearsheet.ai.codex import CodexConnector, build_env, error_text
from tearsheet.ai.schemas import LinkList, LockdownProbe

FAKE = Path(__file__).parent / "fakes" / "codex_app_server.py"
ANSWER = json.dumps({"summary": "The filing describes a supplier.", "has_instructions": False})


class Fake:
    """One fake Codex program, its scenario and its log."""

    def __init__(self, tmp_path: Path, scenario: dict | None = None):
        self.dir = tmp_path
        self.program = tmp_path / "codex"
        self.program.write_text(f'#!/bin/sh\nexec "{sys.executable}" "{FAKE}" "$@"\n')
        self.program.chmod(0o700)
        self.scenario_path = tmp_path / "scenario.json"
        self.log_path = tmp_path / "codex-log.jsonl"
        self.calls_root = tmp_path / "calls"
        self.set(scenario or {})

    def set(self, scenario: dict) -> None:
        self.scenario_path.write_text(json.dumps(scenario))

    def connector(self, **kwargs) -> CodexConnector:
        environ = {
            "PATH": os.environ["PATH"],
            "HOME": str(self.dir),
            "OPENAI_API_KEY": "sk-not-to-be-passed",
            "ANTHROPIC_API_KEY": "sk-ant-not-to-be-passed",
            "SOME_SECRET": "hunter2",
            **kwargs.pop("environ", {}),
        }
        return CodexConnector(
            self.program,
            calls_root=self.calls_root,
            environ=environ,
            extra_env={
                "FAKE_CODEX_SCENARIO": str(self.scenario_path),
                "FAKE_CODEX_LOG": str(self.log_path),
            },
            **kwargs,
        )

    def log(self, kind: str | None = None) -> list:
        if not self.log_path.exists():
            return []
        rows = [json.loads(line) for line in self.log_path.read_text().splitlines()]
        return [r["data"] for r in rows if kind is None or r["kind"] == kind]

    def sent(self, method: str) -> list[dict]:
        return [m for m in self.log("received") if m.get("method") == method]


def request(*, web_search: bool = False, schema=LockdownProbe, model: str | None = None):
    return CallRequest(
        task="link_search" if web_search else "extract",
        instructions="Summarise the source.",
        sources=[Source("p1", "The company buys chips from one supplier.")],
        schema=LinkList if web_search else schema,
        allow_web_search=web_search,
        model=model,
    )


def ask(connector: CodexConnector, req: CallRequest, *, limit: float = 20):
    async def go():
        try:
            return await asyncio.wait_for(connector.call(req), limit)
        finally:
            await connector.aclose()

    return asyncio.run(go())


def test_a_clean_call_is_locked_down_and_returns_the_answer(tmp_path):
    fake = Fake(tmp_path, {"threads": [{"model": "gpt-5-codex", "turn": {"text": ANSWER}}]})
    answer = ask(fake.connector(), request())

    assert parse_answer(LockdownProbe, answer).summary.startswith("The filing")
    assert answer.model_id == "gpt-5-codex"
    assert answer.auth_source == "chatgpt"
    assert answer.tool_events == [] and answer.denied_tools == []
    assert answer.tool_servers == []
    assert answer.tokens == {
        "inputTokens": 120,
        "outputTokens": 30,
        "cachedInputTokens": 0,
        "reasoningOutputTokens": 5,
        "totalTokens": 150,
    }

    # Start-up: the tools and the user's setup are switched off.
    [argv] = fake.log("argv")
    assert argv[0] == "app-server"
    for feature in ("shell_tool", "unified_exec", "apps", "plugins", "hooks", "memories"):
        assert ["--disable", feature] == argv[argv.index(feature) - 1 : argv.index(feature) + 1]
    for override in ("project_doc_max_bytes=0", 'web_search="disabled"'):
        assert ["-c", override] == argv[argv.index(override) - 1 : argv.index(override) + 1]

    # The handshake, then one locked-down thread.
    [init] = fake.sent("initialize")
    assert init["params"]["clientInfo"]["name"] == "tearsheet"
    assert fake.sent("initialized")
    [thread] = fake.sent("thread/start")
    params = thread["params"]
    assert params["sandbox"] == "read-only"
    assert params["approvalPolicy"] == "untrusted"
    assert params["approvalsReviewer"] == "user"
    assert params["ephemeral"] is True
    assert params["baseInstructions"] == SYSTEM_PROMPT
    assert params["config"] == {"web_search": "disabled"}
    assert "model" not in params  # Codex's own default until Phase 0 names one
    workdir = Path(params["cwd"])
    assert workdir.parent == fake.calls_root and not workdir.exists()  # deleted afterwards
    [turn] = fake.sent("turn/start")
    assert "<source" in turn["params"]["input"][0]["text"]
    # The account's email was never kept.
    assert "someone@example.com" not in json.dumps(answer.session)


def test_the_environment_is_the_allowlist_only(tmp_path):
    fake = Fake(tmp_path, {"threads": [{"turn": {"text": ANSWER}}]})
    ask(fake.connector(environ={"CODEX_HOME": str(tmp_path / "codex-home")}), request())
    [names] = fake.log("env")
    assert "CODEX_HOME" in names and "HOME" in names
    for secret in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "SOME_SECRET"):
        assert secret not in names

    environ = {"PATH": "/bin", "OPENAI_API_KEY": "sk-1", "SOME_SECRET": "x"}
    assert "OPENAI_API_KEY" not in build_env(environ)
    assert build_env(environ, api_billing=True)["OPENAI_API_KEY"] == "sk-1"
    assert build_env({**environ, config.PATH_ENV: "/app/path"})["PATH"] == "/app/path"


def test_its_requests_are_told_apart_from_replies_and_approvals_are_denied(tmp_path):
    # Codex's approval request has id 0; our own initialize request had id 1.
    fake = Fake(
        tmp_path,
        {
            "threads": [
                {
                    "turn": {
                        "request": {
                            "method": "item/commandExecution/requestApproval",
                            "params": {"itemId": "c1", "command": "cat ~/.ssh/id_ed25519"},
                        },
                        "text": ANSWER,
                    }
                }
            ]
        },
    )
    with pytest.raises(AIToolUseAttempt) as caught:
        ask(fake.connector(), request())
    assert "item/commandExecution/requestApproval" in caught.value.tools
    [reply] = fake.log("approval_reply")
    assert reply["id"] == 0 and reply["result"] == {"decision": "cancel"}


@pytest.mark.parametrize(
    "method",
    ["item/fileChange/requestApproval", "item/tool/call", "item/permissions/requestApproval"],
)
def test_every_kind_of_request_is_refused(tmp_path, method):
    fake = Fake(tmp_path, {"threads": [{"turn": {"request": {"method": method}, "text": ANSWER}}]})
    with pytest.raises(AIToolUseAttempt):
        ask(fake.connector(), request())
    [reply] = fake.log("approval_reply")
    assert "error" in reply or reply["result"] in (
        {"decision": "cancel"},
        {"contentItems": [], "success": False},
    )


@pytest.mark.parametrize(
    "item",
    [
        {"type": "commandExecution", "command": "ls ~", "status": "completed"},
        {"type": "fileChange", "changes": [], "status": "completed"},
        {"type": "mcpToolCall", "server": "s", "tool": "t", "status": "completed"},
        {"type": "imageView", "path": "/etc/hosts"},
        {"type": "somethingNew"},
    ],
)
def test_command_file_and_tool_events_are_tool_use(tmp_path, item):
    fake = Fake(tmp_path, {"threads": [{"turn": {"items": [item], "text": ANSWER}}]})
    with pytest.raises(AIToolUseAttempt) as caught:
        ask(fake.connector(), request())
    assert caught.value.tools == (item["type"],)


def test_web_search_is_allowed_only_on_the_link_search_thread(tmp_path):
    links = json.dumps(
        {"links": [{"url": "https://example.com/a", "title": "A", "publisher": "P"}]}
    )
    search = {"type": "webSearch", "query": "company news"}
    fake = Fake(
        tmp_path,
        {
            "threads": [
                {"turn": {"items": [search], "text": links}},
                {"turn": {"items": [search], "text": ANSWER}},
            ]
        },
    )
    connector = fake.connector()

    async def go():
        try:
            found = await connector.call(request(web_search=True))
            with pytest.raises(AIToolUseAttempt):
                await connector.call(request())
            return found
        finally:
            await connector.aclose()

    found = asyncio.run(go())
    assert found.tool_events == ["webSearch"]
    first, second = fake.sent("thread/start")
    assert first["params"]["config"] == {"web_search": "live"}
    assert first["params"]["baseInstructions"] == SYSTEM_PROMPT_WEB_SEARCH
    assert second["params"]["config"] == {"web_search": "disabled"}
    assert len(fake.log("argv")) == 1  # one app-server for the whole run


def test_relogin_at_thread_start_becomes_a_sign_in_error(tmp_path):
    fake = Fake(
        tmp_path,
        {
            "threads": [
                {
                    "start_error": {
                        "message": "Your access token could not be refreshed.",
                        "data": {"action": "relogin"},
                    }
                }
            ]
        },
    )
    with pytest.raises(AIAuthError) as caught:
        ask(fake.connector(), request())
    assert caught.value.fix == "codex login"
    assert "codex login" in str(caught.value)


def test_a_signed_out_account_is_a_sign_in_error(tmp_path):
    fake = Fake(tmp_path, {"account": {"account": None, "requiresOpenaiAuth": True}})
    with pytest.raises(AIAuthError):
        ask(fake.connector(), request())


def _client_ask(connector: CodexConnector, database, *, api_billing: bool = False):
    from tearsheet.ai.client import AIClient, ToolState

    client = AIClient(connector, ToolState(database.conn, "codex"), api_billing=api_billing)

    async def go():
        try:
            return await asyncio.wait_for(
                client.structured(
                    task="extract", instructions="x", sources=[], schema=LockdownProbe
                ),
                20,
            )
        finally:
            await connector.aclose()

    return asyncio.run(go())


# --- failing closed (security audit, 9 Nov 2026) -------------------------------------------


def test_each_thread_is_checked_for_its_tools_before_the_turn(tmp_path):
    fake = Fake(tmp_path, {"threads": [{"turn": {"text": ANSWER}}]})
    answer = ask(fake.connector(), request())
    lists = fake.sent("experimentalFeature/list")
    # Both pages, each for the new thread.
    assert [m["params"].get("cursor") for m in lists] == [None, "p2"]
    assert {m["params"]["threadId"] for m in lists} == {"thread-1"}
    assert answer.session["features_still_on"] == ["unified_exec"]


@pytest.mark.parametrize(
    ("scenario", "words"),
    [
        ({"features_on": ["shell_tool"]}, "`shell_tool` is still on"),
        ({"features_on": ["apps"]}, "`apps` is still on"),
        ({"extra_features": ["code_mode"], "extra_features_on": ["code_mode"]}, "`code_mode`"),
        ({"unknown_to_list": ["shell_tool"]}, "doesn't know the switch `shell_tool`"),
        ({"unknown_to_list": ["goals"]}, "doesn't know the switch `goals`"),
        ({"no_feature_list": True}, "didn't list its features"),
    ],
)
def test_a_thread_whose_tools_arent_confirmed_off_never_runs(tmp_path, scenario, words):
    fake = Fake(tmp_path, {**scenario, "threads": [{"turn": {"text": ANSWER}}]})
    with pytest.raises(AILockdownFailed) as caught:
        ask(fake.connector(), request())
    assert words in str(caught.value)
    assert fake.sent("thread/start") and not fake.sent("turn/start")


def test_a_switch_codex_doesnt_know_at_start_up_is_a_lockdown_failure(tmp_path):
    fake = Fake(tmp_path, {"unknown_flags": ["sleep_tool"], "threads": [{"turn": {"text": "{}"}}]})
    with pytest.raises(AILockdownFailed) as caught:
        ask(fake.connector(), request())
    assert "Unknown feature flag: sleep_tool" in str(caught.value)
    assert not fake.sent("thread/start")


def test_the_lockdown_rules_on_their_own():
    every = {n: False for n in codex_module.DISABLED_FEATURES}
    assert codex_module.lockdown_problems({**every, "unified_exec": True}) == []
    assert codex_module.lockdown_problems({**every, "shell_tool": True}) == [
        "`shell_tool` is still on"
    ]
    assert codex_module.lockdown_problems({}) == [
        f"Codex doesn't know the switch `{n}`" for n in codex_module.DISABLED_FEATURES
    ]
    assert codex_module.lockdown_problems({**every, "js_repl": True}) == ["`js_repl` is still on"]


def test_a_sign_in_that_isnt_a_plan_is_turned_down_before_any_call(tmp_path, database):
    from tearsheet.ai.client import ToolState

    api_key = {"account": {"account": {"type": "apiKey"}, "requiresOpenaiAuth": True}}
    fake = Fake(tmp_path, {**api_key, "threads": [{"turn": {"text": ANSWER}}]})
    with pytest.raises(AIAuthError) as caught:
        _client_ask(fake.connector(), database)
    assert caught.value.fix == "codex login"
    assert fake.sent("account/read") and not fake.sent("thread/start")
    assert ToolState(database.conn, "codex").row() is None  # the gate's check never ran

    # With API billing chosen, the same sign-in is used.
    ToolState(database.conn, "codex").record_check(
        version="codex-cli 0.165.0", model_ids=["m"], form="full", passed=True
    )
    fake.set({**api_key, "threads": [{"turn": {"text": ANSWER}}]})
    reply = _client_ask(fake.connector(api_billing=True), database, api_billing=True)
    assert reply.summary.startswith("The filing")


def test_errors_are_told_apart_by_message_and_data_never_the_code():
    # Both use -32600, as every Codex error does.
    limit = error_text(
        {
            "code": -32600,
            "message": "You've hit your usage limit.",
            "codexErrorInfo": "usageLimitExceeded",
        }
    )
    busy = error_text(
        {"code": -32600, "message": "Try again shortly.", "codexErrorInfo": "serverOverloaded"}
    )
    assert isinstance(classify_error("codex", limit), AIUsageLimit)
    assert isinstance(classify_error("codex", busy), AIUnavailable)
    assert "-32600" not in limit


def test_a_usage_limit_carries_the_reset_time(tmp_path):
    fake = Fake(
        tmp_path,
        {
            "threads": [
                {
                    "turn": {
                        "rate_limits": {
                            "primary": {"usedPercent": 100, "resetsAt": 1793768400},
                            "rateLimitReachedType": "primary",
                        },
                        "status": "failed",
                        "error": {
                            "message": "You've hit your usage limit.",
                            "codexErrorInfo": "usageLimitExceeded",
                        },
                    }
                }
            ]
        },
    )
    with pytest.raises(AIUsageLimit) as caught:
        ask(fake.connector(), request())
    assert caught.value.reset_at == "2026-11-04T05:00:00+00:00"


def test_standard_error_is_read_so_the_program_never_stalls(tmp_path):
    # Two megabytes on standard error, far more than a pipe holds, before the first reply.
    fake = Fake(tmp_path, {"stderr_bytes": 2_000_000, "threads": [{"turn": {"text": ANSWER}}]})
    answer = ask(fake.connector(), request(), limit=20)
    assert answer.text == ANSWER


def test_a_program_that_stops_is_reported_and_started_again(tmp_path):
    fake = Fake(tmp_path, {"threads": [{"turn": {"exit": True}}, {"turn": {"text": ANSWER}}]})
    connector = fake.connector()

    async def go():
        try:
            with pytest.raises(AIUnavailable) as caught:
                await connector.call(request())
            fake.set({"threads": [{"turn": {"text": ANSWER}}]})
            return caught.value, await connector.call(request())
        finally:
            await connector.aclose()

    error, answer = asyncio.run(go())
    assert "exited" in (error.raw or "") and "stopped on purpose" in (error.raw or "")
    assert answer.text == ANSWER
    assert len(fake.log("argv")) == 2


def test_a_call_that_runs_out_of_time_interrupts_its_turn(tmp_path):
    fake = Fake(tmp_path, {"threads": [{"turn": {"hang": True}}]})
    connector = fake.connector()

    async def go():
        try:
            with pytest.raises(TimeoutError):
                await asyncio.wait_for(connector.call(request()), 2)
            await asyncio.sleep(0.3)
        finally:
            await connector.aclose()

    asyncio.run(go())
    [interrupt] = fake.sent("turn/interrupt")
    assert interrupt["params"]["threadId"] == "thread-1"


def test_the_users_own_tool_servers_are_switched_off_by_name(tmp_path):
    # As on Liam's Mac: two servers in his Codex settings, not from any plugin.
    fake = Fake(
        tmp_path,
        {"mcp_servers": ["computer-use", "node_repl"], "threads": [{"turn": {"text": ANSWER}}]},
    )
    answer = ask(fake.connector(), request())
    assert answer.tool_servers == []
    assert answer.session["servers_switched_off"] == ["computer-use", "node_repl"]
    first, second = fake.log("argv")
    assert not any(a.startswith("mcp_servers=") for a in first)
    assert 'mcp_servers={"computer-use"={enabled=false},"node_repl"={enabled=false}}' in second


def test_a_tool_server_that_stays_on_fails_the_check(tmp_path):
    fake = Fake(
        tmp_path,
        {"mcp_servers": ["github"], "ignore_switch": True, "threads": [{"turn": {"text": ANSWER}}]},
    )
    answer = ask(fake.connector(), request())
    assert answer.tool_servers == ["github"]


def test_close_stops_the_program_outside_its_event_loop(tmp_path, monkeypatch):
    fake = Fake(tmp_path, {"threads": [{"turn": {"text": ANSWER}}]})
    connector = fake.connector()

    async def go():
        await connector.call(request())
        return connector._process.pid

    pid = asyncio.run(go())
    killed = []
    monkeypatch.setattr(codex_module.os, "kill", lambda p, s: killed.append((p, s)))
    connector.close()
    assert killed == [(pid, codex_module.signal.SIGKILL)]
    os.kill(pid, 9)  # the real kill, so the test leaves nothing running


def test_version(tmp_path):
    fake = Fake(tmp_path, {"version": "codex-cli 0.165.0"})
    assert asyncio.run(fake.connector().version()) == "codex-cli 0.165.0"


def test_the_engine_builds_a_codex_connector_when_codex_is_found(tmp_path, monkeypatch, database):
    from tearsheet.ai import connector_for

    monkeypatch.setattr(config, "find_program", lambda tool: tmp_path / tool)
    connector = connector_for("codex", config.Settings(database.conn))
    assert isinstance(connector, CodexConnector)
    assert connector.models == config.CODEX_MODELS
    assert codex_module.SUBSCRIPTION_SIGN_IN == connector.subscription_auth_sources


def test_the_lock_down_check_flags_loaded_instruction_files(tmp_path):
    from tearsheet.ai.lockdown import Probe, evaluate, plant_bait, remove_bait

    fake = Fake(
        tmp_path,
        {
            "threads": [
                {"instruction_sources": ["/Users/x/.codex/AGENTS.md"], "turn": {"text": ANSWER}}
            ]
        },
    )
    connector = fake.connector()
    answer = ask(connector, request())
    bait = plant_bait(tmp_path / "bait", tmp_path)
    try:
        result = evaluate(Probe("probe 1", "x"), answer, bait, connector, api_billing=False)
    finally:
        remove_bait(bait)
    assert any("instruction files loaded" in p for p in result.problems)


PLUGINS = {"computer-use@openai-bundled": ["computer-use"], "browser@openai-bundled": ["node_repl"]}


def test_the_users_plugins_are_switched_off_with_no_new_sign_in(tmp_path):
    fake = Fake(tmp_path, {"plugins": PLUGINS, "threads": [{"turn": {"text": ANSWER}}]})
    answer = ask(fake.connector(), request())

    assert answer.tool_servers == []
    assert answer.session["plugins_switched_off"] == sorted(PLUGINS)
    assert answer.session["servers_switched_off"] == []  # a plugin's servers go with it
    # Started once to see the plugins, then again with them switched off by name.
    first, second = fake.log("argv")
    assert not any(a.startswith("plugins=") for a in first)
    override = second[second.index("-c", second.index("include_apply_patch_tool=false")) + 1]
    assert override == (
        'plugins={"browser@openai-bundled"={enabled=false},'
        '"computer-use@openai-bundled"={enabled=false}}'
    )
    [turn] = fake.sent("turn/start")
    assert turn["params"]["disabledPluginIds"] == sorted(PLUGINS)
    # The sign-in folder is the user's own: no CODEX_HOME was set or moved.
    assert all("CODEX_HOME" not in names for names in fake.log("env"))


def test_a_plugin_that_stays_on_fails_the_check(tmp_path):
    fake = Fake(
        tmp_path,
        {"plugins": PLUGINS, "ignore_switch": True, "threads": [{"turn": {"text": ANSWER}}]},
    )
    answer = ask(fake.connector(), request())
    assert sorted(answer.tool_servers) == ["computer-use", "node_repl"]
    assert len(fake.log("argv")) == 2  # one restart, not a loop


def test_an_older_codex_without_the_plugin_request_still_works(tmp_path):
    fake = Fake(tmp_path, {"no_plugin_request": True, "threads": [{"turn": {"text": ANSWER}}]})
    answer = ask(fake.connector(), request())
    assert answer.text == ANSWER and len(fake.log("argv")) == 1
    [turn] = fake.sent("turn/start")
    assert "disabledPluginIds" not in turn["params"]


def test_only_the_users_own_instruction_file_is_allowed(tmp_path):
    from tearsheet.ai.lockdown import Probe, evaluate, plant_bait, remove_bait

    home = tmp_path / "codex-home"
    own = str(home / "AGENTS.md")
    planted = str(tmp_path / "calls" / "AGENTS.md")
    fake = Fake(
        tmp_path,
        {
            "codex_home": str(home),
            "threads": [
                {"instruction_sources": [own], "turn": {"text": ANSWER}},
                {"instruction_sources": [own, planted], "turn": {"text": ANSWER}},
            ],
        },
    )
    connector = fake.connector()

    async def go():
        try:
            return await connector.call(request()), await connector.call(request())
        finally:
            await connector.aclose()

    first, second = asyncio.run(go())
    assert first.session["user_instruction_files"] == [own]
    assert first.session["instruction_sources"] == []
    assert second.session["instruction_sources"] == [planted]

    bait = plant_bait(tmp_path / "bait", tmp_path)
    try:
        ok = evaluate(Probe("probe 1", "x"), first, bait, connector, api_billing=False)
        bad = evaluate(Probe("probe 2", "x"), second, bait, connector, api_billing=False)
    finally:
        remove_bait(bait)
    assert not any("instruction files" in p for p in ok.problems)
    assert any(planted in p for p in bad.problems)
    # Codex is told the user's file doesn't apply.
    for thread in fake.sent("thread/start"):
        assert "AGENTS.md" in thread["params"]["developerInstructions"]


def test_the_plugin_override_is_valid_toml():
    import tomllib

    from tearsheet.ai.codex import plugin_override

    value = plugin_override(["computer-use@openai-bundled", 'odd"name@x'])
    assert tomllib.loads(value)["plugins"] == {
        "computer-use@openai-bundled": {"enabled": False},
        'odd"name@x': {"enabled": False},
    }


def test_a_listed_server_counts_as_loaded_only_with_tools_or_running():
    from tearsheet.ai.codex import loaded_servers

    reply = {
        "data": [
            {"name": "off", "runtimeStatus": None, "tools": []},
            {"name": "has-tools", "runtimeStatus": None, "tools": [{"name": "t"}]},
            {"name": "up", "runtimeStatus": "connected", "tools": []},
            {"name": "broken", "runtimeStatus": "failed", "tools": []},
        ]
    }
    assert loaded_servers(reply) == ["has-tools", "up"]
