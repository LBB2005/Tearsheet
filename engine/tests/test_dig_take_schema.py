"""Dig deeper's AI take: its answer schema, prompt, model, budget and fixed line (Phase 2)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from tearsheet import config, wording
from tearsheet.ai.schemas import TakeDraft, TakeQuestion
from tearsheet.prompts import load_prompt

QUESTIONS = (
    "Is it a great business?",
    "Is the price below what it’s worth, with room to spare?",
    "What could kill it?",
    "Are the sector and the market behind it?",
    "What would make you sell?",
)


def sentence(text="It sells phones.", cites=("dig:today#p1",)):
    return {"text": text, "citations": list(cites), "stance": "neutral"}


def test_the_prompt_is_versioned_and_asks_the_five_questions_word_for_word():
    prompt = load_prompt("dig_take")
    assert prompt.version == "dig_take-1"
    for q in QUESTIONS:
        assert q in prompt.text
    assert "{{level:buy_trigger}}" in prompt.text
    assert "never" in prompt.text.lower() and "number" in prompt.text.lower()


def test_the_question_keys_are_fixed():
    assert [q.value for q in TakeQuestion] == ["business", "price", "risks", "backdrop", "sell"]


def test_a_take_draft_reads_its_answers_and_next_move():
    draft = TakeDraft.model_validate(
        {
            "answers": [{"question": "business", "sentences": [sentence()]}],
            "check_first": [sentence()],
            "proven_wrong": [],
        }
    )
    assert draft.answers[0].question is TakeQuestion.BUSINESS


def test_a_take_draft_refuses_extra_keys_and_unknown_questions():
    with pytest.raises(ValidationError):
        TakeDraft.model_validate(
            {"answers": [], "check_first": [], "proven_wrong": [], "rating": "Buy"}
        )
    with pytest.raises(ValidationError):
        TakeDraft.model_validate(
            {
                "answers": [{"question": "verdict", "sentences": []}],
                "check_first": [],
                "proven_wrong": [],
            }
        )


def test_the_take_is_written_on_the_larger_model_within_its_own_budget():
    assert config.CLAUDE_MODELS["dig_take"] == "sonnet"
    assert config.TAKE_CALL_BUDGET == 8


def test_the_take_line_says_the_price_is_codes():
    assert wording.TAKE_LINE == (
        "The Buy price is the report’s, worked out by code. The AI never sets a price."
    )
