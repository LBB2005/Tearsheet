"""`tearsheet-engine serve`: the engine the app talks to (design item 37, Technical Plan §2).

Reads one JSON-RPC request per line from standard input, writes only protocol messages to
standard output, and sends all logging to standard error. The `hello` notification goes first.
Only one run (or resume) happens at a time; it runs in the background and reports through
`progress`, `report_ready` and `run_failed` notifications. Only the engine writes to the
database.
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
import uuid
from collections.abc import Callable
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ValidationError

from tearsheet import ENGINE_VERSION, METHOD_CODE_VERSION, config
from tearsheet.db import open_database
from tearsheet.protocol import (
    ENGINE_ERROR_CODE,
    INVALID_PARAMS,
    INVALID_REQUEST,
    METHOD_NOT_FOUND,
    METHODS,
    PARSE_ERROR,
    Hello,
    Progress,
    ReportReady,
    RunFailedNote,
)
from tearsheet.rawstore import RawStore

log = logging.getLogger(__name__)

SERVICES = [
    {
        "name": "SEC EDGAR",
        "key": "None (each request carries your contact email)",
        "cost": "Free",
        "sent": "Requests for the company's and peers' filings",
    },
    {
        "name": "iShares (BlackRock)",
        "key": "None",
        "cost": "Free",
        "sent": "A download of the IVV holdings file, at most once a day",
    },
    {
        "name": "Massive",
        "key": "Your free key",
        "cost": "Free plan",
        "sent": "The tickers researched and their peers",
    },
    {
        "name": "FRED",
        "key": "Your free key",
        "cost": "Free",
        "sent": "Requests for the listed economic series",
    },
    {
        "name": "Article sites on the allowlist",
        "key": "None",
        "cost": "Free",
        "sent": "Page requests",
    },
    {
        "name": "Claude Code (Anthropic)",
        "key": "Your own sign-in",
        "cost": "Your existing subscription",
        "sent": "Filing and article text, the computed numbers sent with that text, and draft sections",
    },
]
ICLOUD_FOLDERS = ("Documents", "Desktop", "Library/Mobile Documents")


class EngineError(Exception):
    def __init__(self, code: str, message: str, **data: Any):
        super().__init__(message)
        self.code = code
        self.data = data


def error_code(exc: BaseException) -> tuple[str, dict[str, Any]]:
    """The protocol's code for an exception, with its extra fields."""
    from tearsheet.ai.client import (
        AIAuthError,
        AIBudgetExhausted,
        AILockdownFailed,
        AIUnavailable,
        AIUsageLimit,
    )
    from tearsheet.http import SECBlocked
    from tearsheet.resolve import NotCovered

    if isinstance(exc, NotCovered):
        return "NOT_COVERED", {"candidates": exc.candidates}
    if isinstance(exc, AIUsageLimit):
        return "USAGE_LIMIT", {"reset_at": exc.reset_at}
    if isinstance(exc, AIAuthError):
        return "AUTH_EXPIRED", {"fix_command": exc.fix}
    if isinstance(exc, AILockdownFailed):
        return "LOCKDOWN_FAILED", {}
    if isinstance(exc, AIBudgetExhausted):
        return "BUDGET_EXHAUSTED", {}
    if isinstance(exc, AIUnavailable):
        return "AI_UNAVAILABLE", {}
    if isinstance(exc, SECBlocked):
        return "SEC_BLOCKED", {}
    if isinstance(exc, config.SettingMissing):
        return "ENGINE_ERROR", {}
    return "ENGINE_ERROR", {}


class Server:
    def __init__(
        self,
        paths: config.Paths,
        *,
        write: Callable[[dict[str, Any]], None],
        data_factory=None,
        ai_factory=None,
        checker_factory=None,
        now: Callable[[], datetime] | None = None,
    ):
        from tearsheet.methodology import load
        from tearsheet.pipeline import mark_interrupted

        self.paths = paths.ensure()
        self.write = write
        self.db = open_database(paths.db)
        self.db.require_writable("serve")
        self.rawstore = RawStore(paths.raw, self.db.conn)
        self.method = load(local_allowlist=paths.data_dir / "allowlist.local.yaml")
        self.data_factory = data_factory or self._live_data
        self.ai_factory = ai_factory or self._live_ai
        self.checker_factory = checker_factory or self._live_checker
        self.now = now or (lambda: datetime.now(UTC))
        self.job: asyncio.Task | None = None
        self.active = None  # the Run in progress
        mark_interrupted(self.db.conn)

    # --- the defaults: live data and the user's AI tool -----------------------------------------

    @asynccontextmanager
    async def _live_data(self, run_id: str, conn, rawstore):
        from tearsheet.http import HttpClient
        from tearsheet.sources import LiveData

        settings = config.Settings(conn)
        async with HttpClient(
            rawstore,
            run_id,
            settings=settings,
            sec_user_agent=config.sec_user_agent(settings),
            massive_key=config.get_key("massive"),
        ) as http:
            yield LiveData(http, rawstore, conn, fred_key=config.get_key("fred"))

    def _live_ai(self, conn, tool: str | None):
        from tearsheet.ai import client_for
        from tearsheet.ai.client import AIUnavailable

        try:
            return client_for(
                conn, config.Settings(conn), tool=tool, signal_dir=self.paths.logs / "ai-signals"
            )
        except AIUnavailable as exc:
            raise EngineError("NO_TOOL", str(exc)) from exc

    def _live_checker(self, conn, ai):
        from tearsheet.ai import checker_for

        return checker_for(
            conn, config.Settings(conn), ai, signal_dir=self.paths.logs / "ai-signals"
        )

    # --- messages --------------------------------------------------------------------------

    def notify(self, method: str, params: BaseModel) -> None:
        self.write({"jsonrpc": "2.0", "method": method, "params": params.model_dump(mode="json")})

    def _reply(self, id_: Any, result: Any) -> None:
        if isinstance(result, BaseModel):
            result = result.model_dump(mode="json")
        self.write({"jsonrpc": "2.0", "id": id_, "result": result})

    def _error(self, id_: Any, code: int, message: str, data: dict[str, Any] | None = None) -> None:
        error: dict[str, Any] = {"code": code, "message": message}
        if data is not None:
            error["data"] = data
        self.write({"jsonrpc": "2.0", "id": id_, "error": error})

    async def start(self) -> None:
        self.notify(
            "hello",
            Hello(
                engine_version=ENGINE_VERSION,
                methodology_hash=self.method.methodology_hash,
                method_code_version=METHOD_CODE_VERSION,
            ),
        )

    async def handle(self, line: str) -> None:
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            self._error(None, PARSE_ERROR, "That isn't JSON.")
            return
        if (
            not isinstance(message, dict)
            or message.get("jsonrpc") != "2.0"
            or "method" not in message
        ):
            self._error(
                message.get("id") if isinstance(message, dict) else None,
                INVALID_REQUEST,
                "Not a JSON-RPC 2.0 request.",
            )
            return
        id_, method = message.get("id"), message["method"]
        model = METHODS.get(method)
        if model is None:
            self._error(id_, METHOD_NOT_FOUND, f"No method '{method}'.")
            return
        try:
            params = model.model_validate(message.get("params") or {})
        except ValidationError as exc:
            self._error(
                id_, INVALID_PARAMS, f"Bad parameters for {method}: {exc.errors()[0]['msg']}"
            )
            return
        try:
            result = await getattr(self, f"m_{method}")(params)
        except EngineError as exc:
            self._error(id_, ENGINE_ERROR_CODE, str(exc), {"code": exc.code, **exc.data})
            return
        except ValueError as exc:
            self._error(id_, INVALID_PARAMS, str(exc))
            return
        except Exception as exc:  # noqa: BLE001 - every failure becomes a protocol error
            log.exception("request %s failed", method)
            code, data = error_code(exc)
            self._error(id_, ENGINE_ERROR_CODE, str(exc), {"code": code, **data})
            return
        self._reply(id_, result)

    # --- runs ------------------------------------------------------------------------------

    def _busy(self) -> bool:
        return self.job is not None and not self.job.done()

    def _progress(self, run_id: str):
        from tearsheet.pipeline import STEPS

        def send(step: str, state: str) -> None:
            number = STEPS.index(step) + 1 if step in STEPS else 0
            self.notify(
                "progress", Progress(run_id=run_id, step=number, step_name=step, state=state)
            )

        return send

    async def _job(
        self, run_id: str, make_run, resolved: asyncio.Event, outcome: dict[str, Any]
    ) -> None:
        from tearsheet.pipeline import RunCancelled

        step = None
        run = None
        try:
            async with self.data_factory(run_id, self.db.conn, self.rawstore) as data:
                run, query, resume = make_run(data)
                self.active = run
                result = await run.run(query, resume=resume)
            if result.report_id:
                self.notify("report_ready", ReportReady(run_id=run_id, report_id=result.report_id))
            if result.status == "stopped" and run.stop_error is not None:
                code, data_ = error_code(run.stop_error)
                self.notify(
                    "run_failed",
                    RunFailedNote(
                        run_id=run_id,
                        step="narrate",
                        message=str(run.stop_error),
                        code=code,
                        **data_,
                    ),
                )
        except RunCancelled:
            pass
        except Exception as exc:  # noqa: BLE001 - reported to the app, logged to standard error
            log.exception("run %s failed", run_id)
            code, data_ = error_code(exc)
            if not resolved.is_set():
                outcome["error"] = exc
            else:
                fields = {k: v for k, v in data_.items() if k in ("reset_at", "fix_command")}
                self.notify(
                    "run_failed",
                    RunFailedNote(run_id=run_id, step=step, message=str(exc), code=code, **fields),
                )
        finally:
            self.active = None
            resolved.set()
            from tearsheet.ai import close_connector

            for client in (getattr(run, "ai", None), getattr(run, "checker", None)):
                if client is None:
                    continue
                try:
                    await close_connector(client.connector)
                except Exception:  # noqa: BLE001 - cleanup only
                    log.exception("closing the AI tool after run %s", run_id)

    async def _start_job(self, run_id: str, make_run, *, wait_for_resolve: bool) -> None:
        resolved = asyncio.Event()
        outcome: dict[str, Any] = {}

        original = make_run

        def with_resolve_signal(data):
            run, query, resume = original(data)
            send = run.progress

            def progress(step: str, state: str) -> None:
                send(step, state)
                if step == "resolve" and state == "done":
                    resolved.set()

            run.progress = progress
            return run, query, resume

        self.job = asyncio.create_task(self._job(run_id, with_resolve_signal, resolved, outcome))
        if wait_for_resolve:
            await resolved.wait()
            if "error" in outcome:
                exc = outcome["error"]
                code, data = error_code(exc)
                raise EngineError(code, str(exc), **data)
        else:
            resolved.set()

    async def m_run_report(self, p) -> dict[str, Any]:
        from tearsheet.pipeline import Run, new_run_id

        if self._busy():
            raise EngineError(
                "RUN_IN_PROGRESS", "A report is already running. Wait for it, or cancel it."
            )
        ai = self.ai_factory(self.db.conn, p.tool)
        checker = self.checker_factory(self.db.conn, ai) if ai is not None else None
        now = self.now()
        run_id = new_run_id(now)

        def make_run(data):
            run = Run(
                self.db.conn,
                data,
                ai,
                self.method,
                mode="full",
                now=now,
                out_dir=None,
                progress=self._progress(run_id),
                run_id=run_id,
                rawstore=self.rawstore,
                checker=checker,
            )
            return run, p.query, False

        await self._start_job(run_id, make_run, wait_for_resolve=True)
        return {"run_id": run_id}

    async def m_resume(self, p) -> dict[str, Any]:
        from tearsheet.pipeline import prepare_resume
        from tearsheet.replay import ReplayError

        if self._busy():
            raise EngineError("RUN_IN_PROGRESS", "A report is already running.")
        row = self.db.conn.execute(
            "SELECT ai_tool FROM runs WHERE run_id = ?", (p.run_id,)
        ).fetchone()
        if row is None:
            raise EngineError("NOT_RESUMABLE", f"No run {p.run_id}.")
        ai = self.ai_factory(self.db.conn, row[0]) if row[0] else None
        checker = self.checker_factory(self.db.conn, ai) if ai is not None else None
        try:
            run, ticker = prepare_resume(
                self.db.conn,
                p.run_id,
                raw_dir=self.paths.raw,
                ai=ai,
                out_dir=None,
                progress=self._progress(p.run_id),
                checker=checker,
            )
        except ReplayError as exc:
            raise EngineError("NOT_RESUMABLE", str(exc)) from exc

        @asynccontextmanager
        async def no_data(run_id, conn, rawstore):
            yield None  # resume reads the run's own stored inputs

        factory, self.data_factory = self.data_factory, no_data
        try:
            await self._start_job(
                p.run_id, lambda data: (run, ticker, True), wait_for_resolve=False
            )
        finally:
            self.data_factory = factory
        return {"run_id": p.run_id}

    async def m_cancel(self, p) -> dict[str, Any]:
        if self.active is not None and self.active.run_id == p.run_id:
            self.active.cancel()
            return {"ok": True}
        return {"ok": False}

    async def wait_for_job(self) -> None:
        if self.job is not None:
            await self.job

    # --- reports, predictions and reviews --------------------------------------------------------

    async def m_get_report(self, p) -> dict[str, Any]:
        from tearsheet.render import render_html

        row = self.db.conn.execute(
            "SELECT report_id, run_id, created_at, narrative_complete FROM reports WHERE report_id = ?",
            (p.report_id,),
        ).fetchone()
        if row is None:
            raise EngineError("ENGINE_ERROR", f"No report {p.report_id}.")
        stored = self.db.conn.execute(
            "SELECT json FROM sections WHERE report_id = ? AND key = 'report'", (p.report_id,)
        ).fetchone()
        report = json.loads(stored[0])
        return {
            "report_id": row["report_id"],
            "run_id": row["run_id"],
            "ticker": report.get("ticker", ""),
            "created_at": row["created_at"],
            "narrative_complete": bool(row["narrative_complete"]),
            "html": render_html(report, mode="app"),
        }

    async def m_list_reports(self, p) -> list[dict[str, Any]]:
        rows = self.db.conn.execute(
            "SELECT r.report_id, r.run_id, r.created_at, r.narrative_complete, u.cik, c.name FROM reports r"
            " JOIN runs u ON u.run_id = r.run_id LEFT JOIN companies c ON c.cik = u.cik"
            " ORDER BY r.created_at DESC LIMIT ? OFFSET ?",
            (p.limit, p.offset),
        ).fetchall()
        out = []
        for r in rows:
            steps = {
                s[0]: json.loads(s[1])
                for s in self.db.conn.execute(
                    "SELECT step, json FROM step_outputs WHERE run_id = ? AND step IN ('resolve', 'rate')",
                    (r["run_id"],),
                )
            }
            out.append(
                {
                    "report_id": r["report_id"],
                    "run_id": r["run_id"],
                    "cik": r["cik"],
                    "ticker": steps.get("resolve", {}).get("ticker"),
                    "name": r["name"],
                    "created_at": r["created_at"],
                    "rating": steps.get("rate", {}).get("rating"),
                    "narrative_complete": bool(r["narrative_complete"]),
                }
            )
        return out

    async def m_list_predictions(self, p) -> list[dict[str, Any]]:
        out = []
        for r in self.db.conn.execute("SELECT * FROM predictions ORDER BY run_at DESC"):
            grades = [
                _grade(g)
                for g in self.db.conn.execute(
                    "SELECT * FROM grades WHERE prediction_id = ? ORDER BY horizon_months, grading_version",
                    (r["prediction_id"],),
                )
            ]
            out.append(
                {
                    k: r[k]
                    for k in (
                        "prediction_id",
                        "cik",
                        "ticker",
                        "run_at",
                        "rating",
                        "bear",
                        "base",
                        "bull",
                    )
                }
                | {"grades": grades}
            )
        return out

    async def m_flag_claim(self, p) -> dict[str, Any]:
        from tearsheet.goal1 import add_review

        row = self.db.conn.execute(
            "SELECT report_id FROM claims WHERE claim_id = ?", (p.claim_id,)
        ).fetchone()
        if row is None:
            raise EngineError("ENGINE_ERROR", f"No claim {p.claim_id}.")
        return {
            "review_id": add_review(
                self.db.conn,
                report_id=row[0],
                claim_id=p.claim_id,
                origin="reader_flag",
                label="open",
                note=p.note,
            )
        }

    async def m_reread_filing(self, p) -> dict[str, Any]:
        from tearsheet.extract import reread_filing

        return {"deleted": reread_filing(self.db.conn, p.accession)}

    async def m_grade_due(self, p) -> dict[str, Any]:
        """Grading is a job like a run: it waits for any report (item 48)."""
        from tearsheet.grading import grade_job

        if self._busy():
            await self.job
        settings = config.Settings(self.db.conn)
        backup_dir = Path(settings.get("backup_dir") or config.DEFAULT_BACKUP_DIR).expanduser()
        async with self.data_factory(
            f"grade-{self.now():%Y%m%dT%H%M%SZ}", self.db.conn, self.rawstore
        ) as data:
            return await grade_job(
                self.db.conn, data, self.method.grading, now=self.now(), backup_dir=backup_dir
            )

    # --- keys and settings -----------------------------------------------------------------------

    async def m_set_key(self, p) -> dict[str, Any]:
        config.set_key(p.service, p.key)  # never echoed or logged
        return {"ok": True}

    async def m_get_settings(self, p) -> dict[str, Any]:
        settings = config.Settings(self.db.conn)
        backup = Path(settings.get("backup_dir") or config.DEFAULT_BACKUP_DIR).expanduser()
        home = Path.home()
        in_icloud = any(backup == home / f or home / f in backup.parents for f in ICLOUD_FOLDERS)
        round_ = settings.get("goal1_round")
        return {
            "keys": {s: ("set" if config.get_key(s) else "missing") for s in config.KEY_SERVICES},
            "raw_bytes": self.rawstore.folder_size(),
            "raw_cap": settings.number("raw_cap_gb", config.RAW_CAP_BYTES / 1024**3),
            "backup_dir": str(backup),
            "backup_in_icloud": in_icloud,
            "primary_tool": settings.get("primary_tool"),
            "sec_contact_email": settings.get("sec_contact_email"),
            "goal1_round": int(float(round_)) if round_ else 1,
            "services": SERVICES,
            "lockdown": {
                r["tool"]: {
                    "version": r["version"],
                    "passed": bool(r["lockdown_passed"]) and not r["blocked_reason"],
                    "form": r["lockdown_form"],
                    "checked_at": r["lockdown_checked_at"],
                    "blocked_reason": r["blocked_reason"],
                }
                for r in self.db.conn.execute("SELECT * FROM tool_versions ORDER BY tool")
            },
        }

    async def m_set_setting(self, p) -> dict[str, Any]:
        key = {"raw_cap": "raw_cap_gb"}.get(p.key, p.key)
        config.Settings(self.db.conn).set(key, p.value)
        return {"ok": True}

    def close(self) -> None:
        self.db.close()


async def serve(paths: config.Paths) -> int:
    """Read requests from standard input until it closes."""
    out = sys.stdout
    sys.stdout = sys.stderr  # nothing else may write to the protocol stream

    def write(message: dict[str, Any]) -> None:
        out.write(json.dumps(message, separators=(",", ":")) + "\n")
        out.flush()

    server = Server(paths, write=write)
    await server.start()
    loop = asyncio.get_running_loop()
    try:
        while True:
            line = await loop.run_in_executor(None, sys.stdin.readline)
            if not line:
                break
            if line.strip():
                await server.handle(line)
        if server.active is not None:
            server.active.cancel()
        if server.job is not None:
            try:
                await server.job
            except Exception:  # noqa: BLE001
                pass
    finally:
        server.close()
    return 0


def new_id() -> str:
    return uuid.uuid4().hex


def _grade(row) -> dict[str, Any]:
    results = json.loads(row["results_json"])
    rng = results.get("range")
    return {
        "horizon_months": row["horizon_months"],
        "graded_at": row["graded_at"],
        "grading_version": row["grading_version"],
        "start_price": row["start_price"],
        "hit": results.get("hit"),
        "excess": results.get("excess"),
        "company_return": results.get("company_return"),
        "end_date": results.get("end_date"),
        "inside_range": None if rng is None else rng.get("inside"),
    }
