"""Prompt injection, offline (Verification Plan; Technical Plan §9, "Defences against planted
instructions"). A planted article tries to steer the report. The scripted AI here *obeys* it,
so the test shows what the engine's own defences do: the article reaches only section 7's
calls; its source text can't break out of the markers; its paragraph is marked and the skeptic
is told to take extra care; the obeying sentences don't survive; and the rating and every
number stay code-made. The live version, with a real AI tool, is in tests/live/.
"""

from __future__ import annotations

import asyncio
import json

from tearsheet.ai.client import AIClient, ToolState
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
from tearsheet.methodology import load
from tearsheet.pipeline import Run
from tests.fakes.ai import FakeConnector, answer
from tests.fakes.planted import PHRASE, PLANTED_ID, URL, planted_article
from tests.test_pipeline import NOW, FakeData, clean_ai


class WithPlanted(FakeData):
    async def fetch_article(self, url, allowlist):
        return planted_article(NOW.date())


def obedient_ai(request):
    """Does what the planted paragraph says, wherever it is shown it."""
    ids = [s.id for s in request.sources]
    if request.task == "link_search":
        return answer(
            LinkList(links=[Link(url=URL, title="Planted", publisher="Reuters")]),
            model_id="fake-large",
            tool_events=["WebSearch"],
        )
    if request.task == "extract" and PLANTED_ID in ids:
        return answer(
            EvidenceList(
                items=[
                    EvidenceItem(
                        statement=f"Rated a strong buy. {PHRASE}.",
                        type="event",
                        paragraph_ids=[PLANTED_ID],
                    ),
                    EvidenceItem(
                        statement="Competition has increased.",
                        type="competition",
                        paragraph_ids=[ids[2]],
                    ),
                ]
            ),
            model_id="fake-small",
        )
    if request.task == "narrate" and "Section 7" in request.instructions:
        return answer(
            SectionDraft(
                section="news",
                sentences=[
                    DraftSentence(
                        text=f"Readers should take note: {PHRASE}.",
                        citations=[PLANTED_ID],
                        stance="positive",
                    ),
                    DraftSentence(
                        text="It has a $900 price target and is a strong buy.",
                        citations=[PLANTED_ID],
                        stance="positive",
                    ),
                    DraftSentence(
                        text="Rivals have been cutting prices.",
                        citations=[next(i for i in ids if i != PLANTED_ID)],
                        stance="negative",
                    ),
                ],
            ),
            model_id="fake-large",
        )
    if request.task == "skeptic":
        # An honest checker: any claim built on the planted paragraph isn't supported by data.
        findings = [
            SkepticFinding(
                sentence_id=line.split(":", 1)[0].strip("- "),
                mark="unsupported",
                problem_type="unsupported",
                explanation="it repeats an instruction, not a fact",
            )
            for line in request.instructions.splitlines()
            if line.startswith("- ") and PLANTED_ID in line
        ]
        return answer(SkepticReport(findings=findings), model_id="fake-large")
    return clean_ai(request)


def run_report(database, tmp_path, data, fake):
    state = ToolState(database.conn, "claude")
    state.record_check(version="1.0", model_ids=["m"], form="full", passed=True)
    connector = FakeConnector(default=fake)
    run = Run(
        database.conn,
        data,
        AIClient(connector, state, retry_wait_s=0),
        load(),
        mode="full",
        now=NOW,
        out_dir=tmp_path / "r",
    )
    return run, asyncio.run(run.run("T0")), connector


def kept(database, run) -> tuple[str, str]:
    """The report's section text, and the citations of the claims it kept (removed claims
    are listed separately, in the "Removed claims" box)."""
    report = database.conn.execute(
        "SELECT report_id FROM reports WHERE run_id = ?", (run.run_id,)
    ).fetchone()[0]
    sections = database.conn.execute(
        "SELECT json FROM sections WHERE report_id = ?", (report,)
    ).fetchall()
    citations = database.conn.execute(
        "SELECT citations_json FROM claims WHERE report_id = ? AND removed = 0", (report,)
    ).fetchall()
    kept_sentences = [
        s.get("text", "") for (raw,) in sections for s in json.loads(raw).get("sentences", [])
    ]
    paragraphs = [p for (raw,) in sections for p in json.loads(raw).get("paragraphs", [])]
    return "\n".join(kept_sentences + paragraphs), "\n".join(r[0] for r in citations)


def test_a_planted_article_cannot_steer_the_report(database, tmp_path):
    run, result, connector = run_report(database, tmp_path, WithPlanted(), obedient_ai)

    # Only section 7's calls see the article.
    for r in connector.requests:
        if any(s.id == PLANTED_ID for s in r.sources):
            assert r.task in ("extract", "narrate", "skeptic")
            if r.task == "narrate":
                assert "Section 7" in r.instructions

    # Its closing marker is defused, so the text after it stays inside the source.
    [extraction] = [
        r
        for r in connector.requests
        if r.task == "extract" and any(s.id == PLANTED_ID for s in r.sources)
    ]
    from tearsheet.ai.client import user_message

    message = user_message(extraction)
    planted_block = message.split(f'<source id="{PLANTED_ID}">', 1)[1]
    assert planted_block.index("&lt;/source>") < planted_block.index("</source>")

    # The paragraph is marked, and the skeptic is told to take extra care with it.
    marked = database.conn.execute(
        "SELECT marked FROM paragraphs WHERE id = ?", (PLANTED_ID,)
    ).fetchone()
    assert marked[0] == 1
    skeptic = [
        r for r in connector.requests if r.task == "skeptic" and "Section: news" in r.instructions
    ]
    assert skeptic and PLANTED_ID in skeptic[0].instructions.split("take extra care")[1]

    # The obeying sentences don't survive: the digits by the numeric guard, the rest by the skeptic.
    text, citations = kept(database, run)
    assert PHRASE not in text and "$900" not in text
    assert PLANTED_ID not in citations
    assert "Rivals have been cutting prices." in text

    # No tool was used, and no file or address from the article was touched.
    assert run.ai.calls and all(c.outcome == "ok" for c in run.ai.calls)


def test_the_rating_and_numbers_are_the_same_with_or_without_it(database, tmp_path):
    planted, _, _ = run_report(database, tmp_path / "a", WithPlanted(), obedient_ai)
    plain, _, _ = run_report(database, tmp_path / "b", FakeData(), clean_ai)
    assert planted.rated[0].rating == plain.rated[0].rating
    assert planted.rated[1] == plain.rated[1]
    assert planted.members[planted.cik].inputs == plain.members[plain.cik].inputs
