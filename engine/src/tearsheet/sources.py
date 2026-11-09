"""Where a run's inputs come from (Technical Plan §3 steps 1-2).

`LiveData` downloads through the one HTTP client and the raw store. `StoredData` reads the
downloads already in a data folder's raw store, with no network, for offline checks of the
code steps (the Phase 0 SEC and Massive folders hold a whole sector's inputs).
"""

from __future__ import annotations

import gzip
import json
import sqlite3
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Protocol

from tearsheet.data import sec as sec_data
from tearsheet.data.membership import Refreshed, load_bundled
from tearsheet.data.prices import FIRST_FILL_MONTHS, SPY_CIK, SPY_FILL_YEARS, PriceStore
from tearsheet.resolve import sec_ticker_map, ticker_for


@dataclass(frozen=True)
class Doc:
    role: str  # "10-K", "10-Q", ...
    form: str
    accession: str
    url: str
    index_url: str
    filed: date
    body: bytes
    exhibit_13: bytes | None = None


class DataSource(Protocol):
    async def sec_tickers(self) -> dict[str, int]: ...
    async def holdings(self, sec_tickers: dict[str, int], *, today: date) -> Refreshed: ...
    async def submissions(self, cik: int) -> dict[str, Any]: ...
    async def company_facts(self, cik: int) -> dict[str, Any]: ...
    async def filing_documents(self, cik: int, *, today: date) -> list[Doc]: ...
    async def fill_prices(
        self, store: PriceStore, members: dict[int, str], *, end: date
    ) -> None: ...
    async def risk_free(self, day: date) -> tuple[date, float] | None: ...
    def request_counts(self) -> dict[str, int]: ...


def _report_docs(filings: list[sec_data.Filing], body_of, exhibits_of) -> list[Doc]:
    out = []
    latest_k = sec_data.latest(filings, "10-K")
    chosen_by_role = {
        "10-K": latest_k,
        "10-Q": sec_data.latest(filings, "10-Q"),
        "10-K prior": sec_data.previous(filings, latest_k) if latest_k else None,
    }
    for role, chosen in chosen_by_role.items():
        form = chosen.form if chosen else role
        if chosen is None or not chosen.primary_document:
            continue
        url = chosen.url(chosen.primary_document)
        body = body_of(url)
        if body is None:
            continue
        out.append(
            Doc(
                role,
                form,
                chosen.accession,
                url,
                chosen.index_url,
                chosen.filed,
                body,
                exhibits_of(chosen) if form == "10-K" else None,
            )
        )
    return out


def _release_filings(
    filings: list[sec_data.Filing], today: date
) -> list[tuple[str, sec_data.Filing]]:
    """The latest earnings 8-K, and the press-release 8-Ks (item 7), by role."""
    earnings = sec_data.latest(filings, "8-K", item=sec_data.EARNINGS_ITEM)
    out = [("earnings 8-K", earnings)] if earnings else []
    out += [
        (f"press {f.accession}", f)
        for _, f in sec_data.press_release_filings(filings, today, exclude=earnings)
    ]
    return out


# --- stored (offline) ----------------------------------------------------------------------


class StoredData:
    """Inputs from data folders already filled by earlier downloads, with no network."""

    def __init__(self, folders: list[Path], *, risk_free: float, risk_free_date: date):
        self._dbs = [(f, sqlite3.connect(f / "tearsheet.sqlite")) for f in folders]
        self._risk_free = (risk_free_date, risk_free)

    def _body(self, url: str | None = None, *, like: str | None = None) -> bytes | None:
        for folder, conn in self._dbs:
            if url is not None:
                row = conn.execute(
                    "SELECT raw_hash FROM fetch_log WHERE request_key = ? ORDER BY fetched_at DESC LIMIT 1",
                    (url,),
                ).fetchone()
            else:
                row = conn.execute(
                    "SELECT raw_hash FROM fetch_log WHERE request_key LIKE ? ORDER BY fetched_at DESC LIMIT 1",
                    (like,),
                ).fetchone()
            if row:
                h = row[0]
                return gzip.decompress((folder / "raw" / h[:2] / f"{h}.gz").read_bytes())
        return None

    async def sec_tickers(self) -> dict[str, int]:
        body = self._body(sec_data.TICKERS_URL)
        return sec_ticker_map(json.loads(body)) if body else {}

    async def holdings(self, sec_tickers: dict[str, int], *, today: date) -> Refreshed:
        bundled = load_bundled()
        return Refreshed(bundled, "Stored inputs: the bundled S&P 500 list was used.")

    async def submissions(self, cik: int) -> dict[str, Any]:
        body = self._body(sec_data.SUBMISSIONS_URL.format(cik=cik))
        return json.loads(body) if body else {}

    async def cover_share_counts(self, cik: int, *, today: date):
        """Per-class share counts from the latest stored 10-Q or 10-K cover page."""
        subs = await self.submissions(cik)
        filing = sec_data.latest_report(
            sec_data.filings_from(subs.get("filings", {}).get("recent", {}), cik)
        )
        body = self._body(filing.url(filing.primary_document)) if filing else None
        return (sec_data.cover_share_counts(body), filing.accession) if body else ([], None)

    async def company_facts(self, cik: int) -> dict[str, Any]:
        body = self._body(sec_data.COMPANY_FACTS_URL.format(cik=cik))
        if body is None:
            raise LookupError(f"no stored company facts for CIK {cik}")
        return json.loads(body)

    async def report_facts(self, filing: sec_data.Filing) -> dict[str, Any]:
        """A stored 10-Q's or 10-K's own inline XBRL numbers, in the company-facts shape."""
        body = self._body(filing.url(filing.primary_document))
        if body is None:
            raise LookupError(f"filing {filing.accession} isn't stored")
        return sec_data.inline_facts(
            body, accession=filing.accession, form=filing.form, filed=filing.filed
        )

    async def filing_documents(
        self, cik: int, *, today: date, predecessors: tuple[int, ...] = ()
    ) -> list[Doc]:
        filings = []
        for c in (cik, *predecessors):
            subs = await self.submissions(c)
            filings += sec_data.filings_from(subs.get("filings", {}).get("recent", {}), c)
        # A stored list can be newer than the run date: a run never uses a later filing.
        filings = [f for f in filings if f.filed <= today]

        def exhibits(f: sec_data.Filing) -> bytes | None:
            """A 10-K's stored Exhibit 13 (the annual report some companies file it in)."""
            index = self._body(f.index_url)
            if index is None:
                return None
            for entry in sec_data.parse_filing_index(index.decode("utf-8", errors="replace")):
                if sec_data.EX_13.match(entry.doc_type):
                    return self._body(entry.url)
            return None

        docs = _report_docs(filings, lambda url: self._body(url), exhibits)
        for role, filing in _release_filings(filings, today):
            index = self._body(filing.index_url)
            if index is None:
                continue
            entries = sec_data.parse_filing_index(index.decode("utf-8", errors="replace"))
            wanted = [e for e in entries if sec_data.EX_99_1.match(e.doc_type)]
            if not wanted and role.startswith("press "):
                wanted = [e for e in entries if e.doc_type == filing.form]
            for entry in wanted[:1]:
                body = self._body(entry.url)
                if body is not None:
                    docs.append(
                        Doc(
                            role,
                            "8-K",
                            filing.accession,
                            entry.url,
                            filing.index_url,
                            filing.filed,
                            body,
                        )
                    )
        return docs

    async def fill_prices(self, store: PriceStore, members: dict[int, str], *, end: date) -> None:
        tickers = {ticker_for("massive", t): (cik, "") for cik, t in members.items()}
        tickers["SPY"] = (SPY_CIK, "")
        for massive_ticker, (cik, share_class) in tickers.items():
            for _, conn in self._dbs:
                pattern = f"https://api.massive.com/v2/aggs/ticker/{massive_ticker}/range/1/day/%"
                for (key,) in conn.execute(
                    "SELECT DISTINCT request_key FROM fetch_log WHERE request_key LIKE ?",
                    (pattern,),
                ):
                    bars = self._body(key)
                    if bars:
                        store.store_bars(cik, share_class, json.loads(bars), raw_hash="stored")
            dividends = self._body(
                like=f"https://api.massive.com/v3/reference/dividends?%ticker={massive_ticker}&%"
            )
            if dividends:
                store.store_dividends(cik, share_class, json.loads(dividends))
        for _folder, conn in self._dbs:
            for (key,) in conn.execute(
                "SELECT DISTINCT request_key FROM fetch_log WHERE request_key LIKE 'https://api.massive.com/v3/reference/splits%'"
            ):
                body = self._body(key)
                if body:
                    store.store_splits(json.loads(body), tickers)

    async def risk_free(self, day: date) -> tuple[date, float] | None:
        return self._risk_free

    async def form4_trades(self, cik: int, *, today: date) -> list[tuple[str, date, str]]:
        subs = await self.submissions(cik)
        filings = sec_data.filings_from(subs.get("filings", {}).get("recent", {}), cik)
        trades = []
        for f in filings:
            if f.form != "4":
                continue
            body = self._body(f.url(sec_data.form4_xml_name(f.primary_document)))
            if body is not None:
                trades += sec_data.form4_trades(body, f.filed)
        return trades

    async def peer_documents(
        self,
        ciks: list[int],
        *,
        today: date,
        predecessors: dict[int, tuple[int, ...]] | None = None,
    ) -> list[Doc]:
        out = []
        for cik in ciks:
            filings = []
            for c in (cik, *(predecessors or {}).get(cik, ())):
                subs = await self.submissions(c)
                filings += sec_data.filings_from(subs.get("filings", {}).get("recent", {}), c)
            chosen = sec_data.latest([f for f in filings if f.filed <= today], "10-K")
            if chosen is None:
                continue
            url = chosen.url(chosen.primary_document)
            body = self._body(url)
            if body is not None:
                out.append(
                    Doc(
                        f"peer {cik}",
                        "10-K",
                        chosen.accession,
                        url,
                        chosen.index_url,
                        chosen.filed,
                        body,
                    )
                )
        return out

    def request_counts(self) -> dict[str, int]:
        return {}


# --- live ----------------------------------------------------------------------------------


class LiveData:
    """Downloads through the run's HTTP client (SEC, Massive, FRED, iShares)."""

    def __init__(self, http, rawstore, conn: sqlite3.Connection, *, fred_key: str | None):
        from tearsheet.data.sec import SECClient

        self.http = http
        self.rawstore = rawstore
        self.conn = conn
        self.sec = SECClient(http, rawstore)
        self._fred_key = fred_key

    async def sec_tickers(self) -> dict[str, int]:
        return sec_ticker_map(await self.sec.company_tickers())

    async def holdings(self, sec_tickers: dict[str, int], *, today: date) -> Refreshed:
        from tearsheet.data.membership import shipped

        return shipped(self.conn)

    async def submissions(self, cik: int) -> dict[str, Any]:
        return await self.sec.submissions(cik)

    async def company_facts(self, cik: int) -> dict[str, Any]:
        return (await self.sec.company_facts(cik))[1]

    async def report_facts(self, filing: sec_data.Filing) -> dict[str, Any]:
        """A 10-Q's or 10-K's own inline XBRL numbers (its primary document, downloaded once
        and stored like every filing), in the company-facts shape."""
        return sec_data.inline_facts(
            await self.sec.primary_document(filing),
            accession=filing.accession,
            form=filing.form,
            filed=filing.filed,
        )

    async def cover_share_counts(self, cik: int, *, today: date):
        """Per-class share counts from the latest 10-Q or 10-K cover page (one document,
        stored like every filing, so it is downloaded once)."""
        filings = await self.sec.filings(cik, since=today - timedelta(days=400))
        filing = sec_data.latest_report(filings)
        if filing is None:
            return [], None
        return sec_data.cover_share_counts(
            await self.sec.primary_document(filing)
        ), filing.accession

    async def filing_documents(
        self, cik: int, *, today: date, predecessors: tuple[int, ...] = ()
    ) -> list[Doc]:
        since = today - timedelta(days=sec_data.FILING_HISTORY_DAYS)
        filings = await self.sec.filings(cik, since=since)
        for old in predecessors:
            filings += await self.sec.filings(old, since=since)
        bodies: dict[str, bytes] = {}
        latest_k = sec_data.latest(filings, "10-K")
        for form, chosen in (
            ("10-K", latest_k),
            ("10-Q", sec_data.latest(filings, "10-Q")),
            ("10-K", sec_data.previous(filings, latest_k) if latest_k else None),
        ):
            if chosen is None:
                continue
            docs = await self.sec.filing_documents(
                form, chosen, exhibit=sec_data.EX_13 if form == "10-K" else None
            )
            for d in docs:
                bodies[d.url] = self.rawstore.get(d.raw_hash)

        def exhibits(f: sec_data.Filing) -> bytes | None:
            for url, body in bodies.items():
                if f.folder in url and url != f.url(f.primary_document):
                    return body
            return None

        docs = _report_docs(filings, bodies.get, exhibits)
        for role, filing in _release_filings(filings, today):
            fetched = await self.sec.filing_documents(
                role, filing, primary=False, exhibit=sec_data.EX_99_1
            )
            if not fetched and role.startswith("press "):
                fetched = await self.sec.filing_documents(role, filing, primary=True)
            for d in fetched[:1]:
                docs.append(
                    Doc(
                        role,
                        "8-K",
                        filing.accession,
                        d.url,
                        filing.index_url,
                        filing.filed,
                        self.rawstore.get(d.raw_hash),
                    )
                )
        return docs

    async def fill_prices(self, store: PriceStore, members: dict[int, str], *, end: date) -> None:
        """Prices up to `end` for the members and SPY. A stock with no prices gets its own
        window (two calls). Stocks that only need new sessions get them from the all-stocks
        summary when that needs fewer calls (data/market.py), which also brings every other
        stored S&P 500 company up to date; any the summary leaves out get their own calls."""
        from tearsheet.data import market
        from tearsheet.data.prices import (
            fetch_company,
            fetch_splits,
            needed_start,
            sessions_between,
        )

        tickers = {ticker_for("massive", t): (cik, "") for cik, t in members.items()}
        tickers["SPY"] = (SPY_CIK, "")
        starts: dict[str, date] = {}
        for massive_ticker, (cik, share_class) in tickers.items():
            months = SPY_FILL_YEARS * 12 if cik == SPY_CIK else FIRST_FILL_MONTHS
            start = needed_start(store, cik, share_class, end, months=months)
            if start is not None:
                starts[massive_ticker] = start
        if not starts:
            return
        latest = store.latest_dates()
        extend = {t: s for t, s in starts.items() if tickers[t] in latest}
        days = sorted({d for s in extend.values() for d in sessions_between(s, end)})
        if days and market.summary_is_cheaper(len(days), len(extend)):
            # One ticker per company: the one this run asked for wins over the stored list's
            # (a company with two share classes, such as Alphabet, never gets both).
            asked = {tickers[t] for t in extend}
            stored = {t: k for t, k in self._stored_members(latest).items() if k not in asked}
            wanted = {**stored, **{t: tickers[t] for t in extend}}
            through = await market.top_up(self.http, self.rawstore, store, wanted, days)
            for t in extend:
                reached = through.get(t)
                if reached is not None and reached >= end:
                    del starts[t]
                elif reached is not None:
                    starts[t] = reached + timedelta(days=1)
        if not starts:
            return
        # Splits first, so a stored close always has its splits beside it. The span includes
        # `end`: a split on the one new session must not be missed.
        rest = {t: tickers[t] for t in starts}
        await fetch_splits(self.http, store, rest, start=min(starts.values()), end=end)
        for massive_ticker, start in starts.items():
            cik, share_class = tickers[massive_ticker]
            await fetch_company(
                self.http, store, cik, share_class, massive_ticker, start=start, end=end
            )

    def _stored_members(self, latest: dict[tuple[int, str], date]) -> dict[str, tuple[int, str]]:
        """Every S&P 500 company (rated class) and SPY that already has stored prices."""
        from tearsheet.data.market import wanted_members
        from tearsheet.data.membership import stored_or_bundled

        everyone = wanted_members(stored_or_bundled(self.conn))
        return {t: key for t, key in everyone.items() if key in latest}

    async def risk_free(self, day: date) -> tuple[date, float] | None:
        from tearsheet.data.fred import fetch_series, value_on

        if not self._fred_key:
            return None
        series = await fetch_series(
            self.http, "DGS10", api_key=self._fred_key, start=day - timedelta(days=30)
        )
        found = value_on(series, day)
        return (found[0], found[1] / 100) if found else None

    async def peer_documents(
        self,
        ciks: list[int],
        *,
        today: date,
        predecessors: dict[int, tuple[int, ...]] | None = None,
    ) -> list[Doc]:
        out = []
        since = today - timedelta(days=sec_data.FILING_HISTORY_DAYS)
        for cik in ciks:
            filings = await self.sec.filings(cik, since=since)
            for old in (predecessors or {}).get(cik, ()):
                filings += await self.sec.filings(old, since=since)
            chosen = sec_data.latest(filings, "10-K")
            if chosen is None:
                continue
            for d in await self.sec.filing_documents("peer 10-K", chosen, exhibit=sec_data.EX_13):
                if d.doc_type == "10-K":
                    out.append(
                        Doc(
                            f"peer {cik}",
                            "10-K",
                            chosen.accession,
                            d.url,
                            chosen.index_url,
                            chosen.filed,
                            self.rawstore.get(d.raw_hash),
                        )
                    )
        return out

    async def form4_trades(self, cik: int, *, today: date) -> list[tuple[str, date, str]]:
        """Form 4 trades: the last 6 months, plus older filings in the purchase months when a
        recent purchase appears (the routine test, item 25)."""
        recent_cut = today - timedelta(days=sec_data.FORM4_RECENT_DAYS)
        filings = await self.sec.filings(
            cik, since=recent_cut - timedelta(days=sec_data.FORM4_HISTORY_DAYS)
        )
        recent = [f for f in filings if f.form == "4" and f.filed >= recent_cut]
        trades = [
            t
            for f, body in await self.sec.form4_documents(recent)
            for t in sec_data.form4_trades(body, f.filed)
        ]
        months = {d.month for _, d, code in trades if code == "P"}
        if months:
            older = [
                f
                for f in filings
                if f.form == "4"
                and f.filed < recent_cut
                and sec_data.filed_for_months(f.filed, months)
            ]
            trades += [
                t
                for f, body in await self.sec.form4_documents(older)
                for t in sec_data.form4_trades(body, f.filed)
            ]
        return trades

    async def macro(self, day: date) -> dict[str, tuple[str, float, date]]:
        """The FRED series for section 8: rates as percents, and 12-month changes for the
        price and dollar indexes."""
        from tearsheet.data.fred import fetch_series, value_on

        if not self._fred_key:
            return {}
        out: dict[str, tuple[str, float, date]] = {}
        for series_id, change in (
            ("UNRATE", False),
            ("A191RL1Q225SBEA", False),
            ("DGS10", False),
            ("CPIAUCSL", True),
            ("DTWEXBGS", True),
        ):
            series = await fetch_series(
                self.http, series_id, api_key=self._fred_key, start=day - timedelta(days=500)
            )
            latest = value_on(series, day)
            if latest is None:
                continue
            if change:
                before = value_on(series, latest[0] - timedelta(days=365))
                if before is None or not before[1]:
                    continue
                out[series_id] = ("percent", latest[1] / before[1] - 1, latest[0])
            else:
                out[series_id] = ("percent", latest[1] / 100, latest[0])
        return out

    async def fetch_article(self, url: str, allowlist):
        from tearsheet.data.articles import fetch_article

        return await fetch_article(self.http, url, allowlist)

    def request_counts(self) -> dict[str, int]:
        return {f"{svc}:{kind}": n for (svc, kind), n in self.http.requests.items()}
