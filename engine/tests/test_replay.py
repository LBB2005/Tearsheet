"""Replay (design item 38, Technical Plan §6): identical numbers from stored inputs."""

from __future__ import annotations

import asyncio
import json

from tearsheet.data import sec as sec_data
from tearsheet.data.fred import FRED_URL
from tearsheet.data.membership import IVV_HOLDINGS_URL, parse_ivv
from tearsheet.methodology import load
from tearsheet.pipeline import Run
from tearsheet.rawstore import RawStore
from tearsheet.replay import replay
from tests.test_pipeline import NOW, FakeData, N, company_facts

TICKERS = {
    str(i): {"cik_str": 1000 + i, "ticker": f"T{i}", "title": f"Company {i}"} for i in range(N)
}


def ivv_csv() -> str:
    lines = [
        'Fund Holdings as of,"Nov 04, 2026"',
        "Ticker,Name,Sector,Asset Class,Market Value,Weight (%),Notional Value,Quantity,Price,Location,Exchange,Currency,FX Rate,Market Currency,Accrual Date",
    ]
    lines += [
        f'"T{i}","CO {i}","Industrials","Equity","1","{100 - i}","1","1","1","US","NYSE","USD","1","USD","-"'
        for i in range(N)
    ]
    return "\n".join(lines)


class LoggedData(FakeData):
    """FakeData that saves each input in the raw store, as the live client does."""

    def __init__(self, rawstore: RawStore, run_id: str):
        super().__init__()
        self.store, self.run_id = rawstore, run_id

    def _put(self, url: str, data: bytes) -> None:
        self.store.put(data, url, "test", "application/json", self.run_id)

    async def sec_tickers(self):
        self._put(sec_data.TICKERS_URL, json.dumps(TICKERS).encode())
        return {row["ticker"]: row["cik_str"] for row in TICKERS.values()}

    async def holdings(self, sec_tickers, *, today):
        from tearsheet.data.membership import Refreshed

        self._put(IVV_HOLDINGS_URL, ivv_csv().encode())
        # Holdings below the 495-row check, so built directly for this small made-up sector.
        holdings = parse_ivv_small(ivv_csv(), sec_tickers)
        return Refreshed(holdings, None)

    async def submissions(self, cik):
        data = await super().submissions(cik)
        data["filings"] = {
            "recent": {
                "accessionNumber": ["0001-26-000002", "0001-26-000001"],
                "form": ["10-Q", "10-K"],
                "filingDate": ["2026-10-30", "2026-02-15"],
                "reportDate": ["2026-09-30", "2025-12-31"],
                "acceptanceDateTime": ["2026-10-30T16:30:00.000Z", "2026-02-15T16:30:00.000Z"],
                "items": ["", ""],
                "primaryDocument": ["q.htm", "k.htm"],
            }
        }
        self._put(sec_data.SUBMISSIONS_URL.format(cik=cik), json.dumps(data).encode())
        return data

    async def filing_documents(self, cik, *, today):
        from tearsheet.sources import Doc
        from tests.test_pipeline import ten_k, ten_q

        out = []
        for role, acc, name, body in (
            ("10-K", "0001-26-000001", "k.htm", ten_k()),
            ("10-Q", "0001-26-000002", "q.htm", ten_q()),
        ):
            url = sec_data.ARCHIVE_URL.format(cik=cik, folder=acc.replace("-", ""), name=name)
            self.store.put(body, url, "sec", "text/html", self.run_id)
            index = sec_data.ARCHIVE_URL.format(
                cik=cik, folder=acc.replace("-", ""), name=f"{acc}-index.htm"
            )
            out.append(Doc(role, role, acc, url, index, today, body))
        return out

    async def company_facts(self, cik):
        data = company_facts(cik - 1000)
        self._put(sec_data.COMPANY_FACTS_URL.format(cik=cik), json.dumps(data).encode())
        return data

    async def risk_free(self, day):
        obs = {"observations": [{"date": "2026-11-04", "value": "4.20"}]}
        self._put(
            f"{FRED_URL}?series_id=DGS10&file_type=json&observation_start=2026-10-06",
            json.dumps(obs).encode(),
        )
        return (day, 0.042)


def parse_ivv_small(text, sec_tickers):
    from tearsheet.data import membership

    old = membership.MIN_ROWS
    membership.MIN_ROWS = 1
    try:
        return parse_ivv(text, sec_tickers)
    finally:
        membership.MIN_ROWS = old


def logged_run(database, tmp_path, monkeypatch):
    from tearsheet.data import membership

    monkeypatch.setattr(membership, "MIN_ROWS", 1)
    rawstore = RawStore(tmp_path / "data" / "raw", database.conn)
    run = Run(
        database.conn,
        LoggedData(rawstore, "run-x"),
        None,
        load(),
        now=NOW,
        out_dir=None,
        run_id="run-x",
        rawstore=rawstore,
    )
    asyncio.run(run.run("T0"))
    return run


def counts(conn) -> dict[str, int]:
    return {
        t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        for t in ("runs", "metrics", "step_outputs", "reports", "predictions")
    }


def test_replay_gives_identical_numbers_and_writes_nothing(database, tmp_path, monkeypatch):
    logged_run(database, tmp_path, monkeypatch)
    before = counts(database.conn)
    result = replay(database.path, "run-x", raw_dir=tmp_path / "data" / "raw")
    assert result.identical, result.differences
    assert result.compared >= 5
    assert counts(database.conn) == before


def test_a_methodology_file_edited_after_the_run_still_replays_from_its_stored_copy(
    database, tmp_path, monkeypatch
):
    logged_run(database, tmp_path, monkeypatch)
    from tearsheet import methodology

    real = methodology.load

    def edited(*args, **kwargs):
        m = real(*args, **kwargs)
        weights = json.loads(json.dumps(m.weights))
        weights["factors"]["momentum"]["weight"] = 0.35
        weights["factors"]["profitability"]["weight"] = 0.20
        return methodology.Methodology(**{**m.__dict__, "weights": weights})

    monkeypatch.setattr(methodology, "load", edited)
    result = replay(database.path, "run-x", raw_dir=tmp_path / "data" / "raw")
    assert result.identical, result.differences


def test_a_changed_input_shows_as_a_difference(database, tmp_path, monkeypatch):
    logged_run(database, tmp_path, monkeypatch)
    with database.conn:
        database.conn.execute(
            "UPDATE step_outputs SET json = replace(json, 'Hold', 'Buy') WHERE step = 'rate'"
        )
        database.conn.execute(
            "UPDATE step_outputs SET json = replace(json, 'Sell', 'Buy') WHERE step = 'rate'"
        )
        database.conn.execute(
            "UPDATE step_outputs SET json = '{\"rating\": \"Nonsense\"}' WHERE step = 'rate'"
        )
    result = replay(database.path, "run-x", raw_dir=tmp_path / "data" / "raw")
    assert not result.identical
    assert any("rate" in d for d in result.differences)


def test_the_replay_command(database, tmp_path, monkeypatch, capsys):
    from tearsheet import cli

    logged_run(database, tmp_path, monkeypatch)
    code = cli.main(["--data-dir", str(database.path.parent), "replay", "run-x"])
    assert code == 0
    assert "identical numbers" in capsys.readouterr().out
    assert cli.main(["--data-dir", str(database.path.parent), "replay", "no-such-run"]) == 2


# --- resume (design item 34) ----------------------------------------------------------------


def test_a_usage_limit_then_resume(database, tmp_path, monkeypatch):
    from tearsheet.ai.client import AIClient, AIUsageLimit, ToolState
    from tearsheet.data import membership
    from tearsheet.pipeline import mark_interrupted, resume_run
    from tests.fakes.ai import FakeConnector
    from tests.test_pipeline import clean_ai

    monkeypatch.setattr(membership, "MIN_ROWS", 1)
    state = ToolState(database.conn, "claude")
    state.record_check(version="1.0", model_ids=["fake-small"], form="full", passed=True)

    def limited(request):
        if request.task == "narrate":
            return AIUsageLimit("You've hit your limit. Resets 3am")
        return clean_ai(request)

    rawstore = RawStore(tmp_path / "data" / "raw", database.conn)
    first = FakeConnector(default=limited)
    run = Run(
        database.conn,
        LoggedData(rawstore, "run-y"),
        AIClient(first, state, retry_wait_s=0),
        load(),
        mode="full",
        now=NOW,
        out_dir=None,
        run_id="run-y",
        rawstore=rawstore,
    )
    stopped = asyncio.run(run.run("T0"))
    assert stopped.status == "stopped"
    extracted = [r.task for r in first.requests].count("extract")
    assert extracted > 0

    second = FakeConnector(default=clean_ai)
    result = resume_run(
        database.conn,
        "run-y",
        raw_dir=tmp_path / "data" / "raw",
        ai=AIClient(second, state, retry_wait_s=0),
        out_dir=None,
    )
    assert result.run_id == "run-y" and result.status == "done"
    assert [r.task for r in second.requests].count("extract") == 0  # saved evidence, not read again
    assert (
        database.conn.execute("SELECT status FROM runs WHERE run_id = 'run-y'").fetchone()[0]
        == "done"
    )
    complete = [
        r[0]
        for r in database.conn.execute(
            "SELECT narrative_complete FROM reports WHERE run_id = 'run-y' ORDER BY created_at"
        )
    ]
    assert complete == [0, 1]
    assert database.conn.execute("SELECT COUNT(*) FROM runs").fetchone()[0] == 1

    with database.conn:
        database.conn.execute("UPDATE runs SET status = 'running' WHERE run_id = 'run-y'")
    assert mark_interrupted(database.conn) == 1
    assert database.conn.execute("SELECT status FROM runs").fetchone()[0] == "interrupted"


def test_only_stopped_or_interrupted_runs_resume(database, tmp_path, monkeypatch):
    import pytest

    from tearsheet.pipeline import resume_run
    from tearsheet.replay import ReplayError

    logged_run(database, tmp_path, monkeypatch)
    with pytest.raises(ReplayError, match="can't be resumed"):
        resume_run(database.conn, "run-x", raw_dir=tmp_path / "data" / "raw", ai=None, out_dir=None)


def test_the_resume_command_with_an_unknown_run(tmp_path):
    from tearsheet import cli

    assert cli.main(["--data-dir", str(tmp_path / "d"), "resume", "no-such-run"]) == 2


def test_a_logged_prediction_replays_identically_and_logs_nothing_more(
    database, tmp_path, monkeypatch
):
    from tearsheet.data import membership

    monkeypatch.setattr(membership, "MIN_ROWS", 1)
    rawstore = RawStore(tmp_path / "data" / "raw", database.conn)
    run = Run(
        database.conn,
        LoggedData(rawstore, "run-p"),
        None,
        load(),
        mode="full",
        now=NOW,
        out_dir=None,
        run_id="run-p",
        rawstore=rawstore,
        log_predictions=True,
        backup_dir=tmp_path / "backups",
    )
    asyncio.run(run.run("T0"))
    assert run.prediction_id is not None
    before = counts(database.conn)
    result = replay(database.path, "run-p", raw_dir=tmp_path / "data" / "raw")
    assert result.identical, result.differences
    assert counts(database.conn) == before and before["predictions"] == 1
