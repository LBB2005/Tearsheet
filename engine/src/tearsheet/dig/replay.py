"""replay-dig: rebuild a saved Dig deeper snapshot from what it stored, and compare.

The snapshot's own fetch_log rows (its id is their run id) give back every byte it fetched
(news, Form 4, FRED, analystdb); prices are read up to its close, and the report it read is
the one it names. Only the parts that were "ok" are compared: a stale, off or down part has no
fresh bytes of its own to rebuild from."""

from __future__ import annotations

import asyncio
import json
import sqlite3
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import httpx

from tearsheet.data.analystdb import BASE_URL, AnalystDB
from tearsheet.data.membership import load_bundled
from tearsheet.dig.snapshot import PARTS, Sources, build
from tearsheet.dig.target import Target
from tearsheet.http import Fetched, HTTPFailure, redact_url
from tearsheet.methodology import load
from tearsheet.rawstore import RawStore
from tearsheet.replay import ReplayError
from tearsheet.sources import LiveData
from tearsheet.watchlist import Shown


@dataclass
class DigReplay:
    snapshot_id: str
    compared: list[str] = field(default_factory=list)
    differences: list[str] = field(default_factory=list)

    @property
    def identical(self) -> bool:
        return not self.differences


def _stored_hash(conn: sqlite3.Connection, run_id: str, key: str) -> str | None:
    row = conn.execute(
        "SELECT raw_hash FROM fetch_log WHERE run_id = ? AND request_key = ?"
        " ORDER BY fetch_id DESC LIMIT 1",
        (run_id, key),
    ).fetchone()
    return row[0] if row else None


class StoredHttp:
    """HttpClient's fetch, answered from one snapshot's stored bytes only."""

    def __init__(self, conn: sqlite3.Connection, raw_dir: Path, run_id: str):
        self.conn, self.raw_dir, self.run_id = conn, raw_dir, run_id

    async def fetch(
        self,
        service: str,
        url: str,
        *,
        kind: str,
        expect: str = "json",
        params: dict[str, Any] | None = None,
    ) -> Fetched:
        full = str(httpx.URL(url, params=params)) if params else url
        raw_hash = _stored_hash(self.conn, self.run_id, redact_url(full))
        if raw_hash is None:
            raise HTTPFailure(service, full, "the snapshot's answer wasn't stored")
        return Fetched(full, 200, "", RawStore.read(self.raw_dir, raw_hash), raw_hash)


class _StoredRaw:
    """The parts of RawStore the SEC client and saved_view use, reading one snapshot's rows
    and writing nothing."""

    def __init__(self, conn: sqlite3.Connection, raw_dir: Path, run_id: str):
        self.conn, self.raw_dir, self.run_id = conn, raw_dir, run_id

    def latest_fetched_at(self, url: str) -> datetime | None:
        return None  # every daily file comes from the snapshot's own rows, through StoredHttp

    def reuse(self, url: str, run_id: str) -> str | None:
        return _stored_hash(self.conn, self.run_id, url)

    def get(self, raw_hash: str) -> bytes:
        return RawStore.read(self.raw_dir, raw_hash)

    def put(self, data: bytes, url: str, provider: str, content_type: str, run_id: str) -> str:
        return ""


class _NoSettings:
    """News's weekly retry setting plays no part in a rebuild."""

    def get(self, key: str, default: str | None = None) -> str | None:
        return default

    def set_internal(self, key: str, value: str) -> None:
        return None


def _stored_analystdb(conn: sqlite3.Connection, raw_dir: Path, run_id: str) -> AnalystDB:
    def answer(request: httpx.Request) -> httpx.Response:
        query = urlencode(sorted(request.url.params.multi_items()))
        raw_hash = _stored_hash(conn, run_id, f"{BASE_URL}{request.url.path}?{query}")
        if raw_hash is None:
            return httpx.Response(404, json={"detail": "not stored"})
        return httpx.Response(200, content=RawStore.read(raw_dir, raw_hash))

    return AnalystDB(transport=httpx.MockTransport(answer))


def _target(stored: dict[str, Any]) -> Target:
    """The stock as the snapshot saw it: its own report ids, close and levels."""
    head = stored["header"]
    shown = Shown(None, None, head["made_at"], stored["report_id"], stored["run_id"], None)
    close = (
        (date.fromisoformat(head["close_date"]), head["close"])
        if head["close_date"] and head["close"] is not None
        else None
    )
    return Target(
        stored["cik"],
        head["ticker"],
        head["name"],
        head["sector"],
        shown,
        close,
        head["since_report"],
        head["levels"],
    )


def _compare(before: Any, after: Any, out: list[str], where: str) -> None:
    if isinstance(before, dict) and isinstance(after, dict):
        for key in sorted(set(before) | set(after)):
            _compare(before.get(key), after.get(key), out, f"{where}.{key}")
    elif isinstance(before, list) and isinstance(after, list) and len(before) == len(after):
        for i, (b, a) in enumerate(zip(before, after, strict=True)):
            _compare(b, a, out, f"{where}[{i}]")
    elif before != after:
        out.append(f"{where}: stored {before!r}, rebuilt {after!r}")


def snapshot_ids(conn: sqlite3.Connection) -> list[str]:
    return [
        r[0]
        for r in conn.execute("SELECT snapshot_id FROM dig_snapshots ORDER BY created_at, rowid")
    ]


def replay_snapshot(conn: sqlite3.Connection, raw_dir: Path, snapshot_id: str) -> DigReplay:
    """Run on a copy of the database (replay._copy_read_only): nothing is written."""
    row = conn.execute(
        "SELECT json FROM dig_snapshots WHERE snapshot_id = ?", (snapshot_id,)
    ).fetchone()
    if row is None:
        raise ReplayError(f"No Dig deeper snapshot {snapshot_id} in this data folder.")
    stored = json.loads(row[0])
    http = StoredHttp(conn, raw_dir, snapshot_id)
    store = _StoredRaw(conn, raw_dir, snapshot_id)
    fred = stored["rates"]["state"] == "ok"
    sources = Sources(
        http=http,
        live=LiveData(http, store, conn, fred_key="stored" if fred else None),
        settings=_NoSettings(),
        rawstore=store,
        analystdb=_stored_analystdb(conn, raw_dir, snapshot_id),
        fred_key=fred,
        massive_key=stored["news"]["state"] == "ok",
    )
    rebuilt = asyncio.run(
        build(
            conn,
            raw_dir,
            load_bundled(),
            load(),
            _target(stored),
            sources,
            now=datetime.fromisoformat(stored["created_at"]),
            snapshot_id=snapshot_id,
        )
    )
    result = DigReplay(snapshot_id)
    for part in PARTS:
        if stored[part]["state"] != "ok":
            continue
        result.compared.append(part)
        _compare(stored[part], rebuilt[part], result.differences, part)
    return result
