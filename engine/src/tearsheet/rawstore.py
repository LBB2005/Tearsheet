"""The permanent store of every download, and its index (design item 5, Technical Plan §6).

Each file is saved once under the SHA-256 of its uncompressed bytes, at
`raw/<first two hex characters>/<hash>.gz`, and is never overwritten. Every fetch in the
engine goes through here, so replay can read the same bytes.
"""

from __future__ import annotations

import gzip
import hashlib
import os
import sqlite3
import tempfile
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

from tearsheet.http import redact_url


def utc_now() -> datetime:
    return datetime.now(UTC)


def _stamp(moment: datetime) -> str:
    return moment.astimezone(UTC).isoformat(timespec="microseconds")


class RawStore:
    def __init__(
        self, raw_dir: Path, conn: sqlite3.Connection, *, now: Callable[[], datetime] = utc_now
    ):
        self.raw_dir = raw_dir
        self._conn = conn
        self._now = now
        raw_dir.mkdir(parents=True, exist_ok=True)

    def path_for(self, raw_hash: str) -> Path:
        return self.raw_dir / raw_hash[:2] / f"{raw_hash}.gz"

    # --- saving ------------------------------------------------------------

    def put(self, data: bytes, url: str, provider: str, content_type: str, run_id: str) -> str:
        """Save one valid download and log that `run_id` fetched it. Returns the hash.

        The gzip header's timestamp is fixed at 0, so the same content always gives the
        same file. A file already stored is left as it is.
        """
        raw_hash = hashlib.sha256(data).hexdigest()
        path = self.path_for(raw_hash)
        stored_now = self._now()
        if not path.exists():
            self._write_once(path, gzip.compress(data, mtime=0))
        with self._conn:
            seen = self._conn.execute(
                "SELECT 1 FROM raw_objects WHERE raw_hash = ?", (raw_hash,)
            ).fetchone()
            if not seen:
                self._conn.execute(
                    "INSERT INTO raw_objects (raw_hash, provider, content_type, size, "
                    "stored_size, first_run_id, first_stored_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (
                        raw_hash,
                        provider,
                        content_type,
                        len(data),
                        path.stat().st_size,
                        run_id,
                        _stamp(stored_now),
                    ),
                )
            self._log_fetch(run_id, provider, url, raw_hash, stored_now)
        return raw_hash

    def reuse(self, url: str, run_id: str) -> str | None:
        """Log that `run_id` used the stored copy of `url`, without downloading it again.

        The new row keeps the stored copy's fetch time, so the re-download rules still see
        when the bytes really came from the network. Returns the hash, or None if no copy.
        """
        row = self._latest_row(url)
        if row is None:
            return None
        with self._conn:
            self._conn.execute(
                "INSERT INTO fetch_log (run_id, provider, request_key, raw_hash, fetched_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (run_id, row["provider"], row["request_key"], row["raw_hash"], row["fetched_at"]),
            )
        return row["raw_hash"]

    def _write_once(self, path: Path, compressed: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tmp-")
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(compressed)
            # A hard link fails if the name exists, so a stored file is never replaced.
            try:
                os.link(tmp, path)
            except FileExistsError:
                pass
        finally:
            os.unlink(tmp)

    def _log_fetch(
        self, run_id: str, provider: str, url: str, raw_hash: str, fetched_at: datetime
    ) -> None:
        self._conn.execute(
            "INSERT INTO fetch_log (run_id, provider, request_key, raw_hash, fetched_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (run_id, provider, redact_url(url), raw_hash, _stamp(fetched_at)),
        )

    # --- reading -----------------------------------------------------------

    def get(self, raw_hash: str) -> bytes:
        return gzip.decompress(self.path_for(raw_hash).read_bytes())

    def _latest_row(self, url: str) -> sqlite3.Row | None:
        return self._conn.execute(
            "SELECT provider, request_key, raw_hash, fetched_at FROM fetch_log "
            "WHERE request_key = ? ORDER BY fetched_at DESC, fetch_id DESC LIMIT 1",
            (redact_url(url),),
        ).fetchone()

    def latest(self, url: str) -> str | None:
        """The most recent stored hash for an address, for the SEC re-download rule."""
        row = self._latest_row(url)
        return row["raw_hash"] if row else None

    def latest_fetched_at(self, url: str) -> datetime | None:
        """When the most recent stored copy of an address came from the network."""
        row = self._latest_row(url)
        return datetime.fromisoformat(row["fetched_at"]) if row else None

    # --- counting and size ---------------------------------------------------

    def bytes_stored(self, run_id: str) -> int:
        """The stored (compressed) size of the files first saved by this run."""
        row = self._conn.execute(
            "SELECT COALESCE(SUM(stored_size), 0) FROM raw_objects WHERE first_run_id = ?",
            (run_id,),
        ).fetchone()
        return int(row[0])

    def folder_size(self) -> int:
        return sum(p.stat().st_size for p in self.raw_dir.rglob("*.gz"))

    def cap_warning(self, cap_bytes: int, warn_share: float = 0.9) -> str | None:
        """A plain warning when the folder is near its cap. Pruning is not built in Phase 0."""
        size = self.folder_size()
        if size < cap_bytes * warn_share:
            return None
        return (
            f"The raw-data folder holds {size / 1024**3:.1f} GB of its {cap_bytes / 1024**3:.0f} "
            "GB cap. Raise the cap with: tearsheet-engine set-setting raw_cap_gb <number>"
        )
