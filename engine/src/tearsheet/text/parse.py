"""Filing sections and paragraphs (design item 23).

Splits 10-K Items 1, 1A, 3, 7, 7A and 9A, the auditor's report, the 10-Q MD&A and Part II
Item 1A, by edgartools route 1 (Phase 0). MD&A "incorporated by reference" falls back to
Exhibit 13. An empty or missing section is recorded as "not available," never skipped.
Paragraph IDs are `accession#item#pN@parser-version`.

Raising PARSER_VERSION also raises METHOD_CODE_VERSION, because the risk-factor red flag
depends on the text layer.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass

from tearsheet.data.sec import auditor_report, decode_filing, split_sections

PARSER_VERSION = 1
TEN_K_SECTIONS = ("Item 1", "Item 1A", "Item 3", "Item 7", "Item 7A", "Item 9A")
TEN_Q_SECTIONS = ("Part I Item 2", "Part II Item 1A")
AUDITOR = "auditor's report"
EXHIBIT_99 = "Exhibit 99.1"
_BY_REFERENCE = re.compile(r"incorporated\s+(herein\s+)?by\s+reference", re.I)
MIN_PARAGRAPH_CHARS = 2


@dataclass(frozen=True)
class Section:
    key: str
    text: str
    source: str = "filing"

    @property
    def available(self) -> bool:
        return bool(self.text.strip())


@dataclass(frozen=True)
class Paragraph:
    id: str
    source_id: str
    section: str
    ordinal: int
    text: str
    marked: bool


def paragraph_id(source_id: str, section: str, ordinal: int) -> str:
    return f"{source_id}#{section.replace(' ', '_')}#p{ordinal}@{PARSER_VERSION}"


def split_paragraphs(
    source_id: str, section: str, text: str, phrases: Iterable[str]
) -> list[Paragraph]:
    """Paragraphs are separated by blank lines (or single lines, when the text has none)."""
    patterns = [re.compile(p, re.I) for p in phrases]
    blocks = (
        re.split(r"\n\s*\n", text.strip()) if "\n\n" in text.strip() else text.strip().split("\n")
    )
    out = []
    for block in blocks:
        cleaned = " ".join(block.split())
        if len(cleaned) < MIN_PARAGRAPH_CHARS:
            continue
        n = len(out) + 1
        out.append(
            Paragraph(
                paragraph_id(source_id, section, n),
                source_id,
                section,
                n,
                cleaned,
                any(p.search(cleaned) for p in patterns),
            )
        )
    return out


def _plain_text(html: bytes) -> str:
    """Body text of a simple HTML document (an exhibit), one paragraph per block."""
    from html.parser import HTMLParser

    class Text(HTMLParser):
        BLOCKS = {"p", "div", "br", "tr", "li", "h1", "h2", "h3", "h4", "table"}

        def __init__(self):
            super().__init__()
            self.parts: list[str] = []
            self.skip = 0

        def handle_starttag(self, tag, attrs):
            if tag in ("script", "style"):
                self.skip += 1
            elif tag in self.BLOCKS:
                self.parts.append("\n\n")

        def handle_endtag(self, tag):
            if tag in ("script", "style") and self.skip:
                self.skip -= 1
            elif tag in self.BLOCKS:
                self.parts.append("\n\n")

        def handle_data(self, data):
            if not self.skip:
                self.parts.append(data)

    parser = Text()
    parser.feed(decode_filing(html))
    text = "".join(parser.parts)
    return "\n\n".join(" ".join(b.split()) for b in re.split(r"\n\s*\n", text) if b.strip())


def filing_sections(
    html: bytes, form: str, *, exhibit_13: bytes | None = None
) -> dict[str, Section]:
    if form.startswith("8-K"):
        return {EXHIBIT_99: Section(EXHIBIT_99, _plain_text(html))}
    split = split_sections(html, "10-K" if form.startswith("10-K") else "10-Q")
    wanted = TEN_K_SECTIONS if form.startswith("10-K") else TEN_Q_SECTIONS
    sections = {key: Section(key, split.get(key, "")) for key in wanted}
    if form.startswith("10-K"):
        sections[AUDITOR] = Section(AUDITOR, auditor_report(split) or "")
        mdna = sections["Item 7"]
        if exhibit_13 is not None and (
            not mdna.available or (len(mdna.text) < 3000 and _BY_REFERENCE.search(mdna.text))
        ):
            sections["Item 7"] = Section("Item 7", _plain_text(exhibit_13), "Exhibit 13")
    return sections


def exhibit_text(html: bytes) -> str:
    return _plain_text(html)
