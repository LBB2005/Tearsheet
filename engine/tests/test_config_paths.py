"""Where the engine finds the AI tools, and when it is a test copy (first-run design §6).

conftest's autouse fixture replaces `config.find_program` so no test finds the real tools; these
tests import the real one before that happens, and only ever point it at fake files.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from tearsheet import config
from tearsheet.config import find_program as real_find_program


@pytest.fixture(autouse=True)
def no_tearsheet_variables(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in list(os.environ):
        if name.startswith("TEARSHEET_"):
            monkeypatch.delenv(name)


def program(folder: Path, name: str, *, runs: bool = True) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / name
    path.write_text("#!/bin/sh\nexit 0\n")
    path.chmod(0o755 if runs else 0o644)
    return path


def test_a_set_path_that_is_there_is_used_over_the_path(tmp_path, monkeypatch):
    chosen = program(tmp_path / "test-tools", "claude")
    program(tmp_path / "on-path", "claude")
    monkeypatch.setenv(config.PATH_ENV, str(tmp_path / "on-path"))
    monkeypatch.setenv(config.CLAUDE_BIN_ENV, str(chosen))
    assert real_find_program("claude") == chosen


def test_a_set_path_that_isnt_there_is_not_found_with_no_look_on_the_path(tmp_path, monkeypatch):
    program(tmp_path / "on-path", "claude")
    program(tmp_path / "on-path", "codex")
    monkeypatch.setenv(config.PATH_ENV, str(tmp_path / "on-path"))
    monkeypatch.setenv(config.CLAUDE_BIN_ENV, str(tmp_path / "test-tools" / "claude"))
    monkeypatch.setenv(config.CODEX_BIN_ENV, str(tmp_path / "test-tools" / "codex"))
    assert real_find_program("claude") is None
    assert real_find_program("codex") is None


def test_a_set_path_that_cant_run_is_not_found(tmp_path, monkeypatch):
    monkeypatch.setenv(config.PATH_ENV, str(tmp_path / "on-path"))
    program(tmp_path / "on-path", "codex")
    stuck = program(tmp_path / "test-tools", "codex", runs=False)
    monkeypatch.setenv(config.CODEX_BIN_ENV, str(stuck))
    assert real_find_program("codex") is None
    # A folder at the path isn't a program either.
    monkeypatch.setenv(config.CODEX_BIN_ENV, str(tmp_path / "test-tools"))
    assert real_find_program("codex") is None


def test_with_no_path_set_each_tool_is_looked_up_on_the_path(tmp_path, monkeypatch):
    found = program(tmp_path / "on-path", "codex")
    monkeypatch.setenv(config.PATH_ENV, str(tmp_path / "on-path"))
    assert real_find_program("codex") == found
    assert real_find_program("claude") is None  # not on that PATH
    # Each tool's own variable decides only for that tool.
    monkeypatch.setenv(config.CLAUDE_BIN_ENV, str(tmp_path / "missing" / "claude"))
    assert real_find_program("codex") == found


def test_test_mode_is_on_only_with_the_test_folder(tmp_path, monkeypatch):
    assert not config.test_mode()
    monkeypatch.setenv(config.CLAUDE_BIN_ENV, str(program(tmp_path / "tools", "claude")))
    monkeypatch.setenv(config.CODEX_BIN_ENV, str(program(tmp_path / "tools", "codex")))
    monkeypatch.setenv(config.KEYCHAIN_SERVICE_ENV, "Tearsheet-test")
    assert not config.test_mode()  # program paths and a test Keychain alone don't turn it on
    assert config.test_state() == {}
    monkeypatch.setenv(config.TEST_TOOLS_ENV, str(tmp_path))
    assert config.test_mode()


def test_the_state_file_is_read_one_key_a_line(tmp_path, monkeypatch):
    monkeypatch.setenv(config.TEST_TOOLS_ENV, str(tmp_path))
    assert config.test_state() == {}  # no file yet
    (tmp_path / "state").write_text("claude=signed_in\n\ncodex = api_key\nnot a line\ncheck=fail\n")
    assert config.test_state() == {"claude": "signed_in", "codex": "api_key", "check": "fail"}
