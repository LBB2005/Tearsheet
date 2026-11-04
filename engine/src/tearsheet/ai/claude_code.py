"""The Claude Code connector (design item 9, Technical Plan §4).

It runs Claude Code through Anthropic's Python Agent SDK, pointed at the `claude` program
that was found:

* no tools offered to the model, except web search on the link-search call;
* a permission callback that denies everything else and records the attempt;
* no user or project settings, so no hooks, tool servers, skills or instruction files;
* a clean environment from a short allowlist;
* a new empty working folder per call, deleted afterwards;
* our own system prompt.

The SDK passes this process's whole environment to the program, so the program is started
through a small launcher script that clears everything but the allowlist. The fallback mode
(setting `claude_mode` = cli) calls the program directly with the same switches.
"""

from __future__ import annotations

import asyncio
import json
import os
import shlex
import shutil
import tempfile
import uuid
from collections.abc import AsyncIterator, Callable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from tearsheet import config
from tearsheet.ai.client import (
    AIToolUseAttempt,
    AIUnavailable,
    CallRequest,
    RawAnswer,
    classify_error,
    system_prompt,
    user_message,
)

# --- Values confirmed in Phase 0 (docs/phase0-results.md) ---------------------------------
# The SDK option that sets the tools offered to the model (the program's --tools flag).
# An allowed-tools list only pre-approves tools, so it is not used for this.
OFFERED_TOOLS_OPTION = "tools"
# The SDK option that sets which settings files load (the program's --setting-sources).
SETTING_SOURCES_OPTION = "setting_sources"
# The session-start field that names the sign-in in use, and its value for a claude.ai
# subscription sign-in.
SIGN_IN_FIELD = "apiKeySource"
SUBSCRIPTION_SIGN_IN = frozenset({"none"})
# The tool offered, and the tool names that may appear, on the link-search call.
WEB_SEARCH_TOOL = "WebSearch"
WEB_SEARCH_TOOLS = frozenset({"WebSearch", "web_search"})
# How structured output is asked for: "prompt" (the JSON schema is in the message) or
# "json_schema" (the program's --json-schema option).
STRUCTURED_OUTPUT = "prompt"
# The program flag that keeps no session history on disk.
NO_SESSION_HISTORY_FLAG = "no-session-persistence"
# The fallback mode's flags, after `claude`.
FALLBACK_FLAGS = (
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--setting-sources=",
    "--strict-mcp-config",
    "--permission-prompts",
    "none",
    f"--{NO_SESSION_HISTORY_FLAG}",
)
# The environment allowlist: PATH, HOME and locale, plus the user name and temp folder,
# which the program may need to find its own sign-in and write temporary files.
ENV_ALLOWLIST = (
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "LC_MESSAGES",
)
# ---------------------------------------------------------------------------------------------

# Variables the SDK sets for the program, kept by the launcher.
SDK_ENV = (
    "CLAUDE_CODE_ENTRYPOINT",
    "CLAUDE_AGENT_SDK_VERSION",
    "CLAUDE_CODE_SDK_READS_SESSION_STATE",
    "PWD",
)
# Built-in tools denied by name as well, in case the offered list were ignored.
DENIED_TOOLS = (
    "Agent",
    "Bash",
    "BashOutput",
    "Edit",
    "Glob",
    "Grep",
    "KillShell",
    "LS",
    "MultiEdit",
    "NotebookEdit",
    "PowerShell",
    "Read",
    "Skill",
    "SlashCommand",
    "Task",
    "TodoWrite",
    "WebFetch",
    "Write",
)
MAX_TURNS = 2
LINK_SEARCH_MAX_TURNS = 10
STDERR_LINES_KEPT = 50


def default_calls_root() -> Path:
    return Path(tempfile.gettempdir()) / "tearsheet-calls"


def build_env(
    environ: Mapping[str, str],
    *,
    api_billing: bool = False,
    extra: Mapping[str, str] | None = None,
) -> dict[str, str]:
    """The program's whole environment. `ANTHROPIC_API_KEY` only with API billing."""
    env = {name: environ[name] for name in ENV_ALLOWLIST if name in environ}
    passed_path = environ.get(config.PATH_ENV)
    if passed_path:
        env["PATH"] = passed_path
    if api_billing and environ.get("ANTHROPIC_API_KEY"):
        env["ANTHROPIC_API_KEY"] = environ["ANTHROPIC_API_KEY"]
    env.update(extra or {})
    return env


def launcher_script(program: Path, names: list[str]) -> str:
    """A shell script that starts `program` with only the named variables.

    It holds names, never values, so no key is ever written to disk.
    """
    keep = " ".join(f'${{{name}+"{name}=${name}"}}' for name in names)
    return (
        "#!/bin/sh\n"
        "# Starts Claude Code with only Tearsheet's allowlisted environment.\n"
        f'exec /usr/bin/env -i {keep} {shlex.quote(str(program))} "$@"\n'
    )


def denied_tools(request: CallRequest) -> list[str]:
    return list(DENIED_TOOLS) if request.allow_web_search else [*DENIED_TOOLS, WEB_SEARCH_TOOL]


@dataclass
class _Result:
    is_error: bool
    subtype: str
    text: str | None
    structured: Any
    usage: dict[str, Any] | None
    model_usage: dict[str, Any] | None
    errors: list[str]
    api_error_status: int | None
    permission_denials: list[Any]


@dataclass
class _Collected:
    """Everything one call's message stream said, from either mode."""

    allow_web_search: bool
    init: dict[str, Any] = field(default_factory=dict)
    model: str | None = None
    texts: list[str] = field(default_factory=list)
    tool_events: list[str] = field(default_factory=list)
    denied: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    rate_limit: dict[str, Any] | None = None
    result: _Result | None = None

    def add_sdk(self, message: Any) -> None:
        from claude_agent_sdk import (
            AssistantMessage,
            RateLimitEvent,
            ResultMessage,
            ServerToolUseBlock,
            SystemMessage,
            TextBlock,
            ToolUseBlock,
        )

        if isinstance(message, SystemMessage):
            if message.subtype == "init":
                self.init = dict(message.data)
        elif isinstance(message, AssistantMessage):
            self.model = message.model or self.model
            if message.error:
                self.errors.append(f"assistant_error={message.error}")
            for block in message.content:
                if isinstance(block, ToolUseBlock | ServerToolUseBlock):
                    self.tool_events.append(block.name)
                elif isinstance(block, TextBlock):
                    self.texts.append(block.text)
        elif isinstance(message, RateLimitEvent):
            info = message.rate_limit_info
            self._rate_limit(info.status, info.resets_at, info.rate_limit_type, info.utilization)
        elif isinstance(message, ResultMessage):
            self.result = _Result(
                is_error=message.is_error,
                subtype=message.subtype,
                text=message.result,
                structured=message.structured_output,
                usage=message.usage,
                model_usage=dict(message.model_usage or {}),
                errors=list(message.errors or []),
                api_error_status=message.api_error_status,
                permission_denials=list(message.permission_denials or []),
            )

    def add_line(self, data: dict[str, Any]) -> None:
        """One line of the program's stream-json output (fallback mode)."""
        kind = data.get("type")
        if kind == "system" and data.get("subtype") == "init":
            self.init = data
        elif kind == "assistant":
            message = data.get("message") or {}
            self.model = message.get("model") or self.model
            if data.get("error"):
                self.errors.append(f"assistant_error={data['error']}")
            for block in message.get("content") or []:
                if block.get("type") in ("tool_use", "server_tool_use"):
                    self.tool_events.append(str(block.get("name")))
                elif block.get("type") == "text":
                    self.texts.append(block.get("text", ""))
        elif kind == "rate_limit_event":
            info = data.get("rate_limit_info") or {}
            self._rate_limit(
                info.get("status"),
                info.get("resetsAt"),
                info.get("rateLimitType"),
                info.get("utilization"),
            )
        elif kind == "result":
            self.result = _Result(
                is_error=bool(data.get("is_error")),
                subtype=str(data.get("subtype")),
                text=data.get("result"),
                structured=data.get("structured_output"),
                usage=data.get("usage"),
                model_usage=data.get("modelUsage"),
                errors=list(data.get("errors") or []),
                api_error_status=data.get("api_error_status"),
                permission_denials=list(data.get("permission_denials") or []),
            )

    def _rate_limit(self, status: Any, resets_at: Any, kind: Any, utilization: Any) -> None:
        self.rate_limit = {
            "status": status,
            "resets_at": resets_at,
            "type": kind,
            "utilization": utilization,
        }
        if status == "rejected":
            self.errors.append(f"rate_limit_status=rejected resets_at={resets_at}")

    def finish(self, stderr: list[str]) -> RawAnswer:
        result = self.result
        if result:
            for denial in result.permission_denials:
                name = denial.get("tool_name") if isinstance(denial, dict) else None
                self.denied.append(str(name or denial))
        allowed = WEB_SEARCH_TOOLS if self.allow_web_search else frozenset()
        attempts = self.denied + [t for t in self.tool_events if t not in allowed]
        if attempts:
            names = ", ".join(sorted(set(attempts)))
            raise AIToolUseAttempt(
                f"The AI tool tried to use a tool ({names}). This step was stopped.", attempts
            )
        if result is None or result.is_error or self.errors:
            parts = list(self.errors)
            if result is not None:
                parts += [result.text or "", *result.errors, f"subtype={result.subtype}"]
                if result.api_error_status:
                    parts.append(f"api_error_status={result.api_error_status}")
            else:
                parts.append("no result message")
            parts += stderr[-STDERR_LINES_KEPT:]
            raise classify_error("claude", " | ".join(p for p in parts if p))

        tokens = {k: v for k, v in (result.usage or {}).items() if isinstance(v, int)}
        model_id = (
            self.model or next(iter(result.model_usage or {}), None) or self.init.get("model")
        )
        servers = self.init.get("mcp_servers")
        return RawAnswer(
            text=result.text if result.text is not None else "".join(self.texts),
            structured=result.structured,
            model_id=model_id,
            tokens=tokens or None,
            auth_source=self.init.get(SIGN_IN_FIELD),
            tool_events=list(self.tool_events),
            denied_tools=list(self.denied),
            tools_offered=self.init.get("tools"),
            tool_servers=[str(s.get("name")) for s in servers] if servers is not None else None,
            session={
                key: self.init.get(key)
                for key in (
                    "claude_code_version",
                    "cwd",
                    "permissionMode",
                    "skills",
                    "plugins",
                    "slash_commands",
                    "agents",
                    "output_style",
                )
            },
            rate_limit=self.rate_limit,
        )


QueryFn = Callable[..., AsyncIterator[Any]]


class ClaudeCodeConnector:
    tool = "claude"
    display_name = "Claude Code"
    sign_in_fix = "claude auth login"
    web_search_tools = WEB_SEARCH_TOOLS
    subscription_auth_sources = SUBSCRIPTION_SIGN_IN

    def __init__(
        self,
        program: Path,
        *,
        mode: str = "sdk",
        api_billing: bool = False,
        models: Mapping[str, str] | None = None,
        calls_root: Path | None = None,
        extra_env: Mapping[str, str] | None = None,
        environ: Mapping[str, str] | None = None,
        query_fn: QueryFn | None = None,
    ):
        if mode not in ("sdk", "cli"):
            raise ValueError("claude_mode must be sdk or cli")
        self.program = program
        self.mode = mode
        self.api_billing = api_billing
        self.models = dict(models or config.CLAUDE_MODELS)
        self.calls_root = calls_root or default_calls_root()
        self._extra_env = dict(extra_env or {})
        self._environ = environ if environ is not None else os.environ
        self._query = query_fn
        self._launcher_dir: Path | None = None

    # --- environment ---------------------------------------------------------------

    def environment(self) -> dict[str, str]:
        return build_env(self._environ, api_billing=self.api_billing, extra=self._extra_env)

    def launcher(self) -> Path:
        """The launcher script, written once per connector in a private temp folder."""
        if self._launcher_dir is None:
            self._launcher_dir = Path(tempfile.mkdtemp(prefix="tearsheet-launcher-"))
            names = [*ENV_ALLOWLIST, *SDK_ENV, *self._extra_env]
            if self.api_billing:
                names.append("ANTHROPIC_API_KEY")
            path = self._launcher_dir / "claude"
            path.write_text(launcher_script(self.program, names))
            path.chmod(0o700)
        return self._launcher_dir / "claude"

    def close(self) -> None:
        if self._launcher_dir is not None:
            shutil.rmtree(self._launcher_dir, ignore_errors=True)
            self._launcher_dir = None

    # --- calls -----------------------------------------------------------------------

    async def version(self) -> str:
        try:
            process = await asyncio.create_subprocess_exec(
                str(self.program),
                "--version",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=self.environment(),
            )
        except OSError:
            raise AIUnavailable(f"Claude Code was not found at {self.program}.") from None
        try:
            out, _ = await asyncio.wait_for(process.communicate(), config.TOOL_VERSION_TIME_LIMIT_S)
        except TimeoutError:
            process.kill()
            await process.wait()
            raise AIUnavailable("Claude Code didn't answer `--version` within 5 seconds.") from None
        if process.returncode != 0:
            raise AIUnavailable(f"`{self.program} --version` failed (exit {process.returncode}).")
        return out.decode("utf-8", errors="replace").strip()

    async def call(self, request: CallRequest) -> RawAnswer:
        workdir = self.calls_root / uuid.uuid4().hex
        workdir.mkdir(parents=True)
        try:
            if self.mode == "cli":
                return await self._call_cli(request, workdir)
            return await self._call_sdk(request, workdir)
        finally:
            shutil.rmtree(workdir, ignore_errors=True)

    def sdk_options(
        self, request: CallRequest, workdir: Path, denied: list[str], stderr: list[str]
    ) -> Any:
        from claude_agent_sdk import ClaudeAgentOptions, PermissionResultAllow, PermissionResultDeny

        async def can_use_tool(name: str, tool_input: dict[str, Any], context: Any) -> Any:
            if request.allow_web_search and name in WEB_SEARCH_TOOLS:
                return PermissionResultAllow()
            denied.append(name)
            return PermissionResultDeny(message="Tearsheet allows no tools here.", interrupt=True)

        offered = [WEB_SEARCH_TOOL] if request.allow_web_search else []
        output_format = None
        if STRUCTURED_OUTPUT == "json_schema":
            output_format = {"type": "json_schema", "schema": request.schema.model_json_schema()}
        return ClaudeAgentOptions(
            **{OFFERED_TOOLS_OPTION: offered, SETTING_SOURCES_OPTION: []},
            system_prompt=system_prompt(request),
            model=request.model,
            cwd=str(workdir),
            cli_path=str(self.launcher()),
            env=self.environment(),
            can_use_tool=can_use_tool,
            disallowed_tools=denied_tools(request),
            strict_mcp_config=True,
            max_turns=LINK_SEARCH_MAX_TURNS if request.allow_web_search else MAX_TURNS,
            extra_args={NO_SESSION_HISTORY_FLAG: None},
            output_format=output_format,
            stderr=stderr.append,
        )

    async def _call_sdk(self, request: CallRequest, workdir: Path) -> RawAnswer:
        from claude_agent_sdk import ClaudeSDKError, CLINotFoundError, ProcessError
        from claude_agent_sdk import query as sdk_query

        query = self._query or sdk_query
        collected = _Collected(allow_web_search=request.allow_web_search)
        stderr: list[str] = []
        options = self.sdk_options(request, workdir, collected.denied, stderr)
        try:
            async for message in query(prompt=user_message(request), options=options):
                collected.add_sdk(message)
        except CLINotFoundError:
            raise AIUnavailable(f"Claude Code was not found at {self.program}.") from None
        except ProcessError as exc:
            collected.errors.append(f"{exc} {getattr(exc, 'stderr', '') or ''}")
        except ClaudeSDKError as exc:
            collected.errors.append(str(exc))
        return collected.finish(stderr)

    def cli_args(self, request: CallRequest) -> list[str]:
        offered = WEB_SEARCH_TOOL if request.allow_web_search else ""
        args = [
            str(self.program),
            *FALLBACK_FLAGS,
            "--tools",
            offered,
            "--disallowedTools",
            ",".join(denied_tools(request)),
            "--system-prompt",
            system_prompt(request),
            "--max-turns",
            str(LINK_SEARCH_MAX_TURNS if request.allow_web_search else MAX_TURNS),
        ]
        if request.model:
            args += ["--model", request.model]
        if STRUCTURED_OUTPUT == "json_schema":
            args += ["--json-schema", json.dumps(request.schema.model_json_schema())]
        return args

    async def _call_cli(self, request: CallRequest, workdir: Path) -> RawAnswer:
        try:
            process = await asyncio.create_subprocess_exec(
                *self.cli_args(request),
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=workdir,
                env=self.environment(),
            )
        except OSError:
            raise AIUnavailable(f"Claude Code was not found at {self.program}.") from None
        try:
            out, err = await process.communicate(user_message(request).encode("utf-8"))
        except asyncio.CancelledError:
            process.kill()
            await process.wait()
            raise
        collected = _Collected(allow_web_search=request.allow_web_search)
        for line in out.decode("utf-8", errors="replace").splitlines():
            try:
                data = json.loads(line)
            except ValueError:
                continue
            if isinstance(data, dict):
                collected.add_line(data)
        stderr = err.decode("utf-8", errors="replace").splitlines()
        if process.returncode not in (0, None) and collected.result is None:
            collected.errors.append(f"exit {process.returncode}")
        return collected.finish(stderr)
