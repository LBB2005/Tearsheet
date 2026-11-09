# Goldfish Review Report

**Target:** `docs/designs/tearsheet.md` (`Lines 1-1822`; feature part 1-1006, Detailed Implementation Plan from line 1007)

**Stage:** 8, Intermediate Zoom Out. This stage checks simplicity and scope after the Stage 5-7 fixes were applied.

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-zoom-out` (instance A) | completed |
| `egm-zoom-out` (instance B) | completed |

**How this report was put together.**

* Two independent copies of the zoom-out reviewer each read:
  * the whole design;
  * the four earlier reports (`zoom_out_report.md`, `comprehension_report.md`, `critic_report.md` and `goldfish_review_report.md`).
* Instance B also read the brief and Liam's answers in `concepts_brief.md`.
* When both copies raised the same finding, this report merges them into one entry. Both copies gave every shared finding the same severity.
* Before writing, the synthesizer checked the line numbers and the main claims against the current text.
  * Two details were corrected. Instance A said Phase 0 builds the Alpha Vantage limiter and "all six schemas" for no test. In fact `phase0 massive` calls Alpha Vantage, and some of the schemas are used in Phase 0.
* The repository holds documents only, with no code yet. So "reuse" here means existing libraries, services and SQLite features, not project code.
* None of Liam's fixed decisions is reopened. Where a finding touches one, it questions only the consequence. The two open questions (A18, and Claude Code or Codex as the everyday tool) are not treated as defects.

**Overall verdict.**

* The design gives enough context. A new reader can tell what is being built, for whom, and why.
* There are 0 Blockers, 7 Major findings and 12 Nits. That is down from 1 Blocker, 12 Major and 8 Nits at Stage 5.
* Most of what the Stage 6 and 7 fixes added is in proportion. These additions define how numbers are made correctly or keep the app safe:
  * the lock-down method (§4);
  * the window safety rules (§12);
  * split adjustment (§5);
  * the quote rule for dates and targets (§9);
  * the numeric guard's allowed cases (§11);
  * the red-flag definitions (§7);
  * the failure table (§3);
  * the outside services table (§12);
  * the checks-per-phase table (§11);
  * the roadmap and the glossary.
* The added complexity is concentrated in three places:
  * **The prediction-log machinery around Goal 8.** This covers the hash scope, the three rules for repeat ratings, the tamper chain, pruning and the mix-check gate. It has grown beyond what "useful to Liam" needs, and most of it becomes permanent at the first official prediction.
  * **Two full report renderers.** One is in Python for the terminal and one is in React for the window.
  * **Phase 0.** It still depends on Phase 1 pieces and is no longer a week's work.
* Four of the seven Major findings must be settled **before the first official prediction**, because a wrong choice can't be undone once predictions are logged: M3, M4, M5 and M6. M7 must be settled before the Goal 1 test starts.

## Prioritized Findings (Blockers -> Major -> Nits)

There are no Blockers.

### M1. Phase 0 still needs Phase 1 pieces, and it is no longer a week's work - Severity: Major
* **Reviewer Lens:** `egm-zoom-out` (instances A and B)
* **Affected Scope:**
  * Roadmap (line 180); Phase 0 goal (line 1025); item 7 (line 1104); item 12 tests (`Lines 1177-1215`); item 5 `prune()` (line 1089).
  * The pieces the tests depend on: items 14 (`Lines 1262-1276`), 18 (`Lines 1328-1335`), 23, 24, 30 (`Lines 1445-1453`) and 40 (`Lines 1613-1626`).
  * This is what remains of Stage 5 #1 after the S5-1 fix.
* **Discrepancy Description:**
  * The S5-1 fix added a usage pass mark (line 1207) and a cut order (line 290). It also moved the SEC client, raw store, article downloader and both connectors into Phase 0 (line 1025). Half of Stage 5 #1 is now fixed.
  * Four of the five tests still need Phase 1 work:
    * **`phase0 sec` and `phase0 massive`** (lines 1194 and 1198) fetch "the company and its 40 peers". Picking those peers needs the S&P 500 member list (item 18), the SIC map in `peers.yaml` (item 14), market values and peer selection (item 24). All of these are Phase 1.
    * **The holdings-file check** inside `phase0 massive` (line 1201) is item 18's job.
    * **`phase0 usage`** (line 1203) runs "the real extraction prompt" on split filing sections. That needs `extract.md` (item 30) and the filing parser (item 23).
    * **`phase0 news` and item 7** (line 1104) drop links that aren't on the allowlist. But `allowlist.yaml` is created in item 14.
  * The "golden tickers" that the tests use are defined only in item 40.
  * Phase 0 also builds pieces no Phase 0 test uses. The main one is raw-store pruning (line 1089), which depends on the Phase 1 `run_inputs` and `predictions` tables.
  * The five tests are product commands (`tearsheet-engine phase0 …`, line 1177). Only the lock-down check needs to stay after week one.
  * As written, a builder either pulls much of Phase 1 forward without a gate, or improvises the inputs.
* **Rationale & Recommendation:**
  * Run Phase 0 on hand-written inputs, and say so in item 12:
    * a fixed list of 5 tickers, each with a fixed list of about 40 peer CIKs;
    * a draft allowlist;
    * a draft extraction prompt;
    * the filing sections edgartools already splits.
  * Limit Phase 0's code to what the tests touch:
    * the raw store's put, get and count;
    * the one SEC client;
    * the downloader;
    * the connector or connectors.
  * Move pruning to Phase 1 at the earliest (see N4).
  * Keep the lock-down check as a permanent command (see N1). Make the other four throwaway scripts in `tests/live/` or `scripts/phase0/`.
  * Either cut Phase 0 until it fits in "week one", or drop that label from the roadmap.

### M2. The report is rendered twice, in two languages, and Goal 1 tests the one the app doesn't show - Severity: Major
* **Reviewer Lens:** `egm-zoom-out` (instances A and B)
* **Affected Scope:**
  * Terminal mode (line 236); §3 step 14 (line 283); §6 (line 374); §12 window rules (`Lines 628-633`).
  * Item 31 `render.py` (`Lines 1478-1481`); item 32 Jinja template (`Lines 1483-1494`); item 48 Report screen (line 1705).
  * Goal 1 "When" (line 71); Phase 1b (line 1259).
  * Sources: design-1-2 (window safety), as built in item 48 ("No HTML from the engine is inserted"), together with S5-17 (sections stored once). This reverses Stage 5 #2, which suggested one screen that shows the engine's HTML.
* **Discrepancy Description:**
  * Terminal mode needs a complete HTML report, because Goal 1 runs on it in Phase 1b. So the Jinja template carries everything:
    * the nine sections and the analyst block;
    * What to watch;
    * citation quotes and links;
    * the "Checks that ran" box and the "Removed claims" box with its direction split;
    * the call-budget line;
    * the methodology text and the as-of dates.
  * The window then rebuilds the same report in React (line 1705).
  * That makes two full renderers to keep in step, and two places where the escaping and Markdown-cleaning rule must hold.
  * The look and feel still waits for its own brainstorm (line 114). That is the part most likely to change, and every change would have to be made twice.
  * Goal 1 is judged on the Jinja output. Phase 1c then ships a separately written React view that Goal 1 never tested.
* **Rationale & Recommendation:**
  * Keep one renderer: the engine's HTML. It already escapes all AI and source text (line 1481). Use a maintained sanitizer such as `nh3` rather than hand-written tag cleaning.
  * Show that HTML in the window inside a sandboxed frame with scripts off, under the same strict content-security policy.
  * Make citation and "flag this claim" clicks plain links with a custom scheme. The main process catches them through the navigation block it already has (line 632).
  * React then builds only the screens around the report: Search, Progress, Log and Settings.
  * If a React report view is still wanted, it should replace the Jinja one, and Goal 1 should run on it.

### M3. Grading rules and a measured number sit inside the methodology hash, and the grouping key is stated three ways - Severity: Major
* **Reviewer Lens:** `egm-zoom-out` (instances A and B)
* **Affected Scope:**
  * §6 methodology bundle (`Lines 387-395`, especially 392 and 394).
  * §7 target mix (line 451); §10 grading rules (`Lines 552-565`).
  * Item 14 `bands.yaml` "the last recorded mix" (line 1268) and `grading.yaml` (line 1271); item 15 (line 1283); item 36 (line 1547); item 49 (`Lines 1724-1735`).
  * Sources: design-1-7 put `grading.yaml` in the bundle. design-1-5 put the recorded mix in `bands.yaml`. This partly undoes the S5-8 fix.
* **Discrepancy Description:**
  * §6 defines the bundle as "the settings files that can change a prediction's numbers" (line 387). Neither of these can:
    * Grading rules don't change a prediction's score, rating, range or probability. They change only the grades.
    * The "last recorded mix" is a measured result, not a setting.
  * Yet both are hashed, and grades are grouped by the hash (line 565).
  * So two kinds of change start a new group and split an already small record. That is the S5-8 problem again:
    * adjusting the grader when it is first built in Phase 2;
    * re-running the mix check without changing any band.
  * Line 394 says old grades "are never recomputed in place". Combined with the hash, every Phase 1 prediction is graded forever under rules written months before any grading code ran.
  * That rule also can't be built as written. The engine ships only the current `grading.yaml`, and `grade_due()` reads that one file (line 1724). So the Phase 2 grader would have to load each prediction's old file by its hash.
  * The three statements of the grouping key disagree:
    * line 395 says grades are grouped by method code version;
    * line 1733 says the same;
    * line 565 says by method code version **and** methodology hash.
  * This becomes permanent at the first official prediction.
* **Rationale & Recommendation:**
  * Take `grading.yaml` out of the hash. Give it its own version number, stored on each grade row.
  * Grades depend only on the stored prediction and stored prices. So when the rules change, grade old predictions again under the new rules as new rows, never overwriting the old ones.
  * Keep the recorded mix in the run record or a notes file, not in `bands.yaml`.
  * State one grouping key in one place, and have §10 and item 49 point to it.
  * Optionally, keep in §10 only what must be stored when a prediction is made: lines 541-550 and the start-price rule. The rest of the grading table can be settled in item 49, when the grader is built.
  * Settle this before the first official prediction.

### M4. Three stacked rules handle repeat ratings - Severity: Major
* **Reviewer Lens:** `egm-zoom-out` (instance A)
* **Affected Scope:**
  * Decisions table, "Which run is the official prediction" (line 200).
  * §7 buffer (line 452); §10 (lines 539, 544 and 560); §6 replay (line 399).
  * A21 (`Lines 843-848`); item 28 (line 1431); item 38 (line 1566).
  * Sources: design-1-7 added headline counting on top of the 30-day window from style-1-6 and the buffer that S5-7 kept.
* **Discrepancy Description:**
  * There are now three rules for one concern:
    * **The rolling 30-day official window.** It allows up to about 12 official predictions per company a year.
    * **Headline counting.** Only one prediction per company per 12 months counts; the rest are "repeats".
    * **The anti-flip-flop buffer.** It compares a new rating against the previous official rating, which is stored with each prediction and read back by replay.
  * That gives four kinds of run: unofficial, official repeat, official headline, and withheld. Grading, the Log screen, replay and the trigger prices all have to handle each kind.
  * The buffer still has no limit to the same method version or to 12 months, which Stage 5 #7 asked for. It can compare against a rating made long ago under different rules.
  * None of these three rules is Liam's decision. All are drafter defaults.
* **Rationale & Recommendation:**
  * Pick one rule.
  * **Simplest:** make the official window 12 months, the same as headline counting. That removes the "repeat" tier. The buffer can then go too, replaced by a line saying "previous official rating: X on [date]", as Stage 5 suggested.
  * **If monthly official ratings are wanted:** keep the 30-day window and drop the buffer, since the window already limits churn.
  * Settle this before the first official prediction.

### M5. The rating-mix check adds a batch run mode and a gate, and fetches data the rating never reads - Severity: Major
* **Reviewer Lens:** `egm-zoom-out` (instance B; instance A raised the fetch cost as a Nit, merged here)
* **Affected Scope:**
  * §7 target mix (line 451); §3 step 2 (line 271); the "Insider buying" decision row (line 197).
  * Phase 1b (`Lines 1257-1259`); item 12 `mix-check` (line 1181); item 36 (`Lines 1541-1548`).
  * Phase 0 SEC pass mark (line 1196); Verification Plan (line 1811).
  * Source: design-1-5 (symmetric rule, target mix, tuning on 2 full sectors). It interacts with S5-19, under which Liam kept the 3-year Form 4 history.
* **Discrepancy Description:**
  * The symmetric rule itself is fine. The problem is the tuning loop built around it. It adds:
    * a new batch mode with no AI, run over every member of two sectors;
    * a step where Liam accepts band changes that the tool writes back into `bands.yaml`;
    * a gate before the first official prediction.
  * The check "runs steps 1-8" (line 1545). Step 2 fetches each company's 3 years of Form 4 filings and the 3 largest peers' MD&A (line 271), and the rating reads neither.
  * Each Form 4 is its own request, and a large company can have 100 or more in 3 years. Across two full sectors, that is the "thousands of SEC requests" that line 197 gives as the reason not to rank insider buying against peers.
  * No Phase 0 pass mark covers this. The SEC mark at line 1196 is for one run.
  * The order is unclear. Line 1259 says the Goal 1 test "starts here", but line 1548 says predictions must wait for the mix check.
* **Rationale & Recommendation:** Pick one of two options.
  * **(a) Make the mix stable by construction.** This removes the most. Step 7 already values every peer, so the company's value gap could be ranked as a percentile among its peers' gaps. The required percentile would rise with the uncertainty level. This drops the target-mix tuning, item 36 and the gate. It changes the exact rating rule, which is a drafter default (line 201), so Liam would need to approve it.
  * **(b) Keep the bands, and make the mix check a one-off script.** The script fetches only what steps 1-8 read for the rating, and records its SEC request count:
    * XBRL facts and prices;
    * 10-K Item 9A and the auditor's report;
    * Item 1A next to last year's;
    * the 8-K item list.
  * In both options, fetch Form 4 and peer MD&A only on the narrative path, not in steps 1-8. Fetch 6 months of Form 4 first, and pull the older history only when a purchase appears. This keeps Liam's 3-year routine test where it is needed.
  * Say whether the Goal 1 test runs before or after the check.
  * For information only: both options build a batch path with no AI, which is part of what A18 would need (line 822). This may be useful when Liam answers that question.

### M6. The Alpha Vantage price fallback rarely saves a rating, and it mixes two vendors in the store grading reads - Severity: Major
* **Reviewer Lens:** `egm-zoom-out` (instance B)
* **Affected Scope:**
  * Decisions table, Prices row (line 193); §1 diagram (`Lines 228-230`).
  * §5 (lines 346, 355 and 356); CUJ 5 (line 158); §12 table (line 619); the first row of the Risks table (line 655).
  * Item 4 limiter (line 1074); item 12 `phase0 massive` (line 1200); `test_prices.py` (line 1599).
  * Source: structural-1-1 ("Second price source"). The fallback is a drafter default (line 193). Massive as the price source is Liam's decision and is not questioned.
* **Discrepancy Description:**
  * The fallback covers only the rated company and SPY (line 355). A peer with missing prices is dropped, with no fallback (line 356).
  * So a Massive outage long enough to make the company's own prices stale also makes the peers stale. The peer group empties, and the design sets no minimum peer count (see Stage 5 #4 below).
  * When the fast path is available, every company is updated daily, so the fallback adds nothing there.
  * It does not cover the main case in the Risks row either: Massive changing its free plan. At 25 calls a day, Alpha Vantage can't cover the peers.
  * Its cost is a second vendor path in about ten places.
  * Price rows are keyed by company, share class and date, and are "never overwritten" (lines 346 and 1307). So a fallback close stays in the store permanently. It can then become a grade's start price (line 556), from a different vendor than every other price in that grade.
* **Rationale & Recommendation:**
  * Drop the price fallback from v1. CUJ 5 already describes the right behaviour when Massive fails: withhold the rating and keep everything else.
  * Keep Alpha Vantage only for the analyst consensus.
  * Revisit the fallback if Phase 0 or the Goal 1 test shows Massive failing in practice.
  * If the fallback stays, two rules are needed:
    * which source wins for a given date;
    * keep fallback rows out of grading start prices.
  * Settle this before the first official prediction, because it decides what the grading store can contain.

### M7. Goal 1's results are split across two stores, and two of its three pass conditions have nowhere to be recorded - Severity: Major
* **Reviewer Lens:** `egm-zoom-out` (instances A and B)
* **Affected Scope:**
  * Goal 1 (`Lines 65-71`); CUJ 3 (line 143); §11 (`Lines 598-599`).
  * The `claim_flags` table (lines 376 and 1320); item 12 `flag` and `spot-check` (line 1180); item 41 `evals/labels/claims.jsonl` (`Lines 1628-1634`).
  * The outside-checker trigger (line 978); Verification Plan (line 1818).
  * Sources: style-1-1 (the Goal 1 rewrite) and S6-9 (the spot-check task). Item 41 is the old hand-label file from the Jev plan, kept after Jev was dropped.
* **Discrepancy Description:**
  * Goal 1 is the only success bar. It passes on three counts (line 69): zero confirmed errors, zero citations that fail, and "yes" on at least 75% of reports.
  * **Confirmed errors.** Reader flags go to `claim_flags(claim_id, flagged_at, note)` in SQLite. That table has no field for the result of checking a flag: confirmed error or not an error.
  * **Spot-check labels.** These go to a JSONL file in the repository's `evals/` folder (line 1628; paths are relative to the repository root, line 1009). That puts user data in the code tree. The IDs in it only mean something next to the local database, and the file has no place in a packaged app.
  * **The per-report yes/no answer** (line 68). No command, table or file records it.
  * So there are two stores with different shapes and a missing third, all for about 10 reports. The Goal 1 tally and the outside-checker trigger both have to reconcile them.
* **Rationale & Recommendation:**
  * Use one `claim_reviews` table in SQLite, with these columns:
    * report ID;
    * claim ID, empty for the per-report verdict;
    * origin: reader flag, spot-check or report verdict;
    * label: confirmed error, not an error, supported, not supported, wrong, yes or no;
    * note;
    * time.
  * `flag` and `spot-check` both write to it. A short verdict prompt at the end of `spot-check`, or a `verdict` command, records the yes/no answer.
  * The Goal 1 tally and the line-978 trigger read from this table. `export-log` can write a file copy if one is wanted.
  * Drop item 41 as a store.
  * Settle this before the Goal 1 test starts.

### N1. The lock-down check is described three ways, and a permanent safety gate is named "phase0" - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out` (instances A and B)
* **Affected Scope:** failure table (line 300); §4 (`Lines 334-341`); item 8 (line 1130); item 12 (`Lines 1187-1193`); Verification Plan (line 1814). Source: design-1-1.
* **Discrepancy Description:**
  * Line 341 says a tool version change runs "a short lock-down check (5 calls)".
  * Lines 1130 and 1814 say the item 12 command runs instead. That command makes 20 calls per tool and includes a planted `~/.ssh` request and a `CLAUDE.md` marker.
  * Line 300 blocks AI steps after a tool attempt "until the lock-down check passes again", but nothing says what starts that check.
  * Claude Code updates often, and each update costs plan quota at the start of a report. Whether the cost is 5 or 20 calls depends on which line the builder follows.
* **Rationale & Recommendation:**
  * Define one `lockdown-check` command in §4, with one set of test prompts and one pass mark.
  * Give it a short form (5 calls) for version changes and recovery after a tool attempt. Keep the 20-call form for Phase 0 and the live tests.
  * The failure table should say that the check runs automatically before the next AI step.

### N2. The tamper chain on the prediction log guards against no one - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out` (instances A and B)
* **Affected Scope:**
  * §6 (line 401); §10 (line 550); A30 (line 924).
  * The `predictions` columns (line 1322); item 35 (line 1536).
  * `test_predictions.py` (line 1603); Verification Plan (line 1817).
  * Source: design-1-19.
* **Discrepancy Description:**
  * The fingerprint is a plain SHA-256 chain in a local file that one user controls. Anyone who edits a row can recompute the chain, so it proves nothing to an outside reader. Proving that to an outside reader is the job of the public record (A30), which is deferred.
  * Backups (line 400), SQLite's own integrity check and code that only ever inserts prediction rows already cover accidental damage.
  * The chain costs two columns, a check at every app start, a warning screen and a test.
  * It can raise false alarms. "A hash of its own fields" changes meaning when an in-place database upgrade (line 382) adds or changes a column.
* **Rationale & Recommendation:**
  * Drop the chain from v1. Make prediction rows insert-only in code, and rely on backups. Bring the chain back with A30.
  * If it stays, hash a fixed, versioned list of fields, so later upgrades can't break it.

### N3. The instruction-phrase filter will remove real news about the largest companies - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out` (instances A and B)
* **Affected Scope:** §9 (line 514); item 7 (line 1112); `test_news.py` (line 1598). Source: design-1-3.
* **Discrepancy Description:**
  * Several of the largest S&P 500 companies sell AI products: Alphabet, Microsoft, Nvidia, Meta and Amazon. Ordinary coverage of them can contain phrases like "system prompt" or "ignore previous instructions". The filter would drop those paragraphs, and every drop adds a note to the report.
  * A keyword list adds little protection, because a planted instruction can simply be reworded.
  * The defences that actually limit harm are already in place:
    * the reading calls have no tools (§4);
    * article text reaches only the section 7 calls (line 512);
    * source text sits inside data markers;
    * dates and targets from news must pass the quote check (line 519);
    * the skeptic reviews every claim.
* **Rationale & Recommendation:** Drop the filter. Or have it mark those paragraphs for the skeptic to look at closely, instead of removing them.

### N4. Raw-data pruning is built before it is known to be needed, and in the wrong layer - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out` (instance A)
* **Affected Scope:** §6 (`Lines 384-386`); item 5 (line 1089); item 13 (line 1227); Goal 2 (line 72). Source: design-1-18.
* **Discrepancy Description:**
  * Phase 0 measures bytes per run (line 384), but it also builds pruning before that measurement exists.
  * `rawstore.prune()` has to know which files belong to official predictions. That information lives in the `run_inputs` and `predictions` tables, which Phase 1 creates (lines 1315 and 1322). So a low-level store depends on the prediction log.
* **Rationale & Recommendation:**
  * In Phase 0, build only put, get and count, plus the size display and the warning near the cap.
  * Build pruning only if the Phase 0 figures show that 5 GB would fill within about a year.
  * If pruning is built, `predictions.py` should pass the set of protected files into `prune()`.

### N5. CUJ 5's partial report is a special mode for a rare failure, and part of it can't be computed - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out` (instance A)
* **Affected Scope:** CUJ 5 (`Lines 156-164`); §5 (line 356); §8 (`Lines 479-484`); item 34 (line 1525). Source: S6-17.
* **Discrepancy Description:**
  * This case needs both Massive and the fallback to fail. For it, the design builds:
    * a four-factor score display;
    * valuations with no price comparison;
    * a partial What to watch block.
  * Section 3's "DCF and residual-income values per share" (line 162) need inputs that come from prices:
    * the cost of equity comes from 12-month price volatility (line 479), and residual income uses it too (line 484);
    * the discount rate uses market-value weights, which need a price (line 480).
  * On a first run in a sector, no prices are stored at all, so these values can't be computed.
  * If M6 is accepted and the fallback is dropped, this case becomes more common. The rule then matters more, and it should be simpler.
* **Rationale & Recommendation:**
  * Use one rule. When the company's or SPY's prices are unavailable, withhold sections 1-3 and the trigger prices.
  * Show sections 4-9 with a banner, and offer a re-run.

### N6. A "tone" mark has two rewrite paths, and the call budget will often cut both - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out` (instance A)
* **Affected Scope:** §3 call estimate and budget (`Lines 285-290`); §11 decision flow (`Lines 591-596`); item 33 `flow.py` (`Lines 1510-1515`); item 34 (line 1524). Sources: S6-8 and design-1-16.
* **Discrepancy Description:**
  * A claim marked "tone" is rewritten (step 3). A section with any "tone" mark is also rewritten and checked again (step 4). So one mark triggers two paths, and "any" is a low bar.
  * Rewrites can add up to about 20 calls: a rewrite plus a re-check for each of about 10 sections. That makes the 30-45 call estimate optimistic, and means the 50-call budget will often bind.
  * The budget cuts rewrites (line 290), but nothing says what happens to claims marked "tone" once that happens.
* **Rationale & Recommendation:**
  * Keep one path: rewrite a section once when its tone marks or removals pass a set threshold. Otherwise, show tone marks as a visible note.
  * State that when rewrites are cut, tone-marked claims stay in the report with that note.

### N7. Removals are logged by direction, but nothing supplies the direction - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out` (instance A)
* **Affected Scope:**
  * §11 (`Lines 597-598`).
  * Item 11 schemas `SectionDraft` and `SkepticFinding` (`Lines 1168-1169`).
  * `claims.removal_direction` (line 1319); item 32 template (line 1491); item 33 `flow.py` (line 1515).
  * Source: design-1-25.
* **Discrepancy Description:**
  * Neither schema has a field saying whether a sentence is positive, negative or neutral about the stock.
  * Most removals happen in the code checks, before the skeptic runs.
  * So `flow.py` would need a new classifier, either another AI call or a keyword rule. For one user, Liam's spot-checks would show an upbeat tilt directly.
* **Rationale & Recommendation:** Drop the direction split from v1. Or add one stance field to each `SectionDraft` sentence, filled in by the narration call at no extra cost.

### N8. "Trigger prices" are loosely defined - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out` (instance A)
* **Affected Scope:** line 26; §7 (line 459); item 28 (line 1432). Source: style-1-2 (the What to watch block).
* **Discrepancy Description:**
  * A change in price also moves the momentum and valuation percentiles, and so the score.
  * "Holding today's estimates fixed" doesn't say whether the score is held fixed too. A builder may write a search that re-scores the company at many prices.
* **Rationale & Recommendation:**
  * State that the score and the peer expected value gap are held fixed. The trigger price then has a direct formula: `price = V / (1 + 3 × (peer gap ± band))`.
    * `V` is the estimated value.
    * The band includes the buffer's extra 2 points when an official rating already exists.
  * When the score condition can't be met at any price, report "not reachable by price alone".

### N9. The plan restates feature rules, and the copies have started to differ - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out` (instance B)
* **Affected Scope:**
  * Grade grouping (lines 395, 565 and 1733).
  * Skeptic checklist (line 587 against line 1465).
  * Red flags (`Lines 453-457` against item 27).
  * Numeric guard (`Lines 572-579` against `Lines 1500-1506`).
  * The Phase 0 list (`Lines 115-120`, line 180 and `Lines 1186-1215`).
  * Sources: structural-1-3 and structural-1-4 aimed for one statement of each rule. The plan items then restated the moved rules.
* **Discrepancy Description:**
  * Line 1009 says the plan "holds only tooling choices". Yet several items restate §7, §10 and §11 in full.
  * Two copies already differ:
    * "trend statements with no link to this company" (line 587) against "generic macro lines" (line 1465);
    * grades grouped by one key against two (see M3).
* **Rationale & Recommendation:**
  * Plan items should name their files and point to the rule's section ("implements Technical Plan §11"), without restating the rule.
  * Open Questions should point to the roadmap's Phase 0 list instead of keeping its own.

### N10. The Phase 1 window carries pieces that only Phase 2 or 3 uses - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out` (instance B; instance A noted the same items under Stage 5 #10 and #15)
* **Affected Scope:**
  * §1 diagram (line 214).
  * §2 requests `grade_due` and `status` (lines 255 and 258), compared with the bridge's call list (line 1688).
  * Item 3 (line 1062); item 42 `node-pty` (line 1640); item 48 Settings (line 1712).
* **Discrepancy Description:**
  * `node-pty` is a native module that must be rebuilt for Electron. It is a Phase 1 dependency, but only the Phase 3 sign-in uses it.
  * The off switch for the install and sign-in buttons sits in the engine's `config.py` and in the Phase 1 Settings screen. But the buttons exist only in Phase 3, only if Anthropic approves, and Electron owns them.
  * `grade_due` has nothing to grade until Phase 2.
  * No screen calls `status`.
* **Rationale & Recommendation:**
  * Add `node-pty` and the button switch, in Electron, in Phase 3.
  * Add `grade_due` in Phase 2.
  * Drop `status` unless a screen needs it.

### N11. The default backup folder may send the prediction log to iCloud - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out` (instance B)
* **Affected Scope:** Goal 7 (line 81); §6 Backup (line 400); outside services table (`Lines 612-622`); item 16 (line 1292). Source: design-1-19.
* **Discrepancy Description:**
  * On Macs with "Desktop & Documents Folders" syncing turned on, `~/Documents` is synced to iCloud.
  * The backup holds the prediction log, saved article text and the AI's evidence.
  * iCloud is missing from what line 612 calls "the only list" of what leaves the Mac.
* **Rationale & Recommendation:** Pick one:
  * default to a folder that isn't synced, such as one under the app data folder, and let Liam choose a synced folder knowingly;
  * or add iCloud to the outside services table as a possible destination.

### N12. The filing-text parser now moves ratings, but it isn't treated as rating code - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out` (instance B; instance A noted the same point under Stage 5 #6)
* **Affected Scope:** §6 method code version (line 395); §7 risk-factor red flag (line 457); item 23 `compare.py`; the coverage list in the Verification Plan (line 1812). Sources: S6-5 and S5-6.
* **Discrepancy Description:**
  * The risk-factor change score comes from how filings are split into paragraphs and matched, and it can cap a rating at Hold. So a change to the parser can move ratings.
  * The method-code-version rule covers "code that makes numbers". The 85% coverage list names the modules that make or check numbers. Neither mentions the text layer.
* **Rationale & Recommendation:**
  * State that changes to `text/parse.py` and `text/compare.py` raise the method code version.
  * Add `text` to the coverage list.

## Stage 5 findings: status

Counts: 12 resolved, 8 partly resolved, 1 open by design.

| Stage 5 ID | Status | Why |
| --- | --- | --- |
| #1 Phase 0 tests need Phase 1 code; no usage pass mark | Partly resolved | The pass mark (line 1207) and cut order (line 290) are added. But `sec`, `massive`, `usage` and `news` still need Phase 1 inputs, and the tests are still product commands (M1). |
| #2 Goal 1 waits for the app | Resolved | Goal 1 starts from the terminal in Phase 1b with `flag` and `spot-check` (lines 71, 1259 and 1818). The suggested window trims weren't made (N10), but they no longer hold up the test. |
| #3 Layer-by-layer build | Resolved | Phase 1a is a thin end-to-end slice that logs no predictions (`Lines 1241-1249`). |
| #4 Every peer valued with all three methods | Partly resolved | The cost is now stated (lines 276 and 471), there is a 40-peer cap (line 409), and timing is taken at the end of 1a (line 1249). Still missing: a minimum number of valid peer values, below which the rating is withheld (line 442 only drops invalid peers); a pass mark for the timing; and a cost note in the decisions table (line 196). The timing uses DCF only (line 1244), so it understates three methods plus the paths for banks, insurers and REITs. |
| #5 Two SEC download paths | Resolved | There is one SEC client, edgartools only parses stored files, and a test checks this (lines 271, 1092-1098 and 1233). Small gap: no fallback is stated if edgartools' own downloading can't be switched off (line 1098). |
| #6 Steps out of order | Resolved | The text layer is step 4, before Metrics (`Lines 273-277`), and §7 lists exactly which red flags cap the rating (`Lines 453-457`). The side effect is N12. |
| #7 Buffer depends on history replay doesn't capture | Partly resolved | The previous official rating is now stored and read by replay (lines 399, 544 and 1566). There is still no limit to the same method version or 12 months, no decisions-table row, and the "drop it" option wasn't taken (M4). |
| #8 Hash covers files that can't change a prediction | Partly resolved | Aliases, the allowlist, the FRED list and names are versioned separately (line 394; `Lines 1272-1276`). But `grading.yaml` and the recorded mix are now inside the hash (M3). User edits to the allowlist (line 523) still have no home outside the read-only shipped bundle (line 1274). |
| #9 Codex on Phase 0's critical path | Open by design | It is waiting on Liam's answer about his everyday tool (lines 111, 1025 and 1723). This is not a defect. |
| #10 Grading built early; checks per phase unclear | Resolved | Grading moved to Phase 2 (line 608; `Lines 1718-1742`), the checks-per-phase table was added (`Lines 601-608`), and Jev is gone. Leftover: `grade_due` is still in the Phase 1 request list (line 255; N10). |
| #11 Lock-down fallback | Resolved | The first fallback is a direct `claude` call from Python, then routing to Codex (lines 342 and 1144). The TypeScript helper is removed. |
| #12 Tool detection built twice | Resolved | Electron owns detection, and in terminal mode the engine looks the programs up on PATH (lines 245, 1560 and 1659). |
| #13 No request and reply in the message format | Resolved | JSON-RPC 2.0 with IDs (lines 217 and 246-262), a logged `hello` line (line 247), and types generated from JSON Schema (line 1695). |
| #14 Speculative interfaces; no home for the analyst view | Partly resolved | The analyst view is one plain function (line 1353) and sits in section 1 (lines 529-533 and 1487). Still built without the check Stage 5 asked for: the dated S&P 500 membership history (lines 364 and 1302), the split check (line 357), and the 8-K earnings-date estimate (line 535). For the last, Alpha Vantage's earnings calendar was not checked first. |
| #15 Code-level detail; Phase 3 specified early | Partly resolved | Phase 3 is cut to an outline (`Lines 1744-1765`). But `node-pty` and the button switch are still in Phase 1 (N10). Column lists, function signatures and error names remain, though they sit in the detailed range (`Lines 1086, 1120-1129, 1299-1326, 1666`). |
| #16 Homemade migration table | Resolved | It now uses SQLite's `user_version` (lines 382 and 1291). |
| #17 Content stored more than once | Partly resolved | Sections are stored once, and the HTML is generated from them (lines 374 and 1318). But the peer list is still stored twice (lines 1311 and 1322). `claims.text` (line 1319) contradicts "the only stored copy" (line 1318). A new duplicate appeared: two renderers (M2). |
| #18 Momentum needs 10 years of index data | Resolved | It now uses SPY's own 2-year history (lines 349 and 425). |
| #19 Three years of Form 4 for a displayed note | Resolved | This is Liam's decision: fetched once, then topped up (lines 271 and 1096). Its new cost inside the mix check is covered in M5. |
| #20 "Industry" means a broad sector | Resolved | Section 8 is renamed (line 23), and line 410 states that the groups are broad sectors. |
| #21 Unexplained names; stale Open Questions | Partly resolved | A glossary is added (`Lines 980-1003`), Open Questions lists only truly open items (`Lines 104-120`), and the FRED key appears in CUJ 1 and `config.py` (lines 126 and 1058). "Finava" (line 92) is still not explained. |

## Resolution (Nov 2)

**Status:** resolved. Liam chose to fix the findings before Stage 9. All 19 were applied to `docs/designs/tearsheet.md` and `design_draft.md`.

| ID | What changed |
| --- | --- |
| M1 | Phase 0 runs on hand-written inputs (`scripts/phase0/inputs.yaml`). Only the lock-down check stays as a command; the other four tests are throwaway scripts. Pruning was removed from Phase 0. |
| M2 | There is one renderer, the engine's HTML, cleaned with `nh3`. The app shows it in a sandboxed frame, and `tearsheet:` links carry citation and flag clicks. React builds only the surrounding screens. |
| M3 | `grading.yaml` and the recorded mix are out of the methodology hash. The grading rules have their own version on each grade row, and a rule change re-grades as new rows. The grouping key is stated once, in §6. |
| M4 | The 30-day window stays and the stickiness buffer is dropped. Reports show "previous rating: X on [date]". Headline counting is a statistics filter, not a kind of run. |
| M5 | Option (a): the value gap is ranked as a percentile among peers' gaps, with Buy and Sell lines by uncertainty level. Target-mix tuning, `mix-check` and the gate are removed. Each run shows the peer group's mix. Form 4 history is fetched only when a purchase appears. |
| M6 | The Alpha Vantage price fallback is dropped (A34). Alpha Vantage stays for the analyst consensus only. |
| M7 | One `claim_reviews` table holds reader flags, spot-check labels and per-report answers, and `goal1` prints the tally. The JSONL store is removed. |
| N1 | One `lockdown-check` command: the full form has 20 calls, and the short form has 5 and runs automatically after a version change or a tool attempt. |
| N2 | The fingerprint chain is dropped (A35). Prediction rows are write-once. |
| N3 | Instruction-like paragraphs are marked for the skeptic, not dropped. |
| N4 | Pruning is built only if Phase 0 shows 5 GB fills within about a year. |
| N5 | CUJ 5 follows one rule: withhold sections 1–3 and the trigger prices, show the rest under a banner, and offer a re-run. |
| N6 | One rewrite path, at more than 30% removed or more than 30% tone-marked. Other tone marks show as notes, including when the call budget cuts rewrites. |
| N7 | The narration call labels each sentence's stance at no extra cost. |
| N8 | Trigger price = V ÷ (1 + 3 × g), with the score and peer gaps held fixed. "Not reachable by price alone" is shown when needed. |
| N9 | Plan items point to §7, §10 and §11 instead of restating them. Open Questions points to the roadmap. |
| N10 | `node-pty` and the button switch move to Phase 3, `grade_due` to Phase 2, and `status` is dropped. |
| N11 | The default backup folder is `~/Tearsheet Backups/`, and a note covers iCloud. |
| N12 | Text-layer changes raise the method code version, and `text` is in the coverage list. |
| Stage 5 #4 | Fewer than 15 valued peers withholds the rating. The 40-peer timing has a pass mark (under 3 minutes, all three methods). |
| Stage 5 #8 | Liam's allowlist edits live in `allowlist.local.yaml`. |
| Stage 5 #17 | Claims point into sections by sentence ID, and predictions use the run's `peer_groups` rows. |
| Stage 5 #21 | Finava is added to the glossary. |
