"""The decision flow (design item 33, Technical Plan §11)."""

from __future__ import annotations

from tearsheet.verify.flow import Claim, decide


def claim(n: int, stance: str = "neutral", *, guard: bool = True, cite: bool = True) -> Claim:
    return Claim(
        sentence_id=f"risks.{n}",
        section="risks",
        text=f"Sentence {n}.",
        citations=["p1"],
        stance=stance,
        guard_reasons=[] if guard else ["a number word"],
        citation_reason=None if cite else "no citation",
    )


def test_failing_code_checks_are_removed():
    result = decide(
        [claim(1), claim(2, guard=False), claim(3, cite=False), claim(4)],
        skeptic={},
        rewrites_allowed=True,
    )
    assert [c.sentence_id for c in result.kept] == ["risks.1", "risks.4"]
    assert {c.sentence_id: c.reasons for c in result.removed} == {
        "risks.2": ["a number word"],
        "risks.3": ["no citation"],
    }


def test_more_than_30_percent_removed_asks_for_one_rewrite():
    claims = [claim(1), claim(2, guard=False), claim(3, guard=False), claim(4), claim(5)]
    assert decide(claims, skeptic={}, rewrites_allowed=True).needs_rewrite
    assert not decide(
        claims[:4] + [claim(5)],
        skeptic={"risks.2": ("unsupported", "no support")},
        rewrites_allowed=False,
    ).needs_rewrite


def test_the_skeptic_removes_unsupported_and_notes_tone():
    claims = [claim(i) for i in range(1, 8)]
    result = decide(
        claims,
        skeptic={
            "risks.1": ("unsupported", "not in the paragraph"),
            "risks.2": ("tone", "too upbeat"),
        },
        rewrites_allowed=True,
    )
    assert [c.sentence_id for c in result.removed] == ["risks.1"]
    kept = {c.sentence_id: c for c in result.kept}
    assert kept["risks.2"].note == "too upbeat"
    assert not result.needs_rewrite


def test_too_much_tone_asks_for_a_rewrite_unless_the_budget_cut_rewrites():
    claims = [claim(i) for i in range(1, 4)]
    tone = {"risks.1": ("tone", "a"), "risks.2": ("tone", "b")}
    assert decide(claims, skeptic=tone, rewrites_allowed=True).needs_rewrite
    cut = decide(claims, skeptic=tone, rewrites_allowed=False)
    assert not cut.needs_rewrite
    assert {c.note for c in cut.kept if c.note} == {"a", "b"}


def test_the_direction_split_counts_removals_by_stance():
    claims = [
        claim(1, "positive", guard=False),
        claim(2, "positive", guard=False),
        claim(3, "negative", cite=False),
        claim(4),
    ]
    result = decide(
        claims,
        skeptic={},
        rewrites_allowed=False,
        removed_before=[claim(9, "neutral", guard=False)],
    )
    assert result.direction_split == {"positive": 2, "negative": 1, "neutral": 1}
