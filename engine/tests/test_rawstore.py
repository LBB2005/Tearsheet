"""The raw store and its index (design item 13: test_rawstore.py)."""

from __future__ import annotations

import gzip
import hashlib
from datetime import UTC, datetime, timedelta

from tearsheet.rawstore import RawStore

URL = "https://data.sec.gov/submissions/CIK0000320193.json"


def fetch_rows(database, url=URL):
    return database.conn.execute(
        "SELECT run_id, raw_hash, fetched_at FROM fetch_log WHERE request_key = ? ORDER BY fetch_id",
        (url,),
    ).fetchall()


def test_same_content_twice_gives_one_file_and_two_fetch_rows(rawstore, database):
    first = rawstore.put(b'{"a": 1}', URL, "sec", "application/json", "run-1")
    second = rawstore.put(b'{"a": 1}', URL, "sec", "application/json", "run-2")
    assert first == second == hashlib.sha256(b'{"a": 1}').hexdigest()
    assert len(list(rawstore.raw_dir.rglob("*.gz"))) == 1
    assert database.conn.execute("SELECT COUNT(*) FROM raw_objects").fetchone()[0] == 1
    assert [row["run_id"] for row in fetch_rows(database)] == ["run-1", "run-2"]


def test_gzip_output_is_identical_for_identical_input(tmp_path, database):
    a = RawStore(tmp_path / "a", database.conn)
    b = RawStore(tmp_path / "b", database.conn)
    digest = a.put(b"same bytes", URL, "sec", "text/plain", "run-1")
    b.put(b"same bytes", URL, "sec", "text/plain", "run-1")
    assert a.path_for(digest).read_bytes() == b.path_for(digest).read_bytes()
    assert a.path_for(digest).relative_to(a.raw_dir).parts[0] == digest[:2]


def test_compression_reads_back_the_same_bytes(rawstore):
    data = bytes(range(256)) * 100
    digest = rawstore.put(data, URL, "sec", "application/octet-stream", "run-1")
    assert rawstore.get(digest) == data
    assert gzip.decompress(rawstore.path_for(digest).read_bytes()) == data


def test_existing_files_are_never_overwritten(rawstore):
    digest = rawstore.put(b"original", URL, "sec", "text/plain", "run-1")
    path = rawstore.path_for(digest)
    before = path.stat()
    rawstore.put(b"original", URL, "sec", "text/plain", "run-2")
    after = path.stat()
    assert (before.st_ino, before.st_mtime_ns) == (after.st_ino, after.st_mtime_ns)
    assert not [p for p in path.parent.iterdir() if p.name.startswith(".tmp-")]


def test_latest_returns_the_newest_hash_for_an_address(tmp_path, database):
    moments = iter([datetime(2026, 11, 2, 12, tzinfo=UTC), datetime(2026, 11, 3, 12, tzinfo=UTC)])
    store = RawStore(tmp_path / "raw", database.conn, now=lambda: next(moments))
    store.put(b"old", URL, "sec", "application/json", "run-1")
    newest = store.put(b"new", URL, "sec", "application/json", "run-2")
    assert store.latest(URL) == newest
    assert store.latest_fetched_at(URL) == datetime(2026, 11, 3, 12, tzinfo=UTC)
    assert store.latest("https://example.com/never") is None


def test_reuse_logs_the_run_and_keeps_the_original_fetch_time(tmp_path, database):
    fetched = datetime(2026, 11, 2, 12, tzinfo=UTC)
    store = RawStore(tmp_path / "raw", database.conn, now=lambda: fetched)
    digest = store.put(b"doc", URL, "sec", "text/html", "run-1")
    later = RawStore(tmp_path / "raw", database.conn, now=lambda: fetched + timedelta(days=3))
    assert later.reuse(URL, "run-2") == digest
    rows = fetch_rows(database)
    assert [r["run_id"] for r in rows] == ["run-1", "run-2"]
    assert rows[0]["fetched_at"] == rows[1]["fetched_at"]
    assert later.reuse("https://example.com/never", "run-2") is None


def test_bytes_stored_counts_only_files_first_saved_by_that_run(rawstore):
    a = rawstore.put(b"a" * 1000, URL, "sec", "text/plain", "run-1")
    rawstore.put(b"a" * 1000, URL, "sec", "text/plain", "run-2")  # already stored
    b = rawstore.put(b"b" * 5000, URL + "?2", "sec", "text/plain", "run-2")
    assert rawstore.bytes_stored("run-1") == rawstore.path_for(a).stat().st_size
    assert rawstore.bytes_stored("run-2") == rawstore.path_for(b).stat().st_size
    assert rawstore.bytes_stored("run-3") == 0


def test_key_parameters_are_removed_from_the_index(rawstore, database):
    rawstore.put(
        b"{}", "https://x.test/q?symbol=IBM&apikey=SECRET", "alphavantage", "application/json", "r"
    )
    (key,) = database.conn.execute("SELECT request_key FROM fetch_log").fetchone()
    assert key == "https://x.test/q?symbol=IBM"
    assert rawstore.latest("https://x.test/q?symbol=IBM&apikey=OTHER") is not None


def test_cap_warning_near_the_cap(rawstore):
    rawstore.put(b"x" * 10_000, URL, "sec", "text/plain", "run-1")
    size = rawstore.folder_size()
    assert rawstore.cap_warning(cap_bytes=size * 100) is None
    assert "raw_cap_gb" in rawstore.cap_warning(cap_bytes=size)
