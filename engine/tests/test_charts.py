"""The price series behind the chart."""

from __future__ import annotations

import json

from tearsheet.charts import SPY_CIK, chart_series

DAYS = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]


def seed(conn, *, peers=True):
    with conn:
        conn.execute(
            "INSERT INTO runs (run_id, cik, mode, started_at, status, engine_version,"
            " method_code_version, methodology_hash, reference_version)"
            " VALUES ('run-1', 1, 'full', '2026-10-31T00:00:00+00:00', 'done', '1', 1, 'h', 'r')"
        )
        report = {
            "filings": [],
            "sections": [
                {
                    "key": "rating",
                    "paragraphs": [
                        "12-month range: bear $5.00, base $11.00, bull $20.00 (10th, 50th and 90th"
                        " percentiles). Uncertainty: high."
                    ],
                },
                {
                    "key": "watch",
                    "paragraphs": [
                        "Buy trigger: $9.50 (holding the score and the peer value gaps fixed).",
                        "Sell trigger: not reachable by price alone (holding the score fixed).",
                    ],
                },
            ],
        }
        conn.execute(
            "INSERT INTO reports (report_id, run_id, created_at, narrative_complete)"
            " VALUES ('rep-1', 'run-1', '2026-10-31T00:00:00+00:00', 1)"
        )
        conn.execute(
            "INSERT INTO sections (report_id, key, json) VALUES ('rep-1', 'report', ?)",
            (json.dumps(report),),
        )
        if peers:
            for peer in (2, 3):
                conn.execute(
                    "INSERT INTO peer_groups (run_id, cik, peer_cik, weight)"
                    " VALUES ('run-1', 1, ?, 0.5)",
                    (peer,),
                )

    def prices(cik, closes, first=0):
        with conn:
            for i, close in enumerate(closes):
                conn.execute(
                    "INSERT INTO prices_daily VALUES (?, '', ?, ?, ?, 't', 'x')",
                    (cik, DAYS[first + i], close, 1000 + i),
                )

    prices(1, [10, 10, 11, 12, 11])
    prices(2, [20, 22, 22, 22, 24], first=0)
    prices(3, [50, 50, 55, 55, 55])
    prices(SPY_CIK, [100, 101, 102, 101, 103])


def test_chart_series_aligns_peers_and_spy(database):
    seed(database.conn)
    s = chart_series(database.conn, 1, "run-1")
    assert s["dates"] == DAYS and s["first_date"] == DAYS[0]
    assert s["close"] == [10, 10, 11, 12, 11] and s["volume"][0] == 1000
    assert len(s["peers"]) == len(s["dates"]) == len(s["spy"])
    assert s["peers"][0] == 100.0
    # day 2: peer 2 +10%, peer 3 flat -> equal-weighted buy-and-hold 105
    assert round(s["peers"][1], 6) == 105.0
    assert s["spy"][0] == 100.0 and round(s["spy"][4], 6) == 103.0
    assert s["trigger"] == 9.5
    assert s["range"] == {"bear": 5.0, "base": 11.0, "bull": 20.0}
    assert s["filings"] == []


def test_chart_series_without_peers_is_none_filled(database):
    seed(database.conn, peers=False)
    s = chart_series(database.conn, 1, "run-1")
    assert s["peers"] == [None] * 5


def test_chart_series_filing_dates_come_from_the_stored_submissions(database, rawstore):
    seed(database.conn)
    block = {
        "accessionNumber": ["0000000001-26-000001", "0000000001-26-000002"],
        "form": ["10-K", "8-K"],
        "filingDate": ["2026-10-27", "2026-10-29"],
    }
    rawstore.put(
        json.dumps({"filings": {"recent": block, "files": []}}).encode(),
        "https://data.sec.gov/submissions/CIK0000000001.json",
        "sec",
        "application/json",
        "run-1",
    )
    with database.conn:
        row = database.conn.execute("SELECT json FROM sections WHERE key = 'report'").fetchone()
        report = json.loads(row[0])
        report["filings"] = [
            {"form": "8-K", "accession": "0000000001-26-000002", "url": "u"},
            {"form": "10-K", "accession": "0000000001-26-000001", "url": "u"},
            {"form": "10-Q", "accession": "unknown", "url": "u"},
        ]
        database.conn.execute("UPDATE sections SET json = ?", (json.dumps(report),))
    s = chart_series(database.conn, 1, "run-1")
    assert s["filings"] == [
        {"date": "2026-10-27", "form": "10-K"},
        {"date": "2026-10-29", "form": "8-K"},
    ]
