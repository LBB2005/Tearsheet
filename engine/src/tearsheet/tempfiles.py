"""The engine's temporary folders, and the sweep for ones left behind (security audit, 9 Nov 2026).

Each folder is removed when its owner is done with it, and every launcher folder again when the
engine exits (`atexit`; a SIGTERM from the app becomes KeyboardInterrupt in cli.py, so it runs).
An engine that was killed outright can't do either, so `sweep_stale` runs at each start and
removes this user's own folders of these kinds that are more than a day old. A launcher that was
swept while its engine still ran is simply written again on the next call.
"""

from __future__ import annotations

import logging
import os
import shutil
import stat
import tempfile
import time
from pathlib import Path

log = logging.getLogger(__name__)

# Folders made with tempfile.mkdtemp(prefix=...).
STALE_PREFIXES = ("tearsheet-launcher-",)
# The calls folder: one sub-folder per AI call or Codex home, each removed when done.
CALLS_FOLDER = "tearsheet-calls"
STALE_AFTER_S = 24 * 60 * 60


def _stale(path: Path, now: float, max_age_s: float) -> bool:
    """A real folder of this user's (not a link), untouched for more than `max_age_s`."""
    try:
        info = path.lstat()
    except OSError:
        return False
    return (
        stat.S_ISDIR(info.st_mode)
        and info.st_uid == os.getuid()
        and now - info.st_mtime > max_age_s
    )


def sweep_stale(
    root: Path | None = None, *, now: float | None = None, max_age_s: float = STALE_AFTER_S
) -> int:
    """Remove the engine's temporary folders left behind in `root` (the temp folder) that are
    more than `max_age_s` old. Returns how many were removed. Never raises."""
    root = Path(root or tempfile.gettempdir())
    now = time.time() if now is None else now
    removed = 0
    try:
        candidates = [p for p in root.iterdir() if p.name.startswith(STALE_PREFIXES)]
        calls = root / CALLS_FOLDER
        if calls.is_dir() and not calls.is_symlink():
            candidates += list(calls.iterdir())
    except OSError:
        return 0
    for path in candidates:
        if _stale(path, now, max_age_s):
            shutil.rmtree(path, ignore_errors=True)
            removed += not path.exists()
    if removed:
        log.info("Removed %d temporary folders left by an earlier engine.", removed)
    return removed
