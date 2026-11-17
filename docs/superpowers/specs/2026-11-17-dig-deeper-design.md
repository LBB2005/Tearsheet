# Dig deeper: the research step before buying

## Context

Liam's path to buying a stock has four steps:
1. A report on every big stock. Done: 498 predictions.
2. Compare. The Prediction log's Good picks screen, which about 74 stocks pass today.
3. **Research further.** Missing. This plan covers it.
4. Buy. That happens outside the app.

In Liam's words, step 3 is "sector, market condition, peers, how the competitors compare, analyst predictions". On top of that, the AI should think like a top investor and say what to do. News "is very important", and sentiment matters too.

**Dig deeper** is a new page for one stock, showing *today's* picture. A report stays frozen at its date.

## What Liam decided (17 Nov 2026)

- **Page.** A new page for one stock (2–5 side by side can come later). It opens from:
  - the stock menu;
  - a Watchlist row;
  - the report page.
- **Data first, AI on top.** This is the existing Tearsheet rule: the engine works out every number, and the AI writes only placeholders and cites its sources.
- **Data shown:**
  - the sector;
  - market conditions;
  - the stock beside each peer;
  - analyst targets and moves beside ours;
  - insider buying and selling;
  - fresh news since the report, with its tone.
  - Social buzz comes **last**, only if a free source exists. Liam makes any accounts.
- **The AI take runs only on a click:**
  - "Write the take" on one stock's page;
  - one Watchlist button that runs it for every stock on the Watchlist in turn.
- **One blended investor checklist,** the same for every stock:
  1. Is it a great business?
  2. Is the price below what it's worth, with room to spare?
  3. What could kill it?
  4. Are the sector and the market behind it?
  5. What would make you sell?
- **No second rating.** The take ends with a **next move**:
  - the price worth buying at, which is the **Buy trigger**, worked out by code and labelled "Our numbers turn Buy at $X";
  - what to check first;
  - what would prove the idea wrong.
- **What the AI reads:**
  - the Dig deeper numbers;
  - the newest report;
  - fresh news;
  - **analyst data.** This changes the 7 Nov rule, but **only in Dig deeper**: reports and the score don't change, and the analyst answer is saved before the AI call so the take can be checked.
- **News source.** Massive news, which carries per-ticker sentiment. If Liam's plan doesn't include it, the backup is **the AI's web search** (the reports' allowlisted news search), and the AI judges the tone.
- **Sentiment** never enters the score or the rating. It's shown on the page and read by the take only.
- **Takes** are saved and dated. The page shows the newest, and older takes stay listed.

## My calls (Liam can overrule)

- **Peers** show the report-date metrics and scores, labelled "as of the report", plus price returns to today.
- **News links** open in the browser for allowlisted outlets only. This widens `isAllowedExternal` in `app/src/main/external.ts`.
- **Version.** A separate `DIG_CODE_VERSION = 1`. `METHOD_CODE_VERSION` stays 4, since report numbers don't change.
- **Takes are write-once,** with no delete in the first version.
- **The run-all line:**
  - covers the Watchlist on show;
  - skips stocks with a take from the last 7 days;
  - only starts a take when no report is running and the report line is idle.
- **Fix:** a shared SEC rate limiter, so a Dig deeper refresh can't push a running report over SEC's limit.

## How it gets built

Liam asked for **one nested build session** in its own worktree. It works phase by phase. After each phase it stops, shows Liam the work in a hidden test window on a copy of the data, and waits for his OK before the next phase. This coordinator session merges, builds, swaps and pushes, each step only after Liam says yes.

The session starts by writing this plan as `docs/superpowers/specs/2026-11-17-dig-deeper-design.md`. It records the analyst-rule change in `docs/designs/tearsheet.md`, then plans each phase with writing-plans.

### Phase 1: the data page (no AI)

**Engine:** a new package, `engine/src/tearsheet/dig/`.

- **`target.py`.** Move the "report on show" query out of `watchlist._companies` into a public `watchlist.levels_for(conn, cik)`. It reuses `_levels_from_row`, `_levels_from_prediction`, `_at` (split-adjusted) and `companies.since_report`.
- **`sector.py`.**
  - Members from `membership.stored_or_bundled(conn).sector_members()`.
  - Lines from `charts._index` for the stock, the sector and SPY. It gives no line when a member has no closes, so filter those members first.
  - `PriceStore.total_return` over 1, 3, 6 and 12 months, plus the stock's rank in its sector.
- **`market.py`.**
  - SPY via `pipeline.twelve_month_return` and `scoring.momentum_scaling`.
  - FRED via `LiveData.macro` (`sources.py`) with `report_numbers.FRED_LABELS`.
- **`peers.py`.**
  - The report's run: `peer_groups` plus `key_numbers._Stored` and `.peer_median`.
  - Peer scores recomputed with `scoring.score_group`, using the run's stored methodology copy and labelled "recomputed".
  - The newest `predictions` row for each peer.
- **`analysts.py`.** Display only in this phase: `data/analystdb.py` `AnalystDB.view` (consensus, events, crosscheck).
- **`insiders.py`.**
  - `LiveData.form4_trades` over 183 days, P (buys) vs S (sells), plus `flags.insider_buying_note`.
  - Share amounts from a new `sec.form4_amounts`.
- **`news.py`.**
  - Add `config.MASSIVE_NEWS = "/v2/reference/news"`.
  - Fetch the ticker's news from the report date, keeping title, publisher, date, URL and `insights` sentiment. Code counts the tone.
  - When the plan refuses ("not entitled"), the part goes "off" and is retried weekly. Never add massive to `keys_refused`.
- **`snapshot.py`.** Save and load snapshots, with all fetches going through `server._live_data`, so the bytes and fetch_log rows are kept.
- **Massive probe first.** `scripts/phase0/massive_news.py` prints only "news: included" or "news: not on this plan" and never prints the key. Liam runs it, or OKs the session running it. The result goes in `docs/phase0-results.md`.

**Database:** `0007_dig_snapshots.sql`. A write-once table `dig_snapshots` (id, cik, created_at, close_date, report_id, run_id, versions, inputs_hash, json).

**Protocol 9:**
- `get_dig_deeper {cik}`, which is instant;
- `refresh_dig_deeper {cik}`, which runs off the loop;
- each part has a state: ok, stale, off or down.

**App:**
- **Routing:** `nav.ts` (the `'dig'` page) and `App.tsx` (state, `go`, bar, content).
- **The page:** new `pages/Dig.tsx`, `dig/dig.ts` (the logic) and `dig/dig.css`.
- **The stock menu:** "Dig deeper" in `stock/menu.ts` and `StockMenu.tsx`. It's greyed "No report yet" without a report, and greyed "Open now" on the page itself.
- **Watchlist:** a link in the Detail view of `pages/Watch.tsx`.
- **Report:** a button in `ReportTools`.
- **Wiring:** `main/ipc.ts` CALLS, `preload/index.ts`, `api.d.ts` and `index.test.ts`, then `npm run gen-types`.

**Page order:**
1. Today's close and the move since the report, with the report's rating and range "as of the report date".
2. Price on the bear/base/bull bar, with the triggers.
3. Sector chart, returns and rank.
4. Market: SPY, volatility and the rate figures.
5. Peers table, with a median row and our predictions.
6. Analyst targets and moves beside ours.
7. Insiders.
8. News with tone.
9. Sources and `ADVICE_SHORT`.

### Phase 2: the AI take for one stock

- **Prompt:** `ai/prompts/dig_take.md` (`version: dig_take-1`): the 5 questions, placeholders only, cited source IDs, a stance per sentence, and no rating or verdict.
- **Schemas:** `TakeAnswer` and `TakeDraft{answers, check_first, proven_wrong}` in `ai/schemas.py`. The connectors get `dig_take: "sonnet"` in `CLAUDE_MODELS`.
- **`dig/sources.py`.** Builds the take's sources:
  - report claims and their paragraphs;
  - code-written data paragraphs, `dig:<part>#pN`;
  - news split by `text.parse.split_paragraphs`, which marks instruction-like text;
  - analyst data via a new `AnalystDB.saved_view` that calls `RawStore.put` **before** the AI call.
- **The news backup.** When Massive news is off, `news.search_links` gets a new optional `start` date (the default stays the same).
- **`dig/levels.py`.** The `level:*` placeholders, including the Buy trigger from `watchlist.Levels.trigger`.
- **`dig/take.py`.**
  1. `NumericGuard.check`, `check_citations` and `render.fill`.
  2. A new `dig/wording_guard.py` that removes advice or verdict phrases.
  3. `skeptic_section` on the other tool via `checker_for`.
  4. `decide()`, with at most one rewrite.
  5. The take is saved once.
- **Budget:** `TAKE_CALL_BUDGET = 8`.
- **Server.** `write_take`, `cancel_take` and `list_takes`, with the notifications `take_progress` and `take_done`. A take and a report never run at once; each refuses while the other runs.
- **Database:** `0008_dig_takes.sql`, a write-once `dig_takes` table.
- **Protocol:** 10.
- **Wording:** `TAKE_LINE` in `wording.py`, mirrored in `wording.ts`.
- **App:** an "AI take" section with:
  - the button, greyed with a reason when it can't run;
  - progress;
  - the 5 answers with citation chips;
  - a Next move box;
  - older takes, listed by date.

### Phase 3: Watchlist "Write takes for all"

- **`dig/take_line.py`.** A `TakeLine` built on `batch.ReportLine`, kept in the setting `take_line`. It reuses the pauses (usage, offline, reopened). It has its own `_take_line_loop`, modelled on `_line_loop`, and shares the one job slot.
- **Protocol 11:**
  - `start_take_line`, `get_take_line`, `carry_on_take_line`, `clear_take_line` and `remove_from_take_line`;
  - the notification `take_line_changed`.
- **App:** a button and confirm on the Watchlist, a strip reusing `home/LineParts`, and a "take <date>" chip on each row.

### Phase 4: social buzz (only if a free source exists)

- The session checks ApeWisdom, the Reddit API and StockTwits (terms, cost, per-ticker data) and writes `docs/research/social-sources.md`.
- Liam picks one and makes any accounts himself.
- Then a new `data/social.py` adds a "social" part, which is display and AI input only.
- If no source qualifies, nothing ships.

## Rules the build session keeps

- **Never run a live full report on a real company.** It becomes an official prediction.
- **Test windows:** hidden, on a data copy, using a test build. Open the live database read-only.
- **The repo is public:** no keys, emails or home paths, and nothing from `docs/outreach/`.
- **Commits:** by pathspec, each message ending with the Co-Authored-By line. No merge or push without Liam's yes.
- **Database changes** only add tables or columns.

## Risks to watch

- **Massive's 5 calls a minute** are shared with the price backfill, so a refresh can wait.
- **Recomputed peer scores can drift** from the stored ones.
- **Prompt injection through news text.**
- **The sources' size against the AI time limit.**
- **Wording:** the "Buy trigger" and the Next move box must read as the method's numbers, not advice.

## Verification

- **App checks:** `npm run typecheck`, `npx vitest run --coverage`, `npm run build` and `npm run gen-types` (unchanged after the run).
- **Engine checks:** `uv run ruff check .`, `uv run ruff format --check .` and `uv run pytest -q`.
- **Replay:**
  - `uv run tearsheet-engine --data-dir tests/fixtures/runs replay --all` must not change;
  - a new `replay-dig --all` rebuilds each snapshot and, from Phase 2, re-checks each take's stored draft.
- **Engine tests:**
  - recorded Massive news (both the included and the not-on-plan answers), Form 4 and FRED fixtures with no keys;
  - the recomputed composite equals `predictions.score` for the fixture runs;
  - the runs, predictions and reports row counts don't change;
  - fake-connector takes that cover every removal path, the rewrite, the advice guard and a usage limit;
  - the analyst data is stored before the AI call;
  - a take and a report never overlap.
- **App tests:**
  - `Dig.test.tsx`;
  - `menu.test.ts` with the exact order;
  - `Watch.test.tsx`;
  - the preload and ipc key lists.
- **By eye:** a hidden test-build window on a copy of the data. Open Dig deeper for 2–3 companies with reports, then send Liam screenshots before each phase is called done.
