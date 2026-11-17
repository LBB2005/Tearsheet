"""The peers part: the report's peer group with the numbers its run stored ("as of the
report"), each member's score recomputed from them with the run's own methodology copy, its
newest official prediction, and its total return since the report and over 12 months."""

from __future__ import annotations

import json
import math
import sqlite3
import statistics
from datetime import date
from pathlib import Path
from typing import Any

from tearsheet.charts import SPY_CIK
from tearsheet.data.membership import Holdings
from tearsheet.data.prices import PriceStore
from tearsheet.data.sec import SUBMISSIONS_URL
from tearsheet.dig.sector import months_back
from tearsheet.dig.target import Target
from tearsheet.key_numbers import _Stored
from tearsheet.methodology import from_stored
from tearsheet.metrics import LEFT_OUT_FOR_FINANCIALS, Metric
from tearsheet.pipeline import _stored_copies, financial_class, twelve_month_return
from tearsheet.rawstore import RawStore
from tearsheet.report_numbers import METRIC_LABELS, run_price_date
from tearsheet.scoring import SLICE_METRICS, momentum_scaling, score_group

FINANCIAL_SECTORS = ("Financials", "Real Estate")
RECOMPUTED_NOTE = "Scores recomputed from the report’s stored numbers."


class NoMethodCopy(LookupError):
    """The run stored no copy of its methodology, so its scores can't be worked out again."""


def _stored_class(conn: sqlite3.Connection, cik: int) -> str:
    row = conn.execute("SELECT financial_class FROM companies WHERE cik = ?", (cik,)).fetchone()
    return (row[0] or "") if row else ""


def financial_members(
    conn: sqlite3.Connection,
    raw_dir: Path,
    run_id: str,
    ciks: list[int],
    *,
    sector: str | None,
    rules: dict[str, Any],
) -> set[int]:
    """The banks and insurers among `ciks`, classed as the run classed its peers: from the SIC
    code in the filing list it stored, in a financial sector only; else as stored."""
    if sector not in FINANCIAL_SECTORS:
        return set()
    found = set()
    for cik in ciks:
        row = conn.execute(
            "SELECT raw_hash FROM fetch_log WHERE run_id = ? AND request_key = ?"
            " ORDER BY fetch_id DESC LIMIT 1",
            (run_id, SUBMISSIONS_URL.format(cik=cik)),
        ).fetchone()
        kind = _stored_class(conn, cik)
        if row:
            try:
                sic = str(json.loads(RawStore.read(raw_dir, row[0])).get("sic") or "")
                kind = financial_class(int(sic) if sic.isdigit() else None, cik, rules)
            except (OSError, ValueError, AttributeError):
                pass
        if kind in ("bank", "insurer"):
            found.add(cik)
    return found


def restore_infinite(
    name: str, value: float | None, inputs: dict[str, Any], *, financial: bool
) -> float | None:
    """A metric's value as the run scored it. The run stores an infinite metric as NULL
    (metrics.py: no interest expense ranks best, EBITDA of zero or below ranks worst), so its
    stored inputs say when an empty value was infinite. Left-out metrics of banks and insurers
    stay empty."""
    if value is not None or (financial and name in LEFT_OUT_FOR_FINANCIALS):
        return value
    if name == "interest_coverage":
        if inputs.get("ebit") is not None and not inputs.get("interest_expense"):
            return math.inf
    elif name == "net_debt_to_ebitda":
        ebitda = inputs.get("ebitda")
        if ebitda is not None and inputs.get("net_debt") is not None and ebitda <= 0:
            return math.inf
    return value


def recompute_scores(
    conn: sqlite3.Connection,
    raw_dir: Path,
    run_id: str,
    *,
    price_date: date,
    sector: str | None = None,
) -> dict[int, float]:
    """Every member's composite percentile in the run's group, worked out again from the run's
    stored metrics, methodology copy and mode, with SPY read up to the run's price date.
    Writes nothing. Raises NoMethodCopy without the run's methodology copy."""
    copies = _stored_copies(conn, run_id)
    if "methodology" not in copies or "reference" not in copies:
        raise NoMethodCopy(run_id)
    method = from_stored(
        RawStore.read(raw_dir, copies["methodology"]), RawStore.read(raw_dir, copies["reference"])
    )
    run = conn.execute("SELECT cik, mode FROM runs WHERE run_id = ?", (run_id,)).fetchone()
    company = int(run["cik"])
    stored: dict[int, list[tuple[str, float | None, dict[str, Any]]]] = {}
    for cik, name, value, inputs in conn.execute(
        "SELECT cik, name, value, inputs_json FROM metrics WHERE run_id = ?", (run_id,)
    ):
        try:
            parsed = json.loads(inputs or "{}")
        except ValueError:
            parsed = {}
        stored.setdefault(int(cik), []).append(
            (
                name,
                None if value is None else float(value),
                parsed if isinstance(parsed, dict) else {},
            )
        )
    if sector is None:
        row = conn.execute("SELECT sector FROM companies WHERE cik = ?", (company,)).fetchone()
        sector = row[0] if row else None
    peers = [c for c in stored if c != company]
    financial = financial_members(conn, raw_dir, run_id, peers, sector=sector, rules=method.peers)
    if _stored_class(conn, company) in ("bank", "insurer"):
        financial.add(company)
    metrics = {
        cik: {
            name: Metric(
                name, restore_infinite(name, value, inputs, financial=cik in financial), inputs
            )
            for name, value, inputs in rows
        }
        for cik, rows in stored.items()
    }
    prices = PriceStore(conn)
    scaling = momentum_scaling(
        prices.log_returns(SPY_CIK, up_to=price_date),
        spy_12m_return=twelve_month_return(prices, SPY_CIK, price_date),
        rules=method.weights["momentum_scaling"],
    )
    result = score_group(
        metrics,
        method.weights,
        metric_set=SLICE_METRICS if run["mode"] == "slice" else None,
        scaling=scaling,
        financial_members=financial,
    )
    return result.composite


def _names(conn: sqlite3.Connection, holdings: Holdings, cik: int) -> tuple[str, str]:
    if holdings.has(cik):
        return holdings.tickers_of(cik)[0], holdings.name_of(cik)
    ticker = conn.execute(
        "SELECT ticker FROM tickers WHERE cik = ? ORDER BY date_from DESC LIMIT 1", (cik,)
    ).fetchone()
    name = conn.execute("SELECT name FROM companies WHERE cik = ?", (cik,)).fetchone()
    shown = ticker[0] if ticker else str(cik)
    return shown, name[0] if name else shown


def _median(values: list[float | None]) -> float | None:
    found = [v for v in values if v is not None]
    return statistics.median(found) if found else None


def peers_part(
    conn: sqlite3.Connection,
    raw_dir: Path,
    target: Target,
    prices: PriceStore,
    holdings: Holdings,
    *,
    up_to: date,
    before: str,
) -> dict[str, Any]:
    """`before` is the snapshot's time: a prediction made after it isn't shown. Reads only."""
    run_id = target.shown.run_id
    if run_id is None:
        return {"state": "off", "note": "No report run to compare peers from."}
    stored = _Stored(conn, run_id, target.cik)
    if not stored.values and not stored.peers:
        return {"state": "off", "note": "The report’s run stored no peer numbers."}
    price_date = run_price_date(conn, run_id)
    note = RECOMPUTED_NOTE
    try:
        scores = (
            recompute_scores(conn, raw_dir, run_id, price_date=price_date, sector=target.sector)
            if price_date
            else {}
        )
    except NoMethodCopy:
        scores = {}
        note = "Scores couldn’t be recomputed: the report’s run kept no methodology copy."
    members = [target.cik, *stored.peers]
    marks = ", ".join("?" for _ in members)
    newest: dict[int, sqlite3.Row] = {}
    for p in conn.execute(
        f"SELECT cik, rating, run_at FROM predictions WHERE cik IN ({marks}) AND run_at <= ?"
        " ORDER BY run_at, prediction_id",
        (*members, before),
    ):
        newest[int(p["cik"])] = p
    year_start = months_back(up_to, 12)
    rows = []
    for cik in members:
        ticker, name = _names(conn, holdings, cik)
        prediction = newest.get(cik)
        rows.append(
            {
                "cik": cik,
                "ticker": ticker,
                "name": name,
                "is_company": cik == target.cik,
                "numbers": {key: stored.value(key, cik) for key in METRIC_LABELS},
                "score": scores.get(cik),
                "rating": prediction["rating"] if prediction is not None else None,
                "rated_at": prediction["run_at"][:10] if prediction is not None else None,
                "since_report": prices.total_return(cik, "", price_date, up_to)
                if price_date
                else None,
                "return_12m": prices.total_return(cik, "", year_start, up_to),
            }
        )
    company, peers = rows[0], rows[1:]
    peers.sort(key=lambda r: (r["score"] is None, -(r["score"] or 0.0), r["ticker"]))
    median: dict[str, float | None] = {
        key: stored.peer_median(lambda p, k=key: stored.value(k, p))[0] for key in METRIC_LABELS
    }
    for key in ("score", "since_report", "return_12m"):
        median[key] = _median([r[key] for r in peers])
    levels = target.levels_today or {}
    return {
        "state": "ok",
        "note": None,
        "run_id": run_id,
        "report_date": levels.get("report_date"),
        "price_date": price_date.isoformat() if price_date else None,
        "columns": [{"key": k, "label": label} for k, label in METRIC_LABELS.items()],
        "rows": [company, *peers],
        "median": median,
        "recomputed_note": note,
    }
