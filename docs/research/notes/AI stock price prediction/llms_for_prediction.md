# LLMs for Stock Return Prediction, Earnings Prediction and Equity Analysis (incl. Lookahead Bias)

Research notes current to early November 2026. Scope: GPT-4 and later, Claude, Gemini, Llama, finance-specific LLMs. Emphasis on US large caps. Status of each paper (published vs working paper) is flagged. Note on method: the web-search budget ran out partway through, so several items are flagged as "from search summary" or "title only" where the primary text could not be opened. Treat those as lower confidence.

---

## 1. Return prediction from text (Lopez-Lira & Tang; Chen, Kelly & Xiu; follow-ups) and whether results hold after training cutoffs

### Takeaway
LLM-scored news has predicted next-day US stock returns in a properly post-cutoff sample. Lopez-Lira & Tang (GPT-4, Oct 2021 to May 2024) report a pre-cost long-short Sharpe of 2.97. But the edge is a 1–2 day drift, concentrated in small stocks and negative news. It is fragile to costs: it becomes unprofitable at 20 bps round-trip. It also decayed fast, with Sharpe falling from 6.54 in 2021Q4 to 1.22 in Jan–May 2024. For S&P 500-type large caps the signal is weaker and mostly gone within a day, so it is not a basis for 6–12 month ratings or price targets.

### Cited Findings
- **Lopez-Lira & Tang, "Can ChatGPT Forecast Stock Price Movements?"**
  - **Versions and status:** first version April 6, 2023; current version v6, October 28/30, 2025. The v6 acknowledgements thank "Dimitris Papanikolaou (the editor), two anonymous referees", which indicates journal review. The SSRN listing is reported in a search summary as "Journal of Financial Economics, forthcoming"; I did not open the SSRN page itself. A replication package is on Mendeley Data. — [arXiv abs](https://arxiv.org/abs/2304.07619); [arXiv PDF v6](https://arxiv.org/pdf/2304.07619); [SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4412788); [Replication package](https://data.mendeley.com/datasets/f39x226htv/2)
  - **Sample:** news headlines for 4,123 US common stocks, October 2021 to May 2024. Headlines come from major news media and newswires; prices come from CRSP/TAQ.
  - **Model and cutoff:** the main model is the "gpt-4-0314" snapshot, whose training data ends in September 2021. The sample was chosen to start after that cutoff. Llama-2's cutoff is September 2022, so cross-family comparisons partly overlap Llama-2's training window. — [arXiv PDF v6](https://arxiv.org/pdf/2304.07619)
  - **Initial-reaction hit rates:** daily portfolio hit rates are 93.3% for overnight headlines and 88.8% for intraday headlines. This initial reaction is not tradable; the implied mean returns are 3.06% for overnight and 4.44% for intraday. — [arXiv PDF v6](https://arxiv.org/pdf/2304.07619)
  - **Tradable drift:**
    - Hit rates are 58% (overnight) and 55% (intraday).
    - Mean daily long-short returns are 0.34% (overnight) and 0.50% (intraday).
    - Annualized Sharpe ratios before transaction costs are 2.97 (overnight) and 2.63 (intraday).
    - The drift lasts "one to two trading days."
    - Cumulative return is about 700% from 2021m10 to 2024m5 before costs. — [arXiv PDF v6](https://arxiv.org/pdf/2304.07619)
  - **Asymmetry:** the short (negative-news) leg earns 26 bps/day (Sharpe 2.01), versus 8 bps/day (Sharpe 0.78) for the long leg. — [arXiv PDF v6](https://arxiv.org/pdf/2304.07619)
  - **Transaction costs:**
    - At 5 bps round-trip, cumulative return is over 300%. At 10 bps it is still above 100%. At 20 bps the strategy is unprofitable.
    - Daily turnover is about 190%.
    - At 10 bps, the Sharpe falls to 1.29 with full rebalancing, or 1.34 with 25% partial rebalancing.
    - The authors say exploitation is only feasible for very low-cost traders such as market makers. — [arXiv PDF v6](https://arxiv.org/pdf/2304.07619)
  - **Small vs. large caps:**
    - In drift regressions (overnight news), the base GPT-4 coefficient is 0.087 (t=4.09). The small-firm interaction (below the 20th NYSE size percentile) is 0.404 (t=4.75), so predictability is roughly 5–6x stronger in small stocks.
    - Excluding stocks priced at or below $5 and those below the 20th NYSE percentile still gives over 300% cumulative return before costs. The authors say predictability "also applies to larger and more liquid stocks." — [arXiv PDF v6](https://arxiv.org/pdf/2304.07619)
  - **Decay:** the annualized Sharpe ratio drops from 6.54 (2021Q4) to 3.68 (2022), 2.33 (2023) and 1.22 (Jan–May 2024). The authors attribute this to rising LLM adoption and improving price efficiency. — [arXiv PDF v6](https://arxiv.org/pdf/2304.07619)
  - **Model scaling:**
    - Drift-strategy Sharpe is 2.97 for GPT-4, 1.66 for GPT-3.5, 1.26 for DistilBART-MNLI, 1.05 for BART-large and 0.97 for Llama2-70b.
    - GPT-1, GPT-2 and BERT have initial-reaction hit rates below 65% and negative Sharpe ratios.
    - FinBERT gets 90% on initial reaction but 48% on drift (Sharpe -0.33), and labels 75% of headlines neutral. — [arXiv PDF v6](https://arxiv.org/pdf/2304.07619)
  - **Where GPT-4 beats GPT-3.5:** in "complex synthesis" news such as insider transactions (+25.2 bps initial reaction, +13.8 bps drift). Markets efficiently price formulaic news such as earnings announcements and clinical trials. — [arXiv PDF v6](https://arxiv.org/pdf/2304.07619)
  - **Embeddings comparison:** supervised models trained on OpenAI embeddings (rolling 6-month windows) degrade when data is scarce: Sharpe 1.71 on intraday news (26,109 obs), versus 2.53 on overnight news (105,742 obs). Zero-shot GPT-4 holds 2.63 on intraday news. — [arXiv PDF v6](https://arxiv.org/pdf/2304.07619)
- **Chen, Kelly & Xiu, "Expected Returns and Large Language Models"** (SSRN 4416687, dated November 22, 2022; still a working paper as far as I found)
  - **Approach:** embeddings from ChatGPT and the LLaMA family (plus BERT and RoBERTa) are extracted from news and used to predict cross-sectional returns. The abstract says portfolios deliver economically meaningful Sharpe ratios after transaction costs and "are not driven by look-ahead bias." — [SSRN](https://papers.ssrn.com/sol3/Delivery.cfm/4416687.pdf?abstractid=4416687&mirid=1)
  - **Coverage:** per a 2024 Wharton/Jacobs Levy discussion, the paper spans 16 global equity markets and news in 13 languages. It compares LLMs (ChatGPT, LLaMA, LLaMA2, RoBERTa, BERT) with word-based (Word2vec, SESTM) and ML baselines.
  - **Signal construction and net Sharpe:** a ridge regression maps embeddings to the 1-day-ahead return. Assuming 10 bps daily costs for large stocks and 20 bps for small stocks, the net annual Sharpe is "around 1.5."
  - **Large firms:** the discussant notes "significantly lower L-S portfolio return for large firms," likely from faster price reactions. — [Li discussion slides](https://jacobslevycenter.wharton.upenn.edu/wp-content/uploads/2024/09/ExpectedReturnAndLLM_Discussion_SophiaZhengziLi_NoPause.pdf)
- **Benchmark for any news-LLM signal: Jiang, Li & Wang (2021, JFE), "Pervasive underreaction."** A non-LLM "news momentum" signal built from intraday news-driven returns earns 34% (EW) and 25% (VW) annually over 2000–2019. It survives transaction costs. — [Li discussion slides](https://jacobslevycenter.wharton.upenn.edu/wp-content/uploads/2024/09/ExpectedReturnAndLLM_Discussion_SophiaZhengziLi_NoPause.pdf)
- **Post-cutoff evidence from point-in-time models (Kelly, Malamud, Schwab & Xu, NBER WP 35247, May 2026; working paper)**
  - **Data and design:** Dow Jones Newswire (June 1979 to May 2020), strictly out-of-sample 2014 to May 2020. Year-t articles are embedded with the December t-1 point-in-time model.
  - **Results:** out-of-sample Sharpe ratios rise from about 0.7 (ChronoGPT-base) to about 1.0–1.5 (PIT-4B). This is "close to" full-sample models that violate temporal validity.
  - **Disclosures:** Kelly and Malamud consult for AQR, and Xu is an AQR employee. — [NBER w35247 abstract](https://www.nber.org/papers/w35247); [NBER PDF](https://www.nber.org/system/files/working_papers/w35247/w35247.pdf)
- **He, Lv, Manela & Wu, ChronoBERT/ChronoGPT (arXiv v1 Feb 2025, v3 Jul 2025):** real-time models trained only on text available at each date reach next-day news-return Sharpe ratios "comparable to a much larger Llama model." The authors call lookahead bias "modest" in that application. A ScienceDirect record with a Journal of Financial Economics ISSN (S0304405X26001455) suggests it is now published in JFE (2026). — [arXiv](https://arxiv.org/abs/2502.21206); [ScienceDirect/JFE](https://www.sciencedirect.com/science/article/pii/S0304405X26001455)

### Inferences
- The best-documented LLM return signal is a very short-horizon underreaction effect: 1–2 days, strongest in small caps and on bad news. It needs near-zero trading costs, and it was decaying through 2024. None of this supports an LLM-derived 12-month rating or price target for S&P 500 names.
- For large caps the residual effect is real but smaller. The base coefficient is roughly one-fifth of the small-cap effect in Lopez-Lira & Tang, and Chen–Kelly–Xiu show significantly lower large-firm long-short returns. Large caps also price news faster, so any edge sits mostly intraday.
- Results that use genuinely post-cutoff data (Lopez-Lira & Tang's GPT-4-0314 sample; the point-in-time model papers) show the signal is not purely lookahead. But results reported on pre-cutoff data with off-the-shelf models should be discounted (see Section 3).
- The finding that markets underreact to "complex synthesis" news (insider trades, conference presentations) rather than formulaic news supports using an LLM as an event classifier or highlighter in a report. It does not support using one as a forecaster.

### Gaps
- I could not retrieve Chen, Kelly & Xiu's exact headline Sharpe ratios by market or for US large caps, or the current version date (SSRN returned 403). Only the discussant's "around 1.5 net" figure is cited.
- No paper found isolates S&P 500 constituents specifically for LLM news signals. The closest evidence is the large-cap and small-cap splits above.
- "Jiang et al." in the brief is ambiguous. I found Jiang, Li & Wang (2021), a non-LLM news-momentum benchmark, and Gao, Jiang & Yan (2025/26) on lookahead detection (Section 3). I did not find a distinct "Jiang et al." LLM return-prediction paper.
- I did not find 2025–2026 replications of Lopez-Lira & Tang on 2025–2026 data with current frontier models (GPT-5, Claude 4.x/5.x, Gemini 3/4). Whether the decay continued past May 2024 is unknown.

---

## 2. Financial statement analysis (Kim, Muhn & Nikolaev) and LLM performance on financial reasoning benchmarks / 10-K hallucination

### Takeaway
The flagship "GPT-4 beats analysts at earnings prediction" paper is no longer usable evidence. Kim, Muhn & Nikolaev withdrew it in February 2025 after a co-author found data and analysis inconsistencies. Benchmarks show steady but incomplete progress on filing Q&A. In 2023, GPT-4-Turbo with retrieval failed 81% of FinanceBench questions. On Vals.ai Finance Agent v2.1 (October 2026), the best model scores 67.85%, so roughly one in three expert analyst tasks on SEC filings still fails. Numerical, multi-statement questions are the hardest category.

### Cited Findings
- **Kim, Muhn & Nikolaev (Chicago Booth), "Financial Statement Analysis with Large Language Models"**
  - **Withdrawal:** v1 July 25, 2024; v2 November 10, 2024; v3 February 20, 2025 marked "(withdrawn)." The arXiv comment says: "A co-author identified inconsistencies in the data and analyses ... while attempting to replicate past analyses ... we have temporarily withdrawn the working paper." — [arXiv 2407.17866](https://arxiv.org/abs/2407.17866)
  - **Claims in the Nov 7, 2024 draft (now unverified):**
    - Sample: Compustat 1968–2021, 150,678 firm-years from 15,401 firms. The analyst sample is 1983–2021, 39,533 observations from 3,152 firms.
    - Model: GPT-4-Turbo (training cutoff April 2023), given anonymized, standardized statements.
    - Analyst accuracy (1-month consensus): 52.71% (F1 54.48%). At 3 months 55.95%; at 6 months 56.58%.
    - GPT without chain-of-thought: 52.33%. With chain-of-thought: 60.35% (F1 63.45% on the full sample).
    - Baselines: an ANN reached 60.45% (F1 61.62%); logistic regression 52.94%.
    - Trading: a long-short Fama-French three-factor alpha above 12% per year.
    - The authors also claimed a 2023 out-of-sample test showed no memory effect. — [Nov 2024 draft PDF](https://rotmandigital.ca/wp-content/uploads/2025/01/Financial-Statement-Analysis-with-Large-Language-Models.pdf)
  - **Stale citations:** a SUERF policy brief (Oct 2024) still presents the findings without noting the withdrawal. — [SUERF brief](https://www.suerf.org/wp-content/uploads/2024/10/SUERF-Policy-Brief-1008_Kim-et-al.pdf)
  - I found no published critique or formal replication. An independent FinNLP 2025 paper (Wang & Brorsson) evaluates LLMs on financial statement analysis, but it is not a replication. — [ACL Anthology FinNLP 2025](https://aclanthology.org/2025.finnlp-1.19.pdf)
- **FinanceBench (Patronus AI; Islam et al., Nov 2023)**
  - **Coverage:** 10,231 questions on 40 US public companies from about 360 filings (10-K, 10-Q, 8-K, earnings reports). The evaluation used 150 cases and 2,400 manually reviewed answers.
  - **Results (% correct / % incorrect / % refusal):**
    - GPT-4-Turbo closed-book: 9 / 3 / 88.
    - GPT-4-Turbo shared vector store: 19 / 13 / 68.
    - GPT-4-Turbo single vector store: 50 / 11 / 39.
    - Llama2 shared vector store: 19 / 70 / 11.
    - Claude2 long-context: 76 / 21 / 3.
    - GPT-4-Turbo long-context: 79 / 17 / 4.
    - GPT-4-Turbo oracle (given the right page): 85 / 15 / 0.
  - **Hardest questions:** metrics-generated questions needing calculations across multiple statements were the hardest category. — [arXiv abs](https://arxiv.org/abs/2311.11944); [arXiv HTML](https://arxiv.org/html/2311.11944)
- **Vals.ai Finance Agent Benchmark**
  - **v1 (Bigeard et al., May 2025):** 537 expert-authored questions requiring agents to analyze recent SEC filings via EDGAR and search tools. The best model was OpenAI o3 at 46.8%, costing about $3.79 per query. — [arXiv 2508.00828](https://arxiv.org/abs/2508.00828)
  - **v2.1 leaderboard (updated October 29, 2026):**
    - Design: 449 test questions across nine categories (comparables, adjustments, earnings analysis, financial modeling, and others).
    - Top scores: Claude Opus 5.5 67.85% ($8.91/test), Gemini 4 Argon 67.66%, Claude Sonnet 5.5 67.28%, Claude Haiku 5.5 65.37%, DeepSeek V4.1 Flash 65.43% ($0.37/test).
    - Scoring rules: a missed required fact or number ("dealbreaker") scores zero, and hedged multiple answers fail. Scores fall substantially when every check must pass. — [Vals.ai Finance Agent v2.1](https://www.vals.ai/benchmarks/fabv2-1)
  - The v1 and v2.1 scores are not directly comparable.
- **FinBen (Xie et al., Feb/Jun 2024; IJCAI-2024 workshop):** 36 datasets across 24 tasks, testing 15 LLMs including GPT-4 and Gemini. LLMs "excel in IE and textual analysis" but struggle with advanced reasoning, text generation and forecasting. Instruction tuning helps textual analysis but adds little on complex QA. — [arXiv 2402.12659](https://arxiv.org/abs/2402.12659)
- **BloombergGPT (Wu et al., Mar 2023):** a 50B-parameter model trained on 363B financial tokens plus 345B general tokens. It claimed to beat existing models on financial tasks at the time. — [arXiv 2303.17564](https://arxiv.org/abs/2303.17564)

### Inferences
- Do not cite Kim et al. as evidence that LLMs out-forecast analysts. Its central result is under review by its own authors. Even the draft's claims were modest: about 60% directional accuracy versus 53–57% for analysts, on a coin-flip-like task. The draft also noted the plain (non-CoT) prompt was no better than analysts.
- FinanceBench's spread between retrieval setups (19% to 79%) shows that retrieval and context engineering dominate model choice for 10-K Q&A. This supports the app's design of passing exact filing sections into the prompt and verifying claims against the source.
- Even the best 2026 agents fail about one-third of entry-level analyst tasks under strict scoring. Every LLM-extracted number should therefore be cross-checked against XBRL/Python-computed values, which is what the current design already does.
- Finance-specific pretraining (BloombergGPT, FinBERT) has not shown a durable edge over frontier general models. FinBERT was clearly weaker than GPT-4 on return drift in Lopez-Lira & Tang (Section 1).

### Gaps
- I could not open the BloombergGPT-versus-GPT-4 comparison papers. "Domain models lose to frontier general models" is supported only indirectly, via FinBERT in Lopez-Lira & Tang and the FinBen leaderboard.
- I found no 2026 hallucination rate specifically for current frontier models on FinanceBench-style 10-K questions. Vals' public page reports accuracy and error counts but not a hallucination taxonomy.
- I did not retrieve current FinQA/TAT-QA scores for 2025–2026 models.
- A secondary aggregator claims GPT-4 reaches about 89% on FinanceBench with perfect retrieval; I could not verify this. The primary paper's oracle figure is 85% for GPT-4-Turbo.

---

## 3. Lookahead bias, memorization and point-in-time LLMs: implications for backtesting

### Takeaway
Off-the-shelf LLMs have memorized financial history: index levels, returns, headlines and dates. Prompt instructions ("pretend it is date X") and anonymization do not reliably stop them using it. Any backtest that runs an LLM over periods inside its training window is therefore uninterpretable. Only post-cutoff tests, live forward tests or point-in-time models give valid evidence. Contamination is plausibly worst for exactly the well-known US large caps this app covers.

### Cited Findings
- **Lopez-Lira, Tang & Zhu, "The Memorization Problem: Can We Trust LLMs' Economic Forecasts?"** (arXiv v1 Apr 20, 2025; v2 Dec 15, 2025; working paper)
  - LLMs recall exact pre-cutoff economic and financial values. Instructions to respect historical boundaries "fail to prevent recall-level accuracy."
  - Masking fails because models "reconstruct entities and dates from minimal context."
  - There is no recall after the cutoff, and memorization extends to embeddings. — [arXiv 2504.14765](https://arxiv.org/abs/2504.14765); [SSRN 5217505](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5217505)
  - Per a search summary of the paper, GPT-4o (cutoff October 2023) recalled specific S&P 500 index values with perfect precision. I did not verify this in the full text. — [ResearchGate](https://www.researchgate.net/publication/390924734_The_Memorization_Problem_Can_We_Trust_LLMs'_Economic_Forecasts)
- **Sarkar & Vafa, "Lookahead Bias in Pretrained Language Models"** (Harvard; v1 March 11, 2024, v2 June 28, 2024; presented at ICML 2025 workshops)
  - Builds statistical tests based on events that should be unpredictable. It finds lookahead bias when predicting risk factors from earnings calls and election winners from biographies.
  - Prompting-based fixes are limited, and the recommended remedy is models pretrained only on pre-period text. — [NBER conference PDF](https://conference.nber.org/conf_papers/f205530/f205530.pdf); [ICML 2025](https://icml.cc/virtual/2025/48685)
- **Glasserman & Lin, "Assessing Look-Ahead Bias in Stock Return Predictions Generated by GPT Sentiment Analysis"** (arXiv Sep 29, 2023; reported by a later survey as published in the Journal of Financial Data Science, 2024)
  - Method: GPT-3.5 sentiment on original versus anonymized headlines.
  - In-sample, anonymized headlines outperform. The authors read this as a "distraction effect" from the model's general company knowledge outweighing lookahead, and the effect is stronger for larger companies.
  - Out-of-sample the gap loses significance, with borderline evidence remaining for large firms.
  - The authors attribute losses to GPT overconfidence. — [arXiv 2309.17322](https://arxiv.org/abs/2309.17322); [publication status per 2025 anonymization survey](https://arxiv.org/pdf/2511.15364)
- **Gao, Jiang & Yan, "Detecting Lookahead Bias in LLM Forecasts"** (arXiv v1 Dec 29, 2025; v2 Jun 12, 2026; working paper)
  - Introduces a "Lookahead Propensity" (LAP) statistic from date-only recall questions. LAP is "materially positive throughout the in-sample period and collapses essentially to zero right after the training-data cutoff."
  - In two tasks (headlines predicting returns, earnings-call transcripts predicting capex), forecast power is larger where LAP is high. The LAP × forecast interaction loses significance post-cutoff. — [arXiv 2512.23847](https://arxiv.org/abs/2512.23847)
- **Point-in-time ("chronologically consistent") models:**
  - **He, Lv, Manela & Wu:** ChronoBERT (149M parameters) and ChronoGPT (1.5B) find lookahead bias "modest" for next-day news-return prediction. They warn it is model- and application-specific, and that larger models can memorize more. — [arXiv 2502.21206](https://arxiv.org/abs/2502.21206); [JFE/ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0304405X26001455)
  - **Instruction-tuned follow-up (ChronoGPT-Instruct):** [arXiv 2510.11677](https://arxiv.org/pdf/2510.11677)
  - **Kelly, Malamud, Schwab & Xu (NBER WP 35247, May 2026):**
    - Models up to 4B parameters trained on 1T chronologically filtered FineWeb tokens, with monthly checkpoints from 2013 to 2024.
    - They approach Gemma-3-4B and LLaMA-7B on common-sense benchmarks, with gaps remaining.
    - Out-of-sample news-embedding portfolios reach Sharpe about 1.0–1.5, close to "full-sample counterparts that violate temporal validity." The authors argue the cost of avoiding lookahead is "a scale deficit rather than an inherent limitation."
    - On a benchmark table, the ChronoGPT-2024 average is 48.9 versus 69.2 for Gemma-3-4B. — [NBER w35247](https://www.nber.org/papers/w35247); [PDF](https://www.nber.org/system/files/working_papers/w35247/w35247.pdf)
  - **Other 2026 efforts (title or abstract only, not read in full):** DatedGPT (time-aware pretraining) — [arXiv 2603.11838](https://arxiv.org/html/2603.11838v1); HindsightBench, a black-box audit protocol for "parametric hindsight" — [arXiv 2607.18867](https://arxiv.org/pdf/2607.18867); MemGuard-Alpha, on the limits of membership inference for filtering memorization-contaminated signals — [arXiv 2603.26797](https://arxiv.org/pdf/2603.26797)
- **Field practice:** Lopez-Lira & Tang (v6) state that Sarkar & Vafa and Lopez-Lira, Tang & Zhu "provide strong evidence that one must use a sample period after an LLM's knowledge cutoff date." — [arXiv PDF v6](https://arxiv.org/pdf/2304.07619)

### Inferences
- **Backtesting rules for any LLM-touched signal:**
  - (a) Evaluate only on data after the model's documented training cutoff. Vendor-stated cutoffs may be fuzzy, and models are updated silently, so pin dated snapshots.
  - (b) Alternatively, use point-in-time models, accepting their lower capability.
  - (c) Otherwise, run live and forward-only tests.
  - Anonymization and "as of date X" prompts are not sufficient defenses.
- **S&P 500 is the worst case.** Large, heavily covered firms are the most memorized and most "distracting" (Glasserman & Lin found the effects strongest for larger companies). Historical evaluations of LLM-written S&P 500 reports, ratings or "would this call have been right?" checks will be contaminated for any period before the model's cutoff.
- **Contamination reaches the narrative layer too.** Even with Python computing every number, an LLM asked to write about a company in a past period may slip in hindsight ("the company later...", or framing that implies knowledge of subsequent events). Pre-cutoff report back-tests of narrative quality, tone versus subsequent returns and so on are biased for the same reason.
- **Post-cutoff windows are short and regime-specific** for frontier models (often 6–18 months). Statistical power for any return claim will be low, which argues for treating LLM output as qualitative, not as a predictive signal.

### Gaps
- I found no quantitative estimate of how much memorization inflates S&P 500-specific backtests, for example a pre- versus post-cutoff Sharpe gap for large caps only.
- Gao, Jiang & Yan's effect sizes and model names were not on the abstract page.
- The "Look-Ahead-Bench" benchmark was mentioned in a search summary, but I could not locate or verify it.

---

## 4. LLM trading agents and benchmarks: live and forward tests vs. backtests

### Takeaway
Backtested agent frameworks (FinMem, FinAgent, TradingAgents and others) report outperformance on narrow windows and few tickers. Under longer, broader backtests (FINSABER: two decades, 100+ symbols), those advantages "deteriorate significantly." Post-cutoff and live tests show frontier LLM agents roughly matching or failing to beat buy-and-hold:
- StockBench: 8 of 14 models beat a 0.4% passive return, by small margins and before costs.
- LiveTradeBench: chat-leaderboard skill does not predict trading results.
- Alpha Arena: high-variance, model-specific results over a few weeks.
- A six-month production record: the agent fleet was unprofitable.

There is no robust evidence that LLMs generate tradable alpha in US large caps.

### Cited Findings
- **StockBench** (arXiv 2510.02209, v2; working paper)
  - Setup: 20 highest-weight DJIA stocks, March 3 to June 30, 2025 (82 trading days, chosen to post-date model cutoffs), with no transaction costs, slippage or liquidity limits modelled.
  - Results:
    - Passive baseline: 0.4% return, -15.2% max drawdown.
    - Qwen3-235B-Think: 2.5%. Claude-4-Sonnet: 2.2%. OpenAI o3: 1.9%. GPT-5: 0.3%. GPT-OSS-20B: -2.8%.
    - Overall, 8 of 14 models beat the baseline return and all had smaller drawdowns.
  - The abstract says "most models struggle to outperform the simple buy-and-hold baseline." Agents underperformed in a downturn sub-period and outperformed in an upturn.
  - Note: the v2 sub-period text references January–April and May–August windows, which is inconsistent with the stated March–June test window. — [arXiv HTML v2](https://arxiv.org/html/2510.02209v2)
- **FINSABER (Li, Kim, Cucuringu & Ma; arXiv v1 May 2025, v6 Jun 2026; KDD 2026 Datasets & Benchmarks, oral)**
  - Prior LLM timing strategies' advantages "deteriorate significantly" over two decades and 100+ symbols. The authors attribute earlier positive results to survivorship and data-snooping bias.
  - LLM strategies are "overly conservative" in bull markets and "overly aggressive" in bear markets. — [arXiv 2505.07078](https://arxiv.org/abs/2505.07078)
- **LiveTradeBench (Yu, Li & You; Nov 2025)**
  - 50-day live evaluation of 21 LLMs on US stocks and Polymarket, with streaming prices and news to avoid leakage. High LMArena scores do not imply better trading. — [arXiv 2511.03628](https://arxiv.org/abs/2511.03628)
  - A search summary reports a stock-market Spearman correlation of 0.054 between LMArena rank and trading results; I did not verify it in the full text. — [arXiv HTML](https://arxiv.org/html/2511.03628)
- **Agent Market Arena** ("When Agents Trade," arXiv 2510.11695; live multi-market): per a search summary, agent architecture (risk style, memory) explains more performance variation than the model backbone. — [arXiv PDF](https://arxiv.org/pdf/2510.11695)
- **Alpha Arena (nof1)**
  - **Season 1:** crypto perpetuals on Hyperliquid, about $10K of real capital per model. Qwen won, linked to a headline citing 22% returns. Qwen and DeepSeek dominated, while OpenAI, Google and Anthropic models struggled.
  - **Season 1.5:** US equities, started November 19, 2025, about two weeks. Eight models each got $10K, trading TSLA, NVDA, MSFT, AMZN and the Nasdaq-100.
    - A "Mystery Model," later revealed as Grok 4.20, won with a 12.11% average return across four contests ($4,844 total).
    - Qwen fell to sixth on Day 1 and never recovered. Reports of other placings conflict (GPT-5.1 2nd and Gemini 3 3rd in one quoted tweet, versus "Qwen, GPT-5, Gemini lost money" in the same article).
    - The article cites losses "down to -70%" without clarifying the season.
  - These are journalistic sources, not the official leaderboard. — [GNcrypto, Season 1.5 winner](https://www.gncrypto.news/news/mystery-model-alpha-arena-season-1-5-winner/); [GNcrypto, Season 1.5 launch](https://www.gncrypto.news/news/alpha-arena-season-1-5-ai-stock-trading-competition/)
- **"What LLM Trading Agents Actually Do in Production" (Barton et al., Sep 2026)**
  - Setup: six months of data from two fleets, about 7.5M model invocations, crypto memecoins and Hyperliquid perps (Feb–Aug 2026).
  - The DXAP fleet "is not profitable" and trails a matched retail benchmark (41% vs 50% round-trip win rate).
  - Frontier models' decision quality was "statistically indistinguishable" on 416 replayed production scenarios.
  - Median leverage was 5.0x regardless of volatility, which the authors call volatility-blind.
  - Agent fixed effects and an operator risk slider explained more than strategy text.
  - This is crypto, not US equities. — [arXiv 2609.05663](https://arxiv.org/abs/2609.05663)
- **TradingAgents (Xiao et al., v1 Dec 2024, v7 Jun 2025):** a multi-agent "trading firm" with analyst, bull/bear researcher, trader and risk agents. The abstract claims gains in cumulative return, Sharpe and drawdown over baselines; the test window and tickers were not on the abstract page. — [arXiv 2412.20138](https://arxiv.org/abs/2412.20138)

### Inferences
- The pattern is consistent: the more forward-looking, broad and long the test, the smaller the LLM advantage. Narrow-window backtests of agent frameworks, especially pre-cutoff, are likely inflated by memorization and snooping (Sections 3 and 4).
- The live and post-cutoff evidence covers weeks to months, with few runs and no costs in several cases. It cannot establish skill either way, but it gives no support for adding LLM judgment to ratings.
- Several sources find scaffolding and risk controls matter more than model choice. For this app, deterministic Python risk and valuation logic is the right home for any "prediction"-like output.

### Gaps
- I could not access the official nof1 leaderboard for final per-model Season 1 and 1.5 returns. The figures above come from crypto-news outlets and are partly contradictory.
- I found no peer-reviewed live US-large-cap LLM trading study longer than about four months.
- I did not retrieve the specific FinMem or InvestorBench results.

---

## 5. LLMs writing equity research: quality, accuracy, bias and tone vs. human analysts

### Takeaway
I found no rigorous head-to-head study of full LLM-written equity research reports versus human sell-side reports on accuracy and tone. Adjacent evidence points to three things. LLMs tend toward optimism and trend-extrapolation in return forecasts: GPT-4o is overoptimistic, extrapolates, and gives too-narrow intervals, and 14 of 16 models showed optimistic bias. Prompt engineering does not reliably remove this. And analysts using GenAI produce richer but not more accurate reports. A cited LLM narrative is therefore likely to skew positive and overconfident unless constrained.

### Cited Findings
- **Chen, Green, Gulen & Zhou, "What Does ChatGPT Make of Historical Stock Returns?"** (Dec 2025; AEA 2026 program; working paper)
  - GPT-4o, asked to forecast short-horizon returns across 1,283 Forcerank ranking contests, over-extrapolates trends where realized returns reverse.
  - Its forecasts are "overoptimistic yet understate extreme upside returns, resulting in confidence intervals that are too narrow."
  - Framing in prices rather than returns makes expectations more pessimistic. The biases "resist correction through prompt engineering." — [AEA 2026 paper](https://www.aeaweb.org/conference/2026/program/paper/zNrQ4Yn6)
- **OptimismBench (Cho & Koshiyama, July 2026; working paper):** across 16 models from 8 providers, "fourteen are optimistic; pessimism appears only in Anthropic's frontier tier." Post-training determines the sign of the bias across 11 base-versus-chat pairs, and model identity matters 4.7x more than language. Scenarios are generic, not financial-specific. — [arXiv 2607.26981](https://arxiv.org/abs/2607.26981)
- **Xue, Zhang & Zhu, "Generative AI for Analysts"** (v1 Dec 2025, v2 Sep 2026; working paper)
  - Uses FactSet's 2023 GenAI integration as a shock. Affected analyst reports draw on 26% more distinct information sources, cover 24% more topics and use 21% more analytical methods, and are timelier.
  - But relative forecast accuracy declines when information-processing demands are high. An ML benchmark on the same inputs shows no such decline. — [arXiv 2512.19705](https://arxiv.org/abs/2512.19705)
- **"Can ChatGPT reduce human financial analysts' optimistic biases?"** (Chinese market, 2023): ChatGPT forecasts were more accurate, attributed to correcting analysts' optimism. The advantage did not persist at the long-term (2022) horizon. — [Taylor & Francis](https://www.tandfonline.com/doi/full/10.1080/20954816.2023.2276965)
- **Fin-Bias benchmark (2026):** per a search summary, average analyst accuracy is about 33% and most models fall between 32% and 34%, which is parity. — [arXiv 2605.09106](https://arxiv.org/html/2605.09106v1)
- **ESG Beliefs of LLMs (2026):** per a search summary, in about 36,000 brokerage reports, analysts who use LLMs become significantly more optimistic about high-ESG firms relative to consensus. This suggests LLMs transmit their own priors into analyst tone. — [arXiv 2601.00836](https://arxiv.org/pdf/2601.00836)
- **Tone asymmetry in Lopez-Lira & Tang:** GPT-4's useful signal is concentrated on negative news (short leg Sharpe 2.01 vs long leg 0.78). The model's positive calls carry little information. — [arXiv PDF v6](https://arxiv.org/pdf/2304.07619)
- **Glasserman & Lin:** GPT misjudges sentiment while not flagging uncertainty (overconfidence). — [arXiv 2309.17322](https://arxiv.org/abs/2309.17322)

### Inferences
- **Expect the LLM narrative to lean bullish and overconfident**, especially on recent winners (extrapolation) and well-known large caps. The "skeptic" model in the current design is well-justified, and it should specifically probe for extrapolation from recent price moves and for one-sided upside framing.
- **Cross-family checking helps.** Bias sign and size are model-specific: one benchmark finds Anthropic's frontier models lean pessimistic while most others lean optimistic. Using a different model family for the skeptic than for the writer could help, and measuring tone drift periodically, for example the share of positive versus negative adjectives against the Python rating, would be prudent.
- **GenAI widens coverage, not accuracy.** It mainly improves breadth and timeliness. That matches the app's use case (evidence extraction plus cited narrative) and argues against having the LLM produce forecasts.

### Gaps
- I found no study comparing complete LLM-generated equity research reports with human sell-side reports on factual accuracy, citation fidelity or subsequent-return informativeness.
- The ACM ICAIF 2024 paper "AI in Investment Analysis: LLMs for Equity Stock Ratings" was inaccessible (403), so its findings are not included.
- Effect sizes for OptimismBench and for the ESG-tone paper were not retrieved.

---

## 6. Practical guidance: where LLMs add value vs. where they fail

### Takeaway
LLMs are reliable enough for three things:
- reading and extracting from filings, provided the right passage is in context;
- classifying events and news;
- writing summaries.

Their main contribution to return prediction is interpreting complex text. They are unreliable at multi-step arithmetic across statements, at recalling numbers and dates (where memorized values contaminate outputs), at calibrated forecasting, and at anything evaluated on pre-cutoff history. The literature supports the app's current split: Python owns numbers, ratings and targets, and LLMs own extraction and cited prose under verification.

### Cited Findings
- **Strengths:**
  - Information extraction and textual analysis are LLMs' strongest finance tasks; forecasting and complex reasoning are their weakest. — [FinBen, arXiv 2402.12659](https://arxiv.org/abs/2402.12659)
  - Zero-shot GPT-4 interpretation of headlines is robust with little data, where supervised embedding models collapse (Sharpe 2.63 vs 1.71 on scarce intraday data). LLMs add the most on "complex synthesis" news (insider trades, conference participation). — [Lopez-Lira & Tang v6](https://arxiv.org/pdf/2304.07619)
  - Supplying the right document is decisive: FinanceBench accuracy rises from 9% (closed-book) to 19–50% (vector retrieval) and 79% (long context), reaching 85% (oracle page) for GPT-4-Turbo. — [FinanceBench HTML](https://arxiv.org/html/2311.11944)
- **Weaknesses (numbers and arithmetic):**
  - Metrics-generated questions needing calculations across statements were the hardest FinanceBench category. Llama2 produced plausible but wrong answers in 54–70% of cases with retrieval. — [FinanceBench HTML](https://arxiv.org/html/2311.11944)
  - Lopez-Lira & Tang cite Xie et al. (2023), which found ChatGPT no better than linear regression when predicting from numerical data. — [Lopez-Lira & Tang v6](https://arxiv.org/pdf/2304.07619)
  - The Vals Finance Agent scoring zeroes any answer that misses a required number or hedges between values. The top 2026 score is still about 68%. — [Vals.ai v2.1](https://www.vals.ai/benchmarks/fabv2-1)
- **Weaknesses (dates and history):** models recall pre-cutoff values and reconstruct masked entities and dates, so "historical" outputs mix recall with reasoning. — [arXiv 2504.14765](https://arxiv.org/abs/2504.14765); [arXiv 2512.23847](https://arxiv.org/abs/2512.23847)
- **Weaknesses (calibration):** forecasts are overconfident and too narrow, and extrapolative and optimistic. — [AEA 2026 paper](https://www.aeaweb.org/conference/2026/program/paper/zNrQ4Yn6); [Glasserman & Lin](https://arxiv.org/abs/2309.17322)
- **Scaffolding over model:** in production, agent and operator settings explain more variance than strategy text, and frontier models were indistinguishable in decision quality. — [arXiv 2609.05663](https://arxiv.org/abs/2609.05663)
- **Chat leaderboards don't transfer:** general chat-benchmark rank does not predict trading performance. — [LiveTradeBench](https://arxiv.org/abs/2511.03628)

### Inferences
- **Recommended LLM role in the app:**
  - (1) Extract evidence with exact span citations from the filing in context, never from model memory.
  - (2) Classify events (guidance change, insider activity, litigation, segment shifts) as qualitative flags, optionally feeding Python features.
  - (3) Write the narrative constrained to Python-computed numbers.
  - (4) Run a skeptic and claim-verifier that check every number and date against source text or XBRL.
- **Keep LLMs out of ratings, targets and probabilities.** No credible evidence shows an LLM forecast improving 6–12 month S&P 500 return or earnings predictions beyond simple models. The strongest earnings-prediction paper is withdrawn, and the return evidence is short-horizon, small-cap-tilted and decaying.
- **If the team ever tests an LLM-derived feature**, for example a news-tone score as one input to the Python model, it must be evaluated only after the model's training cutoff, or with a point-in-time model, with transaction costs. It should be benchmarked against non-LLM news-momentum signals and plain sentiment baselines.
- **Prompt rules for the writer:**
  - Forbid unsourced numbers and dates.
  - Fix the "as-of" date and require that all facts come from provided documents dated on or before it, since memorized post-date facts can leak into narratives.
  - Have the verifier flag any statement not traceable to a provided document.

### Gaps
- I found no published study measuring citation-fidelity or claim-verification error rates for LLM-written single-company reports grounded in SEC filings. That is the exact architecture this app uses, so its own evaluation (for example, sampled human audit of claims) will be the primary evidence.
- I did not find current (2026) quantitative arithmetic-error rates for frontier models on multi-statement financial calculations, separate from overall benchmark accuracy.
