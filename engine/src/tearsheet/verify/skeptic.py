"""The skeptic (design item 33, Technical Plan §11).

One call per AI-written section, on every claim that passed the code checks. Each call gets
the section's claims and their cited paragraphs, the evidence items given to that section,
and the rating, score and range. In Phase 1 it runs in a fresh session of the same tool, so
the report says "self-checked."
"""

from __future__ import annotations

from tearsheet.ai.client import AIClient, Source
from tearsheet.ai.schemas import EvidenceItem, SkepticReport
from tearsheet.prompts import load_prompt
from tearsheet.text.parse import Paragraph
from tearsheet.verify.flow import Claim


async def skeptic_section(
    ai: AIClient,
    *,
    section: str,
    claims: list[Claim],
    paragraphs: dict[str, Paragraph],
    evidence: list[EvidenceItem],
    rating_summary: str,
) -> dict[str, tuple[str, str]]:
    if not claims:
        return {}
    prompt = load_prompt("skeptic")
    cited: list[str] = []
    for c in claims:
        cited += [pid for pid in c.citations if pid in paragraphs and pid not in cited]
    marked = [pid for pid in cited if paragraphs[pid].marked]
    instructions = [
        prompt.text,
        f"Section: {section}.",
        f"The rating, score and range from code: {rating_summary}",
        "Claims:\n"
        + "\n".join(
            f"- {c.sentence_id}: {c.text} (cites: {', '.join(c.citations)})" for c in claims
        ),
        "Evidence items given to the writer:\n"
        + ("\n".join(f"- [{i.type}] {i.statement}" for i in evidence) or "- none"),
    ]
    if marked:
        instructions.append(
            "Paragraphs marked for instruction-like phrases (take extra care): " + ", ".join(marked)
        )
    report = await ai.structured(
        task="skeptic",
        instructions="\n\n".join(instructions),
        sources=[Source(pid, paragraphs[pid].text) for pid in cited],
        schema=SkepticReport,
        prompt_version=prompt.version,
    )
    ids = {c.sentence_id for c in claims}
    return {f.sentence_id: (f.mark, f.explanation) for f in report.findings if f.sentence_id in ids}
