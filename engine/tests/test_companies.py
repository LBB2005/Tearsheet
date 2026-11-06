"""The company list and look-up box."""

from __future__ import annotations

import json

from tearsheet.companies import list_companies, search_companies


def add_report(conn, run_id, report_id, cik, ticker, created):
    with conn:
        conn.execute(
            "INSERT OR IGNORE INTO companies (cik, name) VALUES (?, ?)", (cik, f"{ticker} Inc.")
        )
        conn.execute(
            "INSERT INTO runs (run_id, cik, mode, started_at, status, engine_version,"
            " method_code_version, methodology_hash, reference_version)"
            " VALUES (?, ?, 'full', ?, 'done', '1', 1, 'h', 'r')",
            (run_id, cik, created),
        )
        conn.execute(
            "INSERT INTO step_outputs (run_id, step, json) VALUES (?, 'resolve', ?)",
            (run_id, json.dumps({"cik": cik, "ticker": ticker, "peers": []})),
        )
        conn.execute(
            "INSERT INTO reports (report_id, run_id, created_at, narrative_complete)"
            " VALUES (?, ?, ?, 1)",
            (report_id, run_id, created),
        )


def add_close(conn, cik, day, close):
    with conn:
        conn.execute(
            "INSERT INTO prices_daily VALUES (?, '', ?, ?, 100, 'test', 'x')", (cik, day, close)
        )


def test_list_companies_newest_first_with_latest_price(database):
    conn = database.conn
    add_report(conn, "run-1", "rep-1", 1045810, "NVDA", "2026-11-01T10:00:00+00:00")
    add_report(conn, "run-2", "rep-2", 19617, "JPM", "2026-11-02T10:00:00+00:00")
    add_report(conn, "run-3", "rep-3", 1045810, "NVDA", "2026-11-03T10:00:00+00:00")
    add_close(conn, 1045810, "2026-11-02", 190.0)
    add_close(conn, 1045810, "2026-11-04", 200.13)
    rows = list_companies(conn)
    assert [r["ticker"] for r in rows] == ["NVDA", "JPM"]
    nvda, jpm = rows
    assert nvda["cik"] == 1045810 and nvda["report_id"] == "rep-3"
    assert nvda["report_date"] == "2026-11-03" and nvda["reports"] == 2
    assert nvda["price"] == 200.13 and nvda["price_date"] == "2026-11-04"
    assert jpm["reports"] == 1 and jpm["price"] is None and jpm["price_date"] is None


def test_search_ticker_prefix_before_name():
    rows = search_companies(None, "jp")
    assert rows[0]["ticker"] == "JPM"


def test_search_normalises_share_classes():
    for query in ("brk-b", "BRK.B", " brk.b "):
        assert search_companies(None, query)[0]["ticker"] == "BRK.B"


def test_search_by_name_and_alias():
    assert search_companies(None, "nvidia")[0]["ticker"] == "NVDA"
    assert search_companies(None, "google")[0]["ticker"] == "GOOGL"


def test_search_outside_the_index_is_empty():
    assert search_companies(None, "zzzz") == []
    assert search_companies(None, "  ") == []


def test_search_marks_existing_reports(database):
    add_report(database.conn, "run-1", "rep-1", 1045810, "NVDA", "2026-11-01T10:00:00+00:00")
    row = search_companies(database.conn, "nvda")[0]
    assert row["report_id"] == "rep-1" and row["report_date"] == "2026-11-01"
    assert row["cik"] == 1045810 and row["sector"]
    other = search_companies(database.conn, "jpm")[0]
    assert other["report_id"] is None and other["report_date"] is None


def test_search_gives_the_peer_group_rule_in_plain_words():
    """The rule comes from peers.yaml and the bundled list: the 40 largest others in the sector
    by index weight, or every other member of a smaller sector."""
    nvda = search_companies(None, "nvda")[0]
    assert nvda["peer_rule"] == (
        "Compared with the 40 largest other S&P 500 Information Technology companies,"
        " by index weight"
    )
    linde = search_companies(None, "lin")[0]
    assert linde["ticker"] == "LIN"
    assert linde["peer_rule"] == "Compared with the other 23 S&P 500 Materials companies"
    capped = search_companies(None, "lin", peer_cap=10)[0]
    assert capped["peer_rule"] == (
        "Compared with the 10 largest other S&P 500 Materials companies, by index weight"
    )


def test_peer_rule_reads_the_cap_from_the_methodology():
    from tearsheet.companies import bundled_peer_cap

    assert bundled_peer_cap() == 40
