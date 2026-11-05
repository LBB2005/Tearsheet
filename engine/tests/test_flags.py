"""Red flags, the risk-factor change and the insider-buying note (design items 23 and 25)."""

from __future__ import annotations

from datetime import date

import pytest

from tearsheet.flags import (
    going_concern,
    insider_buying_note,
    material_weakness,
    red_flags,
    restatement,
)
from tearsheet.text.compare import change_score

RUN = date(2026, 11, 5)


def test_restatement_is_an_item_4_02_in_the_last_12_months():
    assert restatement([("8-K", date(2026, 3, 1), ("4.02", "9.01"))], RUN)
    assert not restatement([("8-K", date(2025, 10, 1), ("4.02",))], RUN)
    assert not restatement([("8-K", date(2026, 3, 1), ("2.02",))], RUN)


@pytest.mark.parametrize(
    ("text", "flag"),
    [
        (
            "Management concluded that our internal control over financial reporting was effective as of December 31.",
            False,
        ),
        (
            "Management concluded that our internal control over financial reporting was not effective as of December 31.",
            True,
        ),
        (
            "Our internal control over financial reporting is ineffective because of a material weakness.",
            True,
        ),
        (
            "Our disclosure controls were not effective. Internal control over financial reporting was effective.",
            False,
        ),
    ],
)
def test_material_weakness(text, flag):
    assert material_weakness(text) is flag


@pytest.mark.parametrize(
    ("text", "flag"),
    [
        (
            "These conditions raise substantial doubt about the Company's ability to continue as a going concern.",
            True,
        ),
        ("There is no substantial doubt about its ability to continue as a going concern.", False),
        (
            "These matters do not raise substantial doubt about the ability to continue as a going concern.",
            False,
        ),
        (
            "Management does not believe there is substantial doubt about its ability to continue as a going concern.",
            False,
        ),
        (
            "Substantial doubt about the ability to continue as a going concern was alleviated by the financing.",
            False,
        ),
        ("The financial statements were audited.", False),
    ],
)
def test_going_concern(text, flag):
    assert going_concern(text) is flag


def test_the_risk_factor_change_score():
    last = [
        "Competition is intense in all our markets and could hurt margins.",
        "We depend on a few suppliers for key parts.",
    ]
    same = change_score(last, last, cutoff=0.8)
    assert same.score == 0.0
    new = last + [
        "A new tariff regime could raise our costs sharply across every product line we sell."
    ]
    changed = change_score(new, last, cutoff=0.8)
    added_words = len(new[2].split())
    assert changed.score == pytest.approx(
        added_words / (sum(len(p.split()) for p in new) + sum(len(p.split()) for p in last))
    )
    assert changed.changed == [new[2]]


def test_a_reworded_paragraph_still_matches_at_the_cutoff():
    last = ["We depend on a small number of suppliers for several key parts and components."]
    this = ["We depend on a small number of suppliers for several key components and parts."]
    assert change_score(this, last, cutoff=0.8).score == 0.0


def test_red_flags_collects_the_four_rules():
    flags = red_flags(
        eight_ks=[("8-K", date(2026, 3, 1), ("4.02",))],
        item_9a="Internal control over financial reporting was not effective.",
        auditor="There is substantial doubt about its ability to continue as a going concern.",
        risk_change=0.45,
        threshold=0.30,
        run_date=RUN,
    )
    assert [f.key for f in flags] == [
        "restatement",
        "material_weakness",
        "going_concern",
        "risk_factor_change",
    ]
    assert (
        red_flags(
            eight_ks=[], item_9a="", auditor="", risk_change=0.1, threshold=0.30, run_date=RUN
        )
        == []
    )


def test_the_insider_buying_note_skips_routine_buyers():
    # A buy in the last 6 months by someone who didn't buy in that month in each of the
    # prior 3 years is shown; a routine buyer is not. Only open-market purchases count.
    buys = [
        ("Alice", date(2026, 9, 10), "P"),
        ("Bob", date(2026, 9, 12), "P"),
        ("Bob", date(2025, 9, 3), "P"),
        ("Bob", date(2024, 9, 20), "P"),
        ("Bob", date(2023, 9, 1), "P"),
        ("Carol", date(2026, 8, 1), "A"),  # an award, not a purchase
    ]
    note = insider_buying_note(buys, RUN)
    assert note is not None and note.buyers == ["Alice"]
    assert insider_buying_note([("Bob", d, c) for _, d, c in buys[1:5]], RUN) is None
