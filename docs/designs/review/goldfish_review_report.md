# Goldfish Annotated Review Report

**Status:** resolved (Nov 2). Liam accepted all proposed fixes, and they are applied to `docs/designs/tearsheet.md` and `design_draft.md`, including the 13 implementation-plan fixes. Two questions still wait on Liam: design-1-9 and S5-9.

**Target:** `docs/designs/tearsheet.md`, feature part (lines 1–695). Implementation-plan items are marked **(Stage 9)**. Liam chose to apply them now, so Stage 9 reviews the fixed plan.
**Findings covered:**

| Stage | Report | Findings |
| :-- | :-- | :-- |
| Stage 7 | `critic_report.md` | 56 |
| Stage 6 | `comprehension_report.md` | 18 |
| Stage 5 | `zoom_out_report.md` | 21 |

**Categories:**

| Category | Meaning |
| :-- | :-- |
| PROPOSE FIX | The finding is valid; the edit is described. |
| ESCALATE | Only Liam can settle it. |
| DECLINE | Minor style point, recorded but not fixed. |
| CONTEST | The reviewer is wrong. |

There are no CONTEST items. The findings are accurate; several are about the drafter's own defaults.

**Totals:**

| Category | Count |
| :-- | :-- |
| PROPOSE FIX | 81, including 13 applied at Stage 9 |
| ESCALATE | 3 (1 resolved: Jev dropped) |
| DECLINE | 11 |

Every fix keeps Liam's decisions: Python runs the report, Electron, Massive, the sector-relative rating, links suggested by the AI and downloaded by the engine, all three valuation methods, every run fresh, and the full report from day one.

---

## Needs Liam's input (ESCALATE)

| ID | Severity | Issue | Why only Liam can settle it | What to tell me |
| :-- | :-- | :-- | :-- | :-- |
| S6-1 | Major | Jev is never explained | The drafter has no facts about Jev's provider, cost, data handling or API. They are not in any project file. | **Resolved Nov 2: Liam dropped Jev from v1.** Applied to the design: decisions table, step 13, §11, §12, alternative A29, Non-Functional Requirements, Future Improvements and the build plan. |
| design-1-9 | Major | The prediction log grades Liam's picks, not the method. The reviewer asks to move the monthly code-only rating of all ~500 companies (A18) into Phase 2. | It adds scope that serves Goal 8, not Goal 1 | Yes (Phase 2, if Massive's free plan has the one-call daily market summary) or no (keep it deferred, and the log screen says it grades your picks) |
| S5-9 | Major | Codex is built in Phase 0, but in v1 it is only needed for the second-opinion check (Phase 2) | It depends on whether Codex or Claude Code is your everyday tool | Which do you use most? If Claude Code, Codex moves to Phase 2. |

---

## Proposed fixes: rating, range and grading (settle before the first logged prediction)

| ID | Sev. | Issue | Proposed edit |
| :-- | :-- | :-- | :-- |
| design-1-4 | Major | The rating compares a price-only forecast with a total-return benchmark, and rewards volatility | §7: the Buy/Sell comparison uses only the value-gap part of the base case (one-third × (estimated value − price) ÷ price) against the peers' value-gap parts. The displayed range is unchanged. Add a test case: same value gap, different dividend and volatility, same rating. |
| design-1-5 | Major | The rule leans toward Sell, and the mix is unchecked | §7: make the rule symmetric. Buy = value gap above the band **and** score ≥ 60th percentile. Sell = value gap below −band **and** score ≤ 40th percentile. Hold = everything else. Add a target mix (Buy 20–40%, Sell 15–35% of covered companies) to the rating-bands file. Before the first official prediction, run the code-only rating on at least 2 full sectors, adjust the bands, and record the mix. |
| design-1-6 | Major | The benchmark includes the company, is weighted differently for rating and grading, and is underdefined | §7: the peer benchmark **excludes the company** and is **equal-weighted** for both rating and grading. The peer list and weights are fixed when the prediction is made. Dividends are reinvested. A peer that is bought out or delisted is held at its last price as cash. Weights are stored with the prediction. |
| design-1-7 | Major | Grading rules are missing | §10: add a Grading rules table. **Start price:** the first daily close after both the run time and the latest filing's acceptance time. **Headline counting:** one prediction per company per 12 months in headline statistics; others are shown as repeats. **Hold hit:** excess return within ±band. **Probability:** capped at 25–75%, with Brier scored against the base-rate baseline. **"Enough":** results stay "descriptive" until 200 headline predictions are graded at 12 months; confidence intervals are always shown. The grading rules go in a `grading.yaml` file in the methodology bundle. |
| design-1-8 | Major | Range grading rewards width and is flattered at 3 and 6 months | §10: grade coverage, tail balance and the interval score. At 3 and 6 months, shrink the range by √(months/12). Baseline range: centered on today's price, using the stock's own past-year volatility, with no value-gap shift. |
| style-1-4 | Major | Nothing ties the range to the base case | §7: "Bear and bull are the 10th and 90th percentiles of a price distribution whose median is the base case; its spread comes from the volatility forecast." |
| style-1-3 | Major | The plain meaning of the rating doesn't match its rule | Rewrite the decisions-table wording and the printed definition to match the §7 rule exactly, including the score condition and red-flag caps. |
| style-1-6 | Major | The official-prediction rule is incomplete | The first run that **produces a rating** starts a rolling 30-day window for that company. Later runs in the window save a report and a run record, but no prediction. Failed runs, and runs with the rating withheld, don't use up the slot. |
| design-1-10 | Major | Replay breaks after an engine update, and the methodology hash misses code changes | Goal 2 and §6: "recomputed by the engine version that made it." Add a separate **method code version**, bumped whenever number-making code changes. It is logged with each prediction, and grades are grouped by it. On each release, replay the stored test runs and list changed numbers. |
| S5-7 | Major | The anti-flip-flop buffer depends on history that replay doesn't capture | §6 and §7: each prediction stores the previous official rating it buffered against, and replay reads that value. |

## Proposed fixes: correctness of numbers and sections

| ID | Sev. | Issue | Proposed edit |
| :-- | :-- | :-- | :-- |
| design-1-11 | Major | Market value is wrong by the split factor after a split | §5: share counts and per-share filing values are adjusted for every split between their date and the price date, using the stored splits. Add a company that split to the golden set. |
| design-1-12 | Major | The number check deletes normal sentences and misses spelled-out numbers | §11: allow digits inside an engine-supplied name list (company, product and form names, such as "S&P 500", "3M", "10-K", "Item 1A"). Accept four-digit years only in year context. Reject number words ("doubled", "a third", "twenty") unless placeholdered. Add 3M to the golden set. |
| design-1-13 | Major | Red flags are undefined, and a keyword search misfires | §7: code rules. **Going concern:** only when the auditor's report states "substantial doubt" and it isn't negated. **Material weakness:** only when management concludes controls were "not effective". **Restatement:** 8-K Item 4.02. AI labels are display-only. Add golden test cases, including negated mentions. |
| design-1-14 | Major | The citation check would empty the industry-trends section | §11: citations may also point to this run's peer filings. |
| S6-5, S5-6 | Major | The step order doesn't supply what steps need | §3: move the text layer (section split plus year-over-year comparison) to before Metrics. State that the risk-factor-change flag is a red flag that caps the rating. |
| S6-10 | Major | How dates and analyst changes from news become numbers is undefined | §9 and §11: the AI may return a date or price target only as a **verbatim quote with a paragraph ID**. Code checks that the quote appears in that paragraph, parses the value, and only then makes it a placeholder. "Risks to watch" is text, not a placeholder. |
| S6-11, S5-18 | Major / Nit | No S&P 500 source, too little history | §5: the S&P 500 is measured by the SPY ETF's total return (from Massive). Momentum scaling uses SPY's 12-month return and its 1-month volatility against its own 2-year history, which fits Massive's free 2 years. The first fetch covers 14 months, because momentum needs 13. Grading fetches later prices for each prediction's fixed peer list when the app opens. |
| S6-3 | Major | The discount-rate rule is stated two ways | §8: use the fixed volatility cut-offs (<20% → 7.5%, 20–28% → 9%, 28–40% → 11%, >40% → 13.5%). Remove the quartile wording. |
| S6-4, S5-4 | Major | "Sector benchmark" has two meanings; peer valuation is a hidden cost | §7: name the two quantities: **peer expected value gap** (used to rate; needs every peer valued) and **peer actual return** (used to grade). §3 step 6 says peers are valued too. Add a peer cap of the 40 largest peers, a time measurement in Phase 0, and a note in the decisions table. |
| design-1-26 | Nit | DCF guardrails are missing | §8: growth floor of −10% a year; the discount rate must exceed terminal growth by at least 3 points; count lease reinvestment. |
| design-1-22 | Nit | Share classes have different prices | §5: key prices by company **and share class**. |

## Proposed fixes: security

| ID | Sev. | Issue | Proposed edit |
| :-- | :-- | :-- | :-- |
| design-1-1 | Major | The lock-down is a goal, not a method | §4: state the method per tool. **Claude Code:** tools hidden from the model (empty allowed-tools list), user settings not loaded (`settingSources: []`), the subscription login passed explicitly, and the environment built from a short allowlist. **Codex:** an approval policy that asks for every command, all requests denied, and any command or file event in its stream treated as a failure. Exact option names are confirmed in Phase 0. The day-one test also checks that no user hooks, tool servers or instruction files load, that the login is the subscription, and that a planted "read ~/.ssh" leaves no file contents in the answer. Store each tool's last-checked version; when it changes, re-run a short lock-down check and block AI steps until it passes. |
| design-1-2 | Major | The report window shows untrusted text unsafely | §12: escape all AI and source text and clean any Markdown. Strict content-security policy. Electron context isolation and sandbox on, no Node in the window, a bridge with named commands only. Outside links open in the normal browser, and in-app navigation is blocked. Add a test with HTML and a `javascript:` link in the AI output. |
| design-1-3 | Major | Planted article text can steer the report; the allowlist is checked on the wrong address | §9: article text goes only to the news section's AI calls. Source text is wrapped in markers, with an instruction that text inside them is data. Code drops paragraphs with instruction-like phrases, with a visible note. The allowlist is checked after every redirect and on the final address: exact site match, https only, no home-network addresses, size and time caps. Allowlist entries may name a section of a site. Code reads the publication date from the page. Add a test where a planted article tries to change content. |
| S5-11 | Major | The fallback for a failed lock-down won't help | §4: the first fallback is calling the `claude` program directly from Python in non-interactive JSON mode, with tools and settings switched off. If the program itself can't be locked down, that call goes to the other tool. The TypeScript helper is removed. |
| design-1-24 | Nit | The outgoing-data list is incomplete | Merged into the new **outside services table** (S6-6): both AI vendors, the computed numbers sent with text, the list of tickers researched going to Massive and Alpha Vantage, and AI tools' own session history (to check in Phase 0). |
| design-1-21 | Nit | Only the program paths are passed to the engine | §2: also pass the corrected PATH. |
| design-1-20 | Nit | Library output can corrupt the message channel | §2: standard output carries messages only; everything else goes to the error stream. |

## Proposed fixes: running the app

| ID | Sev. | Issue | Proposed edit |
| :-- | :-- | :-- | :-- |
| design-1-15 | Major | No handling for usage limits, expired sign-in or hangs | §3: add a failure table covering usage limit (with reset time), sign-in expired, temporary error, bad format, and tool attempt, with what the app shows and does for each. **The official prediction is saved as soon as step 7 (code-only rating) finishes.** If a later AI step fails, the report is marked "narrative incomplete". Each step's output is saved so a run can resume. Every call has a time limit. The app never switches to API billing without asking. One run at a time. |
| design-1-16 | Major | AI usage is never estimated, and no model is chosen | §3 and §4: expected calls per run are about 30–45 for a first run and 20–35 for a repeat. A per-run call budget, with cuts in order: fewer articles, then no rewrites. Model per step: the smaller model for extraction, the larger for writing and the skeptic, logged. Saved evidence is keyed on the chosen extraction model, and there is a "re-read this filing" action. State how many calls run in parallel (3). Speed targets are labelled as goals to measure, and one full repeat report is timed in Phase 0. Correct A11's wording; the A2 cost is refreshed after Phase 0. |
| design-1-17 | Major | News yield is assumed | Phase 0: measure links suggested, the share on the allowlist and the share saved with a date (pass: 5 or more readable articles per ticker). Add the company's own 8-K press releases as a source. Section 7 says when few articles were readable. |
| design-1-18 | Major | Raw-data growth and the cap are undefined | §6: measure bytes per run in Phase 0. At the cap, inputs for unofficial runs may be pruned (Goal 2 is amended to say so); inputs for official predictions never are. Compress stored files. Show the folder size in settings. |
| design-1-19 | Major | The log has one copy and no tamper check | §6: automatic backup after each official prediction and grading, to a folder the user picks (SQLite online backup). It includes each prediction's peer prices. Add a fingerprint chain across prediction rows, checked when the app opens. |
| structural-1-1 | Major | There is no Risks and Mitigations section | Add a **Risks and Mitigations** table: risk, effect, how it is noticed, handling, status. It covers Massive as the only source, the S&P list file, ticker changes, AI tool updates, terms rulings even for personal use, usage limits, disk growth, and the five risks from `concepts_brief.md` marked "accepted by Liam". **Second price source:** Alpha Vantage's free daily series as a fallback for the rated company and SPY, tested in Phase 0. Each price row records its source. Check the S&P list file (about 500 rows, every one matched to a company) and keep a dated ticker history. |
| S6-6 | Major | Keys and outside services differ by section | Add one **outside services** table: service, key needed, free or paid, what is sent. CUJ 1, Goal 6, Goal 7, the requirements and the README all point to it. |
| S6-7, style-1-5 | Major | The terms question is unexplained, and the wording is overconfident | Add a "Terms" paragraph. Anthropic's Agent SDK docs bar third-party products from offering claude.ai login or routing users' plan usage without approval; using your own signed-in Claude Code is ordinary use. The Phase 3 button needs approval, and the build happens only **if Anthropic approves**. OpenAI is unchecked. Line 11 becomes "Planned as… a public download waits on these checks." Fix the "gray area" and "clearly within" wording, and the name-risk sentence. |
| S6-8 | Major | The check flow is incomplete | §11: add a decision flow. The numeric guard and citation check fail → removed. Every remaining claim goes to the skeptic, which marks claims "unsupported" (removed) or "tone" (rewritten). A section fails when more than 30% of its claims are removed, and is then rewritten once. A claim is one sentence. |
| S6-9, S5-10 | Major | Which checks run in which phase | Add a phase table. **Phase 1:** numeric guard, citation check and the same-tool skeptic. **Phase 2:** other-tool skeptic and grading built. Describe Liam's citation spot-check task (item 54). |

## Proposed fixes: document structure and clarity

| ID | Sev. | Issue | Proposed edit |
| :-- | :-- | :-- | :-- |
| structural-1-2 | Major | Drafter choices have no alternatives | Add short alternatives for: unadjusted vs adjusted prices; the S&P list source (bundled list as main source, or Wikipedia's list); the official-prediction rule ("every run counts", or "first run ever"); combining methods by median (mean, or a fixed primary method); volatility buckets vs beta; the Agent SDK vs calling `claude` directly. |
| structural-1-3 | Major | Method numbers sit in the implementation plan | Move the method rows (weights, bands, buffer, volatility, range, probability, peer rules, earnings date, analyst default) into the Technical Plan's decisions table or §7/§8. Only tooling stays in the implementation plan. |
| structural-1-4 | Major | Repeated rules disagree | State the lock-down rule once in §4, including the news-search exception. §12 becomes a pointer to the requirements. One statement each for the disk-cap warning and database upgrades. Remove the "Proposed solution" list under The Problem. |
| style-1-1 | Major | Goal 1 can't be scored | Use the reviewer's rewrites: "flag" for the action and "confirmed error" for the result; a number counts as wrong against the cited source or the report's own definition. In the first 3 reports Liam opens every citation, then 5 per report. After each report he records yes or no to "better than my usual sources". Pass: zero confirmed errors, zero failed citations, "yes" on at least 75% of reports. Minimum of 10 reports across at least 4 sectors, including a bank or REIT. On failure, fix the causes and repeat the test. *(The numbers are drafter defaults; change them if you like.)* |
| style-1-2 | Major | The "ends with" block isn't in the outline | Add a **"What to watch"** block (what would change the rating, next dated events, risks to watch), always shown before Methodology. |
| S6-2, S5-21 | Major / Nit | Open Questions lists settled items | Remove the settled items. Only analyst ratings, the name check, the terms answers, the report look and the Phase 0 measurements stay. |
| S6-12 | Nit | The factor score is barely described | §7: name the six factors and weights, and say that the composite score is re-ranked as a percentile within the peer group. |
| S6-13 | Nit | Phases are used before they are defined | Add a short roadmap at the top of the Technical Plan: one line per phase, plus the four Phase 0 assumptions. |
| S6-14, S6-15 | Nit | Undefined names and finance terms | Add short first-use definitions and a **Glossary** (CIK, XBRL, accession number, SIC, GICS, MD&A, Exhibit 13, 10-K items, 8-K items, Form 4, FFO, FINRA 2241, Massive, Realm, ACP, EGM). |
| S6-16, design-1-27 | Nit | Problem statistics are uncited and overstated | Cite the matching sections of the research reports. Reword the ceiling as "an estimated ceiling for up/down calls on large US stocks; not measured for sector-relative calls". Use exact figures and split line 46. |
| S6-17 | Nit | CUJ 5 doesn't say what survives missing prices | List which sections stay. The score's momentum and valuation factors are withheld, and the fundamentals-only factors are shown. |
| S6-18 | Nit | Small list mismatches | Align the methodology file list, define "negative cash flow", fix "several minutes", clarify Goal 8's wording, and state how news search works on Codex. |
| design-1-23 | Nit | Article text: shown or not? | A citation shows the cited paragraph as a short quote and links to the original page. |
| design-1-25 | Nit | Removals could tilt reports upbeat | Log removals by positive or negative direction, and show the split in the checks box. |
| design-1-28 | Nit | A weak reason in A6 | Restate A6's reasons: auto-update and reuse of Realm's code. |
| structural-1-5 | Nit | Wrong source sentence in Alternatives | Delete the sentence and add a "Source" line to each alternative. |
| structural-1-8 | Nit | Analyst choice in three places | Keep it only in Open Questions; remove A27 and the future-improvement line. |
| structural-1-9 | Nit | Non-Goals mix "never" and "not yet" | Split Non-Goals into "Never" and "Not in the first version". Add the public track record to Future Improvements. |
| structural-1-10 | Nit | Five decision markers | One Status column ("Liam, date" or "Drafter default"). Define "Drafter". Fix A3's reason. |
| structural-1-11 | Nit | Imprecise cross-references | Electron cited to Liam's answer #3 in `concepts_brief.md`. Use "Technical Plan §n". |
| style-1-7 | Nit | Undefined trimming and "older major events" | Trimming drops the top and bottom 10%. "Older major events" is defined as 8-K items 1.01, 2.01, 4.02 or 5.02 within 12 months. State the buffer and SEC numbers where they are used. |
| style-1-8 | Nit | Unsourced claims about banks and "most people" | Cite the research report sections; note Morgan Stanley's 12–18-month horizon; delete the claims that can't be sourced. |
| style-1-10 | Nit | "Free" stated absolutely | Keep it only in Goal 6, with the exception for the paid analyst option. |
| style-1-13 | Nit | "Flag" means four things | Use four terms: red flag (caps the rating), uncertainty trigger, insider-buying note, reader flag. |
| style-1-14 | Nit | "Never" with exceptions | "Chart-pattern technical analysis" (momentum is a scored factor). The news search returns links only. |

## Proposed fixes to the implementation plan (applied Nov 2)

| ID | Sev. | Issue | Proposed edit |
| :-- | :-- | :-- | :-- |
| S5-1 | Blocker | The Phase 0 SEC and usage tests need Phase 1 code; the usage test has no pass mark | Move the minimal SEC fetch, raw store and extract call into Phase 0, or run the SEC and usage tests at the start of Phase 1. Give the usage test a pass mark: a report fits in one 5-hour plan window on Pro. |
| S5-2 | Major | The Goal 1 month waits for the app | Start the Goal 1 test once `tearsheet-engine run` writes the HTML report, with a `flag` command. The app window comes after. |
| S5-3 | Major | The first complete report appears late | Reorder Phase 1 as a thin end-to-end slice first, then deepen. |
| S5-5 | Major | Two SEC download paths | One SEC client; edgartools reads from the raw store. |
| S5-8 | Major | The methodology hash covers files that can't change a prediction | Hash only the files that affect numbers (weights, bands, valuation, peers, grading). The allowlist and aliases are versioned separately. |
| S5-12 | Major | Tool detection built twice | Electron owns detection. In terminal mode the engine looks the tool up on PATH. Remove `list_tools` from the engine. |
| S5-13 | Major | Messages have no request/response | Use JSON-RPC 2.0 over lines. The handshake becomes a logged version line. |
| S5-14 | Nit | Built for needs that don't exist yet | Trim speculative interfaces; give the analyst view its place in section 1. |
| S5-15 | Nit | Code-level detail; Phase 3 specified early | Shorten Phase 3 items to outlines. |
| S5-16 | Nit | Homemade migration table | Use SQLite's `user_version`. |
| S5-17 | Nit | Content stored twice | Store report sections once; the HTML is generated from them. |
| S5-19 | Nit | Three years of Form 4 for a displayed note | The insider note needs only 3 years for the routine test; fetch it once and cache it. Keep it. |
| S5-20 | Nit | "Industry" means a broad sector | Rename "industry trends" to "sector and industry trends" and note that the groups are broad. |

## Recorded, not fixed (DECLINE)

| ID | Sev. | Issue | Reason |
| :-- | :-- | :-- | :-- |
| structural-1-6 | Nit | Headings sit under the requirements section | Fixed anyway as part of the restructure. No separate edit. |
| structural-1-7 | Nit | Path base and the Realm link | Covered by the glossary and resources clean-up. |
| structural-1-12 | Nit | Diagram alignment | The diagram is redrawn once the outside services table exists; not edited separately. |
| structural-1-13 | Nit | Bullet and numbering formatting | Cosmetic. |
| style-1-9 | Nit | Persuasive wording | Applied where the restructure touches the text; otherwise left as is. |
| style-1-11 | Nit | "App" vs "engine", "Liam" vs "user" | Applied where the restructure touches the text. |
| style-1-12 | Nit | Same idea, different names | Partly covered by style-1-13 and the glossary. |
| style-1-15 | Nit | Hedges and filler | Cosmetic. |
| S5-15 (part) | Nit | Phase 3 detail | Handled at Stage 9. |
| design-1-27 (part) | Nit | Vague adjectives | Covered by S6-16's rewrite. |
| S6-14 (part) | Nit | "Pro and Max" | Covered by the glossary. |
