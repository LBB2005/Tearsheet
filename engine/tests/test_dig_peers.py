"""Dig deeper's peers part (dig/peers.py): the report's peer group with its stored numbers,
scores recomputed from them, and each member's newest prediction."""

from __future__ import annotations

import json
import math
import statistics
from datetime import date

import pytest

from tearsheet.data.membership import HoldingRow, Holdings
from tearsheet.data.prices import PriceStore
from tearsheet.data.sec import SUBMISSIONS_URL
from tearsheet.dig.peers import financial_members, peers_part, recompute_scores, restore_infinite
from tearsheet.dig.target import Target, target
from tearsheet.methodology import load
from tearsheet.rawstore import RawStore
from tearsheet.report_numbers import METRIC_LABELS, run_price_date
from tearsheet.watchlist import Shown
from tests.test_protocol import Harness, run
from tests.test_server_lookups import _one_report

HOLDINGS = Holdings(
    date(2026, 11, 3),
    "bundled",
    [
        HoldingRow(f"T{i}", 1000 + i, f"Company {i}", "Industrials", float(100 - i))
        for i in range(20)
    ],
)
LATER = "2026-12-01T00:00:00+00:00"
COUNTED = ("runs", "predictions", "reports", "metrics", "peer_groups", "report_levels")


@pytest.fixture
def ran(tmp_path):
    h = Harness(tmp_path, log_predictions=True)
    run(_one_report(h))
    yield h
    h.server.close()


def logged(conn):
    return conn.execute("SELECT run_id, cik, score, rating FROM predictions").fetchone()


def test_the_recomputed_composite_equals_the_logged_score(ran):
    conn = ran.server.db.conn
    p = logged(conn)
    scores = recompute_scores(
        conn, ran.paths.raw, p["run_id"], price_date=run_price_date(conn, p["run_id"])
    )
    assert len(scores) == 20
    assert scores[p["cik"]] == pytest.approx(p["score"], abs=1e-9)


def test_peer_rows_carry_the_reports_numbers_and_newest_predictions(ran):
    conn = ran.server.db.conn
    p = logged(conn)
    t = target(conn, 1000, HOLDINGS)
    part = peers_part(
        conn, ran.paths.raw, t, PriceStore(conn), HOLDINGS, up_to=t.close[0], before=LATER
    )
    assert part["state"] == "ok" and part["run_id"] == p["run_id"]
    made = conn.execute("SELECT created_at FROM reports").fetchone()[0]
    assert (part["report_date"], part["price_date"]) == (made[:10], "2026-11-04")
    assert [c["key"] for c in part["columns"]] == list(METRIC_LABELS)
    assert part["columns"][0] == {"key": "operating_margin", "label": "Operating margin"}
    first, peers = part["rows"][0], part["rows"][1:]
    assert first["is_company"] and (first["ticker"], first["name"]) == ("T0", "Company 0")
    assert first["rating"] == p["rating"] and first["rated_at"] == "2026-11-05"
    assert first["score"] == pytest.approx(p["score"])
    assert len(peers) == 19 and not any(r["is_company"] for r in peers)
    scores = [r["score"] for r in peers]
    assert scores == sorted(scores, reverse=True)
    stored = dict(
        conn.execute(
            "SELECT cik, value FROM metrics WHERE run_id = ? AND name = 'operating_margin'",
            (p["run_id"],),
        ).fetchall()
    )
    assert first["numbers"]["operating_margin"] == stored[1000]
    peer_values = [v for c, v in stored.items() if c != 1000 and v is not None]
    assert part["median"]["operating_margin"] == pytest.approx(statistics.median(peer_values))
    assert part["median"]["score"] == pytest.approx(statistics.median(scores))
    assert peers[0]["rating"] is None  # no peer has a report of its own
    assert part["recomputed_note"] == "Scores recomputed from the report's stored numbers."


def test_a_prediction_after_the_snapshot_time_is_not_shown(ran):
    conn = ran.server.db.conn
    t = target(conn, 1000, HOLDINGS)
    part = peers_part(
        conn, ran.paths.raw, t, PriceStore(conn), HOLDINGS, up_to=t.close[0], before="2026-11-01"
    )
    assert part["rows"][0]["rating"] is None and part["rows"][0]["rated_at"] is None


def test_recomputing_writes_nothing(ran):
    conn = ran.server.db.conn
    before = {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in COUNTED}
    t = target(conn, 1000, HOLDINGS)
    peers_part(conn, ran.paths.raw, t, PriceStore(conn), HOLDINGS, up_to=t.close[0], before=LATER)
    assert {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in COUNTED} == before


def test_peers_are_off_without_a_report_run(database, tmp_path):
    nothing = Shown(None, None, None, None, None, None)
    t = Target(1000, "T0", "Company 0", "Industrials", nothing, None, None, None)
    part = peers_part(
        database.conn,
        tmp_path,
        t,
        PriceStore(database.conn),
        HOLDINGS,
        up_to=date(2026, 11, 9),
        before=LATER,
    )
    assert part["state"] == "off" and part["note"] == "No report run to compare peers from."


def test_a_bank_peer_is_found_from_the_runs_stored_filing_list(database, tmp_path):
    conn = database.conn
    store = RawStore(tmp_path, conn)
    for cik, sic in ((2001, "6022"), (2002, "7372")):
        store.put(
            json.dumps({"sic": sic}).encode(),
            SUBMISSIONS_URL.format(cik=cik),
            "sec",
            "application/json",
            "run-x",
        )
    rules = load().peers
    found = financial_members(
        conn, tmp_path, "run-x", [2001, 2002, 2003], sector="Financials", rules=rules
    )
    assert found == {2001}
    assert (
        financial_members(conn, tmp_path, "run-x", [2001], sector="Industrials", rules=rules)
        == set()
    )


@pytest.mark.parametrize(
    ("name", "inputs", "financial", "restored"),
    [
        ("interest_coverage", {"ebit": 5.0, "interest_expense": None}, False, math.inf),
        ("interest_coverage", {"ebit": 5.0, "interest_expense": 0.0}, False, math.inf),
        ("interest_coverage", {"ebit": None, "interest_expense": None}, False, None),
        ("net_debt_to_ebitda", {"net_debt": 3.0, "ebitda": -1.0}, False, math.inf),
        ("net_debt_to_ebitda", {"net_debt": None, "ebitda": -1.0}, False, None),
        (
            "return_on_equity",
            {"net_income_common": 1.0, "average_common_equity": None},
            False,
            None,
        ),
    ],
)
def test_a_metric_stored_empty_because_it_was_infinite_is_restored(
    name, inputs, financial, restored
):
    """The run stores an infinite metric (no interest expense ranks best; EBITDA of zero or
    below ranks worst) as NULL, so the recompute reads its inputs to put it back."""
    assert restore_infinite(name, None, inputs, financial=financial) == restored


def test_a_metric_left_out_for_a_bank_stays_empty():
    inputs = {"ebit": 5.0, "interest_expense": None}
    assert restore_infinite("interest_coverage", None, inputs, financial=True) is None
