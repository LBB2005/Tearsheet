"""Phase 0 test: SEC requests per run, edgartools offline, and the S&P 500 list file.

First run (a new data folder):
    uv run --project engine python scripts/phase0/sec.py
Next-day repeat (the folder the first run printed):
    uv run --project engine python scripts/phase0/sec.py --repeat --data-dir <folder>

Pass marks (design item 12): per ticker, at most 300 requests on a first run and 60 on a
next-day repeat, with no 403 or 429 responses; edgartools finds Items 1, 1A, 7 and 9A, the
auditor's report and the 10-Q MD&A with the network blocked; the IVV file has 495-510
equity rows, all matched to a CIK.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import io
import re
import socket
import sys
import time
from collections import Counter
from contextlib import contextmanager
from typing import Any

from _common import (
    Workspace,
    load_inputs,
    open_workspace,
    sec_user_agent,
    stamp,
    table,
    write_results,
)

from tearsheet.data.sec import (
    EX_13,
    SECBundle,
    SECClient,
    auditor_report,
    decode_filing,
    split_sections,
)
from tearsheet.http import HttpClient, HTTPFailure, SECBlocked

# The IVV holdings download, believed. Confirmed in Phase 0; it moves to data/membership.py.
# On 2026-11-03 this address returned the fund's web page (sent as text/csv) to a plain
# download, so the test records whether it works from Liam's Mac.
IVV_HOLDINGS_URL = (
    "https://www.ishares.com/us/products/239726/ishares-core-sp-500-etf/"
    "1467271812596.ajax?fileType=csv&fileName=IVV_holdings&dataType=fund"
)
IVV_TERMS_PAGE = "https://www.ishares.com/us/terms-of-use"
FIRST_RUN_MAX = 300
REPEAT_MAX = 60
IVV_EQUITY_ROWS = (495, 510)
MIN_SECTION_CHARS = 300
MDNA_HEADING = re.compile(r"management.{0,3}s\s+discussion\s+and\s+analysis", re.IGNORECASE)


@contextmanager
def network_blocked():
    """Make any connection attempt fail, to prove edgartools reads only stored files."""
    saved = (socket.socket.connect, socket.create_connection, socket.getaddrinfo)

    def refuse(*args: Any, **kwargs: Any) -> Any:
        raise OSError("network blocked for the edgartools offline test")

    socket.socket.connect = refuse  # type: ignore[method-assign]
    socket.create_connection = refuse  # type: ignore[assignment]
    socket.getaddrinfo = refuse  # type: ignore[assignment]
    try:
        yield
    finally:
        socket.socket.connect, socket.create_connection, socket.getaddrinfo = saved  # type: ignore[method-assign,assignment]


def edgartools_check(ws: Workspace, bundle: SECBundle) -> dict[str, Any]:
    ten_k = bundle.find("10-K", doc_type="10-K")
    ten_q = bundle.find("10-Q", doc_type="10-Q")
    if ten_k is None or ten_q is None:
        return {"passed": False, "error": "no stored 10-K or 10-Q"}
    try:
        with network_blocked():
            k = split_sections(ws.rawstore.get(ten_k.raw_hash), "10-K")
            q = split_sections(ws.rawstore.get(ten_q.raw_hash), "10-Q")
    except Exception as exc:  # noqa: BLE001 - any failure here is the measured result
        return {"passed": False, "error": f"{type(exc).__name__}: {exc}"}
    found = {
        "Item 1": len(k.get("Item 1", "")),
        "Item 1A": len(k.get("Item 1A", "")),
        "Item 7": len(k.get("Item 7", "")),
        "Item 9A": len(k.get("Item 9A", "")),
        "auditor's report": len(auditor_report(k) or ""),
        "10-Q MD&A": len(q.get("Part I Item 2", "")),
    }
    notes = []
    exhibits = [d for d in bundle.documents if d.role == "10-K" and EX_13.match(d.doc_type)]
    if found["Item 7"] < MIN_SECTION_CHARS and exhibits:
        text = decode_filing(ws.rawstore.get(exhibits[0].raw_hash))
        if MDNA_HEADING.search(text):
            notes.append("Item 7 is incorporated by reference; MD&A found in Exhibit 13")
            found["Item 7"] = len(text)
    return {
        "passed": all(chars >= MIN_SECTION_CHARS for chars in found.values()),
        "chars": found,
        "sections_found": sorted(k) + sorted(q),
        "notes": notes,
        "route": "parse_html (route 1)",
    }


async def run_ticker(
    ws: Workspace, user_agent: str, company: dict[str, Any], label: str
) -> dict[str, Any]:
    run_id = f"phase0-sec-{label}-{company['ticker']}-{stamp()}"
    started = time.monotonic()
    error = None
    bundle = None
    async with HttpClient(
        ws.rawstore, run_id, settings=ws.settings, sec_user_agent=user_agent
    ) as http:
        sec = SECClient(http, ws.rawstore)
        try:
            bundle = await sec.fetch_for_report(
                company["cik"], [p["cik"] for p in company["peers"]]
            )
        except SECBlocked:
            raise
        except HTTPFailure as exc:
            error = str(exc)
        by_kind = {
            kind: n for (service, kind), n in sorted(http.requests.items()) if service == "sec"
        }
        statuses = {
            str(status): n
            for (service, status), n in sorted(http.statuses.items())
            if service == "sec"
        }
    total = sum(by_kind.values())
    limit = FIRST_RUN_MAX if label == "first" else REPEAT_MAX
    refused = sum(n for status, n in statuses.items() if status in ("403", "429"))
    return {
        "ticker": company["ticker"],
        "run_id": run_id,
        "requests": total,
        "requests_by_type": by_kind,
        "statuses": statuses,
        "form4_filings": bundle.form4_count if bundle else None,
        "form4_purchase_found": bundle.form4_purchase if bundle else None,
        "documents": len(bundle.documents) if bundle else 0,
        "raw_bytes_stored": ws.rawstore.bytes_stored(run_id),
        "minutes": round((time.monotonic() - started) / 60, 2),
        "error": error,
        "passed": error is None and total <= limit and refused == 0,
        "bundle": bundle,
    }


def _ticker_index(company_tickers: dict[str, Any]) -> dict[str, int]:
    return {str(row["ticker"]).upper(): int(row["cik_str"]) for row in company_tickers.values()}


def match_cik(ticker: str, index: dict[str, int]) -> int | None:
    t = ticker.strip().upper()
    candidates = [t, t.replace(".", "-"), t.replace("/", "-"), t.replace(" ", "-")]
    if len(t) > 3:
        candidates.append(f"{t[:-1]}-{t[-1]}")  # iShares writes BRKB for BRK-B
    return next((index[c] for c in candidates if c in index), None)


async def ivv_check(ws: Workspace, user_agent: str) -> dict[str, Any]:
    run_id = f"phase0-sec-ivv-{stamp()}"
    result: dict[str, Any] = {"address": IVV_HOLDINGS_URL, "terms_page": IVV_TERMS_PAGE}
    async with HttpClient(
        ws.rawstore, run_id, settings=ws.settings, sec_user_agent=user_agent
    ) as http:
        index = _ticker_index(await SECClient(http, ws.rawstore).company_tickers())
        try:
            fetched = await http.fetch("ishares", IVV_HOLDINGS_URL, kind="holdings", expect="csv")
        except HTTPFailure as exc:
            result.update(passed=False, error=str(exc))
            return result
    lines = fetched.text().splitlines()
    header_at = next((i for i, line in enumerate(lines) if line.startswith("Ticker,")), None)
    if header_at is None:
        result.update(passed=False, error="no 'Ticker,' header row in the file")
        return result
    body = []
    for line in lines[header_at:]:
        if not line.strip() or line.startswith("\xa0"):
            break
        body.append(line)
    rows = list(csv.DictReader(io.StringIO("\n".join(body))))
    equity = [r for r in rows if (r.get("Asset Class") or "").strip() == "Equity"]
    unmatched = [r["Ticker"] for r in equity if match_cik(r["Ticker"], index) is None]
    low, high = IVV_EQUITY_ROWS
    result.update(
        columns=list(rows[0].keys()) if rows else [],
        has_sector_column="Sector" in (rows[0].keys() if rows else []),
        equity_rows=len(equity),
        matched_share=round(1 - len(unmatched) / len(equity), 4) if equity else 0.0,
        unmatched=unmatched,
        raw_bytes_stored=ws.rawstore.bytes_stored(run_id),
        passed=low <= len(equity) <= high and not unmatched,
    )
    return result


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--repeat", action="store_true", help="the next-day repeat run")
    parser.add_argument("--data-dir", help="reuse this data folder (required with --repeat)")
    parser.add_argument("--tickers", nargs="*", help="only these tickers from inputs.yaml")
    args = parser.parse_args()
    if args.repeat and not args.data_dir:
        parser.error("--repeat needs --data-dir <the folder the first run printed>")

    inputs = load_inputs()
    companies = [c for c in inputs["companies"] if not args.tickers or c["ticker"] in args.tickers]
    ws = open_workspace("sec", args.data_dir)
    user_agent = sec_user_agent(ws.settings)
    label = "repeat" if args.repeat else "first"
    print(f"Data folder: {ws.paths.data_dir}")
    print(f"SEC test, {label} run, {len(companies)} tickers. This takes several minutes.")

    tickers: list[dict[str, Any]] = []
    try:
        for company in companies:
            print(f"  {company['ticker']} ...", flush=True)
            outcome = await run_ticker(ws, user_agent, company, label)
            bundle = outcome.pop("bundle")
            if label == "first" and bundle is not None:
                outcome["edgartools_offline"] = edgartools_check(ws, bundle)
            tickers.append(outcome)
            print(
                f"    {outcome['requests']} requests, {outcome['minutes']} min, error: {outcome['error']}"
            )
        ivv = await ivv_check(ws, user_agent) if label == "first" else None
    except SECBlocked as exc:
        print(f"\nStopped: {exc}", file=sys.stderr)
        tickers.append({"error": str(exc), "passed": False})
        ivv = None
    finally:
        ws.close()

    data = {"run": label, "data_dir": str(ws.paths.data_dir), "tickers": tickers, "ivv": ivv}
    path = write_results(f"sec-{label}", data)
    limit = FIRST_RUN_MAX if label == "first" else REPEAT_MAX
    print()
    print(
        table(
            [
                "Ticker",
                "Requests",
                f"Pass (≤ {limit}, no 403/429)",
                "Form 4s",
                "Raw bytes",
                "edgartools offline",
            ],
            [
                [
                    t.get("ticker"),
                    t.get("requests"),
                    "pass" if t.get("passed") else "FAIL",
                    t.get("form4_filings"),
                    t.get("raw_bytes_stored"),
                    ("pass" if t["edgartools_offline"]["passed"] else "FAIL")
                    if "edgartools_offline" in t
                    else "-",
                ]
                for t in tickers
            ],
        )
    )
    kinds: Counter[str] = Counter()
    for t in tickers:
        kinds.update(t.get("requests_by_type") or {})
    print(f"\nRequests by type, all tickers: {dict(kinds)}")
    if ivv is not None:
        verdict = "pass" if ivv.get("passed") else "FAIL"
        print(
            f"IVV holdings file: {verdict}; equity rows {ivv.get('equity_rows')}, matched "
            f"{ivv.get('matched_share')}, sector column {ivv.get('has_sector_column')}, "
            f"error {ivv.get('error')}"
        )
        print(f"Check the site's terms on personal use by hand: {IVV_TERMS_PAGE}")
    print(f"\nFull results: {path}")
    if label == "first":
        print(
            "\nTomorrow (a new US Eastern day), run the repeat:\n"
            f'  uv run --project engine python scripts/phase0/sec.py --repeat --data-dir "{ws.paths.data_dir}"'
        )
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
