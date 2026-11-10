"""AI calls 5 at a time (Technical Plan §3), and the link search that starts while the data
downloads."""

from __future__ import annotations

import asyncio
import random

import pytest

from tearsheet import config
from tearsheet.ai.client import AIClient, AIUsageLimit, ToolState
from tearsheet.methodology import load
from tearsheet.pipeline import Run, RunCancelled, RunFailed
from tests.fakes.ai import FakeConnector
from tests.test_pipeline import NOW, NewsAndTrends, WithNews, clean_ai, news_ai


class Jittery(FakeConnector):
    """Answers after a random short wait, so calls finish in a different order each time."""

    def __init__(self, *args, seed: int = 0, **kwargs):
        super().__init__(*args, **kwargs)
        self.random = random.Random(seed)

    async def call(self, request):
        await asyncio.sleep(self.random.uniform(0.001, 0.01))
        return await super().call(request)


def make_run(database, tmp_path, connector, *, data=None, name="r"):
    state = ToolState(database.conn, "claude")
    state.record_check(version="1.0", model_ids=["fake-small"], form="full", passed=True)
    return Run(
        database.conn,
        data or NewsAndTrends(),
        AIClient(connector, state, retry_wait_s=0),
        load(),
        mode="full",
        now=NOW,
        out_dir=tmp_path / name,
    )


def test_ai_calls_run_five_at_a_time(database, tmp_path):
    connector = FakeConnector(default=news_ai, delay_s=0.01)
    result = asyncio.run(make_run(database, tmp_path, connector).run("T0"))
    assert result.status == "done"
    assert connector.max_active == config.AI_CALLS_IN_PARALLEL == 5


def report(database, run, result) -> list[tuple]:
    rows = database.conn.execute(
        "SELECT section, sentence_id, stance, citations_json, check_results_json, removed"
        " FROM claims WHERE report_id = ? ORDER BY rowid",
        (result.report_id,),
    ).fetchall()
    return [tuple(r) for r in rows] + [tuple(run.dropped), tuple(run.notes)]


def test_parallel_reports_match_sequential_ones(database, tmp_path, monkeypatch):
    monkeypatch.setattr(config, "AI_CALLS_IN_PARALLEL", 1)
    first = make_run(database, tmp_path, Jittery(default=news_ai), name="one")
    one = report(database, first, asyncio.run(first.run("T0")))
    monkeypatch.setattr(config, "AI_CALLS_IN_PARALLEL", 5)
    for seed in (1, 2, 3):
        run = make_run(database, tmp_path, Jittery(default=news_ai, seed=seed), name=f"five{seed}")
        assert report(database, run, asyncio.run(run.run("T0"))) == one


def test_a_usage_limit_mid_batch_stops_once_and_starts_nothing_more(database, tmp_path):
    first_extract = []

    def fake(request):
        if request.task == "extract" and not first_extract:
            first_extract.append(request)
            return AIUsageLimit("You've hit your usage limit.")
        return news_ai(request)

    connector = FakeConnector(default=fake, delay_s=0.01)
    run = make_run(database, tmp_path, connector)
    result = asyncio.run(run.run("T0"))
    assert result.status == "stopped"
    assert sum("The AI steps stopped" in n for n in result.notes) == 1
    tasks = [r.task for r in connector.requests]
    # The link search, then the first 5 reads; the queued reads never started.
    assert tasks.count("extract") == config.AI_CALLS_IN_PARALLEL and "narrate" not in tasks


def test_a_cancel_mid_batch_starts_no_more_calls(database, tmp_path):
    run = None

    def fake(request):
        if request.task == "extract":
            run.cancel()
        return news_ai(request)

    connector = FakeConnector(default=fake, delay_s=0.01)
    run = make_run(database, tmp_path, connector)
    with pytest.raises(RunCancelled):
        asyncio.run(run.run("T0"))
    # The calls already under way are stopped too, so some may not even have been sent.
    assert [r.task for r in connector.requests].count("extract") <= config.AI_CALLS_IN_PARALLEL
    status = database.conn.execute(
        "SELECT status FROM runs WHERE run_id = ?", (run.run_id,)
    ).fetchone()[0]
    assert status == "cancelled"


class SlowPrices(WithNews):
    """Prices that take a while, recording whether the link search was asked first."""

    def __init__(self, connector):
        super().__init__()
        self.connector = connector
        self.asked_before_prices_done: bool | None = None

    async def fill_prices(self, store, members, *, end):
        await asyncio.sleep(0.05)
        self.asked_before_prices_done = any(
            r.task == "link_search" for r in self.connector.requests
        )
        await super().fill_prices(store, members, end=end)


def test_the_link_search_starts_while_prices_download(database, tmp_path):
    connector = FakeConnector(default=news_ai)
    data = SlowPrices(connector)
    result = asyncio.run(make_run(database, tmp_path, connector, data=data).run("T0"))
    assert data.asked_before_prices_done is True
    assert [r.task for r in connector.requests].count("link_search") == 1
    assert "https://www.reuters.com/one" in result.html_path.read_text()


class NoFacts(WithNews):
    async def company_facts(self, cik):
        await asyncio.sleep(0.02)
        raise LookupError("no facts")


def test_a_failed_run_stops_its_early_link_search(database, tmp_path):
    connector = FakeConnector(default=news_ai, delay_s=5)  # a link search still going

    async def go():
        run = make_run(database, tmp_path, connector, data=NoFacts())
        with pytest.raises(RunFailed):
            await asyncio.wait_for(run.run("T0"), 2)  # it doesn't wait 5 s for the search
        await asyncio.sleep(0)  # let the cancelled search unwind
        return run

    run = asyncio.run(go())
    assert run._link_search is None
    assert connector.active == 0


def test_the_thin_slice_and_no_ai_runs_start_no_link_search(database, tmp_path):
    connector = FakeConnector(default=clean_ai)
    state = ToolState(database.conn, "claude")
    state.record_check(version="1.0", model_ids=["fake-small"], form="full", passed=True)
    run = Run(
        database.conn,
        WithNews(),
        AIClient(connector, state, retry_wait_s=0),
        load(),
        now=NOW,
        out_dir=tmp_path / "s",
    )
    asyncio.run(run.run("T0"))
    assert "link_search" not in [r.task for r in connector.requests]


def test_a_usage_limit_in_the_early_link_search_is_reported_at_step_9(database, tmp_path):
    def fake(request):
        if request.task == "link_search":
            return AIUsageLimit("You've hit your usage limit.")
        return news_ai(request)

    connector = FakeConnector(default=fake)
    data = SlowPrices(connector)
    run = make_run(database, tmp_path, connector, data=data)
    at_news: list = []

    def progress(step, state):
        if (step, state) == ("news", "started"):
            at_news.append(run.stop_error)

    run.progress = progress
    result = asyncio.run(run.run("T0"))
    assert data.asked_before_prices_done is True  # it still started early
    assert at_news == [None]  # but the stop belongs to step 9, as before
    assert isinstance(run.stop_error, AIUsageLimit) and result.status == "stopped"
    assert sum("The AI steps stopped" in n for n in result.notes) == 1


def test_dropped_sources_keep_the_sources_order(database, tmp_path, monkeypatch):
    from tearsheet.ai.client import AIUnavailable

    def fake(request):
        if request.task == "extract":
            return AIUnavailable("overloaded")  # every source is dropped, after one retry
        return news_ai(request)

    monkeypatch.setattr(config, "AI_CALLS_IN_PARALLEL", 1)
    one = make_run(database, tmp_path, Jittery(default=fake), name="one")
    asyncio.run(one.run("T0"))
    assert len(one.dropped) >= 4
    monkeypatch.setattr(config, "AI_CALLS_IN_PARALLEL", 5)
    for seed in (4, 5):
        run = make_run(database, tmp_path, Jittery(default=fake, seed=seed), name=f"t{seed}")
        asyncio.run(run.run("T0"))
        assert run.dropped == one.dropped and run.notes == one.notes


# --- step 10's reads start while step 2 downloads ----------------------------------------------


class SlowDownloads(NewsAndTrends):
    """Prices and peers' filings that take a while, recording which reads were asked first."""

    def __init__(self, connector):
        super().__init__()
        self.connector = connector
        self.read_before_prices: bool | None = None
        self.read_before_peers: bool | None = None

    def _reads(self) -> list:
        return [r for r in self.connector.requests if r.task == "extract"]

    async def fill_prices(self, store, members, *, end):
        await asyncio.sleep(0.05)
        self.read_before_prices = bool(self._reads())
        await super().fill_prices(store, members, end=end)

    async def peer_documents(self, ciks, *, today):
        await asyncio.sleep(0.05)
        self.read_before_peers = bool(self._reads())
        return await super().peer_documents(ciks, today=today)


def test_filing_reads_start_while_prices_and_peers_download(database, tmp_path):
    connector = FakeConnector(default=news_ai)
    data = SlowDownloads(connector)
    result = asyncio.run(make_run(database, tmp_path, connector, data=data).run("T0"))
    assert result.status == "done"
    assert data.read_before_prices is True and data.read_before_peers is True
    # Every source is still read once: the company's, the peers' and the articles.
    reads = [r for r in connector.requests if r.task == "extract"]
    sources = [frozenset(s.id for s in r.sources) for r in reads]
    assert len(sources) == len(set(sources))
    assert any(s.id.startswith("art-") for r in reads for s in r.sources)


def test_early_reads_give_the_same_report_as_reads_in_step_10(database, tmp_path, monkeypatch):
    """The answers are taken in the sources' order in step 10, so starting the reads early
    changes nothing in the report: the same claims, dropped sources and notes."""
    first = make_run(database, tmp_path, Jittery(default=news_ai), name="late")
    monkeypatch.setattr(Run, "_read_early", lambda self, docs: None)  # every read in step 10
    late = report(database, first, asyncio.run(first.run("T0")))
    monkeypatch.undo()
    for seed in (7, 8):
        run = make_run(
            database, tmp_path, Jittery(default=news_ai, seed=seed), data=None, name=f"e{seed}"
        )
        assert report(database, run, asyncio.run(run.run("T0"))) == late


def test_a_usage_limit_in_an_early_read_is_reported_at_step_10(database, tmp_path):
    def fake(request):
        if request.task == "extract":
            return AIUsageLimit("You've hit your usage limit.")
        return news_ai(request)

    connector = FakeConnector(default=fake)
    data = SlowDownloads(connector)
    run = make_run(database, tmp_path, connector, data=data)
    at_extract: list = []

    def progress(step, state):
        if (step, state) == ("extract", "started"):
            at_extract.append(run.stop_error)

    run.progress = progress
    result = asyncio.run(run.run("T0"))
    assert data.read_before_prices is True  # the read was early
    assert at_extract == [None]  # but the stop belongs to step 10, as before
    assert isinstance(run.stop_error, AIUsageLimit) and result.status == "stopped"
    assert sum("The AI steps stopped" in n for n in result.notes) == 1
    tasks = [r.task for r in connector.requests]
    # The first slots' reads met the limit; nothing queued behind them was sent.
    assert tasks.count("extract") <= config.AI_CALLS_IN_PARALLEL and "narrate" not in tasks


def test_a_failed_run_stops_its_early_reads(database, tmp_path):
    connector = FakeConnector(default=news_ai, delay_s=5)  # reads still going

    async def go():
        run = make_run(database, tmp_path, connector, data=NoFacts())
        with pytest.raises(RunFailed):
            await asyncio.wait_for(run.run("T0"), 2)  # it doesn't wait 5 s for the reads
        await asyncio.sleep(0)  # let the cancelled reads unwind
        return run

    run = asyncio.run(go())
    assert run._reads == {}
    assert connector.active == 0


def test_cancel_stops_the_ai_calls_under_way(database, tmp_path):
    # A cancel used to wait for the calls already sent (up to 5 minutes each).
    import time

    run = None
    started = []

    def fake(request):
        if request.task == "extract" and not started:
            started.append(time.monotonic())
            asyncio.get_running_loop().call_later(0.05, run.cancel)
        return news_ai(request)

    connector = FakeConnector(default=fake, delay_s=5.0)
    run = make_run(database, tmp_path, connector)
    with pytest.raises(RunCancelled):
        asyncio.run(run.run("T0"))
    assert time.monotonic() - started[0] < 2.0
    status = database.conn.execute(
        "SELECT status FROM runs WHERE run_id = ?", (run.run_id,)
    ).fetchone()[0]
    assert status == "cancelled"


def test_a_run_stopped_by_quitting_is_interrupted_so_it_can_be_resumed(database, tmp_path):
    run = None

    def fake(request):
        if request.task == "extract":
            run.cancel(interrupted=True)
        return news_ai(request)

    connector = FakeConnector(default=fake, delay_s=0.01)
    run = make_run(database, tmp_path, connector)
    with pytest.raises(RunCancelled):
        asyncio.run(run.run("T0"))
    status = database.conn.execute(
        "SELECT status FROM runs WHERE run_id = ?", (run.run_id,)
    ).fetchone()[0]
    assert status == "interrupted"
