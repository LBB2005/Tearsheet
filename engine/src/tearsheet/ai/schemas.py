"""Response schemas for every AI call, and the report's section keys (design item 11).

The AI is never asked for a number. Values from news (dates, targets, rating changes)
come back only as verbatim quotes, which code checks before using.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SectionKey(StrEnum):
    RATING = "rating"  # 1
    SCORE = "score"  # 2
    VALUATION = "valuation"  # 3
    BUSINESS = "business"  # 4
    RISKS = "risks"  # 5
    RESULTS = "results"  # 6
    NEWS = "news"  # 7
    TRENDS = "trends"  # 8
    WATCH = "watch"  # What to watch
    METHODOLOGY = "methodology"  # 9


# The AI writes these (only the risks part of `watch`); code writes the rest.
AI_WRITTEN_SECTIONS = frozenset(
    {
        SectionKey.BUSINESS,
        SectionKey.RISKS,
        SectionKey.RESULTS,
        SectionKey.NEWS,
        SectionKey.TRENDS,
        SectionKey.WATCH,
    }
)


class EvidenceType(StrEnum):
    RISK = "risk"
    DRIVER = "driver"
    GUIDANCE = "guidance"
    COMPETITION = "competition"
    TREND = "trend"
    EVENT = "event"


class EvidenceItem(Strict):
    statement: str
    type: EvidenceType
    paragraph_ids: list[str] = Field(min_length=1)


class QuotedValue(Strict):
    kind: Literal["date", "price_target", "rating_change"]
    paragraph_id: str
    quote: str
    # The exact part of the quote that holds the one value, such as "$250".
    value_text: str


class EvidenceList(Strict):
    items: list[EvidenceItem]
    # Dates, price targets and rating changes, only as verbatim quotes (item 29).
    quotes: list[QuotedValue] = Field(default_factory=list)


class Stance(StrEnum):
    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"


class DraftSentence(Strict):
    # Placeholders such as {{metric:...}} are written inside the text (item 31).
    text: str
    citations: list[str]
    stance: Stance


class SectionDraft(Strict):
    section: SectionKey
    sentences: list[DraftSentence]


class SkepticFinding(Strict):
    sentence_id: str
    mark: Literal["unsupported", "tone"]
    problem_type: str
    explanation: str


class SkepticReport(Strict):
    findings: list[SkepticFinding]


class Link(Strict):
    url: str
    title: str
    publisher: str


class LinkList(Strict):
    links: list[Link]


class LockdownProbe(Strict):
    """The lock-down check's tiny answer: a summary of the source, and whether it held
    instructions aimed at the reader."""

    summary: str
    has_instructions: bool
