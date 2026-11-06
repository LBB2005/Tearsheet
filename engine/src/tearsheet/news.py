"""The news step (design item 7, Technical Plan §9): the AI suggests links, code reads them.

Only the links in the AI's answer are used, never its wording. Links whose site is not on
the allowlist are dropped, and the first 15 are kept. Phase 1 adds the instruction-phrase
marks, the source markers, the press releases and the next earnings date.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from urllib.parse import urlsplit, urlunsplit

from tearsheet.ai.client import AIClient
from tearsheet.ai.schemas import Link, LinkList
from tearsheet.data.articles import Allowlist

LINK_LIMIT = 15
# A site never read and skipped this many times is shown as a candidate to drop.
DROP_AFTER_SKIPS = 3
WINDOW_DAYS = 30


@dataclass
class LinkSearch:
    suggested: list[Link] = field(default_factory=list)
    kept: list[Link] = field(default_factory=list)
    dropped: list[Link] = field(default_factory=list)


def _normal(url: str) -> str:
    parts = urlsplit(url.strip())
    return urlunsplit(parts._replace(fragment=""))


def link_instructions(
    template: str, *, company: str, ticker: str, allowlist: Allowlist, today: date
) -> str:
    """Fill the link-search prompt's {company}, {ticker}, {start}, {end} and {sites}."""
    start = today - timedelta(days=WINDOW_DAYS)
    values = {
        "{company}": company,
        "{ticker}": ticker,
        "{start}": start.isoformat(),
        "{end}": today.isoformat(),
        "{sites}": ", ".join(allowlist.sites()),
    }
    for placeholder, value in values.items():
        template = template.replace(placeholder, value)
    return template


def keep_allowed(links: list[Link], allowlist: Allowlist, limit: int = LINK_LIMIT) -> LinkSearch:
    result = LinkSearch(suggested=list(links))
    seen: set[str] = set()
    for link in links:
        url = _normal(link.url)
        if url in seen:
            continue
        seen.add(url)
        if not allowlist.allows(url):
            result.dropped.append(link)
        elif len(result.kept) < limit:
            result.kept.append(link.model_copy(update={"url": url}))
    return result


async def search_links(
    ai: AIClient,
    *,
    company: str,
    ticker: str,
    allowlist: Allowlist,
    instructions: str,
    today: date,
    prompt_version: str = "draft",
) -> LinkSearch:
    """Ask the AI, with web search and nothing else, for recent coverage of the company."""
    filled = link_instructions(
        instructions, company=company, ticker=ticker, allowlist=allowlist, today=today
    )
    answer = await ai.structured(
        task="link_search",
        instructions=filled,
        sources=[],
        schema=LinkList,
        allow_web_search=True,
        prompt_version=prompt_version,
    )
    return keep_allowed(answer.links, allowlist)


def site_report(conn, allowlist: Allowlist) -> list[dict]:
    """Per allowlisted site: articles read, and articles skipped by reason, over every run.
    A site that is never read and keeps being skipped is a candidate to drop."""
    sites: dict[str, dict] = {}

    def row(site: str) -> dict:
        return sites.setdefault(site, {"site": site, "read": 0, "skipped": {}})

    for (url,) in conn.execute("SELECT final_url FROM articles"):
        row(allowlist.site_for(url))["read"] += 1
    for site, reason, count in conn.execute(
        "SELECT site, reason, COUNT(*) FROM article_skips GROUP BY site, reason"
    ):
        row(site)["skipped"][reason] = count
    out = sorted(sites.values(), key=lambda r: (-sum(r["skipped"].values()), -r["read"], r["site"]))
    for r in out:
        total = sum(r["skipped"].values())
        r["drop_candidate"] = r["read"] == 0 and total >= DROP_AFTER_SKIPS
    return out
