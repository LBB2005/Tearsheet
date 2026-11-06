"""The golden set (design item 40, Verification Plan).

Twenty companies chosen for their hard cases (`evals/golden/tickers.yaml`). Their inputs are
downloaded once, live, into a data folder outside git (`--freeze`, Liam's step). After that,
`tearsheet-engine eval golden` runs code steps 1-8 for every company offline from that store at
the freeze date, with no AI calls, and:

* checks the hand-checked numbers (`hand_checked.yaml`): within 0.5%, exact for share counts
  and dates;
* checks each company still shows the hard case it was chosen for;
* compares every rating, score and bear/base/bull value with `last_run.json`, which is
  committed and rewritten (`--update`) only after Liam reviews the changes.

Nothing it does writes to the store: each company runs in a scratch database.
"""

from __future__ import annotations

import asyncio
import json
import sqlite3
import tempfile
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import yaml

from tearsheet import config

GOLDEN_DIR = Path.home() / "Tearsheet Golden"
TOLERANCE = 0.005
# Numbers a hand check may name, read from the company's normalized inputs.
CHECKABLE = (
    "revenue",
    "net_income",
    "operating_cash_flow",
    "capital_spending",
    "total_assets",
    "total_equity",
    "total_debt",
    "cash",
    "diluted_shares",
    "diluted_eps",
    "market_value",
    "price",
)
EXACT = {"diluted_shares", "price_date", "period_end"}
# The store's price tables, copied into each scratch run.
PRICE_TABLES = ("prices_daily", "corporate_actions")
# The rated values compared with last_run.json.
COMPARED = ("rating", "score", "bear", "base", "bull")


@dataclass
class Result:
    ticker: str
    status: str
    rating: str | None = None
    score: float | None = None
    bear: float | None = None
    base: float | None = None
    bull: float | None = None
    numbers: dict[str, Any] = field(default_factory=dict)
    facts: dict[str, Any] = field(default_factory=dict)  # for the hard-case checks
    error: str | None = None

    def rated(self) -> dict[str, Any]:
        return {k: getattr(self, k) for k in COMPARED}


# --- files ------------------------------------------------------------------------------------


def evals_dir() -> Path:
    return Path(__file__).resolve().parents[3] / "evals" / "golden"


def read_yaml(path: Path) -> Any:
    return yaml.safe_load(path.read_text()) if path.exists() else None


def load_tickers(folder: Path) -> tuple[datetime | None, list[dict[str, Any]]]:
    """The tickers, and the freeze time: every offline run uses that exact time, so it expects
    the same latest close the download had."""
    data = read_yaml(folder / "tickers.yaml") or {}
    as_of = data.get("as_of")
    if isinstance(as_of, datetime):
        stamp = as_of
    elif as_of:
        stamp = datetime.fromisoformat(str(as_of))
    else:
        stamp = None
    if stamp is not None and stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=UTC)
    return stamp, list(data.get("tickers") or [])


def set_as_of(folder: Path, as_of: datetime) -> None:
    """Record the freeze time in tickers.yaml, keeping the rest of the file as written."""
    path = folder / "tickers.yaml"
    stamp = as_of.astimezone(UTC).isoformat(timespec="seconds")
    lines = path.read_text().splitlines()
    out = [f'as_of: "{stamp}"' if line.startswith("as_of:") else line for line in lines]
    path.write_text("\n".join(out) + "\n")


# --- running -----------------------------------------------------------------------------------


def _numbers(run) -> tuple[dict[str, Any], dict[str, Any]]:
    company = run.members.get(run.cik)
    inputs = getattr(company, "inputs", None) if company else None
    numbers: dict[str, Any] = {}
    if inputs is not None:
        numbers = {k: getattr(inputs, k) for k in CHECKABLE if getattr(inputs, k) is not None}
    if getattr(run, "price_date", None):
        numbers["price_date"] = run.price_date.isoformat()
    period = company.fin.latest_period_end() if company and company.fin else None
    if period:
        numbers["period_end"] = period.isoformat()
    fcf = (
        None
        if inputs is None or inputs.operating_cash_flow is None
        else inputs.operating_cash_flow - (inputs.capital_spending or 0.0)
    )
    facts = {
        "financial_class": getattr(run, "company_class", ""),
        "sector": run.group.sector if getattr(run, "group", None) else None,
        "free_cash_flow": fcf,
        "total_equity": inputs.total_equity if inputs else None,
        "share_classes": len(run.holdings.tickers_of(run.cik)) if run.holdings.has(run.cik) else 1,
        "cover_shares": company.cover_shares if company else None,
        "name": run.company_name,
        "exhibit_13": any(d.exhibit_13 for d in getattr(run, "docs_used", []) if d.role == "10-K"),
        "red_flags": [f.key for f in getattr(run, "flags", [])],
        "fiscal_year_end": str(getattr(run, "company_submissions", {}).get("fiscalYearEnd") or ""),
        "recent_split": run.store.split_factor(
            run.cik, after=run.today.replace(year=run.today.year - 2), up_to=run.today
        )
        != 1.0,
    }
    return numbers, facts


async def _run_one(store: Path, ticker: str, as_of: datetime) -> Result:
    from tearsheet.db import open_database
    from tearsheet.methodology import load
    from tearsheet.pipeline import Run

    now = as_of
    with tempfile.TemporaryDirectory(prefix="tearsheet-golden-") as scratch:
        database = open_database(Path(scratch) / "tearsheet.sqlite")
        try:
            data = GoldenData(store)
            run = Run(database.conn, data, None, load(), mode="full", now=now, out_dir=None)
            try:
                outcome = await run.run(ticker)
            except Exception as exc:  # noqa: BLE001 - one company's failure is reported, not fatal
                return Result(ticker, "failed", error=str(exc))
            rating, rng = getattr(run, "rated", (None, None))
            numbers, facts = _numbers(run)
            scored = getattr(run, "score_result", None)
            score = scored.composite.get(run.cik) if scored else None
            return Result(
                ticker,
                outcome.status,
                rating=rating.rating if rating else None,
                score=round(score, 6) if score is not None else None,
                bear=round(rng.bear, 4) if rng else None,
                base=round(rng.base, 4) if rng else None,
                bull=round(rng.bull, 4) if rng else None,
                numbers=numbers,
                facts=facts,
            )
        finally:
            database.close()


def run_all(store: Path, tickers: list[dict[str, Any]], as_of: datetime) -> list[Result]:
    return [asyncio.run(_run_one(store, str(t["ticker"]), as_of)) for t in tickers]


# --- the store --------------------------------------------------------------------------------


def _golden_data_class():
    from tearsheet.data.fred import parse_observations, value_on
    from tearsheet.data.prices import SPY_CIK
    from tearsheet.sources import StoredData

    class _GoldenData(StoredData):
        """The frozen store, read with no network, with its own stored 10-year yield."""

        def __init__(self, folder: Path):
            super().__init__([folder], risk_free=0.0, risk_free_date=date.min)

        async def holdings(self, sec_tickers, *, today: date):
            from tearsheet.data.membership import (
                IVV_HOLDINGS_URL,
                MembershipError,
                Refreshed,
                parse_ivv,
            )

            body = self._body(IVV_HOLDINGS_URL)
            if body is not None:
                try:
                    text = body.decode("utf-8", errors="replace")
                    return Refreshed(parse_ivv(text, sec_tickers, check=False), None)
                except MembershipError:
                    pass
            return await super().holdings(sec_tickers, today=today)

        async def fill_prices(self, store, members, *, end: date) -> None:
            """Stored downloads first, then any price rows already in the store's database (a
            frozen store has both; a synthetic one may have only the rows)."""
            await super().fill_prices(store, members, end=end)
            wanted = {*members, SPY_CIK}
            for _, conn in self._dbs:
                for table in PRICE_TABLES:
                    try:
                        rows = conn.execute(f"SELECT * FROM {table}").fetchall()
                        names = [
                            d[0] for d in conn.execute(f"SELECT * FROM {table} LIMIT 0").description
                        ]
                    except sqlite3.OperationalError:
                        continue
                    keep = [
                        r for r in rows if "cik" not in names or r[names.index("cik")] in wanted
                    ]
                    if keep:
                        marks = ", ".join("?" for _ in names)
                        with store.conn:
                            store.conn.executemany(
                                f"INSERT OR IGNORE INTO {table} ({', '.join(names)}) VALUES ({marks})",
                                keep,
                            )

        async def risk_free(self, day: date):
            body = self._body(like="%series_id=DGS10%")
            if body is None:
                return None
            found = value_on(parse_observations(json.loads(body)), day)
            return (found[0], found[1] / 100) if found else None

    return _GoldenData


def GoldenData(folder: Path):  # noqa: N802 - a factory that reads like a class
    return _golden_data_class()(folder)


# --- checks -----------------------------------------------------------------------------------


def check_numbers(results: list[Result], hand_checked: list[dict[str, Any]]) -> list[str]:
    """Every checked number within 0.5% (exact for share counts and dates). Unchecked drafts
    are skipped."""
    by_ticker = {r.ticker: r for r in results}
    problems = []
    for entry in hand_checked:
        if not entry.get("checked"):
            continue
        ticker, name, want = str(entry["ticker"]), str(entry["field"]), entry["value"]
        got = by_ticker.get(ticker, Result(ticker, "missing")).numbers.get(name)
        if got is None:
            problems.append(f"{ticker} {name}: no value (hand-checked {want})")
        elif name in EXACT or isinstance(want, str):
            if str(got) != str(want) and not (
                isinstance(got, float) and isinstance(want, int | float) and got == want
            ):
                problems.append(f"{ticker} {name}: {got} (hand-checked {want}, must match exactly)")
        elif want == 0:
            if got != 0:
                problems.append(f"{ticker} {name}: {got} (hand-checked 0)")
        elif abs(got - want) / abs(want) > TOLERANCE:
            problems.append(
                f"{ticker} {name}: {got:,.6g} vs hand-checked {want:,.6g} "
                f"({(got - want) / abs(want):+.2%}, limit 0.5%)"
            )
    return problems


HARD_CASES = {
    "bank": lambda f: f["financial_class"] == "bank",
    "insurer": lambda f: f["financial_class"] == "insurer",
    "reit": lambda f: f["financial_class"] == "reit",
    "utility": lambda f: f["sector"] == "Utilities",
    "negative_fcf": lambda f: f["free_cash_flow"] is not None and f["free_cash_flow"] < 0,
    "negative_book_value": lambda f: f["total_equity"] is not None and f["total_equity"] < 0,
    "recent_split": lambda f: f["recent_split"],
    "multi_class": lambda f: f["share_classes"] > 1 or f["cover_shares"] is not None,
    "digits_in_name": lambda f: any(ch.isdigit() for ch in f["name"] or ""),
    "exhibit_13": lambda f: f["exhibit_13"],
    "january_fiscal_year": lambda f: f["fiscal_year_end"].startswith("01"),
    "restatement": lambda f: "restatement" in f["red_flags"] or "going_concern" in f["red_flags"],
}


def check_cases(results: list[Result], tickers: list[dict[str, Any]]) -> list[str]:
    """Companies that no longer show the hard case they were chosen for, so they can be
    swapped (design item 40). A case with no automatic test is listed for a manual look."""
    by_ticker = {r.ticker: r for r in results}
    out = []
    for t in tickers:
        result = by_ticker.get(str(t["ticker"]))
        for case in t.get("cases") or []:
            test = HARD_CASES.get(case)
            if result is None or not result.facts:
                continue
            if test is None:
                out.append(f"{t['ticker']}: '{case}' has no automatic test; check it by hand")
            elif not test(result.facts):
                out.append(f"{t['ticker']}: no longer shows '{case}'; consider swapping it")
    return out


def compare(results: list[Result], last: dict[str, Any] | None) -> list[str]:
    """Every rating, score and bear/base/bull value that changed since last_run.json."""
    if not last:
        return ["no last_run.json yet: review these results, then run `eval golden --update`"]
    changes = []
    for r in results:
        before = (last.get("results") or {}).get(r.ticker)
        if before is None:
            changes.append(f"{r.ticker}: new in the golden set")
            continue
        for key in COMPARED:
            if before.get(key) != getattr(r, key):
                changes.append(f"{r.ticker} {key}: {before.get(key)} -> {getattr(r, key)}")
    return changes


def last_run_json(results: list[Result], as_of: datetime) -> str:
    from tearsheet import ENGINE_VERSION, METHOD_CODE_VERSION

    return json.dumps(
        {
            "as_of": as_of.isoformat(),
            "engine_version": ENGINE_VERSION,
            "method_code_version": METHOD_CODE_VERSION,
            "results": {r.ticker: r.rated() | {"status": r.status} for r in results},
        },
        indent=2,
        sort_keys=True,
    )


def draft_checks(results: list[Result]) -> str:
    """Candidate hand checks from this run's numbers, marked `checked: false`. Liam compares
    each with the filing on EDGAR, corrects any that differ, and sets `checked: true`."""
    picks = (
        "revenue",
        "net_income",
        "total_assets",
        "total_equity",
        "diluted_shares",
        "period_end",
    )
    entries = []
    for r in results:
        for name in picks:
            if name in r.numbers:
                entries.append(
                    {"ticker": r.ticker, "field": name, "value": r.numbers[name], "checked": False}
                )
    return yaml.safe_dump({"checks": entries}, sort_keys=False)


# --- the live download (Liam's step) ----------------------------------------------------------


async def freeze(store: Path, tickers: list[dict[str, Any]], settings, progress=print) -> datetime:
    """Download every input once, live, into the golden store, with no AI calls and no
    prediction logging. Re-running it fetches only what is missing. Returns the freeze date."""
    from tearsheet.db import open_database
    from tearsheet.http import HttpClient
    from tearsheet.methodology import load
    from tearsheet.pipeline import Run, new_run_id
    from tearsheet.rawstore import RawStore
    from tearsheet.sources import LiveData

    paths = config.Paths(store).ensure()
    database = open_database(paths.db)
    now = datetime.now(UTC)
    try:
        rawstore = RawStore(paths.raw, database.conn)
        for n, t in enumerate(tickers, start=1):
            run_id = new_run_id(now)
            async with HttpClient(
                rawstore,
                run_id,
                settings=settings,
                sec_user_agent=config.sec_user_agent(settings),
                massive_key=config.get_key("massive"),
            ) as http:
                data = LiveData(http, rawstore, database.conn, fred_key=config.get_key("fred"))
                run = Run(
                    database.conn,
                    data,
                    None,
                    load(),
                    mode="full",
                    now=now,
                    out_dir=None,
                    run_id=run_id,
                    rawstore=rawstore,
                )
                try:
                    result = await run.run(str(t["ticker"]))
                    progress(f"  {n:2d}/{len(tickers)} {t['ticker']}: {result.status}")
                except Exception as exc:  # noqa: BLE001 - reported; the rest still download
                    progress(f"  {n:2d}/{len(tickers)} {t['ticker']}: failed ({exc})")
    finally:
        database.close()
    return now
