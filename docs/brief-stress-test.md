# Stress test of brief v3

* **Source:** `docs/brief.md` (Concept Brief v3, Oct 30, 2026)
* **Date:** 2026-10-30
* **Scope:** every **[proposed]** item and every **(new in v3)** fix. **[decided]** items are treated as fixed and not argued. Untagged items (for example the §2 user flow) are only discussed where they collide with something tagged.
* **Status:** pre-Goldfish. This is the main-context critique. The Goldfish review runs after the §16 questions are worked through and the hypothesis is confirmed.

---

## 0. Facts checked against current sources

| Claim in the brief | Check | Result |
| :-- | :-- | :-- |
| Haiku 5.5 price rises 5× above 100K tokens (§5) | Anthropic model table: $0.10 / $0.50 per M tokens for prompts up to 100K, $0.50 / $2.50 above | Holds. One addition: Haiku 5.5's tokenizer counts the same text as about 30% more tokens than older models, so size the windows with the token-counting endpoint, not by characters or old token counts. |
| Prompt caches last minutes (§5 correction) | Default lifetime 5 minutes (write costs 1.25× input), optional 1 hour (write costs 2×), reads cost 0.1× | Holds. The 1-hour option exists but does not change the conclusion: the ticker-day report cache (or the design in §1 below) is what shares cost across users. |
| ~$0.30–0.40 per fresh report (§14) | Sonnet 5.5 is $2 / $10 per M tokens, cache reads $0.20; Batch API is 50% off | Plausible but the range is too narrow. Sonnet 5.5 thinks by default at effort `high`, and thinking tokens are billed as output at $10/M. Re-derived: narrative $0.18–0.33, skeptic $0.05–0.12, Haiku extraction ~$0.03, so **$0.27–0.50**, before any section regeneration. Thinking tokens are the swing factor: set `effort` explicitly and measure it in Phase 1. |
| 38% of 2000–2009 analyst targets met (§3) | Bradshaw, Brown & Huang (2013), *Review of Accounting Studies* | Holds as I recall the paper: 38% met **at the end** of 12 months, about 64% met **at some point during** the 12 months. Verify against the paper before publishing it, and grade your own targets with the same definition you quote. |
| Factor edges shrink 30–60% after publication (§8) | McLean & Pontiff (2016), *Journal of Finance* | Roughly holds: returns were about 26% lower out-of-sample and about 58% lower after publication. Quote the two numbers rather than a blended range. |

---

## 1. The largest problem: the cost model does not fit the design

This is the finding that changes the most, so it comes first.

**What is wrong.**

1. **Per-user limits do not cap spend.** Spend is capped only by the number of *fresh* reports per day. With $200/month, that is about $6.67/day, or **about 13–24 fresh reports per day** at $0.27–0.50 each. Five hundred different tickers requested on one day would cost $135–250, the whole month's budget. A per-user limit does not stop this: anyone can open more accounts.
2. **The budget guard (new in v3) has no reliable input.** "If API credits are nearly used up" assumes the app can ask how much credit is left. Do not depend on that. Meter spend yourself: the `runs` table already logs tokens per call, so multiply by a pinned price table and stop at a self-set daily and monthly cap.
3. **Phase 4 is not affordable.** Overnight Batch pre-generation of all 500 reports at 50% off is about 500 × $0.20 ≈ **$100 per night, roughly $3,000 per month**, fifteen times the budget.
4. **The golden-set regression run spends the same $200.** One run over 50 tickers costs $14–25. Ten prompt iterations in a month would use most of the budget before any user arrives.

**Counter-proposal: split the report into a nightly numbers layer and a filing-driven text layer.**

* **Numbers layer (code only, free):** every night, for all ~500 companies, recompute metrics, percentiles, valuation, rating, and market context. No LLM.
* **Text layer (LLM):** regenerate the written sections for a company only when a new 10-K, 10-Q, or earnings 8-K arrives. Run these as overnight Batch jobs at 50% off.
* **Render:** a report page = the latest verified text for that company + that night's numbers, filled through the `{{metric:…}}` placeholders the brief already has.

**Rough cost.** About 500 companies × 8 triggering filings a year (one 10-K, three 10-Qs, four earnings 8-Ks). If a 10-K or 10-Q regenerates the full text (~$0.18 in batch) and an earnings 8-K regenerates only the results section (~$0.07), the average is about **$40/month**. The peak month of earnings season is about **$90**. The one-time backfill of 500 reports is about **$90**. All of this fits under $200 with room for development and evals.

**What this removes.** The progress screen, the user-triggered job queue, the per-user generation limit, and the race between a budget guard and users. Every covered company has a report every day, so no user ever waits. The track record can include all 500 companies (see §9 below). It also arguably fits the publisher model better: reports go out on a regular schedule, not on request (see §15 below; a question for the lawyer, not a conclusion).

**Strongest counter-arguments, and how they would be handled.**

* *The text goes stale between filings.* The text sections are about the business, risks, and the last reported quarter, and those only change when a filing does. Anything that moves daily (price, rating, relative strength, rates) lives in the numbers layer.
* *The text could contradict a rating that changed overnight.* So the text layer must not take a position on the stock. The rating explanation becomes code-generated template text ("trades at {{discount}} below the base value; uncertainty is {{level}}"). The skeptic check "tone that contradicts the rating" becomes "the narrative takes no valuation stance."
* *Big events between filings (CEO leaves, restatement).* Detect them from 8-K item codes, which is code-only (see §5). Decide whether they trigger a partial regeneration or only an event flag in the report. This is §16 Q1.
* *Earnings 8-K numbers are not in XBRL.* Between the earnings release and the 10-Q (one to four weeks), the narrative could describe a quarter that the metrics do not show yet. This problem already exists in the brief's design. The report has to say which quarter each layer reflects.
* *News (Phase 3) changes daily.* True. News summaries would be a third, small daily layer, limited to companies that have news, with its own cap.

---

## 2. User flow (§2)

* **(v3) Ambiguity and share classes: agree, with three changes.**
  * **Cache and store by CIK, not by ticker.** Otherwise GOOGL and GOOG produce two reports at twice the cost, and possibly two different ratings for the same company. Ticker URLs redirect to one canonical page.
  * **Brand names need an alias table.** SEC's ticker file has legal names ("Alphabet Inc.", "Meta Platforms"), not "Google" or "Facebook". For 500 companies a hand-kept alias table is small.
  * **"Total shares across all classes" must convert classes to one economic unit.** BRK.A is worth 1,500 BRK.B shares. Adding the two share counts directly gives a wrong per-share value. GOOG/GOOGL, FOX/FOXA and NWS/NWSA are the other multi-class index members to test.
* **Where does the S&P 500 list come from?** The constituent list is S&P Dow Jones Indices data, the same licensing question v3 raised for GICS. ETF issuers publish daily holdings files for funds that track the index; check their terms of use. Membership changes about 20 or more times a year, so keep a dated membership history. A company that leaves the index must keep being graded, or the track record drops its losers.
* **(v3) Budget guard:** see §1 above. Meter spend from your own `runs` table.
* **"Today's report" is undefined (untagged).** Today in which time zone, and with which price? A report generated at 9:35 a.m. and one at 3:55 p.m. show different prices under the same URL. Recommendation: every report uses the **prior trading day's close** (US Eastern). The report becomes reproducible, the prediction-log price is unambiguous, and end-of-day display licenses are often cheaper than intraday ones (confirm with the vendor).
* **Sign-in before viewing (untagged) weakens shareable URLs.** If §1's design is adopted, viewing a report costs no LLM money, and sign-in may have no job in v1 other than rate-limiting scrapers. Check whether the price-data license requires registered users.

## 3. Report layout (§3)

* **A DCF value is not a 12-month price target.** The DCF gives a value for today. §9 grades "price inside the bear–bull range at 12 months." To grade a 12-month range, either (a) call the number a **fair value range** (as Morningstar does) and grade it differently, or (b) roll the value forward one year (value × (1 + cost of equity) minus expected dividends) and call that the target. The page has to say which.
* **The least reliable numbers are at the top.** The header leads with rating and target, which the brief's own base-rate note says are usually wrong. That can be acceptable for a publisher, but the uncertainty level should get the same visual weight as the rating, not sit beside it in small type.
* **Nine sections is long.** Set a word budget per section. Output tokens are the most expensive part of the report, and readers drop off.

## 4. Pipeline (§4)

* **Fixed steps, Python for every number: agree, after testing it.** It is reproducible, testable, cheap, and makes "where did this number come from" answerable. The strongest counter-argument is that a fixed section map misses information outside the mapped sections. That is a real gap, handled in §5 below by widening the map with code-only checks, not by adding agents.
* **The numeric guard (step 11) is hard to build as written.** Matching every number in prose against computed values or source text means handling units ("$4.2 billion" vs "4,200 million"), rounding ("about 12%" vs 11.8%), counts ("three segments"), and years. Replace it with a stricter rule that code can check exactly:
  * LLM prose may not contain digits, except inside `{{metric:…}}` placeholders, inside quoted spans, and four-digit years.
  * Any figure taken from filing text must be a **verbatim quote** with its paragraph ID, and the guard checks that the quote is an exact substring of that paragraph.
* **Verification arrives after the app is public.** Jev and the skeptic are Phase 2, and §1 decides the app is public. Make "Phase 2 verification is live" a gate for public launch, together with the price license and the lawyer review.
* **Removing failed claims can tilt the report.** If negative claims fail more often (for example because risk language is hedged), removal makes reports more positive. Log removal rate by claim type and alert on imbalance.
* **Haiku extraction before Sonnet: keep it, for cost.** Sending ~150K tokens of filings straight to Sonnet costs about $0.30 in input alone; Haiku reads it for about $0.015. Phase 0 should still check whether evidence items lose detail that changes the narrative.

## 5. RAG system (§5)

* **Retrieval by document structure, no vector database: agree.** For a fixed set of sections, structure beats similarity search and is cheaper to run.
* **(v3) Item 1 added: agree. The map still misses high-signal sections.** Most of these can be detected by code, without an LLM:
  * 10-K **Item 9A**: a material weakness in internal controls.
  * 10-K **Item 3**: legal proceedings.
  * 10-K **Item 1C**: cybersecurity (required since 2023).
  * 8-K item codes, which EDGAR lists in the filing index: **4.02** (prior financials can no longer be relied on), **5.02** (a director or officer leaving), **2.05** (restructuring costs), **2.06** (impairments), **1.01/1.02** (material agreements).
  * Auditor going-concern language.
  These become an "events and flags" box in the report.
* **Section parsing will fail on some filers.** Some companies put MD&A in Exhibit 13 and write "incorporated by reference" under Item 7. Some combine items ("Items 1 and 2"). Detect this with word-count and phrase checks. Fall back to the exhibit, or mark the section "not available." Never return an empty section silently. Put such filers in the golden set.
* **Paragraph IDs are only stable for one parser version.** If edgartools is upgraded and paragraph splitting changes, `#p37` points at different text. Add the parser version or a content hash to the ID, and never re-parse old filings in place.
* **(v3) Size control under 100K tokens: agree** (price verified in §0). Split long sections at sub-headings rather than at fixed sizes, so a risk factor is not cut in half, and overlap windows by one paragraph.
* **The skeptic cannot find omitted counter-evidence from what it is given.** §6 says the skeptic sees only the draft, the metrics, and the *cited* paragraphs, and §6 also asks it to flag *omitted* counter-evidence. It cannot find what was left out if it only sees what was put in. Give it all extracted evidence items, or the full source block. This also makes the caching in §5 work: both calls can then start with the same byte-identical source block, on the same model.
* **Refresh: use EDGAR's daily index** (one request a day) rather than polling 500 companies.
* **"Recall of material risks" needs a hand-made answer key** per golden ticker. Count it in the labeling budget (see §12).
* **v2 hybrid retrieval: challenge the trigger.** Year-over-year risk-factor changes do not need embeddings: a paragraph diff between this year's and last year's Item 1A finds added and removed risks deterministically, and a short Haiku call can summarize them. That is a cheap, high-signal feature for v1.5. Keep pgvector off the roadmap until a feature needs search across companies.

## 6. Verification (§6)

* **(v3) Tuning and held-out split: agree; 300 labels is not enough to certify a low error rate.** With 100 held-out claims and a true error rate of 5%, the 95% confidence interval is about **2%–11%**. Three hundred labels can choose a threshold, not prove the auto-pass error rate is small. Define the target as "false-pass rate among auto-passed claims ≤ X%, upper confidence bound included," and size the held-out set from that.
* **Label real pipeline output, stratified** by claim type (risk, driver, guidance, competition) and by business type (banks and insurers read differently). Re-check the threshold when narrator prompts change, because the mix of claims shifts.
* **Fallback to Claude when Jev is down** changes verification behavior. Mark it per claim in the run record. Under §1's batch design no user is waiting, so "hold publication until Jev is back" may beat falling back.
* **Pinned model IDs: agree.** Plan for forced migration when a pinned model is retired: a golden-set run and a threshold re-check.

## 7. Data and licensing (§7)

* **(v3) SIC instead of GICS: agree on licensing; SIC codes are poor for the largest companies.** Amazon is 5961 (catalog and mail-order retail), Netflix is 7841 (video tape rental), Alphabet and Meta are 7370 (computer programming services), Berkshire Hathaway is 6331 (fire, marine and casualty insurance), Visa is 7389 (business services). The SIC-to-group map needs a hand-kept per-company override table, about 500 rows, done once. Also set a minimum peer-group size for percentiles (for example 15 companies) and merge smaller groups.
* **Sector ETF benchmarks do not match SIC groups.** The common sector ETFs follow GICS. Alphabet could sit in your technology group but in the communication-services ETF. Grading "excess return vs. sector ETF" then compares against a different group than the one used for scoring. Recommendation: build your own cap-weighted group return from the constituents' prices (shares come from XBRL), grade against it first, and keep SPY as the second benchmark. Show sector ETFs only as context.
* **(v3) Analyst estimates out of v1: agree.** The cost is that the DCF starts from trailing growth, which is unstable for fast growers (see Q5).
* **FRED: agree.** Use public-domain series (Treasury yields, BLS inflation and employment data). Some series carry third-party copyright; skip them.
* **The price license must cover more than display** (implementation check on a decided item, not a challenge): computed values derived from prices (momentum, relative strength), storing history for 500 tickers for grading, and the API call limits of a nightly 500-ticker pull.

## 8. Scoring, valuation, rating (§8)

* **(v3) v1 factors without sentiment: agree on dropping sentiment.** Two issues for Q4: the **growth** factor has the weakest evidence of a return premium of the six, and **value is counted twice**, once in the valuation factor inside the score and again in the Buy rule's discount to DCF value.
* **(v3) Equity bridge: one double-count risk.** If lease liabilities are subtracted as debt, the lease cost has to be added back to the cash flows. Otherwise leases are counted twice. Share-class conversion applies here too (BRK).
* **(v3) Separate path for financials and real estate: agree; route by business model, not sector label.** Banks, insurers and REITs need it. Visa and Mastercard do not: they are fee businesses and fit a cash-flow DCF. Regulated utilities (about 30 index members) are also poorly served by a growth-fade DCF. Keep a per-company valuation-path list (Q6).
* **The terminal-value flag will fire on most companies.** With a five-year forecast, terminal value is commonly 70–80% of total value, so a ">75%" flag carries little information. Either lengthen the explicit forecast or raise the threshold (Q5).
* **Check the rating distribution before publishing.** A mechanical DCF with conservative fades tends to value large-cap growth companies below their price. The most-searched tickers could all be Sell. Run all 500, look at the Buy/Hold/Sell split, and decide whether the bands are absolute or relative to the universe. Add hysteresis: a stock must cross a band by a margin before its rating changes, so a 2% price move does not flip Buy to Hold.
* **(v3) "Negative revisions" dropped until estimates exist: agree.**

## 9. Track record (§9)

* **"One call per ticker per month" depends on which tickers users ask for.** Popular tickers get logged and unpopular ones do not, which biases the track record. Because the rating is code-only, the nightly job can log an official monthly call for **all ~500 companies** on a fixed date, at no LLM cost. That reaches "200 graded 12-month calls per bucket" around month 13 or 14 instead of years later.
* **Monthly calls on the same ticker overlap.** Twelve overlapping 12-month calls on one stock are not twelve independent tests. Confidence intervals must account for this (group by ticker, or count only non-overlapping cohorts).
* **The daily hash digest must be posted where you cannot edit it.** A digest on your own site proves nothing. Commit it to a public Git repository, or use a public timestamping service.
* **Start the log as early as possible.** Time is the bottleneck: no 12-month grade exists until 12 months after the first logged call. That argues for logging from the numbers-only phase (see §13).
* **Consider an internal backtest of the score only** (code, no LLM, never marketed), using XBRL filing dates so no data is used before it was public. It would show before launch whether the score has any signal at all. The counter-arguments are real: overfitting, the need for historical index membership, and historical prices that may need a license. This feeds Q4.

## 10. Stack (§10)

* **Next.js 15 is one major version behind.** Next.js 16 shipped in October 2025. Use the current major at build time.
* **Seven outside services for one developer:** Vercel, a container host, a job runner, Postgres, an auth provider, a price vendor, and Jev. Under §1's design there is no user-triggered job, and a nightly scheduled job on the Python host plus a Postgres jobs table may replace the job runner. Q7.
* **"Vercel functions time out" is less true than when this was written.** The default limit is now 300 seconds. Under §1's design it does not matter, because no request path runs the pipeline.
* **(v3) `universe_metrics` needs a date on every row** (one snapshot per night) so any past report can be re-rendered exactly as of its date.
* **(v3) Run record: agree.** Add the price-table version used to compute cost.

## 12. Evals (§12)

* **The labeling load is large for one person.** 50 tickers × 10 hand-checked numbers = 500 numbers, plus 300 claims, plus a material-risk answer key per ticker: roughly 30–40 hours. Start Phase 0 with about 20 tickers chosen to cover the hard cases (a bank, an insurer, a REIT, a utility, a negative-cash-flow company, a January year-end, a multi-class company, an Exhibit 13 filer), then grow to 50.
* **Regression runs cost money** (§1). Cache LLM outputs keyed by their exact inputs, and rerun only the stages whose prompts or inputs changed.

## 13. Build order (§13)

* **Phase 1 is the whole product.** Split it:
  * **1a, numbers only:** EDGAR → universe → score → valuation → rating → nightly prediction log, behind an internal page. This starts the 12-month clock early and needs no LLM.
  * **1b, text and web:** text layer, extraction, narrative, numeric guard, report pages.
* **(v3) Market context moved to Phase 1: the reason is circular.** It moved "since the report is required to have it," but the layout that requires it is itself [proposed]. In v1, keep market context code-only: numbers and a chart (relative strength against the group and SPY, the 10-year yield, rate and FX sensitivity figures from Item 7A), no LLM prose. Generic macro prose is the section most likely to be filler.

## 14. Cost (§14)

Covered in §0 and §1. Summary: the per-report estimate is plausible but should be $0.27–0.50. On-demand generation caps out at about 13–24 fresh reports a day. Nightly pre-generation of all 500 reports does not fit. Filing-driven batch regeneration fits.

## 15. Legal posture (§15, general information, not legal advice)

* The publisher's exclusion (from *Lowe v. SEC*, 1985) looks at, among other things, whether publication is regular and not timed to specific market activity. Regular scheduled publication for all covered companies may fit that better than on-demand generation, and "regenerate after major news" (§16 Q1) may cut against it. Put this question to the securities lawyer.

---

## Not in §16, needed before the Goldfish review

* **Who is the reader, and what counts as success at 6 and 12 months?** (Monthly readers? Track-record quality? A funnel into something else?) This decides several §16 answers, so it will be asked after §16.

---

## §16 question log

| # | Question | Status | Notes |
| :-- | :-- | :-- | :-- |
| 1 | Report freshness | **In discussion** | Proposal on the table: §1 split. Numbers refresh nightly; text regenerates on a new 10-K, 10-Q or earnings 8-K; open point is which between-filing events (8-K items 4.02, 5.02 and others) trigger regeneration or only a flag. |
| 2 | Monetization | Not started | Affected by §1: if viewing costs nothing, free viewing is viable; the cost to cover is the price license, not the LLM. |
| 3 | Finava use and the wall | Not started | |
| 4 | Factor weights and sector metrics | Not started | Inputs: §8 (growth evidence, value double-count), §9 (internal backtest). |
| 5 | DCF rules | Not started | Inputs: §3 (value vs. 12-month target), §8 (terminal-value flag), trailing-growth instability. |
| 6 | Financials and REIT valuation | Not started | Input: §8 (route by business model; utilities). |
| 7 | Job runner, Python host, auth | Not started | Input: §1 and §10 (job runner and sign-in may not be needed). |
| 8 | PDF export | Not started | |
| 9 | Name | Not started | |
