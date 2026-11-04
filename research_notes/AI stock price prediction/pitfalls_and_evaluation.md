# Methodological Pitfalls in Stock Prediction Research and Honest Evaluation

Scope: backtest overfitting and multiple testing, leakage and lookahead (including point-in-time fundamentals and LLM training-data leakage), survivorship in S&P 500 membership, grading probabilistic and range forecasts, sample size needed to tell skill from luck, and pre-registration and forward-only track records. Written for an app that publishes S&P 500 reports (Buy/Hold/Sell, bear/base/bull 12-month range, P(beat sector)), keeps an append-only, hashed prediction log, and may backtest a factor score on XBRL data.

Research-process note: the per-session web search budget ran out partway through. Several canonical references (White 2000, Hansen 2005 SPA, Minimum Backtest Length, López de Prado's "10 reasons", Grinold's fundamental law, McLean & Pontiff, Newey-West and Hansen-Hodrick, Murphy 1973, the SEC Marketing Rule, SEC XBRL field definitions) could not be re-checked in this session. They are listed under "Gaps" with what I recall about them, marked as unverified. Every item under "Cited Findings" comes from a source fetched or returned in this session. Formulas from the Deflated Sharpe Ratio and Harvey & Liu papers were read from the papers' own text.

---

## 1. Backtest overfitting and multiple testing: what the main corrections are and how to apply them

### Takeaway
After you try many strategy or parameter variants, the best backtest Sharpe ratio is inflated by selection even when no variant has any skill. The accepted fixes are: (a) record and report the number of trials; (b) deflate the winning Sharpe ratio against the expected maximum under the null (Deflated Sharpe Ratio); (c) estimate the probability that the in-sample winner is a below-median out-of-sample performer (PBO via CSCV); and (d) apply multiple-testing p-value adjustments, which give a nonlinear "haircut" Sharpe ratio rather than a flat 50% cut. A factor score tuned on about 20 variants over 10 years should be expected to show an annualized Sharpe/IR of roughly 0.6 by luck alone (my calculation from the DSR formula; see Inferences).

### Cited Findings

**Why it happens**
- Bailey & López de Prado say the most important piece of information missing from virtually all published backtests is the number of trials attempted. They argue that a backtest which does not control for the extent of the search "is worthless, regardless of how excellent the reported performance might be," and that referees and investors should demand the trial count. — [Bailey & López de Prado, "The Deflated Sharpe Ratio," JPM 2014 (author PDF)](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf); [SSRN 2460551](https://papers.ssrn.com/abstract=2460551)
- The same paper argues that low signal-to-noise in competitive markets makes chance configurations easy to "discover," so backtest overfitting is hard to avoid. It also says that overfitting in the presence of memory effects (serial dependence) "leads to negative performance out-of-sample," not merely zero. — [DSR paper](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf)
- It cites the medical AllTrials movement, which requires the results of all trials to be published, as the model finance lacks. It notes that hidden multiple testing is rarely accounted for in financial studies. It also quotes Harvey et al. that "most claimed research findings in financial economics are likely false." — [DSR paper](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf)
- A Lawrence Berkeley Lab online tool shows the mechanism. It finds parameter sets that give any desired Sharpe ratio on pseudorandom price series, and those parameter sets typically flounder on a second random series. — [DSR paper](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf)

**Expected maximum Sharpe ratio under the null (the "false strategy" benchmark)**
- Take N independent trials whose estimated Sharpe ratios have cross-trial mean E[SR] and variance V[SR]. The expected maximum is approximately E[max SR] ≈ E[SR] + √V[SR] × ((1 − γ) × Z⁻¹[1 − 1/N] + γ × Z⁻¹[1 − 1/(N·e)]). Here γ ≈ 0.5772 is the Euler-Mascheroni constant, Z⁻¹ is the inverse standard normal CDF, and e is Euler's number. The expected maximum grows with N and with V[SR], even when every true Sharpe ratio is zero. — [DSR paper, Eq. 1](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf)

**Probabilistic and Deflated Sharpe Ratio**
- The Probabilistic Sharpe Ratio (PSR) is the probability that the true SR exceeds a threshold SR*. It accounts for sample length and for skewness and kurtosis. The DSR is a PSR whose threshold is raised from 0 to SR₀, the expected maximum above with E[SR] set to 0:
  DSR = Z[ (SR̂ − SR₀) × √(T − 1) / √(1 − γ̂₃·SR̂ + ((γ̂₄ − 1)/4)·SR̂²) ]
  Here SR̂ is the selected strategy's non-annualized Sharpe ratio, T is the number of return observations, γ̂₃ is skewness, γ̂₄ is kurtosis (not excess kurtosis), and Z is the standard normal CDF. — [DSR paper, Eq. 2](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf)
- The DSR needs five things beyond the usual Sharpe ratio: skewness, kurtosis, sample length, the variance of the Sharpe ratios across trials, and the number of independent trials. It reduces to the PSR when N = 1. — [DSR paper](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf); [Wikipedia: Deflated Sharpe ratio](https://en.wikipedia.org/wiki/Deflated_Sharpe_ratio)
- Worked example from the paper. A Treasury auction-cycle strategy has an annualized SR of 2.5 on 5 years of daily data (T = 1,250). After all the trials and with non-normal returns, the DSR is about 0.90, so it fails a 95% confidence standard. Had the discovery been made after only 46 independent trials, the DSR would have been 0.9505 and it would have passed. With normal returns, about 88 trials would still have passed. (The text extraction lost the input symbols. I recalled the inputs as N = 100, V[SR] = 0.5 annualized, skew −3, kurtosis 10, and confirmed that they reproduce the paper's 0.90 and 0.9505 when plugged into Eq. 1–2.) — [DSR paper](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf)
- The paper uses 95% (DSR > 0.95) as its acceptance standard in the example. It also says the DSR can be computed against Harvey & Liu's threshold, describing the two approaches as complementary. — [DSR paper](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf)
- **Effective number of trials.** N must be the number of *independent* trials. Using the raw count M of correlated trials overstates E[max]. The paper's Appendix 3 interpolates using the average correlation ρ̂ among trials: N̂ = ρ̂ + (1 − ρ̂)·M, so ρ̂ → 1 gives N̂ → 1 and ρ̂ → 0 gives N̂ → M. It warns that when M exceeds T the correlation matrix is ill-conditioned. In that case it recommends dimension reduction or information-theoretic (entropy) estimates of the number of non-redundant sources. — [DSR paper, App. A.3](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf). Clustering similar strategies is another suggested way to estimate effective N. — [Wikipedia: DSR](https://en.wikipedia.org/wiki/Deflated_Sharpe_ratio)
- **When to stop testing.** Multiple testing exercises "should be carefully planned in advance," and investment theory rather than computing power should decide which experiments are run. As a rule of thumb the paper borrows the secretary problem (1/e law): randomly sample about 37% of the theoretically justified configurations, then stop at the first later one that beats all of them. — [DSR paper](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf)

**Probability of Backtest Overfitting (PBO) and CSCV**
- Bailey, Borwein, López de Prado & Zhu define PBO as the probability that the configuration chosen as best in-sample underperforms the median configuration out-of-sample. They estimate it with Combinatorially Symmetric Cross-Validation (CSCV), a model-free, non-parametric method. It splits the T × N matrix of trial returns (T time observations, N configurations) into S equal time blocks and evaluates every symmetric assignment of half the blocks to in-sample and half to out-of-sample. The authors argue that standard hold-out methods are unreliable for investment backtests. Published in the Journal of Computational Finance (2017); SSRN version 2013. — [SSRN 2326253](https://papers.ssrn.com/abstract=2326253); [WMU ScholarWorks record](https://scholarworks.wmich.edu/math_pubs/42)
- The CRAN `pbo` package implements CSCV and also reports performance degradation (IS vs OOS), probability of loss, and stochastic dominance. The original authors used the Sharpe ratio, but other metrics are allowed if they satisfy the paper's assumptions. — [CRAN pbo README](https://cran.r-project.org/web/packages/pbo/readme/README.html)

**Harvey & Liu (2015), "Backtesting," JPM: haircut Sharpe ratios**
- They start from the identity t-statistic = (μ̂/σ̂)·√T, so SR = t/√T for T periods. A higher Sharpe ratio over a fixed sample means a higher t-statistic. — [Harvey & Liu, JPM Fall 2015, Eq. 1–2](https://people.duke.edu/~charvey/Research/Published_Papers/P120_Backtesting.PDF)
- The common practice of cutting backtested Sharpe ratios by 50% is "only a rule of thumb," and using it is "a serious mistake." The correct haircut is nonlinear: the highest Sharpe ratios are only moderately penalized and marginal ones are heavily penalized. — [Harvey & Liu 2015](https://people.duke.edu/~charvey/Research/Published_Papers/P120_Backtesting.PDF)
- Method: convert SR to a t-ratio and a single-test p-value pS. Adjust for multiple testing to get pM using Bonferroni, Holm, or BHY (Benjamini-Hochberg-Yekutieli). Invert pM back into a t-ratio and then a "haircut" Sharpe ratio. Under independence, pM = 1 − (1 − pS)^N. With N = 10 and pS = 0.05, pM ≈ 0.401. — [Harvey & Liu 2015](https://people.duke.edu/~charvey/Research/Published_Papers/P120_Backtesting.PDF)
- Example: 20 years of monthly data (T = 240) with annual SR = 0.75 gives single-test p ≈ 0.0008. With N = 200 tests, pM ≈ 0.15, so the haircut SR is ≈ 0.32, about a 60% cut. — [Harvey & Liu 2015](https://people.duke.edu/~charvey/Research/Published_Papers/P120_Backtesting.PDF)
- Across methods and test counts, the haircut is almost always above 50%, and sometimes much larger, when the annualized SR is below 0.4. It is at most 25% when SR is above 1.0. With 50 trials, an E/P value strategy (SR 0.43) is cut almost 50%, while a betting-against-beta strategy (SR 0.78) is cut only 7.9%. — [Harvey & Liu 2015](https://people.duke.edu/~charvey/Research/Published_Papers/P120_Backtesting.PDF)
- Ordering of strictness: Bonferroni ≥ Holm in adjusted p-values (Bonferroni is tougher). BHY controls the false discovery rate and yields more discoveries. The user has to choose the significance level, the adjustment method, and the assumed number of tests, and should check robustness to all three. — [Harvey & Liu 2015](https://people.duke.edu/~charvey/Research/Published_Papers/P120_Backtesting.PDF)
- They cite Harvey, Liu & Zhu as documenting "at least 316 factors" tested on the cross-section of equity returns. They use t = 3.0 as the illustration of a result that is "highly significant in a single test" but may not survive multiple testing. (A secondary search summary said 315; the published JPM text says 316.) — [Harvey & Liu 2015](https://people.duke.edu/~charvey/Research/Published_Papers/P120_Backtesting.PDF); [Man Group/Oxford-Man summary](https://www.man.com/insights/backtesting)
- Caveats: the Sharpe ratio may not capture risk for option-like or negatively skewed strategies, and the method also applies to information ratios computed from factor-model residuals. — [Harvey & Liu 2015](https://people.duke.edu/~charvey/Research/Published_Papers/P120_Backtesting.PDF)

### Inferences
- **Concrete null benchmark for the app's internal factor backtest.** Under the null, an annualized SR estimated over Y years has sampling variance of about 1/Y (normal iid approximation). Plugging that into DSR Eq. 1 with E[SR] = 0 gives E[max annual SR] ≈ B(N)/√Y, where B(N) = (1 − γ)Z⁻¹[1 − 1/N] + γZ⁻¹[1 − 1/(Ne)]. My calculations:
  - B(20) ≈ 1.90, B(45) ≈ 2.24, B(100) ≈ 2.53.
  - 10 years of backtest, 20 independent variants: about 0.60 annualized SR/IR expected from luck alone.
  - 10 years, 100 variants: about 0.80.
  - 5 years, 45 variants: about 1.0. This matches the commonly quoted "Minimum Backtest Length" illustration (≈ 45 configurations for 5 years); see Gaps for the source.
  - With XBRL data starting around 2009–2011, Y is roughly 14–16 years, so 50 variants imply about 0.55–0.6 by chance.
- **Rule for the app.** Log every factor-score variant tried, including weights, winsorization, sector-neutralization choices, and look-back windows. Estimate the effective N (correlation- or cluster-based). Report the DSR, the haircut SR, or both, alongside the raw backtest. Never publish a raw backtest Sharpe/IR alone.
- PBO via CSCV fits a factor-score search well: the T × N matrix is monthly long-short (or IC) series per variant. A PBO above about 0.5 would mean the selection process is no better than picking at random (an interpretation following from the definition; the papers' own thresholds were not retrieved).
- The same logic applies to prompt and pipeline iteration for an LLM report generator. Each prompt or model change that is evaluated on historical outcomes is a "trial." So historical tuning of an LLM pipeline creates selection bias even before any training-data leakage (see Q2).

### Gaps
- **White (2000), "A Reality Check for Data Snooping," Econometrica 68(5).** Not verified this session; the Wiley page returned 403. Recalled: it tests the null that the best of K models does not beat a benchmark, using a stationary bootstrap of the maximum performance statistic.
- **Hansen (2005), "A Test for Superior Predictive Ability," JBES 23(4).** Not verified. Recalled: it studentizes the statistics and re-centers the null to reduce the Reality Check's sensitivity to poor or irrelevant models.
- **Romano & Wolf (2005) StepM.** Not verified. Recalled: a stepwise extension that identifies *which* models beat the benchmark.
- **Bailey, Borwein, López de Prado & Zhu (2014), "Pseudo-Mathematics and Financial Charlatanism: The Effects of Backtest Overfitting on Out-of-Sample Performance," Notices of the AMS 61(5).** The Minimum Backtest Length formula (MinBTL ≈ B(N)²/E[max]², bounded above by 2·ln N/E[max]²) and the "≈45 configurations in 5 years" example were not retrieved this session. My arithmetic above reproduces the 45/5 figure from DSR Eq. 1.
- **López de Prado (2018), "The 10 Reasons Most Machine Learning Funds Fail," JPM 44(6), and *Advances in Financial Machine Learning* (Wiley, 2018).** Neither could be fetched. I recall the 10 reasons include cross-validation leakage, walk-forward-only backtesting, backtest overfitting, wrong labeling (fixed-horizon labels), and non-IID sample weighting; verify before citing.
- **Harvey, Liu & Zhu (2016), "…and the Cross-Section of Expected Returns," RFS 29(1).** Their recommendation that new factors clear t > 3.0 is widely cited, but I only have the t = 3.0 illustration via Harvey & Liu 2015; the RFS paper itself was not fetched.
- The PBO paper's exact logit formula (λ = ln[ω/(1 − ω)], where ω is the OOS relative rank of the IS-best configuration; PBO = share of combinations with λ ≤ 0) is recalled and was not verified. The number of CSCV combinations is C(S, S/2), e.g. 12,870 for S = 16 (my arithmetic).

---

## 2. Leakage specific to financial data: lookahead in fundamentals, point-in-time vs. restated databases, purged and embargoed cross-validation, and LLM training-data leakage

### Takeaway
The three classic leaks are: (1) using fundamentals before their filing or acceptance timestamp, or using restated values that were not knowable at the time; (2) cross-validation that ignores overlapping label horizons, which needs purging and an embargo; and (3), now the most important for an LLM-driven report generator, a model whose pretraining data extends past the forecast date. Historical "backtests" of an off-the-shelf LLM are contaminated by memorization, so the forward track record is the only clean evidence for the LLM part of the system.

### Cited Findings

**Point-in-time vs. restated fundamentals**
- A Yale study finds that Compustat's periodic re-standardization of historical financial data introduces look-ahead bias. Historical values in the common Compustat files are altered over time, which hurts replication of prior research. — [Yale SOM, "Re-Standardized Financial Statement Data" (2024)](https://som.yale.edu/sites/default/files/2024-07/Re-Standardized%20Financial%20Statement%20Data.pdf)
- In standard (non-point-in-time) datasets, restated figures overwrite historical results, so a backtest can only see the current value. Point-in-time data removes the need for inaccurate reporting-lag assumptions. — [LSEG, backtesting product page](https://www.lseg.com/en/data-analytics/asset-management-solutions/portfolio-management/backtest-your-portfolio-performance)
- S&P notes that researchers often apply a fixed time lag to the latest data as an approximation of point-in-time financials, which is a rough proxy. S&P markets a Compustat Point-in-Time product that combines originally reported and restated values, with observation dates from December 1986 (vendor claim). — [S&P Global Market Intelligence, "Point-in-Time relevance" (2019)](https://www.spglobal.com/marketintelligence/en/documents/spgmi687_point-in-time-relevance-for-apac-markets_s.joseph_p-fruin_oct_2019.pdf); [Global Custodian on Compustat PIT](https://www.globalcustodian.com/?p=26067)
- A practitioner framing: restated data is not itself the error. The error is using restated values inside a backtest that claims to be historical. — [Tradevo (dev.to), "As-reported vs restated"](https://dev.to/tradevodata/as-reported-vs-restated-financial-data-why-the-difference-matters-for-backtesting-1big)

**SEC XBRL APIs (relevant to the app's planned backtest)**
- SEC's data.sec.gov offers `companyfacts` (all XBRL concept data for a company), `companyconcept` (one concept, grouped by unit), and `frames`. `frames` aggregates one fact per entity from the entity's "last filing that most closely fits the requested period." Because fiscal calendars vary, frame facts can have different start and end dates. The bulk `companyfacts.zip` is recompiled nightly. No API key is required, but automated access must follow SEC's access policy. — [SEC EDGAR APIs page](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)

**Purged and embargoed cross-validation**
- Purged k-fold CV (López de Prado, 2017/2018) prevents lookahead when labels span time, for example 12-month forward returns. It removes from the training set any observation whose label interval overlaps the test fold's intervals. An embargo additionally drops training observations immediately *after* the test fold, because serial correlation lets information leak backward. Standard k-fold leaks because a training label can depend on prices inside the test period. The primary reference is *Advances in Financial Machine Learning* ch. 7. — [Wikipedia: Purged cross-validation](https://en.wikipedia.org/wiki/Purged_cross-validation); [Quantt explainer](https://www.quantt.co.uk/resources/purged-cross-validation)
- Embargo size: secondary sources relay a rule of thumb of about 1% of observations, while others stress there is no universal default. — [Quantt](https://www.quantt.co.uk/resources/purged-cross-validation); [Wikipedia: Purged CV](https://en.wikipedia.org/wiki/Purged_cross-validation)
- Combinatorial Purged CV (CPCV) generates many train/test splits, and therefore many backtest paths. This addresses both leakage and walk-forward's reliance on a single historical path. — [skfolio CombinatorialPurgedCV docs](https://skfolio.org/generated/skfolio.model_selection.CombinatorialPurgedCV.html); [Wikipedia: Purged CV](https://en.wikipedia.org/wiki/Purged_cross-validation)

**LLM training-data lookahead (2025–2026 literature)**
- Gao, Jiang & Yan (ABFER 2026) test Llama-3.3-70B, which has a December 2023 knowledge cutoff. They find its apparent return-predictive power collapses at the cutoff, consistent with a memorization channel that is distinct from model confidence. — [ABFER 2026 slides, "A Test of Lookahead Bias in LLM Forecasts"](https://abfer.org/media/abfer-events-2026/annual-conference/slides-tech-ai/260518-AI-A-Test-of-Lookahead-Bias-in-LLM-Forecasts.pdf)
- Look-Ahead-Bench, a benchmark for point-in-time financial LLMs, reports that most published LLM-based trading agents fail to beat baselines once they are evaluated after their knowledge cutoff. — [Look-Ahead-Bench (arXiv 2601.13770)](https://arxiv.org/pdf/2601.13770)
- ChronoBERT/ChronoGPT train "chronologically consistent" models with cutoffs from 1999 to 2024. In next-day news-based return prediction they find the look-ahead bias effect "modest." This is a different setting from testing off-the-shelf models trained past the forecast date. — [He, Lv, Manela & Wu (arXiv 2502.21206)](https://ar5iv.labs.arxiv.org/html/2502.21206)
- DatedGPT pretrains a family of models on yearly-cutoff data. Perplexity probes confirm each model's knowledge is bounded by its cutoff year, which offers a way to run leakage-free historical tests. — [DatedGPT (arXiv 2603.11838)](https://arxiv.org/html/2603.11838v1)

### Inferences
- **XBRL point-in-time rule.** Build the fundamentals store keyed on each fact's filing/acceptance timestamp and accession number, never on fiscal period end. Make a value usable only from the first trading session *after* acceptance (after-hours 8-K, 10-Q and 10-K filings shift to the next day's open). Do not use the `frames` API for backtests: it returns the last-filed value per period, which embeds restatements and later comparative-period revisions. Treat 10-K/A and restated prior-period columns in later filings as *new* information dated at their own filing date.
- Other point-in-time traps for the app: sector/GICS classification (use the historical classification, not today's); index membership (Q3); share counts and corporate actions (splits, spin-offs); prices (use split-adjusted total-return series, but compute "price inside range" on the same adjustment basis as the forecast); consensus/analyst data (point-in-time snapshots only); and macro data vintages (first-release, not revised, values).
- **Label overlap.** With monthly rebalancing and 12-month labels, each observation's label overlaps the next 11. Any CV or hyperparameter search on the factor score must purge at least 12 months around each test fold and embargo afterward. Otherwise the CV score is inflated.
- **LLM rule.** Any historical evaluation of LLM-generated ratings, ranges or probabilities for dates before the model's training cutoff is contaminated and should not be published as evidence of skill. The only ways to get a clean historical test are a chronologically consistent model (ChronoGPT/DatedGPT-style) or entity and date masking. Even then, treat results as exploratory. The public forward log is the primary evidence. Prompt the model only with point-in-time inputs (filings and prices up to the publication timestamp) and archive the exact retrieved documents with each prediction, so leakage through retrieval can be audited.
- Model or provider upgrades during the forward record change the cutoff. Log the model version and cutoff with each prediction, and keep grading old versions rather than dropping them.

### Gaps
- I could not confirm on the fetched SEC page that each `companyfacts` fact carries `filed`, `accn`, `form`, `fy`, `fp` and `frame` fields. I believe it does, but verify against the SEC developer documentation or a sample JSON. The SEC Financial Statement Data Sets (quarterly ZIPs with `sub.txt` including filed and accepted dates) were not checked.
- XBRL phase-in dates (large accelerated filers from about 2009, all filers by about 2011) were not verified this session. They bound how far back an XBRL-only backtest can go.
- No quantitative estimate of how much restated vs. point-in-time fundamentals inflate factor returns was retrieved. The Yale paper confirms the bias exists but I did not extract magnitudes.
- López de Prado's CPCV path-count formula (recalled as φ = (k/N)·C(N, k) for N groups and k test groups) was not verified.

---

## 3. Survivorship in S&P 500 membership: how to get historical membership and what difference it makes

### Takeaway
Backtesting on today's S&P 500 list selects firms that survived and grew. This "index membership bias" is separate from delisting bias, and fixing delisting bias alone does not remove it. You need point-in-time constituent lists, keyed to add and delete dates, plus returns for removed and delisted firms through their exit. Magnitude estimates found this session come from vendors (for example, "+3–8%" per year) and are not academically verified.

### Cited Findings
- Using current constituents to represent the past introduces index membership bias, and eliminating delisting bias alone is not enough for index-based strategies. Example: a backtest that "buys Tesla 10 years ago" inside an S&P 500 universe is invalid because Tesla joined the index only in December 2020. — Practitioner and vendor sources: [Optuma docs, "I'm a Survivor"](https://docs.optuma.com/im-a-survivor/); [Concretum Group on Norgate historical constituents](https://concretumgroup.com/historical-constituents-of-an-equity-index-in-python-norgate-data/); [Backtrex blog](https://backtrex.com/en/blog/survivorship-bias-trading-backtesting)
- Point-in-time constituent sources named by practitioners include LSEG, Siblis Research, Bloomberg, Norgate Data and CRSP. One practitioner notes that historical S&P 500 constituent data is not freely available from S&P. — [QuantInsti Quantra forum](https://quantra.quantinsti.com/community/t/historical-index-constituents/22381); [Concretum/Norgate](https://concretumgroup.com/historical-constituents-of-an-equity-index-in-python-norgate-data/)
- One vendor claims survivor-only data adds about +3 to 8% of fictitious performance. I found no primary academic study to verify this figure. — [Backtrex blog](https://backtrex.com/en/blog/survivorship-bias-trading-backtesting)
- Benchmarking against the actual index ETF (SPY) avoids membership bias on the benchmark side, because SPY's history reflects real composition changes. — [QuantInsti Quantra forum](https://quantra.quantinsti.com/community/t/historical-index-constituents/22381)

### Inferences
- **For the internal backtest.** At each rebalance date, the universe must be the S&P 500 members *as of that date*. Firms removed later (bankruptcy, acquisition, demotion) must stay in the sample with returns through removal, including delisting or cash-merger proceeds. Firms added later must be excluded before their add date. Index additions often follow strong performance, so using today's list builds in past winners.
- **For the forward track record.** Survivorship can also creep into a forward log. If a covered company is acquired or delisted mid-horizon, its prediction must still be graded, using total return to the exit date and then the cash proceeds (or the acquirer's stock) to the horizon. It must never be dropped. Likewise, companies added to the S&P 500 after a cohort date should not be added retroactively to that cohort.
- The sector benchmark must also be point-in-time: the sector index or ETF as it existed, and the company's GICS sector at forecast time. GICS reclassifications (such as the 2018 Communication Services and 2023 sector changes) would otherwise move firms between benchmarks with hindsight. The specific GICS dates are from memory and should be verified.

### Gaps
- No academic estimate of S&P 500 membership bias was retrieved this session. Candidates to check: CRSP's S&P 500 constituent file (`dsp500list` on WRDS) and studies of index-inclusion effects.
- Free sources of historical membership were not verified this session. Candidates: Wikipedia's "List of S&P 500 companies" change table and community datasets on GitHub reconstructed from it. Their accuracy before about 2000 is unknown.
- The delisting-return literature (e.g., Shumway 1997 on CRSP delisting bias) was not retrieved.

---

## 4. Evaluating probabilistic forecasts: Brier score and its decomposition, calibration plots, proper scoring rules, and standard errors under overlapping 12-month horizons

### Takeaway
Grade the "probability of beating its sector" with a strictly proper score: Brier (and optionally log score). Report it against a climatology baseline (Brier skill score), split it into reliability, resolution and uncertainty, and show a reliability diagram. Because all S&P 500 forecasts made on the same date share market and sector shocks, and 12-month horizons overlap, naive standard errors are far too small. Compute uncertainty from per-forecast score *differences* versus the baseline, clustered by forecast date (and by firm), or aggregate to non-overlapping cohorts.

### Cited Findings
- Brier score for binary outcomes: BS = (1/N) Σ (pᵢ − oᵢ)², where oᵢ ∈ {0, 1}. Lower is better. — [Wikipedia: Brier score](https://en.wikipedia.org/wiki/Brier_score)
- Murphy (1973) decomposition: BS = REL − RES + UNC, with three non-negative terms. Reliability (calibration; lower is better) = Σₖ (nₖ/N)(p̄ₖ − ōₖ)². Resolution (how well forecasts separate events from non-events; higher is better) = Σₖ (nₖ/N)(ōₖ − ō)². Uncertainty = ō(1 − ō) depends only on the base rate. The binned estimators depend on bin choice. — [Wikipedia: Brier score](https://en.wikipedia.org/wiki/Brier_score); [MetricGate, Brier score explained](https://metricgate.com/blogs/brier-score-explained/); [TensorFlow Probability `brier_decomposition`](https://www.tensorflow.org/probability/api_docs/python/tfp/substrates/jax/stats/brier_decomposition)
- The uncertainty term equals the Brier score of always forecasting the climatological base rate. That makes it the natural baseline, and the Brier skill score compares a forecast against it. A forecast adds value when resolution exceeds reliability. — [Wikipedia: Brier score](https://en.wikipedia.org/wiki/Brier_score); [MetricGate](https://metricgate.com/blogs/brier-score-explained/)
- Siegert (2016) simplifies and generalizes Murphy's decomposition. Reliability and resolution can be computed as average Brier score differences against recalibrated forecasts. — [Siegert, "Simplifying and generalising Murphy's Brier score decomposition" (Exeter repository)](https://ore.exeter.ac.uk/repository/handle/10871/34847); R implementation with uncertainty estimates: [SpecsVerification::BrierScoreDecomposition](https://www.rdocumentation.org/packages/SpecsVerification/versions/0.3-0/topics/BrierScoreDecomposition)
- Reliability diagram: for each bin, plot the observed frequency against the mean predicted probability. It is the visual counterpart of the reliability term. — [MetricGate](https://metricgate.com/blogs/brier-score-explained/)
- Gneiting & Raftery (2007, JASA 102:359–378) develop the theory of proper scoring rules on general probability spaces. Under a proper rule, the forecaster's expected score is optimized by reporting their true belief. The paper covers scoring rules for quantile and interval forecasts. — [Gneiting & Raftery tech report / JASA (DTIC record)](https://apps.dtic.mil/sti/html/tr/ADA459827/index.html)
- Petersen (2009, RFS) on finance panels: with a firm effect, OLS standard errors are biased and firm-clustered standard errors are unbiased. Newey-West adapted to panels is also biased, though less so. Fama-MacBeth corrects for time (cross-sectional) effects but not firm effects. — [Petersen, NBER WP 11280 / RFS 2009](https://www.nber.org/papers/w11280.pdf)
- Thompson (2011, JFE) gives simple formulas for standard errors clustered by both firm and time. — [Citation listing](https://scholarhub.vn/publication/:slug/15952ad5-4677-457a-953c-04c2ee400622)

### Inferences
- **Scoring protocol for P(beat sector).**
  1. Fix in advance the event's exact definition: total return of stock minus total return of a named sector benchmark over a named horizon, measured from a named price (e.g., next open after publication).
  2. Score each forecast with Brier. Optionally add log score, which punishes confident misses harder.
  3. Report the Brier skill score against two baselines: always 0.5, and the realized base rate (climatology). The base rate of beating a cap-weighted sector index may not be 50%, because stock returns are skewed. Use the realized ō rather than assuming 0.5.
  4. Publish the REL/RES/UNC split and a reliability diagram with about 5–10 bins and per-bin counts.
- **Standard errors.** Form dᵢ = BS_model,ᵢ − BS_baseline,ᵢ for each forecast, and test whether mean(d) < 0. Forecasts sharing a date are correlated (one market or sector shock moves all outcomes), so cluster by forecast date, or two-way cluster by date and firm following Thompson/Petersen. Equivalently, average d within each cohort date and run a time-series t-test on cohort means with a HAC (Newey-West or Hansen-Hodrick) correction. Use at least h − 1 lags when cohorts overlap: 11 lags for monthly cohorts of 12-month forecasts.
- **Few-cluster warning.** With only 1–3 years of 12-month outcomes there are very few independent time clusters, and clustered standard errors are unreliable. Report results as descriptive and say so explicitly until there are enough non-overlapping periods.
- Report calibration both pooled and by cohort. A single market-wide event (e.g., a sector rotation) can shift every outcome in a cohort the same way, so a "miscalibrated" cohort may be one shared shock rather than many independent errors.

### Gaps
- Murphy (1973) and Brier (1950) originals were not fetched; the decomposition is cited via secondary sources above.
- Newey & West (1987), Hansen & Hodrick (1980), Cameron, Gelbach & Miller (2008/2011) on few-cluster corrections (wild cluster bootstrap), and Diebold & Mariano (1995) on testing forecast-accuracy differences under serial correlation were not verified this session. They are the standard references for the HAC and score-difference tests recommended above.
- No source was retrieved on the base rate of individual S&P 500 stocks beating their cap-weighted sector index over 12 months.

---

## 5. How many graded forecasts are needed to separate skill from luck at realistic information ratios

### Takeaway
The t-statistic equals SR (or IR) × √T. So the years of live record needed for t = 2 are about (2/IR)²: 16 years at IR 0.5 and 4 years at IR 1.0. For t = 3, a hurdle consistent with multiple testing, the figures are 36 and 9 years. Hundreds of S&P 500 forecasts per year do *not* multiply evidence proportionally, because they share common shocks and overlapping horizons. A 500-stock annual cohort may carry only about 10–80 "independent-equivalent" observations. Expect several years of forward record before any skill claim is statistically defensible.

### Cited Findings
- The t-statistic for a mean excess return is t = (μ̂/σ̂)·√T, and SR = t/√T. For a fixed sample, a higher Sharpe or IR means proportionally higher significance. — [Harvey & Liu 2015, Eq. 1–2](https://people.duke.edu/~charvey/Research/Published_Papers/P120_Backtesting.PDF)
- After multiple testing, marginal Sharpe ratios (below about 0.4) lose more than half their value, and only SR above about 1.0 keeps 75% or more. — [Harvey & Liu 2015](https://people.duke.edu/~charvey/Research/Published_Papers/P120_Backtesting.PDF)
- Out-of-sample tests trade power against data. With 1,000 observations split 90/10, the 100-observation holdout "provides too little information to truly discriminate" among candidates. — [Harvey & Liu 2015](https://people.duke.edu/~charvey/Research/Published_Papers/P120_Backtesting.PDF)

### Inferences
All numbers below are my own arithmetic from the cited identity or from standard formulas. None were found pre-computed in a source.
- **Years of track record for significance** (annualized IR, using t = IR × √years):
  - t = 2: IR 0.25 → 64 years; IR 0.5 → 16; IR 0.75 → 7.1; IR 1.0 → 4.
  - t = 3: IR 0.5 → 36 years; IR 1.0 → 9.
  - Realistic long-run IRs for stock-selection signals are well below 1. A three-year forward record can confirm skill only if the strategy is unusually strong, but it can falsify strong claims.
- **Hit-rate sample size** (binomial; one-sided α = 0.05, power 80%; null p₀ = 0.5; n ≈ [(1.645·√(p₀q₀) + 0.842·√(p₁q₁)) / (p₁ − p₀)]²):
  - True hit rate 52% → about 3,860 independent forecasts.
  - 55% → about 617.
  - 60% → about 153.
- **Design effect for same-date forecasts.** For m forecasts on the same date with average pairwise outcome correlation ρ, the effective n is n/(1 + (m − 1)ρ). For m = 500:
  - ρ = 0.01 → about 84 effective.
  - ρ = 0.02 → about 46.
  - ρ = 0.05 → about 19.
  - ρ = 0.10 → about 10.
  - At ρ = 0.02, detecting a true 55% hit rate needs about 617/46 ≈ 13 non-overlapping annual cohorts.
  - These ρ values are illustrative assumptions. The team should estimate ρ from realized sector-relative outcomes, since sector-adjustment lowers but does not remove common factor shocks.
- **Overlap.** Issuing (or updating) 12-month forecasts monthly for the same stock adds little independent information. Twelve monthly cohorts per year are roughly equivalent to one non-overlapping annual cohort for 12-month outcomes, though more for 3-month grading. Grade 3-month horizons for faster (but noisier) feedback, and do not count overlapping 12-month observations as independent.
- **A factor score is mostly one bet per period.** If the factor score loads on a common factor (value, quality, momentum), its cross-sectional hit rate in a given year is largely a single draw of that factor's premium. Its proper test statistic is the time series of period-level spreads or rank ICs: t = mean(IC) / (sd(IC)/√n_periods), with HAC correction for overlap. This is not the count of stock-level forecasts.
- **Publication rule.** Show live confidence intervals on hit rate, mean excess return and Brier skill. Show the number of independent-equivalent observations. State a pre-registered evaluation date (e.g., "first formal skill test after 36 months of non-overlapping data") so the team cannot stop at a lucky moment.

### Gaps
- **Grinold's Fundamental Law of Active Management** (Grinold 1989, JPM; Grinold & Kahn, *Active Portfolio Management*) was not verified this session. Recalled: IR ≈ IC × √breadth, with the t ≈ IR × √years identity discussed there. Breadth must count *independent* bets, so 500 correlated stocks overstate breadth (Buckle 2004 and Clarke, de Silva & Thorley 2002 on the transfer coefficient are recalled refinements).
- No empirical estimate of the cross-sectional correlation of 12-month sector-relative outcomes for S&P 500 stocks was retrieved.
- Typical realized IRs of equity research ratings or target prices: Bradshaw, Brown & Huang (2013, Review of Accounting Studies) on target-price accuracy, which I recall as about 38% met at 12 months and about 64% met at any time during the 12 months, was not verified.

---

## 6. Evaluating price-range forecasts: interval coverage and interval scores

### Takeaway
"Price inside range" alone rewards wide ranges and is easily gamed. Pair coverage (does the share of outcomes inside the range match its stated probability?) with the Gneiting–Raftery interval score, which penalizes width and misses together. To make the bear/base/bull range scorable, the app must state in advance what quantiles bear and bull represent (e.g., 10th/90th percentiles, an 80% central interval) and whether base is the median.

### Cited Findings
- Interval score for a central (1 − α) prediction interval [l, u] and outcome x: IS_α(l, u; x) = (u − l) + (2/α)(l − x)·1{x < l} + (2/α)(x − u)·1{x > u}. Smaller is better. It is proper for intervals whose ends are the α/2 and 1 − α/2 quantiles. — [scoringutils `interval_score` documentation, citing Gneiting & Raftery 2007 and Bracher et al.](https://www.rdocumentation.org/packages/scoringutils/versions/2.1.1/topics/interval_score)
- Gneiting & Raftery propose the interval score as a utility for interval estimation that addresses width as well as coverage, and attribute its origins to Dunsmore (1968) and Winkler (1972). — [Gneiting & Raftery (DTIC record)](https://apps.dtic.mil/sti/html/tr/ADA459827/index.html)
- Multiplying each interval score by α/2 and averaging over several equally spaced central intervals approximates the CRPS. This is the weighted interval score used in epidemic forecasting (Bracher, Ray, Gneiting & Reich, PLoS Comput Biol). The score can be split into dispersion, over-prediction and under-prediction parts. — [scoringutils docs](https://www.rdocumentation.org/packages/scoringutils/versions/2.1.1/topics/interval_score)
- Gneiting & Raftery also discuss quantile scoring rules (the single-quantile "pinball" loss being the base case). They said they did not know whether their formula gives the general form of proper scoring rules for quantiles. — [Calibration Scoring Rules for Practical Prediction Training (arXiv 1808.07501)](https://arxiv.org/pdf/1808.07501)
- Comparing prediction intervals is described as "difficult and perhaps unsolvable" when the coverage probability is specified but the quantiles are not. In practice this means interval forecasts should be defined by their quantile levels. — as summarized in [a review of predictive uncertainty estimation (arXiv 2209.08307)](https://arxiv.org/pdf/2209.08307)

### Inferences
- **Make the range scorable.** Pre-register "bear = 10th percentile, bull = 90th percentile of 12-month price (or total return); base = median." Then:
  1. Coverage: the share of outcomes in [bear, bull] should be about 80%. Test with a binomial test using clustered or effective n. With n_eff = 100, the standard error is about 4 percentage points, so 72–88% is consistent with 80%.
  2. Tail balance: the share below bear and the share above bull should each be about 10%. Upward or downward bias shows up here even when total coverage looks fine.
  3. Interval score with α = 0.2: width + 10 × miss distance. Example: range 80–120, outcome 70 → 40 + 10 × 10 = 140; outcome 100 → 40.
  4. Pinball (quantile) loss for each of the three points, which gives the weighted interval score when combined.
  5. Absolute error of the base case (the proper choice if base is the median).
- **Normalize** prices to the start price (score in % or log-return terms). Otherwise high-priced stocks dominate averages.
- **Benchmark.** Compare against a naive range built from each stock's trailing volatility (e.g., lognormal 10/90 quantiles using implied or historical volatility), using an interval-skill ratio. A model that can't beat a volatility-based range adds no information about the range.
- Coverage failures cluster in time (a crash pushes many outcomes below bear together), so judge coverage across many cohort dates. Report a time series of cohort coverage, not just a pooled number.
- Grade on a total-return or split-adjusted basis consistent with how the range was stated. Decide in advance how dividends, splits, spin-offs and acquisitions are handled.

### Gaps
- Coverage backtests from risk management (Kupiec 1995 unconditional coverage likelihood-ratio test; Christoffersen 1998 conditional coverage/independence test) were not verified this session but apply directly to range-hit series.
- Gneiting (2011, JASA), "Making and Evaluating Point Forecasts," which says the scoring function must match the functional (median → absolute error; mean → squared error), was not verified.

---

## 7. Pre-registration and forward-only track records in finance: examples and norms

### Takeaway
Finance has no widely adopted equivalent of clinical-trial registration. Leading methodologists call for the same norm: disclose all trials, plan tests in advance, and treat only genuinely unseen data as out-of-sample. Historical holdouts are never truly out-of-sample, because researchers know what happened. A hashed, append-only forward log is the strongest available evidence, provided the evaluation rules, universe and all model versions are also pre-committed and nothing is selectively omitted.

### Cited Findings
- Harvey & Liu list three limits of historical out-of-sample tests:
  - Researchers iterate after seeing OOS failure, so the test is no longer out-of-sample, and "the difference is hard for outsiders to see."
  - OOS success can itself be luck.
  - "There is no true OOS that uses historical data," because researchers know what happened in the economy.

  They call true out-of-sample tests on previously unpublished data "a cleaner way" to evaluate a strategy, though often unavailable. — [Harvey & Liu 2015](https://people.duke.edu/~charvey/Research/Published_Papers/P120_Backtesting.PDF)
- Bailey & López de Prado point to the AllTrials movement (publish results of all trials) as the remedy finance lacks. They urge investors and referees to demand the number of trials, and say multiple-testing exercises should be planned in advance. — [DSR paper](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf)
- In economics, pre-registration fixes analytic decisions publicly before data are seen. Registered Reports (pre-results review) go further: the paper and analysis plan are reviewed and accepted before results exist, which also addresses publication bias. A guide for empirical economists covers p-hacking, HARKing, forking paths, data-analysis plans and power analysis. — [ZBW Open Science, "Preregistration in economic research"](https://open-science-future.zbw.eu/en/preregistration-economic-research/); [Springer, Registered Reports guide for economists](https://link.springer.com/doi/10.1007/s40881-022-00123-1)
- Pre-registration allows exploratory work if it is labelled as exploratory rather than presented as confirmatory. — [CASRAI, "What is preregistration"](https://casrai.org/learn/what-is-preregistration)
- Evidence that pre-registration works is mixed in other fields, and authors often deviate from registered plans without full disclosure. — [EcoEvoRxiv preprint on preregistration efficacy](https://ecoevorxiv.org/repository/object/12377/download/22102)

### Inferences
**Consolidated honest-evaluation rules for the app**, synthesized from all sections above:
1. **Pre-register the scoring rulebook before the first prediction and hash it into the log.** It should fix:
   - each metric's definition (excess return vs. which sector index and vs. SPY, total return, start price = next open after publication);
   - horizons (3/6/12 months);
   - hit-rate definitions for Buy/Hold/Sell (e.g., Buy hit = beats sector; Sell hit = lags sector; how Holds are scored);
   - the quantile meaning of bear, base and bull;
   - the Brier event definition;
   - corporate-action and delisting handling;
   - the first date at which a formal skill claim will be tested.

   Rule changes take effect only for future predictions, and the change itself is logged.
2. **Log everything, append-only.** Every published prediction goes in, including withdrawn or "updated" ones; an update is a new row, never an overwrite. Each row records the model and prompt version, model training cutoff, input-data snapshot hash and publication timestamp. The daily public hash should cover the whole log (e.g., a hash chain or Merkle root) so deletions are detectable. Publishing the hash to a third-party timestamp (e.g., a public repository commit or a transparency-log service) prevents back-dating.
3. **Hashing does not prevent selective disclosure.** Keeping several private logs and publishing only the winner, or quietly not covering hard names, defeats a hash. Mitigations: commit to the coverage universe in advance (all S&P 500 members as of the cohort date), publish counts of predictions generated vs. published, and keep one public log per product.
4. **Universe and survivorship.** Grade every prediction to its horizon, including companies acquired, delisted or removed from the index. Use point-in-time membership and GICS classification.
5. **Benchmarks and baselines.** Always show naive comparators: always-Hold or equal-weight; P = base rate for Brier; volatility-based ranges for the interval score; random ratings with the same Buy/Hold/Sell mix for hit rate. Report skill *relative to* these.
6. **Uncertainty.** Publish confidence intervals clustered by date (and firm) and the number of independent-equivalent observations. Label results "descriptive, not statistically conclusive" until the pre-registered evaluation date.
7. **Internal backtests are labelled as such.** Never mix backtested and live results in one chart or number. Report trial counts, DSR or haircut Sharpe, and PBO for any factor-score backtest. Never present LLM-pipeline backtests before the model's cutoff as performance.
8. **Versioning.** Report aggregate and per-version performance. Never retire an underperforming version from the public record. A new model version starts its own forward record, while the combined record continues.

### Gaps
- **Finance-specific pre-registration examples** were not retrieved this session: Harvey's 2017 AFA Presidential Address, "The Scientific Outlook in Financial Economics" (JF 72(4)), which recalls Bayesianized p-values and minimum Bayes factors; Journal of Accounting Research's 2017 registered-report conference issue; and the Journal of Finance replication policies. Verify before citing.
- McLean & Pontiff (2016, JF 71(1)), "Does Academic Research Destroy Stock Return Predictability?", was not verified (Wiley returned 403). I recall that anomaly returns fall about 26% out-of-sample and about 58% post-publication across 97 predictors. It is the standard evidence that backtested factor returns overstate live returns.
- Regulatory norms were not verified this session: the SEC Marketing Rule (Advisers Act Rule 206(4)-1) on "hypothetical performance," including backtests, which requires policies ensuring relevance to the audience and disclosure of assumptions; and the CFA Institute GIPS standards, which prohibit linking simulated and actual performance. Both are relevant to how a public app presents backtests versus its live record, and legal review is advisable.
- Public forward-only forecasting records in other domains (Good Judgment Project and Tetlock's Brier-scored tournaments, Metaculus, Numerai's live-stake tournament) were not retrieved this session as worked examples.
- Brodeur et al. (2022), on whether pre-registration and pre-analysis plans reduce p-hacking in economics, appeared in search results, but its findings were not retrieved.
