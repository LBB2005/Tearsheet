"""Replay (design item 38, Technical Plan §6).

`tearsheet-engine replay <run ID>` re-runs a run's code steps from its stored inputs, read
through `fetch_log`, with the methodology and reference files loaded from the raw store by the
run's stored hashes. The database is opened read-only and copied into memory, so replay never
writes and can never log a prediction. The steps' outputs are compared with the stored
`step_outputs`, field by field, for exact equality, and the metrics table row by row.
"""

from __future__ import annotations

import asyncio
import json
import sqlite3
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any

from tearsheet import METHOD_CODE_VERSION
from tearsheet.data.fred import parse_observations, value_on
from tearsheet.data.membership import (
    IVV_HOLDINGS_URL,
    HoldingRow,
    Holdings,
    Refreshed,
    load_bundled,
    parse_ivv,
)
from tearsheet.methodology import from_stored
from tearsheet.rawstore import RawStore
from tearsheet.sources import StoredData

COMPARED_STEPS = ("resolve", "normalize", "text", "metrics", "score", "value", "rate", "render")


class ReplayError(Exception):
    pass


@dataclass
class ReplayResult:
    run_id: str
    identical: bool
    differences: list[str] = field(default_factory=list)
    compared: int = 0
    same_method_code: bool = True


class ReplayData(StoredData):
    """Only the inputs this run logged."""

    def __init__(
        self, conn: sqlite3.Connection, raw_dir: Path, run_id: str, resolved: dict[str, Any]
    ):
        self._conn, self._raw, self._run_id, self._resolved = conn, raw_dir, run_id, resolved
        self._dbs = []
        self._risk_free = None

    def _body(self, url: str | None = None, *, like: str | None = None) -> bytes | None:
        query = "SELECT raw_hash FROM fetch_log WHERE run_id = ? AND request_key " + (
            "= ?" if url is not None else "LIKE ?"
        )
        row = self._conn.execute(
            query + " ORDER BY fetch_id DESC LIMIT 1",
            (self._run_id, url if url is not None else like),
        ).fetchone()
        if not row:
            return None
        return RawStore.read(self._raw, row[0])

    async def holdings(self, sec_tickers: dict[str, int], *, today: date) -> Refreshed:
        source = self._resolved.get("holdings_source")
        if source == "ivv":
            body = self._body(IVV_HOLDINGS_URL)
            if body is not None:
                return Refreshed(
                    # The run already accepted this file, so its sanity checks aren't repeated.
                    parse_ivv(body.decode("utf-8", errors="replace"), sec_tickers, check=False),
                    None,
                )
            as_of = self._resolved.get("holdings_as_of")
            rows = self._conn.execute(
                "SELECT ticker, cik, sector, weight FROM sp500_holdings WHERE as_of = ?", (as_of,)
            ).fetchall()
            if rows:
                held = [HoldingRow(r[0], r[1], r[0], r[2], r[3]) for r in rows]
                return Refreshed(Holdings(date.fromisoformat(as_of), "ivv", held), None)
        return Refreshed(load_bundled(), None)

    async def fill_prices(self, store, members, *, end: date) -> None:
        return None  # prices are already in the database, and stored prices are never overwritten

    async def risk_free(self, day: date) -> tuple[date, float] | None:
        body = self._body(like="%series_id=DGS10%")
        if body is None:
            return None
        found = value_on(parse_observations(json.loads(body)), day)
        return (found[0], found[1] / 100) if found else None

    async def macro(self, day: date) -> dict:
        return {}


def _copy_read_only(db_path: Path) -> sqlite3.Connection:
    source = sqlite3.connect(f"{Path(db_path).resolve().as_uri()}?mode=ro", uri=True)
    memory = sqlite3.connect(":memory:")
    try:
        source.backup(memory)
    finally:
        source.close()
    # A run stored by an older engine replays with today's schema: upgrade the copy in memory.
    from tearsheet.db import migrations

    current = memory.execute("PRAGMA user_version").fetchone()[0]
    for number, sql in migrations():
        if number > current:
            memory.executescript(f"BEGIN;\n{sql}\nPRAGMA user_version = {number};\nCOMMIT;")
    memory.row_factory = sqlite3.Row
    return memory


def replayable_runs(db_path: Path) -> list[str]:
    """Every finished run in a data folder, oldest first."""
    conn = sqlite3.connect(f"{Path(db_path).resolve().as_uri()}?mode=ro", uri=True)
    try:
        return [
            r[0]
            for r in conn.execute(
                "SELECT run_id FROM runs WHERE status IN ('done', 'done_incomplete') ORDER BY started_at"
            )
        ]
    finally:
        conn.close()


def _compare(name: str, before: Any, after: Any, out: list[str], path: str = "") -> None:
    where = f"{name}{path}"
    if isinstance(before, dict) and isinstance(after, dict):
        for key in sorted(set(before) | set(after)):
            _compare(name, before.get(key), after.get(key), out, f"{path}.{key}")
    elif before != after:
        out.append(f"{where}: stored {before!r}, replayed {after!r}")


def replay(db_path: Path, run_id: str, *, raw_dir: Path) -> ReplayResult:
    from tearsheet.pipeline import Run

    conn = _copy_read_only(db_path)
    run = conn.execute("SELECT * FROM runs WHERE run_id = ?", (run_id,)).fetchone()
    if run is None:
        raise ReplayError(f"No run {run_id} in this data folder.")
    copies = {
        r[0].split("/", 1)[0].removeprefix("tearsheet:"): r[1]
        for r in conn.execute(
            "SELECT request_key, raw_hash FROM fetch_log WHERE run_id = ? AND request_key LIKE 'tearsheet:%'",
            (run_id,),
        )
    }
    if "methodology" not in copies or "reference" not in copies:
        raise ReplayError(f"Run {run_id} has no stored methodology copy, so it can't be replayed.")
    method = from_stored(
        RawStore.read(raw_dir, copies["methodology"]), RawStore.read(raw_dir, copies["reference"])
    )
    stored = {
        r[0]: json.loads(r[1])
        for r in conn.execute("SELECT step, json FROM step_outputs WHERE run_id = ?", (run_id,))
    }
    if "resolve" not in stored:
        raise ReplayError(f"Run {run_id} stopped before step 1 finished.")
    replay_id = f"replay-{run_id}"
    data = ReplayData(conn, raw_dir, run_id, stored["resolve"])
    again = Run(
        conn,
        data,
        None,
        method,
        mode=run["mode"],
        now=datetime.fromisoformat(run["started_at"]),
        out_dir=None,
        run_id=replay_id,
    )
    asyncio.run(again.run(stored["resolve"]["ticker"]))
    fresh = {
        r[0]: json.loads(r[1])
        for r in conn.execute("SELECT step, json FROM step_outputs WHERE run_id = ?", (replay_id,))
    }
    differences: list[str] = []
    compared = 0
    for step in COMPARED_STEPS:
        if step in stored:
            compared += 1
            _compare(step, stored[step], fresh.get(step), differences)
    before = {
        (r[0], r[1]): r[2]
        for r in conn.execute("SELECT cik, name, value FROM metrics WHERE run_id = ?", (run_id,))
    }
    after = {
        (r[0], r[1]): r[2]
        for r in conn.execute("SELECT cik, name, value FROM metrics WHERE run_id = ?", (replay_id,))
    }
    for key in sorted(set(before) | set(after)):
        if before.get(key) != after.get(key):
            differences.append(
                f"metric {key[1]} for CIK {key[0]}: stored {before.get(key)!r}, replayed {after.get(key)!r}"
            )
    conn.close()
    return ReplayResult(
        run_id,
        not differences,
        differences,
        compared,
        int(run["method_code_version"]) == METHOD_CODE_VERSION,
    )
