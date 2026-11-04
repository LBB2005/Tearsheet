# Stock Report App — Concept Brief v3 (working name TBD)

Starting notes for `/egm-brainstorm` → `/egm-draft`. Updated Oct 30, 2026.
**[decided]** = settled by Liam. **[proposed]** = research-backed default to stress-test. **(new in v3)** = gap found while writing out the full structure.

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

1. **Header:** price snapshot and time, data as-of dates, rating, score, target range, uncertainty level.
2. **Rating and price target:** bear / base / bull range shown first, the uncertainty level, and the base-rate note (only 38% of 2000–2009 US analyst 12-month targets were met at the horizon).
3. **Score and factor breakdown:** each factor → its metrics → sector percentile → weight → contribution.
4. **Valuation detail:** DCF assumptions per scenario, peer multiples table, guardrail flags.
5. **Business and competitive position (moat):** from 10-K Item 1 and 1A.
6. **Key risks:** 10-K Item 1A plus changes in the latest 10-Q.
7. **Recent results and management commentary:** MD&A plus the latest 8-K earnings release.
8. **Market context:** macro regime (FRED), sector vs. S&P 500, the stock vs. its sector, rate/FX sensitivity (Item 7A), news (Phase 3).
9. **Methodology, sources and disclaimers.**

## 4. The pipeline (fixed steps, plain Python) [proposed]

Python makes every number. Claude only extracts and writes. No agents, no debate, no LLM-driven control flow.

1. **Resolve:** name → ticker → CIK (SEC's ticker list). Code.
2. **Fetch:** XBRL company facts, latest 10-K, 10-Q and 8-K (Item 2.02 earnings release) from EDGAR; prices for the stock, its sector ETF and SPY; FRED series. Save a snapshot and hash it. Code.
3. **Normalize:** edgartools standardization, TTM figures, fiscal-year alignment (e.g. NVIDIA's year ends in January), restatements; keep the raw XBRL tag beside every value. Code.
4. **Metrics:** ratios for each factor. Code.
5. **Score:** sector percentiles against S&P 500 peers (from the nightly universe table) × `weights.yaml` → composite score. Code.
6. **Value:** DCF (bear/base/bull), comps, equity bridge, guardrails → target range + uncertainty level. Code.
7. **Rate:** `bands.yaml` → Buy / Hold / Sell. Internal probability (fixed logistic prior) logged, not shown. Code.
8. **Text layer:** parse filings into sections and paragraph IDs (see §5). Code.
9. **Extract:** Claude Haiku, one call per filing section, in parallel → evidence items with paragraph IDs. LLM, schema-validated.
10. **Narrate:** Claude Sonnet gets the metrics JSON + evidence items + the cited paragraphs → schema-bound sections with `{{metric:…}}` placeholders and paragraph citations. LLM.
11. **Render:** fill placeholders from computed values; numeric guard rejects any number that doesn't match a computed value or a cited source. Code.
12. **Verify:** Jev checks each claim; uncertain claims plus a holistic review go to the Claude skeptic; failed section regenerated once; still failing → claim removed with a visible note. Code + Jev + LLM.
13. **Publish:** save the report, sections, claims and sources; write the prediction-log row; cache for the day. Code.

## 5. The RAG system

### v1: retrieval by document structure (no vector database) [proposed]

- **Ingest:** download filings from EDGAR by accession number. Follow SEC fair-access rules: declared User-Agent with contact email, at most 10 requests/second.
- **Parse:** split into Items with edgartools. 10-K: Item 1 (Business), 1A (Risk Factors), 7 (MD&A), 7A (Market Risk). 10-Q: Part I Item 2 (MD&A), Part II Item 1A (risk factor changes). 8-K: Exhibit 99.1 earnings release. Narrative text only; numbers come from XBRL.
- **Chunk:** paragraphs with stable IDs (`accession#item1A#p37`), stored in a `sources` table with company, filing type, filing date and period. Never edited after ingest.
- **Select (the "retrieval"):** a fixed map from report section to filing sections:
  - Business and moat ← 10-K Item 1 **(new in v3; Item 1 was missing)** + Item 1A
  - Key risks ← 10-K Item 1A + latest 10-Q Part II Item 1A
  - Results and commentary ← 10-K Item 7 + latest 10-Q MD&A + latest 8-K earnings release
  - Rate/FX sensitivity ← 10-K Item 7A **(new in v3)**
  - News (Phase 3) ← licensed headlines + snippets
- **Size control (new in v3):** one filing section per extraction call, kept under 100K tokens (Haiku 5.5's price rises 5× above that). Very long sections are split into ordered windows.
- **Extract:** Haiku returns evidence items `{statement, type, paragraph_ids[]}` (types: risk, driver, guidance, competition). Paragraph IDs must exist in this company's sources.
- **Generate:** Sonnet writes claims that cite paragraph IDs.
- **Prompt caching:** the narrative and skeptic calls share the same source block, so caching cuts the second call's cost. **(new in v3, correction)** Prompt caches last minutes, not a day; the ticker-day report cache is what shares cost across users.
- **Verify:** Jev checks each claim against exactly the cited paragraphs (small enough for its 32K budget); `citation_check` confirms each ID exists and belongs to this company and filing.
- **Refresh:** a daily job checks EDGAR for new filings from S&P 500 companies and ingests them.
- **Evaluate:** citation precision (does the paragraph support the claim?), recall of material risks, on the golden set.

### v2: hybrid retrieval [proposed, later]

- Triggered by multi-period work: year-over-year risk factor changes, 8 quarters of transcripts, peer filings for moat comparisons.
- Paragraph embeddings stored in **pgvector inside the same Postgres** (no new database), plus Postgres full-text keyword search, plus a reranker.
- One query per report section with metadata filters (company, filing type, period); top results go into the same extract → narrate → verify flow.
- Evaluate retrieval with recall@k on labeled questions.

## 6. Verification [decided + proposed]

- **[decided]** Jev (TypeSafe AI) labels each claim against its cited paragraphs: supported / contradicted / insufficient evidence. Above the confidence threshold → auto-pass; everything else → Claude skeptic.
- **[decided]** Liam hand-labels ~300 claims to set the threshold. **(new in v3)** Split them into a tuning set and a held-out set; in one independent test, Jev's error came in higher on held-out data than the target it was tuned to.
- **[proposed]** Claude skeptic (fresh context; sees only the draft, the metrics JSON and the cited paragraphs) flags bias, omitted counter-evidence, stale data, and tone that contradicts the rating.
- **[proposed]** Numeric guard and citation check run before Jev.
- **[proposed]** Pin the Jev version (e.g. `jev-1.13.0`) and log it; fall back to Claude if Jev is down. Never use Jev for the rating, score, target, moat scoring, arithmetic, dates or long documents.
- **[proposed]** Pin Claude model IDs and prompt versions; log both on every run.

## 7. Data and licensing

- **[decided]** Free price data during development while only Liam uses the app; buy a display license before anyone else uses it (e.g. Twelve Data business tier from ~$149/mo; verify on the vendor's terms page).
- **[proposed]** Fundamentals and filings: SEC EDGAR via edgartools (public, free).
- **[proposed]** Macro: FRED (check each series' copyright note).
- **[proposed]** Sector ETFs and SPY: from the same price feed (prices also feed the momentum factor).
- **[proposed]** v1: 8-K earnings releases instead of call transcripts.
- **[proposed]** News (Phase 3): headlines + links + our own summaries only, from a source that allows display.
- **(new in v3)** **Sectors:** GICS is proprietary (MSCI / S&P Dow Jones Indices). Use SEC SIC codes mapped to our own sector groups.
- **(new in v3)** **Analyst estimates:** "EPS revisions" and "consensus growth" need estimate data that isn't in the plan. v1 uses trailing data only; estimates become a separate licensing decision.
- No yfinance or Finnhub in production.

## 8. Scoring, valuation, rating [proposed]

- **Score:** sector-relative percentiles (SIC-based groups within the S&P 500), weights in a published `weights.yaml`.
- **(new in v3)** **v1 factors:** valuation, growth, profitability, balance sheet, earnings quality, momentum. The sentiment/news factor joins in Phase 3, when news exists. Weights for v1 must add up without it.
- **DCF:** growth fades from trailing rates toward a GDP-like terminal rate; margins revert toward the sector median; cost of equity from a fixed risk-bucket table (7.5 / 9.0 / 11.0 / 13.5%). No LLM input.
- **(new in v3)** **Equity bridge:** enterprise value → minus net debt, leases, minority interest and preferred → divided by diluted shares across all share classes. Stock-based compensation is treated as a cost.
- **Comps:** median EV/EBIT and P/E of sector peers, winsorized.
- **Guardrails:** terminal growth below the risk-free rate; flag terminal value > ~75%; DCF vs comps gap > 40% → high uncertainty; negative FCF → comps only, "valuation not meaningful."
- **(new in v3)** **Financials and real estate (about a fifth of the S&P 500) need their own valuation path before v1:** banks and insurers on P/B vs. ROE and P/E; REITs on price/FFO. A cash-flow DCF doesn't work for them.
- **Rating:** uncertainty-scaled bands (Morningstar-style) in `bands.yaml`. Buy = enough discount to base value for its uncertainty level AND score ≥ 60th sector percentile. Sell = enough premium OR score ≤ 25th percentile. Hold = everything else. **(new in v3)** The "negative revisions" condition is dropped until estimate data exists.
- Methodology page: factor edges usually shrink 30–60% after publication.

## 9. Track record

- **[decided]** "Probability of beating its sector over 12 months" is tracked and graded internally, published only once enough calls are graded.
- **[proposed]** Append-only prediction log (ticker, time, price, score, rating, bear/base/bull, uncertainty, model and prompt versions, data snapshot hash) with a daily public hash digest.
- **[proposed]** Graded at 3/6/12 months: excess return vs. sector ETF (primary) and SPY; rating hit rate; price inside the bear–bull range; Brier score on the internal probability.
- **[proposed]** Forward-only; no LLM backtests. One call per ticker per month for statistics. Confidence intervals always; "insufficient sample" until ~200+ graded 12-month calls per rating bucket.

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
- **Daily new-filing check:** ingest new 10-K/10-Q/8-K filings.
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

## 12. Evals and testing [proposed]

- **Golden set:** ~50 tickers with frozen inputs, including banks, REITs and a negative-FCF company.
- **Number tests:** 10 hand-verified numbers per golden ticker vs. EDGAR; unit tests for every ratio and the DCF.
- **Citation tests:** precision checked with Jev plus spot human labels.
- **Regression:** diff rating, target and score against the last golden run whenever prompts, weights or code change.
- **Model choice:** run Liam's 10-K/10-Q benchmark on Haiku 5.5 vs. Sonnet 5.5 for extraction.

## 13. Build order

- **Phase 0:** eval harness and golden set; pick the extraction model.
- **Phase 1 (v1):** EDGAR → metrics → universe percentiles → score; DCF + comps + financials path → range → rating; text layer + extraction + cited narrative; numeric guard; prediction log; ticker-day cache; auth, quotas, budget guard, disclaimers. **(new in v3)** Market context v1 moves here: FRED macro, sector ETF relative strength, Item 7A, since the report is required to have it.
- **Phase 2:** Claude skeptic, Jev gate (tuned + held-out labels), methodology page, public track-record page.
- **Phase 3:** news (licensed), Jev news triage, Haiku summaries, sentiment factor added to the score.
- **Phase 4:** hybrid RAG (pgvector), transcripts (licensed), refit internal probability, overnight batch pre-generation.

## 14. Cost (estimate; measure in Phase 1)

Sonnet narrative ~$0.20 + skeptic ~$0.10 + Haiku extraction (a few cents) + Jev (under 1¢) ≈ $0.30–0.40 per fresh report. The nightly universe job uses no LLM. With one report per ticker per day, $200/month covers roughly 500–650 fresh reports. The price-data display license is the real monthly cost.

## 15. Legal posture (general info, not legal advice)

- Publisher model: the same report for every user on a given ticker and day; no advice tailored to anyone's holdings; no auto-trading; a regular refresh schedule; a conflicts policy.
- No "AI that beats the market" marketing; lead with transparency and the track record.
- Disclaimers: not personalized advice; methodology and limits; date-stamped data.
- One-hour securities-lawyer review before public launch.

## 16. Open questions for brainstorm

1. Report freshness: one report per ticker per day, or regenerate after major news?
2. Monetization: free, freemium or paid?
3. Will Finava ever use these reports? If so, how is the wall enforced?
4. Factor weights (v1 without sentiment, then with it) and sector-specific metrics.
5. Exact DCF rules: forecast length, fade period, how the risk bucket is assigned.
6. Financials/REIT valuation details.
7. Job runner (Trigger.dev vs. Inngest), Python host, auth provider.
8. PDF export or web only?
9. Name.
