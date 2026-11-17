"""The news part: the ticker's news since the report from Massive's news endpoint, with the
tone Massive gives each article for this ticker (`insights`), counted by code. Shown on the
page only; tone never enters a score or a rating.

When the plan refuses news, the part is off for a week and then asked for again. A refusal by
the plan isn't the key's fault, so the key is never marked refused for it."""

from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any

from tearsheet import config
from tearsheet.config import Settings
from tearsheet.data.articles import Allowlist
from tearsheet.http import HTTPFailure

NEWS_LIMIT = 50
NEWS_OFF_SETTING = "dig_news_off_until"
NEWS_RETRY_DAYS = 7
TONES = ("positive", "neutral", "negative")


def _tone(article: dict[str, Any], ticker: str) -> tuple[str | None, str | None]:
    for insight in article.get("insights") or []:
        if isinstance(insight, dict) and str(insight.get("ticker", "")).upper() == ticker.upper():
            tone = str(insight.get("sentiment", "")).lower()
            return (tone if tone in TONES else None), insight.get("sentiment_reasoning") or None
    return None, None


def parse_news(data: dict[str, Any], ticker: str, allowlist: Allowlist) -> list[dict[str, Any]]:
    """Massive's articles in its order (newest first). A link opens only when it is https and
    on the news allowlist."""
    items = []
    for article in data.get("results") or []:
        if not isinstance(article, dict) or not article.get("title"):
            continue
        url = str(article.get("article_url") or "")
        tone, why = _tone(article, ticker)
        publisher = article.get("publisher") if isinstance(article.get("publisher"), dict) else {}
        items.append(
            {
                "title": str(article["title"]),
                "publisher": str(publisher.get("name") or ""),
                "published": str(article.get("published_utc") or ""),
                "url": url,
                "openable": url.startswith("https://") and allowlist.allows(url),
                "tone": tone,
                "tone_why": why,
            }
        )
    return items


def tone_counts(items: list[dict[str, Any]]) -> dict[str, int]:
    counts = {tone: 0 for tone in TONES} | {"unknown": 0}
    for item in items:
        counts[item["tone"] or "unknown"] += 1
    return counts


def _not_on_plan(exc: HTTPFailure) -> bool:
    text = str(exc).lower()
    return exc.status == 403 or "not_authorized" in text or "entitled" in text


def _day(d: date) -> str:
    return f"{d.day} {d:%b}"


async def news_part(
    http,
    settings: Settings,
    ticker: str,
    *,
    since: date,
    today: date,
    allowlist: Allowlist,
    has_key: bool,
) -> dict[str, Any]:
    """One call to Massive (its bytes and fetch_log row kept by the client)."""
    base: dict[str, Any] = {
        "since": since.isoformat(),
        "items": [],
        "tone": tone_counts([]),
        "source": "Massive",
    }
    if not has_key:
        return {"state": "off", "note": "Add your Massive key in Settings to see news.", **base}
    off_until = settings.get(NEWS_OFF_SETTING) or ""
    if off_until and today < date.fromisoformat(off_until):
        return {"state": "off", "note": _off_note(date.fromisoformat(off_until)), **base}
    try:
        fetched = await http.fetch(
            "massive",
            config.MASSIVE_BASE_URL + config.MASSIVE_NEWS,
            kind="news",
            params={
                "ticker": ticker,
                "published_utc.gte": since.isoformat(),
                "order": "desc",
                "sort": "published_utc",
                "limit": NEWS_LIMIT,
            },
        )
    except HTTPFailure as exc:
        if _not_on_plan(exc):
            again = today + timedelta(days=NEWS_RETRY_DAYS)
            settings.set_internal(NEWS_OFF_SETTING, again.isoformat())
            return {"state": "off", "note": _off_note(again), **base}
        return {"state": "down", "note": "Massive didn't answer.", **base}
    if off_until:
        settings.set_internal(NEWS_OFF_SETTING, "")
    items = parse_news(json.loads(fetched.body), ticker, allowlist)
    return {**base, "state": "ok", "note": None, "items": items, "tone": tone_counts(items)}


def _off_note(again: date) -> str:
    return f"Massive's plan doesn't include news. Tearsheet checks again on {_day(again)}."
