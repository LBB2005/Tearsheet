"""Writing the AI sections (design item 31, Technical Plan §3 step 11).

One call per AI-written section, on the larger model. Each call gets only its own section's
evidence items and their cited paragraphs, plus the placeholder list: the keys the section
may use, each with its current value and type. Code gives each sentence its ID after
narration: `<section>.<n>`, or `<section>.r<n>` for a rewrite.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from tearsheet.ai.client import AIClient, Source
from tearsheet.ai.schemas import DraftSentence, EvidenceItem, SectionDraft, SectionKey
from tearsheet.prompts import load_prompt
from tearsheet.render import PlaceholderValue, format_value
from tearsheet.text.parse import Paragraph

GUIDE = {
    SectionKey.BUSINESS: "Section 4, the business: what the company sells, to whom, how it makes money, and what drives its results.",
    SectionKey.RISKS: "Section 5, the risks: the main risks the company itself describes and what has changed, most material first.",
    SectionKey.RESULTS: "Section 6, recent results: what happened in the latest quarter and year, and why, from the filings and the earnings release.",
    SectionKey.NEWS: "Section 7, news and views: what recent coverage says, from the articles and press releases, balanced across sources.",
    SectionKey.TRENDS: "Section 8, industry trends: what the largest peers say about the industry, and the economic backdrop, linked to this company.",
    SectionKey.WATCH: "The What to watch block, risks part only: the specific risks and events a holder should watch over the next 12 months.",
}


@dataclass
class Draft:
    section: SectionKey
    sentences: list[tuple[str, DraftSentence]]  # (sentence ID, sentence)
    sent_ids: set[str]  # the paragraph IDs sent to this call
    placeholders: dict[str, PlaceholderValue]
    failed: str | None = None
    rewrite: bool = False
    removed_notes: list[str] = field(default_factory=list)


def _evidence_lines(items: list[EvidenceItem]) -> str:
    return "\n".join(
        f"- [{i.type}] {i.statement} (cites: {', '.join(i.paragraph_ids)})" for i in items
    )


def _placeholder_lines(placeholders: dict[str, PlaceholderValue]) -> str:
    return "\n".join(
        f"- {{{{{key}}}}}: {format_value(p.kind, p.value)} ({p.kind})"
        for key, p in placeholders.items()
    )


async def narrate_section(
    ai: AIClient,
    *,
    section: SectionKey,
    company: str,
    evidence: list[EvidenceItem],
    paragraphs: dict[str, Paragraph],
    placeholders: dict[str, PlaceholderValue],
    rewrite_notes: list[str] | None = None,
) -> Draft:
    prompt = load_prompt("narrate")
    cited = []
    for item in evidence:
        for pid in item.paragraph_ids:
            if pid in paragraphs and pid not in cited:
                cited.append(pid)
    instructions = [
        prompt.text,
        f"Company: {company}.",
        GUIDE[section],
        "Evidence items (each cites the paragraphs given as sources):\n"
        + (_evidence_lines(evidence) or "- none"),
        "Placeholders you may use (current values shown so you can describe them in words; write the placeholder, not the value):\n"
        + (_placeholder_lines(placeholders) or "- none"),
    ]
    if rewrite_notes:
        instructions.append(
            "This is a rewrite. These sentences from the first draft were removed or marked, with the reasons; "
            "fix the problems and don't repeat them:\n" + "\n".join(f"- {n}" for n in rewrite_notes)
        )
    answer = await ai.structured(
        task="narrate",
        instructions="\n\n".join(instructions),
        sources=[Source(pid, paragraphs[pid].text) for pid in cited],
        schema=SectionDraft,
        prompt_version=prompt.version,
    )
    prefix = f"{section.value}.r" if rewrite_notes else f"{section.value}."
    numbered = [(f"{prefix}{n}", s) for n, s in enumerate(answer.sentences, start=1)]
    return Draft(section, numbered, set(cited), placeholders, rewrite=bool(rewrite_notes))
