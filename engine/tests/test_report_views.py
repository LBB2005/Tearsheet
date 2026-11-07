"""The report's numbers for the app's bigger views: each item with its readout, each peer's values,
and the longer total-return spans worked out from stored prices."""

from __future__ import annotations

import json
from datetime import date, timedelta
from statistics import mean

from tearsheet import readouts
from tearsheet.charts import SPY_CIK
from tearsheet.data.membership import load_bundled
from tearsheet.data.prices import PriceStore
from tearsheet.db import open_database
from tearsheet.pipeline import twelve_month_return
from tearsheet.protocol import ReportNumbers
from tearsheet.render import METRIC_KINDS, format_value
from tearsheet.report_numbers import run_price_date
from tearsheet.report_views import SPAN_SLACK_DAYS, peer_ticker, span_return, views_for
from tests.test_report_numbers import LINES, TABLES, make_report
from tests.test_report_numbers import seed as seed_numbers

STARTED = date(2026, 11, 4)
# Each peer's and SPY's close `d` days before the run: a start and a slope, so every 12-month
# return differs.
CLOSES = {2: (100.0, -0.1), 3: (50.0, 0.05), 4: (80.0, 0.0), SPY_CIK: (400.0, -0.05)}


def seed(conn, *, years: int | None = None, spy_years: int | None = None) -> None:
    """test_report_numbers' run, with tickers for peers 2 and 3 (4 has none), 400 days of closes
    for each peer and SPY, and optionally `years` of daily closes for the company and
    `spy_years` for SPY."""
    seed_numbers(conn, STARTED)
    for ticker, cik in (("AAA", 2), ("BBB", 3)):
        conn.execute(
            "INSERT INTO tickers (ticker, cik, share_class, conversion_ratio, date_from)"
            " VALUES (?, ?, '', 1, '2025-01-01')",
            (ticker, cik),
        )
    for cik, (start, slope) in CLOSES.items():
        _closes(conn, cik, range(400), lambda d, s=start, k=slope: s + k * d)
    if years:
        _closes(conn, 1, range(400, years * 366), lambda d: 100.0 + d)
    if spy_years:
        start, slope = CLOSES[SPY_CIK]
        _closes(conn, SPY_CIK, range(400, spy_years * 366), lambda d: start + slope * d)
    conn.commit()


def _closes(conn, cik: int, days, close) -> None:
    conn.executemany(
        "INSERT INTO prices_daily VALUES (?, '', ?, ?, 1000, 'massive', 'h')",
        [(cik, (STARTED - timedelta(days=d)).isoformat(), close(d)) for d in days],
    )


def views(conn, report: dict | None = None) -> dict:
    """views_for on run r1, checked against the protocol's shape."""
    got = views_for(
        conn,
        make_report() if report is None else report,
        "r1",
        1,
        report_id="rep1",
        ticker="NVDA",
    )
    ReportNumbers.model_validate({"report_id": "rep1", "ticker": "NVDA", **got})
    return got


def without_returns_line() -> dict:
    lines = {**LINES, "rating": [p for p in LINES["rating"] if not p.startswith("Total return")]}
    return make_report(lines)


def test_factors_and_methods_carry_their_readouts(database):
    seed(database.conn)
    v = views(database.conn)
    assert v["factors"][0] == {
        "name": "profitability",
        "percentile": 93,
        "weight": 0.3,
        "readout": "Profitability: 93rd percentile. Better than 93 of 100 peers. Counts for 30% "
        "of the score.",
    }
    assert v["methods"][0]["label"] == "Discounted cash flow"
    assert v["methods"][0]["readout"] == readouts.method("DCF", 115.24, 200.13)
    assert v["price"]["readout"] == "Price: $200.13 on 4 Nov 2026."
    assert v["estimate"] == {"value": 236.36, "readout": readouts.estimate(236.36, 200.13)}
    assert v["range"]["readout"].startswith("12-month range: $130.16 to $419.62")
    assert (v["range"]["bear"], v["range"]["base"], v["range"]["bull"]) == (130.16, 233.70, 419.62)
    assert v["score_readout"] == readouts.score(74)
    assert v["economy"][1]["readout"] == readouts.economy(
        "10-year Treasury yield", "4.9%", "4 Nov 2026"
    )


def test_readouts_compare_with_the_last_weekly_close_when_the_report_has_no_price(database):
    seed(database.conn)
    lines = {**LINES, "valuation": [p for p in LINES["valuation"] if not p.startswith("Price")]}
    v = views(database.conn, make_report(lines))
    assert v["price"] is None
    # The seed's close on the run date is 100.00.
    assert v["methods"][0]["readout"] == readouts.method("DCF", 115.24, 100.0)


def test_each_metric_lists_each_peers_value(database):
    seed(database.conn)
    first = views(database.conn)["metrics"][0]
    kind = METRIC_KINDS.get(first["name"], "percent")
    own = format_value(kind, 10.0)
    assert first["text"] == own
    assert first["median_text"] == format_value(kind, 9.0)
    assert first["readout"] == readouts.metric(
        "Operating margin", own, format_value(kind, 9.0), 67, "NVDA"
    )
    assert first["peers"] == [
        {
            "ticker": ticker,
            "value": value,
            "text": format_value(kind, value),
            "readout": readouts.peer_metric(
                ticker, "Operating margin", format_value(kind, value), own, "NVDA"
            ),
        }
        for ticker, value in (("CIK 4", 12.0), ("BBB", 9.0), ("AAA", 6.0))
    ]
    coverage = next(m for m in views(database.conn)["metrics"] if m["name"] == "interest_coverage")
    assert coverage["text"].endswith("×") and coverage["peers"][0]["text"].endswith("×")


def test_a_peers_ticker_is_the_bundled_one_then_its_newest_stored_one(database):
    conn = database.conn
    conn.executemany(
        "INSERT INTO tickers (ticker, cik, share_class, conversion_ratio, date_from)"
        " VALUES (?, ?, '', 1, ?)",
        [("NEW", 2, "2025-01-01"), ("OLD", 2, "2019-01-01"), ("XXXX", 1045810, "2025-01-01")],
    )
    holdings = load_bundled()
    assert peer_ticker(conn, holdings, 1045810) == holdings.tickers_of(1045810)[0] == "NVDA"
    assert peer_ticker(conn, holdings, 2) == "NEW"
    assert peer_ticker(conn, holdings, 9) == "CIK 9"


def test_one_year_uses_the_reports_own_figures(database):
    seed(database.conn)
    year = views(database.conn)["returns"][0]
    assert year["years"] == 1
    assert year["company"] == {
        "name": "NVDA",
        "value": -3.0,
        "readout": readouts.total_return("NVDA", -3.0, 1),
    }
    assert year["peers"] == {
        "name": "Peer group",
        "value": 45.2,
        "readout": readouts.total_return("Peer group", 45.2, 1, group=True),
    }
    assert year["spy"] == {
        "name": "S&P 500",
        "value": 13.4,
        "readout": readouts.total_return("S&P 500", 13.4, 1),
    }


def test_each_peers_12_month_return_is_worked_out_from_stored_prices(database):
    seed(database.conn)
    # A fifth peer with no stored prices has no return, and comes last.
    database.conn.execute("INSERT INTO peer_groups VALUES ('r1', 1, 5, 0.25)")
    store = PriceStore(database.conn)
    priced = run_price_date(database.conn, "r1")
    each = views(database.conn)["returns"][0]["each_peer"]
    names = {2: "AAA", 3: "BBB", 4: "CIK 4"}
    expected = {names[p]: round(100 * twelve_month_return(store, p, priced), 1) for p in (2, 3, 4)}
    assert {r["name"]: r["value"] for r in each[:3]} == expected
    assert [r["value"] for r in each[:3]] == sorted(expected.values(), reverse=True)
    assert each[3] == {
        "name": "CIK 5",
        "value": None,
        "readout": readouts.total_return("CIK 5", None, 1),
    }
    assert each[0]["readout"] == readouts.total_return(each[0]["name"], each[0]["value"], 1)


def test_without_the_reports_line_the_year_is_worked_out_too(database):
    seed(database.conn)
    database.conn.execute("INSERT INTO peer_groups VALUES ('r1', 1, 5, 0.25)")  # no prices
    store = PriceStore(database.conn)
    priced = run_price_date(database.conn, "r1")
    year = views(database.conn, without_returns_line())["returns"][0]
    assert year["company"]["value"] == round(100 * twelve_month_return(store, 1, priced), 1)
    assert year["spy"]["value"] == round(100 * twelve_month_return(store, SPY_CIK, priced), 1)
    # The mean of each peer's return, skipping the one with no prices, as the pipeline writes it.
    peers = mean(twelve_month_return(store, p, priced) for p in (2, 3, 4))
    assert year["peers"]["value"] == round(100 * peers, 1)
    assert [r["value"] for r in year["each_peer"]][-1] is None


def test_longer_spans_need_both_histories(tmp_path):
    opened = []

    def spans(case: str, **history: int) -> tuple[list[dict], PriceStore]:
        db = open_database(tmp_path / case / "tearsheet.sqlite")
        opened.append(db)
        seed(db.conn, **history)
        return views(db.conn)["returns"], PriceStore(db.conn)

    try:
        assert [s["years"] for s in spans("short")[0]] == [1]
        both, store = spans("both", years=6, spy_years=6)
        assert [s["years"] for s in both] == [1, 3, 5]
        assert [s["years"] for s in spans("company only", years=6)[0]] == [1]
        # A longer span's figures are the company's and SPY's own total returns over it.
        five = round(100 * span_return(store, 1, STARTED, 5), 1)
        assert both[2]["company"] == {
            "name": "NVDA",
            "value": five,
            "readout": readouts.total_return("NVDA", five, 5),
        }
        assert both[2]["spy"]["value"] == round(100 * span_return(store, SPY_CIK, STARTED, 5), 1)
    finally:
        for db in opened:
            db.close()


def test_longer_spans_leave_the_peers_off(database):
    seed(database.conn, years=6, spy_years=6)
    three = views(database.conn)["returns"][1]
    assert three["years"] == 3
    assert three["peers"] is None and three["each_peer"] == []


def test_span_return_allows_a_week_of_slack(database):
    store = PriceStore(database.conn)
    five_back = date(2021, 11, 4)

    def history(cik: int, first: date) -> None:
        days = (STARTED - first).days
        _closes(database.conn, cik, range(days + 1), lambda d: 100.0 + d)

    history(7, five_back + timedelta(days=5))
    history(8, five_back + timedelta(days=9))
    assert SPAN_SLACK_DAYS == 7
    # From the first stored close, 5 days after the start, to the run date's close.
    assert span_return(store, 7, STARTED, 5) == store.total_return(
        7, "", five_back + timedelta(days=5), STARTED
    )
    assert span_return(store, 8, STARTED, 5) is None
    # With fewer than two closes there is no return.
    _closes(database.conn, 9, [0], lambda d: 50.0)
    assert span_return(store, 9, STARTED, 1) is None


def test_span_return_counts_back_from_29_february_to_28_february(database):
    store = PriceStore(database.conn)
    end = date(2028, 2, 29)

    def history(cik: int, first: date) -> None:
        database.conn.executemany(
            "INSERT INTO prices_daily VALUES (?, '', ?, 100.0, 1000, 'massive', 'h')",
            [(cik, (first + timedelta(days=d)).isoformat()) for d in range((end - first).days + 1)],
        )

    history(7, date(2025, 2, 28) + timedelta(days=SPAN_SLACK_DAYS))
    history(8, date(2025, 2, 28) + timedelta(days=SPAN_SLACK_DAYS + 1))
    assert span_return(store, 7, end, 3) == 0.0
    assert span_return(store, 8, end, 3) is None


def test_tables_are_every_table_the_full_report_shows(database):
    seed(database.conn)
    tables = views(database.conn)["tables"]
    assert [t["key"] for t in tables] == ["score", "valuation"]
    assert [t["rows"] for t in tables] == [TABLES["score"], TABLES["valuation"]]
    report = make_report()
    report["sections"][1]["title"] = "Score"
    assert views(database.conn, report)["tables"][0]["title"] == "Score"


def test_the_checks_ring_lists_kept_by_section_and_each_removed_claim(database):
    seed(database.conn)
    report = make_report()
    report["sections"] += [
        {
            "key": "business",
            "title": "The business",
            "paragraphs": [],
            "sentences": [{"id": "b1", "text": "One."}, {"id": "b2", "text": "Two."}],
        },
        {"key": "news", "title": "News and views", "paragraphs": [], "sentences": []},
        {"key": "risks", "title": "Risks", "paragraphs": [], "sentences": [{"id": "r1"}]},
    ]
    report["removed"] = [
        {"id": "x", "text": "Revenue rose 12%.", "reasons": ["number not in source"]}
    ]
    ring = views(database.conn, report)["claims"]
    assert ring["total"] == 3  # the seed's two kept claims and one removed
    kept, removed = ring["slices"]
    assert (kept["key"], kept["count"]) == ("kept", 2)
    assert kept["readout"] == readouts.claims("kept", 2, 3)
    assert kept["items"] == [readouts.kept_item("The business", 2), readouts.kept_item("Risks", 1)]
    assert (removed["key"], removed["count"]) == ("removed", 1)
    assert removed["readout"] == readouts.claims("removed", 1, 3)
    assert removed["items"] == ["Revenue rose 12%. Removed: number not in source."]


def test_peer_rating_slices_have_no_list(database):
    seed(database.conn)
    ring = views(database.conn)["peer_ratings"]
    assert ring["total"] == 41
    assert [(s["key"], s["label"], s["count"]) for s in ring["slices"]] == [
        ("buy", "Buy", 8),
        ("hold", "Hold", 26),
        ("sell", "Sell", 7),
    ]
    assert all(s["items"] is None for s in ring["slices"])
    assert ring["slices"][0]["readout"] == readouts.peer_rating("Buy", 8, 41)


def test_red_flags_are_the_four_checks_then_any_other(database):
    seed(database.conn)
    v = views(database.conn)
    assert len(v["red_flags"]) == 4
    assert [f["code"] for f in v["red_flags"] if f["found"]] == ["risk_factor_change"]
    assert v["red_flags"][3]["readout"] == readouts.red_flag("Risk-factor change", True)
    assert v["red_flags"][0]["readout"] == readouts.red_flag("Restatement", False)
    assert (
        v["red_flags_readout"] == "1 of 4 checks found a red flag. Any one caps the rating at Hold."
    )
    with database.conn:
        database.conn.execute(
            "UPDATE step_outputs SET json = ? WHERE step = 'text'",
            (json.dumps({"red_flags": ["risk_factor_change", "auditor_change"]}),),
        )
    v = views(database.conn)
    assert [(f["code"], f["label"], f["found"]) for f in v["red_flags"][3:]] == [
        ("risk_factor_change", "Risk-factor change", True),
        ("auditor_change", "Auditor change", True),
    ]
    assert v["red_flags_readout"] == readouts.red_flags(2, 5)


def test_an_old_report_gives_none_never_an_error(database):
    seed(database.conn)
    got = views_for(database.conn, {"sections": []}, "nope", 1, report_id="nope", ticker="NVDA")
    assert set(got) == set(ReportNumbers.model_fields) - {"report_id", "ticker"}
    assert got["tables"] == []
    assert all(value is None for key, value in got.items() if key != "tables")
    ReportNumbers.model_validate({"report_id": "nope", "ticker": "NVDA", **got})
