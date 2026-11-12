"""The watchlist's methods and its `watch_changed` note, through the server (protocol.py)."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from tearsheet import config, watchlist
from tearsheet.batch import Entry
from tearsheet.data import market
from tearsheet.data.prices import SPY_CIK
from tearsheet.protocol import (
    INVALID_PARAMS,
    Ok,
    SettingsResult,
    WatchAdd,
    WatchChanged,
    WatchCounts,
    WatchDeleted,
    WatchEvent,
    WatchList,
    WatchNoteSaved,
    WatchPage,
    WatchPrices,
    WatchRemoved,
)
from tests.test_companies import add_close
from tests.test_pipeline import NOW  # the harness's clock: 9pm in New York on 4 Nov
from tests.test_protocol import Harness, run
from tests.test_watchlist import AAPL, NVDA, report


def watched_with_a_close(h: Harness) -> None:
    """AAPL watched against a report priced at the 3 Nov close, its alerts at their start."""
    conn = h.server.db.conn
    report(conn)
    add_close(conn, AAPL, "2026-11-03", 100.0)
    watchlist.add(conn, None, ["AAPL"], NOW)
    watchlist.evaluate(conn, NOW)


def test_every_method_answers_with_its_model(tmp_path):
    h = Harness(tmp_path)
    conn = h.server.db.conn
    report(conn)
    add_close(conn, AAPL, "2026-11-03", 100.0)

    async def go():
        out = {}
        out["create"] = await h.call("create_watchlist", {"name": "Tech"})
        list_id = out["create"]["result"]["list_id"]
        out["add"] = await h.call(
            "add_to_watchlist", {"list_id": list_id, "queries": ["AAPL NVDA", "nope"]}, id_=2
        )
        out["rename"] = await h.call(
            "rename_watchlist", {"list_id": list_id, "name": "Chips"}, id_=3
        )
        out["note"] = await h.call("set_watch_note", {"cik": AAPL, "note": "Margins."}, id_=4)
        out["alerts"] = await h.call(
            "set_watch_alerts", {"ciks": [AAPL], "move": 0.2, "age": False}, id_=5
        )
        out["page"] = await h.call("get_watchlist", id_=6)
        out["counts"] = await h.call("watch_counts", id_=7)
        out["events"] = await h.call("watch_events", {"cik": AAPL}, id_=8)
        out["prices"] = await h.call("watch_prices", {"cik": AAPL, "since": "2026-01-01"}, id_=9)
        out["remove"] = await h.call(
            "remove_from_watchlist", {"list_id": list_id, "ciks": [NVDA]}, id_=10
        )
        out["restore_items"] = await h.call(
            "restore_watch_items",
            {"list_id": list_id, "items": out["remove"]["result"]["removed"]},
            id_=11,
        )
        out["order"] = await h.call(
            "order_watchlist", {"list_id": list_id, "ciks": [NVDA, AAPL]}, id_=12
        )
        second = (await h.call("create_watchlist", {"name": "Banks"}, id_=13))["result"]
        out["order_lists"] = await h.call(
            "order_watchlists", {"list_ids": [second["list_id"], list_id]}, id_=14
        )
        out["seen"] = await h.call("mark_watch_seen", {}, id_=15)
        out["delete"] = await h.call("delete_watchlist", {"list_id": list_id}, id_=16)
        out["restore"] = await h.call("restore_watchlist", {"list_id": list_id}, id_=17)
        await h.call("delete_watchlist", {"list_id": second["list_id"]}, id_=18)
        out["erase"] = await h.call("erase_watchlist", {"list_id": second["list_id"]}, id_=19)
        return out

    out = run(go())
    for name, reply in out.items():
        assert "result" in reply, (name, reply)
    for name, model in {
        "create": WatchList,
        "add": WatchAdd,
        "rename": WatchList,
        "note": WatchNoteSaved,
        "alerts": Ok,
        "page": WatchPage,
        "counts": WatchCounts,
        "prices": WatchPrices,
        "remove": WatchRemoved,
        "restore_items": Ok,
        "order": Ok,
        "seen": WatchCounts,
        "delete": WatchDeleted,
        "restore": Ok,
        "erase": Ok,
    }.items():
        model.model_validate(out[name]["result"])
    for item in out["order_lists"]["result"]:
        WatchList.model_validate(item)
    for item in out["events"]["result"]:
        WatchEvent.model_validate(item)
    assert [a["ticker"] for a in out["add"]["result"]["added"]] == ["AAPL", "NVDA"]
    assert out["rename"]["result"]["ciks"] == [AAPL, NVDA]
    assert [x["name"] for x in out["order_lists"]["result"]] == ["Banks", "Chips"]
    page = out["page"]["result"]
    assert [r["ticker"] for r in page["rows"]] == ["AAPL", "NVDA"]
    assert page["rows"][0]["note"] == "Margins." and page["rows"][0]["alerts"]["move"] == 0.2
    assert out["prices"]["result"] == {"dates": ["2026-11-03"], "close": [100.0]}
    h.server.close()


def test_read_only_methods_change_nothing(tmp_path):
    h = Harness(tmp_path)
    watched_with_a_close(h)
    conn = h.server.db.conn

    async def go():
        before = conn.total_changes
        for i, (method, params) in enumerate(
            [
                ("get_watchlist", {}),
                ("watch_counts", {}),
                ("watch_events", {}),
                ("watch_events", {"cik": AAPL, "limit": 5}),
                ("watch_prices", {"cik": AAPL, "since": "2026-11-01"}),
            ],
            start=1,
        ):
            reply = await h.call(method, params, id_=i)
            assert "result" in reply, (method, reply)
        return before, conn.total_changes

    before, after = run(go())
    assert after == before
    h.server.close()


def test_bad_ids_are_refused_in_plain_words(tmp_path):
    h = Harness(tmp_path)
    watched_with_a_close(h)

    async def go():
        return [
            await h.call("rename_watchlist", {"list_id": 99, "name": "X"}, id_=1),
            await h.call("add_to_watchlist", {"list_id": 99, "queries": ["AAPL"]}, id_=2),
            await h.call("set_watch_note", {"cik": NVDA, "note": "x"}, id_=3),
            await h.call("watch_prices", {"cik": NVDA, "since": "2026-11-01"}, id_=4),
            await h.call("erase_watchlist", {"list_id": 1}, id_=5),
            await h.call("watch_events", {"cik": NVDA}, id_=6),
            await h.call("order_watchlists", {"list_ids": [1, 2]}, id_=7),
            await h.call("create_watchlist", {"name": "watchlist"}, id_=8),
        ]

    replies = run(go())
    assert all(r["error"]["code"] == INVALID_PARAMS for r in replies), replies
    assert replies[0]["error"]["message"] == "There is no watchlist 99 (it may have been deleted)."
    assert replies[2]["error"]["message"] == "The company with CIK 1045810 isn't in a watchlist."
    assert replies[4]["error"]["message"] == "There is no deleted watchlist 1."
    assert replies[7]["error"]["message"] == "A watchlist called 'Watchlist' already exists."
    h.server.close()


def test_start_catches_up_and_sends_one_watch_changed(tmp_path):
    h = Harness(tmp_path)
    watched_with_a_close(h)
    add_close(h.server.db.conn, AAPL, "2026-11-04", 70.0)  # while the app was closed

    run(h.server.start())
    notes = h.notes("watch_changed")
    assert len(notes) == 1
    note = WatchChanged.model_validate(notes[0])
    assert note.notify is True
    assert sorted(e.kind for e in note.events) == ["move", "range", "trigger_buy"]
    assert note.counts.needs_look == 1 and note.counts.watched == 1
    assert all(e.close_date == "2026-11-04" and e.ticker == "AAPL" for e in note.events)
    sent = h.server.db.conn.execute(
        "SELECT COUNT(*) FROM watch_events WHERE notified_at IS NOT NULL"
    ).fetchone()[0]
    assert sent == 3
    h.server.close()


def test_with_notifications_off_the_note_still_comes_but_asks_for_none(tmp_path):
    h = Harness(tmp_path)
    watched_with_a_close(h)
    config.Settings(h.server.db.conn).set("watch_notifications", "off")
    add_close(h.server.db.conn, AAPL, "2026-11-04", 70.0)

    async def go():
        await h.server.start()
        return await h.call("get_settings", {})

    settings = run(go())["result"]
    assert h.notes("watch_changed")[0]["notify"] is False
    assert SettingsResult.model_validate(settings).watch_notifications is False
    h.server.close()


def test_notifications_are_on_by_default(tmp_path):
    h = Harness(tmp_path)
    reply = run(h.call("get_settings", {}))
    assert reply["result"]["watch_notifications"] is True
    assert run(h.call("set_setting", {"key": "watch_notifications", "value": "maybe"}, id_=2))[
        "error"
    ]
    h.server.close()


def test_a_report_ready_is_followed_by_watch_changed(tmp_path):
    h = Harness(tmp_path)
    conn = h.server.db.conn
    with conn:  # the harness's made-up company (CIK 1000), watched before its first report
        conn.execute("INSERT INTO watch_companies (cik, first_added_at) VALUES (1000, 'x')")
        conn.execute(
            "INSERT INTO watch_lists (list_id, name, position, created_at)"
            " VALUES (1, 'Watchlist', 0, 'x')"
        )
        conn.execute(
            "INSERT INTO watch_items (list_id, cik, position, added_at, added_as)"
            " VALUES (1, 1000, 0, ?, 'T0')",
            (NOW.isoformat(),),
        )

    async def go():
        await h.server.start()
        await h.call("run_report", {"query": "T0"})
        await h.finish()

    run(go())
    kinds = [m.get("method") for m in h.messages]
    assert kinds.index("watch_changed") > kinds.index("report_ready")
    note = h.notes("watch_changed")[-1]
    assert note["counts"]["no_report"] == 0 and note["events"] == [] and note["notify"] is False
    # The new report's levels were written at save, and its alerts start silently.
    assert conn.execute("SELECT source FROM report_levels").fetchone()[0] == "run"
    assert conn.execute("SELECT COUNT(*) FROM watch_events").fetchone()[0] == 0
    row = watchlist.page(conn, NOW)["rows"][0]
    assert row["levels"] is not None and row["levels"]["source"] == "run"
    h.server.close()


def test_the_clock_check_runs_without_a_massive_key(tmp_path):
    h = Harness(tmp_path)
    watched_with_a_close(h)
    h.server.watch_every_s = None  # one pass

    async def go():
        await h.server.start()
        assert h.notes("watch_changed") == []
        add_close(h.server.db.conn, AAPL, "2026-11-04", 150.0)
        await asyncio.wait_for(h.server.watch_job, 5)

    run(go())
    assert h.server.backfill_job is None
    events = h.notes("watch_changed")[0]["events"]
    assert sorted(e["kind"] for e in events) == ["move", "range"]
    h.server.close()


def test_edits_that_change_the_counts_say_so(tmp_path):
    h = Harness(tmp_path)
    run(h.server.start())

    async def go():
        await h.call("add_to_watchlist", {"queries": ["AAPL"]})
        return h.notes("watch_changed")

    notes = run(go())
    assert notes[-1]["counts"] == {"watched": 1, "needs_look": 0, "no_report": 1}
    assert notes[-1]["events"] == [] and notes[-1]["notify"] is False
    h.server.close()


def test_the_page_says_when_prices_are_not_kept_current_and_what_is_queued(tmp_path):
    h = Harness(tmp_path)
    watched_with_a_close(h)
    h.server.line.waiting = [Entry("AAPL", "Apple Inc.", AAPL, True)]

    def page():
        return run(h.call("get_watchlist"))["result"]

    first = page()
    assert first["prices_note"] == (
        "No prices are stored, and none are being downloaded: add a Massive key in Settings."
    )
    assert first["rows"][0]["queued"] == "waiting"
    add_close(h.server.db.conn, SPY_CIK, "2026-11-04", 600.0)
    config.set_key("massive", "test-key")
    assert page()["prices_note"] is None and page()["as_of"] == "2026-11-04"
    config.Settings(h.server.db.conn).set("prices_backfill", "off")
    assert page()["prices_note"] == (
        "Prices are from 4 Nov 2026 and aren't being updated: the background price download is "
        "switched off."
    )
    h.server.close()


def test_the_price_top_up_takes_watched_ex_members_and_then_checks_alerts(tmp_path, monkeypatch):
    h = Harness(tmp_path)
    watched_with_a_close(h)
    conn = h.server.db.conn
    with conn:  # a watched company the index no longer has
        conn.execute("INSERT INTO watch_companies (cik, first_added_at) VALUES (77, 'x')")
        conn.execute(
            "INSERT INTO watch_items (list_id, cik, position, added_at, added_as)"
            " VALUES (1, 77, 9, 'x', 'OLD')"
        )
    add_close(conn, 77, "2026-11-03", 10.0)
    seen: dict = {}

    @asynccontextmanager
    async def http_factory(run_id, conn_, rawstore):
        yield None

    async def fake_top_up(http, rawstore, store, have, days, *, tally=None):
        seen["have"], seen["days"] = dict(have), list(days)
        add_close(conn, AAPL, days[0].isoformat(), 150.0)
        return {}

    monkeypatch.setattr(market, "top_up", fake_top_up)
    h.server.http_factory = http_factory
    run(h.server._keep_current({"AAPL": (AAPL, ""), "SPY": (SPY_CIK, "")}))
    assert seen["have"] == {"AAPL": (AAPL, ""), "OLD": (77, "")}
    assert [d.isoformat() for d in seen["days"]] == ["2026-11-04"]
    assert sorted(e["kind"] for e in h.notes("watch_changed")[0]["events"]) == ["move", "range"]
    h.server.close()
