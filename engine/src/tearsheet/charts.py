"""The price series behind the chart: the company, its peer group and SPY, plus filing dates."""

from __future__ import annotations

import json
import sqlite3
from datetime import date
from pathlib import Path
from typing import Any

from tearsheet.data.prices import PriceStore
from tearsheet.data.sec import SUBMISSIONS_URL, filings_from
from tearsheet.rawstore import RawStore
from tearsheet.report_numbers import parse_code_lines

SPY_CIK = 884394


def _report(conn: sqlite3.Connection, run_id: str) -> dict:
    row = conn.execute(
        "SELECT s.json FROM reports r JOIN sections s ON s.report_id = r.report_id"
        " AND s.key = 'report' WHERE r.run_id = ? ORDER BY r.created_at DESC, r.rowid DESC",
        (run_id,),
    ).fetchone()
    try:
        report = json.loads(row[0]) if row else {}
    except ValueError:
        return {}
    return report if isinstance(report, dict) else {}


def _raw_dir(conn: sqlite3.Connection) -> Path | None:
    for row in conn.execute("PRAGMA database_list"):
        if row[1] == "main" and row[2]:
            return Path(row[2]).parent / "raw"
    return None


def _filing_dates(conn: sqlite3.Connection, cik: int, run_id: str) -> dict[str, date]:
    """Accession -> filing date, from the submissions documents this run stored."""
    raw_dir = _raw_dir(conn)
    if raw_dir is None:
        return {}
    first = SUBMISSIONS_URL.format(cik=cik)
    hashes = conn.execute(
        "SELECT DISTINCT raw_hash FROM fetch_log WHERE run_id = ? AND provider = 'sec'"
        " AND (request_key = ? OR request_key LIKE 'https://data.sec.gov/submissions/%')",
        (run_id, first),
    ).fetchall()
    found: dict[str, date] = {}
    for (raw_hash,) in hashes:
        try:
            doc = json.loads(RawStore.read(raw_dir, raw_hash))
            blocks = [doc.get("filings", {}).get("recent", {}), doc]  # main file, or a later page
            for block in blocks:
                if isinstance(block, dict) and block.get("accessionNumber"):
                    for f in filings_from(block, cik):
                        found[f.accession] = f.filed
        except (OSError, ValueError, KeyError, AttributeError, TypeError):
            continue
    return found


def _filings(conn: sqlite3.Connection, cik: int, run_id: str, report: dict) -> list[dict]:
    listed = [f for f in report.get("filings") or [] if isinstance(f, dict)]
    if not listed:
        return []
    dates = _filing_dates(conn, cik, run_id)
    out = [
        {"date": dates[f["accession"]].isoformat(), "form": f.get("form", "")}
        for f in listed
        if f.get("accession") in dates
    ]
    return sorted(out, key=lambda f: f["date"])


def _index(prices: PriceStore, ciks: list[int], dates: list[str]) -> list[float | None]:
    """Equal-weighted buy-and-hold total-return index, 100 at the first date all have a close."""
    if not ciks or not dates:
        return [None] * len(dates)
    cumulative: list[dict[str, float]] = []
    for cik in ciks:
        closes = prices.closes(cik)
        if not closes:
            return [None] * len(dates)
        growth, path = 1.0, {closes[0][0].isoformat(): 1.0}
        for day, gross in prices.daily_gross_returns(cik):
            growth *= gross
            path[day.isoformat()] = growth
        cumulative.append(path)
    start = max(min(path) for path in cumulative)
    state: list[float | None] = [None] * len(ciks)
    base: list[float] | None = None
    out: list[float | None] = []
    for day in dates:
        for i, path in enumerate(cumulative):
            if day in path:
                state[i] = path[day]
        if base is None and day >= start and all(v is not None for v in state):
            base = [float(v) for v in state if v is not None]
        if base is None:
            out.append(None)
        else:
            current = [float(v) for v in state if v is not None]
            out.append(100.0 * sum(c / b for c, b in zip(current, base, strict=True)) / len(base))
    return out


def _split_adjusted(
    rows: list[tuple[str, float, float | None]], splits: dict[date, float]
) -> tuple[list[float], list[int]]:
    """Closes and volumes in today's shares: each day's close divided by the splits executed
    after it (up to the last close), and its volume multiplied by them. The last close stays
    the real one, and a split draws no cliff."""
    if not rows:
        return [], []
    last = date.fromisoformat(rows[-1][0])
    pending = sorted(((d, r) for d, r in splits.items() if d <= last and r > 0), reverse=True)
    closes: list[float] = []
    volumes: list[int] = []
    factor, k = 1.0, 0
    for day, close, volume in reversed(rows):
        when = date.fromisoformat(day)
        while k < len(pending) and pending[k][0] > when:
            factor *= pending[k][1]
            k += 1
        closes.append(round(float(close) / factor, 6))
        volumes.append(int(round((volume or 0) * factor)))
    return closes[::-1], volumes[::-1]


def chart_series(conn: sqlite3.Connection, cik: int, run_id: str) -> dict[str, Any]:
    prices = PriceStore(conn)
    rows = conn.execute(
        "SELECT date, close_unadjusted, volume FROM prices_daily"
        " WHERE cik = ? AND share_class = '' ORDER BY date",
        (cik,),
    ).fetchall()
    dates = [r[0] for r in rows]
    close, volume = _split_adjusted(rows, prices.splits(cik))
    peer_ciks = [
        r[0]
        for r in conn.execute(
            "SELECT peer_cik FROM peer_groups WHERE run_id = ? AND peer_cik != ? ORDER BY peer_cik",
            (run_id, cik),
        )
    ]
    report = _report(conn, run_id)
    numbers = parse_code_lines(report)
    triggers = numbers.get("triggers")
    return {
        "dates": dates,
        "close": close,
        "volume": volume,
        # The company's total return (splits and dividends), on the same basis as the peers
        # and SPY, for the chart's compare view.
        "total": _index(prices, [cik], dates),
        "peers": _index(prices, peer_ciks, dates),
        "spy": _index(prices, [SPY_CIK], dates),
        "filings": _filings(conn, cik, run_id, report),
        "trigger": triggers["buy"] if triggers else None,
        "range": numbers.get("range"),
        "first_date": dates[0] if dates else "",
    }
