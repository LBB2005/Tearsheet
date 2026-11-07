"""The Phase 0 terminal commands (design item 12)."""

from __future__ import annotations

from pathlib import Path

import pytest

from tearsheet import cli, config
from tearsheet.db import open_database


@pytest.mark.parametrize(
    "argv",
    [
        ["--data-dir", "/x", "set-setting", "primary_tool", "claude"],
        ["set-setting", "--data-dir", "/x", "primary_tool", "claude"],
        ["--data-dir", "/x", "lockdown-check"],
        ["lockdown-check", "--data-dir", "/x", "--short"],
    ],
)
def test_data_dir_works_before_or_after_the_command(argv):
    assert cli.build_parser().parse_args(argv).data_dir == "/x"


def test_data_dir_falls_back_to_the_default(tmp_path, monkeypatch):
    args = cli.build_parser().parse_args(["lockdown-check"])
    assert getattr(args, "data_dir", None) is None
    assert config.resolve_data_dir(None) == config.DEFAULT_DATA_DIR
    monkeypatch.setenv(config.DATA_DIR_ENV, str(tmp_path / "env-dir"))
    assert config.resolve_data_dir(None) == tmp_path / "env-dir"
    assert config.resolve_data_dir(str(tmp_path / "flag")) == tmp_path / "flag"


def test_set_setting_checks_and_stores_the_value(tmp_path, capsys):
    data = tmp_path / "data"
    assert (
        cli.main(["--data-dir", str(data), "set-setting", "sec_contact_email", "liam@example.com"])
        == 0
    )
    assert "Set sec_contact_email" in capsys.readouterr().out
    assert (
        cli.main(["--data-dir", str(data), "set-setting", "sec_contact_email", "not-an-email"]) == 2
    )
    assert "email" in capsys.readouterr().err
    db = open_database(data / "tearsheet.sqlite")
    assert config.Settings(db.conn).get("sec_contact_email") == "liam@example.com"
    db.close()


def test_set_key_reads_a_hidden_prompt_and_never_prints_the_key(monkeypatch, capsys, tmp_path):
    monkeypatch.setattr(cli.getpass, "getpass", lambda prompt: "  massive-secret-123  ")
    assert cli.main(["--data-dir", str(tmp_path), "set-key", "massive"]) == 0
    out = capsys.readouterr()
    assert "massive-secret-123" not in out.out + out.err
    assert config.get_key("massive") == "massive-secret-123"


def test_set_key_with_nothing_entered_saves_nothing(monkeypatch, tmp_path):
    monkeypatch.setattr(cli.getpass, "getpass", lambda prompt: "")
    assert cli.main(["--data-dir", str(tmp_path), "set-key", "fred"]) == 1
    assert config.get_key("fred") is None


def test_lockdown_check_without_codex_explains(tmp_path, capsys):
    assert cli.main(["--data-dir", str(tmp_path), "lockdown-check", "--tool", "codex"]) == 2
    err = capsys.readouterr().err
    assert "Codex wasn't found" in err and "codex login" in err


def test_lockdown_check_without_claude_code_explains(tmp_path, capsys):
    assert cli.main(["--data-dir", str(tmp_path), "lockdown-check", "--tool", "claude"]) == 2
    assert "wasn't found" in capsys.readouterr().err


def test_commands_refuse_a_newer_database(tmp_path, capsys):
    import sqlite3

    data = tmp_path / "data"
    open_database(data / "tearsheet.sqlite").close()
    raw = sqlite3.connect(data / "tearsheet.sqlite")
    raw.execute("PRAGMA user_version = 999")
    raw.close()
    assert cli.main(["--data-dir", str(data), "set-setting", "primary_tool", "claude"]) == 2
    assert "newer Tearsheet" in capsys.readouterr().err


def test_never_touches_the_real_default_folder(tmp_path):
    assert str(config.DEFAULT_DATA_DIR).startswith(str(tmp_path))
    assert not Path.home().joinpath(".tearsheet-canary").exists()


def test_run_offline_with_no_ai(monkeypatch, tmp_path, capsys):
    from tearsheet import pipeline
    from tearsheet.pipeline import RunResult

    seen = {}

    async def fake_run(self, query):
        seen["query"], seen["ai"], seen["data"] = query, self.ai, type(self.data).__name__
        return RunResult(
            self.run_id, "rep-1", "done_incomplete", tmp_path / "r.html", "Hold", ["a note"]
        )

    monkeypatch.setattr(pipeline.Run, "run", fake_run)
    code = cli.main(
        ["--data-dir", str(tmp_path / "d"), "run", "AAPL", "--no-ai", "--stored", str(tmp_path)]
    )
    out = capsys.readouterr().out
    assert code == 0
    assert seen == {"query": "AAPL", "ai": None, "data": "StoredData"}
    assert "Rating: Hold" in out and "a note" in out and "r.html" in out


def test_news_sites_with_nothing_read_yet(tmp_path, capsys):
    assert cli.main(["--data-dir", str(tmp_path), "news-sites"]) == 0
    assert "No articles have been read or skipped yet." in capsys.readouterr().out


def test_prices_status_says_how_many_have_the_window(tmp_path, capsys):
    from tearsheet.cli import main

    assert main(["--data-dir", str(tmp_path / "d"), "prices", "status"]) == 0
    out = capsys.readouterr().out
    assert "of " in out and "have 14 months of prices" in out
    assert "hasn't finished" in out


def test_prices_backfill_needs_a_massive_key(tmp_path, capsys):
    from tearsheet.cli import main

    assert main(["--data-dir", str(tmp_path / "d"), "prices", "backfill"]) == 1
    assert "No Massive key" in capsys.readouterr().out
