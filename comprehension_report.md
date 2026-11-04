# Comprehension Test Report (Stage 6)

**Target:** `docs/designs/tearsheet.md`. FeatureRange: lines 1–695. DetailedRange: lines 696–1373.
**Reviewer:** `egm-comprehension`. Status: completed. No document standard was applied.
**Result:** every section could be paraphrased, so there are no Blockers. Findings: 11 Major and 7 Nits.

## What this proposes

Tearsheet is a free, open-source Mac app, built mainly for Liam. You type the name or ticker of an S&P 500 company and get a fresh nine-section research report, which is saved on your computer.

- **Code makes every number.** A Python program inside the app gathers free public data: SEC filings, daily prices from a provider called Massive, and economic series from FRED. From that it computes the metrics, a factor score ranked against sector peers, three valuations, a 12-month price range, and a Buy/Hold/Sell rating judged against the company's sector.
- **The user's AI does the reading and writing.** The user's own signed-in Claude Code or Codex reads the filings and approved news pages. It writes the prose with placeholders where numbers go.
- **Every claim is checked.** Code fills in the numbers and rejects any other digits. Each claim then goes through a citation check, an outside service called Jev, and a second "skeptic" AI pass. Claims that fail are removed with a visible note.
- **Ratings are graded later.** The first report per company in each 30-day window is logged as a prediction. It is graded on the user's Mac at 3, 6 and 12 months against simple baselines.
- **The build is in stages.** Phase 0 is feasibility tests, Phase 1 the report from the terminal and then a plain window, Phase 2 stronger checking and grading, and Phase 3 a signed download for non-technical users.

## How the existing system works, per this document

There is no existing Tearsheet software. Every file in the plan is new, so this is a fresh build.

What exists today is Liam's manual routine: reading long SEC filings, pulling prices, comparing peers and scanning news by hand. None of it is checked, and nothing ties a claim back to its source. The document describes the ready-made alternatives (bank research, commercial rating products, AI chat) as too optimistic, weak, or unreliable on numbers.

The design builds on three things that already exist:
- the user's installed and signed-in Claude Code or Codex subscription;
- open-source code from a project called Realm, for finding those tools and signing in to them;
- earlier concept briefs, which proposed a hosted web app that was later rejected.

---

## Findings

### Major

**1. Jev is never explained**
- **Scope:** Goal 6, line 91 (first mention); also lines 120, 188, 217, 415, 1133–1137.
- **Problem:** Jev is one of the three checking layers and is named in a goal. Claim text and source paragraphs are sent to it. Yet the document never says what it is. A reader has to piece together §11 and item 38 to learn that it is an outside service that takes a claim plus its source paragraphs and answers "supported / contradicted / insufficient evidence" with a confidence. Nothing says who runs it, whether it costs money, where its documentation is, or what happens to the data sent to it.
- **Recommendation:** At line 91, add one sentence and a link: what Jev is, who provides it, its cost, and what it returns.

**2. Open Questions lists items the document has already decided**
- **Scope:** Open Questions lines 114–120, compared with the decisions table at lines 182–193.
- **Problem:** Seven items are listed as open but are settled a few lines later: who runs the report, the S&P 500 list source, what the rating means, how news is read, the valuation methods, peer trends, and Jev. They even conflict. Line 120 asks whether Jev is "optional (the proposed default) or required", while line 188 says it is "used whenever a key is set". A new reader cannot tell what is actually still open.
- **Recommendation:** Remove the settled items from Open Questions, or mark them "Settled, see the decisions table". Leave only the questions that are really open.

**3. The discount-rate rule is stated two different ways**
- **Scope:** §8 Discount rate, line 355; "Cost-of-equity bucket" default, line 712.
- **Problem:**
  - §8 picks the discount-rate bucket from where the company's volatility falls among all S&P 500 stocks (by quartile).
  - The defaults table instead uses fixed cut-offs (below 20%, 20–28%, and so on) "so no market-wide data is needed".
  - The table also introduces itself as covering things "not decided earlier", but this was decided earlier.

  The two rules give different discount rates, so different valuations.
- **Recommendation:** Pick one rule, update §8 to match, and note that the default replaces the §8 wording.

**4. "Sector benchmark" means two different things**
- **Scope:** §7 lines 335–337; default at line 715; rating.py line 1045; predictions.py line 1159; §3 step 6, line 254.
- **Problem:**
  - §7 defines the sector benchmark as the peers' actual return, weighted by company size. Grading uses this.
  - The Buy/Sell rule instead compares against the "sector benchmark's expected return". That is only defined in the implementation defaults: the middle (median) forecast across peers. Producing it means running all three valuation methods on every peer (20 to 70 companies) on every run.

  So ratings are set against one yardstick and graded against another, and the document never says so. Step 6 also describes valuing only the company, not its peers.
- **Recommendation:** In §7, give the two quantities different names (for example "peer expected return" for rating and "peer actual return" for grading) and say how each is calculated. Update step 6 to say that peers are valued too.

**5. The step order does not supply what the steps need**
- **Scope:** §3 steps 4, 7 and 8 (lines 252–256); §7 red-flag caps, line 341; flags.py, lines 1034–1038; text/parse.py, line 1054.
- **Problem:**
  - The rating (step 7) caps the rating for a material weakness or going-concern language, and flags.py adds a fourth flag based on how much the risk-factor text changed since last year. Finding any of these requires splitting the filings into sections and comparing them with last year's. That only happens at step 8.
  - Step 4 also lists "filing-text change scores" before any text has been parsed.
  - §7 lists only three red-flag caps, so a reader cannot tell whether the fourth flag also caps the rating.
- **Recommendation:** Move the text step before metrics and rating, or say which part of it runs early. In §7, say whether the risk-factor change flag caps the rating.

**6. The required keys and outside services differ from section to section**
- **Scope:** Goal 6 (lines 88–91), CUJ 1 (lines 132–134), the diagram (lines 216–220), the security and privacy requirements (lines 660–666), config.py (line 757), fred.py (line 956), analyst.py (line 963), membership.py (line 934), README (line 1339).
- **Problem:**
  - CUJ 1 promises a Massive key and "no extra setup". But fred.py needs a free FRED key, and the default analyst source, Alpha Vantage, needs its own key.
  - The diagram says Alpha Vantage is used "only if the free analyst option is chosen", yet the defaults choose it.
  - The security section's list of stored keys leaves out FRED, and the README leaves out Alpha Vantage.
  - The "nothing leaves the Mac except" list leaves out Alpha Vantage and the daily download of the fund holdings file used to get the S&P 500 member list.

  A reader cannot tell what a first-time user must set up or what data leaves the Mac. Goal 7 promises that every report states exactly the second of these.
- **Recommendation:** Add one table of every outside service, showing whether it needs a key, whether it is free, and what is sent to it. Point CUJ 1, Goal 6, the requirements section and the README at that table.

**7. The "Anthropic's approval" and terms question is never explained**
- **Scope:** Open Questions line 124; CUJ 6 lines 173–174; A2 line 458; A26 line 638; item 55 line 1308.
- **Problem:** The document says Anthropic must approve before the install-and-sign-in button ships, and mentions a "gray area in Anthropic's terms about subscription logins". It never says:
  - what the gray area is;
  - what has been or will be asked, and of whom;
  - whether Liam's own use in Phases 0–2 is affected.

  The whole "free to use" idea rests on running Claude Code on the user's subscription from another program. So a reader cannot tell whether the core plan is at risk, or only the Phase 3 button. "OpenAI's terms must be checked" has the same gap.
- **Recommendation:** Add a short paragraph naming the specific terms question, the request being made, and what happens to the plan under each possible answer, including personal use.

**8. How the checking step decides is incomplete**
- **Scope:** §3 step 13 (line 261); §11 (lines 408–422); the Jev row of the decisions table (line 188); item 38 (lines 1126–1141); schemas (lines 823–825).
- **Problem:** Step 13 reads as three checks run in turn on every claim. §11 instead says only claims below Jev's threshold go to the skeptic. None of these are stated:
  - what happens when Jev says "contradicted": is the claim removed at once, or sent to the skeptic?
  - what the skeptic's verdict looks like, and how it removes a claim. Its findings are about tone (for example, optimism), not truth.
  - what makes a whole section "fail" and get rewritten, as opposed to one claim being removed.
  - what "the AI tool checks claims" means when there is no Jev key.
  - whether a "claim" is the same as a "sentence". The schemas use sentence IDs; the database uses claim IDs.
- **Recommendation:** Add a short decision flow covering each check's possible outcomes and the action each one triggers. Define "failing section" and "claim".

**9. The phase plan contradicts the decision on when Jev and the cross-tool skeptic run**
- **Scope:** A24 (lines 622–626); the Jev row of the decisions table (line 188); Phase 2 items 53–54 (lines 1285–1293); the Goal 1 test (line 1369).
- **Problem:**
  - A24 rejects "Jev and claim labelling later" and says Jev runs whenever a key is set.
  - Phase 2 then says to "turn on Jev" and "turn on the other-tool skeptic", which implies both are off in Phase 1.
  - The one-month usefulness test runs after Phase 1.

  So a reader cannot tell which checks run during the usefulness test, or what Jev's threshold is before it is tuned. The "300 hand-labelled claims" also appear without saying where they come from, when Liam labels them, or what the labels are.
- **Recommendation:** State which checks are on in each phase. Give the Phase 1 Jev setting. Describe the labelling task.

**10. It is unclear how dates and analyst changes found in news reach the report, given the rule that AI never supplies numbers**
- **Scope:** "Next earnings date" and "Analyst ratings" defaults (lines 721–722); Open Questions line 112; §4 rule at line 272; the digit check at lines 410–413; narrate.md at line 1094.
- **Problem:** Goal 1 requires every report to end with upcoming dated events. The next earnings date is "replaced when the news scan finds an announced date", and upgrades and downgrades "come from the news scan". But the AI is never asked for numbers, and code fills placeholders only from computed values. The document never says how a date or price target found in an article becomes a value code can fill: code parsing the article, an AI quote that code verifies, or something else. narrate.md also says "risks to watch" are placeholders, though risks are text.
- **Recommendation:** Describe this path step by step: who pulls out the date or target, how it is checked, and how it becomes a fillable value.

**11. S&P 500 index data and the longer price history have no stated source**
- **Scope:** "Momentum scaling" default (line 717); §10 grading (lines 394, 399); CUJ 4 (line 156); §5 (line 288); Open Questions on Massive (line 121); the momentum metric (line 996).
- **Problem:**
  - Momentum scaling needs the S&P 500's 12-month return and a comparison of its recent volatility against the past 10 years. Grading also compares against the S&P 500. No source for the index's level is named: Massive is described only for stock prices, the FRED list does not include the index, and Massive's free plan has 2 years of history, not 10.
  - Momentum ("12-month return excluding the latest month") needs about 13 months of prices, but the first run fetches 12.
  - Grading needs peers' later prices, and nothing says how those are fetched if Liam has not run a report in that sector since.
- **Recommendation:** Name the source for the index level, state how much history each calculation needs, and explain how grading gets later peer prices.

### Nits

**12. The factor score is barely described in the Technical Plan**
- **Scope:** Lines 253, 336–337, 1008–1010, 1045.
- **Problem:** The six factors and their weights first appear at line 716. The overall score is an average of percentile ranks, yet the rating rule compares "the score" with the 60th and 25th percentile of its sector. It is not said whether the score is ranked again among peers.
- **Recommendation:** Name the factors in §3 or §7, and say how the score becomes a percentile.

**13. Phases are used long before they are defined**
- **Scope:** Lines 122–123, 223, 275–280, 433, 640, 727, 840.
- **Problem:**
  - Phase 0, 1 and 3 appear throughout the first half. The phases are only defined by headings in the implementation plan and by a pointer to docs/brief.md §13.
  - "First version", "v1" and "day one" are not tied to a phase.
  - The same test is called "day-one test", "lock-down test" and `phase0 lockdown`.
  - Phase 0's "four assumptions" are never stated.
  - "5 golden tickers" appears before the 20-ticker golden test set is introduced.
- **Recommendation:** Add a short roadmap to the Technical Plan, with one line per phase, and list the four assumptions.

**14. Project-specific names are undefined at first use**
- **Scope:** Lines 90, 102, 122, 183, 438, 442, 446, 481, 688, 813, 1373.
- **Problem:** These names are never explained or linked where they first appear:
  - Massive (never said to be a market-data company);
  - Finava;
  - Realm (only explained at line 681);
  - "the Goldfish review" and "EGM";
  - "ACP";
  - "the guide's protocol notes";
  - "brief §1" and "brief v3/v4";
  - "Pro and Max plans".
- **Recommendation:** Add a short definition or link at each first use.

**15. Finance and SEC vocabulary is assumed**
- **Scope:** Throughout.
- **Problem:** The document assumes the reader knows terms such as CIK, XBRL, accession number, SIC, GICS, MD&A, Exhibit 13, 10-K Items 1A/3/7/7A/9A, 8-K Items 2.02/4.02, Form 4, FFO and FINRA Rule 2241. These are not project-specific, but several of them drive database keys and rules, and a software newcomer will stall on them.
- **Recommendation:** Add a short glossary.

**16. The Problem section's statistics have no sources**
- **Scope:** Lines 46–50.
- **Problem:** The figures (38%, 15 points, 56%, "under 5%", 55–57%, "one live after-fee record", "the best model on a strict benchmark") have no citations. That is odd for an app whose premise is that every claim is cited.
- **Recommendation:** Cite the studies, or the matching sections of the reports/ files.

**17. CUJ 5 does not say which sections survive missing prices**
- **Scope:** Lines 166, 291, 1150.
- **Problem:** The score (momentum and valuation measures), the valuation section, and the peer comparison all use prices.
- **Recommendation:** List which of the nine sections still appear, and say whether the score is also withheld.

**18. Small mismatches between lists**
- **Scope:** Lines 290, 319–325, 333, 845, 901–913, 1038, 1135; Goal 8 at line 93; items 8 and 33 (lines 805–817 and 1071).
- **Problem:**
  - Settings files: §6 lists six methodology files, while item 14 adds aliases.yaml and fred.yaml. bands.yaml also holds the Jev and risk-change thresholds, which §6 does not say.
  - Undefined condition: the "negative cash flow" condition that raises uncertainty (line 333) is not defined.
  - Timing: "several minutes" for fetching a new sector's prices (line 290) sits oddly next to the 20-minute target (line 845).
  - Unclear wording: Goal 8's "These records cannot be added after logging starts" is unclear.
  - News search on Codex: only the Claude Code connector says how web search is turned on for the news step, so a reader cannot tell whether a user with only Codex gets a news section.
- **Recommendation:** Align the lists and add one clarifying clause to each of these.
