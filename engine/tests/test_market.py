"""Whole-market prices: the all-stocks summary, whole-market dividends and splits, and the
backfill (Technical Plan §5, the fast path)."""

from __future__ import annotations

import asyncio
import re
from datetime import date, datetime, timedelta

import httpx
import respx

from tearsheet.data import market
from tearsheet.data.prices import EASTERN, SPY_CIK, PriceStore, sessions_between
from tearsheet.http import HttpClient
from tearsheet.sources import LiveData

AAPL, MSFT, NVDA, JPM = 320193, 789019, 1045810, 19617
SUMMARY = re.compile(
    r"https://api\.massive\.com/v2/aggs/grouped/locale/us/market/stocks/(?P<day>[\d-]+)\?.*"
)
BARS = re.compile(
    r"https://api\.massive\.com/v2/aggs/ticker/(?P<ticker>[^/]+)/range/1/day/(?P<start>[\d-]+)/(?P<end>[\d-]+).*"
)
DIVIDENDS = re.compile(r"https://api\.massive\.com/v3/reference/dividends.*")
SPLITS = re.compile(r"https://api\.massive\.com/v3/reference/splits.*")


def ms(day: date, hour: int) -> int:
    return int(datetime(day.year, day.month, day.day, hour, tzinfo=EASTERN).timestamp() * 1000)


def summary_row(ticker: str, day: date, close: float) -> dict:
    # The summary stamps each bar at the close (16:00 New York); per-stock bars at midnight.
    return {"T": ticker, "c": close, "v": 1000.0, "t": ms(day, 16)}


def stock_bar(day: date, close: float) -> dict:
    return {"c": close, "v": 1000.0, "t": ms(day, 0)}


def store_closes(store: PriceStore, cik: int, days: list[date], close: float = 100.0) -> None:
    store.store_bars(cik, "", {"results": [stock_bar(d, close) for d in days]}, raw_hash="seed")


def client(rawstore) -> HttpClient:
    return HttpClient(rawstore, "run-test", sleep=lambda s: asyncio.sleep(0))


class Massive:
    """A scripted Massive: summary closes by day, per-stock bars, dividends, splits."""

    def __init__(self, mock: respx.MockRouter, summaries: dict[date, list[dict]], dividends=()):
        self.summaries = summaries
        self.dividends = list(dividends)
        self.calls: list[str] = []
        mock.get(url__regex=SUMMARY.pattern).mock(side_effect=self.summary)
        mock.get(url__regex=BARS.pattern).mock(side_effect=self.bars)
        mock.get(url__regex=DIVIDENDS.pattern).mock(side_effect=self.dividend_page)
        mock.get(url__regex=SPLITS.pattern).mock(side_effect=self.splits)

    def summary(self, request, **_):
        day = date.fromisoformat(SUMMARY.match(str(request.url))["day"])
        self.calls.append(f"summary {day}")
        return httpx.Response(200, json={"status": "OK", "results": self.summaries.get(day, [])})

    def bars(self, request, **_):
        m = BARS.match(str(request.url))
        self.calls.append(f"bars {m['ticker']} {m['start']}")
        start, end = date.fromisoformat(m["start"]), date.fromisoformat(m["end"])
        days = sessions_between(start, end)
        return httpx.Response(
            200, json={"status": "OK", "results": [stock_bar(d, 50.0) for d in days]}
        )

    def dividend_page(self, request, **_):
        self.calls.append("dividends" + (" (ticker)" if "ticker=" in str(request.url) else ""))
        return httpx.Response(200, json={"status": "OK", "results": self.dividends})

    def splits(self, request, **_):
        self.calls.append("splits")
        return httpx.Response(200, json={"status": "OK", "results": []})


# --- the extender ---------------------------------------------------------------------------


def test_extender_keeps_runs_gap_free(database):
    store = PriceStore(database.conn)
    store_closes(store, AAPL, [date(2026, 11, 2), date(2026, 11, 3)])
    ext = market.Extender(store, {"AAPL": (AAPL, "")})
    # 5 Nov doesn't follow 3 Nov (4 Nov is missing), so it waits.
    assert ext.apply(date(2026, 11, 5), [summary_row("AAPL", date(2026, 11, 5), 105)], "h") == 0
    assert ext.apply(date(2026, 11, 4), [summary_row("AAPL", date(2026, 11, 4), 104)], "h") == 1
    assert ext.apply(date(2026, 11, 5), [summary_row("AAPL", date(2026, 11, 5), 105)], "h") == 1
    assert [d for d, _ in store.closes(AAPL)] == sessions_between(
        date(2026, 11, 2), date(2026, 11, 5)
    )


def test_no_history_starts_only_on_the_first_session(database):
    store = PriceStore(database.conn)
    first = date(2026, 11, 2)
    wanted = {"AAPL": (AAPL, ""), "SPY": (SPY_CIK, "")}
    ext = market.Extender(store, wanted, first_session=first, no_start=frozenset({"SPY"}))
    later = date(2026, 11, 3)
    assert ext.apply(later, [summary_row("AAPL", later, 1)], "h") == 0
    rows = [summary_row("AAPL", first, 1), summary_row("SPY", first, 2)]
    assert ext.apply(first, rows, "h") == 1  # AAPL starts; SPY (two years, per stock) never does
    assert store.closes(SPY_CIK) == []


def test_a_row_dated_another_day_is_ignored(database):
    store = PriceStore(database.conn)
    store_closes(store, AAPL, [date(2026, 11, 4)])
    ext = market.Extender(store, {"AAPL": (AAPL, "")})
    assert ext.apply(date(2026, 11, 5), [summary_row("AAPL", date(2026, 11, 6), 1)], "h") == 0


def test_summary_is_cheaper_rule():
    assert market.summary_is_cheaper(1, 42)  # 1 summary + 1 dividends page < 84
    assert not market.summary_is_cheaper(5, 2)  # 5 + 3 pages > 4
    assert market.dividend_pages_for(1) == 1 and market.dividend_pages_for(21) == 13


# --- a run's top-up -------------------------------------------------------------------------

DAY_BEFORE, NEW_DAY = date(2026, 11, 4), date(2026, 11, 5)


def seeded(database) -> PriceStore:
    store = PriceStore(database.conn)
    for cik in (AAPL, MSFT, NVDA, SPY_CIK, JPM):
        store_closes(store, cik, sessions_between(date(2026, 10, 26), DAY_BEFORE))
    return store


def fill(database, rawstore, members, summaries, *, dividends=()):
    store = PriceStore(database.conn)

    async def go():
        with respx.mock(assert_all_called=False) as mock:
            massive = Massive(mock, summaries, dividends)
            async with client(rawstore) as http:
                data = LiveData(http, rawstore, database.conn, fred_key=None)
                await data.fill_prices(store, members, end=NEW_DAY)
            return massive

    return asyncio.run(go())


def test_top_up_uses_the_summary_when_cheaper(database, rawstore):
    store = seeded(database)
    members = {AAPL: "AAPL", MSFT: "MSFT", NVDA: "NVDA"}
    rows = [
        summary_row(t, NEW_DAY, c)
        for t, c in (("AAPL", 270), ("MSFT", 500), ("NVDA", 200), ("SPY", 700))
    ]
    dividends = [
        {"ticker": "MSFT", "ex_dividend_date": "2026-11-05", "cash_amount": 0.91},
        {"ticker": "ZZZZ", "ex_dividend_date": "2026-11-05", "cash_amount": 9.0},
    ]
    massive = fill(database, rawstore, members, {NEW_DAY: rows}, dividends=dividends)
    assert sorted(massive.calls) == ["dividends", "splits", f"summary {NEW_DAY}"]
    assert store.latest_close(AAPL) == (NEW_DAY, 270.0)
    assert store.latest_close(SPY_CIK) == (NEW_DAY, 700.0)
    assert store.dividends(MSFT) == {NEW_DAY: 0.91}


def test_a_stock_missing_from_the_summary_is_left_for_its_own_call(database, rawstore):
    store = seeded(database)
    members = {AAPL: "AAPL", MSFT: "MSFT", NVDA: "NVDA"}
    rows = [summary_row(t, NEW_DAY, 1.0) for t in ("AAPL", "MSFT", "SPY")]  # no NVDA
    massive = fill(database, rawstore, members, {NEW_DAY: rows})
    assert f"bars NVDA {NEW_DAY}" in massive.calls
    assert "dividends (ticker)" in massive.calls  # NVDA's own dividends call
    assert not any(c.startswith("bars AAPL") for c in massive.calls)
    assert store.latest_close(NVDA) == (NEW_DAY, 50.0)


def test_top_up_extends_other_sectors_too(database, rawstore):
    store = seeded(database)  # JPM has prices too, but isn't in this run's group
    rows = [summary_row(t, NEW_DAY, 2.0) for t in ("AAPL", "MSFT", "NVDA", "SPY", "JPM")]
    fill(database, rawstore, {AAPL: "AAPL", MSFT: "MSFT", NVDA: "NVDA"}, {NEW_DAY: rows})
    assert store.latest_close(JPM) == (NEW_DAY, 2.0)


def test_top_up_uses_per_stock_calls_when_cheaper(database, rawstore):
    store = PriceStore(database.conn)
    behind = date(2026, 10, 28)
    for cik in (AAPL, SPY_CIK):
        store_closes(store, cik, sessions_between(date(2026, 10, 20), behind))
    massive = fill(database, rawstore, {AAPL: "AAPL"}, {})
    assert not any(c.startswith("summary") for c in massive.calls)
    assert "bars AAPL 2026-10-29" in massive.calls and "bars SPY 2026-10-29" in massive.calls


def test_a_first_fill_stays_per_stock(database, rawstore):
    store = seeded(database)
    rows = [summary_row(t, NEW_DAY, 3.0) for t in ("AAPL", "SPY")]
    massive = fill(database, rawstore, {AAPL: "AAPL", 2488: "AMD"}, {NEW_DAY: rows})
    window = (NEW_DAY - timedelta(days=round(14 * 30.44))).isoformat()
    assert f"bars AMD {window}" in massive.calls
    assert store.latest_close(AAPL) == (NEW_DAY, 3.0)


def test_paged_answers_are_reused(database, rawstore):
    store = PriceStore(database.conn)

    async def go():
        with respx.mock(assert_all_called=False) as mock:
            massive = Massive(mock, {})
            async with client(rawstore) as http:
                for _ in range(2):
                    tally = market.Tally()
                    await market.store_actions(
                        http,
                        rawstore,
                        store,
                        {"AAPL": (AAPL, "")},
                        DAY_BEFORE,
                        NEW_DAY,
                        tally=tally,
                    )
            return massive, tally

    massive, second = asyncio.run(go())
    assert massive.calls == ["dividends", "splits"]  # the second pass read the stored pages
    assert (second.made, second.reused) == (0, 2)


# --- the backfill ---------------------------------------------------------------------------


class EveryDay(dict):
    """Summaries for any session: a close for each of `tickers`."""

    def __init__(self, tickers: list[str]):
        super().__init__()
        self.tickers = tickers

    def get(self, day, default=None):
        return [summary_row(t, day, 10.0 + i) for i, t in enumerate(self.tickers)]


def backfill(database, rawstore, wanted, *, end, months=1, gate=None):
    store = PriceStore(database.conn)

    async def go():
        with respx.mock(assert_all_called=False) as mock:
            massive = Massive(
                mock,
                EveryDay(["AAPL", "MSFT", "SPY"]),
                dividends=[
                    {"ticker": "MSFT", "ex_dividend_date": end.isoformat(), "cash_amount": 0.9}
                ],
            )
            async with client(rawstore) as http:
                result = await market.backfill(
                    http, rawstore, store, wanted, end=end, months=months, gate=gate
                )
            return massive, result

    return store, *asyncio.run(go())


def test_backfill_fills_new_stocks_from_the_window_start(database, rawstore):
    end = date(2026, 11, 6)
    wanted = {"AAPL": (AAPL, ""), "MSFT": (MSFT, ""), "NVDA": (NVDA, ""), "SPY": (SPY_CIK, "")}
    store, massive, result = backfill(database, rawstore, wanted, end=end)
    sessions = sessions_between(market.window_start(end, 1), end)
    assert [d for d, _ in store.closes(AAPL)] == sessions
    assert store.dividends(MSFT) == {end: 0.9}
    assert store.closes(NVDA) == []  # not in the summaries: left for its own calls
    assert store.closes(SPY_CIK) == []  # SPY needs two years, so it never starts here
    # Each month: its dividends and its splits, then a summary per session.
    months = len({(d.year, d.month) for d in sessions})
    assert result.calls == len(sessions) + 2 * months == len(massive.calls)
    assert (result.ready, result.wanted) == (2, 4)


def test_backfill_resumes_from_stored_pages(database, rawstore):
    end = date(2026, 11, 6)
    wanted = {"AAPL": (AAPL, ""), "MSFT": (MSFT, "")}
    backfill(database, rawstore, wanted, end=end)
    database.conn.execute("DELETE FROM prices_daily WHERE date > '2026-10-20'")  # cut short
    database.conn.commit()
    store, massive, result = backfill(database, rawstore, wanted, end=end)
    assert massive.calls == [] and result.calls == 0  # nothing asked of Massive again
    assert store.latest_close(AAPL)[0] == end


def test_backfill_waits_at_the_gate_and_rereads_after_a_pause(database, rawstore):
    end = date(2026, 11, 6)
    wanted = {"AAPL": (AAPL, "")}
    waits = []

    async def gate():
        waits.append(1)
        return len(waits) == 3  # one pause, as if a report had run

    _, massive, result = backfill(database, rawstore, wanted, end=end, gate=gate)
    assert len(waits) == result.calls == len(massive.calls)


def test_backfill_is_needed_until_it_covers_every_member(database):
    from tearsheet import config

    settings = config.Settings(database.conn)
    wanted = {"AAPL": (AAPL, ""), "SPY": (SPY_CIK, "")}
    assert market.backfill_needed(settings, wanted)
    market.record_backfill(settings, wanted, date(2026, 11, 6))
    assert not market.backfill_needed(settings, wanted)
    assert market.backfill_needed(settings, {**wanted, "MSFT": (MSFT, "")})  # a new member
    settings.set("prices_backfill", "off")
    assert not market.backfill_needed(settings, {**wanted, "MSFT": (MSFT, "")})


def test_catch_up_starts_from_the_earliest_latest_close(database):
    store = PriceStore(database.conn)
    store_closes(store, AAPL, [date(2026, 11, 4)])
    store_closes(store, MSFT, [date(2026, 11, 3)])
    wanted = {"AAPL": (AAPL, ""), "MSFT": (MSFT, ""), "NVDA": (NVDA, "")}
    have, days = market.catch_up(store, wanted, end=date(2026, 11, 6))
    assert sorted(have) == ["AAPL", "MSFT"]  # NVDA has nothing stored to extend
    assert days == [date(2026, 11, 4), date(2026, 11, 5), date(2026, 11, 6)]
    assert market.catch_up(store, wanted, end=date(2026, 11, 3))[1] == []  # all current


def test_catch_up_ignores_a_long_halted_stock(database):
    store = PriceStore(database.conn)
    store_closes(store, AAPL, [date(2026, 11, 5)])
    store_closes(store, MSFT, [date(2026, 11, 5)])
    store_closes(store, NVDA, [date(2026, 6, 1)])
    wanted = {"AAPL": (AAPL, ""), "MSFT": (MSFT, ""), "NVDA": (NVDA, "")}
    assert market.catch_up(store, wanted, end=date(2026, 11, 6))[1] == [date(2026, 11, 6)]
