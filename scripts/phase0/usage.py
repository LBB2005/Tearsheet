"""Phase 0 test: does one report fit in half of a 5-hour usage window on Claude Pro?

    uv run --project engine python scripts/phase0/usage.py

For the 3 largest companies in inputs.yaml by index weight, it runs the draft extraction
prompt on the 10-K's Items 1, 1A and 7 and the 10-Q's MD&A, then one narration-sized call
(section 4) per company. Don't use Claude Code or claude.ai while it runs: it asks you to
read Claude's usage page before, between and after the calls.

Projection (design item 12): average usage per call type x the first-report call plan in
item 34 at 45 calls (32 extraction calls on the smaller model, 13 calls on the larger one).
Pass: the projected first report uses no more than 50% of one 5-hour window.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from collections import defaultdict
from datetime import timedelta
from pathlib import Path
from statistics import mean
from typing import Any

from _common import (
    Workspace,
    ask_number,
    fail,
    load_inputs,
    open_workspace,
    sec_user_agent,
    stamp,
    table,
    write_results,
)

from tearsheet.ai import client_for
from tearsheet.ai.client import AIAuthError, AIError, AILockdownFailed, AIUsageLimit, Source
from tearsheet.ai.schemas import EvidenceList, SectionDraft
from tearsheet.data.sec import EX_13, SECClient, latest, split_sections
from tearsheet.http import HttpClient, eastern_today

SMALLER_CALLS = 32  # step 10: 14 filing and press-release sections, 3 peer MD&As, 15 articles
LARGER_CALLS = 13  # step 9 link search (1), step 11 narration (6), step 13 skeptic (6)
PASS_SHARE = 50.0
MAX_PART_WORDS = 30_000
MIN_PARAGRAPH_CHARS = 40
SECTIONS = (
    ("10-K", "Item 1", "Item 1, Business"),
    ("10-K", "Item 1A", "Item 1A, Risk Factors"),
    ("10-K", "Item 7", "Item 7, Management's Discussion and Analysis"),
    ("10-Q", "Part I Item 2", "Part I Item 2, Management's Discussion and Analysis"),
)
USAGE_SCREEN = "claude.ai > Settings > Usage, 'Current session' (or /usage inside Claude Code)"
STOPPING = (AIUsageLimit, AIAuthError, AILockdownFailed)


def to_sources(text: str, stem: str) -> list[Source]:
    lines = [line.strip() for line in text.splitlines() if len(line.strip()) >= MIN_PARAGRAPH_CHARS]
    return [Source(f"{stem}-p{n:04d}", line) for n, line in enumerate(lines, start=1)]


def split_parts(sources: list[Source], max_words: int = MAX_PART_WORDS) -> list[list[Source]]:
    parts: list[list[Source]] = [[]]
    words = 0
    for source in sources:
        size = len(source.text.split())
        if parts[-1] and words + size > max_words:
            parts.append([])
            words = 0
        parts[-1].append(source)
        words += size
    return [p for p in parts if p]


async def fetch_sections(
    ws: Workspace, user_agent: str, company: dict[str, Any]
) -> tuple[dict[str, list[Source]], int]:
    run_id = f"phase0-usage-sec-{company['ticker']}-{stamp()}"
    async with HttpClient(
        ws.rawstore, run_id, settings=ws.settings, sec_user_agent=user_agent
    ) as http:
        sec = SECClient(http, ws.rawstore)
        filings = await sec.filings(company["cik"], since=eastern_today() - timedelta(days=500))
        texts: dict[str, dict[str, str]] = {}
        for form in ("10-K", "10-Q"):
            filing = latest(filings, form)
            if filing is None:
                continue
            docs = await sec.filing_documents(
                form, filing, exhibit=EX_13 if form == "10-K" else None
            )
            primary = next(d for d in docs if d.doc_type == form)
            texts[form] = split_sections(ws.rawstore.get(primary.raw_hash), form)
    found = {}
    for form, key, label in SECTIONS:
        text = texts.get(form, {}).get(key, "")
        stem = f"{company['ticker']}-{form.replace('-', '')}-{key.split()[-1]}"
        found[label] = to_sources(text, stem)
    return found, ws.rawstore.bytes_stored(run_id)


def history_folders() -> set[str]:
    """Claude Code's session-history folders for Tearsheet's call folders. Names only."""
    root = Path(os.environ.get("CLAUDE_CONFIG_DIR", "~/.claude")).expanduser() / "projects"
    if not root.is_dir():
        return set()
    return {p.name for p in root.iterdir() if "tearsheet-calls" in p.name}


def per_call(before: float | None, after: float | None, calls: int) -> float | None:
    if before is None or after is None or calls == 0:
        return None
    return (after - before) / calls


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--tool", choices=("claude", "codex"), default="claude")
    args = parser.parse_args()
    if args.tool == "codex":
        fail("Codex support arrives in Phase 2, so its usage test runs then.")

    inputs = load_inputs()
    top3 = sorted(inputs["companies"], key=lambda c: -c["index_weight"])[:3]
    ws = open_workspace("usage", None)
    user_agent = sec_user_agent(ws.settings)
    print(f"Data folder: {ws.paths.data_dir}")
    print(f"Fetching filings for {', '.join(c['ticker'] for c in top3)} (no AI use yet) ...")
    sections: dict[str, dict[str, list[Source]]] = {}
    raw_bytes = 0
    for company in top3:
        sections[company["ticker"]], stored = await fetch_sections(ws, user_agent, company)
        raw_bytes += stored
    text_by_id = {
        ticker: {s.id: s.text for found in by_label.values() for s in found}
        for ticker, by_label in sections.items()
    }
    for ticker, found in sections.items():
        print(
            f"  {ticker}: "
            + ", ".join(f"{label.split(',')[0]} {len(s)} paragraphs" for label, s in found.items())
        )

    ai = client_for(
        ws.database.conn,
        ws.settings,
        tool=args.tool,
        signal_dir=ws.paths.logs / "ai-signals",
        budget=200,
    )
    print("Checking the lock-down gate (a short check runs now if it is needed) ...")
    await ai.ensure_ready()
    print(
        f"\nFrom now on, don't use Claude anywhere else until the script finishes.\nUsage screen: {USAGE_SCREEN}"
    )
    before = ask_number("Current session usage now, in %")
    folders_before = history_folders()

    evidence: dict[str, list[Any]] = defaultdict(list)
    errors: list[str] = []
    calls_by_type: dict[str, int] = defaultdict(int)
    stopped = None
    try:
        for company in top3:
            for label, sources in sections[company["ticker"]].items():
                form = "10-Q" if label.startswith("Part") else "10-K"
                instructions = (
                    inputs["extraction_prompt"]
                    .replace("{company}", company["name"])
                    .replace("{form}", form)
                    .replace("{section}", label)
                )
                for n, part in enumerate(split_parts(sources), start=1):
                    print(
                        f"  extract {company['ticker']} {label} part {n} ({len(part)} paragraphs)",
                        flush=True,
                    )
                    calls_by_type["extract"] += 1
                    try:
                        result = await ai.structured(
                            task="extract",
                            instructions=instructions,
                            sources=part,
                            schema=EvidenceList,
                        )
                    except STOPPING:
                        raise
                    except AIError as exc:
                        errors.append(f"extract {company['ticker']} {label} part {n}: {exc}")
                        continue
                    evidence[company["ticker"]] += result.items
        middle = ask_number("Current session usage now (after the extraction calls), in %")

        for company in top3:
            items = evidence[company["ticker"]]
            known = text_by_id[company["ticker"]]
            cited = sorted({pid for item in items for pid in item.paragraph_ids if pid in known})
            sources = [Source(pid, known[pid]) for pid in cited]
            listed = "\n".join(
                f"- [{item.type}] {item.statement} (cites {', '.join(item.paragraph_ids)})"
                for item in items
            )
            instructions = inputs["narration_prompt"].replace("{company}", company["name"])
            instructions += f"\n\nEvidence items:\n{listed or '- none'}"
            print(
                f"  narrate {company['ticker']} section 4 ({len(items)} evidence items)", flush=True
            )
            calls_by_type["narrate"] += 1
            try:
                await ai.structured(
                    task="narrate", instructions=instructions, sources=sources, schema=SectionDraft
                )
            except STOPPING:
                raise
            except AIError as exc:
                errors.append(f"narrate {company['ticker']}: {exc}")
        after = ask_number("Current session usage now (after the narration calls), in %")
    except STOPPING as exc:
        stopped = str(exc)
        print(f"\nStopped: {exc}", file=sys.stderr)
        middle = after = None
    finally:
        ws.close()
        connector_close = getattr(ai.connector, "close", None)
        if connector_close:
            connector_close()

    new_history = sorted(history_folders() - folders_before)
    ok_calls = [c for c in ai.calls if c.outcome == "ok"]
    tokens: dict[str, list[int]] = defaultdict(list)
    readings: dict[str, list[float]] = defaultdict(list)
    for call in ok_calls:
        tokens[call.task].append(sum((call.tokens or {}).values()))
        limit = call.rate_limit or {}
        if limit.get("type") == "five_hour" and limit.get("utilization") is not None:
            readings[call.task].append(float(limit["utilization"]) * 100)

    extract_share = per_call(before, middle, calls_by_type["extract"])
    narrate_share = per_call(middle, after, calls_by_type["narrate"])
    projected = (
        round(SMALLER_CALLS * extract_share + LARGER_CALLS * narrate_share, 1)
        if extract_share is not None and narrate_share is not None
        else None
    )
    token_projection = (
        round(SMALLER_CALLS * mean(tokens["extract"]) + LARGER_CALLS * mean(tokens["narrate"]))
        if tokens["extract"] and tokens["narrate"]
        else None
    )
    data = {
        "tool": "claude",
        "program_version": ai.program_version,
        "companies": [c["ticker"] for c in top3],
        "usage_screen": USAGE_SCREEN,
        "readings_percent": {
            "before": before,
            "after_extraction": middle,
            "after_narration": after,
        },
        "tool_utilization_readings_percent": dict(readings),
        "calls_sent": ai.sent,
        "calls_by_type": dict(calls_by_type),
        "calls": [vars(c) for c in ai.calls],
        "average_tokens_per_call": {task: round(mean(v)) for task, v in tokens.items() if v},
        "usage_per_call_percent": {"extract": extract_share, "narrate": narrate_share},
        "projected_first_report_percent": projected,
        "projected_first_report_tokens": token_projection,
        "measurable": projected is not None,
        "passed": projected is not None and projected <= PASS_SHARE,
        "session_history_folders_created": new_history,
        "keeps_session_history": bool(new_history),
        "errors": errors,
        "stopped": stopped,
        "raw_bytes_stored": raw_bytes,
    }
    path = write_results("usage", data)
    print()
    print(
        table(
            ["Measure", "Value"],
            [
                [
                    "Calls sent (extract / narrate)",
                    f"{calls_by_type['extract']} / {calls_by_type['narrate']}",
                ],
                [
                    "Usage per extraction call",
                    f"{extract_share} %" if extract_share is not None else "not measurable",
                ],
                [
                    "Usage per narration call",
                    f"{narrate_share} %" if narrate_share is not None else "not measurable",
                ],
                [
                    "Projected first report (45 calls)",
                    f"{projected} %" if projected is not None else "not measurable",
                ],
                ["Projected tokens", token_projection],
                [
                    "Pass (≤ 50% of a 5-hour window)",
                    "pass" if data["passed"] else ("FAIL" if projected is not None else "-"),
                ],
                ["Keeps session history of these calls", "yes" if new_history else "no"],
            ],
        )
    )
    if errors:
        print(f"\n{len(errors)} calls failed; see the results file.")
    print(f"\nFull results: {path}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
