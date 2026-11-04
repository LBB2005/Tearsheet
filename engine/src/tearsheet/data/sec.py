"""The one SEC client (design item 6).

Every SEC download goes through `http.py` (one rate limiter, the contact string) and
`rawstore.py`. The re-download rule:

| What                                   | Downloaded again                              |
| `company_tickers.json`, submissions,   | when the stored copy is from before today     |
| company facts                          | (US Eastern date)                             |
| filing documents and Form 4 filings    | never; the stored copy is reused              |

edgartools only splits documents this client has already stored, and makes no requests.
"""

from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import date, timedelta
from html.parser import HTMLParser
from typing import Any

from tearsheet.http import EASTERN, HttpClient, eastern_today
from tearsheet.rawstore import RawStore

TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik:010d}.json"
SUBMISSIONS_PAGE_URL = "https://data.sec.gov/submissions/{name}"
COMPANY_FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"
ARCHIVE_URL = "https://www.sec.gov/Archives/edgar/data/{cik}/{folder}/{name}"
SEC_SITE = "https://www.sec.gov"

# Which edgartools route splits stored filings without network access (item 6, in order of
# preference: "parse_html", then "local_storage", then the engine's own heading split).
# Confirmed in Phase 0.
EDGARTOOLS_ROUTE = "parse_html"

EARNINGS_ITEM = "2.02"
MAJOR_EVENT_ITEMS = frozenset({"1.01", "2.01", "4.02", "5.02"})
PRESS_RELEASE_DAYS = 30
MAJOR_EVENT_DAYS = 365
MAX_PRESS_RELEASES = 5
FORM4_RECENT_DAYS = 183
FORM4_HISTORY_DAYS = 3 * 365
# How far back the company's filing list must reach: last year's 10-K is filed
# 12 to 24 months before today.
FILING_HISTORY_DAYS = 800
YEAR_TOLERANCE_DAYS = 45

EX_99_1 = re.compile(r"^EX-99(\.0?1)?$", re.IGNORECASE)
EX_13 = re.compile(r"^EX-13(\.\d+)?$", re.IGNORECASE)


@dataclass(frozen=True)
class Filing:
    cik: int
    accession: str
    form: str
    filed: date
    report_date: date | None
    accepted: str
    items: tuple[str, ...]
    primary_document: str

    @property
    def folder(self) -> str:
        return self.accession.replace("-", "")

    def url(self, name: str) -> str:
        return ARCHIVE_URL.format(cik=self.cik, folder=self.folder, name=name)

    @property
    def index_url(self) -> str:
        return self.url(f"{self.accession}-index.htm")


def _date(text: str | None) -> date | None:
    return date.fromisoformat(text) if text else None


def filings_from(block: dict[str, Any], cik: int) -> list[Filing]:
    """Filings from one submissions block (`filings.recent`, or an older page)."""
    accessions = block.get("accessionNumber", [])
    count = len(accessions)

    def column(name: str) -> list[Any]:
        values = block.get(name) or []
        return list(values) + [""] * (count - len(values))

    forms, filed, reports = column("form"), column("filingDate"), column("reportDate")
    accepted, items, primary = (
        column("acceptanceDateTime"),
        column("items"),
        column("primaryDocument"),
    )
    out = []
    for i in range(count):
        out.append(
            Filing(
                cik=cik,
                accession=accessions[i],
                form=forms[i],
                filed=date.fromisoformat(filed[i]),
                report_date=_date(reports[i]),
                accepted=accepted[i] or "",
                items=tuple(part.strip() for part in (items[i] or "").split(",") if part.strip()),
                primary_document=primary[i] or "",
            )
        )
    return out


# --- choosing filings ------------------------------------------------------------


def latest(filings: Iterable[Filing], form: str, *, item: str | None = None) -> Filing | None:
    chosen = [f for f in filings if f.form == form and (item is None or item in f.items)]
    return max(chosen, key=lambda f: (f.filed, f.accession), default=None)


def year_earlier(
    filings: Iterable[Filing],
    anchor: Filing,
    *,
    by_report_date: bool = False,
    item: str | None = None,
) -> Filing | None:
    """The filing of the same form closest to one year before `anchor`, within 45 days."""

    def when(f: Filing) -> date | None:
        return f.report_date if by_report_date else f.filed

    anchor_date = when(anchor)
    if anchor_date is None:
        return None
    target = anchor_date - timedelta(days=365)
    best: tuple[int, Filing] | None = None
    for f in filings:
        if f.form != anchor.form or f.accession == anchor.accession:
            continue
        if item is not None and item not in f.items:
            continue
        moment = when(f)
        if moment is None:
            continue
        gap = abs((moment - target).days)
        if gap <= YEAR_TOLERANCE_DAYS and (best is None or gap < best[0]):
            best = (gap, f)
    return best[1] if best else None


def previous(filings: Iterable[Filing], anchor: Filing) -> Filing | None:
    """The newest filing of the same form filed before `anchor` (last year's 10-K)."""
    older = [f for f in filings if f.form == anchor.form and f.filed < anchor.filed]
    return max(older, key=lambda f: (f.filed, f.accession), default=None)


def press_release_filings(
    filings: Iterable[Filing], today: date, *, exclude: Filing | None = None
) -> list[tuple[str, Filing]]:
    """The press releases read besides the latest earnings release (item 7), newest first.

    Exhibit 99.1 of each 8-K filed in the last 30 days, and the primary document plus any
    Exhibit 99.1 of 8-Ks with Items 1.01, 2.01, 4.02 or 5.02 in the last 12 months. At most 5.
    Returns (kind, filing), where kind is "recent 8-K" or "major-event 8-K".
    """
    chosen: dict[str, tuple[str, Filing]] = {}
    for f in sorted(filings, key=lambda f: (f.filed, f.accession), reverse=True):
        if f.form != "8-K" or (exclude and f.accession == exclude.accession):
            continue
        age = (today - f.filed).days
        if MAJOR_EVENT_ITEMS & set(f.items) and age <= MAJOR_EVENT_DAYS:
            chosen.setdefault(f.accession, ("major-event 8-K", f))
        elif age <= PRESS_RELEASE_DAYS:
            chosen.setdefault(f.accession, ("recent 8-K", f))
    return list(chosen.values())[:MAX_PRESS_RELEASES]


# --- filing index pages ------------------------------------------------------------


@dataclass(frozen=True)
class IndexEntry:
    description: str
    name: str
    doc_type: str
    url: str


class _IndexTable(HTMLParser):
    """Reads the rows of the document tables (class "tableFile") on a filing's index page."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: list[tuple[list[str], list[str | None]]] = []
        self._in_table = False
        self._cells: list[str] | None = None
        self._links: list[str | None] = []
        self._cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "table" and "tablefile" in (attributes.get("class") or "").lower():
            self._in_table = True
        elif self._in_table and tag == "tr":
            self._cells, self._links = [], []
        elif self._in_table and tag == "td" and self._cells is not None:
            self._cell = []
            self._links.append(None)
        elif self._in_table and tag == "a" and self._cell is not None and self._links:
            self._links[-1] = attributes.get("href")

    def handle_endtag(self, tag: str) -> None:
        if tag == "table":
            self._in_table = False
        elif tag == "td" and self._cell is not None and self._cells is not None:
            self._cells.append(" ".join("".join(self._cell).split()))
            self._cell = None
        elif tag == "tr" and self._cells:
            self.rows.append((self._cells, self._links))
            self._cells = None

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell.append(data)


def parse_filing_index(html: str) -> list[IndexEntry]:
    """The documents listed on a filing's `-index.htm` page, with their types (EX-99.1 ...)."""
    table = _IndexTable()
    table.feed(html)
    entries = []
    for cells, links in table.rows:
        if len(cells) < 4:
            continue
        href = next((link for link in links if link), None)
        if not href:
            continue
        href = href.removeprefix("/ix?doc=")
        url = href if href.startswith("http") else SEC_SITE + href
        entries.append(
            IndexEntry(
                description=cells[1], name=url.rsplit("/", 1)[-1], doc_type=cells[3], url=url
            )
        )
    return entries


# --- Form 4 ----------------------------------------------------------------------


def form4_xml_name(primary_document: str) -> str:
    """Submissions name the rendered page (`xslF345X05/form4.xml`); the raw XML drops the folder."""
    return primary_document.rsplit("/", 1)[-1]


def has_open_market_purchase(xml: bytes) -> bool:
    """Whether a Form 4 reports a purchase (transaction code P) of non-derivative shares."""
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return False
    path = ".//nonDerivativeTable/nonDerivativeTransaction/transactionCoding/transactionCode"
    return any((code.text or "").strip() == "P" for code in root.iterfind(path))


# --- the client ----------------------------------------------------------------------


@dataclass(frozen=True)
class StoredDoc:
    role: str
    filing: Filing
    doc_type: str
    url: str
    raw_hash: str


@dataclass
class SECBundle:
    """What one report's SEC step fetched (Technical Plan §3 step 2)."""

    cik: int
    documents: list[StoredDoc] = field(default_factory=list)
    facts: dict[int, str] = field(default_factory=dict)
    form4_count: int = 0
    form4_purchase: bool = False

    def find(self, role: str, *, doc_type: str | None = None) -> StoredDoc | None:
        for doc in self.documents:
            if doc.role == role and (doc_type is None or doc.doc_type == doc_type):
                return doc
        return None


class SECClient:
    def __init__(
        self, http: HttpClient, rawstore: RawStore, *, today: Callable[[], date] = eastern_today
    ):
        self._http = http
        self._store = rawstore
        self._today = today

    @property
    def run_id(self) -> str:
        return self._http.run_id

    async def _daily(self, url: str, kind: str, expect: str = "json") -> tuple[str, bytes]:
        fetched_at = self._store.latest_fetched_at(url)
        if fetched_at is not None and fetched_at.astimezone(EASTERN).date() >= self._today():
            raw_hash = self._store.reuse(url, self.run_id)
            if raw_hash:
                return raw_hash, self._store.get(raw_hash)
        fetched = await self._http.fetch("sec", url, kind=kind, expect=expect)
        return fetched.raw_hash, fetched.body

    async def _permanent(self, url: str, kind: str, expect: str = "text") -> tuple[str, bytes]:
        raw_hash = self._store.reuse(url, self.run_id)
        if raw_hash:
            return raw_hash, self._store.get(raw_hash)
        fetched = await self._http.fetch("sec", url, kind=kind, expect=expect)
        return fetched.raw_hash, fetched.body

    async def company_tickers(self) -> dict[str, Any]:
        return json.loads((await self._daily(TICKERS_URL, "company_tickers"))[1])

    async def submissions(self, cik: int) -> dict[str, Any]:
        return json.loads((await self._daily(SUBMISSIONS_URL.format(cik=cik), "submissions"))[1])

    async def company_facts(self, cik: int) -> tuple[str, dict[str, Any]]:
        raw_hash, body = await self._daily(COMPANY_FACTS_URL.format(cik=cik), "company_facts")
        return raw_hash, json.loads(body)

    async def filings(self, cik: int, *, since: date) -> list[Filing]:
        """The company's filings back to `since`, newest first, reading older pages if needed."""
        submissions = await self.submissions(cik)
        found = filings_from(submissions.get("filings", {}).get("recent", {}), cik)
        oldest = min((f.filed for f in found), default=None)
        if oldest is None or oldest > since:
            for page in submissions.get("filings", {}).get("files", []):
                if date.fromisoformat(page["filingTo"]) < since:
                    continue
                url = SUBMISSIONS_PAGE_URL.format(name=page["name"])
                found += filings_from(json.loads((await self._daily(url, "submissions"))[1]), cik)
        return sorted(
            (f for f in found if f.filed >= since),
            key=lambda f: (f.filed, f.accession),
            reverse=True,
        )

    async def filing_index(self, filing: Filing) -> list[IndexEntry]:
        _, body = await self._permanent(filing.index_url, "filing_index", "html")
        return parse_filing_index(body.decode("utf-8", errors="replace"))

    async def filing_documents(
        self,
        role: str,
        filing: Filing,
        *,
        primary: bool = True,
        exhibit: re.Pattern[str] | None = None,
    ) -> list[StoredDoc]:
        """A filing's index page, its primary document and the exhibits matching `exhibit`."""
        index = await self.filing_index(filing)
        wanted: list[tuple[str, str]] = []
        if primary and filing.primary_document:
            wanted.append((filing.form, filing.url(filing.primary_document)))
        if exhibit is not None:
            wanted += [(e.doc_type, e.url) for e in index if exhibit.match(e.doc_type)]
        docs = []
        for doc_type, url in wanted:
            kind = "filing_document" if doc_type == filing.form else "exhibit"
            raw_hash, _ = await self._permanent(url, kind, "text")
            docs.append(StoredDoc(role, filing, doc_type, url, raw_hash))
        return docs

    async def form4s(self, filings: list[Filing]) -> tuple[int, bool]:
        """Fetch each Form 4's XML once. Returns (count, whether any reports a purchase)."""
        purchase = False
        for f in filings:
            _, body = await self._permanent(
                f.url(form4_xml_name(f.primary_document)), "form4", "xml"
            )
            purchase = purchase or has_open_market_purchase(body)
        return len(filings), purchase

    async def fetch_for_report(
        self, cik: int, peer_ciks: list[int], *, trend_peers: int = 3
    ) -> SECBundle:
        """The SEC part of a report's fetch step (Technical Plan §3 step 2).

        `peer_ciks` is ordered largest first; the first `trend_peers` also give their
        latest 10-K for the sector trends.
        """
        today = self._today()
        bundle = SECBundle(cik=cik)
        await self.company_tickers()

        filings = await self.filings(cik, since=today - timedelta(days=FILING_HISTORY_DAYS))
        bundle.facts[cik] = (await self.company_facts(cik))[0]

        ten_k = latest(filings, "10-K")
        ten_q = latest(filings, "10-Q")
        earnings = latest(filings, "8-K", item=EARNINGS_ITEM)
        chosen: list[tuple[str, Filing | None, re.Pattern[str] | None]] = [
            ("10-K", ten_k, EX_13),
            ("10-K prior", previous(filings, ten_k) if ten_k else None, EX_13),
            ("10-Q", ten_q, None),
            (
                "10-Q prior",
                year_earlier(filings, ten_q, by_report_date=True) if ten_q else None,
                None,
            ),
            ("earnings 8-K", earnings, EX_99_1),
            (
                "earnings 8-K prior",
                year_earlier(filings, earnings, item=EARNINGS_ITEM) if earnings else None,
                EX_99_1,
            ),
        ]
        for role, filing, exhibit in chosen:
            if filing is not None:
                bundle.documents += await self.filing_documents(role, filing, exhibit=exhibit)

        for kind, filing in press_release_filings(filings, today, exclude=earnings):
            bundle.documents += await self.filing_documents(
                kind, filing, primary=kind == "major-event 8-K", exhibit=EX_99_1
            )

        recent_cutoff = today - timedelta(days=FORM4_RECENT_DAYS)
        recent_form4s = [f for f in filings if f.form == "4" and f.filed >= recent_cutoff]
        count, purchase = await self.form4s(recent_form4s)
        if purchase:
            history = await self.filings(
                cik, since=recent_cutoff - timedelta(days=FORM4_HISTORY_DAYS)
            )
            older = [f for f in history if f.form == "4" and f.filed < recent_cutoff]
            more, _ = await self.form4s(older)
            count += more
        bundle.form4_count, bundle.form4_purchase = count, purchase

        for i, peer in enumerate(peer_ciks):
            bundle.facts[peer] = (await self.company_facts(peer))[0]
            if i < trend_peers:
                peer_filings = await self.filings(
                    peer, since=today - timedelta(days=FILING_HISTORY_DAYS)
                )
                peer_10k = latest(peer_filings, "10-K")
                if peer_10k is not None:
                    bundle.documents += await self.filing_documents(
                        "peer 10-K", peer_10k, exhibit=EX_13
                    )
        return bundle


# --- splitting stored filings (edgartools, route 1) -------------------------------------

AUDITOR_HEADING = re.compile(
    r"report\s+of\s+independent\s+registered\s+public\s+accounting\s+firm", re.I
)
AUDITOR_REPORT_CHARS = 20_000


def decode_filing(body: bytes) -> str:
    try:
        return body.decode("utf-8")
    except UnicodeDecodeError:
        return body.decode("cp1252", errors="replace")


def split_sections(html: bytes | str, form: str) -> dict[str, str]:
    """A stored 10-K or 10-Q split into sections by edgartools' parser. Makes no requests.

    Keys are "Item 1A" for a 10-K and "Part I Item 2" for a 10-Q.
    """
    from edgar.documents import ParserConfig, parse_html

    text = decode_filing(html) if isinstance(html, bytes) else html
    document = parse_html(text, ParserConfig(form=form))
    sections: dict[str, str] = {}
    for name in document.sections.keys():
        section = document.sections[name]
        if not section.item:
            continue
        key = (
            f"Item {section.item}" if form == "10-K" else f"Part {section.part} Item {section.item}"
        )
        sections.setdefault(key, section.text())
    return sections


def auditor_report(sections: dict[str, str]) -> str | None:
    """The auditor's report inside Item 8, when the heading is found."""
    text = sections.get("Item 8", "")
    match = AUDITOR_HEADING.search(text)
    return text[match.start() : match.start() + AUDITOR_REPORT_CHARS] if match else None
