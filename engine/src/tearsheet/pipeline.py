"""The report run (design item 34, Technical Plan §3).

Phase 1a builds the thin slice: every step runs end to end on one ticker, each in its simplest
form. Resolve by ticker (or alias or name); one metric per factor; DCF only; filing extraction
only, with no news; sections 1, 4 and 5 and the What to watch block (with sections 2 and 3 as
code-written tables); the numeric guard and the citation check. The slice logs no
predictions; its runs are stored with mode = "slice".
"""

from __future__ import annotations

import asyncio
import json
import math
import re
import sqlite3
import statistics
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
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
from tearsheet.extract import Extracted, extract_section
from tearsheet.flags import insider_buying_note, red_flags
from tearsheet.methodology import Methodology
from tearsheet.metrics import Metric, compute_metrics, inputs_from, tax_rate
from tearsheet.narrate import Draft, narrate_section
from tearsheet.news import search_links
from tearsheet.normalize import Financials
from tearsheet.peers import PeerGroup, build_peer_group
from tearsheet.prompts import load_prompt
from tearsheet.rating import PeerGap, Rating, RatingInputs, peer_mix, rate, value_gap
from tearsheet.render import PlaceholderValue, fill, format_value, render_html
from tearsheet.resolve import Resolved, resolve
from tearsheet.scoring import (
    SLICE_METRICS,
    ScoreResult,
    momentum_scaling,
    score_group,
)
from tearsheet.sources import DataSource, Doc
from tearsheet.text.compare import change_score
from tearsheet.text.parse import Paragraph, filing_sections, split_paragraphs
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
TRADING_DAYS = 252
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


@dataclass
class RunResult:
    run_id: str
    report_id: str | None
    status: str
    html_path: Path | None
    rating: str | None
    notes: list[str]


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
        self.method = method
        self.mode = mode
        self.now = now or _now()
        self.today = self.now.astimezone(UTC).date()
        self.out_dir = out_dir
        self.progress = progress or (lambda step, state: None)
        self.run_id = run_id or new_run_id(self.now)
        self.rawstore = rawstore
        self.sources = SLICE_SOURCES if mode == "slice" else FULL_SOURCES
        self.sections = SLICE_SECTIONS if mode == "slice" else FULL_SECTIONS
        self.empty_sections: set[SectionKey] = set()
        self.articles: list[tuple[Any, Any]] = []  # (Article, Link)
        self.article_urls: dict[str, str] = {}
        self.cuts: list[str] = []
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
        self.dropped: list[str] = []

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

    def _finish(self, status: str, failed_step: str | None = None) -> None:
        calls = self.ai.sent if self.ai is not None else 0  # the checker shares this budget
        clients = [c for c in (self.ai, self.checker) if c is not None]
        model_ids = sorted({r.model_id for c in clients for r in c.calls if r.model_id})
        with self.conn:
            self.conn.execute(
                "UPDATE runs SET status = ?, ended_at = ?, failed_step = ?, ai_calls = ?, model_ids_json = ?, request_counts_json = ?, cik = ? WHERE run_id = ?",
                (
                    status,
                    _now().isoformat(),
                    failed_step,
                    calls,
                    json.dumps(model_ids),
                    json.dumps(self.data.request_counts()),
                    self.cik,
                    self.run_id,
                ),
            )

    def _step(self, name: str) -> None:
        if self.cancel_requested:
            raise RunCancelled(name)
        self.progress(name, "started")

    def cancel(self) -> None:
        """Ask the run to stop at the next step or AI call."""
        self.cancel_requested = True

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
            step = "fetch"
            self._step(step)
            docs = await self.fetch(resolved, group)
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
            self._save_step(
                step,
                {
                    "rating": rating.rating,
                    "uncertainty": level,
                    "gap_percentile": rating.gap_percentile,
                },
            )
            step = "news"
            self._step(step)
            news_paragraphs = await self.news(resolved)
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
            return RunResult(self.run_id, report_id, status, html_path, rating.rating, self.notes)
        except RunCancelled:
            self._finish("cancelled")
            raise
        except RunFailed as exc:
            self._finish("failed", exc.step)
            raise
        except Exception:
            self._finish("failed", step)
            raise

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
        await self.data.fill_prices(self.store, members, end=self.today)
        self.price_date = last_completed_session(self.now)
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
        for cik in group.members:
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
            member.fin = Financials(
                facts,
                as_of=self.today,
                split_factor=lambda after, up_to, c=cik: self.store.split_factor(
                    c, after=after, up_to=up_to
                ),
            )
            member.price = self.store.latest_close(cik, up_to=self.price_date)
            if cik == self.cik:
                member.financial_class = self.company_class
            elif financial_sector:
                subs = await self.data.submissions(cik)
                sic = int(subs["sic"]) if str(subs.get("sic") or "").isdigit() else None
                member.financial_class = financial_class(sic, cik, self.method.peers)
            self.members[cik] = member
        self.group = group
        docs = await self.data.filing_documents(self.cik, today=self.today)
        if self.mode == "slice":
            docs = [d for d in docs if d.role in ("10-K", "10-Q", "10-K prior")]
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
            peer_documents = getattr(self.data, "peer_documents", None)
            if peer_documents is not None and group.trend_peers:
                self.peer_docs = await peer_documents(group.trend_peers, today=self.today)
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
            if not self.peer_docs:
                self.empty_sections.add(SectionKey.TRENDS)
                self.notes.append("The trends section has no peer filings with these inputs.")
            macro = getattr(self.data, "macro", None)
            if macro is not None:
                self.macro = await macro(self.today)
            trades = getattr(self.data, "form4_trades", None)
            self.insider_note = (
                insider_buying_note(await trades(self.cik, today=self.today), self.today)
                if trades
                else None
            )
            self.insider_checked = trades is not None
        return docs + self.peer_docs

    # --- step 4 -----------------------------------------------------------------------------

    def text_layer(self, docs: list[Doc]) -> dict[tuple[str, str], list[Paragraph]]:
        phrases = self.method.instruction_phrases.get("patterns", [])
        out: dict[tuple[str, str], list[Paragraph]] = {}
        self.docs_by_role = {d.role: d for d in docs}
        for doc in docs:
            sections = filing_sections(doc.body, doc.form, exhibit_13=doc.exhibit_13)
            for key, section in sections.items():
                if doc.role.startswith("peer ") and key != "Item 7":
                    continue
                if not section.available:
                    self.notes.append(f"{doc.form} {key} is not available in the filing.")
                    continue
                paras = split_paragraphs(doc.accession, key, section.text, phrases)
                out[(doc.role, key)] = paras
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

    # --- steps 5-8 --------------------------------------------------------------------------

    def compute_metrics(self) -> None:
        for cik, m in self.members.items():
            if m.fin is None or m.price is None:
                continue
            price = m.price[1]
            shares = m.fin.shares("shares_outstanding", price_date=self.price_date) or m.fin.shares(
                "diluted_shares", price_date=self.price_date
            )
            market_value = price * shares.value if shares else None
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
        shares = fin.shares("diluted_shares", price_date=self.price_date) or fin.shares(
            "shares_outstanding", price_date=self.price_date
        )
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
            shares=shares.value,
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

        filings = sec_data.filings_from(
            self.company_submissions.get("filings", {}).get("recent", {}), self.cik
        )
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
        if company.valuation and company.valuation.valid and company.price:
            rng = twelve_month_range(
                RangeInputs(
                    company.price[1],
                    company.valuation.value,
                    cost_of_equity(company.volatility, self.method.valuation),
                    company.dividend_yield,
                    company.volatility or 0.3,
                    self.stats.median_volatility,
                ),
                lines,
            )
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
            return await coro
        except STOPPING as exc:
            self.ai_stopped = str(exc)
            self.stop_error = exc
            self.notes.append(f"The AI steps stopped: {exc}")
        except AIBudgetExhausted as exc:
            self.ai_stopped = str(exc)
            self.stop_error = exc
            self.notes.append(f"The call budget ran out, so the narrative is incomplete: {exc}")
        except AIError as exc:
            self.dropped.append(f"{label}: {exc}")
        return None

    async def extract(
        self, paragraphs: dict[tuple[str, str], list[Paragraph]]
    ) -> dict[SectionKey, list[EvidenceItem]]:
        evidence: dict[SectionKey, list[EvidenceItem]] = {s: [] for s in self.sections}
        if self.ai is None:
            self.notes.append("No AI tool was used, so the narrative sections are empty.")
            return evidence
        for role, key, label, feeds in [*self.sources, *self.trend_sources, *self.press_sources]:
            paras = paragraphs.get((role, key))
            doc = self.docs_by_role.get(role)
            if not paras or doc is None:
                continue
            result: Extracted | None = await self._ai_call(
                label,
                extract_section(
                    self.ai,
                    self.conn,
                    source_id=doc.accession,
                    section=key,
                    paragraphs=paras,
                    label=label,
                ),
            )
            if result is None:
                continue
            for feed in feeds:
                items = result.items
                if feed == SectionKey.WATCH:
                    items = [i for i in items if i.type in ("risk", "event")]
                if feed == SectionKey.TRENDS and role == "10-K":
                    items = [i for i in items if i.type == "trend"]
                evidence[feed] += items
        # Articles: one call each, and their evidence reaches section 7 only.
        for article, link in self.articles:
            source_id = article.paragraphs[0].id.rsplit("-p", 1)[0]
            paras = paragraphs.get(("article", source_id), [])
            if not paras:
                continue
            result = await self._ai_call(
                f"article {article.url}",
                extract_section(
                    self.ai,
                    self.conn,
                    source_id=source_id,
                    section="article",
                    paragraphs=paras,
                    label=f"an article, {link.title!r} ({link.publisher}, {article.published:%-d %b %Y})",
                ),
            )
            if result is not None:
                evidence[SectionKey.NEWS] += result.items
        return evidence

    async def news(self, resolved: Resolved) -> dict[tuple[str, str], list[Paragraph]]:
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
        prompt = load_prompt("news_search")
        found = await self._ai_call(
            "link search",
            search_links(
                self.ai,
                company=self.company_name,
                ticker=resolved.rated_ticker,
                allowlist=allowlist,
                instructions=prompt.text,
                today=self.today,
                prompt_version=prompt.version,
            ),
        )
        if found is None:
            self.empty_sections.add(SectionKey.NEWS)
            return out
        # The call budget: fewer articles first, down to 5 (Technical Plan §3).
        room = config.CALL_BUDGET - (1 + len(self.sources) + 2 * len(self.sections) + 4)
        cap = min(ARTICLE_CAP, max(ARTICLE_FLOOR, room))
        links = found.kept[:cap]
        if len(found.kept) > cap:
            self.cuts.append(
                f"read {cap} of {len(found.kept)} articles to stay within the call budget"
            )
        phrases = [re.compile(x, re.I) for x in self.method.instruction_phrases.get("patterns", [])]
        skipped: dict[str, int] = {}
        for link in links:
            got = await fetch(link.url, allowlist)
            if isinstance(got, Skipped):
                skipped[got.reason] = skipped.get(got.reason, 0) + 1
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
        for section in self.sections:
            if section in self.empty_sections:
                continue
            if not evidence.get(section):
                # Nothing to cite, so no sentence could pass the citation check.
                self.notes.append(
                    f"Section '{section.value}' had no evidence from its sources, so it wasn't written."
                )
                continue
            draft = await self._ai_call(
                f"section {section.value}",
                narrate_section(
                    self.ai,
                    section=section,
                    company=self.company_name,
                    evidence=evidence[section],
                    paragraphs=by_id,
                    placeholders=self._section_placeholders(section, placeholders),
                ),
            )
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
                    marks = await check(self.checker)
                except AIBudgetExhausted as exc:
                    self.ai_stopped = str(exc)
                    self.stop_error = exc
                    self.notes.append(
                        f"The call budget ran out, so the narrative is incomplete: {exc}"
                    )
                    return {}
                except AIError as exc:
                    # Any failure on the other tool, even a usage limit there, falls back to
                    # the same tool for the rest of the run; it doesn't stop the run.
                    name = self.checker.connector.display_name
                    self.checker_failed = f"{name}: {exc}"
                    self.notes.append(
                        f"The skeptic call on {name} failed ({exc}), so the rest of the draft "
                        "was self-checked."
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
        for section, draft in list(drafts.items()):
            claims = self._code_checks(draft, guard, by_id)
            if not full:
                result = decide(claims, skeptic={}, rewrites_allowed=False)
            else:
                marks = await self._skeptic(section, claims, by_id)
                result = decide(claims, skeptic=marks, rewrites_allowed=self.ai_stopped is None)
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
            kept[section] = result.kept
            removed += result.removed
            for k, v in result.direction_split.items():
                split[k] = split.get(k, 0) + v
        return kept, removed, split

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
            s1.append("Previous rating: none (no prediction is logged yet).")
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
                for f, v in factors.items()
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
            if not self.articles and self.press_sources:
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
            ]
            sections.append(news)
        sections.append(ai_section(SectionKey.WATCH, None, "What to watch", watch_lines))
        # Report order: sections 1-8, then the What to watch block just before section 9.
        sections.sort(key=lambda s: s["number"] if s["number"] is not None else 8.5)

        methodology = [
            RATING_DEFINITION,
            "The 12-month range is the 10th, 50th and 90th percentiles of a price distribution around the base case.",
            f"Peer group: the {len(group.peers)} largest {group.sector} members of the S&P 500 by index weight, equal-weighted.",
            (
                "Thin slice (Phase 1a): one metric per factor, DCF only, filing extraction only (no news), the numeric guard and the citation check; no skeptic and no logged prediction."
                if self.mode == "slice"
                else "Full method (Phase 1b): every metric, all three valuation methods, the red-flag caps, news and the skeptic. Logging predictions isn't switched on yet, so no prediction is logged."
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
            else "Full-method report (Phase 1b). No prediction is logged yet.",
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
