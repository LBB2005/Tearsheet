# Dig deeper, Phase 3 (Watchlist "Write takes") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One Watchlist button writes a Dig deeper take on every company on the list on show, one after another, skipping those with a take from the last 7 days, without ever running beside a report.

**Architecture:** `dig/take_line.py` holds a `TakeLine`, a `batch.ReportLine` whose entries are companies to take (the entry's `run_id` holds the take id), kept in the setting `take_line`, with the report line's pauses (usage limit and the plan's 80% windows, offline, reopened, line error). The server runs it in `_take_line_loop`, modelled on `_line_loop`: each take goes through `m_write_take`, so it shares the one take slot and its refusals; a take starts only when nothing else runs and the report line isn't going. The app adds a Write takes button and confirm on the Watchlist header, a strip on the Watchlist while the take line goes or waits, and a take chip on each row.

**Tech Stack:** as Phases 1–2.

**Spec:** `docs/superpowers/specs/2026-11-17-dig-deeper-design.md` (Phase 3, "My calls": the run-all line).

## Global Constraints

- The line covers the Watchlist on show (the app sends its companies), leaves out a company with a take from the last 7 days (`TAKE_DAYS = 7`), one with no report to dig from, and one already in the line.
- A take starts only when no report, grading, history download, safety check or other take runs, and the report line isn't going (a company being written, or companies waiting with no pause).
- The take line reuses the report line's pauses: USAGE_LIMIT waits for its reset, USAGE_HIGH (5-hour window past 80%) waits, USAGE_WEEK asks once a week, REOPENED after a quit, AUTH_EXPIRED/LOCKDOWN_FAILED/NO_TOOL/AI_UNAVAILABLE wait for Carry on, LINE_ERROR. A take that failed goes back first on Carry on.
- Protocol 10 → 11: `start_take_line {ciks}` (→ `LinePlan`), `get_take_line`, `carry_on_take_line`, `clear_take_line` (→ `LineState`), `remove_from_take_line {ticker}` (→ `LineState`); note `take_line_changed` (`LineState`). `LineSkip.kind` gains `no_report`. `WatchRow` gains `take_at: str | None` (the newest take's time) and `take_queued: "waiting" | "writing" | None`.
- Never a report or official prediction; the database only gains through migrations (none needed in this phase).
- Wording: the button "Write takes" with its count; the confirm "Write AI takes on N companies, one after another? About a minute each, on your AI plan." with Write takes / Cancel; the strip "Takes: 2 of 5" or "Up next"; the row chip shows the take's day ("Nov 17"), or "Next"/"Writing" while in the line.
- Commits by pathspec, each ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; checks as in Phase 2.

## Review Focus

1. **The app quits mid-take:** the line comes back paused (REOPENED, takes wording), the company being written goes first, and its unfinished take id is dropped. Test in Task 1.
2. **A usage limit on one take:** the line pauses with the reset time and carries on by itself after it; Carry on now starts that company again first. Test in Task 1 and Task 2.
3. **The report line starts while takes wait:** no take starts until the report line has nothing going; a running take finishes first. Test in Task 2.
4. **Cancel all during a take:** the take under way is cancelled and nothing else starts. Test in Task 2.
5. **A company taken out of the Watchlist while waiting** still gets its take (it was asked for); removing it from the line is the way out. No test: documented behaviour.

---

### Task 1: The take line

**Files:** Create `engine/src/tearsheet/dig/take_line.py`; Test `engine/tests/test_dig_take_line.py`.

**Interfaces:** `SETTING = "take_line"`, `TAKE_DAYS = 7`; `class TakeLine(ReportLine)` with `plan_ciks(conn, ciks, *, holdings, now) -> tuple[list[Entry], list[Skip]]`, `loads(text) -> TakeLine` (reopened wording in takes; unfinished take ids dropped), and `ended(take: dict) -> dict` (a take_done note as `end()`'s `how`: saved → ready, CANCELLED → cancelled, else failed; never resumable).

- [ ] Failing tests: plan leaves out no-report, recent-take and in-line companies with their reasons and keeps the order; a usage limit pauses with `wait_until`; a failed take goes back first on Carry on; loads after a quit is REOPENED with takes wording and no take id.
- [ ] Implement, pass, commit.

### Task 2: The server's take line and protocol 11

**Files:** Modify `engine/src/tearsheet/server.py`, `protocol.py`, `__init__.py`, `watchlist.py`; Test `engine/tests/test_server_take_line.py`, `test_protocol.py`, `test_watchlist.py`.

**Interfaces:** `Server.take_line`, `take_line_job`, `_take_line_loop`, `_take_line_changed`, `wait_for_take_line()`; `last_take_end`, `last_take_usage` set when each take ends; the five methods and the note; `watchlist.page(..., takes=..., take_queued=...)`.

- [ ] Failing tests: start → takes written one after another with `take_line_changed` notes, done list ready; a report running → the line waits until it ends; the report line going → waits; a usage limit → paused with reset; clear during a take → that take cancelled and nothing more; remove takes a company out; the page's rows carry `take_at` and `take_queued`; protocol 11 methods declared.
- [ ] Implement, `npm run gen-types`, pass, commit.

### Task 3: The Watchlist button, strip and chips

**Files:** Modify `app/src/main/ipc.ts`, `preload/index.ts`, `api.d.ts`, `index.test.ts`, `main/ipc.test.ts`, `renderer/test/bridge.ts`, `renderer/test/watch.ts`, `renderer/watch/watch.ts`, `renderer/pages/Watch.tsx`, `renderer/watch/watch.css`, `renderer/App.tsx` (refresh on `take_line_changed`/`take_done`); Create `renderer/watch/TakeStrip.tsx`; Test `renderer/pages/Watch.test.tsx`, `renderer/watch/watch.test.ts`.

**Interfaces:** `toTake(rows, now) -> WatchRow[]` (a report, no take in 7 days, not in the line); `takeChip(row, now) -> string | null`.

- [ ] Failing tests: the button counts the companies to take and is greyed with none; its confirm starts the line with the list's companies; the strip shows progress, waiting chips with ×, the pause and Carry on, Cancel all; each row shows its take's day, or Next/Writing.
- [ ] Implement, pass, commit.

### Task 4: Checks and the look by eye

- [ ] Every check; a hidden test-build window on a data copy showing the button, confirm, strip and chips (a take line run there uses real AI only with Liam's OK).
