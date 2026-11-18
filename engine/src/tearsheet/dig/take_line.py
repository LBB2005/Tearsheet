"""Dig deeper's take line (Phase 3): the Watchlist's "Write takes" writes a take on each of its
companies, one after another.

It is the report line (batch.ReportLine) with companies to take instead of reports to write: it
is kept in its own settings row, it pauses for the same reasons (the plan's usage limit and its
80% windows, a sign-out, no AI tool, Tearsheet quitting), and a take that failed is written again
first on Carry on. A take never resumes part-way, so an entry's `run_id` holds its take's id only
while it is written. The server starts a take only when nothing else runs and the report line
isn't going (server._take_line_loop).

The line leaves out a company with a take from the last TAKE_DAYS days, one with no report to
dig from, and one already in the line."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterable
from datetime import datetime, timedelta
from typing import Any

from tearsheet.batch import REOPENED, Entry, ReportLine, Skip, _day, _plural
from tearsheet.data.membership import Holdings
from tearsheet.dig.target import NoReport, target

SETTING = "take_line"
TAKE_DAYS = 7


def newest_takes(conn: sqlite3.Connection) -> dict[int, str]:
    """Each company's newest take time (ISO)."""
    return dict(conn.execute("SELECT cik, MAX(created_at) FROM dig_takes GROUP BY cik").fetchall())


class TakeLine(ReportLine):
    def plan_ciks(
        self,
        conn: sqlite3.Connection,
        ciks: Iterable[int],
        *,
        holdings: Holdings,
        now: datetime,
    ) -> tuple[list[Entry], list[Skip]]:
        """The companies to take, in the order given. Nothing changes: `add` takes them."""
        entries: list[Entry] = []
        skipped: list[Skip] = []
        taken = self._taken()
        newest = newest_takes(conn)
        since = now - timedelta(days=TAKE_DAYS)
        for cik in ciks:
            ticker = holdings.tickers_of(cik)[0] if holdings.has(cik) else str(cik)
            if any(e.cik == cik for e in entries):
                skipped.append(Skip(ticker, f"{ticker} is listed twice.", "twice"))
                continue
            if cik in taken:
                skipped.append(Skip(ticker, f"{ticker} is already in the line.", "in_line"))
                continue
            try:
                t = target(conn, cik, holdings)
            except NoReport:
                skipped.append(
                    Skip(ticker, f"{ticker} has no report to write a take from.", "no_report")
                )
                continue
            at = newest.get(cik)
            if at is not None and datetime.fromisoformat(at) >= since:
                day = _day(datetime.fromisoformat(at))
                skipped.append(Skip(t.ticker, f"{t.ticker} has a take from {day}.", "recent"))
                continue
            entries.append(Entry(t.ticker, t.name, cik, False))
        return entries, skipped

    @staticmethod
    def ended(done: dict[str, Any]) -> dict[str, Any]:
        """A take_done note as the line's ending: saved, cancelled or failed. A take never
        resumes: one that stopped is written again."""
        if done.get("saved"):
            how = "ready"
        elif done.get("code") == "CANCELLED":
            how = "cancelled"
        else:
            how = "failed"
        return {
            "how": how,
            "code": done.get("code"),
            "message": done.get("message"),
            "reset_at": done.get("reset_at"),
            "resumable": False,
        }

    @classmethod
    def loads(cls, text: str | None) -> TakeLine:
        """As the report line comes back after a quit, with the unfinished take dropped (it is
        written again) and the pause in takes' words."""
        line = super().loads(text)
        for entry in line.waiting:
            entry.run_id = entry.outcome = entry.code = entry.message = entry.resumable = None
        if line.paused is not None and line.paused.code == REOPENED:
            n = len(line.waiting)
            line.paused.message = (
                f"{_plural(n, 'take was', 'takes were')} waiting when Tearsheet closed."
            )
        return line  # type: ignore[return-value]
