"""The valuation inputs saved with each run (step `valuation_inputs`).

What each valuation method assumed for the rated company, and what its 12-month range was built
from, saved when the report is written so a download can show how each value was reached and
let Liam try other inputs. Replay doesn't compare this row (`replay.COMPARED_STEPS`), so adding
to it never stops an old run matching. Runs from before it was saved have no row: `load` gives
None for them.
"""

from __future__ import annotations

import json
import math
import sqlite3
from dataclasses import asdict
from typing import Any

from tearsheet.valuation.combine import Combined
from tearsheet.valuation.common import GroupStats, ValuationInputs
from tearsheet.valuation.range import Range, RangeInputs

STEP = "valuation_inputs"
VERSION = 1


def record(
    *,
    cik: int,
    financial_class: str,
    risk_free: float | None,
    inputs: ValuationInputs | None,
    stats: GroupStats | None,
    valuation: Combined | None,
    range_inputs: RangeInputs | None,
    rng: Range | None,
    settings: dict[str, Any],
    lines: dict[str, Any],
) -> dict[str, Any]:
    out = {
        "version": VERSION,
        "cik": cik,
        "financial_class": financial_class,
        "risk_free": risk_free,
        "company": asdict(inputs) if inputs else None,
        "peer_stats": asdict(stats) if stats else None,
        "methods": [
            {"method": m.method, "value": m.value, "reason": m.reason, "details": m.details}
            for m in (valuation.methods if valuation else [])
        ],
        "value": valuation.value if valuation else None,
        "spread": valuation.spread if valuation else None,
        "triggers": list(valuation.triggers) if valuation else [],
        "range": (
            {
                **asdict(range_inputs),
                "blended_volatility": rng.volatility,
                "bear": rng.bear,
                "base": rng.base,
                "bull": rng.bull,
            }
            if range_inputs and rng
            else None
        ),
        "rules": {
            "cost_of_equity": settings["cost_of_equity"],
            "cost_of_debt_max_spread": settings["cost_of_debt_max_spread"],
            "triggers": settings["triggers"],
            "dcf": settings["dcf"],
            "residual_income": settings["residual_income"],
            "multiples": settings["multiples"],
            "range": lines["range"],
        },
    }
    return _finite(out)


def _finite(value: Any) -> Any:
    """JSON with no NaN or infinity in it (the app's JSON reader refuses them)."""
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {k: _finite(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_finite(v) for v in value]
    return value


def save(conn: sqlite3.Connection, run_id: str, output: dict[str, Any]) -> None:
    # Not through `Run._save_step`: this row isn't a step to resume from.
    with conn:
        conn.execute(
            "INSERT OR REPLACE INTO step_outputs (run_id, step, json) VALUES (?, ?, ?)",
            (run_id, STEP, json.dumps(output, default=str, allow_nan=False)),
        )


def load(conn: sqlite3.Connection, run_id: str) -> dict[str, Any] | None:
    """The saved inputs, or None for a run from before they were saved."""
    row = conn.execute(
        "SELECT json FROM step_outputs WHERE run_id = ? AND step = ?", (run_id, STEP)
    ).fetchone()
    return json.loads(row[0]) if row else None
