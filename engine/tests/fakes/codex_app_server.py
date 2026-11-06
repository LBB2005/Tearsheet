"""A scripted stand-in for `codex app-server` (design item 13, `test_codex.py`).

It speaks the same JSON lines as the real program and replays a scenario file named in
FAKE_CODEX_SCENARIO. Every message it receives, and its own arguments, go to FAKE_CODEX_LOG.
Like the real program, its replies leave out "jsonrpc", its own requests are numbered from 0,
and every error uses code -32600.
"""

from __future__ import annotations

import json
import os
import sys
import tomllib

SCENARIO = json.loads(open(os.environ["FAKE_CODEX_SCENARIO"]).read())
LOG = open(os.environ["FAKE_CODEX_LOG"], "a")


def log(kind: str, data) -> None:
    LOG.write(json.dumps({"kind": kind, "data": data}) + "\n")
    LOG.flush()


def send(message: dict) -> None:
    sys.stdout.write(json.dumps(message) + "\n")
    sys.stdout.flush()


def read() -> dict | None:
    line = sys.stdin.readline()
    if not line:
        return None
    message = json.loads(line)
    log("received", message)
    return message


def note(method: str, params: dict) -> None:
    send({"method": method, "params": params})


def run_turn(thread_id: str, turn: dict) -> None:
    turn_id = f"{thread_id}-turn"
    note("turn/started", {"threadId": thread_id, "turn": {"id": turn_id, "status": "inProgress"}})
    if turn.get("exit"):
        sys.stderr.write("fatal: the fake stopped on purpose\n")
        sys.stderr.flush()
        sys.exit(3)
    if turn.get("rate_limits"):
        note("account/rateLimits/updated", {"rateLimits": turn["rate_limits"]})
    request = turn.get("request")
    if request:
        # Codex numbers its own requests from 0, which collides with the client's ids.
        send(
            {
                "id": 0,
                "method": request["method"],
                "params": {"threadId": thread_id, "turnId": turn_id, **request.get("params", {})},
            }
        )
        while True:
            reply = read()
            if reply is None:
                return
            if reply.get("id") == 0 and "method" not in reply:
                log("approval_reply", reply)
                break
    for n, item in enumerate(turn.get("items", [])):
        item = {"id": f"item-{n}", **item}
        note(
            "item/started",
            {"threadId": thread_id, "turnId": turn_id, "item": item, "startedAtMs": 0},
        )
        note(
            "item/completed",
            {"threadId": thread_id, "turnId": turn_id, "item": item, "completedAtMs": 0},
        )
    text = turn.get("text")
    if text is not None:
        item_id = "msg-1"
        for start in range(0, len(text), 7):
            note(
                "item/agentMessage/delta",
                {
                    "threadId": thread_id,
                    "turnId": turn_id,
                    "itemId": item_id,
                    "delta": text[start : start + 7],
                },
            )
        note(
            "item/completed",
            {
                "threadId": thread_id,
                "turnId": turn_id,
                "item": {"type": "agentMessage", "id": item_id, "text": text},
                "completedAtMs": 0,
            },
        )
    note(
        "thread/tokenUsage/updated",
        {
            "threadId": thread_id,
            "turnId": turn_id,
            "tokenUsage": {
                "last": {
                    "inputTokens": 120,
                    "outputTokens": 30,
                    "cachedInputTokens": 0,
                    "reasoningOutputTokens": 5,
                    "totalTokens": 150,
                },
                "total": {},
            },
        },
    )
    if turn.get("hang"):
        while True:
            message = read()
            if message is None:
                return
            if message.get("method") == "turn/interrupt":
                note(
                    "turn/completed",
                    {
                        "threadId": thread_id,
                        "turn": {"id": turn_id, "status": "interrupted", "items": []},
                    },
                )
                return
    note(
        "turn/completed",
        {
            "threadId": thread_id,
            "turn": {
                "id": turn_id,
                "status": turn.get("status", "completed"),
                "error": turn.get("error"),
                "items": [],
            },
        },
    )


def switched_off(argv: list[str], key: str) -> set[str]:
    """Entries the client switched off with `-c <key>={...}`, read as TOML like the real
    program does (so a malformed override fails here too)."""
    off = set()
    for flag, value in zip(argv, argv[1:], strict=False):
        if flag == "-c" and value.startswith(f"{key}="):
            table = tomllib.loads(value)[key]
            off |= {name for name, entry in table.items() if entry.get("enabled") is False}
    return off


def main() -> None:
    if sys.argv[1:] == ["--version"]:
        print(SCENARIO.get("version", "codex-cli 0.165.0"))
        return
    log("argv", sys.argv[1:])
    log("cwd", os.getcwd())
    log("env", sorted(os.environ))
    threads = list(SCENARIO.get("threads", []))
    count = 0
    # Tool servers from the user's settings ("mcp_servers": [name]) and from plugins
    # ("plugins": {"id": [name]}). Like the real program, a switched-off server is still listed,
    # with no tools, unless the scenario says the switch is ignored.
    plugins = SCENARIO.get("plugins", {})
    ignore = SCENARIO.get("ignore_switch")
    off = set() if ignore else switched_off(sys.argv[1:], "plugins")
    servers_off = set() if ignore else switched_off(sys.argv[1:], "mcp_servers")
    servers = [
        {
            "name": n,
            "pluginId": None,
            "runtimeStatus": None,
            "tools": [] if n in servers_off else [{"name": "t1"}, {"name": "t2"}],
        }
        for n in SCENARIO.get("mcp_servers", [])
    ]
    servers += [
        {
            "name": n,
            "pluginId": pid,
            "runtimeStatus": None,
            "tools": [] if pid in off else [{"name": "t"}],
        }
        for pid, names in plugins.items()
        for n in names
    ]
    while True:
        message = read()
        if message is None:
            return
        method, request_id, params = (
            message.get("method"),
            message.get("id"),
            message.get("params") or {},
        )
        if method == "initialize":
            if SCENARIO.get("stderr_bytes"):
                # More than a pipe holds: the client must keep reading standard error.
                sys.stderr.write("x" * SCENARIO["stderr_bytes"] + "\n")
                sys.stderr.flush()
            send(
                {
                    "id": request_id,
                    "result": {
                        "userAgent": "codex_cli_rs/0.165.0 (fake)",
                        "codexHome": SCENARIO.get("codex_home", "/fake"),
                        "platformFamily": "unix",
                        "platformOs": "macos",
                    },
                }
            )
        elif method == "initialized":
            pass
        elif method == "account/read":
            account = SCENARIO.get(
                "account",
                {
                    "account": {
                        "type": "chatgpt",
                        "email": "someone@example.com",
                        "planType": "plus",
                    },
                    "requiresOpenaiAuth": True,
                },
            )
            send({"id": request_id, "result": account})
        elif method == "mcpServerStatus/list":
            send(
                {
                    "id": request_id,
                    "result": {"data": servers},
                }
            )
        elif method == "plugin/installed":
            if SCENARIO.get("no_plugin_request"):
                send({"id": request_id, "error": {"code": -32600, "message": "unknown method"}})
                continue
            entries = [{"id": pid, "installed": True, "enabled": pid not in off} for pid in plugins]
            send(
                {
                    "id": request_id,
                    "result": {"marketplaces": [{"name": "openai-bundled", "plugins": entries}]},
                }
            )
        elif method == "thread/start":
            scene = threads.pop(0) if threads else {"turn": {"text": "{}"}}
            if scene.get("start_error"):
                send({"id": request_id, "error": {"code": -32600, **scene["start_error"]}})
                continue
            count += 1
            thread_id = f"thread-{count}"
            note("thread/started", {"thread": {"id": thread_id}})
            send(
                {
                    "id": request_id,
                    "result": {
                        "thread": {"id": thread_id, "ephemeral": params.get("ephemeral")},
                        "model": scene.get("model", "gpt-fake"),
                        "modelProvider": "openai",
                        "cwd": params.get("cwd"),
                        "sandbox": {"type": params.get("sandbox")},
                        "approvalPolicy": params.get("approvalPolicy"),
                        "approvalsReviewer": params.get("approvalsReviewer"),
                        "instructionSources": scene.get("instruction_sources", []),
                    },
                }
            )
            pending_turn = scene.get("turn", {})
        elif method == "turn/start":
            send(
                {
                    "id": request_id,
                    "result": {
                        "turn": {
                            "id": f"{params['threadId']}-turn",
                            "status": "inProgress",
                            "items": [],
                        }
                    },
                }
            )
            run_turn(params["threadId"], pending_turn)
        else:
            send(
                {"id": request_id, "error": {"code": -32600, "message": f"unknown method {method}"}}
            )


main()
