# Stock Report App — Concept Brief v4 (working name TBD)

Starting notes for `/egm-brainstorm` → `/egm-draft`. Updated Nov 2, 2026.
**[decided]** = settled by Liam. **[proposed]** = research-backed default to stress-test. **(new in v3)** = gap found while writing out the full structure. **(new in v4)** = change taken from the two research reports.

**Sources for v4 changes**

- **[T]** `reports/Stock price prediction methods.md`: academic research, sell-side analysts, valuation, commercial ratings.
- **[AI]** `reports/AI stock price prediction.md`: machine learning, deep learning, text analysis, LLMs, forecast evaluation, AI track records.
- **[ST]** `docs/brief-stress-test.md`: the stress test of v3. Its counter-proposals (filing-driven text layer, cost model, SIC overrides and others) are **not** folded in here until the §16 questions settle them. They appear below only where the research supports them independently.
- The notes behind both reports are in `research_notes/`. Brief v3 is kept at `docs/brief-v3.md`.

## What changed in v4

1. **Factor weights now follow the evidence.** Profitability and momentum come first. Growth gets near-zero weight or is redefined. Balance sheet and accruals become screens. (§8)
2. **News never enters the score.** The planned Phase 3 sentiment factor is dropped, and news goes into the narrative only. (§7, §8, §13)
3. **Three new signals from free SEC data:** net share issuance, unusual insider buying (Form 4), and how much the 10-K text changed from last year. (§4, §5, §8)
4. **Red flags cap the rating** (restatement, material weakness, going concern) instead of entering the ranking. (§8)
5. **The price range is a set of declared percentiles** built from a volatility forecast. The base case grows from today's price instead of assuming the stock reaches fair value in 12 months. (§3, §8)
6. **Ratings are sector-relative and balanced.** A buffer stops small moves from flipping them, and every rating comes with a target. (§3, §8)
7. **The track record is pre-registered.** Every covered company is logged and graded to its horizon, including delistings, against naive baselines. Results are labelled "descriptive" until a date fixed in advance. (§9)
8. **Point-in-time data rules** apply to any backtest and to grading. (§4, §7, §9, §12)
9. **The LLM role is confirmed as reading and writing only.** The skeptic targets optimism, and no LLM output is evaluated on dates before the model's training cutoff. (§4, §6, §12)
10. **Legal:** SEC cases on "AI washing" and on hypothetical performance shape the marketing and what the site may show. (§15)
11. **Three new open questions.** (§16)

---

## 1. What it is

- **[decided]** A web app: type a company name or ticker → get one finished, cited research report. One action, not a chat.
- **[decided]** Separate from Finava. No portfolio, no personalization.
- **[decided]** Public app that other people use.
- **[decided]** Coverage at launch: S&P 500 only.
- **[decided]** Runs on the Claude API using Max 20x's $200/month API credits (API key from the linked Console org). Built in Claude Code with the EGM plugin.

## 2. User flow

1. Sign in.
2. Type a company name or ticker. Resolve it to ticker → SEC CIK. **(new in v3)** Handle ambiguity and share classes: "Google" → Alphabet (GOOGL/GOOG); per-share values use total shares across all classes. Anything outside the S&P 500 → "not covered yet."
3. If today's report for that ticker exists → show it instantly (ticker-day cache).
4. Otherwise → enqueue a background job → progress screen → finished report at a shareable URL (e.g. `/report/TSLA/2026-10-30`).
5. Per-user daily report limit. **(new in v3)** Budget guard: if API credits are nearly used up, stop new generation and serve cached reports only, with a clear message.

## 3. Report layout [proposed]

1. **Header:** price snapshot and time, data as-of dates, rating, score, target range, uncertainty level. **(new in v4)** The uncertainty level gets the same visual weight as the rating.
2. **Rating and price target:** bear / base / bull range shown first, the uncertainty level, and the base-rate note.
   - **(new in v4) Range:** the bear and bull cases are declared percentiles (for example the 10th and 90th), so the range can be graded [AI].
   - **(new in v4) Base-rate note, corrected** [T] (Bradshaw, Brown & Huang 2013, US, 2000–2009):
     - 38% of sell-side 12-month targets were met at the 12-month mark, and about 64% at some point during the year.
     - Targets implied about 15 points more return than followed.
     - The average absolute error was about 45%.
   - **(new in v4)** Every report carries a target, including Holds and Sells. Banks often drop targets on bad news [T].
   - **(new in v4)** The rating is presented as a summary of the thesis, not as the product. Among large companies, the rating level has shown little predictive value after costs [T].
3. **Score and factor breakdown:** each factor → its metrics → sector percentile → weight → contribution.
4. **Valuation detail:** DCF assumptions per scenario, peer multiples table, guardrail flags. **(new in v4)** Show the terminal value's share of total value. Show each multiple and the earnings figure behind it separately, so each can be graded [T].
5. **Business and competitive position (moat):** from 10-K Item 1 and 1A.
6. **Key risks:** 10-K Item 1A plus changes in the latest 10-Q. **(new in v4)** Add a **red-flags box** [T][AI]:
   - a restatement (8-K Item 4.02);
   - a material weakness in internal controls (10-K Item 9A);
   - going-concern language;
   - a large year-over-year change in the risk-factor text.
7. **Recent results and management commentary:** MD&A plus the latest 8-K earnings release.
8. **Market context:** macro regime (FRED), sector vs. S&P 500, the stock vs. its sector, rate/FX sensitivity (Item 7A), news (Phase 3).
9. **Methodology, sources and disclaimers.** **(new in v4)** Using FINRA Rule 2241's disclosure items as a template [T], include:
   - the rating definitions;
   - the app's own Buy/Hold/Sell split across all covered companies;
   - a chart of each stock's rating and target history.

## 4. The pipeline (fixed steps, plain Python) [proposed]

Python makes every number. Claude only extracts and writes. No agents, no debate, no LLM-driven control flow. **(new in v4)** The research supports this split. The tasks with strong evidence for LLMs are extracting facts, classifying events and finding what changed in a filing. The tasks with weak evidence are 12-month directional calls, calibrated probabilities, and arithmetic across statements, and those stay in code. A code-built rating can also be backtested on point-in-time data, while anything an LLM writes about famous companies cannot, because the models remember the outcomes [AI].

1. **Resolve:** name → ticker → CIK (SEC's ticker list). Code.
2. **Fetch:** XBRL company facts, latest 10-K, 10-Q and 8-K (Item 2.02 earnings release) from EDGAR; prices for the stock, its sector ETF and SPY; FRED series. Save a snapshot and hash it. Code.
   - **(new in v4)** Also fetch Form 4 insider filings.
   - **(new in v4)** Store every fundamental value with the date it was filed. Never use restated values, or SEC's `frames` API, for anything time-sensitive: `frames` returns the latest filed value for a period, including later restatements [AI].
3. **Normalize:** edgartools standardization, TTM figures, fiscal-year alignment (e.g. NVIDIA's year ends in January), restatements; keep the raw XBRL tag beside every value. Code.
4. **Metrics:** ratios for each factor. Code. **(new in v4)** Plus net share issuance, unusual insider purchases, and the filing-text change scores from step 8.
5. **Score:** sector percentiles against S&P 500 peers (from the nightly universe table) × `weights.yaml` → composite score. Code.
6. **Value:** DCF (bear/base/bull), comps, equity bridge, guardrails → target range + uncertainty level. Code. **(new in v4)** The 12-month range comes from today's price, an expected return, and a volatility forecast; see §8.
7. **Rate:** `bands.yaml` → Buy / Hold / Sell. Internal probability (fixed logistic prior) logged, not shown. Code. **(new in v4)** Red flags can cap the rating; see §8.
8. **Text layer:** parse filings into sections and paragraph IDs (see §5). Code. **(new in v4)** Also compare Items 1A, 3, 7 and 7A with the same items in the prior year's filing and score how much changed (Cohen, Malloy & Nguyen 2020, "Lazy Prices") [T][AI].
9. **Extract:** Claude Haiku, one call per filing section, in parallel → evidence items with paragraph IDs. LLM, schema-validated.
10. **Narrate:** Claude Sonnet gets the metrics JSON + evidence items + the cited paragraphs → schema-bound sections with `{{metric:…}}` placeholders and paragraph citations. LLM.
11. **Render:** fill placeholders from computed values; numeric guard rejects any number that doesn't match a computed value or a cited source. Code.
12. **Verify:** Jev checks each claim; uncertain claims plus a holistic review go to the Claude skeptic; failed section regenerated once; still failing → claim removed with a visible note. Code + Jev + LLM.
13. **Publish:** save the report, sections, claims and sources; write the prediction-log row; cache for the day. Code. **(new in v4)** Also log the as-of date, the exact documents retrieved, and each model's ID and training cutoff [AI].

## 5. The RAG system

### v1: retrieval by document structure (no vector database) [proposed]

- **Ingest:** download filings from EDGAR by accession number. Follow SEC fair-access rules: declared User-Agent with contact email, at most 10 requests/second.
- **Parse:** split into Items with edgartools. 10-K: Item 1 (Business), 1A (Risk Factors), 7 (MD&A), 7A (Market Risk). 10-Q: Part I Item 2 (MD&A), Part II Item 1A (risk factor changes). 8-K: Exhibit 99.1 earnings release. Narrative text only; numbers come from XBRL. **(new in v4)** Add 10-K Item 3 (Legal Proceedings) for the year-over-year comparison.
- **Chunk:** paragraphs with stable IDs (`accession#item1A#p37`), stored in a `sources` table with company, filing type, filing date and period. Never edited after ingest.
- **Select (the "retrieval"):** a fixed map from report section to filing sections:
  - Business and moat ← 10-K Item 1 **(new in v3; Item 1 was missing)** + Item 1A
  - Key risks ← 10-K Item 1A + latest 10-Q Part II Item 1A
  - Results and commentary ← 10-K Item 7 + latest 10-Q MD&A + latest 8-K earnings release
  - Rate/FX sensitivity ← 10-K Item 7A **(new in v3)**
  - News (Phase 3) ← licensed headlines + snippets
- **(new in v4) Year-over-year change detection** [AI][T]:
  - **Method:** code compares each paragraph of Items 1A, 3, 7 and 7A with last year's filing and computes a similarity score. Haiku or an open finance model such as FinBERT then labels the changed paragraphs as negative or positive.
  - **Evidence** (1995–2014, before costs):
    - Firms that barely change their filings beat heavy changers by 34–58 basis points a month, value-weighted.
    - The effect builds over about 6 months and lasts to 18.
    - It was strongest for changes in the risk-factor section.
    - Most of the gap comes from heavy changers doing badly, so use it as a **red flag**, not a buy signal.
  - **Caution:** there is no evidence after 2014, so give it a low weight.
- **Size control (new in v3):** one filing section per extraction call, kept under 100K tokens (Haiku 5.5's price rises 5× above that). Very long sections are split into ordered windows.
- **Extract:** Haiku returns evidence items `{statement, type, paragraph_ids[]}` (types: risk, driver, guidance, competition). Paragraph IDs must exist in this company's sources.
- **Generate:** Sonnet writes claims that cite paragraph IDs.
- **Prompt caching:** the narrative and skeptic calls share the same source block, so caching cuts the second call's cost. **(new in v3, correction)** Prompt caches last minutes, not a day; the ticker-day report cache is what shares cost across users.
- **Verify:** Jev checks each claim against exactly the cited paragraphs (small enough for its 32K budget); `citation_check` confirms each ID exists and belongs to this company and filing.
- **Refresh:** a daily job checks EDGAR for new filings from S&P 500 companies and ingests them.
- **Evaluate:** citation precision (does the paragraph support the claim?), recall of material risks, on the golden set.
- **(new in v4) Not used:**
  - **Tone of a 10-K:** the overall tone of a filing doesn't predict 12-month returns.
  - **Loughran-McDonald word list:** it needs a commercial license for a public product.
  - **Readability scores:** they belong in the narrative, if anywhere.

  [AI]

### v2: hybrid retrieval [proposed, later]

- Triggered by multi-period work: year-over-year risk factor changes, 8 quarters of transcripts, peer filings for moat comparisons. **(new in v4)** Year-over-year risk-factor changes no longer need v2: the paragraph comparison above is code-only.
- Paragraph embeddings stored in **pgvector inside the same Postgres** (no new database), plus Postgres full-text keyword search, plus a reranker.
- One query per report section with metadata filters (company, filing type, period); top results go into the same extract → narrate → verify flow.
- Evaluate retrieval with recall@k on labeled questions.

## 6. Verification [decided + proposed]

- **[decided]** Jev (TypeSafe AI) labels each claim against its cited paragraphs: supported / contradicted / insufficient evidence. Above the confidence threshold → auto-pass; everything else → Claude skeptic.
- **[decided]** Liam hand-labels ~300 claims to set the threshold. **(new in v3)** Split them into a tuning set and a held-out set; in one independent test, Jev's error came in higher on held-out data than the target it was tuned to.
- **[proposed]** Claude skeptic (fresh context; sees only the draft, the metrics JSON and the cited paragraphs) flags bias, omitted counter-evidence, stale data, and tone that contradicts the rating.
  - **(new in v4)** It aims at the documented LLM failures: optimism, extrapolating from recent price moves, upside-only framing, and prose more bullish than the code-built rating. In one study, 14 of 16 models showed optimism bias [AI].
  - **(new in v4)** The AI report recommends a skeptic from a different model family than the writer. That conflicts with the [decided] Claude-only setup; see §16 Q11.
- **[proposed]** Numeric guard and citation check run before Jev.
- **[proposed]** Pin the Jev version (e.g. `jev-1.13.0`) and log it; fall back to Claude if Jev is down. Never use Jev for the rating, score, target, moat scoring, arithmetic, dates or long documents.
- **[proposed]** Pin Claude model IDs and prompt versions; log both on every run.
- **(new in v4) Why every number is checked** [AI]:
  - On the Vals.ai Finance Agent benchmark (Oct 29, 2026), the best model (Claude Opus 5.5) scores 67.85%, so about a third of expert tasks on filings still fail under strict scoring.
  - On FinanceBench, accuracy rose from 19% to 79% when the right document was placed in context.
  - Both support retrieving whole sections and checking every number against XBRL.

## 7. Data and licensing

- **[decided]** Free price data during development while only Liam uses the app; buy a display license before anyone else uses it (e.g. Twelve Data business tier from ~$149/mo; verify on the vendor's terms page).
- **[proposed]** Fundamentals and filings: SEC EDGAR via edgartools (public, free).
- **[proposed]** Macro: FRED (check each series' copyright note).
- **[proposed]** Sector ETFs and SPY: from the same price feed (prices also feed the momentum factor).
- **[proposed]** v1: 8-K earnings releases instead of call transcripts.
- **[proposed]** News (Phase 3): headlines + links + our own summaries only, from a source that allows display. **(new in v4)** News goes in the narrative only. For large companies, news is priced in within about a day, so it adds nothing to a 1–12 month score [AI].
- **(new in v3)** **Sectors:** GICS is proprietary (MSCI / S&P Dow Jones Indices). Use SEC SIC codes mapped to our own sector groups.
- **(new in v3)** **Analyst estimates:** "EPS revisions" and "consensus growth" need estimate data that isn't in the plan. v1 uses trailing data only; estimates become a separate licensing decision. **(new in v4)** Cost of this choice: forward-earnings multiples are the most accurate kind, and trailing-only multiples rank lower, so expect wider valuation errors [T].
- **(new in v4)** **Form 4 insider filings** (free, EDGAR): needed for the insider-purchase signal.
- **(new in v4)** **Point-in-time data:** every XBRL fact is stored with its filing date. Any backtest or grading uses S&P 500 membership and sector groups as they stood on each date, not today's list (survivorship bias) [AI].
- **(new in v4)** **Effect sizes are upper bounds.** No study measures these signals for S&P 500 members against their own sector, which is this app's exact setting [T][AI].
- No yfinance or Finnhub in production.

## 8. Scoring, valuation, rating [proposed]

### Score

- **Score:** sector-relative percentiles (SIC-based groups within the S&P 500), weights in a published `weights.yaml`.
- **(new in v3)** **v1 factors:** valuation, growth, profitability, balance sheet, earnings quality, momentum. The sentiment/news factor joins in Phase 3, when news exists. Weights for v1 must add up without it. **(new in v4)** The sentiment factor is dropped: news never enters the score (§7).
- **(new in v4) Evidence for each factor, large US companies, 1–12 months** [T]. Exact weights stay open (§16 Q4).

  | Factor | Evidence | Proposed role |
  | :-- | :-- | :-- |
  | Profitability / quality | Strongest and most consistent (Novy-Marx 2013; the profitability factor was positive before and after 2007, figure to check against Ken French's data) | Highest weight |
  | Momentum | Strong but crashes in sharp rebounds after bear markets; much weaker since 2007 | Substantial weight; scaled down after market falls when volatility is high; labelled as price-based |
  | Valuation | Weak among large companies since 1991 (big value stocks beat the market by 0.05% a month in 1991–2019) | Moderate weight; several sector-relative measures; read together with profitability |
  | Growth | No premium. High asset growth predicts *lower* returns | Near-zero weight, or redefined as capital discipline (low share issuance, low asset growth) |
  | Balance sheet | No standalone premium | Safety screen, low weight |
  | Earnings quality / accruals | Faded after publication | Safety screen, low weight |

- **(new in v4) Added signals:**
  - **Net share issuance:** firms that issue shares do worse. It was one of the strongest predictors after 1970, holds in 41 countries, changes slowly, and is free to compute. Goes into the score under capital discipline [T].
  - **Unusual insider purchases (Form 4):** insider buys that break an insider's routine earned 82 basis points a month, value-weighted; routine trades and all sales were uninformative (Cohen, Malloy & Pomorski 2012). These are rare among mega-caps. Low weight, or shown as a flag [T].
  - **Year-over-year filing-text change:** a red flag (§5).
- **(new in v4) Considered and not added** [T][AI]:
  - **Technical analysis:** fails after correcting for testing thousands of rules.
  - **Post-earnings drift:** about zero for all but the smallest stocks since 2006.
  - **Short interest:** a risk flag only among large companies.
  - **Options signals:** need licensed data and are short-horizon.
  - **News sentiment.**
  - **Any LLM-produced score.**
  - **Machine-learning models of the score:** among the 1,000 largest stocks, neural nets raise monthly R² from 0.31% to 0.70%, but the edge mostly sits in small, illiquid stocks and is about the size of large-cap trading costs [AI].
- **(new in v4) Realistic size of the edge** [T]. After costs and post-publication decay, the average published anomaly earns about 0.04% a month, and combinations about 0.2% (Chen & Velikov 2023). Expect a Buy-minus-Sell spread of tens of basis points a month at most. The best models explain under 5% of a large stock's 12-month return, so a directional call is right about 55–57% of the time at best.

### Valuation

- **DCF:** growth fades from trailing rates toward a GDP-like terminal rate; margins revert toward the sector median; cost of equity from a fixed risk-bucket table (7.5 / 9.0 / 11.0 / 13.5%). No LLM input.
  - **(new in v4)** The buckets match Morningstar's [T].
  - **(new in v4)** Cap terminal growth at the risk-free rate. Tie reinvestment to growth through return on capital, or for fast growers through a sector sales-to-capital ratio. Never close the DCF with an exit multiple [T].
  - **(new in v4)** Add a residual-income cross-check (book value plus excess earnings). It depends less on the terminal value and beat DCF and dividend models in accuracy studies [T].
- **(new in v3)** **Equity bridge:** enterprise value → minus net debt, leases, minority interest and preferred → divided by diluted shares across all share classes. Stock-based compensation is treated as a cost.
- **Comps:** median EV/EBIT and P/E of sector peers, winsorized. **(new in v4)** Use the harmonic mean of same-industry peers and prefer P/E over EV/sales. When earnings are negative, drop the undefined multiple rather than impute it [T].
- **Guardrails:** terminal growth below the risk-free rate; flag terminal value > ~75%; DCF vs comps gap > 40% → high uncertainty; negative FCF → comps only, "valuation not meaningful." **(new in v4)** A high terminal-value share raises the uncertainty level [T].
- **(new in v3)** **Financials and real estate (about a fifth of the S&P 500) need their own valuation path before v1:** banks and insurers on P/B vs. ROE and P/E; REITs on price/FFO. A cash-flow DCF doesn't work for them. **(new in v4)** Value banks and insurers at the equity level. Among US banks above $1B in Feb 2009, price-to-book and ROE had a correlation above 0.7 [T].

### 12-month range (new in v4)

[T][AI]

- **The value gap closes slowly.** Gaps between estimated value and price close over about three years, not one: the top-minus-bottom value-to-price spread was 5.3% at 12 months and 27.8% at 36 months. Morningstar assumes about three years.
- **Base case:** today's price grown at an expected return (cost of equity minus dividend yield). Whether to add a partial closing of the value gap is open (§16 Q10). A base case implying large upside should be treated as low-probability: the hit rate of sell-side targets falls steeply as the implied upside rises.
- **Bear and bull cases:** declared percentiles (for example 10th and 90th) from a volatility forecast (trailing or option-implied). Volatility is the one quantity forecasting models predict well.
- **Uncertainty level:** like Morningstar, start from trailing 12-month return volatility, then adjust with the guardrail flags.

### Rating

- **Rating:** uncertainty-scaled bands (Morningstar-style) in `bands.yaml`. Buy = enough discount to base value for its uncertainty level AND score ≥ 60th sector percentile. Sell = enough premium OR score ≤ 25th percentile. Hold = everything else. **(new in v3)** The "negative revisions" condition is dropped until estimate data exists.
- **(new in v4) Changes** [T]:
  - **Definition:** Buy / Hold / Sell means expected 12-month total return relative to the sector benchmark, with SPY second.
  - **Balanced split:** aim for a balanced split. The street's S&P 500 split in June 2025 was 56.4% Buy, 38.7% Hold, 4.9% Sell, and brokers that issue fewer Buys have more informative upgrades.
  - **Buffer:** a stock must move further to change rating than to keep it (Morningstar uses ±5%).
  - **Red flags:** cap the rating at Hold (restatement, material weakness, going concern).
  - **[proposed] Momentum cap:** low momentum caps the rating at Hold. Morningstar's quantitative model caps low-momentum stocks at 3 stars to avoid value traps.
- **(new in v4)** Show factor-adjusted returns next to raw returns. The more the score leans on profitability and momentum, the more its Buys look like known factor bets, so users need both to tell skill from style [T].
- **Methodology page:** factor edges usually shrink 30–60% after publication. **(new in v4, corrected)** McLean & Pontiff (2016): returns about 26% lower out of sample and about 58% lower after publication [T].

## 9. Track record

- **[decided]** "Probability of beating its sector over 12 months" is tracked and graded internally, published only once enough calls are graded.
- **[proposed]** Append-only prediction log (ticker, time, price, score, rating, bear/base/bull, uncertainty, model and prompt versions, data snapshot hash) with a daily public hash digest.
  - **(new in v4)** The daily digest goes to a third-party timestamp, not only our own site [AI].
  - **(new in v4) Rulebook:** before the first report, hash a scoring rulebook into the log [AI]. It fixes:
    - metric definitions and benchmarks;
    - the start price and the horizons;
    - what the bear/base/bull percentiles mean;
    - how corporate actions and delistings are handled;
    - the date of the first formal skill test.

    Later rule changes apply only to later predictions.
  - **(new in v4)** Commit the coverage list in advance too. A hash cannot stop a publisher from quietly dropping hard names [AI].
- **[proposed]** Graded at 3/6/12 months: excess return vs. sector ETF (primary) and SPY; rating hit rate; price inside the bear–bull range; Brier score on the internal probability.
  - **(new in v4)** Every metric is compared with a naive baseline and an outside reference [T][AI]:

    | Output | Metric | Naive baseline / outside reference |
    | :-- | :-- | :-- |
    | Buy/Hold/Sell | Hit rate and average excess return by rating | Random ratings with the same mix; "always Hold"; best-case ceiling about 55–57% |
    | Base target | Met at month 12; touched at any time; signed error; average absolute error | Sell-side: 38%; 64%; +15 points optimistic; about 45% |
    | Bear–bull range | Share of outcomes inside; balance of misses above vs. below; interval score | A range built from trailing volatility; inside share should match the stated percentiles (80% for 10th–90th) |
    | Internal probability | Brier score and calibration plot | The realized base rate |
    | Buy-minus-Sell | Spread per month | Combined anomalies earn about 0.2% a month after costs |
    | Rating mix | Buy / Hold / Sell split | Street: 56.4 / 38.7 / 4.9 |

- **(new in v4)** Log an official monthly call for **every** covered company, not only requested tickers. Grade every call to its horizon, including companies acquired, delisted or removed from the index, using membership and sector as they stood at the time [AI]. The stress test reached the same conclusion [ST §9].
- **[proposed]** Forward-only; no LLM backtests. One call per ticker per month for statistics. Confidence intervals always; "insufficient sample" until ~200+ graded 12-month calls per rating bucket.
  - **(new in v4) How many calls it takes** [T][AI]:
    - 500 calls made on the same date may be worth only about 10–80 independent observations, because the stocks share market and sector moves.
    - Telling a 57% hit rate from 50% takes about 200 *independent* calls; telling 55% from 50% takes about 400.
    - Years of record needed ≈ (2 ÷ information ratio)², about 16 years at an information ratio of 0.5.
    - Cluster standard errors by forecast date. Label results "descriptive, not statistically conclusive" until the pre-registered test date.
- **(new in v4) Presentation** [T]:
  - Annualized excess returns with confidence intervals and calendar-year tables, not cumulative percentages.
  - All three rating buckets, equal- and cap-weighted, before and after a stated cost.
  - A separate record for each methodology version.
- **(new in v4) Backtests are internal only.** Log every weighting variant tried and judge the best one with a deflated Sharpe ratio, which raises the bar for each variant tried. Never splice a backtest onto the live record, and don't show it on the public site (§15) [T][AI].
- **(new in v4)** Warn in advance that Sells will look worst in sharp rebounds after bear markets, when past losers jump (momentum crashes) [T].

## 10. Stack and infrastructure [proposed]

- **Web:** Next.js 15 + Tailwind on Vercel. Report view, methodology, track record, auth, quotas.
- **Engine:** Python FastAPI service, the only place numbers are made. Container host TBD.
- **Jobs:** Trigger.dev or Inngest (reports take minutes; Vercel functions time out).
- **Database:** Postgres (Supabase or Neon). Tables: `users`, `reports`, `report_sections`, `claims`, `sources`, `filings`, `metrics_snapshots`, `universe_metrics` (new in v3), `runs` (new in v3), `predictions`, `grades`.
- **Contract:** Pydantic schemas → generated TypeScript types.
- **Run record (new in v3):** every report logs steps, timings, model IDs, prompt versions, Jev version, tokens and cost.
- **Auth:** provider TBD (Supabase Auth, Clerk, or similar).
- **Secrets:** API keys in environment variables only.

### Scheduled jobs (new in v3)

- **Nightly universe refresh:** fundamentals and metrics for all ~500 companies → sector percentiles. No LLM, so nearly free. Without it there are no peer percentiles.
- **Daily new-filing check:** ingest new 10-K/10-Q/8-K filings. **(new in v4)** Plus Form 4 filings.
- **Grading cron:** grade calls that hit 3/6/12 months.
- **Daily hash digest** of the prediction log.
- **Phase 4:** overnight Batch API pre-generation of S&P 500 reports at 50% off.

## 11. Folder layout

```
stock-report/
├─ apps/web/              # Next.js: report view, methodology, track record, auth, quotas
├─ services/engine/       # Python
│  ├─ data/               # edgar, prices, fred, news
│  ├─ normalize/          # tag mapping, fiscal periods, restatements, share classes
│  ├─ universe/           # S&P 500 list, SIC → sector map, nightly peer table
│  ├─ metrics/            # ratios, growth, earnings quality, momentum
│  ├─ scoring/            # sector percentiles, weights.yaml
│  ├─ valuation/          # dcf, comps, equity bridge, financials path, guardrails
│  ├─ rating/             # uncertainty levels, bands.yaml
│  ├─ text/               # section parser, paragraph IDs, source store
│  ├─ llm/                # prompts, extract, narrate, skeptic
│  ├─ verify/             # jev_claims, numeric_guard, citation_check
│  ├─ pipeline/           # run_report: step sequence + run record
│  └─ schemas/            # Pydantic models
├─ jobs/                  # report job, nightly universe, filing check, grader, digest
├─ evals/                 # golden tickers, number tests, citation tests, regression
└─ docs/designs/          # EGM design docs
```

**(new in v4)** `metrics/` also holds net issuance and insider purchases. `text/` also holds the year-over-year filing comparison. `rating/` also holds the red-flag overrides and the rating buffer.

## 12. Evals and testing [proposed]

- **Golden set:** ~50 tickers with frozen inputs, including banks, REITs and a negative-FCF company.
- **Number tests:** 10 hand-verified numbers per golden ticker vs. EDGAR; unit tests for every ratio and the DCF.
- **Citation tests:** precision checked with Jev plus spot human labels.
- **Regression:** diff rating, target and score against the last golden run whenever prompts, weights or code change.
- **Model choice:** run Liam's 10-K/10-Q benchmark on Haiku 5.5 vs. Sonnet 5.5 for extraction.
- **(new in v4)** Never evaluate an LLM output on dates before that model's training cutoff. Models remember market history, and the effect is worst for large, well-known companies, which is the whole S&P 500 [AI].
- **(new in v4)** Any backtest of the score uses point-in-time fundamentals (filing dates) and historical index membership, and logs every variant tried [AI].

## 13. Build order

- **Phase 0:** eval harness and golden set; pick the extraction model.
- **Phase 1 (v1):** EDGAR → metrics → universe percentiles → score; DCF + comps + financials path → range → rating; text layer + extraction + cited narrative; numeric guard; prediction log; ticker-day cache; auth, quotas, budget guard, disclaimers. **(new in v3)** Market context v1 moves here: FRED macro, sector ETF relative strength, Item 7A, since the report is required to have it. **(new in v4)** Also in Phase 1:
  - net issuance and insider-purchase metrics;
  - the year-over-year filing comparison (code similarity score only);
  - red-flag overrides and the rating buffer;
  - the hashed scoring rulebook, written before the first logged call.
- **Phase 2:** Claude skeptic, Jev gate (tuned + held-out labels), methodology page, public track-record page. **(new in v4)** Plus labelling the changed paragraphs as positive or negative.
- **Phase 3:** news (licensed), Jev news triage, Haiku summaries, sentiment factor added to the score. **(new in v4)** The sentiment factor is dropped: news feeds the narrative only.
- **Phase 4:** hybrid RAG (pgvector), transcripts (licensed), refit internal probability, overnight batch pre-generation. **(new in v4)** Optional: learned score weights (elastic net, or IPCA, a linear factor model that kept its edge among liquid stocks), published as dated snapshots rather than a black box [AI].

## 14. Cost (estimate; measure in Phase 1)

Sonnet narrative ~$0.20 + skeptic ~$0.10 + Haiku extraction (a few cents) + Jev (under 1¢) ≈ $0.30–0.40 per fresh report. The nightly universe job uses no LLM. With one report per ticker per day, $200/month covers roughly 500–650 fresh reports. The price-data display license is the real monthly cost.

(The stress test revises these numbers and challenges the on-demand design; see [ST §0–1]. Not folded in until §16 Q1 is settled.)

## 15. Legal posture (general info, not legal advice)

- Publisher model: the same report for every user on a given ticker and day; no advice tailored to anyone's holdings; no auto-trading; a regular refresh schedule; a conflicts policy.
- No "AI that beats the market" marketing; lead with transparency and the track record.
- Disclaimers: not personalized advice; methodology and limits; date-stamped data.
- One-hour securities-lawyer review before public launch.
- **(new in v4) Describe the system as it is.** In March 2024 the SEC settled "AI washing" cases (Delphia, $225,000; Global Predictions, $175,000) over AI claims the firms couldn't back up. Say "code builds the rating; Claude writes the cited narrative," and avoid "AI-driven forecast" language [AI].
- **(new in v4) No backtests on the public site.** The SEC fined advisers for hypothetical performance on public websites (2023: nine advisers, $850,000; 2024: five, $200,000) and said such figures generally don't suit a mass audience [T].
- **(new in v4) For the lawyer** [T]:
  - **Disclosure template:** FINRA Rule 2241 (research reports) as the model for the disclosures in §3.
  - **Price ranges as projections:** FINRA's Rule 2210 change, approved Oct 15, 2026, allows performance projections but not in mass-retail communications. Do 12-month price ranges count as projections?
  - **Adviser registration:** does the app qualify for the publisher exclusion from adviser registration (*Lowe v. SEC*, 1985)? The research did not cover this.

## 16. Open questions for brainstorm

1. Report freshness: one report per ticker per day, or regenerate after major news? *(In discussion; see [ST §1].)*
2. Monetization: free, freemium or paid?
3. Will Finava ever use these reports? If so, how is the wall enforced?
4. Factor weights (v1 without sentiment, then with it) and sector-specific metrics. *(v4 input: §8 evidence table; sentiment is dropped, so "then with it" no longer applies.)*
5. Exact DCF rules: forecast length, fade period, how the risk bucket is assigned. *(v4 input: Morningstar's three-stage DCF with a moat-dependent fade; §8 valuation rules.)*
6. Financials/REIT valuation details.
7. Job runner (Trigger.dev vs. Inngest), Python host, auth provider.
8. PDF export or web only?
9. Name.
10. **(new in v4)** Base case for the 12-month range: expected return only [AI], or expected return plus a partial closing of the value gap, e.g. one third a year [T]?
11. **(new in v4)** Skeptic independence: the AI report recommends a different model family than the writer, but the app runs on Claude [decided]. Which Claude model and prompt setup gives the skeptic enough independence?
12. **(new in v4)** Rating horizon: keep 12 months, or lengthen it? Value gaps close over about three years, and Morgan Stanley rates over 12–18 months [T].
