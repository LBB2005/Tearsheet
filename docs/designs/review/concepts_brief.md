# Stock Report App (working name)
* **Author:** Liam Blackshaw-Brown
* **Date:** 2026-11-02

## Overview

**The concept.** A free, open-source Mac desktop app (Electron for the window, a bundled Python engine, and a SQLite file for storage). A person types an S&P 500 company name or ticker and gets one new, cited research report each run.

- **Python code makes every number:** every metric, the score, the Buy/Hold/Sell rating and the 12-month bear/base/bull range. It uses free data: SEC EDGAR filings and their structured financial data (XBRL), insider-trade filings (Form 4), free daily closing prices for the company and its sector peers, and FRED economic series.
- **The user's own AI tool does the reading and writing.** That is Claude Code or Codex, detected on launch, with a one-click install or sign-in button if missing and an API key as fallback. It reads the company's and peers' filings and allowlisted news and blog articles, then writes a 9-section narrative.
- **Every claim is checked:** a numeric guard, a citation check, Jev (optional, with the user's own key), and a skeptic pass that runs on the other AI tool when both are connected.
- **Everything stays local.** Reports and a prediction log stay on the user's computer.
- **Success bar:** the app is useful to Liam.

**How this brief was produced.** Six independent reviewers each read the concept brief v5 (`docs/brief.md`), the record of the switch to local AI tools (`docs/local-cli-pivot.md`), and both research reports. Each looked through one lens:

| Reviewer | Lens | Status |
| --- | --- | --- |
| egm-design | Cost, usage limits and architecture | completed |
| egm-codebase-details | Accuracy of assumptions about outside tools; debuggability | completed |
| egm-zoom-out | Contrarian: what is not needed to meet the bar | completed |
| egm-comprehension | What the user must understand and do | completed |
| egm-implementation-readiness | Change over time; readiness for `/egm-draft` | completed |
| egm-structural | Long-term maintenance for one maintainer | completed |

The guide PDF that brief v5 cites is not in the workspace, so no reviewer read it. Reviewers had no web access. Statements about outside tools, limits and terms marked **(unverified)** come from reviewers' general knowledge. Check them in Phase 0 before relying on them.

**Result in brief.** All six reviewers endorse the core split: code makes every number, and the AI only reads and writes, with no tools, through placeholders that code fills. The most serious problems are these:

- **The success bar has no test.** The first test of usefulness comes only after the whole engine is built.
- **The run is split across two runtimes.** The run is controlled in Python, but every AI call goes through TypeScript.
- **No price source is chosen.** The kind of price data is also undefined.
- **The prediction log records too little** to be graded or compared later.
- **As written, one run could make thousands of SEC requests.**

## Analysis

Severity: **Blocker** means it must be settled before `/egm-draft` or before the first prediction is logged, because it cannot be fixed afterwards or it stops the concept working. **Major** means a significant risk or gap to resolve in the formal design. **Nit** means minor or easy to fix.

### Blocker

**B1. There is no test for "useful to Liam", and the first test comes only after the whole engine is built.**
- **Raised by:** zoom-out (Blocker), structural (Major).
- **Where:** brief §1, §13, §16.
- **Problem:** "Useful to Liam" is the only goal, but nothing says how Liam will know it has been met. Phase 1 still contains the full numbers engine, the narrative, the checks, the log and a window. The v3 stress test (§13) already said "Phase 1 is the whole product", and v5 repeats it. Phases have no pass marks or durations. So the first evidence that the app is useful arrives after the most expensive work.
- **Recommendation:**
  - Write the test now, in Liam's own words. Example: for four weeks, Liam runs reports on companies he is actually considering and keeps choosing them over his current sources. A "flag this claim" button (M16) counts the errors he finds.
  - Split Phase 1 into 1a (a cited filing narrative plus a few code-made metrics) and 1b (score, valuation, range and rating), and run the test after 1a.
  - Give each phase a pass mark and a rough duration.

**B2. The run is controlled in Python, but every AI call goes through TypeScript.**
- **Raised by:** structural (Blocker); design, zoom-out, implementation-readiness (Major).
- **Where:** brief §4 (adapter paragraph), §10, §11.
- **Problem:**
  - **Every AI step crosses two runtimes.** The step sequence (`pipeline/`) and the AI steps (`llm/`) are Python, but the adapters (`packages/adapters`) are TypeScript inside Electron. Each AI step goes Python → Electron → AI tool → vendor and back. Both sides then need timeouts, cancellation and error passing, in the part of the system that changes most often.
  - **The run is fragile and hard to test.** If Electron's main process restarts, the run dies. Phase 1 and the evals both need the full app running.
  - **The contract covers data shapes only.** "Pydantic → generated TypeScript types" does not say how messages travel, how progress is reported, how a run is cancelled, what happens when the engine crashes, or how versions are checked. It also does not say which process writes to SQLite. Two writers on one file tend to cause locking bugs.
- **Recommendation:**
  - **One process owns the run.** Three reviewers prefer Python. The Claude Agent SDK has a Python package, and `codex app-server` speaks JSON lines over standard input and output from any language (both stated in pivot §5). TypeScript keeps the PATH fix, tool detection, install and sign-in, and the window.
  - **The engine is the only SQLite writer.**
  - **Define a versioned engine interface.** It covers commands, progress events, errors and cancellation, with a version handshake at startup and a `schema_version` on every stored JSON payload.
  - **Trade-off:** less reuse of Realm's TypeScript adapter code.

**B3. No price source is chosen, and the kind of price is undefined.**
- **Raised by:** implementation-readiness (Blocker); design, codebase-details, structural (Major).
- **Where:** brief §7, §8, §9, §16 Q3.
- **Problem:**
  - **Prices feed most of the report.** They drive momentum, P/E, market value, the value gap behind the rating, the range's starting point, relative strength and every grade, yet the source is still "to research".
  - **The free options are weak (unverified).** Sources that need no account are mainly Yahoo's unofficial endpoints, whose terms bar automated use and which break often, and Stooq, whose availability varies. Free keyed tiers range from too small (Alpha Vantage, about 25 requests a day) to adequate (Tiingo, with symbol caps).
  - **The kind of price is not stated.** The brief does not say whether closes are adjusted or unadjusted. Adjusted series are rewritten after every dividend or split. A start price logged today and an end price fetched 12 months later can then be on different bases, and the data snapshot hash stops matching.
  - **One source is a single point of failure.** If it closes or changes its terms, every open prediction stops being gradeable.
- **Recommendation:**
  - **Pick the source in Phase 0.** Accept a free API key while the app is for Liam.
  - **Put prices behind one interface that records a source ID,** with a second source behind the same interface.
  - **Store prices locally.** Keep unadjusted closes plus splits and dividends, append-only and keyed by CIK (SEC's company identifier). Fetch only new days, and compute total return from the stored data.
  - **Use each kind of price for its own job.** Valuation uses unadjusted closes times XBRL share counts. Momentum and grading use total return.
  - **Fail visibly when prices are stale or missing.** Withhold the rating and show grades as "pending". Never mix sources silently.
  - **Catch unhandled splits** by checking large one-day moves against XBRL share counts.

**B4. The prediction log does not record enough to be graded or compared later, and this cannot be added afterwards.**
- **Raised by:** implementation-readiness (Blocker); structural, codebase-details (Major).
- **Where:** brief §4 steps 2, 7 and 14; §8; §9; §10 "Run record".
- **Problem:**
  - **Each log row is missing what made the rating.** It records the tool, model, prompt versions and a "data snapshot hash". It does not record:
    - the engine version;
    - the settings that produce the rating: `weights.yaml`, `bands.yaml`, red-flag and momentum caps, the buffer, DCF buckets, guardrails, the peer-size rule and SIC overrides;
    - the peer list;
    - the benchmark's starting level;
    - which filings were used.
  - **The probability is left out.** §9's field list omits it, although §4 step 7 logs it and a [decided] item grades it.
  - **The snapshot hash points at data that will be gone.** Data is only "cached for the day" (§4 step 2); v4 said to save a snapshot.
  - **Method changes will be mixed together.** Once weights or bands change, old and new rows land in the same statistics.
  - **The prediction is undefined.** Every run writes a row, and nothing says which run counts as the prediction.
- **Recommendation (all before the first log entry):**
  - **One methodology bundle.** Put every tuned setting in one bundle with a content hash. Log that hash on every row, with the engine release, edgartools version and tag-map version. Changes apply only to new rows. Grades carry a grader version and are never recomputed in place.
  - **Log the missing values:** the probability, the peer list (by CIK), the benchmark's starting level and the filing accession numbers used.
  - **Keep raw data permanently instead of "cached for the day":**
    - Save every response (EDGAR, prices, FRED, articles) under its content hash, with URL, fetch time and status, and never overwrite it.
    - Each run writes a list of the stored data it used. The hash of that list is the snapshot hash.
    - A replay command re-runs the code steps from that list and must give identical numbers.
    - Keep raw downloads in a size-capped folder outside SQLite. The design reviewer estimates hundreds of MB per day of use; this is unmeasured.
  - **Define which run counts,** for example the first run per ticker in each 30 days.

**B5. As written, one run could make thousands of SEC requests.**
- **Raised by:** design (Blocker). This is the design reviewer's estimate; it is not measured.
- **Where:** brief §4 steps 2 and 5; §8 "Added signals"; brief-v4 §8.
- **Problem:**
  - **Every peer needs insider data.** Unusual insider purchases are a scored signal ranked against peers.
  - **The insider test needs years of history.** The routine-versus-opportunistic test in v4 §8 needs about three years of each insider's trades.
  - **That multiplies into thousands of requests.** With 20–70 peers this is roughly 5,000–30,000 Form 4 requests per run, or 10–50 minutes at SEC's limit of 10 requests a second. It repeats daily, because data is only cached for the day.
  - **SEC blocks addresses that exceed its limit** for a period (unverified, high confidence).
- **Recommendation:**
  - **Shrink the insider signal.** Compute it for the company only, as a flag, or take peer data from SEC's quarterly bulk insider-transaction data sets (unverified that these fit; check).
  - **Store filings permanently by accession number** (B4).
  - **Add one rate limiter in the engine,** set below 10 requests a second.
  - **Never cache a failed or non-JSON response.** Otherwise a block page could be stored as data.
  - **Measure EDGAR requests per run in Phase 0.**

### Major

**M1. AI usage per run is probably several times the brief's figure, and there is no pass mark.**
- **Raised by:** design, comprehension.
- **Where:** brief §14; §4 steps 9–13; §6; pivot §10 Q1.
- **Problem:**
  - **The 150K-token figure is out of date.** It dates from v3/v4 and covers only the company's own filings. v5 adds:
    - 3–5 peers' MD&A;
    - a multi-turn news scan;
    - nine narration calls;
    - a self-check when there is no Jev key;
    - the skeptic and any regenerations;
    - fixed overhead on each of 30–50 calls.
  - **The design reviewer's estimate (unmeasured)** is 0.5–1M tokens for the first run in a sector and 0.3–0.6M for later runs.
  - **Evidence reuse saves less than claimed.** Later runs are dominated by steps that are never reused, so the pivot's claim that evidence reuse "removes most of a run's token use" probably no longer holds.
  - **Plans may not stretch that far (unverified).** Subscriptions are metered in rolling windows plus weekly caps, and those limits are shared with the user's other use. Liam's Max plan probably copes; a Pro user may not finish one first run in a single window.
- **Recommendation:**
  - **Choose the model and effort per step** instead of taking the user's default. Use the smallest capable model for extraction.
  - **Build §3.1–3.3 and §3.9 from code templates,** with no AI.
  - **Narrate the remaining sections in one or two calls** that share one input.
  - **Measure the fixed overhead** of a single call.
  - **Write Phase 0 pass marks** for usage and run time, and decide in advance what gets cut if a run misses them.
  - **Warn the user** before the first run in a new sector.

**M2. Nothing defines what happens when a run fails partway, and a run may take a long time.**
- **Raised by:** design, comprehension.
- **Where:** brief §2 step 4, §4 step 13, §1 (fallback), §6.
- **Problem:**
  - **Runs may be long.** The design reviewer estimates (unmeasured) 15–45 minutes for a first run in a sector and 5–15 minutes later.
  - **Failure cases are undefined:** a usage limit reached midway, a sign-in expiring, EDGAR or the price source down, and the user cancelling.
  - **Things can go wrong quietly:**
    - Regeneration can burn the remaining usage.
    - A silent switch to the API key would charge the user money.
    - The skeptic can drop from the other tool to the same tool without saying so.
    - A half-checked report could be saved as finished.
    - If failed runs write no log row, the log is skewed toward successful runs.
- **Recommendation:**
  - **Make the run resumable,** saving each step's output.
  - **Sort AI-tool errors into four kinds:** usage limit (with reset time), temporary, schema failure, and tool-use attempt.
  - **On a usage limit, offer three choices:** resume after the reset, switch tool, or use the API key. The key needs explicit consent each time.
  - **Show the numbers first.** Show the code-only report as soon as the numbers finish, labelled "narrative not written yet", and write the log row at that point.
  - **Make progress and failures readable.** Show plain step names, elapsed time and a cancel button. Each failure names the step, the cause and one action.
  - **While limited,** skip regeneration and record the verification level for each claim.
  - **Limit how many AI calls run at once** for each tool.

**M3. Phase 0 does not test the tool controls the whole design depends on.**
- **Raised by:** codebase-details, implementation-readiness, structural.
- **Where:** brief §4 (adapter rules), §13 Phase 0; pivot §4 item 4.
- **Problem:**
  - **Phase 0 tests too little.** It only proves "gets an answer with no API key". The pipeline needs every tool denied, its own system prompt, and schema-bound output.
  - **Claude Agent SDK (unverified):** it probably supports all three. But schema output may itself arrive as a tool call, which would trip the rule that "any tool use is a failure".
  - **`codex app-server` (unverified):** it sets a sandbox mode and an approval policy per thread, not an empty tool list. A read-only sandbox can still read any file. The user's own global instructions file and connected MCP servers may load into each thread. Output-schema support is unclear.
  - **Already flagged:** pivot §4 item 4 lists Codex system-prompt replacement as unchecked.
- **Recommendation:**
  - **Phase 0 passes only when each tool shows, from its own session report:**
    - zero tools available;
    - the system prompt replaced, with no user instruction files or MCP servers loaded;
    - schema output, always re-checked by Pydantic in the engine;
    - the subscription as the login source;
    - the actual model ID;
    - usage per call.
  - **For Codex,** detect tool use from its item notifications, not only from approval requests.
  - **If a tool cannot be made tool-free,** narrow its role or drop it.

**M4. It is unclear which copy of Claude Code runs, and which account pays.**
- **Raised by:** codebase-details; design and implementation-readiness touch on it.
- **Where:** brief §1, §2 step 1, §10 "Updates".
- **Problem (unverified, medium confidence):**
  - **The SDK brings its own Claude Code.** The TypeScript Agent SDK ships its own copy and starts it with the `node` found on the user's PATH.
  - **So "detect installed Claude Code" mostly detects a sign-in.** The SDK's copy pins the version.
  - **Packaging gets harder.** A packaged app must sign that copy and run it with Electron's own Node, since many users have no Node installed.
  - **An API key can bill the user silently.** An `ANTHROPIC_API_KEY` picked up by the PATH fix overrides the subscription login, so the user's API account is charged without their knowing.
- **Recommendation:**
  - **State in the brief which copy of Claude Code runs.**
  - **Remove API-key variables** from the child process's environment unless the user chose the key fallback.
  - **Log the program path, version and login source** on every call.

**M5. Claude Code and Codex will change under a shipped app.**
- **Raised by:** design, implementation-readiness, structural.
- **Where:** brief §1 [decided], §4, §10, §12; pivot §11.3.
- **Problem:**
  - **The tools update themselves (unverified)** outside the app's releases.
  - **A small change can disable a safety guard.** A renamed permission flag or changed event format can stop the adapter seeing tool-use attempts, and that is the guard the news step relies on.
  - **Copying Realm's files makes Liam the sole maintainer** of a fork of the code most exposed to vendor changes.
  - **The real-tool tests can't run automatically.** "One real-CLI test per tool" cannot run in automated builds without a signed-in account.
  - **The tools do not report a model's training cutoff (unverified),** which §4 step 14 and the §12 evaluation rule both need.
- **Recommendation:**
  - **Copy only Realm's detection and PATH code,** recording Realm's source commit for each copied file.
  - **Keep a known-good version range** for each adapter.
  - **Run a self-test before each run.** A small call proves tools are denied and output matches the schema. If it fails, the app refuses the affected AI step and says why.
  - **Replay recorded tool sessions offline** as contract tests.
  - **Ship an updatable table of training cutoffs,** with "unknown" as an allowed value.
  - **Decide whether to pin** the SDK's bundled Claude Code.

**M6. The news step checks claims against the AI's paraphrase, and it is the only step that gives the AI web tools.**
- **Raised by:** design, codebase-details, structural, zoom-out.
- **Where:** brief §3.7, §4 step 9, §5 "Web articles", §6, §12.
- **Problem:**
  - **The saved "article text" may not be the article.** As written, the AI tool searches, reads pages and saves each article's text. Claude Code's page reader returns a model-processed version of a page, not the page itself, and Codex's search results stay inside the model (unverified, medium confidence). Paragraph IDs and the citation check would then test claims against text another model wrote.
  - **It is expensive.** Returning whole articles as AI output is the most costly kind of usage.
  - **It concentrates the risk of planted instructions.** This is the only step that runs with tools, on a program that can normally run shell commands, so instructions planted in web pages target it. Allowlist enforcement inside Codex is unverified.
  - **The payoff is small.** The news is context that, for large companies, is priced in within about a day [AI], and company-specific bank research is mostly paywalled (pivot §11.3).
- **Recommendation:**
  - **The AI returns only candidate URLs, titles and dates.**
  - **Code does the rest.** It checks each domain against the allowlist, fetches the page, extracts the text (for example with trafilatura), hashes it and assigns paragraph IDs.
  - **Extraction then runs with every tool denied,** as it does for filings.
  - **Alternative (zoom-out):** defer news from v1, or have code read allowlisted RSS feeds and press releases so no AI call ever has tools. Liam asked for news in v1 (pivot §11.4), so this is his call.

**M7. The line between "code makes every number" and "AI writes" leaks in three places.**
- **Raised by:** structural.
- **Where:** brief §3.5; §4 steps 4, 7–10 and 12; §5; §8.
- **Problem:**
  1. **An AI label can change the rating.** In §5 the AI labels changed risk paragraphs as negative or positive, "used as a red flag", and in §8 red flags cap the rating at Hold.
  2. **The steps are out of order.** Step 4 (Metrics) uses filing-text change scores that only step 8 (Text layer) produces.
  3. **The numeric guard lets loose figures back in.** It accepts any number that matches "a cited source". Stress test §4 raised this.
- **Recommendation:**
  - **The rating step takes only code-made inputs.** AI labels are for display only.
  - **Move the text layer before metrics.**
  - **Adopt the stress test §4 rule:** no digits in AI prose except in placeholders, verbatim quotes and years.

**M8. Saved evidence and paragraph IDs can go stale without anyone noticing.**
- **Raised by:** implementation-readiness, codebase-details, structural, design.
- **Where:** brief §4 steps 3 and 10; §5; pivot §10 Q1.
- **Problem:**
  - **AI output is not repeatable.** The pivot record says "the same input gives the same evidence", which AI models do not guarantee. Saved evidence depends on the parser, the paragraph-splitting rule, the extraction prompt, the evidence schema and the model.
  - **A cache keyed by filing alone goes stale silently.**
    - Prompt fixes never reach saved filings.
    - One bad extraction repeats in every "fresh" report.
    - A Codex-written report may rest on Claude's extraction without saying so, which also weakens the skeptic's independence.
  - **The latest 10-K may be the wrong filing.** A 10-K/A often contains only Part III (unverified), so "the latest 10-K" can pick a filing without Items 1, 1A or 7.
  - **Restated values are unhandled.** XBRL company data includes both original and restated values for the same period, and the brief does not say which one the score uses.
  - **A parser upgrade can raise false red flags.** After an edgartools upgrade, comparing this year's Item 1A (new parser) with last year's (old parser) can look like changed text and raise the §3.5 red flag.
  - **Article IDs can collide.** `url-hash#p12` collides when a page is edited at the same URL.
- **Recommendation:**
  - **Cache key:** accession number + section + parser version + splitting-rule version + prompt hash + schema version. Record the tool and model with each entry.
  - **Decide which fields invalidate an entry and which only annotate it.** Invalidating on every model change would wipe out most of the saving.
  - **Keep superseded entries,** because old reports cite them. Store the raw model output, record which entries each run used, and add a "re-extract this filing" action.
  - **Write rules for amended filings and restated values.** Skip amendments that lack the needed Items. Use latest-filed values for today's report and as-first-filed values for the log.
  - **Keep raw filings and article text permanently.** Add a content hash to every paragraph ID, and re-parse both years with the current parser before comparing them.
  - **Pin edgartools to an exact version.** Upgrade only when the golden-number tests pass, and keep the engine's own tag map.

**M9. The rating is the headline, but the research says it carries little.**
- **Raised by:** zoom-out.
- **Where:** brief §3.1, §8, §9.
- **Problem:**
  - **The rating dominates the report and the engine.** It is the cover of the report and most of the engine (§4 steps 5–7).
  - **Its expected edge is small.** §8 puts it at tens of basis points a month, with a 55–57% hit rate at best.
  - **The traditional research [T] backs this.** It finds no reliable difference between rating levels among the largest firms (Barber et al.), and it says to present the rating as a summary of the thesis, not as the product.
  - **The AI research [AI] agrees.** It concludes AI's advantage is in reading, not predicting.
  - **Liam's own log cannot confirm the rating works** (M11).
- **Recommendation:** Put a cited "what changed and why it matters" narrative and a code-made table of factor percentiles at the centre. Add the rating in Phase 1b as a label derived from them. The rating and its layout are [proposed], so this is open.

**M10. The headline numbers are not tied together, and "sector" means two things.**
- **Raised by:** comprehension. Rated Blocker there; rated Major here because definitions in `/egm-draft` fix it, not a change of design.
- **Where:** brief §3.1, §4 step 7, §7, §8.
- **Problem:**
  - **Nothing says what drives the rating.** Step 7 names no input.
  - **The rating and the base case can point different ways.** The base case is today's price grown at the cost of equity minus the dividend yield, plus a third of the value gap. A stock can therefore be rated Sell while its base case sits above today's price. That is correct if Sell means "expected to trail its sector", and confusing if the report doesn't say so.
  - **"Sector" means two things.** The score uses SIC-based peer groups (§7); the rating uses a "sector benchmark" (§8). Common sector funds follow a different classification (GICS), so the two may not match. Stress test §7 recommended building a group index from the peers' own prices.
  - **There is no thesis to summarise.** The rating is described as "a summary of the thesis", but no section states a thesis.
  - **Two volatility numbers could disagree.** The uncertainty level and the range width both come from volatility but are computed separately.
  - **The base-rate note could be misread.** Its 38% could be read as this app's own record.
- **Recommendation:**
  - **§3.1 states the chain in words:** score → rating; value gap → base case; one volatility figure → bear/bull range and uncertainty level.
  - **Beside the rating, say what it means:** "Sell = expected to trail its sector over 12 months, not expected to fall."
  - **Define the benchmark for each peer group:** its own price-weighted group index first, SPY second.
  - **Add a short thesis paragraph,** or drop the word.
  - **Label the base-rate note** "professional analysts, 2000–2009".

**M11. Grading statistics will mislead at Liam's scale, and the graded probability has no defined model.**
- **Raised by:** zoom-out, comprehension; implementation-readiness on the missing probability.
- **Where:** brief §9, §4 step 7.
- **Problem:**
  - **The graded probability is undefined.** A [decided] item grades the "probability of beating its sector", but §8 defines no model for it, and the report never shows it. A Brier score (a measure of how well stated probabilities match outcomes) would grade an arbitrary number.
  - **The statistics will be biased and thin:**
    - The log holds only tickers Liam chose.
    - Repeat runs pile up near-duplicate rows.
    - 3- and 6-month grades judge a 12-month call early.
    - How Holds are scored is undefined.
    - Telling a 55% hit rate from 50% needs about 617 independent forecasts [AI].
- **Recommendation:**
  - **Define the probability,** either as a mapping in `/egm-draft` or by logging the sector percentile and labelling the probability a placeholder.
  - **Keep the append-only log from day one,** but write grading as one script when the first rows reach 3 months.
  - **Grade honestly:**
    - grade one prediction per ticker per window;
    - label 3- and 6-month results "interim";
    - define how Holds are scored;
    - show the count of independent calls and the naive baseline beside every metric;
    - hide hit rates below a stated minimum;
    - use plain words instead of "Brier score".
  - **See also** alternative 20 below.

**M12. Verification results are not defined for the reader.**
- **Raised by:** comprehension; codebase-details on which tool drafts.
- **Where:** brief §6, §4 step 13; pivot §10 Q11.
- **Problem:**
  - **"Verified" can mean four different combinations:** Jev or no Jev, and a skeptic on the other tool, the same tool, or not run.
  - **Self-checking is not disclosed in the brief.** With no Jev key and one tool, the tool that wrote the draft also checks it; only the pivot record says so.
  - **Routing without Jev is unclear.** It is not stated whether every claim then goes to the skeptic.
  - **The unit of failure is mixed up.** Step 13 regenerates a *section* but removes a *claim*.
  - **The skeptic's output is undefined:** remove, rewrite or flag.
  - **Thin sections are unexplained.** A section that loses most of its claims would look thin, with no reason given.
  - **The drafting tool is not fixed.** When both tools are connected, nothing says which one drafts, so reports vary by setup.
- **Recommendation:**
  - **Every report carries a fixed line listing which checks ran.** Never use "verified" on its own.
  - **A removed claim leaves a note in its place,** with the reason: number mismatch, citation not found, contradicted, or skeptic objection.
  - **Above a set share of removed claims,** hold back the section and say why. Show a count of removed claims per report.
  - **Define the skeptic's output.**
  - **Fix which tool drafts** when both are connected (for example, Claude drafts and Codex runs the skeptic), and log it.

**M13. Verification and labelling effort comes before anyone knows the narrative is useful.**
- **Raised by:** zoom-out; implementation-readiness and structural on the threshold.
- **Where:** brief §6 [decided], §4 step 13; stress test §12.
- **Problem:**
  - **The checking stack is large.** There are four checks plus regenerate-and-remove, and the other-tool skeptic needs both subscriptions.
  - **The labelling cost is large.** Jev is [decided], but its ~300 hand-labelled claims are part of roughly 30–40 hours of labelling (stress test §12), spent before anyone knows whether the narrative is useful.
  - **The threshold does not transfer.** It holds only for the tool, prompt and Jev version it was labelled on.
- **Recommendation:**
  - **v1 checks:** the numeric guard, the citation check, and a same-tool skeptic in a fresh session aimed at the optimism failures the AI research lists.
  - **Schedule Jev and the labelling after the Phase 1a usefulness test.**
  - **Store the threshold per tool and per prompt version.**

**M14. S&P 500 membership has no source, and records are keyed by ticker.**
- **Raised by:** implementation-readiness (Blocker); codebase-details, design, comprehension (Nit). Rated Major here: cheap to settle, but it must be settled before the first log entry.
- **Where:** brief §1 [decided], §2 step 3, §4 steps 1 and 5, §9, §11.
- **Problem:**
  - **No membership source is named, and nothing replaces one.** v4's universe module is gone from §11, and SEC's ticker list has no S&P 500 flag (unverified, high confidence).
  - **The official list may have restrictive terms.** It is S&P Dow Jones Indices data, and its terms are unchecked. Stress test §2 suggested ETF issuers' daily holdings files.
  - **Membership changes often.** It changes about 20 or more times a year, so a bundled list goes stale.
  - **Ticker keys break on renames** (FB → META).
  - **Grading gaps:**
    - A company that leaves the index becomes "not covered yet" while its predictions still need grading.
    - Acquired companies stop having prices.
    - Peer groups change without notice.
  - **Messages and lookup are loose.** "Not covered yet" promises coverage the scope does not plan, and ambiguous names are handled only for the Alphabet example.
- **Recommendation:**
  - **Keep a dated membership table** with its source, refreshable without an app release, and log its version with each run.
  - **Use CIK as the key everywhere,** with a ticker history.
  - **Keep leavers gradeable,** and write a rule for acquired or delisted companies.
  - **Freeze the peer list** with each prediction.
  - **Fix the wording and lookup:** say "Outside the S&P 500; not covered", and offer a picker for ambiguous names.

**M15. There is no plan for upgrading or recovering the local database.**
- **Raised by:** implementation-readiness, structural, design.
- **Where:** brief §9, §10 "Storage" and "Updates", §13.
- **Problem:**
  - **Nothing is defined for the database:** no schema version, migration method, backup or owner.
  - **Updates only move forward (unverified).** Electron's updater cannot roll back.
  - **Migrations can rewrite the log.** Many SQLite column changes rebuild a table, which rewrites the "append-only" log.
  - **The first migration will hit an ad hoc schema.** The log starts in Phase 1 but auto-update arrives in Phase 3.
  - **The log is the one thing that cannot be re-fetched,** and with Google backup dropped, a lost laptop loses it.
- **Recommendation:**
  - **From the first commit that writes the database,** use a stored schema version and numbered, forward-only migrations.
  - **Back up before each migration.** Copy the file first and keep several copies.
  - **If the database is newer than the app,** open it read-only.
  - **Migrations never change logged values.** Hashes use a fixed, versioned format.
  - **Add "restore previous data" and "export log" actions.**

**M16. The run record is not enough to debug a wrong report.**
- **Raised by:** codebase-details, implementation-readiness.
- **Where:** brief §4 step 14, §6, §10 "Run record".
- **Problem:** The run record is missing:
  - the engine commit and edgartools version;
  - the settings hashes;
  - the price source and the status of each step;
  - the prompts themselves (not only their version numbers);
  - the raw AI outputs, tool-use events and regenerations;
  - removed claims, with the reason and which check removed them.
- **Recommendation:**
  - **Record each AI session.** For every call, save the tool's opening session message (tools, MCP servers, model, permission mode, login source) and its session ID. The ID points to the vendor's own transcript on disk (unverified).
  - **Show degraded steps in the report header,** for example "no Jev", "skeptic on same tool" or "news failed".
  - **Add a "flag this claim" button** that saves the run and claim IDs. It also feeds the B1 usefulness test.
  - **Write engine errors to a rotating log** Liam can export.

**M17. The anti-flip-flop buffer makes the rating depend on stored state, and the "balanced split" needs a view v5 removed.**
- **Raised by:** structural (Major), zoom-out (Nit).
- **Where:** brief §4 step 7, §8 "Rating".
- **Problem:**
  - **The buffer depends on the last run.** It needs a previous rating, which on one computer is whatever the user ran last, possibly months ago under a different method.
  - **The same data can give different ratings.** Two users with identical data can get different ratings. That conflicts with "every run is fresh" and makes tests depend on stored state.
  - **The buffer's original reason does not apply.** That reason was trading costs and daily recomputation, which on-demand runs do not have.
  - **A balanced split needs every company.** A balanced Buy/Hold/Sell split needs all ~500 companies, which v5 removed along with the nightly job.
- **Recommendation:**
  - **Drop the buffer, or pin it down.** Either drop it and show "last rating on [date]" beside the new one, or define the previous rating precisely (same ticker, same methodology version, within N days), log it, and say in the report when the buffer held a rating.
  - **Set `bands.yaml` with an offline code-only run** over all ~500 companies.

**M18. The valuation stack is heavier than its effect on the output.**
- **Raised by:** zoom-out.
- **Where:** brief §8 "Valuation", §3.3, §4 step 6.
- **Problem:**
  - **The stack is large:**
    - a three-scenario DCF;
    - a residual-income cross-check;
    - comparisons with peers' multiples;
    - an equity bridge;
    - a bank and insurer path;
    - a REIT path;
    - guardrails.
  - **Its precision barely moves the output.** The base case uses only a third of the value gap, and the bear/bull width comes from volatility.
  - **The research found method choice does not matter.** [T] found the choice of valuation method did not change target accuracy.
- **Recommendation:**
  - **Use one method in v1:** residual income (book value plus excess return on equity), which [T] says relies less on terminal value. The bank and insurer approach (price-to-book against return on equity) is the same idea, so that path mostly merges in.
  - **Cross-check with P/E comparisons.** REITs use price-to-FFO comparisons only.
  - **The DCF comes later.**
  - **Trade-off:** companies with negative or tiny book equity, often from buybacks, need a comparisons-only fallback.

**M19. Reading peers' MD&A for the macro and industry section multiplies cost for the section most likely to be filler.**
- **Raised by:** zoom-out (the v3 stress test §13 said the same).
- **Where:** brief §3.8, §5 "Select".
- **Recommendation:**
  - **v1 is a code-only block:** relative strength against the sector and SPY, plus current FRED readings for the exposures the company names in Item 7A.
  - **Add the peer MD&A comparison only if Liam misses it.**

**M20. The report can read as investment advice.**
- **Raised by:** comprehension.
- **Where:** brief §3.1, §3.9, §4 step 11, §15.
- **Problem:**
  - **"Buy" reads as an instruction,** and the definitions sit at the very end (§3.9).
  - **The checks would not catch advice.** The numeric guard and citation check would pass a sentence like "investors should buy".
- **Recommendation:**
  - **Consider relative labels:** Outperform / In line / Underperform, which [T] notes Goldman used.
  - **Put a one-line definition and "not a recommendation for you"** beside the rating.
  - **Add a code check** that rejects "you should" and buy/sell instructions in AI text.

**M21. The first-run path for other people is incomplete.**
- **Raised by:** comprehension; structural flags the related [decided] item.
- **Where:** brief §2 steps 1–2, §3.7, §7, §15.
- **Problem:**
  - **The setup steps live in a missing document.** They exist only as "guide Steps 1–2 / 6–7", and the guide is not in the workspace.
  - **Missing from the brief:**
    - a default allowlist;
    - whether the price source needs a key;
    - what a user with neither subscription sees;
    - which tool writes when both are connected.
  - **The fallback is a dead end for non-technical users.** If the install button is switched off, the API-key fallback needs a developer account with billing set up (unverified).
  - **Showing a shell command does not help.** A non-technical user cannot judge a command shown before it runs.
- **Recommendation:**
  - **Write each setup step into the brief itself.**
  - **Ship a default allowlist.**
  - **List every key or setting** a user might be asked for, with its default.
  - **Write the "button off" path as its own flow.**

**M22. Releasing to other people adds support work the success bar does not need.**
- **Raised by:** structural (flags a [decided] item), zoom-out (Nit).
- **Where:** brief §1 [decided] "built so non-technical people can use it", §13 Phase 3, §15.
- **Problem:**
  - **One maintainer takes on everyone's problems.** That spans macOS versions, AI tool versions, plan limits and a free price source. When a free source changes, every copy breaks at once.
  - **Much of the planned work serves only other people:**
    - signing and notarization;
    - auto-update;
    - the Connections screen;
    - the install button with its off switch;
    - per-tool golden runs and Pro/Max usage tests.
- **Recommendation:**
  - **Start Phase 3 only after Phase 1 meets the bar,** on a stated trigger.
  - **Email Anthropic sales now.** It costs nothing, and the answer decides whether the button is built at all.
  - **Until Phase 3:**
    - offer detection, written instructions and an API key;
    - measure usage on Liam's plan only;
    - add a diagnostics export;
    - state support limits in the README.

**M23. Packaging the bundled Python for macOS is under-specified.**
- **Raised by:** codebase-details, structural.
- **Where:** brief §10 "Engine", "Updates", "Signing"; §13 Phase 3.
- **Problem (unverified, high to medium confidence):**
  - **Apple requires every binary to be signed.** Notarization needs every executable and library file signed with the hardened runtime and a timestamp. That covers the Python executable, every compiled library in the Python packages, and any bundled Claude Code program.
  - **PyInstaller's one-file mode** unpacks to a temporary folder and conflicts with this.
  - **Python's cache files (.pyc)** cannot be written into a signed bundle.
  - **Electron's updater needs a signed app** and a zip build.
  - **Every dependency update means re-signing.**
- **Recommendation:**
  - **Use a standalone or one-folder Python build,** signed from the innermost files outward by a script that runs on every build.
  - **The build verifies the signatures** and reads Apple's notarization log.
  - **Target Apple Silicon only at first.**
  - **Turn off .pyc writing.**
  - **Stop the engine** before an update installs.

**M24. Brief v5 cannot be read on its own.**
- **Raised by:** structural, comprehension.
- **Where:** brief §2, §4, §6, §8, §10, §13.
- **Problem:**
  - **Key content lives elsewhere:**
    - §8's full text is in brief-v4;
    - "guide Steps" point to a PDF that is not in the workspace;
    - "[P §n]" points into a decision log.
  - **Five kinds of version tag** mix the current design with its history.
  - **Several terms are undefined:** skeptic, numeric guard (including its rounding rule), guardrail flags, red-flag caps, the buffer, equity bridge, TTM, CIK, ACP, "Exhibit 13 filer" and "major events".
  - **Jev is only "(TypeSafe AI)".** A reader cannot tell it is an outside service that receives claims and cited paragraphs. That matters next to "reports stay on the user's computer".
  - **Risks are scattered** across §7, §15, the pivot record and the stress test.
  - **There is no timeline.**
- **Recommendation:** Before `/egm-draft`, rewrite the brief as the current design only:
  - bring §8 in;
  - write out what the guide steps say;
  - add a glossary and one risk table;
  - move the history to a changelog appendix;
  - keep only the [decided] and [proposed] tags.

### Nit

**N1. The brief contradicts itself on whose email goes in the SEC contact header.**
- **Raised by:** codebase-details, design, implementation-readiness, comprehension.
- **Where:** brief §5 "Ingest"; pivot §4 item 8 vs §9.2.
- **Problem:** Brief §5 and pivot §9.2 say the project's email; pivot §4 item 8 says each user's own.
- **Recommendation:** Use Liam's email now. From Phase 3, ask each user for theirs on first run; edgartools already requires an identity setting.

**N2. FRED's API needs a free personal key (unverified, high confidence), but the brief assumes no account.**
- **Problem:** Publishing Liam's key in the open-source repository would likely break FRED's terms.
- **Recommendation:** Liam uses his own key now. Later, ask each user for one, use FRED's CSV download (unverified that it needs no key), or take the series from Treasury or BLS.

**N3. The allowlist rules conflict.**
- **Problem:**
  - Brief §3.7 says sources come "only from an allowlist"; pivot §11.3 says other sources are "shown as 'other,' or dropped".
  - The section title "credible sources" vouches for whatever the user adds.
  - An app update would either overwrite the user's edits or leave them on stale defaults.
  - If the YAML settings files are editable, a user's edits become unlogged method changes.
- **Recommendation:**
  - Pick one allowlist rule.
  - Rename the section to something like "News and commentary from your source list".
  - Store shipped defaults separately from user overrides, and log the effective settings hash with each report.

**N4. The folder layout (§11) does not match the pipeline (§4).**
- **Problem:**
  - The Resolve step has no folder.
  - The uncertainty level is made in Value but lives in `rating/`.
  - The skeptic is part of Verify but lives in `llm/`.
  - Grading at app start is a second way into the engine, outside `pipeline/`.
  - Storage code, the allowlist and the methodology settings have no home.
- **Recommendation:** Map each pipeline step to one folder, and add `store/` and `methodology/` folders.

**N5. An ACP adapter appears in the layout with no launch tool that needs it.**
- **Where:** brief §10, §11.
- **Recommendation:** Drop it until a third tool is chosen.

**N6. "Stays on your computer" needs a qualifier.**
- **Problem:** Reports and the log are stored locally. But filings, extracted evidence and draft claims are sent to Anthropic or OpenAI through the user's AI tool, and claims with their cited paragraphs go to Jev when a key is set.
- **Recommendation:** Say this in §3.9 and in the setup screens.

### [decided] items that carry serious risk

Five [decided] items carry serious risk. These items stay fixed unless Liam changes them.

1. **"Built so non-technical people can use it" (§1).**
   - It commits one maintainer to supporting other people's machines, tools and plans (M22).
   - If the install button is switched off, the API-key fallback is a dead end for non-technical users (M21).
2. **"Probability of beating its sector … tracked and graded" (§9).**
   - No model defines this probability, so grading it measures nothing until one is defined (M11).
3. **Jev, and Liam hand-labelling ~300 claims (§6).**
   - The labelling time comes before usefulness is known.
   - The threshold holds only for the tool, prompt and Jev version it was set on (M13).
4. **"Coverage: S&P 500 only" (§1).**
   - The membership source and its terms are unresolved.
   - Companies that leave the index must stay gradeable (M14).
5. **"One button installs it or signs the user in" (§1).**
   - Brief §15 already records that this is the case Anthropic's terms name.
   - Reviewers add two points: ask Anthropic now rather than before release (M22), and make sure an API key in the environment cannot silently replace the subscription login (M4).

### What all reviewers would keep

- **Code makes every number.** AI calls have no tools, and the AI's prose uses placeholders that code fills (§4). All six lenses endorse this. It is also what makes a numbers-only fallback report possible when usage runs out.
- **Retrieval by document structure** (§5). Paragraph IDs carry the parser version, saved sources are never edited, and no vector database is needed.
- **Honest presentation** (§3.1, §6, §9):
  - the range is declared as 10th/50th/90th percentiles;
  - the uncertainty level is as prominent as the rating;
  - "verified with Jev" appears only when Jev ran;
  - removed claims are visible;
  - small samples are labelled "descriptive, not conclusive".
- **The phase order** (§13). Liam's own use comes before packaging and before the terms risk. Phase 0 measures usage and runs a test against the real AI tools.

## Goals vs. Non-Goals

**Goals**

1. **Useful to Liam,** tested by a stated, time-boxed test (B1). Liam needs to write the test itself.
2. **Code makes every number** (metrics, score, rating, range) from free data. Each number can be replayed from stored data and traced to its source (B4).
3. **Every AI sentence traces** to a filing or article paragraph, or to a computed value. The report shows which checks ran (M12).
4. **Every run is fresh.** A filing's extracted evidence is reused only while its cache key is still valid (M8).
5. **Reports and the prediction log are stored only on the user's computer.** The report says what is sent to the AI vendors and to Jev (N6).
6. **It works on Liam's Mac** with his own signed-in Claude Code and no API key.
7. **Later, behind a stated trigger:** a signed Mac app that a non-technical person can install and connect ([decided]; Phase 3).
8. **Every prediction is logged** so that it can be graded fairly later, even if grading statistics come later (B4, M11).

**Non-Goals**

1. **Predicting returns** with machine learning, deep learning or an AI model. AI output, news sentiment and technical analysis never enter the score or rating (M7).
2. **Hosted infrastructure:** a hosted service, accounts of its own, cloud storage or a shared database.
3. **A public track record** for now (optional good practice only).
4. **Portfolio features,** personalized advice or trading. No link to Finava.
5. **Coverage outside the S&P 500.**
6. **Paid or extra data:** intraday prices, licensed analyst estimates or a paid news feed.
7. **Forecasting the economy.**
8. **Other AI tools at launch.** Only Claude Code and Codex are supported; the ACP adapter waits for a third tool (N5).
9. **Later platforms and exports:** Windows and PDF export are not in v1.
10. **Proposed by this review (not yet agreed):**
    - grading statistics before the first predictions are 3 months old (M11);
    - AI web search with tool access in v1 (M6);
    - a multi-method valuation stack in v1 (M18);
    - the peer-MD&A trend comparison in v1 (M19).

## Alternatives Weighed

**Rejected during ideation (brief v3–v5 and the pivot record).** Reviewers' notes are added where they raised something new.

1. **Hosted web app on the author's Claude API credits (brief v3/v4).** Rejected:
   - $200/month allowed only about 13–24 fresh reports a day;
   - a price-data display license would cost about $149+/month;
   - Liam wants the app free and open source.
2. **Regenerating the written report only when a new filing arrives.** Rejected because Liam wants every run fresh. Replaced by saving the AI's evidence per filing. *Reviewer note:* saved evidence needs a versioned cache key, or it goes stale silently (M8).
3. **Bring-your-own API key as the default.** Rejected as the default because it costs users money; kept as a fallback. *Reviewer notes:*
   - if the install button is off, the key fallback needs a developer billing account, which is a dead end for non-technical users (M21);
   - a key in the environment can silently override the subscription (M4).
4. **A terminal-only Python tool.** Rejected because the app must work for non-technical people. *Reviewer note:* alternative 14 below is a Phase 1-only variant, not a replacement.
5. **Google sign-in and cloud storage.** Dropped for now; local SQLite is enough. *Reviewer note:* add an export of the prediction log, since a lost laptop loses it (M15).
6. **A shared hosted database (e.g. Firebase).** Rejected because the author would hold other people's data.
7. **A paid, licensed news feed.** Rejected. News comes through the user's own AI tool's web search, limited to an allowlist. *Reviewer note:* see alternatives 16 and 17, which keep news free without giving the AI web tools.
8. **Machine-learning, deep-learning or AI-model prediction of the rating.** Rejected because the research reports found a small or no edge for large companies after costs, and lookahead bias in AI models.
9. **A public, hashed track record.** Made optional because the app is for personal use. *Reviewer note:* alternative 20 below is local, not public.
10. **Detect-only, with no install or sign-in button.** Kept as the fallback if Anthropic does not approve the button. *Reviewer note (zoom-out):* use it as the working default until Anthropic answers, and email sales now rather than before release.

**New alternatives raised in this review, to weigh**

11. **Python owns the whole run** and calls Claude Code and Codex itself, through the Python Agent SDK or `claude -p`, and through `codex app-server`. Electron keeps detection, install, sign-in and the window. Raised by structural, design and zoom-out (B2).
    - *Trade-off:* less reuse of Realm's TypeScript adapter code.
12. **TypeScript owns the run,** and the Python engine becomes a stateless calculator. Raised by structural.
    - *Trade-off:* the run logic and run record move away from the numbers.
13. **A Python desktop app with a built-in web view** (pywebview or Briefcase) instead of Electron. Raised by zoom-out. The app must ship its own Python either way, so Node is the runtime that could be dropped.
    - *Trade-off:* it loses Realm's detection and install code, node-pty for sign-in, and Electron's update and signing tools.
14. **A Claude Code command (e.g. `/stock-report TICKER`) as the Phase 1 vehicle only.** It starts a fixed Python script and writes an HTML page. Raised by zoom-out.
    - *Trade-off:* the command must only start the script, so the AI never drives the steps. No non-technical users until Phase 3. The engine moves into the app unchanged.
15. **A narrative-first report:** a cited "what changed" narrative and a factor table at the centre, with the rating added later as a derived label. Raised by zoom-out (M9).
    - *Trade-off:* the first version has no single verdict.
16. **The AI proposes article URLs; code fetches and splits the pages.** Raised by design, codebase-details and structural (M6).
    - *Trade-off:* pages that need JavaScript, or sit behind a paywall, drop out.
17. **Code reads allowlisted RSS feeds and press releases,** with no AI web search. Raised by design and zoom-out.
    - *Trade-off:* sites without feeds are missed and there is no open-ended search. In return, no AI call ever has tools.
18. **A local store filled from SEC's bulk files** (company financial data and quarterly insider data sets), refreshed when the app opens. Raised by design (B5).
    - *Trade-off:* a large first download and more disk use (sizes not estimated). In return, little SEC traffic per run and percentiles across the whole S&P 500.
19. **SEC's `frames` endpoint, for today's peer percentiles only.** One request per metric covers all filers. Raised by codebase-details.
    - *Trade-off:* values are aligned to calendar periods and include restatements, so they must never be used for grading (brief §4 step 2 already bars this for time-sensitive use).
20. **A monthly code-only rating run over all ~500 companies into the local log.** Raised by zoom-out; the v3 stress test proposed a nightly version. It is the only way the log could say anything about the rating, because it removes Liam's choice of tickers.
    - *Trade-off:* it needs a price source that allows ~500 tickers a month, and it brings back the universe-wide pass that v5 removed.
21. **Residual income as the single valuation method in v1,** with P/E comparisons as a cross-check. Raised by zoom-out (M18).
    - *Trade-off:* companies with negative or tiny book equity need a comparisons-only fallback.
22. **Only a same-tool skeptic in v1,** with Jev and the labelling after the usefulness test. Raised by zoom-out (M13).
    - *Trade-off:* less independent checking at first. Jev is [decided], so this changes only its timing.
23. **Relative rating labels** (Outperform / In line / Underperform). Raised by comprehension (M20).
    - *Trade-off:* less familiar to casual readers.

## Key Decisions & Staging for Next Steps

**Already fixed.** The [decided] items in brief §1, §6 and §9 stand. Five of them carry risks noted above, for Liam to accept or revisit.

**Do now (cheap, independent of the design)**

1. **Email Anthropic sales** about the install and sign-in button, and read OpenAI's terms for third-party apps that drive Codex on a ChatGPT login. The answer decides whether the button is built at all (M22). **Liam, Nov 2:** he will contact Anthropic later, before any public release. The button belongs to Phase 3 anyway, so no earlier phase depends on the answer.
2. **Rewrite the brief as a standalone current design** (M24). Bring §8 in, write out the guide's setup steps, and add a glossary and one risk table. Move the version history to an appendix.

**Decisions needed before `/egm-draft`, in order**

1. **The usefulness test and a pass mark for each phase** (B1). Liam writes these.
2. **Who owns the run:** Python is recommended (B2). This includes the engine interface, the version handshake, and the engine as the only database writer.
3. **The price source and the kind of price.** Unadjusted closes plus splits and dividends, stored locally, with a second source (B3).
4. **The S&P 500 membership source** and its refresh. CIK becomes the key for every record (M14).
5. **The rating's definition** (M10, M11, M17, M20):
   - its inputs;
   - the benchmark for each peer group;
   - the probability model, or a placeholder label;
   - buffer or no buffer;
   - the label words.
6. **The methodology bundle and its hash; the contents of each log row; the grading rules** (B4, M11): which run counts, how Holds are scored, interim grades, delistings.
7. **The permanent raw-data store and replay command,** and how long data is kept (B4).
8. **The evidence cache key and what invalidates it** (M8):
   - rules for amended filings and restated values;
   - the paragraph ID format with a content hash.
9. **The insider-purchase signal:** company-only, or from SEC bulk data (B5).
10. **The news design:** AI proposes URLs and code fetches; RSS only; or defer (M6). Decide this one together with the next.
11. **The AI-tool rules** (M3, M4, M5):
    - Phase 0 pass criteria for tool control;
    - the self-test before each run;
    - removing API keys from the environment;
    - known-good version ranges;
    - the training-cutoff table;
    - which tool drafts.
12. **Verification for v1** (M12, M13):
    - which checks run;
    - the fixed "checks run" line;
    - removed-claim rules;
    - the skeptic's output.
13. **Database migrations and backups,** from the first write (M15).
14. **The SEC contact email and FRED key rules** (N1, N2).
15. **The numbers deferred to `/egm-draft` in brief §16 Q5:** exact weights, valuation details and the peer-size rule, set as versioned config.

**Proposed staging (the reviewers' proposal; Liam to accept, change or reject)**

- **Phase 0, on Liam's Mac:**
  - prove tool control against the M3 pass list;
  - measure usage, run time and SEC requests per run against pass marks;
  - choose the price source;
  - build the raw-data store and the replay command;
  - hand-check 20 golden tickers.
- **Phase 1a, the usefulness test:**
  - a cited filing narrative covering business, risks and red flags, recent results, and what changed;
  - code-made metrics that need no prices;
  - numeric guard, citation check and a same-tool skeptic;
  - the full run record and a "flag this claim" button;
  - a plain window or local page;
  - database migrations from the first write.

  Run the four-week usefulness test here.
- **Phase 1b, only if 1a passes and Liam wants a verdict:**
  - prices and sector percentiles;
  - one valuation method;
  - the range and the rating;
  - the prediction log with the methodology hash.
- **Phase 2:**
  - news through code-fetched pages;
  - the macro block as code only at first;
  - Jev and the claim labelling;
  - the other-tool skeptic when both tools are connected;
  - the grading script, once the first rows are 3 months old.
- **Phase 3, on a stated trigger and after Anthropic's answer:**
  - the signed, notarized Mac build and auto-update;
  - the Connections screen;
  - the install and sign-in button, if approved;
  - per-tool golden runs;
  - a diagnostics export.
- **Phase 4:** unchanged from brief §13.

**Next step.** Liam reviews this brief and answers decisions 1–5. Then either run another `/egm-brainstorm` pass on the revised concept, or move to `/egm-draft` once the brief is rewritten as a standalone document.

---

## Liam's answers after the review (Nov 2, 2026)

**1. What "useful" means (decision 1).** Liam: actionable things he can do based on the report, plus credibility, trust, accuracy and good advice.

Proposed test, to confirm in `/egm-draft`. For the first month of real use, on companies Liam is actually considering:

- **Accuracy:**
  - No confirmed wrong number in any report. The "flag this claim" button counts the errors he finds.
  - Every citation opens a passage that supports its claim.
- **Actionable:** every report ends with:
  - the rating and range;
  - what would change the rating (named triggers);
  - the next dated events (for example, the next earnings date);
  - the risks to watch.
- **Trust:** each report shows which checks ran and what was removed.
- **Overall:** Liam prefers it to his current sources for that decision.

"Good advice" here means a general, non-personalized research view and what to watch. It does not mean advice tailored to Liam's holdings, which stays a non-goal. Whether the *ratings* are accurate can only be graded after 3–12 months, through the prediction log.

**2. First version (overrides the reviewers' Phase 1a/1b split).** Liam wants the rating (Buy/Hold/Sell), the price range, and analyst ratings from day one. Phase 1 is therefore the full report. As a result, B3 (price storage) and B4 (log contents, methodology hash, permanent raw data) must be built before the first logged rating.

- **Analyst ratings** (the street's Buy/Hold/Sell counts, consensus target, recent rating changes) need a data source:
  - **Massive:** offers these through Benzinga endpoints (consensus ratings, rating changes, price targets, analyst insights). It lists them as **partner data**, likely a paid add-on beyond the free tier, so check in Phase 0.
  - **Free fallback:** rating changes reported in the news scan.
- **Showing them:** next to the app's own rating, labelled as the street's view, with the research note that street targets have run about 15 points optimistic and about 56% of ratings are Buy.

**3. Platform.** Mac only for now. It is a real Mac app (Electron), not a website.

**4. Prices: Massive (formerly Polygon.io) with a free key.** Liam is fine with a free sign-up. Endpoints confirmed in Massive's catalog on Nov 2:
- daily market summary for all US stocks, one call per date;
- per-ticker daily bars, with adjustment on or off;
- splits;
- dividends.

That fits B3: store unadjusted closes plus splits and dividends locally.

- **Free-tier limits are unverified.** From memory: about 5 calls a minute, end-of-day data, and about 2 years of history.
- **Fetch plan:** a one-time background backfill of 12 months using the all-stocks daily summary (about 252 calls, roughly 50 minutes at 5 a minute). After that, one call per trading day covers every peer.
- **Check in Phase 0:** limits, personal-use terms, and that each user uses their own key.

**5. Volume.** Keep it simple: type a company name or ticker and get a full report. Report volume is unknown, so measure usage per report in Phase 0.

**Decisions 2, 4 and 5 are not yet confirmed by Liam.** These defaults go into the draft for him to accept or change:
- **Decision 2:** Python runs the whole report and calls Claude Code and Codex directly.
- **Decision 4:** the S&P 500 list comes from an S&P 500 ETF issuer's daily holdings file (terms checked in Phase 0), and every record is keyed by CIK.
- **Decision 5:** the rating follows brief v5 §8, with the label wording settled in the draft.

**6. Jev dropped (Liam, Nov 2).** Version 1 has no outside claim checker. Code checks numbers and quotes. A skeptic AI pass then checks every claim against its cited paragraphs, on the other AI tool when both are connected. When the same tool wrote and checked the draft, the report says "self-checked". Jev can return if Liam's citation spot-checks find unsupported claims getting through (design alternative A29).
