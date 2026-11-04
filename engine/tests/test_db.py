"""Database upgrades (design item 5)."""

from __future__ import annotations

import sqlite3

import pytest

from tearsheet.db import DatabaseTooNew, latest_version, open_database


def tables(conn) -> set[str]:
    return {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}


def test_new_database_gets_every_migration(tmp_path):
    db = open_database(tmp_path / "t.sqlite")
    assert db.version == latest_version() >= 1
    assert db.conn.execute("PRAGMA user_version").fetchone()[0] == db.version
    assert {"raw_objects", "fetch_log", "tool_versions", "settings"} <= tables(db.conn)
    assert db.conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    db.close()


def test_reopening_runs_nothing_and_keeps_data(tmp_path):
    path = tmp_path / "t.sqlite"
    db = open_database(path)
    with db.conn:
        db.conn.execute("INSERT INTO settings VALUES ('k', 'v')")
    db.close()
    again = open_database(path)
    assert again.conn.execute("SELECT value FROM settings WHERE key = 'k'").fetchone()[0] == "v"
    assert not list(tmp_path.glob("*.bak"))
    again.close()


def test_newer_database_opens_read_only(tmp_path):
    path = tmp_path / "t.sqlite"
    open_database(path).close()
    raw = sqlite3.connect(path)
    raw.execute(f"PRAGMA user_version = {latest_version() + 5}")
    raw.close()

    db = open_database(path)
    assert db.read_only
    db.require_writable("replay")
    db.require_writable("export-log")
    with pytest.raises(DatabaseTooNew, match="read-only"):
        db.require_writable("set-setting")
    with pytest.raises(sqlite3.OperationalError):
        db.conn.execute("INSERT INTO settings VALUES ('k', 'v')")
    db.close()


def test_an_older_database_is_copied_before_an_upgrade(tmp_path, monkeypatch):
    from tearsheet import db as db_module

    path = tmp_path / "t.sqlite"
    open_database(path).close()
    real = db_module.migrations()
    extra = (real[-1][0] + 1, "CREATE TABLE later_table (id INTEGER PRIMARY KEY);")
    monkeypatch.setattr(db_module, "migrations", lambda: [*real, extra])

    upgraded = db_module.open_database(path)
    assert upgraded.version == extra[0]
    assert "later_table" in tables(upgraded.conn)
    copies = list(tmp_path.glob("t.sqlite.v*.bak"))
    assert len(copies) == 1
    copy = sqlite3.connect(copies[0])
    assert copy.execute("PRAGMA user_version").fetchone()[0] == real[-1][0]
    copy.close()
    upgraded.close()
