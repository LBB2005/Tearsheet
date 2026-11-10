"""The SQLite connection and its upgrades (design item 5, Technical Plan §6).

The schema version is SQLite's `user_version`. Upgrades run in place after the file is
copied, and only add tables and columns, so an older engine can open a newer file read-only.
"""

from __future__ import annotations

import glob
import os
import re
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from importlib import resources
from pathlib import Path

# Commands that may run on a database written by a newer engine (opened read-only).
READ_ONLY_COMMANDS = frozenset({"replay", "export-log"})

_MIGRATION_NAME = re.compile(r"^(\d{4})_[a-z0-9_]+\.sql$")


class DatabaseTooNew(Exception):
    """The database was written by a newer engine, so this command can't run on it."""


@dataclass
class Database:
    conn: sqlite3.Connection
    path: Path
    version: int
    read_only: bool

    def require_writable(self, command: str) -> None:
        if self.read_only and command not in READ_ONLY_COMMANDS:
            raise DatabaseTooNew(
                f"This data folder was written by a newer Tearsheet (database version "
                f"{self.version}; this engine knows up to {latest_version()}). It is open "
                f"read-only, so only {' and '.join(sorted(READ_ONLY_COMMANDS))} can run. "
                "Update Tearsheet to use it."
            )

    def close(self) -> None:
        self.conn.close()


def migrations() -> list[tuple[int, str]]:
    """Every `NNNN_*.sql` file shipped in `db/migrations`, in order, as (number, SQL)."""
    found = []
    for entry in (resources.files("tearsheet.db") / "migrations").iterdir():
        match = _MIGRATION_NAME.match(entry.name)
        if match:
            found.append((int(match.group(1)), entry.read_text(encoding="utf-8")))
    return sorted(found)


def latest_version() -> int:
    return migrations()[-1][0]


def _configure(conn: sqlite3.Connection) -> sqlite3.Connection:
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# Copies hold the user's whole research history: readable by the user only.
FILE_MODE = 0o600
FOLDER_MODE = 0o700


def _private_copy(conn: sqlite3.Connection, target: Path) -> None:
    """Copy the database to `target`, a new file only the user can read. The file is made
    with its mode before SQLite writes to it, so it is never readable by others."""
    os.close(os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, FILE_MODE))
    try:
        copy = sqlite3.connect(target)
        try:
            conn.backup(copy)
        finally:
            copy.close()
    except BaseException:
        # A half-written copy would sort as the newest and push a good one out.
        target.unlink(missing_ok=True)
        raise
    os.chmod(target, FILE_MODE)


# Copies made before an upgrade (`<name>.v<N>-<stamp>.bak`): the newest are kept after an
# upgrade succeeds.
UPGRADE_COPIES_KEPT = 2


def _copy_before_upgrade(conn: sqlite3.Connection, path: Path, current: int) -> Path:
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    copy_path = path.with_name(f"{path.name}.v{current}-{stamp}.bak")
    _private_copy(conn, copy_path)
    return copy_path


def _prune_upgrade_copies(path: Path) -> None:
    """Keep only the newest `UPGRADE_COPIES_KEPT` copies made before upgrades, by the time
    in their name."""
    copies = sorted(
        path.parent.glob(f"{glob.escape(path.name)}.v*-*.bak"),
        key=lambda p: p.name.rsplit("-", 1)[-1],
    )
    for old in copies[:-UPGRADE_COPIES_KEPT]:
        old.unlink(missing_ok=True)


BACKUPS_KEPT = 10
# Of those, the newest few are kept as they are; the rest are one per earlier day. A copy is
# made after every official prediction, so a run of reports used to leave ten copies from the
# last quarter of an hour and nothing older (seen on 10 Nov 2026).
BACKUPS_NEWEST = 5


def _backups_to_keep(copies: list[Path]) -> set[Path]:
    """The newest `BACKUPS_NEWEST` copies, then the newest copy of each earlier day, up to
    `BACKUPS_KEPT` in all. `copies` are sorted oldest first (their names hold UTC stamps)."""
    newest = copies[-BACKUPS_NEWEST:]
    keep = set(newest)
    days = {p.name.removeprefix("tearsheet-")[:8] for p in newest}
    for p in reversed(copies[:-BACKUPS_NEWEST]):
        if len(keep) >= BACKUPS_KEPT:
            break
        day = p.name.removeprefix("tearsheet-")[:8]
        if day not in days:
            keep.add(p)
            days.add(day)
    return keep


def backup(conn: sqlite3.Connection, folder: Path, *, stamp: str | None = None) -> Path:
    """A live copy of the database with SQLite's online backup (design item 16). Keeps
    `BACKUPS_KEPT` copies in `folder`: the newest few and one for each day before them. A folder
    this makes is the user's only (0700), as is each copy (0600)."""
    if not folder.exists():
        folder.mkdir(parents=True, mode=FOLDER_MODE)
        os.chmod(folder, FOLDER_MODE)
    stamp = stamp or datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    target = folder / f"tearsheet-{stamp}.sqlite"
    if target.exists():
        target.unlink()
    _private_copy(conn, target)
    copies = sorted(folder.glob("tearsheet-*.sqlite"))
    keep = _backups_to_keep(copies)
    for old in copies:
        if old not in keep:
            old.unlink()
            for extra in ("-wal", "-shm"):
                old.with_name(old.name + extra).unlink(missing_ok=True)
    # Copies made before this rule become private too.
    for kept in keep:
        if kept.stat().st_mode & 0o077:
            os.chmod(kept, FILE_MODE)
    return target


def open_database(path: Path) -> Database:
    """Open the database, upgrading it if this engine knows newer migrations.

    A database newer than this engine opens read-only (see `Database.require_writable`).
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = _configure(sqlite3.connect(path))
    current = conn.execute("PRAGMA user_version").fetchone()[0]
    known = migrations()
    newest = known[-1][0]

    if current > newest:
        conn.close()
        ro = _configure(sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro", uri=True))
        return Database(conn=ro, path=path, version=current, read_only=True)

    conn.execute("PRAGMA journal_mode = WAL")
    pending = [(number, sql) for number, sql in known if number > current]
    if pending and current > 0:
        _copy_before_upgrade(conn, path, current)
    for number, sql in pending:
        # executescript commits first, so the migration and its version number
        # are applied together inside one explicit transaction.
        conn.executescript(f"BEGIN;\n{sql}\nPRAGMA user_version = {number};\nCOMMIT;")
    if pending and current > 0:
        _prune_upgrade_copies(path)
    version = pending[-1][0] if pending else current
    return Database(conn=conn, path=path, version=version, read_only=False)
