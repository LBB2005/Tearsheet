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


def test_a_failed_migration_is_undone_and_lets_go_of_the_database(tmp_path, monkeypatch):
    from tearsheet import db as db_module

    path = tmp_path / "t.sqlite"
    open_database(path).close()
    real = db_module.migrations()
    bad = (real[-1][0] + 1, "CREATE TABLE half_done (a);\nNOT SQL;")
    monkeypatch.setattr(db_module, "migrations", lambda: [*real, bad])
    with pytest.raises(sqlite3.Error):
        db_module.open_database(path)
    other = sqlite3.connect(path, timeout=0)
    other.execute("BEGIN IMMEDIATE")  # no write lock left behind
    other.rollback()
    assert other.execute("PRAGMA user_version").fetchone()[0] == real[-1][0]
    assert not other.execute("SELECT 1 FROM sqlite_master WHERE name = 'half_done'").fetchone()
    other.close()


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


WATCH_TABLES = {
    "watch_companies",
    "watch_lists",
    "watch_items",
    "watch_alert_state",
    "watch_events",
    "report_levels",
}
WATCH_INDEXES = {
    "watch_lists_by_name",
    "watch_items_by_cik",
    "watch_events_unseen",
    "watch_events_by_cik",
    "report_levels_by_cik",
    "predictions_by_run",
}


def indexes(conn) -> set[str]:
    return {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'index'")}


def test_the_watchlist_tables_exist(tmp_path):
    db = open_database(tmp_path / "t.sqlite")
    assert WATCH_TABLES <= tables(db.conn)
    assert WATCH_INDEXES <= indexes(db.conn)
    db.close()


def test_a_version_5_database_upgrades_with_its_data(tmp_path, monkeypatch):
    from tearsheet import db as db_module

    real = db_module.migrations()
    path = tmp_path / "t.sqlite"
    monkeypatch.setattr(db_module, "migrations", lambda: [m for m in real if m[0] <= 5])
    old = db_module.open_database(path)
    assert old.version == 5
    with old.conn:
        old.conn.execute("INSERT INTO settings VALUES ('k', 'v')")
        old.conn.execute("INSERT INTO pinned_companies VALUES (320193, '2026-11-01')")
    old.close()
    monkeypatch.setattr(db_module, "migrations", lambda: real)
    db = db_module.open_database(path)
    assert db.version == 6
    assert WATCH_TABLES <= tables(db.conn)
    assert db.conn.execute("SELECT value FROM settings WHERE key = 'k'").fetchone()[0] == "v"
    assert db.conn.execute("SELECT cik FROM pinned_companies").fetchone()[0] == 320193
    # Nothing is made in SQL: no default list, no levels.
    assert db.conn.execute("SELECT COUNT(*) FROM watch_lists").fetchone()[0] == 0
    assert len(list(tmp_path.glob("t.sqlite.v5-*.bak"))) == 1
    db.close()


def test_live_watchlist_names_are_unique_whatever_their_case(tmp_path):
    db = open_database(tmp_path / "t.sqlite")
    add = "INSERT INTO watch_lists (name, position, created_at, deleted_at) VALUES (?, 0, 'x', ?)"
    with db.conn:
        db.conn.execute(add, ("Tech", None))
    with pytest.raises(sqlite3.IntegrityError):
        with db.conn:
            db.conn.execute(add, ("tech", None))
    with db.conn:  # a deleted list's name may be used again during its undo
        db.conn.execute("UPDATE watch_lists SET deleted_at = 'y'")
        db.conn.execute(add, ("TECH", None))
        db.conn.execute(add, ("tech", "z"))
    with pytest.raises(sqlite3.IntegrityError):  # an empty name
        with db.conn:
            db.conn.execute(add, ("  ", None))
    db.close()


def test_erasing_a_list_takes_its_items_and_erasing_a_report_its_levels(tmp_path):
    db = open_database(tmp_path / "t.sqlite")
    conn = db.conn
    with conn:
        conn.execute("INSERT INTO watch_companies (cik, first_added_at) VALUES (1, 'x')")
        conn.execute(
            "INSERT INTO watch_lists (list_id, name, position, created_at) VALUES (1, 'A', 0, 'x')"
        )
        conn.execute(
            "INSERT INTO watch_items (list_id, cik, position, added_at, added_as)"
            " VALUES (1, 1, 0, 'x', 'T')"
        )
        conn.execute(
            "INSERT INTO runs (run_id, cik, mode, started_at, status, engine_version,"
            " method_code_version, methodology_hash, reference_version)"
            " VALUES ('run-1', 1, 'full', 'x', 'done', '1', 1, 'h', 'r')"
        )
        conn.execute(
            "INSERT INTO reports (report_id, run_id, created_at, narrative_complete)"
            " VALUES ('rep-1', 'run-1', 'x', 1)"
        )
        conn.execute(
            "INSERT INTO report_levels (report_id, run_id, cik, price_date, source)"
            " VALUES ('rep-1', 'run-1', 1, '2026-11-03', 'run')"
        )
    with conn:
        conn.execute("DELETE FROM watch_lists WHERE list_id = 1")
        conn.execute("DELETE FROM reports WHERE report_id = 'rep-1'")
    assert conn.execute("SELECT COUNT(*) FROM watch_items").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM report_levels").fetchone()[0] == 0
    # The company's note and settings stay.
    assert conn.execute("SELECT COUNT(*) FROM watch_companies").fetchone()[0] == 1
    db.close()


def test_an_alert_fires_once_per_company_kind_reference_side_and_close(tmp_path):
    db = open_database(tmp_path / "t.sqlite")
    conn = db.conn
    event = (
        "INSERT OR IGNORE INTO watch_events (cik, kind, ref, side, close_date, text, created_at)"
        " VALUES (1, 'range', 'rep-1', 'below', '2026-11-04', 't', 'x')"
    )
    with conn:
        conn.execute("INSERT INTO watch_companies (cik, first_added_at) VALUES (1, 'x')")
        assert conn.execute(event).rowcount == 1
        assert conn.execute(event).rowcount == 0
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
    # All on one day: the newest five.
    assert kept == sorted(p.name for p in made[-5:])
    copy = sqlite3.connect(made[-1])
    assert copy.execute("SELECT value FROM settings WHERE key = 'k'").fetchone()[0] == "v"
    copy.close()
    db.close()


def test_tests_never_back_up_into_the_real_folder(tmp_path):
    # conftest moves the default backup folder into the test's own folder.
    from pathlib import Path

    from tearsheet import config as cfg

    real = Path.home() / "Tearsheet Backups"
    assert cfg.DEFAULT_BACKUP_DIR != real
    assert cfg.DEFAULT_BACKUP_DIR.is_relative_to(tmp_path)


def test_backups_keep_the_newest_five_and_one_for_each_day_before(tmp_path):
    # A report line backs up after every prediction; ten copies from one quarter of an hour
    # would leave nothing older to go back to.
    from tearsheet.db import backup

    db = open_database(tmp_path / "t.sqlite")
    folder = tmp_path / "backups"
    for day in range(1, 9):
        for hour in (9, 12, 18):
            backup(db.conn, folder, stamp=f"202611{day:02d}T{hour:02d}0000Z")
    kept = sorted(p.name.removeprefix("tearsheet-")[:11] for p in folder.glob("*.sqlite"))
    assert kept == [
        "20261102T18",
        "20261103T18",
        "20261104T18",
        "20261105T18",
        "20261106T18",
        "20261107T12",
        "20261107T18",
        "20261108T09",
        "20261108T12",
        "20261108T18",
    ]
    db.close()


def test_a_failed_backup_leaves_no_half_copy(tmp_path, monkeypatch):
    from tearsheet import db as db_module

    db = open_database(tmp_path / "t.sqlite")
    folder = tmp_path / "backups"
    db_module.backup(db.conn, folder, stamp="20261105T000000Z")

    class Broken:
        def backup(self, target):
            raise sqlite3.OperationalError("disk I/O error")

    with pytest.raises(sqlite3.OperationalError):
        db_module.backup(Broken(), folder, stamp="20261106T000000Z")  # type: ignore[arg-type]
    assert [p.name for p in folder.glob("*.sqlite")] == ["tearsheet-20261105T000000Z.sqlite"]
    db.close()
