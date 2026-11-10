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
its turn at the plan's pace. Several reports are written one after another through the line
(batch.py, `line_changed`): it starts each one as `run_report` would, once nothing else is
running. Only the engine writes to the database.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import sys
import uuid
from collections.abc import Callable
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any, NamedTuple

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
    RunTally,
    SafetyDone,
    SafetyProgress,
    Tally,
)
from tearsheet.rawstore import RawStore

if TYPE_CHECKING:
    from tearsheet.batch import Entry, Skip

log = logging.getLogger(__name__)

# What leaves the Mac, for Settings → What leaves your Mac and the README (design §12;
# docs/launch/launch-readiness.md §3). Tearsheet itself sends nothing to its author.
SERVICES = [
    {
        "name": "SEC EDGAR",
        "key": "None. Each request carries your contact email, which goes only to SEC",
        "cost": "Free",
        "sent": "Requests for the company's and its peers' filings",
    },
    {
        "name": "Massive",
        "key": "Your free key",
        "cost": "Free plan",
        "sent": "The tickers researched and their peers, and whole-market daily prices",
    },
    {
        "name": "FRED",
        "key": "Your free key",
        "cost": "Free",
        "sent": "Requests for five economic series",
    },
    {
        "name": "Claude Code (Anthropic) or Codex (OpenAI)",
        "key": "Your own sign-in",
        "cost": "Your existing plan",
        "sent": "The text of filings and press releases, the numbers sent with that text, draft "
        "sections, and a web search for recent news about the company. Your plan's own privacy "
        "terms apply. Codex also loads your own ~/.codex/AGENTS.md and sends it to OpenAI with "
        "each call (Codex has no setting to stop it)",
    },
    {
        "name": "News sites",
        "key": "None",
        "cost": "Free",
        "sent": "Nothing unless you open a link. Tearsheet lists their articles as links and "
        "doesn't download them",
    },
    {
        "name": "GitHub (Tearsheet's off switch)",
        "key": "None",
        "cost": "Free",
        "sent": "One plain request at each launch, with no personal data",
    },
    {
        "name": "claude.ai and chatgpt.com install scripts",
        "key": "None",
        "cost": "Free",
        "sent": "A download of Claude Code's or Codex's install script, only when you press "
        "Install",
    },
]
# The news row when the `news_articles` setting is on.
NEWS_READ = {
    "name": "News sites on the allowlist",
    "key": "None",
    "cost": "Free",
    "sent": "A request for each article page, which your AI tool then reads",
}


def services(settings: config.Settings) -> list[dict[str, str]]:
    if settings.get("news_articles") == "on":
        return [NEWS_READ if s["name"] == "News sites" else s for s in SERVICES]
    return SERVICES


ICLOUD_FOLDERS = ("Documents", "Desktop", "Library/Mobile Documents")
# Requests answered off the request loop, because they can take minutes: grading and the full
# price history fetch at Massive's calls-per-minute pace, and a Massive key check waits its turn
# in the same queue.
# get_analysts may wait up to analystdb's time limit (data/analystdb.py), so it never holds up
# the requests behind it.
OFF_LOOP = frozenset({"grade_due", "fetch_history", "check_key", "get_analysts"})
# How often the price backfill looks again while a report, grading, a history download or the
# safety check is under way (it never makes them wait).
BACKFILL_POLL_S = 2.0
# How often the line looks again while something else runs (a single report, grading, a history
# download or the safety check): its next report starts once they are done.
LINE_POLL_S = 1.0
# The longest a wait for a usage limit sleeps before it looks at the clock again.
LINE_SLEEP_S = 60.0
# How often the open app checks for a newly closed session to add to the stored prices.
KEEP_CURRENT_EVERY_S = 1800.0
# A test copy (config.test_mode(), first-run design §6): its canned safety check takes a step
# every fifth of a second, and its reports end before any data or AI call.
CANNED_CHECK_STEP_S = 0.2
TEST_COPY = "TEST_COPY"
TEST_COPY_MESSAGE = "Reports are off in a test copy."


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


def no_connection(exc: BaseException) -> bool:
    """Whether a run failed for want of a connection: a data service gave no answer at all
    (no internet), rather than turning the request down."""
    from tearsheet.http import HTTPFailure

    return isinstance(exc, HTTPFailure) and exc.status is None


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


def backfill_stop_reason(exc: BaseException) -> str:
    """Why the background price download stopped, in plain words, for Settings and `prices
    status`. It starts again the next time the app opens; the failure's own text goes to the
    engine's log."""
    from tearsheet.http import DailyLimitReached, HTTPFailure

    if isinstance(exc, DailyLimitReached):
        return "the day’s Massive allowance ran out"
    if not isinstance(exc, HTTPFailure):
        return "something went wrong (the engine’s log has the details)"
    status = exc.status
    if status is None:
        return "no answer came from Massive"
    if status == 401:
        return "Massive turned down the key"
    if status == 403:
        return "the Massive plan doesn’t include these prices"
    if status == 429:
        return "Massive was limiting how often Tearsheet could ask"
    if status >= 500:
        return "Massive was having trouble"
    return "Massive sent an unreadable answer"


# A key macOS wouldn't hand over (config.key_locked), and what to do about it.
KEY_LOCKED_FIX = "Quit Tearsheet, open it again, and click Always Allow when macOS asks."


def _key_state(service: str) -> str:
    """Settings' word for one data key: set, missing, or locked (in the Keychain this session)."""
    if config.get_key(service):
        return "set"
    return "locked" if config.key_locked(service) else "missing"


# The background price job's progress line, as _backfill writes it.
_BACKFILL_PROGRESS = re.compile(r"^(\d+) of (\d+) sessions")


class _CheckEnd(NamedTuple):
    """How a safety check ended: its verdict, whether it gave one, and the code a pause of the
    reports waiting uses (none for a pass or a recorded failure)."""

    passed: bool
    finished: bool
    reason: str | None = None
    pause_code: str | None = None


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
        backfill: bool | None = None,
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
        # The check under way: the stop cancel_safety_check sets (read before each probe), and
        # its progress, which get_settings sends so a reloaded window shows the real count.
        self.safety_stop = False
        self.safety_state: dict[str, Any] | None = None
        self.canned_check_step_s = CANNED_CHECK_STEP_S
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
        # The one-time price backfill (Technical Plan §5): on for the live engine; tests with
        # injected data ask for it. Never in a test copy, so it doesn't share the free Massive
        # key's calls a minute with the real app.
        self.backfill_enabled = (
            data_factory is None if backfill is None else backfill
        ) and not config.test_mode()
        self.backfill_job: asyncio.Task | None = None
        # None makes the price job one pass (tests); the app checks every half hour.
        self.keep_current_every_s: float | None = KEEP_CURRENT_EVERY_S
        # How the last run ended (run id, how), for the line (batch.py).
        self.last_end: tuple[str, dict[str, Any]] | None = None
        from tearsheet.batch import SETTING, ReportLine

        # The line as Tearsheet left it: paused, if anything was waiting.
        self.line = ReportLine.loads(config.Settings(self.db.conn).get(SETTING))
        self.line_job: asyncio.Task | None = None
        self.line_poll_s = LINE_POLL_S
        # The wait for a usage limit (or the plan's 5-hour window) to reset, and the pause it
        # waits out; it sleeps in steps of `line_sleep_s` and goes by the clock (self.now), so a
        # Mac that slept a while still wakes it on time.
        self.line_wake: asyncio.Task | None = None
        self.line_wake_for = None
        self.line_sleep = asyncio.sleep
        self.line_sleep_s = LINE_SLEEP_S
        # The plan's usage as the last run's AI calls said, by run id (batch.py's Reading).
        self.last_usage: tuple[str, dict[str, Any]] | None = None
        # analystdb, Liam's local analyst-ratings API, with its answers kept in memory. Tests
        # put a stand-in here; the tests' offline guard keeps the real one from reaching it.
        from tearsheet.data.analystdb import AnalystDB

        self.analystdb = AnalystDB()
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
        return config.backup_folder(settings)

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
        self._start_backfill()

    # --- the background price job ---------------------------------------------------------------

    def _start_backfill(self) -> None:
        """Start the background price job once a Massive key is saved (when the app opens, or
        the moment setup saves the key): the one-time backfill while the index has a company it
        hasn't covered, then, while the app stays open, each newly closed session for every
        stored company. `prices_backfill off` stops both."""
        from tearsheet.data import market

        if not self.backfill_enabled:
            return
        if self.backfill_job is not None and not self.backfill_job.done():
            return
        if not config.get_key("massive"):
            return
        if market.switched_off(config.Settings(self.db.conn)):
            return
        self.backfill_job = asyncio.create_task(self._prices_job())

    async def _prices_job(self) -> dict[str, Any] | None:
        from tearsheet.data import market
        from tearsheet.data.membership import stored_or_bundled

        result = None
        while True:
            settings = config.Settings(self.db.conn)
            if market.switched_off(settings):
                return result
            wanted = market.wanted_members(stored_or_bundled(self.db.conn))
            if market.backfill_needed(settings, wanted):
                result = await self._backfill(wanted)
                if result is None:
                    return None  # it stopped; it tries again next time the app opens
            await self._keep_current(wanted)
            await self._fill_one_by_one(wanted)
            if self.keep_current_every_s is None:
                return result
            await asyncio.sleep(self.keep_current_every_s)

    async def _keep_current(self, wanted: dict[str, tuple[int, str]]) -> None:
        """Add the sessions closed since the stored prices end, for every stored company, from
        the all-stocks summary (about 3 calls a session). A check that finds nothing new makes
        no call."""
        from tearsheet.data import market
        from tearsheet.data.prices import PriceStore, last_completed_session

        store = PriceStore(self.db.conn)
        have, days = market.catch_up(store, wanted, end=last_completed_session(self.now()))
        if not days:
            return
        try:
            await self._backfill_gate()
            async with self.http_factory(
                f"prices-{self.now():%Y%m%dT%H%M%SZ}", self.db.conn, self.rawstore
            ) as http:
                await market.top_up(
                    http, self.rawstore, store, have, days, tally=market.Tally(self._backfill_gate)
                )
        except asyncio.CancelledError:
            raise
        except market.SwitchedOff:
            return
        except Exception as exc:  # noqa: BLE001 - the next check, or the next report, tries again
            log.warning("price top-up stopped: %s", exc)

    async def _fill_one_by_one(self, wanted: dict[str, tuple[int, str]]) -> None:
        """After the backfill, the index's companies it couldn't start (their ticker began
        trading inside the window) get their own first fill, as a report would give them, so
        no report waits for it. Each is tried once a session; it waits while a report runs."""
        from tearsheet.data import market
        from tearsheet.data.membership import stored_or_bundled
        from tearsheet.data.prices import PriceStore, last_completed_session

        settings = config.Settings(self.db.conn)
        if not market.backfill_done(settings, wanted):
            return
        store = PriceStore(self.db.conn)
        end = last_completed_session(self.now())
        members = market.to_fill_one_by_one(
            settings, store, stored_or_bundled(self.db.conn), end=end
        )
        if not members:
            return
        try:
            await self._backfill_gate()
            market.record_one_by_one(settings, members, end=end)
            async with self.http_factory(
                f"prices-{self.now():%Y%m%dT%H%M%SZ}", self.db.conn, self.rawstore
            ) as http:
                await market.fill_one_by_one(
                    http,
                    self.rawstore,
                    self.db.conn,
                    store,
                    members,
                    end=end,
                    gate=self._backfill_gate,
                )
            log.info("filled %d companies' prices one by one", len(members))
        except asyncio.CancelledError:
            raise
        except market.SwitchedOff:
            return
        except Exception as exc:  # noqa: BLE001 - a report fills them itself if it needs them
            log.warning("one-by-one price fill stopped: %s", exc)

    def _others_running(self) -> bool:
        return self._busy() or self._grading() or self._downloading() or self._safety_running()

    async def _backfill_gate(self) -> bool:
        """Wait while anything else is under way; True when it had to wait. Raises
        market.SwitchedOff when `prices_backfill` was set to off meanwhile (even from the
        terminal, which writes the same settings table)."""
        from tearsheet.data import market

        waited = False
        while self._others_running():
            waited = True
            await asyncio.sleep(BACKFILL_POLL_S)
        if market.switched_off(config.Settings(self.db.conn)):
            raise market.SwitchedOff()
        return waited

    async def _backfill(self, wanted: dict[str, tuple[int, str]]) -> dict[str, Any] | None:
        from tearsheet.data import market
        from tearsheet.data.prices import PriceStore, last_completed_session

        settings = config.Settings(self.db.conn)
        # A new pass counts from its first session; an earlier pass's count or stop is gone.
        settings.set_internal(market.STATUS_SETTING, "")
        try:
            await self._backfill_gate()  # grading usually runs first when the app opens
            end = last_completed_session(self.now())

            def progress(done: int, total: int, tally: market.Tally) -> None:
                # Every session, so Settings' count moves (a session is a call, 12 s apart).
                settings.set_internal(
                    market.STATUS_SETTING, f"{done} of {total} sessions, {tally.made} calls"
                )

            async with self.http_factory(
                f"backfill-{self.now():%Y%m%dT%H%M%SZ}", self.db.conn, self.rawstore
            ) as http:
                result = await market.backfill(
                    http,
                    self.rawstore,
                    PriceStore(self.db.conn),
                    wanted,
                    end=end,
                    gate=self._backfill_gate,
                    progress=progress,
                )
            market.record_backfill(settings, wanted, end)
            log.info(
                "price backfill done: %d of %d companies have 14 months (%d calls, %d reused)",
                result.ready,
                result.wanted,
                result.calls,
                result.reused,
            )
            return {"ready": result.ready, "wanted": result.wanted, "calls": result.calls}
        except asyncio.CancelledError:
            raise
        except market.SwitchedOff:
            settings.set_internal(market.STATUS_SETTING, "switched off")
            return None
        except Exception as exc:  # noqa: BLE001 - it tries again next time the app opens
            log.warning("price backfill stopped: %s", exc)
            settings.set_internal(market.STATUS_SETTING, f"stopped: {backfill_stop_reason(exc)}")
            return None

    def _price_download(self, settings: config.Settings, *, have_key: bool) -> dict[str, Any]:
        """How the one-time price download stands, for Settings (protocol.PriceDownload).
        Cheap enough for every get_settings: the holdings, and market.ready's one GROUP BY."""
        from tearsheet.data import market
        from tearsheet.data.membership import stored_or_bundled
        from tearsheet.data.prices import SPY_CIK, PriceStore, last_completed_session

        conn = self.db.conn
        wanted = market.wanted_members(stored_or_bundled(conn))
        companies = {t: key for t, key in wanted.items() if key[0] != SPY_CIK}
        # Counted up to the newest stored session (SPY gets every top-up), so prices a few
        # sessions behind while the app catches up don't read as missing.
        newest = conn.execute(
            "SELECT MAX(date) FROM prices_daily WHERE cik = ? AND share_class = ''", (SPY_CIK,)
        ).fetchone()[0]
        end = last_completed_session(self.now())
        if newest is not None:
            end = min(end, datetime.fromisoformat(newest).date())
        out: dict[str, Any] = {
            "companies_ready": market.ready(PriceStore(conn), companies, end=end),
            "companies": len(companies),
        }
        status = settings.get(market.STATUS_SETTING) or ""
        running = self.backfill_job is not None and not self.backfill_job.done()
        if market.backfill_done(settings, wanted):
            return {**out, "state": "done"}
        if market.switched_off(settings):
            return {**out, "state": "off"}
        if running:
            counted = _BACKFILL_PROGRESS.match(status)
            if counted:
                out["days_done"], out["days_total"] = int(counted[1]), int(counted[2])
            paused_for = (
                "report"
                if self._busy()
                else "grading"
                if self._grading()
                else "history"
                if self._downloading()
                else "safety"
                if self._safety_running()
                else None
            )
            if paused_for:
                return {**out, "state": "paused", "paused_for": paused_for}
            return {**out, "state": "downloading"}
        if not have_key:
            return {**out, "state": "no_key"}
        if status.startswith("stopped: "):
            return {**out, "state": "stopped", "stopped_because": status.removeprefix("stopped: ")}
        return {**out, "state": "waiting"}

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

    def _tally(self, run_id: str):
        """The run's live counts, for the app's progress screen (protocol Tally)."""

        def send(tally: dict[str, Any]) -> None:
            self.notify("run_tally", RunTally(run_id=run_id, tally=Tally(**tally)))

        return send

    async def _job(
        self,
        run_id: str,
        make_run,
        resolved: asyncio.Event,
        outcome: dict[str, Any],
        steps: dict[str, str | None],
        *,
        data_factory=None,
    ) -> None:
        from tearsheet.pipeline import RunCancelled

        run = None
        # How the run ended, for the line (batch.py): ready, stopped, failed or cancelled.
        ended: dict[str, Any] = {"how": "failed", "code": "ENGINE_ERROR"}
        try:
            factory = data_factory or self.data_factory
            async with factory(run_id, self.db.conn, self.rawstore) as data:
                run, query, resume = make_run(data)
                self.active = run
                result = await run.run(query, resume=resume)
            ended = {"how": "stopped" if result.status == "stopped" else "ready"}
            ended["report_id"] = result.report_id
            # A stopped run says so before its report so far, so the app never takes the
            # partial report for a finished one.
            if result.status == "stopped" and run.stop_error is not None:
                code, data_ = error_code(run.stop_error)
                ended.update(code=code, message=str(run.stop_error), **data_)
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
            ended = {"how": "cancelled"}
        except Exception as exc:  # noqa: BLE001 - reported to the app, logged to standard error
            log.exception("run %s failed", run_id)
            code, data_ = error_code(exc)
            ended = {"how": "failed", "code": code, "message": str(exc), **data_}
            if no_connection(exc):
                ended["connection"] = True
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
            # A cancelled run that saved its report anyway still counts as cancelled.
            if run is not None and run.cancel_requested:
                ended["how"] = "cancelled"
            self.last_end = (run_id, ended)
            self.last_usage = (run_id, self._usage_of(run))
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

    @staticmethod
    def _usage_of(run) -> dict[str, Any]:
        """The plan's usage as the run's AI calls last said (batch.py's usage_readings)."""
        from tearsheet.batch import usage_readings

        calls = [
            record.rate_limit
            for client in (getattr(run, "ai", None), getattr(run, "checker", None))
            if client is not None
            for record in getattr(client, "calls", None) or []
        ]
        return usage_readings(calls)

    async def _start_job(
        self, run_id: str, make_run, *, wait_for_resolve: bool, data_factory=None
    ) -> None:
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
            self._job(
                run_id, with_resolve_signal, resolved, outcome, steps, data_factory=data_factory
            )
        )
        if wait_for_resolve:
            await resolved.wait()
            if "error" in outcome:
                exc = outcome["error"]
                code, data = error_code(exc)
                raise EngineError(code, str(exc), **data) from exc
        else:
            resolved.set()

    async def m_run_report(self, p) -> dict[str, Any]:
        if not config.test_mode():  # a test copy's report ends at once (TEST_COPY)
            self._refuse_during_safety_check()
        if self._busy():
            raise EngineError(
                "RUN_IN_PROGRESS", "A report is already running. Wait for it, or cancel it."
            )
        self._refuse_during_grading()
        self._refuse_during_history()
        return await self._begin_report(p.query, p.tool)

    async def _begin_report(self, query: str, tool: str | None) -> dict[str, Any]:
        """Start a full report and answer once step 1 has found the company. The caller has
        checked that nothing else is running (run_report, or the line)."""
        from tearsheet.pipeline import Run, new_run_id

        if config.test_mode():
            return self._begin_test_copy()
        ai = self.ai_factory(self.db.conn, tool)
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
                tally=self._tally(run_id),
                run_id=run_id,
                rawstore=self.rawstore,
                checker=checker,
                log_predictions=self.log_predictions,
                backup_dir=self._backup_dir(),
            )
            return run, query, False

        await self._start_job(run_id, make_run, wait_for_resolve=True)
        return {"run_id": run_id, **self._run_company(run_id)}

    def _begin_test_copy(self) -> dict[str, Any]:
        """A test copy's report: it ends before any data or AI call, with TEST_COPY, as a
        `run_failed` sent just after the reply (and, in the line, as that company's ending)."""
        from tearsheet.pipeline import new_run_id

        run_id = new_run_id(self.now())

        async def end() -> None:
            self.last_end = (
                run_id,
                {"how": "failed", "code": TEST_COPY, "message": TEST_COPY_MESSAGE},
            )
            self.notify(
                "run_failed",
                RunFailedNote(run_id=run_id, step=None, message=TEST_COPY_MESSAGE, code=TEST_COPY),
            )

        self.job = asyncio.create_task(end())
        return {"run_id": run_id, "ticker": None, "name": None}

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
                tally=self._tally(p.run_id),
            )
        except ReplayError as exc:
            raise EngineError("NOT_RESUMABLE", str(exc)) from exc

        @asynccontextmanager
        async def no_data(run_id, conn, rawstore):
            yield None  # resume reads the run's own stored inputs

        # Passed to the job itself: swapping self.data_factory around _start_job restored it
        # before the job ran, so a resume opened live data (and read keys) it never used.
        await self._start_job(
            p.run_id, lambda data: (run, ticker, True), wait_for_resolve=False, data_factory=no_data
        )
        # Resume of the report that paused the line carries on with the line after it.
        if self.line.resume(p.run_id) is not None:
            self._line_changed()
            self._kick_line()
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

    # --- the line: several reports, one after another (batch.py) ----------------------------

    def _line_state(self) -> dict[str, Any]:
        """The line, with how long one of Liam's reports usually takes, for its time left."""
        from tearsheet.batch import typical_report

        return {**self.line.state(), "typical": typical_report(self.db.conn)}

    def _line_changed(self) -> None:
        from tearsheet.batch import SETTING
        from tearsheet.protocol import LineState

        config.Settings(self.db.conn).set_internal(SETTING, self.line.dumps())
        self.notify("line_changed", LineState(**self._line_state()))
        self._watch_line_pause()

    def _watch_line_pause(self) -> None:
        """A pause that ends by itself gets its wait; any other change ends the wait."""
        pause = self.line.paused
        want = pause if pause is not None and pause.wait_until else None
        waiting = self.line_wake is not None and not self.line_wake.done()
        if waiting and self.line_wake_for is want:
            return
        if waiting and self.line_wake is not asyncio.current_task():
            self.line_wake.cancel()
        self.line_wake, self.line_wake_for = None, want
        if want is not None:
            self.line_wake = asyncio.create_task(self._wake_line(want))

    async def _wake_line(self, pause) -> None:
        """Wait until the pause's time, then resume the stopped report (or just go on)."""
        from tearsheet.protocol import RunIdParams

        until = datetime.fromisoformat(pause.wait_until)
        while (left := (until - self.now()).total_seconds()) > 0:
            await self.line_sleep(min(left, self.line_sleep_s))
        while self._something_running():
            await asyncio.sleep(self.line_poll_s)
        if self.line.paused is not pause:
            return
        self.line_wake, self.line_wake_for = None, None
        run_id = self.line.wake()
        if run_id is not None:
            try:
                await self.m_resume(RunIdParams(run_id=run_id))
                return
            except EngineError as exc:
                log.warning("the line couldn't resume %s: %s", run_id, exc)
                self.line.carry_on()
        self._line_changed()
        self._kick_line()

    def _kick_line(self) -> None:
        if self.line_job is None or self.line_job.done():
            self.line_job = asyncio.create_task(self._run_line())

    def _something_running(self) -> bool:
        return self._busy() or self._grading() or self._downloading() or self._safety_running()

    async def _run_line(self) -> None:
        """Write the line's reports one at a time. An error in the line itself (not in a
        report) used to end this task silently, with a company left showing as being written;
        now that report is ended and the line pauses with a sentence, for Carry on."""
        try:
            await self._line_loop()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - logged; the line pauses instead of stopping unseen
            log.exception("the report line stopped on an error")
            await self._line_recover()

    async def _line_recover(self) -> None:
        from tearsheet.batch import LINE_ERROR, Pause

        line = self.line
        entry = line.writing
        if entry is not None:
            if self.job is not None:
                await asyncio.wait({self.job})
            ended = (
                self.last_end[1]
                if entry.run_id and self.last_end and self.last_end[0] == entry.run_id
                else {"how": "failed", "code": "ENGINE_ERROR"}
            )
            try:
                line.end(entry, ended, now=self.now())
            except Exception:  # noqa: BLE001
                line.writing = None
        if line.paused is None and line.waiting:
            line.paused = Pause(
                LINE_ERROR,
                "The line stopped on an unexpected error (it’s in the engine log). "
                "Carry on to go on.",
            )
        try:
            self._line_changed()
        except Exception:  # noqa: BLE001
            log.exception("the report line's state couldn't be saved")

    async def _line_loop(self) -> None:
        """Write the line's reports one at a time, each once nothing else is running."""
        line = self.line
        while True:
            entry = line.writing  # a resumed report, already started
            round_ = line.round
            if entry is None:
                while self._something_running() and line.waiting and line.paused is None:
                    await asyncio.sleep(self.line_poll_s)
                if line.writing is not None:
                    continue
                if not line.waiting or line.paused is not None:
                    return
                entry = line.take_next()
                self._line_changed()
                if entry.run_id is not None and await self._resume_in_line(entry):
                    continue
                try:
                    started = await self._begin_report(entry.ticker, None)
                except Exception as exc:  # noqa: BLE001 - that company is marked stopped
                    if isinstance(exc, EngineError):
                        code, data = exc.code, exc.data
                    else:
                        log.exception("the line's report on %s didn't start", entry.ticker)
                        code, data = error_code(exc)
                    if line.round == round_:
                        line.end(
                            entry,
                            {
                                "how": "failed",
                                "code": code,
                                "message": str(exc),
                                "connection": no_connection(exc)
                                or no_connection(exc.__cause__ or exc),
                                **data,
                            },
                            now=self.now(),
                        )
                        self._line_changed()
                    continue
                if line.round != round_:  # Cancel all while step 1 ran
                    if self.active is not None and self.active.run_id == started["run_id"]:
                        self.active.cancel()
                else:
                    entry.run_id = started["run_id"]
                    if started.get("name"):
                        entry.name = started["name"]
                    self._line_changed()
            if self.job is not None:
                await asyncio.wait({self.job})  # wait, not gather: cancelling this never stops it
            if line.round != round_:
                continue
            ended = self.last_end[1] if self.last_end and self.last_end[0] == entry.run_id else {}
            line.end(entry, ended or {"how": "failed", "code": "ENGINE_ERROR"}, now=self.now())
            if self.last_usage and self.last_usage[0] == entry.run_id:
                line.check_usage(self.last_usage[1], self.now())
            self._line_changed()

    async def _resume_in_line(self, entry: Entry) -> bool:
        """The report being written when Tearsheet quit: resumed where it stopped, if its run
        can be (it was interrupted). Says whether it was; if not, it starts again."""
        from tearsheet.protocol import RunIdParams

        row = self.db.conn.execute(
            "SELECT status FROM runs WHERE run_id = ?", (entry.run_id,)
        ).fetchone()
        if row is None or row[0] != "interrupted":
            entry.run_id = None
            return False
        try:
            await self.m_resume(RunIdParams(run_id=entry.run_id))
        except EngineError as exc:
            log.warning("the line couldn't resume %s: %s", entry.run_id, exc)
            entry.run_id = None
            return False
        return True

    def _line_plan(self, p) -> tuple[list[Entry], list[Skip]]:
        from tearsheet.companies import _aliases
        from tearsheet.data import membership

        holdings = membership.load_bundled()
        return self.line.plan(
            [*self._group_tickers(holdings, p.group, p.sector), *p.queries],
            holdings=holdings,
            tickers={row.ticker: row.cik for row in holdings.rows},
            aliases=_aliases(),
            conn=self.db.conn,
            now=self.now(),
            skip_recent=p.skip_recent,
        )

    def _group_tickers(self, holdings, group: str | None, sector: str | None) -> list[str]:
        """The quick adds' companies, largest index weight first, one ticker each: the whole
        S&P 500, one sector, or the rest (every company without a finished report yet)."""
        from tearsheet.batch import finished_reports

        if group is None:
            return []
        companies = holdings.companies()
        if group == "sector":
            if not sector or not any(c.sector == sector for c in companies):
                raise ValueError(f"No S&P 500 sector is called {sector!r}.")
            companies = holdings.sector_members(sector)
        elif group == "rest":
            done = finished_reports(self.db.conn)
            companies = [c for c in companies if c.cik not in done]
        return [c.tickers[0] for c in companies]

    def _plan_answer(self, entries: list[Entry], skipped: list[Skip]) -> dict[str, Any]:
        return {
            "items": [e.item() for e in entries],
            "skipped": [{"query": s.query, "reason": s.reason, "kind": s.kind} for s in skipped],
            "line": self._line_state(),
        }

    async def m_plan_line(self, p) -> dict[str, Any]:
        """What add_to_line would add, and which companies would make a new official
        prediction. Nothing changes."""
        return self._plan_answer(*self._line_plan(p))

    async def m_line_groups(self, p) -> dict[str, Any]:
        """The quick adds and how many companies each holds: the whole S&P 500, each sector,
        and the rest (those without a finished report yet)."""
        from tearsheet.batch import finished_reports
        from tearsheet.data import membership

        companies = membership.load_bundled().companies()
        done = finished_reports(self.db.conn)
        sectors: dict[str, int] = {}
        for c in companies:
            sectors[c.sector] = sectors.get(c.sector, 0) + 1
        return {
            "all": len(companies),
            "rest": sum(c.cik not in done for c in companies),
            "sectors": [{"name": k, "count": v} for k, v in sorted(sectors.items())],
        }

    async def m_add_to_line(self, p) -> dict[str, Any]:
        from tearsheet.batch import REOPENED

        entries, skipped = self._line_plan(p)
        if entries:
            # Starting a new list carries on a line left from last time; a pause for a problem
            # (a usage limit, say) stays until Resume or carry on.
            if self.line.paused is not None and self.line.paused.code == REOPENED:
                self.line.carry_on()
            self.line.add(entries)
            self._line_changed()
            self._kick_line()
        return self._plan_answer(entries, skipped)

    async def m_get_line(self, p) -> dict[str, Any]:
        return self._line_state()

    async def m_remove_from_line(self, p) -> dict[str, Any]:
        if self.line.remove(p.ticker):
            self._line_changed()
        return self._line_state()

    async def m_clear_line(self, p) -> dict[str, Any]:
        """Cancel all: the report being written stops, and nothing is left waiting."""
        writing = self.line.writing
        self.line.clear()
        if writing and self.active is not None and self.active.run_id == writing.run_id:
            self.active.cancel()
        self._line_changed()
        return self._line_state()

    async def m_carry_on_line(self, p) -> dict[str, Any]:
        """Go on with the companies still waiting, without resuming a stopped report; past the
        weekly 80%, Liam's yes to going on."""
        self.line.carry_on(self.now())
        self._line_changed()
        self._kick_line()
        return self._line_state()

    async def wait_for_job(self) -> None:
        if self.job is not None:
            await self.job

    async def wait_for_line(self) -> None:
        """Until the line has nothing more to start (it is empty or paused)."""
        while self.line_job is not None and not self.line_job.done():
            await asyncio.wait({self.line_job})

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
        from tearsheet.key_numbers import key_numbers
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
        bar = None
        keys = None
        if cik is not None:
            # Saved reports always open, whatever is broken: without its numbers if need be.
            try:
                numbers = report_numbers.numbers_for(
                    self.db.conn, report, row["run_id"], cik, report_id=row["report_id"]
                )
                bar = report_numbers.bar_numbers(self.db.conn, numbers, row["run_id"], cik)
                keys = key_numbers(self.db.conn, numbers, bar, row["run_id"], cik)
            except Exception:  # noqa: BLE001 - logged; the report opens from its text alone
                log.exception("reading the numbers of report %s", p.report_id)
        claims = (numbers or {}).get("claims")
        analysts = (
            await self._analyst_panel(report, row["run_id"], row["created_at"])
            if cik is not None
            else None
        )
        return {
            "report_id": row["report_id"],
            "run_id": row["run_id"],
            "ticker": report.get("ticker", ""),
            "cik": cik,
            "name": (run_row[1] if run_row else None) or report.get("company") or None,
            "created_at": row["created_at"],
            "narrative_complete": bool(row["narrative_complete"]),
            "kept": claims.get("kept") if isinstance(claims, dict) else None,
            "bar": bar,
            "key_numbers": keys,
            "html": render_html(
                report,
                mode="app",
                view=p.view,
                column=p.column,
                narrow=p.narrow,
                side=p.side,
                motion=p.motion,
                numbers=numbers,
                analysts=analysts,
                report_id=row["report_id"],
            ),
        }

    async def m_export_report(self, p) -> dict[str, Any]:
        """A download of a saved report (export/), made from what is stored, read-only, with no
        AI: the PDF's print page for the app to print, or the deck or workbook's bytes. The PDF
        asks analystdb for its figures as of the report's price date, as the report page does."""
        import base64

        from tearsheet.export import data as export_data
        from tearsheet.export import deck, pdf, workbook

        try:
            d = export_data.load(self.db.conn, p.report_id, raw_dir=self.paths.raw)
        except export_data.NotFound as exc:
            raise EngineError("ENGINE_ERROR", f"No report {p.report_id}.") from exc
        stem = re.sub(
            r"[^A-Za-z0-9.\- ]", "", f"{d.ticker} Tearsheet {d.made_on.day} {d.made_on:%b %Y}"
        )
        answer: dict[str, Any] = {
            "report_id": d.report_id,
            "kind": p.kind,
            "file_name": f"{stem.strip() or 'Tearsheet report'}.{p.kind}",
            "html": None,
            "data_base64": None,
            "footer": "",
        }
        if p.kind == "pdf":
            analysts = await self._analyst_panel(
                {"ticker": d.ticker}, d.run_id, d.created_at.isoformat()
            )
            answer["html"] = pdf.render(d, analysts)
            answer["footer"] = pdf.footer_text(d)
        else:
            blob = workbook.build(d) if p.kind == "xlsx" else deck.build(d)
            answer["data_base64"] = base64.b64encode(blob).decode("ascii")
        return answer

    def _report_day(self, run_id: str, created_at: str):
        """The day a report is as of: its price date, else the Eastern day it was made."""
        from tearsheet.http import EASTERN
        from tearsheet.report_numbers import run_price_date

        day = run_price_date(self.db.conn, run_id)
        return day or datetime.fromisoformat(created_at).astimezone(EASTERN).date()

    async def _analyst_panel(self, report: dict, run_id: str, created_at: str):
        """analystdb's panel for a report (data/analystdb.py), as of its price date: its figures
        or the quiet line. None, and so no panel at all, if anything here goes wrong: it never
        fails or changes the report itself."""
        ticker = str(report.get("ticker") or "")
        if not ticker:
            return None
        try:
            return await self.analystdb.panel(ticker, self._report_day(run_id, created_at))
        except Exception:  # noqa: BLE001 - logged; the report opens as it always has
            log.exception("analystdb's panel for %s", ticker)
            return None

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

    async def m_get_report_numbers(self, p) -> dict[str, Any]:
        """The report's numbers for the panel's bigger views (protocol.ReportNumbers)."""
        from tearsheet.report_views import views_for

        row = self.db.conn.execute(
            "SELECT r.report_id, r.run_id, u.cik FROM reports r"
            " LEFT JOIN runs u ON u.run_id = r.run_id WHERE r.report_id = ?",
            (p.report_id,),
        ).fetchone()
        # Without its run's company there are no stored numbers to read, as for the chart.
        if row is None or row["cik"] is None:
            raise EngineError("ENGINE_ERROR", f"No report {p.report_id}.")
        stored = self.db.conn.execute(
            "SELECT json FROM sections WHERE report_id = ? AND key = 'report'", (p.report_id,)
        ).fetchone()
        report = json.loads(stored[0])
        ticker = report.get("ticker") or ""
        views = views_for(
            self.db.conn,
            report,
            row["run_id"],
            row["cik"],
            report_id=row["report_id"],
            ticker=ticker,
        )
        return {"report_id": row["report_id"], "ticker": ticker, **views}

    async def m_get_analysts(self, p) -> dict[str, Any]:
        """analystdb's view of a report's company for the side panel (protocol.ReportAnalysts),
        as of the report's price date. analystdb being off is an answer (state "down" with its
        quiet note), not an error. Answered off the request loop (OFF_LOOP)."""
        row = self.db.conn.execute(
            "SELECT report_id, run_id, created_at FROM reports WHERE report_id = ?",
            (p.report_id,),
        ).fetchone()
        stored = (
            self.db.conn.execute(
                "SELECT json FROM sections WHERE report_id = ? AND key = 'report'",
                (p.report_id,),
            ).fetchone()
            if row is not None
            else None
        )
        if row is None or stored is None:
            raise EngineError("ENGINE_ERROR", f"No report {p.report_id}.")
        ticker = str(json.loads(stored[0]).get("ticker") or "")
        view = await self.analystdb.view(ticker, self._report_day(row["run_id"], row["created_at"]))
        return {**view, "report_id": row["report_id"], "ticker": ticker}

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
            if config.key_locked("massive"):
                raise EngineError(
                    "ENGINE_ERROR",
                    f"macOS didn’t let Tearsheet open your Massive key. {KEY_LOCKED_FIX}",
                )
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
        from tearsheet.report_marks import kept_because

        which = "IN" if p.hidden else "NOT IN"
        rows = self.db.conn.execute(
            "SELECT r.report_id, r.run_id, r.created_at, r.narrative_complete, u.cik, c.name FROM reports r"
            " JOIN runs u ON u.run_id = r.run_id LEFT JOIN companies c ON c.cik = u.cik"
            f" WHERE r.report_id {which} (SELECT report_id FROM hidden_reports)"
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
                    "kept_because": kept_because(self.db.conn, r["report_id"]),
                }
            )
        return out

    # --- the sidebar's marks (report_marks.py) ------------------------------------------------

    async def m_hide_reports(self, p) -> dict[str, Any]:
        from tearsheet.report_marks import hide

        return hide(self.db.conn, p.report_ids)

    async def m_show_reports(self, p) -> dict[str, Any]:
        from tearsheet.report_marks import show

        return {"shown": show(self.db.conn, p.report_ids)}

    async def m_erase_reports(self, p) -> dict[str, Any]:
        """Erase hidden reports whose undo has passed. Official and reviewed ones stay hidden."""
        from tearsheet.report_marks import erase

        result = erase(self.db.conn, p.report_ids)
        if result["erased"]:
            log.info("erased %d deleted report(s)", len(result["erased"]))
        return result

    async def m_pin_company(self, p) -> dict[str, Any]:
        from tearsheet.report_marks import set_pinned

        set_pinned(self.db.conn, p.cik, p.pinned)
        return {"ok": True}

    async def m_list_predictions(self, p) -> list[dict[str, Any]]:
        from tearsheet.predictions import summary_extras

        out = []
        for r in self.db.conn.execute("SELECT * FROM predictions ORDER BY run_at DESC").fetchall():
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
                | summary_extras(self.db.conn, r)
            )
        return out

    async def m_prediction_prices(self, p) -> dict[str, Any]:
        from tearsheet.predictions import compare_prices

        return compare_prices(self.db.conn, p.ciks, p.since)

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
        a second ask while it goes gets the same answer. A test copy grades nothing."""
        if config.test_mode():
            return {"graded": 0, "note": "Nothing is due: grading is off in a test copy."}
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
        backup_dir = config.backup_folder(settings)
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
        if p.service == "massive":
            # A new install starts its price download the moment setup saves the key.
            self._start_backfill()
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
        if p.service == "massive":
            # Setup and Settings save the key here: a new install's price download starts now.
            self._start_backfill()
        return {"proof": proof}

    async def m_run_safety_check(self, p) -> dict[str, Any]:
        from tearsheet.ai.lockdown import FULL_PROBES, LINK_PROBES

        if self._busy():
            raise EngineError(
                "RUN_IN_PROGRESS", "A report is running. Wait for it before the safety check."
            )
        self._refuse_during_safety_check()
        self._refuse_during_grading()
        # A test copy's check is a canned one, with no AI tool at all.
        connector = (
            None if config.test_mode() else self.safety_connector_factory(self.db.conn, p.tool)
        )
        self.safety_stop = False
        self.safety_state = {
            "tool": p.tool,
            "n": 0,
            "total": FULL_PROBES + LINK_PROBES,
            "started_at": self.now().isoformat(timespec="seconds"),
        }
        self.safety_job = asyncio.create_task(self._safety_job(p.tool, connector))
        return {"started": True}

    async def m_cancel_safety_check(self, p) -> dict[str, Any]:
        """Stop the safety check after the call in progress. That call ends normally: the
        check is never cancelled, so no AI tool is stopped part way. Nothing is recorded."""
        if not self._safety_running():
            return {"stopping": False}
        self.safety_stop = True
        return {"stopping": True}

    def _safety_step(self, tool: str, n: int, total: int, name: str, *, ok: bool) -> None:
        if self.safety_state is not None:
            self.safety_state.update(n=n, total=total)
        self.notify(
            "safety_progress", SafetyProgress(tool=tool, n=n, total=total, name=name, ok=ok)
        )

    async def _safety_job(self, tool: str, connector) -> None:
        """The full check, or a test copy's canned one (no connector). Before it returns, so
        the line (which looks again every second) can't start a report first, a check that
        didn't pass may pause the reports waiting, and a pass carries them on."""
        try:
            if connector is None:
                end = await self._canned_check(tool)
            else:
                end = await self._full_check(tool, connector)
            self._line_after_check(tool, end)
        finally:
            self.safety_state = None
            self.safety_stop = False
        self.notify(
            "safety_done",
            SafetyDone(tool=tool, passed=end.passed, reason=end.reason, finished=end.finished),
        )

    async def _full_check(self, tool: str, connector) -> _CheckEnd:
        from tearsheet.ai import api_billing, close_connector
        from tearsheet.ai.client import ToolState
        from tearsheet.ai.lockdown import STOPPED, run_check
        from tearsheet.batch import SAFETY_CHECK_STOPPED, SAFETY_CHECK_UNFINISHED

        def on_probe(n: int, total: int, probe) -> None:
            ok = not probe.problems and probe.error is None
            self._safety_step(tool, n, total, probe.name, ok=ok)

        try:
            report = await run_check(
                connector,
                form="full",
                api_billing=api_billing(tool, config.Settings(self.db.conn)),
                on_probe=on_probe,
                should_stop=lambda: self.safety_stop,
            )
            self._save_check_report(tool, report)
            if report.inconclusive is None:
                ToolState(self.db.conn, tool).record_check(
                    version=report.program_version,
                    model_ids=report.model_ids,
                    form="full",
                    passed=report.passed,
                )
            if report.inconclusive == STOPPED:
                return _CheckEnd(False, False, f"{STOPPED}.", SAFETY_CHECK_STOPPED)
            if report.inconclusive:
                reason = f"The check couldn't finish: {report.inconclusive}"
                return _CheckEnd(False, False, reason, SAFETY_CHECK_UNFINISHED)
            if not report.passed:
                # Recorded as failed: its block ends the next report with LOCKDOWN_FAILED.
                reason = "; ".join(report.problems[:3]) or "The check did not pass."
                return _CheckEnd(False, True, reason)
            return _CheckEnd(True, True)
        except Exception as exc:  # noqa: BLE001 - reported to the app, logged to standard error
            log.exception("safety check on %s failed", tool)
            reason = str(exc) or "The check stopped unexpectedly."
            return _CheckEnd(False, False, reason, SAFETY_CHECK_UNFINISHED)
        finally:
            try:
                await close_connector(connector)
            except Exception:  # noqa: BLE001 - cleanup only
                log.exception("closing the AI tool after the safety check")

    def _save_check_report(self, tool: str, report) -> None:
        """The check's report file, named as the command-line check names it, with each call's
        plan-usage reading."""
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        path = self.paths.logs / f"lockdown-{tool}-{report.form}-{stamp}.json"
        try:
            path.write_text(report.to_json())
        except OSError:
            log.exception("writing the safety check's report file")

    async def _canned_check(self, tool: str) -> _CheckEnd:
        """A test copy's check: the real probes' names, a step every fifth of a second, and no
        AI call. It ends as `check=` in the test folder's state file says (pass, the default;
        fail; or unfinished), and is never recorded, so it can't mark a real tool as checked."""
        from tearsheet.ai.lockdown import STOPPED, load_prompts
        from tearsheet.batch import SAFETY_CHECK_STOPPED, SAFETY_CHECK_UNFINISHED

        prompts = load_prompts()
        names = [probe.name for probe in prompts.probes + prompts.link_probes]
        for n, name in enumerate(names, start=1):
            if self.safety_stop:
                return _CheckEnd(False, False, f"{STOPPED}.", SAFETY_CHECK_STOPPED)
            await asyncio.sleep(self.canned_check_step_s)
            self._safety_step(tool, n, len(names), name, ok=True)
        ending = config.test_state().get("check") or "pass"
        if ending == "fail":
            reason = "The test copy's check was set to fail (check=fail in its state file)."
            return _CheckEnd(False, True, reason, "LOCKDOWN_FAILED")
        if ending == "unfinished":
            reason = (
                "The check couldn't finish: the test copy's check was set to unfinished "
                "(check=unfinished in its state file)."
            )
            return _CheckEnd(False, False, reason, SAFETY_CHECK_UNFINISHED)
        if ending != "pass":
            log.warning("the test copy's state file says check=%s; the check passes", ending)
        return _CheckEnd(True, True)

    def _writing_tool(self) -> str | None:
        """The tool the line's reports are written with (primary_tool, as client_for picks)."""
        from tearsheet.ai.client import AIUnavailable, choose_tool

        try:
            return choose_tool(None, config.Settings(self.db.conn))
        except AIUnavailable:
            return None

    def _line_after_check(self, tool: str, end: _CheckEnd) -> None:
        """What a safety check's ending does to the reports waiting (first-run design §5).

        A pass on the writing tool carries on a line the check paused. A stop, or a check that
        couldn't finish, pauses the reports waiting when the writing tool has never had a check
        recorded (a brand-new install); a tool checked before keeps its short check before the
        next report. A failed check pauses nothing here: its block ends the next report with
        LOCKDOWN_FAILED. A test copy records nothing, so each ending that doesn't pass pauses
        the line with its code."""
        from tearsheet.ai.client import ToolState
        from tearsheet.batch import SAFETY_PAUSES

        paused = self.line.paused
        if end.passed:
            if paused is not None and paused.code in SAFETY_PAUSES and tool == self._writing_tool():
                self.line.carry_on()
                self._line_changed()
                self._kick_line()
            return
        if end.pause_code is None:
            return
        if not config.test_mode() and (
            tool != self._writing_tool() or ToolState(self.db.conn, tool).row() is not None
        ):
            return
        if self.line.pause(end.pause_code, end.reason or "The safety check didn't finish."):
            self._line_changed()

    async def m_get_settings(self, p) -> dict[str, Any]:
        settings = config.Settings(self.db.conn)
        backup = config.backup_folder(settings)
        home = Path.home()
        in_icloud = any(backup == home / f or home / f in backup.parents for f in ICLOUD_FOLDERS)
        round_ = settings.get("goal1_round")
        keys = {s: _key_state(s) for s in config.KEY_SERVICES}
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
            "services": services(settings),
            "price_download": self._price_download(settings, have_key=keys["massive"] == "set"),
            # The check under way, so a window that reloads mid-check shows the real count.
            "safety_running": dict(self.safety_state)
            if self._safety_running() and self.safety_state is not None
            else None,
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

    # Temporary folders an engine that was killed left behind (tempfiles.py).
    from tearsheet.tempfiles import sweep_stale

    sweep_stale()
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
        # The line stops first, so it neither counts the cancelled report nor starts the next;
        # it is kept as it is, and comes back paused next time.
        if server.line_job is not None:
            server.line_job.cancel()
        if server.line_wake is not None:
            server.line_wake.cancel()
        if server.active is not None:
            # Interrupted, not cancelled: the line resumes it next time instead of starting
            # the company again (whose official prediction may already be logged).
            server.active.cancel(interrupted=True)
        if server.job is not None:
            try:
                await server.job
            except Exception:  # noqa: BLE001
                pass
        # Grading, history downloads and the price backfill stop with the engine; grading and
        # the backfill run again next time the app opens (the backfill reuses what it stored),
        # and a cut-short download is asked for again.
        jobs = [
            *server.background,
            *([server.grading_job] if server.grading_job else []),
            *server.history_jobs.values(),
            *([server.backfill_job] if server.backfill_job else []),
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
