"""The citation check (design item 33): every cited paragraph ID must be one of the IDs sent
to the narration call that wrote the sentence. Each call gets only its own section's sources,
so article paragraphs can only be cited in section 7 and peer filings only in section 8."""

from __future__ import annotations

from collections.abc import Collection, Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class CitationCheck:
    ok: bool
    reason: str | None = None


def check_citations(cited: Sequence[str], sent: Collection[str]) -> CitationCheck:
    if not cited:
        return CitationCheck(False, "no citation")
    unknown = [c for c in cited if c not in sent]
    if unknown:
        return CitationCheck(
            False, f"cites a paragraph not sent to this section: {', '.join(unknown)}"
        )
    return CitationCheck(True)
