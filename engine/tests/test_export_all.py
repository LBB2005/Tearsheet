"""Export all data (export/all_data.py): one Excel file with every prediction, key number, factor
score and price Tearsheet has. Checked on a small hand-made store: AAA has two predictions (a
re-run) and a split since, BBB has one, and CCC has a prediction but no price at all."""

from __future__ import annotations

import base64
import io
import json
import sqlite3
import tempfile
from datetime import UTC, date, datetime
from pathlib import Path

import pytest
from openpyxl import load_workbook

from tearsheet.db import open_database
from tearsheet.export import all_data
from tearsheet.protocol import ExportAllResult
from tearsheet.report_numbers import METRIC_LABELS
from tearsheet.wording import ADVICE_LINE, PRICES_LINE
from tests.test_db import insert_prediction
from tests.test_protocol import Harness, run

AAA, BBB, CCC = 1001, 1002, 1003
NOW = datetime(2026, 11, 16, 15, 0, tzinfo=UTC)
SCORE_TABLE = [
    ["Factor", "Percentile", "Weight used"],
    ["profitability", "80", "30.0%"],
    ["momentum", "40", "25.0%"],
    ["valuation", "55", "20.0%"],
    ["capital discipline", "70", "10.0%"],
    ["balance sheet", "60", "7.5%"],
    ["earnings quality", "35", "7.5%"],
]


def _run(conn, run_id: str, cik: int, started: str) -> None:
    conn.execute(
        "INSERT INTO runs (run_id, cik, mode, ai_tool, started_at, status, engine_version,"
        " method_code_version, methodology_hash, reference_version)"
        " VALUES (?, ?, 'full', 'claude', ?, 'done', '0.1.0', 4, 'm', 'r')",
        (run_id, cik, started),
    )


def _report(conn, report_id: str, run_id: str, created: str, score: int) -> None:
    conn.execute(
        "INSERT INTO reports (report_id, run_id, created_at, narrative_complete) VALUES (?, ?, ?, 1)",
        (report_id, run_id, created),
    )
    body = {
        "sections": [
            {"key": "rating", "paragraphs": [f"Score: {score}th percentile of the peer group."]},
            {"key": "score", "paragraphs": [], "table": SCORE_TABLE},
        ]
    }
    conn.execute(
        "INSERT INTO sections (report_id, key, json) VALUES (?, 'report', ?)",
        (report_id, json.dumps(body)),
    )


def _store(path: Path) -> None:
    db = open_database(path)
    _fill(db.conn)
    db.close()


def _fill(c: sqlite3.Connection) -> None:
    c.executemany(
        "INSERT INTO companies (cik, name, sector) VALUES (?, ?, ?)",
        [
            (AAA, "Alpha Inc", "Information Technology"),
            (BBB, "Beta Corp", "Information Technology"),
            (CCC, "=Gamma Co", "Energy"),  # a name that looks like a formula stays text
        ],
    )
    c.executemany(
        "INSERT INTO tickers (ticker, cik, date_from) VALUES (?, ?, '2026-11-03')",
        [("AAA", AAA), ("BBB", BBB), ("CCC", CCC)],
    )
    # AAA: made on 3 Nov (priced at 2 Nov's close), re-run on 10 Nov (priced at 9 Nov's).
    _run(c, "r1", AAA, "2026-11-03T15:00:00+00:00")
    _run(c, "r2", AAA, "2026-11-10T15:00:00+00:00")
    _run(c, "r3", BBB, "2026-11-10T16:00:00+00:00")
    _run(c, "r4", CCC, "2026-11-10T17:00:00+00:00")
    _report(c, "rep1", "r1", "2026-11-03T15:20:00+00:00", 64)
    _report(c, "rep2", "r2", "2026-11-10T15:20:00+00:00", 72)
    _report(c, "rep3", "r3", "2026-11-10T16:20:00+00:00", 30)
    _report(c, "rep4", "r4", "2026-11-10T17:20:00+00:00", 50)
    common = {"bear": 80.0, "base": 120.0, "bull": 150.0, "probability": 0.55}
    insert_prediction(
        c,
        prediction_id="pA1",
        run_id="r1",
        cik=AAA,
        ticker="AAA",
        run_at="2026-11-03T15:00:00+00:00",
        rating="Hold",
        **common,
    )
    insert_prediction(
        c,
        prediction_id="pA2",
        run_id="r2",
        cik=AAA,
        ticker="AAA",
        run_at="2026-11-10T15:00:00+00:00",
        rating="Buy",
        previous_rating="Hold",
        model_ids_json='["claude-sonnet-5-5"]',
        uncertainty="very_high",
        **common,
    )
    insert_prediction(
        c,
        prediction_id="pB1",
        run_id="r3",
        cik=BBB,
        ticker="BBB",
        run_at="2026-11-10T16:00:00+00:00",
        rating="Sell",
        **common,
    )
    insert_prediction(
        c,
        prediction_id="pC1",
        run_id="r4",
        cik=CCC,
        ticker="CCC",
        run_at="2026-11-10T17:00:00+00:00",
        rating="Hold",
        **common,
    )
    c.execute(
        "INSERT INTO grades (prediction_id, horizon_months, graded_at, grading_version,"
        " start_price, results_json) VALUES ('pA1', 3, '2027-02-03T00:00:00+00:00', 1, 100,"
        ' \'{"hit": true, "excess": 0.042}\')'
    )
    # Prices: AAA split 2-for-1 on 12 Nov; CCC has none.
    closes = [
        (AAA, "2026-11-02", 100.0),
        (AAA, "2026-11-09", 110.0),
        (AAA, "2026-11-13", 60.0),
        (BBB, "2026-11-09", 50.0),
        (BBB, "2026-11-13", 45.0),
    ]
    c.executemany(
        "INSERT INTO prices_daily (cik, date, close_unadjusted, source, raw_hash)"
        " VALUES (?, ?, ?, 'massive', 'h')",
        closes,
    )
    c.execute(
        "INSERT INTO corporate_actions (cik, date, kind, ratio_or_amount, source)"
        " VALUES (?, '2026-11-12', 'split', 2, 'massive')",
        (AAA,),
    )
    # Metrics of the newest runs: AAA and BBB are each other's peer.
    for run_id, cik, peer in (("r2", AAA, BBB), ("r3", BBB, AAA)):
        c.execute(
            "INSERT INTO peer_groups (run_id, cik, peer_cik, weight) VALUES (?, ?, ?, 1)",
            (run_id, cik, peer),
        )
    for run_id in ("r2", "r3"):
        c.executemany(
            "INSERT INTO metrics (run_id, cik, name, value, inputs_json) VALUES (?, ?, ?, ?, '{}')",
            [
                (run_id, AAA, "operating_margin", 0.30),
                (run_id, BBB, "operating_margin", 0.10),
                (run_id, AAA, "interest_coverage", 12.0),
                (run_id, BBB, "interest_coverage", 4.0),
                (run_id, AAA, "momentum_12m", 0.5),  # internal: never a column
            ],
        )
    c.commit()


@pytest.fixture
def made(tmp_path):
    path = tmp_path / "data" / "tearsheet.sqlite"
    _store(path)
    before = path.read_bytes()
    result = all_data.build(path, app_version="1.2.3", now=lambda: NOW)
    assert path.read_bytes() == before  # read-only
    return result


def _sheet(result, name: str) -> list[dict]:
    wb = load_workbook(io.BytesIO(result.data))
    ws = wb[name]
    rows = list(ws.iter_rows(values_only=True))
    return [dict(zip(rows[0], r, strict=True)) for r in rows[1:]]


def test_the_book_has_six_clean_tabs(made):
    wb = load_workbook(io.BytesIO(made.data))
    assert wb.sheetnames == [
        "About",
        "Predictions",
        "All predictions",
        "Key numbers",
        "Factor scores",
        "Prices",
    ]
    for ws in wb:
        assert ws.freeze_panes == "A2"
        assert ws.auto_filter.ref and ws.auto_filter.ref.startswith("A1:")
        assert ws.column_dimensions["A"].width > 0
    assert made.file_name == "Tearsheet all data 16 Nov 2026.xlsx"
    assert made.rows == {
        "About": made.rows["About"],
        "Predictions": 3,
        "All predictions": 4,
        "Key numbers": 3,
        "Factor scores": 3,
        "Prices": 3,
    }


def test_about_says_when_versions_advice_and_every_column(made):
    rows = _sheet(made, "About")
    whats = [r["What it means"] for r in rows]
    assert "Tearsheet 1.2.3" in whats[0] and "engine " in whats[0]
    assert ADVICE_LINE in whats
    assert PRICES_LINE in whats
    tabs = {r["Tab"] for r in rows}
    assert tabs == set(made.rows)
    for col in all_data.PREDICTION + all_data.KEY_NUMBERS + all_data.FACTOR_SCORES:
        assert any(r["Column"] == col.head and r["What it means"] for r in rows), col.head


def test_predictions_has_each_companys_latest(made):
    rows = {r["Ticker"]: r for r in _sheet(made, "Predictions")}
    assert list(rows) == ["AAA", "BBB", "CCC"]
    a = rows["AAA"]
    assert a["Prediction ID"] == "pA2" and a["Rating"] == "Buy" and a["Previous rating"] == "Hold"
    assert a["Company"] == "Alpha Inc" and a["Sector"] == "Information Technology"
    assert a["Uncertainty"] == "Very high"
    assert a["Priced on"].date() == date(2026, 11, 9)
    assert a["Price on prediction day"] == 110.0
    # 13 Nov's 60 in the prediction day's shares (2-for-1 since): 120.
    assert a["Latest price"] == 120.0
    assert a["Latest price date"].date() == date(2026, 11, 13)
    assert a["Return so far"] == pytest.approx(120 / 110 - 1)
    assert a["Upside to base"] == pytest.approx(120 / 110 - 1)
    assert (a["Bear"], a["Base"], a["Bull"]) == (80.0, 120.0, 150.0)
    assert a["Chance of beating peers"] == 0.55
    assert a["AI models"] == "claude-sonnet-5-5"
    assert (
        a["Report date"].date()
        == datetime.fromisoformat("2026-11-10T15:20:00+00:00").astimezone().date()
    )
    assert a["3-month grade"] is None


def test_a_company_with_no_price_has_empty_price_cells(made):
    c = {r["Ticker"]: r for r in _sheet(made, "Predictions")}["CCC"]
    for key in (
        "Price on prediction day",
        "Latest price",
        "Latest price date",
        "Return so far",
        "Upside to base",
    ):
        assert c[key] is None
    assert c["Company"] == "=Gamma Co"  # text, not a formula
    assert c["Rating"] == "Hold"


def test_all_predictions_keeps_re_runs_by_ticker_then_date(made):
    rows = _sheet(made, "All predictions")
    assert [r["Prediction ID"] for r in rows] == ["pA1", "pA2", "pB1", "pC1"]
    assert [r["Newest for company"] for r in rows] == ["no", "yes", "yes", "yes"]
    first = rows[0]
    assert first["Price on prediction day"] == 100.0  # 2 Nov's close
    assert first["Latest price"] == 120.0
    assert first["Return so far"] == pytest.approx(0.2)
    assert first["3-month grade"] == "hit" and first["3-month excess return"] == 0.042
    assert set(rows[0]) == {c.head for c in all_data.ALL_PREDICTIONS}


def test_key_numbers_are_the_reports_metrics_with_peer_median_and_percentile(made):
    rows = {r["Ticker"]: r for r in _sheet(made, "Key numbers")}
    heads = list(next(iter(rows.values())))
    assert heads[:4] == ["Ticker", "Company", "Sector", "Report date"]
    assert len(heads) == 4 + 3 * len(METRIC_LABELS)
    assert not any("momentum" in h.lower() for h in heads)  # internal metrics are left out
    a = rows["AAA"]
    assert (
        a["Report date"].date()
        == datetime.fromisoformat("2026-11-10T15:20:00+00:00").astimezone().date()
    )
    assert a["Operating margin"] == 0.30
    assert a["Operating margin, peer median"] == 0.10
    assert a["Operating margin, percentile"] == 100
    assert a["Interest coverage"] == 12.0
    assert rows["BBB"]["Operating margin, percentile"] == 0
    assert rows["CCC"]["Operating margin"] is None  # no metrics stored for its run


def test_factor_scores_come_from_the_latest_report(made):
    rows = {r["Ticker"]: r for r in _sheet(made, "Factor scores")}
    a = rows["AAA"]
    assert a["Score"] == 72  # rep2, not rep1's 64
    assert a["Profitability percentile"] == 80 and a["Profitability weight"] == 0.3
    assert a["Earnings quality percentile"] == 35 and a["Earnings quality weight"] == 0.075
    assert a["Peer group"] == "40 largest in Information Technology"
    assert a["Peers"] == 1 and a["Peer tickers"] == "BBB"
    assert rows["CCC"]["Peers"] is None


def test_prices_are_a_row_per_day_and_a_column_per_ticker(made):
    rows = _sheet(made, "Prices")
    assert list(rows[0]) == ["Date", "AAA", "BBB"]  # CCC has no price
    assert [r["Date"].date() for r in rows] == [
        date(2026, 11, 2),
        date(2026, 11, 9),
        date(2026, 11, 13),
    ]
    assert [r["AAA"] for r in rows] == [100.0, 110.0, 60.0]  # as traded
    assert [r["BBB"] for r in rows] == [None, 50.0, 45.0]


def test_a_deleted_report_is_left_out_of_the_latest(tmp_path):
    path = tmp_path / "data" / "tearsheet.sqlite"
    _store(path)
    conn = sqlite3.connect(path)
    conn.execute("INSERT INTO hidden_reports (report_id, hidden_at) VALUES ('rep2', 'x')")
    conn.commit()
    conn.close()
    rows = {r["Ticker"]: r for r in _sheet(all_data.build(path, now=lambda: NOW), "Factor scores")}
    assert rows["AAA"]["Score"] == 64  # rep1


def test_an_empty_store_still_makes_a_file(tmp_path):
    path = tmp_path / "data" / "tearsheet.sqlite"
    open_database(path).close()
    result = all_data.build(path, now=lambda: NOW)
    assert {k: v for k, v in result.rows.items() if k != "About"} == {
        "Predictions": 0,
        "All predictions": 0,
        "Key numbers": 0,
        "Factor scores": 0,
        "Prices": 0,
    }
    assert load_workbook(io.BytesIO(result.data)).sheetnames[0] == "About"


def test_its_temporary_folder_is_removed(tmp_path, monkeypatch):
    path = tmp_path / "data" / "tearsheet.sqlite"
    _store(path)
    root = tmp_path / "scratch"
    root.mkdir()
    monkeypatch.setattr(tempfile, "tempdir", str(root))
    all_data.build(path, now=lambda: NOW)
    assert list(root.iterdir()) == []


def test_the_server_answers_export_all_in_base64(tmp_path):
    h = Harness(tmp_path)
    _fill(h.server.db.conn)

    async def go():
        return await h.call("export_all", {"app_version": "1.2.3"}, id_=5)

    reply = run(go())
    assert "result" in reply, reply
    result = ExportAllResult.model_validate(reply["result"])
    assert result.file_name.endswith(".xlsx") and result.rows["All predictions"] == 4
    wb = load_workbook(io.BytesIO(base64.b64decode(result.data_base64)))
    assert wb["Predictions"].max_row == 4
    assert "Tearsheet 1.2.3" in wb["About"]["C2"].value
    count = h.server.db.conn.execute("SELECT COUNT(*) FROM predictions").fetchone()[0]
    assert count == 4
    h.server.close()


def test_export_all_refuses_an_overlong_app_version(tmp_path):
    h = Harness(tmp_path)

    async def go():
        return await h.call("export_all", {"app_version": "x" * 41}, id_=6)

    reply = run(go())
    assert reply["error"]["code"] == -32602
    h.server.close()
