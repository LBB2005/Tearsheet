"""The numeric guard (design item 33, Technical Plan §11).

AI-written text may contain digits only inside placeholders, inside verbatim quotes that
appear in a cited paragraph, inside names on the engine's name list (and the run's company
names), inside a capitalized name that appears word for word in a cited paragraph, and as
four-digit years in year context or quarter forms. Number words are rejected unless they are
in a placeholder. It runs before placeholders are filled.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from typing import Any

from tearsheet.verify.quotes import normalize

PLACEHOLDER = re.compile(r"\{\{[a-z_]+:[A-Za-z0-9_.\-]+\}\}")
_QUOTED = re.compile(r'"([^"]{3,})"|“([^”]{3,})”')
# A run of words that each start with a capital, or a lowercase letter then a capital
# ("iPhone"), plus any numbers right after.
_NAME_WORD = r"(?:[A-Z][\w&'.\-]*|[a-z]+[A-Z][\w\-]*)"
_NAME_RUN = re.compile(rf"\b{_NAME_WORD}(?:\s+(?:{_NAME_WORD}|\d[\w.\-]*))*")


@dataclass(frozen=True)
class GuardResult:
    ok: bool
    reasons: list[str] = field(default_factory=list)


class NumericGuard:
    def __init__(self, lists: dict[str, Any], *, company_names: Iterable[str] = (), run_year: int):
        self.names = sorted(
            {*lists["names"], *[n for n in company_names if n]}, key=len, reverse=True
        )
        words = sorted(lists["number_words"], key=len, reverse=True)
        self.number_words = re.compile(r"\b(" + "|".join(map(re.escape, words)) + r")\b", re.I)
        self.exceptions = sorted(lists["number_word_exceptions"], key=len, reverse=True)
        digit = "|".join(lists["digit_words"])
        self.digit_words = re.compile(rf"\b((low|mid|high)[- ])?({digit})[- ]digits?\b", re.I)
        context = "|".join(
            re.escape(w) for w in sorted(lists["year_context"], key=len, reverse=True)
        )
        lo, hi = int(lists["year_min"]), run_year + int(lists["year_ahead"])
        self._year_range = (lo, hi)
        self.year = re.compile(
            rf"\b(?:{context})\s+(?:the\s+)?(?:fiscal\s+|FY\s?|calendar\s+)?(\d{{4}})\b", re.I
        )
        self.year_chain = re.compile(r"(\d{4})(\s+(?:and|or)\s+)(\d{4})\b")
        self.quarters = [re.compile(p) for p in lists["quarter_patterns"]]

    def _strip_years(self, text: str) -> str:
        lo, hi = self._year_range

        def ok(year: str) -> bool:
            return lo <= int(year) <= hi

        out = text
        for match in list(self.year.finditer(text)):
            if ok(match.group(1)):
                out = out.replace(match.group(0), match.group(0).replace(match.group(1), "▯"), 1)
                # "between 2023 and 2025": a year after "and"/"or" that follows such a year.
        while True:
            chained = re.search(r"▯(\s+(?:and|or)\s+)(\d{4})\b", out)
            if not chained or not ok(chained.group(2)):
                break
            out = out[: chained.start(2)] + "▯" + out[chained.end(2) :]
        return out

    def check(self, sentence: str, *, cited: Sequence[str]) -> GuardResult:
        text = PLACEHOLDER.sub("▯", sentence)
        cited_norm = [normalize(p) for p in cited]
        cited_raw = list(cited)

        def in_cited(fragment: str) -> bool:
            n = normalize(fragment)
            return any(n in p for p in cited_norm)

        # Verbatim quotes from a cited paragraph.
        for match in _QUOTED.finditer(sentence):
            quoted = match.group(1) or match.group(2)
            if in_cited(quoted):
                text = text.replace(match.group(0), "▯")
        # Names on the list and the run's company names.
        for name in self.names:
            text = re.sub(rf"(?<![\w]){re.escape(name)}(?![\w])", "▯", text)
        # Capitalized names that appear word for word in a cited paragraph.
        for match in list(_NAME_RUN.finditer(text)):
            run = match.group(0)
            if any(ch.isdigit() for ch in run) and any(run in p for p in cited_raw):
                text = text.replace(run, "▯", 1)
        # Years in year context, and quarter forms.
        text = self._strip_years(text)
        for pattern in self.quarters:
            text = pattern.sub("▯", text)

        reasons = []
        if any(ch.isdigit() for ch in text):
            reasons.append("a number outside a placeholder")
        cleaned = text
        for phrase in self.exceptions:
            cleaned = re.sub(rf"\b{re.escape(phrase)}\b", " ", cleaned, flags=re.I)
        if self.digit_words.search(cleaned):
            reasons.append(f"a number word: {self.digit_words.search(cleaned).group(0)!r}")
        else:
            word = self.number_words.search(cleaned)
            if word:
                reasons.append(f"a number word: {word.group(0)!r}")
        return GuardResult(not reasons, reasons)
