"""Structured numbers read back out of a stored report.

The code-written lines every report already has (rating, score, range, price, triggers, tables)
are parsed with one anchored pattern per line; the rest comes from the stored tables of the run.
Nothing is written at save time, so old reports fill in too. A line that does not match leaves
its key None; nothing here raises on odd input.
"""

from __future__ import annotations

import json
import re
import sqlite3
from datetime import date
from statistics import median
from typing import Any

from tearsheet.data.prices import PriceStore, split_factor_after

FRED_LABELS = {
    "UNRATE": "Unemployment rate",
    "A191RL1Q225SBEA": "Real GDP growth",
    "DGS10": "10-year Treasury yield",
    "CPIAUCSL": "Consumer prices, past year",
    "DTWEXBGS": "Trade-weighted dollar",
}

METRIC_LABELS = {
    "operating_margin": "Operating margin",
    "return_on_invested_capital": "Return on invested capital",
    "gross_profit_to_assets": "Gross profit to assets",
    "interest_coverage": "Interest coverage",
    "free_cash_flow_yield": "Free cash flow yield",
    "earnings_yield": "Earnings yield",
    "accruals_to_assets": "Accruals to assets",
    "operating_cash_flow_to_net_income": "Cash flow to net income",
}

WEEKS = 52
_MONEY = r"\$([\d,]+\.\d\d)"

_RATING = re.compile(r"^Rating: (Buy|Hold|Sell)( \(capped[^)]*\))?\.")
_UNCERTAINTY = re.compile(r"^12-month range: .*?Uncertainty: ([^.]+)\.\s*$")
_SCORE = re.compile(r"^Score: (\d+)(?:st|nd|rd|th) percentile")
_RANGE = re.compile(rf"^12-month range: bear {_MONEY}, base {_MONEY}, bull {_MONEY}")
_PRICE = re.compile(rf"^Price: {_MONEY} on (\d{{1,2}} \w{{3}} \d{{4}})\.")
_ESTIMATE = re.compile(
    rf"^Estimated value: {_MONEY}\.(?: Gap percentile among valued peers: (\d+)\.)?"
)
_TRIGGER = re.compile(r"^(Buy|Sell) trigger: (.*?)(?: \(holding[^)]*\))?\.?$")
_RETURNS = re.compile(
    r"^Total return over the past 12 months: .*?(-?[\d.]+)%; peer group \(equal-weighted\) "
    r"(-?[\d.]+)%; S&P 500 \(SPY\) (-?[\d.]+)%\."
)
_PEER_RATINGS = re.compile(
    r"^In this peer group today \(.*?\): (\d+) Buy, (\d+) Hold, (\d+) Sell\."
)
_ECONOMY = re.compile(r"^Economic series \(FRED\): (.*?)\.?$")
_ECONOMY_ITEM = re.compile(r"^(\w+) (-?[\d.,]+%?) \((\d{1,2} \w{3} \d{4})\)$")


def _money(text: str) -> float:
    return float(text.replace(",", ""))


def _section(report: dict, key: str) -> dict:
    for section in report.get("sections") or []:
        if isinstance(section, dict) and section.get("key") == key:
            return section
    return {}


def _paragraphs(report: dict, key: str) -> list[str]:
    return [p for p in _section(report, key).get("paragraphs") or [] if isinstance(p, str)]


def _find(report: dict, key: str, pattern: re.Pattern[str]) -> re.Match[str] | None:
    for paragraph in _paragraphs(report, key):
        match = pattern.match(paragraph)
        if match:
            return match
    return None


def _table_rows(report: dict, key: str) -> list[list[str]]:
    table = _section(report, key).get("table") or []
    return [r for r in table[1:] if isinstance(r, list)]  # the first row is the header


def _guard(parse: Any) -> Any:
    try:
        return parse()
    except (ValueError, TypeError, IndexError, KeyError):
        return None


def _rating(report: dict) -> dict | None:
    match = _find(report, "rating", _RATING)
    if not match:
        return None
    unc = _find(report, "rating", _UNCERTAINTY)
    return {
        "call": match.group(1),
        "capped": match.group(2) is not None,
        "uncertainty": unc.group(1) if unc else None,
    }


def _trigger(report: dict, side: str) -> tuple[float | None, str] | None:
    for paragraph in _paragraphs(report, "watch"):
        match = _TRIGGER.match(paragraph)
        if match and match.group(1) == side:
            text = match.group(2)
            money = re.match(_MONEY, text)
            return (_money(money.group(1)) if money else None), text
    return None


def _triggers(report: dict) -> dict | None:
    buy, sell = _trigger(report, "Buy"), _trigger(report, "Sell")
    if buy is None and sell is None:
        return None
    return {
        "buy": buy[0] if buy else None,
        "sell": sell[0] if sell else None,
        "buy_text": buy[1] if buy else "",
        "sell_text": sell[1] if sell else "",
    }


def _factors(report: dict) -> list[dict] | None:
    rows = [
        {"name": r[0], "percentile": int(r[1]), "weight": round(float(r[2].rstrip("%")) / 100, 6)}
        for r in _table_rows(report, "score")
    ]
    return rows or None


def _methods(report: dict) -> list[dict] | None:
    rows = []
    for r in _table_rows(report, "valuation"):
        money = re.fullmatch(_MONEY, r[1])
        if money:
            rows.append({"method": r[0], "value": _money(money.group(1))})
    return rows or None


def _economy(report: dict) -> list[dict] | None:
    match = _find(report, "trends", _ECONOMY)
    if not match:
        return None
    rows = []
    for item in match.group(1).split("; "):
        parsed = _ECONOMY_ITEM.match(item.strip())
        if parsed:
            series = parsed.group(1)
            rows.append(
                {
                    "series": series,
                    "label": FRED_LABELS.get(series, series),
                    "value": parsed.group(2),
                    "date": parsed.group(3),
                }
            )
    return rows or None


def parse_code_lines(report: dict) -> dict:
    """Numbers from the code-written lines of a report. Every key is present, or None."""

    def one(key: str, pattern: re.Pattern[str], build: Any) -> Any:
        match = _find(report, key, pattern)
        return _guard(lambda: build(match)) if match else None

    return {
        "rating": _guard(lambda: _rating(report)),
        "score": one("rating", _SCORE, lambda m: {"percentile": int(m.group(1))}),
        "range": one(
            "rating",
            _RANGE,
            lambda m: {
                "bear": _money(m.group(1)),
                "base": _money(m.group(2)),
                "bull": _money(m.group(3)),
            },
        ),
        "price": one(
            "valuation", _PRICE, lambda m: {"value": _money(m.group(1)), "date": m.group(2)}
        ),
        "estimate": one(
            "valuation",
            _ESTIMATE,
            lambda m: {
                "value": _money(m.group(1)),
                "gap_percentile": int(m.group(2)) if m.group(2) else None,
            },
        ),
        "triggers": _guard(lambda: _triggers(report)),
        "factors": _guard(lambda: _factors(report)),
        "methods": _guard(lambda: _methods(report)),
        "returns_12m": one(
            "rating",
            _RETURNS,
            lambda m: {
                "company": float(m.group(1)),
                "peers": float(m.group(2)),
                "spy": float(m.group(3)),
            },
        ),
        "peer_ratings": one(
            "valuation",
            _PEER_RATINGS,
            lambda m: {"Buy": int(m.group(1)), "Hold": int(m.group(2)), "Sell": int(m.group(3))},
        ),
        "economy": _guard(lambda: _economy(report)),
    }


# --- Stored tables ------------------------------------------------------------------------


def _metrics(conn: sqlite3.Connection, run_id: str, cik: int) -> list[dict] | None:
    values = {
        (r[0], r[1]): r[2]
        for r in conn.execute("SELECT cik, name, value FROM metrics WHERE run_id = ?", (run_id,))
        if r[2] is not None
    }
    peers = [
        r[0]
        for r in conn.execute(
            "SELECT peer_cik FROM peer_groups WHERE run_id = ? AND peer_cik != ?", (run_id, cik)
        )
    ]
    rows = []
    for name, label in METRIC_LABELS.items():
        if (cik, name) not in values:
            continue
        value = float(values[(cik, name)])
        peer_values = [float(values[(p, name)]) for p in peers if (p, name) in values]
        rows.append(
            {
                "name": name,
                "label": label,
                "value": value,
                "peer_median": median(peer_values) if peer_values else None,
                "percentile": round(100 * sum(v < value for v in peer_values) / len(peer_values))
                if peer_values
                else None,
            }
        )
    return rows or None


def _weekly(conn: sqlite3.Connection, run_id: str, cik: int) -> list[dict] | None:
    """The last close of each of the past 52 weeks, in the run date's shares: each close is
    divided by the splits executed after it up to the run date, so a split draws no cliff and
    the series ends at the run-date close, on the report's own basis."""
    run = conn.execute("SELECT started_at FROM runs WHERE run_id = ?", (run_id,)).fetchone()
    if not run:
        return None
    end = date.fromisoformat(run[0][:10])
    store = PriceStore(conn)
    splits = store.splits(cik)
    last_of_week: dict[tuple[int, int], tuple[date, float]] = {}
    for day, close in store.closes(cik, up_to=end):  # ascending by date
        iso = day.isocalendar()
        adjusted = round(close / split_factor_after(splits, day, up_to=end), 6)
        last_of_week[(iso[0], iso[1])] = (day, adjusted)
    points = sorted(last_of_week.values())[-WEEKS:]
    return [{"date": d.isoformat(), "close": c} for d, c in points] or None


def _claims(conn: sqlite3.Connection, run_id: str) -> dict | None:
    report = conn.execute(
        "SELECT report_id FROM reports WHERE run_id = ? ORDER BY created_at DESC, rowid DESC",
        (run_id,),
    ).fetchone()
    if not report:
        return None
    kept, removed = conn.execute(
        "SELECT COALESCE(SUM(removed = 0), 0), COALESCE(SUM(removed = 1), 0)"
        " FROM claims WHERE report_id = ?",
        (report[0],),
    ).fetchone()
    return {"kept": int(kept), "removed": int(removed)}


def _red_flags(conn: sqlite3.Connection, run_id: str) -> list[str] | None:
    row = conn.execute(
        "SELECT json FROM step_outputs WHERE run_id = ? AND step = 'text'", (run_id,)
    ).fetchone()
    if not row:
        return None
    flags = json.loads(row[0]).get("red_flags")
    return [str(f) for f in flags] if isinstance(flags, list) else None


def stored_numbers(conn: sqlite3.Connection, run_id: str, cik: int) -> dict:
    """Numbers from the run's stored tables. Every key is present, or None."""
    return {
        "metrics": _guard(lambda: _metrics(conn, run_id, cik)),
        "weekly": _guard(lambda: _weekly(conn, run_id, cik)),
        "claims": _guard(lambda: _claims(conn, run_id)),
        "red_flags": _guard(lambda: _red_flags(conn, run_id)),
    }


def numbers_for(conn: sqlite3.Connection, report: dict, run_id: str, cik: int) -> dict:
    return {**parse_code_lines(report), **stored_numbers(conn, run_id, cik)}
