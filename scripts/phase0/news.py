"""Phase 0 test: does the news step find enough readable articles?

    uv run --project engine python scripts/phase0/news.py

For the 5 tickers, it runs the draft link-search prompt on Claude Code (web search only)
with the draft allowlist, then downloads the pages itself (design item 12).
Records: links suggested, the share on the allowlist, and the share saved with a date and
at least 150 words. Pass: at least 5 readable articles per ticker.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from collections import Counter
from datetime import timedelta
from typing import Any

from _common import fail, load_inputs, open_workspace, stamp, table, write_results

from tearsheet.ai import client_for
from tearsheet.ai.client import AIAuthError, AIError, AILockdownFailed, AIUsageLimit
from tearsheet.data.articles import Allowlist, Article, fetch_article
from tearsheet.http import HttpClient, eastern_today
from tearsheet.news import WINDOW_DAYS, search_links

READABLE_MIN = 5
STOPPING = (AIUsageLimit, AIAuthError, AILockdownFailed)


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--tool", choices=("claude", "codex"), default="claude")
    parser.add_argument("--tickers", nargs="*", help="only these tickers from inputs.yaml")
    args = parser.parse_args()
    if args.tool == "codex":
        fail("Codex support arrives in Phase 2, so its news test runs then.")

    inputs = load_inputs()
    companies = [c for c in inputs["companies"] if not args.tickers or c["ticker"] in args.tickers]
    allowlist = Allowlist(inputs["allowlist"])
    ws = open_workspace("news", None)
    today = eastern_today()
    window_start = today - timedelta(days=WINDOW_DAYS)
    ai = client_for(
        ws.database.conn,
        ws.settings,
        tool=args.tool,
        signal_dir=ws.paths.logs / "ai-signals",
        budget=20,
    )
    print(f"Data folder: {ws.paths.data_dir}")
    results: list[dict[str, Any]] = []
    try:
        await ai.ensure_ready()
        for company in companies:
            print(f"  {company['ticker']}: searching ...", flush=True)
            run_id = f"phase0-news-{company['ticker']}-{stamp()}"
            row: dict[str, Any] = {"ticker": company["ticker"], "run_id": run_id}
            try:
                search = await search_links(
                    ai,
                    company=company["name"],
                    ticker=company["ticker"],
                    allowlist=allowlist,
                    instructions=inputs["link_search_prompt"],
                    today=today,
                )
            except STOPPING:
                raise
            except AIError as exc:
                row.update(error=str(exc), passed=False)
                results.append(row)
                continue
            print(
                f"    {len(search.suggested)} links, {len(search.kept)} on the allowlist; downloading ...",
                flush=True,
            )
            async with HttpClient(ws.rawstore, run_id, settings=ws.settings) as http:
                outcomes = [await fetch_article(http, link.url, allowlist) for link in search.kept]
            articles = [o for o in outcomes if isinstance(o, Article)]
            in_window = [a for a in articles if a.published >= window_start]
            suggested = len(search.suggested)
            row.update(
                suggested=suggested,
                kept=len(search.kept),
                allowlist_share=round((suggested - len(search.dropped)) / suggested, 3)
                if suggested
                else 0.0,
                readable=len(articles),
                readable_share=round(len(articles) / len(search.kept), 3) if search.kept else 0.0,
                readable_in_30_days=len(in_window),
                not_read=dict(Counter(o.reason for o in outcomes if not isinstance(o, Article))),
                off_allowlist_sites=sorted(
                    {link.url.split("/")[2] for link in search.dropped if "//" in link.url}
                ),
                articles=[
                    {"url": a.url, "published": str(a.published), "words": a.words}
                    for a in articles
                ],
                raw_bytes_stored=ws.rawstore.bytes_stored(run_id),
                passed=len(articles) >= READABLE_MIN,
            )
            results.append(row)
    except STOPPING as exc:
        print(f"\nStopped: {exc}", file=sys.stderr)
        results.append({"error": str(exc), "passed": False})
    finally:
        ws.close()
        ai.connector.close()

    path = write_results(
        "news",
        {
            "tool": args.tool,
            "allowlist": allowlist.sites(),
            "tickers": results,
            "calls": [vars(c) for c in ai.calls],
        },
    )
    print()
    print(
        table(
            [
                "Ticker",
                "Links suggested",
                "Share on allowlist",
                "Readable (date, ≥150 words)",
                "In last 30 days",
                f"Pass (≥ {READABLE_MIN})",
            ],
            [
                [
                    r.get("ticker"),
                    r.get("suggested"),
                    r.get("allowlist_share"),
                    f"{r.get('readable')} ({r.get('readable_share')})",
                    r.get("readable_in_30_days"),
                    "pass" if r.get("passed") else "FAIL",
                ]
                for r in results
            ],
        )
    )
    reasons: Counter[str] = Counter()
    for r in results:
        reasons.update(r.get("not_read") or {})
    print(f"\nWhy pages were not read: {dict(reasons)}")
    print(f"Full results: {path}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
