# Faster reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut a typical full report from about 27 minutes to about 5, without changing any number in it.

**Architecture:** Prices come from Massive's all-stocks daily summary and whole-market dividends instead of two calls per stock, whenever that needs fewer calls; a background job in the app fills 14 months for every S&P 500 company once. The pipeline sends AI calls 3 at a time, as the design says (Technical Plan §3), and starts the news link search while the data downloads. Each run records the minutes per step.

**Tech Stack:** Python 3.12, asyncio, httpx, SQLite, pytest with respx; `uv run --project engine`.

**Spec:** Liam's approval in chat (7 Nov 2026) of the speed plan; `docs/designs/tearsheet.md` §3 (3 calls in parallel), §5 (the fast path: one-call daily summary, background backfill that pauses while a report or grading runs).

## Global Constraints

- No number in a report may change: stored prices are never overwritten, and every stock's stored closes stay a gap-free run of sessions (the per-stock path's rule, which `needed_start` relies on).
- No database migration: an older engine refuses to write a newer database, and other worktrees still run version 3. Backfill progress is read from `fetch_log`; timings go in `step_outputs` under `timings`, which replay doesn't compare (`replay.COMPARED_STEPS`).
- At most `config.AI_CALLS_IN_PARALLEL` (3) AI calls in flight; the 50-call budget, the article cut, the usage-limit stop and cancel behave as before.
- The backfill never blocks a report: it waits while a run, grading, a history download or the safety check is under way, and it is cancelled when the engine stops.
- No live AI calls and no live report while building. Live Massive checks only on a copy of the data folder.

## Measured facts this plan rests on (7 Nov 2026)

- The summary's closes equal the per-stock closes: 41 of 41 tech stocks on 6 Nov, 42 of 42 (with SPY) on 4 Nov. Volumes differ slightly; volume feeds only the chart.
- Whole-market dividends work on the free key, with `ex_dividend_date.gte/.lte`: about 500–600 a day across the market (3 pages of 1,000 covered 10–15 Aug 2026), so 1 page per day of top-up and about 12 pages a month of backfill.
- One summary is about 400 KB compressed in the raw store; 14 months is about 120 MB.

## Review Focus

1. A stock missing from a day's summary (halted, renamed): it must fall back to its own per-stock call, never leave a gap. Tested in Task 1.
2. A stock with no stored prices at all mid-way through a backfill: it may start only on the window's first session, so it never gets a short history that `needed_start` would take as complete. Tested in Task 1.
3. A usage limit or cancel while 3 calls are in flight: the stop note appears once, queued calls never start, and the run ends as before. Tested in Task 3.
4. A run that fails before step 9 while the early link search is still going: the search is cancelled, not left running. Tested in Task 3.
5. The backfill restarting after the app closed: it resumes from stored summaries without asking Massive again. Tested in Task 2.

---

### Task 1: Whole-market top-ups

**Files:**
- Create: `engine/src/tearsheet/data/market.py`
- Modify: `engine/src/tearsheet/data/prices.py` (PriceStore helpers), `engine/src/tearsheet/sources.py` (`LiveData.fill_prices`), `engine/src/tearsheet/data/membership.py` (public stored-or-bundled loader), `engine/src/tearsheet/config.py` (constants)
- Test: `engine/tests/test_market.py`

**Interfaces:**
- Produces:
  - `PriceStore.latest_dates() -> dict[tuple[int, str], date]` (one `GROUP BY` query)
  - `PriceStore.store_bar_rows(rows: list[tuple[int, str, dict]], *, raw_hash: str) -> int` (one transaction)
  - `PriceStore.store_market_dividends(data: dict, tickers: dict[str, tuple[int, str]]) -> int`
  - `market.paged(http, rawstore, url, params, *, kind, reuse: bool) -> AsyncIterator[dict]`: every page, using a stored body from `fetch_log` when `reuse` and one exists
  - `class market.Extender(store, wanted, *, first_session: date | None)`; `.apply(day, results, raw_hash) -> int`; `.through: dict[str, date | None]`. Stores a stock's row for `day` only if the stock is in the summary and either its latest stored close is the session before `day`, or it has no stored close and `day == first_session`.
  - `market.fetch_day(http, rawstore, day, *, reuse) -> tuple[dict, str]` (results, raw hash)
  - `market.dividend_pages_for(days: int) -> int` using `config.MARKET_DIVIDENDS_PER_DAY = 600`
  - `membership.stored_or_bundled(conn) -> Holdings`
- `LiveData.fill_prices` keeps its signature. For stocks that already have prices, it uses the summary when `len(days) + dividend_pages_for(len(days)) < 2 * stocks_needing`; it extends every S&P 500 stock that has prices (and SPY), then makes per-stock calls for any group stock the summary left behind. First fills stay per-stock. Splits stay one whole-market call over the range.

- [ ] Tests: `test_extender_keeps_runs_gap_free`, `test_a_stock_missing_from_the_summary_is_left_for_its_own_call`, `test_no_history_starts_only_on_the_first_session`, `test_top_up_uses_the_summary_when_cheaper` (respx: 1 summary + 1 dividends page + 1 splits call for 3 stocks, closes and dividends stored), `test_top_up_uses_per_stock_calls_when_cheaper`, `test_top_up_extends_other_sectors_too`, `test_paged_reuses_stored_pages`.
- [ ] Implement; run `uv run --project engine pytest engine/tests/test_market.py -q` → pass.
- [ ] Full suite still passes (`test_live_pipeline.py` keeps per-stock first fills). Commit.

### Task 2: The background backfill

**Files:**
- Modify: `engine/src/tearsheet/data/market.py` (`backfill`), `engine/src/tearsheet/server.py` (job, gate, start, shutdown), `engine/src/tearsheet/cli.py` (`prices backfill`, `prices status`)
- Test: `engine/tests/test_market.py`, `engine/tests/test_server_jobs.py`

**Interfaces:**
- Consumes: Task 1's `paged`, `fetch_day`, `Extender`, `stored_or_bundled`.
- Produces:
  - `async market.backfill(http, rawstore, store, wanted, *, end, months=FIRST_FILL_MONTHS, gate=None, progress=None) -> BackfillResult(days_fetched, days_reused, calls)`. Month by month, oldest first: that month's dividends (whole market, paged), splits (whole market, paged), then each session's summary, reusing stored pages. `gate` is awaited before every network call.
  - `market.backfill_status(store, wanted, *, end) -> tuple[int, int]` (companies with 14 months, companies wanted)
  - `Server(..., backfill: bool | None = None)` (default: on for the live server); `Server.backfill_job`; started by `start()` when the Massive key is set and the `prices_backfill` setting isn't `off`; cancelled in `serve()`'s shutdown.
- [ ] Tests: `test_backfill_fills_new_stocks_from_the_window_start`, `test_backfill_resumes_from_stored_pages`, `test_backfill_waits_while_a_report_runs` (server test with a fake HTTP factory), `test_backfill_is_off_when_the_setting_says_so`.
- [ ] Implement; tests pass; commit.

### Task 2b: Start at setup, keep prices current (added 7 Nov, Liam: "when someone gets this app it immediately in the background starts loading everything")

- `m_set_key` for Massive starts the price job at once, so a new install's download begins during setup, not at the next launch.
- The price job loops while the app is open: the backfill while the index has a company it hasn't covered, then every 30 minutes (`KEEP_CURRENT_EVERY_S`) the sessions closed since the stored prices end, for every stored company (`market.catch_up` + `market.top_up`). A check that finds nothing makes no call.
- [x] Tests: `test_saving_the_massive_key_starts_the_price_download_at_once`, `test_the_open_app_adds_newly_closed_sessions`, `test_catch_up_*`.

### Task 3: AI calls 3 at a time; the link search first

**Files:**
- Modify: `engine/src/tearsheet/pipeline.py` (`_parallel`, `_ai_call`, `extract`, `narrate`, `verify`, `_skeptic`, `run`, `news`)
- Test: `engine/tests/test_pipeline.py`

**Interfaces:**
- Produces: `Run._parallel(jobs: list[tuple[tuple[str, ...], Callable[[], Awaitable[T]]]]) -> list[T | None]`: runs the jobs with an `asyncio.Semaphore(config.AI_CALLS_IN_PARALLEL)`, returns results in the jobs' order, puts the batch's `dropped` lines in job order (matched by label prefix), and re-raises `RunCancelled` (or any unexpected error) after every job has settled.
- `_ai_call` adds its stop note only once. `_skeptic` adds its checker-failed note only once.
- `extract` and `narrate` run one batch each; `verify` runs one chain per section (checks, skeptic, at most one rewrite) as one batch, merged in section order.
- `run()` starts the link search as a task right after `resolve` (full mode, an AI tool, and a data source with `fetch_article`); `news()` awaits it; any failure or cancel before then cancels it.
- [ ] Tests: `test_ai_calls_run_three_at_a_time` (FakeConnector `max_active == 3`), `test_parallel_reports_match_sequential_ones` (same sections, claims and order with 1 and 3 slots), `test_usage_limit_mid_batch_stops_once`, `test_cancel_mid_batch_starts_no_more_calls`, `test_link_search_starts_before_prices_finish`, `test_failed_run_cancels_the_early_link_search`.
- [ ] Implement; full suite passes; commit.

### Task 4: Minutes per step

**Files:**
- Modify: `engine/src/tearsheet/pipeline.py` (`_step`, `_finish`, `RunResult.timings`), `engine/src/tearsheet/cli.py` (`run`, `resume` print a time line)
- Test: `engine/tests/test_pipeline.py`, `engine/tests/test_replay.py`

**Interfaces:**
- Produces: a `step_outputs` row `timings` = `{"total_s": float, "steps": {step: seconds}, "ai": {task: {"calls": int, "seconds": float}}}`, written straight to the table (not through `_save_step`, so `last_step_done` and progress are untouched); `RunResult.timings`.
- [ ] Tests: `test_run_records_seconds_per_step`, replay of the stored test runs still passes.
- [ ] Implement; commit.

### Task 5: Checks

- [ ] `uv run --project engine pytest -q`, `ruff check`, `ruff format --check`: all clean.
- [ ] `tearsheet-engine replay --all` on the stored test runs: no differences.
- [ ] Offline full run on stored Apple data with a fake AI that waits 1 s per call: time with 1 slot and with 3, same report text.
- [ ] Live, on a copy of the data folder only: remove 6 Nov's rows for the tech sector, top up through `fill_prices`, and compare with the removed rows; run a one-month backfill and compare one stock with its own per-stock call.
