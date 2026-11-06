"""Structured numbers read back out of stored reports (code-written lines and stored tables)."""

from __future__ import annotations

import json
from datetime import date, timedelta

from tearsheet.report_numbers import numbers_for, parse_code_lines, stored_numbers

LINES = {
    "rating": [
        "Rating: Hold (capped by a red flag). The rating is relative to the company's peer group.",
        "Score: 74th percentile of its peer group.",
        "12-month range: bear $130.16, base $233.70, bull $419.62 (10th, 50th and 90th percentiles)."
        " Uncertainty: very high.",
        "Total return over the past 12 months: NVDA -3.0%; peer group (equal-weighted) 45.2%;"
        " S&P 500 (SPY) 13.4%.",
    ],
    "valuation": [
        "Price: $200.13 on 4 Nov 2026.",
        "Estimated value: $236.36. Gap percentile among valued peers: 82.",
        "In this peer group today (before red-flag caps): 8 Buy, 26 Hold, 7 Sell.",
    ],
    "trends": ["Economic series (FRED): UNRATE 4.2% (1 Sep 2026); DGS10 4.9% (4 Nov 2026)."],
    "watch": [
        "Buy trigger: $263.73 (holding the score and the peer value gaps fixed).",
        "Sell trigger: not reachable by price alone (holding the score and the peer value gaps fixed).",
    ],
}
TABLES = {
    "score": [
        ["Factor", "Percentile", "Weight used"],
        ["profitability", "93", "30.0%"],
        ["momentum", "35", "25.0%"],
    ],
    "valuation": [
        ["Method", "Value per share", "Note"],
        ["DCF", "$115.24", ""],
        ["MULTIPLES", "$236.36", ""],
    ],
}


def make_report(lines=LINES, tables=TABLES) -> dict:
    sections = []
    for key in ("rating", "score", "valuation", "trends", "watch"):
        section: dict = {"key": key, "paragraphs": list(lines.get(key, []))}
        if key in tables:
            section["table"] = tables[key]
        sections.append(section)
    return {"sections": sections}


def test_reads_every_code_line():
    n = parse_code_lines(make_report())
    assert n["rating"] == {"call": "Hold", "capped": True, "uncertainty": "very high"}
    assert n["score"] == {"percentile": 74}
    assert n["range"] == {"bear": 130.16, "base": 233.70, "bull": 419.62}
    assert n["price"] == {"value": 200.13, "date": "4 Nov 2026"}
    assert n["estimate"] == {"value": 236.36, "gap_percentile": 82}
    assert n["triggers"]["buy"] == 263.73 and n["triggers"]["sell"] is None
    assert n["triggers"]["buy_text"].startswith("$263.73")
    assert n["triggers"]["sell_text"].startswith("not reachable by price alone")
    assert n["factors"][0] == {"name": "profitability", "percentile": 93, "weight": 0.30}
    assert n["methods"][0] == {"method": "DCF", "value": 115.24}
    assert n["returns_12m"] == {"company": -3.0, "peers": 45.2, "spy": 13.4}
    assert n["peer_ratings"] == {"Buy": 8, "Hold": 26, "Sell": 7}
    assert n["economy"][1] == {
        "series": "DGS10",
        "label": "10-year Treasury yield",
        "value": "4.9%",
        "date": "4 Nov 2026",
    }
    assert n["economy"][0]["label"] == "Unemployment rate"


def test_missing_lines_give_none():
    n = parse_code_lines({"sections": []})
    assert set(n) == {
        "rating",
        "score",
        "range",
        "price",
        "estimate",
        "triggers",
        "factors",
        "methods",
        "returns_12m",
        "peer_ratings",
        "economy",
    }
    assert all(v is None for v in n.values())


def test_odd_line_gives_none():
    lines = {**LINES, "rating": list(LINES["rating"])}
    lines["rating"][2] = "12-month range: unavailable."
    n = parse_code_lines(make_report(lines))
    assert n["range"] is None
    assert n["rating"]["call"] == "Hold"
    assert n["rating"]["uncertainty"] is None
    assert n["score"] == {"percentile": 74}


def test_unknown_fred_series_uses_its_id():
    lines = {**LINES, "trends": ["Economic series (FRED): XYZ 1.5% (1 Sep 2026)."]}
    n = parse_code_lines(make_report(lines))
    assert n["economy"] == [
        {"series": "XYZ", "label": "XYZ", "value": "1.5%", "date": "1 Sep 2026"}
    ]


METRICS = [
    "operating_margin",
    "return_on_invested_capital",
    "gross_profit_to_assets",
    "interest_coverage",
    "free_cash_flow_yield",
    "earnings_yield",
    "accruals_to_assets",
    "operating_cash_flow_to_net_income",
]


def seed(conn, started=date(2026, 11, 4)):
    conn.execute(
        "INSERT INTO runs (run_id, cik, mode, started_at, status, engine_version,"
        " method_code_version, methodology_hash, reference_version)"
        " VALUES ('r1', 1, 'full', ?, 'done', 'x', 1, 'h', 'v')",
        (f"{started.isoformat()}T20:00:00-05:00",),  # after that day's close is in
    )
    for peer in (2, 3, 4):
        conn.execute("INSERT INTO peer_groups VALUES ('r1', 1, ?, 0.33)", (peer,))
    for i, name in enumerate(METRICS):
        conn.execute("INSERT INTO metrics VALUES ('r1', 1, ?, ?, '{}')", (name, 10.0 + i))
        for peer in (2, 3, 4):
            conn.execute(
                "INSERT INTO metrics VALUES ('r1', ?, ?, ?, '{}')",
                (peer, name, float(peer * 3 + i)),
            )
    conn.execute("INSERT INTO reports VALUES ('rep1', 'r1', 'now', 1, NULL)")
    for n, removed in (("c1", 0), ("c2", 0), ("c3", 1)):
        conn.execute(
            "INSERT INTO claims VALUES (?, 'rep1', 'rating', 's', 'neutral', '[]', '[]', ?)",
            (n, removed),
        )
    for d in range(400):
        day = started - timedelta(days=d)
        conn.execute(
            "INSERT INTO prices_daily VALUES (1, '', ?, ?, 1000, 'massive', 'h')",
            (day.isoformat(), 100.0 + d),
        )
    # Prices after the run date must not be read.
    conn.execute(
        "INSERT INTO prices_daily VALUES (1, '', ?, 999.0, 1000, 'massive', 'h')",
        ((started + timedelta(days=3)).isoformat(),),
    )
    conn.execute(
        "INSERT INTO step_outputs VALUES ('r1', 'text', ?)",
        (json.dumps({"red_flags": ["risk_factor_change"]}),),
    )
    conn.commit()


def test_stored_numbers_from_tables(database):
    seed(database.conn)
    n = stored_numbers(database.conn, "r1", 1)
    assert [m["name"] for m in n["metrics"]] == METRICS
    first = n["metrics"][0]
    assert first["label"] == "Operating margin"
    assert first["value"] == 10.0
    assert first["peer_median"] == 9.0  # peers 6, 9, 12
    assert first["percentile"] == 67  # above two of the three peers (6, 9)
    assert n["metrics"][-1]["label"] == "Cash flow to net income"
    assert len(n["weekly"]) == 52
    assert n["weekly"][-1] == {"date": "2026-11-04", "close": 100.0}
    dates = [w["date"] for w in n["weekly"]]
    assert dates == sorted(dates) and len(set(dates)) == 52
    assert n["claims"] == {"kept": 2, "removed": 1}
    assert n["red_flags"] == ["risk_factor_change"]


def test_stored_numbers_for_an_unknown_run_are_none(database):
    n = stored_numbers(database.conn, "nope", 1)
    assert n == {"metrics": None, "weekly": None, "claims": None, "red_flags": None}


def test_numbers_for_merges_both(database):
    seed(database.conn)
    n = numbers_for(database.conn, make_report(), "r1", 1)
    assert n["rating"]["call"] == "Hold"
    assert n["claims"] == {"kept": 2, "removed": 1}


def test_weekly_closes_are_split_adjusted_to_the_run_date(database):
    """A 10-for-1 split in the past year draws no cliff: closes before it are divided by 10,
    and the last weekly close is the run-date close. A split after the run date counts for
    nothing here (the report's numbers are in the run date's shares)."""
    from tearsheet.data.prices import PriceStore

    started, split = date(2026, 11, 4), date(2026, 6, 10)
    conn = database.conn
    conn.execute(
        "INSERT INTO runs (run_id, cik, mode, started_at, status, engine_version,"
        " method_code_version, methodology_hash, reference_version)"
        " VALUES ('r1', 1, 'full', ?, 'done', 'x', 1, 'h', 'v')",
        (f"{started.isoformat()}T20:00:00-05:00",),  # after that day's close is in
    )
    for d in range(400):
        day = started - timedelta(days=d)
        close = 100.0 if day >= split else 1000.0  # unadjusted closes
        conn.execute(
            "INSERT INTO prices_daily VALUES (1, '', ?, ?, 1000, 'massive', 'h')",
            (day.isoformat(), close),
        )
    conn.execute(
        "INSERT INTO prices_daily VALUES (1, '', '2026-11-20', 50.0, 1000, 'massive', 'h')"
    )
    PriceStore(conn).store_splits(
        {
            "results": [
                {
                    "ticker": "X",
                    "execution_date": split.isoformat(),
                    "split_from": 1,
                    "split_to": 10,
                },
                {"ticker": "X", "execution_date": "2026-11-18", "split_from": 1, "split_to": 2},
            ]
        },
        {"X": (1, "")},
    )
    conn.commit()
    weekly = stored_numbers(conn, "r1", 1)["weekly"]
    assert len(weekly) == 52
    assert {w["close"] for w in weekly} == {100.0}
    assert weekly[-1] == {"date": "2026-11-04", "close": 100.0}


def test_weekly_closes_end_at_the_reports_price_date_on_a_split_day(database):
    """A run started on a 10-for-1 split's day, before that day's close is in, is priced at the
    day before's close, in pre-split shares. The weekly path ends there and stays in those
    shares, on the same scale as the report's range, even once the split day's close is stored."""
    from tearsheet.data.prices import PriceStore

    split = date(2026, 11, 4)
    conn = database.conn
    conn.execute(
        "INSERT INTO runs (run_id, cik, mode, started_at, status, engine_version,"
        " method_code_version, methodology_hash, reference_version)"
        " VALUES ('r1', 1, 'full', '2026-11-04T15:00:00+00:00', 'done', 'x', 1, 'h', 'v')"
    )
    for d in range(400):
        day = split - timedelta(days=d)
        close = 100.0 if day >= split else 1000.0  # unadjusted closes
        conn.execute(
            "INSERT INTO prices_daily VALUES (1, '', ?, ?, 1000, 'massive', 'h')",
            (day.isoformat(), close),
        )
    PriceStore(conn).store_splits(
        {
            "results": [
                {
                    "ticker": "X",
                    "execution_date": split.isoformat(),
                    "split_from": 1,
                    "split_to": 10,
                }
            ]
        },
        {"X": (1, "")},
    )
    conn.commit()
    weekly = stored_numbers(conn, "r1", 1)["weekly"]
    assert weekly[-1] == {"date": "2026-11-03", "close": 1000.0}
    assert {w["close"] for w in weekly} == {1000.0}


def test_odd_stored_rows_give_none_and_never_raise(database):
    """Saved reports always open: a list-shaped step output and a missing table leave their
    keys None instead of raising."""
    seed(database.conn)
    with database.conn:
        database.conn.execute("UPDATE step_outputs SET json = '[1, 2]' WHERE step = 'text'")
    n = numbers_for(database.conn, make_report(), "r1", 1)
    assert n["red_flags"] is None and n["claims"] == {"kept": 2, "removed": 1}
    database.conn.execute("DROP TABLE claims")
    n = numbers_for(database.conn, make_report(), "r1", 1)
    assert n["claims"] is None and n["rating"]["call"] == "Hold"


def test_claims_are_counted_for_the_report_asked_for(database):
    """A stopped run's partial report and the resumed full report share a run: each counts its
    own claims, and the run's newest report is the fallback."""
    seed(database.conn)
    with database.conn:
        database.conn.execute("INSERT INTO reports VALUES ('rep2', 'r1', 'then', 1, NULL)")
        for n in ("d1", "d2", "d3", "d4"):
            database.conn.execute(
                "INSERT INTO claims VALUES (?, 'rep2', 'rating', 's', 'neutral', '[]', '[]', 0)",
                (n,),
            )
    assert numbers_for(database.conn, {}, "r1", 1, report_id="rep1")["claims"] == {
        "kept": 2,
        "removed": 1,
    }
    assert numbers_for(database.conn, {}, "r1", 1, report_id="rep2")["claims"] == {
        "kept": 4,
        "removed": 0,
    }
    assert numbers_for(database.conn, {}, "r1", 1)["claims"] == {"kept": 4, "removed": 0}
