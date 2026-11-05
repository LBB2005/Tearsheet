"""The quote check (design item 33).

Both texts are normalized first: Unicode NFKC, curly quotes made straight, en and em dashes
made hyphens, runs of spaces made one, and case ignored. The quote must appear in its
paragraph, and `value_text` must appear in the quote and read as exactly one date or number.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime

_QUOTES = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "−": "-"})
_NUMBER = re.compile(
    r"[-+]?\$?\d[\d,]*(\.\d+)?%?(\s?(billion|million|thousand|trillion|bn|mn|m|k))?", re.I
)
_DATE_FORMATS = (
    "%d %b %Y",
    "%d %B %Y",
    "%b %d %Y",
    "%B %d %Y",
    "%Y-%m-%d",
    "%m/%d/%Y",
    "%B %Y",
    "%b %Y",
)


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).translate(_QUOTES)
    return " ".join(text.split()).casefold()


def reads_as_one_value(value_text: str) -> bool:
    text = " ".join(value_text.replace(",", " ").split()).strip(" .")
    for fmt in _DATE_FORMATS:
        try:
            datetime.strptime(text, fmt)
            return True
        except ValueError:
            pass
    return len(_NUMBER.findall(value_text)) == 1 and bool(_NUMBER.fullmatch(value_text.strip(" .")))


@dataclass(frozen=True)
class QuoteCheck:
    status: str  # "verified", "not verified" or "ambiguous"
    reason: str | None = None


def check_quote(quote: str, value_text: str, paragraph: str) -> QuoteCheck:
    q, v, p = normalize(quote).strip('"'), normalize(value_text), normalize(paragraph)
    if not q or q not in p:
        return QuoteCheck("not verified", "the quote isn't in its paragraph")
    if not v or v not in q:
        return QuoteCheck("not verified", "the value isn't in the quote")
    if not reads_as_one_value(value_text):
        return QuoteCheck("ambiguous", "the value doesn't read as exactly one date or number")
    return QuoteCheck("verified")
