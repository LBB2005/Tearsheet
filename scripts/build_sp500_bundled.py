"""Build engine/src/tearsheet/data/sp500_bundled.csv (design item 18).

The bundled list is the fallback when the iShares IVV holdings file can't be used (Phase 0:
it returns a web page instead of the CSV). It joins:

* the SPDR S&P 500 ETF (SPY) holdings file, for the members and their index weights; and
* Wikipedia's "List of S&P 500 companies", for each member's GICS sector and SEC CIK.

Run it before each release, from the repository root:

    uv run --project engine python scripts/build_sp500_bundled.py

or offline, from files already downloaded:

    uv run --project engine python scripts/build_sp500_bundled.py --spy-file spy.xlsx --wikipedia-file list.html

It refuses to write a list that fails the membership check (495-510 members, each with a
sector and a CIK).
"""

from __future__ import annotations

import argparse
import csv
import io
import re
import sys
import zipfile
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree as ET

import httpx

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "engine" / "src" / "tearsheet" / "data" / "sp500_bundled.csv"
SPY_URL = (
    "https://www.ssga.com/us/en/intermediary/library-content/products/fund-data/etfs/us/"
    "holdings-daily-us-en-spy.xlsx"
)
WIKIPEDIA_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
USER_AGENT = "Tearsheet/0.0.1 (personal research tool; release build script)"
MIN_MEMBERS, MAX_MEMBERS = 495, 510
GICS_SECTORS = {
    "Communication Services",
    "Consumer Discretionary",
    "Consumer Staples",
    "Energy",
    "Financials",
    "Health Care",
    "Industrials",
    "Information Technology",
    "Materials",
    "Real Estate",
    "Utilities",
}

_NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def xlsx_rows(data: bytes) -> list[list[str]]:
    """The first sheet's rows as text, read with the standard library only."""
    with zipfile.ZipFile(io.BytesIO(data)) as book:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in book.namelist():
            root = ET.fromstring(book.read("xl/sharedStrings.xml"))
            for item in root.iterfind("m:si", _NS):
                shared.append("".join(t.text or "" for t in item.iter(f"{{{_NS['m']}}}t")))
        sheet = ET.fromstring(book.read("xl/worksheets/sheet1.xml"))
    rows = []
    for row in sheet.iterfind(".//m:sheetData/m:row", _NS):
        cells: dict[int, str] = {}
        for cell in row.iterfind("m:c", _NS):
            ref = cell.get("r", "")
            col = 0
            for ch in re.match(r"[A-Z]+", ref).group(0):
                col = col * 26 + (ord(ch) - 64)
            value = cell.find("m:v", _NS)
            inline = cell.find("m:is/m:t", _NS)
            if cell.get("t") == "s" and value is not None:
                text = shared[int(value.text)]
            elif inline is not None:
                text = inline.text or ""
            else:
                text = value.text if value is not None and value.text is not None else ""
            cells[col - 1] = text.strip()
        if cells:
            rows.append([cells.get(i, "") for i in range(max(cells) + 1)])
    return rows


def spy_holdings(data: bytes) -> tuple[date | None, dict[str, float]]:
    """Ticker → index weight (percent), and the file's as-of date."""
    rows = xlsx_rows(data)
    as_of = None
    for row in rows[:6]:
        text = " ".join(row)
        found = re.search(r"As of[: ]+(\d{1,2}-[A-Za-z]{3}-\d{4})", text)
        if found:
            from datetime import datetime

            as_of = datetime.strptime(found.group(1), "%d-%b-%Y").date()
    header = next(i for i, row in enumerate(rows) if "Ticker" in row and "Weight" in row)
    cols = rows[header]
    ticker_col, weight_col = cols.index("Ticker"), cols.index("Weight")
    weights: dict[str, float] = {}
    for row in rows[header + 1 :]:
        if len(row) <= max(ticker_col, weight_col):
            continue
        ticker, weight = row[ticker_col].strip().upper(), row[weight_col].strip()
        if not ticker or ticker in ("-", "CASH_USD", "USD") or not re.match(r"^[A-Z.]+$", ticker):
            continue
        try:
            weights[ticker] = weights.get(ticker, 0.0) + float(weight)
        except ValueError:
            continue
    return as_of, weights


class _ConstituentsTable(HTMLParser):
    """Rows of the table with id="constituents"."""

    def __init__(self):
        super().__init__()
        self.depth = 0
        self.rows: list[list[str]] = []
        self.row: list[str] | None = None
        self.cell: list[str] | None = None

    def handle_starttag(self, tag, attrs):
        if tag == "table" and dict(attrs).get("id") == "constituents":
            self.depth = 1
        elif tag == "table" and self.depth:
            self.depth += 1
        elif self.depth and tag == "tr":
            self.row = []
        elif self.depth and tag in ("td", "th") and self.row is not None:
            self.cell = []

    def handle_endtag(self, tag):
        if tag == "table" and self.depth:
            self.depth -= 1
        elif self.depth and tag in ("td", "th") and self.cell is not None and self.row is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        elif self.depth and tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)


def wikipedia_members(html: str) -> dict[str, tuple[str, int, str]]:
    """Ticker → (GICS sector, CIK, company name)."""
    parser = _ConstituentsTable()
    parser.feed(html)
    header, *rows = parser.rows
    sym, name, sector, cik = (
        header.index("Symbol"),
        header.index("Security"),
        header.index("GICS Sector"),
        header.index("CIK"),
    )
    return {
        row[sym].strip().upper(): (row[sector].strip(), int(row[cik]), row[name].strip())
        for row in rows
        if len(row) > max(sym, sector, cik) and row[cik].strip().isdigit()
    }


def build(spy: bytes, html: str) -> tuple[date | None, list[dict[str, object]], list[str]]:
    as_of, weights = spy_holdings(spy)
    members = wikipedia_members(html)
    rows, problems = [], []
    for ticker, (sector, cik, name) in sorted(members.items()):
        if sector not in GICS_SECTORS:
            problems.append(f"{ticker}: unknown sector {sector!r}")
        weight = weights.get(ticker)
        if weight is None:
            problems.append(f"{ticker}: in Wikipedia's list but not in the SPY file")
            continue
        rows.append(
            {"ticker": ticker, "cik": cik, "name": name, "sector": sector, "weight": weight}
        )
    unmatched = sorted(set(weights) - set(members))
    if unmatched:
        problems.append(f"in the SPY file but not in Wikipedia's list: {', '.join(unmatched)}")
    companies = {r["cik"] for r in rows}
    if not MIN_MEMBERS <= len(companies) <= MAX_MEMBERS:
        problems.append(f"{len(companies)} companies, outside {MIN_MEMBERS}-{MAX_MEMBERS}")
    return as_of, rows, problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--spy-file", type=Path)
    parser.add_argument("--wikipedia-file", type=Path)
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()
    with httpx.Client(
        headers={"User-Agent": USER_AGENT}, timeout=60, follow_redirects=True
    ) as http:
        spy = args.spy_file.read_bytes() if args.spy_file else http.get(SPY_URL).content
        html = (
            args.wikipedia_file.read_text(encoding="utf-8")
            if args.wikipedia_file
            else http.get(WIKIPEDIA_URL).text
        )
    as_of, rows, problems = build(spy, html)
    blocking = [p for p in problems if "outside" in p or "unknown sector" in p]
    for problem in problems:
        print(("ERROR: " if problem in blocking else "note: ") + problem, file=sys.stderr)
    if blocking or as_of is None:
        print("Not written.", file=sys.stderr)
        return 1
    out = io.StringIO()
    writer = csv.DictWriter(
        out, fieldnames=["ticker", "cik", "name", "sector", "weight", "as_of"], lineterminator="\n"
    )
    writer.writeheader()
    for row in rows:
        writer.writerow({**row, "weight": f"{row['weight']:.6f}", "as_of": as_of.isoformat()})
    args.out.write_text(out.getvalue())
    print(
        f"Wrote {len(rows)} rows ({len({r['cik'] for r in rows})} companies), as of {as_of}, to {args.out}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
