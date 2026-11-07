"""S&P 500 members, sectors and index weights (design item 18).

The source is the iShares Core S&P 500 ETF (IVV) holdings file, refreshed once a day. A file
that fails the check is not used: the last good snapshot is used instead, and failing that the
bundled list shipped with the release (`sp500_bundled.csv`, built by
`scripts/build_sp500_bundled.py`). Phase 0 found the IVV address returning a web page, so the
bundled list is the usual source until that is fixed.
"""

from __future__ import annotations

import csv
import io
import re
import sqlite3
from dataclasses import dataclass
from datetime import date, datetime
from importlib import resources

from tearsheet.http import HttpClient, HTTPFailure
from tearsheet.rawstore import RawStore
from tearsheet.resolve import canonical_ticker

IVV_HOLDINGS_URL = (
    "https://www.ishares.com/us/products/239726/ishares-core-sp-500-etf/"
    "1467271812596.ajax?fileType=csv&fileName=IVV_holdings&dataType=fund"
)
MIN_ROWS, MAX_ROWS = 495, 510
BUNDLED = "sp500_bundled.csv"
# iShares's sector names → GICS sector names.
SECTOR_NAMES = {
    "Communication": "Communication Services",
    "Information Technology": "Information Technology",
    "Health Care": "Health Care",
    "Financials": "Financials",
    "Industrials": "Industrials",
    "Consumer Discretionary": "Consumer Discretionary",
    "Consumer Staples": "Consumer Staples",
    "Energy": "Energy",
    "Materials": "Materials",
    "Real Estate": "Real Estate",
    "Utilities": "Utilities",
}


class MembershipError(ValueError):
    """A holdings file that fails the check."""


@dataclass(frozen=True)
class HoldingRow:
    ticker: str
    cik: int
    name: str
    sector: str
    weight: float


@dataclass(frozen=True)
class Company:
    cik: int
    name: str
    sector: str
    weight: float  # the share classes' weights added together
    tickers: tuple[str, ...]  # largest weight first: tickers[0] is the rated class


@dataclass
class Holdings:
    as_of: date
    source: str  # "ivv" or "bundled"
    rows: list[HoldingRow]
    raw_hash: str | None = None

    def __post_init__(self):
        by_cik: dict[int, list[HoldingRow]] = {}
        for row in self.rows:
            by_cik.setdefault(row.cik, []).append(row)
        self._companies = {
            cik: Company(
                cik=cik,
                name=rows[0].name,
                sector=rows[0].sector,
                weight=sum(r.weight for r in rows),
                tickers=tuple(r.ticker for r in sorted(rows, key=lambda r: (-r.weight, r.ticker))),
            )
            for cik, rows in by_cik.items()
        }

    def companies(self) -> list[Company]:
        return sorted(self._companies.values(), key=lambda c: (-c.weight, c.cik))

    def company(self, cik: int) -> Company:
        return self._companies[cik]

    def has(self, cik: int) -> bool:
        return cik in self._companies

    def tickers_of(self, cik: int) -> tuple[str, ...]:
        return self._companies[cik].tickers

    def name_of(self, cik: int) -> str:
        return self._companies[cik].name

    def sector_members(self, sector: str) -> list[Company]:
        """Largest index weight first."""
        return [c for c in self.companies() if c.sector == sector]


def _check(rows: list[HoldingRow], unmatched: list[str]) -> None:
    if unmatched:
        raise MembershipError(f"tickers with no SEC CIK: {', '.join(unmatched)}")
    if not MIN_ROWS <= len(rows) <= MAX_ROWS:
        raise MembershipError(
            f"{len(rows)} equity rows; a holdings file needs {MIN_ROWS}-{MAX_ROWS}"
        )


def parse_ivv(text: str, sec_tickers: dict[str, int], *, check: bool = True) -> Holdings:
    """Parse the IVV CSV: skip the lines before the header row, keep Equity rows, map each
    ticker to a CIK with SEC's ticker list, and check the row count. A replay passes
    `check=False`: the run already accepted this file."""
    lines = text.splitlines()
    header_at = next(
        (i for i, line in enumerate(lines) if line.startswith("Ticker,") and "Asset Class" in line),
        None,
    )
    if header_at is None:
        raise MembershipError("no header row (Ticker, ..., Asset Class): not a holdings file")
    as_of = None
    for line in lines[:header_at]:
        found = re.search(r'as of,"?([A-Za-z]{3} \d{1,2}, \d{4})', line)
        if found:
            as_of = datetime.strptime(found.group(1), "%b %d, %Y").date()
    if as_of is None:
        raise MembershipError("no 'Fund Holdings as of' date")
    # iShares writes tickers without the class dot (BRKB); SEC's list has the dot.
    undotted = {t.replace(".", ""): t for t in sec_tickers}
    rows, unmatched = [], []
    for record in csv.DictReader(io.StringIO("\n".join(lines[header_at:]))):
        if (record.get("Asset Class") or "").strip() != "Equity":
            continue
        raw = (record.get("Ticker") or "").strip()
        ticker = canonical_ticker(raw)
        ticker = ticker if ticker in sec_tickers else undotted.get(ticker.replace(".", ""), ticker)
        if ticker not in sec_tickers:
            unmatched.append(raw)
            continue
        sector = SECTOR_NAMES.get((record.get("Sector") or "").strip(), record.get("Sector", ""))
        weight = float((record.get("Weight (%)") or "0").replace(",", ""))
        rows.append(
            HoldingRow(
                ticker, sec_tickers[ticker], (record.get("Name") or "").strip(), sector, weight
            )
        )
    if check:
        _check(rows, unmatched)
    return Holdings(as_of=as_of, source="ivv", rows=rows)


def load_bundled() -> Holdings:
    text = (resources.files("tearsheet.data") / BUNDLED).read_text(encoding="utf-8")
    rows, as_of = [], None
    for record in csv.DictReader(io.StringIO(text)):
        as_of = date.fromisoformat(record["as_of"])
        rows.append(
            HoldingRow(
                record["ticker"],
                int(record["cik"]),
                record["name"],
                record["sector"],
                float(record["weight"]),
            )
        )
    return Holdings(as_of=as_of, source="bundled", rows=rows)


def stored_or_bundled(conn: sqlite3.Connection) -> Holdings:
    """The last stored holdings file, or the bundled list, with no network (the price
    backfill and whole-market top-ups use it to know every member's rated ticker)."""
    return _latest_snapshot(conn) or load_bundled()


def _latest_snapshot(conn: sqlite3.Connection) -> Holdings | None:
    row = conn.execute("SELECT MAX(as_of) FROM sp500_holdings").fetchone()
    if not row or row[0] is None:
        return None
    as_of = row[0]
    rows = [
        HoldingRow(r["ticker"], r["cik"], r["ticker"], r["sector"], r["weight"])
        for r in conn.execute(
            "SELECT ticker, cik, sector, weight FROM sp500_holdings WHERE as_of = ?", (as_of,)
        )
    ]
    raw_hash = conn.execute(
        "SELECT raw_hash FROM sp500_holdings WHERE as_of = ? LIMIT 1", (as_of,)
    ).fetchone()[0]
    return Holdings(as_of=date.fromisoformat(as_of), source="ivv", rows=rows, raw_hash=raw_hash)


def _store(conn: sqlite3.Connection, holdings: Holdings) -> None:
    as_of = holdings.as_of.isoformat()
    with conn:
        conn.executemany(
            "INSERT OR REPLACE INTO sp500_holdings (as_of, cik, ticker, sector, weight, raw_hash)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            [
                (as_of, r.cik, r.ticker, r.sector, r.weight, holdings.raw_hash or "")
                for r in holdings.rows
            ],
        )
        members = {c.cik for c in holdings.companies()}
        current = {
            r[0] for r in conn.execute("SELECT cik FROM sp500_membership WHERE date_to IS NULL")
        }
        conn.executemany(
            "INSERT OR IGNORE INTO sp500_membership (cik, date_from, date_to, source) VALUES (?, ?, NULL, ?)",
            [(cik, as_of, holdings.source) for cik in sorted(members - current)],
        )
        conn.executemany(
            "UPDATE sp500_membership SET date_to = ? WHERE cik = ? AND date_to IS NULL",
            [(as_of, cik) for cik in sorted(current - members)],
        )


@dataclass
class Refreshed:
    holdings: Holdings
    note: str | None  # said in the run's report when the fresh file wasn't used


async def refresh(
    http: HttpClient,
    rawstore: RawStore,
    conn: sqlite3.Connection,
    sec_tickers: dict[str, int],
    *,
    today: date,
) -> Refreshed:
    """Step 1's daily refresh of the member list."""
    stored = _latest_snapshot(conn)
    if stored is not None and stored.as_of >= today:
        return Refreshed(stored, None)
    problem = None
    try:
        fetched = await http.fetch("ishares", IVV_HOLDINGS_URL, kind="holdings", expect="csv")
        holdings = parse_ivv(fetched.text(), sec_tickers)
        holdings.raw_hash = fetched.raw_hash
        _store(conn, holdings)
        return Refreshed(holdings, None)
    except (HTTPFailure, MembershipError) as exc:
        problem = str(exc)
    if stored is not None:
        return Refreshed(
            stored,
            f"The S&P 500 holdings file couldn't be used today ({problem}), so the last good "
            f"copy, from {stored.as_of:%-d %b %Y}, was used.",
        )
    bundled = load_bundled()
    return Refreshed(
        bundled,
        f"The S&P 500 holdings file couldn't be used ({problem}), so the bundled list, as of "
        f"{bundled.as_of:%-d %b %Y}, was used.",
    )
