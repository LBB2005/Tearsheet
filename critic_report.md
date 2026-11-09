# Goldfish Review Report

**Target:** `docs/designs/tearsheet.md` (`Lines 1-695`: the feature part, up to the "Detailed Implementation Plan" heading at line 696)

**Stage:** 7, Critic Review, round 1. Standard for `egm-design` and `egm-structural`: the feature-spec standard. `egm-style` had no standard.

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-design` (instance A) | completed |
| `egm-design` (instance B) | completed |
| `egm-structural` | completed |
| `egm-style` | completed |

No reviewer failed, so none needed a retry.

**How this report was put together.**

* Four reviewers read lines 1-695, the linked background files and the Stage 5 and Stage 6 reports:
  * two independent copies of the design critic (A and B);
  * one structural reviewer;
  * one style reviewer.
* When more than one reviewer raised a point, it appears once. The ID belongs to the reviewer whose lens fits it best, and the "Reviewer Lens" line names everyone who raised it.
* When reviewers gave a point different severities, the higher one is kept. Three severities were changed during merging, and each entry says why:
  * `egm-design-1-14` was raised from Nit to Major;
  * `egm-structural-1-5` and `egm-style-1-7` were lowered from Major to Nit.
* The main claims were checked against the design text and its sources before this report was written. The checks covered:
  * the split problem (line 285);
  * the number check (lines 410-413);
  * the citation check against the peer-trends section (lines 414 and 189);
  * the base case against the benchmark (lines 331 and 335);
  * the tool rule in §12 against the news step (lines 426 and 376);
  * the history sentence in the alternatives (line 442) against `concepts_brief.md`;
  * the research figures cited (`reports/AI stock price prediction.md` lines 169, 178, 188 and 257);
  * the settings-isolation note in the guide (`docs/references/local-cli-guide.txt` lines 161-164).
* Claims about how an outside service behaves that the reviewers could not confirm are marked "to verify".
* Points already fully covered in Stage 5 or Stage 6 are not repeated. Where a finding overlaps, the entry says so.
* Line numbers refer to the current file. References past line 696 are used only to show a contradiction.

**Overall verdict.**

* **Result:** changes are needed before approval. The count is **0 Blockers, 29 Major and 27 Nits**.
* **What everyone agrees is sound:** the core rule. Code makes every number, and the AI only reads sources and writes cited text. No finding reopens one of Liam's decisions. Where a finding touches one, the entry says so and only adds safeguards or definitions.
* **The Major findings fall into five groups:**
  1. **Security is stated as results, not methods.** How the AI tools are locked down, how the window shows untrusted text, and how planted article text is handled (`egm-design-1-1` to `1-3`).
  2. **The rating and grading formulas have problems that become permanent once predictions are logged** (`egm-design-1-4` to `1-10`; `egm-style-1-3`, `1-4` and `1-6`).
  3. **Some numbers will be visibly wrong, or a whole section emptied.** After stock splits, from the number check, from red-flag keyword matches, and from the citation check's handling of peer filings (`egm-design-1-11` to `1-14`).
  4. **Running the app: failure handling, AI usage and speed, news yield, disk growth and backup** (`egm-design-1-15` to `1-19`).
  5. **Gaps against the standard and in the document's shape** (`egm-structural-1-1` to `1-4`; `egm-style-1-1`, `1-2` and `1-5`). These are:
     * no Risks and Mitigations section;
     * drafter choices with no alternatives;
     * the method numbers sit after the boundary;
     * repeated rules that disagree;
     * a Goal 1 test that can't be scored.
* **Most fixes are definitions, short tables and small Phase 0 checks, not redesign.**
* **Settle before the first logged prediction:** `egm-design-1-4`, `1-5`, `1-6`, `1-7` (the start-price rule at least), `1-8` (the baseline definition) and `1-10`; `egm-style-1-3`, `1-4` and `1-6`.
* **Settle before the first real filing or article is read:** `egm-design-1-1` and `1-3`.
* **Settle before the app window shows a real report:** `egm-design-1-2`.

## Prioritized Findings (Blockers -> Major -> Nits)

There are no Blockers.

---

### egm-design-1-1: The AI tool lock-down is stated as a goal, not a method, and the user's own tool settings could get around it - Severity: Major
* **Reviewer Lens:** `egm-design` (instances A and B). Partly also raised in Stage 5 (#9, one line on Codex's sandbox being a weaker promise). Everything else here is new.
* **Affected Scope:** `Lines 264-280` (§4, especially lines 267, 268, 271 and the day-one test at 275-280); line 426 (§12); line 657 (security requirement). This builds on Liam's decision that the Python engine runs every step (line 182) and does not reopen it.
* **Discrepancy Description**:
  * §4 says "every tool is denied" for Claude Code (line 267) and "read-only sandbox, every approval request denied" for Codex (line 268). It describes the result, not how it is achieved.
  * **Claude Code may still load the user's own setup.** The guide the design follows says a separate option (`settingSources: []`) is what shuts out the user's own settings, skills and hooks. It also says that option drops logins stored in the settings file (`docs/references/local-cli-guide.txt` lines 161-164). The design never says whether that option is used. If the user's setup loads:
    * commands the user pre-approved for their own coding work might run without ever reaching the engine's "deny everything" rule (to verify against the pinned SDK version);
    * the user's hooks (shell commands set to run on session events) would run and would see filing text;
    * the user's extra tool servers and personal instruction files would join the session, so "the system prompt is ours" is only partly true;
    * a key stored in settings could bill an API account, even though line 267 removes `ANTHROPIC_API_KEY`. Other settings that change billing or where requests go are not mentioned.
  * **Codex has the same problem, and a detection gap.**
    * A read-only sandbox still lets commands read any file on the Mac.
    * Depending on Codex's approval setting, which the design never names, some commands may run with no approval request at all (to verify). "Deny every request" would then catch nothing, and line 271's "any attempt counts as a failure" would have nothing to see.
    * Codex also loads the user's own tool servers from `~/.codex` (guide line 219).
  * **A file read leaks data even with no network.** File contents could flow into the AI's answer, then into the saved evidence, the report and Jev.
  * **The check runs once, but the tools update themselves.** The day-one test runs once (lines 275-280). A renamed option in a new version could quietly switch the guard off.
* **Rationale & Recommendation**:
  * Everything else in the security plan depends on this guard. Reviewer A notes it becomes a Blocker before any release to other people (Phase 3), because their settings will vary.
  * In §4, state the method for each tool:
    * hide tools from the model, rather than refusing them when used;
    * load no user settings, and pass the login in explicitly;
    * for Codex, use the strictest approval setting and treat any command or file event in its event stream as a failure.
  * Build the AI program's environment from a short list of allowed variables, and log where each call's login came from.
  * Extend the day-one test to check that:
    * no user hooks, tool servers or instruction files load;
    * the login is the subscription;
    * a planted "read ~/.ssh" instruction leaves no file content in the answer.
  * Store the last-checked version of each tool. When it changes, re-run a short lock-down check, and refuse the AI steps until it passes.
  * Settle this before any real filing or article is read.

### egm-design-1-2: The report window shows text drawn from untrusted pages, with no rules for showing it safely - Severity: Major
* **Reviewer Lens:** `egm-design` (instances A and B). New.
* **Affected Scope:** line 223; §1 (`Lines 199-205`); §2 commands (`Lines 229-237`); CUJ 3 (`Lines 145-149`); line 385; §12 (`Lines 424-431`); security requirements (`Lines 656-660`). Electron (Liam's choice, line 183) is not questioned.
* **Discrepancy Description**:
  * **What the window shows.** AI-written sentences, AI summaries of web pages (line 385), and links to articles (CUJ 3). All of it comes from text that line 658 calls untrusted.
  * **The number check doesn't help here.** It blocks digits, not web-page code.
  * **What could go wrong.** If AI text is put into the page as code rather than plain text, a planted article could get a script running inside the app window. That window can send commands to the engine (§2), so the script could:
    * start reports that use up the user's AI plan;
    * change saved keys;
    * send report data to an outside server.
  * **Links are a second route.** An article link opened inside the app would load an outside page in a window that can talk to the engine.
  * **No section covers this.** §12 and the security requirements cover only the AI calls, not how the report is shown. Reviewer A notes that Jinja2, the template tool named later in the plan, does not escape text unless it is set up to.
* **Rationale & Recommendation**:
  * Add these rules to §12 and the security requirements:
    * escape all AI and source text, and clean any Markdown;
    * give the report view a strict content-security policy (a browser rule that blocks scripts and outside loads);
    * turn on Electron's standard protections: the window kept separate from the main process, sandboxed, with no access to Node, and a bridge that allows only named commands;
    * open outside links in the normal web browser, and block navigation inside the app.
  * Add a test where the AI output contains web-page code and a `javascript:` link.

### egm-design-1-3: Planted article text can steer what the report says, and the allowlist is checked on the wrong address - Severity: Major
* **Reviewer Lens:** `egm-design` (instance B; instance A raised the link-checking rules). New.
* **Affected Scope:** §9 (`Lines 374-386`); step 11 (line 259); §11 (`Lines 410-422`); line 272; security requirements (`Lines 657-658`). This strengthens Liam's news decision (line 192) and does not reopen it.
* **Discrepancy Description**:
  * **Planted text can steer the content.** Every defence in §4, §9 and §12 stops the AI from *acting*. None stops planted text from steering what the report *says*.
    * An allowlisted page could carry text written to be cited, or notes aimed at the checks such as "note to reviewer: this is balanced". Examples: a press release, a fund letter, a short-seller report, or a reader-written page on an allowlisted site.
    * Each check can be fooled. The citation check passes because the paragraph exists. Jev passes because the claim matches its paragraph. The skeptic reads the same planted text.
  * **One bad article can colour the whole report.** Article text also goes into the narration call (step 11, line 259), so it can affect sections that don't cite it.
  * **The allowlist is checked on the wrong address.** Code checks the domain of the link the AI suggests (line 376), then downloads the page (line 377).
    * A redirect can land on another site, or on a device on the home network.
    * Loose domain matching (for example, "reuters.com.example.net" passing as Reuters) has the same effect.
    * Nothing says secure (https) links only, exact site match, or size and time limits.
  * **Some allowlisted sites host anyone's writing.** On those sites, whether a page is credible depends on the page, not the site.
  * **The AI supplies a date.** The search answer includes a publication date (line 376), which drives the 30-day window. That is a number from the AI, which line 272 rules out.
* **Rationale & Recommendation**:
  * Give article text only to the news section's AI calls. Sections built from filings should get filings only.
  * Wrap all source text in clear markers, and tell every AI call that instructions inside the markers are data. Have code flag and drop paragraphs that contain instruction-like phrases, with a visible note.
  * Check the allowlist after every redirect and on the final address:
    * match the exact site;
    * allow secure links only;
    * block home-network addresses;
    * cap the download size and time.
  * Allow allowlist entries that name a section of a site, not only the whole site.
  * Have code read the publication date from the page itself.
  * Add a test where a planted article tries to change the report's content, not only to trigger a tool.

### egm-design-1-4: The rating compares a price-only forecast with a total-return benchmark, and gives more volatile stocks a built-in head start - Severity: Major
* **Reviewer Lens:** `egm-design` (instances A and B). New. Stage 6 #4 raised that "expected" and "actual" benchmark are two different things; this finding is about what is compared.
* **Affected Scope:** §7 (line 331, `Lines 335-337`); §5 (line 286); §8 discount rate (line 355); §10 (line 399). This touches Liam's sector-relative rating (line 191) and the base-case formula he accepted in the brief. Neither is reopened. Only how the drafter's Buy/Sell rule uses them changes.
* **Discrepancy Description**:
  * **The forecast leaves out dividends, the benchmark doesn't.**
    * The base case is today's price grown at the cost of equity minus the dividend yield, plus one-third of the value gap (line 331). That is a forecast of price alone. (The cost of equity is the yearly return investors demand for holding the stock.)
    * The sector benchmark (line 335) and grading (lines 286 and 399) use total return, which includes dividends.
    * So a stock that pays more in dividends than its peers starts behind by the difference. For example, a 3% payer against a 0.5% peer median starts about 2.5 points behind, even if its expected total return is identical.
    * Bands can be as narrow as 5 points (implementation plan, line 718), so this is enough to change ratings. The stock is pushed toward Sell by a forecast that ignores its dividend, then graded on returns that include it.
  * **More volatile stocks get a head start.**
    * The growth term uses a cost-of-equity bucket set by volatility (line 355: 7.5%, 9%, 11% or 13.5%).
    * Moving from the 9% bucket to the 13.5% bucket adds 4.5 points of expected outperformance just for being more volatile.
    * The cash-flow and residual-income valuations partly offset this. When only peer multiples are valid, nothing does.
  * **The design's own research warns about this.** It says "Buy-rated stocks may simply be riskier ones" (`reports/Stock price prediction methods.md` line 7).
* **Rationale & Recommendation**:
  * Once predictions are logged, this tilt is baked into the record.
  * In the rating comparison only (the displayed range stays as it is), compare like with like. Either:
    * add the dividend yield back for both the company and its peers; or
    * compare only the value-gap part of the base case with the peers' value-gap parts.
  * State in §7 whether a riskier stock should earn a Buy for its higher required return.
  * Add a test case: two stocks with the same value gap but different yields or volatility should get the same rating.
  * Settle before the first logged prediction.

### egm-design-1-5: The rating rule leans toward Sell, and the resulting mix is never checked before ratings are logged - Severity: Major
* **Reviewer Lens:** `egm-design` (instances A and B). New.
* **Affected Scope:** §7 (`Lines 336-341`); §8 (lines 351, 360 and 367); A18 (`Lines 574-581`). The rating's meaning is Liam's (line 191). The thresholds are the drafter's and are not in the decisions table.
* **Discrepancy Description**:
  * **The rules are not mirror images.** Buy needs both conditions: a value gap above the band *and* a score at or above the 60th percentile (line 336). Sell needs only one: a gap below the band *or* a score at or below the 25th percentile (line 337).
    * If the score is ranked within the sector (unclear, see Stage 6 #12), about a quarter of every sector is Sell on the score alone, before any valuation-based Sells.
    * Buys are capped below 40% of a sector, and fewer in practice.
    * Red flags and "valuation not meaningful" (line 367) only push ratings toward Hold.
  * **The two Buy conditions pull against each other.**
    * The cash-flow model pulls profit margins toward the sector median (line 351). Residual income pulls return on equity toward it (line 360).
    * That lowers the estimated value of exactly the high-margin companies the score rewards.
    * So high scorers will tend to show negative value gaps, and stocks with positive gaps will tend to score low.
  * **A brief rule was dropped without comment.** The brief asked for a balanced split of Buy, Hold and Sell.
  * **Liam's favourite names could all come out Sell.** The v3 stress test warned that a mechanical cash-flow model values large growth companies below their price (`docs/brief-stress-test.md` line 119).
* **Rationale & Recommendation**:
  * State the intended mix and the reason for the asymmetry. Or make the rule symmetric, for example Sell only when a lagging gap *and* a low score both apply.
  * Before the first official prediction, run the code-only rating over all ~500 companies, or at least two full sectors. Write the Buy/Hold/Sell split by sector into §7. This needs no AI.
  * Write a target range for the mix into the rating-bands file.
  * Make adjustments before logging starts. After that, every change splits the record.

### egm-design-1-6: The sector benchmark includes the company itself, is weighted differently for rating and grading, and is not fully defined - Severity: Major
* **Reviewer Lens:** `egm-design` (instance A; instance B raised the missing definitions). Builds on Stage 6 #4 (two meanings of "benchmark") and Stage 5 #20 (broad sector groups). The self-inclusion, the weighting mismatch and the open definitions are new.
* **Affected Scope:** §7 (line 335); line 191; §10 (lines 394, 399 and 405); implementation plan line 715 (checked only to show the mismatch). This applies Liam's sector-relative rule without reopening it.
* **Discrepancy Description**:
  * **The company is part of its own yardstick.** The benchmark is "the market-value-weighted total return of the company's SIC-based sector group" (line 335). It doesn't exclude the company. Rating a giant against a benchmark that is partly itself pulls its measured excess return toward zero.
  * **A few giants dominate.** In broad groups, a few very large companies can carry half the weight. "Beat the sector" then mostly means "beat two or three other giants".
  * **Rating and grading weight peers differently.** The rating's expected return is a peer median (line 715), which counts every peer equally. So a stock is rated against the typical peer but graded against the biggest ones.
  * **Three things are left open:**
    * whether weights are fixed at the start or change daily;
    * whether dividends are reinvested;
    * what happens to a peer that is bought out or delisted mid-window. Line 405 covers only the rated company.
* **Rationale & Recommendation**:
  * In §7:
    * exclude the company from its own benchmark;
    * use the same weighting for rating and grading;
    * fix the weights at the start and reinvest dividends;
    * state how departing peers are handled, for example held at the deal price;
    * store the weights with each prediction.
  * Settle before the first logged prediction.

### egm-design-1-7: Grading lacks the rules that keep a grade honest, starting with a start price that can come before the information the rating used - Severity: Major
* **Reviewer Lens:** `egm-design` (instances A and B); `egm-style` raised "hit rate" and "enough" as undefined. New for this stage. Stage 5 #10 covered when grading is built, and Stage 6 #11 covered data sources. The earlier concepts brief (M11) raised Hold scoring and independence; both are still open.
* **Affected Scope:** §10 (`Lines 390-406`); CUJ 4 (line 160); line 190; §5 (line 291); §6 methodology bundle (`Lines 319-325`); §7 (line 343); line 50. Liam decided that the probability is tracked and graded. That stands; only the method is questioned.
* **Discrepancy Description**:
  * **The start price can come before the information.**
    * Each prediction stores "time and price" (line 391), and a price up to one trading day old is accepted (line 291).
    * Suppose a quarterly report was filed that morning and the stored price is yesterday's close. The rating then uses facts the start price doesn't reflect. The grade credits or blames the method for a move that happened before the rating existed.
    * The research says filing facts should count only from the next trading session (`reports/AI stock price prediction.md` line 169).
  * **Predictions overlap.**
    * One official prediction per company per 30 days (line 190) allows up to 12 a year. Each shares 11 of its 12 months with the next.
    * Predictions made in the same week share the same market moves.
    * The hit rate (line 401) would count them as separate results. The research says about 617 independent forecasts are needed to tell a 55% hit rate from 50% (same report, line 188).
  * **"Enough" has no number** (line 406; CUJ 4, line 160), and "independent" is not defined.
  * **Hold has no definition of a hit** (line 401). The research says to settle this before launch.
  * **The Brier score has nothing to compare against.** (The Brier score measures how well stated probabilities match what happened.) None of the three baselines (line 404) gives a probability.
  * **The stored probability has no limit tied to the 55-57% ceiling** at line 50. Reviewer A notes the formula at line 720 can give 80% or more for large value gaps.
  * **The rules can change after results are seen.** None of these grading rules are in the methodology bundle (lines 319-325).
* **Rationale & Recommendation**:
  * Without these rules, CUJ 4 will show numbers that flatter the method. The start-price error can't be fixed after the fact.
  * Add a "Grading rules" table to §10:
    * **Start price:** the first daily close after both the run time and the latest filing's acceptance time.
    * **Counting:** one headline prediction per company per 12 months; later ones are shown as repeats.
    * **Hold:** a defined hit, for example within plus or minus the band.
    * **Probability:** a base-rate baseline for the Brier score, and a stated limit on the probability.
    * **"Enough":** a number.
    * **Locking the rules:** a grading-rules file in the methodology bundle before the first prediction.
  * The start-price rule must be set before the first official prediction. The rest can wait until the first 3-month grade.

### egm-design-1-8: Grading the price range rewards wide ranges, flatters the range at 3 and 6 months, and compares it with nearly itself - Severity: Major
* **Reviewer Lens:** `egm-design` (instances A and B). New.
* **Affected Scope:** Goal 4 (line 85); Goal 8 (line 93); §7 (line 332); §10 (`Lines 398-404`). The 10th/50th/90th percentile range is part of Liam's outline (Goal 4) and is not reopened.
* **Discrepancy Description**:
  * **Early checks flatter the range.** "Whether the price ended inside the range" (line 400) is checked at 3 and 6 months against a *12-month* range. After 3 months, prices have typically moved only about half as far as after 12. Far more than 80% will land inside, and the range will look well calibrated when it isn't.
  * **"Inside the range" rewards width.** The research recommends an interval score instead, which charges for width and adds a penalty for misses. It also recommends checking that each tail holds about 10% of outcomes (`reports/AI stock price prediction.md` lines 178 and 257).
  * **The baseline is almost the same as the range.** The volatility baseline ("a range built from past volatility", lines 93 and 404) is nearly the app's own range (line 332). Only the centre differs, and the design doesn't say what the baseline is centred on.
* **Rationale & Recommendation**:
  * Define the baseline exactly: centred on today's price, with no value-gap shift, using the stock's own past-year volatility.
  * Grade three things: coverage, tail balance and the interval score.
  * Either grade coverage only at 12 months, or shrink the range for 3- and 6-month checks by the square root of (months / 12).
  * The bear, base and bull values are already stored (line 393), so this can be fixed before the first 3-month grade. The baseline definition should be fixed before the first prediction.

### egm-design-1-9: The prediction log grades Liam's picks, not the method, and the reasons for deferring the fix (A18) don't hold - Severity: Major
* **Reviewer Lens:** `egm-design` (instance B). New for these stages. It was raised earlier in `concepts_brief.md` (alternative 20 and M11).
* **Affected Scope:** Goal 8 (line 93); CUJ 4 (`Lines 151-160`); §10 (`Lines 388-406`); line 190; §5 fast path (line 289); A18 (`Lines 574-581`); Future Improvements (line 685). The deferral is the drafter's, not Liam's.
* **Discrepancy Description**:
  * **The log follows Liam's choices.** Official predictions come only from companies Liam chooses to look up (line 71), one per company per 30 days (line 190). His picks will cluster in names that are in the news and in a few sectors.
  * **The sample will be far too small.** A few reports a week gives perhaps 100-200 official predictions a year, many in the same weeks and sectors. That is far short of the ~617 independent forecasts the research says are needed (see `egm-design-1-7`). CUJ 4 will show numbers for years that can't tell skill from luck.
  * **The design itself answers A18's reasons for deferring:**
    * **"Needs prices for ~500 tickers":** the fast path (line 289) already keeps every US stock current with one call a day.
    * **The SEC side:** about 500 requests a month, roughly a minute at SEC's limit.
    * **The valuation work:** the valuation code already runs on every peer.
    * **"A universe-wide background job":** this can be a monthly code-only loop when the app opens, like grading (line 398).
    * **"Nothing for the usefulness test":** true, but Goal 8 is a separate goal. Each month of delay is a month of unbiased record lost for good.
* **Rationale & Recommendation**:
  * Move A18 into Phase 1 or 2, on condition that Phase 0 confirms the fast path.
  * Log it as its own "method record" next to Liam's "my record". Grade both, and lead CUJ 4 with the method record.
  * If the fast path isn't available, the log view should say plainly that it grades Liam's picks, not the method.

### egm-design-1-10: "Any report can be recomputed" stops being true at the first engine update, and the method version misses code changes - Severity: Major
* **Reviewer Lens:** `egm-design` (instances A and B). New. This is the opposite gap to Stage 5 #8: that finding said the methodology fingerprint covers too much, and this one says it covers too little.
* **Affected Scope:** Goal 2 (line 81); §6 (`Lines 319-326`); §10 (line 396); §13 (line 437); requirements (lines 667 and 672).
* **Discrepancy Description**:
  * **Replay is promised to give identical numbers.** Goal 2 says any report can be recomputed with the same numbers, and replay must produce identical numbers (line 326).
  * **The inputs are kept, but the code is not.** Auto-update replaces the engine (line 437). Any fix to the data clean-up or valuation code, or a library upgrade, changes old numbers, and replay then fails.
  * **The methodology fingerprint misses code changes.** It covers only the settings files (line 319). Two predictions with the same fingerprint can come from different number-making code, so the track record won't split when a code change moves ratings.
  * **The engine version is stored, but not used.** It is saved with each prediction (line 396), but nothing says whether grades are pooled across versions.
* **Rationale & Recommendation**:
  * Reword Goal 2 and replay to "recomputed by the engine version that made it". When the versions differ, replay should say "made by engine X; replay needs X" instead of failing.
  * Give the number-making code its own version number. Log it, and group grades by it in the same way as by the methodology fingerprint.
  * On every release, replay the stored test runs and list which numbers changed.
  * Settle before the first logged prediction.

### egm-design-1-11: Market value will be wrong by the split factor after any stock split - Severity: Major
* **Reviewer Lens:** `egm-design` (instance A). New.
* **Affected Scope:** §5 (`Lines 284-286`, line 292); §8 equity bridge (line 356); §3 step 3 (line 251). Massive is Liam's choice and is not questioned. Storing unadjusted prices is the drafter's choice and is sound.
* **Discrepancy Description**:
  * Valuation uses "unadjusted price times XBRL share counts" (line 285). (XBRL is the machine-readable financial data inside SEC filings.)
  * **The share count lags behind the price.** Share counts come from the latest filing, but the price is today's. After a split, the price drops by the split factor while the share count stays at the old number until the next quarterly filing.
  * **The result.** Market value, P/E and per-share values are off by the split factor: ten times for a 10-for-1 split.
  * **This is common among large companies.** Reviewer A cites 2024 splits at NVIDIA and Broadcom (10-for-1), Chipotle (50-for-1) and Walmart (3-for-1).
  * **The split check doesn't catch it.** The check at line 292 catches splits missing from the price data, not this mismatch.
  * **Other figures have the same problem:** per-share filing values (earnings and dividends per share), and trailing-12-month totals that span a split.
* **Rationale & Recommendation**:
  * Goal 1's "no wrong numbers" fails visibly for some of the largest companies.
  * In §5, state that share counts and per-share filing values are adjusted for every split between their date and the price date, using the stored splits.
  * Add a company that split to the golden test set, and check that market value stays continuous across the split date.

### egm-design-1-12: The number check will delete normal sentences and still let some numbers through - Severity: Major
* **Reviewer Lens:** `egm-design` (instance A). New.
* **Affected Scope:** §11 number check (`Lines 410-413`); Goal 1 (line 72); step 12 (line 260).
* **Discrepancy Description**: AI text may contain digits only inside placeholders, inside checked quotes, and as four-digit years.
  * **Many names contain digits:** "S&P 500" (the app's own universe), 3M (an S&P 500 company), "Form 10-K", "Item 1A", "Q3", "5G", "COVID-19", "737 MAX", "401(k)". Every sentence naming them would be rejected, and a 3M report would lose almost every sentence.
  * **The year exception is a loophole.** "Cut 1500 jobs" or "2000 stores" pass as years.
  * **Spelled-out numbers pass unchecked:** "doubled", "a third", "twenty percent", "two billion". These are number claims, and Goal 1's "no wrong numbers" depends on catching them.
* **Rationale & Recommendation**:
  * Allow digits inside a list of names the engine supplies (company, product and form names taken from the filings), or put such names in a name placeholder.
  * Accept a four-digit number as a year only in year context ("in 2024", "fiscal 2025") and within a sensible range.
  * Add a check for number words that rejects them or requires a placeholder.
  * Add 3M to the golden test set.

### egm-design-1-13: The design never says how red flags are found, and a simple text search will wrongly cap many ratings - Severity: Major
* **Reviewer Lens:** `egm-design` (instance A). Stage 5 #6 and Stage 6 #5 raised the step order and the fourth flag. How the flags are found is new.
* **Affected Scope:** §7 (line 341); §3 steps 4 and 7 (lines 252 and 255); Non-Goals (line 98).
* **Discrepancy Description**:
  * Three red flags cap the rating at Hold (line 341):
    * a restatement;
    * a material weakness (a serious gap in the company's financial controls);
    * going-concern language (doubt that the company can keep operating).
  * **The design never says how they are found.** Restatements can be read from the item codes in 8-K filings. The other two must be found in the filing text.
  * **Keyword matching will misfire.** Many 10-Ks mention "going concern" in a note saying management checked and found no doubt. Many say "no material weakness", or describe one that has been fixed. A keyword search would cap healthy companies at Hold.
  * **The AI can't do it either.** If the AI judged these instead, the AI would move the rating. Line 98 forbids that, and replay couldn't reproduce it.
* **Rationale & Recommendation**:
  * Define code rules:
    * going concern only when the auditor's report states "substantial doubt" and the phrase is not negated;
    * material weakness only when management concludes its controls were "not effective";
    * restatement from 8-K Item 4.02.
  * Add a golden test case for each, including a negated mention.
  * Any AI labels for these are for display only.

### egm-design-1-14: The citation check would remove every claim in the industry-trends section - Severity: Major
* **Reviewer Lens:** `egm-design` (instance A, who rated it Nit). New.
* **Affected Scope:** §11 citation check (line 414); peer trends (line 189); Goal 4 (`Lines 83-86`). This supports Liam's approved outline (line 189).
* **Discrepancy Description**:
  * The citation check requires every cited paragraph to come from "this company's filings or this run's articles" (line 414).
  * Section 8, industry trends, reads "the 3 largest peers' filings" (line 189, from Liam's approved outline).
  * Every peer-trend claim cites a peer's filing, so every one would fail the check and be removed.
* **Rationale & Recommendation**:
  * Raised from Nit to Major in this report: as written, a builder would build a check that empties one of the nine required sections (Goal 4). The fix is one clause.
  * Allow paragraphs from this run's peer filings, and say so in §11.

### egm-design-1-15: Nothing says what happens when the AI hits its usage limit, gets signed out, hangs, or when Jev is down mid-run - Severity: Major
* **Reviewer Lens:** `egm-design` (instances A and B). New for these stages. It was raised earlier in `concepts_brief.md` (M2).
* **Affected Scope:** §2 (`Lines 238-243`); §3 steps 7, 13 and 14 (lines 255, 261 and 262); §4 (`Lines 269-272`); CUJ 5 (`Lines 162-166`); Jev row (line 188); `cancel` command (line 231).
* **Discrepancy Description**:
  * **CUJ 5 covers missing prices only.** Nothing covers:
    * the AI plan hitting its usage limit partway through a run (a run makes dozens of AI calls; see `egm-design-1-16`);
    * the AI tool's sign-in expiring;
    * a call that hangs;
    * Jev being unreachable while a key is set (line 188 covers only "no key").
  * **No time limits or failure types are defined.** Useful types would be: usage limit with its reset time, sign-in expired, temporary error, bad format, and tool attempt.
  * **An AI failure throws away the code-only rating.** A failed run never writes a prediction (line 243). The rating is finished at step 7 (line 255) but saved only at step 14 (line 262). So the code-only record depends on the AI tool working that hour.
  * **Re-runs are costly.** A re-run repeats every AI call that wasn't saved.
  * **Concurrent runs are undefined.** Nothing says whether two runs can be active at once. The `cancel (run ID)` command suggests they can.
* **Rationale & Recommendation**:
  * Add a failure table to §3: for each failure type, what the app shows and what it does.
  * Save each step's output, so a run can resume from the step that failed.
  * Give every AI call and outside request a time limit.
  * When Jev is down, mark the report "Jev not run" rather than failing the run.
  * Decide whether the official prediction is saved as soon as step 7 finishes. If so, mark the report "narrative incomplete" when a later step fails.
  * Never switch to API billing without asking.
  * State whether only one run at a time is allowed.

### egm-design-1-16: AI usage per report is never estimated, no model is chosen, and the speed targets have no basis - Severity: Major
* **Reviewer Lens:** `egm-design` (instances A and B). Stage 5 #1 raised the missing pass mark for the usage test. The call count, model choice, cache churn, the A11 error and the speed basis are new.
* **Affected Scope:** Open Questions (line 122); §3 steps 9-13 (`Lines 257-261`); §4 (lines 273-274); §9 (line 384); A2 (line 460); A11 (line 528); performance requirements (`Lines 668-670`). This touches Liam's "fresh every run" (A11), peer trends (line 189) and news (line 192). It proposes budgets only, not changes to those decisions.
* **Discrepancy Description**:
  * **Rough call count.** Reviewer A's estimate from the spec:
    * a first report makes about 30-45 AI calls: 1 news search, up to 15 article reads, 8-10 filing sections, 3 peer-trend sections, an unstated number of narration calls, the skeptic, and up to one rewrite per failing section;
    * a repeat run still makes about 20-35, because news is fetched fresh every time.
  * **A11 is inaccurate.** It says "only the writing and checking repeat" (line 528). News search and article reading repeat too.
  * **No model is chosen.** The connector logs the model (line 273) but never picks one, so every call runs on the tool's default model.
  * **Saved readings get thrown away.** The saved-evidence key includes the model ID (line 274). When a vendor changes its default model, every saved reading of a filing is thrown away. That weakens A11's reason for rejection ("the saving is kept another way").
  * **The A2 cost is out of date.** The $0.30-0.50 per report (line 460) comes from the v3 brief, before news, peer trends, the skeptic and rewrites were added.
  * **The speed targets have no basis.**
    * The targets are under 5 minutes for a repeat report and 20 minutes for a first report in a sector (lines 669-670).
    * Against them: 20-45 AI calls, each starting the AI program from scratch, no stated parallel running, and up to 70 peer price fetches at 5 calls a minute.
    * Line 668 says the targets are "checked in Phase 0", but the Phase 0 tests time only the price download (implementation plan, lines 836-848).
* **Rationale & Recommendation**:
  * In §3, state the expected AI calls per run and a per-run call budget, with what gets cut first (fewer articles, then no rewrites).
  * Choose a model for each step (small for extraction, larger for writing and the skeptic) and log it. Key the saved evidence on the chosen extraction model, and add a "re-read this filing" action.
  * State how many calls run at once.
  * Work the time targets out (number of calls × measured time per call ÷ calls run at once), or label them goals to measure. Time one full repeat report in Phase 0.
  * Correct A11's wording, and refresh the A2 cost after the Phase 0 usage test.

### egm-design-1-17: How many news articles can actually be read is assumed, not measured - Severity: Major
* **Reviewer Lens:** `egm-design` (instances A and B). New. Stage 6 #18 raised how web search is turned on for Codex.
* **Affected Scope:** Goal 4 (`Lines 83-86`); line 192; §9 (`Lines 374-386`). The news method is Liam's (line 192). This measures a risk; it does not reopen the decision.
* **Discrepancy Description**:
  * **Many pages will be skipped.** News is one of the nine sections required from day one. Pages that refuse download, are paywalled or have no date are skipped (line 377). That is likely to be common:
    * many credible single-company sources are paywalled or block automated downloads;
    * pages that need JavaScript return nothing to a plain downloader;
    * company-specific bank research is mostly for clients only (`docs/local-cli-pivot.md` line 303).
  * **Two points are unchecked (to verify):**
    * whether the AI's web search can be limited to the allowlist (if not, code will drop many of its links);
    * the sites' terms on automated download.
  * **Nothing measures it early.** No test measures how many articles are readable, so the first sign of a thin section would come during the Goal 1 month.
* **Rationale & Recommendation**:
  * Add a Phase 0 measurement on about 5 tickers. Count:
    * links suggested;
    * the share on the allowlist;
    * the share saved with a date and a minimum length.
  * Set a pass mark, for example at least 5 readable articles per ticker.
  * Say what section 7 shows when few articles are readable.
  * Consider reliable extra sources: the company's own press releases (filed as 8-Ks) and its investor-relations pages.

### egm-design-1-18: The raw-data folder will grow without a plan for what happens at its size cap - Severity: Major
* **Reviewer Lens:** `egm-design` (instances A and B). New.
* **Affected Scope:** §3 step 2 (line 250); §5 (line 289); §6 (line 318); A9 (`Lines 512-514`); disk requirement (line 671); Goal 2 (line 81).
* **Discrepancy Description**:
  * **Every download is kept.** Downloads are never overwritten (line 318).
  * **Peer files are saved again and again.** Each peer's company-data file (20-70 peers per sector) is saved again whenever it changes, which is every time that peer files a report. Filings, articles and 252 or more daily all-stock price files add more.
  * **Sizes are unmeasured.** The reviewers estimate several MB per company-data file for large companies (to verify). On that estimate, a year of use across several sectors could approach the 5 GB default cap (line 671).
  * **The cap has no defined outcome.**
    * The app "never deletes inputs that a stored prediction needs" (line 671).
    * Goal 2 promises replay for *any* report, not just official ones.
    * So at the cap the app can only stop saving, which breaks replay, or stop running. Neither is stated.
  * **A9 may have it backwards.** A9 rejects SEC bulk files partly for "more disk use", but fetching each peer separately may use more over time.
* **Rationale & Recommendation**:
  * Measure the bytes used by a first run and a repeat run in Phase 0, and record the figures in §6.
  * State what happens at the cap: inputs for unofficial runs may be pruned (and Goal 2 should say so); inputs for official predictions never are.
  * Consider compressing stored files, or keeping only the facts each run used plus a fingerprint of the original file.
  * Show the folder size in settings, and re-weigh A9 with real numbers.

### egm-design-1-19: The prediction log can't be recreated, yet it has only one copy, and nothing shows if it is changed - Severity: Major
* **Reviewer Lens:** `egm-design` (instance B). New.
* **Affected Scope:** Goal 8 (line 93); §6 (line 327); requirement (line 672); A7 (`Lines 498-502`); A25 (`Lines 628-632`). A7 (no cloud storage) is Liam's decision. This stays fully local and doesn't reopen it.
* **Discrepancy Description**:
  * **Goal 8 says the records can't be added after logging starts.** So a lost log can't be rebuilt.
  * **The backup A7 relies on is manual and partial.** A7 says "local SQLite plus `engine export-log` covers backup" (line 502). But the export is run by hand (line 327) and holds only predictions and grades. It leaves out the stored prices and raw inputs needed to replay reports or grade open predictions. A dead laptop loses months of record.
  * **Nothing shows if the log is changed.** A25 says the local log has everything needed to grade honestly (line 632). But nothing would reveal a silent change, whether from a database-upgrade bug (line 672) or a hand edit.
* **Rationale & Recommendation**:
  * Back up automatically after each official prediction and each grading, to a folder Liam picks, such as an external drive. SQLite has a built-in way to copy a database while it is in use. Include the prices for each prediction's fixed peer list.
  * Add a simple chain of fingerprints: each prediction row stores a fingerprint of its own content plus the previous row's fingerprint, and the app checks the chain when it opens.

### egm-structural-1-1: There is no Risks and Mitigations section, and several outside services have no fallback - Severity: Major
* **Reviewer Lens:** `egm-structural`; `egm-design` (instances A and B) raised the same gap and the details on outside services. New. Stage 6 #7 covers the terms question being unexplained, not the missing section.
* **Affected Scope:** All of lines 1-695, against the standard's "Risks & Limits" rule. Risk material is spread across about 11 places:
  * line 50;
  * CUJ 5;
  * line 243;
  * `Lines 275-280` and `Lines 291-292`;
  * `Lines 357-368`;
  * lines 380 and 386;
  * §12;
  * Open Questions `Lines 121-125`;
  * requirements `Lines 656-672`;
  * A9 (line 514).

  Decisions rows at lines 184 and 186 are also involved. Massive and Jev are Liam's choices; this adds a backup and failure handling only.
* **Discrepancy Description**:
  * The standard requires the spec to name its failure modes, security issues and scale limits, and how each is handled. No section does this, and several risks have no stated handling:
    * **Massive is the only price source** (line 184). It feeds valuation, momentum, the range, the rating and every grade.
      * Its free-plan limits and terms are unconfirmed (line 121), and whether the free plan includes splits and dividends is not a stated check.
      * If the free plan changes, new ratings stop and open predictions can't be graded.
      * The earlier review asked for a second source (`concepts_brief.md` line 680), and the design dropped it.
    * **The S&P 500 list file is not checked** (line 186), for example for about 500 rows that all match a company. Because it sets the peer groups, a bad file quietly changes ratings.
    * **Ticker changes could mix up prices.** The daily all-stocks price summary is keyed by ticker, but the price store is keyed by the SEC's company ID (line 284). A ticker change or reuse within a grading window could mix two companies' prices.
    * **The AI tools change their command options between versions.** `docs/local-cli-pivot.md` warns about this.
    * **Anthropic's or OpenAI's terms could rule against another program using a subscription sign-in,** even for personal use. Line 124 covers only a public release.
    * **Jev outages, the AI usage limit and disk growth** (see `egm-design-1-15` and `egm-design-1-18`).
  * **The earlier review asked for this.** The earlier structural review asked for "one risk table". It also listed five of Liam's decisions that carry serious risk for him to accept (`concepts_brief.md` lines 557-574 and 674). The design records neither.
* **Rationale & Recommendation**:
  * Add a "Risks and Mitigations" table, either under Non-Functional Requirements or between Alternatives Considered and Non-Functional Requirements. Columns:
    * risk;
    * effect;
    * how it is noticed;
    * how it is handled;
    * where the detail lives;
    * status (accepted by Liam / handled / open).
  * Include the five risks from `concepts_brief.md` lines 557-574, marked as accepted by Liam where he did so.
  * Name a second free price source, test it in Phase 0, and record the source on every stored price row.
  * Check the S&P 500 list file and record its date on every run. Keep a dated history of tickers.

### egm-structural-1-2: Several drafter choices that Liam is asked to approve have no alternatives listed - Severity: Major
* **Reviewer Lens:** `egm-structural`; `egm-design` (instance A). New.
* **Affected Scope:** Decisions table rows at lines 184, 186, 190 and 194; §8 discount rate (line 355); §4 connector route (lines 266-268); Alternatives Considered (`Lines 440-650`). Recording alternatives to Liam's Massive choice does not reopen it.
* **Discrepancy Description**:
  * **What the standard requires.** A spec fails if it proposes a single path without showing that other workable designs were weighed.
  * **Four drafter choices in the decisions table have no alternatives entry:**
    * storing unadjusted prices (line 184);
    * the S&P 500 list source (line 186);
    * the 30-day official-prediction rule (line 190);
    * combining the valuation methods by median (line 194).
  * **Liam is asked to choose with nothing to compare.** Lines 186 and 190 ask him to "change it at approval if you prefer another…" but give him no options. Both were open decisions in `concepts_brief.md` (decisions 4 and 6, lines 681 and 688).
  * **Reviewer A adds three more:**
    * the price source itself;
    * volatility buckets versus a cost of equity based on how much the stock moves with the market (beta), at line 355;
    * the connector route, the Agent SDK versus calling the `claude` program directly (see Stage 5 #11).
* **Rationale & Recommendation**:
  * Add a short alternatives group for each, with one or two rejected options and the reason. Examples:
    * for the member list: another published list, or the bundled copy as the main source;
    * for the official prediction: "every run counts", or "only the first run ever per company".

### egm-structural-1-3: The method numbers the feature part relies on are placed after the boundary, in the implementation plan - Severity: Major
* **Reviewer Lens:** `egm-structural`. The placement problem is new. Specific rows were also raised in Stage 5 #4 and #7, and Stage 6 #3 and #12.
* **Affected Scope:** §3 step 5 (line 253); §7 (lines 333, 340 and 342); §8 (line 355); implementation plan "Settled defaults" (lines 700-723).
* **Discrepancy Description**:
  * **The feature part points to values it never gives:**
    * "times the factor weights" (line 253);
    * "starts from 12-month volatility" (line 333);
    * "band widths are set per uncertainty level in the rating-bands file" (line 340);
    * "a stock must move further to change rating" (line 342).
  * **The values live after line 696,** under "Settled defaults this plan relies on", which says "These were not decided earlier". That table holds:
    * the factor weights and uncertainty thresholds;
    * the range formula and the sector's expected return;
    * the rating bands, the buffer and the probability formula;
    * the peer-group rules, the earnings-date rule and the analyst default.
  * **These are design decisions, not build tooling.** Someone approving the feature part can't see the numbers that drive the rating.
* **Rationale & Recommendation**:
  * Move every method row (implementation plan lines 710-722) into the decisions table (lines 180-194), or directly into §7 and §8.
  * Leave only tooling rows in the implementation plan: Python version, Electron tooling, where keys are stored, the app data folder and the Phase 1 window.

### egm-structural-1-4: The same rules are written in several places, and the copies already disagree - Severity: Major
* **Reviewer Lens:** `egm-structural`; `egm-style`. New. Stage 6 #6 raised items missing from the outgoing-data list, not the repetition or the contradiction about tools.
* **Affected Scope:**
  * Overview and Problem (`Lines 25-29`, `Lines 59-65`);
  * §1 and §3;
  * §4 (lines 267 and 271);
  * §6 (lines 318 and 327);
  * §9 (line 376);
  * §12 (`Lines 424-431`);
  * Goal 7 (line 92);
  * requirements (`Lines 656-666`, lines 671-672).
* **Discrepancy Description**:
  * **The tool lock-down contradicts the news step.**
    * §4 says every tool is denied and "any attempt to use a tool counts as a failure" (lines 267 and 271). §12 says AI calls run "with every tool denied" (line 426).
    * But §9 (line 376) and the security requirement (line 657) allow web search for the news link search.
    * A builder following §4 or §12 would build a news step that always fails. One following §9 weakens a rule that §4 states as absolute.
  * **What leaves the Mac.** §12 lists two items (lines 429-431); the privacy requirement lists three (lines 661-666). Both say the settings screen lists "these", while Goal 7 (line 92) says the *report* states them.
  * **The disk-cap warning.** It comes "when it is reached" (line 318) but "before it reaches the cap" (line 671).
  * **Database upgrades.** One place says upgrade in place (line 327); the other adds a backup copy first (line 672).
  * **The run is described four times:** lines 25-29, lines 59-65, §1 and §3. A "Proposed solution" list sits under The Problem, and "every tool denied, empty folder" appears in five places.
* **Rationale & Recommendation**:
  * State the lock-down rule once, in §4, including the news-search exception, and have §9 and §12 point to it.
  * Merge §12 into the security and privacy requirements, or cut §12 to a pointer.
  * Keep §6 to what is stored, and point to the requirements for the cap and upgrade rules.
  * Decide whether the report, the settings screen or both list outgoing data, and say so once.
  * Remove the "Proposed solution" list, which §3 replaces.

### egm-style-1-1: Goal 1, the only success test, can't be scored as written - Severity: Major
* **Reviewer Lens:** `egm-style`; `egm-design` (instance B). New. Stage 5 #2 covers when the month starts, not how it is scored.
* **Affected Scope:** Goal 1 (`Lines 71-80`); CUJ 3 (`Lines 148-149`); §11 (line 422). Goal 1's criteria are Liam's (`concepts_brief.md` lines 753-768). This keeps them and makes them scoreable.
* **Discrepancy Description**:
  * **Nobody confirms anything.** The goal is "no confirmed wrong number" (line 72), but no one is named to confirm an error and no method is given. The button "counts the errors he finds".
  * **One thing has three names.** A flag marks a sentence Liam "believes is wrong" (line 148). The same flag is called "errors" (line 149) and "corrections" (line 422). A builder will build a counter of suspected errors, which can't tell whether the test passed.
  * **"Wrong" has no rule.** A P/E that differs from a finance website because it uses another definition is not wrong. One that differs from the cited filing is.
  * **"Every citation opens a passage that supports its claim"** (line 73) doesn't say whether Liam opens every citation or a sample.
  * **"Preferred"** (line 80) has no way of being recorded.
  * **No minimum number of reports is set** (three would pass), and nothing says what happens if the test fails.
* **Rationale & Recommendation**: suggested rewrites.
  * **No wrong numbers:** "Liam flags any number he believes is wrong. After checking the source, he marks each flag 'confirmed error' or 'not an error'. A number is wrong if it differs from the cited source, or from a recalculation using the report's own definition, beyond rounding. Pass: zero confirmed errors."
  * **Citations hold up:** "Liam opens [all / N per report] citations and flags any that don't support the claim. Pass: zero."
  * **Preferred:** "After each report, Liam records yes or no to 'better than my usual sources for this decision'." Set a pass share.
  * **Minimum and consequence:** set a minimum (reviewer B suggests about 10 reports across at least 4 sectors, including a bank or property trust), and say what a fail triggers.
  * Use "flag" for the action and "confirmed error" for the result, everywhere.

### egm-style-1-2: The report is said to "end with" a block that isn't in the nine-section outline - Severity: Major
* **Reviewer Lens:** `egm-style`. New. Stage 5 #14 is about where the analyst view goes, which is a different gap.
* **Affected Scope:** Overview outline (`Lines 13-23`); Goal 1 (`Lines 74-78`); CUJ 2 (line 142).
* **Discrepancy Description**:
  * Goal 1 and CUJ 2 both say every report "ends with" four things:
    * the rating and range;
    * what would change the rating;
    * the next dated events;
    * the risks to watch.
  * The outline puts "Methodology and sources" last and has no place for that block.
  * A builder writing the template must guess between a tenth section, a different order, or a block inside section 9.
* **Rationale & Recommendation**: Name the block in the outline, for example "What to watch: what would change the rating, next dated events, risks to watch (always shown before Methodology)". Then change "ends with" to "includes a 'What to watch' block".

### egm-style-1-3: The plain-language meaning of the rating doesn't match its rule, and the report will print it - Severity: Major
* **Reviewer Lens:** `egm-style`. New. Stage 6 #4 is about the two meanings of "sector benchmark", not this definition.
* **Affected Scope:** Decisions table, "What the rating means" (line 191); §7 (`Lines 334-341`). Sector-relative ratings are Liam's decision; only the wording is at issue.
* **Discrepancy Description**:
  * **Line 191 says:** "Buy means expected to beat the sector benchmark, Sell means expected to lag it, Hold means in line."
  * **§7's rule is different:**
    * Buy also needs a score at or above the 60th percentile (line 336).
    * Sell also covers any stock scoring at or below the 25th percentile, even one expected to beat the benchmark (line 337).
    * Hold covers everything else, including stocks expected to beat and stocks capped by a red flag (lines 338 and 341).
  * **The report will print the definition.** Line 334 says "Every report states this definition" (citing the US rule for broker research), without saying which wording. A builder copying line 191 would tell readers something untrue.
* **Rationale & Recommendation**:
  * Rewrite line 191 and the printed text to match the rule. Suggested wording: "Buy: code expects the stock to beat its sector benchmark by more than a margin set by its uncertainty level, and its factor score is in the top 40% of its sector. Sell: code expects it to lag by more than that margin, or its factor score is in the bottom 25%. Hold: everything else, including any stock with a red flag."
  * Settle before the first logged prediction.

### egm-style-1-4: Nothing ties the price range to the base case - Severity: Major
* **Reviewer Lens:** `egm-style`. New.
* **Affected Scope:** Goal 4 (line 85); §7 (`Lines 331-332`).
* **Discrepancy Description**:
  * **Goal 4 defines the cases as percentiles.** The bear, base and bull cases are "the 10th, 50th and 90th percentiles".
  * **§7 never connects them.** It defines the base case with a valuation formula (line 331). It takes the bear and bull cases "from a volatility forecast" (line 332), but never says what that forecast is centred on.
  * **A builder could centre it on today's price,** as a standard volatility range does. The base case would then not be the 50th percentile.
  * **Average and middle are not the same.** The base-case formula reads like an average outcome, while the 50th percentile is a middle outcome. For a lopsided spread of prices, these are different numbers.
* **Rationale & Recommendation**:
  * At line 332, write: "Bear and bull cases: the 10th and 90th percentiles of a price distribution whose middle value is the base case. Its spread comes from a volatility forecast built from the past year's daily returns."
  * The range is graded, so settle this before the first logged prediction.

### egm-style-1-5: The terms and legal risk is worded with more certainty than the evidence supports, and the download link is described as if it exists - Severity: Major
* **Reviewer Lens:** `egm-style`. Partly also raised in Stage 6 #7, which asks what the terms question is. The certainty of the wording and the "answers" versus "approves" conflict are new.
* **Affected Scope:** Overview (line 11); Open Questions (`Lines 124-125`); CUJ 6 (line 173); A2 (line 458); A26 (`Lines 638-640`).
* **Discrepancy Description**:
  * **The download link is described as if it exists.** Line 11 says, in the present tense, that the app is "open source on GitHub with a direct download link". Line 124 says no public download may exist until Anthropic approves and OpenAI's terms are checked.
  * **Line 125 states an unsupported legal conclusion:** "Using it for personal use carries no such risk". A public GitHub repository also makes the name public anyway.
  * **The same area is described two ways.** Line 638 says "Clearly within Anthropic's terms", while line 458 calls it a "gray area".
  * **"Answers" is not "approves".** Line 640 builds the button "only after Anthropic answers", while CUJ 6 (line 173) says "If Anthropic approves". A "no" is an answer, so a builder could ship the button after a refusal.
* **Rationale & Recommendation**: suggested rewrites.
  * **Line 11:** "Planned as a free, open-source Mac app on GitHub. A public download waits on the terms checks in Open Questions."
  * **Line 125:** "The name risk starts when the name is public, including the GitHub repository."
  * **Line 638:** "Does not need Anthropic's approval."
  * **Line 640:** "only if Anthropic approves (CUJ 6)."

### egm-style-1-6: The rule for which run counts as the official prediction is incomplete - Severity: Major
* **Reviewer Lens:** `egm-style`; `egm-design` (instances A and B). New.
* **Affected Scope:** Decisions table (line 190); §2 (line 243); §3 step 14 (line 262); §5 (line 291); CUJ 5 (`Lines 162-166`). The rule is the drafter's, and line 190 flags it for Liam's approval.
* **Discrepancy Description**:
  * **Do unofficial runs write predictions?** Line 190 says later runs in a window "are logged as unofficial". Line 262 saves the prediction only "if this is the official run". It is unclear whether unofficial runs create prediction rows, and if so whether grading skips them.
  * **What is the window?** "Each 30-day window" (line 190) doesn't say whether the window is fixed to the calendar or rolls from the last official run.
  * **Does a failed run take the slot?** If the first run in a window fails (line 243), or has its rating withheld for stale prices (line 291, CUJ 5), it is unclear whether it uses up the official slot.
* **Rationale & Recommendation**:
  * State the rule once. For example: "The first run that produces a rating starts a rolling 30-day window for that company. Later runs in that window save a report and run record but no prediction." Or, if prediction rows are wanted: "…save a prediction marked unofficial, which grading skips."
  * Make line 262 match.
  * Settle before the first logged prediction.

---

### egm-design-1-20: The engine's message channel breaks if any library prints to it - Severity: Nit
* **Reviewer Lens:** `egm-design` (instance A). New.
* **Affected Scope:** §1 (`Lines 206-207`).
* **Discrepancy Description**: The engine sends its messages to the app as one line per message on its standard output. Any library that prints there (progress bars, warnings, a stray print) will corrupt the stream.
* **Rationale & Recommendation**: Keep standard output for messages only, and send everything else to the error stream.

### egm-design-1-21: Only the AI program paths are passed to the engine - Severity: Nit
* **Reviewer Lens:** `egm-design` (instance A). New.
* **Affected Scope:** §2 start-up (line 227).
* **Discrepancy Description**:
  * A `claude` or `codex` installed through npm (a JavaScript package manager) is a script that needs Node on the search path.
  * An app opened from Finder starts with a minimal search path, so passing only the program path may not be enough.
* **Rationale & Recommendation**: Pass the corrected search path to the engine as well, and test each install method.

### egm-design-1-22: Prices are stored per company, but some companies have share classes with different prices - Severity: Nit
* **Reviewer Lens:** `egm-design` (instance A). New.
* **Affected Scope:** §5 (line 284); step 1 (line 249).
* **Discrepancy Description**:
  * Prices are stored "per CIK", the SEC's company ID.
  * Share classes under one company have separate prices: GOOG and GOOGL, BRK.A and BRK.B (a 1:1500 ratio, line 249), FOX and FOXA, NWS and NWSA.
  * Mixing them would be wrong by up to 1,500 times for Berkshire.
* **Rationale & Recommendation**: Key prices by company plus share class.

### egm-design-1-23: CUJ 3 and §9 disagree on whether article text is shown - Severity: Nit
* **Reviewer Lens:** `egm-design` (instance A). New.
* **Affected Scope:** CUJ 3 (line 149); §9 (line 385).
* **Discrepancy Description**: CUJ 3 opens "the exact … article paragraph", while §9 shows "never the article text".
* **Rationale & Recommendation**: Say whether a cited paragraph is shown as a short quote or the citation opens the original page.

### egm-design-1-24: The "data sent out" lists leave out some vendors, some data and some storage places - Severity: Nit
* **Reviewer Lens:** `egm-design` (instances A and B). Partly also raised in Stage 6 #6. The points below are new.
* **Affected Scope:** Goal 7 (line 92); §3 step 13 (line 261); §12 (`Lines 429-431`); privacy and security requirements (`Lines 660-666`).
* **Discrepancy Description**:
  * **Both AI vendors may receive text.** When both tools are connected, the skeptic sends text to the second vendor too (line 261), and which tool drafts the report isn't stated.
  * **More than filings goes out.** The AI vendor also receives the computed numbers and the rating. The list of companies Liam researches reaches Massive, Jev and Alpha Vantage.
  * **Copies may pile up outside the app.** The AI tools may keep their own session histories in the user's home folder, outside the app's folder and its size cap (to verify).
  * **Keychain access is per program.** macOS ties Keychain access to the program that asks, and for the engine that is the Python program (to verify). In terminal mode, other scripts using the same Python might read the keys. An update that changes the program may also cause access prompts. Test this with the `keyring` package across an update.
* **Rationale & Recommendation**:
  * Add these to the outgoing-data list. Name both vendors, and log which tool did what.
  * Check whether each AI tool can turn off its session history for these calls.

### egm-design-1-25: Removing failed claims could make reports more upbeat - Severity: Nit
* **Reviewer Lens:** `egm-design` (instance A). New.
* **Affected Scope:** §3 step 13 (line 261); §11 (line 422).
* **Discrepancy Description**:
  * Cautious risk wording may fail the checks more often than upbeat wording.
  * If so, removals tilt reports positive, which is the bias the skeptic exists to catch.
  * The v3 stress test proposed logging the removal rate by claim direction; line 422 doesn't include it.
* **Rationale & Recommendation**: Log removals by whether the claim was positive or negative, and show the split in the checks box.

### egm-design-1-26: The cash-flow valuation is missing some guardrails - Severity: Nit
* **Reviewer Lens:** `egm-design` (instance A). New.
* **Affected Scope:** §8 (lines 351, 353, 355 and 356).
* **Discrepancy Description**:
  * **No floor on growth.** There is no floor on the trailing growth rate (line 351), so a company with a sharp sales drop is projected to keep shrinking for five years.
  * **The value can explode.** Long-run growth can be as high as the 10-year Treasury yield (line 353). That can sit close to a 7.5% discount rate blended with cheaper debt (line 355), and the value then explodes.
  * **Lease value may be overstated.** Adding lease costs back to cash flow (line 356) also needs lease-related reinvestment counted.
* **Rationale & Recommendation**:
  * Set a growth floor.
  * Set a minimum gap between the discount rate and long-run growth.
  * Count lease reinvestment.

### egm-design-1-27: The Problem section overstates the 55-57% ceiling and uses vague or persuasive words - Severity: Nit
* **Reviewer Lens:** `egm-design` (instance B); `egm-style`. Partly also raised in Stage 6 #16 (no citations). The overstatement is new.
* **Affected Scope:** The Problem (`Lines 35-52`); A16 (line 565).
* **Discrepancy Description**:
  * **The ceiling answers a different question.** The 55-57% figure (line 50) is the research author's own conversion ("my calculation"). It turns a forecast-fit figure for the 1,000 largest stocks into an up-or-down hit rate. Tearsheet's rating asks a different question (will the stock beat its sector?), and the same report says no study has measured that for S&P 500 companies.
  * **"No traditional or AI method changes this" overstates.** The research found no study, not a failed one.
  * **Some wording is stronger than the source or vague:**
    * "hard ceiling" and "at best" (line 50);
    * "trailed the S&P 500 badly" (line 47), when the source gives exact figures;
    * "slow, scattered, and hard to trust" (line 35);
    * "long and dense" (line 37);
    * "many sites" (line 40);
    * "each fail in a known way" (line 44);
    * "Much of it is also paywalled" (line 46);
    * "rarely cite" and "strict benchmark" (line 48);
    * "cannot win" (line 52).
  * **Line 46 has two problems.** It joins a 2000-2009 finding to an undated 56% figure, and "than followed" is ungrammatical.
* **Rationale & Recommendation**:
  * Reword line 50 as: "an estimated ceiling for up-or-down calls on large US stocks; not measured for sector-relative calls."
  * Give exact figures with dates, and split line 46 into two sentences.

### egm-design-1-28: One reason for rejecting a Python-only app (A6) doesn't hold - Severity: Nit
* **Reviewer Lens:** `egm-design` (instance B). New.
* **Affected Scope:** A6 (line 493); §13 (line 435). Electron is Liam's choice (line 183) and is not reopened.
* **Discrepancy Description**:
  * A6 says signing and notarizing a Python Mac app is less mature than with Electron.
  * But the chosen design already ships its own Python runtime inside the app (line 435), so it carries the same Python signing work.
* **Rationale & Recommendation**: Restate the reasons. Only auto-update and the reuse of Realm's code still separate the two options.

### egm-structural-1-5: The sentence explaining where the alternatives came from is wrong - Severity: Nit
* **Reviewer Lens:** `egm-structural` (rated Major); `egm-style`. New.
* **Affected Scope:** Alternatives Considered introduction (line 442); labels A1-A27 (`Lines 446-650`).
* **Discrepancy Description**:
  * Line 442 says items 1-10 came from the brainstorm, items 11-23 from the Goldfish review, and the rest from drafting. After the entries were regrouped by topic, this is wrong for most of them.
  * Checked against `concepts_brief.md` lines 620-665:
    * **brainstorm:** A1, A2, A3, A7, A8, A11, A12, A21, A25, A26;
    * **review:** A4, A5, A6, A9, A10, A13, A17, A18, A19, A23, A24;
    * **drafting:** A14, A15, A16, A20, A22, A27.
  * The sentence also says "Items 1-10" while the entries are labelled "A1" onward, and the review's numbers differ from the design's (the review's alternative 14 is the design's A4).
* **Rationale & Recommendation**:
  * Lowered to Nit in this report because it doesn't change what gets built. It does mislead anyone checking that every review item was settled.
  * Delete the sentence, and add a "Source" line to each entry: "Brainstorm", "Goldfish review #n" or "Drafting".

### egm-structural-1-6: "Additional Resources" and "Future Improvements" sit inside Non-Functional Requirements - Severity: Nit
* **Reviewer Lens:** `egm-structural`. New.
* **Affected Scope:** `Lines 672-683`.
* **Discrepancy Description**:
  * Both are second-level headings directly after the requirements, so a table of contents lists them as requirements.
  * The template puts a horizontal rule before them; the design leaves it out.
* **Rationale & Recommendation**: At least add the rule between lines 672 and 674. Better, make both top-level sections.

### egm-structural-1-7: Paths in Additional Resources have no stated starting folder, and the Realm address isn't a link - Severity: Nit
* **Reviewer Lens:** `egm-structural`. New.
* **Affected Scope:** `Lines 676-681`; line 442.
* **Discrepancy Description**:
  * The paths are plain code text and assume the repository root, but the design lives in `docs/designs/`.
  * The note saying paths start at the repository root appears only at line 698, after these paths are used.
  * The Realm address (line 681) has no `https://`, so it is not a link.
* **Rationale & Recommendation**:
  * Add "Paths are from the repository root" at the top of the list, or use relative links.
  * Write the Realm address as a full link.

### egm-structural-1-8: The analyst-ratings choice is recorded in three places, and A27 breaks the alternatives' shape - Severity: Nit
* **Reviewer Lens:** `egm-structural`. New.
* **Affected Scope:** Open Questions (`Lines 111-113`); "Analyst ratings (still open)" group and A27 (`Lines 642-650`); Future Improvements (line 692).
* **Discrepancy Description**:
  * The same open choice appears as an open question, as an alternative marked "Not rejected", and as a future improvement.
  * A27 replaces "Reason for rejection" with "Status", and its group is the only one named by status rather than by the question it answers.
  * The free option, which is the current default, has no entry.
* **Rationale & Recommendation**:
  * Keep the comparison only in Open Questions, and remove A27 and line 692 until Liam decides.
  * Once he decides, record the rejected option in the usual shape.

### egm-structural-1-9: Non-Goals mix "never" with "not in the first version", and some clash with Future Improvements - Severity: Nit
* **Reviewer Lens:** `egm-structural`. New.
* **Affected Scope:** Non-Goals (lines 98, 100, 101 and 106-107); A25 (line 632); Future Improvements (lines 687 and 691).
* **Discrepancy Description**: Only lines 106-107 say "in the first version". The others read as permanent, yet:
  * line 98 rules out machine-learning prediction, while line 687 plans factor weights fitted by machine learning;
  * line 100 rules out cloud storage, while line 691 plans Google Drive backup;
  * line 101 rules out a public track record, while A25 says "Publishing can be added later", which isn't in Future Improvements.
* **Rationale & Recommendation**:
  * Split Non-Goals into "Never" and "Not in the first version (see Future Improvements)".
  * Add A25's public track record to Future Improvements, or drop "can be added later".
  * This only labels scope; it reopens no decision.

### egm-structural-1-10: Liam's decisions are marked in five different ways, and the decisions table mixes reasons, status and requests - Severity: Nit
* **Reviewer Lens:** `egm-structural`; `egm-style`. New. This complements Stage 5 #21 and Stage 6 #2, which cover the reverse problem: decided items still listed as open.
* **Affected Scope:** lines 94, 111 and 125; decisions table (`Lines 180-194`); A3 (line 469); line 31.
* **Discrepancy Description**:
  * **Five different markers:**
    * "[decided]" (line 94, used once);
    * "(deferred by Liam)" (line 111);
    * "(chosen by Liam, Nov 2)" (line 125);
    * the "Decided by" column;
    * "(Liam, Nov 2)" in running text.
  * **"Drafter" is never defined.**
  * **The table mixes reasons and status.** Reasons sit in the "Decided by" column (lines 184-188). Bold approval requests appear on only two of the five drafter rows (lines 186 and 190), which suggests the other three are final.
  * **One quote has no source:** "following Liam's 'users include the Jev key'" (line 188).
  * **A3 contradicts Goal 9 and line 31.** A3 (line 469) rejects an option because "the app must work for non-technical people". Goal 9 makes that a later goal, and line 31 says the app is for personal use.
* **Rationale & Recommendation**:
  * Use one "Status" column: "Liam, date" or "Drafter default, awaiting approval". Define "Drafter" once.
  * Move reasons into the Choice column, and move approval requests to Open Questions.
  * Reword A3's reason: "Goal 9 (later) needs an app non-technical people can use."

### egm-structural-1-11: Two cross-references are imprecise - Severity: Nit
* **Reviewer Lens:** `egm-structural`. New.
* **Affected Scope:** line 183; uses of "§" throughout.
* **Discrepancy Description**:
  * **The Electron citation points to the wrong section.** "Liam (brief §1)" is cited for choosing Electron. Brief §1 says only "desktop app (Mac first)". Electron is named in brief §10 (marked as proposed) and in Liam's answer #3 (`concepts_brief.md` line 777).
  * **"§" means two things.** A bare "§n" means this document's Technical Plan, but "brief §1" uses the same symbol for another document.
* **Rationale & Recommendation**:
  * Cite answer #3 in `concepts_brief.md` for Electron.
  * Write "Technical Plan §n", or say once what a bare § means.

### egm-structural-1-12: The architecture diagram's bottom row is misaligned and leaves out connections - Severity: Nit
* **Reviewer Lens:** `egm-structural`. Partly also raised in Stage 6 #6 (the Alpha Vantage wording and the missing holdings file in the privacy list). The diagram's layout is new.
* **Affected Scope:** `Lines 198-221`.
* **Discrepancy Description**:
  * **The layout is cramped.** Five connecting lines serve six services. Alpha Vantage is stacked under Jev's line, and Claude Code's label runs into Alpha Vantage's note.
  * **Three connections are not drawn:**
    * the article sites (§9);
    * the ETF holdings file (line 186);
    * Electron running the AI tools to find them and check sign-in (lines 182 and 202).
  * **A border is off.** Line 200 has no space before its right border.
* **Rationale & Recommendation**: Give each outside service its own column, and add the missing connections.

### egm-structural-1-13: Small formatting inconsistencies - Severity: Nit
* **Reviewer Lens:** `egm-structural`. New.
* **Affected Scope:** `Lines 27-29`, `37-40`, `46-48`, `54-57`; line 376; line 250.
* **Discrepancy Description**:
  * **Bullets.** These lines use "-" bullets; the rest of the document and the template use "*".
  * **Numbering.** Line 376 numbers a list as "1.  ", while lines 13, 61 and 71 use "1. ".
  * **Step 2's table cell** (line 250) builds a list with raw `<br>` tags and "•" characters, which some viewers don't display.
* **Rationale & Recommendation**:
  * Use one bullet style and one numbering style.
  * Move step 2's fetch list out of the table into a short list below it.

### egm-style-1-7: Two rules are named but never defined, and two numbers live only in the implementation plan - Severity: Nit
* **Reviewer Lens:** `egm-style` (rated Major). New. The parts the reviewer included about "hit rate", "enough" and the 30-day window are now in `egm-design-1-7` and `egm-style-1-6`. What remains is a Nit.
* **Affected Scope:** §8 (line 364); §9 (line 383); §7 (line 342); A9 (line 514); Future Improvements (line 686).
* **Discrepancy Description**:
  * **No rule given:** "with outliers trimmed" (line 364).
  * **No definition or time limit:** "plus older major events" (line 383).
  * **Numbers only in the implementation plan:** the buffer (line 342) and "if the Phase 0 SEC count is high" (lines 514 and 686). The numbers appear only at lines 719 and 842.
* **Rationale & Recommendation**:
  * State the trimming rule.
  * Define "older major events" or remove the phrase.
  * State the buffer and SEC numbers where they are used, or point to "Settled defaults".

### egm-style-1-8: Claims about what banks and "most people" do have no source - Severity: Nit
* **Reviewer Lens:** `egm-style`. New.
* **Affected Scope:** line 191; A6 (line 493); A12 (line 536); A16 (lines 561, 565 and 566); A19 (line 587); A20 (line 594); A21 (line 601); A27 (line 648).
* **Discrepancy Description**:
  * **Bank practice.** "This matches Morgan Stanley, J.P. Morgan and Goldman Sachs practice" (line 191) has no source. The reviewer notes that `docs/brief-v4.md` line 364 says Morgan Stanley rates over 12-18 months, not 12.
  * **Other unsourced or unmeasurable claims:**
    * "Major firms rarely use it" (line 566);
    * "how most people read 'Buy'" (line 561);
    * "the studies reviewed" (line 587);
    * "The research found" (line 536);
    * "errors are larger", with nothing to compare against (line 594);
    * "Reliable coverage" (line 601);
    * "well-sourced" (line 648);
    * "less mature" (line 493).
  * **A misapplied argument.** Line 565 uses the 55-57% ceiling against absolute ratings, but the ceiling applies to every rating type.
* **Rationale & Recommendation**: Cite the section of the research report, or delete the claim.

### egm-style-1-9: Persuasive or subjective wording in a neutral document - Severity: Nit
* **Reviewer Lens:** `egm-style`. New.
* **Affected Scope:** lines 21, 25, 57, 65, 372, 454, 461, 469, 486, 494, 632 and 689.
* **Discrepancy Description**:
  * "What each part does well" (line 25).
  * "Clear about what to do with the information" (line 57) reads as advice, which the Non-Goals rule out (line 102).
  * "Graded honestly" and "grade honestly" (lines 65 and 632).
  * "Credible sources" (lines 21 and 372), when the actual test is "on the allowlist".
  * "Removes every one of those costs" (line 454), though users still use their AI plan and Liam still pays $99 a year for the Apple developer account.
  * Also: "dead end" (line 461), "useful part" (line 469), "more likely to finish the same way every time" (line 486), "polished" (line 494) and "Report polish" (line 689).
* **Rationale & Recommendation**: suggested rewrites.
  * Line 57: "ends with what would change the rating, the next dated events and the risks to watch (Goal 1)."
  * "Honestly": "against the logged price and range, with no later edits."
  * "Credible sources": "allowlisted sources."

### egm-style-1-10: "Free" is claimed absolutely, four times, while two cost questions are open - Severity: Nit
* **Reviewer Lens:** `egm-style`. Jev's unstated cost was also raised in Stage 6 #1.
* **Affected Scope:** lines 11, 28 and 67; Goal 6 (`Lines 88-91`).
* **Discrepancy Description**:
  * Line 67 repeats Goal 6 under The Problem.
  * The paid Benzinga option ($99 a month, still open) and Jev (cost never stated) could each make "free" untrue.
* **Rationale & Recommendation**: Keep only Goal 6, adding "…except the paid analyst option, if chosen (Open Questions)". Delete line 67.

### egm-style-1-11: "The app" and "the engine", and "Liam" and "the user", are used interchangeably - Severity: Nit
* **Reviewer Lens:** `egm-style`. New.
* **Affected Scope:** lines 188, 192, 374, 378, 398, 422, 603 and 612.
* **Discrepancy Description**:
  * **"The app" is used for engine work:** "the app downloads them" (lines 192, 603 and 612), "text the app saved" (line 378) and "When the app opens, it grades" (line 398). Line 374 says "the engine downloads them" for the same step.
  * **"Liam" is used where any user is meant:** "(Liam always sets one)" (line 188) and "saves Liam's corrections" (line 422).
* **Rationale & Recommendation**:
  * Use "the engine" for downloading, saving and grading, and "the app" only for the Electron window.
  * Use "the user" in feature text, and keep "Liam" for decisions and Goal 1.

### egm-style-1-12: The same idea goes by different names - Severity: Nit
* **Reviewer Lens:** `egm-style`. New. Stage 6 #8 covers the check flow itself, and Stage 5 #20 covers "sector" versus "industry".
* **Affected Scope:** lines 29, 31, 50, 64, 71, 119, 149, 188, 189, 261, 474, 508, 526, 544, 611, 622 and 626.
* **Discrepancy Description**:
  * **The checks:**
    * "Every claim is checked" (line 29);
    * "Code and a second AI pass check every claim" (line 64). This leaves out Jev, and the skeptic sees only claims below Jev's threshold (line 415);
    * "skeptic pass" (line 261);
    * "the AI tool checks claims" (line 188);
    * "claim labeling" (line 622).
  * **The rating:** also "call" (line 50) and "verdict" (line 544).
  * **The success test:** "success bar" (line 31), "stated test" (line 71), "usefulness test" (line 149) and "trust" (line 626).
  * **Quoted rules that match no Goal heading:** "everything stays local" (line 508) and "code runs the steps" (line 474).
  * **Subscription as an amount:** "far less subscription" (line 526) and "the most subscription" (line 611).
  * **Peer count:** "3-5 peers" (line 119) versus "3 largest peers" (line 189).
* **Rationale & Recommendation**:
  * Use "the checks", with the named parts "number check", "citation check", "Jev" and "skeptic".
  * Use "rating" and "the Goal 1 test" throughout.
  * Quote Goal headings exactly, write "subscription usage", and use one peer count.

### egm-style-1-13: "Flag" means four different things - Severity: Nit
* **Reviewer Lens:** `egm-style`. New. Stage 5 #6 and Stage 6 #5 cover a fourth red flag, which is a separate question.
* **Affected Scope:** lines 72, 148, 187, 252, 255, 333, 341, 358 and 422.
* **Discrepancy Description**:
  * **Four kinds of flag:**
    * the insider-buying flag, which is only displayed (lines 187 and 252);
    * red flags, which cap the rating (lines 255 and 341);
    * guardrail flags, which raise the uncertainty level (lines 333 and 358);
    * the reader's "flag this claim" (lines 72, 148 and 422).
  * One shared word invites wiring the wrong kind into the rating. Line 358's bare "Flagged" doesn't say which kind it is.
* **Rationale & Recommendation**: Use four names: "red flag (caps the rating)", "uncertainty trigger", "insider-buying note" and "reader flag". At line 358, write "raises the uncertainty level".

### egm-style-1-14: "Never" statements that have exceptions elsewhere in the document - Severity: Nit
* **Reviewer Lens:** `egm-style`. New. The §12 tool rule (line 426) is covered in `egm-structural-1-4`, and the AI-supplied date in `egm-design-1-3`.
* **Affected Scope:** lines 98 and 380.
* **Discrepancy Description**:
  * **Line 98:** "technical analysis never move[s] the score", yet price momentum is a scored factor (line 286).
  * **Line 380:** "Code only uses its links", yet the request also asks for title, publisher and date.
* **Rationale & Recommendation**:
  * Line 98: write "chart-pattern technical analysis", and note that price momentum is a scored factor.
  * Line 380: request only links, or say what code does with the other fields.

### egm-style-1-15: Hedges, filler, idioms and overloaded sentences - Severity: Nit
* **Reviewer Lens:** `egm-style`. New. The "several minutes" at line 290 was already raised in Stage 6 #18.
* **Affected Scope:** lines 71, 92, 99, 102, 105, 112, 266, 267, 331, 335, 356, 386, 452, 537, 576, 668, 672 and 681.
* **Discrepancy Description**:
  * **Unneeded or doubled words:**
    * "Local by default" (line 92): there is no non-local option.
    * "describes itself as it is" (line 99).
    * "personalized advice tailored to" (line 102) says the same thing twice.
    * "One connector interface… One Python interface" (line 266) repeats itself.
    * "about $149+/month" (line 452) hedges twice.
    * "actually" (lines 71 and 576).
  * **Imprecise wording:**
    * "the system prompt is ours" (line 267): say "written by the engine".
    * "about three years" (line 331): the formula fixes it at exactly three.
    * "never run in a session" (line 386): web pages aren't run, so say "never read in a session".
    * "the forces that matter to this company" (line 105): name the series and trends.
    * "Checked on IBM" (line 112): say who checked and when.
    * "AI models remember past prices" (line 537): say "were trained on data covering the test period".
  * **An escape clause:** "adjusted if they prove unrealistic" (line 668) makes the speed targets optional.
  * **A heading that doesn't match its content:** "Rollout and rollback" (line 672) describes no rollback steps.
  * **Overloaded sentences:** lines 335, 356 and 681 are hard to follow.
* **Rationale & Recommendation**:
  * Apply the rewrites above.
  * Say who decides on the speed targets and against what limit.
  * Add the rollback step ("restore the copy made before the upgrade") or rename the heading.
  * Break up the long sentences.
