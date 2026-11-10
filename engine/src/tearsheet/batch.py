"""Several reports, one after another: the line (Liam's pick, 7 Nov 2026).

The app hands the engine a list of companies, and the engine writes them one at a time. Each is
an ordinary full report, so its numbers, citations and checks are the same as a single report's,
and so is the prediction log's rule: a company's first rated report in 30 days is its official
prediction. `plan` says which companies will make one before anything starts.

The line holds as many companies as Liam adds, up to the whole S&P 500 (8 Nov 2026: about 500
reports, 35 hours). A list may be pasted with commas, new lines or spaces between tickers, and
`plan` can leave out companies with a report from the last 30 days.

The line is kept in the settings table, so quitting Tearsheet doesn't lose it. When the app opens
again the line is paused, and it starts only when Liam says carry on. A problem that would stop
every report after it (the plan's usage limit, a sign-out, SEC blocking, the safety check, no AI
tool) pauses the line, and Resume carries on with the stopped report and then the rest. A problem
with one company marks that one stopped, and the line moves on.

The plan's usage limit is the one pause that ends by itself (Liam, 8 Nov 2026): the line waits
until the limit resets (`wait_until`, from the reset time the tool gave, or an hour when it gave
none), then resumes the stopped report and goes on. Liam's plan is also kept from running out
between reports: past 80% of its 5-hour window the line waits for that window to reset, so Liam
keeps the last 20%; past 80% of its weekly window the line asks him before it goes on, once a
week. A wait never survives a quit: the line comes back paused.
"""

from __future__ import annotations

import json
import re
import sqlite3
import statistics
from collections.abc import Iterable, Iterator
from dataclasses import asdict, dataclass, field, fields
from datetime import UTC, datetime, timedelta, tzinfo
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from tearsheet.predictions import WINDOW, slot_open
from tearsheet.resolve import HoldingsView, NotCovered, canonical_ticker, resolve

# The settings row the line is kept in (an internal value, not a user setting).
SETTING = "report_line"
# Problems that would stop every report after the one that met them.
PAUSE_CODES = frozenset(
    {"USAGE_LIMIT", "AUTH_EXPIRED", "SEC_BLOCKED", "LOCKDOWN_FAILED", "NO_TOOL", "AI_UNAVAILABLE"}
)
# The pause a line comes back with when Tearsheet opens again.
REOPENED = "REOPENED"
# The plan's 5-hour window is past USAGE_SHARE: the line waits for it to reset.
USAGE_HIGH = "USAGE_HIGH"
# The plan's weekly window is past USAGE_SHARE: the line asks Liam before it goes on.
USAGE_WEEK = "USAGE_WEEK"
USAGE_SHARE = 0.8
# A usage limit's wait runs a little past the reset time, so the plan has surely reset, and is
# never shorter than MIN_WAIT, so a reset time already gone can't make the line try again and
# again. A limit with no reset time is tried again after RETRY_AFTER.
RESET_MARGIN = timedelta(minutes=2)
MIN_WAIT = timedelta(minutes=5)
RETRY_AFTER = timedelta(hours=1)
# How long a carry on past the weekly 80% lasts when the tool gave no reset time.
WEEK = timedelta(days=7)
# The finished runs a typical report's time and AI calls are taken from (the latest ones).
TYPICAL_RUNS = 20
TYPICAL_MIN_RUNS = 3
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
    # When the line carries on by itself (ISO, UTC): a usage limit's reset, or the 5-hour
    # window's. None: it waits for Liam.
    wait_until: str | None = None
    # The plan's usage behind a USAGE_HIGH or USAGE_WEEK pause, 0 to 1; None when the tool only
    # warned, without a number.
    used: float | None = None


@dataclass
class Skip:
    """A company left out of the line, and why, in plain words. `kind` groups them on screen:
    unknown (not found), twice (listed twice), in_line (already waiting) or recent (a report
    from the last 30 days)."""

    query: str
    reason: str
    kind: str = "unknown"


@dataclass
class Reading:
    """One usage window of Liam's AI plan, as the tool last said: `window` is 5h or week, `used`
    0 to 1 (None when it only warned), `resets_at` ISO in UTC when it said."""

    window: str
    used: float | None
    resets_at: str | None = None
    warned: bool = False

    def high(self) -> bool:
        return self.used >= USAGE_SHARE if self.used is not None else self.warned


def _entry(data: dict[str, Any]) -> Entry:
    names = {f.name for f in fields(Entry)}
    return Entry(**{k: v for k, v in data.items() if k in names})


def _pause(data: dict[str, Any]) -> Pause:
    names = {f.name for f in fields(Pause)}
    return Pause(**{k: v for k, v in data.items() if k in names})


def _plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


def _day(at: datetime) -> str:
    """ "Nov 2", on Liam's calendar."""
    local = at.astimezone()
    return f"{local:%b} {local.day}"


# --- reset times -----------------------------------------------------------------------------

_MONTHS = {m: i for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split(), 1)}
_CLOCK = re.compile(
    r"(?:\b(?P<mon>[A-Za-z]{3,9})\.?\s+(?P<day>\d{1,2}),?\s+(?:at\s+)?)?"
    r"\b(?P<h>\d{1,2})(?::(?P<m>\d{2}))?\s*(?P<ap>am|pm)?\b"
    r"(?:\s*\((?P<tz>[A-Za-z_]+(?:/[A-Za-z_+\-]+)*)\))?",
    re.IGNORECASE,
)


def _aware(at: datetime) -> datetime:
    return at if at.tzinfo else at.replace(tzinfo=UTC)


def reset_moment(text: Any, now: datetime, *, local: tzinfo | None = None) -> datetime | None:
    """When a usage limit resets, from what the tool said: a time stamp, a Unix time, or words
    such as "3am", "3:40pm (Europe/London)" or "Nov 10, 3pm". A clock time already past today
    is tomorrow's. None when it can't be read."""
    if text is None or text == "":
        return None
    if isinstance(text, int | float) or (
        isinstance(text, str) and text.strip().isdigit() and len(text.strip()) >= 9
    ):
        try:
            return datetime.fromtimestamp(int(text), UTC)
        except (OverflowError, OSError, ValueError):
            return None
    words = str(text).strip()
    try:
        return _aware(datetime.fromisoformat(words.replace("Z", "+00:00"))).astimezone(UTC)
    except ValueError:
        pass
    found = _CLOCK.search(words)
    if not found:
        return None
    hour, minute, half = int(found["h"]), int(found["m"] or 0), (found["ap"] or "").lower()
    if half:
        if not 1 <= hour <= 12:
            return None
        hour = hour % 12 + (12 if half == "pm" else 0)
    elif hour > 23 or found["m"] is None:
        return None  # a bare number isn't a time
    if minute > 59:
        return None
    zone: tzinfo | None = local
    if found["tz"]:
        try:
            zone = ZoneInfo(found["tz"])
        except (ZoneInfoNotFoundError, ValueError):
            pass
    # With no zone given, the Mac's own: worked out on a plain local clock time and given its
    # offset last, so "3am" the morning after a clock change isn't an hour out.
    base = (
        now.astimezone(zone).replace(tzinfo=None) if zone else now.astimezone().replace(tzinfo=None)
    )
    month = _MONTHS.get((found["mon"] or "")[:3].lower())
    try:
        if month:
            at = datetime(base.year, month, int(found["day"]), hour, minute)
            if at < base - timedelta(days=180):
                at = at.replace(year=base.year + 1)
        else:
            at = base.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if at <= base:
                at += timedelta(days=1)
    except ValueError:  # "Nov 31", or 29 Feb in a year without it
        return None
    return (at.replace(tzinfo=zone) if zone else at.astimezone()).astimezone(UTC)


def _wait_until(reset: Any, now: datetime) -> str:
    at = reset_moment(reset, now)
    wait = max(at + RESET_MARGIN, now + MIN_WAIT) if at else now + RETRY_AFTER
    return wait.astimezone(UTC).isoformat()


# --- the plan's usage ------------------------------------------------------------------------


def _share(value: Any) -> float | None:
    try:
        used = float(value)
    except (TypeError, ValueError):
        return None
    return used / 100 if used > 1 else used


def _iso(value: Any) -> str | None:
    if value is None or value == "":
        return None
    at = reset_moment(value, datetime.now(UTC))
    return at.isoformat() if at else None


def _readings(info: dict[str, Any]) -> Iterator[Reading]:
    windows = info.get("windows")
    if isinstance(windows, list):  # Codex: each window, with how much is used
        for w in windows:
            if isinstance(w, dict) and w.get("window") in ("5h", "week"):
                yield Reading(w["window"], _share(w.get("used")), _iso(w.get("resets_at")))
        return
    kind = str(info.get("type") or "")
    window = "5h" if kind == "five_hour" else "week" if kind.startswith("seven_day") else None
    if window is None:
        return
    yield Reading(
        window,
        _share(info.get("utilization")),
        _iso(info.get("resets_at")),
        warned=info.get("status") == "allowed_warning",
    )


def usage_readings(rate_limits: Iterable[dict[str, Any] | None]) -> dict[str, Reading]:
    """The latest reading of each usage window from a run's AI calls, taken in call order:
    Claude Code's rate-limit events and Codex's rate-limit updates (ai/client.py's CallRecord)."""
    # Claude Code has several weekly windows (seven_day, seven_day_opus, seven_day_sonnet):
    # the latest reading of each, then the fullest of them stands for the week, so a low
    # model-only window read last can't hide a weekly window past 80%.
    latest: dict[tuple[str, str], Reading] = {}
    for info in rate_limits:
        if isinstance(info, dict):
            kind = str(info.get("type") or "")
            for reading in _readings(info):
                latest[(reading.window, kind)] = reading
    out: dict[str, Reading] = {}
    for (window, _), reading in latest.items():
        if window not in out or _fuller(reading, out[window]):
            out[window] = reading
    return out


def _fuller(a: Reading, b: Reading) -> bool:
    """Whether reading `a` says its window is fuller than `b` does."""
    return (a.high(), a.used if a.used is not None else -1.0) > (
        b.high(),
        b.used if b.used is not None else -1.0,
    )


def _gone(resets_at: str | None, now: datetime) -> bool:
    at = reset_moment(resets_at, now) if resets_at else None
    return at is not None and at <= now


def _percent(reading: Reading) -> str:
    return f"at {round(reading.used * 100)}%" if reading.used is not None else "close to its limit"


# --- what the reports so far say -------------------------------------------------------------


def finished_reports(conn: sqlite3.Connection) -> dict[int, datetime]:
    """Each company's latest finished report (its narrative complete), by CIK."""
    out: dict[int, datetime] = {}
    rows = conn.execute(
        "SELECT u.cik, r.created_at FROM reports r JOIN runs u ON u.run_id = r.run_id"
        " WHERE r.narrative_complete = 1 AND u.cik IS NOT NULL"
    )
    for cik, created in rows:
        try:
            at = _aware(datetime.fromisoformat(str(created).replace("Z", "+00:00")))
        except ValueError:
            continue
        if cik not in out or at > out[cik]:
            out[cik] = at
    return out


def _latest_prediction(conn: sqlite3.Connection, cik: int, now: datetime) -> datetime | None:
    row = conn.execute(
        "SELECT MAX(run_at) FROM predictions WHERE cik = ? AND run_at <= ?", (cik, now.isoformat())
    ).fetchone()
    return _aware(datetime.fromisoformat(row[0])) if row and row[0] else None


def typical_report(conn: sqlite3.Connection) -> dict[str, int] | None:
    """How long one of Liam's reports usually takes and how many AI calls it makes: the median
    of his latest finished full runs. None until there are a few."""
    rows = conn.execute(
        "SELECT started_at, ended_at, ai_calls FROM runs WHERE mode = 'full' AND status = 'done'"
        " AND ended_at IS NOT NULL ORDER BY started_at DESC LIMIT ?",
        (TYPICAL_RUNS,),
    ).fetchall()
    seconds, calls = [], []
    for started, ended, ai_calls in rows:
        try:
            took = (
                _aware(datetime.fromisoformat(ended)) - _aware(datetime.fromisoformat(started))
            ).total_seconds()
        except (TypeError, ValueError):
            continue
        if took > 0:
            seconds.append(took)
            calls.append(int(ai_calls or 0))
    if len(seconds) < TYPICAL_MIN_RUNS:
        return None
    return {
        "seconds": round(statistics.median(seconds)),
        "ai_calls": round(statistics.median(calls)),
        "runs": len(seconds),
    }


@dataclass
class ReportLine:
    waiting: list[Entry] = field(default_factory=list)
    writing: Entry | None = None
    finished: list[Entry] = field(default_factory=list)
    paused: Pause | None = None
    # Raised by clear(), so a report that ends after Cancel all isn't counted in a new line.
    round: int = 0
    # Until when Liam's carry on past the weekly 80% holds (ISO): the week's reset.
    week_ok_until: str | None = None

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
        skip_recent: bool = False,
    ) -> tuple[list[Entry], list[Skip]]:
        """Each query looked up the way step 1 looks it up, on the bundled S&P 500 list. Nothing
        changes: `add` takes the entries. With `skip_recent`, a company with a finished report
        or an official prediction from the last 30 days is left out."""
        entries: list[Entry] = []
        skipped: list[Skip] = []
        taken = self._taken()
        reports = finished_reports(conn) if skip_recent else {}

        def look_up(query: str) -> None:
            try:
                found = resolve(query, tickers, holdings, aliases=aliases)
            except NotCovered as exc:
                reason = str(exc)
                if exc.candidates:
                    reason += " Did you mean " + " or ".join(exc.candidates) + "?"
                skipped.append(Skip(query, reason, "unknown"))
                return
            ticker = found.rated_ticker
            if found.cik in taken:
                if any(e.cik == found.cik for e in entries):
                    skipped.append(Skip(query, f"{ticker} is listed twice.", "twice"))
                else:
                    skipped.append(Skip(query, f"{ticker} is already in the line.", "in_line"))
                return
            official = slot_open(conn, found.cik, now)
            if skip_recent:
                since = now - WINDOW
                last = max(
                    (
                        at
                        for at in (
                            reports.get(found.cik),
                            None if official else _latest_prediction(conn, found.cik, now),
                        )
                        if at is not None and at >= since
                    ),
                    default=None,
                )
                if last is not None:
                    skipped.append(
                        Skip(query, f"{ticker} has a report from {_day(last)}.", "recent")
                    )
                    taken.add(found.cik)
                    return
            taken.add(found.cik)
            entries.append(Entry(ticker, found.name, found.cik, official))

        for raw in queries:
            query = raw.strip()
            if query:
                for piece in self._pieces(query, tickers, holdings, aliases):
                    look_up(piece)
        return entries, skipped

    @staticmethod
    def _pieces(
        query: str, tickers: dict[str, int], holdings: HoldingsView, aliases: dict[str, int]
    ) -> list[str]:
        """Tickers pasted with spaces between them ("AAPL MSFT NVDA") are one company each. A
        name keeps its spaces ("Bank of America"); words that are mostly tickers, with a name
        that matches nothing, are split too, so one typo doesn't lose the rest."""
        words = query.split()
        if len(words) < 2:
            return [query]
        known = sum(canonical_ticker(w) in tickers for w in words)
        if known == len(words):
            return words
        if known * 2 >= len(words):
            try:
                resolve(query, tickers, holdings, aliases=aliases)
            except NotCovered:
                return words
        return [query]

    def add(self, entries: list[Entry]) -> None:
        if self.idle():
            self.finished = []  # a new line: the last one's Done list is put away
        self.waiting.extend(entries)

    def take_next(self) -> Entry | None:
        if not self.waiting:
            return None
        self.writing = self.waiting.pop(0)
        return self.writing

    def end(self, entry: Entry, how: dict[str, Any], *, now: datetime | None = None) -> None:
        """A report in the line has ended. A problem that would stop the rest pauses the line;
        a usage limit's pause ends by itself once the limit resets (given `now`)."""
        entry.outcome = how.get("how", "failed")
        entry.report_id = how.get("report_id")
        entry.code = how.get("code")
        entry.message = how.get("message")
        if self.writing is entry:
            self.writing = None
        self.finished.append(entry)
        if entry.outcome in ("stopped", "failed") and entry.code in PAUSE_CODES:
            wait = None
            if entry.code == "USAGE_LIMIT" and now is not None:
                wait = _wait_until(how.get("reset_at"), now)
            self.paused = Pause(
                entry.code,
                entry.message or "The report stopped.",
                reset_at=how.get("reset_at"),
                fix_command=how.get("fix_command"),
                run_id=entry.run_id,
                wait_until=wait,
            )

    def check_usage(self, readings: dict[str, Reading], now: datetime) -> None:
        """Between reports, with companies still waiting: past 80% of the plan's weekly window
        the line asks Liam first (once a week); past 80% of its 5-hour window it waits for that
        window to reset, leaving Liam the rest."""
        if self.paused is not None or not self.waiting:
            return
        week = readings.get("week")
        if week and week.high() and not _gone(week.resets_at, now) and not self._week_ok(now):
            self.paused = Pause(
                USAGE_WEEK,
                f"Your plan's weekly usage is {_percent(week)}.",
                reset_at=week.resets_at,
                used=week.used,
            )
            return
        five = readings.get("5h")
        if five and five.high() and not _gone(five.resets_at, now):
            self.paused = Pause(
                USAGE_HIGH,
                f"Your plan's 5-hour usage is {_percent(five)}.",
                reset_at=five.resets_at,
                wait_until=_wait_until(five.resets_at, now),
                used=five.used,
            )

    def _week_ok(self, now: datetime) -> bool:
        until = reset_moment(self.week_ok_until, now) if self.week_ok_until else None
        return until is not None and now < until

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

    def carry_on(self, now: datetime | None = None) -> None:
        """Go on with the companies still waiting (after Tearsheet opened again, or past a
        stopped report without resuming it). Past the weekly 80%, the yes holds until the week
        resets."""
        pause = self.paused
        if pause is not None and pause.code == USAGE_WEEK and now is not None:
            at = reset_moment(pause.reset_at, now) if pause.reset_at else None
            self.week_ok_until = (at if at and at > now else now + WEEK).isoformat()
        if pause is not None:
            self._put_back_unstarted(pause)
        self.paused = None

    def _put_back_unstarted(self, pause: Pause) -> None:
        """The company whose report couldn't start (no AI tool, SEC blocked, sign-in expired)
        goes back first in the line: it never ran, so going on must write it too."""
        if pause.run_id is not None or pause.code not in PAUSE_CODES:
            return
        unstarted = next(
            (e for e in reversed(self.finished) if e.run_id is None and e.code == pause.code),
            None,
        )
        if unstarted is not None:
            self.finished.remove(unstarted)
            unstarted.outcome = unstarted.report_id = unstarted.code = None
            unstarted.message = None
            self.waiting.insert(0, unstarted)

    def wake(self) -> str | None:
        """A pause's wait is over. Gives the stopped report to resume, if there is one; else the
        line just goes on, with a company that never started put back first."""
        pause = self.paused
        if pause is None or pause.wait_until is None:
            return None
        if pause.run_id is not None:
            return pause.run_id
        self._put_back_unstarted(pause)
        self.paused = None
        return None

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
        }

    # --- kept in the settings table -------------------------------------------------------------

    def dumps(self) -> str:
        return json.dumps(
            {
                "waiting": [asdict(e) for e in self.waiting],
                "writing": asdict(self.writing) if self.writing else None,
                "finished": [asdict(e) for e in self.finished],
                "paused": asdict(self.paused) if self.paused else None,
                "week_ok_until": self.week_ok_until,
            }
        )

    @classmethod
    def loads(cls, text: str | None) -> ReportLine:
        """The line as it was when Tearsheet closed. A report being written then starts again
        from the beginning, first in the line; a line with anything waiting comes back paused,
        and a wait for a usage limit to reset waits for Liam instead."""
        try:
            data = json.loads(text) if text else {}
        except ValueError:
            data = {}
        if not isinstance(data, dict):
            data = {}
        waiting = [_entry(e) for e in data.get("waiting") or []]
        writing = data.get("writing")
        if writing:
            waiting.insert(0, _entry({**writing, "run_id": None}))
        paused = data.get("paused")
        if not waiting and not paused:
            return cls(week_ok_until=data.get("week_ok_until"))
        line = cls(
            waiting=waiting,
            finished=[_entry(e) for e in data.get("finished") or []],
            week_ok_until=data.get("week_ok_until"),
        )
        if paused and not writing:
            line.paused = _pause({**paused, "wait_until": None})
        else:
            line.paused = Pause(
                REOPENED,
                f"{_plural(len(waiting), 'report was', 'reports were')} waiting when Tearsheet closed.",
            )
        return line
