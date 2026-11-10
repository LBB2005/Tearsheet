"""The report's numbers for the app's bigger views (protocol.ReportNumbers).

They are the numbers report_numbers reads back out of a stored report, plus what can be worked
out from stored data: each peer's metric values and 12-month return, and 3- and 5-year total
returns where the company's and SPY's stored closes reach back that far. Every item carries its
readout from readouts.py, the same wording the report uses. Nothing new is stored, and what
isn't stored is left out: each part is None when it can't be read, and never raises.
"""

from __future__ import annotations

import sqlite3
from datetime import date, timedelta
from functools import cache
from statistics import mean
from typing import Any

from tearsheet import readouts
from tearsheet.charts import SPY_CIK
from tearsheet.data.membership import Holdings, load_bundled
from tearsheet.data.prices import PriceStore
from tearsheet.pipeline import twelve_month_return
from tearsheet.render import METRIC_KINDS, RED_FLAG_LABELS, format_value
from tearsheet.report_numbers import _guard, numbers_for, run_price_date

# How far after a span's start the stored closes may begin and still give the span. A full
# history reaches about five years back from the day it was downloaded, which can be a few days
# after the report's price date.
SPAN_SLACK_DAYS = 7
LONGER_SPANS = (3, 5)


def _years_before(day: date, years: int) -> date:
    try:
        return day.replace(year=day.year - years)
    except ValueError:  # 29 February
        return day.replace(year=day.year - years, day=28)


def span_return(store: PriceStore, cik: int, end: date, years: int) -> float | None:
    """The total return, as a fraction, over `years` calendar years to the last close on or
    before `end`. A history that starts up to SPAN_SLACK_DAYS after the span's start runs from
    its first close; one that starts later, or has fewer than two closes, gives None."""
    closes = store.closes(cik, up_to=end)
    if len(closes) < 2:
        return None
    start, first = _years_before(end, years), closes[0][0]
    if first > start + timedelta(days=SPAN_SLACK_DAYS):
        return None
    return store.total_return(cik, "", max(start, first), end)


def peer_ticker(conn: sqlite3.Connection, holdings: Holdings, cik: int) -> str:
    """A peer's name in the views: its rated ticker in the bundled holdings, else the ticker a
    run last recorded for it, else its CIK."""
    if holdings.has(cik):
        return holdings.tickers_of(cik)[0]
    row = conn.execute(
        "SELECT ticker FROM tickers WHERE cik = ? ORDER BY date_from DESC, rowid DESC LIMIT 1",
        (cik,),
    ).fetchone()
    return row[0] if row else f"CIK {cik}"


def _peer_ciks(conn: sqlite3.Connection, run_id: str, cik: int) -> list[int]:
    return [
        r[0]
        for r in conn.execute(
            "SELECT peer_cik FROM peer_groups WHERE run_id = ? AND peer_cik != ? ORDER BY peer_cik",
            (run_id, cik),
        )
    ]


def _pct(fraction: float | None) -> float | None:
    return None if fraction is None else round(100 * fraction, 1)


def _title(section: dict) -> str:
    # A section stored without its title is named by its key.
    return str(section.get("title") or section.get("key") or "")


def _sections(report: dict) -> list[dict]:
    return [s for s in report.get("sections") or [] if isinstance(s, dict)]


# --- each part ------------------------------------------------------------------------------


def _factors(numbers: dict) -> list[dict]:
    return [
        {**f, "readout": readouts.factor(f["name"], f["percentile"], f["weight"])}
        for f in numbers["factors"]
    ]


def _metrics(
    conn: sqlite3.Connection, numbers: dict, run_id: str, cik: int, ticker: str, name_of: Any
) -> list[dict]:
    peers = _peer_ciks(conn, run_id, cik)
    values = {
        (r[0], r[1]): float(r[2])
        for r in conn.execute("SELECT cik, name, value FROM metrics WHERE run_id = ?", (run_id,))
        if r[2] is not None
    }
    out = []
    for m in numbers["metrics"]:
        kind = METRIC_KINDS.get(m["name"], "percent")
        text = format_value(kind, m["value"])
        median = m["peer_median"]
        median_text = format_value(kind, median) if median is not None else None
        theirs = sorted(
            ((name_of(p), values[(p, m["name"])]) for p in peers if (p, m["name"]) in values),
            key=lambda peer: -peer[1],
        )
        out.append(
            {
                "name": m["name"],
                "label": m["label"],
                "value": m["value"],
                "text": text,
                "peer_median": median,
                "median_text": median_text,
                "percentile": m["percentile"],
                "peers": [
                    {
                        "ticker": peer,
                        "value": value,
                        "text": format_value(kind, value),
                        "readout": readouts.peer_metric(
                            peer, m["label"], format_value(kind, value), text, ticker
                        ),
                    }
                    for peer, value in theirs
                ],
                "readout": readouts.metric(m["label"], text, median_text, m["percentile"], ticker),
            }
        )
    return out


def _methods(numbers: dict, today: float | None) -> list[dict]:
    return [
        {
            "method": m["method"],
            "label": readouts.method_label(m["method"]),
            "value": m["value"],
            "readout": readouts.method(m["method"], m["value"], today),
        }
        for m in numbers["methods"]
    ]


def _row(name: str, pct: float | None, years: int, *, group: bool = False) -> dict:
    return {
        "name": name,
        "value": pct,
        "readout": readouts.total_return(name, pct, years, group=group),
    }


def _returns(
    conn: sqlite3.Connection,
    numbers: dict,
    run_id: str,
    cik: int,
    ticker: str,
    priced: date | None,
    name_of: Any,
) -> list[dict] | None:
    """1 year from the report's own three figures where it has them, else worked out as the
    pipeline does; each peer's year from its stored closes; then 3 and 5 years where both the
    company's and SPY's closes reach back that far. Peers are stored for about 14 months, so
    the longer spans leave them off."""
    stored = numbers.get("returns_12m")
    if stored is None and priced is None:
        return None
    store = PriceStore(conn)
    peers = _peer_ciks(conn, run_id, cik) if priced is not None else []
    each = {p: twelve_month_return(store, p, priced) for p in peers}
    if stored is not None:
        company, group, spy = stored["company"], stored["peers"], stored["spy"]
    else:
        found = [r for r in each.values() if r is not None]
        company = _pct(twelve_month_return(store, cik, priced))
        group = _pct(mean(found)) if found else None
        spy = _pct(twelve_month_return(store, SPY_CIK, priced))
    each_peer = sorted(
        (_row(name_of(p), _pct(r), 1) for p, r in each.items()),
        key=lambda row: (row["value"] is None, -(row["value"] or 0.0)),
    )
    spans = [
        {
            "years": 1,
            "company": _row(ticker, company, 1),
            "peers": _row("Peer group", group, 1, group=True),
            "spy": _row("S&P 500", spy, 1),
            "each_peer": each_peer,
        }
    ]
    if priced is None:
        return spans
    for years in LONGER_SPANS:
        own = span_return(store, cik, priced, years)
        market = span_return(store, SPY_CIK, priced, years)
        if own is not None and market is not None:
            spans.append(
                {
                    "years": years,
                    "company": _row(ticker, _pct(own), years),
                    "peers": None,
                    "spy": _row("S&P 500", _pct(market), years),
                    "each_peer": [],
                }
            )
    return spans


def _red_flags(numbers: dict) -> list[dict] | None:
    """The four checks in the meter's order, then any other flag the run found."""
    codes = numbers.get("red_flags")
    if codes is None:
        return None
    labels = dict(RED_FLAG_LABELS)
    for code in codes:
        labels.setdefault(code, code.replace("_", " ").capitalize())
    return [
        {
            "code": code,
            "label": label,
            "found": code in codes,
            "readout": readouts.red_flag(label, code in codes),
        }
        for code, label in labels.items()
    ]


def _economy(numbers: dict) -> list[dict]:
    return [
        {**e, "readout": readouts.economy(e["label"], e["value"], e["date"])}
        for e in numbers["economy"]
    ]


def _peer_ratings(numbers: dict) -> dict:
    counts = numbers["peer_ratings"]
    total = sum(counts.values())
    return {
        "total": total,
        "slices": [
            {
                "key": call.lower(),
                "label": call,
                "count": counts[call],
                "readout": readouts.peer_rating(call, counts[call], total),
                # The run keeps only the counts, not which peers are which.
                "items": None,
            }
            for call in ("Buy", "Hold", "Sell")
        ],
    }


def _claims(numbers: dict, report: dict) -> dict:
    """The claim counts of the report, with the kept claims counted by section and each removed
    claim with its reasons."""
    counts = numbers["claims"]
    kept, removed = counts["kept"], counts["removed"]
    total = kept + removed
    by_section = [
        readouts.kept_item(_title(s), len(s["sentences"]))
        for s in _sections(report)
        if isinstance(s.get("sentences"), list) and s["sentences"]
    ]
    stored = report.get("removed")
    each_removed = (
        [
            readouts.removed_item(
                str(c.get("text") or ""), [str(r) for r in c.get("reasons") or []]
            )
            for c in stored
            if isinstance(c, dict)
        ]
        if isinstance(stored, list)
        else None
    )
    return {
        "total": total,
        "slices": [
            {
                "key": "kept",
                "label": "Kept",
                "count": kept,
                "readout": readouts.claims("kept", kept, total),
                "items": by_section,
            },
            {
                "key": "removed",
                "label": "Removed",
                "count": removed,
                "readout": readouts.claims("removed", removed, total),
                "items": each_removed,
            },
        ],
    }


def _tables(report: dict) -> list[dict]:
    """Every table the Full report shows, as the page shows it (readouts.shown_tables)."""
    return [
        {
            "key": str(s.get("key") or ""),
            "title": _title(s),
            "rows": [[str(cell) for cell in row] for row in s["table"] if isinstance(row, list)],
        }
        for s in _sections(readouts.shown_tables(report))
        if s.get("table")
    ]


def views_for(
    conn: sqlite3.Connection,
    report: dict,
    run_id: str,
    cik: int,
    *,
    report_id: str,
    ticker: str,
) -> dict:
    """Every part of protocol.ReportNumbers but its report_id and ticker."""
    numbers = numbers_for(conn, report, run_id, cik, report_id=report_id)
    priced = _guard(lambda: run_price_date(conn, run_id))
    weekly = numbers.get("weekly")
    price = numbers.get("price")
    # As in the report: today's price is the one the report was priced at, else its last week.
    today = price["value"] if price else (weekly[-1]["close"] if weekly else None)
    holdings = load_bundled()

    @cache
    def name_of(peer: int) -> str:
        return peer_ticker(conn, holdings, peer)

    def when(key: str, build: Any) -> Any:
        """The part built from numbers[key]; None when the report doesn't have it, or when a
        stored row is too odd to read."""
        return _guard(build) if numbers.get(key) else None

    score, estimate, band = numbers.get("score"), numbers.get("estimate"), numbers.get("range")
    red_flags = _guard(lambda: _red_flags(numbers))
    return {
        "score_readout": when("score", lambda: readouts.score(score["percentile"])),
        "factors": when("factors", lambda: _factors(numbers)),
        "metrics": when("metrics", lambda: _metrics(conn, numbers, run_id, cik, ticker, name_of)),
        "methods": when("methods", lambda: _methods(numbers, today)),
        "price": when(
            "price",
            lambda: {
                "value": price["value"],
                "readout": readouts.price(price["value"], price["date"]),
            },
        ),
        "estimate": when(
            "estimate",
            lambda: {
                "value": estimate["value"],
                "readout": readouts.estimate(estimate["value"], today),
            },
        ),
        "range": when(
            "range", lambda: {**band, "readout": readouts.band(band["bear"], band["bull"])}
        ),
        "returns": _guard(lambda: _returns(conn, numbers, run_id, cik, ticker, priced, name_of)),
        "red_flags": red_flags,
        "red_flags_readout": readouts.red_flags(sum(f["found"] for f in red_flags), len(red_flags))
        if red_flags is not None
        else None,
        "economy": when("economy", lambda: _economy(numbers)),
        "peer_ratings": when("peer_ratings", lambda: _peer_ratings(numbers)),
        "claims": when("claims", lambda: _claims(numbers, report)),
        "tables": _guard(lambda: _tables(report)) or [],
    }
