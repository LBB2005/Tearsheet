"""Evidence extraction (design item 29)."""

from __future__ import annotations

import asyncio

from tearsheet.ai.client import AIClient, ToolState
from tearsheet.ai.schemas import EvidenceItem, EvidenceList, QuotedValue
from tearsheet.extract import (
    MAX_SECTION_CHARS,
    cache_key,
    chunk_paragraphs,
    extract_section,
    reread_filing,
)
from tearsheet.prompts import load_prompt
from tearsheet.text.parse import Paragraph, paragraph_id
from tests.fakes.ai import FakeConnector, answer


def paragraphs(
    n: int, size: int = 100, source: str = "acc-1", section: str = "Item 1"
) -> list[Paragraph]:
    return [
        Paragraph(
            paragraph_id(source, section, i),
            source,
            section,
            i,
            f"Paragraph {i}. " + "x" * size,
            False,
        )
        for i in range(1, n + 1)
    ]


def client(database, connector):
    state = ToolState(database.conn, connector.tool)
    state.record_check(version="1.0", model_ids=["fake-small"], form="full", passed=True)
    return AIClient(connector, state, retry_wait_s=0)


def test_prompts_have_a_version_line():
    for name in ("extract", "narrate", "skeptic"):
        prompt = load_prompt(name)
        assert prompt.version.startswith(name + "-")
        assert "never" in prompt.text.lower()


def test_large_sections_are_split_with_one_paragraph_of_overlap():
    paras = paragraphs(10, size=MAX_SECTION_CHARS // 4)
    chunks = chunk_paragraphs(paras, MAX_SECTION_CHARS)
    assert len(chunks) > 1
    for before, after in zip(chunks, chunks[1:], strict=False):
        assert before[-1].id == after[0].id  # one paragraph of overlap
    assert {p.id for c in chunks for p in c} == {p.id for p in paras}
    assert chunk_paragraphs(paragraphs(3), MAX_SECTION_CHARS) == [paragraphs(3)]


def test_the_cache_key():
    assert (
        cache_key("acc-1", "Item 1A", 1, "extract-1", "haiku")
        == "acc-1|Item 1A|parser-1|extract-1|haiku"
    )


def test_items_citing_unknown_paragraphs_and_unverified_quotes_are_dropped(database):
    paras = paragraphs(3)
    good = EvidenceItem(statement="Sales grew.", type="driver", paragraph_ids=[paras[0].id])
    bad = EvidenceItem(statement="Made up.", type="risk", paragraph_ids=["acc-1#Item_1#p99@1"])
    quote = QuotedValue(kind="date", paragraph_id=paras[1].id, quote="Paragraph 2.", value_text="2")
    fake_quote = QuotedValue(
        kind="date", paragraph_id=paras[1].id, quote="on 3 Oct 2026", value_text="3 Oct 2026"
    )
    connector = FakeConnector(
        default=answer(EvidenceList(items=[good, bad], quotes=[quote, fake_quote]))
    )
    result = asyncio.run(
        extract_section(
            client(database, connector),
            database.conn,
            source_id="acc-1",
            section="Item 1",
            paragraphs=paras,
            label="10-K Item 1",
        )
    )
    assert [i.statement for i in result.items] == ["Sales grew."]
    assert result.dropped == {"unknown paragraph": 1, "quote not verified": 1}
    assert len(result.quotes) == 1
    sent = connector.requests[0]
    assert {s.id for s in sent.sources} == {p.id for p in paras}


def test_saved_evidence_is_reused_and_reread_deletes_it(database):
    paras = paragraphs(2)
    item = EvidenceItem(statement="Sales grew.", type="driver", paragraph_ids=[paras[0].id])
    connector = FakeConnector(default=answer(EvidenceList(items=[item])))
    ai = client(database, connector)
    first = asyncio.run(
        extract_section(
            ai, database.conn, source_id="acc-1", section="Item 1", paragraphs=paras, label="x"
        )
    )
    second = asyncio.run(
        extract_section(
            ai, database.conn, source_id="acc-1", section="Item 1", paragraphs=paras, label="x"
        )
    )
    assert not first.cached and second.cached and len(connector.requests) == 1
    assert second.items == first.items
    assert reread_filing(database.conn, "acc-1") == 1
    asyncio.run(
        extract_section(
            ai, database.conn, source_id="acc-1", section="Item 1", paragraphs=paras, label="x"
        )
    )
    assert len(connector.requests) == 2


# --- an answer whose citations mostly don't exist (seen live on 7 Nov 2026) -----------------


def _miscopied(paras: list[Paragraph], n: int = 3) -> EvidenceList:
    """An answer that cites real paragraphs under miscopied IDs, as one live read did for
    every item: Meta's 10-K Item 7 kept 0 of 21."""
    return EvidenceList(
        items=[
            EvidenceItem(statement=f"Point {i}.", type="driver", paragraph_ids=[p.id + "x"])
            for i, p in enumerate(paras[:n], start=1)
        ]
    )


def _good(paras: list[Paragraph]) -> EvidenceList:
    return EvidenceList(
        items=[EvidenceItem(statement="Sales grew.", type="driver", paragraph_ids=[paras[0].id])]
    )


def _read(database, ai, paras):
    return asyncio.run(
        extract_section(
            ai, database.conn, source_id="acc-1", section="Item 1", paragraphs=paras, label="x"
        )
    )


def test_an_answer_citing_mostly_unknown_paragraphs_is_asked_for_again(database):
    paras = paragraphs(3)
    connector = FakeConnector([answer(_miscopied(paras)), answer(_good(paras))])
    result = _read(database, client(database, connector), paras)
    assert len(connector.requests) == 2 and result.calls == 2
    assert [i.statement for i in result.items] == ["Sales grew."]
    assert result.dropped == {}  # the miscopied answer was set aside, not counted
    # The good answer was saved, so the next read reuses it.
    assert _read(database, client(database, connector), paras).cached


def test_a_second_bad_answer_keeps_what_passes_and_is_not_saved(database):
    paras = paragraphs(3)
    half = EvidenceList(
        items=[
            *_good(paras).items,
            *_miscopied(paras, n=2).items,
        ]
    )
    connector = FakeConnector([answer(half), answer(_miscopied(paras))])
    result = _read(database, client(database, connector), paras)
    assert len(connector.requests) == 2
    assert [i.statement for i in result.items] == ["Sales grew."]  # the better of the two
    assert result.dropped == {"unknown paragraph": 2}
    # Not saved, so the next run reads the section again instead of reusing a bad answer.
    connector.script = [answer(_good(paras))]
    again = _read(database, client(database, connector), paras)
    assert not again.cached and len(connector.requests) == 3


def test_one_unknown_citation_among_good_ones_is_not_asked_again(database):
    paras = paragraphs(3)
    answer_ = EvidenceList(
        items=[*_good(paras).items, *_good(paras).items, *_miscopied(paras, n=1).items]
    )
    connector = FakeConnector([answer(answer_)])
    result = _read(database, client(database, connector), paras)
    assert len(connector.requests) == 1
    assert result.dropped == {"unknown paragraph": 1}


def test_a_saved_answer_that_lost_most_of_its_citations_is_read_again(database):
    paras = paragraphs(3)
    prompt = load_prompt("extract")
    key = cache_key("acc-1", "Item 1", 1, prompt.version, "fake-small")
    # What the 7 Nov run saved for Meta's 10-K Item 7: nothing kept, everything dropped.
    with database.conn:
        database.conn.execute(
            "INSERT INTO evidence_cache (cache_key, items_json, created_at) VALUES (?, ?, ?)",
            (key, '{"items": [], "quotes": [], "dropped": {"unknown paragraph": 21}}', "x"),
        )
    connector = FakeConnector([answer(_good(paras))])
    result = _read(database, client(database, connector), paras)
    assert not result.cached and len(connector.requests) == 1
    assert [i.statement for i in result.items] == ["Sales grew."]
