# Phase 1 progress (overnight build, 4–5 Nov 2026)

*   **Status:** Phase 1a, the thin slice, is built and works end to end, and so does a plain Mac app (Phase 1c, below). Phase 1b is well under way. A `--full` mode adds every metric, all three valuation methods, the red-flag caps, all six AI-written sections from their design sources, and the skeptic with one rewrite. The six sections are: 4 business, 5 risks, 6 results with the earnings release, 7 news with articles and press releases, 8 trends from the 3 largest peers and FRED, and What to watch. `replay` and `resume` work, and so do the Goal 1 commands (`flag`, `spot-check`, `goal1`). The prediction log is switched on (Phase 2, below). Live runs and live checks are recorded in the sections below.
*   **Tests:** 403 offline tests pass (up from 152), including a full-mode run through the **live** data source with every service mocked (SEC, iShares, Massive, FRED). So the live wiring has run at least once., and `ruff check` and `ruff format --check` are clean.

## Try it

These run offline, on the data the Phase 0 tests downloaded, with no AI calls. Run them from `~/code/Tearsheet`:

```bash
uv run --project engine tearsheet-engine --data-dir /tmp/tearsheet-try run AAPL --no-ai --stored "$HOME/Library/Application Support/Tearsheet/phase0/sec-20261104T225557Z" "$HOME/Library/Application Support/Tearsheet/phase0/massive-20261104T234606Z"
```

```bash
uv run --project engine tearsheet-engine --data-dir /tmp/tearsheet-try run AAPL --no-ai --full --stored "$HOME/Library/Application Support/Tearsheet/phase0/sec-20261104T225557Z" "$HOME/Library/Application Support/Tearsheet/phase0/massive-20261104T234606Z"
```

Each run prints the path of an HTML report. Only the information technology sector has stored prices (from the Massive test), so only AAPL and its peers work offline.

The live command is `tearsheet-engine run AAPL`. It downloads from SEC, Massive and FRED. It hasn't been run yet. Running it is your step.

*   **Slice:** about 7 Claude Code calls (4 to extract, 3 to write).
*   **`--full`:** about 25–45 calls. That's 1 link search; 12 filing extractions (5 company sections, the earnings release, up to 5 press releases and 3 peers' MD&A); up to 15 articles; 6 sections; 6 skeptic checks; and up to 6 rewrites. Article reads are cut first if a run would pass the 50-call budget.
*   **Offline full-mode smoke test** (Apple's stored filings, scripted AI): 24 calls in about 6 seconds.

## What was built (design items)

| Item | Files | Notes |
| :-- | :-- | :-- |
| 14–15 Methodology bundle | `methodology/*.yaml`, `methodology/__init__.py` | Drafter defaults from the design. The methodology hash and reference version ignore comments and key order. Copies are stored per run. |
| 16–17 Database | `db/migrations/0002_report.sql`, `db.backup` | All the report tables. Predictions are write-once and claim reviews add-only, both enforced by triggers. Backups keep 10 copies. |
| 18 S&P 500 list | `data/membership.py`, `data/sp500_bundled.csv`, `scripts/build_sp500_bundled.py` | The bundled list, as you chose: 500 companies (503 tickers) from the SPY file plus Wikipedia's sectors and CIKs. IVV is tried first, then the last good copy, then the bundled list. |
| 19 Prices | `data/prices.py` | Total return with dividends reinvested, splits, the 40% split check, and NYSE staleness. |
| 20 FRED, analysts | `data/fred.py`, `data/analyst.py` | Analyst consensus is left out, as you chose; the report says so. |
| 21 Resolve | `resolve.py` | Ticker, then alias, then close name match. Rated class and provider spellings. |
| 22 Normalize | `normalize.py` | Trailing 12 months, point in time, tag preference with stale-tag detection, split adjustment. Checked by hand against Apple's, Nvidia's and Microsoft's real filings. |
| 23 Text layer | `text/parse.py`, `text/compare.py` | Sections, paragraph IDs, the Exhibit 13 fallback, marked instruction-like paragraphs, year-over-year change score. |
| 24–26 Peers, metrics, score | `peers.py`, `metrics.py`, `scoring.py` | All 15 metrics; the slice uses one per factor. Momentum scaling uses SPY. |
| 27–28 Valuation, rating | `valuation/{dcf,residual_income,multiples,financials,combine,range}.py`, `rating.py` | All three methods. Banks and insurers: residual income + P/E. REITs: residual income + price ÷ FFO, with FFO from the tags in `valuation.yaml`, labelled an approximation. Range, uncertainty, trigger prices, probability, peer mix. |
| 25 Red flags | `flags.py` | The 4 rules, and the insider-buying note (open-market purchases in the last 6 months that aren't routine), fed by Form 4 owners, dates and codes (`sec.form4_trades`). On Apple's stored Form 4s: no non-routine purchases. |
| 29–31 AI steps | `extract.py`, `narrate.py`, `prompts.py`, `ai/prompts/{extract,narrate}.md` | Evidence cache, 60,000-token split, cited-ID and quote checks. |
| 31–33 Render and checks | `render.py`, `templates/report.html.j2`, `verify/{numeric_guard,citations,quotes,flow}.py` | Escaped HTML with its own content-security policy. Numeric guard, citation check, decision flow. |
| 34 Pipeline | `pipeline.py`, `sources.py`, `cli.py run` | Live and stored data sources. Step outputs saved, usage-limit stop, failed calls dropped per section. |
| 7, 9 News (full mode) | `pipeline.py` news step, `ai/prompts/news_search.md`, `sources.py fetch_article` | Link search with web search only, the allowlist filter, the 15-article cap with the budget cut, articles saved, one extraction per article. Article text reaches only section 7. The prompt now asks for links spread across sites (the Phase 0 Apple finding). |
| 31 Sections 6–8 (full mode) | `pipeline.py`, `sources.py` (`peer_documents`, `macro`, releases) | Section 6 from the 10-Q MD&A, 10-K Item 7 and the earnings release (8-K Exhibit 99.1). Section 7 adds the press-release 8-Ks. Section 8 is built from the 3 largest peers' 10-K Item 7, the company's own trend items, and FRED (unemployment, real GDP growth, the 10-year yield, and 12-month changes in prices and the dollar). The FRED values use a new `{{macro:…}}` placeholder. Peer text reaches only section 8. |
| 33 Skeptic (full mode) | `verify/skeptic.py`, `ai/prompts/skeptic.md`, `pipeline.verify` | Self-checked (same tool, fresh session). Unsupported claims are removed; tone shows as a note. One rewrite when more than 30% of claims are removed or marked tone. |
| 38 Replay | `replay.py`, `cli.py replay`, `RawStore.read` | `tearsheet-engine replay <run ID>` copies the database into memory (opened read-only), re-runs steps 1–8 from only that run's logged inputs with the methodology from the run's stored copy, and compares every step output and every metric for exact equality. It exits non-zero on a difference at the same method code version. Live runs now store their methodology copies. |
| 34 Resume | `pipeline.resume_run`, `cli.py resume`, `mark_interrupted` | `tearsheet-engine resume <run ID>` continues a stopped or interrupted run under the same run ID and AI tool. Steps 1–8 are re-run from the run's own stored inputs and methodology (as in replay), so the numbers can't change. Saved evidence means no filing is read again. The report is saved as a new version. Runs still marked running are marked interrupted when `run` or `resume` starts. News articles aren't re-read on resume. |
| 36 Goal 1 | `goal1.py`, `cli.py` (`flag`, `spot-check`, `goal1`) | One add-only `claim_reviews` table with the label mapping in item 36 (**please confirm it**). Every citation is checked in the first 3 counted reports, then 5 at random (seeded by the report ID). The tally covers reports, companies, sectors, bank or REIT, confirmed errors, failed citations, the yes share, and the outside-checker trigger. Full-method reports record the `goal1_round` setting. |
| 35 Prediction log | `predictions.py` | The official-run rule (30 × 24-hour window), write-once rows, no-valuation Hold, previous rating, backup after each, CSV/JSON export. **Not called by runs yet**: rows can never be deleted, so it should be switched on only when the full method is done and you agree. |

## Phase 1c: the Mac app (5 Nov 2026)

*   **Engine side (item 37):** `tearsheet-engine serve` speaks JSON-RPC on standard input and output. It sends `hello` first, writes only protocol messages to standard output, and allows one run at a time. It handles every request in item 37 and sends `progress`, `report_ready` and `run_failed`, with the error codes. `protocol.py` defines the messages; `scripts/gen-types.sh` generates `app/src/shared/protocol.ts` from them.
*   **App (items 41–47):** Electron 33, electron-vite, React and TypeScript, in `app/`.
    *   The PATH fix, tool detection and the engine process manager, which restarts the engine if it crashes.
    *   The fixed bridge of named calls, and the window security settings: context isolation, the sandbox, no Node, and its own content-security policy.
    *   Six screens: New report, Progress (with Resume and Cancel), Reports (the report in a frame with an empty `sandbox` attribute, plus the flag note box), Prediction log, Settings and Connections.
*   **Checked by driving the real app** (Playwright against the built app, on your data folder):
    *   your Apple report displays;
    *   all 38 "flag this claim" links reach the handler and open the note box, and the frame stays on the report;
    *   Connections finds Claude Code 2.1.317 and Codex, both signed in;
    *   Settings shows the keys as set without showing them.
*   **Not driven yet:** a whole new report from the window. That would spend about 40 Claude Code calls. The engine side of that flow is covered by `test_protocol.py`.
*   **The early Phase 1c check (item 47) found one problem.** The window's policy `frame-src 'self'` blocked the frame's `tearsheet://` links before Electron's `will-frame-navigate` event fired. The window now lets the frame *start* `tearsheet:` and `https:` navigations, and the main process cancels every one of them (`navigation.ts`, tested). The design's policy line should say `frame-src 'self' tearsheet: https:`.
*   **Tests:** 420 engine tests and 11 app tests. CI runs the app job (typecheck, tests, the check that the generated types match, and the build) on macOS.

## The first live run (Apple, 5 Nov 2026, `run AAPL --full`)

*   **Status:** done, in 27 minutes, most of it the one-time price download for 41 stocks at Massive's 5 calls a minute. 38 Claude Code calls on Haiku 5.5 and Sonnet 5.5, under the 50-call budget.
*   **Rating:** Hold, capped by the risk-factor flag. Same numbers as the offline run: score at the 79th percentile, estimated value $285.03 against a price of $349.51.
*   **News:** 13 links suggested and 9 articles read; 4 were paywalled. That compares with 1 article for Apple in Phase 0, so the spread-across-sites prompt fixed it.
*   **Writing:** 38 sentences kept and 17 removed. The kept text is specific and cited: memory-cost pressure, App Store rulings, Google search licensing, AI capex at peers.
*   **Three problems found and fixed** (403 tests):
    1.  The numeric guard blocked period names like "September-quarter record" and "fourth-quarter margin". Hyphenated forms now count like spaced ones, and a month followed by "quarter" is a period name. This was 9 of the 17 removals.
    2.  The skeptic saw raw placeholders. It now sees the filled-in values, with a note that code computed them.
    3.  "10-year Treasury yield" was blocked, so it's now on the names list.
    *   Also fixed: section 8 was printed before section 7, and two lines of mode wording were out of date.
*   **The 7 remaining removals were correct.** They stated numbers in words or digits ("twelve months", "three fiscal years", "12 months"), or the skeptic found them unsupported.

## What the offline runs showed (AAPL, stored data from 4 Nov)

*   **Speed.** The whole slice run takes about 3 seconds, so valuing 40 peers is far under the 3-minute goal (item 34's end-of-1a measurement). The other end-of-1a measurement, the usage script on 3 real slice reports, needs live runs.
*   **Slice:** Hold. Score at the 65th percentile. DCF value $144 against a price of $349.51. Uncertainty high (medium volatility, plus the "one method" trigger). Buy trigger $247.40.
*   **Full method:** score at the 79th percentile. DCF $144, residual income $723, multiples $285, so the estimated value is $285. Gap percentile 70.
    *   That would be a **Buy**, but the risk-factor red flag caps it at **Hold** (see below).
    *   Peer mix: 8 Buy, 26 Hold, 7 Sell.
*   **The checks work as designed.** In the smoke test, the numeric guard removed "Revenue doubled", the citation check removed a sentence citing a paragraph that wasn't sent, and both show in "Removed claims" with the direction split.

## Questions for you (calibration, Phase 1b)

1.  **The risk-factor red flag fires on Apple.** Apple's 2026 Item 1A scores 39% change against the 30% line, with a 0.8 match cut-off.
    *   The section grew from 9,782 to 12,332 words.
    *   **It's real rewording, not a parsing artifact.** Only 1 of the 47 unmatched paragraphs appears word for word in last year's text. Apple rewrote much of the section, including new tariff and AI-competition text.
    *   At a 0.7 cut-off the score is 29.6%.
    *   The rule as designed flags heavy *rewording*, which doesn't always mean new *risk*. Options:
        *   keep it;
        *   raise the threshold;
        *   lower the match cut-off;
        *   count only *added* words, not rewording.
    *   I'd measure it on the golden set before choosing.
2.  **Residual income for heavy-buyback companies.** Apple's tiny book value gives a return on equity of 142%, so residual income values it at $723. The design only makes the method "not meaningful" when book value is zero or below. You may want a cap on starting return on equity, or a "not meaningful" rule above some level.
3.  **The DCF is far below price for big tech:** Apple $144, Microsoft $222 against $556. The main reason is reinvestment at the *peer median* sales-to-capital (about 1.0), when Apple's own is about 3. It's the design's rule, and the rating is relative to peers, but it's worth a look on the golden set.

## Phase 2: grading, Codex and the other-tool skeptic (5 Nov 2026)

Not committed yet. Nothing here made a live AI call.

*   **Grading (item 48):** `grading.py` and `methodology/grading.yaml`.
    *   It grades each logged prediction at 3, 6 and 12 months against its fixed peer list.
    *   It uses the Hold band scaled by √(months ÷ 12), and the range shrunk to the horizon.
    *   The scores are hit rate, interval score and Brier score, against a seeded random-mix baseline and an always-Hold baseline. The intervals are Wilson and bootstrap.
    *   The headline count keeps one prediction per company per rolling year. The label stays "descriptive, not conclusive" until 200 are graded.
    *   When the rules change, it grades everything again as new rows; old rows are never overwritten.
    *   Grading fills later prices through the shared Massive limiter, then makes a backup.
    *   Runs now record every peer's ticker, so grading can fetch peers later.
*   **Where grading runs:**
    *   `tearsheet-engine grade` in the terminal;
    *   the `grade_due` request, which waits for any report;
    *   automatically when the app opens;
    *   a "Grade what is due" button on the Prediction log, which now shows each horizon's hit or miss.
    *   With no predictions logged, it makes no requests.
*   **The Codex connector (item 10):** `ai/codex.py`, with 24 tests against a scripted fake `codex app-server`.
    *   The settings were read from your installed codex-cli 0.165.0's own protocol schema (`codex app-server generate-json-schema`, which runs offline). Each one is a named constant with a row in `docs/phase0-results.md`.
    *   **One design change to agree:** no Codex approval policy asks before its known-safe read commands (`untrusted` runs `cat` and `ls` without asking). So the connector switches the shell tools off at start-up instead of relying on approvals. Every approval request that still arrives is denied and counts as a tool-use attempt. The pass mark "a planted file read produces an approval request, which is denied" becomes "no command ever runs".
*   **The first Codex check (6 Nov) failed on two things, now fixed so Codex connects with no setup:**
    *   **Tool servers:** two stayed loaded (`computer-use` and `node_repl`). They are servers in your own Codex settings, not plugins. The connector now asks Codex which servers and plugins it has, and starts it again with each one switched off by name. A second check on 6 Nov still showed them, because the connector read the wrong field. That's fixed, and on your Mac, with no AI calls, the connector's start-up now reports nothing loaded.
    *   **Your own `~/.codex/AGENTS.md`:** it loaded, and Codex has no setting to stop that. The only other way out is a second sign-in, and you chose seamless. So that one file is allowed, and Codex is told it doesn't apply. Any other instruction file still fails, including the planted bait file, which never loaded.
    *   Everything else passed: 20 of 20 answers valid, no tool use, no leaks, the ChatGPT sign-in, and model `gpt-6-astra`.
*   **Connecting with no setup:** a tool you already have, Claude Code or Codex, is used straight away. If it has never been checked, or its version changed, the 5-call short check runs automatically before its first use. Only a tool that failed a check needs the terminal command.
*   **Design wording to update:**
    *   "no instruction files load" gains "except the user's own Codex `AGENTS.md`";
    *   a tool counts as connected when it is found and not blocked, and the short check runs on first use.
*   **Codex passed its full lock-down check on 6 Nov (third run):** 20 of 20 answers valid, no tool use, no leaks, nothing loaded, and your ChatGPT sign-in. Codex is connected, so the next full report's skeptic runs on Codex.
*   **The other-tool skeptic (item 48):** when both tools are found and have passed their lock-down checks, the skeptic runs on the other one, and the report says "checked by Codex".
    *   It shares the run's one 50-call budget.
    *   If a call there fails, even on a usage limit, the rest of the draft is self-checked. The report says which sections, and why. The run isn't stopped.
*   **Connections** now shows each tool's lock-down state.
*   **The prediction log is switched on** (you agreed, 6 Nov). Each company's first live full report in any 30 days logs an official prediction at the end of step 8. A withheld rating doesn't use up the slot.
    *   A row holds the rating, score, range, uncertainty, percentile lines, filings and their latest SEC acceptance time (grading starts after it), methodology hash, versions, AI tool and models, and a hash of the run's inputs. The peer list is the run's own.
    *   Rows can't be changed: the database refuses edits and deletes. A backup follows each one.
    *   Only live runs log: offline runs on stored data, replays and resumes never do. The report and the terminal both say what happened, and the report shows the previous official rating.
    *   The prediction's ID is kept off the saved step outputs, so a logged run still replays identically (tested).
*   **Tests:** 486 engine tests and 11 app tests pass. The app typechecks and builds. Both the log and Connections were checked in the real app.

## Decisions I took (none change a design rule)

*   **The value-gap share is stored as `value_gap_years: 3`** in `rating_lines.yaml`, rather than 0.333…, so trigger prices come out exact.
*   **EBIT fallback.** When a company has no operating-income line (IBM, KLA), EBIT = pre-tax income + interest expense, and the tags are shown.
*   **Stale XBRL tags.** A tag whose newest value is more than 400 days older than the company's newest period is ignored. Example: Apple stopped using `InterestExpense` in 2023.
*   **When a close counts.** A session's close counts as available from 7pm New York time. Phase 0 saw the 4 Nov close by 6:46pm.
*   **Market value is approximate for multi-class companies.** It's the rated class's price × all shares outstanding; per-class prices come later.
*   **A section with no evidence from its sources isn't sent to the AI.** Nothing could pass the citation check, so the call would be wasted. The report says so.
*   **No rewrites in the slice.** The full mode allows one per section, as designed.
*   **A new placeholder family, `{{macro:<FRED series>}}`,** for the economic series in section 8. The design lists metric, value, price, date, consensus and quote.

## The rest of the build (6 Nov 2026)

*   **Replay covers step 12.** A replay now also compares the text code writes: sections 1-3, the red flags and the trigger prices.
    *   It found that the score table listed factors in a different order from run to run. Now fixed.
    *   Older stored runs replay with today's database layout.
    *   `replay --all` replays every finished run.
*   **Stored test runs.** `engine/tests/fixtures/runs/` holds a thin-slice run and a full run on the synthetic test companies, built by `scripts/make_test_runs.py`. They are under 1 MB, with no keys or personal data.
    *   CI replays them on every push, so a change that moves a number fails until it's deliberate. Rebuild them only for a deliberate change, together with a `METHOD_CODE_VERSION` increase.
    *   CI also enforces the 85% coverage bar on the number-making modules (now 94%).
*   **Share classes.** SEC's company facts drop anything reported by class. For Berkshire that leaves no share count at all, so it got "no valid valuation".
    *   The engine now reads the counts from the latest 10-Q or 10-K cover page instead, per class, and converts them to the rated class (1 BRK.A = 1,500 BRK.B).
    *   It was checked on Berkshire's stored 10-K: 511,820 A shares and 1,389,605,139 B shares.
    *   Alphabet's classes trade one-for-one and are priced alike, so they're added as before.
*   **News.** 27 free or mostly-free business and industry sites are added to the allowlist. Every article the engine couldn't read is now recorded with its site and the reason.
    *   `tearsheet-engine news-sites` lists reads and skips per site, and flags sites that are never read.
    *   To drop a site, list it under `remove:` in your `allowlist.local.yaml`.
*   **The golden set** (`evals/golden/`, `tearsheet-engine eval golden`). It holds the design's 20 companies, each with its hard case.
    *   It runs steps 1-8 offline from a frozen store, with no AI.
    *   It checks your hand-checked numbers (within 0.5%, exact for share counts and dates).
    *   It flags a company that no longer shows its hard case.
    *   It lists every rating, score and range change since `last_run.json`.
    *   **Your steps:**
        *   `eval golden --freeze` downloads the inputs once, live. Expect several hours: each new sector's prices take about 15 minutes on Massive's free plan.
        *   Then `eval golden --draft-checks` prints candidate numbers. Check each against EDGAR and paste them into `hand_checked.yaml`.
        *   Then `eval golden --update` writes `last_run.json`.
        *   One slot is left for a company with a restatement or a negated going-concern mention, found by an EDGAR full-text search.
*   **Prompt injection.** A planted article tells the AI to run commands, read a key, open an address, change the rating, break out of its source markers and put a phrase in the report.
    *   The offline test (`test_injection.py`) uses an AI that obeys it. It checks that:
        *   the article reaches only section 7's calls;
        *   its marker break-out is defused;
        *   its paragraph is marked, and the skeptic is told to take extra care with it;
        *   none of the obeying sentences survive;
        *   the rating and every number are unchanged.
    *   The live version (`tests/live/test_prompt_injection.py`) runs only with `-m live`, at about 35 Claude Code calls. It's your call.
*   **Fixed: a stale-price run could have logged an official Hold.** With stale prices, the report withholds sections 1-3, but the rating code still returned a placeholder Hold. The log now skips any withheld rating (tested).
*   **Backups.** A backup now has a test showing it opens with every prediction and its peer prices.
*   **Timings** (item 34). Two marks were missed, which is your decision (the design adjusts the goal, or you trade something for speed):
    *   The value step takes 0.01 seconds for all three methods and 40 peers. Pass.
    *   A first report in a new sector took 27.0 minutes, against a goal of 20. 17.4 minutes was Massive's free plan (88 calls at 5 a minute).
    *   A report in an already-downloaded sector took 9.1 minutes, against a goal of 5. About 8 minutes was its 35 AI calls.
*   **Design wording.** 13 updates the code already follows are listed for the design owner in the shared notes.
*   **Tests:** 505 engine tests (1 more live test, skipped unless asked for) and 11 app tests.

## Still to do

*   Your golden-set steps (above), the four calibration questions, the timing decision, and the Goal 1 test.
