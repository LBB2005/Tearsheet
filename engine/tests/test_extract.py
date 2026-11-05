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
