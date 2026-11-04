"""The article downloader (design item 7, Technical Plan §9).

The engine downloads each suggested page itself through `http.py`, extracts the text with
trafilatura, reads the publication date from the page, and splits the text into paragraphs
with IDs. A page that is refused, paywalled, undated or under 150 words is skipped and
listed as "not read".
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date
from typing import Any
from urllib.parse import urlsplit

import trafilatura
from htmldate import find_date

from tearsheet.http import Fetched, HttpClient, PageRejected

MIN_WORDS = 150

_LD_JSON = re.compile(
    rb"<script[^>]*type\s*=\s*[\"']application/ld\+json[\"'][^>]*>(.*?)</script>",
    re.IGNORECASE | re.DOTALL,
)


@dataclass(frozen=True)
class AllowEntry:
    host: str
    path: str = "/"


class Allowlist:
    """An exact site match. An entry may name one section of a site, such as a bank's
    public research pages ("www.example-bank.com/research"). A bare site also matches its
    "www." form.
    """

    def __init__(self, entries: Iterable[str]):
        self.entries: list[AllowEntry] = []
        for raw in entries:
            text = raw.strip().lower()
            if not text:
                continue
            text = text.removeprefix("https://").removeprefix("http://")
            host, _, path = text.partition("/")
            self.entries.append(AllowEntry(host, "/" + path.rstrip("/") if path else "/"))

    def allows(self, url: str) -> bool:
        parts = urlsplit(url)
        host = (parts.hostname or "").lower()
        path = parts.path or "/"
        for entry in self.entries:
            if host not in (entry.host, "www." + entry.host):
                continue
            if entry.path == "/" or path == entry.path or path.startswith(entry.path + "/"):
                return True
        return False

    def __call__(self, url: str) -> bool:
        return self.allows(url)

    def sites(self) -> list[str]:
        return [e.host + (e.path if e.path != "/" else "") for e in self.entries]


@dataclass(frozen=True)
class Paragraph:
    id: str
    text: str


@dataclass
class Article:
    url: str
    requested_url: str
    raw_hash: str
    published: date
    words: int
    paragraphs: list[Paragraph] = field(default_factory=list)


@dataclass(frozen=True)
class Skipped:
    url: str
    reason: str


def _walk(value: Any) -> Iterable[dict[str, Any]]:
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk(child)


def is_paywalled(html: bytes) -> bool:
    """True when the page's structured data says `"isAccessibleForFree": false`."""
    for block in _LD_JSON.findall(html):
        try:
            data = json.loads(block)
        except ValueError:
            continue
        for node in _walk(data):
            flag = node.get("isAccessibleForFree")
            if flag is False or (isinstance(flag, str) and flag.strip().lower() == "false"):
                return True
    return False


def publication_date(html: bytes) -> date | None:
    """The date the page itself gives (its metadata and markup), never one from the AI."""
    found = find_date(html, extensive_search=False, original_date=True)
    return date.fromisoformat(found) if found else None


def read_article(fetched: Fetched, requested_url: str) -> Article | Skipped:
    """Turn a downloaded page into an article with paragraph IDs, or say why it is skipped."""
    if is_paywalled(fetched.body):
        return Skipped(requested_url, "paywalled")
    published = publication_date(fetched.body)
    if published is None:
        return Skipped(requested_url, "no date on the page")
    text = trafilatura.extract(
        fetched.body,
        output_format="txt",
        include_comments=False,
        include_tables=False,
        favor_precision=True,
    )
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    words = sum(len(line.split()) for line in lines)
    if words < MIN_WORDS:
        return Skipped(requested_url, f"fewer than {MIN_WORDS} words")
    stem = f"art-{fetched.raw_hash[:12]}"
    paragraphs = [Paragraph(f"{stem}-p{n:03d}", line) for n, line in enumerate(lines, start=1)]
    return Article(
        url=fetched.url,
        requested_url=requested_url,
        raw_hash=fetched.raw_hash,
        published=published,
        words=words,
        paragraphs=paragraphs,
    )


async def fetch_article(http: HttpClient, url: str, allowlist: Allowlist) -> Article | Skipped:
    try:
        fetched = await http.fetch_page(url, is_allowed=allowlist)
    except PageRejected as rejected:
        return Skipped(url, rejected.reason)
    return read_article(fetched, url)
