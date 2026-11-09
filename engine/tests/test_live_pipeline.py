"""The full method on the live data source, with every service mocked (design items 34, 39).

This exercises LiveData's wiring (SEC, Massive, FRED, iShares) end to end without the network,
so the first real `tearsheet-engine run --full` isn't the first time these paths run.
"""

from __future__ import annotations

import asyncio
import math
import random
import re
from datetime import UTC, datetime

import httpx
import respx

from tearsheet.ai.client import AIClient, ToolState
from tearsheet.data.prices import sessions_between
from tearsheet.http import HttpClient
from tearsheet.methodology import load
from tearsheet.pipeline import Run
from tearsheet.rawstore import RawStore
from tearsheet.sources import LiveData
from tests.fakes.ai import FakeConnector, answer
from tests.test_pipeline import NOW, clean_ai, company_facts
from tests.test_sec import UA, form4_xml, rows_for, submissions

APPLE = 320193


def bars(request: httpx.Request, ticker: str) -> httpx.Response:
    rnd = random.Random(ticker)
    price, rows = 40.0 + len(ticker), []
    for day in sessions_between(datetime(2025, 8, 1).date(), datetime(2026, 11, 4).date()):
        price *= math.exp(rnd.gauss(0.0004, 0.015))
        start = datetime(day.year, day.month, day.day, 5, tzinfo=UTC)
        rows.append({"t": int(start.timestamp() * 1000), "c": price, "v": 1000})
    return httpx.Response(200, json={"status": "OK", "results": rows})


def fred(request: httpx.Request) -> httpx.Response:
    obs = [{"date": f"2025-{m:02d}-01", "value": "100.0"} for m in range(1, 13)]
    obs += [{"date": "2026-10-01", "value": "104.2"}, {"date": "2026-11-04", "value": "4.20"}]
    return httpx.Response(200, json={"observations": obs})


def facts(request: httpx.Request, cik: str) -> httpx.Response:
    data = company_facts(int(cik) % 97)
    data["cik"] = int(cik)
    return httpx.Response(200, json=data)


def archive(request: httpx.Request) -> httpx.Response:
    """SEC's archive for any company in the made-up submissions (test_sec's rows)."""
    match = re.match(r"/Archives/edgar/data/(\d+)/(\d+)/(.+)$", request.url.path)
    cik, folder, name = match.groups()
    forms = {r[0].replace("-", ""): (r[1], r[5]) for r in rows_for(int(cik))}
    if name.endswith("-index.htm"):
        form, primary = forms[folder]
        rows = [(form, primary)] + ([("EX-99.1", "ex99-1.htm")] if form == "8-K" else [])
        cells = "".join(
            f'<tr><td>{n}</td><td>doc</td><td><a href="/Archives/edgar/data/{cik}/{folder}/{doc}">{doc}</a></td><td>{kind}</td><td>1</td></tr>'
            for n, (kind, doc) in enumerate(rows, start=1)
        )
        return httpx.Response(
            200,
            html=f'<html><body><table class="tableFile" summary="Document Format Files"><tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th><th>Size</th></tr>{cells}</table></body></html>',
        )
    if name.endswith(".xml"):
        return httpx.Response(
            200, content=form4_xml("S", "2026-08-29"), headers={"content-type": "text/xml"}
        )
    return httpx.Response(200, html=f"<html><body><p>{name}</p></body></html>")


def live_ai(request):
    if request.task == "link_search":
        from tearsheet.ai.schemas import LinkList

        return answer(LinkList(links=[]), model_id="fake-large", tool_events=["WebSearch"])
    return clean_ai(request)


def mock_services(mock: respx.MockRouter) -> None:
    mock.get("https://www.sec.gov/files/company_tickers.json").mock(
        return_value=httpx.Response(
            200, json={"0": {"cik_str": APPLE, "ticker": "AAPL", "title": "Apple Inc."}}
        )
    )
    mock.get(url__regex=r"https://data\.sec\.gov/submissions/CIK(?P<cik>\d{10})\.json").mock(
        side_effect=lambda request, cik: httpx.Response(200, json=submissions(int(cik)))
    )
    mock.get(
        url__regex=r"https://data\.sec\.gov/api/xbrl/companyfacts/CIK(?P<cik>\d{10})\.json"
    ).mock(side_effect=facts)
    mock.get(url__regex=r"https://www\.sec\.gov/Archives/edgar/data/.*").mock(side_effect=archive)
    mock.get(url__regex=r"https://www\.ishares\.com/.*").mock(
        return_value=httpx.Response(
            200, html="<html><body>iShares</body></html>", headers={"content-type": "text/csv"}
        )
    )
    mock.get(
        url__regex=r"https://api\.massive\.com/v2/aggs/ticker/(?P<ticker>[^/]+)/range/1/day/.*"
    ).mock(side_effect=bars)
    mock.get(url__regex=r"https://api\.massive\.com/v3/reference/(dividends|splits).*").mock(
        return_value=httpx.Response(200, json={"status": "OK", "results": []})
    )
    mock.get(url__regex=r"https://api\.stlouisfed\.org/fred/series/observations.*").mock(
        side_effect=fred
    )


def test_the_full_method_runs_on_the_live_data_source(database, tmp_path):
    rawstore = RawStore(tmp_path / "raw", database.conn)
    state = ToolState(database.conn, "claude")
    state.record_check(version="1.0", model_ids=["fake-small"], form="full", passed=True)
    ai = AIClient(FakeConnector(default=live_ai), state, retry_wait_s=0)

    async def go():
        with respx.mock(assert_all_called=False) as mock:
            mock_services(mock)
            async with HttpClient(
                rawstore, "run-live", sec_user_agent=UA, sleep=lambda s: asyncio.sleep(0)
            ) as http:
                data = LiveData(http, rawstore, database.conn, fred_key="test-key")
                run = Run(
                    database.conn,
                    data,
                    ai,
                    load(),
                    mode="full",
                    now=NOW,
                    out_dir=tmp_path / "r",
                    run_id="run-live",
                    rawstore=rawstore,
                )
                return run, await run.run("AAPL"), http

    run, result, http = asyncio.run(go())
    assert result.status in ("done", "done_incomplete"), result.notes
    assert result.rating in ("Buy", "Hold", "Sell")
    # The member list is the shipped one, and ishares.com is never asked (launch-readiness M3).
    assert any("shipped with this version" in n for n in result.notes)
    assert not any(svc == "ishares" for (svc, _code) in http.statuses)
    statuses = {code for (svc, code) in http.statuses if svc == "sec"}
    assert statuses == {200}
    assert run.members[APPLE].valuation.valid
    assert len(run.peer_docs) == 3
    assert run.macro and "UNRATE" in run.macro
    kinds = {kind for (svc, kind) in http.requests if svc == "sec"}
    assert {"submissions", "company_facts", "filing_index", "filing_document", "form4"} <= kinds
    keys = [
        r[0]
        for r in database.conn.execute(
            "SELECT request_key FROM fetch_log WHERE run_id = 'run-live'"
        )
    ]
    assert not any(re.search(r"api_key=test-key", k) for k in keys)
    assert any(k.startswith("tearsheet:methodology/") for k in keys)
