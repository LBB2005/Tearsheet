# Goldfish Review Report

**Target:** `docs/designs/tearsheet.md` (`Lines 1-1373`)

**Stage:** 5, Initial Zoom Out Review (simplicity, scope, and whether the design stays on the real problem)

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-zoom-out` (instance A) | completed |
| `egm-zoom-out` (instance B) | completed |

**How this report was put together.**

* Two independent copies of the zoom-out reviewer read the full design and every linked resource:
  * `docs/brief.md`, `docs/local-cli-pivot.md`, `docs/brief-stress-test.md`, `concepts_brief.md`, both research reports and `docs/references/local-cli-guide.txt`.
* Findings both copies raised are merged into one entry.
* When the two copies gave the same point different severities, the higher one is kept. The entry gives the reason.
* The Blocker and the main Major claims were checked against the design text before this report was written.
* The repository has no source code yet, only documents. So "reuse" here means existing libraries and tools, not existing project code.

**Overall verdict.**

* Changes are needed before the build starts. The count is 1 Blocker, 12 Major and 8 Nits.
* Both copies agree that the design's background is clear. A new reader can say what is being built and why.
* Both also agree that the core rule is sound: code makes every number, and the AI only reads sources and writes text that cites them.
* Most of the problems are about build order for a one-person project, and about extra parts the drafter added. They are not about Liam's own decisions.
* Where a finding touches one of Liam's decisions, the entry says so and questions only the timing or the hidden cost. It does not reopen the decision.

## Prioritized Findings (Blockers -> Major -> Nits)

### 1. Phase 0's tests can't run with only Phase 0's files, and the AI-usage test has no pass mark - Severity: Blocker
* **Reviewer Lens:** `egm-zoom-out` (instance B; instance A raised the related point about where the test commands live)
* **Affected Scope:** `Lines 725-848` (Phase 0 goal at line 727; the four tests in item 10, lines 836-848). The tests depend on Phase 1 items 16-38 and 44 (`Lines 921-1207`). Verification Plan, line 1364.
* **Discrepancy Description**:
  * Phase 0 says it will "prove the four assumptions before building the rest". But two of the main tests need the rest to exist:
    * `phase0 sec` runs "the fetch step for 5 golden tickers". The fetch step needs company lookup, the S&P 500 list, peer groups, the SEC and price clients, and the database. All of those are Phase 1 work (items 16-24).
    * `phase0 usage` runs the extract, narrate and verify steps. Those need the filing parser, the prompts, the writing and rendering code, all four checks and the golden ticker list (items 31-38 and 44).
  * Phase 0 itself builds only the web client, the raw-data store, the two AI connectors, the response formats and the command line.
  * So the builder will either build most of the engine under the Phase 0 label, with no gate, or skip the gates.
  * The usage test measures the biggest unknown for Liam: how much of his AI plan one report uses. Line 848 says it has "No pass mark", so whatever it finds can't stop or change anything.
  * These one-off week-one tests also become permanent product commands (line 832), and they are repeated in `tests/live/` (line 1199).
* **Rationale & Recommendation**:
  * Learning late that a report uses too much of the plan is the costliest surprise for a single owner whose only bar is "useful to me".
  * Rewrite the four tests as small throwaway scripts with fixed inputs:
    * **Lockdown:** as written.
    * **SEC:** fetch one company plus a realistic set of peers directly through edgartools, and count the requests.
    * **Massive:** check the free plan's limits and which endpoints it allows.
    * **Usage:** run one real extraction on a saved 10-K risk-factors section and one narration on a fixed set of evidence. Multiply by the planned number of AI calls per report, and write that number into the design.
  * Give the usage test a pass mark in Liam's terms, for example "N full reports a day on my plan, with room left for normal use".
  * Write down in advance what gets cut if it misses: fewer articles read, fewer peer-trend readings, or fewer narration calls.
  * Keep the scripts in one place (`scripts/phase0/` or `tests/live/`), not as product commands.
  * If this is not wanted, relabel `sec` and `usage` as Phase 1 checkpoints, and say openly that the build goes ahead without them.

### 2. Liam's one-month usefulness test waits for the whole desktop app - Severity: Major
* **Reviewer Lens:** `egm-zoom-out` (both instances)
* **Affected Scope:** Phase 1 goal (line 860); terminal mode (line 223); item 41 (`Lines 1167-1173`); items 45-52 (`Lines 1209-1277`); the off switch for the install and sign-in buttons (line 760 and line 1276); version check (line 228); Verification Plan, Goal 1 (line 1369). This touches Liam's decision to use Electron for the app (line 183). Only the timing is questioned.
* **Discrepancy Description**:
  * Goal 1 ("useful to Liam") is the only success bar, and its one-month test starts "after Phase 1".
  * Phase 1 ends with the full Electron app:
    * the message format between the app and the engine, plus its server;
    * a version handshake;
    * generated TypeScript types with a check in automated testing;
    * an engine manager that restarts the engine after a crash;
    * the PATH fix and AI tool detection;
    * the bridge between the window and the main process;
    * six screens.
  * None of this makes a report more accurate, easier to trace back to its sources, or more useful, and those are what Goal 1 measures.
  * Several of these pieces only serve later users:
    * the PATH fix matters only when the app is opened from Finder;
    * the off switch guards install and sign-in buttons that don't exist until Phase 3;
    * the version check guards two parts that always ship together.
  * Terminal mode already writes the full report as HTML (lines 223 and 860), and Liam already uses a terminal.
  * For the test, the window adds only the "flag this claim" button.
* **Rationale & Recommendation**:
  * Start the Goal 1 month as soon as `tearsheet-engine run` writes the full report.
  * Add a `tearsheet-engine flag <claim-id> "note"` command that writes to the claim-flags table. Print each claim's ID next to its footnote in the HTML.
  * Build the window alongside the test or after it, without holding the test up. The window also waits on its own look-and-feel brainstorm (line 126).
  * Move the PATH fix, the Connections screen, the button off switch and the version check to Phase 3.
  * If Liam wants a window in Phase 1, cut it to one screen that shows the engine's HTML and sends `run_report` and `flag_claim`.

### 3. Phase 1 is built one layer at a time, so the first complete report only appears at item 39 - Severity: Major
* **Reviewer Lens:** `egm-zoom-out` (instance B)
* **Affected Scope:** Implementation plan introduction (line 698); Phase 1 items 12-40 (`Lines 862-1165`); `pipeline.py` (`Lines 1143-1151`).
* **Discrepancy Description**:
  * The build order is: storage, methodology files, data clients, company lookup, clean-up of the financial data, peers, metrics, score, valuation, range, flags, rating, filing text, news, extraction, prompts, narration, rendering, the report template and the checks. Only after all of that comes the pipeline that joins them.
  * A one-person builder sees no report until almost everything exists.
  * The parts most likely to be wrong for usefulness surface last: what the text says, and which sections Liam actually reads.
  * By then the heaviest number code (data clean-up, three valuation methods, peer valuations) is already built and tested to the 85% coverage target.
  * "Each phase ends in something that runs" is true of the phases. It is not true of the months inside Phase 1.
* **Rationale & Recommendation**:
  * First, build a thin end-to-end version: `pipeline.py`, `render.py` and the template, with all 14 steps as placeholders. Then `engine run GOOGL` prints a nine-section HTML report within the first days of Phase 1.
  * Then replace the placeholders in the order that most changes what Liam reads:
    1. fetching and the filing-text layer;
    2. extraction and narration with citations;
    3. the number guard and the citation check;
    4. metrics, score, valuation, range and rating.
  * Nothing Liam asked for leaves Phase 1. He simply starts reading unofficial reports weeks earlier, with no predictions logged.

### 4. Every rating quietly values every peer company with all three methods - Severity: Major
* **Reviewer Lens:** `egm-zoom-out` (both instances)
* **Affected Scope:** Settled default "Sector benchmark's expected return" (line 715); §7 Buy and Sell rules (`Lines 336-337`); item 24 (`Lines 983-989`); item 27 (`Lines 1013-1019`); item 30 (`Lines 1041-1048`); Phase 0 tests (`Lines 836-848`); golden set (`Lines 1201-1207`); speed targets (`Lines 668-670`). This builds on Liam's decisions to rate against the sector (line 191) and to use three valuation methods (line 193), and does not reopen them. The rule for valuing every peer is the drafter's default.
* **Discrepancy Description**:
  * The sector's expected return is "the median base-case return across the company's peer group, computed by running the same valuation code on every peer".
  * With 20-70 peers, every rating runs the three methods on every peer, plus the special paths for banks, insurers and property trusts. The three methods are discounted cash flow, residual income and peer multiples.
  * Every peer then needs the full cleaned-up financial statements: cash flow after stock pay, leases, minority interests, preferred stock, debt and book value. The score's peer rankings need only a few ratios.
  * This is the design's largest hidden cost, and it feeds the headline rating. Yet it sits in a defaults table, not the decisions table.
  * Nothing measures it:
    * Phase 0 has no pass mark for peer valuations.
    * The golden set checks no peers.
    * Replay must reproduce every peer's valuation.
    * There is no rule for what happens when too few peers produce a valid value.
  * The approach has a real benefit: it cancels any bias the valuation models share across a whole sector, such as a cash-flow model that undervalues every growth stock. The design neither states this benefit nor weighs it against the cost.
* **Rationale & Recommendation**:
  * Move this into the decisions table, with its cost stated, and choose between two options:
    * **(a)** Set the sector's expected return to the sector's market-value-weighted cost of equity minus its dividend yield. This treats the sector as fairly priced and needs no peer valuations.
    * **(b)** Keep the peer median, but value each peer with one cheap method, for example peer multiples only.
  * Either way:
    * set a minimum number of valid peer values, below which the rating is withheld;
    * add a Phase 0 pass mark for the share of peers that produce a valid value;
    * put one full sector group into the golden checks;
    * store the peer values in the run record so replay can check them.

### 5. Two separate ways of downloading from SEC, and one of them can bypass the raw-data store - Severity: Major
* **Reviewer Lens:** `egm-zoom-out` (both instances)
* **Affected Scope:** §3 step 2 (line 250); §6 (lines 318 and 326); item 4 `http.py` (`Lines 762-773`); item 5 `rawstore.py` (`Lines 775-782`); item 16 `sec.py` (`Lines 921-928`); items 23 and 31 (lines 978 and 1054); Goal 2 (line 81); Goal 8 (line 93). This must be settled before the first logged prediction.
* **Discrepancy Description**:
  * The design builds its own SEC request limiter, identity header, retry-with-backoff logic and response checks.
  * It also fetches company data and filing sections "through edgartools". That library makes its own web requests, sets its own identity header, and in recent versions throttles itself and keeps its own local cache. Both reviewers say to check this against the pinned version.
  * Line 782 says "every fetch in the engine goes through" the raw-data store. That can't hold if edgartools downloads files itself.
  * Bytes that skip the store are missing at replay time, so the SEC data behind the numbers can't be re-checked. That breaks Goal 2.
  * The same bytes are missing from the logged inputs too, which breaks Goal 8.
  * This gap can't be filled in after logging starts.
* **Rationale & Recommendation**:
  * In Phase 0, decide which part owns SEC downloads, and say so in §3.
  * The simplest option is:
    * the engine fetches the raw files with one rate-limited `httpx` client;
    * it uses the existing `tenacity` library for retries instead of hand-written backoff;
    * edgartools only reads and standardizes the stored files.
    * This needs a check that edgartools can read from local files.
  * If it can't, let edgartools download, and copy everything it downloads into the raw-data store.
  * Don't build a second SEC limiter if edgartools already has one.
  * Add a test that replays a run with the network turned off. It is the cheapest proof that nothing went around the store.

### 6. Steps run out of order: Metrics and Rate use filing-text results that are only produced later - Severity: Major
* **Reviewer Lens:** `egm-zoom-out` (both instances; A rated it Nit, B rated it Major)
* **Affected Scope:** §3 steps 4, 7 and 8 (lines 252, 255 and 256); §7 red-flag caps (line 341); item 29 `flags.py` (`Lines 1030-1039`); item 32 (`Lines 1059-1065`); item 42 replay (`Lines 1175-1178`).
* **Discrepancy Description**:
  * Step 4 (Metrics) lists "filing-text change scores".
  * Step 7 (Rate) applies red-flag caps that need the material-weakness disclosure (10-K Item 9A) and going-concern language.
  * All of these come from step 8, the filing-text layer.
  * The earlier review raised this order problem (`concepts_brief.md`, its M7), and it is still unfixed. Replay inherits the same order.
  * There is also a mismatch in the flag list:
    * §7 caps the rating on three red flags;
    * `flags.py` (line 1038) adds a fourth, the year-over-year risk-factor change score, without saying whether it also caps the rating.
    * If it does, the rating, which code alone produces, would move whenever the filing parser is upgraded.
* **Rationale & Recommendation**:
  * Kept at Major because an earlier review already raised it and it is still open, and because it affects replay.
  * Move the filing-text layer to just after Fetch, next to the data clean-up.
  * In §7, list exactly which flags cap the rating.
  * Keep the change score for display only, unless Liam wants it to cap the rating.

### 7. The rule against flip-flopping ratings depends on stored history that replay doesn't capture - Severity: Major
* **Reviewer Lens:** `egm-zoom-out` (both instances; A rated it Major, B rated it Nit)
* **Affected Scope:** §7 Buffer (line 342); settled default (line 719); item 30 (`Lines 1041-1048`); item 42 replay (`Lines 1175-1178`); §10 prediction fields (`Lines 390-397`); Open Questions (line 116). This is not Liam's decision. Brief §8 marks it "[proposed]", and line 116 says it will be decided in the Technical Plan, but the decisions table has no row for it.
* **Discrepancy Description**:
  * The buffer judges a new rating against "the latest official rating" in the database.
  * That rating is not stored as one of the run's inputs. A later replay can find a different "latest" rating (even the run's own) and report a mismatch. That breaks Goal 2.
  * On one personal machine, the latest official rating could be 11 months old and made under a different methodology version.
  * The buffer exists to stop rating churn from daily recalculation. Tearsheet runs on request, and the 30-day "official prediction" window (line 190) already limits churn.
* **Rationale & Recommendation**:
  * Kept at Major because it breaks replay, and the problem becomes permanent once predictions are logged.
  * Drop the buffer in the first version. Show "previous official rating: X on [date]" next to the new rating.
  * If the buffer stays:
    * apply it only within the same methodology version and within 12 months;
    * store the previous prediction's ID as a run input;
    * add a row for it to the decisions table.

### 8. The methodology fingerprint covers files that can't change a prediction - Severity: Major
* **Reviewer Lens:** `egm-zoom-out` (both instances; A rated it Major, B rated it Nit)
* **Affected Scope:** §6 (`Lines 319-325`); item 14 (`Lines 901-914`); item 15 (`Lines 916-919`); §9 editable allowlist (line 382); Non-Goals (line 98); Jev threshold in `bands.yaml` (line 1135); Phase 2 tuning (line 1286); items 45 and 56 (lines 1215 and 1314). This must be settled before the first logged prediction.
* **Discrepancy Description**:
  * The methodology hash (a fingerprint of the settings files) splits the prediction log into versions. It should change only when the score, range or rating rules change.
  * Instead it covers the whole folder, including several files that can't move a rating:
    * the news allowlist (news never affects the rating, line 98);
    * `aliases.yaml`, which only looks up names;
    * `fred.yaml`, which only lists display series;
    * the Jev threshold, which sits in `bands.yaml`.
  * So adding "Facebook" as an alias, adding one news site, or tuning Jev in Phase 2 starts a new version and splits an already small track record.
  * It is also a dead end. The allowlist is meant to be user-editable. But from Phase 3 the folder ships inside the signed, read-only app, so user edits have nowhere to live.
  * The earlier review (`concepts_brief.md`, its N3) asked for shipped defaults to be kept apart from user changes. That hasn't been done.
* **Rationale & Recommendation**:
  * Kept at Major because a wrong split is permanent once predictions are logged, and because of the read-only dead end.
  * Split the folder in two:
    * `methodology/`: weights, bands, valuation, peer rules and SIC overrides. Hashed and logged with each prediction.
    * A separate settings or reference folder: aliases, the FRED list, the default allowlist and the Jev threshold. Not part of the methodology hash, but its own hash is recorded on each run.
  * Keep the user's allowlist edits in the app data folder, applied on top of the shipped default.

### 9. The Codex connector is on Phase 0's critical path - Severity: Major
* **Reviewer Lens:** `egm-zoom-out` (instance B; instance A raised the same point inside its "Phase 2 work in Phase 1" finding)
* **Affected Scope:** §4 (`Lines 264-280`), especially "Both connectors must" (`Lines 275-278`); item 8 (`Lines 805-817`); item 10 lockdown test (`Lines 837-839`); Phase 2 skeptic (line 1285); CUJ 1 (`Lines 130-134`). This touches Liam's decision that both Claude Code and Codex are launch tools. Only the timing is questioned.
* **Discrepancy Description**:
  * Liam's user journeys assume Claude Code. In the first version, Codex is needed only to run the second-opinion "skeptic" check on a different AI model, and item 53 turns that on in Phase 2.
  * Yet Phase 0 builds the harder of the two connections. It is a long-running background program that needs:
    * its own message-ID tracking;
    * a refusal for every approval request;
    * constant reading of its error output;
    * handling for "please log in again".
  * Its lockdown also has to be proved separately, because a read-only sandbox is a weaker promise than "every tool denied".
  * This doubles the security-sensitive surface before the first report exists.
* **Rationale & Recommendation**:
  * Keep the single connector interface.
  * Build and lock down Claude Code in Phase 0.
  * Build Codex when the other-tool skeptic turns on in Phase 2, or earlier only if Codex is Liam's everyday tool. A cheap Codex probe can stay in the lockdown test if wanted.
  * Reword the day-one test as "each connector, before its first use".

### 10. Phase 1 builds grading and Phase 2 checks early, and the design disagrees with itself on when the checks switch on - Severity: Major
* **Reviewer Lens:** `egm-zoom-out` (both instances; A rated it Major, B split it into two Nits)
* **Affected Scope:** item 40 `grade_due()` (`Lines 1153-1165`); §2 `grade_due` command (line 235); item 52 Log view (`Lines 1268-1277`); item 38 (`Lines 1126-1141`); item 53 (`Lines 1281-1288`); decisions table, Jev row (line 188); A24 (`Lines 622-626`); `test_predictions` (line 1195); Goal 8 (line 93). This touches Liam's decisions on Jev, the 300 hand labels and grading. Only timing and clarity are questioned.
* **Discrepancy Description**:
  * **Grading is built before there is anything to grade.**
    * No prediction can be graded until it is 3 months old.
    * Yet the grader is built in Phase 1, together with its command and the grades screen. It covers return against the sector and the S&P 500, whether the price ended inside the range, hit rate, Brier score and three baselines.
    * Goal 8 needs the prediction records from day one, not the grader.
  * **The design disagrees with itself on the checks.**
    * Line 188 and A24 say Jev runs whenever a key is set, and Liam always sets one.
    * Item 38 runs the skeptic on the other AI tool whenever both tools are connected.
    * Item 53 says both are only "turned on" in Phase 2, with Jev's threshold tuned on the 300 hand labels.
    * A reader can't tell which checks run during the Goal 1 month, or what Jev threshold applies before the labels exist. Goal 1 requires every report to show which checks ran.
* **Rationale & Recommendation**:
  * Kept at Major because the check set is part of what Goal 1 judges.
  * In Phase 1, write predictions and `export-log` only. Build `grade_due()`, its command, its tests and the grades view in Phase 2.
  * State in one place which checks Phase 1 uses.
  * If Jev runs during the Goal 1 month, give it a provisional threshold and label it as provisional in the report's checks box. Another option is to show Jev's labels without letting them decide pass or fail until the threshold is tuned.

### 11. The backup plan for a failed Claude Code lockdown probably won't help, and it splits the run across two languages again - Severity: Major
* **Reviewer Lens:** `egm-zoom-out` (both instances; A rated it Nit, B rated it Major)
* **Affected Scope:** §4 (line 280); A5 (`Lines 479-486`); item 7 (`Lines 793-803`).
* **Discrepancy Description**:
  * If the Python Agent SDK can't deny every tool, the plan moves the AI calls into a TypeScript helper inside Electron.
  * Both SDKs drive the same `claude` program with the same permission rules:
    * if the fault is in the program itself, the TypeScript route fails the same way;
    * if only an option is missing from the Python SDK, Python can call the program directly.
  * The move also has three side effects:
    * it brings back the Python-to-Electron-to-AI path that the earlier review's B2 removed;
    * it undoes the "Python runs every step" decision (line 182);
    * it makes terminal mode, the main testing tool in Phases 0-1, depend on a running Electron app.
* **Rationale & Recommendation**:
  * Kept at Major because the fallback probably doesn't fix the failure it is meant for, and it would undo a core decision.
  * Make the first fallback a direct call from Python: run the `claude` program in non-interactive mode, ask for JSON output, and switch off tools and settings explicitly. This matches how the Codex connector already drives its program.
  * If the program itself can't be locked down, narrow Claude's role or send that call to the other tool, rather than switching languages.
  * Keep the TypeScript helper only as a last resort, if at all.

### 12. AI tool detection is built twice, once in each language - Severity: Major
* **Reviewer Lens:** `egm-zoom-out` (instance A)
* **Affected Scope:** decisions table (line 182); §1 diagram (line 202); item 3 (line 759); item 7 sign-in check (line 803); item 41 `list_tools` (line 1171); item 48 (`Lines 1232-1243`). This touches Liam's decision that Electron "finds the AI tools".
* **Discrepancy Description**:
  * The Python engine finds and checks `claude` and `codex` for terminal mode, for Phase 0 and for its `list_tools` command.
  * Electron keeps its own table of tools and status checks as well.
  * That makes two tables of program names, version commands and sign-in commands, in two languages. This is the part of the system the vendors change most often.
  * The guide this design follows (`docs/references/local-cli-guide.txt`, pages 4 and 12) says to keep every command in one table for exactly this reason.
* **Rationale & Recommendation**:
  * Keep one table. The option that respects Liam's decision:
    * Electron owns the PATH fix, detection and sign-in checks (the code copied from Realm), and passes the tool paths to the engine.
    * In terminal mode, the engine just looks the program up on PATH. It relies on the connector's sign-in error to tell the user when they need to log in.
    * Drop `list_tools` and the sign-in check from the engine.
  * The reverse, where the engine owns detection, would need Liam's agreement.

### 13. The message format between the app and the engine has no way to answer a question - Severity: Major
* **Reviewer Lens:** `egm-zoom-out` (instance A; instance B separately called the version handshake unnecessary)
* **Affected Scope:** §2 (`Lines 225-243`); item 41 (`Lines 1167-1173`); item 51 (`Lines 1263-1266`); item 57 (`Lines 1318-1329`); item 8 (`Lines 813-816`).
* **Discrepancy Description**:
  * The app sends question-style commands: `get_report`, `list_reports`, `list_predictions` and `status`, plus `set_key` and `list_tools` in item 41.
  * The engine only sends three kinds of message: `progress`, `report_ready` and `error`.
  * There is no reply message, and no request number to match a reply to its question.
  * Filling that gap means re-inventing question-and-answer matching. JSON-RPC 2.0, an existing standard message format, already defines this, and the engine already has to speak something close to it with `codex app-server` (item 8).
  * The version handshake guards against a mismatch that can only happen during development, because the app and the engine always ship in the same build.
  * The script that generates the TypeScript types doesn't name the tool it will use.
* **Rationale & Recommendation**:
  * Use JSON-RPC 2.0, one message per line:
    * commands become requests with an ID;
    * `progress` and `report_ready` become notifications, which need no reply.
  * On the app side, use an existing library (for example the `json-rpc-2.0` npm package). On the engine side, share the line-reading code with the Codex connector.
  * For the TypeScript types, either turn Pydantic's JSON Schema output into types with `json-schema-to-typescript`, or hand-write the dozen or so types.
  * Cut the handshake down to a logged version line.

### 14. Interfaces and safeguards built for needs that don't exist yet, and no home for the analyst view - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out` (both instances)
* **Affected Scope:** analyst ratings default and provider interface (line 722; item 21, `Lines 958-964`); report outline (`Lines 13-23`); Goal 4 (`Lines 83-86`); CUJ 2 (`Lines 136-143`); template, item 37 (`Lines 1116-1124`); S&P 500 membership history (line 299; item 17, `Lines 930-936`); split check (line 292; line 951); next-earnings-date estimate (line 721). This touches Liam's decision to show analyst ratings from day one. The source for them is still open.
* **Discrepancy Description**:
  * Several pieces are built for needs that don't exist yet:
    * a "provider interface, so Benzinga can be added without other changes", for a paid option Liam has deferred;
    * a dated history of S&P 500 membership that nothing reads, since grading uses CIKs and frozen peer lists, and backtesting is out of scope;
    * a check for unrecorded stock splits on top of Massive's own split data;
    * a homemade estimate of the next earnings date from past 8-K filings, when Alpha Vantage, already a dependency, may provide an earnings calendar.
  * Meanwhile, no section, goal, user journey or template says where the analyst view appears in the report.
* **Rationale & Recommendation**:
  * Write one plain Alpha Vantage function, with no interface around it.
  * Name the report section that shows the analyst consensus (section 1 or 7), with the base-rate note from line 46.
  * Store the current member list with its "as of" date, and record its hash on each run.
  * Add the split check only if a golden run catches a bad split.
  * Check Alpha Vantage's earnings calendar before writing the 8-K estimate.

### 15. Code-level detail in the design, and Phase 3 specified too early - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out` (both instances)
* **Affected Scope:** the 21-table database layout (`Lines 296-317`, `Lines 870-899`); function signatures and error names (`Lines 779-780`, `Lines 788-791`); paragraph-ID format (line 1056); word and token limits (lines 1076 and 1085); detection result shape (line 1241); Phase 3 items 55-57 (`Lines 1295-1329`); `node-pty` in the Phase 1 dependencies (line 1213); the button off switch in the engine's `config.py` (line 760); §12 (line 428).
* **Discrepancy Description**:
  * Column lists, function signatures, error names, size limits and terminal sizes are coding choices. They will change in the first week of building, and the document will then be wrong.
  * Phase 3 depends on Goal 1 passing and on Anthropic's answer, and the guide warns that the AI tools' options keep changing. Yet Phase 3 is specified down to terminal size, output caps and timeouts.
  * `node-pty` is a native module that must be rebuilt for Electron. Listing it in Phase 1 adds build trouble for a feature that may never ship.
  * The setting that hides the install and sign-in buttons belongs to Electron, which owns the buttons, not to the engine.
* **Rationale & Recommendation**:
  * In the design, keep only these:
    * the parts of the system;
    * how data flows between them;
    * what is stored;
    * the methodology numbers Liam must approve.
  * Leave the rest to the code.
  * Cut items 55-57 to a short outline that names the trigger and the Realm files to copy.
  * Add `node-pty` only when item 55 is built.
  * Move the button setting to Electron.

### 16. A homemade migration table duplicates a built-in SQLite feature - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out` (instance A)
* **Affected Scope:** §6 table list (line 317); item 12 (`Lines 862-867`); rollout and rollback (line 672).
* **Discrepancy Description**:
  * The design adds a `schema_migrations` table and its own runner to track database versions.
  * SQLite already stores a version number in every database file for exactly this purpose (`PRAGMA user_version`).
* **Rationale & Recommendation**:
  * Store the schema version in `user_version`.
  * Apply numbered `.sql` files inside one transaction, after the backup copy is made.
  * Drop the extra table.

### 17. Report content and peer lists are stored more than once - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out` (instance A; instance B made a related suggestion)
* **Affected Scope:** item 13 (`Lines 870-899`), especially the `reports`, `sections` and `claims` tables, and `peer_groups` vs `predictions.peer_ciks_json` (lines 886 and 896).
* **Discrepancy Description**:
  * The `reports` JSON, the `sections` table and the `claims` table each hold the report's content, so they can drift apart.
  * The peer list is stored twice: in `peer_groups` and in `predictions.peer_ciks_json`.
  * Each separate table of derived, per-run data also adds work to every database upgrade.
* **Rationale & Recommendation**:
  * Keep `claims`, because flags need its IDs, and keep one rendered form of the report. Build sections from the report JSON when needed.
  * Store the peer list once.
  * Consider storing derived per-run values as one versioned run document instead of several tables.

### 18. Momentum scaling needs 10 years of index data that the plan never fetches - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out` (both instances)
* **Affected Scope:** settled default "Momentum scaling" (line 717); Open Questions on Massive's limits (line 121); `fred.yaml` (line 913).
* **Discrepancy Description**:
  * The rule needs the S&P 500's 1-month volatility, ranked over the last 10 years.
  * Massive's free plan is expected to keep about 2 years of history.
  * No other source is named, and `fred.yaml` lists no index series.
* **Rationale & Recommendation**:
  * Name the source. FRED's `SP500` series is already a dependency and may cover about 10 years of daily closes; check its length and terms.
  * Otherwise, leave the rule out of the first version's weights file and say so in the methodology section.

### 19. Three years of insider filings for a flag that is only displayed - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out` (instance B)
* **Affected Scope:** §3 step 2 (line 250); item 16 (line 927); item 29 (line 1039); the Phase 0 SEC limit (line 842).
* **Discrepancy Description**:
  * The insider-buying flag never enters the score, and insider purchases at large companies are rare.
  * Yet every first run fetches three years of the company's Form 4 filings, often 100 or more.
  * Those requests count against the 300-request limit for a first run.
* **Rationale & Recommendation**:
  * Fetch the last 6 months first.
  * Pull the three-year history only when there is a purchase to test.
  * Use edgartools' own Form 4 reader.

### 20. "Industry" actually means one of 11 broad sector groups - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out` (instance B)
* **Affected Scope:** §8 "same-industry peers" (line 363); peer trends row (line 189); settled defaults (`Lines 710-711`); item 24 (`Lines 983-989`). This partly touches Liam's approved report outline ("3-5 largest peers").
* **Discrepancy Description**:
  * One map of 11 broad groups drives three things: the score rankings, the "same-industry" valuation multiples and the industry-trends reading.
  * For a chipmaker, the 3 largest companies in a broad technology group are likely Apple, Microsoft and Nvidia. Section 8 would then read the wrong filings.
  * The research behind the multiples says that close industry peers matter for accuracy.
* **Rationale & Recommendation**:
  * Either say "sector" throughout and accept the limitation.
  * Or add one finer level, used only for the multiples and the trends reading. For example, 3-digit SIC codes with a minimum group size.

### 21. A new reader meets unexplained names and an out-of-date Open Questions list - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out` (both instances)
* **Affected Scope:** lines 90-91, 102 and 438; Open Questions (`Lines 109-126`) against the decisions table (`Lines 180-194`) and settled defaults (`Lines 704-723`); Goal 6 (`Lines 88-91`); CUJ 1 (`Lines 130-134`); item 3 (line 757); item 20 (`Lines 953-956`).
* **Discrepancy Description**:
  * Four names are used before they are explained:
    * Jev, an outside claim-checking service;
    * Massive, the price-data service, formerly Polygon.io;
    * Realm, the open-source project the Electron code is copied from;
    * Finava, which is never explained (line 102).
  * Seven "open" questions are already settled elsewhere in the same document:
    * who runs the report;
    * the S&P 500 member list;
    * what the rating means;
    * how news is read;
    * the valuation methods;
    * peer trends;
    * Jev.
  * A reader can't tell what is still open for approval.
  * Goal 6 and CUJ 1 leave out the free FRED key that item 20 needs.
  * A related inconsistency, found while checking this report: item 3 lists the Keychain entries as `massive`, `jev` and `alphavantage`, but item 20 stores a `fred` key too.
* **Rationale & Recommendation**:
  * Define each name in one line where it first appears.
  * Mark the settled questions "decided, see Technical Plan". Keep only the questions that are truly open:
    * the analyst ratings source;
    * Massive's limits and terms;
    * AI usage;
    * the SEC request count;
    * Anthropic's and OpenAI's terms;
    * the name;
    * the report's look.
  * Add the FRED key to Goal 6, CUJ 1 and the `config.py` key list.
