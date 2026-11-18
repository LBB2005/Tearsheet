"""Dig deeper's advice guard: a take gives no second rating and never tells the reader what to
do (Liam, 17 Nov). A sentence with advice or verdict wording is removed, whatever it cites.

The phrases live in code, not the methodology, so adding one never moves a report's
methodology hash. They are written to leave plain description alone: "a buyback", "a sell-off",
"insiders sold shares", "analysts rate it", "our numbers turn Buy at …"."""

from __future__ import annotations

import re

_ACTIONS = r"(?:buy|sell|hold|avoid|own|add|trim|accumulate|exit|stay\s+away)"
_PATTERNS = tuple(
    re.compile(p, re.I)
    for p in (
        # "You should buy", "Investors should consider selling"
        r"\b(?:you|investors|readers|holders|shareholders|one|we|i)\s+(?:should|must|ought\s+to|"
        rf"need\s+to|may\s+want\s+to|might\s+want\s+to)\s+(?:consider\s+)?{_ACTIONS}\w*",
        # "We recommend", "We rate the stock"
        r"\b(?:we|i)\s+(?:recommend|rate|advise|suggest|would\s+buy|would\s+sell)\b",
        # "a strong buy", "a clear sell"
        r"\b(?:strong|clear|solid|easy|obvious)\s+(?:buy|sell)\b",
        # "it is a sell", "looks like a buy" (not "a Buy rating" or "a Hold trigger")
        r"\b(?:is|looks\s+like|as)\s+an?\s+(?:buy|sell|hold)(?![\w-])"
        r"(?!\s+(?:rating|trigger|line|price|side|call|signal))",
        r"\bworth\s+(?:buying|selling|owning|holding)\b",
        r"\b(?:over|under)weight\b",
        r"\btake\s+profits?\b",
        r"\bstop[- ]loss\b",
        r"\bentry\s+point\b",
        r"\b(?:good|right|best)\s+(?:time|moment|point|price)\s+to\s+(?:buy|sell|add|exit)\b",
        r"\btime\s+to\s+(?:buy|sell)\b",
        r"\b(?:buy|sell)\s+(?:it|the\s+stock|the\s+shares)\s+(?:now|today|here)\b",
        # An order at the start of a sentence: "Buy the stock …", "Avoid the shares …"
        r"^\s*(?:buy|sell|avoid|hold|add\s+to|trim|accumulate)(?![\w-])",
    )
)


def check(text: str) -> list[str]:
    """The reasons to remove a sentence, quoting the wording found; empty when it is fine."""
    for pattern in _PATTERNS:
        found = pattern.search(text)
        if found:
            return [f"advice wording: {found.group(0).strip()!r}"]
    return []
