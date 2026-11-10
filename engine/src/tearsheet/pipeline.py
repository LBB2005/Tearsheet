"""The report run (design item 34, Technical Plan §3).

Phase 1a builds the thin slice: every step runs end to end on one ticker, each in its simplest
form. Resolve by ticker (or alias or name); one metric per factor; DCF only; filing extraction
only, with no news; sections 1, 4 and 5 and the What to watch block (with sections 2 and 3 as
code-written tables); the numeric guard and the citation check. The slice logs no
predictions; its runs are stored with mode = "slice".
"""

from __future__ import annotations

import asyncio
import contextvars
import hashlib
import json
import logging
import math
import re
import sqlite3
import statistics
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

from tearsheet import ENGINE_VERSION, METHOD_CODE_VERSION, config
from tearsheet.ai.client import (
    AIAuthError,
    AIBudgetExhausted,
    AIClient,
    AIError,
    AILockdownFailed,
    AIUsageLimit,
)
from tearsheet.ai.schemas import EvidenceItem, SectionKey
from tearsheet.data import sec as sec_data
from tearsheet.data.analyst import consensus
from tearsheet.data.articles import Allowlist, Skipped
from tearsheet.data.prices import SPY_CIK, PriceStore, last_completed_session
from tearsheet.extract import Extracted, extract_section, planned_calls
from tearsheet.flags import insider_buying_note, red_flags
from tearsheet.http import HTTPFailure, SECBlocked
from tearsheet.methodology import Methodology
from tearsheet.metrics import Metric, compute_metrics, inputs_from, tax_rate
from tearsheet.narrate import Draft, narrate_section
from tearsheet.news import search_links
from tearsheet.normalize import Financials, newest_period
from tearsheet.peers import PeerGroup, build_peer_group
from tearsheet.prompts import load_prompt
from tearsheet.rating import PeerGap, Rating, RatingInputs, peer_mix, rate, value_gap
from tearsheet.render import PlaceholderValue, fill, format_value, render_html
from tearsheet.resolve import CONVERSION_RATIOS, Resolved, canonical_ticker, resolve
from tearsheet.scoring import (
    SLICE_METRICS,
    ScoreResult,
    momentum_scaling,
    score_group,
)
from tearsheet.sources import DataSource, Doc
from tearsheet.text.compare import change_score
from tearsheet.text.parse import Paragraph, filing_sections, split_paragraphs
from tearsheet.valuation import saved as saved_valuation
from tearsheet.valuation.combine import Combined, combine
from tearsheet.valuation.common import (
    GroupStats,
    MethodValue,
    ValuationInputs,
    cost_of_equity,
    median,
    percentile_value,
)
from tearsheet.valuation.dcf import dcf
from tearsheet.valuation.financials import ffo, price_to_ffo
from tearsheet.valuation.multiples import multiples
from tearsheet.valuation.range import Range, RangeInputs, twelve_month_range, uncertainty_level
from tearsheet.valuation.residual_income import residual_income
from tearsheet.verify.citations import check_citations
from tearsheet.verify.flow import Claim, decide
from tearsheet.verify.numeric_guard import NumericGuard
from tearsheet.verify.skeptic import skeptic_section

log = logging.getLogger(__name__)

STEPS = (
    "resolve",
    "fetch",
    "normalize",
    "text",
    "metrics",
    "score",
    "value",
    "rate",
    "news",
    "extract",
    "narrate",
    "render",
    "verify",
    "save",
)
STOPPING = (AIUsageLimit, AIAuthError, AILockdownFailed)


async def _settled(value: Any) -> Any:
    """A finished read's answer, or its error raised again (for `Run._ai_call` in step 10)."""
    if isinstance(value, BaseException):
        raise value
    return value


# Which `_parallel` job is running, so the notes it adds can be put back in the jobs' order.
_JOB: contextvars.ContextVar[int | None] = contextvars.ContextVar("tearsheet_job", default=None)
# The order the score table lists factors in (weights.yaml's order).
FACTOR_ORDER = (
    "profitability",
    "momentum",
    "valuation",
    "capital_discipline",
    "balance_sheet",
    "earnings_quality",
)
TRADING_DAYS = 252
# SEC's company-facts file can lag a filing (design item 22). A peer's filing list is read only
# when its newest period ended more than this many days ago: a 10-Q is due 40-45 days after
# its quarter, so up-to-date facts are rarely older than this, and a fresh peer costs nothing.
FACTS_AGE_CHECK_DAYS = 100
# A 10-Q or 10-K counts as newer than the facts when its period ends this many days after theirs.
FACTS_LAG_DAYS = 20
MOMENTUM_SKIP = 21
RATING_DEFINITION = (
    "The rating is relative to the company's peer group over the next 12 months: Buy means it is "
    "expected to beat the equal-weighted return of its peers, Sell to trail them, Hold neither."
)
# The slice's extraction plan: (document role, section key, label, report sections fed).
SLICE_SOURCES = (
    ("10-K", "Item 1", "10-K Item 1 (Business)", (SectionKey.BUSINESS,)),
    (
        "10-K",
        "Item 7",
        "10-K Item 7 (Management's discussion and analysis)",
        (SectionKey.BUSINESS,),
    ),
    ("10-K", "Item 1A", "10-K Item 1A (Risk factors)", (SectionKey.RISKS, SectionKey.WATCH)),
    (
        "10-Q",
        "Part II Item 1A",
        "10-Q Part II Item 1A (Risk factor updates)",
        (SectionKey.RISKS, SectionKey.WATCH),
    ),
)
SLICE_SECTIONS = (SectionKey.BUSINESS, SectionKey.RISKS, SectionKey.WATCH)
# The full method adds section 6, recent results, from the 10-Q's MD&A and 10-K Item 7 (the
# earnings release joins it with the rest of Phase 1b).
FULL_SOURCES = tuple(
    (
        role,
        key,
        label,
        feeds + (SectionKey.RESULTS, SectionKey.TRENDS)
        if (role, key) == ("10-K", "Item 7")
        else feeds,
    )
    for role, key, label, feeds in SLICE_SOURCES
) + (
    (
        "10-Q",
        "Part I Item 2",
        "10-Q Part I Item 2 (Management's discussion and analysis)",
        (SectionKey.RESULTS,),
    ),
    (
        "earnings 8-K",
        "Exhibit 99.1",
        "the latest earnings release (8-K Exhibit 99.1)",
        (SectionKey.RESULTS,),
    ),
)
FULL_SECTIONS = (
    SectionKey.BUSINESS,
    SectionKey.RISKS,
    SectionKey.RESULTS,
    SectionKey.NEWS,
    SectionKey.TRENDS,
    SectionKey.WATCH,
)
ARTICLE_CAP = 15
ARTICLE_FLOOR = 5
# With article reading off (the `news_articles` setting, the default), section 7 lists up to
# this many of the link search's allowlisted links, unread (docs/launch/launch-readiness.md, M2).
LINKS_SHOWN = 8
# The sections' titles as the report prints them, for the app's live progress.
SECTION_TITLES = {
    SectionKey.BUSINESS: "The business",
    SectionKey.RISKS: "Risks",
    SectionKey.RESULTS: "Recent results",
    SectionKey.NEWS: "News and views",
    SectionKey.TRENDS: "Industry trends",
    SectionKey.WATCH: "What to watch",
}
# The usual step times the app paces its progress by come from this many recent finished runs.
TYPICAL_RUNS = 5


def typical_seconds(conn: sqlite3.Connection, runs: int = TYPICAL_RUNS) -> dict[str, float] | None:
    """Each step's usual time in seconds: the median over the last few finished full-method
    runs that recorded their timings, or None before the first one."""
    rows = conn.execute(
        "SELECT so.json FROM step_outputs so JOIN runs r ON r.run_id = so.run_id"
        " WHERE so.step = 'timings' AND r.mode = 'full' AND r.status = 'done'"
        " ORDER BY r.started_at DESC LIMIT ?",
        (runs,),
    ).fetchall()
    times: dict[str, list[float]] = {}
    for (text,) in rows:
        try:
            steps = json.loads(text).get("steps") or {}
        except (ValueError, AttributeError):
            continue
        for step, seconds in steps.items():
            if step in STEPS and isinstance(seconds, int | float):
                times.setdefault(step, []).append(float(seconds))
    if not times:
        return None
    return {step: round(statistics.median(v), 1) for step, v in times.items()}


class RunCancelled(Exception):
    """The user cancelled the run; checked between steps and before each AI call."""


class RunFailed(Exception):
    def __init__(self, step: str, message: str):
        super().__init__(f"{step}: {message}")
        self.step = step


@dataclass
class MemberData:
    cik: int
    ticker: str
    fin: Financials | None = None
    price: tuple[date, float] | None = None
    metrics: dict[str, Metric] = field(default_factory=dict)
    valuation: Combined | None = None
    volatility: float | None = None
    total_return_12m: float | None = None
    dividend_yield: float = 0.0
    valuation_inputs: ValuationInputs | None = None
    financial_class: str = ""
    # Shares from the cover page, all classes, in this member's own ticker's units, when SEC's
    # company-facts file has no usable count (it drops per-class facts).
    cover_shares: float | None = None


@dataclass
class RunResult:
    run_id: str
    report_id: str | None
    status: str
    html_path: Path | None
    rating: str | None
    notes: list[str]
    prediction: str | None = None  # what happened to the prediction log on this run
    # Seconds per step and per AI task (`Run._timings`), also saved as the `timings` step.
    timings: dict[str, Any] | None = None


def _now() -> datetime:
    return datetime.now(UTC)


def new_run_id(now: datetime | None = None) -> str:
    return f"run-{(now or _now()):%Y%m%dT%H%M%SZ}-{uuid.uuid4().hex[:6]}"


def financial_class(sic: int | None, cik: int, rules: dict[str, Any]) -> str:
    if sic is None:
        return ""
    for name in ("bank", "insurer", "reit"):
        spec = rules["financial_classes"][name]
        if sic in spec.get("codes", []) or any(
            lo <= sic <= hi for lo, hi in spec.get("ranges", [])
        ):
            return name
        if cik in spec.get("overrides", []):
            return name
    return ""


def volatility(log_returns: list[float]) -> float | None:
    window = log_returns[-TRADING_DAYS:]
    if len(window) < TRADING_DAYS * 0.8:
        return None
    return statistics.pstdev(window) * math.sqrt(TRADING_DAYS)


def momentum(store: PriceStore, cik: int, up_to: date) -> float | None:
    """Total return from 252 trading days before the run to 21 trading days before."""
    closes = store.closes(cik, up_to=up_to)
    if len(closes) <= TRADING_DAYS:
        return None
    start, end = closes[-1 - TRADING_DAYS][0], closes[-1 - MOMENTUM_SKIP][0]
    return store.total_return(cik, "", start, end)


def twelve_month_return(store: PriceStore, cik: int, up_to: date) -> float | None:
    closes = store.closes(cik, up_to=up_to)
    if len(closes) <= TRADING_DAYS:
        return None
    return store.total_return(cik, "", closes[-1 - TRADING_DAYS][0], closes[-1][0])


def _payout(fin: Financials) -> float | None:
    """Dividends ÷ net income over the trailing 12 months, kept between 0 and 1; 0 when net
    income is zero or below (item 27)."""
    paid, income = fin.ttm("dividends_paid"), fin.ttm("net_income")
    if income is None or income.value <= 0:
        return 0.0
    if paid is None:
        return 0.0
    return min(max(paid.value / income.value, 0.0), 1.0)


def dividend_yield(store: PriceStore, cik: int, up_to: date, price: float) -> float:
    paid = sum(
        amount for day, amount in store.dividends(cik).items() if 0 <= (up_to - day).days <= 365
    )
    return paid / price if price else 0.0


class Run:
    def __init__(
        self,
        conn: sqlite3.Connection,
        data: DataSource,
        ai: AIClient | None,
        method: Methodology,
        *,
        mode: str = "slice",
        now: datetime | None = None,
        out_dir: Path | None = None,
        progress: Callable[[str, str], None] | None = None,
        run_id: str | None = None,
        rawstore=None,
        checker: AIClient | None = None,
        log_predictions: bool = False,
        backup_dir: Path | None = None,
        tally: Callable[[dict[str, Any]], None] | None = None,
    ):
        if mode not in ("slice", "full"):
            raise ValueError("mode is 'slice' (Phase 1a) or 'full' (Phase 1b's code steps)")
        self.conn = conn
        self.data = data
        self.ai = ai
        # The other AI tool, for the skeptic, when both are connected (design item 48).
        self.checker = checker
        self.checker_failed: str | None = None
        self.checked_by: dict[str, str] = {}
        # The prediction log (item 35). Only live full-method runs log; offline runs on stored
        # data, replays and resumes never write to it, because its rows can't be removed.
        self.log_predictions = log_predictions and mode == "full"
        self.backup_dir = backup_dir
        self.prediction_id: str | None = None
        self.prediction_note = "No prediction is logged for this run."
        self.previous_rating: tuple[str, str] | None = None
        self.method = method
        # Companies with a new SEC number since a reorganization: new CIK → old CIKs.
        self.predecessors: dict[int, tuple[int, ...]] = {
            int(k): tuple(int(c) for c in (v or ()))
            for k, v in (method.aliases.get("predecessors") or {}).items()
        }
        self.older_submissions: list[tuple[int, dict[str, Any]]] = []
        self.mode = mode
        self.now = now or _now()
        self.today = self.now.astimezone(UTC).date()
        self.out_dir = out_dir
        self.progress = progress or (lambda step, state: None)
        # The run's live counts for the app (protocol Tally); each change sends the whole tally.
        self.tally: dict[str, Any] = {}
        self.on_tally = tally or (lambda tally: None)
        self.run_id = run_id or new_run_id(self.now)
        self.rawstore = rawstore
        self.sources = SLICE_SOURCES if mode == "slice" else FULL_SOURCES
        self.sections = SLICE_SECTIONS if mode == "slice" else FULL_SECTIONS
        self.empty_sections: set[SectionKey] = set()
        self.articles: list[tuple[Any, Any]] = []  # (Article, Link)
        # Links listed in section 7 without being downloaded, when article reading is off.
        self.unread_links: list[Any] = []
        # Whether step 9 read the article pages (the `news_articles` setting); None until its
        # link search has answered.
        self.reading_articles: bool | None = None
        self.article_urls: dict[str, str] = {}
        self.cuts: list[str] = []
        # The call budget's last cut (Technical Plan §3): no section rewrites.
        self.rewrites_cut = False
        self.trend_sources: list[tuple[str, str, str, tuple[SectionKey, ...]]] = []
        self.press_sources: list[tuple[str, str, str, tuple[SectionKey, ...]]] = []
        self.peer_docs: list[Doc] = []
        self.macro: dict[str, tuple[str, float, date]] = {}
        self.notes: list[str] = []
        self.store = PriceStore(conn)
        self.members: dict[int, MemberData] = {}
        self.ai_stopped: str | None = None
        self.stop_error: AIError | None = None
        self.cancel_requested = False
        # Quitting the app stops the run as interrupted, so it can be resumed (item 34).
        self.cancel_interrupted = False
        # AI calls under way (`_cancellable`), and those that cancel() stopped.
        self._in_flight: set[asyncio.Task] = set()
        self._stopped_calls: set[asyncio.Task] = set()
        self.dropped: list[str] = []
        # Step 9's link search, started right after step 1 (`_start_link_search`).
        self._link_search: asyncio.Task | None = None
        # Step 10's reads, started as each document arrives (`_read_early`), by
        # (document role, section key); their answers are taken in order in step 10.
        self._reads: dict[tuple[str, str], asyncio.Task] = {}
        self._read_slots: asyncio.Semaphore | None = None
        # The first usage limit or budget end an early read met: the reads queued behind it
        # never send anything, and step 10 reports it, as if the reads had run there.
        self._reads_stop: AIError | None = None
        # Each filing read's planned calls, counted when it started (the budget's projection).
        self._planned: dict[tuple[str, str], int] = {}
        # Documents parsed before step 4 (role → accession, paragraphs, "not available" notes).
        self._parsed: dict[str, tuple[str, dict[tuple[str, str], list[Paragraph]], list[str]]] = {}
        self._early_paragraphs: dict[tuple[str, str], list[Paragraph]] = {}
        self.docs_by_role: dict[str, Doc] = {}
        # A `_parallel` batch's notes and dropped lines, by position, tagged with their job.
        self._note_jobs: dict[int, int] = {}
        self._drop_jobs: dict[int, int] = {}
        # Wall-clock seconds per step (item 34's timings), from `_step` and `_mark`.
        self._step_seconds: dict[str, float] = {}
        self._current: tuple[str, float] | None = None
        self._started_at: float | None = None
        self.timings: dict[str, Any] | None = None

    # --- bookkeeping ------------------------------------------------------------------------

    def _start_record(self) -> None:
        with self.conn:
            self.conn.execute(
                "INSERT INTO runs (run_id, mode, ai_tool, started_at, status, engine_version, method_code_version, methodology_hash, reference_version)"
                " VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?)",
                (
                    self.run_id,
                    self.mode,
                    getattr(getattr(self.ai, "connector", None), "tool", None),
                    self.now.isoformat(),
                    ENGINE_VERSION,
                    METHOD_CODE_VERSION,
                    self.method.methodology_hash,
                    self.method.reference_version,
                ),
            )

    def _factor_order(self) -> dict[str, int]:
        # Fixed in code: a run's stored methodology copy keeps no key order.
        return {name: i for i, name in enumerate(FACTOR_ORDER)}

    def _record_render(self, sections, watch_lines) -> None:
        """Step 12's output for replay (item 38): the text code writes, sections 1-3, the red
        flags and the trigger prices. Whether a prediction was logged is left out, because a
        replay never logs one; so are the AI-written parts, because a replay makes no AI calls."""
        code = {
            s["key"]: {
                "title": s["title"],
                "paragraphs": [line for line in s["paragraphs"] if line != self.prediction_note],
                "table": s.get("table"),
            }
            for s in sections
            if s["key"] in ("rating", "score", "valuation")
        }
        output = {"code_sections": code, "risk_lines": self._risk_lines(), "triggers": watch_lines}
        with self.conn:
            self.conn.execute(
                "INSERT OR REPLACE INTO step_outputs (run_id, step, json) VALUES (?, ?, ?)",
                (self.run_id, "render", json.dumps(output, default=str)),
            )

    def _save_step(self, step: str, output: dict[str, Any]) -> None:
        with self.conn:
            self.conn.execute(
                "INSERT OR REPLACE INTO step_outputs (run_id, step, json) VALUES (?, ?, ?)",
                (self.run_id, step, json.dumps(output, default=str)),
            )
            self.conn.execute(
                "UPDATE runs SET last_step_done = ? WHERE run_id = ?", (step, self.run_id)
            )
        self.progress(step, "done")

    def _mark(self, name: str) -> None:
        """The step under way is now `name` (for the timings; no progress note)."""
        now = time.monotonic()
        if self._started_at is None:
            self._started_at = now
        if self._current is not None:
            step, began = self._current
            self._step_seconds[step] = self._step_seconds.get(step, 0.0) + now - began
        self._current = (name, now)

    def _timings(self) -> dict[str, Any]:
        """Seconds per step, and each AI task's calls and summed call seconds (calls run 5 at
        a time, so these can add up to more than the step's own time)."""
        self._mark("end")
        ai: dict[str, dict[str, float]] = {}
        for client in (self.ai, self.checker):
            for record in getattr(client, "calls", None) or []:
                entry = ai.setdefault(record.task, {"calls": 0, "seconds": 0.0})
                entry["calls"] += 1
                entry["seconds"] = round(entry["seconds"] + record.duration_s, 1)
        steps = {k: round(v, 1) for k, v in self._step_seconds.items() if k != "end"}
        total = time.monotonic() - (self._started_at or time.monotonic())
        return {"total_s": round(total, 1), "steps": steps, "ai": ai}

    def _finish(self, status: str, failed_step: str | None = None) -> None:
        self.timings = self._timings()
        calls = self.ai.sent if self.ai is not None else 0  # the checker shares this budget
        clients = [c for c in (self.ai, self.checker) if c is not None]
        model_ids = sorted({r.model_id for c in clients for r in c.calls if r.model_id})
        with self.conn:
            self.conn.execute(
                "UPDATE runs SET status = ?, ended_at = ?, failed_step = ?, ai_calls = ?, model_ids_json = ?, request_counts_json = ?, cuts_json = ?, cik = ? WHERE run_id = ?",
                (
                    status,
                    _now().isoformat(),
                    failed_step,
                    calls,
                    json.dumps(model_ids),
                    json.dumps(self.data.request_counts()),
                    json.dumps(self.cuts) if self.cuts else None,
                    self.cik,
                    self.run_id,
                ),
            )
            # Not through `_save_step`: the timings aren't a step to resume from, and replay
            # doesn't compare them (replay.COMPARED_STEPS).
            self.conn.execute(
                "INSERT OR REPLACE INTO step_outputs (run_id, step, json) VALUES (?, 'timings', ?)",
                (self.run_id, json.dumps(self.timings)),
            )

    def _step(self, name: str) -> None:
        if self.cancel_requested:
            raise RunCancelled(name)
        self._mark(name)
        self.progress(name, "started")

    def _tally(self, **changes: Any) -> None:
        """Some live counts changed: send the whole tally (lists copied, so a later change
        can't alter a note already sent)."""
        self.tally.update(changes)
        self.on_tally({k: list(v) if isinstance(v, list) else v for k, v in self.tally.items()})

    def _bump(self, key: str, by: int = 1) -> int:
        return self.tally.get(key, 0) + by

    @staticmethod
    def _tool_name(client: AIClient | None) -> str | None:
        return getattr(getattr(client, "connector", None), "display_name", None)

    def cancel(self, *, interrupted: bool = False) -> None:
        """Stop the run: AI calls under way are stopped now (their programs are ended), and
        the run ends at the next step. `interrupted` (the app is quitting) marks it interrupted
        rather than cancelled, so it can be resumed."""
        self.cancel_requested = True
        self.cancel_interrupted = self.cancel_interrupted or interrupted
        for task in list(self._in_flight):
            if not task.done():
                self._stopped_calls.add(task)
                task.cancel()

    async def _cancellable(self, label: str, awaitable):
        """Await an AI call so that cancel() can stop it: its stop comes out as RunCancelled."""
        task = asyncio.current_task()
        if task is None:
            return await awaitable
        self._in_flight.add(task)
        try:
            result = await awaitable
        except asyncio.CancelledError:
            if task in self._stopped_calls:
                self._stopped_calls.discard(task)
                task.uncancel()
                raise RunCancelled(label) from None
            raise
        finally:
            self._in_flight.discard(task)
        if task in self._stopped_calls:  # the call ended just as it was stopped
            self._stopped_calls.discard(task)
            task.uncancel()
            raise RunCancelled(label)
        return result

    # --- the run ----------------------------------------------------------------------------

    async def run(self, query: str, *, resume: bool = False) -> RunResult:
        self.cik: int | None = None
        if resume:
            with self.conn:
                self.conn.execute(
                    "UPDATE runs SET status = 'running', ended_at = NULL, failed_step = NULL WHERE run_id = ?",
                    (self.run_id,),
                )
        else:
            self._start_record()
        if self.rawstore is not None and not resume:
            # Copies of the methodology and reference files, for replay (item 15).
            self.method.store_copies(self.rawstore, self.run_id)
        step = "resolve"
        try:
            self._tally(
                typical=typical_seconds(self.conn),
                writer=self._tool_name(self.ai),
                checker=self._tool_name(self.checker),
                parallel=config.AI_CALLS_IN_PARALLEL,
            )
            step = "resolve"
            self._step(step)
            resolved, group = await self.resolve(query)
            self._save_step(
                step,
                {
                    "cik": resolved.cik,
                    "ticker": resolved.rated_ticker,
                    "peers": group.peers,
                    "holdings_source": self.holdings.source,
                    "holdings_as_of": self.holdings.as_of,
                },
            )
            self._start_link_search(resolved)
            step = "fetch"
            self._step(step)
            docs = await self.fetch(resolved, group)
            self.docs_used = docs
            group = self.group
            self._save_step(
                step, {"documents": [d.accession for d in docs], "left_out": group.left_out}
            )
            step = "normalize"
            self._step(step)
            self._save_step(
                step,
                {
                    "period_ends": {
                        cik: str(m.fin.latest_period_end())
                        for cik, m in self.members.items()
                        if m.fin
                    }
                },
            )
            step = "text"
            self._step(step)
            paragraphs = self.text_layer(docs)
            self.flags = self.red_flags(paragraphs) if self.mode == "full" else []
            self._save_step(
                step,
                {
                    "paragraphs": sum(len(v) for v in paragraphs.values()),
                    "red_flags": [f.key for f in self.flags],
                },
            )
            step = "metrics"
            self._step(step)
            self.compute_metrics()
            self._save_step(
                step, {"company": {n: m.value for n, m in self.members[self.cik].metrics.items()}}
            )
            step = "score"
            self._step(step)
            score = self.score()
            self._tally(score=score.composite.get(self.cik))
            self._save_step(
                step, {"composite": score.composite.get(self.cik), "scaling": score.scaling.note}
            )
            step = "value"
            self._step(step)
            rf = await self.value()
            self._save_step(
                step,
                {
                    "risk_free": rf,
                    "value": self.members[self.cik].valuation.value
                    if self.members[self.cik].valuation
                    else None,
                },
            )
            step = "rate"
            self._step(step)
            rating, rng, level, mix = self.rate(score)
            self.rated = (rating, rng)
            self._tally(rating=rating.rating)
            self._log_prediction(resolved, docs, score, rating, rng, level)
            self._save_step(
                step,
                {
                    "rating": rating.rating,
                    "uncertainty": level,
                    "gap_percentile": rating.gap_percentile,
                },
            )
            self._save_valuation_inputs(rng)
            step = "news"
            self._step(step)
            news_paragraphs = await self.news(resolved, paragraphs)
            paragraphs.update(news_paragraphs)
            if self.press_sources:
                self.empty_sections.discard(SectionKey.NEWS)
            self._save_step(
                step,
                {"articles": len(self.articles)}
                if self.mode == "full"
                else {"skipped": "the thin slice reads no news"},
            )
            step = "extract"
            self._step(step)
            evidence = await self.extract(paragraphs)
            self.evidence = evidence
            self._save_step(
                step,
                {"items": {k.value: len(v) for k, v in evidence.items()}, "dropped": self.dropped},
            )
            step = "narrate"
            self._step(step)
            placeholders = self.placeholders(rng, rating)
            drafts = await self.narrate(evidence, paragraphs, placeholders, resolved)
            self._save_step(step, {"sections": [d.section.value for d in drafts.values()]})
            step = "render"
            self._step(step)
            step = "verify"
            self._step(step)
            claims, removed, split = await self.verify(drafts, paragraphs, resolved)
            self._save_step(
                step, {"kept": sum(len(v) for v in claims.values()), "removed": len(removed)}
            )
            step = "save"
            self._step(step)
            report_id, html_path = self.save(
                resolved,
                group,
                score,
                rating,
                rng,
                level,
                mix,
                claims,
                removed,
                split,
                drafts,
                docs,
                paragraphs,
            )
            self._save_step(
                step, {"report_id": report_id, "html": str(html_path) if html_path else None}
            )
            complete = self.ai_stopped is None and all(
                s in drafts and not drafts[s].failed
                for s in self.sections
                if s not in self.empty_sections
            )
            status = "done" if complete else ("stopped" if self.ai_stopped else "done_incomplete")
            self._finish(status)
            return RunResult(
                self.run_id,
                report_id,
                status,
                html_path,
                rating.rating,
                self.notes,
                self.prediction_note,
                self.timings,
            )
        except RunCancelled:
            self._finish("interrupted" if self.cancel_interrupted else "cancelled")
            raise
        except RunFailed as exc:
            self._finish("failed", exc.step)
            raise
        except Exception:
            self._finish("failed", step)
            raise
        finally:
            self._stop_link_search()
            self._stop_reads()

    # --- steps 1-2 --------------------------------------------------------------------------

    async def resolve(self, query: str) -> tuple[Resolved, PeerGroup]:
        tickers = await self.data.sec_tickers()
        refreshed = await self.data.holdings(tickers, today=self.today)
        if refreshed.note:
            self.notes.append(refreshed.note)
        self.holdings = refreshed.holdings
        aliases = {
            str(k).lower(): int(v) for k, v in (self.method.aliases.get("aliases") or {}).items()
        }
        found = resolve(
            query,
            tickers,
            self.holdings,
            aliases=aliases,
            member_ciks=[c.cik for c in self.holdings.companies()],
        )
        self.cik = found.cik
        subs = await self.data.submissions(found.cik)
        sic = int(subs["sic"]) if str(subs.get("sic") or "").isdigit() else None
        self.company_class = financial_class(sic, found.cik, self.method.peers)
        self.company_name = subs.get("name") or found.name
        self.company_submissions = subs
        self.older_submissions = [
            (old, await self.data.submissions(old)) for old in self.predecessors.get(found.cik, ())
        ]
        self.group = build_peer_group(
            self.holdings,
            found.cik,
            cap=int(self.method.peers["peer_cap"]),
            trend=int(self.method.peers["trend_peers"]),
        )
        with self.conn:
            # Every member's ticker, so grading can still fetch a peer that later leaves the index.
            self.conn.executemany(
                "INSERT OR IGNORE INTO tickers (ticker, cik, share_class, conversion_ratio, date_from) VALUES (?, ?, '', 1, ?)",
                [(r.ticker, r.cik, self.holdings.as_of.isoformat()) for r in self.holdings.rows],
            )
            self.conn.execute(
                "INSERT OR REPLACE INTO companies (cik, name, sic, sector, financial_class) VALUES (?, ?, ?, ?, ?)",
                (found.cik, self.company_name, sic, self.group.sector, self.company_class),
            )
        return found, self.group

    async def fetch(self, resolved: Resolved, group: PeerGroup) -> list[Doc]:
        members = {cik: self.holdings.tickers_of(cik)[0] for cik in group.members}
        # The company's own filings come first, so step 10 can start reading them while the
        # prices, the peers' facts and filings, FRED and the Form 4s download.
        self._tally(companies=len(members), fetching="filings")
        older = self.predecessors.get(self.cik, ())
        all_docs = await self.data.filing_documents(
            self.cik, today=self.today, **({"predecessors": older} if older else {})
        )
        docs = all_docs
        if self.mode == "slice":
            docs = [d for d in docs if d.role in ("10-K", "10-Q", "10-K prior")]
        self._tally(filings=len(docs))
        if self.mode == "full":
            for doc in docs:
                if doc.role.startswith("press "):
                    self.press_sources.append(
                        (
                            doc.role,
                            "Exhibit 99.1",
                            f"a company press release ({doc.filed:%-d %b %Y})",
                            (SectionKey.NEWS,),
                        )
                    )
        self._read_early(docs)
        self._tally(fetching="prices")
        # Top up to the latest session whose close is out, not the UTC date: in New York's
        # evening the UTC date is already tomorrow, and Massive refuses a day that hasn't closed.
        self.price_date = last_completed_session(self.now)
        await self.data.fill_prices(self.store, members, end=self.price_date)
        self._tally(prices=True, fetching="facts", facts=0)
        stale_company = self.store.is_stale(self.cik, "", self.now)
        stale_spy = self.store.is_stale(SPY_CIK, "", self.now)
        self.withheld = stale_company or stale_spy
        if self.withheld:
            self.notes.append(
                "Prices for the company or SPY are missing or stale, so sections 1-3 and the trigger prices are withheld."
            )
        for cik in list(group.peers):
            if self.store.is_stale(cik, "", self.now):
                group = group.leave_out(cik, "missing or stale prices")
        financial_sector = group.sector in ("Financials", "Real Estate")
        for done, cik in enumerate(group.members):
            if done:
                self._tally(facts=done)
            member = MemberData(cik, members[cik])
            try:
                facts = await self.data.company_facts(cik)
            except (LookupError, Exception) as exc:  # noqa: BLE001 - a peer without facts is left out
                if cik == self.cik:
                    raise RunFailed(
                        "fetch", f"no SEC company facts for the company ({exc})"
                    ) from exc
                group = group.leave_out(cik, "no SEC company facts")
                continue
            facts = await self._with_predecessors(cik, facts)
            facts = await self._with_newer_report(cik, facts)
            member.fin = Financials(
                facts,
                as_of=self.today,
                split_factor=lambda after, up_to, c=cik: self.store.split_factor(
                    c, after=after, up_to=up_to
                ),
            )
            member.price = self.store.latest_close(cik, up_to=self.price_date)
            await self._cover_shares(member)
            if cik == self.cik:
                member.financial_class = self.company_class
            elif financial_sector:
                subs = await self.data.submissions(cik)
                sic = int(subs["sic"]) if str(subs.get("sic") or "").isdigit() else None
                member.financial_class = financial_class(sic, cik, self.method.peers)
            self.members[cik] = member
        self.group = group
        self._tally(facts=len(members))
        self._successor_note(all_docs)  # here, so the notes keep their order
        if self.mode == "full":
            peer_documents = getattr(self.data, "peer_documents", None)
            if peer_documents is not None and group.trend_peers:
                linked = {
                    c: self.predecessors[c] for c in group.trend_peers if c in self.predecessors
                }
                self._tally(fetching="peer filings")
                self.peer_docs = await peer_documents(
                    group.trend_peers,
                    today=self.today,
                    **({"predecessors": linked} if linked else {}),
                )
                self._tally(filings=len(docs) + len(self.peer_docs))
                for doc in self.peer_docs:
                    cik = int(doc.role.split()[1])
                    name = self.holdings.name_of(cik) if self.holdings.has(cik) else str(cik)
                    self.trend_sources.append(
                        (
                            doc.role,
                            "Item 7",
                            f"{name}'s 10-K Item 7 (a peer's MD&A)",
                            (SectionKey.TRENDS,),
                        )
                    )
                self._read_early(self.peer_docs)
            if not self.peer_docs:
                self.empty_sections.add(SectionKey.TRENDS)
                self.notes.append("The trends section has no peer filings with these inputs.")
            macro = getattr(self.data, "macro", None)
            # Rates (section 8) and insider trades are extras: when FRED or a Form 4 doesn't
            # answer, the report goes on without them and says so, rather than failing.
            if macro is not None:
                self._tally(fetching="rates")
                try:
                    self.macro = await macro(self.today)
                except HTTPFailure as exc:
                    if isinstance(exc, SECBlocked):
                        raise
                    log.warning("rates for section 8 not fetched: %s", exc)
                    self.notes.append(
                        "FRED didn't answer, so the economic figures in section 8 are left out."
                    )
                self._tally(rates=True)
            trades = getattr(self.data, "form4_trades", None)
            self.insider_note = None
            self.insider_checked = False
            if trades:
                self._tally(fetching="insider trades")
                try:
                    found = list(await trades(self.cik, today=self.today))
                except HTTPFailure as exc:
                    if isinstance(exc, SECBlocked):
                        raise
                    log.warning("insider trades not fetched: %s", exc)
                    self.notes.append(
                        "SEC's insider trade filings (Form 4) couldn't be read, so insider "
                        "buying isn't checked in this report."
                    )
                else:
                    self._tally(insider=len(found))
                    self.insider_note = insider_buying_note(found, self.today)
                    self.insider_checked = True
        self._tally(fetching=None)
        return docs + self.peer_docs

    async def _with_predecessors(self, cik: int, facts: dict[str, Any]) -> dict[str, Any]:
        """A successor company's facts with its predecessor's added (aliases.yaml)."""
        for old in self.predecessors.get(cik, ()):
            try:
                facts = sec_data.merge_company_facts(facts, await self.data.company_facts(old))
            except Exception:  # noqa: BLE001 - the successor's own facts are still used
                if cik == self.cik:
                    self.notes.append(
                        f"The facts of the predecessor company (CIK {old}) couldn't be read, so "
                        "only the reports filed under the company's new SEC number were used."
                    )
                continue
            if cik == self.cik:
                self.notes.append(
                    f"{self.company_name} took over from a predecessor company with a different "
                    f"SEC number (CIK {old}); that company's reports are read as well."
                )
        return facts

    async def _with_newer_report(self, cik: int, facts: dict[str, Any]) -> dict[str, Any]:
        """Facts that stop before the member's newest 10-Q or 10-K, with that filing's own
        inline XBRL added: SEC's company-facts file can lag a filing by months. A peer's filing
        list is read only when its facts look old."""
        reader = getattr(self.data, "report_facts", None)
        if reader is None:
            return facts
        newest = newest_period(facts, as_of=self.today)
        if (
            cik != self.cik
            and newest is not None
            and (self.today - newest).days <= FACTS_AGE_CHECK_DAYS
        ):
            return facts
        if cik == self.cik:
            filings = self._company_filings()
        else:
            try:
                subs = await self.data.submissions(cik)
            except Exception:  # noqa: BLE001 - the facts are used as they are
                return facts
            filings = sec_data.filings_from(subs.get("filings", {}).get("recent", {}), cik)
        newer = [
            f
            for f in filings
            if f.form in ("10-Q", "10-K")
            and f.primary_document
            and f.report_date is not None
            and f.filed <= self.today
            and (newest is None or f.report_date > newest + timedelta(days=FACTS_LAG_DAYS))
        ]
        if not newer:
            return facts
        filing = max(newer, key=lambda f: (f.filed, f.accession))
        try:
            extra = await reader(filing)
        except Exception:  # noqa: BLE001 - reported below for the company
            extra = {}
        found = any((extra.get("facts") or {}).get("us-gaap", {}).values())
        if cik == self.cik:
            period = f"{filing.report_date:%-d %b %Y}"
            stop = (
                f"SEC's company facts for {self.company_name} stop at the period ended "
                f"{newest:%-d %b %Y}"
                if newest
                else f"SEC's company facts for {self.company_name} have no reported period"
            )
            if found:
                self.notes.append(
                    f"{stop}, so the figures of its {filing.form} for the period ended {period} "
                    "were read from that filing directly."
                )
            else:
                self.notes.append(
                    f"{stop}, and the figures of its {filing.form} for the period ended {period} "
                    "couldn't be read from the filing, so the numbers are as of the older period."
                )
        return sec_data.merge_company_facts(facts, extra) if found else facts

    def _company_filings(self) -> list[sec_data.Filing]:
        """The company's filing list, with any predecessor's."""
        filings = sec_data.filings_from(
            self.company_submissions.get("filings", {}).get("recent", {}), self.cik
        )
        for old, subs in self.older_submissions:
            filings += sec_data.filings_from(subs.get("filings", {}).get("recent", {}), old)
        return filings

    def _successor_note(self, docs: list[Doc]) -> None:
        """A company with a new SEC number that isn't in the predecessors list yet."""
        if any(d.role == "10-K" for d in docs) or self.cik in self.predecessors:
            return
        if any(f.form == sec_data.SUCCESSION_FORM for f in self._company_filings()):
            self.notes.append(
                f"{self.company_name} filed an {sec_data.SUCCESSION_FORM}, so it took over from "
                "a predecessor company with a different SEC number, whose annual report wasn't "
                "read. Add the old number under `predecessors` in aliases.yaml."
            )

    # --- step 4 -----------------------------------------------------------------------------

    def _parse(self, doc: Doc) -> tuple[dict[tuple[str, str], list[Paragraph]], list[str]]:
        """One document's sections as paragraphs, and its "not available" notes; no writes.
        A document parsed early for step 10 (`_read_early`) is parsed once."""
        early = self._parsed.get(doc.role)
        if early is not None and early[0] == doc.accession:
            return early[1], early[2]
        phrases = self.method.instruction_phrases.get("patterns", [])
        out: dict[tuple[str, str], list[Paragraph]] = {}
        notes: list[str] = []
        sections = filing_sections(doc.body, doc.form, exhibit_13=doc.exhibit_13)
        for key, section in sections.items():
            if doc.role.startswith("peer ") and key != "Item 7":
                continue
            if not section.available:
                notes.append(f"{doc.form} {key} is not available in the filing.")
                continue
            out[(doc.role, key)] = split_paragraphs(doc.accession, key, section.text, phrases)
        self._parsed[doc.role] = (doc.accession, out, notes)
        return out, notes

    def text_layer(self, docs: list[Doc]) -> dict[tuple[str, str], list[Paragraph]]:
        out: dict[tuple[str, str], list[Paragraph]] = {}
        self.docs_by_role = {d.role: d for d in docs}
        for doc in docs:
            parsed, notes = self._parse(doc)
            self.notes += notes
            for (role, key), paras in parsed.items():
                out[(role, key)] = paras
                with self.conn:
                    self.conn.executemany(
                        "INSERT OR IGNORE INTO paragraphs (id, source_id, section, ordinal, text, parser_version, marked) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        [
                            (
                                p.id,
                                p.source_id,
                                p.section,
                                p.ordinal,
                                p.text,
                                int(p.id.rsplit("@", 1)[1]),
                                int(p.marked),
                            )
                            for p in paras
                        ],
                    )
        return out

    async def _cover_shares(self, member: MemberData) -> None:
        """Per-class cover-page counts, when the company-facts file has no usable count. Each
        class is converted to the member's own ticker's units with the conversion ratios
        (1 BRK.A = 1,500 BRK.B) and split-adjusted to the price date."""
        fin, cover = member.fin, getattr(self.data, "cover_share_counts", None)
        if fin is None or cover is None or fin.latest("shares_outstanding") is not None:
            return
        try:
            counts, accession = await cover(member.cik, today=self.today)
        except Exception:  # noqa: BLE001 - without a count the member gets no market value
            return
        if not counts:
            return

        def ratio(ticker: str | None) -> float:
            return CONVERSION_RATIOS.get(canonical_ticker(ticker), 1.0) if ticker else 1.0

        own = ratio(member.ticker)
        total = 0.0
        for c in counts:
            factor = (
                self.store.split_factor(member.cik, after=c.as_of, up_to=self.price_date)
                if c.as_of
                else 1.0
            )
            total += c.shares * factor * ratio(c.ticker) / own
        member.cover_shares = total
        classes = ", ".join(f"{c.ticker or 'unlisted'} {c.shares:,.0f}" for c in counts)
        if member.cik == self.cik:
            self.notes.append(
                f"Shares outstanding come from the cover page of filing {accession} ({classes}), "
                f"in {member.ticker} units, because SEC's company facts report them only by class."
            )

    # --- steps 5-8 --------------------------------------------------------------------------

    def compute_metrics(self) -> None:
        for cik, m in self.members.items():
            if m.fin is None or m.price is None:
                continue
            price = m.price[1]
            # Shares outstanding: the company-facts count, else the cover page's per-class
            # count, else the latest diluted average.
            outstanding = m.fin.shares("shares_outstanding", price_date=self.price_date)
            diluted = m.fin.shares("diluted_shares", price_date=self.price_date)
            count = (
                outstanding.value
                if outstanding
                else m.cover_shares or (diluted.value if diluted else None)
            )
            market_value = price * count if count else None
            inputs = inputs_from(
                m.fin,
                cik=cik,
                price=price,
                price_date=self.price_date,
                market_value=market_value,
                momentum=momentum(self.store, cik, self.price_date),
            )
            m.metrics = compute_metrics(inputs, financial_class=m.financial_class)
            m.volatility = volatility(self.store.log_returns(cik, up_to=self.price_date))
            m.total_return_12m = twelve_month_return(self.store, cik, self.price_date)
            m.dividend_yield = dividend_yield(self.store, cik, self.price_date, price)
            m.inputs = inputs  # type: ignore[attr-defined]
            if cik == self.cik:
                self.notes += [n for n in m.fin.corrections if n not in self.notes]
            with self.conn:
                self.conn.executemany(
                    "INSERT OR REPLACE INTO metrics (run_id, cik, name, value, inputs_json) VALUES (?, ?, ?, ?, ?)",
                    [
                        (
                            self.run_id,
                            cik,
                            n,
                            None if v.value is None or math.isinf(v.value) else v.value,
                            json.dumps(v.inputs, default=str),
                        )
                        for n, v in m.metrics.items()
                    ],
                )
        with self.conn:
            self.conn.executemany(
                "INSERT OR REPLACE INTO peer_groups (run_id, cik, peer_cik, weight) VALUES (?, ?, ?, ?)",
                [(self.run_id, self.cik, p, self.group.weight) for p in self.group.peers],
            )

    def score(self) -> ScoreResult:
        spy_returns = self.store.log_returns(SPY_CIK, up_to=self.price_date)
        spy_year = twelve_month_return(self.store, SPY_CIK, self.price_date)
        scaling = momentum_scaling(
            spy_returns, spy_12m_return=spy_year, rules=self.method.weights["momentum_scaling"]
        )
        scored = {cik: m.metrics for cik, m in self.members.items() if m.metrics}
        financial = {
            cik for cik, m in self.members.items() if m.financial_class in ("bank", "insurer")
        }
        self.score_result = score_group(
            scored,
            self.method.weights,
            metric_set=SLICE_METRICS if self.mode == "slice" else None,
            scaling=scaling,
            financial_members=financial,
        )
        self.spy_return = spy_year
        return self.score_result

    def _valuation_inputs(self, m: MemberData) -> ValuationInputs | None:
        if m.fin is None or m.price is None or not hasattr(m, "inputs"):
            return None
        c = m.inputs  # type: ignore[attr-defined]
        fin = m.fin
        found = fin.shares("diluted_shares", price_date=self.price_date) or fin.shares(
            "shares_outstanding", price_date=self.price_date
        )
        shares = found.value if found else m.cover_shares
        if shares is None or c.market_value is None:
            return None
        ocf, capex = (
            fin.annual("operating_cash_flow"),
            {v.end: v.value for v in fin.annual("capital_spending")},
        )
        recent = [v.value - capex.get(v.end, 0.0) for v in ocf[-3:]]
        fcf = (
            None
            if c.operating_cash_flow is None
            else c.operating_cash_flow - (c.capital_spending or 0.0)
        )
        lease_cost = fin.ttm("operating_lease_cost")
        return ValuationInputs(
            cik=m.cik,
            price=m.price[1],
            shares=shares,
            market_value=c.market_value,
            revenue=c.revenue,
            ebit=c.ebit,
            operating_lease_cost=lease_cost.value if lease_cost else None,
            tax_rate=tax_rate(c.income_tax, c.pretax_income),
            revenue_growth_3y=fin.growth(
                "revenue", years=int(self.method.valuation["dcf"]["history_years"])
            ),
            interest_expense=c.interest_expense,
            total_debt=c.total_debt,
            total_debt_year_ago=c.total_debt_year_ago,
            lease_liabilities=c.lease_liabilities,
            minority_interest=c.minority_interest,
            preferred_stock=c.preferred_stock,
            cash=c.cash,
            volatility=m.volatility,
            free_cash_flow=fcf,
            free_cash_flow_3y_average=sum(recent) / len(recent) if recent else None,
            dividend_yield=m.dividend_yield,
            invested_capital=c.invested_capital(),
            common_equity=c.common_equity,
            return_on_equity=m.metrics["return_on_equity"].value
            if "return_on_equity" in m.metrics
            else None,
            payout=_payout(fin),
            diluted_eps=c.diluted_eps,
        )

    async def value(self) -> float | None:
        rf = await self.data.risk_free(self.today)
        self.risk_free = rf[1] if rf else None
        if rf is None:
            self.notes.append(
                "No 10-year Treasury yield was available, so no valuation could be made."
            )
        for m in self.members.values():
            m.valuation_inputs = self._valuation_inputs(m)
        inputs = [m.valuation_inputs for m in self.members.values() if m.valuation_inputs]
        settings = self.method.valuation
        growth = [i.revenue_growth_3y for i in inputs if i.revenue_growth_3y is not None]
        margins = [i.start_margin for i in inputs if i.start_margin is not None]
        stc = [i.sales_to_capital for i in inputs if i.sales_to_capital]
        vols = [m.volatility for m in self.members.values() if m.volatility is not None]
        self.stats = GroupStats(
            growth_p90=percentile_value(growth, float(settings["dcf"]["growth_cap_percentile"])),
            median_margin=median(margins),
            median_sales_to_capital=median(stc),
            median_volatility=median(vols),
            median_return_on_equity=median(
                [i.return_on_equity for i in inputs if i.return_on_equity is not None]
            ),
        )
        all_inputs = inputs
        self.ffo_per_share = {}
        if self.mode == "full":
            tags = settings["ffo_tags"]
            for cik, m in self.members.items():
                if m.financial_class != "reit" or m.valuation_inputs is None or m.fin is None:
                    continue
                income = m.fin.ttm("net_income")
                dep = m.fin.ttm_tags(tuple(tags["depreciation"]))
                gains = m.fin.ttm_tags(tuple(tags["gains"]))
                total = ffo(
                    income.value if income else None,
                    dep.value if dep else None,
                    gains.value if gains else None,
                )
                self.ffo_per_share[cik] = (
                    total / m.valuation_inputs.shares
                    if total is not None and m.valuation_inputs.shares
                    else None
                )
        for m in self.members.values():
            if m.valuation_inputs is None or self.risk_free is None:
                m.valuation = combine(
                    [MethodValue("dcf", None, "missing inputs")], settings, terminal_share=None
                )
                continue
            if m.financial_class in ("bank", "insurer"):
                method = MethodValue(
                    "dcf",
                    None,
                    "not meaningful for banks and insurers (debt is part of their operations)",
                )
            elif m.financial_class == "reit" and self.mode == "full":
                method = MethodValue(
                    "dcf", None, "not meaningful for REITs (valued on funds from operations)"
                )
            else:
                method = dcf(
                    m.valuation_inputs, self.stats, risk_free=self.risk_free, settings=settings
                )
            methods = [method]
            if self.mode == "full":
                methods = self._full_methods(m, method, all_inputs, settings)
            dcf_share = method.details.get("terminal_share") if method.valid else None
            m.valuation = combine(methods, settings, terminal_share=dcf_share)
        return self.risk_free

    def _save_valuation_inputs(self, rng: Range | None) -> None:
        """Each method's assumptions and the range inputs for the rated company, for the
        Excel download (`valuation.saved`; replay leaves this row out)."""
        company = self.members[self.cik]
        saved_valuation.save(
            self.conn,
            self.run_id,
            saved_valuation.record(
                cik=self.cik,
                financial_class=company.financial_class,
                risk_free=self.risk_free,
                inputs=company.valuation_inputs,
                stats=self.stats,
                valuation=company.valuation,
                range_inputs=self.range_inputs,
                rng=rng,
                settings=self.method.valuation,
                lines=self.method.rating_lines,
            ),
        )

    def _full_methods(
        self, m: MemberData, dcf_value: MethodValue, all_inputs, settings
    ) -> list[MethodValue]:
        """All three methods (item 27), by the company's financial class."""
        coe = cost_of_equity(m.volatility, settings)
        ri = residual_income(m.valuation_inputs, self.stats, cost_of_equity=coe, settings=settings)
        group = [i for i in all_inputs if i.cik != m.cik]
        if m.financial_class in ("bank", "insurer"):
            return [
                dcf_value,
                ri,
                multiples(m.valuation_inputs, group, settings=settings, pe_only=True),
            ]
        if m.financial_class == "reit":
            reit_peers = [
                (self.members[c].price[1], value)
                for c, value in self.ffo_per_share.items()
                if c != m.cik and value and self.members[c].price
            ]
            p_ffo = price_to_ffo(
                ffo_per_share=self.ffo_per_share.get(m.cik),
                reit_peers=reit_peers,
                settings=settings,
            )
            return [dcf_value, ri, p_ffo]
        return [dcf_value, ri, multiples(m.valuation_inputs, group, settings=settings)]

    def red_flags(self, paragraphs) -> list:
        """The four code rules (item 25), from this run's filings."""

        def text(role: str, key: str) -> str:
            return "\n".join(p.text for p in paragraphs.get((role, key), []))

        filings = self._company_filings()
        eight_ks = [(f.form, f.filed, f.items) for f in filings if f.form.startswith("8-K")]
        this_year = [p.text for p in paragraphs.get(("10-K", "Item 1A"), [])]
        last_year = [p.text for p in paragraphs.get(("10-K prior", "Item 1A"), [])]
        lines = self.method.rating_lines
        change = None
        if this_year and last_year:
            change = change_score(
                this_year, last_year, cutoff=float(lines["paragraph_match_cutoff"])
            ).score
        else:
            self.notes.append(
                "Last year's Item 1A wasn't available, so the risk-factor change wasn't checked."
            )
        self.risk_change = change
        return red_flags(
            eight_ks=eight_ks,
            item_9a=text("10-K", "Item 9A"),
            auditor=text("10-K", "auditor's report"),
            risk_change=change,
            threshold=float(lines["risk_factor_change_threshold"]),
            run_date=self.today,
        )

    def _uncertainty(self, m: MemberData) -> str | None:
        if m.volatility is None or m.valuation is None:
            return None
        triggers = list(m.valuation.triggers)
        v = m.valuation_inputs
        if (
            v
            and v.free_cash_flow is not None
            and v.free_cash_flow < 0
            and (v.free_cash_flow_3y_average or 0) < 0
        ):
            triggers.append("negative_free_cash_flow")
        return uncertainty_level(m.volatility, triggers, self.method.rating_lines)

    def _log_prediction(self, resolved, docs, score, rating, rng, level) -> None:
        """Write the official prediction at the end of step 8 (item 35, Technical Plan §10).

        Its ID is kept off the step outputs, so a replay still compares them exactly."""
        from tearsheet import predictions

        self.previous_rating = predictions.previous_official(self.conn, self.cik, self.now)
        own = self.conn.execute(
            "SELECT prediction_id FROM predictions WHERE run_id = ?", (self.run_id,)
        ).fetchone()
        if own is not None:
            # A resumed run whose prediction was logged before it stopped: the report says so,
            # rather than that resumes never log one.
            self.prediction_id = own[0]
            self.prediction_note = (
                f"Logged as an official prediction ({own[0]}). It is graded at 3, 6 "
                "and 12 months against this report's peer group, and can't be changed."
            )
            return
        if self.mode != "full":
            self.prediction_note = "No prediction is logged: thin-slice reports never log one."
            return
        if not self.log_predictions:
            self.prediction_note = (
                "No prediction is logged: only live full-method runs log one "
                "(not offline runs on stored data, replays or resumes)."
            )
            return
        if rating.rating is None or self.withheld:
            # Stale or missing prices withhold the rating as shown (sections 1-3), even though
            # the rating code still returns a placeholder; neither uses up the slot.
            self.prediction_note = "No prediction is logged: the rating is withheld."
            return
        if not predictions.slot_open(self.conn, self.cik, self.now):
            last = self.previous_rating[1][:10] if self.previous_rating else "recently"
            self.prediction_note = (
                f"No prediction is logged: this company's official prediction was made on {last}, "
                "and only the first rated run in 30 days is official."
            )
            return
        accepted = self._acceptance_times(docs)
        tool = getattr(getattr(self.ai, "connector", None), "tool", None) or "none"
        row = predictions.Prediction(
            run_id=self.run_id,
            cik=self.cik,
            ticker=resolved.rated_ticker,
            share_class=self._share_class(resolved.rated_ticker),
            run_at=self.now,
            score=float(score.composite.get(self.cik, 50.0)),
            rating=rating.rating,
            probability=rating.probability if rng else None,
            bear=rng.bear if rng else None,
            base=rng.base if rng else None,
            bull=rng.bull if rng else None,
            uncertainty=level or "very_high",
            percentile_lines=dict(rating.lines),
            accessions=[d.accession for d in docs],
            latest_acceptance_at=max(accepted) if accepted else self.now,
            methodology_hash=self.method.methodology_hash,
            method_code_version=METHOD_CODE_VERSION,
            engine_version=ENGINE_VERSION,
            ai_tool=tool,
            model_ids=self._model_ids(tool),
            inputs_hash=self._inputs_hash(),
        )
        backup_dir = self.backup_dir or Path(config.DEFAULT_BACKUP_DIR).expanduser()
        self.prediction_id = predictions.log_if_official(self.conn, row, backup_dir=backup_dir)
        if self.prediction_id:
            self.prediction_note = (
                f"Logged as an official prediction ({self.prediction_id}). It is graded at 3, 6 "
                "and 12 months against this report's peer group, and can't be changed."
            )

    def _acceptance_times(self, docs) -> list[datetime]:
        """When SEC accepted each filing this run used, from the company's filing list."""
        filings = self._company_filings()
        by_accession = {f.accession: f.accepted for f in filings}
        times = []
        for d in docs:
            text = by_accession.get(d.accession)
            try:
                stamp = datetime.fromisoformat(text) if text else None
            except ValueError:
                stamp = None
            if stamp is not None:
                times.append(stamp if stamp.tzinfo else stamp.replace(tzinfo=UTC))
        return times

    def _share_class(self, ticker: str) -> str:
        row = self.conn.execute(
            "SELECT share_class FROM tickers WHERE ticker = ? ORDER BY date_from DESC LIMIT 1",
            (ticker,),
        ).fetchone()
        return row[0] if row and row[0] else ""

    def _model_ids(self, tool: str) -> list[str]:
        """The models this tool ran at its last lock-down check; the run's own calls come
        after step 8, so they aren't known yet."""
        row = self.conn.execute(
            "SELECT model_ids_json FROM tool_versions WHERE tool = ?", (tool,)
        ).fetchone()
        return sorted(json.loads(row[0])) if row and row[0] else []

    def _inputs_hash(self) -> str:
        """A hash of the run's input list so far: every stored response, by request."""
        rows = self.conn.execute(
            "SELECT request_key, raw_hash FROM fetch_log WHERE run_id = ? ORDER BY request_key, raw_hash",
            (self.run_id,),
        ).fetchall()
        return hashlib.sha256(json.dumps([list(r) for r in rows]).encode()).hexdigest()

    def rate(self, score: ScoreResult) -> tuple[Rating, Range | None, str | None, dict[str, int]]:
        lines = self.method.rating_lines
        company = self.members[self.cik]
        years = float(lines["range"]["value_gap_years"])
        gaps = {
            cik: value_gap(price=m.price[1], value=m.valuation.value, years=years)
            for cik, m in self.members.items()
            if m.valuation and m.valuation.valid and m.price
        }
        level = self._uncertainty(company) or "very_high"
        rng = None
        self.range_inputs: RangeInputs | None = None
        if company.valuation and company.valuation.valid and company.price:
            self.range_inputs = RangeInputs(
                company.price[1],
                company.valuation.value,
                cost_of_equity(company.volatility, self.method.valuation),
                company.dividend_yield,
                company.volatility or 0.3,
                self.stats.median_volatility,
            )
            rng = twelve_month_range(self.range_inputs, lines)
        peer_gaps = [PeerGap(cik, g) for cik, g in gaps.items() if cik != self.cik]
        rating = rate(
            RatingInputs(
                price=company.price[1] if company.price else 0.0,
                value=company.valuation.value if company.valuation else None,
                score=score.composite.get(self.cik, 50.0),
                uncertainty=level,
                peer_gaps=peer_gaps,
                red_flags=[f.key for f in self.flags],
                volatility=company.volatility or 0.3,
            ),
            lines,
        )
        self.rating_summary = (
            f"rating {rating.rating or 'withheld'}; score at the {score.composite.get(self.cik, 0):.0f}th percentile of its peers; "
            + (
                f"12-month range {format_value('price', rng.bear)} to {format_value('price', rng.bull)}, base {format_value('price', rng.base)}"
                if rng
                else "no valid valuation, so no range"
            )
        )
        if rating.withheld:
            self.notes.append(f"The rating is withheld: {rating.withheld}.")
        levels = {cik: self._uncertainty(m) for cik, m in self.members.items()}
        mix = peer_mix(gaps, score.composite, {c: lv for c, lv in levels.items() if lv}, lines)
        unvalued = [cik for cik in self.group.peers if cik not in gaps]
        for cik in unvalued:
            self.group.left_out.setdefault(
                cik, "no valid valuation (left out of the peer value gaps only)"
            )
        return rating, rng, level, mix

    # --- steps 10-13 ------------------------------------------------------------------------

    async def _ai_call(self, label: str, coro):
        if self.cancel_requested:
            coro.close()
            raise RunCancelled(label)
        if self.ai is None or self.ai_stopped:
            coro.close()  # never started, so nothing to clean up
            return None
        try:
            return await self._cancellable(label, coro)
        except STOPPING as exc:
            # With calls in parallel, two can meet the same limit: the run says so once.
            if self.ai_stopped is None:
                self.ai_stopped = str(exc)
                self.stop_error = exc
                self._note(f"The AI steps stopped: {exc}")
        except AIBudgetExhausted as exc:
            if self.ai_stopped is None:
                self.ai_stopped = str(exc)
                self.stop_error = exc
                self._note(f"The call budget ran out, so the narrative is incomplete: {exc}")
        except AIError as exc:
            self._drop(f"{label}: {exc}")
        return None

    def _note(self, text: str) -> None:
        """A note from an AI job; `_parallel` puts a batch's notes in its jobs' order."""
        self.notes.append(text)
        job = _JOB.get()
        if job is not None:
            self._note_jobs[len(self.notes) - 1] = job

    def _drop(self, text: str) -> None:
        self.dropped.append(text)
        job = _JOB.get()
        if job is not None:
            self._drop_jobs[len(self.dropped) - 1] = job

    def _job(self, label: str, make: Callable[[], Any]) -> Callable[[], Any]:
        """One AI call for `_parallel`: its coroutine is made only when a slot is free."""
        return lambda: self._ai_call(label, make())

    async def _parallel(
        self,
        jobs: list[Callable[[], Any]],
        *,
        count: str | None = None,
        names: list[str] | None = None,
    ) -> list[Any]:
        """Run AI jobs at most `config.AI_CALLS_IN_PARALLEL` at a time (Technical Plan §3) and
        return their results in the jobs' order.

        A job starts only when a slot is free, so a cancel or a usage limit stops the queued
        ones before they send anything. The notes and dropped-source lines the jobs add are
        put in the jobs' order, so a report reads the same whatever finished first. (Which
        calls got in before a usage limit or the end of the budget still depends on timing,
        as it must.) A cancel, or an unexpected error, is raised once every job has settled.

        With `count` ("reads", "sections" or "checks") and the jobs' `names`, the live tally
        counts the jobs done out of all, and `now` names the ones under way."""
        slots = asyncio.Semaphore(config.AI_CALLS_IN_PARALLEL)
        notes_before, dropped_before = len(self.notes), len(self.dropped)
        if count is not None:
            self._tally(**{f"{count}_total": len(jobs), f"{count}_done": 0}, now=[])

        async def one(index: int, make: Callable[[], Any]) -> Any:
            _JOB.set(index)  # this task's own context: the notes it adds are tagged with it
            async with slots:
                if count is None or names is None:
                    return await make()
                name = names[index]
                self._tally(now=[*self.tally.get("now", []), name])
                try:
                    return await make()
                finally:
                    now = list(self.tally.get("now", []))
                    if name in now:
                        now.remove(name)
                    self._tally(now=now, **{f"{count}_done": self._bump(f"{count}_done")})

        results = await asyncio.gather(
            *(one(i, make) for i, make in enumerate(jobs)), return_exceptions=True
        )

        def in_job_order(items: list[str], before: int, tags: dict[int, int]) -> list[str]:
            positions = sorted(range(before, len(items)), key=lambda i: tags.get(i, len(jobs)))
            return [items[i] for i in positions]

        self.notes[notes_before:] = in_job_order(self.notes, notes_before, self._note_jobs)
        self.dropped[dropped_before:] = in_job_order(self.dropped, dropped_before, self._drop_jobs)
        self._note_jobs.clear()
        self._drop_jobs.clear()
        for result in results:
            if isinstance(result, RunCancelled):
                raise result
        for result in results:
            if isinstance(result, BaseException):
                raise result
        return list(results)

    async def extract(
        self, paragraphs: dict[tuple[str, str], list[Paragraph]]
    ) -> dict[SectionKey, list[EvidenceItem]]:
        """Step 10. One read per source, 5 at a time; the filings' reads mostly started while
        the rest downloaded (`_read_early`), and the articles' start here. Their answers, and
        any error, are taken in the sources' order, so the evidence, the dropped sources and
        the notes read the same whatever finished first, and a usage limit an early read met
        is reported here, at step 10."""
        evidence: dict[SectionKey, list[EvidenceItem]] = {s: [] for s in self.sections}
        if self.ai is None:
            self.notes.append("No AI tool was used, so the narrative sections are empty.")
            return evidence
        reads: list[tuple[str, asyncio.Task]] = []
        uses: list[tuple[str, tuple[SectionKey, ...]]] = []
        for role, key, label, feeds, doc, paras in self._filing_reads(paragraphs):
            reads.append((label, self._filing_read(role, key, label, doc, paras)))
            uses.append((role, feeds))
        # Articles: one call each, and their evidence reaches section 7 only.
        for article, link in self.articles:
            source_id = article.paragraphs[0].id.rsplit("-p", 1)[0]
            paras = paragraphs.get(("article", source_id), [])
            if not paras:
                continue
            label = f"an article, {link.title!r} ({link.publisher}, {article.published:%-d %b %Y})"
            reads.append(
                (
                    f"article {article.url}",
                    self._read(
                        ("article", source_id),
                        f"{link.publisher}: {link.title}",
                        lambda source_id=source_id, paras=paras, label=label: extract_section(
                            self.ai,
                            self.conn,
                            source_id=source_id,
                            section="article",
                            paragraphs=paras,
                            label=label,
                        ),
                    ),
                )
            )
            uses.append(("article", (SectionKey.NEWS,)))
        settled = await asyncio.gather(*(task for _, task in reads), return_exceptions=True)
        results: list[Extracted | None] = []
        for (label, _), value in zip(reads, settled, strict=True):
            results.append(await self._ai_call(label, _settled(value)))
        for (role, feeds), result in zip(uses, results, strict=True):
            if result is None:
                continue
            for feed in feeds:
                items = result.items
                if feed == SectionKey.WATCH:
                    items = [i for i in items if i.type in ("risk", "event")]
                if feed == SectionKey.TRENDS and role == "10-K":
                    items = [i for i in items if i.type == "trend"]
                evidence[feed] += items
        return evidence

    def _read_early(self, docs: list[Doc]) -> None:
        """Parse these documents now and start step 10's reads of their sections, so the
        reads run while the rest of step 2 downloads. Their answers are taken in step 10."""
        if self.ai is None or not docs:
            return
        for doc in docs:
            self.docs_by_role[doc.role] = doc
            self._early_paragraphs.update(self._parse(doc)[0])
        for role, key, label, _, doc, paras in self._filing_reads(self._early_paragraphs):
            self._filing_read(role, key, label, doc, paras)

    def _filing_read(self, role: str, key: str, label: str, doc: Doc, paras) -> asyncio.Task:
        """The read of one filing section, started now unless it already was."""
        if (role, key) not in self._reads:
            # Counted before it starts, when any answer it saves isn't there yet.
            self._planned[(role, key)] = planned_calls(
                self.ai, self.conn, source_id=doc.accession, section=key, paragraphs=paras
            )
        return self._read(
            (role, key),
            label[:1].upper() + label[1:],
            lambda: extract_section(
                self.ai,
                self.conn,
                source_id=doc.accession,
                section=key,
                paragraphs=paras,
                label=label,
            ),
        )

    def _read(self, key: tuple[str, str], name: str, make: Callable[[], Any]) -> asyncio.Task:
        """One of step 10's reads, as a task that waits for one of its 5 slots. The read is
        made only when a slot is free, so a cancel, or a usage limit or the end of the budget
        met by an earlier read, stops it before it sends anything. The live tally counts the
        reads done out of all started, names the ones under way (`name`) and counts the
        evidence they find, wherever in the run they start."""
        task = self._reads.get(key)
        if task is not None:
            return task
        first = self._read_slots is None
        if self._read_slots is None:
            self._read_slots = asyncio.Semaphore(config.AI_CALLS_IN_PARALLEL)
        slots = self._read_slots

        async def one():
            async with slots:
                sent, result = False, None
                try:
                    if self.cancel_requested:
                        raise RunCancelled("extract")
                    if self._reads_stop is not None:
                        raise self._reads_stop
                    if self.ai is None or self.ai_stopped:
                        return None  # step 10 makes nothing of it: the AI steps had stopped
                    sent = True
                    self._tally(now=[*self.tally.get("now", []), name])
                    result = await self._cancellable("extract", make())
                    return result
                except (*STOPPING, AIBudgetExhausted) as exc:
                    if self._reads_stop is None:
                        self._reads_stop = exc
                    raise
                finally:
                    now = list(self.tally.get("now", []))
                    if sent and name in now:
                        now.remove(name)
                    changes: dict[str, Any] = {"now": now, "reads_done": self._bump("reads_done")}
                    if result is not None:
                        changes["evidence"] = self._bump("evidence", len(result.items))
                    self._tally(**changes)

        task = asyncio.create_task(one())
        self._reads[key] = task
        if first:
            self._tally(reads_done=0, reads_total=1, evidence=0, now=[])
        else:
            self._tally(reads_total=len(self._reads))
        return task

    def _stop_reads(self) -> None:
        """A run that ends before step 10 takes its reads' answers stops the unfinished ones."""
        reads, self._reads = self._reads, {}
        for task in reads.values():
            if not task.done():
                task.cancel()
            elif not task.cancelled():
                task.exception()  # read, so asyncio doesn't warn that nobody did

    def _filing_reads(self, paragraphs: dict[tuple[str, str], list[Paragraph]]):
        """The filing sections step 10 reads, in order: (role, key, label, feeds, doc, paras)."""
        for role, key, label, feeds in [*self.sources, *self.trend_sources, *self.press_sources]:
            paras = paragraphs.get((role, key))
            doc = self.docs_by_role.get(role)
            if paras and doc is not None:
                yield role, key, label, feeds, doc, paras

    def _planned_reads(self, paragraphs: dict[tuple[str, str], list[Paragraph]]) -> int:
        """The filing reads still to make: saved ones cost nothing, a split section one call
        per part."""
        if self.ai is None:
            return 0
        return sum(
            self._planned[(role, key)]
            if (role, key) in self._planned
            else planned_calls(
                self.ai, self.conn, source_id=doc.accession, section=key, paragraphs=paras
            )
            for role, key, _, _, doc, paras in self._filing_reads(paragraphs)
        )

    def _search_links(self, resolved: Resolved, allowlist: Allowlist):
        prompt = load_prompt("news_search")
        return search_links(
            self.ai,
            company=self.company_name,
            ticker=resolved.rated_ticker,
            allowlist=allowlist,
            instructions=prompt.text,
            today=self.today,
            prompt_version=prompt.version,
        )

    @staticmethod
    async def _answer_of(task: asyncio.Task):
        return await task  # its AI error, if any, is raised here, inside step 9's _ai_call

    def _start_link_search(self, resolved: Resolved) -> None:
        """Step 9's link search needs only the company's name and ticker, so it starts as soon
        as step 1 is done and runs while the data downloads. Its links feed section 7 only;
        no number waits for it, and step 9 waits for its answer."""
        if (
            self.mode != "full"
            or self.ai is None
            or getattr(self.data, "fetch_article", None) is None
        ):
            return
        allowlist = Allowlist(self.method.allowlist_sites())
        # The bare call: a usage limit it meets is handled in step 9 (`news`), as before, so
        # the stop is reported at step 9 and its note lands where it always did.
        self._link_search = asyncio.create_task(self._search_links(resolved, allowlist))

    def _stop_link_search(self) -> None:
        """A run that ends before step 9 stops its early link search."""
        task, self._link_search = self._link_search, None
        if task is None:
            return
        if not task.done():
            task.cancel()
        elif not task.cancelled():
            task.exception()  # read, so asyncio doesn't warn that nobody did

    async def news(
        self, resolved: Resolved, paragraphs: dict[tuple[str, str], list[Paragraph]]
    ) -> dict[tuple[str, str], list[Paragraph]]:
        """Step 9: the AI suggests links from allowlisted sites (web search only); code
        downloads and saves each page (Technical Plan §9)."""
        out: dict[tuple[str, str], list[Paragraph]] = {}
        if self.mode != "full" or self.ai is None:
            return out
        fetch = getattr(self.data, "fetch_article", None)
        if fetch is None:
            self.empty_sections.add(SectionKey.NEWS)
            self.notes.append("These inputs can't fetch articles, so section 7 has no news.")
            return out
        allowlist = Allowlist(self.method.allowlist_sites())
        task = self._link_search  # `_stop_link_search` (at the end of the run) tidies it up
        found = await self._ai_call(
            "link search",
            self._answer_of(task) if task is not None else self._search_links(resolved, allowlist),
        )
        if found is None:
            self.empty_sections.add(SectionKey.NEWS)
            return out
        # Most news sites' terms forbid automated reading, so by default their pages are listed
        # as links and never downloaded; the company's press releases from SEC are still read.
        self.reading_articles = config.Settings(self.conn).get("news_articles") == "on"
        if not self.reading_articles:
            self.unread_links = found.kept[:LINKS_SHOWN]
            self.notes.append(
                f"News: {len(found.suggested)} links suggested, {len(found.kept)} on the allowlist; "
                f"{len(self.unread_links)} listed as links, not read (article reading is off)."
            )
            self.empty_sections.add(SectionKey.NEWS)
            return out
        # The call budget (Technical Plan §3). The projection: this link search, every filing
        # read still to make, the articles, and for every section its draft, its check and
        # room for one rewrite with its re-check. Over the budget, fewer articles are read,
        # down to 5; still over, no section is rewritten.
        fixed = 1 + self._planned_reads(paragraphs) + 2 * len(self.sections)
        rewrites = 2 * len(self.sections)
        cap = min(ARTICLE_CAP, max(ARTICLE_FLOOR, config.CALL_BUDGET - fixed - rewrites))
        links = found.kept[:cap]
        if len(found.kept) > cap:
            self.cuts.append(
                f"read {cap} of {len(found.kept)} articles to stay within the call budget"
            )
        if fixed + len(links) + rewrites > config.CALL_BUDGET:
            self.rewrites_cut = True
            self.cuts.append("no section rewrites, to stay within the call budget")
        phrases = [re.compile(x, re.I) for x in self.method.instruction_phrases.get("patterns", [])]
        skipped: dict[str, int] = {}
        self._tally(articles=0)
        for link in links:
            got = await fetch(link.url, allowlist)
            if isinstance(got, Skipped):
                skipped[got.reason] = skipped.get(got.reason, 0) + 1
                with self.conn:
                    self.conn.execute(
                        "INSERT OR IGNORE INTO article_skips (run_id, url, site, reason, at) VALUES (?, ?, ?, ?, ?)",
                        (
                            self.run_id,
                            link.url,
                            allowlist.site_for(link.url),
                            got.reason,
                            _now().isoformat(),
                        ),
                    )
                continue
            source_id = got.paragraphs[0].id.rsplit("-p", 1)[0] if got.paragraphs else None
            if source_id is None:
                continue
            paras = [
                Paragraph(
                    ap.id, source_id, "article", n, ap.text, any(x.search(ap.text) for x in phrases)
                )
                for n, ap in enumerate(got.paragraphs, start=1)
            ]
            out[("article", source_id)] = paras
            self.articles.append((got, link))
            self._tally(articles=len(self.articles))
            self.article_urls[source_id] = got.url
            with self.conn:
                self.conn.execute(
                    "INSERT OR IGNORE INTO articles (id, url, final_url, publisher, source_type, published_at, fetched_at, raw_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        source_id,
                        link.url,
                        got.url,
                        link.publisher,
                        "news",
                        got.published.isoformat(),
                        _now().isoformat(),
                        got.raw_hash,
                    ),
                )
                self.conn.executemany(
                    "INSERT OR IGNORE INTO paragraphs (id, source_id, section, ordinal, text, parser_version, marked) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    [
                        (x.id, x.source_id, x.section, x.ordinal, x.text, 0, int(x.marked))
                        for x in paras
                    ],
                )
        reasons = ", ".join(f"{k} {v}" for k, v in skipped.items())
        self.notes.append(
            f"News: {len(found.suggested)} links suggested, {len(found.kept)} on the allowlist, {len(self.articles)} read"
            + (f"; not read: {reasons}" if reasons else "")
            + "."
        )
        if not self.articles:
            self.empty_sections.add(SectionKey.NEWS)
        return out

    def placeholders(self, rng: Range | None, rating: Rating) -> dict[str, PlaceholderValue]:
        m = self.members[self.cik]
        values: dict[str, PlaceholderValue] = {}

        def put(key: str, kind: str, value: Any) -> None:
            if value is not None and not (isinstance(value, float) and math.isinf(value)):
                values[key] = PlaceholderValue(key, kind, value)

        kinds = {
            "operating_margin": "percent",
            "momentum_12m": "percent",
            "earnings_yield": "percent",
            "net_share_issuance": "percent",
            "net_debt_to_ebitda": "ratio",
            "accruals_to_assets": "percent",
        }
        for name, kind in kinds.items():
            if name in m.metrics:
                put(f"metric:{name}", kind, m.metrics[name].value)
        if m.fin:
            revenue = m.fin.ttm("revenue")
            put("value:revenue_ttm", "amount", revenue.value if revenue else None)
            put("metric:revenue_growth_3y", "percent", m.fin.growth("revenue", years=3))
        if m.price and not self.withheld:
            put("price:current", "price", m.price[1])
            put("date:price_as_of", "date", m.price[0])
        return values

    def _section_placeholders(
        self, section: SectionKey, base: dict[str, PlaceholderValue]
    ) -> dict[str, PlaceholderValue]:
        if section != SectionKey.TRENDS:
            return base
        macro = {
            f"macro:{sid}": PlaceholderValue(f"macro:{sid}", kind, value)
            for sid, (kind, value, _) in self.macro.items()
        }
        return {**base, **macro}

    async def narrate(
        self, evidence, paragraphs, placeholders, resolved: Resolved
    ) -> dict[SectionKey, Draft]:
        by_id = {p.id: p for paras in paragraphs.values() for p in paras}
        drafts: dict[SectionKey, Draft] = {}
        if self.ai is None:
            return drafts
        jobs, keys = [], []
        for section in self.sections:
            if section in self.empty_sections:
                continue
            if not evidence.get(section):
                # Nothing to cite, so no sentence could pass the citation check.
                self.notes.append(
                    f"Section '{section.value}' had no evidence from its sources, so it wasn't written."
                )
                continue
            jobs.append(
                self._job(
                    f"section {section.value}",
                    lambda section=section: narrate_section(
                        self.ai,
                        section=section,
                        company=self.company_name,
                        evidence=evidence[section],
                        paragraphs=by_id,
                        placeholders=self._section_placeholders(section, placeholders),
                    ),
                )
            )
            keys.append(section)
        # Each section is written from its own sources, so they go 5 at a time; the drafts
        # keep the sections' order.
        names = [SECTION_TITLES.get(s, s.value) for s in keys]
        done = await self._parallel(jobs, count="sections", names=names)
        for section, draft in zip(keys, done, strict=True):
            if draft is not None:
                drafts[section] = draft
        return drafts

    def _code_checks(
        self, draft: Draft, guard: NumericGuard, by_id: dict[str, Paragraph]
    ) -> list[Claim]:
        claims = []
        for sid, sentence in draft.sentences:
            cited_text = [by_id[c].text for c in sentence.citations if c in by_id]
            guard_result = guard.check(sentence.text, cited=cited_text)
            citation = check_citations(sentence.citations, draft.sent_ids)
            filled, reason = fill(sentence.text, draft.placeholders)
            reasons = list(guard_result.reasons) + ([reason] if reason else [])
            claims.append(
                Claim(
                    sid,
                    draft.section.value,
                    sentence.text,
                    list(sentence.citations),
                    sentence.stance.value,
                    reasons,
                    citation.reason if not citation.ok else None,
                    filled=filled,
                )
            )
        return claims

    async def _skeptic(
        self, section: SectionKey, claims: list[Claim], by_id
    ) -> dict[str, tuple[str, str]]:
        """The skeptic runs on the other AI tool when both are connected. If that call fails,
        it falls back to a fresh session of the same tool, and the report says so."""
        passing = [c for c in claims if not c.guard_reasons and not c.citation_reason]

        def check(client: AIClient):
            return skeptic_section(
                client,
                section=section.value,
                claims=passing,
                paragraphs=by_id,
                evidence=self.evidence.get(section, []),
                rating_summary=self.rating_summary,
            )

        if passing and self.checker is not None and self.checker_failed is None:
            if self.cancel_requested:
                raise RunCancelled(f"skeptic {section.value}")
            if self.ai_stopped is None:
                try:
                    marks = await self._cancellable(f"skeptic {section.value}", check(self.checker))
                except AIBudgetExhausted as exc:
                    if self.ai_stopped is None:
                        self.ai_stopped = str(exc)
                        self.stop_error = exc
                        self._note(
                            f"The call budget ran out, so the narrative is incomplete: {exc}"
                        )
                    return {}
                except AIError as exc:
                    # Any failure on the other tool, even a usage limit there, falls back to
                    # the same tool for the rest of the run; it doesn't stop the run. With
                    # sections checked in parallel, the run says so once.
                    if self.checker_failed is None:
                        name = self.checker.connector.display_name
                        self.checker_failed = f"{name}: {exc}"
                        self._note(
                            f"The skeptic call on {name} failed ({exc}), so the rest of the "
                            "draft was self-checked."
                        )
                else:
                    self.checked_by[section.value] = "other"
                    return marks
        marks = await self._ai_call(f"skeptic {section.value}", check(self.ai))
        if passing and marks is not None:
            self.checked_by[section.value] = "self"
        return marks or {}

    def _skeptic_text(self) -> str:
        """Who ran the skeptic, for the "Checks that ran" box."""
        if self.mode == "slice":
            return "not run in the thin slice"
        self_checked = "self-checked (a fresh session of the same AI tool checked the draft)"
        if self.checker is None or not self.checked_by:
            return self_checked
        name = self.checker.connector.display_name
        selves = sorted(s for s, who in self.checked_by.items() if who == "self")
        if not selves:
            return f"checked by {name}"
        if len(selves) == len(self.checked_by):
            return self_checked
        return f"checked by {name}, except {', '.join(selves)}, which was self-checked"

    async def verify(self, drafts: dict[SectionKey, Draft], paragraphs, resolved: Resolved):
        """Step 13: the code checks; in the full method, then the skeptic and the decision
        flow with at most one rewrite per section."""
        guard = NumericGuard(
            self.method.names,
            company_names=[self.company_name, resolved.name],
            run_year=self.today.year,
        )
        by_id = {p.id: p for paras in paragraphs.values() for p in paras}
        kept: dict[SectionKey, list[Claim]] = {}
        removed: list[Claim] = []
        split: dict[str, int] = {}
        full = self.mode == "full" and self.ai is not None
        order = list(drafts.items())
        # Each section's checks, skeptic and rewrite form one chain; the chains go 5 at a time
        # and are put together in the sections' order.
        self._tally(claims_kept=0, claims_removed=0)

        async def chain(section: SectionKey, draft: Draft):
            out = await self._verify_section(section, draft, drafts, guard, by_id, full=full)
            self._tally(
                claims_kept=self._bump("claims_kept", len(out[0])),
                claims_removed=self._bump("claims_removed", len(out[1])),
            )
            return out

        jobs = [
            lambda section=section, draft=draft: chain(section, draft) for section, draft in order
        ]
        names = [SECTION_TITLES.get(s, s.value) for s, _ in order]
        for (section, _), (section_kept, section_removed, section_split) in zip(
            order, await self._parallel(jobs, count="checks", names=names), strict=True
        ):
            kept[section] = section_kept
            removed += section_removed
            for k, v in section_split.items():
                split[k] = split.get(k, 0) + v
        return kept, removed, split

    async def _verify_section(
        self,
        section: SectionKey,
        draft: Draft,
        drafts: dict[SectionKey, Draft],
        guard: NumericGuard,
        by_id: dict[str, Paragraph],
        *,
        full: bool,
    ) -> tuple[list[Claim], list[Claim], dict[str, int]]:
        """One section's code checks, then (in the full method) the skeptic and at most one
        rewrite. Returns the kept claims, the removed ones and the direction split."""
        removed: list[Claim] = []
        claims = self._code_checks(draft, guard, by_id)
        if not full:
            result = decide(claims, skeptic={}, rewrites_allowed=False)
            return result.kept, result.removed, result.direction_split
        marks = await self._skeptic(section, claims, by_id)
        result = decide(
            claims,
            skeptic=marks,
            rewrites_allowed=self.ai_stopped is None and not self.rewrites_cut,
        )
        if result.needs_rewrite:
            notes = [f"{c.text} (removed: {'; '.join(c.reasons)})" for c in result.removed]
            notes += [f"{c.text} (tone: {c.note})" for c in result.kept if c.note]
            redraft = await self._ai_call(
                f"rewrite {section.value}",
                narrate_section(
                    self.ai,
                    section=section,
                    company=self.company_name,
                    evidence=self.evidence.get(section, []),
                    paragraphs=by_id,
                    placeholders=draft.placeholders,
                    rewrite_notes=notes,
                ),
            )
            if redraft is not None:
                drafts[section] = redraft
                removed += result.removed
                claims = self._code_checks(redraft, guard, by_id)
                marks = await self._skeptic(section, claims, by_id)
                result = decide(
                    claims,
                    skeptic=marks,
                    rewrites_allowed=False,
                    removed_before=result.removed,
                )
        return result.kept, removed + result.removed, result.direction_split

    # --- step 14 ----------------------------------------------------------------------------

    def _goal1_round(self) -> int | None:
        """Full-method reports count toward the current Goal 1 round (item 36)."""
        if self.mode != "full":
            return None
        value = config.Settings(self.conn).get("goal1_round")
        return int(float(value)) if value else 1

    def _risk_lines(self) -> list[str]:
        if self.mode == "slice":
            return ["Red flags and the insider-buying note are added in Phase 1b."]
        lines = [
            f"Red flag: {f.label}. {f.evidence[0].upper()}{f.evidence[1:]}. The rating is capped at Hold."
            for f in self.flags
        ]
        if not self.flags:
            lines.append(
                "Red flags: none found (restatement, material weakness, going concern, risk-factor change)."
            )
        if getattr(self, "risk_change", None) is not None:
            lines.append(
                f"Item 1A changed {format_value('percent', self.risk_change)} from last year by words in unmatched paragraphs (the red-flag line is {format_value('percent', float(self.method.rating_lines['risk_factor_change_threshold']))})."
            )
        if getattr(self, "insider_note", None):
            when = ", ".join(format_value("date", d) for d in self.insider_note.dates)
            lines.append(
                f"Insider buying: {', '.join(self.insider_note.buyers)} bought shares on the open market in the last 6 months ({when}), "
                "and not as a routine purchase (the same month in each of the prior 3 years)."
            )
        elif getattr(self, "insider_checked", False):
            lines.append(
                "Insider buying: no non-routine open-market purchases in the last 6 months."
            )
        return lines

    def _fmt_pct(self, value: float | None) -> str:
        return "not available" if value is None else format_value("percent", value)

    def save(
        self,
        resolved,
        group,
        score,
        rating,
        rng,
        level,
        mix,
        claims,
        removed,
        split,
        drafts,
        docs,
        paragraphs,
    ):
        company = self.members[self.cik]
        by_id = {p.id: p for paras in paragraphs.values() for p in paras}
        index_of = {d.accession: d.index_url for d in docs}
        peers_return = [
            self.members[c].total_return_12m
            for c in group.peers
            if c in self.members and self.members[c].total_return_12m is not None
        ]
        sections: list[dict[str, Any]] = []

        # Section 1, written by code.
        s1: list[str] = []
        if self.withheld:
            s1.append(
                "Sections 1-3 are withheld because prices for the company or SPY are missing or stale."
            )
        elif rating.rating is None:
            s1.append(f"Rating withheld: {rating.withheld}.")
        else:
            s1.append(
                f"Rating: {rating.rating}{' (capped by a red flag)' if rating.uncapped != rating.rating else ''}. {RATING_DEFINITION}"
            )
            s1.append(
                f"Score: {score.composite.get(self.cik, 0):.0f}th percentile of its peer group."
            )
            if rng:
                s1.append(
                    f"12-month range: bear {format_value('price', rng.bear)}, base {format_value('price', rng.base)}, bull {format_value('price', rng.bull)} "
                    f"(10th, 50th and 90th percentiles). Uncertainty: {level.replace('_', ' ')}."
                )
            else:
                s1.append("Valuation not meaningful, so there is no range.")
            if self.previous_rating:
                s1.append(
                    f"Previous official rating: {self.previous_rating[0]} "
                    f"({format_value('date', date.fromisoformat(self.previous_rating[1][:10]))})."
                )
            else:
                s1.append("Previous official rating: none.")
            s1.append(self.prediction_note)
        s1.append(consensus(resolved.rated_ticker).note)
        s1.append(
            f"Total return over the past 12 months: {resolved.rated_ticker} {self._fmt_pct(company.total_return_12m)}; "
            f"peer group (equal-weighted) {self._fmt_pct(statistics.mean(peers_return) if peers_return else None)}; "
            f"S&P 500 (SPY) {self._fmt_pct(self.spy_return)}."
        )
        sections.append(
            {
                "key": "rating",
                "number": 1,
                "title": "Rating, score and range",
                "paragraphs": s1,
                "sentences": [],
            }
        )

        if not self.withheld:
            factors = score.factors.get(self.cik, {})
            table = [["Factor", "Percentile", "Weight used"]] + [
                [
                    f.replace("_", " "),
                    f"{v:.0f}",
                    f"{score.weights_used[self.cik].get(f, 0) * 100:.1f}%",
                ]
                # In the methodology's factor order, so the table reads the same on every run.
                for f, v in sorted(
                    factors.items(), key=lambda kv: self._factor_order().get(kv[0], 99)
                )
            ]
            sections.append(
                {
                    "key": "score",
                    "number": 2,
                    "title": "Score (one metric per factor in the thin slice)"
                    if self.mode == "slice"
                    else "Score",
                    "paragraphs": [score.scaling.note],
                    "sentences": [],
                    "table": table,
                }
            )
            vrows = [["Method", "Value per share", "Note"]]
            for method in company.valuation.methods if company.valuation else []:
                vrows.append(
                    [
                        method.method.upper(),
                        format_value("price", method.value) if method.valid else "not meaningful",
                        method.reason or "",
                    ]
                )
            vparas = [
                f"Price: {format_value('price', company.price[1])} on {format_value('date', company.price[0])}."
                if company.price
                else "No price."
            ]
            if company.valuation and company.valuation.valid:
                vparas.append(
                    f"Estimated value: {format_value('price', company.valuation.value)}. Gap percentile among valued peers: {rating.gap_percentile:.0f}."
                    if rating.gap_percentile is not None
                    else f"Estimated value: {format_value('price', company.valuation.value)}."
                )
            vparas.append(
                f"In this peer group today (before red-flag caps): {mix['Buy']} Buy, {mix['Hold']} Hold, {mix['Sell']} Sell."
            )
            sections.append(
                {
                    "key": "valuation",
                    "number": 3,
                    "title": "Valuation (DCF only in the thin slice)"
                    if self.mode == "slice"
                    else "Valuation",
                    "paragraphs": vparas,
                    "sentences": [],
                    "table": vrows,
                }
            )

        def ai_section(
            key: SectionKey, number: int | None, title: str, extra: list[str] | None = None
        ) -> dict[str, Any]:
            sentences = []
            for c in claims.get(key, []):
                sentences.append(
                    {
                        "id": c.sentence_id,
                        "text": c.filled,
                        "note": c.note,
                        "citations": [
                            {
                                "id": pid,
                                "text": by_id[pid].text if pid in by_id else "",
                                "url": index_of.get(pid.split("#", 1)[0])
                                or self.article_urls.get(pid.rsplit("-p", 1)[0]),
                            }
                            for pid in c.citations
                        ],
                    }
                )
            paras = list(extra or [])
            if key not in drafts:
                paras.append(
                    "This section couldn't be written in this run (see the notes in section 9)."
                )
            return {
                "key": key.value,
                "number": number,
                "title": title,
                "paragraphs": paras,
                "sentences": sentences,
            }

        sections.append(ai_section(SectionKey.BUSINESS, 4, "The business"))
        sections.append(
            ai_section(
                SectionKey.RISKS,
                5,
                "Risks",
                self._risk_lines(),
            )
        )
        watch_lines = []
        if not self.withheld and rating.triggers:
            for side in ("buy", "sell"):
                value = rating.triggers.get(side)
                label = "Buy" if side == "buy" else "Sell"
                watch_lines.append(
                    f"{label} trigger: {format_value('price', value) if isinstance(value, float) else value} (holding the score and the peer value gaps fixed)."
                )
        if SectionKey.RESULTS in self.sections:
            sections.append(ai_section(SectionKey.RESULTS, 6, "Recent results"))
        if SectionKey.TRENDS in self.sections:
            trends = ai_section(SectionKey.TRENDS, 8, "Industry trends")
            if SectionKey.TRENDS in self.empty_sections:
                trends["paragraphs"] = ["The trends section has no peer filings in this run."]
            elif self.macro:
                trends["paragraphs"] = [
                    "Economic series (FRED): "
                    + "; ".join(
                        f"{sid} {format_value(kind, value)} ({format_value('date', day)})"
                        for sid, (kind, value, day) in self.macro.items()
                    )
                    + "."
                ]
            sections.append(trends)
        if SectionKey.NEWS in self.sections:
            news = ai_section(SectionKey.NEWS, 7, "News and views")
            if self.reading_articles is False:
                listed = (
                    " Other recent coverage is listed below as links, to read yourself."
                    if self.unread_links
                    else ""
                )
                news["paragraphs"] = [
                    (
                        "This section reads the company's own press releases from SEC."
                        if self.press_sources
                        else "No press releases from the company were found, so this section has no news."
                    )
                    + " Tearsheet doesn't download news sites' pages, because most of their terms forbid automated reading."
                    + listed
                ]
            elif not self.articles and self.press_sources:
                news["paragraphs"] = [
                    "Only the company's own press releases were read for this section: the article search found nothing readable."
                ]
            elif not self.articles:
                news["paragraphs"] = [
                    "No readable articles were found on the allowlisted sites in the last 30 days, so this section has no news. "
                    "(The company's press releases join this section later in Phase 1b.)"
                ]
            news["links"] = [
                {
                    "title": link.title,
                    "url": art.url,
                    "publisher": link.publisher,
                    "published": format_value("date", art.published),
                }
                for art, link in self.articles
            ] + [
                {
                    "title": link.title,
                    "url": link.url,
                    "publisher": link.publisher,
                    "note": "Not read",
                }
                for link in self.unread_links
            ]
            sections.append(news)
        sections.append(ai_section(SectionKey.WATCH, None, "What to watch", watch_lines))
        # Report order: sections 1-8, then the What to watch block just before section 9.
        sections.sort(key=lambda s: s["number"] if s["number"] is not None else 8.5)
        self._record_render(sections, watch_lines)

        methodology = [
            RATING_DEFINITION,
            "The 12-month range is the 10th, 50th and 90th percentiles of a price distribution around the base case.",
            f"Peer group: the {len(group.peers)} largest {group.sector} members of the S&P 500 by index weight, equal-weighted.",
            (
                "Thin slice (Phase 1a): one metric per factor, DCF only, filing extraction only (no news), the numeric guard and the citation check; no skeptic and no logged prediction."
                if self.mode == "slice"
                else "Full method: every metric, all three valuation methods, the red-flag caps, news and the skeptic. "
                + self.prediction_note
            ),
            f"Prices as of {format_value('date', self.price_date)}. 10-year Treasury yield: {self._fmt_pct(self.risk_free)}.",
        ]
        if group.left_out:
            methodology.append(
                "Left out: "
                + "; ".join(
                    f"{self.holdings.tickers_of(c)[0] if self.holdings.has(c) else c} ({why})"
                    for c, why in group.left_out.items()
                )
                + "."
            )
        methodology += self.notes
        if self.dropped:
            methodology.append("Dropped: " + "; ".join(self.dropped) + ".")
        report = {
            "company": self.company_name,
            "ticker": resolved.rated_ticker,
            "run_at": self.now.strftime("%-d %b %Y %H:%M UTC"),
            "mode_note": "Thin-slice report (Phase 1a)."
            if self.mode == "slice"
            else "Full-method report. "
            + (
                "Logged as an official prediction."
                if self.prediction_id
                else "No prediction logged."
            ),
            "sections": sections,
            "removed": [
                {"id": c.sentence_id, "text": c.text, "reasons": c.reasons} for c in removed
            ],
            "direction_split": split,
            "checks": ["numeric guard", "citation check"]
            + (["skeptic"] if self.mode == "full" and self.ai is not None else []),
            "skeptic": self._skeptic_text(),
            "cuts": "; ".join(self.cuts) or None,
            "methodology": methodology,
            "filings": [
                {"form": d.form, "accession": d.accession, "url": d.index_url} for d in docs
            ],
        }
        report_id = f"rep-{self.run_id.removeprefix('run-')}"
        earlier = self.conn.execute(
            "SELECT COUNT(*) FROM reports WHERE run_id = ?", (self.run_id,)
        ).fetchone()[0]
        if earlier:
            report_id = f"{report_id}-r{earlier}"  # a resumed run's later report
        complete = self.ai_stopped is None and all(
            s in drafts for s in self.sections if s not in self.empty_sections
        )
        with self.conn:
            self.conn.execute(
                "INSERT INTO reports (report_id, run_id, created_at, narrative_complete, goal1_round) VALUES (?, ?, ?, ?, ?)",
                (report_id, self.run_id, _now().isoformat(), int(complete), self._goal1_round()),
            )
            self.conn.executemany(
                "INSERT INTO sections (report_id, key, json) VALUES (?, ?, ?)",
                [(report_id, s["key"], json.dumps(s, default=str)) for s in sections],
            )
            self.conn.execute(
                "INSERT INTO sections (report_id, key, json) VALUES (?, 'report', ?)",
                (report_id, json.dumps(report, default=str)),
            )
            rows = []
            for section_claims in claims.values():
                rows += [
                    (
                        f"{report_id}:{c.sentence_id}",
                        report_id,
                        c.section,
                        c.sentence_id,
                        c.stance,
                        json.dumps(c.citations),
                        json.dumps(
                            {
                                "guard": c.guard_reasons,
                                "citation": c.citation_reason,
                                "note": c.note,
                            }
                        ),
                        0,
                    )
                    for c in section_claims
                ]
            rows += [
                (
                    f"{report_id}:{c.sentence_id}",
                    report_id,
                    c.section,
                    c.sentence_id,
                    c.stance,
                    json.dumps(c.citations),
                    json.dumps({"reasons": c.reasons}),
                    1,
                )
                for c in removed
            ]
            self.conn.executemany("INSERT INTO claims VALUES (?, ?, ?, ?, ?, ?, ?, ?)", rows)
        html_path = None
        if self.out_dir is not None:
            self.out_dir.mkdir(parents=True, exist_ok=True)
            html_path = self.out_dir / f"{resolved.rated_ticker}-{self.now:%Y%m%dT%H%M%SZ}.html"
            html_path.write_text(render_html(report, mode="file"))
        return report_id, html_path


def mark_interrupted(conn: sqlite3.Connection) -> int:
    """At start-up, runs still marked running are marked interrupted (item 34)."""
    with conn:
        return conn.execute(
            "UPDATE runs SET status = 'interrupted' WHERE status = 'running'"
        ).rowcount


def prepare_resume(
    conn: sqlite3.Connection,
    run_id: str,
    *,
    raw_dir: Path,
    ai: AIClient | None,
    out_dir: Path | None,
    progress: Callable[[str, str], None] | None = None,
    checker: AIClient | None = None,
    tally: Callable[[dict[str, Any]], None] | None = None,
) -> tuple[Run, str]:
    """Continue a stopped or interrupted run (item 34). Steps 1-8 are re-run from the run's own
    stored inputs, with its stored methodology, so their numbers can't change; the AI steps
    then carry on with the same tool, and saved evidence means no filing is read again."""
    from tearsheet.methodology import from_stored
    from tearsheet.rawstore import RawStore
    from tearsheet.replay import ReplayData, ReplayError

    run = conn.execute("SELECT * FROM runs WHERE run_id = ?", (run_id,)).fetchone()
    if run is None:
        raise ReplayError(f"No run {run_id} in this data folder.")
    if run["status"] not in ("stopped", "interrupted"):
        raise ReplayError(
            f"Run {run_id} is {run['status']}, so it can't be resumed; start a new run instead."
        )
    copies = {
        r[0].split("/", 1)[0].removeprefix("tearsheet:"): r[1]
        for r in conn.execute(
            "SELECT request_key, raw_hash FROM fetch_log WHERE run_id = ? AND request_key LIKE 'tearsheet:%'",
            (run_id,),
        )
    }
    if "methodology" not in copies or "reference" not in copies:
        raise ReplayError(f"Run {run_id} has no stored methodology copy, so it can't be resumed.")
    method = from_stored(
        RawStore.read(raw_dir, copies["methodology"]), RawStore.read(raw_dir, copies["reference"])
    )
    resolved = conn.execute(
        "SELECT json FROM step_outputs WHERE run_id = ? AND step = 'resolve'", (run_id,)
    ).fetchone()
    if resolved is None:
        raise ReplayError(f"Run {run_id} stopped before step 1 finished; start a new run instead.")
    resolved = json.loads(resolved[0])
    data = ReplayData(conn, raw_dir, run_id, resolved)
    again = Run(
        conn,
        data,
        ai,
        method,
        mode=run["mode"],
        now=datetime.fromisoformat(run["started_at"]),
        out_dir=out_dir,
        progress=progress,
        run_id=run_id,
        checker=checker,
        tally=tally,
    )
    return again, resolved["ticker"]


def resume_run(
    conn: sqlite3.Connection,
    run_id: str,
    *,
    raw_dir: Path,
    ai: AIClient | None,
    out_dir: Path | None,
    progress: Callable[[str, str], None] | None = None,
    checker: AIClient | None = None,
) -> RunResult:
    run, ticker = prepare_resume(
        conn, run_id, raw_dir=raw_dir, ai=ai, out_dir=out_dir, progress=progress, checker=checker
    )
    return asyncio.run(run.run(ticker, resume=True))
