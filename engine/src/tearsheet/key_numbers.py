"""The report page's Key numbers (protocol.KeyNumbers): four groups of numbers under the price
chart, each with a one-line summary, and the same table on page 1 of the PDF download.

Every number is one Tearsheet already has: the top bar's last close and the close before it
(report_numbers.bar_numbers), the report's 12-month returns, the stored daily prices, and the
run's stored metrics with the inputs each one kept (metrics.inputs_json), for the company and
each peer. A ratio the report doesn't show by name (P/E, EV/EBITDA, EV/sales) is the same
inputs divided the other way up. Each row carries its working in plain words, and a row that
can't be filled says why in a few words; nothing is made up. The summaries follow fixed rules
from the numbers (no AI), so they are always what the rows say.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import date, timedelta
from statistics import median
from typing import Any

from tearsheet.data.prices import PriceStore, split_factor_after
from tearsheet.metrics import LEFT_OUT_FOR_FINANCIALS
from tearsheet.render import format_value
from tearsheet.report_numbers import _guard, run_price_date

MINUS = "−"
# The average daily volume runs over this many sessions (about three months).
VOLUME_SESSIONS = 63
# A 52-week range needs prices from at least this close to a year back.
YEAR_SLACK_DAYS = 7

GROUPS = (
    ("trading", "Price and trading"),
    ("value", "Size and value"),
    ("profit", "Profit and cash"),
    ("debt", "Debt and safety"),
)

# --- writing numbers -----------------------------------------------------------------------


def _signed(text: str, value: float) -> str:
    return f"+{text}" if value > 0 else f"{MINUS}{text}" if value < 0 else text


def money(value: float) -> str:
    """A short amount: $175.8B, $3.94T, $512.3M, −$1.6B."""
    size = abs(value)
    for limit, unit, digits in ((1e12, "T", 2), (1e9, "B", 1), (1e6, "M", 1)):
        if size >= limit:
            text = f"${size / limit:,.{digits}f}{unit}"
            break
    else:
        text = f"${size:,.0f}"
    return f"{MINUS}{text}" if value < 0 else text


def long_money(value: float) -> str:
    """As the report writes an amount: $175.8 billion; $3.94 trillion."""
    if abs(value) >= 1e12:
        text = f"${abs(value) / 1e12:,.2f} trillion"
        return f"{MINUS}{text}" if value < 0 else text
    return format_value("amount", value).replace("-", MINUS)


def price(value: float) -> str:
    return f"${value:,.2f}"


def shares(value: float) -> str:
    size = abs(value)
    for limit, unit in ((1e9, "B"), (1e6, "M"), (1e3, "K")):
        if size >= limit:
            return f"{size / limit:,.1f}{unit}"
    return f"{size:,.0f}"


def times(value: float) -> str:
    """A multiple to one decimal: 19.6×. A value that rounds to zero has no sign."""
    if abs(value) < 0.05:
        return "0.0×"
    return f"{value:.1f}×".replace("-", MINUS)


def percent(fraction: float) -> str:
    """As the report writes a metric: 19.9%. A value that rounds to zero has no sign."""
    if abs(fraction) < 0.0005:
        return "0.0%"
    return format_value("percent", fraction).replace("-", MINUS)


def move(pct: float) -> str:
    """A move in percent, signed: +55.7%, −9.1%."""
    shown = f"{abs(pct):.1f}%"
    return shown if shown == "0.0%" else _signed(shown, pct)


def _day(day: date | str | None) -> str:
    return format_value("date", day) if day else ""


# --- reading the stored rows ---------------------------------------------------------------


class _Stored:
    """The run's stored metrics: each company's values and inputs, and the peers."""

    def __init__(self, conn: sqlite3.Connection, run_id: str, cik: int):
        self.cik = cik
        self.values: dict[tuple[int, str], float] = {}
        self.inputs: dict[tuple[int, str], dict[str, Any]] = {}
        for c, name, value, inputs in conn.execute(
            "SELECT cik, name, value, inputs_json FROM metrics WHERE run_id = ?", (run_id,)
        ):
            if value is not None:
                self.values[(c, name)] = float(value)
            try:
                parsed = json.loads(inputs or "{}")
            except ValueError:
                parsed = {}
            self.inputs[(c, name)] = parsed if isinstance(parsed, dict) else {}
        self.peers = [
            r[0]
            for r in conn.execute(
                "SELECT peer_cik FROM peer_groups WHERE run_id = ? AND peer_cik != ?"
                " ORDER BY peer_cik",
                (run_id, cik),
            )
        ]

    def value(self, name: str, cik: int | None = None) -> float | None:
        return self.values.get((self.cik if cik is None else cik, name))

    def input(self, name: str, key: str, cik: int | None = None) -> float | None:
        v = self.inputs.get((self.cik if cik is None else cik, name), {}).get(key)
        return float(v) if isinstance(v, int | float) and not isinstance(v, bool) else None

    def peer_median(self, of: Any) -> tuple[float | None, int]:
        """The median of `of(peer)` over the peers that have it, and how many do."""
        found = [v for v in (of(p) for p in self.peers) if v is not None]
        return (median(found) if found else None), len(found)


def _turned(s: _Stored, name: str, c: int) -> float | None:
    """A yield turned over into a multiple: earnings yield into P/E, sales to EV into EV/sales.
    None for a yield of zero or below (a loss), or one the report left out."""
    y = s.value(name, c)
    return 1 / y if y is not None and y > 0 else None


def _ev_ebitda(s: _Stored, c: int) -> float | None:
    """Enterprise value ÷ EBITDA from the inputs the report's metrics used; None where the
    report left EV out (banks and insurers) or EBITDA is zero or below."""
    if s.value("ebit_to_ev", c) is None:
        return None
    e = s.input("ebit_to_ev", "enterprise_value", c)
    d = s.input("net_debt_to_ebitda", "ebitda", c)
    return e / d if e is not None and d is not None and d > 0 else None


def _financial_class(conn: sqlite3.Connection, cik: int) -> str:
    row = conn.execute("SELECT financial_class FROM companies WHERE cik = ?", (cik,)).fetchone()
    return str(row[0] or "") if row else ""


def _row(
    key: str,
    label: str,
    text: str | None,
    working: str,
    *,
    peer: str | None = None,
    note: str | None = None,
    tone: str | None = None,
) -> dict:
    return {
        "key": key,
        "label": label,
        "text": text,
        "peer_text": peer,
        "note": note if text is None else None,
        "tone": tone,
        "working": working,
    }


def _missing(key: str, label: str, note: str, working: str) -> dict:
    return _row(key, label, None, working, note=note)


def _peer_line(text: str | None, count: int, what: str = "") -> str:
    if text is None:
        return " No peer values are stored."
    return f" The peer median is {text}, across {count} peer{'s' if count != 1 else ''}{what}."


# --- Price and trading ---------------------------------------------------------------------


def _year_of_closes(conn: sqlite3.Connection, cik: int, last: date) -> list[tuple[date, float]]:
    """The closes of the 52 weeks to `last`, in `last`'s shares; empty if the stored prices
    don't reach back about a year."""
    store = PriceStore(conn)
    start = last - timedelta(weeks=52)
    closes = [(d, c) for d, c in store.closes(cik, up_to=last) if d > start]
    rows = conn.execute(
        "SELECT MIN(date) FROM prices_daily WHERE cik = ? AND share_class = ''", (cik,)
    ).fetchone()
    first = date.fromisoformat(rows[0]) if rows and rows[0] else None
    if first is None or first > start + timedelta(days=YEAR_SLACK_DAYS):
        return []
    splits = store.splits(cik)
    return [(d, c / split_factor_after(splits, d, up_to=last)) for d, c in closes]


def _trading(conn: sqlite3.Connection, numbers: dict, bar: dict, cik: int) -> list[dict]:
    close, previous = bar.get("close"), bar.get("previous_close")
    last = date.fromisoformat(bar["close_date"]) if bar.get("close_date") else None
    rows = []
    if close is None or last is None:
        rows.append(_missing("price", "Price", "not stored", "No daily prices are stored yet."))
    else:
        rows.append(
            _row("price", "Price", price(close), f"The close on {_day(last)}: {price(close)}.")
        )
    if close is None or previous is None or not previous > 0:
        rows.append(
            _missing(
                "day_move",
                "Day's move",
                "not stored",
                "The close of the session before isn't stored, so there is no day's move.",
            )
        )
    else:
        pct = (close - previous) / previous * 100
        flat = abs(close - previous) < 0.005
        rows.append(
            _row(
                "day_move",
                "Day's move",
                "0.0%" if flat else move(pct),
                f"From {price(previous)} at the close before to {price(close)}"
                f" on {_day(last)}: "
                + (
                    "no change."
                    if flat
                    else f"{move(pct)}, {_signed(price(abs(close - previous)), close - previous)}."
                ),
                tone=None if flat else ("up" if pct > 0 else "down"),
            )
        )
    year = _year_of_closes(conn, cik, last) if last is not None and close is not None else []
    if not year:
        rows.append(
            _missing(
                "range_52w",
                "52-week range",
                "under a year stored",
                "Less than a year of daily prices is stored for this company.",
            )
        )
    else:
        low = min(year, key=lambda p: p[1])
        high = max(year, key=lambda p: p[1])
        whole = high[1] >= 100
        fmt = (lambda v: f"${v:,.0f}") if whole else price
        place = (close - low[1]) / (high[1] - low[1]) if high[1] > low[1] else None
        where = (
            f" The last close, {price(close)}, is {round(place * 100)}% of the way up."
            if place is not None
            else ""
        )
        rows.append(
            _row(
                "range_52w",
                "52-week range",
                f"{fmt(low[1])} – {fmt(high[1])}",
                f"The lowest close in the 52 weeks to {_day(last)} was {price(low[1])}"
                f" on {_day(low[0])}, the highest {price(high[1])} on {_day(high[0])}."
                + where
                + " Earlier closes are adjusted for splits.",
            )
        )
    returns = numbers.get("returns_12m")
    priced = (numbers.get("price") or {}).get("date")
    if not returns:
        rows.append(
            _missing(
                "return_12m",
                "12-month return",
                "not stored",
                "The report doesn't give a 12-month return.",
            )
        )
    else:
        company, peers = float(returns["company"]), float(returns["peers"])
        to = f" to {priced}" if priced else ""
        rows.append(
            _row(
                "return_12m",
                "12-month return",
                move(company),
                f"The total return over the 12 months{to}, with dividends, as the report gives"
                f" it: {move(company)}. The peer group's, each peer weighted the same:"
                f" {move(peers)}.",
                peer=move(peers),
                tone="up" if company > 0 else "down" if company < 0 else None,
            )
        )
    vols = (
        conn.execute(
            "SELECT date, volume FROM prices_daily WHERE cik = ? AND share_class = ''"
            " AND date <= ? ORDER BY date DESC LIMIT ?",
            (cik, last.isoformat(), VOLUME_SESSIONS),
        ).fetchall()
        if last is not None
        else []
    )
    if last is not None:
        splits = PriceStore(conn).splits(cik)
        counted = [
            float(v) * split_factor_after(splits, date.fromisoformat(d), up_to=last)
            for d, v in vols
            if v is not None
        ]
    else:
        counted = []
    if not counted:
        rows.append(
            _missing(
                "volume",
                "Avg daily volume",
                "not stored",
                "No trading volumes are stored for this company.",
            )
        )
    else:
        avg = sum(counted) / len(counted)
        rows.append(
            _row(
                "volume",
                "Avg daily volume",
                shares(avg),
                f"The average number of shares traded a day over the last {len(counted)}"
                f" sessions to {_day(last)}: {shares(avg)} (about {avg:,.0f}).",
            )
        )
    return rows


# --- the report's figures -------------------------------------------------------------------


def _left_out(financial: str) -> tuple[str, str]:
    kind = "banks" if financial == "bank" else "insurers"
    return (
        f"not for {kind}",
        f"Left out for {kind}, as in the report: debt and cash are part of how they run.",
    )


def _at_price(s: _Stored, numbers: dict) -> str:
    p = s.input("earnings_yield", "price")
    day = (numbers.get("price") or {}).get("date")
    if p is None:
        return "at the report's price"
    return f"at the report's price of {price(p)}" + (f" on {day}" if day else "")


def _value(s: _Stored, numbers: dict, financial: str) -> list[dict]:
    rows = []
    mv = s.input("free_cash_flow_yield", "market_value")
    p = s.input("earnings_yield", "price")
    if mv is None:
        rows.append(
            _missing("market_value", "Market value", "not stored", "Not stored for this report.")
        )
    else:
        day = (numbers.get("price") or {}).get("date")
        sums = (
            f"The report's price, {price(p)}"
            + (f" on {day}" if day else "")
            + f", × {shares(mv / p)} shares"
            if p
            else f"The share price × the shares, {_at_price(s, numbers)}"
        )
        rows.append(
            _row(
                "market_value",
                "Market value",
                money(mv),
                f"{sums}: {long_money(mv)}.",
            )
        )
    ev = s.input("ebit_to_ev", "enterprise_value")
    if financial in ("bank", "insurer"):
        note, why = _left_out(financial)
        rows.append(_missing("enterprise_value", "Enterprise value", note, why))
    elif ev is None:
        rows.append(
            _missing(
                "enterprise_value", "Enterprise value", "not stored", "Not stored for this report."
            )
        )
    else:
        rows.append(
            _row(
                "enterprise_value",
                "Enterprise value",
                money(ev),
                "Market value plus debt, leases, minority interest and preferred stock, less"
                f" cash, {_at_price(s, numbers)}: {long_money(ev)}.",
            )
        )

    # P/E: the price over diluted earnings per share, the earnings yield turned over.
    eps = s.input("earnings_yield", "diluted_eps")

    med, count = s.peer_median(lambda c: _turned(s, "earnings_yield", c))
    med_text = times(med) if med is not None else None
    if p is None or eps is None:
        rows.append(_missing("pe", "P/E", "not stored", "Not stored for this report."))
    elif eps <= 0:
        rows.append(
            _missing(
                "pe",
                "P/E",
                "no profit",
                "No profit over the past 12 months (diluted earnings per share of"
                f" {price(eps).replace('$-', MINUS + '$')}), so there is no P/E.",
            )
        )
    else:
        rows.append(
            _row(
                "pe",
                "P/E",
                times(p / eps),
                f"The price, {price(p)}, ÷ diluted earnings per share over the past 12 months,"
                f" {price(eps)}: {times(p / eps)}." + _peer_line(med_text, count, " with a profit"),
                peer=med_text,
            )
        )

    # EV / EBITDA and EV / sales, from the enterprise value the report's metrics used.
    ebitda = s.input("net_debt_to_ebitda", "ebitda")
    med, count = s.peer_median(lambda c: _ev_ebitda(s, c))
    med_text = times(med) if med is not None else None
    if financial in ("bank", "insurer"):
        note, why = _left_out(financial)
        rows.append(_missing("ev_ebitda", "EV / EBITDA", note, why))
    elif ev is None or ebitda is None:
        rows.append(
            _missing("ev_ebitda", "EV / EBITDA", "not stored", "Not stored for this report.")
        )
    elif ebitda <= 0:
        rows.append(
            _missing(
                "ev_ebitda",
                "EV / EBITDA",
                "EBITDA below zero" if ebitda < 0 else "no EBITDA",
                f"EBITDA over the past 12 months was {long_money(ebitda)}, so the ratio means"
                " nothing.",
            )
        )
    else:
        rows.append(
            _row(
                "ev_ebitda",
                "EV / EBITDA",
                times(ev / ebitda),
                f"Enterprise value, {long_money(ev)}, ÷ EBITDA (operating income plus"
                f" depreciation and amortization) over the past 12 months,"
                f" {long_money(ebitda)}: {times(ev / ebitda)}." + _peer_line(med_text, count),
                peer=med_text,
            )
        )

    revenue = s.input("sales_to_ev", "revenue")
    med, count = s.peer_median(lambda c: _turned(s, "sales_to_ev", c))
    med_text = times(med) if med is not None else None
    mine = _turned(s, "sales_to_ev", s.cik)
    if financial in ("bank", "insurer"):
        note, why = _left_out(financial)
        rows.append(_missing("ev_sales", "EV / sales", note, why))
    elif mine is None or ev is None or revenue is None:
        rows.append(_missing("ev_sales", "EV / sales", "not stored", "Not stored for this report."))
    else:
        rows.append(
            _row(
                "ev_sales",
                "EV / sales",
                times(mine),
                f"Enterprise value, {long_money(ev)}, ÷ revenue over the past 12 months,"
                f" {long_money(revenue)}: {times(mine)}." + _peer_line(med_text, count),
                peer=med_text,
            )
        )
    return rows


def _metric_row(
    s: _Stored,
    key: str,
    label: str,
    name: str,
    financial: str,
    fmt: Any,
    working: Any,
    *,
    blank: tuple[str, str] | None = None,
) -> dict:
    """A row for one of the run's stored metrics, with its peer median. `working(value)` writes
    the sum from the metric's inputs; `blank` is what an empty value means when its inputs say
    why (no interest to cover, a loss)."""
    if financial in ("bank", "insurer") and name in LEFT_OUT_FOR_FINANCIALS:
        note, why = _left_out(financial)
        return _missing(key, label, note, why)
    value = s.value(name)
    med, count = s.peer_median(lambda c: s.value(name, c))
    med_text = fmt(med) if med is not None else None
    if value is None:
        if blank is not None:
            return _missing(key, label, *blank)
        return _missing(key, label, "not stored", "Not stored for this report.")
    return _row(key, label, fmt(value), working(value) + _peer_line(med_text, count), peer=med_text)


def _amount(s: _Stored, name: str, key: str) -> str:
    v = s.input(name, key)
    return long_money(v) if v is not None else "not stored"


def _profit(s: _Stored, financial: str) -> list[dict]:
    rows = []
    revenue = s.input("operating_margin", "revenue")
    if revenue is None:
        rows.append(_missing("revenue", "Revenue", "not stored", "Not stored for this report."))
    else:
        rows.append(
            _row(
                "revenue",
                "Revenue",
                money(revenue),
                f"Revenue over the past 12 months, from SEC filings: {long_money(revenue)}.",
            )
        )
    rows.append(
        _metric_row(
            s,
            "operating_margin",
            "Operating margin",
            "operating_margin",
            financial,
            percent,
            lambda v: (
                f"Operating income, {_amount(s, 'operating_margin', 'ebit')}, ÷ revenue,"
                f" {_amount(s, 'operating_margin', 'revenue')}, over the past 12 months:"
                f" {percent(v)}."
            ),
        )
    )
    ocf = s.input("free_cash_flow_yield", "operating_cash_flow")
    capex = s.input("free_cash_flow_yield", "capital_spending")
    if financial in ("bank", "insurer"):
        note, why = _left_out(financial)
        rows.append(_missing("free_cash_flow", "Free cash flow", note, why))
    elif ocf is None:
        rows.append(
            _missing(
                "free_cash_flow", "Free cash flow", "not stored", "Not stored for this report."
            )
        )
    else:
        fcf = ocf - (capex or 0.0)
        rows.append(
            _row(
                "free_cash_flow",
                "Free cash flow",
                money(fcf),
                f"Operating cash flow, {long_money(ocf)}, less capital spending, "
                + (long_money(capex) if capex is not None else "none found in the filings")
                + f", over the past 12 months: {long_money(fcf)}.",
            )
        )
    rows.append(
        _metric_row(
            s,
            "fcf_yield",
            "Free cash flow yield",
            "free_cash_flow_yield",
            financial,
            percent,
            lambda v: (
                "Free cash flow over the past 12 months ÷ market value,"
                f" {_amount(s, 'free_cash_flow_yield', 'market_value')}: {percent(v)}."
            ),
        )
    )
    rows.append(
        _metric_row(
            s,
            "return_on_equity",
            "Return on equity",
            "return_on_equity",
            financial,
            percent,
            lambda v: (
                "Net income to common shareholders over the past 12 months,"
                f" {_amount(s, 'return_on_equity', 'net_income_common')}, ÷ average common"
                f" equity, {_amount(s, 'return_on_equity', 'average_common_equity')}:"
                f" {percent(v)}."
            ),
        )
    )
    return rows


def _debt(s: _Stored, financial: str) -> list[dict]:
    rows = []
    net_debt = s.input("net_debt_to_ebitda", "net_debt")
    if financial in ("bank", "insurer"):
        note, why = _left_out(financial)
        rows.append(_missing("net_debt", "Net debt", note, why))
    elif net_debt is None:
        rows.append(_missing("net_debt", "Net debt", "not stored", "Not stored for this report."))
    else:
        rows.append(
            _row(
                "net_debt",
                "Net debt",
                money(net_debt),
                "Debt and leases less cash and short-term investments, from the latest balance"
                f" sheet: {long_money(net_debt)}"
                + (" (more cash than debt)." if net_debt < 0 else "."),
            )
        )
    ebitda = s.input("net_debt_to_ebitda", "ebitda")
    rows.append(
        _metric_row(
            s,
            "net_debt_ebitda",
            "Net debt / EBITDA",
            "net_debt_to_ebitda",
            financial,
            times,
            lambda v: (
                f"Net debt, {_amount(s, 'net_debt_to_ebitda', 'net_debt')}, ÷ EBITDA over"
                f" the past 12 months, {_amount(s, 'net_debt_to_ebitda', 'ebitda')}: {times(v)}."
            ),
            blank=(
                (
                    "EBITDA below zero",
                    "EBITDA over the past 12 months was zero or below, so the ratio means nothing.",
                )
                if ebitda is not None and ebitda <= 0
                else None
            ),
        )
    )
    ebit = s.input("interest_coverage", "ebit")
    interest = s.input("interest_coverage", "interest_expense")
    rows.append(
        _metric_row(
            s,
            "interest_cover",
            "Interest cover",
            "interest_coverage",
            financial,
            times,
            lambda v: (
                f"Operating income, {_amount(s, 'interest_coverage', 'ebit')}, ÷ interest"
                f" expense, {_amount(s, 'interest_coverage', 'interest_expense')}, over the past"
                f" 12 months: {times(v)}."
            ),
            blank=(
                (
                    "no interest found",
                    "No interest expense was found in its SEC filings for the past 12 months,"
                    " so there is nothing to divide by.",
                )
                if ebit is not None and not interest
                else None
            ),
        )
    )
    income = s.input("operating_cash_flow_to_net_income", "net_income")
    rows.append(
        _metric_row(
            s,
            "cash_to_profit",
            "Cash flow / profit",
            "operating_cash_flow_to_net_income",
            financial,
            times,
            lambda v: (
                "Operating cash flow,"
                f" {_amount(s, 'operating_cash_flow_to_net_income', 'operating_cash_flow')}, ÷ net"
                f" income, {_amount(s, 'operating_cash_flow_to_net_income', 'net_income')}, over"
                f" the past 12 months: {times(v)}."
            ),
            blank=(
                (
                    "no profit",
                    "Net income over the past 12 months was zero or below, so the"
                    " ratio means nothing.",
                )
                if income is not None and income <= 0
                else None
            ),
        )
    )
    tax = s.input("return_on_invested_capital", "tax_rate")
    rows.append(
        _metric_row(
            s,
            "return_on_capital",
            "Return on capital",
            "return_on_invested_capital",
            financial,
            percent,
            lambda v: (
                "Operating income over the past 12 months after tax"
                + (f" at {tax * 100:.1f}%" if tax is not None else "")
                + f", ÷ average invested capital (equity plus debt and leases, less cash),"
                f" {_amount(s, 'return_on_invested_capital', 'average_invested_capital')}:"
                f" {percent(v)}."
            ),
        )
    )
    return rows


# --- the summaries -------------------------------------------------------------------------


def _versus(
    pairs: list[tuple[float | None, float | None]], lower: str, higher: str, peers: str
) -> str:
    """How many of the comparable pairs (company, peer median) lean each way, the way most do:
    "cheaper than peers on 2 of 3"; an even split names both, "below peers on 1 of 3, above
    on 1". Empty when none can be compared."""
    usable = [(a, b) for a, b in pairs if a is not None and b is not None]
    if not usable:
        return ""
    low = sum(a < b for a, b in usable)
    high = sum(a > b for a, b in usable)
    n = len(usable)
    if low == 0 and high == 0:
        return "in line with peers"
    if low == high:
        return f"{lower}{peers} on {low} of {n}, {higher} on {high}"
    if low > high:
        return f"{lower}{peers} on {low} of {n}"
    return f"{higher}{peers} on {high} of {n}"


def _join(*parts: str) -> str:
    kept = [p for p in parts if p]
    if not kept:
        return "Not stored for this report"
    text = " · ".join(kept)
    return text[:1].upper() + text[1:]


def _summaries(numbers: dict, bar: dict, s: _Stored, financial: str) -> dict[str, str]:
    close = bar.get("close")
    returns = numbers.get("returns_12m")
    year = ""
    if returns:
        pct = float(returns["company"])
        year = (
            "level over a year"
            if f"{abs(pct):.1f}" == "0.0"
            else f"{'up' if pct > 0 else 'down'} {abs(pct):.1f}% in a year"
        )
    trading = _join(price(close) if close is not None else "", year)

    def pair(of: Any) -> tuple[float | None, float | None]:
        return of(s.cik), s.peer_median(of)[0]

    financials = financial in ("bank", "insurer")
    value_pairs = [pair(lambda c: _turned(s, "earnings_yield", c))]
    if not financials:
        value_pairs += [
            pair(lambda c: _ev_ebitda(s, c)),
            pair(lambda c: _turned(s, "sales_to_ev", c)),
        ]
    mv = s.input("free_cash_flow_yield", "market_value")
    value = _join(
        money(mv) if mv is not None else "",
        _versus(value_pairs, "cheaper", "pricier", " than peers"),
    )

    def metric(name: str) -> Any:
        return lambda c: s.value(name, c)

    profit_names = (
        ["return_on_equity"]
        if financials
        else [
            "operating_margin",
            "free_cash_flow_yield",
            "return_on_equity",
        ]
    )
    revenue = s.input("operating_margin", "revenue")
    profit = _join(
        f"{money(revenue)} revenue" if revenue is not None else "",
        _versus([pair(metric(n)) for n in profit_names], "below", "above", " peers"),
    )

    if financials:
        kind = "banks" if financial == "bank" else "insurers"
        debt = f"Left out for {kind}, as in the report"
    else:
        net_debt = s.input("net_debt_to_ebitda", "net_debt")
        own = (
            ""
            if net_debt is None
            else f"net cash {money(-net_debt)}"
            if net_debt < 0
            else f"net debt {money(net_debt)}"
        )
        a, b = pair(metric("net_debt_to_ebitda"))
        lean = (
            ""
            if a is None or b is None
            else "less debt than peers"
            if a < b
            else "more debt than peers"
            if a > b
            else "as much debt as peers"
        )
        debt = _join(own, lean)
    return {"trading": trading, "value": value, "profit": profit, "debt": debt}


# --- the whole table ---------------------------------------------------------------------------


def _build(
    conn: sqlite3.Connection, numbers: dict, bar: dict | None, run_id: str, cik: int
) -> dict:
    bar = bar or {}
    s = _Stored(conn, run_id, cik)
    financial = _financial_class(conn, cik)
    rows = {
        "trading": _trading(conn, numbers, bar, cik),
        "value": _value(s, numbers, financial),
        "profit": _profit(s, financial),
        "debt": _debt(s, financial),
    }
    summaries = _summaries(numbers, bar, s, financial)
    peers = len(s.peers) or None
    priced = run_price_date(conn, run_id)
    return {
        "close_date": bar.get("close_date"),
        "report_date": priced.isoformat() if priced else None,
        "peers": peers,
        "groups": [
            {"key": key, "name": name, "summary": summaries[key], "rows": rows[key]}
            for key, name in GROUPS
        ],
        "source": "Prices from Massive, figures from SEC filings. Peers: the median of the"
        + (f" {peers}" if peers else "")
        + " peers in the report; for the 12-month return, the peer group's return with each"
        " peer weighted the same.",
    }


def key_numbers(
    conn: sqlite3.Connection, numbers: dict, bar: dict | None, run_id: str, cik: int
) -> dict | None:
    """The Key numbers table (protocol.KeyNumbers) from the report's numbers (numbers_for) and
    its top bar (bar_numbers). None when the stored rows are too odd to read."""
    return _guard(lambda: _build(conn, numbers, bar, run_id, cik))
