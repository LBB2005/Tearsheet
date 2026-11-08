"""App ↔ engine messages (design item 37, Technical Plan §2).

JSON-RPC 2.0, one JSON object per line. Standard output carries protocol messages only. These
Pydantic models are the one definition of every message; `scripts/gen-types.sh` turns them
into the app's TypeScript types (item 46).
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from tearsheet import PROTOCOL_VERSION

ERROR_CODES = (
    "NOT_COVERED",
    "RUN_IN_PROGRESS",
    "NO_TOOL",
    "NOT_RESUMABLE",
    "USAGE_LIMIT",
    "AUTH_EXPIRED",
    "LOCKDOWN_FAILED",
    "AI_UNAVAILABLE",
    "BUDGET_EXHAUSTED",
    "SEC_BLOCKED",
    "ENGINE_ERROR",
)
ENGINE_ERROR_CODE = -32000
PARSE_ERROR, INVALID_REQUEST, METHOD_NOT_FOUND, INVALID_PARAMS = -32700, -32600, -32601, -32602


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- request parameters ----------------------------------------------------------------------


class RunReportParams(Strict):
    query: str
    tool: Literal["claude", "codex"] | None = None


class RunIdParams(Strict):
    run_id: str


class GetReportParams(Strict):
    report_id: str
    view: Literal["summary", "full"] = "summary"
    # "auto" lays the report out by the frame's width (render.TWO_COLUMNS_MIN), so the app can
    # open, close and resize the chart without loading it again.
    column: Literal["both", "numbers", "text", "auto"] = "both"
    # A narrow window: the text alone, with a row of five key-number tiles above it.
    narrow: bool = False
    # With column "auto", the one column kept below TWO_COLUMNS_MIN.
    side: Literal["text", "numbers"] = "text"
    # False for a frame loaded after the report was already on show: no entrance motion.
    motion: bool = True


class SearchParams(Strict):
    query: str
    limit: int = 5


class ChartParams(Strict):
    report_id: str


class HistoryParams(Strict):
    report_id: str


class NumbersParams(Strict):
    report_id: str


class AnalystsParams(Strict):
    report_id: str


class ListReportsParams(Strict):
    limit: int = 50
    offset: int = 0
    # True: only the reports hidden from the sidebar (report_marks.py), for its Hidden group.
    hidden: bool = False


class NoParams(Strict):
    pass


class FlagClaimParams(Strict):
    claim_id: str
    note: str | None = None


class RereadFilingParams(Strict):
    accession: str


class SetKeyParams(Strict):
    service: Literal["massive", "fred", "alphavantage"]
    key: str


class SetSettingParams(Strict):
    key: Literal[
        "raw_cap",
        "backup_dir",
        "primary_tool",
        "sec_contact_email",
        "goal1_round",
        "setup_done",
        "fred_skipped",
    ]
    value: str


class CheckKeyParams(Strict):
    service: Literal["massive", "fred"]
    key: str


class SafetyParams(Strict):
    tool: Literal["claude", "codex"]


class ReportIdsParams(Strict):
    report_ids: list[str] = Field(min_length=1, max_length=1000)


class PinParams(Strict):
    cik: int
    pinned: bool


METHODS: dict[str, type[Strict]] = {
    "run_report": RunReportParams,
    "cancel": RunIdParams,
    "resume": RunIdParams,
    "get_report": GetReportParams,
    "list_reports": ListReportsParams,
    "list_predictions": NoParams,
    "flag_claim": FlagClaimParams,
    "reread_filing": RereadFilingParams,
    "set_key": SetKeyParams,
    "get_settings": NoParams,
    "set_setting": SetSettingParams,
    "check_key": CheckKeyParams,
    "run_safety_check": SafetyParams,
    "grade_due": NoParams,
    "list_companies": NoParams,
    "search_companies": SearchParams,
    "get_chart": ChartParams,
    "fetch_history": HistoryParams,
    "get_report_numbers": NumbersParams,
    "get_analysts": AnalystsParams,
    "hide_reports": ReportIdsParams,
    "show_reports": ReportIdsParams,
    "erase_reports": ReportIdsParams,
    "pin_company": PinParams,
}


# --- results ------------------------------------------------------------------------------------


class Candidate(Strict):
    cik: int
    name: str
    ticker: str


class RunStarted(Strict):
    run_id: str
    # The company step 1 resolved (run_report waits for it), so the app names the run by it;
    # None if the run stopped before step 1 finished.
    ticker: str | None
    name: str | None


class Ok(Strict):
    ok: bool


class PriceRange(Strict):
    bear: float
    base: float
    bull: float


class ReportBar(Strict):
    """The report page's top bar: the last close Tearsheet has, with the close before it, and the
    report's call. Every price is in the last close's shares (a split since the report divides
    the report's range, as on the chart). A part that can't be read is None."""

    close: float | None
    # ISO date of that close.
    close_date: str | None
    # The previous session's close, for the day's change; None when it isn't stored.
    previous_close: float | None
    rating: Literal["Buy", "Hold", "Sell"] | None
    # Held at Hold by a red flag; `red_flags` names them ("Risk-factor change").
    capped: bool
    red_flags: list[str]
    range: PriceRange | None
    # The score's percentile in the peer group, and how many peers that group has.
    percentile: int | None
    peers: int | None


class ReportResult(Strict):
    report_id: str
    run_id: str
    ticker: str
    # The company, for the toolbar's title and its other reports (list_reports' cik).
    cik: int | None
    name: str | None
    created_at: str
    narrative_complete: bool
    # Claims that passed the checks, for the toolbar's subtitle; None when not stored.
    kept: int | None
    # The top bar's numbers; None when the report's numbers can't be read.
    bar: ReportBar | None
    html: str


class CompanyRow(Strict):
    cik: int
    ticker: str
    name: str
    # The company's newest report on show; hidden reports are left out of every field.
    report_id: str
    report_date: str
    created_at: str
    reports: int
    # Every report on show, newest first, for deleting the row.
    report_ids: list[str]
    price: float | None
    price_date: str | None
    # The move from the close the report was priced at to `price` (0.05 is 5% up), splits
    # taken out; None without both closes.
    since_report: float | None
    rating: str | None
    # The report is an official prediction's (predictions.py).
    official: bool
    sector: str | None
    pinned: bool


class SearchHit(Strict):
    ticker: str
    name: str
    sector: str | None
    cik: int
    report_id: str | None
    report_date: str | None
    # The peer-group rule in plain words ("Compared with the 40 largest other S&P 500
    # Information Technology companies, by index weight"); None with no sector.
    peer_rule: str | None = None


class FilingMark(Strict):
    date: str
    form: str


class ChartSeries(Strict):
    dates: list[str]
    # Split-adjusted: in today's shares, so the last close is the real one.
    close: list[float]
    volume: list[int]
    # Total-return indexes from 100: the company, its equal-weighted peers and SPY.
    total: list[float | None]
    peers: list[float | None]
    spy: list[float | None]
    filings: list[FilingMark]
    trigger: float | None
    range: PriceRange | None
    first_date: str


class FetchHistoryResult(Strict):
    first_date: str
    days: int


# --- the report's numbers, for the panel's bigger views (report_views.views_for) -------------
# Each item carries its readout, written by readouts.py, so the panel says what the report says.


class FactorItem(Strict):
    name: str
    percentile: int
    # A fraction: 0.3 counts for 30% of the score.
    weight: float
    readout: str


class PeerValue(Strict):
    ticker: str
    value: float
    text: str
    readout: str


class MetricItem(Strict):
    name: str
    label: str
    value: float
    # The value written as the report writes it ("65.2%", "425.8×").
    text: str
    peer_median: float | None
    median_text: str | None
    percentile: int | None
    # Each peer's stored value, highest first.
    peers: list[PeerValue]
    readout: str


class MethodItem(Strict):
    method: str
    label: str
    value: float
    readout: str


class Mark(Strict):
    value: float
    readout: str


class Band(Strict):
    bear: float
    base: float
    bull: float
    readout: str


class ReturnRow(Strict):
    name: str
    # In percent, to one decimal (-3.0 is down 3%); None when it can't be worked out.
    value: float | None
    readout: str


class ReturnSpan(Strict):
    years: Literal[1, 3, 5]
    company: ReturnRow
    # The peer group and each peer are given for 1 year only: peers' prices are stored for
    # about 14 months. `each_peer` is highest first, with None last, and empty otherwise.
    peers: ReturnRow | None
    spy: ReturnRow
    each_peer: list[ReturnRow]


class RedFlagItem(Strict):
    code: str
    label: str
    found: bool
    readout: str


class EconomyItem(Strict):
    series: str
    label: str
    value: str
    date: str
    readout: str


class Slice(Strict):
    key: Literal["buy", "hold", "sell", "kept", "removed"]
    label: str
    count: int
    readout: str
    # One line per item in the slice; None when the run didn't keep the list (a run keeps only
    # the count of each peer rating).
    items: list[str] | None


class Ring(Strict):
    total: int
    slices: list[Slice]


class ReportTable(Strict):
    # The section's key and title.
    key: str
    title: str
    # The stored text of each cell; the first row is the header.
    rows: list[list[str]]


class ReportNumbers(Strict):
    """The report's numbers as data, with what can be worked out from stored data: each peer's
    metric values and 12-month return, and 3- and 5-year total returns where the history is
    stored. A part that isn't stored, or can't be read, is None."""

    report_id: str
    ticker: str
    score_readout: str | None
    factors: list[FactorItem] | None
    metrics: list[MetricItem] | None
    methods: list[MethodItem] | None
    price: Mark | None
    estimate: Mark | None
    range: Band | None
    # 1 year first, then 3 and 5 where both the company's and SPY's history reach back.
    returns: list[ReturnSpan] | None
    red_flags: list[RedFlagItem] | None
    red_flags_readout: str | None
    economy: list[EconomyItem] | None
    peer_ratings: Ring | None
    claims: Ring | None
    # Every table the Full report shows, in its order.
    tables: list[ReportTable]


# --- analyst ratings, from analystdb (data/analystdb.py) -------------------------------------
# Each figure comes with its text as the side panel shows it, worked out by the engine, so the
# panel and the report never round a number differently.


class AnalystSides(Strict):
    buy: int
    hold: int
    sell: int


class AnalystTargets(Strict):
    mean: float | None
    median: float | None
    high: float | None
    low: float | None
    # How many firms have a target.
    n: int


class AnalystFirm(Strict):
    firm: str
    firm_slug: str
    # The firm's own word for its rating ("Overweight"), and the side it counts on.
    label: str
    side: Literal["buy", "hold", "sell"] | None
    target: float | None
    target_text: str
    date: str
    date_text: str
    # Its place among the firms analystdb ranks by track record; None when not ranked.
    rank: int | None
    rank_text: str
    # The average return of its rating calls over the S&P 500; None when too few calls to judge.
    avg_excess: float | None
    excess_text: str
    readout: str


class AnalystChange(Strict):
    date: str
    date_text: str
    firm: str
    # up, down, init, main (maintained) or reit (reiterated).
    action: str
    action_label: str
    from_label: str | None
    to_label: str | None
    rating_text: str
    target_prior: float | None
    target_current: float | None
    target_text: str
    readout: str


class AnalystCheckRow(Strict):
    measure: str
    label: str
    # In dollars, or a count of firms.
    money: bool
    ours: float | None
    theirs: float
    ours_text: str
    theirs_text: str
    diff_fraction: float | None
    gap_text: str
    within_tolerance: bool
    # The tolerance as words: "3%", "3-firm".
    tolerance_text: str
    readout: str


class AnalystCheck(Strict):
    supplier: str
    fetched: str
    fetched_text: str
    rows: list[AnalystCheckRow]


class ReportAnalysts(Strict):
    """analystdb's view of a report's company as of its price date, for the side panel: the
    panel's figures, every firm with its track record, the recent changes and the trust check.
    `state` "down" (analystdb didn't answer) or "missing" (it has nothing for the company) comes
    with the quiet `note` and no parts. A part that failed on its own is None, with its note."""

    report_id: str
    ticker: str
    state: Literal["ok", "down", "missing"]
    note: str | None
    asof: str
    asof_text: str
    rebuilt: bool
    # The data sources that missed analystdb's last evening run.
    stale: list[str]
    n_firms: int | None
    sides: AnalystSides | None
    target: AnalystTargets | None
    firms: list[AnalystFirm] | None
    firms_note: str | None
    ranked_of: int | None
    tracks_asof_text: str | None
    changes: list[AnalystChange] | None
    changes_note: str | None
    check: AnalystCheck | None
    check_note: str | None


class ReportSummary(Strict):
    report_id: str
    run_id: str
    cik: int | None
    ticker: str | None
    name: str | None
    created_at: str
    rating: str | None
    narrative_complete: bool
    # Why the report can only be hidden, never erased (report_marks.py); None when it can be.
    kept_because: Literal["official", "reviewed"] | None


class HideResult(Strict):
    hidden: list[str]
    # Those of them that may be erased once the undo has passed.
    erasable: list[str]


class ShowResult(Strict):
    shown: list[str]


class EraseResult(Strict):
    erased: list[str]
    # Asked for, but left as they are: official, reviewed or not hidden.
    kept: list[str]


class Grade(Strict):
    """One horizon's grade under one version of the grading rules (item 48)."""

    horizon_months: int
    graded_at: str
    grading_version: int
    start_price: float | None
    hit: bool | None
    excess: float | None
    company_return: float | None
    end_date: str | None
    inside_range: bool | None


class PredictionSummary(Strict):
    prediction_id: str
    cik: int
    ticker: str
    run_at: str
    rating: str
    bear: float | None
    base: float | None
    bull: float | None
    grades: list[Grade]


class ReviewResult(Strict):
    review_id: str


class RereadResult(Strict):
    deleted: int


class GradeResult(Strict):
    graded: int
    note: str | None = None


class Service(Strict):
    name: str
    key: str
    cost: str
    sent: str


class LockdownState(Strict):
    """One AI tool's last lock-down check (Technical Plan §4)."""

    version: str | None
    passed: bool
    form: str | None
    checked_at: str | None
    blocked_reason: str | None


class PriceDownload(Strict):
    """The one-time background download of 14 months of prices for every S&P 500 company
    (server._prices_job), as Settings shows it.

    - no_key: it starts once a Massive key is saved.
    - downloading: under way; `days_done` of `days_total` trading days so far, when known.
    - paused: it waits while `paused_for` runs (a report, grading, a full price history
      download, or a safety check), then goes on.
    - stopped: it stopped (`stopped_because`, in plain words) and starts again the next time
      the app opens.
    - off: switched off with `set-setting prices_backfill off`.
    - waiting: not running now; it starts the next time the app opens.
    - done: finished; `companies_ready` of `companies` have the whole 14 months.
    """

    # Titled, so the generated TypeScript keeps `State` for a run's progress.
    state: Literal["no_key", "downloading", "paused", "stopped", "off", "waiting", "done"] = Field(
        title="DownloadState"
    )
    days_done: int | None = None
    days_total: int | None = None
    paused_for: Literal["report", "grading", "history", "safety"] | None = None
    stopped_because: str | None = None
    # S&P 500 companies (SPY isn't counted) with 14 months up to the newest stored session.
    companies_ready: int
    companies: int


class SettingsResult(Strict):
    # "locked": macOS wouldn't hand the stored key over this session (its Keychain question was
    # answered no, or the Keychain is locked).
    keys: dict[str, Literal["set", "missing", "locked"]]
    # Stored keys their service refused on the last call that used them (Settings, home).
    rejected_keys: list[str]
    raw_bytes: int
    raw_cap: float
    backup_dir: str
    backup_in_icloud: bool
    primary_tool: str | None
    sec_contact_email: str | None
    goal1_round: int
    setup_done: bool
    fred_skipped: bool
    services: list[Service]
    price_download: PriceDownload
    lockdown: dict[str, LockdownState] = {}


# --- notifications ----------------------------------------------------------------------------


class Hello(Strict):
    engine_version: str
    protocol_version: int = PROTOCOL_VERSION
    methodology_hash: str
    method_code_version: int


class KeyChecked(Strict):
    proof: str


class SafetyStarted(Strict):
    started: bool


class SafetyProgress(Strict):
    tool: Literal["claude", "codex"]
    n: int
    total: int
    name: str
    ok: bool


class SafetyDone(Strict):
    tool: Literal["claude", "codex"]
    passed: bool
    reason: str | None = None
    # False when the check stopped part way (a usage limit, a sign-out, a crash) and so gave
    # no verdict: the app shows it as not finished, not as failed.
    finished: bool = True


class Progress(Strict):
    run_id: str
    step: int
    step_name: str
    state: Literal["started", "done", "skipped", "retrying", "failed"]


class Tally(Strict):
    """A run's live counts, for the app's progress screen while a report is written. A field
    stays empty until the run gets to it; each note carries the whole tally so far."""

    # Each step's usual time in seconds, from the last few finished runs (empty before the
    # first); the app paces its progress bars and time left by them.
    typical: dict[str, float] | None = None
    # The AI tool that writes the sections, and the other tool that checks them (empty when
    # only one is connected: the writer then checks itself, in a fresh session).
    writer: str | None = None
    checker: str | None = None
    # How many AI calls run at a time (config.AI_CALLS_IN_PARALLEL).
    parallel: int | None = None
    # Step 2: the company and its peers, and what is downloading now.
    companies: int | None = None
    fetching: (
        Literal["prices", "facts", "filings", "peer filings", "rates", "insider trades"] | None
    ) = None
    prices: bool | None = None
    facts: int | None = None
    filings: int | None = None
    rates: bool | None = None
    insider: int | None = None
    # Steps 6 and 8: the company's peer score (a percentile) and its rating.
    score: float | None = None
    rating: str | None = None
    # Step 9: articles downloaded.
    articles: int | None = None
    # Steps 10, 11 and 13: the AI calls done out of all, 5 at a time, and the evidence and
    # claims they found or kept. Step 10's reads start in step 2, as each filing arrives.
    reads_done: int | None = None
    reads_total: int | None = None
    evidence: int | None = None
    sections_done: int | None = None
    sections_total: int | None = None
    checks_done: int | None = None
    checks_total: int | None = None
    claims_kept: int | None = None
    claims_removed: int | None = None
    # The sources, sections or checks under way now, by name.
    now: list[str] | None = None


class RunTally(Strict):
    run_id: str
    tally: Tally


class ReportReady(Strict):
    run_id: str
    report_id: str


class RunFailedNote(Strict):
    run_id: str
    step: str | None
    message: str
    code: Literal[
        "NOT_COVERED",
        "RUN_IN_PROGRESS",
        "NO_TOOL",
        "NOT_RESUMABLE",
        "USAGE_LIMIT",
        "AUTH_EXPIRED",
        "LOCKDOWN_FAILED",
        "AI_UNAVAILABLE",
        "BUDGET_EXHAUSTED",
        "SEC_BLOCKED",
        "ENGINE_ERROR",
    ]
    reset_at: str | None = None
    fix_command: str | None = None


ALL_MODELS: tuple[type[BaseModel], ...] = (
    *METHODS.values(),
    Candidate,
    RunStarted,
    Ok,
    ReportBar,
    ReportResult,
    CompanyRow,
    SearchHit,
    FilingMark,
    PriceRange,
    ChartSeries,
    FetchHistoryResult,
    FactorItem,
    PeerValue,
    MetricItem,
    MethodItem,
    Mark,
    Band,
    ReturnRow,
    ReturnSpan,
    RedFlagItem,
    EconomyItem,
    Slice,
    Ring,
    ReportTable,
    ReportNumbers,
    AnalystSides,
    AnalystTargets,
    AnalystFirm,
    AnalystChange,
    AnalystCheckRow,
    AnalystCheck,
    ReportAnalysts,
    ReportSummary,
    HideResult,
    ShowResult,
    EraseResult,
    Grade,
    PredictionSummary,
    ReviewResult,
    RereadResult,
    GradeResult,
    Service,
    LockdownState,
    PriceDownload,
    SettingsResult,
    KeyChecked,
    SafetyStarted,
    SafetyProgress,
    SafetyDone,
    Hello,
    Progress,
    Tally,
    RunTally,
    ReportReady,
    RunFailedNote,
)


def schema() -> dict[str, Any]:
    """One JSON Schema document with every message, for the TypeScript generator."""
    defs: dict[str, Any] = {}
    for model in ALL_MODELS:
        part = model.model_json_schema(ref_template="#/$defs/{model}")
        defs.update(part.pop("$defs", {}))
        defs[model.__name__] = part
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "TearsheetProtocol",
        "description": f"App-engine protocol, version {PROTOCOL_VERSION}.",
        "$defs": defs,
    }
