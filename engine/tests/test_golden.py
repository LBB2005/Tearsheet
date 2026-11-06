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
