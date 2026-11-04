# Stock Report App — Concept Brief v5 (working name TBD)

Starting notes for `/egm-brainstorm` → `/egm-draft`. Updated Nov 2, 2026.

**Tags**

- **[decided]**: settled by Liam.
- **[proposed]**: research-backed default to stress-test.
- **(new in v3)**: a gap found while writing out the full structure.
- **(new in v4)**: taken from the two research reports.
- **(new in v5)**: from the Nov 2 brainstorm: the switch to a free desktop app on the user's own AI tools, plus Liam's answers.

**Sources**

- **[T]**: `reports/Stock price prediction methods.md` (academic research, sell-side analysts, valuation, commercial ratings).
- **[AI]**: `reports/AI stock price prediction.md` (machine learning, text analysis, LLMs, forecast evaluation, AI track records).
- **[P]**: `docs/local-cli-pivot.md` (the stress test of the switch and the record of each answer).
- **[ST]**: `docs/brief-stress-test.md` (the stress test of v3).
- **Guide**: `Auto-Connect to Local AI CLIs Implementation Guide.pdf` (Nov 2, 2026; based on Realm, github.com/31Carlton7/realm, MIT).
- Earlier versions: `docs/brief-v3.md`, `docs/brief-v4.md`.

## What changed in v5

1. **No longer a hosted web app on the Claude API.** It is a free, downloadable Mac desktop app, open source on GitHub, that runs on the AI tools each user already has (Claude Code or Codex). Every [decided] item in §1 changed as a result.
2. **Personal use. The success bar is "useful to Liam."** Reports and the prediction log stay on each user's computer. There is no public track record, server, account system or price-display license.
3. **Every run is fresh**: new numbers and new writing each time. The AI's evidence from a filing is saved per filing, because filings never change.
4. **New report content:** news and credible-source scanning (§3.7), and macro and industry trends (§3.8).
5. **The stack is now Electron** with a TypeScript background process, a bundled Python engine, and SQLite. Vercel, Postgres, the job runner and auth are gone.
6. **The cost model is now each user's subscription.** The v3 and v4 cost concerns ($200/month cap, budget guard, display license) no longer apply.

---

## 1. What it is

All [decided] items below were **changed by Liam on Nov 2 (new in v5)**. The v4 versions said: a web app, a public app other people use, and runs on the Claude API using Max 20x's $200/month API credits.

- **[decided]** A free desktop app (Mac first) that people download and run, not a website. Source code on GitHub (MIT license) plus a direct download link. Built so non-technical people can use it.
- **[decided]** Type a company name or ticker → get one finished, cited research report shown in the app. One action, not a chat.
- **[decided]** Personal use. Each person runs their own copy. Reports and the prediction log stay on their own computer.
- **[decided]** Success bar: the app is useful to Liam.
- **[decided]** Separate from Finava. No portfolio, no personalization.
- **[decided]** Coverage: S&P 500 only.
- **[decided]** The AI runs on the user's own Claude Code or Codex.
  - **No account of its own.** On launch, the app finds those tools. If one is installed and signed in, the app uses it.
  - **If one is missing,** one button installs it or signs the user in.
  - **Fallback:** an API key.
- **[decided]** Free: nothing to pay beyond the AI subscriptions the user already has. Jev is the exception: a small cost, with the user's own key.
- **(new in v5)** **No Google sign-in or cloud storage for now** [P §0]. Backup could later use the user's own Google Drive.

## 2. User flow (new in v5)

1. **Open the app.** It finds Claude Code and Codex and checks whether each is signed in (guide Steps 1–2).
2. **Connect, if needed.** If neither tool is ready, a Connections screen offers Install or Sign-in buttons. Each runs the vendor's own command, shown before it runs (guide Steps 6–7). The buttons can be turned off by one setting (see §15).
3. **Pick a company.** Type a name or ticker. The app resolves it to a ticker and SEC CIK. **(new in v3)** Handle ambiguity and share classes: "Google" → Alphabet (GOOGL/GOOG); per-share values use total shares across all classes. Anything outside the S&P 500 → "not covered yet."
4. **Run.** A progress screen shows each step. Every run is fresh [P §10].
5. **Read.** The finished report appears in the app and is saved on the computer, along with a prediction-log entry.

## 3. Report layout [proposed; outline agreed by Liam on Nov 2]

The look and feel in the app (layout, charts, first screen) is still open and gets its own brainstorm [P §11.5].

### 3.1 Rating, score and price range

Price and time, data as-of dates, rating, score, target range and uncertainty level. **(new in v4)** The uncertainty level gets the same visual weight as the rating.

- **Range:** bear / base / bull are declared percentiles (10th, 50th, 90th) [AI].
- **Base-rate note** [T] (Bradshaw, Brown & Huang 2013, 2000–2009):
  - 38% of sell-side 12-month targets were met at the 12-month mark, and about 64% at some point during the year.
  - Targets implied about 15 points more return than followed.
  - The average absolute error was about 45%.
- **Always a target,** including on Holds and Sells. The rating is presented as a summary of the thesis.

### 3.2 Score breakdown by factor

Each factor → its metrics → sector percentile → weight → contribution.

### 3.3 Valuation detail

DCF assumptions per scenario, peer multiples table, guardrail flags. **(new in v4)** It also shows the terminal value's share of total value, and each multiple separately from the earnings behind it.

### 3.4 Business and competitive position (moat)

From 10-K Item 1 and 1A.

### 3.5 Key risks and red flags

10-K Item 1A plus changes in the latest 10-Q. **(new in v4)** A red-flags box:

- a restatement (8-K Item 4.02);
- a material weakness (10-K Item 9A);
- going-concern language;
- a large year-over-year change in the risk-factor text.

### 3.6 Recent results and management commentary

MD&A plus the latest 8-K earnings release.

### 3.7 News and what credible sources are saying (new in v5)

Recent news, public bank research and insights pages, public fund letters and memos, short-seller reports and company press releases [P §11].

- **Each item** shows its date, source, source type, link, and a short summary written by the AI, not the article text.
- **Scope:** the last 30 days, plus older major events.
- **Sources:** only from an allowlist the user can edit.
- **Context only:** news never affects the score or rating. For large companies it is priced in within about a day [AI].

### 3.8 Macro and industry trends (new in v5; replaces "Market context")

[P §12]

- **Macro forces that matter to this company:** only those the company names as material (Item 7A rate and currency sensitivity; Item 1A risks about rates, inflation, commodities and consumer spending), shown with current FRED numbers. It does not forecast the economy [T].
- **Industry trends:** the "known trends and uncertainties" in the company's MD&A, compared with the same section in 3–5 of its largest peers' filings, plus the news scan.
- **The stock vs. its sector and SPY:** relative strength, computed by code.
- **Rule:** every trend statement cites a filing paragraph, an allowlisted article, or a computed number.

### 3.9 Methodology, sources and disclaimers

Rating definitions, the method, the sources used, and data dates.

## 4. The pipeline [proposed]

Python makes every number. The AI only reads, extracts and writes. No LLM-driven control flow. **(new in v4)** The research supports this split. The tasks with strong evidence for LLMs are extracting facts, classifying events and finding what changed. Directional calls, probabilities and arithmetic stay in code [AI].

**(new in v5)** Every AI step goes through one adapter interface (guide "Adapter layer"), to Claude Code via the Claude Agent SDK or to Codex via `codex app-server`.

- **Extraction, writing and checking calls:** every tool is denied (no file, shell or web access), schema-bound output is required, and any attempt to use a tool counts as a failure.
- **The news step:** may use web search and page reading only, in an empty temporary folder [P §4, §11.3].

1. **Resolve:** name → ticker → CIK (SEC's ticker list). Code.
2. **Fetch:** code. **(new in v5)** Fetched on demand per run:
   - the company's XBRL facts and latest 10-K, 10-Q and earnings 8-K;
   - Form 4 insider filings;
   - XBRL facts for its sector peers;
   - 12 months of daily closing prices for the company, its peers, the sector benchmark and SPY;
   - FRED series.

   Cached for the day. Every fundamental value is stored with its filing date. Never use restated values or SEC's `frames` API for anything time-sensitive [AI].
3. **Normalize:** edgartools standardization, TTM figures, fiscal-year alignment, restatements, share classes; keep the raw XBRL tag beside every value. Code.
4. **Metrics:** ratios for each factor, plus net share issuance, unusual insider purchases, and filing-text change scores. Code.
5. **Score:** percentiles within the company's sector peer group × `weights.yaml` → composite score. Code. **(new in v5)** Peers are computed per run from fetched data, replacing the nightly universe job.
6. **Value:** DCF (bear/base/bull), comps, equity bridge, guardrails → range + uncertainty level. Code.
7. **Rate:** `bands.yaml` → Buy / Hold / Sell, with red-flag caps and a buffer against flip-flopping. Internal probability logged, not shown. Code.
8. **Text layer:** parse filings into sections and paragraph IDs; compare Items 1A, 3, 7 and 7A with the prior year. Code.
9. **News scan (new in v5):** AI, web-only. Search allowlisted sources for the last 30 days, then save each article's text, URL, fetch date and paragraph IDs locally.
10. **Extract:** AI, one call per filing section (company, peers, articles) → evidence items with paragraph IDs, schema-validated. **(new in v5)** Saved per filing, so a filing is read once and reused across runs and across reports in the same sector.
11. **Narrate:** AI gets the metrics JSON, evidence items and cited paragraphs → schema-bound sections with `{{metric:…}}` placeholders and paragraph citations. Runs fresh every time.
12. **Render:** fill placeholders from computed values; the numeric guard rejects any number that doesn't match a computed value or a cited source. Code.
13. **Verify:** citation check and numeric guard (code), then Jev if a key is set, then the skeptic. A failed section is regenerated once; if it still fails, the claim is removed with a visible note.
14. **Save:** report, sections, claims, sources and the prediction-log row in SQLite. Log the as-of date, documents used, the AI tool, model ID and training cutoff, and prompt versions.

## 5. Retrieval [proposed]

### v1: retrieval by document structure (no vector database)

- **Ingest:** download filings from EDGAR by accession number. Follow SEC fair-access rules: declared User-Agent with the project's contact email, at most 10 requests/second (each user's copy calls from their own address).
- **Parse:** split into Items with edgartools. 10-K: Items 1, 1A, 3, 7, 7A. 10-Q: Part I Item 2, Part II Item 1A. 8-K: Exhibit 99.1. Narrative text only; numbers come from XBRL.
- **Chunk:** paragraphs with stable IDs (`accession#item1A#p37`, plus parser version), stored in a `sources` table. Never edited after ingest.
- **(new in v5) Web articles:** a second source type, with IDs like `url-hash#p12`, fetch date and source type. Same rules.
- **Select:** a fixed map from report section to sources:
  - Business and moat ← 10-K Items 1 and 1A
  - Key risks ← 10-K Item 1A + latest 10-Q Part II Item 1A + year-over-year changes
  - Results ← 10-K Item 7 + latest 10-Q MD&A + latest earnings 8-K
  - News ← allowlisted articles (§3.7)
  - Macro and industry trends ← Item 7A, Item 1A macro risks, the company's and 3–5 peers' MD&A trend disclosures, articles, FRED (§3.8)
- **Year-over-year change detection** **(new in v4)**: a code similarity score per paragraph; the AI labels changed paragraphs as negative or positive. Used as a red flag; low weight because there is no evidence after 2014 [AI].
- **Size control (new in v3):** one source section per extraction call, kept small; long sections are split at sub-headings with a paragraph of overlap.
- **Not used (new in v4):** dictionary tone of a 10-K (doesn't predict returns; Loughran-McDonald needs a commercial license); readability scores.

### v2: hybrid retrieval [proposed, later]

pgvector-style embeddings only if a feature needs semantic search across many companies. **(new in v5)** In a desktop app this would be a local vector index, not a database server.

## 6. Verification [decided + proposed]

- **[decided]** Jev (TypeSafe AI) labels each claim against its cited paragraphs: supported / contradicted / insufficient evidence. Above the threshold → auto-pass; everything else → skeptic.
  - **(new in v5)** Each user brings their own Jev key. **[proposed]** Jev is optional. Without a key, the AI tool checks claims itself, and the report says "verified with Jev" only when a key is set [P §10].
- **[decided]** Liam hand-labels ~300 claims to set the threshold. **(new in v3)** Split into a tuning set and a held-out set.
- **[proposed]** Skeptic, fresh context. **(new in v4)** It targets documented LLM failures: optimism, extrapolating from recent price moves, upside-only framing, prose more bullish than the code-built rating, and one-sided news. **(new in v5)** If both Claude Code and Codex are connected, the skeptic runs on whichever did not write the draft, which gives a different model family as the AI research recommends [P §10].
- **[proposed]** Numeric guard and citation check run first.
- **[proposed]** Log the AI tool, model ID and prompt version on every run. **(new in v5)** Exact model pinning is not possible across users' tools, so each supported tool gets its own golden-set run (§12).

## 7. Data and licensing

- **(new in v5, replaces [decided] v4 item)** No price-data display license. Each user's copy fetches data for that user only, under the source's personal-use terms [P §3].
- **[proposed]** Fundamentals and filings: SEC EDGAR via edgartools (free). Form 4 for insider purchases.
- **[proposed]** Prices: a free source, ideally needing no account. It must allow 12 months of daily closes for one company plus about 20–70 peers, the sector benchmark and SPY per run. **To research.**
- **[proposed]** Macro: FRED, public-domain series only.
- **(new in v5)** News and articles: through the user's own AI tool's web search, restricted to an editable allowlist. No paid news feed.
- **(new in v3)** Sectors: SEC SIC codes mapped to our own groups (GICS is proprietary).
- **(new in v3)** Analyst estimates: not in v1 (licensed). **(new in v4)** Cost: trailing-only multiples are less accurate [T].
- **(new in v4)** Effect sizes in §8 are upper bounds. No study measures them for S&P 500 members against their own sector.

## 8. Scoring, valuation, rating [proposed]

Unchanged from v4. The full text is in `docs/brief-v4.md` §8. Summary:

- **Score:** sector-relative percentiles, weights in `weights.yaml`.
  - **Weights:** profitability first, then momentum (scaled down after market falls with high volatility), then valuation. Growth is recast as capital discipline (low share issuance, low asset growth). Balance sheet and accruals are safety screens.
  - **Added signals:** net share issuance, unusual insider purchases.
  - **Never in the score:** news sentiment, LLM-derived scores, technical analysis.
  - **Expected edge:** tens of basis points a month at most; best-case directional hit rate about 55–57% [T].
- **Valuation:**
  - **DCF:** Morningstar-style buckets for cost of equity (7.5 / 9 / 11 / 13.5%). Terminal growth no higher than the risk-free rate. Reinvestment tied to growth. No exit multiple.
  - **Cross-check:** residual-income.
  - **Comps:** same-industry harmonic means, P/E preferred.
  - **Equity bridge:** across all share classes.
  - **Separate path:** for banks, insurers (P/B vs. ROE) and REITs (P/FFO).
- **12-month range:**
  - **Base case:** today's price grown at cost of equity minus dividend yield, plus one-third of the value gap (accepted by Liam on Nov 2).
  - **Bear and bull:** 10th and 90th percentiles from a volatility forecast.
  - **Uncertainty:** starts from trailing 12-month volatility.
- **Rating:**
  - **Definition:** relative to the sector benchmark (SPY second), over a 12-month horizon.
  - **Distribution:** a balanced split of Buy, Hold and Sell.
  - **Stability:** a buffer against flip-flopping.
  - **Caps:** red flags cap the rating at Hold. **[proposed]** A low-momentum cap does the same.
  - **Reporting:** factor-adjusted returns shown next to raw returns.

## 9. Prediction log and grading

- **[decided, changed in v5]** "Probability of beating its sector over 12 months" is tracked and graded. It stays in each user's local log, not published.
- **[proposed]** Append-only local prediction log. Each entry records:
  - ticker, time and price;
  - score, rating, bear / base / bull and uncertainty;
  - tool, model and prompt versions;
  - data snapshot hash.
- **[proposed]** When the app opens, it grades predictions that have reached 3, 6 or 12 months:
  - excess return vs. the sector benchmark and SPY;
  - rating hit rate;
  - share of prices inside the bear–bull range;
  - Brier score.

  Each metric is compared with a naive baseline: random ratings with the same mix, "always Hold", and a trailing-volatility range [T][AI].
- **(new in v5)** The v4 public track-record rules (rulebook hash, third-party timestamp, committed coverage list) are optional good practice now. They are only needed if results are ever published.
- **(new in v4)** Honest framing in the app:
  - **Small samples:** 500 calls on one date are worth far fewer independent observations, so small samples are labelled "descriptive, not conclusive".
  - **Momentum crashes:** Sells will look worst in sharp rebounds after bear markets.

## 10. Stack and infrastructure (new in v5) [proposed]

- **Desktop shell:** Electron, Mac first (guide's recommendation; Claude Agent SDK and node-pty are Node libraries). Windows later.
- **Background process (TypeScript):**
  - PATH fix;
  - tool detection and sign-in checks (30-second cache);
  - adapters (Claude Agent SDK; `codex app-server` JSON-lines; ACP later);
  - install and sign-in runners.

  Copy Realm's MIT files with notices in `THIRD-PARTY-NOTICES.md`.
- **Engine (Python), bundled inside the app:** started by Electron, and the only place numbers are made. Shipping its own Python is the hardest packaging task [P §9.2].
- **Storage:** SQLite on the user's computer.
- **Contract:** Pydantic schemas → generated TypeScript types.
- **Updates:** auto-update from GitHub Releases. Required, because Claude Code and Codex change their flags and output formats.
- **Signing:** Apple Developer Program, $99/year, paid by Liam. Without it, macOS blocks the app for non-technical users.
- **Gone from v4:** Next.js on Vercel, FastAPI service, Trigger.dev/Inngest, Postgres, auth provider, scheduled server jobs.
- **Run record:** steps, timings, tool, model IDs, prompt versions, Jev version, tokens.

## 11. Folder layout (new in v5) [proposed]

```
stock-report/
├─ apps/desktop/
│  ├─ src/main/             # Electron main: PATH fix, tool table, probe, install, sign-in
│  └─ src/renderer/         # app window: Connections screen, search, report view
├─ packages/adapters/       # AgentAdapter interface; claude, codex, acp; JSON-lines
├─ services/engine/         # Python (bundled)
│  ├─ data/                 # edgar, prices, fred, form4, articles
│  ├─ normalize/            # tag mapping, fiscal periods, restatements, share classes
│  ├─ peers/                # SIC → sector map, peer-group fetch
│  ├─ metrics/              # ratios, issuance, insider purchases, momentum
│  ├─ scoring/              # sector percentiles, weights.yaml
│  ├─ valuation/            # dcf, residual income, comps, equity bridge, financials path, range
│  ├─ rating/               # uncertainty, bands.yaml, red-flag caps, buffer
│  ├─ text/                 # section parser, paragraph IDs, year-over-year comparison
│  ├─ llm/                  # prompts, news scan, extract, narrate, skeptic (via adapters)
│  ├─ verify/               # numeric guard, citation check, jev
│  ├─ log/                  # prediction log, grading
│  ├─ pipeline/             # run_report: step sequence + run record
│  └─ schemas/              # Pydantic models
├─ evals/                   # golden tickers, number tests, citation tests, per-tool runs
├─ THIRD-PARTY-NOTICES.md
└─ docs/designs/            # EGM design docs
```

## 12. Evals and testing [proposed]

- **Golden set:** start with about 20 tickers covering the hard cases (bank, insurer, REIT, utility, negative cash flow, January year-end, multi-class, Exhibit 13 filer), then grow to 50 [ST §12].
- **Number tests:** hand-checked numbers per golden ticker vs. EDGAR; unit tests for every ratio and the DCF.
- **Citation tests:** precision checked with Jev (when available) plus spot human labels.
- **(new in v5) Tool tests:**
  - **Golden runs per tool:** separate runs on Claude Code and Codex.
  - **Usage per report:** measured on Pro and Max plans.
  - **Prompt-injection tests:** pages that try to instruct the AI must not get any tool to act.
  - **One real-CLI test per tool:** to catch flag changes after vendor updates.
- **(new in v4)** Never evaluate an AI output on dates before that model's training cutoff. Backtests of the score use point-in-time data and log every variant tried.

## 13. Build order (new in v5)

- **Phase 0: prove it on Liam's Mac.**
  - **Prototype:** one script finds `claude` and `codex`, checks sign-in, and gets an answer from each with no API key set (guide build step 1).
  - **Eval groundwork:** eval harness and golden set.
- **Phase 1: useful to Liam** (the success bar).
  - **Engine:** EDGAR → metrics → peer percentiles → score → valuation → range → rating.
  - **Text:** extraction and cited narrative through the adapter.
  - **Checks:** numeric guard and citation check.
  - **Log:** local prediction log.
  - **Window:** a plain report window.
- **Phase 2: complete report.**
  - **Sections:** news scan with allowlist and guards; macro and industry trends.
  - **Verification:** skeptic (on the other tool when both are connected), optional Jev.
  - **Grading:** prediction-log grading.
- **Phase 3: ready for other people.**
  - **Setup:** Connections screen with Install and Sign-in buttons, switchable off.
  - **Distribution:** signed and notarized Mac build, auto-update, GitHub download link.
  - **Before the link goes public:** email Anthropic sales and check OpenAI's terms (§15).
- **Phase 4: later.**
  - **Product:** report look polish (after its brainstorm), PDF export, Windows.
  - **Model:** learned score weights published as dated snapshots, ACP tools.

## 14. Cost (new in v5)

- **For users:** free beyond their existing Claude or ChatGPT subscription, plus an optional Jev key. Usage per report is unmeasured. A report reads about 150K tokens of filings the first time a filing is seen; later runs reuse saved evidence. Measure on Pro and Max in Phase 0.
- **For Liam:** $99/year Apple Developer Program. GitHub hosting and Releases are free.
- **No longer applies:** the v3 and v4 API-credit budget, budget guard, per-user limits, and price-display license.

## 15. Legal and terms (general information, not legal advice)

- **(new in v5)** Anthropic's Agent SDK docs bar third-party products from offering claude.ai login or routing requests through users' Pro or Max plans without prior approval. The only documented route is to contact sales [P §8]. Personal use of your own Claude Code is fine. The Install and Sign-in button for other people is the case the rule names.
  - **Before the public download link:** email Anthropic sales.
  - **Fallback:** the button can be switched off, leaving detect-only plus an API key.
- **(new in v5)** OpenAI's terms for third-party apps driving Codex on a ChatGPT login: unchecked; same switch.
- **(new in v4)** Describe the system as it is ("code builds the rating; your AI writes the cited narrative"). The SEC's 2024 "AI washing" cases punished claims firms couldn't back up.
- No personalized advice, no trading, date-stamped data, plain disclaimers. **(new in v5)** A lawyer review is optional while the app is a personal tool. It is needed only if ratings or results are ever published.

## 16. Open questions

1. **Name.**
2. **Report look and feel in the app:** a separate brainstorm.
3. **Free price source:** which one meets the per-run need in §7 under personal-use terms?
4. **Approval:** Anthropic's answer on the Install and Sign-in button, and OpenAI's terms for Codex.
5. **Details for `/egm-draft`:** exact factor weights, DCF stages and fade, financials and REIT details, the peer-group size rule.
6. **Windows timing.**
