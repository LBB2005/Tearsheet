"""The prediction log (design item 35, Technical Plan §10).

The first run that produces a rating starts a rolling 30-day window for that company (30 × 24
hours from the official run's start), and that run's prediction is official. Later runs in the
window save a report but no prediction. Failed runs and withheld ratings don't use the slot,
because they never get here. A run with no valid valuation is official: rated Hold, with no
range or probability. Code only inserts prediction rows; database triggers reject updates and
deletes. Each official prediction is followed by a backup.

Not yet called by the pipeline: logging is switched on once the full method is finished and
Liam has agreed, because rows can never be removed.
"""

from __future__ import annotations

import csv
import json
import sqlite3
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta
from pathlib import Path

from tearsheet.db import backup

WINDOW = timedelta(days=30)


@dataclass(frozen=True)
class Prediction:
    run_id: str
    cik: int
    ticker: str
    share_class: str
    run_at: datetime
    score: float
    rating: str
    probability: float | None
    bear: float | None
    base: float | None
    bull: float | None
    uncertainty: str
    percentile_lines: dict[str, float]
    accessions: list[str]
    latest_acceptance_at: datetime
    methodology_hash: str
    method_code_version: int
    engine_version: str
    ai_tool: str
    model_ids: list[str] = field(default_factory=list)
    inputs_hash: str = ""


def slot_open(conn: sqlite3.Connection, cik: int, run_start: datetime) -> bool:
    """Whether a run starting now would be official for this company."""
    row = conn.execute(
        "SELECT MAX(run_at) FROM predictions WHERE cik = ? AND run_at <= ?",
        (cik, run_start.isoformat()),
    ).fetchone()
    if not row or row[0] is None:
        return True
    return run_start >= datetime.fromisoformat(row[0]) + WINDOW


def previous_official(
    conn: sqlite3.Connection, cik: int, before: datetime
) -> tuple[str, str] | None:
    """The latest official rating made before this run started, for display only."""
    row = conn.execute(
        "SELECT rating, run_at FROM predictions WHERE cik = ? AND run_at < ? ORDER BY run_at DESC LIMIT 1",
        (cik, before.isoformat()),
    ).fetchone()
    return (row[0], row[1]) if row else None


def log_if_official(conn: sqlite3.Connection, p: Prediction, *, backup_dir: Path) -> str | None:
    """Insert the prediction if this run is official; back up the database. Returns its ID."""
    if not slot_open(conn, p.cik, p.run_at):
        return None
    previous = previous_official(conn, p.cik, p.run_at)
    prediction_id = f"pred-{uuid.uuid4().hex[:12]}"
    with conn:
        conn.execute(
            "INSERT INTO predictions (prediction_id, run_id, cik, ticker, share_class, run_at, score, rating,"
            " previous_rating, previous_rating_at, probability, bear, base, bull, uncertainty,"
            " percentile_lines_json, accessions_json, latest_acceptance_at, methodology_hash,"
            " method_code_version, engine_version, ai_tool, model_ids_json, inputs_hash)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                prediction_id,
                p.run_id,
                p.cik,
                p.ticker,
                p.share_class,
                p.run_at.isoformat(),
                p.score,
                p.rating,
                previous[0] if previous else None,
                previous[1] if previous else None,
                p.probability,
                p.bear,
                p.base,
                p.bull,
                p.uncertainty,
                json.dumps(p.percentile_lines),
                json.dumps(p.accessions),
                p.latest_acceptance_at.isoformat(),
                p.methodology_hash,
                p.method_code_version,
                p.engine_version,
                p.ai_tool,
                json.dumps(p.model_ids),
                p.inputs_hash,
            ),
        )
    backup(conn, backup_dir)
    return prediction_id


def export_log(conn: sqlite3.Connection, folder: Path) -> tuple[Path, Path]:
    """The log and grades as CSV and JSON (`tearsheet-engine export-log`)."""
    folder.mkdir(parents=True, exist_ok=True)
    conn.row_factory = sqlite3.Row
    predictions = [dict(r) for r in conn.execute("SELECT * FROM predictions ORDER BY run_at")]
    grades = [
        dict(r) for r in conn.execute("SELECT * FROM grades ORDER BY prediction_id, horizon_months")
    ]
    csv_path = folder / "predictions.csv"
    with csv_path.open("w", newline="") as handle:
        if predictions:
            writer = csv.DictWriter(handle, fieldnames=list(predictions[0]))
            writer.writeheader()
            writer.writerows(predictions)
    for row in predictions:
        for key in ("percentile_lines_json", "accessions_json", "model_ids_json"):
            row[key.removesuffix("_json")] = json.loads(row.pop(key))
    json_path = folder / "predictions.json"
    json_path.write_text(json.dumps({"predictions": predictions, "grades": grades}, indent=2))
    return csv_path, json_path


def as_dict(p: Prediction) -> dict:
    return asdict(p)
