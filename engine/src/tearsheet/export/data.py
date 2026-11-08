"""Everything a download needs from one saved report, read once and read-only.

The numbers are the ones the app shows: `report_numbers.numbers_for` and `report_views.views_for`
over the stored report. The claims and their quoted sources come from the stored report text.
Each citation gets its own note number, in report order (section, claim, citation), so note 12
is the same source in the PDF, the deck and the workbook.
"""

from __future__ import annotations

import json
import re
import sqlite3
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import Any

LABEL = "Research data, not investment advice."
# How the stored valuation table names each method, in plain words.
METHOD_LABELS = {
    "DCF": "Discounted cash flow (DCF)",
    "RESIDUAL_INCOME": "Residual income",
    "MULTIPLES": "Peer multiples (P/E, EV/EBIT)",
    "PE": "P/E vs peers",
    "FFO": "Price / FFO vs REITs",
    "P_FFO": "Price / FFO vs REITs",
}
_MONEY = re.compile(r"^-?\$[\d,]+(\.\d+)?$")


class NotFound(LookupError):
    """No saved report with that id, or one with no stored text."""


@dataclass(frozen=True)
class Note:
    number: int
    label: str  # "10-K, Item 1A", "CNBC, 13 Oct 2026", or "Source"
    quote: str | None
    url: str | None  # https only
    section: str  # the title of the section that cites it
    claim_id: str


@dataclass(frozen=True)
class Claim:
    id: str
    text: str
    checker_note: str | None
    notes: tuple[int, ...]


@dataclass(frozen=True)
class Section:
    key: str
    number: int | None
    title: str
    paragraphs: tuple[str, ...]
    table: tuple[tuple[str, ...], ...] | None
    claims: tuple[Claim, ...]


@dataclass(frozen=True)
class Method:
    code: str
    label: str
    value: float | None  # None when the method isn't used
    note: str  # why it isn't used, or ""


@dataclass
class ExportData:
    report_id: str
    run_id: str
    cik: int
    ticker: str
    name: str
    created_at: datetime  # when the report was saved, in the Mac's time zone
    price_day: date | None  # the close the report is priced at
    run_at: str
    mode: str  # "full" or "slice"
    mode_note: str
    sector: str | None
    financial_class: str
    numbers: dict[str, Any]
    views: dict[str, Any]
    sections: list[Section]
    notes: list[Note]
    methods: list[Method]
    prediction: dict[str, Any] | None
    engine_version: str
    method_code_version: int
    methodology_hash: str
    ai_tool: str | None
    split_factor: float  # splits since the price day: 2.0 after a 2-for-1
    methodology: list[str] = field(default_factory=list)
    checks: list[str] = field(default_factory=list)
    skeptic: str | None = None
    filings: list[dict[str, Any]] = field(default_factory=list)

    @property
    def made_on(self) -> date:
        return self.created_at.date()

    @property
    def peer_count(self) -> int | None:
        """Companies in the peer group, the company included (as the report counts them)."""
        ratings = self.views.get("peer_ratings") or {}
        total = ratings.get("total")
        return int(total) if isinstance(total, int | float) and total else None

    def section(self, key: str) -> Section | None:
        return next((s for s in self.sections if s.key == key), None)

    def key_points(self) -> list[tuple[Section, Claim]]:
        """The first surviving claim of each section, as the app's Summary shows them."""
        return [(s, s.claims[0]) for s in self.sections if s.claims]


def day_text(day: date) -> str:
    return f"{day.day} {day:%b %Y}"


def _safe_url(url: Any) -> str | None:
    return url if isinstance(url, str) and url.startswith("https://") else None


def _money(text: str) -> float | None:
    text = text.strip()
    return float(text.replace("$", "").replace(",", "")) if _MONEY.match(text) else None


def _methods(sections: list[Section]) -> list[Method]:
    """Every method in the stored valuation table, used or not, with the reason when not."""
    valuation = next((s for s in sections if s.key == "valuation"), None)
    if valuation is None or not valuation.table or len(valuation.table) < 2:
        return []
    out = []
    for row in valuation.table[1:]:
        code = str(row[0]) if row else ""
        value_text = str(row[1]) if len(row) > 1 else ""
        note = str(row[2]) if len(row) > 2 else ""
        value = _money(value_text)
        if value is None and not note:
            note = value_text
        label = METHOD_LABELS.get(code) or code.replace("_", " ").capitalize()
        out.append(Method(code=code, label=label, value=value, note=note))
    return out


def _sections_and_notes(report: dict[str, Any]) -> tuple[list[Section], list[Note]]:
    from tearsheet.render import _source_labels

    label_of = _source_labels(report)
    notes: list[Note] = []
    sections: list[Section] = []
    for raw in report.get("sections") or []:
        if not isinstance(raw, dict):
            continue
        title = str(raw.get("title") or raw.get("key") or "")
        claims = []
        for sent in raw.get("sentences") or []:
            numbers = []
            for cite in sent.get("citations") or []:
                quote = cite.get("text")
                notes.append(
                    Note(
                        number=len(notes) + 1,
                        label=label_of(cite) or "Source",
                        quote=str(quote) if quote else None,
                        url=_safe_url(cite.get("url")),
                        section=title,
                        claim_id=str(sent.get("id") or ""),
                    )
                )
                numbers.append(len(notes))
            claims.append(
                Claim(
                    id=str(sent.get("id") or ""),
                    text=str(sent.get("text") or ""),
                    checker_note=sent.get("note") or None,
                    notes=tuple(numbers),
                )
            )
        table = raw.get("table")
        sections.append(
            Section(
                key=str(raw.get("key") or ""),
                number=raw.get("number"),
                title=title,
                paragraphs=tuple(str(p) for p in raw.get("paragraphs") or [] if p is not None),
                table=tuple(tuple(str(c) for c in row) for row in table) if table else None,
                claims=tuple(claims),
            )
        )
    return sections, notes


def _split_factor(conn: sqlite3.Connection, cik: int, price_day: date | None) -> float:
    from tearsheet.data.prices import PriceStore, split_factor_after

    if price_day is None:
        return 1.0
    last = conn.execute(
        "SELECT MAX(date) FROM prices_daily WHERE cik = ? AND share_class = ''", (cik,)
    ).fetchone()
    if not last or not last[0]:
        return 1.0
    try:
        return float(
            split_factor_after(
                PriceStore(conn).splits(cik), price_day, up_to=date.fromisoformat(last[0])
            )
        )
    except Exception:  # noqa: BLE001 - an odd split row never stops a download
        return 1.0


def load(conn: sqlite3.Connection, report_id: str) -> ExportData:
    """Read one saved report for a download. Reads only; raises NotFound for an unknown id."""
    from tearsheet.companies import run_company
    from tearsheet.report_numbers import numbers_for, run_price_date
    from tearsheet.report_views import views_for

    row = conn.execute(
        "SELECT r.report_id, r.run_id, r.created_at, u.cik, u.mode, u.engine_version,"
        " u.method_code_version, u.methodology_hash, u.ai_tool"
        " FROM reports r JOIN runs u ON u.run_id = r.run_id WHERE r.report_id = ?",
        (report_id,),
    ).fetchone()
    stored = conn.execute(
        "SELECT json FROM sections WHERE report_id = ? AND key = 'report'", (report_id,)
    ).fetchone()
    if row is None or stored is None or row[3] is None:
        raise NotFound(report_id)
    report = json.loads(stored[0])
    run_id, cik = str(row[1]), int(row[3])
    ticker = str(report.get("ticker") or "")
    numbers = numbers_for(conn, report, run_id, cik, report_id=report_id)
    views = views_for(conn, report, run_id, cik, report_id=report_id, ticker=ticker)
    sections, notes = _sections_and_notes(report)
    company = conn.execute(
        "SELECT sector, financial_class FROM companies WHERE cik = ?", (cik,)
    ).fetchone()
    prediction = conn.execute(
        "SELECT prediction_id, run_at, rating, bear, base, bull, uncertainty FROM predictions"
        " WHERE run_id = ?",
        (run_id,),
    ).fetchone()
    created = datetime.fromisoformat(str(row[2]))
    if created.tzinfo is None:
        created = created.replace(tzinfo=UTC)
    price_day = run_price_date(conn, run_id)
    names = run_company(conn, run_id)
    return ExportData(
        report_id=str(row[0]),
        run_id=run_id,
        cik=cik,
        ticker=ticker,
        name=str(names.get("name") or report.get("company") or ticker),
        created_at=created.astimezone(),
        price_day=price_day,
        run_at=str(report.get("run_at") or ""),
        mode=str(row[4] or ""),
        mode_note=str(report.get("mode_note") or ""),
        sector=(company[0] if company else None) or None,
        financial_class=(company[1] if company else "") or "",
        numbers=numbers,
        views=views,
        sections=sections,
        notes=notes,
        methods=_methods(sections),
        prediction=dict(
            zip(
                ("prediction_id", "run_at", "rating", "bear", "base", "bull", "uncertainty"),
                prediction,
                strict=True,
            )
        )
        if prediction
        else None,
        engine_version=str(row[5] or ""),
        method_code_version=int(row[6] or 0),
        methodology_hash=str(row[7] or ""),
        ai_tool=row[8],
        split_factor=_split_factor(conn, cik, price_day),
        methodology=[str(x) for x in report.get("methodology") or []],
        checks=[str(x) for x in report.get("checks") or []],
        skeptic=report.get("skeptic") or None,
        filings=[f for f in report.get("filings") or [] if isinstance(f, dict)],
    )
