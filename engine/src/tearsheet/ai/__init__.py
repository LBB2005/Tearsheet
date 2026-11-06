"""AI connectors: Claude Code (Phase 0) and Codex (Phase 2, Liam, Nov 3)."""

from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path
from typing import TYPE_CHECKING

from tearsheet import config

if TYPE_CHECKING:
    import sqlite3

    from tearsheet.ai.claude_code import ClaudeCodeConnector
    from tearsheet.ai.client import AIClient, CallBudget
    from tearsheet.ai.codex import CodexConnector

TOOL_NAMES = {"claude": "Claude Code", "codex": "Codex"}


def api_billing(tool: str, settings: config.Settings) -> bool:
    """Whether the user chose API billing for this tool (`claude_billing`/`codex_billing`)."""
    return settings.get(f"{tool}_billing") == "api"


def connector_for(
    tool: str, settings: config.Settings, *, extra_env: Mapping[str, str] | None = None
) -> ClaudeCodeConnector | CodexConnector:
    from tearsheet.ai.client import AIUnavailable

    if tool not in TOOL_NAMES:
        raise AIUnavailable(f"Unknown AI tool '{tool}'. Choose claude or codex.")
    program = config.find_program(tool)
    if program is None:
        login = "claude auth login" if tool == "claude" else "codex login"
        env = config.CLAUDE_BIN_ENV if tool == "claude" else config.CODEX_BIN_ENV
        raise AIUnavailable(
            f"{TOOL_NAMES[tool]} wasn't found on PATH. Install it and sign in ({login}), "
            f"or pass its path in {env}."
        )
    if tool == "codex":
        from tearsheet.ai.codex import CodexConnector

        return CodexConnector(
            program, api_billing=api_billing("codex", settings), extra_env=extra_env
        )
    from tearsheet.ai.claude_code import ClaudeCodeConnector

    return ClaudeCodeConnector(
        program,
        mode=settings.get("claude_mode") or "sdk",
        api_billing=api_billing("claude", settings),
        extra_env=extra_env,
    )


def client_for(
    conn: sqlite3.Connection,
    settings: config.Settings,
    *,
    tool: str | None = None,
    signal_dir: Path | None = None,
    budget: int = config.CALL_BUDGET,
) -> AIClient:
    """An AIClient for one run, with the lock-down gate wired to the short check."""
    from tearsheet.ai.client import choose_tool

    return client_on(
        conn, settings, choose_tool(tool, settings), signal_dir=signal_dir, budget=budget
    )


def client_on(
    conn: sqlite3.Connection,
    settings: config.Settings,
    tool: str,
    *,
    signal_dir: Path | None = None,
    budget: int | CallBudget = config.CALL_BUDGET,
) -> AIClient:
    """An AIClient on the named tool."""
    from tearsheet.ai import lockdown
    from tearsheet.ai.client import AIClient, ToolState

    connector = connector_for(tool, settings)
    billing = api_billing(tool, settings)
    return AIClient(
        connector,
        ToolState(conn, connector.tool),
        short_check=lockdown.short_check(connector, api_billing=billing),
        api_billing=billing,
        signal_dir=signal_dir,
        budget=budget,
    )


def other_tool(tool: str) -> str:
    return "codex" if tool == "claude" else "claude"


def is_connected(conn: sqlite3.Connection, tool: str) -> bool:
    """Found, and passed the lock-down check, with nothing blocking it (Technical Plan §4).
    A changed version is re-checked by the client's gate before its first call."""
    from tearsheet.ai.client import ToolState

    if config.find_program(tool) is None:
        return False
    row = ToolState(conn, tool).row()
    return bool(row and row["lockdown_passed"] and not row["blocked_reason"])


def checker_for(
    conn: sqlite3.Connection,
    settings: config.Settings,
    primary: AIClient,
    *,
    signal_dir: Path | None = None,
) -> AIClient | None:
    """The other-tool skeptic's client (design item 48): the other AI tool, when it is
    connected too. It shares the run's call budget. None means the skeptic is self-checked."""
    from tearsheet.ai.client import AIUnavailable

    tool = other_tool(primary.connector.tool)
    if not is_connected(conn, tool):
        return None
    try:
        return client_on(conn, settings, tool, signal_dir=signal_dir, budget=primary.shared_budget)
    except AIUnavailable:
        return None


async def close_connector(connector: object) -> None:
    """Stop a connector's program and remove its temporary files."""
    aclose = getattr(connector, "aclose", None)
    if aclose is not None:
        await aclose()
    close = getattr(connector, "close", None)
    if close is not None:
        close()
