"""The golden set (design item 40), offline: the committed stored test runs serve as a tiny
golden store holding the synthetic company T0."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from tearsheet import cli, golden
from tests.test_pipeline import NOW

STORE = Path(__file__).parent / "fixtures" / "runs"


@pytest.fixture
def store(tmp_path):
    copy = tmp_path / "store"
    shutil.copytree(STORE, copy)  # the eval must not write to it; a copy proves nothing leaks
    return copy


def evals(tmp_path, checks=()):
    folder = tmp_path / "evals"
    folder.mkdir()
    (folder / "tickers.yaml").write_text(
        "as_of: null\ntickers:\n  - {ticker: T0, cases: [negative_book_value, bank, made_up]}\n"
    )
    golden.set_as_of(folder, NOW)
    (folder / "hand_checked.yaml").write_text(json.dumps({"checks": list(checks)}))
    return folder


def test_the_offline_run_rates_each_company_from_the_store_alone(store):
    before = (store / "tearsheet.sqlite").read_bytes()
    [result] = golden.run_all(store, [{"ticker": "T0"}], NOW)
    assert result.status in ("done", "done_incomplete") and result.error is None
    assert result.rating in ("Buy", "Hold", "Sell")
    assert result.score is not None and result.numbers["revenue"] > 0
    assert result.numbers["price_date"] == "2026-11-04"
    assert (store / "tearsheet.sqlite").read_bytes() == before  # the store is never written
    # The same inputs give the same answer every time.
    assert golden.run_all(store, [{"ticker": "T0"}], NOW)[0].rated() == result.rated()


def test_hand_checked_numbers_within_half_a_percent_and_exact_counts():
    r = golden.Result(
        "T0",
        "done",
        numbers={"revenue": 1000.0, "diluted_shares": 100.0, "period_end": "2026-09-30"},
    )
    checks = [
        {"ticker": "T0", "field": "revenue", "value": 1004.0, "checked": True},  # 0.4% off: fine
        {"ticker": "T0", "field": "revenue", "value": 1010.0, "checked": True},  # 1% off
        {"ticker": "T0", "field": "diluted_shares", "value": 101, "checked": True},  # must match
        {"ticker": "T0", "field": "period_end", "value": "2026-09-30", "checked": True},
        {"ticker": "T0", "field": "revenue", "value": 1.0, "checked": False},  # a draft: skipped
        {"ticker": "T0", "field": "cash", "value": 5.0, "checked": True},  # not computed
    ]
    problems = golden.check_numbers([r], checks)
    assert len(problems) == 3
    assert "1,010" in problems[0] and "-0.99%" in problems[0]
    assert "must match exactly" in problems[1]
    assert "no value" in problems[2]


def test_a_company_that_lost_its_hard_case_is_flagged():
    r = golden.Result(
        "MCD",
        "done",
        facts={
            **dict.fromkeys(("financial_class", "sector", "name", "fiscal_year_end"), ""),
            "total_equity": 5.0,
        },
    )
    lines = golden.check_cases(
        [r], [{"ticker": "MCD", "cases": ["negative_book_value", "made_up"]}]
    )
    assert any("no longer shows 'negative_book_value'" in line for line in lines)
    assert any("'made_up' has no automatic test" in line for line in lines)


def test_changes_since_the_last_reviewed_run_are_listed():
    now = golden.Result("T0", "done", rating="Hold", score=40.0, bear=8.0, base=10.0, bull=13.0)
    assert golden.compare([now], None)[0].startswith("no last_run.json yet")
    last = json.loads(golden.last_run_json([now], NOW))
    assert golden.compare([now], last) == []
    moved = golden.Result("T0", "done", rating="Buy", score=40.0, bear=8.0, base=11.0, bull=13.0)
    assert golden.compare([moved], last) == ["T0 rating: Hold -> Buy", "T0 base: 10.0 -> 11.0"]


def test_the_freeze_time_round_trips_through_tickers_yaml(tmp_path):
    folder = evals(tmp_path)
    as_of, tickers = golden.load_tickers(folder)
    assert as_of == NOW and tickers[0]["ticker"] == "T0"


def test_eval_golden_end_to_end(tmp_path, store, capsys):
    folder = evals(tmp_path)
    args = [
        "--data-dir",
        str(tmp_path / "data"),
        "eval",
        "golden",
        "--store",
        str(store),
        "--evals",
        str(folder),
    ]
    assert cli.main([*args, "--update"]) == 0
    assert (folder / "last_run.json").exists()
    capsys.readouterr()
    assert cli.main(args) == 0
    out = capsys.readouterr().out
    assert "No changes since last_run.json." in out
    assert "'made_up' has no automatic test" in out
    drafts = cli.main([*args, "--draft-checks"])
    assert drafts == 0 and "checked: false" in capsys.readouterr().out


def test_a_failed_hand_check_fails_the_eval(tmp_path, store, capsys):
    folder = evals(tmp_path, [{"ticker": "T0", "field": "revenue", "value": 1.0, "checked": True}])
    args = [
        "--data-dir",
        str(tmp_path / "data"),
        "eval",
        "golden",
        "--store",
        str(store),
        "--evals",
        str(folder),
    ]
    assert cli.main(args) == 1
    assert "T0 revenue" in capsys.readouterr().out


def test_eval_golden_before_the_freeze_says_how(tmp_path, capsys):
    folder = tmp_path / "evals"
    folder.mkdir()
    (folder / "tickers.yaml").write_text("as_of: null\ntickers:\n  - {ticker: T0}\n")
    args = [
        "--data-dir",
        str(tmp_path / "data"),
        "eval",
        "golden",
        "--store",
        str(tmp_path / "none"),
        "--evals",
        str(folder),
    ]
    assert cli.main(args) == 2
    assert "--freeze" in capsys.readouterr().err


def test_predecessor_companies_are_added_to_the_frozen_store(tmp_path):
    """Exxon's new SEC number (2115436) has its old one (34088) listed in aliases.yaml: the
    top-up downloads only the old number's facts and its last two 10-Ks filed by the freeze."""
    import asyncio
    from datetime import UTC, datetime

    import httpx
    import respx

    from tearsheet import config
    from tearsheet.db import open_database

    store = tmp_path / "store"
    database = open_database(config.Paths(store).ensure().db)
    with database.conn:
        database.conn.execute(
            "INSERT INTO tickers (ticker, cik, share_class, conversion_ratio, date_from) "
            "VALUES ('XOM', 2115436, '', 1, '2026-11-01')"
        )
    settings = config.Settings(database.conn)
    settings.set("sec_contact_email", "test@example.com")
    rows = [  # accession, form, filed, primary document
        ("0000034088-26-000050", "15-12B", "2026-07-02", "d15.htm"),
        ("0000034088-26-000012", "10-K", "2026-02-18", "xom-20251231.htm"),
        ("0000034088-25-000010", "10-K", "2025-02-19", "xom-20241231.htm"),
        ("0000034088-24-000009", "10-K", "2024-02-21", "xom-20231231.htm"),
    ]
    subs = {
        "name": "EXXON MOBIL CORP",
        "filings": {
            "recent": {
                "accessionNumber": [r[0] for r in rows],
                "form": [r[1] for r in rows],
                "filingDate": [r[2] for r in rows],
                "reportDate": ["" for _ in rows],
                "primaryDocument": [r[3] for r in rows],
            },
            "files": [],
        },
    }

    def archive(request):
        name = request.url.path.rsplit("/", 1)[1]
        if name.endswith("-index.htm"):
            return httpx.Response(200, html="<html><body><table></table></body></html>")
        return httpx.Response(200, html=f"<html><body>{name}</body></html>")

    with respx.mock as mock:
        mock.get("https://data.sec.gov/submissions/CIK0000034088.json").mock(
            return_value=httpx.Response(200, json=subs)
        )
        mock.get("https://data.sec.gov/api/xbrl/companyfacts/CIK0000034088.json").mock(
            return_value=httpx.Response(200, json={"facts": {}})
        )
        mock.get(url__regex=r"https://www\.sec\.gov/Archives/edgar/data/34088/.*").mock(
            side_effect=archive
        )
        added = asyncio.run(
            golden.add_predecessors(
                store, datetime(2026, 11, 6, 2, 21, tzinfo=UTC), settings, progress=lambda _: None
            )
        )
    assert added == 1
    keys = {r[0] for r in database.conn.execute("SELECT request_key FROM fetch_log")}
    database.close()
    assert "https://data.sec.gov/api/xbrl/companyfacts/CIK0000034088.json" in keys
    docs = {k.rsplit("/", 1)[1] for k in keys if k.endswith(".htm") and "index" not in k}
    assert docs == {"xom-20251231.htm", "xom-20241231.htm"}  # the last two 10-Ks only
