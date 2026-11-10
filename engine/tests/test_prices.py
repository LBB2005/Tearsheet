"""The price store (design item 19, Technical Plan §5)."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from math import log

import pytest

from tearsheet.data.prices import PriceStore, last_completed_session, ms_to_eastern_date

CIK = 320193


def bar(day: str, close: float, volume: float = 1000) -> dict:
    # Massive's daily bars start at midnight New York time, given in milliseconds since 1970.
    start = datetime.fromisoformat(day + "T05:00:00+00:00")
    return {
        "t": int(start.timestamp() * 1000),
        "c": close,
        "v": volume,
        "o": close,
        "h": close,
        "l": close,
    }


def store_with(database, closes: dict[str, float], *, share_class: str = "") -> PriceStore:
    store = PriceStore(database.conn)
    store.store_bars(
        CIK, share_class, {"results": [bar(d, c) for d, c in closes.items()]}, raw_hash="h1"
    )
    return store


def test_bar_dates_are_new_york_dates():
    assert ms_to_eastern_date(bar("2026-11-04", 1)["t"]) == date(2026, 11, 4)


def test_bars_are_stored_by_company_and_share_class(database):
    store = store_with(database, {"2026-11-02": 100.0, "2026-11-03": 101.0})
    store.store_bars(CIK, "B", {"results": [bar("2026-11-03", 7.0)]}, raw_hash="h2")
    assert store.closes(CIK, "") == [(date(2026, 11, 2), 100.0), (date(2026, 11, 3), 101.0)]
    assert store.closes(CIK, "B") == [(date(2026, 11, 3), 7.0)]


def test_total_return_reinvests_dividends_at_the_ex_date_close(database):
    store = store_with(database, {"2026-11-02": 100.0, "2026-11-03": 99.0, "2026-11-04": 110.0})
    store.store_dividends(
        CIK, "", {"results": [{"ex_dividend_date": "2026-11-03", "cash_amount": 2.0}]}
    )
    # Day 2: (99 + 2) / 100 = 1.01. Day 3: 110 / 99.
    expected = 1.01 * (110 / 99) - 1
    assert store.total_return(CIK, "", date(2026, 11, 2), date(2026, 11, 4)) == pytest.approx(
        expected
    )


def test_a_split_is_not_a_price_drop(database):
    store = store_with(database, {"2026-11-02": 400.0, "2026-11-03": 101.0})
    store.store_splits(
        {
            "results": [
                {"ticker": "AAPL", "execution_date": "2026-11-03", "split_from": 1, "split_to": 4}
            ]
        },
        {"AAPL": (CIK, "")},
    )
    assert store.total_return(CIK, "", date(2026, 11, 2), date(2026, 11, 3)) == pytest.approx(0.01)
    assert store.split_factor(CIK, after=date(2026, 10, 1), up_to=date(2026, 11, 4)) == 4.0
    assert store.unexplained_moves(CIK, "") == []


def test_a_big_move_without_a_split_is_flagged(database):
    store = store_with(database, {"2026-11-02": 100.0, "2026-11-03": 45.0})
    assert store.unexplained_moves(CIK, "") == [date(2026, 11, 3)]


def test_daily_log_returns(database):
    store = store_with(database, {"2026-11-02": 100.0, "2026-11-03": 110.0, "2026-11-04": 99.0})
    assert store.log_returns(CIK, "") == pytest.approx([log(1.1), log(0.9)])


@pytest.mark.parametrize(
    ("now", "expected"),
    [
        # Friday evening, after the close is ready: Friday.
        ("2026-11-06T21:00:00-05:00", date(2026, 11, 6)),
        # Friday afternoon, before the close is ready: Thursday.
        ("2026-11-06T15:00:00-05:00", date(2026, 11, 5)),
        # Sunday: Friday.
        ("2026-11-08T12:00:00-05:00", date(2026, 11, 6)),
        # Thanksgiving (Thursday 26 Nov 2026) evening: Wednesday.
        ("2026-11-26T21:00:00-05:00", date(2026, 11, 25)),
    ],
)
def test_last_completed_session(now, expected):
    assert last_completed_session(datetime.fromisoformat(now)) == expected


def test_prices_are_current_up_to_one_session_behind(database):
    store = store_with(database, {"2026-11-04": 100.0, "2026-11-05": 101.0})
    friday_evening = datetime.fromisoformat("2026-11-06T21:00:00-05:00")
    assert not store.is_stale(CIK, "", friday_evening)  # Thursday's close: one session behind
    monday_evening = friday_evening + timedelta(days=3)
    assert store.is_stale(CIK, "", monday_evening)
    assert store.is_stale(999, "", friday_evening)  # no prices at all


def test_staleness_over_a_holiday(database):
    # Thanksgiving: Wednesday's close is still current on Friday morning.
    store = store_with(database, {"2026-11-25": 100.0})
    friday_morning = datetime(2026, 11, 27, 14, tzinfo=UTC)
    assert not store.is_stale(CIK, "", friday_morning)


def test_two_dividends_on_one_ex_date_are_added(database):
    # A regular and a special dividend can share an ex-date; the table keeps one row a day.
    store = PriceStore(database.conn)
    store.store_dividends(
        CIK,
        "",
        {
            "results": [
                {"ex_dividend_date": "2026-11-03", "cash_amount": 0.5},
                {"ex_dividend_date": "2026-11-03", "cash_amount": 2.0},
            ]
        },
    )
    store.store_market_dividends(
        {
            "results": [
                {"ticker": "X", "ex_dividend_date": "2026-10-01", "cash_amount": 0.25},
                {"ticker": "X", "ex_dividend_date": "2026-10-01", "cash_amount": 1.0},
            ]
        },
        {"X": (CIK, "")},
    )
    assert store.dividends(CIK) == {date(2026, 11, 3): 2.5, date(2026, 10, 1): 1.25}


def test_a_failed_dividends_call_stores_no_bars(database, rawstore):
    # Otherwise the next run starts after those bars and never fetches the dividends again.
    import asyncio

    import httpx

    from tearsheet.data.prices import fetch_company, needed_start
    from tearsheet.http import HttpClient, HTTPFailure

    def answer(request: httpx.Request) -> httpx.Response:
        if "/aggs/" in request.url.path:
            return httpx.Response(200, json={"status": "OK", "results": [bar("2026-11-03", 10.0)]})
        return httpx.Response(503, text="busy")

    async def go() -> None:
        async with HttpClient(
            rawstore,
            "run-test",
            massive_key="k",
            transport=httpx.MockTransport(answer),
            sleep=lambda s: asyncio.sleep(0),
        ) as http:
            await fetch_company(
                http, store, CIK, "", "AAPL", start=date(2026, 10, 1), end=date(2026, 11, 3)
            )

    store = PriceStore(database.conn)
    with pytest.raises(HTTPFailure):
        asyncio.run(go())
    assert store.latest_close(CIK) is None
    assert needed_start(store, CIK, "", date(2026, 11, 3), months=14) is not None


def test_full_history_stops_at_the_last_completed_session(database, rawstore, monkeypatch):
    # A bar for today before the close would be kept as that day's close for good.
    import asyncio

    from tearsheet.data import prices

    asked: list[str] = []

    class Http:
        async def fetch(self, provider, url, **_):
            asked.append(url)

            class Answer:
                raw_hash = "h"

                def json(self):
                    return {"results": []}

            return Answer()

    asyncio.run(prices.fetch_history_bars(Http(), PriceStore(database.conn), CIK, "", "AAPL"))
    end = asked[0].rsplit("/", 1)[-1]
    assert end == prices.last_completed_session(datetime.now(UTC)).isoformat()
