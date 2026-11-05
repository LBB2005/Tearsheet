"""The numeric guard, the citation check and the quote check (design item 33)."""

from __future__ import annotations

import pytest

from tearsheet.methodology import load
from tearsheet.verify.citations import check_citations
from tearsheet.verify.numeric_guard import NumericGuard
from tearsheet.verify.quotes import check_quote

NAMES = load().names
GUARD = NumericGuard(NAMES, company_names=["Apple Inc.", "3M Company"], run_year=2026)
PARA = {
    "p1": "The iPhone 15 Pro and the Model 3 sold well. Revenue rose in fiscal 2025.",
    "p2": 'The analyst said the stock was "raised to $250 from $230" on 3 Oct 2026.',
}


@pytest.mark.parametrize(
    "text",
    [
        "3M competes in adhesives.",
        "The 10-K describes the business.",
        "Item 1A lists new risks.",
        "Sales of the iPhone 15 Pro were strong.",
        "Margins improved in 2025.",
        "Costs rose between 2023 and 2025.",
        "Results in Q3 FY25 beat the plan.",
        "Sales rose in the third quarter.",
        "Growth slowed in the first half.",
        "Operating margin was {{metric:operating_margin}}, the best in the group.",
        "It works with third-party suppliers.",
        "The S&P 500 rose.",
        "One product line grew.",
        # Found in the first live Apple report (2026-11-05): period names, not quantities.
        "The fourth-quarter gross margin rose.",
        "iPhone set a September-quarter record.",
        "Apple guided December quarter revenue higher.",
        "It was his first quarter as CEO.",
        "The 10-year Treasury yield was {{macro:DGS10}}.",
    ],
)
def test_allowed(text):
    result = GUARD.check(text, cited=[PARA["p1"]])
    assert result.ok, result.reasons


@pytest.mark.parametrize(
    "text",
    [
        "Revenue doubled.",
        "A third of sales come from China.",
        "It has twenty factories.",
        "Growth was mid-single-digit.",
        "Revenue was 2025 dollars higher.",
        "Margins rose 3 points.",
        "Revenue grew 12% last year.",
        "Sales of the Pixel 9 were strong.",  # not in a cited paragraph
        "Half of revenue is services.",
        "It sold millions of phones.",
        "A quarter of sales come from China.",
        "Lead times can exceed twelve months.",
    ],
)
def test_blocked(text):
    result = GUARD.check(text, cited=[PARA["p1"]])
    assert not result.ok


def test_a_verbatim_quote_from_a_cited_paragraph_may_hold_digits():
    assert GUARD.check('The firm "raised to $250 from $230" its target.', cited=[PARA["p2"]]).ok
    assert not GUARD.check('The firm "raised to $260 from $230" its target.', cited=[PARA["p2"]]).ok


def test_company_names_from_sec_are_allowed():
    assert GUARD.check("3M Company reported results.", cited=[]).ok


# --- citations ----------------------------------------------------------------------------


def test_every_cited_id_must_have_been_sent_to_the_call():
    sent = {"10k#Item_1#p1@1", "10k#Item_1#p2@1"}
    assert check_citations(["10k#Item_1#p1@1"], sent).ok
    bad = check_citations(["10k#Item_1#p1@1", "peer#Item_7#p4@1"], sent)
    assert not bad.ok and "peer#Item_7#p4@1" in bad.reason
    assert not check_citations([], sent).ok


def test_peer_and_article_paragraphs_only_reach_their_own_sections():
    # A business-section call is never sent peer or article paragraphs, so citing one fails.
    business_sent = {"10k#Item_1#p1@1"}
    assert not check_citations(["peer10k#Item_7#p3@1"], business_sent).ok
    assert not check_citations(["art-abc123def456-p001"], business_sent).ok


# --- quotes ---------------------------------------------------------------------------------


def test_a_quote_must_be_in_its_paragraph():
    assert check_quote("raised to $250 from $230", "$250", PARA["p2"]).status == "verified"
    assert check_quote("raised to $275", "$275", PARA["p2"]).status == "not verified"


def test_curly_quotes_and_dashes_are_normalized():
    paragraph = "Apple said it “expects revenue growth — in the low teens”, on 3 Oct 2026."
    assert check_quote(
        'expects revenue growth - in the low teens"', "low teens", paragraph
    ).status in ("verified", "ambiguous")
    assert check_quote("on 3 Oct 2026", "3 Oct 2026", paragraph).status == "verified"


def test_the_value_must_be_exactly_one_date_or_number():
    assert (
        check_quote("raised to $250 from $230", "$250 from $230", PARA["p2"]).status == "ambiguous"
    )
    assert check_quote("raised to $250 from $230", "$999", PARA["p2"]).status == "not verified"
