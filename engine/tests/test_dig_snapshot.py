"""Dig deeper's snapshot (dig/snapshot.py): every part built, one failure kept to its part, a
failed part carried from the previous snapshot, and one write-once row."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, date, datetime
from types import SimpleNamespace

import pytest

from tearsheet import __version__
from tearsheet.charts import SPY_CIK
from tearsheet.config import Settings
from tearsheet.data import membership
from tearsheet.data.sec import Form4Trade
from tearsheet.dig import snapshot as snap
from tearsheet.dig.target import target
from tearsheet.http import HTTPFailure
from tearsheet.methodology import load
from tearsheet.protocol import DigSnapshot
from tests.test_analystdb import Service, saved
from tests.test_dig_news import FIXTURES
from tests.test_watchlist import AAPL, closes, report

NOW = datetime(2026, 11, 10, 1, 0, tzinfo=UTC)  # 8pm in New York on 9 Nov
ANSWERS = {
    "/consensus/AAPL": saved("consensus_AMD"),
    "/events/AAPL": saved("events_AMD"),
    "/scorecards/firms": saved("scorecards_firms"),
    "/crosscheck/AAPL": saved("crosscheck_AMD"),
}


class FakeHttp:
    def __init__(self, body: bytes | None):
        self.body = body
        self.calls = 0

    async def fetch(self, service, url, *, kind, expect="json", params=None):
        self.calls += 1
        if self.body is None:
            raise HTTPFailure(service, url, "HTTP 500", 500)
        return SimpleNamespace(body=self.body)


class FakeLive:
    def __init__(self, *, sec_fails=False):
        self.sec_fails = sec_fails

    async def form4_amounts(self, cik, *, today):
        if self.sec_fails:
            raise HTTPFailure("sec", "https://www.sec.gov/x", "HTTP 503", 503)
        return [Form4Trade("Ann", date(2026, 11, 2), "P", 100.0, 10.0, "A")]

    async def macro(self, day):
        return {"DGS10": ("percent", 0.0412, date(2026, 11, 6))}


def sources(database, rawstore, *, sec_fails=False, news=True):
    body = (FIXTURES / "massive_news_ok.json").read_bytes() if news else None
    return snap.Sources(
        http=FakeHttp(body),
        live=FakeLive(sec_fails=sec_fails),
        settings=Settings(database.conn),
        rawstore=rawstore,
        analystdb=Service(ANSWERS).client(),
        fred_key=True,
        massive_key=True,
    )


def seed_stock(conn):
    """AAPL with a report and a few closes, and SPY."""
    report(conn)
    closes(conn, AAPL, [("2026-11-03", 100.0), ("2026-11-06", 104.0), ("2026-11-09", 105.0)])
    closes(conn, SPY_CIK, [("2026-11-03", 500.0), ("2026-11-09", 510.0)])
    return conn


@pytest.fixture
def stock(database):
    return seed_stock(database.conn)


def build(conn, src, *, previous=None, when=NOW):
    holdings = membership.load_bundled()
    t = target(conn, AAPL, holdings)
    sid = snap.new_snapshot_id(AAPL, when)
    return asyncio.run(
        snap.build(
            conn,
            src.rawstore.raw_dir,
            holdings,
            load(),
            t,
            src,
            now=when,
            snapshot_id=sid,
            previous=previous,
        )
    )


def test_a_snapshot_is_built_validated_and_saved_once(stock, database, rawstore):
    built = build(stock, sources(database, rawstore))
    DigSnapshot.model_validate(built)
    assert built["snapshot_id"].startswith("dig-320193-20261110T010000Z-")
    assert built["close_date"] == "2026-11-09" and built["report_id"] == "rep-a"
    assert built["versions"] == {"dig_code": 1, "engine": __version__}
    assert built["header"]["ticker"] == "AAPL" and built["header"]["close"] == 105.0
    states = {p: built[p]["state"] for p in snap.PARTS}
    assert states == {
        "sector": "ok",
        "market": "ok",
        "rates": "ok",
        "peers": "off",  # this report's run stored no peer numbers
        "analysts": "ok",
        "insiders": "ok",
        "news": "ok",
    }
    assert built["news"]["since"] == "2026-11-04"
    assert built["analysts"]["view"]["report_id"] == "rep-a"
    assert all(built[p]["as_of"] == "2026-11-10T01:00:00+00:00" for p in snap.PARTS)
    assert [s["part"] for s in built["sources"]] == list(snap.PARTS)
    snap.save(stock, built)
    assert snap.newest(stock, AAPL) == built and snap.count(stock, AAPL) == 1
    with pytest.raises(Exception, match="write-once"):
        snap.save(stock, built)


def test_one_failing_part_does_not_stop_the_others(stock, database, rawstore):
    built = build(stock, sources(database, rawstore, sec_fails=True))
    assert (
        built["insiders"]["state"] == "down" and built["insiders"]["note"] == "SEC didn’t answer."
    )
    assert built["news"]["state"] == "ok" and built["rates"]["state"] == "ok"


def test_a_failed_part_comes_back_stale_from_the_previous_snapshot(stock, database, rawstore):
    first = build(stock, sources(database, rawstore))
    snap.save(stock, first)
    later = datetime(2026, 11, 11, 1, 0, tzinfo=UTC)
    second = build(
        stock, sources(database, rawstore, sec_fails=True, news=False), previous=first, when=later
    )
    insiders, news = second["insiders"], second["news"]
    assert insiders["state"] == "stale" and insiders["as_of"] == first["insiders"]["as_of"]
    assert (
        insiders["rows"] == first["insiders"]["rows"] and insiders["note"] == "SEC didn’t answer."
    )
    assert news["state"] == "stale" and news["items"] == first["news"]["items"]
    assert second["rates"]["as_of"] == "2026-11-11T01:00:00+00:00"
    DigSnapshot.model_validate(second)


def test_a_part_never_fetched_stays_down(stock, database, rawstore):
    built = build(stock, sources(database, rawstore, news=False))
    assert built["news"]["state"] == "down" and built["news"]["items"] == []


def test_the_inputs_hash_follows_the_fetched_bytes(database, rawstore):
    def stored(run_id, body):
        rawstore.put(
            body,
            "https://api.massive.com/v2/reference/news?ticker=T",
            "massive",
            "application/json",
            run_id,
        )

    stored("dig-a", b'{"a":1}')
    stored("dig-b", b'{"a":1}')
    stored("dig-c", b'{"a":2}')
    a, b, c = (
        snap.inputs_hash(database.conn, sid, report_id="r", run_id="u", close_date="2026-11-09")
        for sid in ("dig-a", "dig-b", "dig-c")
    )
    assert a == b != c
    assert a != snap.inputs_hash(
        database.conn, "dig-a", report_id="r2", run_id="u", close_date="2026-11-09"
    )


def test_snapshot_json_is_what_was_built(stock, database, rawstore):
    built = build(stock, sources(database, rawstore))
    snap.save(stock, built)
    row = stock.execute(
        "SELECT json, versions_json, report_id, run_id FROM dig_snapshots"
    ).fetchone()
    assert json.loads(row["json"]) == built
    assert json.loads(row["versions_json"]) == built["versions"]
    assert (row["report_id"], row["run_id"]) == ("rep-a", "run-a")


def test_news_links_open_only_for_the_shipped_allowlist(stock, database, rawstore):
    """The app's main process knows only the shipped list, so a site from the user's own
    allowlist.local.yaml shows as plain text rather than a link that won't open."""
    local = load()
    local.allowlist["news_outlets"] = [*local.allowlist["news_outlets"], "news.example.net"]
    holdings = membership.load_bundled()
    t = target(stock, AAPL, holdings)
    built = asyncio.run(
        snap.build(
            stock,
            rawstore.raw_dir,
            holdings,
            local,
            t,
            sources(database, rawstore),
            now=NOW,
            snapshot_id=snap.new_snapshot_id(AAPL, NOW),
        )
    )
    recall = next(i for i in built["news"]["items"] if "recall" in i["title"])
    assert recall["url"].startswith("https://news.example.net/") and recall["openable"] is False
