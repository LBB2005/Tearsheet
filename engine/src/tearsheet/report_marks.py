"""The sidebar's marks: hidden reports, pinned companies, and erasing a deleted report.

Deleting a report in the app hides it at once (`hide`), so its undo can bring it back (`show`).
Once the undo has passed, the app asks to erase it (`erase`). Two kinds of report are never
erased, only hidden, because the records that point at them can never be removed:

* **official**: the report of an official prediction. `predictions` is write-once, grading reads
  the run's peer list (`peer_groups`), and the 30-day rule reads `predictions` alone, so a
  hidden official report still counts and no new run can take its slot.
* **reviewed**: a report with flags or spot-check labels in `claim_reviews`, which is add-only.

Erasing removes the report's text, claims and levels (report_levels) and the run's own results
(step outputs, metrics, peer list and the run row). It never touches `predictions`, `grades` or
`claim_reviews`, and it keeps the shared caches: `fetch_log` (later runs reuse its downloads),
`raw_objects`, `evidence_cache` and `article_skips`.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterable
from datetime import UTC, datetime


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _known(conn: sqlite3.Connection, report_ids: Iterable[str]) -> list[str]:
    """The ids that name a stored report, in the order given, each once."""
    out: list[str] = []
    for report_id in dict.fromkeys(report_ids):
        if conn.execute("SELECT 1 FROM reports WHERE report_id = ?", (report_id,)).fetchone():
            out.append(report_id)
    return out


def kept_because(conn: sqlite3.Connection, report_id: str) -> str | None:
    """Why a report can only be hidden: "official" or "reviewed". None when it can be erased."""
    row = conn.execute("SELECT run_id FROM reports WHERE report_id = ?", (report_id,)).fetchone()
    if row and conn.execute("SELECT 1 FROM predictions WHERE run_id = ?", (row[0],)).fetchone():
        return "official"
    if conn.execute("SELECT 1 FROM claim_reviews WHERE report_id = ?", (report_id,)).fetchone():
        return "reviewed"
    return None


def hidden_ids(conn: sqlite3.Connection) -> set[str]:
    return {r[0] for r in conn.execute("SELECT report_id FROM hidden_reports")}


def pinned_ciks(conn: sqlite3.Connection) -> set[int]:
    return {int(r[0]) for r in conn.execute("SELECT cik FROM pinned_companies")}


def hide(conn: sqlite3.Connection, report_ids: Iterable[str]) -> dict[str, list[str]]:
    """Hide the stored reports among `report_ids`. Returns them, and which can be erased."""
    found = _known(conn, report_ids)
    at = _now()
    with conn:
        for report_id in found:
            conn.execute(
                "INSERT OR IGNORE INTO hidden_reports (report_id, hidden_at) VALUES (?, ?)",
                (report_id, at),
            )
    return {"hidden": found, "erasable": [r for r in found if kept_because(conn, r) is None]}


def show(conn: sqlite3.Connection, report_ids: Iterable[str]) -> list[str]:
    """Bring hidden reports back. Returns the ones that were hidden."""
    back: list[str] = []
    with conn:
        for report_id in dict.fromkeys(report_ids):
            gone = conn.execute("DELETE FROM hidden_reports WHERE report_id = ?", (report_id,))
            if gone.rowcount:
                back.append(report_id)
    return back


def erase(conn: sqlite3.Connection, report_ids: Iterable[str]) -> dict[str, list[str]]:
    """Erase hidden reports for good. A report that isn't hidden, or that can only be hidden
    (official or reviewed), is left as it is and listed in `kept`."""
    erased: list[str] = []
    kept: list[str] = []
    hidden = hidden_ids(conn)
    for report_id in dict.fromkeys(report_ids):
        row = conn.execute(
            "SELECT run_id FROM reports WHERE report_id = ?", (report_id,)
        ).fetchone()
        if row is None:
            continue
        if report_id not in hidden or kept_because(conn, report_id) is not None:
            kept.append(report_id)
            continue
        run_id = row[0]
        with conn:
            conn.execute("DELETE FROM claims WHERE report_id = ?", (report_id,))
            conn.execute("DELETE FROM sections WHERE report_id = ?", (report_id,))
            # Its levels (report_levels.py) cascade with the report; said here too, for a
            # connection without foreign keys on.
            conn.execute("DELETE FROM report_levels WHERE report_id = ?", (report_id,))
            conn.execute("DELETE FROM reports WHERE report_id = ?", (report_id,))
            conn.execute("DELETE FROM hidden_reports WHERE report_id = ?", (report_id,))
            others = conn.execute("SELECT 1 FROM reports WHERE run_id = ?", (run_id,)).fetchone()
            official = conn.execute(
                "SELECT 1 FROM predictions WHERE run_id = ?", (run_id,)
            ).fetchone()
            if others is None and official is None:
                for table in ("step_outputs", "metrics", "peer_groups", "runs"):
                    conn.execute(f"DELETE FROM {table} WHERE run_id = ?", (run_id,))
        erased.append(report_id)
    return {"erased": erased, "kept": kept}


def set_pinned(conn: sqlite3.Connection, cik: int, pinned: bool) -> None:
    with conn:
        if pinned:
            conn.execute(
                "INSERT OR IGNORE INTO pinned_companies (cik, pinned_at) VALUES (?, ?)",
                (cik, _now()),
            )
        else:
            conn.execute("DELETE FROM pinned_companies WHERE cik = ?", (cik,))
