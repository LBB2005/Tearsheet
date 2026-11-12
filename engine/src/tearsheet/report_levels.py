"""Each report's levels as numbers (`report_levels`, migration 0006), for the watchlist.

A report's rating, 12-month range and rating-change prices ("triggers") are written as text in
the report. The watchlist and its alerts need them as numbers, so each report gets one row:

* written when the report is saved (`Run.save`), from the run's own `Rating` and range, as exact
  floats (source 'run');
* for a report saved before this table existed, filled once from its code-written lines by the
  same anchored parser the chart and report bar use (`report_numbers.parse_code_lines`), so to
  the cent (source 'parsed'). `fill` runs at engine start and after each report.

A row holds what the report says and nothing more: a rating withheld, or a report whose
sections 1-3 are withheld for stale prices, has no rating, range or triggers here either. Every
price is in the shares of the report's price date (`price_date`). Nothing here changes a step
output, so replay is untouched; erasing a report erases its row (report_marks.erase).
"""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import date
from typing import Any

from tearsheet.rating import NOT_REACHABLE
from tearsheet.report_numbers import parse_code_lines, run_price_date

log = logging.getLogger(__name__)

COLUMNS = (
    "report_id",
    "run_id",
    "cik",
    "price_date",
    "price",
    "rating",
    "capped",
    "uncertainty",
    "score_percentile",
    "estimate",
    "bear",
    "base",
    "bull",
    "buy_trigger",
    "sell_trigger",
    "buy_reachable",
    "sell_reachable",
    "source",
)
# The sections that hold the code-written lines (as the render step stores them).
CODE_SECTIONS = ("rating", "score", "valuation", "watch")


def _trigger(value: Any) -> tuple[float | None, int | None]:
    """A rating's trigger as (price, reachable): a price, "not reachable by price alone" (0), or
    none at all (None, as the report's line then shows no price either)."""
    if isinstance(value, float):
        return value, 1
    if value == NOT_REACHABLE:
        return None, 0
    return None, None


def from_run(
    *,
    report_id: str,
    run_id: str,
    cik: int,
    price_date: date,
    price: float | None,
    rating,
    rng,
    uncertainty: str | None,
    score: float | None,
    estimate: float | None,
    withheld: bool,
) -> dict[str, Any]:
    """The row for a report being saved, from the run's `Rating` and `Range`, showing exactly
    what `Run.save` writes: with sections 1-3 withheld nothing but the price date; with the rating
    withheld no rating, score, range or triggers (section 3's price and estimate still show)."""
    row: dict[str, Any] = dict.fromkeys(COLUMNS)
    row.update(
        report_id=report_id,
        run_id=run_id,
        cik=cik,
        price_date=price_date.isoformat(),
        capped=0,
        source="run",
    )
    if withheld:
        return row
    row["price"] = price
    row["estimate"] = estimate
    if rating.rating is None:
        return row
    row["rating"] = rating.rating
    row["capped"] = int(rating.uncapped != rating.rating)
    # As section 1 writes it: the score to a whole percentile.
    row["score_percentile"] = int(f"{score or 0:.0f}")
    if rng is not None:
        row.update(bear=rng.bear, base=rng.base, bull=rng.bull, uncertainty=uncertainty)
    if rating.triggers:
        row["buy_trigger"], row["buy_reachable"] = _trigger(rating.triggers.get("buy"))
        row["sell_trigger"], row["sell_reachable"] = _trigger(rating.triggers.get("sell"))
    return row


def _parsed_trigger(triggers: dict | None, side: str) -> tuple[float | None, int | None]:
    if not triggers:
        return None, None
    if triggers.get(side) is not None:  # the line gave a price
        return float(triggers[side]), 1
    if (triggers.get(f"{side}_text") or "").startswith(NOT_REACHABLE):
        return None, 0
    return None, None


def from_lines(
    sections: list[dict], *, report_id: str, run_id: str, cik: int, price_date: date
) -> dict[str, Any]:
    """The row for an older report, from its code-written lines (`sections`: the rating, score,
    valuation and watch sections, each with its paragraphs)."""
    numbers = parse_code_lines({"sections": sections})
    row: dict[str, Any] = dict.fromkeys(COLUMNS)
    row.update(
        report_id=report_id,
        run_id=run_id,
        cik=cik,
        price_date=price_date.isoformat(),
        capped=0,
        source="parsed",
    )
    rating = numbers["rating"]
    if rating:
        row["rating"] = rating["call"]
        row["capped"] = int(bool(rating["capped"]))
        if rating.get("uncertainty"):
            # The code's spelling ("very_high"), as runs and predictions store it.
            row["uncertainty"] = rating["uncertainty"].strip().replace(" ", "_")
    if numbers["score"]:
        row["score_percentile"] = numbers["score"]["percentile"]
    if numbers["range"]:
        row.update(numbers["range"])
    if numbers["price"]:
        row["price"] = numbers["price"]["value"]
    if numbers["estimate"]:
        row["estimate"] = numbers["estimate"]["value"]
    row["buy_trigger"], row["buy_reachable"] = _parsed_trigger(numbers["triggers"], "buy")
    row["sell_trigger"], row["sell_reachable"] = _parsed_trigger(numbers["triggers"], "sell")
    return row


def insert(conn: sqlite3.Connection, row: dict[str, Any]) -> None:
    """Store a row. The caller holds the transaction (Run.save writes it with its report)."""
    names = ", ".join(COLUMNS)
    marks = ", ".join("?" for _ in COLUMNS)
    conn.execute(
        f"INSERT OR IGNORE INTO report_levels ({names}) VALUES ({marks})",
        [row[c] for c in COLUMNS],
    )


def _render_sections(text: str | None) -> list[dict] | None:
    """The render step's code-written lines as sections, or None if it isn't stored or readable."""
    if not text:
        return None
    try:
        stored = json.loads(text)
        code = stored.get("code_sections") or {}
        sections = [
            {"key": key, "paragraphs": part.get("paragraphs") or [], "table": part.get("table")}
            for key, part in code.items()
            if isinstance(part, dict)
        ]
        return [*sections, {"key": "watch", "paragraphs": stored.get("triggers") or []}]
    except (ValueError, AttributeError, TypeError):
        return None


def _own_sections(conn: sqlite3.Connection, report_id: str) -> list[dict]:
    """The report's own stored sections that hold code-written lines."""
    out = []
    marks = ", ".join("?" for _ in CODE_SECTIONS)
    for (text,) in conn.execute(
        f"SELECT json FROM sections WHERE report_id = ? AND key IN ({marks})",
        (report_id, *CODE_SECTIONS),
    ):
        try:
            section = json.loads(text)
        except ValueError:
            continue
        if isinstance(section, dict):
            out.append(section)
    return out


def fill(conn: sqlite3.Connection) -> int:
    """Give every stored report without a row its row, from its code-written lines: the run's
    render step (1.9 KB) when the run has only this report, else the report's own sections.
    Idempotent and cheap once done (only reports with no row are read). Returns how many."""
    missing = conn.execute(
        "SELECT r.report_id, r.run_id, u.cik,"
        " (SELECT COUNT(*) FROM reports o WHERE o.run_id = r.run_id) AS reports,"
        " (SELECT json FROM step_outputs s WHERE s.run_id = r.run_id AND s.step = 'render')"
        "   AS render"
        " FROM reports r JOIN runs u ON u.run_id = r.run_id"
        " WHERE u.cik IS NOT NULL"
        "   AND NOT EXISTS (SELECT 1 FROM report_levels l WHERE l.report_id = r.report_id)"
    ).fetchall()
    rows = []
    for report_id, run_id, cik, reports, render in missing:
        price_date = run_price_date(conn, run_id)
        if price_date is None:
            continue
        sections = _render_sections(render) if reports == 1 else None
        if sections is None:
            sections = _own_sections(conn, report_id)
        rows.append(
            from_lines(
                sections, report_id=report_id, run_id=run_id, cik=int(cik), price_date=price_date
            )
        )
    if rows:
        with conn:
            for row in rows:
                insert(conn, row)
        log.info("filled the levels of %d older report(s)", len(rows))
    return len(rows)
