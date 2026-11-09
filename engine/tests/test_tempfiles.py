"""Temporary folders are removed, and old leftovers swept at start-up (security audit)."""

from __future__ import annotations

import os
import tempfile
import time
from pathlib import Path

from tearsheet import tempfiles
from tearsheet.ai import claude_code
from tearsheet.ai.claude_code import ClaudeCodeConnector


def _folder(path: Path, days: float = 0) -> Path:
    path.mkdir()
    return _aged(path, days) if days else path


def _aged(path: Path, days: float) -> Path:
    when = time.time() - days * 86400
    os.utime(path, (when, when))
    return path


def test_tests_never_write_to_the_macs_temp_folder(tmp_path):
    assert Path(tempfile.gettempdir()) == tmp_path / "tmp"


def test_the_sweep_removes_only_old_engine_folders(tmp_path):
    root = tmp_path / "t"
    root.mkdir()
    old = _aged(Path(tempfile.mkdtemp(prefix="tearsheet-launcher-", dir=root)), 2)
    new = Path(tempfile.mkdtemp(prefix="tearsheet-launcher-", dir=root))
    calls = _folder(root / "tearsheet-calls")
    old_call = _folder(calls / "abc", 3)
    new_call = _folder(calls / "def")
    other = _folder(root / "someone-elses-folder", 5)
    file = root / "tearsheet-launcher-file"
    file.write_text("x")
    _aged(file, 5)
    target = root / "elsewhere"
    target.mkdir()
    link = root / "tearsheet-launcher-link"
    link.symlink_to(target)

    assert tempfiles.sweep_stale(root) == 2
    assert not old.exists() and not old_call.exists()
    assert new.exists() and new_call.exists() and other.exists() and file.exists()
    assert link.is_symlink() and target.exists()


def test_the_sweep_never_raises(tmp_path):
    assert tempfiles.sweep_stale(tmp_path / "missing") == 0


def test_a_launcher_is_removed_at_exit_and_written_again_if_swept(tmp_path):
    program = tmp_path / "claude"
    program.write_text("#!/bin/sh\n")
    connector = ClaudeCodeConnector(program, calls_root=tmp_path / "calls")
    first = connector.launcher()
    assert first.parent in claude_code._LAUNCHER_DIRS
    # Swept while the engine runs: the next call writes it again.
    for f in first.parent.iterdir():
        f.unlink()
    first.parent.rmdir()
    again = connector.launcher()
    assert again.exists() and again.parent != first.parent
    assert first.parent not in claude_code._LAUNCHER_DIRS
    # The engine exits without closing the connector.
    claude_code._remove_launchers()
    assert not again.parent.exists() and not claude_code._LAUNCHER_DIRS
