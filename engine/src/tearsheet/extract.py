"""Evidence extraction (design item 29, Technical Plan §3 step 10).

One no-tools AI call per filing section, peer trends section or article, on the smaller
model. Every cited paragraph ID must exist in that source, and each quoted value goes through
the quote check; items that fail are dropped and counted. Answers are saved under
`accession + section + parser version + prompt version + extraction model`, so each filing is
read once; `reread_filing` deletes a filing's saved answers.

An answer in which most citations name paragraphs that aren't in the source is asked for once
more (`mostly_unknown`). The AI sometimes miscopies the long paragraph IDs all through one
answer: on 7 Nov 2026, Meta's 10-K Item 7 kept 0 of 21 items that way, and one part of
Robinhood's Item 1A lost its items too, while the same read asked again came back clean. The
check itself is unchanged: an item still needs every cited paragraph to exist. An answer
that is still mostly unknown is not saved, and a saved one is not reused, so the next run reads
the section again. The two usual miscopies (the `@1` at the end left off, or everything
before the paragraph number) are matched back to the real paragraph first (`_repaired`).
"""

from __future__ import annotations

import json
import logging
import re
import sqlite3
from collections import Counter
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime

from tearsheet.ai.client import AIClient, Source
from tearsheet.ai.schemas import EvidenceItem, EvidenceList, QuotedValue
from tearsheet.prompts import load_prompt
from tearsheet.text.parse import PARSER_VERSION, Paragraph
from tearsheet.verify.quotes import check_quote

log = logging.getLogger(__name__)

CHARS_PER_TOKEN = 4
MAX_SECTION_TOKENS = 60_000
MAX_SECTION_CHARS = MAX_SECTION_TOKENS * CHARS_PER_TOKEN
UNKNOWN = "unknown paragraph"


def mostly_unknown(kept: int, dropped: Mapping[str, int]) -> bool:
    """Whether more than half of an answer's items and quotes cited a paragraph that isn't in
    the source. `kept` counts the items and quotes that passed."""
    return dropped.get(UNKNOWN, 0) * 2 > kept + sum(dropped.values())


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


_CITED = re.compile(r"^(?:(?P<prefix>.*)#)?p(?P<ordinal>\d+)(?:@(?P<version>\d+))?$")


def _repaired(cited: str, by_id: dict[str, Paragraph]) -> str:
    """The real paragraph ID a cited one names. The AI often drops the `@1` parser version at
    the end ("…#Item_7#p24") or everything before the paragraph number ("p24@1"); 33 answers
    in Liam's log from 9-10 Nov 2026 lost every citation that way and were asked for again.
    Such an ID is matched to this section's paragraph with that number, only when what is
    left of it agrees with the real ID; anything else is returned as it was (and dropped)."""
    if cited in by_id:
        return cited
    found = _CITED.match(cited.strip())
    if not found:
        return cited
    prefix, version = found["prefix"], found["version"]
    if version is not None and int(version) != PARSER_VERSION:
        return cited
    for p in by_id.values():
        if p.ordinal != int(found["ordinal"]):
            continue
        real_prefix = p.id.rsplit("#", 1)[0]
        if prefix is None or prefix == real_prefix:
            return p.id
    return cited


def _with_real_ids(answer: EvidenceList, by_id: dict[str, Paragraph]) -> EvidenceList:
    return answer.model_copy(
        update={
            "items": [
                i.model_copy(
                    update={"paragraph_ids": [_repaired(pid, by_id) for pid in i.paragraph_ids]}
                )
                for i in answer.items
            ],
            "quotes": [
                q.model_copy(update={"paragraph_id": _repaired(q.paragraph_id, by_id)})
                for q in answer.quotes
            ],
        }
    )


def _check(
    answer: EvidenceList, by_id: dict[str, Paragraph]
) -> tuple[list[EvidenceItem], list[QuotedValue], Counter]:
    answer = _with_real_ids(answer, by_id)
    dropped: Counter = Counter()
    items = []
    for item in answer.items:
        if all(pid in by_id for pid in item.paragraph_ids):
            items.append(item)
        else:
            dropped[UNKNOWN] += 1
    quotes = []
    for q in answer.quotes:
        if q.paragraph_id not in by_id:
            dropped[UNKNOWN] += 1
        elif check_quote(q.quote, q.value_text, by_id[q.paragraph_id].text).status != "verified":
            dropped["quote not verified"] += 1
        else:
            quotes.append(q)
    return items, quotes, dropped


def _usable(saved: dict | None) -> dict | None:
    """A saved answer, unless most of its citations didn't exist (it is read again)."""
    if saved is None:
        return None
    kept = len(saved["items"]) + len(saved["quotes"])
    return None if mostly_unknown(kept, saved.get("dropped", {})) else saved


def planned_calls(
    ai: AIClient,
    conn: sqlite3.Connection,
    *,
    source_id: str,
    section: str,
    paragraphs: list[Paragraph],
) -> int:
    """The calls `extract_section` will make for this source, for the call budget's
    projection: none when a usable answer is saved, else one per part. A miscopied answer
    asked for again isn't counted; the budget's room covers it, as it covers retries."""
    prompt = load_prompt("extract")
    key = cache_key(source_id, section, PARSER_VERSION, prompt.version, ai.model_for("extract"))
    if _usable(_load(conn, key)) is not None:
        return 0
    return len(chunk_paragraphs(paragraphs, MAX_SECTION_CHARS))


def _unknown_ids(answer: EvidenceList, by_id: dict[str, Paragraph]) -> list[str]:
    """The cited IDs that aren't in the source, in the answer's order, each once."""
    cited = [p for item in answer.items for p in item.paragraph_ids]
    cited += [q.paragraph_id for q in answer.quotes]
    return list(dict.fromkeys(p for p in cited if _repaired(p, by_id) not in by_id))


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
    saved = _usable(_load(conn, key))
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
    keep = True
    for part in chunk_paragraphs(paragraphs, MAX_SECTION_CHARS):
        tries: list[tuple[list[EvidenceItem], list[QuotedValue], Counter]] = []
        for _ in range(2):
            answer = await ai.structured(
                task="extract",
                instructions=f"{prompt.text}\n\nThe source is: {label}.",
                sources=[Source(p.id, p.text) for p in part],
                schema=EvidenceList,
                prompt_version=prompt.version,
            )
            calls += 1
            tries.append(_check(answer, by_id))
            got, got_quotes, lost = tries[-1]
            if not mostly_unknown(len(got) + len(got_quotes), lost):
                break
            log.warning(
                "extract %s %s: %d of %d citations name paragraphs that aren't in the source "
                "(for example %s)%s",
                source_id,
                section,
                lost[UNKNOWN],
                len(answer.items) + len(answer.quotes),
                ", ".join(_unknown_ids(answer, by_id)[:3]),
                "; asking again" if len(tries) == 1 else "; kept what passed, not saved",
            )
        else:
            # Both answers were mostly unknown: keep the one that kept more, and don't save it,
            # so the next run reads this section again.
            got, got_quotes, lost = max(reversed(tries), key=lambda t: len(t[0]) + len(t[1]))
            keep = False
        items += got
        quotes += got_quotes
        dropped.update(lost)
    result = Extracted(source_id, section, items, quotes, dict(dropped), calls=calls)
    if not keep:
        return result
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
