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
    filed_for_months,
    parse_filing_index,
    press_release_filings,
    purchase_months,
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


def form4_xml(code: str, transaction_date: str) -> bytes:
    return (
        "<ownershipDocument><nonDerivativeTable><nonDerivativeTransaction>"
        f"<transactionDate><value>{transaction_date}</value></transactionDate>"
        f"<transactionCoding><transactionCode>{code}</transactionCode></transactionCoding>"
        "</nonDerivativeTransaction></nonDerivativeTable></ownershipDocument>"
    ).encode()


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
        # A file named buy-YYYY-MM-DD.xml reports an open-market purchase on that date.
        bought = re.match(r"buy-(\d{4}-\d{2}-\d{2})\.xml$", name)
        xml = form4_xml("P", bought.group(1)) if bought else form4_xml("S", "2026-08-29")
        return httpx.Response(200, content=xml, headers={"content-type": "text/xml"})
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


def test_a_recent_purchase_fetches_only_the_same_months_in_earlier_years(
    database, tmp_path, monkeypatch
):
    # A purchase on 2026-10-02 (recent). The routine test asks whether this insider bought
    # in October of each prior year, so only older Form 4s filed in October (or in the
    # first days of November, for late-October trades) are needed. Phase 0 found CAT
    # fetching all 292 older Form 4s instead.
    stem = f"{COMPANY:010d}"
    form4s = [
        ("26-000020", "2026-10-06", "xslF345X05/buy-2026-10-02.xml"),  # recent, a purchase
        ("25-000020", "2025-10-03", "xslF345X05/a.xml"),  # October: needed
        ("25-000021", "2025-11-04", "xslF345X05/b.xml"),  # early November: needed
        ("25-000022", "2025-06-10", "xslF345X05/c.xml"),  # June: not needed
        ("24-000020", "2024-10-15", "xslF345X05/d.xml"),  # October: needed
        ("24-000021", "2024-11-20", "xslF345X05/e.xml"),  # late November: not needed
        ("23-000020", "2023-10-20", "xslF345X05/f.xml"),  # October: needed
    ]
    original = rows_for

    def with_form4s(cik: int):
        rows = original(cik)
        if cik == COMPANY:
            rows += [(f"{stem}-{acc}", "4", filed, "", "", doc) for acc, filed, doc in form4s]
        return rows

    monkeypatch.setattr(f"{__name__}.rows_for", with_form4s)
    with respx.mock as mock:
        mock_edgar(mock)
        bundle, requests = fetch(
            database,
            tmp_path / "raw",
            run_id="first",
            today=TODAY,
            now=datetime(2026, 11, 3, 15, tzinfo=UTC),
        )
    assert bundle.form4_purchase
    fetched = {
        row[0].rsplit("/", 1)[-1]
        for row in database.conn.execute(
            "SELECT request_key FROM fetch_log WHERE request_key LIKE '%.xml'"
        )
    }
    assert fetched == {"wk-form4_1.xml", "buy-2026-10-02.xml", "a.xml", "b.xml", "d.xml", "f.xml"}
    assert requests["form4"] == 6


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


REPORT_HEADING = "Report of Independent Registered Public Accounting Firm"
REPORT_START = f"{REPORT_HEADING}\n\nTo the Board of Directors and Shareholders of Bank Co.:\n\n"


def test_the_auditors_report_is_found_outside_item_8():
    # JPM's 10-K (Phase 0): items are out of order, so edgartools puts the auditor's report
    # at the end of "Item 7", while "Item 8" starts at the income statement. A
    # table-of-contents mention in Item 15 must not be taken for the report.
    sections = {
        "Item 7": f"{FILLER}\n\n{REPORT_START}We have audited the accompanying balance sheets.",
        "Item 8": "Year ended December 31, (in millions)  2025  2024\nRevenue  9,615  8,910",
        "Item 15": f"Audited financial statements:\n{REPORT_HEADING}  162\nNote 1  170",
    }
    report = auditor_report(sections)
    assert report is not None and report.startswith(REPORT_START)


def test_the_auditors_report_in_item_8_comes_first():
    sections = {
        "Item 7": f"{REPORT_START}An earlier copy.",
        "Item 8": f"{FILLER}\n\n{REPORT_START}We have audited the accompanying balance sheets.",
    }
    assert auditor_report(sections).endswith("We have audited the accompanying balance sheets.")


def test_no_auditors_report_gives_none():
    assert auditor_report({"Item 8": "Revenue  9,615", "Item 15": f"{REPORT_HEADING}  162"}) is None


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


@pytest.mark.parametrize(("code", "expected"), [("P", {10}), ("S", set())])
def test_form4_purchase_months(code, expected):
    filed = date(2026, 11, 2)
    assert purchase_months(form4_xml(code, "2026-10-30"), filed) == expected
    assert purchase_months(b"not xml", filed) == set()


def test_a_purchase_without_a_trade_date_counts_in_the_filing_month():
    xml = (
        b"<ownershipDocument><nonDerivativeTable><nonDerivativeTransaction><transactionCoding>"
        b"<transactionCode>P</transactionCode></transactionCoding></nonDerivativeTransaction>"
        b"</nonDerivativeTable></ownershipDocument>"
    )
    assert purchase_months(xml, date(2026, 11, 2)) == {11}


@pytest.mark.parametrize(
    ("filed", "expected"),
    [("2025-10-15", True), ("2025-11-05", True), ("2025-11-06", False), ("2025-06-10", False)],
)
def test_older_form4s_are_kept_for_the_purchase_months(filed, expected):
    assert filed_for_months(date.fromisoformat(filed), {10}) is expected
    assert filed_for_months(date(2026, 1, 3), {12})  # a late-December trade, filed in January


def test_form4_trades_reads_the_owner_dates_and_codes():
    from tearsheet.data.sec import form4_trades

    xml = (
        b"<ownershipDocument><reportingOwner><reportingOwnerId><rptOwnerName>Fish James C Jr</rptOwnerName>"
        b"</reportingOwnerId></reportingOwner><nonDerivativeTable>"
        b"<nonDerivativeTransaction><transactionDate><value>2026-11-02</value></transactionDate>"
        b"<transactionCoding><transactionCode>P</transactionCode></transactionCoding></nonDerivativeTransaction>"
        b"<nonDerivativeTransaction><transactionDate><value>2026-11-03</value></transactionDate>"
        b"<transactionCoding><transactionCode>S</transactionCode></transactionCoding></nonDerivativeTransaction>"
        b"</nonDerivativeTable></ownershipDocument>"
    )
    assert form4_trades(xml, date(2026, 11, 4)) == [
        ("Fish James C Jr", date(2026, 11, 2), "P"),
        ("Fish James C Jr", date(2026, 11, 3), "S"),
    ]
    assert form4_trades(b"not xml", date(2026, 11, 4)) == []


COVER = b"""
<ix:header><ix:resources>
<xbrli:context id="cA"><xbrli:entity><xbrli:segment><xbrldi:explicitMember dimension="us-gaap:StatementClassOfStockAxis">us-gaap:CommonClassAMember</xbrldi:explicitMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:instant>2026-01-31</xbrli:instant></xbrli:period></xbrli:context>
<xbrli:context id="cB"><xbrli:entity><xbrli:segment><xbrldi:explicitMember dimension="us-gaap:StatementClassOfStockAxis">us-gaap:CommonClassBMember</xbrldi:explicitMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:instant>2026-01-31</xbrli:instant></xbrli:period></xbrli:context>
<xbrli:context id="cC"><xbrli:entity><xbrli:segment><xbrldi:explicitMember dimension="us-gaap:StatementClassOfStockAxis">goog:CapitalClassCMember</xbrldi:explicitMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:instant>2026-01-31</xbrli:instant></xbrli:period></xbrli:context>
<xbrli:context id="dA"><xbrli:entity><xbrli:segment><xbrldi:explicitMember dimension="us-gaap:StatementClassOfStockAxis">us-gaap:CommonClassAMember</xbrldi:explicitMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-12-31</xbrli:endDate></xbrli:period></xbrli:context>
<xbrli:context id="dC"><xbrli:entity><xbrli:segment><xbrldi:explicitMember dimension="us-gaap:StatementClassOfStockAxis">goog:CapitalClassCMember</xbrldi:explicitMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-12-31</xbrli:endDate></xbrli:period></xbrli:context>
</ix:resources></ix:header>
<p>Class A <ix:nonNumeric name="dei:TradingSymbol" contextRef="dA">googl</ix:nonNumeric>,
Class C <ix:nonNumeric name="dei:TradingSymbol" contextRef="dC">GOOG</ix:nonNumeric></p>
<p><ix:nonFraction name="dei:EntityCommonStockSharesOutstanding" contextRef="cA" unitRef="shares" decimals="INF"><span>5,817,000,000</span></ix:nonFraction> Class A,
<ix:nonFraction name="dei:EntityCommonStockSharesOutstanding" contextRef="cB" unitRef="shares" scale="6" decimals="-6">861</ix:nonFraction> Class B (unlisted),
<ix:nonFraction name="dei:EntityCommonStockSharesOutstanding" contextRef="cC" unitRef="shares">5,450,000,000</ix:nonFraction> Class C</p>
"""


def test_cover_page_share_counts_by_class_with_their_symbols():
    from tearsheet.data.sec import cover_share_counts

    counts = {c.member: c for c in cover_share_counts(COVER)}
    assert counts["us-gaap:CommonClassAMember"].ticker == "GOOGL"
    assert counts["us-gaap:CommonClassAMember"].shares == 5_817_000_000
    assert counts["us-gaap:CommonClassBMember"].ticker is None  # unlisted
    assert counts["us-gaap:CommonClassBMember"].shares == 861_000_000  # scale 6
    assert counts["goog:CapitalClassCMember"].ticker == "GOOG"
    assert {c.as_of for c in counts.values()} == {date(2026, 1, 31)}


def test_a_single_class_cover_page_has_no_member():
    from tearsheet.data.sec import cover_share_counts

    html = b"""<xbrli:context id="c1"><xbrli:entity></xbrli:entity><xbrli:period><xbrli:instant>2026-10-17</xbrli:instant></xbrli:period></xbrli:context>
    <ix:nonFraction name="dei:EntityCommonStockSharesOutstanding" contextRef="c1">14,776,353,000</ix:nonFraction>"""
    [count] = cover_share_counts(html)
    assert count.member is None and count.shares == 14_776_353_000


INLINE_10Q = b"""<html><body>
<ix:header><ix:resources>
<xbrli:context id="q3"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0001045609</xbrli:identifier></xbrli:entity>
  <xbrli:period><xbrli:startDate>2026-07-01</xbrli:startDate><xbrli:endDate>2026-09-30</xbrli:endDate></xbrli:period></xbrli:context>
<xbrli:context id="sep30"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0001045609</xbrli:identifier></xbrli:entity>
  <xbrli:period><xbrli:instant>2026-09-30</xbrli:instant></xbrli:period></xbrli:context>
<xbrli:context id="q3-sub"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0001045609</xbrli:identifier>
  <xbrli:segment><xbrldi:explicitMember dimension="dei:LegalEntityAxis">pld:PrologisLPMember</xbrldi:explicitMember></xbrli:segment></xbrli:entity>
  <xbrli:period><xbrli:startDate>2026-07-01</xbrli:startDate><xbrli:endDate>2026-09-30</xbrli:endDate></xbrli:period></xbrli:context>
<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>
<xbrli:unit id="shares"><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unit>
<xbrli:unit id="usdPerShare"><xbrli:divide><xbrli:unitNumerator><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unitNumerator>
  <xbrli:unitDenominator><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unitDenominator></xbrli:divide></xbrli:unit>
</ix:resources></ix:header>
<td><ix:nonFraction name="us-gaap:Revenues" contextRef="q3" unitRef="usd" decimals="-3" scale="3" format="ixt:num-dot-decimal">2,387,518</ix:nonFraction></td>
<td><ix:nonFraction name="us-gaap:Revenues" contextRef="q3" unitRef="usd" decimals="-3" scale="3" format="ixt:num-dot-decimal">2,387,518</ix:nonFraction></td>
<td><ix:nonFraction name="us-gaap:Revenues" contextRef="q3-sub" unitRef="usd" decimals="-3" scale="3">2,400,000</ix:nonFraction></td>
<td>(<ix:nonFraction name="us-gaap:OtherNonoperatingIncomeExpense" contextRef="q3" unitRef="usd" scale="6" sign="-" format="ixt:num-dot-decimal">12.5</ix:nonFraction>)</td>
<td><ix:nonFraction name="us-gaap:InterestExpense" contextRef="q3" unitRef="usd" format="ixt:fixed-zero">&#8212;</ix:nonFraction></td>
<td><ix:nonFraction name="us-gaap:EarningsPerShareDiluted" contextRef="q3" unitRef="usdPerShare" decimals="2"><span>0.86</span></ix:nonFraction></td>
<td><ix:nonFraction name="us-gaap:Assets" contextRef="sep30" unitRef="usd" scale="3">103,894,706</ix:nonFraction></td>
<td><ix:nonFraction name="us-gaap:Goodwill" contextRef="sep30" unitRef="usd" xsi:nil="true"/></td>
<td><ix:nonFraction name="pld:OwnMetric" contextRef="q3" unitRef="usd">5</ix:nonFraction></td>
</body></html>"""


def test_a_filing_s_own_figures_are_read_in_the_company_facts_shape():
    from tearsheet.data.sec import inline_facts

    facts = inline_facts(INLINE_10Q, accession="0001-26-1", form="10-Q", filed=date(2026, 10, 28))
    us = facts["facts"]["us-gaap"]
    revenue = us["Revenues"]["units"]["USD"]
    assert revenue == [  # once, and without the subsidiary's dimensioned value
        {
            "start": "2026-07-01",
            "end": "2026-09-30",
            "val": 2_387_518_000.0,
            "accn": "0001-26-1",
            "form": "10-Q",
            "filed": "2026-10-28",
        }
    ]
    assert us["OtherNonoperatingIncomeExpense"]["units"]["USD"][0]["val"] == -12_500_000.0
    assert us["InterestExpense"]["units"]["USD"][0]["val"] == 0.0
    assert us["EarningsPerShareDiluted"]["units"]["USD/shares"][0]["val"] == 0.86
    assert us["Assets"]["units"]["USD"][0] == {
        "end": "2026-09-30",
        "val": 103_894_706_000.0,
        "accn": "0001-26-1",
        "form": "10-Q",
        "filed": "2026-10-28",
    }
    assert "Goodwill" not in us  # a nil value is no value
    assert set(facts["facts"]) == {"us-gaap", "dei"}  # the company's own tags are left out


def test_two_sets_of_company_facts_are_merged_row_by_row():
    from tearsheet.data.sec import merge_company_facts

    a = {
        "entityName": "New Co",
        "facts": {"us-gaap": {"Revenues": {"units": {"USD": [{"end": "1"}]}}}},
    }
    b = {
        "entityName": "Old Co",
        "facts": {
            "us-gaap": {
                "Revenues": {"units": {"USD": [{"end": "0"}]}},
                "Assets": {"units": {"USD": [{"end": "0"}]}},
            },
            "dei": {"EntityCommonStockSharesOutstanding": {"units": {"shares": [{"end": "0"}]}}},
        },
    }
    merged = merge_company_facts(a, b)
    assert merged["entityName"] == "New Co"
    assert merged["facts"]["us-gaap"]["Revenues"]["units"]["USD"] == [{"end": "1"}, {"end": "0"}]
    assert "Assets" in merged["facts"]["us-gaap"] and "dei" in merged["facts"]
    assert a["facts"]["us-gaap"]["Revenues"]["units"]["USD"] == [{"end": "1"}]  # inputs untouched


def test_offline_runs_read_a_stored_exhibit_13(tmp_path):
    """Wells Fargo files its annual report as Exhibit 13; an offline run (the golden set,
    replay) reads the stored copy, as the live run did."""
    import json

    from tearsheet import config
    from tearsheet.data.sec import SUBMISSIONS_URL
    from tearsheet.db import open_database
    from tearsheet.sources import StoredData

    paths = config.Paths(tmp_path).ensure()
    database = open_database(paths.db)
    raw = RawStore(paths.raw, database.conn)
    accession, folder = "0000072971-26-000133", "000007297126000133"
    subs = {
        "filings": {
            "recent": {
                "accessionNumber": [accession, "0000072971-27-000001"],
                "form": ["10-K", "10-K"],
                "filingDate": ["2026-02-20", "2027-02-20"],  # the second is after the run
                "reportDate": ["2025-12-31", "2026-12-31"],
                "primaryDocument": ["wfc-20251231.htm", "wfc-20261231.htm"],
            }
        }
    }
    base = f"https://www.sec.gov/Archives/edgar/data/72971/{folder}/"
    index = (
        '<html><body><table class="tableFile" summary="Document Format Files">'
        "<tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th><th>Size</th></tr>"
        f'<tr><td>1</td><td>10-K</td><td><a href="/Archives/edgar/data/72971/{folder}/wfc-20251231.htm">'
        "wfc-20251231.htm</a></td><td>10-K</td><td>100</td></tr>"
        f'<tr><td>2</td><td>annual report</td><td><a href="/Archives/edgar/data/72971/{folder}/wfc-20251231_d2.htm">'
        "wfc-20251231_d2.htm</a></td><td>EX-13</td><td>100</td></tr></table></body></html>"
    )
    for body, url in (
        (json.dumps(subs).encode(), SUBMISSIONS_URL.format(cik=72971)),
        (b"<html>the 10-K</html>", base + "wfc-20251231.htm"),
        (index.encode(), base + f"{accession}-index.htm"),
        (b"<html>the annual report</html>", base + "wfc-20251231_d2.htm"),
    ):
        raw.put(body, url, "sec", "text/html", "run-1")
    database.close()
    data = StoredData([tmp_path], risk_free=0.04, risk_free_date=date(2026, 11, 5))
    docs = asyncio.run(data.filing_documents(72971, today=date(2026, 11, 5)))
    [ten_k] = [d for d in docs if d.role == "10-K"]
    assert ten_k.accession == accession  # not the 10-K filed after the run date
    assert ten_k.exhibit_13 == b"<html>the annual report</html>"
