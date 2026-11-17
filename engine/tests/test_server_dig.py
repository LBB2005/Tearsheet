"""Dig deeper's engine methods: get_dig_deeper reads only; refresh_dig_deeper fetches as one job
per company, saves a snapshot, and never touches runs, predictions or reports."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from tearsheet.dig.snapshot import Sources
from tearsheet.protocol import DigPage
from tests.test_analystdb import Service, saved
from tests.test_dig_news import FIXTURES
from tests.test_dig_snapshot import FakeHttp, FakeLive
from tests.test_protocol import Harness, run
from tests.test_server_lookups import _one_report

COUNTED = ("runs", "predictions", "reports", "report_levels")
T0 = 1000


def with_fake_sources(h: Harness) -> None:
    answers = {
        "/consensus/T0": saved("consensus_AMD"),
        "/events/T0": saved("events_AMD"),
        "/scorecards/firms": saved("scorecards_firms"),
        "/crosscheck/T0": saved("crosscheck_AMD"),
    }

    @asynccontextmanager
    async def dig_factory(snapshot_id, conn, rawstore):
        from tearsheet.config import Settings

        yield Sources(
            http=FakeHttp((FIXTURES / "massive_news_ok.json").read_bytes()),
            live=FakeLive(),
            settings=Settings(conn),
            rawstore=rawstore,
            analystdb=Service(answers).client(),
            fred_key=True,
            massive_key=True,
        )

    h.server.dig_factory = dig_factory


def counts(h):
    return {t: h.server.db.conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in COUNTED}


def test_get_reads_only_and_is_empty_before_a_refresh(tmp_path):
    h = Harness(tmp_path, log_predictions=True)

    async def go():
        await _one_report(h)
        return await h.call("get_dig_deeper", {"cik": T0}, id_=2)

    page = DigPage.model_validate(run(go())["result"])
    assert (page.ticker, page.name, page.has_report) == ("T0", "Company 0", True)
    assert page.snapshot is None and page.older == 0 and page.refreshing is False
    assert h.server.db.conn.execute("SELECT COUNT(*) FROM dig_snapshots").fetchone()[0] == 0
    h.server.close()


def test_refresh_saves_a_snapshot_and_get_returns_it(tmp_path):
    h = Harness(tmp_path, log_predictions=True)
    with_fake_sources(h)

    async def go():
        await _one_report(h)
        before = counts(h)
        refreshed = await h.call("refresh_dig_deeper", {"cik": T0}, id_=2)
        again = await h.call("get_dig_deeper", {"cik": T0}, id_=3)
        return before, refreshed, again

    before, refreshed, again = run(go())
    page = DigPage.model_validate(refreshed["result"])
    assert page.snapshot is not None and page.snapshot.peers.state == "ok"
    assert page.snapshot.news.state == "ok" and page.snapshot.insiders.state == "ok"
    assert DigPage.model_validate(again["result"]).snapshot.snapshot_id == page.snapshot.snapshot_id
    assert counts(h) == before
    h.server.close()


def test_two_refreshes_of_one_company_share_one_job(tmp_path):
    h = Harness(tmp_path, log_predictions=True)
    with_fake_sources(h)

    async def go():
        await _one_report(h)
        return await asyncio.gather(
            h.call("refresh_dig_deeper", {"cik": T0}, id_=2),
            h.call("refresh_dig_deeper", {"cik": T0}, id_=3),
        )

    first, second = run(go())
    assert first["result"]["snapshot"]["snapshot_id"] == second["result"]["snapshot"]["snapshot_id"]
    assert h.server.db.conn.execute("SELECT COUNT(*) FROM dig_snapshots").fetchone()[0] == 1
    h.server.close()


def test_a_second_refresh_keeps_the_first_and_counts_it(tmp_path):
    h = Harness(tmp_path, log_predictions=True)
    with_fake_sources(h)

    async def go():
        await _one_report(h)
        await h.call("refresh_dig_deeper", {"cik": T0}, id_=2)
        return await h.call("refresh_dig_deeper", {"cik": T0}, id_=3)

    page = DigPage.model_validate(run(go())["result"])
    assert page.older == 1
    h.server.close()


def test_refresh_without_a_report_is_no_report(tmp_path):
    h = Harness(tmp_path)
    with_fake_sources(h)

    async def go():
        await h.server.start()
        got = await h.call("get_dig_deeper", {"cik": 320193}, id_=2)
        refused = await h.call("refresh_dig_deeper", {"cik": 320193}, id_=3)
        return got, refused

    got, refused = run(go())
    page = DigPage.model_validate(got["result"])
    assert (page.ticker, page.name, page.has_report) == ("AAPL", "Apple Inc.", False)
    assert refused["error"]["data"]["code"] == "NO_REPORT"
    assert refused["error"]["message"] == "Dig deeper needs a report on this company first."
    h.server.close()
