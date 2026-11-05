"""The decision flow (design item 33, Technical Plan §11). A claim is one sentence.

1. A claim that fails the numeric guard or the citation check is removed.
2. A claim the skeptic marks "unsupported" is removed.
3. A section is rewritten once, and checked again, when more than 30% of its claims were
   removed or more than 30% are marked "tone".
4. Any other "tone" mark is shown as a note on its sentence. When the call budget cuts
   rewrites, tone-marked claims stay with that note.

Removals are counted by the stance the narration call gave each sentence, including claims
removed before a rewrite.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field, replace

REWRITE_SHARE = 0.30


@dataclass(frozen=True)
class Claim:
    sentence_id: str
    section: str
    text: str
    citations: list[str]
    stance: str
    guard_reasons: list[str] = field(default_factory=list)
    citation_reason: str | None = None
    reasons: list[str] = field(default_factory=list)
    note: str | None = None
    filled: str | None = None


@dataclass
class FlowResult:
    kept: list[Claim]
    removed: list[Claim]
    needs_rewrite: bool
    direction_split: dict[str, int]


def decide(
    claims: list[Claim],
    *,
    skeptic: dict[str, tuple[str, str]],
    rewrites_allowed: bool,
    removed_before: list[Claim] | None = None,
) -> FlowResult:
    kept, removed = [], []
    tone = 0
    for c in claims:
        reasons = list(c.guard_reasons) + ([c.citation_reason] if c.citation_reason else [])
        mark = skeptic.get(c.sentence_id)
        if not reasons and mark and mark[0] == "unsupported":
            reasons.append(f"unsupported: {mark[1]}")
        if reasons:
            removed.append(replace(c, reasons=reasons))
            continue
        if mark and mark[0] == "tone":
            tone += 1
            kept.append(replace(c, note=mark[1]))
        else:
            kept.append(c)
    total = len(claims) or 1
    needs = rewrites_allowed and (
        len(removed) / total > REWRITE_SHARE or tone / total > REWRITE_SHARE
    )
    split = Counter(c.stance for c in [*(removed_before or []), *removed])
    return FlowResult(kept, removed, needs, dict(split))
