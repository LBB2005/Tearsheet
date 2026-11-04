"""The SEC client (design item 13: test_sec.py)."""

from __future__ import annotations

import asyncio
import re
from collections import Counter
from datetime import UTC, date, datetime, timedelta

import httpx
import pytest
import respx

from tearsheet.data.sec import (
    Filing,
    SECClient,
    auditor_report,
    has_open_market_purchase,
    parse_filing_index,
    press_release_filings,
    split_sections,
    year_earlier,
)
from tearsheet.http import HttpClient
from tearsheet.rawstore import RawStore

TODAY = date(2026, 11, 3)
COMPANY = 320193
PEERS = [789019, 1045810]
UA = "Tearsheet/0.0.1 test@example.com"
FILLER = " ".join(["The company sells widgets and services to customers around the world."] * 30)


def rows_for(cik: int) -> list[tuple[str, str, str, str, str, str]]:
    stem = f"{cik:010d}"
    return [
        (f"{stem}-26-000010", "4", "2026-09-01", "2026-08-29", "", "xslF345X05/wk-form4_1.xml"),
        (f"{stem}-26-000009", "10-K", "2026-10-31", "2026-09-26", "", "co-20260926.htm"),
        (f"{stem}-26-000008", "8-K", "2026-10-30", "2026-10-30", "2.02,9.01", "earn-20261030.htm"),
        (f"{stem}-26-000007", "10-Q", "2026-08-01", "2026-06-27", "", "co-20260627.htm"),
        (f"{stem}-25-000009", "10-K", "2025-10-31", "2025-09-27", "", "co-20250927.htm"),
        (f"{stem}-25-000008", "8-K", "2025-10-30", "2025-10-30", "2.02,9.01", "earn-20251030.htm"),
        (f"{stem}-25-000007", "10-Q", "2025-08-01", "2025-06-28", "", "co-20250628.htm"),
    ]


def submissions(cik: int) -> dict:
    rows = rows_for(cik)
    return {
        "cik": str(cik),
        "filings": {
            "recent": {
                "accessionNumber": [r[0] for r in rows],
                "form": [r[1] for r in rows],
                "filingDate": [r[2] for r in rows],
                "reportDate": [r[3] for r in rows],
                "acceptanceDateTime": [f"{r[2]}T16:30:00.000Z" for r in rows],
                "items": [r[4] for r in rows],
                "primaryDocument": [r[5] for r in rows],
            },
            "files": [],
        },
    }


FORMS = {r[0].replace("-", ""): (r[1], r[5]) for cik in [COMPANY, *PEERS] for r in rows_for(cik)}


def index_page(cik: str, folder: str) -> str:
    form, primary = FORMS[folder]
    rows = [(form, primary)]
    if form == "8-K":
        rows.append(("EX-99.1", "ex99-1.htm"))
    cells = "".join(
        f'<tr><td>{n}</td><td>doc</td><td><a href="/ix?doc=/Archives/edgar/data/{cik}/{folder}/{name}">'
        f"{name}</a></td><td>{doc_type}</td><td>100</td></tr>"
        for n, (doc_type, name) in enumerate(rows, start=1)
    )
    return (
        '<html><body><table class="tableFile" summary="Document Format Files">'
        "<tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th><th>Size</th></tr>"
        f"{cells}</table></body></html>"
    )


def archive(request: httpx.Request) -> httpx.Response:
    match = re.match(r"/Archives/edgar/data/(\d+)/(\d+)/(.+)$", request.url.path)
    assert match, request.url
    cik, folder, name = match.groups()
    if name.endswith("-index.htm"):
        return httpx.Response(200, html=index_page(cik, folder))
    if name.endswith(".xml"):
        xml = "<ownershipDocument><nonDerivativeTable><nonDerivativeTransaction><transactionCoding>"
        xml += "<transactionCode>S</transactionCode></transactionCoding></nonDerivativeTransaction>"
        xml += "</nonDerivativeTable></ownershipDocument>"
        return httpx.Response(200, content=xml.encode(), headers={"content-type": "text/xml"})
    return httpx.Response(200, html=f"<html><body><p>{name}</p></body></html>")


def mock_edgar(mock: respx.MockRouter) -> None:
    mock.get("https://www.sec.gov/files/company_tickers.json").mock(
        return_value=httpx.Response(
            200, json={"0": {"cik_str": COMPANY, "ticker": "AAPL", "title": "Apple"}}
        )
    )
    mock.get(url__regex=r"https://data\.sec\.gov/submissions/CIK(?P<cik>\d{10})\.json").mock(
        side_effect=lambda request, cik: httpx.Response(200, json=submissions(int(cik)))
    )
    mock.get(url__regex=r"https://data\.sec\.gov/api/xbrl/companyfacts/CIK\d{10}\.json").mock(
        return_value=httpx.Response(200, json={"facts": {}})
    )
    mock.get(url__regex=r"https://www\.sec\.gov/Archives/edgar/data/.*").mock(side_effect=archive)


def fetch(database, raw_dir, *, run_id: str, today: date, now: datetime):
    store = RawStore(raw_dir, database.conn, now=lambda: now)

    async def go():
        async with HttpClient(
            store, run_id, sec_user_agent=UA, sleep=lambda s: asyncio.sleep(0)
        ) as http:
            bundle = await SECClient(http, store, today=lambda: today).fetch_for_report(
                COMPANY, PEERS
            )
            return bundle, Counter(
                {kind: n for (svc, kind), n in http.requests.items() if svc == "sec"}
            )

    return asyncio.run(go())


def test_first_run_fetches_the_report_filings(database, tmp_path):
    with respx.mock as mock:
        mock_edgar(mock)
        bundle, requests = fetch(
            database,
            tmp_path / "raw",
            run_id="first",
            today=TODAY,
            now=datetime(2026, 11, 3, 15, tzinfo=UTC),
        )
    roles = Counter(doc.role for doc in bundle.documents)
    assert roles == {
        "10-K": 1,
        "10-K prior": 1,
        "10-Q": 1,
        "10-Q prior": 1,
        "earnings 8-K": 2,  # primary document and Exhibit 99.1
        "earnings 8-K prior": 2,
        "peer 10-K": 2,
    }
    assert bundle.find("10-K", doc_type="10-K").filing.accession.endswith("26-000009")
    assert bundle.find("10-K prior").filing.accession.endswith("25-000009")
    assert set(bundle.facts) == {COMPANY, *PEERS}
    assert bundle.form4_count == 1 and not bundle.form4_purchase
    assert requests["company_facts"] == 3
    assert requests["submissions"] == 3
    assert requests["form4"] == 1


def test_a_second_run_on_the_same_day_makes_no_requests(database, tmp_path):
    now = datetime(2026, 11, 3, 15, tzinfo=UTC)
    with respx.mock as mock:
        mock_edgar(mock)
        fetch(database, tmp_path / "raw", run_id="first", today=TODAY, now=now)
        bundle, requests = fetch(database, tmp_path / "raw", run_id="second", today=TODAY, now=now)
    assert sum(requests.values()) == 0
    assert len(bundle.documents) == 10
    used = database.conn.execute(
        "SELECT COUNT(*) FROM fetch_log WHERE run_id = 'second'"
    ).fetchone()[0]
    assert used > 0  # the reused copies are still logged against the run, for replay


def test_next_day_downloads_only_the_daily_files_again(database, tmp_path):
    with respx.mock as mock:
        mock_edgar(mock)
        fetch(
            database,
            tmp_path / "raw",
            run_id="first",
            today=TODAY,
            now=datetime(2026, 11, 3, 15, tzinfo=UTC),
        )
        _, requests = fetch(
            database,
            tmp_path / "raw",
            run_id="next-day",
            today=TODAY + timedelta(days=1),
            now=datetime(2026, 11, 4, 15, tzinfo=UTC),
        )
    assert set(requests) == {"company_tickers", "submissions", "company_facts"}
    assert requests["company_facts"] == 3


# --- edgartools reads only stored documents -------------------------------------------------

TEN_K_HEADINGS = [
    "PART I",
    "Item 1. Business",
    "Item 1A. Risk Factors",
    "Item 1B. Unresolved Staff Comments",
    "Item 3. Legal Proceedings",
    "PART II",
    "Item 7. Management's Discussion and Analysis of Financial Condition and Results of Operations",
    "Item 7A. Quantitative and Qualitative Disclosures About Market Risk",
    "Item 8. Financial Statements and Supplementary Data",
    "Report of Independent Registered Public Accounting Firm",
    "Item 9A. Controls and Procedures",
    "Item 9B. Other Information",
]
TEN_Q_HEADINGS = [
    "PART I. FINANCIAL INFORMATION",
    "Item 1. Financial Statements",
    "Item 2. Management's Discussion and Analysis of Financial Condition and Results of Operations",
    "Item 3. Quantitative and Qualitative Disclosures About Market Risk",
    "Item 4. Controls and Procedures",
    "PART II. OTHER INFORMATION",
    "Item 1A. Risk Factors",
]


def filing_html(headings: list[str]) -> bytes:
    body = "".join(f"<p><b>{h}</b></p><p>{FILLER}</p><p>{FILLER}</p>" for h in headings)
    return f"<html><body>{body}</body></html>".encode()


def test_edgartools_reads_only_stored_documents(rawstore, monkeypatch):
    ten_k = rawstore.put(
        filing_html(TEN_K_HEADINGS), "https://www.sec.gov/k.htm", "sec", "text/html", "r"
    )
    ten_q = rawstore.put(
        filing_html(TEN_Q_HEADINGS), "https://www.sec.gov/q.htm", "sec", "text/html", "r"
    )
    attempts: list[str] = []

    def refuse(self, request, *args, **kwargs):
        attempts.append(str(request.url))
        raise AssertionError("edgartools tried to make a request")

    monkeypatch.setattr(httpx.Client, "send", refuse)
    monkeypatch.setattr(httpx.AsyncClient, "send", refuse)

    k = split_sections(rawstore.get(ten_k), "10-K")
    q = split_sections(rawstore.get(ten_q), "10-Q")
    for item in ("Item 1", "Item 1A", "Item 7", "Item 9A"):
        assert len(k[item]) > 1000, item
    assert auditor_report(k) is not None
    assert len(q["Part I Item 2"]) > 1000
    assert attempts == []


# --- choosing filings and reading index pages ---------------------------------------------------


def filing(
    form: str, filed: str, *, items: str = "", report: str | None = None, n: int = 1
) -> Filing:
    return Filing(
        cik=1,
        accession=f"0000000001-{filed[2:4]}-{n:06d}",
        form=form,
        filed=date.fromisoformat(filed),
        report_date=date.fromisoformat(report) if report else None,
        accepted="",
        items=tuple(items.split(",")) if items else (),
        primary_document="doc.htm",
    )


def test_year_earlier_finds_the_filing_closest_to_a_year_back():
    latest = filing("10-Q", "2026-08-01", report="2026-06-27", n=1)
    candidates = [
        latest,
        filing("10-Q", "2026-05-01", report="2026-03-28", n=2),
        filing("10-Q", "2025-08-01", report="2025-06-28", n=3),
        filing("10-Q", "2024-08-01", report="2024-06-29", n=4),
    ]
    assert year_earlier(candidates, latest, by_report_date=True).accession.endswith("000003")
    assert year_earlier([latest], latest, by_report_date=True) is None


def test_press_releases_are_recent_8ks_and_major_events():
    earnings = filing("8-K", "2026-10-30", items="2.02,9.01", n=1)
    chosen = press_release_filings(
        [
            earnings,
            filing("8-K", "2026-10-20", items="8.01", n=2),  # recent
            filing("8-K", "2026-06-01", items="5.02", n=3),  # major event this year
            filing("8-K", "2026-06-02", items="8.01", n=4),  # neither
            filing("8-K", "2025-06-01", items="1.01", n=5),  # major event, too old
        ],
        TODAY,
        exclude=earnings,
    )
    assert [(kind, f.accession[-1]) for kind, f in chosen] == [
        ("recent 8-K", "2"),
        ("major-event 8-K", "3"),
    ]


def test_filing_index_reads_document_types_and_ixbrl_links():
    entries = parse_filing_index(index_page(str(COMPANY), f"{COMPANY:010d}26000008"))
    assert [(e.doc_type, e.name) for e in entries] == [
        ("8-K", "earn-20261030.htm"),
        ("EX-99.1", "ex99-1.htm"),
    ]
    assert entries[0].url == (
        f"https://www.sec.gov/Archives/edgar/data/{COMPANY}/{COMPANY:010d}26000008/earn-20261030.htm"
    )


@pytest.mark.parametrize(("code", "expected"), [("P", True), ("S", False)])
def test_form4_purchase_detection(code, expected):
    xml = (
        "<ownershipDocument><nonDerivativeTable><nonDerivativeTransaction><transactionCoding>"
        f"<transactionCode>{code}</transactionCode></transactionCoding></nonDerivativeTransaction>"
        "</nonDerivativeTable></ownershipDocument>"
    ).encode()
    assert has_open_market_purchase(xml) is expected
    assert has_open_market_purchase(b"not xml") is False
