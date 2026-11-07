"""The thin-slice report run, end to end on a made-up sector (design items 34 and 39)."""

from __future__ import annotations

import asyncio
import json
import math
import random
from datetime import UTC, date, datetime

import pytest

from tearsheet.ai.client import AIClient, AIUnavailable, AIUsageLimit, ToolState
from tearsheet.ai.schemas import (
    DraftSentence,
    EvidenceItem,
    EvidenceList,
    Link,
    LinkList,
    SectionDraft,
    SkepticFinding,
    SkepticReport,
)
from tearsheet.data.articles import Article, Skipped
from tearsheet.data.articles import Paragraph as ArticleParagraph
from tearsheet.data.membership import HoldingRow, Holdings, Refreshed
from tearsheet.data.prices import SPY_CIK, sessions_between
from tearsheet.methodology import load
from tearsheet.pipeline import Run
from tearsheet.sources import Doc
from tests.fakes.ai import FakeConnector, answer

NOW = datetime(2026, 11, 5, 1, 0, tzinfo=UTC)  # 9pm in New York on 4 Nov
N = 20
COMPANY = 1000
FILLER = " ".join(["The company sells widgets and services to customers around the world."] * 20)


def duration(start, end, val, filed, fp="FY"):
    return {
        "start": start,
        "end": end,
        "val": val,
        "filed": filed,
        "form": "10-K" if fp == "FY" else "10-Q",
        "fp": fp,
        "accn": f"a-{filed}",
    }


def instant(end, val, filed):
    return {
        "end": end,
        "val": val,
        "filed": filed,
        "form": "10-Q",
        "fp": "Q3",
        "accn": f"a-{filed}",
    }


def company_facts(i: int) -> dict:
    """A December year-end company; numbers vary with i so the group isn't all ties."""
    rev = 1000.0 * (1 + i / 10)
    margin = 0.10 + 0.01 * (i % 7)
    growth = 0.03 + 0.005 * (i % 5)
    flows = {
        "Revenues": rev,
        "OperatingIncomeLoss": rev * margin,
        "NetIncomeLoss": rev * margin * 0.75,
        "NetCashProvidedByUsedInOperatingActivities": rev * margin * 0.9,
        "PaymentsToAcquirePropertyPlantAndEquipment": rev * 0.03,
        "DepreciationDepletionAndAmortization": rev * 0.04,
        "InterestExpense": 5.0 + i,
        "IncomeTaxExpenseBenefit": rev * margin * 0.2,
        "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest": rev
        * margin
        * 0.95,
    }
    us = {}
    for tag, value in flows.items():
        rows = []
        for year in range(2022, 2026):
            scale = (1 + growth) ** (year - 2025)
            rows.append(
                duration(f"{year}-01-01", f"{year}-12-31", value * scale, f"{year + 1}-02-15")
            )
        rows.append(duration("2025-01-01", "2025-09-30", value * 0.74, "2025-10-30", "Q3"))
        rows.append(
            duration("2026-01-01", "2026-09-30", value * 0.74 * (1 + growth), "2026-10-30", "Q3")
        )
        us[tag] = {"units": {"USD": rows}}
    us["EarningsPerShareDiluted"] = {
        "units": {
            "USD/shares": [
                duration("2025-01-01", "2025-12-31", rev * margin * 0.75 / 100, "2026-02-15"),
                duration(
                    "2025-01-01", "2025-09-30", rev * margin * 0.75 * 0.74 / 100, "2025-10-30", "Q3"
                ),
                duration(
                    "2026-01-01",
                    "2026-09-30",
                    rev * margin * 0.75 * 0.74 * (1 + growth) / 100,
                    "2026-10-30",
                    "Q3",
                ),
            ]
        }
    }
    us["WeightedAverageNumberOfDilutedSharesOutstanding"] = {
        "units": {
            "shares": [
                duration("2025-07-01", "2025-09-30", 101.0, "2025-10-30", "Q3"),
                duration("2026-07-01", "2026-09-30", 100.0, "2026-10-30", "Q3"),
            ]
        }
    }
    balances = {
        "Assets": rev * 1.5,
        "StockholdersEquity": rev * 0.6,
        "LongTermDebtNoncurrent": rev * 0.3,
        "CashAndCashEquivalentsAtCarryingValue": rev * 0.1,
    }
    for tag, value in balances.items():
        us[tag] = {
            "units": {
                "USD": [
                    instant("2025-09-30", value * 0.95, "2025-10-30"),
                    instant("2026-09-30", value, "2026-10-30"),
                ]
            }
        }
    dei = {
        "EntityCommonStockSharesOutstanding": {
            "units": {"shares": [instant("2026-10-20", 100.0, "2026-10-30")]}
        }
    }
    return {"cik": 1000 + i, "entityName": f"Company {i}", "facts": {"us-gaap": us, "dei": dei}}


def ten_k() -> bytes:
    headings = [
        "PART I",
        "Item 1. Business",
        "Item 1A. Risk Factors",
        "Item 3. Legal Proceedings",
        "PART II",
        "Item 7. Management's Discussion and Analysis of Financial Condition and Results of Operations",
        "Item 7A. Quantitative and Qualitative Disclosures About Market Risk",
        "Item 8. Financial Statements and Supplementary Data",
        "Report of Independent Registered Public Accounting Firm",
        "Item 9A. Controls and Procedures",
    ]
    body = "".join(f"<p><b>{h}</b></p><p>{FILLER}</p><p>{FILLER} More.</p>" for h in headings)
    return f"<html><body>{body}</body></html>".encode()


def ten_q() -> bytes:
    headings = [
        "PART I. FINANCIAL INFORMATION",
        "Item 1. Financial Statements",
        "Item 2. Management's Discussion and Analysis of Financial Condition and Results of Operations",
        "PART II. OTHER INFORMATION",
        "Item 1A. Risk Factors",
    ]
    body = "".join(f"<p><b>{h}</b></p><p>{FILLER}</p><p>{FILLER} Again.</p>" for h in headings)
    return f"<html><body>{body}</body></html>".encode()


class FakeData:
    def __init__(self, *, stale_company: bool = False):
        self.stale_company = stale_company

    async def sec_tickers(self):
        return {f"T{i}": 1000 + i for i in range(N)}

    async def holdings(self, sec_tickers, *, today):
        rows = [
            HoldingRow(f"T{i}", 1000 + i, f"Company {i}", "Industrials", float(100 - i))
            for i in range(N)
        ]
        return Refreshed(Holdings(date(2026, 11, 3), "bundled", rows), None)

    async def submissions(self, cik):
        return {"name": f"Company {cik - 1000}", "sic": "3560"}

    async def company_facts(self, cik):
        return company_facts(cik - 1000)

    async def filing_documents(self, cik, *, today):
        return [
            Doc(
                "10-K",
                "10-K",
                "0001-26-000001",
                "https://www.sec.gov/k.htm",
                "https://www.sec.gov/k-index.htm",
                date(2026, 2, 15),
                ten_k(),
            ),
            Doc(
                "10-Q",
                "10-Q",
                "0001-26-000002",
                "https://www.sec.gov/q.htm",
                "https://www.sec.gov/q-index.htm",
                date(2026, 10, 30),
                ten_q(),
            ),
        ]

    async def fill_prices(self, store, members, *, end):
        days = sessions_between(date(2025, 8, 1), date(2026, 11, 4))
        for cik in [*members, SPY_CIK]:
            if self.stale_company and cik == COMPANY:
                days_used = days[:-10]
            else:
                days_used = days
            rnd = random.Random(cik)
            price = 50.0 + (cik % 17)
            bars = []
            for day in days_used:
                price *= math.exp(rnd.gauss(0.0004, 0.015 + (cik % 5) * 0.002))
                start = datetime(day.year, day.month, day.day, 5, tzinfo=UTC)
                bars.append({"t": int(start.timestamp() * 1000), "c": price, "v": 1000})
            store.store_bars(cik, "", {"results": bars}, raw_hash="fake")

    async def risk_free(self, day):
        return (date(2026, 11, 4), 0.042)

    def request_counts(self):
        return {}


def fake_ai(request):
    ids = [s.id for s in request.sources]
    if request.task == "extract":
        return answer(
            EvidenceList(
                items=[
                    EvidenceItem(
                        statement="Demand for widgets grew.", type="driver", paragraph_ids=[ids[0]]
                    ),
                    EvidenceItem(
                        statement="Competition is rising.", type="risk", paragraph_ids=[ids[-1]]
                    ),
                ]
            )
        )
    key = (
        "business"
        if "Section 4" in request.instructions
        else ("risks" if "Section 5" in request.instructions else "watch")
    )
    return answer(
        SectionDraft(
            section=key,
            sentences=[
                DraftSentence(
                    text="Operating margin was {{metric:operating_margin}} over the past year.",
                    citations=[ids[0]],
                    stance="positive",
                ),
                DraftSentence(
                    text="Demand for widgets grew in 2026.", citations=[ids[0]], stance="positive"
                ),
                DraftSentence(text="Revenue doubled.", citations=[ids[0]], stance="positive"),
                DraftSentence(
                    text="Competition is rising.", citations=["not-sent"], stance="negative"
                ),
            ],
        ),
        model_id="fake-large",
    )


def clean_ai(request):
    """Like fake_ai, but every drafted sentence passes the code checks, and the skeptic finds
    nothing."""
    ids = [s.id for s in request.sources]
    if request.task == "narrate":
        key = next(
            k
            for k, n in (
                ("business", "Section 4"),
                ("risks", "Section 5"),
                ("results", "Section 6"),
                ("news", "Section 7"),
                ("trends", "Section 8"),
                ("watch", "What to watch"),
            )
            if n in request.instructions
        )
        return answer(
            SectionDraft(
                section=key,
                sentences=[
                    DraftSentence(
                        text="Operating margin was {{metric:operating_margin}} over the past year.",
                        citations=[ids[0]],
                        stance="positive",
                    ),
                    DraftSentence(
                        text="Demand for widgets grew in 2026.",
                        citations=[ids[0]],
                        stance="positive",
                    ),
                    DraftSentence(
                        text="Competition is rising.", citations=[ids[-1]], stance="negative"
                    ),
                    DraftSentence(text="Costs are steady.", citations=[ids[-1]], stance="neutral"),
                ],
            ),
            model_id="fake-large",
        )
    if request.task == "skeptic":
        from tearsheet.ai.schemas import SkepticReport

        return answer(SkepticReport(findings=[]), model_id="fake-large")
    return fake_ai(request)


def run_slice(database, tmp_path, *, data=None, script=(), default=fake_ai):
    state = ToolState(database.conn, "claude")
    state.record_check(version="1.0", model_ids=["fake-small"], form="full", passed=True)
    connector = FakeConnector(script, default=default)
    ai = AIClient(connector, state, retry_wait_s=0)
    run = Run(database.conn, data or FakeData(), ai, load(), now=NOW, out_dir=tmp_path / "reports")
    return run, asyncio.run(run.run("T0")), connector


def test_a_slice_run_end_to_end(database, tmp_path):
    run, result, connector = run_slice(database, tmp_path)
    assert result.status == "done"
    assert result.rating in ("Buy", "Hold", "Sell")
    assert result.html_path.exists()
    html = result.html_path.read_text()
    assert "Thin-slice report" in html and "Operating margin was" in html
    assert "Revenue doubled" in html  # listed among the removed claims, with its reason
    row = database.conn.execute(
        "SELECT mode, status, last_step_done, methodology_hash FROM runs"
    ).fetchone()
    assert (row["mode"], row["status"], row["last_step_done"]) == ("slice", "done", "save")
    assert row["methodology_hash"] == load().methodology_hash
    claims = database.conn.execute(
        "SELECT removed, COUNT(*) FROM claims GROUP BY removed"
    ).fetchall()
    assert {r[0]: r[1] for r in claims} == {0: 6, 1: 6}  # 3 sections × (2 kept, 2 removed)
    assert (
        database.conn.execute("SELECT COUNT(*) FROM predictions").fetchone()[0] == 0
    )  # the slice logs none
    steps = {r[0] for r in database.conn.execute("SELECT step FROM step_outputs")}
    assert {
        "resolve",
        "fetch",
        "metrics",
        "score",
        "value",
        "rate",
        "extract",
        "narrate",
        "verify",
    } <= steps
    tasks = [r.task for r in connector.requests]
    assert tasks.count("narrate") == 3 and tasks.count("extract") == 4


def test_every_peer_is_valued_and_the_mix_is_shown(database, tmp_path):
    run, result, _ = run_slice(database, tmp_path)
    valued = [m for m in run.members.values() if m.valuation and m.valuation.valid]
    assert len(valued) == N
    assert "In this peer group today" in result.html_path.read_text()


def test_saved_evidence_is_reused_on_a_repeat_run(database, tmp_path):
    run_slice(database, tmp_path)
    _, _, connector = run_slice(database, tmp_path)
    assert [r.task for r in connector.requests].count("extract") == 0


def test_a_usage_limit_stops_the_ai_steps_and_keeps_the_report(database, tmp_path):
    calls = {"n": 0}

    def limited(request):
        calls["n"] += 1
        if request.task == "narrate":
            return AIUsageLimit("You've hit your limit. Resets 3am")
        return fake_ai(request)

    run, result, _ = run_slice(database, tmp_path, default=limited)
    assert result.status == "stopped"
    assert result.html_path.exists()
    assert any("stopped" in n for n in result.notes)
    narrative = database.conn.execute("SELECT narrative_complete FROM reports").fetchone()[0]
    assert narrative == 0


def test_a_failed_call_drops_only_its_section(database, tmp_path):
    def flaky(request):
        if request.task == "narrate" and "Section 5" in request.instructions:
            return AIUnavailable("the tool crashed")
        return fake_ai(request)

    run, result, _ = run_slice(database, tmp_path, default=flaky)
    assert result.status == "done_incomplete"
    html = result.html_path.read_text()
    assert "couldn&#39;t be written" in html or "couldn't be written" in html
    assert "Operating margin was" in html  # the other sections are there


def test_stale_company_prices_withhold_sections_1_to_3(database, tmp_path):
    run, result, _ = run_slice(database, tmp_path, data=FakeData(stale_company=True))
    html = result.html_path.read_text()
    assert "withheld" in html
    assert "Buy trigger" not in html


def test_the_run_without_an_ai_tool_still_writes_the_code_sections(database, tmp_path):
    run = Run(database.conn, FakeData(), None, load(), now=NOW, out_dir=tmp_path / "reports")
    result = asyncio.run(run.run("T0"))
    assert result.status == "done_incomplete"
    assert "Score" in result.html_path.read_text()


@pytest.mark.parametrize("query", ["T0", "t0", "Company 0"])
def test_resolve_by_ticker_or_name(database, tmp_path, query):
    run = Run(database.conn, FakeData(), None, load(), now=NOW, out_dir=None)
    result = asyncio.run(run.run(query))
    assert (
        json.loads(
            database.conn.execute(
                "SELECT json FROM step_outputs WHERE step = 'resolve'"
            ).fetchone()[0]
        )["cik"]
        == COMPANY
    )
    assert result.report_id


# --- the full method (Phase 1b code steps) --------------------------------------------------


class WeakControls(FakeData):
    """The company's 10-K says internal control was not effective: a red flag."""

    async def filing_documents(self, cik, *, today):
        docs = await super().filing_documents(cik, today=today)
        bad = docs[0].body.replace(
            b"<p><b>Item 9A. Controls and Procedures</b></p>",
            b"<p><b>Item 9A. Controls and Procedures</b></p><p>Management concluded that our internal control over financial reporting was not effective as of December 31.</p>",
        )
        return [
            Doc(
                "10-K",
                "10-K",
                docs[0].accession,
                docs[0].url,
                docs[0].index_url,
                docs[0].filed,
                bad,
            ),
            *docs[1:],
        ]


def run_full(database, tmp_path, data=None):
    state = ToolState(database.conn, "claude")
    state.record_check(version="1.0", model_ids=["fake-small"], form="full", passed=True)
    ai = AIClient(FakeConnector(default=fake_ai), state, retry_wait_s=0)
    run = Run(
        database.conn,
        data or FakeData(),
        ai,
        load(),
        mode="full",
        now=NOW,
        out_dir=tmp_path / "reports",
    )
    return run, asyncio.run(run.run("T0"))


def test_the_full_method_uses_every_metric_and_three_valuation_methods(database, tmp_path):
    run, result = run_full(database, tmp_path)
    assert result.status == "done"
    company = run.members[COMPANY]
    names = {m.method for m in company.valuation.methods}
    assert names == {"dcf", "residual_income", "multiples"}
    assert all(m.valid for m in company.valuation.methods), [
        (m.method, m.reason) for m in company.valuation.methods
    ]
    assert "one_method" not in company.valuation.triggers
    assert len(run.score_result.metric_percentiles[COMPANY]) > 6
    assert database.conn.execute("SELECT mode FROM runs").fetchone()[0] == "full"
    assert database.conn.execute("SELECT COUNT(*) FROM predictions").fetchone()[0] == 0


def test_a_red_flag_caps_the_rating_at_hold(database, tmp_path):
    run, result = run_full(database, tmp_path, data=WeakControls())
    assert [f.key for f in run.flags] == ["material_weakness"]
    assert result.rating in ("Hold", None)
    assert "Material weakness" in result.html_path.read_text()


def test_the_full_method_also_writes_recent_results(database, tmp_path):
    state = ToolState(database.conn, "claude")
    state.record_check(version="1.0", model_ids=["fake-small"], form="full", passed=True)

    def with_results(request):
        if request.task == "narrate" and "Section 6" in request.instructions:
            ids = [s.id for s in request.sources]
            assert any("Part_I_Item_2" in i for i in ids)  # the 10-Q's MD&A reaches section 6
            return answer(
                SectionDraft(
                    section="results",
                    sentences=[
                        DraftSentence(
                            text="Quarterly demand improved.", citations=[ids[0]], stance="positive"
                        )
                    ],
                )
            )
        return clean_ai(request)

    connector = FakeConnector(default=with_results)
    run = Run(
        database.conn,
        FakeData(),
        AIClient(connector, state, retry_wait_s=0),
        load(),
        mode="full",
        now=NOW,
        out_dir=tmp_path / "r",
    )
    result = asyncio.run(run.run("T0"))
    html = result.html_path.read_text()
    assert "6. Recent results" in html and "Quarterly demand improved." in html
    assert [r.task for r in connector.requests].count("narrate") == 4


# --- the skeptic (Phase 1b) ---------------------------------------------------------------


def skeptic_script(marks_for):
    """A fake AI whose skeptic answers come from `marks_for(section, sentence_ids)`."""

    def fake(request):
        if request.task == "skeptic":
            section = next(
                s
                for s in ("business", "risks", "results", "news", "trends", "watch")
                if f"Section: {s}" in request.instructions
            )
            ids = [
                line.split(":", 1)[0].strip("- ")
                for line in request.instructions.splitlines()
                if line.startswith(f"- {section}.")
            ]
            return answer(SkepticReport(findings=marks_for(section, ids)), model_id="fake-large")
        return clean_ai(request)

    return fake


def run_with(database, tmp_path, fake):
    state = ToolState(database.conn, "claude")
    state.record_check(version="1.0", model_ids=["fake-small"], form="full", passed=True)
    connector = FakeConnector(default=fake)
    run = Run(
        database.conn,
        FakeData(),
        AIClient(connector, state, retry_wait_s=0),
        load(),
        mode="full",
        now=NOW,
        out_dir=tmp_path / "r",
    )
    return run, asyncio.run(run.run("T0")), connector


def test_the_skeptic_removes_unsupported_claims_and_notes_tone(database, tmp_path):
    def marks(section, ids):
        if section != "business":
            return []
        return [
            SkepticFinding(
                sentence_id=ids[0],
                mark="tone",
                problem_type="optimism",
                explanation="reads more upbeat than the rating",
            ),
        ]

    run, result, connector = run_with(database, tmp_path, skeptic_script(marks))
    html = result.html_path.read_text()
    assert "reads more upbeat than the rating" in html
    assert "self-checked" in html
    assert [r.task for r in connector.requests].count("skeptic") == 4


def test_too_many_problems_ask_for_one_rewrite(database, tmp_path):
    def marks(section, ids):
        if (
            section == "risks"
            and ids
            and ids[0].startswith("risks.")
            and not ids[0].startswith("risks.r")
        ):
            return [
                SkepticFinding(
                    sentence_id=i,
                    mark="unsupported",
                    problem_type="unsupported",
                    explanation="not in the paragraph",
                )
                for i in ids
            ]
        return []

    run, result, connector = run_with(database, tmp_path, skeptic_script(marks))
    tasks = [r.task for r in connector.requests]
    assert tasks.count("narrate") == 5  # 4 sections + 1 rewrite of risks
    html = result.html_path.read_text()
    assert "risks.r1" in html  # the rewritten sentences replace the first draft


# --- news (Phase 1b) ----------------------------------------------------------------------


class WithNews(FakeData):
    async def fetch_article(self, url, allowlist):
        if "paywalled" in url:
            return Skipped(url, "paywalled")
        key = "a1b2c3d4e5f6" if "one" in url else "f6e5d4c3b2a1"
        paras = [
            ArticleParagraph(
                f"art-{key}-p{n:03d}", f"Coverage paragraph {n} about widget demand and pricing."
            )
            for n in range(1, 4)
        ]
        return Article(url, url, f"hash-{key}", date(2026, 11, 2), 400, paras)


def news_ai(request):
    if request.task == "link_search":
        return answer(
            LinkList(
                links=[
                    Link(url="https://www.reuters.com/one", title="One", publisher="Reuters"),
                    Link(url="https://www.cnbc.com/two", title="Two", publisher="CNBC"),
                    Link(url="https://www.wsj.com/paywalled", title="Three", publisher="WSJ"),
                    Link(url="https://example.com/not-allowed", title="Four", publisher="Example"),
                ]
            ),
            model_id="fake-large",
            tool_events=["WebSearch"],
        )
    return clean_ai(request)


def test_news_reaches_only_section_7(database, tmp_path):
    state = ToolState(database.conn, "claude")
    state.record_check(version="1.0", model_ids=["fake-small"], form="full", passed=True)
    connector = FakeConnector(default=news_ai)
    run = Run(
        database.conn,
        WithNews(),
        AIClient(connector, state, retry_wait_s=0),
        load(),
        mode="full",
        now=NOW,
        out_dir=tmp_path / "r",
    )
    result = asyncio.run(run.run("T0"))
    html = result.html_path.read_text()
    assert "7. News and views" in html
    assert "https://www.reuters.com/one" in html
    for request in connector.requests:
        has_article = any(s.id.startswith("art-") for s in request.sources)
        if request.task == "narrate":
            assert has_article == ("Section 7" in request.instructions)
    tasks = [r.task for r in connector.requests]
    assert tasks.count("link_search") == 1
    assert (
        sum(
            1
            for r in connector.requests
            if r.task == "extract" and any(s.id.startswith("art-") for s in r.sources)
        )
        == 2
    )
    assert database.conn.execute("SELECT COUNT(*) FROM articles").fetchone()[0] == 2
    assert any("paywalled" in n for n in result.notes)
    # The skipped address is kept by site, for `tearsheet-engine news-sites`.
    skips = database.conn.execute("SELECT url, site, reason FROM article_skips").fetchall()
    assert [tuple(s) for s in skips] == [("https://www.wsj.com/paywalled", "wsj.com", "paywalled")]


def test_the_site_report_finds_sites_that_are_never_read(database):
    from tearsheet.data.articles import Allowlist
    from tearsheet.news import site_report

    with database.conn:
        database.conn.execute(
            "INSERT INTO articles (id, url, final_url, publisher, source_type, published_at, fetched_at, raw_hash)"
            " VALUES ('art-1', 'https://www.reuters.com/a', 'https://www.reuters.com/a', 'Reuters', 'news', '2026-11-01', '2026-11-05', 'h')"
        )
        database.conn.executemany(
            "INSERT INTO article_skips (run_id, url, site, reason, at) VALUES (?, ?, ?, ?, '2026-11-05')",
            [(f"run-{n}", f"https://www.wsj.com/{n}", "wsj.com", "paywalled") for n in range(3)]
            + [("run-0", "https://www.reuters.com/b", "reuters.com", "under 150 words")],
        )
    rows = {r["site"]: r for r in site_report(database.conn, Allowlist(["reuters.com", "wsj.com"]))}
    assert rows["wsj.com"]["drop_candidate"] and rows["wsj.com"]["skipped"] == {"paywalled": 3}
    assert rows["reuters.com"]["read"] == 1 and not rows["reuters.com"]["drop_candidate"]


def test_an_address_is_matched_to_its_allowlist_entry():
    from tearsheet.data.articles import Allowlist

    allow = Allowlist(["cnn.com/business", "reuters.com"])
    assert allow.site_for("https://www.cnn.com/business/apple-q4") == "cnn.com/business"
    assert allow.site_for("https://reuters.com/x") == "reuters.com"
    assert allow.site_for("https://www.example.com/x") == "example.com"


def test_without_news_section_7_says_so(database, tmp_path):
    run, result = run_full(database, tmp_path)  # FakeData has no articles
    assert "No readable articles" in result.html_path.read_text()


# --- trends (Phase 1b) --------------------------------------------------------------------


class WithTrends(FakeData):
    async def peer_documents(self, ciks, *, today):
        return [
            Doc(
                f"peer {cik}",
                "10-K",
                f"000{cik}-26-000009",
                f"https://www.sec.gov/{cik}.htm",
                f"https://www.sec.gov/{cik}-index.htm",
                date(2026, 2, 20),
                ten_k(),
            )
            for cik in ciks
        ]

    async def macro(self, day):
        return {
            "UNRATE": ("percent", 0.043, date(2026, 10, 1)),
            "DGS10": ("percent", 0.042, date(2026, 11, 4)),
        }


def trends_ai(request):
    if request.task == "narrate" and "Section 8" in request.instructions:
        ids = [s.id for s in request.sources]
        return answer(
            SectionDraft(
                section="trends",
                sentences=[
                    DraftSentence(
                        text="Unemployment stands at {{macro:UNRATE}} while peers see steady demand.",
                        citations=[ids[0]],
                        stance="neutral",
                    )
                ],
            ),
            model_id="fake-large",
        )
    return clean_ai(request)


def test_trends_use_the_largest_peers_and_reach_only_section_8(database, tmp_path):
    state = ToolState(database.conn, "claude")
    state.record_check(version="1.0", model_ids=["fake-small"], form="full", passed=True)
    connector = FakeConnector(default=trends_ai)
    run = Run(
        database.conn,
        WithTrends(),
        AIClient(connector, state, retry_wait_s=0),
        load(),
        mode="full",
        now=NOW,
        out_dir=tmp_path / "r",
    )
    result = asyncio.run(run.run("T0"))
    html = result.html_path.read_text()
    assert "8. Industry trends" in html and "Unemployment stands at 4.3%" in html
    peer_prefixes = tuple(f"000{cik}-26-000009" for cik in run.group.trend_peers)
    assert len(peer_prefixes) == 3
    for request in connector.requests:
        cites_peer = any(s.id.startswith(peer_prefixes) for s in request.sources)
        if request.task == "narrate":
            assert cites_peer == ("Section 8" in request.instructions)
    extracts = [
        r
        for r in connector.requests
        if r.task == "extract" and any(s.id.startswith(peer_prefixes) for s in r.sources)
    ]
    assert len(extracts) == 3


def test_without_peer_filings_section_8_says_so(database, tmp_path):
    run, result = run_full(database, tmp_path)
    assert "trends section has no peer filings" in result.html_path.read_text()


# --- the earnings release and press releases (Phase 1b) -------------------------------------


def release(text: str) -> bytes:
    return (
        f"<html><body><p>{text} "
        + "Revenue rose on strong demand for widgets across every region. " * 8
        + "</p></body></html>"
    )


class WithReleases(FakeData):
    async def filing_documents(self, cik, *, today):
        docs = await super().filing_documents(cik, today=today)
        return docs + [
            Doc(
                "earnings 8-K",
                "8-K",
                "0001-26-000003",
                "https://www.sec.gov/ex991.htm",
                "https://www.sec.gov/e-index.htm",
                date(2026, 10, 30),
                release("Third-quarter results.").encode(),
            ),
            Doc(
                "press 0001-26-000004",
                "8-K",
                "0001-26-000004",
                "https://www.sec.gov/pr.htm",
                "https://www.sec.gov/pr-index.htm",
                date(2026, 10, 20),
                release("A new plant opens.").encode(),
            ),
        ]


def test_the_earnings_release_feeds_section_6_and_press_releases_section_7(database, tmp_path):
    state = ToolState(database.conn, "claude")
    state.record_check(version="1.0", model_ids=["fake-small"], form="full", passed=True)
    connector = FakeConnector(default=clean_ai)
    run = Run(
        database.conn,
        WithReleases(),
        AIClient(connector, state, retry_wait_s=0),
        load(),
        mode="full",
        now=NOW,
        out_dir=tmp_path / "r",
    )
    result = asyncio.run(run.run("T0"))
    narrates = {
        ("Section 6" in r.instructions, "Section 7" in r.instructions): {
            s.id.split("#")[0] for s in r.sources
        }
        for r in connector.requests
        if r.task == "narrate"
    }
    assert "0001-26-000003" in narrates[(True, False)]
    assert (
        "0001-26-000004" in narrates[(False, True)]
    )  # press releases make section 7 even with no articles
    assert "7. News and views" in result.html_path.read_text()
    assert "No readable articles" not in result.html_path.read_text()


# --- REITs: price ÷ FFO (Phase 1b) ----------------------------------------------------------


class Reits(FakeData):
    async def holdings(self, sec_tickers, *, today):
        rows = [
            HoldingRow(f"T{i}", 1000 + i, f"Company {i}", "Real Estate", float(100 - i))
            for i in range(N)
        ]
        return Refreshed(Holdings(date(2026, 11, 3), "bundled", rows), None)

    async def submissions(self, cik):
        return {"name": f"Company {cik - 1000}", "sic": "6798"}

    async def company_facts(self, cik):
        facts = company_facts(cik - 1000)
        us = facts["facts"]["us-gaap"]
        dep = json.loads(json.dumps(us["DepreciationDepletionAndAmortization"]))
        us["RealEstateDepreciationAndAmortization"] = dep
        return facts


def test_reits_use_residual_income_and_price_to_ffo(database, tmp_path):
    run, result = run_full(database, tmp_path, data=Reits())
    company = run.members[COMPANY]
    methods = {m.method: m for m in company.valuation.methods}
    assert set(methods) == {"dcf", "residual_income", "price_to_ffo"}
    assert methods["price_to_ffo"].valid, methods["price_to_ffo"].reason
    assert "approximation" in methods["price_to_ffo"].details["note"]


class WithInsiders(FakeData):
    async def form4_trades(self, cik, *, today):
        return [("Jane Director", date(2026, 9, 10), "P"), ("Sam Officer", date(2026, 9, 1), "S")]


def test_the_insider_buying_note_shows_in_section_5(database, tmp_path):
    run, result = run_full(database, tmp_path, data=WithInsiders())
    html = result.html_path.read_text()
    assert "Insider buying: Jane Director bought shares on the open market" in html


def test_the_skeptic_sees_filled_values_and_knows_code_made_them(database, tmp_path):
    # The first live Apple report (2026-11-05): the skeptic saw raw {{metric:...}} placeholders
    # and marked those claims unsupported.
    state = ToolState(database.conn, "claude")
    state.record_check(version="1.0", model_ids=["fake-small"], form="full", passed=True)
    connector = FakeConnector(default=clean_ai)
    run = Run(
        database.conn,
        FakeData(),
        AIClient(connector, state, retry_wait_s=0),
        load(),
        mode="full",
        now=NOW,
        out_dir=None,
    )
    asyncio.run(run.run("T0"))
    checks = [r for r in connector.requests if r.task == "skeptic"]
    assert checks
    for r in checks:
        claims = r.instructions.split("judge only the rest of each claim):", 1)[1].split(
            "Evidence items", 1
        )[0]
        assert "{{" not in claims
        assert "Operating margin was" in claims and "%" in claims
        assert "computed by code" in r.instructions


class NewsAndTrends(WithNews, WithTrends):
    pass


def test_sections_come_in_report_order(database, tmp_path):
    def both(request):
        if request.task == "link_search":
            return news_ai(request)
        return trends_ai(request)

    state = ToolState(database.conn, "claude")
    state.record_check(version="1.0", model_ids=["fake-small"], form="full", passed=True)
    run = Run(
        database.conn,
        NewsAndTrends(),
        AIClient(FakeConnector(default=both), state, retry_wait_s=0),
        load(),
        mode="full",
        now=NOW,
        out_dir=tmp_path / "r",
    )
    html = asyncio.run(run.run("T0")).html_path.read_text()
    order = [
        html.index(h)
        for h in (
            "4. The business",
            "5. Risks",
            "6. Recent results",
            "7. News and views",
            "8. Industry trends",
            "What to watch",
            "9. Methodology",
        )
    ]
    assert order == sorted(order)
    assert "not built yet" not in html and "narrative still from filings only" not in html


# --- for the app: progress, cancel, and the error that stopped a run ------------------------


def test_progress_reports_each_step_started_and_done(database, tmp_path):
    events = []
    run = Run(
        database.conn,
        FakeData(),
        None,
        load(),
        now=NOW,
        out_dir=None,
        progress=lambda s, st: events.append((s, st)),
    )
    asyncio.run(run.run("T0"))
    assert ("resolve", "started") in events and ("resolve", "done") in events
    assert (
        events.index(("resolve", "started"))
        < events.index(("resolve", "done"))
        < events.index(("fetch", "started"))
    )
    assert ("save", "done") in events


def test_a_cancelled_run_stops_between_steps(database, tmp_path):
    from tearsheet.pipeline import RunCancelled

    holder = {}

    def cancel_at_score(step, state):
        if step == "score" and state == "started":
            holder["run"].cancel()

    run = Run(
        database.conn, FakeData(), None, load(), now=NOW, out_dir=None, progress=cancel_at_score
    )
    holder["run"] = run
    with pytest.raises(RunCancelled):
        asyncio.run(run.run("T0"))
    row = database.conn.execute("SELECT status, last_step_done FROM runs").fetchone()
    # The cancel arrives as "score" starts: that step finishes, and the run stops before "value".
    assert (row["status"], row["last_step_done"]) == ("cancelled", "score")


def test_the_error_that_stopped_the_ai_steps_is_kept(database, tmp_path):
    def limited(request):
        if request.task == "narrate":
            return AIUsageLimit(
                "You've hit your limit. Resets 3am", reset_at="2026-11-06T03:00:00-05:00"
            )
        return fake_ai(request)

    run, result, _ = run_slice(database, tmp_path, default=limited)
    assert result.status == "stopped"
    assert run.stop_error.code == "USAGE_LIMIT" and run.stop_error.reset_at.startswith("2026-11-06")


# --- the other-tool skeptic (Phase 2) ---------------------------------------------------------


def run_with_checker(database, tmp_path, checker_fake):
    """A full run on Claude Code whose skeptic runs on a fake Codex."""
    from tearsheet.ai.client import CallBudget

    for tool in ("claude", "codex"):
        ToolState(database.conn, tool).record_check(
            version="1.0", model_ids=["m"], form="full", passed=True
        )
    primary = FakeConnector(default=skeptic_script(lambda section, ids: []))
    other = FakeConnector(default=checker_fake)
    other.tool, other.display_name = "codex", "Codex"
    budget = CallBudget(50)
    ai = AIClient(primary, ToolState(database.conn, "claude"), retry_wait_s=0, budget=budget)
    checker = AIClient(other, ToolState(database.conn, "codex"), retry_wait_s=0, budget=budget)
    run = Run(
        database.conn,
        FakeData(),
        ai,
        load(),
        mode="full",
        now=NOW,
        out_dir=tmp_path / "r",
        checker=checker,
    )
    return run, asyncio.run(run.run("T0")), primary, other


def test_the_skeptic_runs_on_the_other_tool_when_both_are_connected(database, tmp_path):
    def codex(request):
        assert request.task == "skeptic"
        return answer(SkepticReport(findings=[]), model_id="gpt-fake")

    run, result, primary, other = run_with_checker(database, tmp_path, codex)
    assert [r.task for r in primary.requests].count("skeptic") == 0
    assert [r.task for r in other.requests].count("skeptic") == 4
    html = result.html_path.read_text()
    assert "checked by Codex" in html and "self-checked" not in html
    # One budget for the run: both tools' calls count against it.
    assert run.ai.sent == len(primary.requests) + len(other.requests)
    row = database.conn.execute(
        "SELECT ai_calls, model_ids_json FROM runs WHERE run_id = ?", (run.run_id,)
    ).fetchone()
    assert row[0] == run.ai.sent and "gpt-fake" in json.loads(row[1])


def test_a_failed_other_tool_call_falls_back_to_a_fresh_session_of_the_same_tool(
    database, tmp_path
):
    def codex(request):
        return AIUsageLimit("You've hit your usage limit.")

    run, result, primary, other = run_with_checker(database, tmp_path, codex)
    assert [r.task for r in other.requests].count("skeptic") == 1  # not tried again
    assert [r.task for r in primary.requests].count("skeptic") == 4
    assert run.stop_error is None  # Codex's limit doesn't stop a Claude Code run
    html = result.html_path.read_text()
    assert "self-checked" in html
    assert "The skeptic call on Codex failed" in html


def test_a_mix_says_which_sections_were_self_checked(database, tmp_path):
    def codex(request):
        # The risks section's call and its one retry fail. Sections are checked 3 at a time,
        # so which others were already on Codex when it failed depends on timing; every
        # section that wasn't is self-checked, and the box names them all.
        if "Section: risks." in request.instructions:
            return AIUnavailable("Codex had a temporary error.")
        return answer(SkepticReport(findings=[]), model_id="gpt-fake")

    run, result, primary, other = run_with_checker(database, tmp_path, codex)
    text = run._skeptic_text()
    selves = sorted(s for s, who in run.checked_by.items() if who == "self")
    assert text.startswith("checked by Codex, except ")
    assert "risks" in selves and all(s in text for s in selves)
    assert "self-checked" in text
    assert [r.task for r in primary.requests].count("skeptic") == len(selves)


def test_the_checker_is_the_other_tool_only_when_it_is_connected(database, tmp_path, monkeypatch):
    from tearsheet import config
    from tearsheet.ai import checker_for

    settings = config.Settings(database.conn)
    primary = AIClient(FakeConnector(), ToolState(database.conn, "claude"))
    monkeypatch.setattr(config, "find_program", lambda tool: tmp_path / tool)
    # Never checked: used without setup, and the gate runs the short check before its first call.
    checker = checker_for(database.conn, settings, primary)
    assert checker is not None and checker.connector.tool == "codex"
    assert checker.shared_budget is primary.shared_budget

    ToolState(database.conn, "codex").mark_tool_use_attempt()
    assert checker_for(database.conn, settings, primary) is not None  # the gate re-checks it

    ToolState(database.conn, "codex").record_check(
        version="codex-cli 0.165.0", model_ids=[], form="full", passed=False
    )
    assert checker_for(database.conn, settings, primary) is None  # failed: blocked

    monkeypatch.setattr(config, "find_program", lambda tool: None)
    ToolState(database.conn, "codex").record_check(
        version="codex-cli 0.165.0", model_ids=[], form="full", passed=True
    )
    assert checker_for(database.conn, settings, primary) is None  # not found


# --- the prediction log (item 35) -------------------------------------------------------------


class WithFilingList(FakeData):
    """FakeData whose filing list gives SEC's acceptance times for the two filings."""

    async def submissions(self, cik):
        subs = await super().submissions(cik)
        subs["filings"] = {
            "recent": {
                "accessionNumber": ["0001-26-000001", "0001-26-000002"],
                "form": ["10-K", "10-Q"],
                "filingDate": ["2026-02-15", "2026-10-30"],
                "reportDate": ["2025-12-31", "2026-09-30"],
                "acceptanceDateTime": ["2026-02-14T21:05:00.000Z", "2026-10-30T20:31:12.000Z"],
                "items": ["", ""],
                "primaryDocument": ["k.htm", "q.htm"],
            }
        }
        return subs

    async def fill_prices(self, store, members, *, end):
        # Prices up to the run's own day, so a run a month later isn't withheld for stale prices.
        days = sessions_between(date(2025, 8, 1), end)
        for cik in [*members, SPY_CIK]:
            rnd = random.Random(cik)
            price, bars = 50.0 + (cik % 17), []
            for day in days:
                price *= math.exp(rnd.gauss(0.0004, 0.015 + (cik % 5) * 0.002))
                start = datetime(day.year, day.month, day.day, 5, tzinfo=UTC)
                bars.append({"t": int(start.timestamp() * 1000), "c": price, "v": 1000})
            store.store_bars(cik, "", {"results": bars}, raw_hash="fake")

    async def risk_free(self, day):
        return (day, 0.042)


def logged(database, tmp_path, *, now=NOW, log=True, mode="full", ai=True):
    state = ToolState(database.conn, "claude")
    state.record_check(
        version="1.0", model_ids=["fake-small", "fake-large"], form="full", passed=True
    )
    client = AIClient(FakeConnector(default=clean_ai), state, retry_wait_s=0) if ai else None
    run = Run(
        database.conn,
        WithFilingList(),
        client,
        load(),
        mode=mode,
        now=now,
        out_dir=tmp_path / "r",
        log_predictions=log,
        backup_dir=tmp_path / "backups",
    )
    return run, asyncio.run(run.run("T0"))


def prediction_rows(database):
    return [dict(r) for r in database.conn.execute("SELECT * FROM predictions ORDER BY run_at")]


def test_a_live_full_run_logs_one_official_prediction_and_backs_up(database, tmp_path):
    run, result = logged(database, tmp_path)
    [p] = prediction_rows(database)
    assert p["prediction_id"] == run.prediction_id and p["run_id"] == run.run_id
    assert p["cik"] == COMPANY and p["ticker"] == "T0"
    assert p["rating"] == result.rating
    assert p["run_at"] == NOW.isoformat()
    # The latest filing's acceptance time, from SEC's filing list (the start price waits for it).
    assert p["latest_acceptance_at"] == "2026-10-30T20:31:12+00:00"
    assert json.loads(p["accessions_json"]) == ["0001-26-000001", "0001-26-000002"]
    assert p["ai_tool"] == "claude"
    assert json.loads(p["model_ids_json"]) == ["fake-large", "fake-small"]
    assert len(p["inputs_hash"]) == 64
    assert p["methodology_hash"] == load().methodology_hash
    assert p["uncertainty"] and json.loads(p["percentile_lines_json"])
    if p["bear"] is not None:
        assert p["bear"] <= p["base"] <= p["bull"]
    assert p["previous_rating"] is None
    assert list((tmp_path / "backups").glob("tearsheet-*.sqlite"))
    html = result.html_path.read_text()
    assert "Logged as an official prediction" in html
    assert "can&#39;t be changed" in html or "can't be changed" in html
    assert "Logged as an official prediction" in (result.prediction or "")
    # The prediction's ID stays off the step outputs, so a replay compares them exactly.
    rate = database.conn.execute(
        "SELECT json FROM step_outputs WHERE run_id = ? AND step = 'rate'", (run.run_id,)
    ).fetchone()[0]
    assert run.prediction_id not in rate


def test_only_the_first_rated_run_in_30_days_is_official(database, tmp_path):
    from datetime import timedelta

    first, _ = logged(database, tmp_path)
    second, result = logged(database, tmp_path, now=NOW + timedelta(days=29, hours=23))
    assert second.prediction_id is None
    assert len(prediction_rows(database)) == 1
    html = result.html_path.read_text()
    assert "only the first rated run in 30 days is official" in html
    assert (
        "Previous official rating" in html
        and "none" not in html.split("Previous official rating")[1][:20]
    )

    third, _ = logged(database, tmp_path, now=NOW + timedelta(days=30))
    rows = prediction_rows(database)
    assert len(rows) == 2 and third.prediction_id == rows[1]["prediction_id"]
    assert rows[1]["previous_rating"] == rows[0]["rating"]
    assert rows[1]["previous_rating_at"] == NOW.isoformat()


def test_offline_slice_and_unlogged_runs_never_write_to_the_log(database, tmp_path):
    run, result = logged(database, tmp_path, log=False)
    assert prediction_rows(database) == []
    assert "only live full-method runs log one" in result.html_path.read_text()
    logged(database, tmp_path, mode="slice")
    assert prediction_rows(database) == []


def test_a_run_with_no_ai_still_logs_the_code_made_rating(database, tmp_path):
    run, _ = logged(database, tmp_path, ai=False)
    [p] = prediction_rows(database)
    assert p["ai_tool"] == "none" and json.loads(p["model_ids_json"]) == []


def test_logged_predictions_can_never_be_changed(database, tmp_path):
    import sqlite3

    logged(database, tmp_path)
    with pytest.raises(sqlite3.IntegrityError):
        with database.conn:
            database.conn.execute("UPDATE predictions SET rating = 'Buy'")
    with pytest.raises(sqlite3.IntegrityError):
        with database.conn:
            database.conn.execute("DELETE FROM predictions")
    assert len(prediction_rows(database)) == 1


# --- share counts from the cover page (per-class market value) ---------------------------------


class CoverOnly(FakeData):
    """The company's facts have no cover-page count (as for Berkshire, whose counts SEC reports
    only by class), so the count comes from its filing's cover page: 100 shares of a class worth
    10 of the rated class each, plus 1,000 of the rated class."""

    async def company_facts(self, cik):
        facts = await super().company_facts(cik)
        if cik == COMPANY:
            facts["facts"]["dei"] = {}
        return facts

    async def cover_share_counts(self, cik, *, today):
        from tearsheet.data.sec import CoverCount

        return [
            CoverCount("T0.A", "us-gaap:CommonClassAMember", 100.0, date(2026, 10, 20)),
            CoverCount("T0", "us-gaap:CommonClassBMember", 1000.0, date(2026, 10, 20)),
        ], "0001-26-000002"


def test_cover_page_counts_are_converted_to_the_rated_class(database, tmp_path, monkeypatch):
    from tearsheet import pipeline as pl

    monkeypatch.setitem(pl.CONVERSION_RATIOS, "T0.A", 10.0)
    run = Run(
        database.conn, CoverOnly(), None, load(), mode="full", now=NOW, out_dir=tmp_path / "r"
    )
    asyncio.run(run.run("T0"))
    company = run.members[COMPANY]
    assert company.cover_shares == pytest.approx(100 * 10 + 1000)
    assert company.inputs.market_value == pytest.approx(company.price[1] * 2000)
    assert any("cover page of filing 0001-26-000002" in n for n in run.notes)
    # A peer with a usable count in its company facts doesn't fetch its cover page.
    assert run.members[COMPANY + 1].cover_shares is None


def test_a_run_with_stale_prices_logs_no_prediction(database, tmp_path):
    from datetime import timedelta

    # The test data's prices end on 4 Nov, so a run 10 days later has stale prices.
    state = ToolState(database.conn, "claude")
    state.record_check(version="1.0", model_ids=["m"], form="full", passed=True)
    run = Run(
        database.conn,
        FakeData(),
        None,
        load(),
        mode="full",
        now=NOW + timedelta(days=10),
        out_dir=tmp_path / "r",
        log_predictions=True,
        backup_dir=tmp_path / "backups",
    )
    asyncio.run(run.run("T0"))
    assert run.withheld and run.prediction_id is None
    assert prediction_rows(database) == []
    assert "the rating is withheld" in run.prediction_note


def test_a_backup_opens_and_holds_every_prediction_and_its_prices(database, tmp_path):
    from datetime import timedelta

    from tearsheet.db import open_database

    logged(database, tmp_path)
    logged(database, tmp_path, now=NOW + timedelta(days=31))
    backups = sorted((tmp_path / "backups").glob("tearsheet-*.sqlite"))
    assert backups
    copy = open_database(backups[-1])
    try:
        held = {r[0] for r in copy.conn.execute("SELECT prediction_id FROM predictions")}
        assert held == {r["prediction_id"] for r in prediction_rows(database)} and len(held) == 2
        # Each prediction's peer prices travel with it, so it can be graded from the copy.
        peers = copy.conn.execute(
            "SELECT COUNT(DISTINCT cik) FROM prices_daily WHERE cik IN (SELECT peer_cik FROM peer_groups)"
        ).fetchone()[0]
        assert peers > 0
    finally:
        copy.close()


def test_prices_are_topped_up_only_to_the_latest_closed_session(database, tmp_path):
    """6 Nov 2026, the golden-set download: at 9pm in New York the UTC date is already the next
    day, and asking Massive for that day got HTTP 403. The top-up stops at the latest session
    whose close is out."""
    from tearsheet.data.prices import last_completed_session

    asked = []

    class Recording(FakeData):
        async def fill_prices(self, store, members, *, end):
            asked.append(end)
            await super().fill_prices(store, members, end=end)

    evening = datetime(2026, 11, 6, 2, 0, tzinfo=UTC)  # 9pm on 5 Nov in New York
    run = Run(database.conn, Recording(), None, load(), mode="full", now=evening, out_dir=None)
    asyncio.run(run.run("T0"))
    assert asked == [date(2026, 11, 5)] == [last_completed_session(evening)]
    assert evening.date() == date(2026, 11, 6)  # what it used to ask for


# --- SEC data gaps (golden set, 6 Nov 2026) ----------------------------------------------------

OLD_CIK = 5000  # the predecessor company's SEC number


def _with_predecessor(method, links):
    from dataclasses import replace

    return replace(method, aliases={**method.aliases, "predecessors": links})


def _rows_where(facts, keep):
    """A copy of company facts keeping only the rows `keep(row)` accepts."""
    out = {**facts, "facts": {}}
    for ns, tags in facts["facts"].items():
        out["facts"][ns] = {}
        for tag, entry in tags.items():
            units = {u: [r for r in rows if keep(r)] for u, rows in entry["units"].items()}
            out["facts"][ns][tag] = {"units": units}
    return out


class Successor(FakeData):
    """The company moved under a new parent on 1 Jul 2026 (as Exxon did): its new SEC number
    has only reports filed since then, and its 10-K is under the old number."""

    def __init__(self):
        super().__init__()
        self.asked: dict[str, object] = {}

    async def company_facts(self, cik):
        if cik == OLD_CIK:
            return _rows_where(company_facts(0), lambda r: r["filed"] < "2026-07-01")
        facts = await super().company_facts(cik)
        if cik == COMPANY:
            return _rows_where(facts, lambda r: r["filed"] >= "2026-07-01")
        return facts

    async def filing_documents(self, cik, *, today, predecessors=()):
        self.asked["predecessors"] = predecessors
        docs = await super().filing_documents(cik, today=today)
        return docs if OLD_CIK in predecessors else [d for d in docs if d.role != "10-K"]


def test_a_successor_company_reads_its_predecessor_s_facts_and_filings(database, tmp_path):
    method = _with_predecessor(load(), {COMPANY: [OLD_CIK]})
    data = Successor()
    run = Run(database.conn, data, None, method, mode="full", now=NOW, out_dir=None)
    asyncio.run(run.run("T0"))
    company = run.members[COMPANY]
    from tearsheet.normalize import Financials

    whole = Financials(company_facts(0), as_of=NOW.date()).ttm("revenue")
    assert company.fin.ttm("revenue") == whole  # the two numbers' facts together are the whole
    assert data.asked["predecessors"] == (OLD_CIK,)
    assert any("CIK 5000" in n for n in run.notes)


def test_without_the_link_a_successor_has_no_annual_figures(database, tmp_path):
    run = Run(database.conn, Successor(), None, load(), mode="full", now=NOW, out_dir=None)
    asyncio.run(run.run("T0"))
    assert run.members[COMPANY].fin.ttm("revenue") is None


class UnlistedSuccessor(Successor):
    async def submissions(self, cik):
        subs = await super().submissions(cik)
        if cik == COMPANY:
            subs["filings"] = {
                "recent": {
                    "accessionNumber": ["0001-26-000009"],
                    "form": ["8-K12B"],
                    "filingDate": ["2026-07-01"],
                    "reportDate": [""],
                    "primaryDocument": ["d8k12b.htm"],
                }
            }
        return subs


def test_a_successor_missing_from_the_list_is_named_in_the_notes(database, tmp_path):
    run = Run(database.conn, UnlistedSuccessor(), None, load(), mode="full", now=NOW, out_dir=None)
    asyncio.run(run.run("T0"))
    assert any("8-K12B" in n and "predecessors" in n for n in run.notes)


class LaggingFacts(FakeData):
    """SEC's company facts stop at the 2025 year end for the company (as they did for Prologis
    and Duke), while its September 10-Q has been filed; the filing's own figures fill the gap."""

    def __init__(self, *, readable=True):
        super().__init__()
        self.readable = readable
        self.read: list[str] = []
        self.listed: list[int] = []

    async def company_facts(self, cik):
        facts = await super().company_facts(cik)
        if cik == COMPANY:
            return _rows_where(facts, lambda r: r["filed"] < "2026-10-01")
        return facts

    async def submissions(self, cik):
        self.listed.append(cik)
        subs = await super().submissions(cik)
        subs["filings"] = {
            "recent": {
                "accessionNumber": ["0001-26-000002"],
                "form": ["10-Q"],
                "filingDate": ["2026-10-30"],
                "reportDate": ["2026-09-30"],
                "primaryDocument": ["q.htm"],
            }
        }
        return subs

    async def report_facts(self, filing):
        self.read.append(filing.accession)
        if not self.readable:
            raise LookupError("not stored")
        return _rows_where(company_facts(0), lambda r: r["filed"] >= "2026-10-01")


def test_figures_missing_from_sec_facts_are_read_from_the_newer_filing(database, tmp_path):
    data = LaggingFacts()
    run = Run(database.conn, data, None, load(), mode="full", now=NOW, out_dir=None)
    asyncio.run(run.run("T0"))
    fin = run.members[COMPANY].fin
    assert fin.ttm("revenue").end == date(2026, 9, 30)
    assert fin.latest("total_assets").end == date(2026, 9, 30)
    assert data.read == ["0001-26-000002"]
    assert any("read from that filing directly" in n for n in run.notes)
    # Peers whose facts are up to date don't have their filing lists read.
    assert COMPANY + 1 not in data.listed


def test_an_unreadable_newer_filing_is_named_and_the_older_figures_kept(database, tmp_path):
    data = LaggingFacts(readable=False)
    run = Run(database.conn, data, None, load(), mode="full", now=NOW, out_dir=None)
    asyncio.run(run.run("T0"))
    assert run.members[COMPANY].fin.ttm("revenue").end == date(2025, 12, 31)
    assert any("couldn't be read from the filing" in n for n in run.notes)


def test_a_run_records_seconds_per_step(database, tmp_path):
    from tearsheet.cli import time_line

    run, result, connector = run_slice(database, tmp_path)
    assert result.timings is not None
    steps = result.timings["steps"]
    assert list(steps)[:3] == ["resolve", "fetch", "normalize"] and "verify" in steps
    assert result.timings["ai"]["extract"]["calls"] == sum(
        r.task == "extract" for r in connector.requests
    )
    stored = json.loads(
        database.conn.execute(
            "SELECT json FROM step_outputs WHERE run_id = ? AND step = 'timings'", (run.run_id,)
        ).fetchone()[0]
    )
    assert stored == result.timings
    # The run's resume point is untouched by it.
    assert (
        database.conn.execute(
            "SELECT last_step_done FROM runs WHERE run_id = ?", (run.run_id,)
        ).fetchone()[0]
        == "save"
    )
    assert time_line({"total_s": 272, "steps": {"fetch": 36, "rate": 0.1, "extract": 95}}) == (
        "Time: 4.5 min (fetch 36 s, extract 1.6 min)."
    )
