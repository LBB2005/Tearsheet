"""The look-up, chart and history methods, and the report's render options."""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import date

import pytest

from tearsheet import config
from tearsheet.data.prices import PriceStore, fetch_history_bars
from tearsheet.http import DailyLimitReached, HTTPFailure, InvalidResponse
from tearsheet.protocol import CompanyRow
from tests.test_charts import DAYS, seed
from tests.test_protocol import Harness, run

COMPANY_KEYS = {
    "cik",
    "ticker",
    "name",
    "report_id",
    "report_date",
    "created_at",
    "reports",
    "report_ids",
    "price",
    "price_date",
    "since_report",
    "rating",
    "official",
    "sector",
    "pinned",
}


async def _one_report(h: Harness) -> dict:
    await h.server.start()
    await h.call("run_report", {"query": "T0"})
    await h.finish()
    return h.notes("report_ready")[0]


def test_list_companies_method(tmp_path):
    h = Harness(tmp_path)

    async def go():
        ready = await _one_report(h)
        return ready, await h.call("list_companies", id_=2)

    ready, reply = run(go())
    rows = reply["result"]
    assert rows and set(rows[0]) == COMPANY_KEYS
    CompanyRow.model_validate(rows[0])
    assert rows[0]["report_id"] == ready["report_id"]
    assert rows[0]["report_ids"] == [ready["report_id"]] and rows[0]["pinned"] is False
    h.server.close()


def test_search_companies_method(tmp_path):
    h = Harness(tmp_path)

    async def go():
        hit = await h.call("search_companies", {"query": "nvda"})
        empty = await h.call("search_companies", {"query": ""}, id_=2)
        limited = await h.call("search_companies", {"query": "a", "limit": 2}, id_=3)
        return hit, empty, limited

    hit, empty, limited = run(go())
    assert hit["result"][0]["ticker"] == "NVDA"
    assert set(hit["result"][0]) == {
        "ticker",
        "name",
        "sector",
        "cik",
        "report_id",
        "report_date",
        "peer_rule",
    }
    assert "40 largest other S&P 500 Information Technology" in hit["result"][0]["peer_rule"]
    assert empty["result"] == []
    assert 1 <= len(limited["result"]) <= 2
    h.server.close()


def test_get_report_accepts_view_and_column(tmp_path):
    h = Harness(tmp_path)

    async def go():
        ready = await _one_report(h)
        rid = ready["report_id"]
        default = await h.call("get_report", {"report_id": rid}, id_=2)
        full = await h.call(
            "get_report", {"report_id": rid, "view": "full", "column": "numbers"}, id_=3
        )
        bad_view = await h.call("get_report", {"report_id": rid, "view": "huge"}, id_=4)
        bad_col = await h.call("get_report", {"report_id": rid, "column": "left"}, id_=5)
        return default, full, bad_view, bad_col

    default, full, bad_view, bad_col = run(go())
    assert 'data-view="summary"' in default["result"]["html"]
    assert 'data-view="full"' in full["result"]["html"]
    assert bad_view["error"]["code"] == -32602
    assert bad_col["error"]["code"] == -32602
    h.server.close()


def test_get_report_gives_the_toolbar_facts_and_the_narrow_tiles(tmp_path):
    h = Harness(tmp_path)

    async def go():
        ready = await _one_report(h)
        rid = ready["report_id"]
        narrow = await h.call(
            "get_report", {"report_id": rid, "column": "text", "narrow": True}, id_=2
        )
        wide = await h.call("get_report", {"report_id": rid, "column": "text"}, id_=3)
        bad = await h.call("get_report", {"report_id": rid, "narrow": "yes please"}, id_=4)
        return narrow, wide, bad

    narrow, wide, bad = run(go())
    got = narrow["result"]
    assert 'id="keys"' in got["html"] and 'id="keys"' not in wide["result"]["html"]
    # The toolbar's title and subtitle: the company, and how many claims passed the checks.
    kept = h.server.db.conn.execute(
        "SELECT COUNT(*) FROM claims WHERE report_id = ? AND removed = 0", (got["report_id"],)
    ).fetchone()[0]
    assert got["kept"] == kept and kept > 0
    cik = h.server.db.conn.execute(
        "SELECT u.cik FROM reports r JOIN runs u ON u.run_id = r.run_id WHERE r.report_id = ?",
        (got["report_id"],),
    ).fetchone()[0]
    assert got["cik"] == cik
    assert got["name"]
    # The top bar's numbers: the last close and the report's call, in the protocol's shape.
    from tearsheet.protocol import ReportBar

    bar = ReportBar.model_validate(got["bar"])
    last = h.server.db.conn.execute(
        "SELECT date, close_unadjusted FROM prices_daily WHERE cik = ? ORDER BY date DESC LIMIT 1",
        (cik,),
    ).fetchone()
    assert (bar.close_date, bar.close) == (last[0], last[1])
    assert bar.rating in {"Buy", "Hold", "Sell"} and bar.range is not None
    # The Key numbers under the chart: four groups, their price the top bar's close.
    from tearsheet.protocol import KeyNumbers

    keys = KeyNumbers.model_validate(got["key_numbers"])
    assert [g.name for g in keys.groups] == [
        "Price and trading",
        "Size and value",
        "Profit and cash",
        "Debt and safety",
    ]
    assert keys.groups[0].rows[0].text == f"${bar.close:,.2f}"
    assert keys.close_date == bar.close_date
    assert bad["error"]["code"] == -32602
    h.server.close()


def test_get_chart_method(tmp_path):
    h = Harness(tmp_path)
    seed(h.server.db.conn)

    reply = run(h.call("get_chart", {"report_id": "rep-1"}))
    result = reply["result"]
    assert result["dates"] == DAYS and result["first_date"] == DAYS[0]
    assert result["range"] == {"bear": 5.0, "base": 11.0, "bull": 20.0}
    missing = run(h.call("get_chart", {"report_id": "nope"}, id_=2))
    assert missing["error"]["data"]["code"] == "ENGINE_ERROR"
    h.server.close()


def test_get_report_numbers_method(tmp_path):
    from tearsheet.protocol import ReportNumbers

    h = Harness(tmp_path)

    async def go():
        ready = await _one_report(h)
        found = await h.call("get_report_numbers", {"report_id": ready["report_id"]}, id_=2)
        missing = await h.call("get_report_numbers", {"report_id": "nope"}, id_=3)
        return ready, found, missing

    ready, found, missing = run(go())
    numbers = ReportNumbers.model_validate(found["result"])
    assert numbers.report_id == ready["report_id"] and numbers.ticker == "T0"
    assert numbers.factors and numbers.methods and numbers.returns
    assert [t.key for t in numbers.tables] == ["score", "valuation"]
    kept = h.server.db.conn.execute(
        "SELECT COUNT(*) FROM claims WHERE report_id = ? AND removed = 0", (numbers.report_id,)
    ).fetchone()[0]
    assert numbers.claims is not None and numbers.claims.slices[0].count == kept
    assert missing["error"]["data"]["code"] == "ENGINE_ERROR"
    h.server.close()


def test_fetch_history_refuses_while_running(tmp_path):
    h = Harness(tmp_path, delay_s=0.05)
    seed(h.server.db.conn)

    async def go():
        await h.server.start()
        await h.call("run_report", {"query": "T0"})
        count = "SELECT COUNT(*) FROM prices_daily WHERE cik IN (1, 884394)"
        before = h.server.db.conn.execute(count).fetchone()[0]
        refused = await h.call("fetch_history", {"report_id": "rep-1"}, id_=2)
        after = h.server.db.conn.execute(count).fetchone()[0]
        await h.finish()
        assert before == after  # the refused call stored nothing
        return refused

    refused = run(go())
    assert refused["error"]["data"]["code"] == "RUN_IN_PROGRESS"
    h.server.close()


class _Fetched:
    raw_hash = "h"

    def __init__(self, data):
        self._data = data

    def json(self):
        return self._data


class FakeHttp:
    """Massive's daily bars, splits and dividends, with one page of each (two for ABC's
    dividends, to check the paging)."""

    def __init__(self):
        self.urls: list[str] = []
        self.calls: list[tuple[str, dict | None]] = []
        # Kinds of call that fail once, as Massive being down mid-download would.
        self.fail: set[str] = set()
        # A failure every call raises, as the real client would.
        self.raises: Exception | None = None

    async def fetch(self, service, url, *, kind, expect="json", params=None):
        self.urls.append(url)
        self.calls.append((kind, params))
        if self.raises is not None:
            raise self.raises
        if kind in self.fail:
            self.fail.discard(kind)
            raise RuntimeError("Massive didn't answer.")
        ticker = (params or {}).get("ticker") or ("SPY" if "/SPY/" in url else "ABC")
        if kind == "splits":
            return _Fetched(
                {
                    "results": [
                        {
                            "ticker": ticker,
                            "execution_date": "2000-01-05",
                            "split_from": 1,
                            "split_to": 2,
                        }
                    ]
                }
            )
        if kind == "dividends":
            if url.endswith("page2"):
                return _Fetched(
                    {"results": [{"ex_dividend_date": "2000-01-06", "cash_amount": 0.2}]}
                )
            more = (
                {"next_url": "https://api.massive.com/v3/reference/dividends?page2"}
                if ticker == "ABC"
                else {}
            )
            return _Fetched(
                {"results": [{"ex_dividend_date": "2000-01-04", "cash_amount": 0.1}], **more}
            )
        ms = 946_857_600_000 if "SPY" in url else 946_944_000_000  # 2000-01-03 / 2000-01-04
        return _Fetched(
            {"results": [{"t": ms, "c": 5.0, "v": 10}, {"t": ms + 86_400_000, "c": 6.0}]}
        )


def test_fetch_history_bars_stores_rows(database):
    http = FakeHttp()
    n = run(fetch_history_bars(http, PriceStore(database.conn), 7, "", "ABC"))
    assert n == 2
    assert "/range/1/day/2000-01-01/" in http.urls[0]
    assert (
        database.conn.execute("SELECT COUNT(*) FROM prices_daily WHERE cik = 7").fetchone()[0] == 2
    )


def _history_harness(tmp_path, http, *, key: str | None = "test-massive-key"):
    @asynccontextmanager
    async def http_factory(run_id, conn, rawstore):
        yield http

    if key:
        config.set_key("massive", key)
    h = Harness(tmp_path)
    h.server.http_factory = http_factory
    seed(h.server.db.conn)
    with h.server.db.conn:
        h.server.db.conn.execute(
            "INSERT INTO step_outputs VALUES ('run-1', 'resolve', '{\"ticker\": \"ABC\"}')"
        )
    return h


def test_fetch_history_method_downloads_company_and_spy(tmp_path):
    http = FakeHttp()
    h = _history_harness(tmp_path, http)

    reply = run(h.call("fetch_history", {"report_id": "rep-1"}))
    # The company's splits and dividends (two pages), SPY's splits, dividends and bars, and
    # the company's bars last: seven calls, all through the shared Massive limiter. The
    # company's long bars are what tell the app the history is there, so they land last.
    kinds = [k for k, _ in http.calls]
    assert kinds == [
        "splits",
        "dividends",
        "dividends",
        "splits",
        "dividends",
        "daily_bars",
        "daily_bars",
    ]
    assert "/SPY/" in http.urls[5] and "/ABC/" in http.urls[6]
    assert http.calls[0][1] == {
        "ticker": "ABC",
        "execution_date.gte": "2000-01-01",
        "limit": "1000",
    }
    assert http.calls[1][1] == {
        "ticker": "ABC",
        "ex_dividend_date.gte": "2000-01-01",
        "limit": "1000",
    }
    assert reply["result"]["days"] >= 2
    assert reply["result"]["first_date"] <= "2000-01-05"
    store = PriceStore(h.server.db.conn)
    assert store.splits(1) == {date(2000, 1, 5): 2.0}
    assert store.dividends(1) == {date(2000, 1, 4): 0.1, date(2000, 1, 6): 0.2}
    assert store.splits(884394) == {date(2000, 1, 5): 2.0}
    assert store.dividends(884394) == {date(2000, 1, 4): 0.1}

    # A second download: SPY's long history and its dividends are stored now, so only the
    # company's calls are made.
    http.calls.clear()
    run(h.call("fetch_history", {"report_id": "rep-1"}, id_=2))
    assert [k for k, _ in http.calls] == ["splits", "dividends", "dividends", "daily_bars"]
    h.server.close()


def test_fetch_history_without_a_massive_key_asks_for_one(tmp_path):
    http = FakeHttp()
    h = _history_harness(tmp_path, http, key=None)

    reply = run(h.call("fetch_history", {"report_id": "rep-1"}))
    assert reply["error"]["data"]["code"] == "ENGINE_ERROR"
    assert reply["error"]["message"] == (
        "It needs a Massive key. Add yours in Settings, then try again."
    )
    assert http.calls == []  # nothing was asked of Massive
    h.server.close()


BARS_URL = "https://api.massive.com/v2/aggs/ticker/ABC/range/1/day/2000-01-01/2026-11-06"


@pytest.mark.parametrize(
    ("failure", "line"),
    [
        (
            HTTPFailure("massive", BARS_URL, "HTTP 401", 401),
            "Massive turned down your key. Check it in Settings, then try again.",
        ),
        (
            HTTPFailure("massive", BARS_URL, "HTTP 403", 403),
            "This much history is beyond your Massive plan.",
        ),
        (
            HTTPFailure("massive", BARS_URL, "HTTP 429 after 4 tries", 429),
            "Massive is limiting how often Tearsheet can ask. Try again in a minute.",
        ),
        (
            HTTPFailure("massive", BARS_URL, "HTTP 503 after 4 tries", 503),
            "Massive is having trouble right now. Try again later.",
        ),
        (
            HTTPFailure("massive", BARS_URL, "no response after 4 tries (ConnectError)"),
            "No answer came from Massive. Check your internet connection, then try again.",
        ),
        (
            DailyLimitReached("massive", "", "the free plan allows 5 calls a day"),
            "The daily Massive allowance is used up. It resets at midnight US Eastern time.",
        ),
        (
            InvalidResponse("massive", BARS_URL, "not JSON", 200),
            "Massive sent an unreadable answer. Try again later.",
        ),
        (
            HTTPFailure("massive", BARS_URL, "HTTP 404", 404),
            "Massive sent an unreadable answer. Try again later.",
        ),
    ],
)
def test_a_failed_history_download_says_why_in_plain_words(tmp_path, caplog, failure, line):
    http = FakeHttp()
    http.raises = failure
    h = _history_harness(tmp_path, http)

    reply = run(h.call("fetch_history", {"report_id": "rep-1"}))
    assert reply["error"]["data"]["code"] == "ENGINE_ERROR"
    assert reply["error"]["message"] == line
    # One line in the engine's log, with no traceback.
    assert not [r for r in caplog.records if r.exc_info]
    assert any("history" in r.getMessage() for r in caplog.records)
    h.server.close()


def test_long_history_start_is_five_years_back_within_a_month():
    from tearsheet.data.prices import long_history_start

    assert long_history_start(date(2026, 11, 6)) == date(2021, 12, 7)
    assert long_history_start(date(2028, 2, 29)) == date(2023, 3, 31)


def test_a_download_that_fails_midway_stores_no_long_bars_and_retries(tmp_path):
    http = FakeHttp()
    h = _history_harness(tmp_path, http)
    long_bars = "SELECT COUNT(*) FROM prices_daily WHERE cik IN (1, 884394) AND date < '2001-01-01'"

    for kind in ("splits", "dividends"):
        http.fail = {kind}
        failed = run(h.call("fetch_history", {"report_id": "rep-1"}))
        assert "error" in failed
        # No long bars, so the chart still asks for the history and a later 5Y tries again.
        assert h.server.db.conn.execute(long_bars).fetchone()[0] == 0

    done = run(h.call("fetch_history", {"report_id": "rep-1"}, id_=2))
    assert done["result"]["first_date"] <= "2000-01-05"
    store = PriceStore(h.server.db.conn)
    assert store.splits(1) == {date(2000, 1, 5): 2.0}
    assert store.dividends(1) == {date(2000, 1, 4): 0.1, date(2000, 1, 6): 0.2}
    assert h.server.db.conn.execute(long_bars).fetchone()[0] == 4
    h.server.close()


def test_server_clients_share_one_massive_limiter(tmp_path, database, rawstore):
    from tearsheet.http import HttpClient

    h = Harness(tmp_path)
    limiter = h.server.massive_limiter(h.server.db.conn)
    assert h.server.massive_limiter(h.server.db.conn) is limiter

    async def go():
        async with (
            HttpClient(rawstore, "a", massive_limiter=limiter) as one,
            HttpClient(rawstore, "b", massive_limiter=limiter) as two,
        ):
            return one.services["massive"].limiter, two.services["massive"].limiter

    first, second = run(go())
    assert first is second is limiter
    h.server.close()


# --- the company a run resolved (the run view's title and the sidebar's "writing…" row) -----


def test_run_report_returns_the_company_the_engine_resolved(tmp_path):
    from tearsheet.protocol import RunStarted

    h = Harness(tmp_path)

    async def go():
        await h.server.start()
        by_ticker = await h.call("run_report", {"query": "t0"})
        await h.finish()
        by_name = await h.call("run_report", {"query": "Company 1"}, id_=2)
        await h.finish()
        return by_ticker, by_name

    by_ticker, by_name = run(go())
    first = by_ticker["result"]
    assert first["run_id"].startswith("run-")
    assert (first["ticker"], first["name"]) == ("T0", "Company 0")
    assert (by_name["result"]["ticker"], by_name["result"]["name"]) == ("T1", "Company 1")
    RunStarted.model_validate(first)
    h.server.close()


def test_resume_returns_the_runs_company_too(tmp_path, monkeypatch):
    from tearsheet.ai.client import AIUsageLimit
    from tearsheet.data import membership
    from tests.test_pipeline import clean_ai
    from tests.test_replay import LoggedData

    monkeypatch.setattr(membership, "MIN_ROWS", 1)

    def limited(request):
        if request.task == "narrate":
            return AIUsageLimit("You've hit your limit. Resets 3am")
        return clean_ai(request)

    h = Harness(tmp_path, ai_default=limited)

    @asynccontextmanager
    async def logged(run_id, conn, rawstore):
        yield LoggedData(rawstore, run_id)

    h.server.data_factory = logged

    async def go():
        await h.server.start()
        started = await h.call("run_report", {"query": "T0"})
        await h.finish()
        h.ai_default = clean_ai
        resumed = await h.call("resume", {"run_id": started["result"]["run_id"]}, id_=2)
        await h.finish()
        return started, resumed

    started, resumed = run(go())
    assert h.notes("run_failed")[0]["code"] == "USAGE_LIMIT"
    assert resumed["result"] == {**started["result"]}
    assert resumed["result"]["ticker"] == "T0"
    h.server.close()


def test_a_runs_company_prefers_the_look_up_lists_name(database):
    from tearsheet.companies import run_company
    from tests.test_companies import add_report

    conn = database.conn
    add_report(conn, "run-n", "rep-n", 1045810, "NVDA", "2026-11-05T19:00:00+00:00")
    with conn:
        conn.execute("UPDATE companies SET name = 'NVIDIA CORP' WHERE cik = 1045810")
    add_report(conn, "run-z", "rep-z", 1000, "T0", "2026-11-05T19:00:00+00:00")

    assert run_company(conn, "run-n") == {"ticker": "NVDA", "name": "Nvidia"}
    # Outside the bundled list, the name SEC gave the company.
    assert run_company(conn, "run-z") == {"ticker": "T0", "name": "T0 Inc."}
    # A run that stopped before step 1 finished has no company yet.
    assert run_company(conn, "run-none") == {"ticker": None, "name": None}


def test_get_report_opens_even_when_its_numbers_cannot_be_read(tmp_path, monkeypatch):
    import tearsheet.report_numbers as report_numbers

    h = Harness(tmp_path)

    def broken(*args, **kwargs):
        raise RuntimeError("an odd stored row")

    async def go():
        ready = await _one_report(h)
        monkeypatch.setattr(report_numbers, "numbers_for", broken)
        return await h.call("get_report", {"report_id": ready["report_id"]}, id_=2)

    got = run(go())
    assert "<html" in got["result"]["html"] and got["result"]["kept"] is None
    assert got["result"]["bar"] is None and got["result"]["key_numbers"] is None
    h.server.close()


def test_get_report_counts_the_claims_of_that_report(tmp_path):
    """A stopped run's partial report keeps its own count when the resumed report is newer."""
    h = Harness(tmp_path)

    async def go():
        ready = await _one_report(h)
        conn = h.server.db.conn
        run_id = conn.execute(
            "SELECT run_id FROM reports WHERE report_id = ?", (ready["report_id"],)
        ).fetchone()[0]
        with conn:
            conn.execute(
                "INSERT INTO reports (report_id, run_id, created_at, narrative_complete)"
                " VALUES ('rep-newer', ?, '9999-01-01T00:00:00+00:00', 1)",
                (run_id,),
            )
            conn.execute(
                "INSERT INTO claims VALUES ('n1', 'rep-newer', 'rating', 's', 'neutral',"
                " '[]', '[]', 0)"
            )
        return ready, await h.call("get_report", {"report_id": ready["report_id"]}, id_=2)

    ready, got = run(go())
    kept = h.server.db.conn.execute(
        "SELECT COUNT(*) FROM claims WHERE report_id = ? AND removed = 0", (ready["report_id"],)
    ).fetchone()[0]
    assert kept > 1 and got["result"]["kept"] == kept
    h.server.close()
