"""analystdb through the engine (design item 20): get_report adds the Analyst ratings panel as
of the report's price date, get_analysts gives the side panel's view, and neither ever fails or
holds up a report because analystdb is off, slow or broken."""

from __future__ import annotations

import asyncio
import time

import httpx

from tearsheet.data.analystdb import AnalystDB
from tearsheet.protocol import ReportAnalysts
from tearsheet.report_numbers import run_price_date
from tests.test_analystdb import Service, saved
from tests.test_protocol import Harness, run
from tests.test_server_lookups import _one_report


def answers_for(ticker: str) -> dict:
    return {
        f"/consensus/{ticker}": saved("consensus_AMD"),
        f"/events/{ticker}": saved("events_AMD"),
        "/scorecards/firms": saved("scorecards_firms"),
        f"/crosscheck/{ticker}": saved("crosscheck_AMD"),
    }


def open_report(h: Harness, service: Service | None = None, **params) -> tuple[dict, dict]:
    if service is not None:
        h.server.analystdb = service.client()

    async def go():
        ready = await _one_report(h)
        got = await h.call("get_report", {"report_id": ready["report_id"], **params}, id_=2)
        return ready, got

    return run(go())


def test_the_report_shows_the_panel_as_of_its_price_date(tmp_path):
    h = Harness(tmp_path)
    service = Service(answers_for("T0"))
    ready, got = open_report(h, service, column="numbers")
    html = got["result"]["html"]
    assert 'id="analysts"' in html and "Analyst ratings" in html
    assert "General research, not personalised investment advice." in html
    (request,) = service.requests
    day = run_price_date(h.server.db.conn, ready["run_id"])
    assert request.url.path == "/consensus/T0"
    assert request.url.params["asof"] == day.isoformat()
    h.server.close()


def test_with_analystdb_off_the_report_opens_with_no_analyst_panel(tmp_path):
    # Tests are offline, so the engine's own client finds nothing listening: as on any Mac but
    # Liam's, where analystdb doesn't exist (launch-readiness S3).
    h = Harness(tmp_path)
    _, got = open_report(h)
    result = got["result"]
    assert "error" not in got and "<html" in result["html"]
    assert (
        'id="analysts"' not in result["html"] and "analystdb isn’t answering" not in result["html"]
    )
    assert "tearsheet://open/analysts" not in result["html"]
    assert result["bar"] is not None
    h.server.close()


def test_a_slow_analystdb_never_holds_the_report_up(tmp_path):
    async def slow(request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(5)
        return httpx.Response(200, json=saved("consensus_AMD"))

    h = Harness(tmp_path)
    h.server.analystdb = AnalystDB(transport=httpx.MockTransport(slow))

    async def go():
        ready = await _one_report(h)
        started = time.monotonic()
        got = await h.call("get_report", {"report_id": ready["report_id"]}, id_=2)
        return got, time.monotonic() - started

    got, took = run(go())
    assert took < 2
    assert 'id="analysts"' not in got["result"]["html"]
    h.server.close()


def test_a_broken_analyst_client_leaves_the_report_as_it_was(tmp_path):
    class Broken:
        async def panel(self, ticker, day):
            raise RuntimeError("a bug")

    h = Harness(tmp_path)
    h.server.analystdb = Broken()
    _, got = open_report(h)
    assert "<html" in got["result"]["html"] and 'id="analysts"' not in got["result"]["html"]
    h.server.close()


def test_get_analysts_gives_the_side_panels_view(tmp_path):
    h = Harness(tmp_path)
    h.server.analystdb = Service(answers_for("T0")).client()

    async def go():
        ready = await _one_report(h)
        found = await h.call("get_analysts", {"report_id": ready["report_id"]}, id_=2)
        missing = await h.call("get_analysts", {"report_id": "nope"}, id_=3)
        return ready, found, missing

    ready, found, missing = run(go())
    view = ReportAnalysts.model_validate(found["result"])
    assert view.report_id == ready["report_id"] and view.ticker == "T0"
    assert view.state == "ok" and view.n_firms == 38 and view.firms and len(view.firms) == 38
    assert view.changes and len(view.changes) == 20
    assert view.check and view.check.rows[0].measure == "target_mean"
    assert missing["error"]["data"]["code"] == "ENGINE_ERROR"
    h.server.close()


def test_get_analysts_with_analystdb_off_is_the_quiet_line_not_an_error(tmp_path):
    h = Harness(tmp_path)

    async def go():
        ready = await _one_report(h)
        return await h.call("get_analysts", {"report_id": ready["report_id"]}, id_=2)

    got = run(go())
    view = ReportAnalysts.model_validate(got["result"])
    assert view.state == "down" and view.note == "Analyst ratings: analystdb isn’t answering."
    assert view.firms is None
    h.server.close()
