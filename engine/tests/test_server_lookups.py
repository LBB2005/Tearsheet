"""The look-up, chart and history methods, and the report's render options."""

from __future__ import annotations

from contextlib import asynccontextmanager

from tearsheet.data.prices import PriceStore, fetch_history_bars
from tests.test_charts import DAYS, seed
from tests.test_protocol import Harness, run

COMPANY_KEYS = {
    "cik",
    "ticker",
    "name",
    "report_id",
    "report_date",
    "reports",
    "price",
    "price_date",
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
    assert rows[0]["report_id"] == ready["report_id"]
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
    assert set(hit["result"][0]) == {"ticker", "name", "sector", "cik", "report_id", "report_date"}
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
    def __init__(self):
        self.urls: list[str] = []

    async def fetch(self, service, url, *, kind, expect="json", params=None):
        self.urls.append(url)
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


def test_fetch_history_method_downloads_company_and_spy(tmp_path):
    http = FakeHttp()

    @asynccontextmanager
    async def http_factory(run_id, conn, rawstore):
        yield http

    h = Harness(tmp_path)
    h.server.http_factory = http_factory
    seed(h.server.db.conn)
    with h.server.db.conn:
        h.server.db.conn.execute(
            "INSERT INTO step_outputs VALUES ('run-1', 'resolve', '{\"ticker\": \"ABC\"}')"
        )

    reply = run(h.call("fetch_history", {"report_id": "rep-1"}))
    assert len(http.urls) == 2 and any("/SPY/" in u for u in http.urls)
    assert reply["result"]["days"] >= 2
    assert reply["result"]["first_date"] <= "2000-01-05"
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
