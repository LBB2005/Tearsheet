"""The shared HTTP client (design item 13: test_http.py)."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, date, datetime

import httpx
import pytest
import respx

from tearsheet import config
from tearsheet.db import open_database
from tearsheet.http import (
    DailyCounter,
    DailyLimitReached,
    HttpClient,
    HTTPFailure,
    InvalidResponse,
    RateLimiter,
    SECBlocked,
    fred_value,
    redact_url,
    retry_after_seconds,
)

UA = "Tearsheet/0.0.1 test@example.com"
SEC_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json"
AV_URL = "https://www.alphavantage.co/query"


def run(coro):
    return asyncio.run(coro)


def stored_rows(database) -> int:
    return database.conn.execute("SELECT COUNT(*) FROM raw_objects").fetchone()[0]


# --- rate limits --------------------------------------------------------------------


def test_rate_limiter_spaces_calls(clock):
    limiter = RateLimiter.per_second(8, clock=clock, sleep=clock.sleep)
    times = []

    async def go():
        for _ in range(4):
            await limiter.wait()
            times.append(clock.now)

    run(go())
    assert times == pytest.approx([0.0, 0.125, 0.25, 0.375])


def test_rate_limiter_is_shared_by_parallel_callers(clock):
    limiter = RateLimiter.per_minute(5, clock=clock, sleep=clock.sleep)

    async def go():
        await asyncio.gather(*(limiter.wait() for _ in range(3)))

    run(go())
    assert clock.sleeps == pytest.approx([12.0, 12.0])


def test_rate_limiter_does_not_wait_after_a_pause(clock):
    limiter = RateLimiter(1.0, clock=clock, sleep=clock.sleep)

    async def go():
        await limiter.wait()
        clock.now += 5
        await limiter.wait()

    run(go())
    assert clock.sleeps == []


def test_alphavantage_daily_count_survives_a_restart(tmp_path):
    path = tmp_path / "tearsheet.sqlite"
    day = date(2026, 11, 3)
    first = open_database(path)
    counter = DailyCounter(config.Settings(first.conn), "alphavantage", 2, today=lambda: day)
    counter.take()
    counter.take()
    first.close()

    again = open_database(path)
    restarted = DailyCounter(config.Settings(again.conn), "alphavantage", 2, today=lambda: day)
    assert restarted.count() == 2
    with pytest.raises(DailyLimitReached):
        restarted.take()
    tomorrow = DailyCounter(
        config.Settings(again.conn), "alphavantage", 2, today=lambda: date(2026, 11, 4)
    )
    assert tomorrow.count() == 0
    again.close()


# --- retries --------------------------------------------------------------------------


@respx.mock
def test_retries_wait_2_4_8_then_fail(rawstore, clock):
    route = respx.get(SEC_URL).mock(return_value=httpx.Response(503))

    async def go():
        async with HttpClient(
            rawstore, "r1", sec_user_agent=UA, sleep=clock.sleep, clock=clock
        ) as http:
            with pytest.raises(HTTPFailure) as failure:
                await http.fetch("sec", SEC_URL, kind="company_facts")
            return http, failure.value

    http, failure = run(go())
    assert route.call_count == 4
    assert [s for s in clock.sleeps if s >= 1] == [2, 4, 8]
    assert failure.status == 503
    assert http.requests[("sec", "company_facts")] == 4


@respx.mock
def test_retry_after_is_honoured_and_capped(rawstore, clock):
    respx.get(SEC_URL).mock(
        side_effect=[
            httpx.Response(429, headers={"Retry-After": "5"}),
            httpx.Response(429, headers={"Retry-After": "120"}),
            httpx.Response(200, json={"facts": {}}),
        ]
    )

    async def go():
        async with HttpClient(
            rawstore, "r1", sec_user_agent=UA, sleep=clock.sleep, clock=clock
        ) as http:
            return await http.fetch("sec", SEC_URL, kind="company_facts")

    fetched = run(go())
    assert fetched.json() == {"facts": {}}
    assert [s for s in clock.sleeps if s >= 1] == [5, 60]


def test_retry_after_reads_an_http_date():
    now = datetime(2026, 11, 3, 12, 0, 0, tzinfo=UTC)
    assert retry_after_seconds("Tue, 03 Nov 2026 12:00:30 GMT", now) == 30
    assert retry_after_seconds(None) is None
    assert retry_after_seconds("soon") is None


# --- only valid responses are stored --------------------------------------------------------


@respx.mock
def test_sec_403_stops_the_run_and_stores_nothing(rawstore, database):
    respx.get(SEC_URL).mock(
        return_value=httpx.Response(403, text="Request Rate Threshold Exceeded")
    )

    async def go():
        async with HttpClient(rawstore, "r1", sec_user_agent=UA) as http:
            await http.fetch("sec", SEC_URL, kind="company_facts")

    with pytest.raises(SECBlocked) as blocked:
        run(go())
    assert "contact email" in str(blocked.value)
    assert stored_rows(database) == 0


@respx.mock
def test_html_error_page_with_status_200_is_not_data(rawstore, database):
    respx.get(SEC_URL).mock(
        return_value=httpx.Response(
            200, html="<!DOCTYPE html><html><body>Your request was blocked</body></html>"
        )
    )

    async def go():
        async with HttpClient(rawstore, "r1", sec_user_agent=UA) as http:
            await http.fetch("sec", SEC_URL, kind="company_facts")

    with pytest.raises(InvalidResponse):
        run(go())
    assert stored_rows(database) == 0


@respx.mock
def test_html_page_labelled_as_csv_is_not_data(rawstore, database):
    # What the iShares IVV address returned on 2026-11-03.
    url = "https://www.ishares.com/us/products/239726/x.ajax?fileType=csv"
    respx.get(url).mock(
        return_value=httpx.Response(
            200,
            content=b"<!DOCTYPE html>\n<html><head></head></html>",
            headers={"content-type": "text/csv;charset=UTF-8"},
        )
    )

    async def go():
        async with HttpClient(rawstore, "r1") as http:
            await http.fetch("ishares", url, kind="holdings", expect="csv")

    with pytest.raises(InvalidResponse, match="HTML page"):
        run(go())
    assert stored_rows(database) == 0


@respx.mock
def test_alphavantage_note_is_not_data(rawstore, database, settings):
    respx.get(AV_URL).mock(
        return_value=httpx.Response(
            200, json={"Note": "Thank you for using Alpha Vantage! Limit reached."}
        )
    )

    async def go():
        async with HttpClient(rawstore, "r1", settings=settings) as http:
            await http.fetch(
                "alphavantage",
                AV_URL,
                kind="overview",
                params={"function": "OVERVIEW", "apikey": "K"},
            )

    with pytest.raises(InvalidResponse, match="Alpha Vantage refused"):
        run(go())
    assert stored_rows(database) == 0


@respx.mock
def test_massive_error_status_is_not_data(rawstore, database):
    url = "https://api.massive.com/v2/aggs/ticker/AAPL/range/1/day/2025-01-01/2026-01-01"
    respx.get(url).mock(
        return_value=httpx.Response(200, json={"status": "NOT_AUTHORIZED", "message": "plan"})
    )

    async def go():
        async with HttpClient(rawstore, "r1", massive_key="K") as http:
            await http.fetch("massive", url, kind="daily_bars")

    with pytest.raises(InvalidResponse, match="Massive refused"):
        run(go())
    assert stored_rows(database) == 0


@respx.mock
def test_massive_key_goes_in_a_header(rawstore):
    url = "https://api.massive.com/v3/reference/splits"
    route = respx.get(url).mock(
        return_value=httpx.Response(200, json={"status": "OK", "results": []})
    )

    async def go():
        async with HttpClient(rawstore, "r1", massive_key="SECRETKEY") as http:
            await http.fetch("massive", url, kind="splits")

    run(go())
    request = route.calls.last.request
    assert request.headers["Authorization"] == "Bearer SECRETKEY"
    assert "SECRETKEY" not in str(request.url)


def test_sec_needs_the_contact_email(rawstore):
    async def go():
        async with HttpClient(rawstore, "r1") as http:
            await http.fetch("sec", SEC_URL, kind="company_facts")

    with pytest.raises(config.SettingMissing, match="sec_contact_email"):
        run(go())


# --- keys never appear in stored or logged addresses ------------------------------------------


def test_redact_url_removes_key_parameters_only():
    assert redact_url("https://x.test/q?function=OVERVIEW&apikey=SECRET&symbol=IBM") == (
        "https://x.test/q?function=OVERVIEW&symbol=IBM"
    )
    assert (
        redact_url("https://x.test/q?api_key=S&series_id=DGS10")
        == "https://x.test/q?series_id=DGS10"
    )
    plain = "https://data.sec.gov/submissions/CIK0000320193.json"
    assert redact_url(plain) == plain


@respx.mock
def test_keys_never_reach_the_store_or_the_log(rawstore, database, settings, caplog):
    respx.get(AV_URL).mock(return_value=httpx.Response(200, json={"Symbol": "IBM"}))
    caplog.set_level(logging.DEBUG)

    async def go():
        async with HttpClient(rawstore, "r1", settings=settings) as http:
            await http.fetch(
                "alphavantage",
                AV_URL,
                kind="overview",
                params={"function": "OVERVIEW", "apikey": "SECRET123"},
            )

    run(go())
    keys = [row[0] for row in database.conn.execute("SELECT request_key FROM fetch_log")]
    assert keys and all("SECRET123" not in key for key in keys)
    assert "SECRET123" not in caplog.text


@respx.mock
def test_failure_messages_never_show_keys(rawstore, settings):
    respx.get(AV_URL).mock(return_value=httpx.Response(500))

    async def go():
        async with HttpClient(
            rawstore, "r1", settings=settings, sleep=lambda s: asyncio.sleep(0)
        ) as http:
            await http.fetch(
                "alphavantage", AV_URL, kind="overview", params={"apikey": "SECRET123"}
            )

    with pytest.raises(HTTPFailure) as failure:
        run(go())
    assert "SECRET123" not in str(failure.value)


def test_fred_dot_means_no_value():
    assert fred_value(".") is None
    assert fred_value(" 4.25 ") == 4.25
