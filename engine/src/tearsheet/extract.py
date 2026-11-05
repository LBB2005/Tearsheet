"""Evidence extraction (design item 29, Technical Plan §3 step 10).

One no-tools AI call per filing section, peer trends section or article, on the smaller
model. Every cited paragraph ID must exist in that source, and each quoted value goes through
the quote check; items that fail are dropped and counted. Answers are saved under
`accession + section + parser version + prompt version + extraction model`, so each filing is
read once; `reread_filing` deletes a filing's saved answers.
"""

from __future__ import annotations

import json
import sqlite3
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime

from tearsheet.ai.client import AIClient, Source
from tearsheet.ai.schemas import EvidenceItem, EvidenceList, QuotedValue
from tearsheet.prompts import load_prompt
from tearsheet.text.parse import PARSER_VERSION, Paragraph
from tearsheet.verify.quotes import check_quote

CHARS_PER_TOKEN = 4
MAX_SECTION_TOKENS = 60_000
MAX_SECTION_CHARS = MAX_SECTION_TOKENS * CHARS_PER_TOKEN


@dataclass
class Extracted:
    source_id: str
    section: str
    items: list[EvidenceItem]
    quotes: list[QuotedValue]
    dropped: dict[str, int] = field(default_factory=dict)
    cached: bool = False
    calls: int = 0
    failed: str | None = None


def cache_key(
    source_id: str, section: str, parser_version: int, prompt_version: str, model: str | None
) -> str:
    return f"{source_id}|{section}|parser-{parser_version}|{prompt_version}|{model or 'default'}"


def chunk_paragraphs(paragraphs: list[Paragraph], max_chars: int) -> list[list[Paragraph]]:
    """Split a long section into parts under `max_chars`, with one paragraph of overlap."""
    if sum(len(p.text) for p in paragraphs) <= max_chars:
        return [paragraphs]
    chunks, current, size = [], [], 0
    for p in paragraphs:
        if current and size + len(p.text) > max_chars:
            chunks.append(current)
            current, size = [current[-1]], len(current[-1].text)
        current.append(p)
        size += len(p.text)
    if current and (not chunks or current != [chunks[-1][-1]]):
        chunks.append(current)
    return chunks


def _load(conn: sqlite3.Connection, key: str) -> dict | None:
    row = conn.execute(
        "SELECT items_json FROM evidence_cache WHERE cache_key = ?", (key,)
    ).fetchone()
    return json.loads(row[0]) if row else None


def _save(conn: sqlite3.Connection, key: str, data: dict) -> None:
    with conn:
        conn.execute(
            "INSERT OR REPLACE INTO evidence_cache (cache_key, items_json, created_at) VALUES (?, ?, ?)",
            (key, json.dumps(data), datetime.now(UTC).isoformat()),
        )


def reread_filing(conn: sqlite3.Connection, accession: str) -> int:
    with conn:
        return conn.execute(
            "DELETE FROM evidence_cache WHERE cache_key LIKE ?", (f"{accession}|%",)
        ).rowcount


def _check(
    answer: EvidenceList, by_id: dict[str, Paragraph]
) -> tuple[list[EvidenceItem], list[QuotedValue], Counter]:
    dropped: Counter = Counter()
    items = []
    for item in answer.items:
        if all(pid in by_id for pid in item.paragraph_ids):
            items.append(item)
        else:
            dropped["unknown paragraph"] += 1
    quotes = []
    for q in answer.quotes:
        if q.paragraph_id not in by_id:
            dropped["unknown paragraph"] += 1
        elif check_quote(q.quote, q.value_text, by_id[q.paragraph_id].text).status != "verified":
            dropped["quote not verified"] += 1
        else:
            quotes.append(q)
    return items, quotes, dropped


async def extract_section(
    ai: AIClient,
    conn: sqlite3.Connection,
    *,
    source_id: str,
    section: str,
    paragraphs: list[Paragraph],
    label: str,
) -> Extracted:
    prompt = load_prompt("extract")
    key = cache_key(source_id, section, PARSER_VERSION, prompt.version, ai.model_for("extract"))
    saved = _load(conn, key)
    if saved is not None:
        return Extracted(
            source_id,
            section,
            [EvidenceItem(**i) for i in saved["items"]],
            [QuotedValue(**q) for q in saved["quotes"]],
            saved.get("dropped", {}),
            cached=True,
        )
    by_id = {p.id: p for p in paragraphs}
    items: list[EvidenceItem] = []
    quotes: list[QuotedValue] = []
    dropped: Counter = Counter()
    calls = 0
    for part in chunk_paragraphs(paragraphs, MAX_SECTION_CHARS):
        answer = await ai.structured(
            task="extract",
            instructions=f"{prompt.text}\n\nThe source is: {label}.",
            sources=[Source(p.id, p.text) for p in part],
            schema=EvidenceList,
            prompt_version=prompt.version,
        )
        calls += 1
        got, got_quotes, lost = _check(answer, by_id)
        items += got
        quotes += got_quotes
        dropped.update(lost)
    result = Extracted(source_id, section, items, quotes, dict(dropped), calls=calls)
    _save(
        conn,
        key,
        {
            "items": [i.model_dump(mode="json") for i in items],
            "quotes": [q.model_dump(mode="json") for q in quotes],
            "dropped": dict(dropped),
        },
    )
    return result
