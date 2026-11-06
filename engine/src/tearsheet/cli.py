"""Terminal commands (design item 12). Phase 0 has `lockdown-check`, `set-key` and
`set-setting`; Phase 1a adds `run` (the thin slice); `resume`, `replay`, `serve` and the rest follow.

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
from pathlib import Path

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


async def _closing(work, *clients):
    """Await a run, then stop the AI tools' programs inside the same event loop."""
    try:
        return await work
    finally:
        from tearsheet.ai import close_connector

        for client in clients:
            if client is not None:
                await close_connector(client.connector)


def cmd_lockdown_check(args: argparse.Namespace) -> int:
    from tearsheet.ai import api_billing as billing_for
    from tearsheet.ai import close_connector, connector_for
    from tearsheet.ai.client import ToolState, choose_tool
    from tearsheet.ai.lockdown import run_check

    paths, database = _open(args, "lockdown-check")
    try:
        settings = config.Settings(database.conn)
        tool = choose_tool(args.tool, settings)
        connector = connector_for(tool, settings)
        form = "short" if args.short else "full"
        api_billing = billing_for(tool, settings)
        mode = getattr(connector, "mode", None)
        print(
            f"Lock-down check ({form} form) on {connector.display_name}"
            f"{f', using the {mode} mode' if mode else ''}. Don't use {connector.display_name} "
            "elsewhere until it finishes."
        )

        async def check():
            try:
                return await run_check(
                    connector, form=form, api_billing=api_billing, progress=print
                )
            finally:
                await close_connector(connector)

        report = asyncio.run(check())
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


def cmd_run(args: argparse.Namespace) -> int:
    from pathlib import Path

    from tearsheet.methodology import load
    from tearsheet.pipeline import Run, new_run_id
    from tearsheet.rawstore import RawStore
    from tearsheet.sources import LiveData, StoredData

    paths, database = _open(args, "run")
    ai = checker = None
    try:
        from tearsheet.pipeline import mark_interrupted

        mark_interrupted(database.conn)
        settings = config.Settings(database.conn)
        method = load(local_allowlist=paths.data_dir / "allowlist.local.yaml")
        if not args.no_ai:
            from tearsheet.ai import client_for

            ai = client_for(
                database.conn, settings, tool=args.tool, signal_dir=paths.logs / "ai-signals"
            )
            if args.full:
                from tearsheet.ai import checker_for

                checker = checker_for(
                    database.conn, settings, ai, signal_dir=paths.logs / "ai-signals"
                )
        run_id = new_run_id()
        out_dir = paths.data_dir / "reports"

        def progress(step: str, state: str) -> None:
            if state == "started":
                print(f"  {step} ...", flush=True)

        kind = "full method" if args.full else "thin slice, Phase 1a"
        print(f"Report on {args.ticker} ({kind}){' with no AI' if ai is None else ''}.")
        if args.stored:
            today = datetime.now(UTC).date()
            data = StoredData(
                [Path(p).expanduser() for p in args.stored],
                risk_free=args.risk_free / 100,
                risk_free_date=today,
            )
            run = Run(
                database.conn,
                data,
                ai,
                method,
                mode="full" if args.full else "slice",
                out_dir=out_dir,
                progress=progress,
                run_id=run_id,
                checker=checker,
            )
            result = asyncio.run(_closing(run.run(args.ticker), ai, checker))
        else:
            from tearsheet.http import HttpClient

            async def go():
                rawstore = RawStore(paths.raw, database.conn)
                async with HttpClient(
                    rawstore,
                    run_id,
                    settings=settings,
                    sec_user_agent=config.sec_user_agent(settings),
                    massive_key=config.get_key("massive"),
                ) as http:
                    data = LiveData(http, rawstore, database.conn, fred_key=config.get_key("fred"))
                    run = Run(
                        database.conn,
                        data,
                        ai,
                        method,
                        mode="full" if args.full else "slice",
                        out_dir=out_dir,
                        progress=progress,
                        run_id=run_id,
                        rawstore=rawstore,
                        checker=checker,
                        # Live full-method runs log official predictions (item 35).
                        log_predictions=args.full,
                        backup_dir=Path(
                            settings.get("backup_dir") or config.DEFAULT_BACKUP_DIR
                        ).expanduser(),
                    )
                    return await _closing(run.run(args.ticker), ai, checker)

            result = asyncio.run(go())
    finally:
        for client in (ai, checker):
            if client is not None:
                client.connector.close()
        database.close()
    print()
    print(f"Status: {result.status}. Rating: {result.rating or 'withheld'}.")
    if result.prediction:
        print(result.prediction)
    for note in result.notes:
        print(f"  - {note}")
    if result.html_path:
        print(f"Report: {result.html_path}")
    return 0 if result.status in ("done", "done_incomplete") else 1


def cmd_resume(args: argparse.Namespace) -> int:
    from tearsheet.pipeline import mark_interrupted, resume_run
    from tearsheet.replay import ReplayError

    paths, database = _open(args, "resume")
    ai = checker = None
    try:
        mark_interrupted(database.conn)
        row = database.conn.execute(
            "SELECT ai_tool FROM runs WHERE run_id = ?", (args.run_id,)
        ).fetchone()
        if row is None:
            print(f"No run {args.run_id} in this data folder.", file=sys.stderr)
            return 2
        if row[0]:
            from tearsheet.ai import client_for

            # A run keeps its tool, including on Resume (Technical Plan §4).
            ai = client_for(
                database.conn,
                config.Settings(database.conn),
                tool=row[0],
                signal_dir=paths.logs / "ai-signals",
            )
            from tearsheet.ai import checker_for

            checker = checker_for(
                database.conn,
                config.Settings(database.conn),
                ai,
                signal_dir=paths.logs / "ai-signals",
            )

        def progress(step: str, state: str) -> None:
            if state == "started":
                print(f"  {step} ...", flush=True)

        try:
            result = resume_run(
                database.conn,
                args.run_id,
                raw_dir=paths.raw,
                ai=ai,
                out_dir=paths.data_dir / "reports",
                progress=progress,
                checker=checker,
            )
        except ReplayError as exc:
            print(str(exc), file=sys.stderr)
            return 2
    finally:
        for client in (ai, checker):
            if client is not None:
                client.connector.close()
        database.close()
    print(f"\nStatus: {result.status}. Rating: {result.rating or 'withheld'}.")
    if result.html_path:
        print(f"Report: {result.html_path}")
    return 0 if result.status in ("done", "done_incomplete") else 1


def cmd_replay(args: argparse.Namespace) -> int:
    from tearsheet.replay import ReplayError, replay

    paths = config.Paths(config.resolve_data_dir(getattr(args, "data_dir", None)))
    try:
        result = replay(paths.db, args.run_id, raw_dir=paths.raw)
    except ReplayError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    if result.identical:
        print(
            f"Replayed {result.run_id}: identical numbers in {result.compared} steps and every metric."
        )
        return 0
    print(f"Replayed {result.run_id}: {len(result.differences)} differences.")
    for line in result.differences[:50]:
        print(f"  - {line}")
    if not result.same_method_code:
        print(
            "The run was made by an older method code version, so differences are expected (listed only)."
        )
        return 0
    return 1


def _goal1_round(database) -> int:
    value = config.Settings(database.conn).get("goal1_round")
    return int(float(value)) if value else 1


def cmd_goal1(args: argparse.Namespace) -> int:
    from tearsheet.goal1 import MIN_REPORTS, MIN_SECTORS, YES_SHARE, tally

    _, database = _open(args, "goal1")
    try:
        round_ = _goal1_round(database)
        t = tally(database.conn, goal1_round=round_)
    finally:
        database.close()
    yes = "none yet" if t.yes_share is None else f"{t.yes_share:.0%}"
    outside = "none yet" if t.outside_checker_share is None else f"{t.outside_checker_share:.0%}"
    print(f"Goal 1, round {round_}:")
    print(
        f"  Reports counted: {t.reports} (need {MIN_REPORTS}); companies {t.companies}; sectors {t.sectors} (need {MIN_SECTORS}); bank or REIT: {'yes' if t.has_bank_or_reit else 'no'}"
    )
    print(f"  Confirmed errors: {t.confirmed_errors} (need 0)")
    print(f"  Citations that fail to support their claim: {t.failed_citations} (need 0)")
    print(f"  'Better than my usual sources': {yes} yes (need {YES_SHARE:.0%})")
    print(f"  Outside-checker trigger (not supported ÷ checked, first 10 reports): {outside}")
    print("  PASSED" if t.passed else "  Not passed yet.")
    return 0


def cmd_flag(args: argparse.Namespace) -> int:
    from tearsheet.goal1 import add_review

    _, database = _open(args, "flag")
    try:
        claim = database.conn.execute(
            "SELECT report_id FROM claims WHERE claim_id = ?", (args.claim_id,)
        ).fetchone()
        if claim is None:
            print(
                f"No claim {args.claim_id}. Claim IDs are shown in square brackets in terminal reports.",
                file=sys.stderr,
            )
            return 2
        review = add_review(
            database.conn,
            report_id=claim[0],
            claim_id=args.claim_id,
            origin="reader_flag",
            label="open",
            note=args.note,
        )
    finally:
        database.close()
    print(f"Flagged {args.claim_id} ({review}). Resolve it in the next spot-check.")
    return 0


def _ask(question: str, answers: dict[str, str]) -> str:
    keys = "/".join(answers)
    while True:
        reply = input(f"{question} [{keys}]: ").strip().lower()
        if reply in answers:
            return answers[reply]
        print(f"Type one of: {keys}")


def cmd_spot_check(args: argparse.Namespace) -> int:
    import json as _json

    from tearsheet.goal1 import add_review, citations_to_check, counted_reports

    _, database = _open(args, "spot-check")
    conn = database.conn
    try:
        round_ = _goal1_round(conn_db := database)
        reports = (
            [args.report_id]
            if args.report_id
            else counted_reports(conn_db.conn, goal1_round=round_)
        )
        answered = {
            r[0]
            for r in conn.execute(
                "SELECT report_id FROM claim_reviews WHERE origin = 'report_answer'"
            )
        }
        todo = [r for r in reports if r not in answered]
        if not todo:
            print("Nothing to check: every counted report has its answer.")
        for report_id in todo:
            print(f"\nReport {report_id}")
            for claim_id, index in citations_to_check(conn, report_id, goal1_round=round_):
                row = conn.execute(
                    "SELECT sentence_id, citations_json FROM claims WHERE claim_id = ?", (claim_id,)
                ).fetchone()
                section = conn.execute(
                    "SELECT json FROM sections WHERE report_id = ? AND key = 'report'", (report_id,)
                ).fetchone()
                text = ""
                if section:
                    for s in _json.loads(section[0]).get("sections", []):
                        for sentence in s.get("sentences", []):
                            if sentence["id"] == row[0]:
                                text = sentence.get("text") or ""
                pid = _json.loads(row[1])[index]
                para = conn.execute("SELECT text FROM paragraphs WHERE id = ?", (pid,)).fetchone()
                print(
                    f"\n[{row[0]}] {text}\n  Source {index + 1} ({pid}):\n  {para[0] if para else '(paragraph not stored)'}"
                )
                label = _ask(
                    "Does the source support the claim?",
                    {"s": "supported", "n": "not_supported", "w": "wrong"},
                )
                add_review(
                    conn,
                    report_id=report_id,
                    claim_id=claim_id,
                    citation_index=index,
                    origin="spot_check",
                    label=label,
                )
            for flag in conn.execute(
                "SELECT review_id, claim_id, note FROM claim_reviews f WHERE report_id = ? AND origin = 'reader_flag' AND label = 'open'"
                " AND NOT EXISTS (SELECT 1 FROM claim_reviews r WHERE r.resolves_review_id = f.review_id)",
                (report_id,),
            ).fetchall():
                label = _ask(
                    f"Your flag on {flag[1]} ({flag[2] or 'no note'}): an error?",
                    {"y": "confirmed_error", "n": "not_an_error"},
                )
                add_review(
                    conn,
                    report_id=report_id,
                    claim_id=flag[1],
                    origin="reader_flag",
                    label=label,
                    resolves=flag[0],
                )
            answer = _ask(
                "Was this better than my usual sources for this decision?", {"y": "yes", "n": "no"}
            )
            add_review(conn, report_id=report_id, origin="report_answer", label=answer)
    finally:
        database.close()
    return 0


def cmd_grade(args: argparse.Namespace) -> int:
    from tearsheet.grading import grade_job, summary
    from tearsheet.http import HttpClient
    from tearsheet.methodology import load
    from tearsheet.rawstore import RawStore
    from tearsheet.sources import LiveData

    paths, database = _open(args, "grade")
    try:
        settings = config.Settings(database.conn)
        rules = load().grading
        backup_dir = Path(settings.get("backup_dir") or config.DEFAULT_BACKUP_DIR).expanduser()

        async def go():
            rawstore = RawStore(paths.raw, database.conn)
            now = datetime.now(UTC)
            async with HttpClient(
                rawstore,
                f"grade-{now:%Y%m%dT%H%M%SZ}",
                settings=settings,
                massive_key=config.get_key("massive"),
            ) as http:
                data = LiveData(http, rawstore, database.conn, fred_key=None)
                return await grade_job(database.conn, data, rules, now=now, backup_dir=backup_dir)

        result = asyncio.run(go())
        from tearsheet.data.prices import PriceStore

        stats = summary(database.conn, rules, store=PriceStore(database.conn))
    finally:
        database.close()
    print(f"Graded {result['graded']} new horizons. {result.get('note') or ''}".strip())
    print(
        f"Results are {stats['label']} ({stats['headline_graded_12m']} headline predictions graded at 12 months). {stats['note']}"
    )
    for group in stats["groups"]:
        print(
            f"Method code {group['method_code_version']}, methodology {group['methodology_hash'][:8]}, grading rules v{group['grading_version']}:"
        )
        for months, h in group["horizons"].items():
            hit = h["hit_rate"]
            rate = (
                "n/a"
                if hit["value"] is None
                else f"{hit['value']:.0%} (95% interval {hit['low']:.0%}-{hit['high']:.0%})"
            )
            base = h["baselines"]["random_mix_hit_rate"]
            print(
                f"  {months} months: {h['count']} graded; hit rate {rate}; random-mix baseline {'n/a' if base is None else f'{base:.0%}'}"
            )
    return 0


def cmd_serve(args: argparse.Namespace) -> int:
    from tearsheet.server import serve

    paths = config.Paths(config.resolve_data_dir(getattr(args, "data_dir", None)))
    return asyncio.run(serve(paths))


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

    run = commands.add_parser("run", parents=[common], help="write a report on one company")
    run.add_argument("ticker", help="a ticker, alias or company name in the S&P 500")
    run.add_argument("--tool", choices=("claude", "codex"))
    run.add_argument("--no-ai", action="store_true", help="code-written sections only; no AI calls")
    run.add_argument(
        "--full",
        action="store_true",
        help="the full method's code steps (every metric, three valuation methods, red flags)",
    )
    run.add_argument(
        "--stored",
        nargs="+",
        metavar="FOLDER",
        help="read inputs from these data folders instead of downloading (offline)",
    )
    run.add_argument(
        "--risk-free", type=float, default=4.25, help="with --stored: the 10-year yield, in percent"
    )
    run.set_defaults(handler=cmd_run)

    resume = commands.add_parser("resume", parents=[common], help="continue a stopped run")
    resume.add_argument("run_id")
    resume.set_defaults(handler=cmd_resume)

    again = commands.add_parser(
        "replay", parents=[common], help="re-run a run's code steps from its stored inputs"
    )
    again.add_argument("run_id")
    again.set_defaults(handler=cmd_replay)

    grade = commands.add_parser(
        "grade", parents=[common], help="grade the logged predictions that are due"
    )
    grade.set_defaults(handler=cmd_grade)

    serve = commands.add_parser(
        "serve",
        parents=[common],
        help="the engine for the Mac app (JSON-RPC on standard input and output)",
    )
    serve.set_defaults(handler=cmd_serve)

    goal = commands.add_parser("goal1", parents=[common], help="the Goal 1 tally")
    goal.set_defaults(handler=cmd_goal1)

    flag = commands.add_parser("flag", parents=[common], help="flag one claim in a report")
    flag.add_argument("claim_id", help="as shown in square brackets, such as rep-…:business.2")
    flag.add_argument("note", nargs="?", default=None)
    flag.set_defaults(handler=cmd_flag)

    spot = commands.add_parser(
        "spot-check", parents=[common], help="check citations and answer the Goal 1 question"
    )
    spot.add_argument("report_id", nargs="?")
    spot.set_defaults(handler=cmd_spot_check)

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
