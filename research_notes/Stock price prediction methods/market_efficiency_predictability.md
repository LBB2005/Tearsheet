# Market Efficiency and Time-Series Return Predictability: What Can Be Predicted, Over What Horizons, and How Well Out of Sample

Scope note for the report writer: Source types are tagged **[PR]** (peer-reviewed journal article), **[WP]** (working paper or preprint), **[Vendor]** (index or fund-industry vendor research), **[Secondary]** (press, blog or summary site; used only where a primary source could not be fetched). Figures marked "fetched" were read directly from the primary PDF in this session. A few foundational citations could not be fetched (nobelprize.org and spglobal.com returned HTTP 403). Those are flagged "not fetched" and should be checked before publication. Unless stated otherwise, "R²" means out-of-sample (OOS) R², and all academic long-short returns are **gross of trading costs**.

## 1. What do the foundational efficient-markets and random-walk papers establish, and what is the current consensus?

### Takeaway
The foundational work shows that short-horizon price changes are close to unpredictable, though not exactly a random walk. It also shows that prices move more than later cash flows can justify, and that aggregate expected returns change slowly over time. Today the field broadly agrees that discount rates (expected returns) vary over time and are partly predictable at multi-year horizons, while day-to-month price moves for large, liquid stocks stay close to unpredictable. Whether that variation is rational risk premia or mispricing is still unresolved, because of the "joint hypothesis" problem.

### Cited Findings
- **Fama (1970)**, "Efficient Capital Markets: A Review of Theory and Empirical Work," *Journal of Finance* 25(2):383–417. **[PR]** It defines an efficient market as one where prices "fully reflect" available information, and it sorts tests into weak form (past prices), semi-strong form (public information) and strong form (private information). — [DOI 10.1111/j.1540-6261.1970.tb00518.x](https://doi.org/10.1111/j.1540-6261.1970.tb00518.x) (bibliographic; not fetched)
- **Fama (1991)**, "Efficient Capital Markets: II," *Journal of Finance* 46(5):1575–1617. **[PR]** It regroups the tests as (i) tests for return predictability, (ii) event studies and (iii) tests for private information. It accepts that returns are predictable at long horizons from dividend yields and term-structure variables, and it stresses that efficiency can only be tested jointly with a model of expected returns. — [DOI 10.1111/j.1540-6261.1991.tb04636.x](https://doi.org/10.1111/j.1540-6261.1991.tb04636.x) (bibliographic; not fetched; content is the standard reading of the paper)
- **Lo & MacKinlay (1988)**, "Stock Market Prices Do Not Follow Random Walks: Evidence from a Simple Specification Test," *Review of Financial Studies* 1:41–66. **[PR]** Variance-ratio tests on **weekly** returns, **1962–1985**, strongly reject the random walk for several indexes. The rejections come "largely" from **small stocks**, but infrequent trading and time-varying volatility cannot fully explain them. The authors add that the rejection does not support a mean-reverting stationary model. — [Lo & MacKinlay abstract, MIT](https://web.mit.edu/Alo/www/Papers/lo-mackinlay-88.html)
- **Shiller (1981)**, "Do Stock Prices Move Too Much to be Justified by Subsequent Changes in Dividends?," *AER* 71(3):421–436. **[PR]** Real S&P Composite prices were far more volatile than the ex-post present value of later real dividends at a constant discount rate. The 1929–32 decline could not be explained by later dividends. The *AER* named it one of the "top 20" articles in its first 100 years. — [NBER w0456](https://www.nber.org/papers/w0456); [Yale Economics news](https://economics.yale.edu/news/110217/shiller-paper-cited-one-centurys-top-economic-articles)
- Fama, Hansen and Shiller shared the **2013 Nobel** "for their empirical analysis of asset prices." — [Lindau Nobel mediatheque, Shiller CV](https://mediatheque.lindau-nobel.org/laureates/shiller/cv). The Committee's popular summary is often paraphrased as "prices cannot be predicted over days or weeks, but the broad course can be foreseen over three to five years." That wording could not be fetched (nobelprize.org returned 403), so check the [2013 Scientific Background](https://www.nobelprize.org/uploads/2018/06/advanced-economicsciences2013.pdf) and press release before quoting it.
- **Cochrane (2011)**, "Presidential Address: Discount Rates," *Journal of Finance* 66(4). **[PR]** (fetched, NBER w16972 version). This is the consensus re-framing: discount rates vary over time. His Table I regresses annual CRSP value-weighted excess returns on the dividend yield, **1947–2009**:
  - At 1 year: b = 3.8 (t = 2.6), **R² = 0.09**.
  - At 5 years: b = 20.6 (t = 3.4), **R² = 0.28**.
  - Cochrane writes that the 9% R² "isn't impressive" on its face but has "huge economic significance": a one-percentage-point higher dividend yield forecasts nearly four points more return. These figures are **in-sample**.
  — [NBER w16972](https://www.nber.org/system/files/working_papers/w16972/w16972.pdf)
- **Campbell, Lettau, Malkiel & Xu (2023)**, "Idiosyncratic Equity Risk Two Decades Later," *Critical Finance Review* 12:203–223. **[PR]** (fetched, NBER w29916). They find return autocorrelations are "modest—particularly at the industry and firm-level," and industry and firm-level returns are weakly **negatively** autocorrelated. — [NBER w29916](https://nber.org/system/files/working_papers/w29916/w29916.pdf)
- **Malkiel (2003)**, "The Efficient Market Hypothesis and Its Critics," *Journal of Economic Perspectives* 17(1):59–82. **[PR]** It argues that documented patterns are small, unstable and tend to vanish after publication, and that professional managers do not reliably beat index funds. Malkiel's book *A Random Walk Down Wall Street* (1973 onward) is the popular version of the argument. — [DOI 10.1257/089533003321164958](https://doi.org/10.1257/089533003321164958) (bibliographic; not fetched)

### Inferences
- The working consensus is "efficient enough." No stable, cost-surviving short-horizon price pattern exists for large caps. Expected returns do vary over time and across stocks, mainly through slow-moving valuation and risk-premium channels. That is consistent with a modest edge from fundamentals-based composite scores, not with confident price-target point forecasts.
- Because of the joint-hypothesis problem, a factor score that "works" may be earning a risk premium rather than finding mispricing. For a public app this matters: Buy-rated stocks may simply be riskier, so excess-return grading should consider risk-adjusting, for example with factor-model alphas.

### Gaps
- The 2013 Nobel Scientific Background ("Understanding Asset Prices") and Fama's Nobel lecture ("Two Pillars of Asset Pricing," *AER* 2014) could not be fetched (HTTP 403). Their exact wording and figures are not in these notes.
- Fama 1970, Fama 1991 and Malkiel 2003 are cited from bibliographic knowledge, not fetched text.

## 2. How well do aggregate predictors (dividend yield, earnings yield, CAPE, term spread, etc.) forecast market returns out of sample?

### Takeaway
In-sample, valuation ratios forecast the market at 1–5-year horizons (Cochrane: R² of 9% at 1 year and 28% at 5 years). Out of sample, most predictors fail to beat the historical-mean forecast.
- **Welch & Goyal (2008):** none would have helped a real-time investor.
- **Campbell & Thompson (2008):** with sign restrictions some predictors turn slightly positive (monthly OOS R² of about 0.1–0.7%), which they argue is still economically meaningful.
- **Goyal, Welch & Zafirov (2024):** most of the 46 tested variables have lost support, and only a handful survive.

Machine-learning market timing produces small positive OOS R² values (around 1–2% monthly for the S&P 500). Those results are sensitive to model and sample-split choices.

### Cited Findings
- **Welch & Goyal (2008)**, "A Comprehensive Look at the Empirical Performance of Equity Premium Prediction," *RFS* 21(4):1455–1508. **[PR]** None of the classic predictors (dividend and earnings yields, book-to-market, interest rates, term and default spreads, inflation, issuance, etc.) would have helped a real-world investor outpredict the then-prevailing historical mean equity premium. — [SFI summary](https://sfi.ch/en/publications/a-comprehensive-2022-look-at-the-empirical-performance-of-equity-premium-prediction); [NBER w10483 (WP version)](https://causalclaims.trfetzer.com/paper/w10483.html)
- **Campbell & Thompson (2008)**, "Predicting Excess Stock Returns Out of Sample: Can Anything Beat the Historical Average?," *RFS* 21(4). **[PR]** The figures below are monthly OOS R² from the **June 2005 NBER WP 11468** version (fetched). The published RFS numbers may differ slightly. Data: S&P 500 total returns, Shiller data before 1927, CRSP from 1927. The OOS window runs from 1927 (or later, per variable) to **Dec 2003**. — [NBER w11468](https://www.nber.org/system/files/working_papers/w11468/w11468.pdf)
  - **Unrestricted (Panel A):**
    - Dividend-price ratio: **−0.331%**
    - Earnings-price ratio: **+0.258%**
    - Smoothed (10-yr, CAPE-style) E/P: **+0.098%**
    - Book-to-market: **−1.328%**
    - T-bill rate: +0.328%
    - Long-term yield: −0.573%
    - Term spread: **+0.394%**
    - Default yield spread: −0.595%
    - Inflation: +0.701%
    - Equity share of new issues: +0.392%
    - Consumption-wealth ratio (cay; OOS from 1972): +1.152%
  - **With a correct-sign restriction on the coefficient (Panel B):**
    - D/P: +0.001%
    - E/P: +0.264%
    - Smoothed E/P: +0.236%
  - **Economic argument (fetched text):** The right comparison is R² against the squared Sharpe ratio. The monthly Sharpe ratio since 1871 is 0.108 (0.374 annual), so S² = 1.2%. An E/P OOS R² of 0.25% therefore raises a mean-variance investor's average portfolio return by a proportional **0.25/1.2 = 21%**. That is about **25 bp/month (≈3%/yr)** at unit risk aversion and about **1%/yr** at risk aversion 3.
  - A genuinely predictive variable with a stable coefficient can still show poor OOS performance "for an extended period of time."
- **Goyal, Welch & Zafirov (2024)**, "A Comprehensive 2022 Look at the Empirical Performance of Equity Premium Prediction," *RFS* 37(11):3490–3557. **[PR]** It re-examines **29 variables from 26 papers** published after GW 2008, plus the **17 original** variables, with data extended to the end of 2021. — [IDEAS/RePEc](https://ideas.repec.org/a/oup/rfinst/v37y2024i11p3490-3557..html); [SFI](https://sfi.ch/en/publications/a-comprehensive-2022-look-at-the-empirical-performance-of-equity-premium-prediction)
  - More than a third of the new variables are no longer significant even in-sample.
  - About half of the remaining variables perform poorly OOS.
  - "A handful still perform reasonably well." — [Welch paper page](https://ivo-welch.org/home/card-eqpredict.html)
  - The 2021 WP version was more pessimistic, calling much of the literature "obsolete." — [SFI WP 21-85](https://www.sfi.ch/en/publications/n-21-85-a-comprehensive-look-at-the-empirical-performance-of-equity-premium-prediction-ii)
  - Welch's page says the samples "extend to 2020," while the SFI abstract says "end of 2021." This is a minor discrepancy.
- **Survivors in Goyal–Welch–Zafirov.** Welch's summary table lists these positive OOS R² values (data frequency, probably annual, is not stated on the page, so treat as indicative):
  - Aggregate accruals (Hirshleifer, Hou & Teoh): 16.68 and 12.49; cash-flow variant: 5.16
  - Møller & Rangvid gpce: 6.85 and 4.86
  - Chava, Gallmeyer & Park: 2.61
  - Cochrane i/k (investment-capital ratio): 2.26
  - Pollet & Wilson: 1.09
  - Rapach, Ringgenberg & Zhou short interest: 0.74
  - Piazzesi, Schneider & Tuzel: 0.59

  Many other variables have negative OOS R². Selection required a significant in-sample statistic, stable half-sample coefficients and a significant positive OOS R². — [Welch paper page](https://ivo-welch.org/home/card-eqpredict.html)
- **Later work summarizing the update.** An arXiv paper summarizes Goyal et al. (2023) as finding "the majority of models yielding negative or barely positive out-of-sample R²." **[WP]** — [arXiv 2312.05593](https://arxiv.org/pdf/2312.05593)
- **Sample-split sensitivity.** An NYU study of 21 predictors finds "dramatic disagreement" in OOS predictability conclusions depending on the sample-split date. **[WP]** — [NYU CTED](https://www.nyucted.org/publications/out-of-sample-equity-premium-predictability-and-sample-split-invariant-inference)
- **Recent positive claims (2025–26).** These depend on specific designs:
  - *JFQA*, "Equity Premium Predictability over the Business Cycle": term-spread-based recession probabilities improve equity-premium prediction in-sample and OOS. **[PR]** — [Cambridge/JFQA](https://www.cambridge.org/core/journals/journal-of-financial-and-quantitative-analysis/article/abs/equity-premium-predictability-over-the-business-cycle/2DB91AB43900E18630D84C78F7FE85A8)
  - Regime-combination forecasts in *Mathematics* (2025). **[PR, lower-tier journal]** — [MDPI](https://doi.org/10.3390/math13020257)
- **Machine-learning market timing: Gu, Kelly & Xiu (2020)**, *RFS* 33(5). **[PR]** (fetched, NBER w25398). Monthly OOS R² for the **S&P 500** over **1987–2016**, aggregated bottom-up from stock forecasts: **1.80%** (NN3), **1.37%** (random forest), **−0.22%** (OLS-3). — [NBER w25398](https://www.nber.org/papers/w25398.pdf)
  - A Campbell–Thompson timing strategy using NN3 raises the S&P 500 Sharpe ratio from **0.51 (buy-and-hold) to 0.77**.
  - That is gross of trading costs, with leverage capped at 50% and no shorting.

### Inferences
- For the app's 12-month price ranges, aggregate-market forecasting adds little reliable information OOS. A neutral, unconditional market return assumption, plus perhaps a mild valuation tilt, is defensible. Strong market-direction calls are not supported.
- Grading against SPY and the sector removes most of the market-timing problem. The app's skill then has to come from **cross-sectional** (stock-versus-peers) prediction, where the evidence is somewhat better (Section 3).
- Campbell–Thompson shows that tiny R² can matter economically to a portfolio. It does **not** imply that individual calls will often be right (see the Section 3 inference on hit rates).

### Gaps
- I could not fetch the GWZ (2024) tables, so the exact OOS R² for D/P, E/P, CAPE and term spread over 1970–2021 are not recorded here. The [SSRN abstract 3929119](https://ssrn.com/abstract=3929119) holds the full tables.
- I could not verify the published-version (RFS 2008) Campbell–Thompson numbers. The figures above come from the 2005 NBER WP.
- Kelly, Malamud & Zhou (2024, *JF*), "The Virtue of Complexity in Return Prediction," which argues that heavily over-parameterized timing models can have negative OOS R² yet positive timing Sharpe ratios, was not fetched.
- Rapach, Strauss & Zhou (2010) forecast combination was also not fetched.

## 3. What is the typical R² for monthly individual-stock return prediction, and why is a small R² still economically meaningful?

### Takeaway
The best published OOS stock-level forecasts explain about **0.4% of monthly return variance** across all US stocks, about **0.7% for the 1,000 largest**, and about **3–5% of annual return variance** (Gu, Kelly & Xiu 2020, 1987–2016). Small R² values matter because a weak per-stock signal applied across hundreds of stocks and many months adds up to large portfolio Sharpe ratios. Even so, published anomaly returns decay out of sample (McLean & Pontiff: −26% OOS, −58% post-publication), are concentrated in microcaps (Hou, Xue & Zhang), and are eroded by trading costs (Novy-Marx & Velikov).

### Cited Findings
- **Gu, Kelly & Xiu (2020)**, "Empirical Asset Pricing via Machine Learning," *RFS* 33(5):2223–2273. **[PR]** Figures fetched from NBER WP 25398. — [NBER w25398](https://www.nber.org/papers/w25398.pdf)
  - **Sample:** CRSP NYSE/AMEX/NASDAQ, **March 1957–Dec 2016**. Almost 30,000 stocks, averaging more than 6,200 per month.
  - **Predictors:** 94 firm characteristics (61 annual, 13 quarterly, 20 monthly), 74 two-digit SIC industry dummies, and 8 macro predictors with their interactions (920 features).
  - **Split:** training 1957–1974, validation 1975–1986, **OOS test 1987–2016**.
  - **Monthly OOS R² (%) from Table 1, by universe (All / Top 1000 by market cap / Bottom 1000):**

    | Model | All | Top 1000 | Bottom 1000 |
    |---|---|---|---|
    | OLS with all predictors | −3.46 | −11.28 | −1.30 |
    | OLS-3 (size, B/M, momentum) | 0.16 | 0.31 | 0.17 |
    | PLS | 0.27 | −0.14 | 0.42 |
    | PCR | 0.26 | 0.06 | 0.34 |
    | Elastic net | 0.11 | 0.25 | 0.20 |
    | Random forest | 0.33 | 0.63 | 0.35 |
    | GBRT | 0.34 | 0.52 | 0.32 |
    | NN3 (best) | **0.40** | **0.70** | 0.45 |
    | NN4 | 0.39 | 0.67 | 0.47 |

    Tree and neural-network models among large stocks range from 0.52% to 0.70%, which the authors say provides "reassurance that machine learning is not merely picking up small scale inefficiencies driven by illiquidity."
  - **Annual OOS R² (%) from Table 2:**

    | Model | All | Top | Bottom |
    |---|---|---|---|
    | NN3 | 3.40 | 4.73 | 5.17 |
    | NN4 | 3.60 | 4.91 | 5.01 |
    | Random forest | 3.28 | 4.80 | 5.08 |
    | OLS-3 | 2.50 | 2.48 | 4.88 |
    | OLS with all predictors | −34.86 | −54.86 | −19.22 |

    Annual R² is "nearly an order of magnitude larger" than monthly.
  - **Benchmark caveat (footnote 34):** R² is measured against a **zero** forecast. Benchmarking against the historical mean inflates R² by about 3 points; OLS-3 would show 3.74% per month. The historical mean "is such a noisy forecaster that it is easily beaten by a fixed excess return forecast of zero."
  - **Dominant signals:** momentum, liquidity and volatility variants.
  - **Long-short decile Sharpe ratios** (annualized, OOS, **gross of trading costs**):
    - NN4: 1.35 value-weighted, 2.45 equal-weighted
    - OLS-3: 0.61 and 0.83
    - NN4 restricted to stocks above the NYSE size cutoff (equal-weighted): 1.69

    Table 8 reports high turnover and drawdowns, but no transaction-cost deduction appears in the headline Sharpe ratios.
- **Why small R² matters: Campbell & Thompson (2008).** The Sharpe ratio of an investor who uses a predictor with R² is SR* = √[(SR² + R²)/(1 − R²)]. The gain is large whenever R² is large relative to SR². Gu, Kelly & Xiu apply the formula: the S&P 500's 0.51 Sharpe rises to 0.71 with NN3's R². — [NBER w25398](https://www.nber.org/papers/w25398.pdf); [Campbell & Thompson NBER w11468](https://www.nber.org/system/files/working_papers/w11468/w11468.pdf)
- **Decay after publication: McLean & Pontiff (2016)**, "Does Academic Research Destroy Stock Return Predictability?," *JF* 71(1). **[PR]** Across **97** cross-sectional predictors, long-short returns are **26% lower out-of-sample** (the paper's upper bound on data mining) and **58% lower post-publication**. About **32 percentage points** are attributed to publication-informed trading. — [Paper PDF (gwern mirror)](https://Www.Gwern.net/doc/economics/2016-mclean.pdf); [Counterpoint mirror](https://counterpointfunds.com/wp-content/uploads/2017/07/PredictabilityMcleanPontiff.pdf). Some press coverage cites ~35% decay. The 32% figure is the paper's.
- **Replication without microcaps: Hou, Xue & Zhang (2020)**, "Replicating Anomalies," *RFS* 33(5):2019–2133. **[PR]** — [IDEAS/RePEc](https://ideas.repec.org/a/oup/rfinst/v33y2020i5p2019-2133..html); [Alpha Architect summary [Secondary]](https://alphaarchitect.com/replicating-anomalies/)
  - With NYSE breakpoints and value weighting to limit microcap influence, **65% of 452 anomalies** fail |t| ≥ 1.96, and **82%** fail a multiple-testing hurdle of t ≥ 2.78.
  - Microcaps are about **60% of stocks by count but ~3% of market cap**.
  - Trading-friction anomalies fare worst. Value, momentum, investment and profitability replicate best, with smaller magnitudes than originally reported.
- **Counterpoint: Jensen, Kelly & Pedersen (2023)**, "Is There a Replication Crisis in Finance?," *JF* 78(5):2465–2518. **[PR]** Using a Bayesian framework on **153 factors in 93 countries**, most factors replicate, cluster into **13 themes**, and work OOS. Secondary summaries put the replication rate around 82–85% (versus ~35% under the Hou–Xue–Zhang criteria), but they disagree on the exact figure, so verify it in the paper. — [NBER w28432](https://www.nber.org/papers/w28432); [Published version, CBS repository](https://research-api.cbs.dk/ws/portalfiles/portal/95651880/theis_ingerslev_jensen_et_al_is_there_a_replication_crisis_in_finance_publishersversion.pdf)
- **Trading costs: Novy-Marx & Velikov (2016)**, "A Taxonomy of Anomalies and Their Trading Costs," *RFS* 29(1):104–147. **[PR]** — [NBER w20721](https://nber.org/papers/w20721); [Alpha Architect [Secondary]](https://alphaarchitect.com/trading-costs-destroy-factor-investing/)
  - Most anomalies with one-sided monthly turnover **below 50%** still earn significant net spreads.
  - Few high-turnover strategies survive.
  - Costs cut value-weighted long-short returns by roughly **1% per month per unit of monthly one-sided turnover**.
  - Size, value and profitability have the largest capacity.

### Inferences
- **Translating R² into rating hit rates.** These are my calculations, assuming bivariate-normal forecast and outcome and a symmetric, mean-zero setup. The probability that the forecast sign matches the outcome sign is 0.5 + arcsin(√R²)/π:
  - Monthly R² of 0.4%: about **52.0%**
  - Monthly R² of 0.7% (large caps): about **52.7%**
  - Annual R² of 3.4%: about **55.9%**
  - Annual R² of 4.9% (best large-cap figure in Gu–Kelly–Xiu): about **57.1%**

  So even a state-of-the-art model should expect per-stock 12-month Buy/Sell calls to be right only around **55–57%** of the time against a zero benchmark. The app's grading UI and copy should set expectations in that range. Good performance shows up in aggregate (decile spreads), not in individual calls.
- Gu–Kelly–Xiu's pooled R² mixes cross-sectional and time-series components. A sector-relative grade uses only the cross-sectional part, so the relevant R² could be somewhat different. No source here isolates it.
- A composite factor score built from SEC filings (value, profitability, investment, accruals, issuance) relies on the low-turnover, high-capacity, better-replicating anomaly families. That is the most defensible choice given Hou–Xue–Zhang, Novy-Marx–Velikov and Jensen–Kelly–Pedersen. Expect effect sizes after publication to be roughly half of the original papers' figures (McLean–Pontiff).
- Measure the app's track record against a **zero (or sector-return) forecast**, not a historical-mean forecast. Gu–Kelly–Xiu show the historical-mean benchmark is weak enough to inflate R² by about 3 points.

### Gaps
- Lewellen (2015, *Critical Finance Review*), "The Cross-Section of Expected Stock Returns," which gives Fama–MacBeth-based OOS slopes for 15 characteristics, was not fetched. It would add a linear, interpretable benchmark R².
- No source here reports OOS R² restricted to **S&P 500 constituents only** or measured **relative to sector returns**.
- More recent ML papers (2021–2026), such as Chen–Pelger–Zhu and later LLM/text-based return-prediction work, were not covered within the tool budget.

## 4. How does predictability differ by horizon (days vs. months vs. years) and by firm size (large caps vs. small caps)?

### Takeaway
- **Aggregate market:** essentially unpredictable at short horizons. R² rises with horizon (in-sample 9% at 1 year, 28% at 5 years), but OOS gains are fragile.
- **Individual stocks:** monthly R² is well under 1%; annual R² is roughly ten times larger (3–5%) in Gu–Kelly–Xiu.
- **Signal mix by horizon:** price-trend signals dominate monthly forecasts; at the annual horizon industry membership gains importance.
- **Firm size:** short-horizon random-walk rejections and many anomalies are concentrated in small and micro caps. Large caps are more efficiently priced. Flexible ML models still found large-cap monthly R² (0.5–0.7%) above all-stock R².

### Cited Findings
- **Days and weeks.** Lo & MacKinlay (1988) reject the random walk in weekly index returns (1962–1985). The rejections are "due largely to behavior of small stocks." **[PR]** — [MIT abstract](https://web.mit.edu/Alo/www/Papers/lo-mackinlay-88.html)
- **Days to a month.** Campbell, Lettau, Malkiel & Xu (2023) find return autocorrelations at daily, weekly and monthly holding periods are modest, especially at the industry and firm level, with firm-level returns weakly negatively autocorrelated. CLMX found similar volatility patterns at daily, weekly and monthly frequencies, with a slightly weaker firm-level trend at longer holding periods. **[PR]** — [NBER w29916](https://nber.org/system/files/working_papers/w29916/w29916.pdf)
- **Months versus a year (stocks).** In Gu–Kelly–Xiu, monthly all-stock R² is at most 0.40% and annual is 3.40–3.60%, "nearly an order of magnitude larger." At the annual horizon, "price trend variables become less important compared to the liquidity and risk measures," and "industry (sic2) ... shows substantial predictive power at the annual frequency." **[PR]** — [NBER w25398](https://www.nber.org/papers/w25398.pdf)
- **Years (market).** In-sample dividend-yield regressions give R² = 0.09 at 1 year and 0.28 at 5 years (1947–2009). The standard deviation of expected excess returns is 5.46 percentage points at 1 year, 0.76 of the mean excess return. **[PR]** — [Cochrane, NBER w16972](https://www.nber.org/system/files/working_papers/w16972/w16972.pdf). OOS, most such predictors fail to beat the historical mean ([Goyal, Welch & Zafirov 2024](https://ideas.repec.org/a/oup/rfinst/v37y2024i11p3490-3557..html)).
- **Size: monthly.** Gu–Kelly–Xiu Top 1000 versus Bottom 1000:
  - NN3: 0.70% vs 0.45%
  - Random forest: 0.63% vs 0.35%

  Linear models do **worse** on large stocks (OLS with all predictors −11.28% vs −1.30%; PLS −0.14% vs +0.42%). Large-cap predictability seems to require nonlinear interactions, and naive linear factor models can be badly overfit for large caps. **[PR]** — [NBER w25398](https://www.nber.org/papers/w25398.pdf)
- **Size: annual.** Gu–Kelly–Xiu Top vs Bottom annual R²:
  - NN3: 4.73% vs 5.17%
  - OLS-3: 2.48% vs 4.88%

  Small stocks are more predictable with simple linear signals at the annual horizon. — [NBER w25398](https://www.nber.org/papers/w25398.pdf)
- **Size: anomalies.** With microcaps controlled, 65% of 452 anomalies fail at t ≥ 1.96. Microcaps are about 60% of stocks by number but about 3% of market value. **[PR]** — [Hou, Xue & Zhang, IDEAS](https://ideas.repec.org/a/oup/rfinst/v33y2020i5p2019-2133..html); [Alpha Architect [Secondary]](https://alphaarchitect.com/replicating-anomalies/). Jensen–Kelly–Pedersen report factor replicability across size groups (per a secondary summary; verify). — [NBER w28432](https://www.nber.org/papers/w28432)
- **Size: idiosyncratic noise.** The firm-level share of variance is about **80%** for the typical equal-weighted (small-heavy) stock versus about **60%** value-weighted (large-heavy), as of 2021. **[PR]** — [CLMX 2023, NBER w29916](https://nber.org/system/files/working_papers/w29916/w29916.pdf)
- **Turnover and horizon.** Strategies with monthly one-sided turnover above ~50% rarely survive trading costs. Slower signals (value, profitability) do. **[PR]** — [Novy-Marx & Velikov, NBER w20721](https://nber.org/papers/w20721)

### Inferences
- For a 12-month, large-cap, filings-based product, the relevant evidence is the **annual large-cap** figure: OOS R² of about 2.5% (linear, size/B/M/momentum) to about 4.9% (best ML), gross of costs. That sets an upper bound for a 12-month rating's explanatory power.
- Using sector-relative grades fits the evidence that industry membership matters at the annual horizon. However, sector *momentum* and *rotation* can swing sector-relative outcomes.
- Slow fundamental signals (12-month horizon, quarterly or annual filings) match where predictability survives costs. Short-term price patterns (1-month reversal, weekly effects) are largely small-cap or microstructure effects and irrelevant for S&P 500 12-month ratings.

### Gaps
- I did not fetch primary sources for the classic horizon structure of cross-sectional price patterns: short-term (1-month) reversal (Jegadeesh 1990), intermediate (3–12-month) momentum (Jegadeesh & Titman 1993), and long-term (3–5-year) reversal (De Bondt & Thaler 1985). Their magnitudes for S&P 500 stocks after 2000 are not documented here.
- No source here gives OOS R² computed on S&P 500 members specifically.

## 5. What do studies of active fund manager performance (SPIVA, Fama & French 2010) imply about the difficulty of beating the S&P 500?

### Takeaway
Most professional large-cap managers fail to beat the S&P 500 net of fees. In 2025, **78.8%** underperformed. Over 20 years **92.9%** did (absolute return) and **97.8%** on a risk-adjusted basis. Only about half of funds even survive 15 years. Fama & French (2010) find that, net of costs, few funds show enough skill to cover their costs, and skill appears only in the extreme tails gross of fees. Single-stock returns are also highly skewed: about 4% of listed stocks created all net US stock-market wealth since 1926. For a public rating product, beating SPY or sector benchmarks consistently is a high bar, and most professionals fail it.

### Cited Findings
- **SPIVA U.S. Scorecard Year-End 2025** (S&P Dow Jones Indices; data as of 31 Dec 2025). **[Vendor]** Fund returns are **net of fees, excluding loads**, with survivorship-bias correction (fetched). — [S&P DJI SPIVA U.S. page](https://www.spglobal.com/spdji/en/spiva/article/spiva-us/) (403 when fetched); figures read from [the full report PDF (third-party-hosted copy)](https://www.ariesadvisors.com/files/spiva-us-year-end-2025.pdf)
  - **Percentage of funds underperforming, absolute return (Report 1a):**

    | Category vs benchmark | 1y | 3y | 5y | 10y | 15y | 20y |
    |---|---|---|---|---|---|---|
    | All Large-Cap vs S&P 500 | **78.78** | 66.84 | 88.96 | 85.59 | 89.93 | **92.89** |
    | All Mid-Cap vs S&P MidCap 400 | 55.41 | 62.93 | 72.32 | 81.14 | 84.49 | 89.74 |
    | All Small-Cap vs S&P SmallCap 600 | 40.65 | 42.18 | 62.67 | 75.95 | 89.90 | 90.28 |
    | All Domestic vs S&P Composite 1500 | 79.83 | 80.40 | 91.47 | 90.43 | 93.15 | 95.01 |
    | Large-Cap Growth vs S&P 500 Growth | 95.51 | 56.33 | 95.26 | 91.67 | 97.82 | 99.55 |

  - **Risk-adjusted (Report 1b), All Large-Cap vs S&P 500:** 82.76 (3y), 91.14 (5y), 95.73 (10y), **98.61 (15y)**, 97.76 (20y).
  - **Survivorship (Report 2), All Large-Cap funds:**

    | Horizon | Funds at start | Surviving |
    |---|---|---|
    | 1y | 806 | 95.91% |
    | 3y | 754 | 90.05% |
    | 5y | 734 | 86.51% |
    | 10y | 937 | 67.02% |
    | 15y | 1,082 | 50.55% |

  - **Average annualized returns, All Large-Cap funds vs S&P 500:**

    | Horizon | Equal-weighted funds | Asset-weighted funds | S&P 500 |
    |---|---|---|---|
    | 1y | 14.76% | **18.03%** | 17.88% |
    | 5y | 11.39% | 12.52% | 14.42% |
    | 10y | 12.00% | 13.64% | 14.82% |
    | 20y | 8.86% | 9.62% | 11.00% |

    Note that the asset-weighted 1-year large-cap figure slightly **beat** the index in 2025.
  - The report attributes 2025 to the large-cap benchmark outperforming. The S&P 500 beat the S&P MidCap 400 by 10% and the SmallCap 600 by 12%, the third straight year of large-cap leadership.
- **Context for 2025.**
  - 79% in 2025 is up from 65% in 2024, and is the fourth-worst year in SPIVA's 25-year history. — [InvestmentNews [Secondary]](https://www.investmentnews.com/equities/active-managers-stumble-again-in-2025-as-large-caps-dominate/265541)
  - Mid-year 2025: 54% of large-cap funds underperformed over the half-year. — [SPIVA U.S. Mid-Year 2025 [Vendor]](https://www.spglobal.com/spdji/en/spiva/article/spiva-us-mid-year-2025)
  - Institutional: 67% of institutional accounts and 75% of wrap accounts underperformed the S&P 500 in 2025, **gross of fees**. — [SPIVA Institutional Year-End 2025 [Vendor]](https://www.spglobal.com/spdji/en/spiva/article/institutional-spiva-scorecard/)
- **SPIVA Mid-Year 2026.** One secondary site reports 67% of large-cap funds underperforming in H1 2026. This is **unverified** against S&P's own report. — [Walnut [Secondary]](https://walnutinvest.com/stats/active-fund-underperformance-spiva)
- **Fama & French (2010)**, "Luck versus Skill in the Cross-Section of Mutual Fund Returns," *JF* 65(5):1915–1947. **[PR]** US active equity mutual funds, 1984–2006 (sample period from bibliographic knowledge; verify). — [IDEAS/RePEc](https://ideas.repec.org/a/bla/jfinan/v65y2010i5p1915-1947.html); [Paper PDF (Dartmouth course mirror)](https://mba.tuck.dartmouth.edu/bespeneckbo/default/AFA611-Eckbo%20web%20site/AFA611-S8C-FamaFrench-LuckvSkill-JF10.pdf)
  - The aggregate portfolio of active funds tracks the market closely, but fees and expenses reduce investor returns.
  - Bootstrap simulations suggest few funds produce benchmark-adjusted expected returns sufficient to cover their costs (net returns).
  - Gross of expense ratios, there is evidence of true inferior and superior alpha in the **extreme tails** only.
  - Harvey & Liu (*JF*, 2022) argue Fama–French and Kosowski et al. (2006) reach "strikingly different conclusions" from similar bootstraps and propose adjustments. — [Duke PDF](https://people.duke.edu/~charvey/Research/Published_Papers/P151_Luck_versus_skill.pdf)
- **Bessembinder (2018)**, "Do Stocks Outperform Treasury Bills?," *JFE*. **[PR]** In CRSP from 1926 to 2016, the best-performing **~4% (1,092 of ~26,000)** of companies account for all net wealth creation, and **~57.4%** of stocks had lifetime buy-and-hold returns below one-month T-bills. The paper links this skewness to why poorly diversified active strategies usually underperform. Bessembinder says later updates do not change the punchline. — [ASU W. P. Carey summary](https://news.wpcarey.asu.edu/20180917-do-stocks-outperform-treasury-bills); [Paper PDF](https://wpcarey.asu.edu/sites/default/files/2021-10/do-stocks-outperform-treasury-bills.pdf); [Morningstar interview](https://www.morningstar.com/podcasts/the-long-view/hendrik-bessembinder-do-stocks-outperform-treasury-bills)

### Inferences
- **A realistic bar for the app.** Over any single 12-month window, roughly 55–80% of professional large-cap funds trail the S&P 500 net of fees. A rating system whose Buy list beats SPY about half the time is roughly at professional parity. Sustained, consistent outperformance across many years would be exceptional and should be presented cautiously.
- **Skewness and Buy-rating accuracy.** The median stock underperforms the index (Bessembinder), so a naive "Buy" on a randomly chosen stock is more likely than not to lose to SPY over long horizons. Hit-rate statistics should be compared with a base rate (the share of S&P 500 stocks beating SPY in that year), not with 50%.
- **Fees versus the app's grading.** SPIVA figures are net of fees, while academic factor returns are gross. The app's grades will be "paper" returns with no costs, so they are not directly comparable to SPIVA. The fair comparison is to gross-of-fee institutional figures (67% underperformed in 2025).
- **Regime dependence.** Underperformance rates swing with market concentration and large-cap leadership (65% in 2024, 79% in 2025, with 3-year and 5-year figures of 67% and 89%). An equal-weighted sector benchmark versus a cap-weighted SPY benchmark will produce different apparent skill in concentrated markets.

### Gaps
- I could not fetch S&P's own Mid-Year 2026 SPIVA report, so the 67% H1-2026 figure is unverified.
- SPIVA persistence scorecards (how often top-quartile funds stay top-quartile) were not fetched.
- The exact Fama–French (2010) t-statistic percentiles and sample period are not verified from the fetched text.

## 6. What fraction of a single stock's 12-month return is explained by market and sector moves versus company-specific news?

### Takeaway
For a typical (value-weighted, large-cap-tilted) US stock in recent data, roughly **30% of return variance comes from the market, about 10% from its industry, and about 60% is firm-specific** (Campbell, Lettau, Malkiel & Xu 2023, data through 2021). During 1962–1997 the firm-specific share was 60–80%, and market variance fell to about 10% in the late 1990s. For small and equal-weighted stocks the firm-specific share is about 80%. "Beat the sector" grades are therefore mostly a bet on idiosyncratic outcomes, the hardest component to predict and the noisiest to grade.

### Cited Findings
- **CLMX (2023)**, "Idiosyncratic Equity Risk Two Decades Later," *Critical Finance Review* 12. **[PR]** (fetched, NBER w29916). CRSP, **1926–2021**. Monthly variances are built from squared daily returns, split into market, industry and firm components as in CLMX (2001). — [NBER w29916](https://nber.org/system/files/working_papers/w29916/w29916.pdf)
  - **Value-weighted:** over 1962–1997 market and industry shares declined gradually, and "the share of firm-level variance was between 60% and 80%."
  - "Since 1997, the share of market variance has increased considerably. From a low of 10% in the late 1990s it briefly reached 40% during the global financial crisis and is around 30% in the most recent data."
  - The firm-level share is "below 50% in the global financial crisis and around 60% in the most recent data." Industry share is "somewhat higher" than in 1962–1997.
  - The shift happened "primarily because market and industry volatility have increased ... not because firm-level volatility has declined."
  - **Equal-weighted:** the firm-level share fell from about 95% at the end of the CLMX sample to about **80%** in the latest data.
  - Average pairwise correlation and average market-model R² track each other closely, so average market-model R² is roughly the market variance share.
- **Roll (1988)**, "R²," *Journal of Finance*. **[PR]** Market and industry factors explain only a small part of US individual stock return variation, with market-model R² around **20–30%**. Roll attributed the rest to private information or "occasional frenzy unrelated to concrete information." (Secondary characterization; the original was not fetched.) — [Search summary of Durnev et al./NYU archive and related papers](https://archive.nyu.edu/bitstream/2451/27594/2/SSRN-id272287.pdf)
- **Vuolteenaho (2002)**, "What Drives Firm-Level Stock Returns?," *JF* 57:233–264. **[PR]** It is cited in CLMX (2023). The standard reading is that firm-level returns are driven mainly by cash-flow (fundamental) news, whereas aggregate returns are driven mainly by discount-rate news. — [Reference list in NBER w29916](https://nber.org/system/files/working_papers/w29916/w29916.pdf) (content of the finding from bibliographic knowledge; not fetched)

### Inferences
- **For grading against SPY.** If about 30% of variance is market-driven, roughly 70% of a stock's return variance is non-market (industry plus firm). A 12-month "beat SPY" outcome is dominated by sector and stock-specific moves.
- **For grading against a sector benchmark.** Subtracting the sector return removes market and industry variance, about 40% combined. That leaves about 60% firm-specific variance, which is what a sector-relative grade measures.
- **GICS sectors are coarser than CLMX industries.** CLMX's industry classification is finer than the 11 GICS sectors, so a GICS-sector benchmark probably removes **less** variance than CLMX's industry component, leaving more than 60% unexplained. This is an inference; not quantified.
- **Signal versus noise per rating.** With firm-specific variance dominating and annual stock-level OOS R² of about 3–5% at best (Gu–Kelly–Xiu), most of the variance in a sector-relative 12-month outcome is unpredictable news. The bear/base/bull range should be wide: for a typical S&P 500 stock with ~25–35% annual volatility, the 1-sigma firm-specific component alone is about ±20% (approximation, not sourced). The "base" case should carry low confidence.
- **Statistical power for evaluating the app.** Each 12-month grade is a very noisy observation. Telling a 57% hit rate from 50% at conventional significance needs on the order of a few hundred independent calls (binomial approximation, n ≈ (1.96 × 0.5/0.07)² ≈ 200). S&P 500 ratings are cross-sectionally correlated within a year, because sector and market shocks are shared. That lowers the effective sample, so several years of track record are needed before claiming skill.
- **Regime dependence of the variance shares.** The market share rises in crises (40% in 2008–09). In high-correlation years "beat SPY" outcomes are more driven by beta and sector exposure, while in low-correlation years stock selection matters more.

### Gaps
- I found no source that decomposes variance at the **12-month** horizon specifically for **S&P 500 constituents** using **GICS sectors**. CLMX use daily returns aggregated to monthly and annual variance (they did not look beyond one-month holding periods for autocorrelation-adjusted estimates). S&P DJI's dispersion, volatility and correlation dashboards (referenced in the SPIVA YE2025 report) could supply S&P 500-specific correlation and dispersion series but were not fetched.
- Roll (1988) original figures (monthly vs daily R², industry increment) were not verified from the primary text.
- Morck, Yeung & Yu (2000) cross-country "synchronicity" R² figures for the US were not fetched.
