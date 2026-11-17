# Dig deeper, Phase 1 (the data page) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new app page for one stock that shows today's picture beside its newest report (sector, market, peers, analysts, insiders, news with tone), built by the engine from saved data plus a few live calls, saved as a dated, write-once snapshot. No AI in this phase.

**Architecture:** A new engine package `tearsheet/dig/` holds one module per page part. Each part is a plain function of stored data (prices, the report's run) plus, for live parts, bytes fetched through the usual `HttpClient`/`RawStore`, so every input is saved and a snapshot can be rebuilt (`replay-dig`). `snapshot.py` builds all parts, marks each `ok`, `stale`, `off` or `down`, and saves one row in the new write-once table `dig_snapshots`. Two protocol methods serve it: `get_dig_deeper` (instant, reads the newest snapshot) and `refresh_dig_deeper` (fetches, off the request loop). The app adds a `dig` page and opens it from the stock menu, the Watchlist detail and the report toolbar.

**Tech Stack:** Python 3.12 engine (pydantic protocol models, sqlite3, httpx, respx in tests), Electron + React + TypeScript app (vitest, Testing Library).

**Spec:** `docs/superpowers/specs/2026-11-17-dig-deeper-design.md` (Phase 1). Data rules: `docs/designs/tearsheet.md` §9.

## Global Constraints

- Never run a live full report on a real company. Tests use the engine's fakes; the by-eye check uses a data copy.
- The engine computes every number; the renderer only formats and lays out.
- `DIG_CODE_VERSION = 1`. `METHOD_CODE_VERSION` stays 4. `PROTOCOL_VERSION` goes 8 → 9.
- The database only gains tables or columns, through `0007_dig_snapshots.sql`. `dig_snapshots` is write-once (update, delete and replacing insert all raise "write-once").
- A Dig deeper refresh never writes to `runs`, `predictions`, `reports` or `report_levels`.
- Sentiment (news tone) never enters a score or rating; it is display only.
- Analyst data is display only in Phase 1, but its answers are saved through `RawStore.put` (Phase 2 hands them to the AI).
- Massive news: a plan refusal turns the news part `off` and it is retried after 7 days. `massive` is never added to `keys_refused` for it.
- Keys only from the Keychain via `config.get_key`; never logged, printed or stored.
- Test fixtures for Massive news are hand-written in Massive's documented shape, never real answers: Massive's Market Data Terms §5(c) forbid publishing its data, and the repo is public.
- News links open only for sites on the shipped news allowlist (`methodology/allowlist.yaml`).
- Every page shows `ADVICE_SHORT` ("General research, not personalised investment advice.").
- Commits by pathspec only: `git commit -m "…" -- <paths>`, each message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. New files are `git add`ed by path first.
- Checks (Verification, end): app `npm run typecheck`, `npx vitest run --coverage`, `npm run build`, `npm run gen-types` (no diff); engine `uv run ruff check .`, `uv run ruff format --check .`, `uv run pytest -q`; `uv run tearsheet-engine --data-dir tests/fixtures/runs replay --all` unchanged.

## Review Focus

1. **A company with no report on show but an official prediction** (its report hidden): the page still opens from the prediction's levels, and the peers part says "No report run to compare peers from" instead of failing. Test in Task 3 and Task 6.
2. **A sector member with no closes or a short history** (a recent listing) must not blank the sector line: it is left out and counted. Test in Task 4.
3. **A split between the report and today:** the header's levels, the move since the report and the range bar are all in today's shares. Test in Task 3.
4. **Massive refusing news** (403 NOT_AUTHORIZED, or a 200 with status NOT_AUTHORIZED): news goes `off` with the retry date, other parts still build, and the key is not marked refused. Test in Task 8.
5. **A refresh where one service fails** (SEC down, FRED key missing, analystdb down): the other parts are `ok`, a part that was `ok` in the previous snapshot comes back `stale` with its old date, a part never fetched is `down` (or `off` for a missing key). Test in Task 10.

---

### Task 1: One SEC limiter shared by the whole engine

**Files:**
- Modify: `engine/src/tearsheet/http.py` (`HttpClient.__init__`, the `sec` Service)
- Modify: `engine/src/tearsheet/server.py` (`massive_limiter` neighbour, `_live_data`, `_live_http`)
- Test: `engine/tests/test_http.py`, `engine/tests/test_server_jobs.py`

**Interfaces:**
- Produces: `HttpClient(..., sec_limiter: RateLimiter | None = None)`; `Server.sec_limiter() -> RateLimiter` (lazy, one per server, `RateLimiter.per_second(config.SEC_REQUESTS_PER_SECOND, clock=…, sleep=…)`).

- [ ] **Step 1: Write the failing tests**

```python
# test_http.py
def test_two_clients_with_one_sec_limiter_share_its_spacing(rawstore, clock):
    limiter = RateLimiter.per_second(8, clock=clock, sleep=clock.sleep)
    a = HttpClient(rawstore, "r1", sec_user_agent=UA, sec_limiter=limiter, sleep=clock.sleep)
    b = HttpClient(rawstore, "r2", sec_user_agent=UA, sec_limiter=limiter, sleep=clock.sleep)
    assert a.services["sec"].limiter is limiter is b.services["sec"].limiter

def test_a_client_without_a_shared_sec_limiter_gets_its_own(rawstore):
    a, b = HttpClient(rawstore, "r1"), HttpClient(rawstore, "r2")
    assert a.services["sec"].limiter is not b.services["sec"].limiter

# test_server_jobs.py
def test_the_server_hands_every_live_client_the_same_sec_limiter(tmp_path): ...
    # open _live_http twice; both clients' services["sec"].limiter is h.server.sec_limiter()
```

- [ ] **Step 2: Run them; they fail** — `cd engine && uv run pytest tests/test_http.py -k sec_limiter -q` → TypeError (unexpected keyword `sec_limiter`).
- [ ] **Step 3: Implement.** In `HttpClient.__init__` use `sec_limiter or RateLimiter.per_second(...)` exactly as `massive_limiter` is used. Add `Server.sec_limiter()` beside `massive_limiter`, and pass it in `_live_data` and `_live_http`.
- [ ] **Step 4: Run** `uv run pytest tests/test_http.py tests/test_server_jobs.py -q` → pass.
- [ ] **Step 5: Commit** `git commit -m "One SEC rate limiter shared by every live client" -- engine/src/tearsheet/http.py engine/src/tearsheet/server.py engine/tests/test_http.py engine/tests/test_server_jobs.py`

---

### Task 2: The `dig_snapshots` table (migration 0007)

**Files:**
- Create: `engine/src/tearsheet/db/migrations/0007_dig_snapshots.sql`
- Modify: `engine/tests/test_db.py` (the hard-coded `db.version == 6` becomes 7; a `DIG_TABLES` check; a write-once test)

**Interfaces:**
- Produces table `dig_snapshots(snapshot_id TEXT PRIMARY KEY, cik INTEGER NOT NULL, created_at TEXT NOT NULL, close_date TEXT, report_id TEXT, run_id TEXT, versions_json TEXT NOT NULL, inputs_hash TEXT NOT NULL, json TEXT NOT NULL)`, index `dig_snapshots_cik ON (cik, created_at)`. `snapshot_id` is also the `run_id` of the snapshot's `fetch_log` rows (`dig-<cik>-<YYYYmmddTHHMMSSZ>-<6 hex>`). `report_id`/`run_id` are the report's.

- [ ] **Step 1: Write the failing tests** — `test_the_dig_table_exists` (table and index present on a new database); `test_dig_snapshots_are_write_once` (UPDATE, DELETE and `INSERT OR REPLACE` of an existing id each raise `sqlite3.IntegrityError` matching "write-once"); version assertion 7.
- [ ] **Step 2: Run** `uv run pytest tests/test_db.py -q` → fail (no table, version 6).
- [ ] **Step 3: Write the migration.** Header comment in the house style ("Dig deeper's snapshots (dig/snapshot.py). Migrations only add tables and columns."). Write-once by the 0002/0005 pattern: `BEFORE UPDATE` and `BEFORE DELETE` triggers raising `'dig snapshots are write-once'`, plus a `BEFORE INSERT … WHEN EXISTS (… snapshot_id = NEW.snapshot_id)` trigger.
- [ ] **Step 4: Run** `uv run pytest tests/test_db.py -q` → pass. Also `uv run tearsheet-engine --data-dir tests/fixtures/runs replay --all` → unchanged (replay migrates its in-memory copy).
- [ ] **Step 5: Commit** (`git add` the new file first).

---

### Task 3: The report on show, for any company (`watchlist.levels_for`) and `dig/target.py`

**Files:**
- Modify: `engine/src/tearsheet/watchlist.py` (factor the "shown" CTE and `lv_*` columns out of `_companies` into module SQL; factor the levels/then/made_at choice into `_shown(...)`; add `levels_for`)
- Create: `engine/src/tearsheet/dig/__init__.py` (`DIG_CODE_VERSION = 1`, `PART_STATES = ("ok", "stale", "off", "down")`)
- Create: `engine/src/tearsheet/dig/target.py`
- Test: `engine/tests/test_watchlist.py` (existing tests stay green), `engine/tests/test_dig_target.py`

**Interfaces:**
- Produces: `watchlist.Shown` (frozen dataclass: `levels: Levels | None`, `then: tuple[date, float] | None`, `made_at: str | None`, `report_id: str | None`, `run_id: str | None`, `prediction: sqlite3.Row | None`); `watchlist.levels_for(conn, cik: int) -> Shown` (same choice as the page: newest report not in `hidden_reports`, else the newest official prediction; `then` None when ≤ 0).
- Produces: `dig.target.Target` (frozen: `cik`, `ticker`, `name`, `sector: str | None`, `shown: Shown`, `close: tuple[date, float] | None`, `since_report: float | None`, `levels_today: dict | None` = `watchlist._levels_out(levels, _at(levels, splits, close_date))`); `dig.target.target(conn, cik: int, holdings: Holdings) -> Target`; `NoReport(Exception)` raised when the company has neither a report on show nor a prediction.

- [ ] **Step 1: Write the failing tests**

```python
def test_levels_for_matches_the_watchlist_page(...):   # watched company: same Levels, then, made_at as page()'s row
def test_levels_for_skips_a_hidden_report_and_falls_back_to_the_prediction(...):
    # report hidden -> shown.levels.source == "prediction", shown.report_id is None
def test_levels_for_an_unwatched_company(...):       # works without watch_items rows
def test_target_puts_levels_in_todays_shares_after_a_split(...):
    # 2-for-1 split after the report: levels_today["base"] == base / 2; since_report uses the split factor
def test_target_without_report_or_prediction_raises_no_report(...):
```

- [ ] **Step 2: Run** `uv run pytest tests/test_dig_target.py tests/test_watchlist.py -q` → the new tests fail.
- [ ] **Step 3: Implement.** `_companies` keeps one batched query for all watched companies (speed) but builds its SQL from the shared fragments; `levels_for` runs the same fragments with `u.cik = ?` and no watched filter. `target()` takes the ticker from `holdings.tickers_of(cik)[0]` when in the index, else the newest `tickers` row; the close from `_recent(conn, cik, 1)`; `since_report` as `watchlist._move` does.
- [ ] **Step 4: Run** the same command → pass; then the whole `uv run pytest tests/test_watchlist*.py -q`.
- [ ] **Step 5: Commit.**

---

### Task 4: Sector part (`dig/sector.py`)

**Files:** Create `engine/src/tearsheet/dig/sector.py`; Test `engine/tests/test_dig_sector.py`

**Interfaces:**
- Consumes: `Holdings.sector_members(sector)`, `charts._index`, `charts.SPY_CIK`, `PriceStore.total_return`, `PriceStore.closes`.
- Produces: `PERIODS = (("1M", 1), ("3M", 3), ("6M", 6), ("12M", 12))`; `months_back(day: date, n: int) -> date` (same day n months earlier, clamped to the month's end); `sector_part(prices: PriceStore, holdings: Holdings, target: Target, *, up_to: date) -> dict` with keys `state` ("ok", or "down" when the stock has no closes), `note`, `sector`, `members` (used), `left_out` (members with no closes, or a first close after the 12-month start), `dates` (the stock's dates in the last 12 months), `stock`, `sector_line`, `spy` (each from `_index`, 100 at the start), `returns` (one row per period: `period`, `stock`, `sector_median`, `spy`), `rank`, `rank_of` (the stock's 12M rank among members with a 12M return; 1 is best).

- [ ] **Step 1: Write the failing tests** — `test_sector_lines_start_at_100_and_share_dates`; `test_a_member_with_no_closes_is_left_out_not_blanking_the_line` (one member with no prices: `left_out == 1`, `sector_line[-1] is not None`); `test_a_member_listed_after_the_window_start_is_left_out`; `test_returns_and_rank` (three members with known closes: exact `sector_median` and `rank == 2`, `rank_of == 3`); `test_months_back_clamps_to_month_end` (`months_back(date(2026,5,31), 3) == date(2026,2,28)`); everything uses closes `<= up_to` only (a later close changes nothing).
- [ ] **Step 2: Run** → fail (module missing).
- [ ] **Step 3: Implement** `sector_part`. Members exclude none (the stock counts as a member); the sector median is over members with a value for that period.
- [ ] **Step 4: Run** → pass.
- [ ] **Step 5: Commit.**

---

### Task 5: Market part (`dig/market.py`)

**Files:** Create `engine/src/tearsheet/dig/market.py`; Test `engine/tests/test_dig_market.py`

**Interfaces:**
- Consumes: `pipeline.twelve_month_return`, `scoring.momentum_scaling`, `methodology.load().weights["momentum_scaling"]`, `LiveData.macro(day)`, `report_numbers.FRED_LABELS`.
- Produces: `market_part(prices: PriceStore, rules: dict, *, up_to: date) -> dict` (`state`, `spy_12m`, `volatility_percentile`, `scaling_on`, `scaling_note`); `rates_part(macro: dict[str, tuple[str, float, date]] | None, *, fred_key: bool) -> dict` (`state`: "off" with note "Add a FRED key in Settings to see rates." when no key, "down" when `macro` is None, else "ok"; `rates`: list of `{id, label, value, date}` in `FRED_LABELS` order).

- [ ] **Step 1: Write the failing tests** — `test_market_reads_spy_up_to_the_close_date` (fixture SPY prices: `spy_12m` equals `twelve_month_return(..., up_to)`); `test_rates_are_labelled_in_order`; `test_rates_off_without_a_fred_key`; `test_rates_down_when_fred_failed`.
- [ ] **Step 2–4:** run → fail → implement → pass.
- [ ] **Step 5: Commit.**

---

### Task 6: Peers part with recomputed scores (`dig/peers.py`)

**Files:** Create `engine/src/tearsheet/dig/peers.py`; Test `engine/tests/test_dig_peers.py`

**Interfaces:**
- Consumes: `key_numbers._Stored(conn, run_id, cik)` and `.peer_median`, `report_numbers.METRIC_LABELS`, `pipeline._stored_copies` + `methodology.from_stored` + `RawStore.read`, `scoring.score_group`, `scoring.momentum_scaling`, `pipeline.SLICE_METRICS`, `metrics.Metric`, `PriceStore.total_return`.
- Produces: `recompute_scores(conn, raw_dir: Path, run_id: str, *, price_date: date) -> dict[int, float]` (the composite percentile of every member, from the run's stored metrics, its stored methodology copy, `metric_set=SLICE_METRICS` when `runs.mode == 'slice'`, and `financial_members` = members whose `companies.financial_class` is bank or insurer); `peers_part(conn, raw_dir, target: Target, prices, *, up_to: date, before: str) -> dict` with `state`, `note`, `run_id`, `report_date`, `columns` (list of `{key, label}` from `METRIC_LABELS`), `rows` (company first, then peers by recomputed score, highest first: `cik`, `ticker`, `name`, `is_company`, `numbers` (key → value), `score`, `rating`, `rated_at`, `since_report` (total return from the report's price date to `up_to`), `return_12m`), `median` (key → peer median, plus `score`, `since_report`, `return_12m`), `recomputed_note` ("Scores recomputed from the report's stored numbers."). `rating`/`rated_at` come from each member's newest `predictions` row with `run_at <= before`.
- With no report run (`target.shown.run_id is None`): `state "off"`, note "No report run to compare peers from."

- [ ] **Step 1: Write the failing tests**

```python
def test_recomputed_composite_equals_the_logged_score(tmp_path):
    # Harness(tmp_path, log_predictions=True) runs one fake report; then
    # recompute_scores(conn, raw, run_id, price_date=...)[cik] == pytest.approx(predictions.score)
def test_peers_rows_carry_report_numbers_and_newest_predictions(...)
def test_a_prediction_after_the_snapshot_time_is_not_used(...)
def test_peers_off_without_a_report_run(...)
def test_recomputing_writes_nothing(...)   # runs, predictions, reports, metrics row counts unchanged
```

- [ ] **Step 2–4:** run → fail → implement → pass.
- [ ] **Step 5: Commit.**

---

### Task 7: Insider trades with amounts (`sec.form4_amounts`, `LiveData.form4_amounts`, `dig/insiders.py`)

**Files:** Modify `engine/src/tearsheet/data/sec.py`, `engine/src/tearsheet/sources.py`; Create `engine/src/tearsheet/dig/insiders.py`; Test `engine/tests/test_sec.py`, `engine/tests/test_dig_insiders.py`; Fixture `engine/tests/fixtures/dig/form4_*.xml` (hand-written, SEC's Form 4 XML shape).

**Interfaces:**
- Produces: `sec.Form4Trade` (frozen: `owner`, `day: date`, `code: str`, `shares: float | None`, `price: float | None`, `acquired: str | None`); `sec.form4_amounts(xml: bytes, filed: date) -> list[Form4Trade]` (reads `transactionAmounts/transactionShares/value`, `transactionPricePerShare/value`, `transactionAcquiredDisposedCode/value`; non-derivative rows only; unparseable XML gives `[]`); `LiveData.form4_amounts(cik, *, today) -> list[Form4Trade]` (the same filings `form4_trades` reads, including older purchase months). `form4_trades` and the pipeline are untouched.
- Produces: `INSIDER_DAYS = 183`; `insiders_part(trades: list[Form4Trade] | None, *, today: date) -> dict` with `state` ("down" when `trades` is None), `days`, `buys` and `sells` (each `trades`, `people`, `shares`, `value` = Σ shares × price where both known), `rows` (the newest 20 P and S trades in the window: `owner`, `date`, `code`, `shares`, `price`), `routine_free_buyers` (from `flags.insider_buying_note(((t.owner, t.day, t.code) for t in trades), today)`, else `[]`).

- [ ] **Step 1: Write the failing tests** — `test_form4_amounts_reads_shares_price_and_side`; `test_form4_amounts_on_bad_xml_is_empty`; `test_insiders_counts_buys_and_sells_in_the_window` (a sale 200 days back is left out); `test_insiders_names_non_routine_buyers`; `test_insiders_down_when_sec_failed`.
- [ ] **Step 2–4:** run → fail → implement → pass.
- [ ] **Step 5: Commit.**

---

### Task 8: News with tone from Massive (`dig/news.py`)

**Files:** Create `engine/src/tearsheet/dig/news.py`; Fixtures `engine/tests/fixtures/dig/massive_news_ok.json`, `massive_news_not_entitled.json` (hand-written, documented shape: `status`, `results[].{id, publisher{name,homepage_url}, title, published_utc, article_url, tickers, description, insights[{ticker, sentiment, sentiment_reasoning}]}`); Test `engine/tests/test_dig_news.py`

**Interfaces:**
- Consumes: `config.MASSIVE_NEWS`, `HttpClient.fetch("massive", …)`, `Methodology.allowlist_sites()` → `data.articles.Allowlist`.
- Produces: `NEWS_LIMIT = 50`; `NEWS_OFF_SETTING = "dig_news_off_until"`; `NEWS_RETRY_DAYS = 7`; `parse_news(data: dict, ticker: str, allowlist: Allowlist) -> list[dict]` (`title`, `publisher`, `published` (ISO), `url`, `openable` = `allowlist.allows(url)`, `tone` ∈ {"positive","neutral","negative"} or None from the `insights` row whose `ticker` matches (case-insensitive), `tone_why`); `tone_counts(items) -> dict` (`positive`, `neutral`, `negative`, `unknown`); `async news_part(http, settings, ticker: str, *, since: date, today: date, allowlist) -> dict` (`state`, `note`, `since`, `items`, `tone`, `source` "Massive"). Request params: `ticker`, `published_utc.gte=since`, `order="desc"`, `sort="published_utc"`, `limit=NEWS_LIMIT`. A 403, or a refusal whose message says NOT_AUTHORIZED or "entitled", sets the setting to `today + 7 days` and returns `off` with note "Massive's plan doesn't include news. Tearsheet checks again on <d MMM>." While `today < setting`, no call is made and the part is `off`. Any other failure is `down`. No Massive key: `off`, "Add your Massive key in Settings to see news."

- [ ] **Step 1: Write the failing tests** — `test_parse_news_reads_tone_for_this_ticker_only`; `test_links_are_openable_only_on_the_allowlist`; `test_tone_counts`; `test_not_entitled_turns_news_off_for_a_week_and_leaves_the_key_alone` (respx 403 with the fixture: state off, setting = today+7, `http.keys_refused == set()`); `test_refusal_inside_a_200_answer_is_off_too`; `test_no_call_while_off` (respx route not called); `test_retried_after_the_week`; `test_news_down_on_a_server_error`.
- [ ] **Step 2–4:** run → fail → implement → pass.
- [ ] **Step 5: Commit.**

---

### Task 9: Analysts part, saved answers (`AnalystDB.saved_view`, `dig/analysts.py`)

**Files:** Modify `engine/src/tearsheet/data/analystdb.py`; Create `engine/src/tearsheet/dig/analysts.py`; Test `engine/tests/test_analystdb.py`, `engine/tests/test_dig_analysts.py`

**Interfaces:**
- Produces: `AnalystDB.saved_view(ticker: str, day: date, rawstore: RawStore, run_id: str) -> dict` — `view()`'s answer, with each of the four answers' bytes stored by `rawstore.put(body, url, "analystdb", "application/json", run_id)` before it returns (never raises; nothing is stored when analystdb is down). `analysts_part(view: dict, levels_today: dict | None) -> dict` (`state` from the view's state: "ok", "down" for "down", "off" for "missing" with note "analystdb has no coverage for this company."; `view`; `ours`: `base`, `buy_trigger`, `sell_trigger`, `bear`, `bull` from `levels_today`).

- [ ] **Step 1: Write the failing tests** — `test_saved_view_stores_each_answer_before_returning` (MockTransport; four `fetch_log` rows with provider "analystdb" for the run id); `test_saved_view_down_stores_nothing`; `test_analysts_part_puts_ours_beside_theirs`.
- [ ] **Step 2–4:** run → fail → implement → pass.
- [ ] **Step 5: Commit.**

---

### Task 10: Protocol models and the snapshot (`protocol.py`, `dig/snapshot.py`)

**Files:** Modify `engine/src/tearsheet/protocol.py`; Create `engine/src/tearsheet/dig/snapshot.py`; Test `engine/tests/test_dig_snapshot.py`, `engine/tests/test_protocol.py`

**Interfaces:**
- Produces protocol models (all `Strict`): `DigParams{cik: int}`; `DigPartState = Literal["ok","stale","off","down"]`; `DigHeader{cik, ticker, name, sector, close, close_date, since_report, levels: WatchLevels | None}`; `DigReturn{period, stock, sector_median, spy}`; `DigSector`, `DigMarket`, `DigRate{id, label, value, date}`, `DigRates`, `DigColumn{key, label}`, `DigPeerRow`, `DigPeers`, `DigAnalystsOurs`, `DigAnalysts{…, view: ReportAnalysts | None}`, `DigTradeSide{trades, people, shares, value}`, `DigTrade`, `DigInsiders`, `DigNewsItem`, `DigTone`, `DigNews` (fields exactly as Tasks 4–9 produce; every part has `state: DigPartState`, `note: str | None`, `as_of: str | None`); `DigSource{part, name, as_of}`; `DigSnapshot{snapshot_id, cik, created_at, close_date, report_id, run_id, versions: dict[str, str | int], header, sector, market, rates, peers, analysts, insiders, news, sources: list[DigSource]}`; `DigPage{cik, ticker, name, has_report: bool, snapshot: DigSnapshot | None, older: int, refreshing: bool}`. Add all to `ALL_MODELS`; add `"NO_REPORT"` to `ERROR_CODES`.
- Produces: `new_snapshot_id(cik: int, now: datetime) -> str`; `async build(conn, paths, *, target: Target, live: DigLive, analystdb, method, now: datetime, snapshot_id: str) -> DigSnapshot` where `DigLive` is a small Protocol: `http` (for news), `form4_amounts(cik, *, today)`, `macro(day)`, `fred_key: bool`, `settings`, `rawstore`; `carry_forward(snapshot: dict, previous: DigSnapshot | None) -> dict` (a part that is `down` takes the previous part when that was `ok` or `stale`, marked `stale`, keeping its `as_of`); `save(conn, snapshot: DigSnapshot) -> None` (inserts once; `versions` = `{"dig_code": DIG_CODE_VERSION, "engine": __version__}`; `inputs_hash` = sha256 of the snapshot's `fetch_log` (request_key, raw_hash) pairs sorted, plus `report_id`, `run_id`, `close_date`); `newest(conn, cik) -> DigSnapshot | None`; `count(conn, cik) -> int`.
- Each part is built inside its own `try`, so one failure turns only that part `down` (its note says which service).

- [ ] **Step 1: Write the failing tests** — `test_build_saves_one_write_once_row` (fake live sources; `newest()` round-trips the model); `test_one_failing_part_does_not_stop_the_others`; `test_a_failed_part_comes_back_stale_from_the_previous_snapshot` (as_of kept); `test_a_never_fetched_part_is_down`; `test_inputs_hash_changes_with_the_fetched_bytes`; protocol: `test_dig_models_are_in_the_schema`, error code listed.
- [ ] **Step 2–4:** run → fail → implement → pass.
- [ ] **Step 5: Commit.**

---

### Task 11: Server methods and protocol 9

**Files:** Modify `engine/src/tearsheet/__init__.py` (`PROTOCOL_VERSION = 9`), `engine/src/tearsheet/protocol.py` (`METHODS`), `engine/src/tearsheet/server.py`; Generate `app/src/shared/protocol.ts` (`npm run gen-types`); Test `engine/tests/test_server_dig.py`, `engine/tests/test_protocol.py` (version ≥ 9, handlers exist).

**Interfaces:**
- Produces: `m_get_dig_deeper(p: DigParams) -> DigPage` (reads only: target names, newest snapshot, `older = count - 1`, `refreshing = cik in self.dig_jobs`; a company with no report and no prediction gives `has_report False` and no error); `m_refresh_dig_deeper(p: DigParams) -> DigPage` (in `OFF_LOOP`; `NO_REPORT` EngineError without a report or prediction; one job per company in `self.dig_jobs: dict[int, Task]` joined by a second call through `asyncio.shield`, as `m_fetch_history` does; fetches through `self._live_data(snapshot_id, conn, rawstore)` so the bytes and `fetch_log` rows are kept; analysts through `self.analystdb.saved_view`; never refuses while a report runs, since the SEC and Massive limiters are shared).

- [ ] **Step 1: Write the failing tests** — `test_get_is_instant_and_empty_before_a_refresh`; `test_refresh_saves_a_snapshot_and_get_returns_it` (Harness with a fake report, fake live data with Form 4/FRED/news answers, analystdb `Service(...)`); `test_two_refreshes_of_one_company_share_one_job`; `test_refresh_without_a_report_is_no_report`; `test_refresh_leaves_runs_predictions_and_reports_alone` (row counts before = after); `test_refresh_while_a_report_runs_is_allowed`.
- [ ] **Step 2–4:** run → fail → implement → pass; then `cd app && npm run gen-types` and keep the regenerated `protocol.ts`.
- [ ] **Step 5: Commit** (engine files plus `app/src/shared/protocol.ts`).

---

### Task 12: `replay-dig`

**Files:** Create `engine/src/tearsheet/dig/replay.py`; Modify `engine/src/tearsheet/cli.py`; Test `engine/tests/test_dig_replay.py`

**Interfaces:**
- Consumes: `replay._copy_read_only`, `dig.snapshot.build`, fetch_log rows of the snapshot id.
- Produces: `StoredHttp(conn, raw_dir, run_id)` with `async fetch(service, url, *, kind, expect="json", params=None) -> Fetched` serving the stored bytes whose `request_key == redact_url(full_url)` for that run (else `HTTPFailure`); `replay_snapshot(conn, raw_dir, snapshot_id) -> list[str]` (rebuilds the parts that were `ok` from stored bytes and prices up to `close_date`, with the snapshot's own report ids and `now`; returns the differing JSON paths, empty when identical; `stale`, `off` and `down` parts are compared as stored); CLI `tearsheet-engine replay-dig (--all | SNAPSHOT_ID)` exiting 0 identical, 1 different, 2 on error.

- [ ] **Step 1: Write the failing tests** — `test_replay_of_a_fresh_snapshot_is_identical`; `test_replay_reports_a_changed_byte` (tamper the stored news JSON in the copy: news path listed); `test_replay_dig_all_exit_codes` (CLI on a data folder with one snapshot → 0; none → 0 with "No snapshots").
- [ ] **Step 2–4:** run → fail → implement → pass.
- [ ] **Step 5: Commit.**

---

### Task 13: App bridge, news links and the call wiring

**Files:** Modify `app/src/main/ipc.ts` (`CALLS`: `getDigDeeper: 'get_dig_deeper'`, `refreshDigDeeper: 'refresh_dig_deeper'`), `app/src/preload/index.ts`, `app/src/preload/api.d.ts`, `app/src/preload/index.test.ts` (rows + closed key list), `app/src/main/ipc.test.ts`, `app/src/renderer/test/bridge.ts` (fakes), `app/src/main/external.ts`, `app/src/main/external.test.ts`; Create `app/src/main/newsSites.ts`.

**Interfaces:**
- Produces: `window.tearsheet.getDigDeeper(cik: number): Promise<CallResult<DigPage>>` → `call('getDigDeeper', { cik })`; `refreshDigDeeper(cik: number)` likewise. `NEWS_SITES: readonly string[]` (every entry of `methodology/allowlist.yaml`, all groups, as written); `isAllowedExternal(url)` also accepts https URLs whose host is a site's host or `www.` + it and whose path is under the site's path (the engine's `Allowlist.allows` rule).

- [ ] **Step 1: Write the failing tests** — preload rows `['getDigDeeper', [320193], ['tearsheet:call', 'getDigDeeper', { cik: 320193 }]]` and the refresh row; ipc `engineMethod('getDigDeeper') === 'get_dig_deeper'`; external: `https://www.reuters.com/x` true, `https://reuters.com.evil.io/x` false, `http://reuters.com/x` false, `https://www.bbc.com/news/business/x` true, `https://www.bbc.com/sport` false; `NEWS_SITES` equals the yaml's entries (test reads the yaml file, as `wording.test.ts` reads `wording.py`).
- [ ] **Step 2–4:** `cd app && npx vitest run src/preload src/main` → fail → implement → pass.
- [ ] **Step 5: Commit.**

---

### Task 14: The `dig` page's routes: nav, App, stock menu, Watchlist, report toolbar

**Files:** Modify `app/src/renderer/nav.ts` (`Page` gains `'dig'`), `app/src/renderer/App.tsx` (state `digOf: { cik: number; ticker: string } | null`, `openDig`, top bar `{ title: 'Dig deeper', subtitle }`, content `<Dig …>`, `ReportTools onDig`), `app/src/renderer/stock/menu.ts` and `StockMenu.tsx` (`StockActions.dig`, `StockExtras.here` gains `'dig'`, provider prop `onDig`), `app/src/renderer/pages/Watch.tsx` (`WatchProps.onDig`, a `Dig deeper` link button beside `Open report` in the Detail's Key numbers heading), `app/src/renderer/pages/Report.tsx` (`ReportTools` `onDig?: () => void`: a `plain cbtn` button `aria-label="Dig deeper"`, label shown when `wide`); Tests `menu.test.ts`, `StockMenu.test.tsx`, `Watch.test.tsx`, `nav.test.ts`, a ReportTools test.

**Interfaces:**
- Menu order (exact): `Open report`, `Dig deeper`, `Refresh report…`/`Write a report…`, `—`, watchlist entries, … (rest unchanged). `Dig deeper` is greyed `(No report yet)` without a report and `(Open now)` when `here === 'dig'`.

- [ ] **Step 1: Write the failing tests** — menu: `['Open report', 'Dig deeper', 'Refresh report…', '—', 'Add to watchlist', '—', 'Copy ticker', 'Open on SEC EDGAR']`; no report → `'Dig deeper (No report yet)'`; `here: 'dig'` → `'Dig deeper (Open now)'`. Watch: clicking the Detail's `Dig deeper` shows the Dig page heading. Report: the toolbar's `Dig deeper` button opens the page for the report's company.
- [ ] **Step 2–4:** run → fail → implement (a stub `Dig` page rendering the ticker is enough here) → pass.
- [ ] **Step 5: Commit.**

---

### Task 15: The Dig deeper page

**Files:** Create `app/src/renderer/pages/Dig.tsx`, `app/src/renderer/dig/dig.ts`, `app/src/renderer/dig/dig.css`, `app/src/renderer/dig/SectorChart.tsx`, `app/src/renderer/dig/RangeBar.tsx`, `app/src/renderer/test/dig.ts` (a fixture `DigPage` from the engine's own model); Modify `app/src/renderer/shared.test.ts` (`dig/dig.css` on `ON_SCALE`); Test `app/src/renderer/pages/Dig.test.tsx`, `app/src/renderer/dig/dig.test.ts`.

**Interfaces:**
- `DigProps { cik: number; refresh: number; onOpenReport(reportId: string): void; onNotify(...): void; onSubtitle(text: string): void }`.
- `dig.ts` (pure): `needsRefresh(page: DigPage, now: Date): boolean` (no snapshot, or created more than 6 hours ago); `partNote(part: { state; note; as_of }, source: string): string | null` (ok → null; stale → `From ${date}: ${source} didn't answer this time.`; off/down → the engine's note, else `${source} didn't answer.`); `toneLine(tone)`; `signed(v)` percent with sign; `asOfLine(snapshot)`.
- Loading: `getDigDeeper(cik)` on mount; when `needsRefresh`, call `refreshDigDeeper(cik)` once and show "Gathering today's numbers…" over the old snapshot (or a skeleton when none). A `Refresh` button does the same.
- Sections in this order, each an `<section>` with an `<h3>`: 1 "Today" (close, date, move since the report, the report's rating and range "as of <report date>"); 2 the range bar (bear, base, bull, close, buy and sell triggers as in the Watchlist); 3 "Sector" (chart of stock, sector and SPY; returns table; "Ranks n of N in <sector> over 12 months"); 4 "Market" (SPY 12 months, volatility percentile, momentum scaling note, rates); 5 "Peers" (table with a Median row, "as of the report" label on the number columns, the recomputed note); 6 "Analysts" (consensus, target range with our base marked, recent changes); 7 "Insiders" (buys vs sells, the trade list); 8 "News" (tone counts, items newest first with publisher, date and a tone chip; a title is a link only when `openable`, opening with `openExternal`); 9 "Sources" (each part's source and date) and `ADVICE_SHORT`.

- [ ] **Step 1: Write the failing tests** — `Dig.test.tsx`: renders the nine headings in order from the fixture; a `stale` part shows its note; refresh button calls `bridge.refreshDigDeeper(cik)` and re-renders with the new snapshot; an `openable` news title calls `openExternal(url)`, a non-openable one is plain text; first open with no snapshot refreshes automatically; a failed load shows "Dig deeper didn't load: …" with Try again; `ADVICE_SHORT` is on the page. `dig.test.ts`: `needsRefresh` edges (exactly 6 hours), `partNote` for each state.
- [ ] **Step 2–4:** run → fail → implement → pass (coverage floor for renderer `.tsx`: 96 lines / 86 branches).
- [ ] **Step 5: Commit.**

---

### Task 16: Verification and the by-eye check

- [ ] **Step 1: App checks** (in `app/`): `npm run typecheck`, `npx vitest run --coverage`, `npm run build`, `npm run gen-types` then `git diff --exit-code src/shared/protocol.ts`.
- [ ] **Step 2: Engine checks** (in `engine/`): `uv run ruff check .`, `uv run ruff format --check .`, `uv run pytest -q`, `uv run tearsheet-engine --data-dir tests/fixtures/runs replay --all` (unchanged).
- [ ] **Step 3: Score drift on real data, read-only:** on a sqlite-backup copy of Liam's database, `recompute_scores` for every run with a prediction; report how many match `predictions.score` (to 1e-6) and list any that don't.
- [ ] **Step 4: Snapshots on the copy:** with the development engine (Keychain keys), `refresh_dig_deeper` for 2–3 companies with reports on the copy only; then `replay-dig --all` on the copy → identical. Row counts of `runs`, `predictions`, `reports` before = after.
- [ ] **Step 5: Test build, hidden window** (check `ps` for a running Tearsheet first; build into the worktree's own `app/dist` with `npm run package:test`; confirm `Contents/Resources/test-build.txt`; launch with `open -g -j -n -F -a … --env TEARSHEET_DATA_DIR=<copy> --env TEARSHEET_HIDDEN_WINDOW=1 …`; drive over CDP; never take focus). Screenshot the page for each company; send them to Liam.
- [ ] **Step 6: Commit** any fixes; report the branch name and stop for Liam's OK.
