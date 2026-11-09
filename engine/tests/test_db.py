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


def test_only_the_newest_two_upgrade_copies_are_kept(tmp_path, monkeypatch):
    from tearsheet import db as db_module

    path = tmp_path / "t.sqlite"
    open_database(path).close()
    for stamp in ("20250101T000000Z", "20250601T000000Z", "20260101T000000Z"):
        (tmp_path / f"t.sqlite.v1-{stamp}.bak").write_bytes(b"old")
    (tmp_path / "other.sqlite.v1-20240101T000000Z.bak").write_bytes(b"not ours")
    real = db_module.migrations()
    extra = (real[-1][0] + 1, "CREATE TABLE later_table (id INTEGER PRIMARY KEY);")
    monkeypatch.setattr(db_module, "migrations", lambda: [*real, extra])

    db_module.open_database(path).close()
    kept = sorted(p.name for p in tmp_path.glob("t.sqlite.v*.bak"))
    assert len(kept) == 2
    assert kept[0] == "t.sqlite.v1-20260101T000000Z.bak"
    assert kept[1].startswith(f"t.sqlite.v{real[-1][0]}-")  # the copy just made
    assert (tmp_path / kept[1]).stat().st_mode & 0o777 == 0o600
    assert (tmp_path / "other.sqlite.v1-20240101T000000Z.bak").exists()


def test_a_failed_upgrade_keeps_every_copy(tmp_path, monkeypatch):
    from tearsheet import db as db_module

    path = tmp_path / "t.sqlite"
    open_database(path).close()
    for stamp in ("20250101T000000Z", "20250601T000000Z"):
        (tmp_path / f"t.sqlite.v1-{stamp}.bak").write_bytes(b"old")
    real = db_module.migrations()
    monkeypatch.setattr(db_module, "migrations", lambda: [*real, (real[-1][0] + 1, "NOT SQL;")])
    with pytest.raises(sqlite3.Error):
        db_module.open_database(path)
    assert len(list(tmp_path.glob("t.sqlite.v*.bak"))) == 3


def test_backups_are_readable_by_the_user_only(tmp_path):
    from tearsheet.db import backup

    db = open_database(tmp_path / "t.sqlite")
    folder = tmp_path / "new" / "backups"
    made = backup(db.conn, folder, stamp="20261105T000000Z")
    assert folder.stat().st_mode & 0o777 == 0o700
    assert made.stat().st_mode & 0o777 == 0o600
    # A copy from before the rule is made private on the next backup.
    old = folder / "tearsheet-20261104T000000Z.sqlite"
    old.write_bytes(b"")
    old.chmod(0o644)
    backup(db.conn, folder, stamp="20261106T000000Z")
    assert old.stat().st_mode & 0o777 == 0o600
    # The same stamp twice replaces the copy.
    assert backup(db.conn, folder, stamp="20261106T000000Z").exists()
    db.close()


# --- Phase 1: report tables, write-once predictions and backups (items 16 and 17) -----------

REPORT_TABLES = {
    "companies",
    "tickers",
    "sp500_membership",
    "sp500_holdings",
    "filings",
    "paragraphs",
    "articles",
    "prices_daily",
    "corporate_actions",
    "metrics",
    "peer_groups",
    "runs",
    "step_outputs",
    "reports",
    "sections",
    "claims",
    "claim_reviews",
    "predictions",
    "grades",
    "evidence_cache",
}


def prediction_row(**overrides):
    row = {
        "prediction_id": "p1",
        "run_id": "r1",
        "cik": 320193,
        "ticker": "AAPL",
        "share_class": "",
        "run_at": "2026-11-05T02:00:00+00:00",
        "score": 61.0,
        "rating": "Hold",
        "uncertainty": "medium",
        "percentile_lines_json": "{}",
        "accessions_json": "[]",
        "latest_acceptance_at": "2026-10-31T16:30:00+00:00",
        "methodology_hash": "m",
        "method_code_version": 1,
        "engine_version": "0.0.1",
        "ai_tool": "claude",
        "model_ids_json": "[]",
        "inputs_hash": "i",
    }
    row.update(overrides)
    return row


def insert_prediction(conn, **overrides):
    row = prediction_row(**overrides)
    names = ", ".join(row)
    marks = ", ".join("?" for _ in row)
    conn.execute(f"INSERT INTO predictions ({names}) VALUES ({marks})", list(row.values()))


def test_the_report_tables_exist(tmp_path):
    db = open_database(tmp_path / "t.sqlite")
    assert REPORT_TABLES <= tables(db.conn)
    db.close()


def test_predictions_are_write_once(tmp_path):
    db = open_database(tmp_path / "t.sqlite")
    with db.conn:
        insert_prediction(db.conn)
    with pytest.raises(sqlite3.IntegrityError, match="write-once"):
        with db.conn:
            db.conn.execute("UPDATE predictions SET rating = 'Buy'")
    with pytest.raises(sqlite3.IntegrityError, match="write-once"):
        with db.conn:
            db.conn.execute("DELETE FROM predictions")
    assert db.conn.execute("SELECT rating FROM predictions").fetchone()[0] == "Hold"
    db.close()


def test_a_prediction_needs_its_required_columns(tmp_path):
    db = open_database(tmp_path / "t.sqlite")
    with pytest.raises(sqlite3.IntegrityError):
        with db.conn:
            insert_prediction(db.conn, methodology_hash=None)
    with db.conn:  # the valuation columns may be empty (a no-valuation Hold)
        insert_prediction(db.conn, prediction_id="p2", probability=None, bear=None)
    db.close()


def test_backup_keeps_the_last_10_copies(tmp_path):
    from tearsheet.db import backup

    db = open_database(tmp_path / "t.sqlite")
    with db.conn:
        db.conn.execute("INSERT INTO settings VALUES ('k', 'v')")
    folder = tmp_path / "backups"
    made = [backup(db.conn, folder, stamp=f"20261105T0000{n:02d}Z") for n in range(12)]
    kept = sorted(p.name for p in folder.iterdir())
    assert len(kept) == 10
    assert kept == sorted(p.name for p in made[2:])
    copy = sqlite3.connect(made[-1])
    assert copy.execute("SELECT value FROM settings WHERE key = 'k'").fetchone()[0] == "v"
    copy.close()
    db.close()
