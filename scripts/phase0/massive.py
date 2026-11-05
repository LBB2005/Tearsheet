"""Phase 0 test: does Massive's free plan cover the prices?

    uv run --project engine python scripts/phase0/massive.py

Three separate records (design item 12):
1. First-sector fill, ticker by ticker: 14 months of unadjusted daily bars and dividends
   for one ticker and its 40 listed peers, splits for the whole market over the same
   months, and 2 years for SPY. Pass: 20 minutes or less.
2. The all-stocks daily summary: whether the free key can call it, and the projected
   backfill time. Recorded only.
3. Plan facts: SPY's earliest available date, the delay before a day's close is available,
   and the free plan's call limit and terms.

It needs the Massive key: tearsheet-engine set-key massive
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from collections import Counter
from datetime import date, datetime, timedelta
from typing import Any

import exchange_calendars as xcals
import pandas as pd
from _common import fail, load_inputs, open_workspace, stamp, table, write_results

from tearsheet import config
from tearsheet.http import EASTERN, HttpClient, HTTPFailure, eastern_today

FILL_MINUTES_MAX = 20
FILL_DAYS = 427  # 14 months
SPY_DAYS = 730  # 2 years
BACKFILL_CALLS = 295  # 14 months of trading days, one daily-summary call each (Technical Plan §5)
PLANS_PAGE = "https://massive.com/pricing"


def url(path: str, **parts: Any) -> str:
    return config.MASSIVE_BASE_URL + path.format(**parts)


class Calls:
    """Massive calls with their outcomes, by endpoint."""

    def __init__(self, http: HttpClient):
        self.http = http
        self.by_endpoint: Counter[str] = Counter()
        self.errors: list[dict[str, Any]] = []

    async def get(
        self, endpoint: str, address: str, params: dict[str, Any] | None = None
    ) -> dict[str, Any] | None:
        self.by_endpoint[endpoint] += 1
        try:
            return (await self.http.fetch("massive", address, kind=endpoint, params=params)).json()
        except HTTPFailure as exc:
            self.errors.append({"endpoint": endpoint, "status": exc.status, "error": str(exc)})
            return None

    async def get_all(
        self, endpoint: str, address: str, params: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Follow `next_url` pages."""
        rows: list[dict[str, Any]] = []
        data = await self.get(endpoint, address, params)
        while data:
            rows += data.get("results") or []
            next_url = data.get("next_url")
            data = await self.get(endpoint, next_url) if next_url else None
        return rows


def last_completed_session(now: datetime) -> date:
    calendar = xcals.get_calendar("XNYS")
    today = pd.Timestamp(now.date())
    session = calendar.date_to_session(today, direction="previous")
    if (
        session == today
        and now < calendar.session_close(session).tz_convert(EASTERN).to_pydatetime()
    ):
        session = calendar.previous_session(session)
    return session.date()


def bar_date(bar: dict[str, Any]) -> date:
    return datetime.fromtimestamp(bar["t"] / 1000, EASTERN).date()


async def first_sector_fill(calls: Calls, company: dict[str, Any], today: date) -> dict[str, Any]:
    start = today - timedelta(days=FILL_DAYS)
    tickers = [company["ticker"]] + [p["ticker"] for p in company["peers"]]
    started = time.monotonic()
    bars: dict[str, int] = {}
    dividends: dict[str, int] = {}
    for n, ticker in enumerate(tickers, start=1):
        print(f"  {n:2d}/{len(tickers)} {ticker}", flush=True)
        data = await calls.get(
            "daily_bars",
            url(config.MASSIVE_DAILY_BARS, ticker=ticker, start=start, end=today),
            {"adjusted": "false", "sort": "asc", "limit": 50000},
        )
        bars[ticker] = len((data or {}).get("results") or [])
        rows = await calls.get_all(
            "dividends",
            url(config.MASSIVE_DIVIDENDS),
            {"ticker": ticker, "ex_dividend_date.gte": start, "limit": 1000},
        )
        dividends[ticker] = len(rows)
    splits = await calls.get_all(
        "splits",
        url(config.MASSIVE_SPLITS),
        {"execution_date.gte": start, "execution_date.lte": today, "limit": 1000},
    )
    spy_start = today - timedelta(days=SPY_DAYS)
    spy = await calls.get(
        "daily_bars",
        url(config.MASSIVE_DAILY_BARS, ticker="SPY", start=spy_start, end=today),
        {"adjusted": "false", "sort": "asc", "limit": 50000},
    )
    spy_rows = (spy or {}).get("results") or []
    spy_dividends = await calls.get_all(
        "dividends",
        url(config.MASSIVE_DIVIDENDS),
        {"ticker": "SPY", "ex_dividend_date.gte": spy_start, "limit": 1000},
    )
    minutes = round((time.monotonic() - started) / 60, 2)
    return {
        "ticker": company["ticker"],
        "tickers_filled": len(tickers),
        "bars_per_ticker": bars,
        "tickers_with_no_bars": [t for t, n in bars.items() if n == 0],
        "dividends_per_ticker": dividends,
        "market_splits": len(splits),
        "spy_bars": len(spy_rows),
        "spy_first_bar": str(bar_date(spy_rows[0])) if spy_rows else None,
        "spy_dividends": len(spy_dividends),
        "minutes": minutes,
        "passed": minutes <= FILL_MINUTES_MAX and not calls.errors,
    }


async def daily_summary(calls: Calls, session: date, calls_per_minute: float) -> dict[str, Any]:
    data = await calls.get(
        "daily_summary", url(config.MASSIVE_DAILY_SUMMARY, day=session), {"adjusted": "false"}
    )
    rows = (data or {}).get("results") or []
    return {
        "session": str(session),
        "available": bool(rows),
        "stocks_in_summary": len(rows),
        "projected_backfill_minutes": round(BACKFILL_CALLS / calls_per_minute, 1) if rows else None,
    }


async def plan_facts(calls: Calls, today: date, now: datetime) -> dict[str, Any]:
    oldest = await calls.get(
        "daily_bars",
        url(config.MASSIVE_DAILY_BARS, ticker="SPY", start=date(2000, 1, 3), end=today),
        {"adjusted": "false", "sort": "asc", "limit": 1},
    )
    newest = await calls.get(
        "daily_bars",
        url(config.MASSIVE_DAILY_BARS, ticker="SPY", start=today - timedelta(days=10), end=today),
        {"adjusted": "false", "sort": "desc", "limit": 1},
    )
    first = ((oldest or {}).get("results") or [None])[0]
    last = ((newest or {}).get("results") or [None])[0]
    expected = last_completed_session(now)
    latest = bar_date(last) if last else None
    return {
        "spy_earliest_date": str(bar_date(first)) if first else None,
        "history_years": round((today - bar_date(first)).days / 365.25, 2) if first else None,
        "checked_at_eastern": now.isoformat(timespec="minutes"),
        "last_completed_session": str(expected),
        "latest_bar": str(latest) if latest else None,
        "latest_close_available": latest == expected,
        "configured_calls_per_minute": config.MASSIVE_CALLS_PER_MINUTE,
        "terms": f"check by hand on {PLANS_PAGE}: the free plan's call limit, history and personal-use terms",
    }


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--ticker", help="the ticker for record 1 (default: the first in inputs.yaml)"
    )
    args = parser.parse_args()

    key = config.get_key("massive")
    if not key:
        fail(
            "Save your Massive key first: uv run --project engine tearsheet-engine set-key massive"
        )
    inputs = load_inputs()
    company = next(
        (c for c in inputs["companies"] if not args.ticker or c["ticker"] == args.ticker), None
    ) or fail(f"{args.ticker} is not in inputs.yaml")
    ws = open_workspace("massive", None)
    run_id = f"phase0-massive-{stamp()}"
    per_minute = ws.settings.number("massive_calls_per_minute", config.MASSIVE_CALLS_PER_MINUTE)
    today = eastern_today()
    now = datetime.now(EASTERN)
    print(f"Data folder: {ws.paths.data_dir}")
    print(f"Massive test at {per_minute:g} calls a minute. Record 1 takes about 20 minutes.")
    try:
        async with HttpClient(ws.rawstore, run_id, settings=ws.settings, massive_key=key) as http:
            calls = Calls(http)
            print("Record 1: first-sector fill")
            fill = await first_sector_fill(calls, company, today)
            fill_errors = list(calls.errors)
            print("Record 2: all-stocks daily summary")
            summary = await daily_summary(calls, last_completed_session(now), per_minute)
            print("Record 3: plan facts")
            facts = await plan_facts(calls, today, now)
            statuses = {
                str(s): n for (svc, s), n in sorted(http.statuses.items()) if svc == "massive"
            }
    finally:
        bytes_stored = ws.rawstore.bytes_stored(run_id)
        ws.close()

    data = {
        "base_url": config.MASSIVE_BASE_URL,
        "calls_by_endpoint": dict(calls.by_endpoint),
        "statuses": statuses,
        "errors": calls.errors,
        "first_sector_fill": fill,
        "fill_errors": fill_errors,
        "daily_summary": summary,
        "plan_facts": facts,
        "raw_bytes_stored": bytes_stored,
    }
    path = write_results("massive", data)
    print()
    print(
        table(
            ["Record", "Measured", "Pass mark", "Result"],
            [
                [
                    "1. First-sector fill",
                    f"{fill['minutes']} min, {sum(calls.by_endpoint.values())} calls",
                    f"≤ {FILL_MINUTES_MAX} min",
                    "pass" if fill["passed"] else "FAIL",
                ],
                [
                    "2. Daily summary",
                    "available" if summary["available"] else "not available on this key",
                    "recorded only",
                    f"backfill {summary['projected_backfill_minutes']} min",
                ],
                [
                    "3. SPY history",
                    f"from {facts['spy_earliest_date']} ({facts['history_years']} years)",
                    "≥ 2 years",
                    "recorded",
                ],
                [
                    "3. Close delay",
                    f"latest bar {facts['latest_bar']} at {facts['checked_at_eastern']}",
                    f"last session {facts['last_completed_session']}",
                    "recorded",
                ],
            ],
        )
    )
    print(f"\nCalls by endpoint: {dict(calls.by_endpoint)}; statuses: {statuses}")
    if calls.errors:
        print(f"Errors: {len(calls.errors)} (first: {calls.errors[0]['error']})")
    print(f"Raw bytes stored: {bytes_stored}")
    print(f"Full results: {path}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
