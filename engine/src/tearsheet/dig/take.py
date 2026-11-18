"""Dig deeper's AI take for one stock (Liam, 17 Nov): five answers to one investor checklist and
a Next move, written from the snapshot, the newest report and the news, then checked as a
report's sections are.

1. One `dig_take` call on the larger model, with the sources (dig/sources.py) and the
   placeholders (dig/levels.py).
2. The code checks on every sentence: the numeric guard, the citation check, the placeholder
   fill and the advice guard (dig/wording_guard.py).
3. The skeptic once over the sentences that passed, on the other AI tool when it is connected
   (`checker_for`), else, or when that call fails, a fresh session of the same tool.
4. `decide()`; when more than 30% were removed or marked "tone", one rewrite with the reasons,
   checked again, if the call budget has room.

A usage limit, sign-in or lock-down stop on the draft raises: nothing is saved. On the skeptic or
the rewrite it ends with what passed the code checks, and a note says so. The drafts and the
skeptic's marks are kept with the take, so replay-dig can put it together again (`assemble`)."""

from __future__ import annotations

import json
import secrets
import sqlite3
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from tearsheet import __version__
from tearsheet.ai.client import AIBudgetExhausted, AIClient, AIError, Source
from tearsheet.ai.schemas import DraftSentence, TakeDraft, TakeQuestion
from tearsheet.dig import DIG_CODE_VERSION, wording_guard
from tearsheet.dig.levels import placeholders as take_placeholders
from tearsheet.dig.levels import price_line
from tearsheet.dig.sources import TakeSources, take_sources
from tearsheet.prompts import load_prompt
from tearsheet.render import PlaceholderValue, fill, format_value
from tearsheet.verify.citations import check_citations
from tearsheet.verify.flow import Claim, FlowResult, decide
from tearsheet.verify.numeric_guard import NumericGuard
from tearsheet.verify.skeptic import skeptic_section

QUESTIONS = {
    TakeQuestion.BUSINESS: "Is it a great business?",
    TakeQuestion.PRICE: "Is the price below what it’s worth, with room to spare?",
    TakeQuestion.RISKS: "What could kill it?",
    TakeQuestion.BACKDROP: "Are the sector and the market behind it?",
    TakeQuestion.SELL: "What would make you sell?",
}
NEXT_MOVE = ("check_first", "proven_wrong")
SKEPTIC_SECTION = "Dig deeper take (five questions and the Next move)"
# A rewrite needs its own call and its re-check.
REWRITE_CALLS = 2


def new_take_id(cik: int, now: datetime) -> str:
    return f"take-{cik}-{now:%Y%m%dT%H%M%SZ}-{secrets.token_hex(3)}"


@dataclass
class Written:
    take: dict[str, Any]
    # What dig_takes.draft_json keeps: the drafts and marks as the AI gave them, and who wrote
    # and checked the take.
    drafts: dict[str, Any]


@dataclass
class _State:
    notes: list[str] = field(default_factory=list)
    checker_failed: bool = False
    checked_by: str = "self"
    stopped: bool = False


def sources_for(conn: sqlite3.Connection, raw_dir: Path, method, snapshot: dict) -> TakeSources:
    return take_sources(conn, raw_dir, snapshot, method)


def _guard(method, snapshot: dict, now_year: int) -> NumericGuard:
    head = snapshot["header"]
    names = [head["name"], *[r["name"] for r in snapshot["peers"]["rows"]]]
    return NumericGuard(method.names, company_names=names, run_year=now_year)


def _instructions(
    snapshot: dict,
    sources: TakeSources,
    places: dict[str, PlaceholderValue],
    rewrite_notes: list[str] | None,
) -> str:
    head = snapshot["header"]
    prompt = load_prompt("dig_take")
    parts = [
        prompt.text,
        f"Company: {head['name']} ({head['ticker']}), in {head['sector'] or 'no S&P 500 sector'}.",
        "The report’s findings (sentences its checks kept, each citing the paragraphs given as sources):\n"
        + ("\n".join(sources.findings) or "- none"),
        "Placeholders you may use (current values shown so you can describe them in words; write the placeholder, not the value):\n"
        + (
            "\n".join(
                f"- {{{{{key}}}}}: {format_value(p.kind, p.value)} ({p.kind})"
                for key, p in places.items()
            )
            or "- none"
        ),
    ]
    if sources.missing:
        parts.append(
            "Not available in this snapshot:\n" + "\n".join(f"- {m}" for m in sources.missing)
        )
    if rewrite_notes:
        parts.append(
            "This is a rewrite. These sentences from the first draft were removed or marked, with "
            "the reasons; fix the problems and don't repeat them:\n"
            + "\n".join(f"- {n}" for n in rewrite_notes)
        )
    return "\n\n".join(parts)


async def _draft(
    ai: AIClient,
    snapshot: dict,
    sources: TakeSources,
    places: dict[str, PlaceholderValue],
    rewrite_notes: list[str] | None = None,
) -> TakeDraft:
    return await ai.structured(
        task="dig_take",
        instructions=_instructions(snapshot, sources, places, rewrite_notes),
        sources=[Source(pid, p.text) for pid, p in sources.paragraphs.items()],
        schema=TakeDraft,
        prompt_version=load_prompt("dig_take").version,
    )


def _numbered(draft: TakeDraft, *, rewrite: bool) -> list[tuple[str, str, DraftSentence]]:
    """(sentence ID, where it goes, sentence), in the questions' order then the Next move's.
    A question answered twice keeps both answers' sentences, in order."""
    out = []
    groups: list[tuple[str, list[DraftSentence]]] = [
        (q.value, [x for a in draft.answers if a.question == q for x in a.sentences])
        for q in TakeQuestion
    ]
    groups += [(key, list(getattr(draft, key))) for key in NEXT_MOVE]
    for key, sentences in groups:
        for n, sentence in enumerate(sentences, start=1):
            out.append((f"{key}.r{n}" if rewrite else f"{key}.{n}", key, sentence))
    return out


def _checks(
    draft: TakeDraft,
    *,
    rewrite: bool,
    guard: NumericGuard,
    sources: TakeSources,
    places: dict[str, PlaceholderValue],
) -> list[Claim]:
    claims = []
    for sid, key, sentence in _numbered(draft, rewrite=rewrite):
        cited = [sources.paragraphs[c].text for c in sentence.citations if c in sources.paragraphs]
        numbers = guard.check(sentence.text, cited=cited)
        citation = check_citations(sentence.citations, sources.paragraphs.keys())
        filled, reason = fill(sentence.text, places)
        reasons = [
            *numbers.reasons,
            *([reason] if reason else []),
            *wording_guard.check(sentence.text),
        ]
        claims.append(
            Claim(
                sid,
                key,
                sentence.text,
                list(sentence.citations),
                sentence.stance.value,
                reasons,
                citation.reason if not citation.ok else None,
                filled=filled,
            )
        )
    return claims


def _summary(sources: TakeSources) -> str:
    return " ".join(p.text for pid, p in sources.paragraphs.items() if pid.startswith("dig:today#"))


async def _skeptic(
    ai: AIClient,
    checker: AIClient | None,
    claims: list[Claim],
    sources: TakeSources,
    state: _State,
) -> dict[str, tuple[str, str]] | None:
    """The skeptic's marks, or None when it couldn't run (only the code checks ran)."""
    passing = [c for c in claims if not c.guard_reasons and not c.citation_reason]
    if not passing:
        return {}

    def check(client: AIClient):
        return skeptic_section(
            client,
            section=SKEPTIC_SECTION,
            claims=passing,
            paragraphs=sources.paragraphs,
            evidence=[],
            rating_summary=_summary(sources),
        )

    if checker is not None and not state.checker_failed:
        try:
            marks = await check(checker)
        except AIBudgetExhausted as exc:
            return _stop(state, exc)
        except AIError as exc:
            state.checker_failed = True
            state.notes.append(
                f"The check on {checker.connector.display_name} failed ({exc}), so "
                f"{ai.connector.display_name} checked the take itself."
            )
        else:
            state.checked_by = "other"
            return marks
    try:
        marks = await check(ai)
    except AIError as exc:
        return _stop(state, exc)
    if state.checked_by != "other":
        state.checked_by = "self"
    return marks


def _stop(state: _State, exc: AIError) -> None:
    state.stopped = True
    state.checked_by = "code"
    state.notes.append(f"The check couldn’t run ({exc}), so only the code checks ran.")
    return None


async def write_take(
    conn: sqlite3.Connection,
    raw_dir: Path,
    method,
    snapshot: dict,
    *,
    ai: AIClient,
    checker: AIClient | None,
    now: datetime,
    take_id: str,
    progress: Callable[[str], None],
) -> Written:
    sources = sources_for(conn, raw_dir, method, snapshot)
    places = take_placeholders(snapshot)
    guard = _guard(method, snapshot, now.year)
    state = _State()
    drafts: dict[str, Any] = {
        "first": None,
        "first_marks": None,
        "rewrite": None,
        "rewrite_marks": None,
        "writer": ai.connector.display_name,
        "checker": checker.connector.display_name if checker is not None else None,
        "versions": {
            "dig_code": DIG_CODE_VERSION,
            "prompt": load_prompt("dig_take").version,
            "skeptic": load_prompt("skeptic").version,
            "engine": __version__,
        },
    }

    progress("writing")
    first = await _draft(ai, snapshot, sources, places)
    drafts["first"] = first.model_dump(mode="json")
    claims = _checks(first, rewrite=False, guard=guard, sources=sources, places=places)
    progress("checking")
    marks = await _skeptic(ai, checker, claims, sources, state)
    drafts["first_marks"] = marks
    room = ai.budget - ai.sent >= REWRITE_CALLS
    result = decide(claims, skeptic=marks or {}, rewrites_allowed=not state.stopped)
    if result.needs_rewrite and not room:
        state.notes.append("No rewrite: the call budget had no room for one.")
    elif result.needs_rewrite:
        progress("rewriting")
        notes = [f"{c.text} (removed: {'; '.join(c.reasons)})" for c in result.removed]
        notes += [f"{c.text} (tone: {c.note})" for c in result.kept if c.note]
        try:
            second = await _draft(ai, snapshot, sources, places, notes)
        except AIError as exc:
            state.notes.append(
                f"The rewrite couldn’t run ({exc}), so the first draft’s checked sentences are shown."
            )
        else:
            drafts["rewrite"] = second.model_dump(mode="json")
            again = _checks(second, rewrite=True, guard=guard, sources=sources, places=places)
            progress("checking")
            drafts["rewrite_marks"] = await _skeptic(ai, checker, again, sources, state)
    drafts["checked_by"] = state.checked_by
    drafts["notes"] = state.notes
    take = assemble(
        snapshot, sources, drafts, take_id=take_id, created_at=now.isoformat(), method=method
    )
    return Written(take, drafts)


def _sentence(c: Claim, sources: TakeSources) -> dict[str, Any]:
    return {
        "id": c.sentence_id,
        "text": c.filled,
        "stance": c.stance,
        "note": c.note,
        "citations": [
            {
                "id": pid,
                "label": sources.labels[pid][0],
                "text": sources.paragraphs[pid].text,
                "url": sources.labels[pid][1],
            }
            for pid in c.citations
        ],
    }


def assemble(
    snapshot: dict,
    sources: TakeSources,
    drafts: dict[str, Any],
    *,
    take_id: str,
    created_at: str,
    method=None,
) -> dict[str, Any]:
    """The take from its stored drafts and marks: the code checks run again and `decide()` puts
    it together, so the same drafts always give the same take (replay-dig)."""
    from tearsheet.methodology import load

    method = method or load()
    places = take_placeholders(snapshot)
    guard = _guard(method, snapshot, datetime.fromisoformat(created_at).year)
    first = TakeDraft.model_validate(drafts["first"])
    claims = _checks(first, rewrite=False, guard=guard, sources=sources, places=places)
    result: FlowResult = decide(
        claims, skeptic=_marks(drafts["first_marks"]), rewrites_allowed=False
    )
    removed = list(result.removed)
    if drafts["rewrite"] is not None:
        second = TakeDraft.model_validate(drafts["rewrite"])
        again = _checks(second, rewrite=True, guard=guard, sources=sources, places=places)
        result = decide(
            again,
            skeptic=_marks(drafts["rewrite_marks"]),
            rewrites_allowed=False,
            removed_before=removed,
        )
        removed += result.removed
    by_key: dict[str, list[dict[str, Any]]] = {}
    for c in result.kept:
        by_key.setdefault(c.section, []).append(_sentence(c, sources))
    line, close_line = price_line(snapshot)
    notes = [*drafts["notes"], *sources.cuts]
    if sources.missing:
        notes.append("Not in the sources: " + "; ".join(sources.missing) + ".")
    return {
        "take_id": take_id,
        "cik": snapshot["cik"],
        "snapshot_id": snapshot["snapshot_id"],
        "report_id": snapshot["report_id"],
        "created_at": created_at,
        "writer": drafts["writer"],
        "checked_by": drafts["checked_by"],
        "checker": drafts["checker"] if drafts["checked_by"] == "other" else None,
        "versions": drafts["versions"],
        "answers": [
            {"key": q.value, "question": text, "sentences": by_key.get(q.value, [])}
            for q, text in QUESTIONS.items()
        ],
        "next_move": {
            "price_line": line,
            "close_line": close_line,
            "check_first": by_key.get("check_first", []),
            "proven_wrong": by_key.get("proven_wrong", []),
        },
        "removed": [
            {"id": c.sentence_id, "text": c.filled or c.text, "reasons": c.reasons} for c in removed
        ],
        "rewritten": drafts["rewrite"] is not None,
        "notes": notes,
        "direction_split": result.direction_split,
    }


def _marks(stored: dict[str, Any] | None) -> dict[str, tuple[str, str]]:
    return {sid: (m[0], m[1]) for sid, m in (stored or {}).items()}


def save(conn: sqlite3.Connection, written: Written) -> None:
    from tearsheet.protocol import DigTake

    take = DigTake.model_validate(written.take).model_dump(mode="json")
    with conn:
        conn.execute(
            "INSERT INTO dig_takes (take_id, cik, snapshot_id, report_id, created_at,"
            " versions_json, draft_json, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                take["take_id"],
                take["cik"],
                take["snapshot_id"],
                take["report_id"],
                take["created_at"],
                json.dumps(take["versions"]),
                json.dumps(written.drafts),
                json.dumps(take),
            ),
        )


def takes(conn: sqlite3.Connection, cik: int, limit: int = 20) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT json FROM dig_takes WHERE cik = ? ORDER BY created_at DESC, take_id DESC LIMIT ?",
        (cik, limit),
    ).fetchall()
    return [json.loads(r[0]) for r in rows]
