"""App ↔ engine messages (design item 37, Technical Plan §2).

JSON-RPC 2.0, one JSON object per line. Standard output carries protocol messages only. These
Pydantic models are the one definition of every message; `scripts/gen-types.sh` turns them
into the app's TypeScript types (item 46).
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

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
    column: Literal["both", "numbers", "text"] = "both"


class SearchParams(Strict):
    query: str
    limit: int = 5


class ChartParams(Strict):
    report_id: str


class HistoryParams(Strict):
    report_id: str


class ListReportsParams(Strict):
    limit: int = 50
    offset: int = 0


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
}


# --- results ------------------------------------------------------------------------------------


class Candidate(Strict):
    cik: int
    name: str
    ticker: str


class RunStarted(Strict):
    run_id: str


class Ok(Strict):
    ok: bool


class ReportResult(Strict):
    report_id: str
    run_id: str
    ticker: str
    created_at: str
    narrative_complete: bool
    html: str


class CompanyRow(Strict):
    cik: int
    ticker: str
    name: str
    report_id: str
    report_date: str
    reports: int
    price: float | None
    price_date: str | None


class SearchHit(Strict):
    ticker: str
    name: str
    sector: str | None
    cik: int
    report_id: str | None
    report_date: str | None


class FilingMark(Strict):
    date: str
    form: str


class PriceRange(Strict):
    bear: float
    base: float
    bull: float


class ChartSeries(Strict):
    dates: list[str]
    close: list[float]
    volume: list[int]
    peers: list[float | None]
    spy: list[float | None]
    filings: list[FilingMark]
    trigger: float | None
    range: PriceRange | None
    first_date: str


class FetchHistoryResult(Strict):
    first_date: str
    days: int


class ReportSummary(Strict):
    report_id: str
    run_id: str
    cik: int | None
    ticker: str | None
    name: str | None
    created_at: str
    rating: str | None
    narrative_complete: bool


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


class SettingsResult(Strict):
    keys: dict[str, Literal["set", "missing"]]
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


class Progress(Strict):
    run_id: str
    step: int
    step_name: str
    state: Literal["started", "done", "skipped", "retrying", "failed"]


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
    ReportResult,
    CompanyRow,
    SearchHit,
    FilingMark,
    PriceRange,
    ChartSeries,
    FetchHistoryResult,
    ReportSummary,
    Grade,
    PredictionSummary,
    ReviewResult,
    RereadResult,
    GradeResult,
    Service,
    LockdownState,
    SettingsResult,
    KeyChecked,
    SafetyStarted,
    SafetyProgress,
    SafetyDone,
    Hello,
    Progress,
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
