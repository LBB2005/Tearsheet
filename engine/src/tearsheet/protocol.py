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
    key: Literal["raw_cap", "backup_dir", "primary_tool", "sec_contact_email", "goal1_round"]
    value: str


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


class ReportSummary(Strict):
    report_id: str
    run_id: str
    cik: int | None
    ticker: str | None
    name: str | None
    created_at: str
    rating: str | None
    narrative_complete: bool


class PredictionSummary(Strict):
    prediction_id: str
    cik: int
    ticker: str
    run_at: str
    rating: str
    bear: float | None
    base: float | None
    bull: float | None
    grades: list[dict[str, Any]]


class ReviewResult(Strict):
    review_id: str


class RereadResult(Strict):
    deleted: int


class Service(Strict):
    name: str
    key: str
    cost: str
    sent: str


class SettingsResult(Strict):
    keys: dict[str, Literal["set", "missing"]]
    raw_bytes: int
    raw_cap: float
    backup_dir: str
    backup_in_icloud: bool
    primary_tool: str | None
    sec_contact_email: str | None
    goal1_round: int
    services: list[Service]


# --- notifications ----------------------------------------------------------------------------


class Hello(Strict):
    engine_version: str
    protocol_version: int = PROTOCOL_VERSION
    methodology_hash: str
    method_code_version: int


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
    ReportSummary,
    PredictionSummary,
    ReviewResult,
    RereadResult,
    Service,
    SettingsResult,
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
