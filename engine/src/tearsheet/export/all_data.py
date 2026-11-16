"""Export all data: one Excel file with everything Tearsheet has on the S&P 500 companies (Liam's
spec, 16 Nov 2026). Six plain tables, each with a frozen header row and a filter:

  About · Predictions · All predictions · Key numbers · Factor scores · Prices

It reads the store only, through a read-only connection of its own (it runs off the engine's
event loop): no network, no AI, nothing written. xlsxwriter's constant_memory mode writes each
row as it goes, so the 150,000-odd prices never sit in memory as cells. The column names, their
explanations on the About tab and the cells' formats come from one list per sheet below.
"""

from __future__ import annotations

import json
import shutil
import sqlite3
import tempfile
from collections.abc import Callable, Iterable, Iterator
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

import xlsxwriter

from tearsheet import ENGINE_VERSION, METHOD_CODE_VERSION
from tearsheet.companies import display_name
from tearsheet.data import membership
from tearsheet.data.prices import SPY_CIK, last_completed_session, split_factor_after
from tearsheet.export import style
from tearsheet.export.workbook import INT, MONEY, MULT, PCT
from tearsheet.render import METRIC_KINDS
from tearsheet.report_numbers import METRIC_LABELS, _metrics, parse_code_lines, run_price_date
from tearsheet.wording import ADVICE_LINE, PRICES_LINE

# The engine's temporary folder for one export (tempfiles.STALE_PREFIXES sweeps a stale one).
TEMP_PREFIX = "tearsheet-export-"
DATE = "d mmm yyyy"
STAMP = "d mmm yyyy hh:mm"
SCORE = "0.0"
# The report's score table, in the order weights.yaml gives the factors.
FACTORS = (
    "profitability",
    "momentum",
    "valuation",
    "capital discipline",
    "balance sheet",
    "earnings quality",
)
# The app's words for a prediction's uncertainty (app/src/renderer/log/screen.ts RISKS).
RISKS = {"low": "Low", "medium": "Medium", "high": "High", "very_high": "Very high"}
HORIZONS = (3, 6, 12)


@dataclass(frozen=True)
class Col:
    head: str
    about: str
    fmt: str | None = None  # a number format, "date", "stamp" or None for text
    width: float = 12


# --- the columns -----------------------------------------------------------------------------

COMPANY = [
    Col("Ticker", "The company's ticker.", width=8),
    Col("Company", "The company's name, as the S&P 500 list gives it.", width=28),
    Col("Sector", "Its GICS sector, which is also its peer group.", width=22),
]

PREDICTION = [
    *COMPANY,
    Col(
        "Made",
        "When the prediction was made (the report's run started), your Mac's time.",
        "stamp",
        16,
    ),
    Col(
        "Rating",
        "Buy, Hold or Sell: the company against its peer group over the next 12 months.",
        width=8,
    ),
    Col(
        "Previous rating",
        "The company's rating in its prediction before this one, if it had one.",
        width=10,
    ),
    Col(
        "Peer score",
        "The overall score, 0 to 100: the weighted factor percentiles within the peer group.",
        SCORE,
        9,
    ),
    Col(
        "Chance of beating peers",
        "The method's chance that the company beats its peer group over 12 months.",
        PCT,
        11,
    ),
    Col(
        "Bear",
        "The 12-month range's bear case, a price per share in the prediction day's shares.",
        MONEY,
        10,
    ),
    Col("Base", "The range's base case.", MONEY, 10),
    Col("Bull", "The range's bull case.", MONEY, 10),
    Col("Uncertainty", "How wide the range is: Low, Medium, High or Very high.", width=10),
    Col(
        "Priced on",
        "The close the prediction is priced at: the last close before it was made.",
        "date",
        12,
    ),
    Col(
        "Price on prediction day",
        "That close, as traded that day. Empty if Tearsheet has no price for it.",
        MONEY,
        11,
    ),
    Col("Upside to base", "The base case against the price on the prediction day.", PCT, 9),
    Col(
        "Latest price",
        "The newest close Tearsheet has, in the prediction day's shares (splits since then counted).",
        MONEY,
        10,
    ),
    Col("Latest price date", "The day of that close.", "date", 12),
    Col(
        "Return so far",
        "Latest price against the price on the prediction day. Price only: splits counted, dividends not.",
        PCT,
        9,
    ),
    *[
        c
        for m in HORIZONS
        for c in (
            Col(
                f"{m}-month grade",
                f"The {m}-month grade, once due: hit (beat the peer group), miss, or no peer data.",
                width=9,
            ),
            Col(
                f"{m}-month excess return",
                f"The company's total return less its peer group's over those {m} months.",
                PCT,
                10,
            ),
        )
    ],
    Col("Report date", "When the prediction's report was saved.", "date", 12),
    Col("AI tool", "The AI tool that wrote the report's text (the numbers are code).", width=9),
    Col("AI models", "The models that tool used.", width=24),
    Col("Method code version", "The version of the code that makes the numbers.", INT, 9),
    Col("Engine version", "The engine's version when the prediction was made.", width=11),
    Col("Prediction ID", "Its id in the prediction log. Predictions are write-once.", width=20),
]

ALL_PREDICTIONS = [
    *PREDICTION,
    Col("Newest for company", "Yes for the company's latest prediction.", width=9),
]

RUN = [
    *COMPANY,
    Col("Report date", "The company's latest report, which these numbers come from.", "date", 12),
]

KEY_NUMBERS = [
    *RUN,
    *[
        c
        for name, label in METRIC_LABELS.items()
        for fmt in (MULT if METRIC_KINDS.get(name) == "ratio" else PCT,)
        for c in (
            Col(label, f"{label}, as the report shows it.", fmt, 11),
            Col(
                f"{label}, peer median",
                f"The median of {label.lower()} across the peers in that run.",
                fmt,
                11,
            ),
            Col(
                f"{label}, percentile",
                f"Where the company's {label.lower()} falls among its peers, 0 to 100.",
                INT,
                10,
            ),
        )
    ],
]

FACTOR_SCORES = [
    *RUN,
    Col("Score", "The overall score: the company's percentile in its peer group.", INT, 8),
    *[
        c
        for f in FACTORS
        for c in (
            Col(
                f"{f.capitalize()} percentile",
                f"The {f} factor's percentile in the peer group.",
                INT,
                11,
            ),
            Col(
                f"{f.capitalize()} weight", f"The weight the {f} factor had in the score.", PCT, 10
            ),
        )
    ],
    Col(
        "Peer group",
        "The peer group used: the 40 largest S&P 500 companies in the sector.",
        width=28,
    ),
    Col("Peers", "How many peers the run kept.", INT, 7),
    Col("Peer tickers", "The peers the run kept, by ticker.", width=60),
]

SHEETS: list[tuple[str, str]] = [
    ("About", "This tab: when the file was made, and what every tab and column means."),
    ("Predictions", "One row per company: its latest official prediction."),
    ("All predictions", "Every official prediction, re-runs included, by ticker then date."),
    (
        "Key numbers",
        "One row per company, from its latest report: the metrics the report shows, each with its peer median and percentile.",
    ),
    (
        "Factor scores",
        "One row per company, from its latest report: each factor's percentile and weight, the score and the peer group.",
    ),
    (
        "Prices",
        "Daily closes Tearsheet has stored, as traded (not adjusted for splits or dividends): a row per day, a column per ticker. SPY is the S&P 500 fund.",
    ),
]
ABOUT = [Col("Tab", "", width=16), Col("Column", "", width=34), Col("What it means", "", width=110)]


# --- the book ----------------------------------------------------------------------------------


class _Book:
    def __init__(self, path: Path, tmpdir: Path) -> None:
        # strings_to_formulas off: a stored name or note that starts with "=" lands as text.
        self.wb = xlsxwriter.Workbook(
            str(path),
            {
                "constant_memory": True,
                "tmpdir": str(tmpdir),
                "strings_to_formulas": False,
                "strings_to_urls": False,
                "default_date_format": DATE,
            },
        )
        self.wb.set_properties(
            {
                "title": "Tearsheet: all data",
                "author": "Tearsheet Research",
                "comments": ADVICE_LINE,
            }
        )
        base = {"font_name": "Arial", "font_size": 10}
        self.head = self.wb.add_format(
            {
                **base,
                "bold": True,
                "bg_color": style.TINT,
                "bottom": 1,
                "text_wrap": True,
                "valign": "top",
            }
        )
        self.text = self.wb.add_format({**base, "valign": "top"})
        self.wrap = self.wb.add_format({**base, "text_wrap": True, "valign": "top"})
        self.formats: dict[str, Any] = {}
        self.rows: dict[str, int] = {}

    def fmt(self, kind: str | None):
        if kind is None:
            return self.text
        if kind not in self.formats:
            number = {"date": DATE, "stamp": STAMP}.get(kind, kind)
            self.formats[kind] = self.wb.add_format(
                {"font_name": "Arial", "font_size": 10, "num_format": number, "valign": "top"}
            )
        return self.formats[kind]

    def table(
        self, name: str, cols: list[Col], rows: Iterable[list[Any]], *, wrap: bool = False
    ) -> None:
        """A sheet: the header row, frozen, with a filter over the table; then each row, written
        as it comes (constant_memory)."""
        ws = self.wb.add_worksheet(name)
        for i, c in enumerate(cols):
            ws.set_column(i, i, c.width)
        ws.set_row(0, 30)
        ws.freeze_panes(1, 0)
        ws.write_row(0, 0, [c.head for c in cols], self.head)
        formats = [self.fmt(c.fmt) for c in cols]
        if wrap:
            formats[-1] = self.wrap
        r = 0
        for r, row in enumerate(rows, start=1):
            for i, value in enumerate(row):
                if value is None or value == "":
                    continue
                if isinstance(value, (date, datetime)):
                    ws.write_datetime(r, i, value, formats[i])
                elif isinstance(value, (int, float)) and not isinstance(value, bool):
                    ws.write_number(r, i, value, formats[i])
                else:
                    ws.write_string(r, i, str(value), formats[i])
        ws.autofilter(0, 0, max(r, 1), len(cols) - 1)
        self.rows[name] = r


# --- reading the store -----------------------------------------------------------------------------


class _Store:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self.conn = conn
        self.holdings = membership.load_bundled()
        self.companies = {
            r[0]: (r[1], r[2]) for r in conn.execute("SELECT cik, name, sector FROM companies")
        }
        # A company's ticker: its newest prediction's, else the S&P list's, else SEC's.
        self.tickers: dict[int, str] = {SPY_CIK: "SPY"}
        for cik, ticker in conn.execute(
            "SELECT cik, ticker FROM tickers WHERE date_to IS NULL AND share_class = ''"
            " ORDER BY ticker DESC"
        ):
            self.tickers[cik] = ticker
        for cik in list(self.companies) + list(self.tickers):
            if self.holdings.has(cik) and self.holdings.tickers_of(cik):
                self.tickers[cik] = self.holdings.tickers_of(cik)[0]
        for cik, ticker in conn.execute("SELECT cik, ticker FROM predictions ORDER BY run_at"):
            self.tickers[cik] = ticker
        self._splits: dict[tuple[int, str], dict[date, float]] = {}

    def ticker(self, cik: int) -> str:
        return self.tickers.get(cik) or f"CIK {cik}"

    def company(self, cik: int) -> list[Any]:
        name, sector = self.companies.get(cik, (None, None))
        return [self.ticker(cik), display_name(self.holdings, cik, name), sector]

    def splits(self, cik: int, share_class: str) -> dict[date, float]:
        key = (cik, share_class)
        if key not in self._splits:
            self._splits[key] = {
                date.fromisoformat(r[0]): float(r[1])
                for r in self.conn.execute(
                    "SELECT date, ratio_or_amount FROM corporate_actions"
                    " WHERE cik = ? AND share_class = ? AND kind = 'split'",
                    key,
                )
            }
        return self._splits[key]

    def close_on(self, cik: int, share_class: str, day: date) -> float | None:
        row = self.conn.execute(
            "SELECT close_unadjusted FROM prices_daily WHERE cik = ? AND share_class = ? AND date = ?",
            (cik, share_class, day.isoformat()),
        ).fetchone()
        return float(row[0]) if row else None

    def latest(self, cik: int, share_class: str) -> tuple[date, float] | None:
        row = self.conn.execute(
            "SELECT date, close_unadjusted FROM prices_daily WHERE cik = ? AND share_class = ?"
            " ORDER BY date DESC LIMIT 1",
            (cik, share_class),
        ).fetchone()
        return (date.fromisoformat(row[0]), float(row[1])) if row else None

    def report_of(self, run_id: str) -> tuple[str, datetime] | None:
        row = self.conn.execute(
            "SELECT report_id, created_at FROM reports WHERE run_id = ?"
            " ORDER BY created_at DESC, rowid DESC LIMIT 1",
            (run_id,),
        ).fetchone()
        return (row[0], _when(row[1])) if row else None


def _when(text: str) -> datetime:
    """A stored time on this Mac's clock, without the zone (Excel has none)."""
    moment = datetime.fromisoformat(text)
    return (moment.astimezone() if moment.tzinfo else moment).replace(tzinfo=None)


def _ratio(a: float | None, b: float | None) -> float | None:
    return a / b - 1 if a is not None and b else None


def _grades(conn: sqlite3.Connection, prediction_id: str) -> list[Any]:
    """Each horizon's newest grade: its words and the excess return."""
    newest: dict[int, dict] = {}
    for g in conn.execute(
        "SELECT horizon_months, results_json FROM grades WHERE prediction_id = ?"
        " ORDER BY horizon_months, grading_version",
        (prediction_id,),
    ):
        newest[int(g[0])] = json.loads(g[1])
    out: list[Any] = []
    for m in HORIZONS:
        g = newest.get(m)
        if g is None:
            out += [None, None]
            continue
        hit = g.get("hit")
        out += ["no peer data" if hit is None else "hit" if hit else "miss", g.get("excess")]
    return out


def _prediction_row(s: _Store, p: sqlite3.Row) -> list[Any]:
    share_class = p["share_class"] or ""
    made = datetime.fromisoformat(p["run_at"])
    priced = run_price_date(s.conn, p["run_id"]) or last_completed_session(made)
    price = s.close_on(p["cik"], share_class, priced)
    latest = s.latest(p["cik"], share_class)
    now = now_day = None
    if latest is not None:
        # New shares per old share since the prediction day: multiply to get back to its shares.
        factor = split_factor_after(s.splits(p["cik"], share_class), priced, up_to=latest[0])
        now, now_day = round(latest[1] * factor, 6), latest[0]
    report = s.report_of(p["run_id"])
    try:
        models = ", ".join(str(m) for m in json.loads(p["model_ids_json"]))
    except (TypeError, ValueError):
        models = None
    ticker, name, sector = s.company(p["cik"])
    return [
        p["ticker"] or ticker,
        name,
        sector,
        _when(p["run_at"]),
        p["rating"],
        p["previous_rating"],
        p["score"],
        p["probability"],
        p["bear"],
        p["base"],
        p["bull"],
        RISKS.get(p["uncertainty"], str(p["uncertainty"] or "").replace("_", " ")),
        priced,
        price,
        _ratio(p["base"], price),
        now,
        now_day,
        _ratio(now, price),
        *_grades(s.conn, p["prediction_id"]),
        report[1].date() if report else None,
        p["ai_tool"],
        models,
        p["method_code_version"],
        p["engine_version"],
        p["prediction_id"],
    ]


def _predictions(s: _Store) -> tuple[list[list[Any]], list[list[Any]]]:
    """The latest prediction per company (by ticker), and every prediction (by ticker, then
    when it was made), each with "Newest for company"."""
    rows = s.conn.execute("SELECT * FROM predictions ORDER BY run_at, prediction_id").fetchall()
    newest = {r["cik"]: r["prediction_id"] for r in rows}
    built = [(r, _prediction_row(s, r)) for r in rows]
    every = sorted(built, key=lambda b: (b[1][0], b[0]["run_at"], b[0]["prediction_id"]))
    latest = [row for r, row in every if newest[r["cik"]] == r["prediction_id"]]
    return latest, [
        [*row, "yes" if newest[r["cik"]] == r["prediction_id"] else "no"] for r, row in every
    ]


def _latest_reports(s: _Store) -> list[tuple[str, str, int, datetime]]:
    """Each company's newest saved report the person hasn't deleted: report id, run id, cik and
    when it was saved, by ticker."""
    newest: dict[int, tuple[str, str, int, datetime]] = {}
    for r in s.conn.execute(
        "SELECT r.report_id, r.run_id, u.cik, r.created_at FROM reports r"
        " JOIN runs u ON u.run_id = r.run_id"
        " WHERE u.cik IS NOT NULL AND r.report_id NOT IN (SELECT report_id FROM hidden_reports)"
        " ORDER BY r.created_at, r.rowid"
    ):
        newest[r[2]] = (r[0], r[1], r[2], _when(r[3]))
    return sorted(newest.values(), key=lambda x: s.ticker(x[2]))


def _key_numbers(s: _Store, reports: list[tuple[str, str, int, datetime]]) -> Iterator[list[Any]]:
    for _report_id, run_id, cik, made in reports:
        found = {m["name"]: m for m in _metrics(s.conn, run_id, cik) or []}
        cells: list[Any] = []
        for name in METRIC_LABELS:
            m = found.get(name) or {}
            cells += [m.get("value"), m.get("peer_median"), m.get("percentile")]
        yield [*s.company(cik), made.date(), *cells]


def _factor_scores(s: _Store, reports: list[tuple[str, str, int, datetime]]) -> Iterator[list[Any]]:
    for report_id, run_id, cik, made in reports:
        stored = s.conn.execute(
            "SELECT json FROM sections WHERE report_id = ? AND key = 'report'", (report_id,)
        ).fetchone()
        try:
            numbers = parse_code_lines(json.loads(stored[0])) if stored else {}
        except (TypeError, ValueError):
            numbers = {}
        factors = {str(f["name"]): f for f in numbers.get("factors") or []}
        cells: list[Any] = []
        for f in FACTORS:
            row = factors.get(f) or {}
            cells += [row.get("percentile"), row.get("weight")]
        peers = sorted(
            s.ticker(r[0])
            for r in s.conn.execute(
                "SELECT peer_cik FROM peer_groups WHERE run_id = ? AND peer_cik != ?", (run_id, cik)
            )
        )
        company = s.company(cik)
        yield [
            *company,
            made.date(),
            (numbers.get("score") or {}).get("percentile"),
            *cells,
            f"40 largest in {company[2]}" if company[2] else None,
            len(peers) or None,
            ", ".join(peers) or None,
        ]


def _price_columns(s: _Store) -> list[tuple[tuple[int, str], str]]:
    """Each priced share class with its column name (the ticker), by name."""
    keys = [
        (int(r[0]), r[1] or "")
        for r in s.conn.execute("SELECT DISTINCT cik, share_class FROM prices_daily")
    ]
    named = [(k, s.ticker(k[0]) + (f" {k[1]}" if k[1] else "")) for k in keys]
    return sorted(named, key=lambda x: (x[1], x[0]))


def _prices(s: _Store, keys: list[tuple[int, str]]) -> Iterator[list[Any]]:
    """A row per day, oldest first, read in date order so only one day is held at a time."""
    place = {k: i for i, k in enumerate(keys)}
    day: str | None = None
    row: list[Any] = []
    for d, cik, share_class, close in s.conn.execute(
        "SELECT date, cik, share_class, close_unadjusted FROM prices_daily ORDER BY date"
    ):
        if d != day:
            if day is not None:
                yield row
            day = d
            row = [date.fromisoformat(d)] + [None] * len(keys)
        row[1 + place[(cik, share_class or "")]] = float(close)
    if day is not None:
        yield row


def _about(
    made: datetime, app_version: str | None, sheets: list[tuple[str, list[Col]]]
) -> list[list[Any]]:
    versions = (
        f"Tearsheet {app_version}, engine {ENGINE_VERSION}"
        if app_version
        else f"engine {ENGINE_VERSION}"
    )
    rows: list[list[Any]] = [
        [
            "About",
            "Made",
            f"{made.day} {made:%b %Y, %H:%M} on this Mac, by {versions}, method code version {METHOD_CODE_VERSION}.",
        ],
        ["About", "Not advice", ADVICE_LINE],
        ["About", "Prices", PRICES_LINE],
        [
            "About",
            "Read only",
            "Made from what Tearsheet has stored, with no AI and nothing downloaded. Nothing in it is a new prediction.",
        ],
    ]
    for (name, what), (_n, cols) in zip(SHEETS[1:], sheets, strict=True):
        rows.append([name, "", what])
        rows += [[name, c.head, c.about] for c in cols]
    return rows


@dataclass(frozen=True)
class AllData:
    file_name: str
    data: bytes
    # Each sheet's rows, not counting its header row.
    rows: dict[str, int]


def build(
    db_path: Path,
    *,
    app_version: str | None = None,
    now: Callable[[], datetime] = lambda: datetime.now().astimezone(),
) -> AllData:
    """The file, from the database at `db_path`, opened read-only. It is written in a private
    temporary folder (xlsxwriter's row files and the book itself), removed before this returns."""
    moment = now()
    made = (moment.astimezone() if moment.tzinfo else moment).replace(tzinfo=None)
    conn = sqlite3.connect(f"{Path(db_path).resolve().as_uri()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    tmp = Path(tempfile.mkdtemp(prefix=TEMP_PREFIX))
    out = tmp / "all-data.xlsx"
    try:
        s = _Store(conn)
        latest, every = _predictions(s)
        reports = _latest_reports(s)
        columns = _price_columns(s)
        keys = [k for k, _name in columns]
        price_cols = [Col("Date", "The trading day.", "date", 12)] + [
            Col(name, "", "#,##0.00", 9) for _k, name in columns
        ]
        book = _Book(out, tmp)
        sheets = [
            ("Predictions", PREDICTION),
            ("All predictions", ALL_PREDICTIONS),
            ("Key numbers", KEY_NUMBERS),
            ("Factor scores", FACTOR_SCORES),
            (
                "Prices",
                price_cols[:1]
                + [
                    Col(
                        "One column per ticker",
                        "That company's close, as traded that day. Empty where Tearsheet has none.",
                    )
                ],
            ),
        ]
        book.table("About", ABOUT, _about(made, app_version, sheets), wrap=True)
        book.table("Predictions", PREDICTION, latest)
        book.table("All predictions", ALL_PREDICTIONS, every)
        book.table("Key numbers", KEY_NUMBERS, _key_numbers(s, reports))
        book.table("Factor scores", FACTOR_SCORES, _factor_scores(s, reports))
        book.table("Prices", price_cols, _prices(s, keys))
        book.wb.close()
        return AllData(file_name(made.date()), out.read_bytes(), book.rows)
    finally:
        conn.close()
        shutil.rmtree(tmp, ignore_errors=True)


def file_name(made: date) -> str:
    return f"Tearsheet all data {made.day} {made:%b %Y}.xlsx"
