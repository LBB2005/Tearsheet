"""Article pages (design item 13: test_articles.py; Technical Plan §9)."""

from __future__ import annotations

import asyncio
from datetime import date

import httpx
import pytest
import respx

from tearsheet.ai.schemas import Link
from tearsheet.data.articles import Allowlist, Article, Skipped, fetch_article, is_paywalled
from tearsheet.http import HttpClient, PageRejected
from tearsheet.news import keep_allowed

ALLOW = Allowlist(["reuters.com", "apnews.com", "goldmansachs.com/insights"])
TOPICS = [
    "sales",
    "margins",
    "hiring",
    "factories",
    "pricing",
    "suppliers",
    "cloud",
    "retail",
    "credit",
]


def paragraph(n: int) -> str:
    # trafilatura drops repeated paragraphs, so each one differs.
    topic = TOPICS[n % len(TOPICS)]
    return (
        f"In part {n} of the story, Example Corp said its {topic} changed during the quarter, "
        f"and managers described what the shift in {topic} means for customers, workers and "
        f"investors over the coming year, with more detail promised at the meeting number {n}."
    )


def page(
    *, words: int = 200, published: str | None = "2026-10-28T14:00:00Z", ld_json: str = ""
) -> str:
    meta = f'<meta property="article:published_time" content="{published}">' if published else ""
    body = "".join(f"<p>{paragraph(n)}</p>" for n in range(max(1, words // 35)))
    return (
        f"<html><head><title>Example</title>{meta}{ld_json}</head>"
        f"<body><nav>Home</nav><article><h1>Example Corp beats</h1>{body}</article></body></html>"
    )


async def public_resolver(host: str) -> list[str]:
    return {"intranet.example": ["10.0.0.5"], "router.example": ["192.168.1.1"]}.get(
        host, ["93.184.216.34"]
    )


def run_fetch(rawstore, url: str, allowlist: Allowlist = ALLOW):
    async def go():
        async with HttpClient(rawstore, "news-run", resolver=public_resolver) as http:
            return await fetch_article(http, url, allowlist)

    return asyncio.run(go())


# --- addresses ------------------------------------------------------------------------


def test_allowlist_is_an_exact_site_match():
    assert ALLOW.allows("https://www.reuters.com/markets/x")
    assert ALLOW.allows("https://reuters.com/markets/x")
    assert not ALLOW.allows("https://news.reuters.com/x")
    assert not ALLOW.allows("https://reuters.com.evil.example/x")
    assert ALLOW.allows("https://www.goldmansachs.com/insights/articles/outlook")
    assert not ALLOW.allows("https://www.goldmansachs.com/careers")
    assert not ALLOW.allows("https://www.goldmansachs.com/insightsfake")


@respx.mock
def test_redirect_to_a_site_off_the_allowlist_is_rejected(rawstore):
    start = "https://www.reuters.com/markets/story"
    respx.get(start).mock(
        return_value=httpx.Response(302, headers={"Location": "https://evil.example/x"})
    )
    evil = respx.get("https://evil.example/x").mock(return_value=httpx.Response(200, html=page()))
    result = run_fetch(rawstore, start)
    assert isinstance(result, Skipped) and result.reason == "not on the allowlist"
    assert evil.call_count == 0


@respx.mock
def test_redirects_on_the_allowlist_are_followed_one_at_a_time(rawstore):
    start = "https://reuters.com/a"
    respx.get(start).mock(return_value=httpx.Response(301, headers={"Location": "/b"}))
    respx.get("https://reuters.com/b").mock(return_value=httpx.Response(200, html=page()))
    result = run_fetch(rawstore, start)
    assert isinstance(result, Article)
    assert result.url == "https://reuters.com/b"


def test_http_addresses_are_rejected(rawstore):
    result = run_fetch(rawstore, "http://www.reuters.com/markets/story")
    assert isinstance(result, Skipped) and result.reason == "not https"


@pytest.mark.parametrize(
    "url",
    [
        "https://192.168.1.10/report",
        "https://127.0.0.1/report",
        "https://[::1]/report",
        "https://localhost/report",
        "https://printer.local/report",
        "https://intranet.example/report",
        "https://router.example/report",
    ],
)
def test_local_and_home_network_addresses_are_rejected(rawstore, url):
    everything = Allowlist(
        [
            "192.168.1.10",
            "127.0.0.1",
            "::1",
            "[::1]",
            "localhost",
            "printer.local",
            "intranet.example",
            "router.example",
        ]
    )
    result = run_fetch(rawstore, url, everything)
    assert isinstance(result, Skipped)
    assert result.reason == "a local or home-network address"


@respx.mock
def test_redirect_to_a_home_network_address_is_rejected(rawstore):
    allow = Allowlist(["reuters.com", "router.example"])
    respx.get("https://reuters.com/a").mock(
        return_value=httpx.Response(302, headers={"Location": "https://router.example/admin"})
    )
    result = run_fetch(rawstore, "https://reuters.com/a", allow)
    assert isinstance(result, Skipped) and result.reason == "a local or home-network address"


# --- caps -----------------------------------------------------------------------------


@respx.mock
def test_size_cap_holds_whether_or_not_the_size_is_declared(rawstore, database):
    respx.get("https://reuters.com/big").mock(return_value=httpx.Response(200, html="x" * 5000))

    async def go():
        async with HttpClient(rawstore, "news-run", resolver=public_resolver) as http:
            return await http.fetch_page(
                "https://reuters.com/big", is_allowed=ALLOW, max_bytes=1000
            )

    with pytest.raises(PageRejected, match="larger than 5 MB"):
        asyncio.run(go())
    assert database.conn.execute("SELECT COUNT(*) FROM raw_objects").fetchone()[0] == 0


def test_size_cap_holds_while_streaming(rawstore):
    async def chunks():
        for _ in range(10):
            yield b"y" * 500

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers={"content-type": "text/html"}, content=chunks())

    async def go():
        async with HttpClient(
            rawstore, "news-run", resolver=public_resolver, transport=httpx.MockTransport(handler)
        ) as http:
            return await http.fetch_page(
                "https://reuters.com/stream", is_allowed=ALLOW, max_bytes=1000
            )

    with pytest.raises(PageRejected, match="larger than 5 MB"):
        asyncio.run(go())


def test_time_cap_holds(rawstore):
    async def slow(request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(2)
        return httpx.Response(200, html=page())

    async def go():
        async with HttpClient(
            rawstore, "news-run", resolver=public_resolver, transport=httpx.MockTransport(slow)
        ) as http:
            return await http.fetch_page(
                "https://reuters.com/slow", is_allowed=ALLOW, time_limit_s=0.05
            )

    with pytest.raises(PageRejected, match="took longer than 0.05 seconds"):
        asyncio.run(go())


# --- reading the page -----------------------------------------------------------------------


@respx.mock
def test_the_date_is_read_from_the_page(rawstore):
    respx.get("https://apnews.com/article/x").mock(return_value=httpx.Response(200, html=page()))
    result = run_fetch(rawstore, "https://apnews.com/article/x")
    assert isinstance(result, Article)
    assert result.published == date(2026, 10, 28)
    assert result.words >= 150
    assert result.paragraphs[0].id == f"art-{result.raw_hash[:12]}-p001"


@respx.mock
def test_a_page_with_no_date_is_skipped(rawstore):
    respx.get("https://apnews.com/article/x").mock(
        return_value=httpx.Response(200, html=page(published=None))
    )
    result = run_fetch(rawstore, "https://apnews.com/article/x")
    assert isinstance(result, Skipped) and result.reason == "no date on the page"


@respx.mock
def test_a_short_page_is_skipped(rawstore):
    short = page(words=35).replace(paragraph(0), "Shares rose after the results.")
    respx.get("https://apnews.com/article/x").mock(return_value=httpx.Response(200, html=short))
    result = run_fetch(rawstore, "https://apnews.com/article/x")
    assert isinstance(result, Skipped) and result.reason == "fewer than 150 words"


@pytest.mark.parametrize("status", [401, 402, 403])
@respx.mock
def test_paywall_statuses_are_skipped(rawstore, status):
    respx.get("https://apnews.com/article/x").mock(return_value=httpx.Response(status))
    result = run_fetch(rawstore, "https://apnews.com/article/x")
    assert isinstance(result, Skipped) and result.reason == "paywalled"


@respx.mock
def test_paywall_in_structured_data_is_skipped(rawstore):
    ld = '<script type="application/ld+json">{"@type": "NewsArticle", "isAccessibleForFree": false}</script>'
    respx.get("https://apnews.com/article/x").mock(
        return_value=httpx.Response(200, html=page(ld_json=ld))
    )
    result = run_fetch(rawstore, "https://apnews.com/article/x")
    assert isinstance(result, Skipped) and result.reason == "paywalled"


def test_paywall_flag_written_as_text_or_nested():
    nested = b'<script type="application/ld+json">[{"hasPart": {"isAccessibleForFree": "False"}}]</script>'
    assert is_paywalled(nested)
    assert not is_paywalled(
        b'<script type="application/ld+json">{"isAccessibleForFree": true}</script>'
    )
    assert not is_paywalled(b'<script type="application/ld+json">not json</script>')


def test_links_off_the_allowlist_are_dropped_and_15_kept():
    links = [
        Link(url=f"https://reuters.com/{n}#top", title="t", publisher="Reuters") for n in range(20)
    ]
    links += [Link(url="https://blog.example/post", title="t", publisher="Blog")]
    links += [Link(url="https://reuters.com/0", title="dupe", publisher="Reuters")]
    result = keep_allowed(links, ALLOW)
    assert len(result.kept) == 15
    assert result.kept[0].url == "https://reuters.com/0"
    assert [link.url for link in result.dropped] == ["https://blog.example/post"]
