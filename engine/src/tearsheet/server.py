"""`tearsheet-engine serve`: the engine the app talks to (design item 37, Technical Plan §2).

Reads one JSON-RPC request per line from standard input, writes only protocol messages to
standard output, and sends all logging to standard error. The `hello` notification goes first.
Only one run (or resume) happens at a time; it runs in the background and reports through
`progress`, `report_ready` and `run_failed` notifications. Grading (`grade_due`) is a job like a
run: it is answered off the request loop, so look-ups and settings answer while it fetches
prices, and no run, resume, safety check or history download starts until it is done
(GRADING_IN_PROGRESS). A company's full price history (`fetch_history`) is a job too: answered
off the loop, shared by every ask for that company, and no run or resume starts while one goes
(HISTORY_DOWNLOADING). Key checks are answered off the loop as well, since a Massive check waits
its turn at the plan's pace. Only the engine writes to the database.
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
    SafetyDone,
    SafetyProgress,
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
# Requests answered off the request loop, because they can take minutes: grading and the full
# price history fetch at Massive's calls-per-minute pace, and a Massive key check waits its turn
# in the same queue.
OFF_LOOP = frozenset({"grade_due", "fetch_history", "check_key"})


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


def history_failure_line(exc: BaseException) -> str:
    """What the chart says when the full price history fails to download: why, in plain words,
    and what to do. The failure's own text, with its address, goes to the engine's log."""
    from tearsheet.http import DailyLimitReached, HTTPFailure

    if isinstance(exc, DailyLimitReached):
        return "The daily Massive allowance is used up. It resets at midnight US Eastern time."
    status = exc.status if isinstance(exc, HTTPFailure) else None
    if status is None:
        return "No answer came from Massive. Check your internet connection, then try again."
    if status == 401:
        return "Massive turned down your key. Check it in Settings, then try again."
    if status == 403:
        return "This much history is beyond your Massive plan."
    if status == 429:
        return "Massive is limiting how often Tearsheet can ask. Try again in a minute."
    if status >= 500:
        return "Massive is having trouble right now. Try again later."
    return "Massive sent an unreadable answer. Try again later."


class Server:
    def __init__(
        self,
        paths: config.Paths,
        *,
        write: Callable[[dict[str, Any]], None],
        data_factory=None,
        ai_factory=None,
        checker_factory=None,
        http_factory=None,
        safety_connector_factory=None,
        log_predictions: bool | None = None,
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
        self.http_factory = http_factory or self._live_http
        self.safety_connector_factory = safety_connector_factory or self._live_connector
        self.safety_job: asyncio.Task | None = None
        # Live runs from the app log official predictions (item 35). With injected (test) data
        # nothing is logged unless a test asks for it.
        self.log_predictions = data_factory is None if log_predictions is None else log_predictions
        self.now = now or (lambda: datetime.now(UTC))
        self.job: asyncio.Task | None = None
        self.grading_job: asyncio.Task | None = None
        # Full price-history downloads under way, by company.
        self.history_jobs: dict[int, asyncio.Task] = {}
        # Requests answered off the loop (OFF_LOOP), until their reply is written.
        self.background: set[asyncio.Task] = set()
        self._massive_limiter = None
        self.active = None  # the Run in progress
        mark_interrupted(self.db.conn)

    # --- the defaults: live data and the user's AI tool -----------------------------------------

    def massive_limiter(self, conn):
        """One Massive limiter for every client this server builds, so runs and the history
        download share the plan's calls-per-minute budget."""
        from tearsheet.http import RateLimiter

        if self._massive_limiter is None:
            per_minute = config.Settings(conn).number(
                "massive_calls_per_minute", config.MASSIVE_CALLS_PER_MINUTE
            )
            self._massive_limiter = RateLimiter.per_minute(per_minute)
        return self._massive_limiter

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
            massive_limiter=self.massive_limiter(conn),
        ) as http:
            try:
                yield LiveData(http, rawstore, conn, fred_key=config.get_key("fred"))
            finally:
                config.note_key_answers(
                    settings, refused=http.keys_refused, worked=http.keys_worked
                )

    @asynccontextmanager
    async def _live_http(self, run_id: str, conn, rawstore):
        from tearsheet.http import HttpClient

        settings = config.Settings(conn)
        async with HttpClient(
            rawstore,
            run_id,
            settings=settings,
            massive_key=config.get_key("massive"),
            massive_limiter=self.massive_limiter(conn),
        ) as http:
            try:
                yield http
            finally:
                config.note_key_answers(
                    settings, refused=http.keys_refused, worked=http.keys_worked
                )

    def _live_ai(self, conn, tool: str | None):
        from tearsheet.ai import client_for
        from tearsheet.ai.client import AIUnavailable

        try:
            return client_for(
                conn, config.Settings(conn), tool=tool, signal_dir=self.paths.logs / "ai-signals"
            )
        except AIUnavailable as exc:
            raise EngineError("NO_TOOL", str(exc)) from exc

    def _live_connector(self, conn, tool: str):
        from tearsheet.ai import connector_for
        from tearsheet.ai.client import AIUnavailable

        try:
            return connector_for(tool, config.Settings(conn))
        except AIUnavailable as exc:
            raise EngineError("NO_TOOL", str(exc)) from exc

    def _backup_dir(self) -> Path:
        settings = config.Settings(self.db.conn)
        return Path(settings.get("backup_dir") or config.DEFAULT_BACKUP_DIR).expanduser()

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
        if method in OFF_LOOP:
            task = asyncio.create_task(self._answer(id_, method, params))
            self.background.add(task)
            task.add_done_callback(self.background.discard)
            return
        await self._answer(id_, method, params)

    async def _answer(self, id_: Any, method: str, params: BaseModel) -> None:
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

    def _safety_running(self) -> bool:
        return self.safety_job is not None and not self.safety_job.done()

    def _grading(self) -> bool:
        return self.grading_job is not None and not self.grading_job.done()

    def _refuse_during_grading(self) -> None:
        if self._grading():
            raise EngineError(
                "GRADING_IN_PROGRESS",
                "Tearsheet is grading past predictions. Try again in a few minutes.",
            )

    def _downloading(self) -> bool:
        return any(not job.done() for job in self.history_jobs.values())

    def _refuse_during_history(self) -> None:
        if self._downloading():
            raise EngineError(
                "HISTORY_DOWNLOADING",
                "Tearsheet is downloading a price history for the chart. Try again in a minute.",
            )

    def _refuse_during_safety_check(self) -> None:
        if self._safety_running():
            raise EngineError(
                "SAFETY_CHECK_RUNNING",
                "The safety check is running. Wait for it to finish, then start the report.",
            )

    def _progress(self, run_id: str):
        from tearsheet.pipeline import STEPS

        def send(step: str, state: str) -> None:
            number = STEPS.index(step) + 1 if step in STEPS else 0
            self.notify(
                "progress", Progress(run_id=run_id, step=number, step_name=step, state=state)
            )

        return send

    async def _job(
        self,
        run_id: str,
        make_run,
        resolved: asyncio.Event,
        outcome: dict[str, Any],
        steps: dict[str, str | None],
    ) -> None:
        from tearsheet.pipeline import RunCancelled

        run = None
        try:
            async with self.data_factory(run_id, self.db.conn, self.rawstore) as data:
                run, query, resume = make_run(data)
                self.active = run
                result = await run.run(query, resume=resume)
            # A stopped run says so before its report so far, so the app never takes the
            # partial report for a finished one.
            if result.status == "stopped" and run.stop_error is not None:
                code, data_ = error_code(run.stop_error)
                self.notify(
                    "run_failed",
                    RunFailedNote(
                        run_id=run_id,
                        # The step under way when the AI steps stopped; the pipeline went on to
                        # fill in the numbers, check and save the report so far.
                        step=steps["stopped_at"] or steps["started"],
                        message=str(run.stop_error),
                        code=code,
                        **data_,
                    ),
                )
            if result.report_id:
                self.notify("report_ready", ReportReady(run_id=run_id, report_id=result.report_id))
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
                    RunFailedNote(
                        run_id=run_id,
                        step=steps["started"],
                        message=str(exc),
                        code=code,
                        **fields,
                    ),
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
        # The last step that started, and the one under way when the AI steps stopped (the
        # first progress note after the run's stop error is set closes that step).
        steps: dict[str, str | None] = {"started": None, "stopped_at": None}

        original = make_run

        def with_resolve_signal(data):
            run, query, resume = original(data)
            send = run.progress

            def progress(step: str, state: str) -> None:
                if run.stop_error is not None and steps["stopped_at"] is None:
                    steps["stopped_at"] = steps["started"]
                if state == "started":
                    steps["started"] = step
                send(step, state)
                if step == "resolve" and state == "done":
                    resolved.set()

            run.progress = progress
            return run, query, resume

        self.job = asyncio.create_task(
            self._job(run_id, with_resolve_signal, resolved, outcome, steps)
        )
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

        self._refuse_during_safety_check()
        if self._busy():
            raise EngineError(
                "RUN_IN_PROGRESS", "A report is already running. Wait for it, or cancel it."
            )
        self._refuse_during_grading()
        self._refuse_during_history()
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
                log_predictions=self.log_predictions,
                backup_dir=self._backup_dir(),
            )
            return run, p.query, False

        await self._start_job(run_id, make_run, wait_for_resolve=True)
        return {"run_id": run_id, **self._run_company(run_id)}

    async def m_resume(self, p) -> dict[str, Any]:
        from tearsheet.pipeline import prepare_resume
        from tearsheet.replay import ReplayError

        self._refuse_during_safety_check()
        if self._busy():
            raise EngineError("RUN_IN_PROGRESS", "A report is already running.")
        self._refuse_during_grading()
        self._refuse_during_history()
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
        return {"run_id": p.run_id, **self._run_company(p.run_id)}

    def _run_company(self, run_id: str) -> dict[str, str | None]:
        """The company the run resolved, so the app names the run by it and not by the query."""
        from tearsheet.companies import run_company

        return run_company(self.db.conn, run_id)

    async def m_cancel(self, p) -> dict[str, Any]:
        if self.active is not None and self.active.run_id == p.run_id:
            self.active.cancel()
            return {"ok": True}
        return {"ok": False}

    async def wait_for_job(self) -> None:
        if self.job is not None:
            await self.job

    async def wait_for_safety_check(self) -> None:
        if self.safety_job is not None:
            await self.safety_job

    async def wait_for_grading(self) -> None:
        """Until grading and any history download are done and every reply answered off the
        loop has been written."""
        while self.background or self._grading() or self._downloading():
            await asyncio.gather(*self.background, return_exceptions=True)
            if self.grading_job is not None:
                await asyncio.gather(self.grading_job, return_exceptions=True)
            await asyncio.gather(*self.history_jobs.values(), return_exceptions=True)

    # --- reports, predictions and reviews --------------------------------------------------------

    async def m_get_report(self, p) -> dict[str, Any]:
        from tearsheet import report_numbers
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
        run_row = self.db.conn.execute(
            "SELECT u.cik, c.name FROM runs u LEFT JOIN companies c ON c.cik = u.cik"
            " WHERE u.run_id = ?",
            (row["run_id"],),
        ).fetchone()
        cik = run_row[0] if run_row else None
        numbers = None
        if cik is not None:
            # Saved reports always open, whatever is broken: without its numbers if need be.
            try:
                numbers = report_numbers.numbers_for(
                    self.db.conn, report, row["run_id"], cik, report_id=row["report_id"]
                )
            except Exception:  # noqa: BLE001 - logged; the report opens from its text alone
                log.exception("reading the numbers of report %s", p.report_id)
        claims = (numbers or {}).get("claims")
        return {
            "report_id": row["report_id"],
            "run_id": row["run_id"],
            "ticker": report.get("ticker", ""),
            "cik": cik,
            "name": (run_row[1] if run_row else None) or report.get("company") or None,
            "created_at": row["created_at"],
            "narrative_complete": bool(row["narrative_complete"]),
            "kept": claims.get("kept") if isinstance(claims, dict) else None,
            "html": render_html(
                report,
                mode="app",
                view=p.view,
                column=p.column,
                narrow=p.narrow,
                side=p.side,
                motion=p.motion,
                numbers=numbers,
            ),
        }

    def _report_target(self, report_id: str) -> tuple[str, int, str]:
        """The run id, company cik and ticker behind a stored report."""
        from tearsheet.data import membership

        row = self.db.conn.execute(
            "SELECT r.run_id, u.cik, (SELECT json FROM step_outputs s WHERE s.run_id = r.run_id"
            " AND s.step = 'resolve') FROM reports r JOIN runs u ON u.run_id = r.run_id"
            " WHERE r.report_id = ?",
            (report_id,),
        ).fetchone()
        if row is None or row[1] is None:
            raise EngineError("ENGINE_ERROR", f"No report {report_id}.")
        ticker = json.loads(row[2] or "{}").get("ticker") or ""
        if not ticker:
            holdings = membership.load_bundled()
            ticker = holdings.tickers_of(row[1])[0] if holdings.has(row[1]) else ""
        return row[0], row[1], ticker

    async def m_list_companies(self, p) -> list[dict[str, Any]]:
        from tearsheet.companies import list_companies

        return list_companies(self.db.conn)

    async def m_search_companies(self, p) -> list[dict[str, Any]]:
        from tearsheet.companies import search_companies

        return search_companies(
            self.db.conn, p.query, p.limit, peer_cap=int(self.method.peers["peer_cap"])
        )

    async def m_get_chart(self, p) -> dict[str, Any]:
        from tearsheet.charts import chart_series

        run_id, cik, _ = self._report_target(p.report_id)
        return chart_series(self.db.conn, cik, run_id)

    async def m_fetch_history(self, p) -> dict[str, Any]:
        """The company's full daily history with its splits and dividends. It is answered off
        the request loop (OFF_LOOP), as a job: a second ask for the same company, from any of
        its reports, gets the same answer, and no run or resume starts until it is done."""
        if self.history_jobs:
            _, cik, _ = self._report_target(p.report_id)
            job = self.history_jobs.get(cik)
            if job is not None and not job.done():
                return await asyncio.shield(job)
        if self._busy():
            raise EngineError(
                "RUN_IN_PROGRESS", "A report is running. Wait for it, then load the history."
            )
        self._refuse_during_grading()
        _, cik, ticker = self._report_target(p.report_id)
        if not ticker:
            raise EngineError("ENGINE_ERROR", "This report's company has no ticker to look up.")
        if not config.get_key("massive"):
            raise EngineError(
                "ENGINE_ERROR", "It needs a Massive key. Add yours in Settings, then try again."
            )
        job = asyncio.create_task(self._history(cik, ticker))
        self.history_jobs[cik] = job

        def forget(task: asyncio.Task, cik: int = cik) -> None:
            if self.history_jobs.get(cik) is task:
                del self.history_jobs[cik]

        job.add_done_callback(forget)
        return await asyncio.shield(job)

    async def _history(self, cik: int, ticker: str) -> dict[str, Any]:
        """The company's splits and dividends (three calls), and SPY's (three more) unless an
        earlier download already stored them. Every call goes through the shared Massive
        limiter. The company's long bars come last: they are what tell the app the history is
        there, so a download cut short leaves it asking again. Downloads for other companies go
        one at a time, so they share SPY's and never fetch it twice."""
        from tearsheet.charts import SPY_CIK
        from tearsheet.data.prices import (
            PriceStore,
            fetch_history_actions,
            fetch_history_bars,
            history_stored,
            long_history_start,
        )
        from tearsheet.http import EASTERN, HTTPFailure
        from tearsheet.resolve import ticker_for

        me = asyncio.current_task()
        before = {job for job in self.history_jobs.values() if job is not me and not job.done()}
        if before:
            await asyncio.wait(before)
        store = PriceStore(self.db.conn)
        try:
            async with self.http_factory(
                f"history-{uuid.uuid4().hex[:8]}", self.db.conn, self.rawstore
            ) as http:
                massive = ticker_for("massive", ticker)
                await fetch_history_actions(http, store, cik, "", massive)
                today = datetime.now(EASTERN).date()
                if not history_stored(store, SPY_CIK, long_history_start(today)):
                    await fetch_history_actions(http, store, SPY_CIK, "", "SPY")
                    await fetch_history_bars(http, store, SPY_CIK, "", "SPY")
                await fetch_history_bars(http, store, cik, "", massive)
        except HTTPFailure as exc:
            # Massive refusing or not answering is expected now and then: one line in the log,
            # and a plain sentence for the chart.
            log.warning("the price history download for %s failed: %s", ticker, exc)
            raise EngineError("ENGINE_ERROR", history_failure_line(exc)) from None
        first, days = self.db.conn.execute(
            "SELECT MIN(date), COUNT(*) FROM prices_daily WHERE cik = ? AND share_class = ''",
            (cik,),
        ).fetchone()
        return {"first_date": first or "", "days": days}

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
        """Grading is a job like a run (item 48): it waits for any report, and nothing that
        would overlap it starts until it is done. It is answered off the request loop (OFF_LOOP);
        a second ask while it goes gets the same answer."""
        if not self._grading():
            self.grading_job = asyncio.create_task(self._grade())
        return await asyncio.shield(self.grading_job)

    async def _grade(self) -> dict[str, Any]:
        from tearsheet import grading

        if self._busy():
            await asyncio.wait({self.job})  # however the report ends, grading goes on
        if self._downloading():
            # One Massive download at a time: grading waits for a history download too.
            await asyncio.wait({job for job in self.history_jobs.values() if not job.done()})
        settings = config.Settings(self.db.conn)
        backup_dir = Path(settings.get("backup_dir") or config.DEFAULT_BACKUP_DIR).expanduser()
        async with self.data_factory(
            f"grade-{self.now():%Y%m%dT%H%M%SZ}", self.db.conn, self.rawstore
        ) as data:
            return await grading.grade_job(
                self.db.conn, data, self.method.grading, now=self.now(), backup_dir=backup_dir
            )

    # --- keys and settings -----------------------------------------------------------------------

    async def m_set_key(self, p) -> dict[str, Any]:
        config.set_key(p.service, p.key)  # never echoed or logged
        config.forget_key_refusal(config.Settings(self.db.conn), p.service)
        return {"ok": True}

    async def m_check_key(self, p) -> dict[str, Any]:
        """One call to the service with the pasted key. It is answered off the request loop
        (OFF_LOOP): a Massive check waits its turn behind any download at the plan's pace."""
        from tearsheet.setup_checks import check_key

        p.key = p.key.strip()  # a pasted newline would break the header
        async with self.http_factory(
            f"keycheck-{uuid.uuid4().hex[:8]}", self.db.conn, self.rawstore
        ) as http:
            try:
                proof = await check_key(http, p.service, p.key)
            finally:
                # The answer was about the pasted key, not the stored one.
                http.keys_refused.clear()
                http.keys_worked.clear()
        config.set_key(p.service, p.key)  # only after the check passes; never echoed or logged
        config.forget_key_refusal(config.Settings(self.db.conn), p.service)
        return {"proof": proof}

    async def m_run_safety_check(self, p) -> dict[str, Any]:
        if self._busy():
            raise EngineError(
                "RUN_IN_PROGRESS", "A report is running. Wait for it before the safety check."
            )
        self._refuse_during_safety_check()
        self._refuse_during_grading()
        connector = self.safety_connector_factory(self.db.conn, p.tool)
        self.safety_job = asyncio.create_task(self._safety_job(p.tool, connector))
        return {"started": True}

    async def _safety_job(self, tool: str, connector) -> None:
        from tearsheet.ai import api_billing, close_connector
        from tearsheet.ai.client import ToolState
        from tearsheet.ai.lockdown import run_check

        def on_probe(n: int, total: int, probe) -> None:
            self.notify(
                "safety_progress",
                SafetyProgress(
                    tool=tool,
                    n=n,
                    total=total,
                    name=probe.name,
                    ok=not probe.problems and probe.error is None,
                ),
            )

        passed, reason, finished = False, None, True
        try:
            report = await run_check(
                connector,
                form="full",
                api_billing=api_billing(tool, config.Settings(self.db.conn)),
                on_probe=on_probe,
            )
            if report.inconclusive is None:
                ToolState(self.db.conn, tool).record_check(
                    version=report.program_version,
                    model_ids=report.model_ids,
                    form="full",
                    passed=report.passed,
                )
            passed = report.passed
            if report.inconclusive:
                reason = f"The check couldn't finish: {report.inconclusive}"
                finished = False
            elif not report.passed:
                reason = "; ".join(report.problems[:3]) or "The check did not pass."
        except Exception as exc:  # noqa: BLE001 - reported to the app, logged to standard error
            log.exception("safety check on %s failed", tool)
            passed, reason, finished = False, str(exc) or "The check stopped unexpectedly.", False
        finally:
            try:
                await close_connector(connector)
            except Exception:  # noqa: BLE001 - cleanup only
                log.exception("closing the AI tool after the safety check")
        self.notify(
            "safety_done", SafetyDone(tool=tool, passed=passed, reason=reason, finished=finished)
        )

    async def m_get_settings(self, p) -> dict[str, Any]:
        settings = config.Settings(self.db.conn)
        backup = Path(settings.get("backup_dir") or config.DEFAULT_BACKUP_DIR).expanduser()
        home = Path.home()
        in_icloud = any(backup == home / f or home / f in backup.parents for f in ICLOUD_FOLDERS)
        round_ = settings.get("goal1_round")
        keys = {s: ("set" if config.get_key(s) else "missing") for s in config.KEY_SERVICES}
        setup_done = settings.get("setup_done")
        if setup_done is None and self.db.conn.execute("SELECT 1 FROM reports LIMIT 1").fetchone():
            # Reports written before the app had a setup (the terminal, or the first app) mean
            # the install is set up: it is marked so once, and opens on the home page.
            settings.set_internal("setup_done", "1")
            setup_done = "1"
        return {
            "keys": keys,
            # Only a key that is there can have been refused; a missing one shows as missing.
            "rejected_keys": [s for s in config.refused_keys(settings) if keys[s] == "set"],
            "raw_bytes": self.rawstore.folder_size(),
            "raw_cap": settings.number("raw_cap_gb", config.RAW_CAP_BYTES / 1024**3),
            "backup_dir": str(backup),
            "backup_in_icloud": in_icloud,
            "primary_tool": settings.get("primary_tool"),
            "sec_contact_email": settings.get("sec_contact_email"),
            "goal1_round": int(float(round_)) if round_ else 1,
            "setup_done": setup_done == "1",
            "fred_skipped": settings.get("fred_skipped") == "1",
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
        # Grading and history downloads stop with the engine; grading runs again next time the
        # app opens, and a cut-short download is asked for again.
        jobs = [
            *server.background,
            *([server.grading_job] if server.grading_job else []),
            *server.history_jobs.values(),
        ]
        for task in jobs:
            task.cancel()
        await asyncio.gather(*jobs, return_exceptions=True)
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
