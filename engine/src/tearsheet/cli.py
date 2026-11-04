"""Terminal commands (design item 12). Phase 0 has `lockdown-check`, `set-key` and
`set-setting`; Phase 1 adds `run`, `resume`, `replay`, `serve` and the rest.

Every command takes `--data-dir`.
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import logging
import signal
import sys
from datetime import UTC, datetime

from tearsheet import ENGINE_VERSION, config
from tearsheet.db import DatabaseTooNew, open_database

KEY_LABELS = {"massive": "Massive", "fred": "FRED", "alphavantage": "Alpha Vantage"}


def _stop_on_sigterm(signum: int, frame: object) -> None:
    # Turned into KeyboardInterrupt so `finally` blocks run (the lock-down check removes
    # its bait files there).
    raise KeyboardInterrupt


def _open(args: argparse.Namespace, command: str):
    paths = config.Paths(config.resolve_data_dir(getattr(args, "data_dir", None))).ensure()
    database = open_database(paths.db)
    database.require_writable(command)
    return paths, database


def cmd_set_key(args: argparse.Namespace) -> int:
    service = args.service
    label = KEY_LABELS[service]
    value = getpass.getpass(f"Paste your {label} key (it won't show as you type): ").strip()
    if not value:
        print("No key entered, so nothing was saved.")
        return 1
    config.set_key(service, value)
    print(
        f"Saved your {label} key in the macOS Keychain "
        f"(service '{config.KEYCHAIN_SERVICE}', account '{service}')."
    )
    return 0


def cmd_set_setting(args: argparse.Namespace) -> int:
    _, database = _open(args, "set-setting")
    try:
        stored = config.Settings(database.conn).set(args.key, args.value)
    finally:
        database.close()
    print(f"Set {args.key} to {stored}.")
    return 0


def cmd_lockdown_check(args: argparse.Namespace) -> int:
    from tearsheet.ai import CODEX_LATER, connector_for
    from tearsheet.ai.client import ToolState, choose_tool
    from tearsheet.ai.lockdown import run_check

    paths, database = _open(args, "lockdown-check")
    try:
        settings = config.Settings(database.conn)
        tool = choose_tool(args.tool, settings)
        if tool == "codex":
            print(CODEX_LATER + " Nothing was checked.")
            return 2
        connector = connector_for(tool, settings)
        form = "short" if args.short else "full"
        api_billing = settings.get("claude_billing") == "api"
        print(
            f"Lock-down check ({form} form) on {connector.display_name}, "
            f"using the {connector.mode} mode. Don't use {connector.display_name} elsewhere "
            "until it finishes."
        )
        try:
            report = asyncio.run(
                run_check(connector, form=form, api_billing=api_billing, progress=print)
            )
        finally:
            connector.close()
        if report.inconclusive is None:
            ToolState(database.conn, tool).record_check(
                version=report.program_version,
                model_ids=report.model_ids,
                form=form,
                passed=report.passed,
            )
    finally:
        database.close()

    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    report_path = paths.logs / f"lockdown-{tool}-{form}-{stamp}.json"
    report_path.write_text(report.to_json())
    print()
    print(f"Program version: {report.program_version}")
    print(f"Models seen: {', '.join(report.model_ids) or 'none'}")
    if report.inconclusive:
        print(f"The check couldn't finish, so nothing was recorded: {report.inconclusive}")
        print("Run it again once that is fixed.")
    elif report.passed:
        print(f"PASSED. {connector.display_name} is locked down.")
    else:
        print(f"FAILED. {connector.display_name} stays blocked until a full check passes:")
        for problem in report.problems:
            print(f"  - {problem}")
    print(f"Full report: {report_path}")
    return 0 if report.passed else 1


def build_parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument(
        "--data-dir",
        default=argparse.SUPPRESS,
        help=f"data folder (default: ${config.DATA_DIR_ENV}, then {config.DEFAULT_DATA_DIR})",
    )
    # The --data-dir action is shared by every subcommand, so it keeps SUPPRESS as its
    # default (a default set here would overwrite a value given before the command name).
    parser = argparse.ArgumentParser(
        prog="tearsheet-engine",
        description="Tearsheet's engine. Code makes every number; your AI tool writes the narrative.",
        parents=[common],
    )
    parser.add_argument("--version", action="version", version=f"tearsheet-engine {ENGINE_VERSION}")
    parser.add_argument("--verbose", action="store_true", help="log details to standard error")
    commands = parser.add_subparsers(dest="command", required=True, metavar="command")

    check = commands.add_parser(
        "lockdown-check", parents=[common], help="check that the AI tool runs with no tools"
    )
    check.add_argument("--short", action="store_true", help="the 5-call short form")
    check.add_argument("--tool", choices=("claude", "codex"))
    check.set_defaults(handler=cmd_lockdown_check)

    key = commands.add_parser("set-key", parents=[common], help="save a data key in the Keychain")
    key.add_argument("service", choices=config.KEY_SERVICES)
    key.set_defaults(handler=cmd_set_key)

    setting = commands.add_parser("set-setting", parents=[common], help="change one setting")
    setting.add_argument("key", choices=sorted(config.SETTINGS))
    setting.add_argument("value")
    setting.set_defaults(handler=cmd_set_setting)
    return parser


def main(argv: list[str] | None = None) -> int:
    from tearsheet.ai.client import AIError

    args = build_parser().parse_args(argv)
    signal.signal(signal.SIGTERM, _stop_on_sigterm)
    logging.basicConfig(
        stream=sys.stderr,
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(levelname)s %(name)s: %(message)s",
    )
    try:
        return args.handler(args)
    except (config.SettingMissing, DatabaseTooNew, ValueError, AIError) as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("Stopped.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    sys.exit(main())
