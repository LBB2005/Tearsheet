"""The live tally a run sends the app while a report is written (protocol Tally): what it has
downloaded, the AI calls done and under way, the evidence and claims, the usual step times
the app paces its progress by, and the note that the checks have started."""

from __future__ import annotations

import asyncio
import json

from tearsheet.methodology import load
from tearsheet.pipeline import STEPS, Run, typical_seconds
from tearsheet.protocol import RunTally, Tally
from tests.fakes.ai import FakeConnector
from tests.test_parallel import make_run
from tests.test_pipeline import NOW, FakeData, NewsAndTrends, WithInsiders, news_ai
from tests.test_protocol import Harness, run


class Everything(NewsAndTrends, WithInsiders):
    """News, peers' filings, Treasury rates and insider trades."""


def tallied_run(database, tmp_path, *, name="r"):
    connector = FakeConnector(default=news_ai, delay_s=0.005)
    notes: list[dict] = []
    events: list[tuple[str, str]] = []
    r = make_run(database, tmp_path, connector, data=Everything(), name=name)
    r.on_tally = notes.append
    r.progress = lambda step, state: events.append((step, state))
    result = asyncio.run(r.run("T0"))
    return r, result, notes, events


def test_a_full_run_tallies_its_downloads_ai_calls_evidence_and_claims(database, tmp_path):
    r, result, notes, _ = tallied_run(database, tmp_path)
    assert result.status == "done"
    for note in notes:
        Tally(**note)  # every note is a valid protocol message
    last = notes[-1]
    assert last["writer"] == "Fake tool" and last["checker"] is None
    assert last["typical"] is None  # no finished run yet
    assert last["companies"] == last["facts"] >= 2
    assert last["prices"] is True and last["fetching"] is None
    assert last["filings"] >= 2 and last["rates"] is True and last["insider"] == 2
    assert last["articles"] >= 1
    assert last["reads_done"] == last["reads_total"] >= 4
    assert last["evidence"] > 0
    assert last["sections_done"] == last["sections_total"] >= 4
    assert last["checks_done"] == last["checks_total"] == last["sections_total"]
    claims = database.conn.execute(
        "SELECT SUM(removed = 0), SUM(removed = 1) FROM claims WHERE report_id = ?",
        (result.report_id,),
    ).fetchone()
    assert (last["claims_kept"], last["claims_removed"]) == (claims[0], claims[1] or 0)
    assert last["rating"] == result.rating
    assert isinstance(last["score"], float)
    assert last["now"] == []


def test_the_downloads_are_tallied_in_order(database, tmp_path):
    _, _, notes, _ = tallied_run(database, tmp_path)
    phases = []
    for note in notes:
        if note.get("fetching") and (not phases or phases[-1] != note["fetching"]):
            phases.append(note["fetching"])
    assert phases == ["prices", "facts", "filings", "peer filings", "rates", "insider trades"]
    facts = [n["facts"] for n in notes if "facts" in n]
    assert facts == sorted(facts) and facts[0] == 0
    articles = [n["articles"] for n in notes if "articles" in n]
    assert articles == sorted(articles) and articles[0] == 0


def test_the_calls_under_way_are_named_three_at_a_time(database, tmp_path):
    _, _, notes, _ = tallied_run(database, tmp_path)
    busiest = max(len(n.get("now") or []) for n in notes)
    assert busiest == 3
    reading = [n["now"] for n in notes if n.get("reads_total") and n.get("now")]
    assert any(name.startswith("10-K Item 1A") for now in reading for name in now)
    writing = {name for n in notes if n.get("sections_total") for name in n.get("now") or []}
    assert "Risks" in writing and "What to watch" in writing
    # Done counts only go up, and never past the total.
    for key in ("reads", "sections", "checks"):
        done = [n[f"{key}_done"] for n in notes if f"{key}_done" in n]
        assert done == sorted(done)
        assert done[-1] == notes[-1][f"{key}_total"]


def test_the_checks_say_they_have_started(database, tmp_path):
    _, _, _, events = tallied_run(database, tmp_path)
    assert (
        events.index(("render", "started"))
        < events.index(("verify", "started"))
        < events.index(("verify", "done"))
        < events.index(("save", "started"))
    )


def test_usual_step_times_come_from_recent_finished_full_runs(database, tmp_path):
    assert typical_seconds(database.conn) is None
    tallied_run(database, tmp_path, name="one")
    usual = typical_seconds(database.conn)
    assert usual is not None and set(usual) <= set(STEPS) and "extract" in usual
    # The next run starts with them.
    _, _, notes, _ = tallied_run(database, tmp_path, name="two")
    assert notes[0]["typical"] == usual


def test_usual_step_times_are_medians_and_skip_unfinished_or_slice_runs(database):
    def add(run_id, mode, status, started, steps):
        with database.conn:
            database.conn.execute(
                "INSERT INTO runs (run_id, mode, started_at, status, engine_version, method_code_version, methodology_hash, reference_version)"
                " VALUES (?, ?, ?, ?, 'x', 1, 'h', 'v')",
                (run_id, mode, started, status),
            )
            database.conn.execute(
                "INSERT INTO step_outputs (run_id, step, json) VALUES (?, 'timings', ?)",
                (run_id, json.dumps({"total_s": 1, "steps": steps})),
            )

    add("a", "full", "done", "2026-11-01T10:00:00", {"fetch": 90.0, "extract": 100.0})
    add("b", "full", "done", "2026-11-02T10:00:00", {"fetch": 100.0, "extract": 140.0, "x": 5})
    add("c", "full", "done", "2026-11-03T10:00:00", {"fetch": 300.0, "extract": 120.0})
    add("d", "full", "stopped", "2026-11-04T10:00:00", {"fetch": 999.0})
    add("e", "slice", "done", "2026-11-05T10:00:00", {"fetch": 999.0})
    assert typical_seconds(database.conn) == {"fetch": 100.0, "extract": 120.0}
    # Only the newest runs count.
    assert typical_seconds(database.conn, runs=1) == {"fetch": 300.0, "extract": 120.0}
    with database.conn:
        database.conn.execute("UPDATE step_outputs SET json = 'not json' WHERE run_id = 'c'")
    assert typical_seconds(database.conn) == {"fetch": 95.0, "extract": 120.0}


def test_a_run_without_ai_tallies_its_downloads_only(database):
    notes: list[dict] = []
    r = Run(database.conn, FakeData(), None, load(), now=NOW, out_dir=None, tally=notes.append)
    asyncio.run(r.run("T0"))
    last = notes[-1]
    assert last["writer"] is None and last["companies"] >= 2
    assert "reads_total" not in last and "sections_total" not in last


def test_the_server_sends_the_tally_for_its_run(tmp_path):
    h = Harness(tmp_path, ai_default=news_ai)

    async def go():
        await h.server.start()
        started = await h.call("run_report", {"query": "T0"})
        await h.finish()
        return started

    started = run(go())
    notes = h.notes("run_tally")
    assert notes and all(n["run_id"] == started["result"]["run_id"] for n in notes)
    for n in notes:
        RunTally(**n)
    assert notes[-1]["tally"]["checks_done"] == notes[-1]["tally"]["checks_total"]
    h.server.close()
