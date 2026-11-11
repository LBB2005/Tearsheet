"""The analyst consensus for report section 1 (design item 20).

Phase 0 (2026-11-05) found Alpha Vantage's company overview, the planned free source, is now
a premium endpoint. Liam chose to leave the consensus out for now: `consensus` says it isn't
available, and only this function's body changes when a source is chosen (Benzinga through
Massive, or another free provider).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

# Section 1's line, as the pipeline stores it. Its words are part of the code-written report, which
# a replay must reproduce exactly, so they stay as they are.
NOT_AVAILABLE = (
    "Analyst consensus is not available on the free data plan. A source can be added later "
    "(design, Open Questions)."
)
# What a reader sees in its place: the same line without the note meant only for Liam
# (docs/launch/launch-readiness.md, S3).
NOT_AVAILABLE_SHOWN = "Analyst consensus is not available on the free data plan."


def shown_line(paragraph: str) -> str:
    """A stored section paragraph as a reader sees it: the consensus line loses its note."""
    return NOT_AVAILABLE_SHOWN if paragraph == NOT_AVAILABLE else paragraph


@dataclass(frozen=True)
class Consensus:
    available: bool
    note: str
    counts: dict[str, int] = field(default_factory=dict)  # strong_buy, buy, hold, sell, strong_sell
    average_target: float | None = None
    fetched_on: date | None = None
    source: str | None = None


def consensus(ticker: str) -> Consensus:
    return Consensus(available=False, note=NOT_AVAILABLE)
