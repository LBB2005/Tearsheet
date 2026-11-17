"""Dig deeper's news part (dig/news.py): the ticker's news since the report from Massive, with
Massive's per-ticker tone, counted by code. Display only: tone never enters a score."""

from __future__ import annotations

import asyncio
import json
from datetime import date
from pathlib import Path

import httpx
import pytest
import respx

from tearsheet import config
from tearsheet.data.articles import Allowlist
from tearsheet.dig.news import NEWS_OFF_SETTING, news_part, parse_news, tone_counts
from tearsheet.http import HttpClient
from tearsheet.methodology import load

FIXTURES = Path(__file__).parent / "fixtures" / "dig"
NEWS = config.MASSIVE_BASE_URL + config.MASSIVE_NEWS
TODAY = date(2026, 11, 9)
SINCE = date(2026, 11, 4)
ALLOW = Allowlist(load().allowlist_sites())


def saved(name):
    return json.loads((FIXTURES / name).read_text())


def test_parse_news_reads_the_tone_for_this_ticker_only():
    items = parse_news(saved("massive_news_ok.json"), "TST", ALLOW)
    assert [i["title"] for i in items] == [
        "Testco raises its yearly outlook",
        "Testco faces a recall",
        "Five stocks to watch",
    ]
    first = items[0]
    assert first == {
        "title": "Testco raises its yearly outlook",
        "publisher": "Example Wire",
        "published": "2026-11-06T13:30:00Z",
        "url": "https://www.reuters.com/markets/testco-raises-outlook",
        "openable": True,
        "tone": "positive",
        "tone_why": "The outlook went up.",
    }
    assert (items[1]["tone"], items[2]["tone"], items[2]["tone_why"]) == ("negative", None, None)


def test_only_https_links_on_the_allowlist_open():
    items = parse_news(saved("massive_news_ok.json"), "TST", ALLOW)
    assert [i["openable"] for i in items] == [True, False, False]


def test_tone_counts():
    items = parse_news(saved("massive_news_ok.json"), "TST", ALLOW)
    assert tone_counts(items) == {"positive": 1, "neutral": 0, "negative": 1, "unknown": 1}


def fetch_news(database, rawstore, *, has_key=True, today=TODAY):
    settings = config.Settings(database.conn)

    async def go():
        async with HttpClient(rawstore, "dig-1", massive_key="K") as http:
            part = await news_part(
                http, settings, "TST", since=SINCE, today=today, allowlist=ALLOW, has_key=has_key
            )
            return part, http.keys_refused

    return asyncio.run(go())


@respx.mock
def test_news_since_the_report_is_asked_for_and_kept(database, rawstore):
    route = respx.get(url__startswith=NEWS).mock(
        return_value=httpx.Response(200, json=saved("massive_news_ok.json"))
    )
    part, _ = fetch_news(database, rawstore)
    assert part["state"] == "ok" and part["source"] == "Massive" and part["since"] == "2026-11-04"
    assert len(part["items"]) == 3 and part["tone"]["positive"] == 1
    params = dict(route.calls.last.request.url.params)
    assert params == {
        "ticker": "TST",
        "published_utc.gte": "2026-11-04",
        "order": "desc",
        "sort": "published_utc",
        "limit": "50",
    }
    kept = database.conn.execute(
        "SELECT COUNT(*) FROM fetch_log WHERE run_id = 'dig-1' AND provider = 'massive'"
    ).fetchone()[0]
    assert kept == 1


@pytest.mark.parametrize(
    "answer",
    [
        httpx.Response(403, json=saved("massive_news_not_entitled.json")),
        httpx.Response(200, json=saved("massive_news_not_entitled.json")),
    ],
)
@respx.mock
def test_a_plan_without_news_turns_it_off_for_a_week_and_leaves_the_key_alone(
    database, rawstore, answer
):
    respx.get(url__startswith=NEWS).mock(return_value=answer)
    part, refused = fetch_news(database, rawstore)
    assert part["state"] == "off" and part["items"] == []
    assert part["note"] == "Massive’s plan doesn’t include news. Tearsheet checks again on 16 Nov."
    assert config.Settings(database.conn).get(NEWS_OFF_SETTING) == "2026-11-16"
    assert refused == set()


@respx.mock
def test_no_call_is_made_while_news_is_off(database, rawstore):
    config.Settings(database.conn).set_internal(NEWS_OFF_SETTING, "2026-11-16")
    route = respx.get(url__startswith=NEWS).mock(return_value=httpx.Response(500))
    part, _ = fetch_news(database, rawstore, today=date(2026, 11, 15))
    assert part["state"] == "off" and not route.called


@respx.mock
def test_news_is_asked_for_again_after_the_week(database, rawstore):
    config.Settings(database.conn).set_internal(NEWS_OFF_SETTING, "2026-11-16")
    respx.get(url__startswith=NEWS).mock(
        return_value=httpx.Response(200, json=saved("massive_news_ok.json"))
    )
    part, _ = fetch_news(database, rawstore, today=date(2026, 11, 16))
    assert part["state"] == "ok"
    assert config.Settings(database.conn).get(NEWS_OFF_SETTING) == ""


@respx.mock
def test_news_is_down_when_massive_fails(database, rawstore, monkeypatch):
    monkeypatch.setattr("tearsheet.http.RETRY_WAITS_S", ())
    respx.get(url__startswith=NEWS).mock(return_value=httpx.Response(500))
    part, _ = fetch_news(database, rawstore)
    assert part["state"] == "down" and part["note"] == "Massive didn’t answer."
    assert config.Settings(database.conn).get(NEWS_OFF_SETTING) is None


def test_news_is_off_without_a_massive_key(database, rawstore):
    part, _ = fetch_news(database, rawstore, has_key=False)
    assert (
        part["state"] == "off" and part["note"] == "Add your Massive key in Settings to see news."
    )
