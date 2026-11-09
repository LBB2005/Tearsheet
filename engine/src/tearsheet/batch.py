"""Several reports, one after another: the line (Liam's pick, 7 Nov 2026).

The app hands the engine a list of companies, and the engine writes them one at a time. Each is
an ordinary full report, so its numbers, citations and checks are the same as a single report's,
and so is the prediction log's rule: a company's first rated report in 30 days is its official
prediction. `plan` says which companies will make one before anything starts.

The line is kept in the settings table, so quitting Tearsheet doesn't lose it. When the app opens
again the line is paused, and it starts only when Liam says carry on. A problem that would stop
every report after it (the plan's usage limit, a sign-out, SEC blocking, the safety check, no AI
tool) pauses the line, and Resume carries on with the stopped report and then the rest. A problem
with one company marks that one stopped, and the line moves on.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import asdict, dataclass, field, fields
from datetime import datetime
from typing import Any

from tearsheet.predictions import slot_open
from tearsheet.resolve import HoldingsView, NotCovered, resolve

# The most companies waiting at a time: 10 reports is about 400 AI calls on the plan.
MAX_WAITING = 10
# The settings row the line is kept in (an internal value, not a user setting).
SETTING = "report_line"
# Problems that would stop every report after the one that met them.
PAUSE_CODES = frozenset(
    {"USAGE_LIMIT", "AUTH_EXPIRED", "SEC_BLOCKED", "LOCKDOWN_FAILED", "NO_TOOL", "AI_UNAVAILABLE"}
)
# The pause a line comes back with when Tearsheet opens again.
REOPENED = "REOPENED"
# Pauses the server sets (pause()) when the safety check on a never-checked writing tool is
# stopped, or can't finish (first-run design §5). A full pass carries the line on. A failed
# check needs no code of its own: its block ends the next report with LOCKDOWN_FAILED.
SAFETY_CHECK_STOPPED = "SAFETY_CHECK_STOPPED"
SAFETY_CHECK_UNFINISHED = "SAFETY_CHECK_UNFINISHED"
SAFETY_PAUSES = frozenset({SAFETY_CHECK_STOPPED, SAFETY_CHECK_UNFINISHED})


@dataclass
class Entry:
    """One company in the line."""

    ticker: str
    name: str
    cik: int
    # Whether a rated report would be its official prediction (no official one in 30 days).
    official: bool
    run_id: str | None = None
    # Once finished: ready, stopped (the report so far was saved), failed or cancelled.
    outcome: str | None = None
    report_id: str | None = None
    code: str | None = None
    message: str | None = None

    def item(self) -> dict[str, Any]:
        return {k: v for k, v in asdict(self).items() if k != "cik"}


@dataclass
class Pause:
    code: str
    message: str
    reset_at: str | None = None
    fix_command: str | None = None
    # The stopped report that Resume carries on with, if there is one.
    run_id: str | None = None


@dataclass
class Skip:
    """A company left out of the line, and why, in plain words."""

    query: str
    reason: str


def _entry(data: dict[str, Any]) -> Entry:
    names = {f.name for f in fields(Entry)}
    return Entry(**{k: v for k, v in data.items() if k in names})


def _plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


@dataclass
class ReportLine:
    waiting: list[Entry] = field(default_factory=list)
    writing: Entry | None = None
    finished: list[Entry] = field(default_factory=list)
    paused: Pause | None = None
    # Raised by clear(), so a report that ends after Cancel all isn't counted in a new line.
    round: int = 0

    # --- what is in it ----------------------------------------------------------------------

    def idle(self) -> bool:
        """Nothing waiting, nothing being written and no pause: a new line may start afresh."""
        return not self.waiting and self.writing is None and self.paused is None

    def _taken(self) -> set[int]:
        return {e.cik for e in self.waiting} | ({self.writing.cik} if self.writing else set())

    def plan(
        self,
        queries: list[str],
        *,
        holdings: HoldingsView,
        tickers: dict[str, int],
        aliases: dict[str, int],
        conn: sqlite3.Connection,
        now: datetime,
    ) -> tuple[list[Entry], list[Skip]]:
        """Each query looked up the way step 1 looks it up, on the bundled S&P 500 list. Nothing
        changes: `add` takes the entries."""
        entries: list[Entry] = []
        skipped: list[Skip] = []
        taken = self._taken()
        room = MAX_WAITING - len(self.waiting)
        for raw in queries:
            query = raw.strip()
            if not query:
                continue
            try:
                found = resolve(query, tickers, holdings, aliases=aliases)
            except NotCovered as exc:
                reason = str(exc)
                if exc.candidates:
                    reason += " Did you mean " + " or ".join(exc.candidates) + "?"
                skipped.append(Skip(query, reason))
                continue
            ticker = found.rated_ticker
            if found.cik in taken:
                listed = any(e.cik == found.cik for e in entries)
                skipped.append(
                    Skip(
                        query,
                        f"{ticker} is listed twice."
                        if listed
                        else f"{ticker} is already in the line.",
                    )
                )
                continue
            if len(entries) >= room:
                skipped.append(
                    Skip(
                        query,
                        f"The line holds {MAX_WAITING} at a time. Add {ticker} once some have finished.",
                    )
                )
                continue
            taken.add(found.cik)
            entries.append(Entry(ticker, found.name, found.cik, slot_open(conn, found.cik, now)))
        return entries, skipped

    def add(self, entries: list[Entry]) -> None:
        if self.idle():
            self.finished = []  # a new line: the last one's Done list is put away
        self.waiting.extend(entries)

    def take_next(self) -> Entry | None:
        if not self.waiting:
            return None
        self.writing = self.waiting.pop(0)
        return self.writing

    def end(self, entry: Entry, how: dict[str, Any]) -> None:
        """A report in the line has ended. A problem that would stop the rest pauses the line."""
        entry.outcome = how.get("how", "failed")
        entry.report_id = how.get("report_id")
        entry.code = how.get("code")
        entry.message = how.get("message")
        if self.writing is entry:
            self.writing = None
        self.finished.append(entry)
        if entry.outcome in ("stopped", "failed") and entry.code in PAUSE_CODES:
            self.paused = Pause(
                entry.code,
                entry.message or "The report stopped.",
                reset_at=how.get("reset_at"),
                fix_command=how.get("fix_command"),
                run_id=entry.run_id,
            )

    def resume(self, run_id: str) -> Entry | None:
        """Resume of the report that paused the line: it is written again, then the rest."""
        if self.paused is None or self.paused.run_id != run_id:
            return None
        entry = next((e for e in reversed(self.finished) if e.run_id == run_id), None)
        if entry is None:
            return None
        self.finished.remove(entry)
        entry.outcome = entry.report_id = entry.code = entry.message = None
        self.writing = entry
        self.paused = None
        return entry

    def pause(self, code: str, message: str) -> bool:
        """Pause the reports waiting, for a reason from outside the line (the safety check).
        Nothing changes when no report is waiting or a pause is already set, so a stopped
        report's Resume is never lost. Says whether the line was paused."""
        if not self.waiting or self.paused is not None:
            return False
        self.paused = Pause(code, message)
        return True

    def carry_on(self) -> None:
        """Go on with the companies still waiting (after Tearsheet opened again, or past a
        stopped report without resuming it)."""
        self.paused = None

    def remove(self, ticker: str) -> bool:
        before = len(self.waiting)
        self.waiting = [e for e in self.waiting if e.ticker != ticker]
        return len(self.waiting) < before

    def clear(self) -> None:
        """Cancel all: nothing waiting, and the report being written is no longer the line's."""
        self.waiting, self.writing, self.finished, self.paused = [], None, [], None
        self.round += 1

    # --- for the app ------------------------------------------------------------------------

    def state(self) -> dict[str, Any]:
        return {
            "waiting": [e.item() for e in self.waiting],
            "writing": self.writing.item() if self.writing else None,
            "finished": [e.item() for e in self.finished],
            "paused": asdict(self.paused) if self.paused else None,
            "limit": MAX_WAITING,
        }

    # --- kept in the settings table -------------------------------------------------------------

    def dumps(self) -> str:
        return json.dumps(
            {
                "waiting": [asdict(e) for e in self.waiting],
                "writing": asdict(self.writing) if self.writing else None,
                "finished": [asdict(e) for e in self.finished],
                "paused": asdict(self.paused) if self.paused else None,
            }
        )

    @classmethod
    def loads(cls, text: str | None) -> ReportLine:
        """The line as it was when Tearsheet closed. A report being written then starts again
        from the beginning, first in the line; a line with anything waiting comes back paused."""
        try:
            data = json.loads(text) if text else {}
        except ValueError:
            data = {}
        waiting = [_entry(e) for e in data.get("waiting") or []]
        writing = data.get("writing")
        if writing:
            waiting.insert(0, _entry({**writing, "run_id": None}))
        paused = data.get("paused")
        if not waiting and not paused:
            return cls()
        line = cls(waiting=waiting, finished=[_entry(e) for e in data.get("finished") or []])
        if paused and not writing:
            line.paused = Pause(**paused)
        else:
            line.paused = Pause(
                REOPENED,
                f"{_plural(len(waiting), 'report was', 'reports were')} waiting when Tearsheet closed.",
            )
        return line
