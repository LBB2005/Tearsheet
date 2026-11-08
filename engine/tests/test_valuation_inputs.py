"""The valuation inputs saved with each run (step `valuation_inputs`), for the Excel download."""

from __future__ import annotations

import asyncio
import json
from datetime import date
from pathlib import Path

from tearsheet.data.membership import HoldingRow, Holdings, Refreshed
from tearsheet.methodology import load
from tearsheet.pipeline import Run
from tearsheet.rawstore import RawStore
from tearsheet.replay import COMPARED_STEPS, replay
from tearsheet.valuation import saved
from tests.test_pipeline import COMPANY, NOW, FakeData, N, run_full, run_slice
from tests.test_protocol import Harness
from tests.test_protocol import run as run_async
from tests.test_replay import LoggedData

FIXTURES = Path(__file__).parent / "fixtures" / "runs"


class Banks(FakeData):
    """The same made-up companies, filed as banks in the Financials sector."""

    async def holdings(self, sec_tickers, *, today):
        rows = [
            HoldingRow(f"T{i}", 1000 + i, f"Company {i}", "Financials", float(100 - i))
            for i in range(N)
        ]
        return Refreshed(Holdings(date(2026, 11, 3), "bundled", rows), None)

    async def submissions(self, cik):
        return {"name": f"Company {cik - 1000}", "sic": "6022"}


def stored(conn, run_id: str) -> dict:
    """The row as raw JSON, read strictly: a NaN or infinity in it would fail here."""
    (text,) = conn.execute(
        "SELECT json FROM step_outputs WHERE run_id = ? AND step = 'valuation_inputs'", (run_id,)
    ).fetchone()

    def refuse(name):
        raise AssertionError(f"{name} in the saved valuation inputs")

    return json.loads(text, parse_constant=refuse)


def test_a_full_run_saves_each_methods_assumptions_and_the_range_inputs(database, tmp_path):
    run, result = run_full(database, tmp_path)
    assert result.status == "done"
    row = stored(database.conn, run.run_id)
    company = run.members[COMPANY]

    assert row["version"] == saved.VERSION and row["cik"] == COMPANY
    assert row["risk_free"] == 0.042 and row["financial_class"] == ""
    assert row["value"] == company.valuation.value
    methods = {m["method"]: m for m in row["methods"]}
    assert set(methods) == {"dcf", "residual_income", "multiples"}
    for m in company.valuation.methods:
        assert methods[m.method]["value"] == m.value

    dcf = methods["dcf"]["details"]
    assert {
        "growth",
        "start_margin",
        "target_margin",
        "sales_to_capital",
        "discount_rate",
        "cost_of_equity",
        "cost_of_debt",
        "debt_weight",
        "terminal_growth",
        "terminal_share",
        "firm_value",
    } <= set(dcf)
    assert dcf["terminal_growth"] == min(0.025, 0.042)
    ri = methods["residual_income"]["details"]
    assert {"book_value", "start_roe", "target_roe", "payout", "cost_of_equity"} <= set(ri)
    multiples = methods["multiples"]["details"]
    assert {"pe_multiple", "ev_ebit_multiple", "pe_peers", "ev_ebit_peers"} <= set(multiples)
    assert multiples["pe_value"] == multiples["pe_multiple"] * row["company"]["diluted_eps"]

    # The company's own inputs and the peer figures the methods were built from.
    assert row["company"]["cik"] == COMPANY and row["company"]["revenue"] > 0
    assert {"tax_rate", "shares", "total_debt", "cash"} <= set(row["company"])
    assert row["peer_stats"]["median_margin"] == run.stats.median_margin

    rng = row["range"]
    bear, base, bull = run.rated[1].bear, run.rated[1].base, run.rated[1].bull
    assert (rng["bear"], rng["base"], rng["bull"]) == (bear, base, bull)
    assert rng["price"] == company.price[1] and rng["value"] == company.valuation.value
    assert rng["cost_of_equity"] == dcf["cost_of_equity"]
    assert rng["dividend_yield"] == company.dividend_yield
    assert rng["volatility"] == company.volatility
    assert rng["peer_median_volatility"] == run.stats.median_volatility
    assert rng["blended_volatility"] == run.rated[1].volatility

    # The rules the figures came from, so a what-if can be worked out the same way.
    assert row["rules"]["dcf"]["years"] == 10
    assert row["rules"]["range"]["value_gap_years"] == 3

    # The `value` row replay compares is unchanged, and the run still ends on the save step.
    (value_row,) = database.conn.execute(
        "SELECT json FROM step_outputs WHERE run_id = ? AND step = 'value'", (run.run_id,)
    ).fetchone()
    assert set(json.loads(value_row)) == {"risk_free", "value"}
    last = database.conn.execute(
        "SELECT last_step_done FROM runs WHERE run_id = ?", (run.run_id,)
    ).fetchone()[0]
    assert last == "save"
    assert saved.load(database.conn, run.run_id) == row


def test_a_bank_has_no_dcf_and_saves_residual_income_and_pe(database, tmp_path):
    run, result = run_full(database, tmp_path, data=Banks())
    assert run.members[COMPANY].financial_class == "bank"
    row = stored(database.conn, run.run_id)
    assert row["financial_class"] == "bank"
    methods = {m["method"]: m for m in row["methods"]}
    assert set(methods) == {"dcf", "residual_income", "pe"}
    assert methods["dcf"]["value"] is None
    assert "banks and insurers" in methods["dcf"]["reason"]
    assert methods["dcf"]["details"] == {}
    ri = methods["residual_income"]
    assert ri["value"] is not None, ri["reason"]
    assert {"book_value", "start_roe", "target_roe", "payout", "cost_of_equity"} <= set(
        ri["details"]
    )
    assert "pe_multiple" in methods["pe"]["details"]
    assert methods["pe"]["details"]["ev_ebit_value"] is None
    assert row["range"]["base"] == run.rated[1].base
    assert row["range"]["cost_of_equity"] == ri["details"]["cost_of_equity"]


def test_a_slice_run_saves_its_one_method_too(database, tmp_path):
    run, _, _ = run_slice(database, tmp_path)
    row = stored(database.conn, run.run_id)
    assert [m["method"] for m in row["methods"]] == ["dcf"]
    assert row["value"] == run.members[COMPANY].valuation.value


def test_the_new_row_is_left_out_of_replay_and_a_full_run_still_matches(
    database, tmp_path, monkeypatch
):
    from tearsheet.data import membership

    assert saved.STEP not in COMPARED_STEPS
    monkeypatch.setattr(membership, "MIN_ROWS", 1)
    rawstore = RawStore(tmp_path / "data" / "raw", database.conn)
    run = Run(
        database.conn,
        LoggedData(rawstore, "run-v"),
        None,
        load(),
        mode="full",
        now=NOW,
        out_dir=None,
        run_id="run-v",
        rawstore=rawstore,
    )
    asyncio.run(run.run("T0"))
    assert saved.load(database.conn, "run-v") is not None
    result = replay(database.path, "run-v", raw_dir=tmp_path / "data" / "raw")
    assert result.identical, result.differences
    assert result.compared == len(COMPARED_STEPS)


def test_runs_from_before_the_row_was_saved_still_replay_and_say_so():
    import sqlite3

    conn = sqlite3.connect(
        f"{(FIXTURES / 'tearsheet.sqlite').resolve().as_uri()}?mode=ro", uri=True
    )
    try:
        for run_id in ("run-fixture-slice", "run-fixture-full"):
            assert saved.load(conn, run_id) is None
    finally:
        conn.close()
    result = replay(FIXTURES / "tearsheet.sqlite", "run-fixture-full", raw_dir=FIXTURES / "raw")
    assert result.identical, result.differences


def test_the_app_writes_the_row_and_an_old_report_without_it_still_loads(tmp_path):
    h = Harness(tmp_path)

    async def go():
        await h.server.start()
        await h.call("run_report", {"query": "T0"})
        await h.finish()
        ready = h.notes("report_ready")[0]
        conn = h.server.db.conn
        assert saved.load(conn, ready["run_id"]) is not None
        # As a report made before this row existed: the row is gone, the report still opens.
        with conn:
            conn.execute(
                "DELETE FROM step_outputs WHERE run_id = ? AND step = ?",
                (ready["run_id"], saved.STEP),
            )
        assert saved.load(conn, ready["run_id"]) is None
        got = await h.call("get_report", {"report_id": ready["report_id"]}, id_=2)
        listed = await h.call("list_reports", {}, id_=3)
        return got, listed

    got, listed = run_async(go())
    assert "error" not in got and got["result"]["ticker"] == "T0"
    assert listed["result"][0]["rating"] in ("Buy", "Hold", "Sell")
    h.server.close()
