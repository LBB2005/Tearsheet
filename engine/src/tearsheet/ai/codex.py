"""The Codex connector (design item 10, Technical Plan §4).

It runs Codex through `codex app-server`, Codex's mode for other apps: JSON lines on standard
input and output, one process per run, one thread per call. Each call is locked down:

* the tools are switched off at start-up (the shell, apps, plugins, hooks, memories and the
  rest), along with the user's tool servers and instruction files;
* each thread has a read-only sandbox, a new empty working folder, the strictest approval
  policy and our own instructions in place of Codex's;
* every approval request is denied, and any command, file-change or tool event in the
  stream counts as a tool-use attempt. Web-search events are allowed on the link-search
  thread only.

Codex keeps its own sign-in, because its config folder is not moved. This module never
reads Codex's files; it asks the program which sign-in it is using (`account/read`) and keeps
only the account type.

Protocol rules from the guide (docs/references/local-cli-guide.txt): one JSON object per
line; replies may leave out "jsonrpc"; Codex numbers its own requests from 0, so its
requests are told apart from our replies by their "method"; every error uses code -32600,
so errors are told apart by their message and data.
"""

from __future__ import annotations

import asyncio
import collections
import json
import os
import shutil
import signal
import tempfile
import uuid
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from tearsheet import ENGINE_VERSION, config
from tearsheet.ai.claude_code import ENV_ALLOWLIST as CLAUDE_ENV_ALLOWLIST
from tearsheet.ai.client import (
    AIAuthError,
    AIError,
    AIToolUseAttempt,
    AIUnavailable,
    CallRequest,
    RawAnswer,
    classify_error,
    system_prompt,
    user_message,
)

# --- Values believed from codex-cli 0.165.0's own protocol schema ----------------------------
# (`codex app-server generate-json-schema`). The live lock-down check confirms them on Liam's
# Mac; each has a row in docs/phase0-results.md.
#
# Feature switches turned off at start-up (`--disable <feature>`). No approval policy asks
# before Codex's known-safe read commands ("untrusted" runs them), so the shell tools are
# removed instead of relying on approvals alone.
DISABLED_FEATURES = (
    "shell_tool",
    "unified_exec",
    "apps",
    "plugins",
    "hooks",
    "memories",
    "multi_agent",
    "browser_use",
    "computer_use",
    "in_app_browser",
    "image_generation",
    "view_image",
    "skill_search",
    "tool_suggest",
    "sleep_tool",
    "goals",
)
# Configuration overrides at start-up (`-c key=value`, values parsed as TOML): no project
# instruction files, no web search, no history file, no patch tool. Overrides are merged into
# the user's settings, not swapped for them, so `mcp_servers={}` would remove nothing: the
# user's tool servers are switched off by name instead (below).
CONFIG_OVERRIDES = (
    "project_doc_max_bytes=0",
    'web_search="disabled"',
    'history.persistence="none"',
    "include_apply_patch_tool=false",
)
# thread/start values.
SANDBOX = "read-only"
APPROVAL_POLICY = "untrusted"
APPROVALS_REVIEWER = "user"
EPHEMERAL_THREADS = True
# Our own instructions replace Codex's ("baseInstructions") rather than being added to them.
INSTRUCTIONS_FIELD = "baseInstructions"
# Codex always loads the user's own instruction file from its home folder, and has no setting
# to stop it (only project files have one, `project_doc_max_bytes`). Moving the home folder
# would mean a second sign-in, so that one file is allowed, and Codex is told it doesn't apply.
# Any other instruction file still fails the lock-down check.
USER_INSTRUCTION_FILES = ("AGENTS.md", "AGENTS.override.md")
USER_FILE_NOTE = (
    "Any AGENTS.md instructions in this conversation are the user's own notes for their coding "
    "work. They don't apply to this task. Follow only the instructions above and the user's "
    "message."
)
# The user's tool servers and plugins. Codex is started once to list them
# (`mcpServerStatus/list`, `plugin/installed`), then again with each one switched off by name:
# `-c mcp_servers={"<name>"={enabled=false}}` for a server from the user's settings, and
# `-c plugins={"<id>"={enabled=false}}` for a plugin's. Every installed plugin's ID also goes in
# each turn's `disabledPluginIds`. Tested on Liam's Mac (codex-cli 0.165.0, no AI calls): his
# `computer-use` and `node_repl` servers are in his settings, and `node_repl`'s 4 tools went to
# 0 once switched off. A switched-off server is still listed, with no tools.
SERVERS_OVERRIDE_KEY = "mcp_servers"
PLUGIN_OVERRIDE_KEY = "plugins"
# A listed server counts as loaded when it offers tools or reports itself running.
RUNNING_STATES = frozenset({"connected", "starting", "ready", "authenticationRequired"})
# Per-thread configuration: web search only on the link-search thread.
THREAD_CONFIG = {"web_search": "disabled"}
LINK_SEARCH_THREAD_CONFIG = {"web_search": "live"}
# Stream items that are not tool use. Everything else counts, except web search on the
# link-search thread.
SAFE_ITEMS = frozenset({"userMessage", "agentMessage", "reasoning", "contextCompaction"})
WEB_SEARCH_ITEMS = frozenset({"webSearch"})
# What each approval request is answered with: a denial that also stops the turn.
DENY_ANSWERS = {
    "item/commandExecution/requestApproval": {"decision": "cancel"},
    "item/fileChange/requestApproval": {"decision": "cancel"},
    "execCommandApproval": {"decision": "abort"},
    "applyPatchApproval": {"decision": "abort"},
    "mcpServer/elicitation/request": {"action": "decline"},
    "item/tool/call": {"contentItems": [], "success": False},
}
# Requests from Codex that are not tool use; they get an error reply and are logged.
NOT_TOOL_REQUESTS = frozenset({"account/chatgptAuthTokens/refresh", "attestation/generate"})
# The sign-in in use: `account.type` from account/read. "chatgpt" is a ChatGPT-plan sign-in.
SUBSCRIPTION_SIGN_IN = frozenset({"chatgpt"})
# How structured output is asked for: "prompt" (the JSON schema is in the message) or
# "output_schema" (turn/start's outputSchema field).
STRUCTURED_OUTPUT = "prompt"
# The environment allowlist: the same as Claude Code's, plus CODEX_HOME when the user set it,
# so Codex finds its own sign-in.
ENV_ALLOWLIST = (*CLAUDE_ENV_ALLOWLIST, "CODEX_HOME")
# ---------------------------------------------------------------------------------------------

INIT_TIME_LIMIT_S = 15
REQUEST_TIME_LIMIT_S = 60
STDERR_LINES_KEPT = 200
LINE_LIMIT_BYTES = 32 * 1024 * 1024
# The engine's own error code for a request we refuse (Codex's own errors all use -32600).
REFUSED = -32601


def default_calls_root() -> Path:
    return Path(tempfile.gettempdir()) / "tearsheet-calls"


def build_env(
    environ: Mapping[str, str],
    *,
    api_billing: bool = False,
    extra: Mapping[str, str] | None = None,
) -> dict[str, str]:
    """The program's whole environment. `OPENAI_API_KEY` only with API billing."""
    env = {name: environ[name] for name in ENV_ALLOWLIST if name in environ}
    passed_path = environ.get(config.PATH_ENV)
    if passed_path:
        env["PATH"] = passed_path
    if api_billing and environ.get("OPENAI_API_KEY"):
        env["OPENAI_API_KEY"] = environ["OPENAI_API_KEY"]
    env.update(extra or {})
    return env


def switch_off(key: str, names: list[str]) -> str:
    """One `-c` override that switches the named entries off, as a TOML inline table, so names
    holding `@`, `-` or `.` never have to be written as dotted keys."""
    entries = ",".join(f"{json.dumps(name)}={{enabled=false}}" for name in sorted(names))
    return f"{key}={{{entries}}}"


def plugin_override(plugin_ids: list[str]) -> str:
    return switch_off(PLUGIN_OVERRIDE_KEY, plugin_ids)


def start_args(
    program: Path, plugins_off: list[str] | None = None, servers_off: list[str] | None = None
) -> list[str]:
    args = [str(program), "app-server"]
    for feature in DISABLED_FEATURES:
        args += ["--disable", feature]
    for override in CONFIG_OVERRIDES:
        args += ["-c", override]
    if servers_off:
        args += ["-c", switch_off(SERVERS_OVERRIDE_KEY, servers_off)]
    if plugins_off:
        args += ["-c", plugin_override(plugins_off)]
    return args


def loaded_servers(reply: Mapping[str, Any]) -> list[str]:
    """The servers in an `mcpServerStatus/list` reply that offer tools or say they run."""
    return sorted(
        str(s.get("name"))
        for s in reply.get("data") or []
        if s.get("tools") or s.get("runtimeStatus") in RUNNING_STATES
    )


def enabled_plugins(reply: Mapping[str, Any]) -> list[str]:
    """The IDs of installed, switched-on plugins in a `plugin/installed` reply."""
    found = []
    for market in reply.get("marketplaces") or []:
        for plugin in (market or {}).get("plugins") or []:
            if plugin.get("installed", True) and plugin.get("enabled") and plugin.get("id"):
                found.append(str(plugin["id"]))
    return sorted(set(found))


def error_text(error: Mapping[str, Any] | None) -> str:
    """One searchable line from a JSON-RPC error or a turn error. The code is ignored: Codex
    uses -32600 for every error."""
    if not error:
        return "no error details"
    parts = [str(error.get("message") or "")]
    data = error.get("data")
    if isinstance(data, Mapping):
        action = data.get("action")
        if action:
            parts.append(f"action={action}")
        parts.append(json.dumps(data, default=str)[:2000])
    elif data is not None:
        parts.append(str(data)[:2000])
    info = error.get("codexErrorInfo")
    if isinstance(info, str):
        parts.append(f"codexErrorInfo={info}")
    elif isinstance(info, Mapping):
        parts += [f"codexErrorInfo={key}" for key in info]
        parts.append(json.dumps(info, default=str)[:500])
    if error.get("additionalDetails"):
        parts.append(str(error["additionalDetails"]))
    return " | ".join(p for p in parts if p)


@dataclass
class _Thread:
    """Everything one call's thread said."""

    thread_id: str
    allow_web_search: bool
    started: dict[str, Any]
    done: asyncio.Event = field(default_factory=asyncio.Event)
    turn_id: str | None = None
    items: list[str] = field(default_factory=list)
    messages: dict[str, str] = field(default_factory=dict)
    deltas: dict[str, list[str]] = field(default_factory=dict)
    denied: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    tokens: dict[str, int] | None = None
    status: str | None = None
    seen: set[str] = field(default_factory=set)

    def item(self, item: Mapping[str, Any], *, completed: bool) -> None:
        kind = str(item.get("type"))
        if kind == "agentMessage":
            if completed:
                self.messages[str(item.get("id"))] = str(item.get("text") or "")
            return
        if kind in SAFE_ITEMS:
            return
        # Counted once, when it starts (or when it completes without a start).
        key = f"{kind}:{item.get('id')}"
        if key in self.seen:
            return
        self.seen.add(key)
        self.items.append(kind)

    def text(self) -> str:
        if self.messages:
            return list(self.messages.values())[-1]
        return "".join("".join(parts) for parts in self.deltas.values())


class CodexConnector:
    tool = "codex"
    display_name = "Codex"
    sign_in_fix = "codex login"
    web_search_tools = WEB_SEARCH_ITEMS
    subscription_auth_sources = SUBSCRIPTION_SIGN_IN

    def __init__(
        self,
        program: Path,
        *,
        api_billing: bool = False,
        models: Mapping[str, str] | None = None,
        calls_root: Path | None = None,
        extra_env: Mapping[str, str] | None = None,
        environ: Mapping[str, str] | None = None,
        init_time_limit_s: float = INIT_TIME_LIMIT_S,
    ):
        self.program = program
        self.api_billing = api_billing
        self.models = dict(models if models is not None else config.CODEX_MODELS)
        self.calls_root = calls_root or default_calls_root()
        self._extra_env = dict(extra_env or {})
        self._environ = environ if environ is not None else os.environ
        self._init_time_limit_s = init_time_limit_s
        self._process: asyncio.subprocess.Process | None = None
        self._home: Path | None = None
        self._readers: list[asyncio.Task] = []
        self._start_lock = asyncio.Lock()
        self._started = False
        self._next_id = 1
        self._pending: dict[int, asyncio.Future] = {}
        self._threads: dict[str, _Thread] = {}
        self._dead: str | None = None
        self.stderr: collections.deque[str] = collections.deque(maxlen=STDERR_LINES_KEPT)
        self.account_type: str | None = None
        self.tool_servers: list[str] = []
        self.codex_home: str | None = None
        # Plugins switched off at start-up, and every installed plugin's ID for each turn.
        self.plugins_off: list[str] = []
        self.servers_off: list[str] = []
        self.plugins_installed: list[str] = []
        self.user_agent: str | None = None
        self.rate_limit: dict[str, Any] | None = None
        self.refused: list[str] = []

    # --- environment and version --------------------------------------------------------

    def environment(self) -> dict[str, str]:
        return build_env(self._environ, api_billing=self.api_billing, extra=self._extra_env)

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
            raise AIUnavailable(f"Codex was not found at {self.program}.") from None
        try:
            out, _ = await asyncio.wait_for(process.communicate(), config.TOOL_VERSION_TIME_LIMIT_S)
        except TimeoutError:
            process.kill()
            await process.wait()
            raise AIUnavailable("Codex didn't answer `--version` within 5 seconds.") from None
        if process.returncode != 0:
            raise AIUnavailable(f"`{self.program} --version` failed (exit {process.returncode}).")
        return out.decode("utf-8", errors="replace").strip()

    # --- the app-server process ----------------------------------------------------------

    async def _start(self) -> None:
        async with self._start_lock:
            if self._started and not self._dead:
                return
            if self._started:
                # It stopped since the last call: start a new one.
                await self.aclose()
            try:
                await self._launch()
                plugins, servers = await self._list_setup()
                if set(plugins) - set(self.plugins_off) or set(servers) - set(self.servers_off):
                    # Start again with the user's plugins and tool servers switched off by name.
                    self.plugins_off = sorted({*self.plugins_off, *plugins})
                    self.servers_off = sorted({*self.servers_off, *servers})
                    await self.aclose()
                    await self._launch()
                    await self._list_plugins()
                account = await self._request("account/read", {"refreshToken": False})
                self.account_type = self._account_type(account)
                self.tool_servers = loaded_servers(await self._request("mcpServerStatus/list", {}))
            except BaseException:
                await self.aclose()
                raise

    async def _launch(self) -> None:
        """Start the app-server and do the handshake."""
        self._home = self.calls_root / f"server-{uuid.uuid4().hex}"
        self._home.mkdir(parents=True)
        try:
            self._process = await asyncio.create_subprocess_exec(
                *start_args(self.program, self.plugins_off, self.servers_off),
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self._home,
                env=self.environment(),
                limit=LINE_LIMIT_BYTES,
            )
        except OSError:
            self._remove_home()
            raise AIUnavailable(f"Codex was not found at {self.program}.") from None
        self._started = True
        self._readers = [
            asyncio.create_task(self._read_stdout()),
            asyncio.create_task(self._read_stderr()),
        ]
        hello = await self._request(
            "initialize",
            {
                "clientInfo": {
                    "name": "tearsheet",
                    "title": "Tearsheet",
                    "version": ENGINE_VERSION,
                },
                "capabilities": {"experimentalApi": False},
            },
            time_limit_s=self._init_time_limit_s,
        )
        self.user_agent = hello.get("userAgent")
        self.codex_home = hello.get("codexHome")
        await self._send({"method": "initialized"})

    async def _list_setup(self) -> tuple[list[str], list[str]]:
        """The user's switched-on plugins, and the tool servers from their own settings."""
        plugins = set(await self._list_plugins())
        servers: set[str] = set()
        reply = await self._request("mcpServerStatus/list", {})
        for server in reply.get("data") or []:
            if server.get("pluginId"):
                plugins.add(str(server["pluginId"]))
            elif server.get("name"):
                servers.add(str(server["name"]))
        return sorted(plugins), sorted(servers)

    async def _list_plugins(self) -> list[str]:
        """The switched-on plugins. An older Codex without the request has none to report."""
        try:
            reply = await self._request("plugin/installed", {})
        except AIUnavailable:
            return []
        self.plugins_installed = sorted(
            {
                str(p["id"])
                for m in reply.get("marketplaces") or []
                for p in (m or {}).get("plugins") or []
                if p.get("id") and p.get("installed", True)
            }
        )
        return enabled_plugins(reply)

    def _account_type(self, reply: Mapping[str, Any]) -> str | None:
        """Only the account type is kept: never the email or the plan."""
        account = reply.get("account")
        if account is None:
            if reply.get("requiresOpenaiAuth"):
                raise AIAuthError(
                    "Codex is not signed in. Sign in again: run `codex login`.",
                    fix="codex login",
                    raw="account/read: no account",
                )
            return None
        return str(account.get("type")) if isinstance(account, Mapping) else None

    async def _send(self, message: dict[str, Any]) -> None:
        process = self._process
        if process is None or process.stdin is None or self._dead:
            raise AIUnavailable(f"Codex stopped: {self._dead or 'not running'}")
        line = json.dumps({"jsonrpc": "2.0", **message}, separators=(",", ":")) + "\n"
        try:
            process.stdin.write(line.encode("utf-8"))
            await process.stdin.drain()
        except (BrokenPipeError, ConnectionResetError) as exc:
            self._died(f"its input closed ({exc})")
            raise AIUnavailable(f"Codex stopped: {self._dead}") from None

    async def _request(
        self, method: str, params: dict[str, Any], *, time_limit_s: float = REQUEST_TIME_LIMIT_S
    ) -> dict[str, Any]:
        """Send one request and wait for its reply. A JSON-RPC error becomes an engine error
        through the error table."""
        request_id = self._next_id
        self._next_id += 1
        future: asyncio.Future = asyncio.get_running_loop().create_future()
        self._pending[request_id] = future
        try:
            await self._send({"id": request_id, "method": method, "params": params})
            reply = await asyncio.wait_for(future, time_limit_s)
        except TimeoutError:
            raise AIUnavailable(
                f"Codex didn't answer {method} within {time_limit_s:g} seconds."
            ) from None
        finally:
            self._pending.pop(request_id, None)
        if "error" in reply:
            raise classify_error("codex", f"{method}: {error_text(reply['error'])}")
        result = reply.get("result")
        return result if isinstance(result, dict) else {}

    async def _read_stdout(self) -> None:
        process = self._process
        assert process is not None and process.stdout is not None
        try:
            while True:
                line = await process.stdout.readline()
                if not line:
                    break
                try:
                    message = json.loads(line)
                except ValueError:
                    continue
                if isinstance(message, dict):
                    await self._dispatch(message)
        except (ValueError, asyncio.LimitOverrunError) as exc:
            self._died(f"a message was too long to read ({exc})")
            return
        code = await process.wait()
        self._died(f"the program exited (code {code})")

    async def _read_stderr(self) -> None:
        """Read standard error continuously, so the process never stalls on a full pipe."""
        process = self._process
        assert process is not None and process.stderr is not None
        while True:
            chunk = await process.stderr.read(65536)
            if not chunk:
                return
            for line in chunk.decode("utf-8", errors="replace").splitlines():
                if line.strip():
                    self.stderr.append(line[:2000])

    def _died(self, why: str) -> None:
        if self._dead:
            return
        tail = " | ".join(list(self.stderr)[-5:])
        self._dead = f"{why}{f': {tail}' if tail else ''}"
        error = classify_error("codex", self._dead)
        for future in self._pending.values():
            if not future.done():
                future.set_exception(error)
        for thread in self._threads.values():
            thread.errors.append(self._dead)
            thread.done.set()

    async def _dispatch(self, message: dict[str, Any]) -> None:
        method = message.get("method")
        if method is None:
            # A reply to one of ours. Codex numbers its own requests separately, so only
            # messages without a method are replies.
            future = self._pending.get(message.get("id"))  # type: ignore[arg-type]
            if future is not None and not future.done():
                future.set_result(message)
            return
        params = message.get("params") or {}
        if "id" in message:
            await self._answer(str(method), message["id"], params)
        else:
            self._notice(str(method), params)

    async def _answer(self, method: str, request_id: Any, params: Mapping[str, Any]) -> None:
        """Deny every request Codex sends: approvals, tool calls, user-input questions."""
        thread = self._threads.get(str(params.get("threadId")))
        if method in NOT_TOOL_REQUESTS:
            self.refused.append(method)
            reply: dict[str, Any] = {
                "id": request_id,
                "error": {"code": REFUSED, "message": "Tearsheet does not handle this."},
            }
        else:
            if thread is not None:
                thread.denied.append(method)
            else:
                self.refused.append(method)
            answer = DENY_ANSWERS.get(method)
            if answer is not None:
                reply = {"id": request_id, "result": answer}
            else:
                reply = {
                    "id": request_id,
                    "error": {"code": REFUSED, "message": "Tearsheet allows no tools."},
                }
        try:
            await self._send(reply)
        except AIUnavailable:
            pass

    def _notice(self, method: str, params: Mapping[str, Any]) -> None:
        if method == "account/rateLimits/updated":
            self.rate_limit = self._rate_limit(params.get("rateLimits") or {})
            return
        if method in ("mcpServer/startupStatus/updated", "mcpServerStatus/updated"):
            name = params.get("name") or params.get("serverName")
            running = params.get("status") in RUNNING_STATES
            if name and running and str(name) not in self.tool_servers:
                self.tool_servers.append(str(name))
            return
        thread = self._threads.get(str(params.get("threadId")))
        if thread is None:
            return
        if method == "item/started":
            thread.item(params.get("item") or {}, completed=False)
        elif method == "item/completed":
            thread.item(params.get("item") or {}, completed=True)
        elif method == "item/agentMessage/delta":
            thread.deltas.setdefault(str(params.get("itemId")), []).append(
                str(params.get("delta") or "")
            )
        elif method == "thread/tokenUsage/updated":
            usage = (params.get("tokenUsage") or {}).get("last") or {}
            thread.tokens = {k: v for k, v in usage.items() if isinstance(v, int)} or None
        elif method == "error":
            if not params.get("willRetry"):
                thread.errors.append(error_text(params.get("error")))
        elif method == "turn/started":
            thread.turn_id = (params.get("turn") or {}).get("id") or thread.turn_id
        elif method == "turn/completed":
            turn = params.get("turn") or {}
            thread.status = turn.get("status")
            if turn.get("error"):
                thread.errors.append(error_text(turn["error"]))
            for item in turn.get("items") or []:
                if isinstance(item, Mapping):
                    thread.item(item, completed=True)
            thread.done.set()

    @staticmethod
    def _rate_limit(snapshot: Mapping[str, Any]) -> dict[str, Any]:
        primary = snapshot.get("primary") or {}
        return {
            "status": "rejected" if snapshot.get("rateLimitReachedType") else "allowed",
            "type": snapshot.get("limitName") or snapshot.get("limitId"),
            "utilization": primary.get("usedPercent"),
            "resets_at": primary.get("resetsAt"),
        }

    # --- calls -----------------------------------------------------------------------

    def thread_params(self, request: CallRequest, workdir: Path) -> dict[str, Any]:
        params: dict[str, Any] = {
            "cwd": str(workdir),
            "sandbox": SANDBOX,
            "approvalPolicy": APPROVAL_POLICY,
            "approvalsReviewer": APPROVALS_REVIEWER,
            "ephemeral": EPHEMERAL_THREADS,
            INSTRUCTIONS_FIELD: system_prompt(request),
            "developerInstructions": USER_FILE_NOTE,
            "config": dict(
                LINK_SEARCH_THREAD_CONFIG if request.allow_web_search else THREAD_CONFIG
            ),
        }
        if request.model:
            params["model"] = request.model
        return params

    def turn_params(self, request: CallRequest, thread_id: str) -> dict[str, Any]:
        params: dict[str, Any] = {
            "threadId": thread_id,
            "input": [{"type": "text", "text": user_message(request), "text_elements": []}],
        }
        if self.plugins_installed:
            params["disabledPluginIds"] = list(self.plugins_installed)
        if STRUCTURED_OUTPUT == "output_schema":
            params["outputSchema"] = request.schema.model_json_schema()
        return params

    async def call(self, request: CallRequest) -> RawAnswer:
        await self._start()
        workdir = self.calls_root / uuid.uuid4().hex
        workdir.mkdir(parents=True)
        thread: _Thread | None = None
        try:
            started = await self._request("thread/start", self.thread_params(request, workdir))
            thread_id = str((started.get("thread") or {}).get("id"))
            thread = _Thread(thread_id, request.allow_web_search, started)
            self._threads[thread_id] = thread
            turn = await self._request("turn/start", self.turn_params(request, thread_id))
            thread.turn_id = (turn.get("turn") or {}).get("id") or thread.turn_id
            try:
                await thread.done.wait()
            except asyncio.CancelledError:
                await self._interrupt(thread)
                raise
            return self._finish(thread)
        finally:
            if thread is not None:
                self._threads.pop(thread.thread_id, None)
            shutil.rmtree(workdir, ignore_errors=True)

    async def _interrupt(self, thread: _Thread) -> None:
        """Stop a turn that ran out of time. Best effort: the reply is not awaited."""
        if thread.turn_id and not self._dead:
            try:
                await self._send(
                    {
                        "id": self._next_id,
                        "method": "turn/interrupt",
                        "params": {"threadId": thread.thread_id, "turnId": thread.turn_id},
                    }
                )
                self._next_id += 1
            except AIError:
                pass

    def _finish(self, thread: _Thread) -> RawAnswer:
        allowed = WEB_SEARCH_ITEMS if thread.allow_web_search else frozenset()
        attempts = thread.denied + [kind for kind in thread.items if kind not in allowed]
        if attempts:
            names = ", ".join(sorted(set(attempts)))
            raise AIToolUseAttempt(
                f"The AI tool tried to use a tool ({names}). This step was stopped.", attempts
            )
        if thread.errors or thread.status not in ("completed", None):
            parts = list(thread.errors)
            parts.append(f"turn status={thread.status}")
            if self.rate_limit and self.rate_limit.get("resets_at"):
                parts.append(f"resets_at={self.rate_limit['resets_at']}")
            parts += list(self.stderr)[-10:]
            raise classify_error("codex", " | ".join(p for p in parts if p))
        started = thread.started
        own, others = self._split_instruction_files(started.get("instructionSources") or [])
        return RawAnswer(
            text=thread.text(),
            model_id=started.get("model") or (started.get("thread") or {}).get("model"),
            tokens=thread.tokens,
            auth_source=self.account_type,
            tool_events=list(thread.items),
            denied_tools=list(thread.denied),
            tools_offered=None,
            tool_servers=list(self.tool_servers),
            session={
                "codex_version": self.user_agent,
                "cwd": started.get("cwd"),
                "sandbox": started.get("sandbox"),
                "approval_policy": started.get("approvalPolicy"),
                "approvals_reviewer": started.get("approvalsReviewer"),
                "instruction_sources": others,
                "user_instruction_files": own,
                "plugins_switched_off": list(self.plugins_off),
                "servers_switched_off": list(self.servers_off),
                "ephemeral": (started.get("thread") or {}).get("ephemeral"),
                "refused_requests": list(self.refused),
            },
            rate_limit=self.rate_limit,
        )

    def _split_instruction_files(self, sources: list[Any]) -> tuple[list[str], list[str]]:
        """The user's own file in Codex's home folder, and every other instruction file."""
        allowed = (
            {os.path.normpath(os.path.join(self.codex_home, n)) for n in USER_INSTRUCTION_FILES}
            if self.codex_home
            else set()
        )
        own = [str(s) for s in sources if os.path.normpath(str(s)) in allowed]
        return own, [str(s) for s in sources if str(s) not in own]

    # --- shutting down -------------------------------------------------------------------

    async def aclose(self) -> None:
        process, self._process = self._process, None
        if process is not None and process.returncode is None:
            if process.stdin is not None:
                process.stdin.close()
            try:
                await asyncio.wait_for(process.wait(), 2)
            except TimeoutError:
                process.kill()
                await process.wait()
        for task in self._readers:
            task.cancel()
        self._readers = []
        self._started = False
        self._dead = None
        self._remove_home()

    def _remove_home(self) -> None:
        if self._home is not None:
            shutil.rmtree(self._home, ignore_errors=True)
            self._home = None

    def close(self) -> None:
        """Stop the app-server from outside its event loop (the terminal commands)."""
        process, self._process = self._process, None
        if process is not None and process.returncode is None:
            try:
                os.kill(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        self._started = False
        self._remove_home()
