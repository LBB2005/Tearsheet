"""The SQLite connection and its upgrades (design item 5, Technical Plan §6).

The schema version is SQLite's `user_version`. Upgrades run in place after the file is
copied, and only add tables and columns, so an older engine can open a newer file read-only.
"""

from __future__ import annotations

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


def _copy_before_upgrade(conn: sqlite3.Connection, path: Path, current: int) -> Path:
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    copy_path = path.with_name(f"{path.name}.v{current}-{stamp}.bak")
    copy = sqlite3.connect(copy_path)
    try:
        conn.backup(copy)
    finally:
        copy.close()
    return copy_path


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
    version = pending[-1][0] if pending else current
    return Database(conn=conn, path=path, version=version, read_only=False)
