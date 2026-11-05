"""FRED series and the analyst consensus (design item 20)."""

from __future__ import annotations

import asyncio
from datetime import date

import httpx
import respx

from tearsheet.data.analyst import consensus
from tearsheet.data.fred import FRED_URL, fetch_series, value_on
from tearsheet.http import HttpClient

OBSERVATIONS = {
    "observations": [
        {"date": "2026-10-30", "value": "4.10"},
        {"date": "2026-11-02", "value": "."},
        {"date": "2026-11-03", "value": "4.21"},
        {"date": "2026-11-04", "value": "4.25"},
    ]
}


def test_value_on_uses_the_latest_value_on_or_before_the_date():
    series = [(date(2026, 10, 30), 4.10), (date(2026, 11, 3), 4.21), (date(2026, 11, 4), 4.25)]
    assert value_on(series, date(2026, 11, 3)) == (date(2026, 11, 3), 4.21)
    assert value_on(series, date(2026, 11, 2)) == (date(2026, 10, 30), 4.10)
    assert value_on(series, date(2026, 10, 1)) is None


def test_fetch_series_skips_missing_values_and_keeps_the_key_out_of_the_store(rawstore, database):
    async def go():
        with respx.mock:
            route = respx.get(url__startswith=FRED_URL).mock(
                return_value=httpx.Response(200, json=OBSERVATIONS)
            )
            async with HttpClient(rawstore, "r", sleep=lambda s: asyncio.sleep(0)) as http:
                series = await fetch_series(http, "DGS10", api_key="secret-key")
            return series, route

    series, route = asyncio.run(go())
    assert series == [
        (date(2026, 10, 30), 4.10),
        (date(2026, 11, 3), 4.21),
        (date(2026, 11, 4), 4.25),
    ]
    assert route.calls[0].request.url.params["api_key"] == "secret-key"
    keys = [r[0] for r in database.conn.execute("SELECT request_key FROM fetch_log")]
    assert keys and all("secret-key" not in k for k in keys)


def test_the_analyst_consensus_is_left_out_for_now():
    result = consensus("AAPL")
    assert result.available is False
    assert "not available" in result.note
