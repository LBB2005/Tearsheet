"""The call budget's cuts (Technical Plan §3): before the articles are read, the run projects
its calls (every filing read still to make, the articles, and for every section its draft,
its check and room for one rewrite with its re-check). Over the budget it reads fewer
articles, down to 5; still over, it allows no rewrites."""

from __future__ import annotations

import asyncio
import json

from tearsheet import config, pipeline
from tearsheet.ai.client import AIClient, ToolState
from tearsheet.ai.schemas import SkepticFinding
from tearsheet.db import open_database
from tearsheet.methodology import load
from tearsheet.pipeline import Run
from tests.fakes.ai import FakeConnector
from tests.test_pipeline import NOW, NewsAndTrends, news_ai, skeptic_script

SECTIONS = 6  # the full method's sections 4-8 and What to watch


def full_run(conn, tmp_path, fake, name="r"):
    state = ToolState(conn, "claude")
    state.record_check(version="1.0", model_ids=["fake-small"], form="full", passed=True)
    connector = FakeConnector(default=fake)
    run = Run(
        conn,
        NewsAndTrends(),
        AIClient(connector, state, retry_wait_s=0),
        load(),
        mode="full",
        now=NOW,
        out_dir=tmp_path / name,
    )
    return run, asyncio.run(run.run("T0")), connector


def reads(connector) -> tuple[int, int]:
    """(filing reads, article reads) the run sent."""
    extracts = [r for r in connector.requests if r.task == "extract"]
    articles = sum(any(s.id.startswith("art-") for s in r.sources) for r in extracts)
    return len(extracts) - articles, articles


def filing_reads(tmp_path) -> int:
    """How many filing reads this fake run makes, from a run on a data folder of its own."""
    other = open_database(tmp_path / "other" / "tearsheet.sqlite")
    try:
        _, _, connector = full_run(other.conn, tmp_path, news_ai, name="count")
    finally:
        other.close()
    return reads(connector)[0]


def test_the_default_budget_is_60():
    assert config.CALL_BUDGET == 60


def test_the_projection_counts_peer_and_press_reads_and_cuts_articles(
    database, tmp_path, monkeypatch
):
    filings = filing_reads(tmp_path)
    assert filings > len(pipeline.FULL_SOURCES)  # the peers' filings are read too
    monkeypatch.setattr(pipeline, "ARTICLE_FLOOR", 1)
    # Room for exactly one article: link search + filing reads + 4 per section + 1.
    monkeypatch.setattr(config, "CALL_BUDGET", 1 + filings + 4 * SECTIONS + 1)
    run, result, connector = full_run(database.conn, tmp_path, news_ai)
    assert reads(connector) == (filings, 1)
    assert run.cuts == ["read 1 of 3 articles to stay within the call budget"]
    assert "Call budget: read 1 of 3 articles" in result.html_path.read_text()
    stored = database.conn.execute(
        "SELECT cuts_json FROM runs WHERE run_id = ?", (run.run_id,)
    ).fetchone()[0]
    assert json.loads(stored) == run.cuts
    assert result.status == "done"


def test_saved_reads_are_not_counted(database, tmp_path, monkeypatch):
    full_run(database.conn, tmp_path, news_ai, name="first")  # reads and saves every source
    monkeypatch.setattr(pipeline, "ARTICLE_FLOOR", 1)
    monkeypatch.setattr(config, "CALL_BUDGET", 1 + 4 * SECTIONS + 2)
    run, _, _ = full_run(database.conn, tmp_path, news_ai, name="second")
    assert run.cuts == ["read 2 of 3 articles to stay within the call budget"]


def test_still_over_at_the_floor_means_no_rewrites(database, tmp_path, monkeypatch):
    filings = filing_reads(tmp_path)

    def marks(section, ids):
        # Every first draft of risks is unsupported, which asks for a rewrite.
        if section == "risks" and ids and not ids[0].startswith("risks.r"):
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

    def fake(request):
        return news_ai(request) if request.task == "link_search" else skeptic_script(marks)(request)

    # The floor's articles fit, but not with room for rewrites.
    monkeypatch.setattr(pipeline, "ARTICLE_FLOOR", 2)
    monkeypatch.setattr(config, "CALL_BUDGET", 1 + filings + 2 * SECTIONS + 2 + 3)
    run, result, connector = full_run(database.conn, tmp_path, fake)
    assert run.cuts == [
        "read 2 of 3 articles to stay within the call budget",
        "no section rewrites, to stay within the call budget",
    ]
    tasks = [r.task for r in connector.requests]
    assert tasks.count("narrate") == SECTIONS  # no rewrite of risks
    assert result.status == "done"  # the budget was never run out


def test_within_the_budget_nothing_is_cut(database, tmp_path):
    run, result, connector = full_run(database.conn, tmp_path, news_ai)
    assert run.cuts == [] and result.status == "done"
    assert (
        database.conn.execute(
            "SELECT cuts_json FROM runs WHERE run_id = ?", (run.run_id,)
        ).fetchone()[0]
        is None
    )
