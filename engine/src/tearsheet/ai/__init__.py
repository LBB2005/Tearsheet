"""AI connectors. Claude Code is built in Phase 0; Codex arrives in Phase 2 (Liam, Nov 3)."""

from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path
from typing import TYPE_CHECKING

from tearsheet import config

if TYPE_CHECKING:
    import sqlite3

    from tearsheet.ai.claude_code import ClaudeCodeConnector
    from tearsheet.ai.client import AIClient

CODEX_LATER = (
    "Codex support arrives in Phase 2: Claude Code is the everyday tool, so the Codex "
    "connector is built when the other-tool skeptic needs it."
)


def connector_for(
    tool: str, settings: config.Settings, *, extra_env: Mapping[str, str] | None = None
) -> ClaudeCodeConnector:
    from tearsheet.ai.claude_code import ClaudeCodeConnector
    from tearsheet.ai.client import AIUnavailable

    if tool == "codex":
        raise AIUnavailable(CODEX_LATER)
    if tool != "claude":
        raise AIUnavailable(f"Unknown AI tool '{tool}'. Choose claude or codex.")
    program = config.find_program("claude")
    if program is None:
        raise AIUnavailable(
            "Claude Code wasn't found on PATH. Install it and sign in (claude auth login), "
            f"or pass its path in {config.CLAUDE_BIN_ENV}."
        )
    return ClaudeCodeConnector(
        program,
        mode=settings.get("claude_mode") or "sdk",
        api_billing=settings.get("claude_billing") == "api",
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
    from tearsheet.ai import lockdown
    from tearsheet.ai.client import AIClient, ToolState, choose_tool

    chosen = choose_tool(tool, settings)
    connector = connector_for(chosen, settings)
    api_billing = settings.get("claude_billing") == "api"
    return AIClient(
        connector,
        ToolState(conn, connector.tool),
        short_check=lockdown.short_check(connector, api_billing=api_billing),
        api_billing=api_billing,
        signal_dir=signal_dir,
        budget=budget,
    )
