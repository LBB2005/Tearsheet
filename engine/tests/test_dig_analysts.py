"""Dig deeper's analysts part: analystdb's view, its answers saved before they are used
(design doc §9, Liam 17 Nov), and our levels beside theirs."""

from __future__ import annotations

import asyncio
import json

import httpx

from tearsheet.data.analystdb import BASE_URL
from tearsheet.dig.analysts import analysts_part
from tearsheet.rawstore import RawStore
from tests.test_analystdb import REPORT_DAY, Service, saved


def rows(conn, run_id):
    return conn.execute(
        "SELECT provider, request_key, raw_hash FROM fetch_log WHERE run_id = ? ORDER BY request_key",
        (run_id,),
    ).fetchall()


def test_saved_view_stores_every_answer_it_read(database, tmp_path):
    store = RawStore(tmp_path, database.conn)
    client = Service().client()
    view = asyncio.run(client.saved_view("AMD", REPORT_DAY, store, "dig-1"))
    assert view == asyncio.run(Service().client().view("AMD", REPORT_DAY))
    stored = rows(database.conn, "dig-1")
    assert {r["provider"] for r in stored} == {"analystdb"}
    assert [r["request_key"] for r in stored] == [
        f"{BASE_URL}/consensus/AMD?asof=2026-11-06",
        f"{BASE_URL}/crosscheck/AMD?asof=2026-11-06",
        f"{BASE_URL}/events/AMD?limit=20&until=2026-11-06",
        f"{BASE_URL}/scorecards/firms?min_calls=20",
    ]
    consensus = json.loads(RawStore.read(tmp_path, stored[0]["raw_hash"]))
    assert consensus == saved("consensus_AMD")


def test_saved_view_stores_answers_kept_in_memory_too(database, tmp_path):
    store = RawStore(tmp_path, database.conn)
    client = Service().client()
    asyncio.run(client.view("AMD", REPORT_DAY))  # now kept in memory
    asyncio.run(client.saved_view("AMD", REPORT_DAY, store, "dig-2"))
    assert len(rows(database.conn, "dig-2")) == 4


def test_saved_view_when_analystdb_is_down_stores_nothing(database, tmp_path):
    store = RawStore(tmp_path, database.conn)
    down = Service({p: httpx.ConnectError("refused") for p in ("/consensus/AMD",)})
    view = asyncio.run(down.client().saved_view("AMD", REPORT_DAY, store, "dig-3"))
    assert view["state"] == "down"
    assert [r["request_key"] for r in rows(database.conn, "dig-3")] == []


LEVELS = {"bear": 80.0, "base": 110.0, "bull": 140.0, "buy_trigger": 90.0, "sell_trigger": None}


def test_the_part_puts_our_levels_beside_theirs():
    view = asyncio.run(Service().client().view("AMD", REPORT_DAY))
    part = analysts_part(view, LEVELS)
    assert part["state"] == "ok" and part["note"] is None and part["view"] == view
    assert part["ours"] == LEVELS


def test_no_coverage_is_off_and_down_is_down():
    missing = asyncio.run(Service({}).client().view("ZZZ", REPORT_DAY))
    assert analysts_part(missing, None)["state"] == "off"
    assert analysts_part(missing, None)["note"] == "analystdb has no ratings for this company."
    assert analysts_part(missing, None)["ours"] is None
    down = {**missing, "state": "down"}
    assert analysts_part(down, None)["state"] == "down"
    assert analysts_part(down, None)["note"] == "analystdb didn't answer."
