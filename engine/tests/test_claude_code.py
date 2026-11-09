"""The Claude Code connector, with the Agent SDK stubbed (design item 13: test_claude_code.py)."""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
from pathlib import Path

import pytest
from claude_agent_sdk import (
    AssistantMessage,
    PermissionResultAllow,
    PermissionResultDeny,
    ResultMessage,
    SystemMessage,
    TextBlock,
    ToolPermissionContext,
    ToolUseBlock,
)

from tearsheet.ai import claude_code
from tearsheet.ai.claude_code import ClaudeCodeConnector, build_env, launcher_script
from tearsheet.ai.client import (
    SYSTEM_PROMPT,
    SYSTEM_PROMPT_WEB_SEARCH,
    AIAuthError,
    AIToolUseAttempt,
    AIUsageLimit,
    CallRequest,
    Source,
)
from tearsheet.ai.schemas import LinkList, LockdownProbe

ENVIRON = {
    "PATH": "/usr/bin:/bin",
    "HOME": "/Users/test",
    "LANG": "en_US.UTF-8",
    "ANTHROPIC_API_KEY": "sk-should-not-pass",
    "OPENAI_API_KEY": "sk-also-not",
    "GITHUB_TOKEN": "ghp-nope",
}
# The user's own Claude Code folder, when they moved it: its sign-in is there.
CONFIG_DIR = {"CLAUDE_CONFIG_DIR": "/Users/test/elsewhere"}
GOOD = LockdownProbe(summary="Sales rose.", has_instructions=False)


def init(**overrides) -> SystemMessage:
    data = {
        "type": "system",
        "subtype": "init",
        "apiKeySource": "none",
        "tools": [],
        "mcp_servers": [],
        "model": "claude-haiku-test",
        "skills": [],
        "plugins": [],
    }
    data.update(overrides)
    return SystemMessage(subtype="init", data=data)


def result(text: str | None, *, is_error: bool = False, denials=None) -> ResultMessage:
    return ResultMessage(
        subtype="error_during_execution" if is_error else "success",
        duration_ms=10,
        duration_api_ms=8,
        is_error=is_error,
        num_turns=1,
        session_id="s",
        result=text,
        usage={"input_tokens": 120, "output_tokens": 30, "service_tier": "standard"},
        permission_denials=denials,
    )


class StubSDK:
    """Stands in for `claude_agent_sdk.query`: records the call and replays messages."""

    def __init__(self, messages=None, *, before=None):
        self.messages = messages
        self.before = before
        self.options = None
        self.prompt = None
        self.cwd_existed = None

    def __call__(self, *, prompt, options):
        self.prompt, self.options = prompt, options
        self.cwd_existed = Path(options.cwd).is_dir()

        async def stream():
            if self.before:
                await self.before(options)
            for message in (
                self.messages
                if self.messages is not None
                else [
                    init(),
                    AssistantMessage(
                        content=[TextBlock(text=GOOD.model_dump_json())], model="claude-haiku-test"
                    ),
                    result(GOOD.model_dump_json()),
                ]
            ):
                yield message

        return stream()


def connector(tmp_path: Path, stub: StubSDK, **kwargs) -> ClaudeCodeConnector:
    return ClaudeCodeConnector(
        Path("/opt/claude/bin/claude"),
        calls_root=tmp_path / "tearsheet-calls",
        environ=ENVIRON,
        query_fn=stub,
        **kwargs,
    )


def request(*, web: bool = False) -> CallRequest:
    return CallRequest(
        task="link_search" if web else "extract",
        instructions="Summarise.",
        sources=[Source("p1", "Revenue rose.")],
        schema=LinkList if web else LockdownProbe,
        allow_web_search=web,
        model="sonnet" if web else "haiku",
    )


def context() -> ToolPermissionContext:
    return ToolPermissionContext(tool_use_id="t1")


# --- the options passed ------------------------------------------------------------------------


def test_options_offer_no_tools_and_load_no_settings(tmp_path):
    stub = StubSDK()
    c = connector(tmp_path, stub)
    raw = asyncio.run(c.call(request()))
    options = stub.options
    assert options.tools == [] and getattr(options, claude_code.OFFERED_TOOLS_OPTION) == []
    assert options.setting_sources == []
    assert options.allowed_tools == []
    assert options.strict_mcp_config is True
    assert options.system_prompt == SYSTEM_PROMPT
    assert options.model == "haiku"
    assert claude_code.NO_SESSION_HISTORY_FLAG in options.extra_args
    assert {"Bash", "Read", "WebFetch", "WebSearch"} <= set(options.disallowed_tools)
    assert options.max_turns == claude_code.MAX_TURNS
    assert raw.model_id == "claude-haiku-test"
    assert raw.auth_source == "none"
    assert raw.tool_servers == [] and raw.tools_offered == []
    assert raw.tokens == {"input_tokens": 120, "output_tokens": 30}


def test_each_call_gets_a_new_empty_folder_that_is_deleted(tmp_path):
    stub = StubSDK()
    c = connector(tmp_path, stub)
    asyncio.run(c.call(request()))
    first = Path(stub.options.cwd)
    asyncio.run(c.call(request()))
    second = Path(stub.options.cwd)
    assert stub.cwd_existed
    assert first != second
    assert first.parent == second.parent == tmp_path / "tearsheet-calls"
    assert not first.exists() and not second.exists()


def test_link_search_offers_web_search_only(tmp_path):
    stub = StubSDK(
        [
            init(tools=["WebSearch"]),
            AssistantMessage(content=[TextBlock(text='{"links": []}')], model="m"),
            result('{"links": []}'),
        ]
    )
    asyncio.run(connector(tmp_path, stub).call(request(web=True)))
    assert stub.options.tools == ["WebSearch"]
    assert stub.options.system_prompt == SYSTEM_PROMPT_WEB_SEARCH
    assert "WebSearch" not in stub.options.disallowed_tools
    assert "WebFetch" in stub.options.disallowed_tools
    assert stub.options.max_turns == claude_code.LINK_SEARCH_MAX_TURNS


# --- the environment --------------------------------------------------------------------------------


def test_environment_is_built_from_the_allowlist(tmp_path):
    stub = StubSDK()
    asyncio.run(connector(tmp_path, stub).call(request()))
    env = stub.options.env
    assert env == {"PATH": "/usr/bin:/bin", "HOME": "/Users/test", "LANG": "en_US.UTF-8"}
    launcher = Path(stub.options.cli_path).read_text()
    assert "ANTHROPIC_API_KEY" not in launcher
    assert "sk-should-not-pass" not in launcher
    assert "/opt/claude/bin/claude" in launcher


def test_api_key_passes_only_with_api_billing(tmp_path):
    assert "ANTHROPIC_API_KEY" not in build_env(ENVIRON)
    assert build_env(ENVIRON, api_billing=True)["ANTHROPIC_API_KEY"] == "sk-should-not-pass"
    stub = StubSDK()
    c = connector(tmp_path, stub, api_billing=True)
    asyncio.run(c.call(request()))
    assert "ANTHROPIC_API_KEY" in Path(stub.options.cli_path).read_text()


def test_claude_config_dir_is_passed_only_when_it_is_set(tmp_path):
    from tearsheet.ai.codex import build_env as codex_env

    assert "CLAUDE_CONFIG_DIR" not in build_env(ENVIRON)
    assert build_env({**ENVIRON, **CONFIG_DIR})["CLAUDE_CONFIG_DIR"] == "/Users/test/elsewhere"
    # Codex has its own sign-in folder (CODEX_HOME), and never gets Claude Code's.
    assert "CLAUDE_CONFIG_DIR" not in codex_env({**ENVIRON, **CONFIG_DIR})
    stub = StubSDK()
    c = ClaudeCodeConnector(
        Path("/opt/claude/bin/claude"),
        mode="sdk",
        query_fn=stub,
        environ={**ENVIRON, **CONFIG_DIR},
        calls_root=tmp_path / "calls",
    )
    asyncio.run(c.call(request()))
    assert stub.options.env["CLAUDE_CONFIG_DIR"] == "/Users/test/elsewhere"
    assert '${CLAUDE_CONFIG_DIR+"CLAUDE_CONFIG_DIR=$CLAUDE_CONFIG_DIR"}' in (
        Path(stub.options.cli_path).read_text()
    )
    c.close()


def test_the_path_passed_by_the_app_wins():
    env = build_env({**ENVIRON, "TEARSHEET_PATH": "/opt/homebrew/bin:/usr/bin"})
    assert env["PATH"] == "/opt/homebrew/bin:/usr/bin"


def test_the_launcher_really_clears_the_environment(tmp_path):
    script = tmp_path / "launcher"
    script.write_text(
        launcher_script(Path("/usr/bin/env"), ["PATH", "HOME", "CLAUDE_CODE_ENTRYPOINT"])
    )
    script.chmod(0o700)
    parent = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": "/h",
        "SECRET_TOKEN": "s3cret",
    }
    parent["CLAUDE_CODE_ENTRYPOINT"] = "sdk-py"
    out = subprocess.run(
        [str(script)], env=parent, capture_output=True, text=True, check=True
    ).stdout
    names = {line.split("=", 1)[0] for line in out.splitlines()}
    assert names == {"PATH", "HOME", "CLAUDE_CODE_ENTRYPOINT"}
    assert "s3cret" not in out


def test_the_launcher_is_removed_on_close(tmp_path):
    c = connector(tmp_path, StubSDK())
    path = c.launcher()
    assert path.exists() and os.access(path, os.X_OK)
    c.close()
    assert not path.exists()


# --- the permission callback ------------------------------------------------------------------------


def test_permission_callback_denies_and_records(tmp_path):
    async def try_tool(options):
        decision = await options.can_use_tool(
            "Bash", {"command": "cat ~/.ssh/id_ed25519"}, context()
        )
        assert isinstance(decision, PermissionResultDeny) and decision.interrupt

    stub = StubSDK(before=try_tool)
    with pytest.raises(AIToolUseAttempt) as attempt:
        asyncio.run(connector(tmp_path, stub).call(request()))
    assert attempt.value.tools == ("Bash",)


def test_web_search_is_allowed_only_on_link_search_calls(tmp_path):
    decisions = {}

    async def try_tools(options):
        decisions["search"] = await options.can_use_tool("WebSearch", {"query": "x"}, context())
        decisions["fetch"] = await options.can_use_tool("WebFetch", {"url": "https://x"}, context())

    stub = StubSDK([init(tools=["WebSearch"]), result('{"links": []}')], before=try_tools)
    with pytest.raises(AIToolUseAttempt) as attempt:
        asyncio.run(connector(tmp_path, stub).call(request(web=True)))
    assert isinstance(decisions["search"], PermissionResultAllow)
    assert isinstance(decisions["fetch"], PermissionResultDeny)
    assert attempt.value.tools == ("WebFetch",)

    plain = StubSDK(before=lambda options: _deny_search(options, decisions))
    with pytest.raises(AIToolUseAttempt):
        asyncio.run(connector(tmp_path, plain).call(request()))
    assert isinstance(decisions["plain search"], PermissionResultDeny)


async def _deny_search(options, decisions):
    decisions["plain search"] = await options.can_use_tool("WebSearch", {"query": "x"}, context())


def test_a_tool_use_in_the_stream_counts_as_an_attempt(tmp_path):
    stub = StubSDK(
        [
            init(),
            AssistantMessage(
                content=[ToolUseBlock(id="t", name="Read", input={"file_path": "/x"})], model="m"
            ),
            result("{}"),
        ]
    )
    with pytest.raises(AIToolUseAttempt):
        asyncio.run(connector(tmp_path, stub).call(request()))


def test_permission_denials_in_the_result_count_as_attempts(tmp_path):
    stub = StubSDK([init(), result("{}", denials=[{"tool_name": "Write", "tool_use_id": "t"}])])
    with pytest.raises(AIToolUseAttempt) as attempt:
        asyncio.run(connector(tmp_path, stub).call(request()))
    assert attempt.value.tools == ("Write",)


# --- errors -------------------------------------------------------------------------------------------


def test_a_signed_out_result_maps_to_a_sign_in_error(tmp_path):
    stub = StubSDK([init(), result("Invalid API key · Please run /login", is_error=True)])
    with pytest.raises(AIAuthError, match="claude auth login"):
        asyncio.run(connector(tmp_path, stub).call(request()))


def test_an_assistant_rate_limit_error_maps_to_the_usage_limit(tmp_path):
    stub = StubSDK(
        [
            init(),
            AssistantMessage(content=[TextBlock(text="limit")], model="m", error="rate_limit"),
            result("You've hit your limit · resets 3pm", is_error=True),
        ]
    )
    with pytest.raises(AIUsageLimit) as limit:
        asyncio.run(connector(tmp_path, stub).call(request()))
    assert limit.value.reset_at == "3pm"


# --- fallback mode ------------------------------------------------------------------------------------


def test_fallback_args_switch_everything_off():
    c = ClaudeCodeConnector(Path("/opt/claude"), mode="cli", environ=ENVIRON)
    args = c.cli_args(request())
    assert args[0] == "/opt/claude"
    assert args[args.index("--tools") + 1] == ""
    for flag in ("-p", "--setting-sources=", "--strict-mcp-config", "--no-session-persistence"):
        assert flag in args
    assert args[args.index("--permission-prompts") + 1] == "none"
    assert args[args.index("--system-prompt") + 1] == SYSTEM_PROMPT
    assert args[args.index("--model") + 1] == "haiku"
    web = c.cli_args(request(web=True))
    assert web[web.index("--tools") + 1] == "WebSearch"


def fake_program(tmp_path: Path, lines: list[dict]) -> Path:
    """A stand-in `claude` that reads the prompt, records its environment and prints lines."""
    program = tmp_path / "claude"
    body = "\n".join(f"printf '%s\\n' {json.dumps(json.dumps(line))}" for line in lines)
    program.write_text(
        f'#!/bin/sh\ncat > /dev/null\nenv > "$HOME/env.txt"\npwd > "$HOME/pwd.txt"\n{body}\n'
    )
    program.chmod(0o700)
    return program


def test_fallback_mode_reads_the_stream_with_a_clean_environment(tmp_path):
    home = tmp_path / "home"
    home.mkdir()
    lines = [
        {
            "type": "system",
            "subtype": "init",
            "apiKeySource": "none",
            "tools": [],
            "mcp_servers": [],
        },
        {
            "type": "assistant",
            "message": {"model": "claude-haiku-test", "content": [{"type": "text", "text": "x"}]},
        },
        {
            "type": "result",
            "subtype": "success",
            "is_error": False,
            "result": GOOD.model_dump_json(),
            "usage": {"input_tokens": 5, "output_tokens": 2},
        },
    ]
    environ = {
        **ENVIRON,
        **CONFIG_DIR,
        "HOME": str(home),
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
    }
    c = ClaudeCodeConnector(
        fake_program(tmp_path, lines), mode="cli", environ=environ, calls_root=tmp_path / "calls"
    )
    raw = asyncio.run(c.call(request()))
    assert LockdownProbe.model_validate_json(raw.text) == GOOD
    assert raw.model_id == "claude-haiku-test" and raw.auth_source == "none"
    seen = (home / "env.txt").read_text()
    assert "sk-should-not-pass" not in seen and "ghp-nope" not in seen
    # The user's own Claude Code folder is passed, so it finds its sign-in there.
    assert "CLAUDE_CONFIG_DIR=/Users/test/elsewhere" in seen.splitlines()
    assert (home / "pwd.txt").read_text().startswith(str(tmp_path / "calls"))


def test_version_runs_the_program(tmp_path):
    program = tmp_path / "claude"
    program.write_text("#!/bin/sh\necho '2.1.317 (Claude Code)'\n")
    program.chmod(0o700)
    c = ClaudeCodeConnector(program, environ={"PATH": "/usr/bin:/bin"})
    assert asyncio.run(c.version()) == "2.1.317 (Claude Code)"
