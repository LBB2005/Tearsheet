"""The watchlist (watchlist.py): lists and their companies, the page's numbers and sentences, and
the alerts, which fire once per crossing on daily closes."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from tearsheet import watchlist
from tearsheet.protocol import WatchAdd, WatchEvent, WatchList, WatchPage
from tests.test_companies import add_close, add_report
from tests.test_db import insert_prediction

AAPL, NVDA, JPM, GOOGL, BRK = 320193, 1045810, 19617, 1652044, 1067983
# 8pm in New York on Monday 9 Nov 2026: the 9 Nov close is in.
NOW = datetime(2026, 11, 10, 1, 0, tzinfo=UTC)
# Its run started at 8pm in New York on 3 Nov, so the report is priced at the 3 Nov close.
STARTED = "2026-11-04T01:00:00+00:00"
LEVELS = {
    "price_date": "2026-11-03",
    "price": 100.0,
    "rating": "Hold",
    "capped": 0,
    "uncertainty": "medium",
    "score_percentile": 65,
    "estimate": 120.0,
    "bear": 80.0,
    "base": 110.0,
    "bull": 140.0,
    "buy_trigger": 90.0,
    "sell_trigger": None,
    "buy_reachable": 1,
    "sell_reachable": 0,
}


def report(
    conn, cik=AAPL, ticker="AAPL", *, run_id="run-a", report_id="rep-a", started=STARTED, **lv
):
    """A stored report with its levels (as Run.save writes them)."""
    add_report(conn, run_id, report_id, cik, ticker, started)
    row = {**LEVELS, **lv, "report_id": report_id, "run_id": run_id, "cik": cik, "source": "run"}
    names = ", ".join(row)
    with conn:
        conn.execute(
            f"INSERT INTO report_levels ({names}) VALUES ({', '.join('?' for _ in row)})",
            list(row.values()),
        )


def closes(conn, cik, days_and_prices):
    for day, price in days_and_prices:
        add_close(conn, cik, day, price)


def watch(conn, *queries, list_id=None, now=NOW):
    added = watchlist.add(conn, list_id, list(queries), now)
    watchlist.evaluate(conn, now)
    return added


def alerts_only(conn, cik, **on):
    """Every alert off but those named."""
    watchlist.set_alerts(
        conn,
        [cik],
        range_=on.get("range", False),
        trigger=on.get("trigger", False),
        move=on.get("move", 0),
        age=on.get("age", False),
    )


def fired(conn) -> list[tuple]:
    return [
        tuple(r)
        for r in conn.execute(
            "SELECT kind, side, close_date, price, level FROM watch_events ORDER BY event_id"
        )
    ]


def texts(conn) -> list[str]:
    return [r[0] for r in conn.execute("SELECT text FROM watch_events ORDER BY event_id")]


def row_of(page: dict, cik: int) -> dict:
    return next(r for r in page["rows"] if r["cik"] == cik)


# --- lists and companies ------------------------------------------------------------------------


def test_the_first_add_makes_the_default_list_once(database):
    conn = database.conn
    first = watchlist.add(conn, None, ["AAPL"], NOW)
    second = watchlist.add(conn, None, ["nvda"], NOW + timedelta(minutes=1))
    WatchAdd.model_validate(first)
    assert first["list"]["name"] == "Watchlist" == second["list"]["name"]
    assert first["list"]["list_id"] == second["list"]["list_id"]
    assert second["list"]["ciks"] == [AAPL, NVDA] and second["list"]["count"] == 2
    assert [WatchList.model_validate(x).name for x in watchlist.lists(conn)] == ["Watchlist"]


def test_adding_resolves_as_the_line_does(database):
    conn = database.conn
    result = watchlist.add(
        conn, None, ["GOOG", "brk-b", "google", "Apple", "AAPL MSFT", "ZZZZ", "MSFT"], NOW
    )
    added = {a["ticker"]: a for a in result["added"]}
    assert list(added) == ["GOOGL", "BRK.B", "AAPL", "MSFT"]
    assert added["GOOGL"]["cik"] == GOOGL
    assert added["GOOGL"]["note"] == "GOOG is followed as Alphabet Inc., priced as GOOGL."
    assert added["BRK.B"]["note"] is None and added["AAPL"]["note"] is None
    skipped = [(s["query"], s["kind"], s["reason"]) for s in result["skipped"]]
    assert skipped == [
        ("google", "twice", "GOOGL is listed twice."),
        ("AAPL", "twice", "AAPL is listed twice."),
        ("ZZZZ", "unknown", "No S&P 500 company matches 'ZZZZ'."),
        ("MSFT", "twice", "MSFT is listed twice."),
    ]
    typed = dict(conn.execute("SELECT cik, added_as FROM watch_items").fetchall())
    assert typed[BRK] == "brk-b" and typed[GOOGL] == "GOOG" and typed[AAPL] == "Apple"
    again = watchlist.add(conn, None, ["AAPL"], NOW)
    assert again["added"] == []
    assert again["skipped"] == [
        {"query": "AAPL", "reason": "AAPL is already in Watchlist.", "kind": "in_list"}
    ]


def test_a_company_outside_the_index_is_not_covered(database):
    result = watchlist.add(database.conn, None, ["Some Private Company Ltd"], NOW)
    assert result["added"] == [] and result["skipped"][0]["kind"] == "unknown"
    assert result["list"]["count"] == 0  # the default list is still made, empty


def test_names_are_checked(database):
    conn = database.conn
    tech = watchlist.create(conn, "  Tech ", NOW)
    assert tech["name"] == "Tech" and tech["position"] == 0 and tech["ciks"] == []
    with pytest.raises(ValueError, match="A watchlist called 'Tech' already exists."):
        watchlist.create(conn, "tech", NOW)
    with pytest.raises(ValueError, match="needs a name"):
        watchlist.create(conn, "   ", NOW)
    assert watchlist.rename(conn, tech["list_id"], "TECH")["name"] == "TECH"
    banks = watchlist.create(conn, "Banks", NOW)
    assert banks["position"] == 1
    with pytest.raises(ValueError, match="already exists"):
        watchlist.rename(conn, banks["list_id"], "tech")
    with pytest.raises(ValueError, match="There is no watchlist 99"):
        watchlist.rename(conn, 99, "X")


def test_lists_are_reordered_only_all_at_once(database):
    conn = database.conn
    a = watchlist.create(conn, "A", NOW)["list_id"]
    b = watchlist.create(conn, "B", NOW)["list_id"]
    with pytest.raises(ValueError, match="every watchlist once"):
        watchlist.order_lists(conn, [b])
    with pytest.raises(ValueError, match="every watchlist once"):
        watchlist.order_lists(conn, [b, a, a])
    assert [x["name"] for x in watchlist.order_lists(conn, [b, a])] == ["B", "A"]


def test_a_deleted_list_comes_back_or_is_erased(database):
    conn = database.conn
    tech = watchlist.create(conn, "Tech", NOW)["list_id"]
    other = watchlist.create(conn, "Other", NOW)["list_id"]
    watchlist.add(conn, tech, ["AAPL", "NVDA", "JPM"], NOW)
    watchlist.add(conn, other, ["JPM"], NOW)
    watchlist.set_note(conn, NVDA, "Watch the data-centre numbers.", NOW)
    deleted = watchlist.delete(conn, tech, NOW)
    assert deleted == {"list_id": tech, "leaving": [AAPL, NVDA], "with_notes": [NVDA]}
    assert watchlist.watched(conn) == {JPM}
    assert [x["name"] for x in watchlist.lists(conn)] == ["Other"]
    with pytest.raises(ValueError, match="no watchlist"):
        watchlist.add(conn, tech, ["MSFT"], NOW)
    watchlist.restore(conn, tech)
    assert watchlist.watched(conn) == {AAPL, NVDA, JPM}
    with pytest.raises(ValueError, match="no deleted watchlist"):
        watchlist.erase(conn, tech)
    watchlist.delete(conn, tech, NOW)
    watchlist.create(conn, "tech", NOW)
    with pytest.raises(ValueError, match="already exists"):
        watchlist.restore(conn, tech)
    watchlist.erase(conn, tech)
    assert (
        conn.execute("SELECT COUNT(*) FROM watch_items WHERE list_id = ?", (tech,)).fetchone()[0]
        == 0
    )
    # The note stays with the company.
    assert conn.execute("SELECT note FROM watch_companies WHERE cik = ?", (NVDA,)).fetchone()[0]


def test_a_list_deleted_more_than_a_day_ago_is_erased_at_start(database):
    conn = database.conn
    old = watchlist.create(conn, "Old", NOW)["list_id"]
    recent = watchlist.create(conn, "Recent", NOW)["list_id"]
    watchlist.delete(conn, old, NOW - timedelta(days=2))
    watchlist.delete(conn, recent, NOW - timedelta(hours=1))
    assert watchlist.erase_old(conn, NOW) == 1
    ids = {r[0] for r in conn.execute("SELECT list_id FROM watch_lists")}
    assert ids == {recent}


def test_removing_and_putting_back_keeps_the_place_and_date(database):
    conn = database.conn
    watchlist.add(conn, None, ["AAPL", "NVDA"], NOW)
    later = NOW + timedelta(days=1)
    list_id = watchlist.add(conn, None, ["JPM"], later)["list"]["list_id"]
    removed = watchlist.remove(conn, list_id, [NVDA, 12345])["removed"]
    assert removed == [
        {"cik": NVDA, "position": 1, "added_at": NOW.isoformat(), "added_as": "NVDA"}
    ]
    assert watchlist.lists(conn)[0]["ciks"] == [AAPL, JPM]
    watchlist.restore_items(conn, list_id, removed)
    assert watchlist.lists(conn)[0]["ciks"] == [AAPL, NVDA, JPM]
    with pytest.raises(ValueError, match="never been watched"):
        watchlist.restore_items(
            conn, list_id, [{"cik": 1, "position": 0, "added_at": "x", "added_as": "X"}]
        )
    with pytest.raises(ValueError, match="every company in the watchlist once"):
        watchlist.order_items(conn, list_id, [JPM, AAPL])
    watchlist.order_items(conn, list_id, [JPM, AAPL, NVDA])
    assert watchlist.lists(conn)[0]["ciks"] == [JPM, AAPL, NVDA]


def test_a_note_survives_leaving_every_list(database):
    conn = database.conn
    list_id = watchlist.add(conn, None, ["AAPL"], NOW)["list"]["list_id"]
    saved = watchlist.set_note(conn, AAPL, "Services margin.", NOW)
    assert saved == {"cik": AAPL, "note_at": NOW.isoformat()}
    watchlist.remove(conn, list_id, [AAPL])
    with pytest.raises(ValueError, match="isn't in a watchlist"):
        watchlist.set_note(conn, AAPL, "x", NOW)
    watchlist.add(conn, None, ["AAPL"], NOW)
    assert row_of(watchlist.page(conn, NOW), AAPL)["note"] == "Services margin."


def test_alert_settings_belong_to_the_company(database):
    conn = database.conn
    watchlist.add(conn, None, ["AAPL"], NOW)
    watchlist.set_alerts(conn, [AAPL], move=0.25, age=False)
    alerts = row_of(watchlist.page(conn, NOW), AAPL)["alerts"]
    assert alerts == {"range": True, "trigger": True, "move": 0.25, "age": False}
    watchlist.set_alerts(conn, [AAPL], move=0)
    assert row_of(watchlist.page(conn, NOW), AAPL)["alerts"]["move"] is None
    with pytest.raises(ValueError, match="isn't in a watchlist"):
        watchlist.set_alerts(conn, [NVDA], range_=False)


# --- the page ---------------------------------------------------------------------------------


def test_the_page_works_out_every_number_in_todays_shares(database):
    conn = database.conn
    report(conn)
    closes(conn, AAPL, [("2026-11-03", 100.0), ("2026-11-05", 300.0), ("2026-11-06", 72.0)])
    with conn:  # a 3-for-1 split on 5 Nov
        conn.execute(
            "INSERT INTO corporate_actions VALUES (?, '', '2026-11-05', 'split', 3.0, 't')", (AAPL,)
        )
    closes(conn, AAPL, [("2026-11-09", 75.0)])
    watch(conn, "AAPL")
    page = watchlist.page(conn, NOW, queued={AAPL: "waiting"})
    WatchPage.model_validate(page)
    row = row_of(page, AAPL)
    assert row["ticker"] == "AAPL" and row["name"] == "Apple Inc." and row["in_index"]
    assert row["sector"] == "Information Technology"
    assert row["price"] == 75.0 and row["price_date"] == "2026-11-09"
    assert row["previous_close"] == 72.0 and row["stale"] is False
    levels = row["levels"]
    assert levels["report_id"] == "rep-a" and levels["report_date"] == "2026-11-04"
    assert levels["price_date"] == "2026-11-03" and levels["source"] == "run"
    assert levels["official"] is False and levels["capped"] is False
    assert (levels["bear"], levels["base"], levels["bull"]) == (26.666667, 36.666667, 46.666667)
    assert levels["buy_trigger"] == 30.0 and levels["report_price"] == 33.333333
    assert levels["buy_reachable"] is True and levels["sell_reachable"] is False
    assert row["since_report"] == 1.25  # 75 × 3 ÷ 100 − 1
    assert row["to_base"] == round(36.666667 / 75 - 1, 4)
    assert row["outside"] == "above" and row["range_position"] > 1
    assert row["trigger_side"] is None
    assert row["queued"] == "waiting" and row["slot_open"] is True
    assert row["official_from"] is None and row["report_age_days"] == 6
    kinds = [r["kind"] for r in row["reasons"]]
    assert kinds == ["outside", "moved", "slot_open"]
    assert row["reasons"][0]["text"] == (
        "Closed at $75.00, above the bull case of $46.67 and 104.5% above the base case of $36.67."
    )
    assert row["reasons"][1]["text"] == "Up 125.0% since the 4 Nov 2026 report."
    assert row["reasons"][2]["text"] == "A new report now would be an official prediction."
    assert page["as_of"] is None and page["prices_note"] is None
    assert page["counts"] == {"watched": 1, "needs_look": 0, "no_report": 0}


def test_the_previous_close_is_only_the_session_just_before(database):
    conn = database.conn
    closes(conn, AAPL, [("2026-11-04", 90.0), ("2026-11-06", 100.0)])
    watch(conn, "AAPL")
    row = row_of(watchlist.page(conn, NOW), AAPL)
    assert row["previous_close"] is None
    assert row["stale"] is False  # 6 Nov is the session before the last completed one


def test_old_or_missing_prices_are_stale(database):
    conn = database.conn
    closes(conn, AAPL, [("2026-11-05", 100.0)])
    watch(conn, "AAPL", "NVDA")
    page = watchlist.page(conn, NOW)
    aapl, nvda = row_of(page, AAPL), row_of(page, NVDA)
    assert aapl["stale"] and nvda["stale"] and nvda["price"] is None
    assert aapl["reasons"][-1] == {
        "kind": "stale",
        "text": "The last close Tearsheet has is from 5 Nov 2026, so the price is out of date.",
    }
    assert nvda["reasons"] == [
        {"kind": "no_report", "text": "No report yet."},
        {"kind": "stale", "text": "No stored prices yet."},
    ]
    assert page["counts"]["no_report"] == 2


def test_rows_come_oldest_added_first(database):
    conn = database.conn
    tech = watchlist.create(conn, "Tech", NOW)["list_id"]
    banks = watchlist.create(conn, "Banks", NOW)["list_id"]
    watchlist.add(conn, banks, ["JPM"], NOW + timedelta(days=1))
    watchlist.add(conn, tech, ["NVDA", "AAPL"], NOW)
    watchlist.add(conn, banks, ["AAPL"], NOW + timedelta(days=2))
    page = watchlist.page(conn, NOW)
    assert [r["ticker"] for r in page["rows"]] == ["NVDA", "AAPL", "JPM"]
    aapl = row_of(page, AAPL)
    assert aapl["lists"] == [tech, banks] and aapl["added_at"] == NOW.isoformat()
    assert [x["ciks"] for x in page["lists"]] == [[NVDA, AAPL], [JPM, AAPL]]


def test_the_newest_report_on_show_is_measured_against(database):
    conn = database.conn
    report(conn)
    report(
        conn,
        run_id="run-b",
        report_id="rep-b",
        started="2026-11-07T01:00:00+00:00",
        price_date="2026-11-06",
        bear=150.0,
    )
    closes(conn, AAPL, [("2026-11-09", 100.0)])
    watch(conn, "AAPL")
    assert row_of(watchlist.page(conn, NOW), AAPL)["levels"]["report_id"] == "rep-b"
    with conn:
        conn.execute("INSERT INTO hidden_reports VALUES ('rep-b', 'x')")
    assert row_of(watchlist.page(conn, NOW), AAPL)["levels"]["report_id"] == "rep-a"
    with conn:
        conn.execute("INSERT INTO hidden_reports VALUES ('rep-a', 'x')")
    row = row_of(watchlist.page(conn, NOW), AAPL)
    assert row["levels"] is None
    assert row["reasons"][:2] == [
        {
            "kind": "no_report",
            "text": "No report on show: its reports were deleted from the sidebar.",
        },
        {"kind": "slot_open", "text": "A new report now would be an official prediction."},
    ]


def test_an_official_prediction_with_no_report_on_show_gives_the_levels(database):
    conn = database.conn
    with conn:
        insert_prediction(
            conn,
            cik=NVDA,
            run_at="2026-11-04T01:00:00+00:00",
            rating="Buy",
            bear=150.0,
            base=200.0,
            bull=260.0,
            score=71.6,
        )
    closes(conn, NVDA, [("2026-11-03", 180.0), ("2026-11-09", 198.0)])
    watch(conn, "NVDA")
    row = row_of(watchlist.page(conn, NOW), NVDA)
    levels = row["levels"]
    assert levels["source"] == "prediction" and levels["report_id"] is None
    assert levels["official"] is True and levels["rating"] == "Buy"
    assert levels["report_price"] == 180.0 and levels["score_percentile"] == 72
    assert levels["buy_trigger"] is None and levels["buy_reachable"] is None
    assert row["since_report"] == 0.1
    assert row["official_from"] == "2026-12-04T01:00:00+00:00" and row["slot_open"] is False
    assert row["reasons"] == [
        {"kind": "moved", "text": "Up 10.0% since the 4 Nov 2026 prediction."}
    ]


def test_a_company_that_left_the_index_says_so(database):
    conn = database.conn
    watchlist.add(conn, None, ["AAPL"], NOW)
    with conn:  # as if the bundled list no longer had it: watched under a CIK it doesn't know
        conn.execute("INSERT INTO watch_companies (cik, first_added_at) VALUES (77, 'x')")
        conn.execute(
            "INSERT INTO watch_items (list_id, cik, position, added_at, added_as)"
            " VALUES (1, 77, 9, ?, 'oldco')",
            (NOW.isoformat(),),
        )
        conn.execute(
            "INSERT INTO tickers (ticker, cik, date_from) VALUES ('OLD', 77, '2020-01-01')"
        )
    row = row_of(watchlist.page(conn, NOW), 77)
    assert row["ticker"] == "OLD" and row["in_index"] is False and row["sector"] is None
    assert {
        "kind": "left_index",
        "text": "No longer in the S&P 500, so Tearsheet can't write a new report on it.",
    } in row["reasons"]


def test_a_trigger_the_price_is_past_and_one_it_is_near(database):
    conn = database.conn
    report(conn)
    report(
        conn,
        NVDA,
        "NVDA",
        run_id="run-n",
        report_id="rep-n",
        rating="Sell",
        buy_trigger=None,
        buy_reachable=0,
        sell_trigger=95.0,
        sell_reachable=1,
    )
    closes(conn, AAPL, [("2026-11-09", 85.0)])
    closes(conn, NVDA, [("2026-11-09", 100.0)])
    watch(conn, "AAPL", "NVDA")
    page = watchlist.page(conn, NOW)
    aapl, nvda = row_of(page, AAPL), row_of(page, NVDA)
    assert aapl["trigger_side"] == "buy"
    assert aapl["reasons"][0] == {
        "kind": "trigger",
        "text": "Closed at $85.00, below its buy trigger of $90.00. Holding the score and peers "
        "fixed, the rating would turn Buy.",
    }
    assert nvda["trigger_side"] is None
    assert nvda["reasons"][0] == {
        "kind": "near_trigger",
        "text": "5.0% from its sell trigger of $95.00; past it, holding the score and peers "
        "fixed, the rating would fall back to Hold.",
    }


def test_a_capped_rating_stays_at_hold_in_the_wording(database):
    conn = database.conn
    # Capped: the report's price (85) met the Buy line, but a red flag holds it at Hold.
    report(conn, capped=1, price=85.0)
    closes(conn, AAPL, [("2026-11-03", 85.0), ("2026-11-09", 92.0)])
    watch(conn, "AAPL")
    row = row_of(watchlist.page(conn, NOW), AAPL)
    assert row["trigger_side"] == "buy"
    assert row["reasons"][0]["text"] == (
        "Closed at $92.00, above its buy trigger of $90.00. Holding the score and peers fixed, it "
        "would no longer meet the Buy line; a red flag holds the rating at Hold either way."
    )


def test_a_trigger_not_reachable_by_price_gives_nothing(database):
    conn = database.conn
    report(conn, buy_trigger=None, buy_reachable=0)
    closes(conn, AAPL, [("2026-11-03", 100.0), ("2026-11-09", 50.0)])
    watch(conn, "AAPL")
    row = row_of(watchlist.page(conn, NOW), AAPL)
    assert row["trigger_side"] is None
    assert "trigger" not in {r["kind"] for r in row["reasons"]}
    kinds = {r[0] for r in conn.execute("SELECT kind FROM watch_alert_state")}
    assert kinds == {"range", "move"}


def test_watch_prices_are_in_todays_shares(database):
    conn = database.conn
    closes(conn, AAPL, [("2026-11-03", 100.0), ("2026-11-05", 51.0), ("2026-11-06", 52.0)])
    with conn:
        conn.execute(
            "INSERT INTO corporate_actions VALUES (?, '', '2026-11-05', 'split', 2.0, 't')", (AAPL,)
        )
    watchlist.add(conn, None, ["AAPL"], NOW)
    assert watchlist.prices(conn, AAPL, "2026-11-01") == {
        "dates": ["2026-11-03", "2026-11-05", "2026-11-06"],
        "close": [50.0, 51.0, 52.0],
    }
    assert watchlist.prices(conn, AAPL, "2026-11-05")["dates"] == ["2026-11-05", "2026-11-06"]
    with pytest.raises(ValueError, match="isn't in a watchlist"):
        watchlist.prices(conn, NVDA, "2026-11-01")


# --- alerts -----------------------------------------------------------------------------------


def test_adding_a_company_never_fires_an_alert(database):
    conn = database.conn
    report(conn)
    closes(conn, AAPL, [("2026-11-03", 100.0), ("2026-11-09", 60.0)])  # out, past, moved
    watch(conn, "AAPL")
    assert fired(conn) == []
    states = dict(conn.execute("SELECT kind, side FROM watch_alert_state").fetchall())
    assert states == {"range": "below", "trigger_buy": "below", "move": "down"}


def test_leaving_the_range_fires_once_and_coming_back_re_arms_it(database):
    conn = database.conn
    report(conn)
    closes(conn, AAPL, [("2026-11-03", 100.0)])
    watch(conn, "AAPL")
    alerts_only(conn, AAPL, range=True)
    closes(conn, AAPL, [("2026-11-04", 79.0), ("2026-11-05", 78.0)])
    new = watchlist.evaluate(conn, NOW)
    assert len(new) == 1
    assert fired(conn) == [("range", "below", "2026-11-04", 79.0, 80.0)]
    assert texts(conn) == [
        "AAPL closed at $79.00, below the bear case of $80.00 in the 4 Nov 2026 report."
    ]
    assert watchlist.evaluate(conn, NOW) == []  # a second look adds nothing
    closes(conn, AAPL, [("2026-11-06", 80.0), ("2026-11-09", 141.0)])  # on the line is inside
    watchlist.evaluate(conn, NOW)
    assert fired(conn)[1:] == [("range", "above", "2026-11-09", 141.0, 140.0)]


def test_a_close_on_the_line_does_not_flap(database):
    conn = database.conn
    report(conn)
    closes(conn, AAPL, [("2026-11-03", 100.0)])
    watch(conn, "AAPL")
    alerts_only(conn, AAPL, trigger=True)
    # 90 sits on the buy trigger: it keeps the side it had. Saturday's row repeats Friday's.
    closes(
        conn,
        AAPL,
        [("2026-11-04", 90.0), ("2026-11-05", 89.0), ("2026-11-06", 90.0), ("2026-11-07", 90.0)],
    )
    watchlist.evaluate(conn, NOW)
    assert fired(conn) == [("trigger_buy", "below", "2026-11-05", 89.0, 90.0)]
    assert conn.execute("SELECT side FROM watch_alert_state").fetchone()[0] == "below"


def test_a_missed_out_and_back_is_caught_up(database):
    conn = database.conn
    report(conn)
    closes(conn, AAPL, [("2026-11-03", 100.0)])
    watch(conn, "AAPL")
    alerts_only(conn, AAPL, trigger=True)
    closes(conn, AAPL, [("2026-11-04", 88.0), ("2026-11-05", 95.0), ("2026-11-06", 100.0)])
    watchlist.evaluate(conn, NOW)
    assert [e[:3] for e in fired(conn)] == [
        ("trigger_buy", "below", "2026-11-04"),
        ("trigger_buy", "above", "2026-11-05"),
    ]
    assert texts(conn) == [
        "AAPL closed at $88.00, below its buy trigger of $90.00. Holding the score and peers "
        "fixed, the rating would turn Buy.",
        "AAPL closed at $95.00, above its buy trigger of $90.00. Holding the score and peers "
        "fixed, the rating would be Hold again, as in the report.",
    ]


def test_trigger_wording_for_buy_rated_and_capped_reports(database):
    conn = database.conn
    report(conn, rating="Buy", price=85.0)
    report(conn, NVDA, "NVDA", run_id="run-n", report_id="rep-n", capped=1, price=85.0)
    for cik in (AAPL, NVDA):
        closes(conn, cik, [("2026-11-03", 85.0)])
    watch(conn, "AAPL", "NVDA")
    for cik in (AAPL, NVDA):
        alerts_only(conn, cik, trigger=True)
        closes(conn, cik, [("2026-11-04", 91.0), ("2026-11-05", 89.0)])
    watchlist.evaluate(conn, NOW)
    assert texts(conn) == [
        "AAPL closed at $91.00, above its buy trigger of $90.00. Holding the score and peers "
        "fixed, the rating would fall back to Hold.",
        "AAPL closed at $89.00, below its buy trigger of $90.00. Holding the score and peers "
        "fixed, the rating would be Buy again, as in the report.",
        "NVDA closed at $91.00, above its buy trigger of $90.00. Holding the score and peers "
        "fixed, it would no longer meet the Buy line; a red flag holds the rating at Hold either "
        "way.",
        "NVDA closed at $89.00, below its buy trigger of $90.00. Holding the score and peers "
        "fixed, the rating would turn Buy, but a red flag holds it at Hold.",
    ]


def test_a_withheld_rating_has_no_alerts(database):
    conn = database.conn
    report(
        conn,
        **{
            k: None
            for k in (
                "rating",
                "bear",
                "base",
                "bull",
                "buy_trigger",
                "buy_reachable",
                "sell_reachable",
                "price",
            )
        },
    )
    closes(conn, AAPL, [("2026-11-03", 100.0)])
    watch(conn, "AAPL")
    # Only the move (from the report's close) can apply.
    kinds = {r[0] for r in conn.execute("SELECT kind FROM watch_alert_state")}
    assert kinds == {"move"}


def test_a_move_fires_each_way_and_a_split_is_no_move(database):
    conn = database.conn
    report(conn)
    closes(conn, AAPL, [("2026-11-03", 100.0)])
    watch(conn, "AAPL")
    alerts_only(conn, AAPL, move=0.1)
    with conn:
        conn.execute(
            "INSERT INTO corporate_actions VALUES (?, '', '2026-11-05', 'split', 2.0, 't')", (AAPL,)
        )
    closes(
        conn,
        AAPL,
        [("2026-11-04", 109.0), ("2026-11-05", 55.0), ("2026-11-06", 50.0), ("2026-11-09", 44.0)],
    )
    watchlist.evaluate(conn, NOW)
    assert fired(conn) == [
        ("move", "up", "2026-11-05", 55.0, 50.0),
        ("move", "down", "2026-11-09", 44.0, 50.0),
    ]
    assert texts(conn) == [
        "AAPL closed at $55.00, up 10.0% since the 4 Nov 2026 report.",
        "AAPL closed at $44.00, down 12.0% since the 4 Nov 2026 report.",
    ]


def test_a_new_report_starts_again_silently(database):
    conn = database.conn
    report(conn)
    closes(conn, AAPL, [("2026-11-03", 100.0)])
    watch(conn, "AAPL")
    alerts_only(conn, AAPL, range=True)
    closes(conn, AAPL, [("2026-11-04", 70.0)])
    report(
        conn,
        run_id="run-b",
        report_id="rep-b",
        started="2026-11-05T01:00:00+00:00",
        price_date="2026-11-04",
        bear=60.0,
        bull=90.0,
    )
    closes(conn, AAPL, [("2026-11-05", 95.0)])
    watchlist.evaluate(conn, NOW)
    assert fired(conn) == []  # measured from rep-b's levels from the newest close, silently
    state = conn.execute("SELECT report_id, side, close_date FROM watch_alert_state").fetchone()
    assert tuple(state) == ("rep-b", "above", "2026-11-05")
    with conn:  # rep-b deleted from the sidebar: back to rep-a, silently again
        conn.execute("INSERT INTO hidden_reports VALUES ('rep-b', 'x')")
    watchlist.evaluate(conn, NOW)
    assert fired(conn) == []
    assert conn.execute("SELECT report_id, side FROM watch_alert_state").fetchone()[0] == "rep-a"


def test_turning_an_alert_off_forgets_it_and_on_starts_it_silently(database):
    conn = database.conn
    report(conn)
    closes(conn, AAPL, [("2026-11-03", 100.0)])
    watch(conn, "AAPL")
    watchlist.set_alerts(conn, [AAPL], range_=False)
    assert "range" not in {r[0] for r in conn.execute("SELECT kind FROM watch_alert_state")}
    closes(conn, AAPL, [("2026-11-04", 150.0)])
    watchlist.set_alerts(conn, [AAPL], range_=True, move=0)
    watchlist.evaluate(conn, NOW)
    assert fired(conn) == []
    assert (
        conn.execute("SELECT side FROM watch_alert_state WHERE kind = 'range'").fetchone()[0]
        == "above"
    )


def test_a_company_back_after_leaving_every_list_starts_silently(database):
    conn = database.conn
    report(conn)
    closes(conn, AAPL, [("2026-11-03", 100.0)])
    list_id = watch(conn, "AAPL")["list"]["list_id"]
    watchlist.remove(conn, list_id, [AAPL])
    closes(conn, AAPL, [("2026-11-04", 50.0)])
    watchlist.evaluate(conn, NOW)  # not watched: nothing is looked at
    watch(conn, "AAPL")
    assert fired(conn) == []


def test_a_long_absence_walks_only_the_latest_month_of_closes(database):
    conn = database.conn
    report(conn)
    closes(conn, AAPL, [("2026-08-03", 100.0)])
    with conn:
        conn.execute("UPDATE report_levels SET price_date = '2026-08-03'")
    watch(conn, "AAPL")
    alerts_only(conn, AAPL, range=True)
    days = [(datetime(2026, 8, 4) + timedelta(days=i)).date().isoformat() for i in range(40)]
    # Out on the first new close only, then back inside: older than the latest 30, so not seen.
    closes(conn, AAPL, [(d, 70.0 if i == 0 else 100.0) for i, d in enumerate(days)])
    watchlist.evaluate(conn, NOW)
    assert fired(conn) == []
    assert conn.execute("SELECT close_date FROM watch_alert_state").fetchone()[0] == days[-1]


def test_the_window_alert_fires_once_when_it_opens_after_the_company_was_added(database):
    conn = database.conn
    with conn:
        insert_prediction(conn, prediction_id="p-old", cik=AAPL, run_at="2026-10-01T00:00:00+00:00")
        insert_prediction(
            conn, prediction_id="p-new", run_id="r2", cik=NVDA, run_at="2026-10-20T00:00:00+00:00"
        )
    watch(conn, "AAPL", "NVDA")
    assert fired(conn) == []  # AAPL's window opened before it was added
    opened = datetime(2026, 11, 19, 0, 0, tzinfo=UTC)
    assert watchlist.evaluate(conn, opened - timedelta(seconds=1)) == []
    assert len(watchlist.evaluate(conn, opened)) == 1
    assert watchlist.evaluate(conn, opened + timedelta(hours=1)) == []
    assert fired(conn) == [("age", "open", "2026-11-19", None, None)]
    assert texts(conn) == [
        "A new report on NVDA would now be an official prediction: its last one was made on "
        "20 Oct 2026."
    ]


def test_unseen_alerts_count_until_they_are_seen(database):
    conn = database.conn
    report(conn)
    closes(conn, AAPL, [("2026-11-03", 100.0)])
    watch(conn, "AAPL", "NVDA")
    closes(conn, AAPL, [("2026-11-04", 50.0)])
    ids = watchlist.evaluate(conn, NOW)
    assert len(ids) == 3  # the range, the buy trigger and the move
    assert watchlist.counts(conn) == {"watched": 2, "needs_look": 1, "no_report": 1}
    assert row_of(watchlist.page(conn, NOW), AAPL)["unseen"] == 3
    history = watchlist.events(conn, AAPL)
    assert [WatchEvent.model_validate(e).kind for e in history] == ["move", "trigger_buy", "range"]
    assert all(e["ticker"] == "AAPL" and not e["seen"] for e in history)
    assert [e["event_id"] for e in watchlist.events(conn, ids=ids)] == sorted(ids, reverse=True)
    watchlist.mark_seen(conn, [NVDA], NOW)
    assert watchlist.counts(conn)["needs_look"] == 1
    watchlist.mark_seen(conn, None, NOW)
    assert watchlist.counts(conn)["needs_look"] == 0
    assert all(e["seen"] for e in watchlist.events(conn))
    with pytest.raises(ValueError, match="never been watched"):
        watchlist.events(conn, 12345)


def test_a_watched_company_that_left_the_index_joins_the_price_top_up(database):
    conn = database.conn
    wanted = {"AAPL": (AAPL, ""), "SPY": (884394, "")}
    closes(conn, AAPL, [("2026-11-06", 100.0)])
    watchlist.add(conn, None, ["AAPL"], NOW)
    with conn:
        for cik, ticker in ((77, "OLD.A"), (78, "GONE")):
            conn.execute(
                "INSERT INTO watch_companies (cik, first_added_at) VALUES (?, 'x')", (cik,)
            )
            conn.execute(
                "INSERT INTO watch_items (list_id, cik, position, added_at, added_as)"
                " VALUES (1, ?, 9, 'x', ?)",
                (cik, ticker),
            )
    closes(conn, 77, [("2026-11-06", 10.0)])
    closes(conn, 78, [("2026-10-01", 10.0)])  # stopped trading: it would pull the top-up back
    assert watchlist.extra_price_tickers(conn, wanted) == {"OLD.A": (77, "")}
