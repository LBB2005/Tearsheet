# Machine-Learning Asset Pricing: What ML Adds Over Linear Factor Models, Where the Gains Come From, and Whether They Survive in Large, Liquid US Stocks After Costs

Scope note for the report writer: R² figures below are monthly, out-of-sample, stock-level, and gross of costs unless stated otherwise. Gu-Kelly-Xiu (GKX) R² is measured against a forecast of zero, not against the historical mean. GKX state that using the historical mean as the benchmark would inflate R² by about 3 percentage points. "PR" = peer-reviewed; "WP" = working paper. The web-search budget ran out partway through, so some items in the 2022–2026 literature appear under Gaps rather than as verified findings.

## Q1. What did Gu, Kelly & Xiu (2020), "Empirical Asset Pricing via Machine Learning," find?

### Takeaway
GKX (RFS 2020, PR) is the benchmark study. Nonlinear models (neural nets and trees) roughly double the monthly out-of-sample R² of a three-variable OLS model across all US stocks (0.40% vs 0.16%). The gain is larger among the top 1,000 stocks by size (0.70% vs 0.31%). Value-weighted long-short Sharpe ratios also roughly double (1.35 vs 0.61). All of this is gross of costs, with turnover above 100% a month. Price trend, liquidity and volatility signals dominate.

### Cited Findings
- **Publication and data.** Review of Financial Studies 33(5), 2020, pp. 2223–2274 (PR). The sample covers about 30,000 CRSP stocks (NYSE/AMEX/NASDAQ), March 1957–December 2016, with more than 6,200 stocks a month on average. It includes penny stocks and financials; the authors say results are "qualitatively identical" with those filters applied. Predictors are 94 firm characteristics (61 annual, 13 quarterly, 20 monthly), 74 SIC-2 industry dummies and 8 Welch-Goyal macro variables, with characteristic × macro interactions giving 920 features. Characteristics are ranked cross-sectionally into [-1, 1]. — [GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)
- **Design.** Training 1957–1974, validation 1975–1986, out-of-sample test 1987–2016 (30 years). Models are refit annually on an expanding window with a rolling 12-year validation window, and no cross-validation is used, to preserve time ordering. — [GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)
- **Models compared.** OLS (all features), OLS-3 (size, book-to-market, momentum), PLS, PCR, elastic net, a generalized linear model with group lasso (additive splines), random forest, gradient-boosted trees, and feed-forward neural nets NN1–NN5. — [GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)
- **Table 1: monthly out-of-sample R² (%), stock level.**

  | Universe | OLS | OLS-3 | PLS | PCR | ENet | GLM | RF | GBRT | NN1 | NN2 | NN3 | NN4 | NN5 |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|
  | All stocks | −3.46 | 0.16 | 0.27 | 0.26 | 0.11 | 0.19 | 0.33 | 0.34 | 0.33 | 0.39 | 0.40 | 0.39 | 0.36 |
  | Top 1,000 | −11.28 | 0.31 | −0.14 | 0.06 | 0.25 | 0.14 | 0.63 | 0.52 | 0.49 | 0.62 | 0.70 | 0.67 | 0.64 |
  | Bottom 1,000 | −1.30 | 0.17 | 0.42 | 0.34 | 0.20 | 0.30 | 0.35 | 0.32 | 0.38 | 0.46 | 0.45 | 0.47 | 0.42 |

  The top- and bottom-1,000 rows evaluate the model trained on all stocks within those subsets; they are not separately trained models. — [GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)
- **Table 2: annual-horizon out-of-sample R² (%).**

  | Universe | OLS | OLS-3 | PLS | PCR | ENet | GLM | RF | GBRT | NN1 | NN2 | NN3 | NN4 | NN5 |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|
  | All stocks | −34.86 | 2.50 | 2.93 | 3.08 | 1.78 | 2.60 | 3.28 | 3.09 | 2.64 | 2.70 | 3.40 | 3.60 | 2.79 |
  | Top 1,000 | −54.86 | 2.48 | 1.84 | 1.64 | 1.90 | 1.82 | 4.80 | 4.07 | 2.77 | 4.24 | 4.73 | 4.91 | 4.86 |
  | Bottom 1,000 | −19.22 | 4.88 | 5.36 | 5.44 | 3.94 | 5.00 | 5.08 | 4.61 | 4.37 | 3.72 | 5.17 | 5.01 | 3.58 |

  — [GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)
- **Authors' reading of the size split.** "Tree methods and neural networks are especially successful among large stocks," with R² of 0.52%–0.70%. They argue this shows ML "is not merely picking up small scale inefficiencies driven by illiquidity." Annual R² is "nearly an order of magnitude larger" than monthly, which they read as capturing risk premiums that persist at business-cycle frequencies. — [GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)
- **Statistical significance (Diebold-Mariano tests).** Neural nets are the only models with large, significant improvements over linear models and the GLM. Trees improve on linear models, but "at best marginally significant." Nets beat trees, but not significantly. Deep nets (NN4, NN5) do not improve on NN3. — [GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)
- **Long-short portfolios (Table 7, value-weighted, monthly decile sorts, 1987–2016, gross).**
  - Average monthly H–L return / annualized Sharpe ratio: OLS-3 0.94% / 0.61; PLS 1.02% / 0.72; PCR 1.22% / 0.88; GBRT 0.99% / 0.81; NN1 1.81% / 1.17; NN2 1.92% / 1.16; NN3 2.12% / 1.20; NN4 2.26% / 1.35; NN5 1.97% / 1.15.
  - NN4 earns 2.3% a month (27.1% annualized) with 20.1% annualized volatility.
  - Equal-weighted: NN4 Sharpe 2.45 vs OLS-3 0.83. Equal-weighted NN4 excluding stocks below the NYSE 20th size percentile: Sharpe 1.69.

  — [GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)
- **Table 8: alphas, drawdowns and turnover (value-weighted).**
  - FF5+momentum alpha: NN4 1.76% a month (t = 6.00) vs OLS-3 0.39% (t = 2.76).
  - Maximum drawdown: NN4 51.8% vs OLS-3 69.6%.
  - Monthly turnover: OLS-3 58%; PLS, PCR and the nets 110%–130%; ENet 152%. For comparison, a short-term-reversal decile spread turns over 172.6% a month and a size spread 22.9%. GKX note that the outperformance comes "with comparatively high portfolio turnover."
  - Costs are not deducted anywhere in the paper.

  — [GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)
- **Ensembles.** An equal-weight ensemble of 11 models gives R² 0.43% and Sharpe 2.49 (EW) / 1.33 (VW). Picking the best model each year from validation R² gives R² 0.45% and Sharpe 2.42 (EW) / 1.23 (VW); over 30 years it chose NN3 11 times, NN1 7, GBRT 6, NN2 5 and NN4 once. — [GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)
- **Bottom-up S&P 500 timing (index-level, not cross-sectional).**
  - Monthly out-of-sample R²: OLS-3 −0.22%, PLS −0.86%, PCR −1.55%, ENet 0.75%, GLM 0.71%, RF 1.37%, GBRT 1.40%, NN1 1.08%, NN2 1.13%, NN3 1.80%, NN4 1.63%, NN5 1.17%.
  - Timing the S&P 500 with NN3 raises the annualized Sharpe ratio from 0.51 (buy-and-hold) to 0.77.
  - For "Big" Fama-French sub-portfolios, NN3 R² is about 1.46%–1.78% (e.g., big value 1.46%, big growth 1.50%).

  — [GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)
- **Most important predictors.** All models broadly agree, in four groups:
  1. Price trends: short-term reversal (mom1m), 12-month momentum (mom12m), momentum change (chmom), industry momentum (indmom), maximum daily return (maxret), long-term reversal (mom36m). These are 5 of the top 7.
  2. Liquidity: turnover and its volatility, log market cap (mvel1), dollar volume, Amihud illiquidity, zero-trade days, bid-ask spread.
  3. Risk: total and idiosyncratic volatility, beta, beta squared.
  4. Valuation and fundamentals: earnings-to-price, sales-to-price, asset growth, number of recent earnings increases.

  Among the macro variables, all models agree the aggregate book-to-market ratio is critical. — [GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)
- **Small data limits model complexity.** Trees pick shallow structures (on average fewer than six leaves), which the authors attribute to the "small amount of data and tiny signal-to-noise ratio" of return prediction. — [GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)

### Inferences
- Among large caps, the incremental R² from ML over a parsimonious linear model is about +0.3 to +0.4 percentage points a month (0.31% → 0.63%–0.70%), gross. A three-variable OLS still captures about 45% of the best net's large-cap R². Regularized linear models (ENet 0.25%) and dimension reduction (PLS −0.14%, PCR 0.06%) do worse than OLS-3 in large caps, so "linear" is not uniformly safe. It depends heavily on which few variables are used.
- At the 12-month horizon, which matters most for a Buy/Hold/Sell product, large-cap R² roughly doubles from OLS-3 (2.48%) to NN4 / RF (about 4.8%–4.9%). So the nonlinear gain persists at longer horizons and is not only a short-term-reversal effect.
- The value-weighted H–L returns include all stocks, microcaps among them. Value weighting reduces but does not eliminate small-stock influence, and none of the Sharpe ratios are net of costs.

### Gaps
- GKX do not report long-short Sharpe ratios or turnover separately for the top-1,000 universe. Internet Appendix Tables A.9–A.11 (equal-weight, size-filtered, larger OLS benchmarks) were not retrieved, apart from the NN4 Sharpe of 1.69 quoted in the main text.
- No S&P 500-only stock-level R² is reported; the S&P 500 figures are index-timing R².

## Q2. Later key work (2019–2026): IPCA, autoencoders, deep-learning SDFs, nonparametric selection, "virtue of complexity" and its critiques, ML portfolios with trading costs, other markets

### Takeaway
After GKX, the literature moved in three directions:
1. Toward economically structured models (IPCA, autoencoders, deep-learning SDFs), some of which hold up better in liquid stocks than unrestricted nets.
2. Toward high-complexity "virtue of complexity" models, whose headline market-timing result has been heavily challenged in 2023–2025 working papers.
3. Toward cost-aware ML portfolios (Jensen-Kelly-Malamud-Pedersen, in press at RFS), which concede that cost-blind ML predictions load on "fleeting, small-scale" characteristics.

### Cited Findings
- **Kelly, Pruitt & Su (2019), "Characteristics Are Covariances," JFE (PR).** IPCA uses characteristics as instruments for time-varying factor loadings. Four IPCA factors explain the cross-section of average returns better than existing factor models. Only eight characteristics are statistically significant and they account for nearly all of the model's accuracy. Anomaly intercepts are small and insignificant. — [NBER w24540](https://www.nber.org/papers/w24540)
- **Freyberger, Neuhierl & Weber (2020), "Dissecting Characteristics Nonparametrically," RFS 33(5):2326–2377 (PR).**
  - Method: adaptive group LASSO with nonparametric (spline) effects for each characteristic.
  - Findings: many previously published predictors add no incremental information, and nonlinearities are important.
  - Performance: out-of-sample explanatory power beats linear panel regressions, and Sharpe ratios rise by 50%.

  — [NBER w23227](https://www.nber.org/papers/w23227)
- **Gu, Kelly & Xiu (2021), conditional autoencoder (CA).** The model relaxes IPCA's linearity: factor loadings are nonlinear neural-net functions of characteristics. In Avramov et al.'s replication (1987–2017, value-weighted), the CA long-short earns 1.16% a month with an FF6 alpha of 0.75%. — [Avramov, Cheng & Metzker 2023](https://si-cheng.net/wp-content/uploads/2023/05/2023-ms-avramov_cheng_metzker-machine-learning-vs.-economic-restrictions.pdf)
- **Chen, Pelger & Zhu (2024), "Deep Learning in Asset Pricing," Management Science (PR; DOI 10.1287/mnsc.2023.4695).**
  - Method: estimates the SDF by imposing the no-arbitrage condition, combining a feed-forward net, an LSTM (for macro states) and adversarially built test assets (GAN).
  - Results: beats all benchmarks out of sample on Sharpe ratio, explained variation and pricing errors.
  - A 2019 working-paper poster reports an out-of-sample annual Sharpe ratio of about 2.1; the final published figure was not verified.

  — [arXiv 1904.00745](https://arxiv.org/abs/1904.00745); [AI FinTech poster 2019](https://web.stanford.edu/~lych/research/DeepAssetPricing/AI_FinTech_Poster_2019.pdf)
- **CPZ in replication.** In Avramov et al.'s replication, the CPZ signal earns 2.18% a month value-weighted long-short with an FF6 alpha of 1.87%, but has the highest turnover (≥163% a month). — [Avramov, Cheng & Metzker 2023](https://si-cheng.net/wp-content/uploads/2023/05/2023-ms-avramov_cheng_metzker-machine-learning-vs.-economic-restrictions.pdf)
- **Kelly, Malamud & Zhou (2024), "The Virtue of Complexity in Return Prediction," Journal of Finance 79, 459–503 (PR).**
  - Setup: time-series timing of the CRSP value-weighted index, not the cross-section. It uses P = 12,000 random Fourier features built from K = 15 predictors (Welch-Goyal variables plus lagged returns), rolling training windows as short as T = 12 months, and ridgeless regression.
  - Result: positive out-of-sample timing alpha (Nagel's replication: information ratio 0.255, t = 2.417; 0.296 / t = 2.811 when returns are standardized as KMZ do).

  — [Nagel 2025](https://voices.uchicago.edu/stefannagel/files/2025/07/Complexity_2.pdf)
- **Nagel (2025), "Seemingly Virtuous Complexity in Return Prediction," WP dated July 30, 2025.**
  - Mechanism: when P ≫ T, the RFF forecast becomes a kernel-weighted average of the 12 training-window returns. Because predictors are persistent, recent months get more weight, and the weights shrink with predictor volatility. The strategy is therefore mechanically a "volatility-timed momentum strategy," not something learned from data.
  - Numbers: the vol-timed momentum strategy alone has information ratio 0.388 (t = 3.684). Controlling for it, the RFF strategy's alpha falls to 1.2% a year (t = 0.945, IR 0.10). On simulated data with reversals rather than momentum, the same method builds the same strategy and loses money.
  - KMZ's own asymptotic theory implies an attainable Sharpe ratio of only about 0.17 annualized at P/T = 10.

  — [Nagel 2025](https://voices.uchicago.edu/stefannagel/files/2025/07/Complexity_2.pdf)
- **Other critiques** (all summarized in Nagel 2025):
  - Berk (2023, WP): KMZ's reported Sharpe ratios are averages over 1,000 random-weight draws, so they are not achievable by any single strategy.
  - Buncic (2025, WP): the rising performance-vs-complexity relation disappears when forecasts are aggregated across draws before computing performance.
  - Kelly & Malamud (2025) reply that such aggregation is itself an ensemble, and so a complex model.
  - Cartea, Jin & Shi (2025): measurement error in predictors limits the virtue of complexity.
  - Fallahgoul (2025): information-theoretic bounds show complex relationships cannot be learned at KMZ's sample sizes.

  — [Nagel 2025](https://voices.uchicago.edu/stefannagel/files/2025/07/Complexity_2.pdf)
- **Buncic (2025), "Simplified: A Closer Look at the Virtue of Complexity in Return Prediction" (SSRN WP).** KMZ's results follow from two implementation choices: a zero-intercept restriction and an unusual aggregation of performance measures. — [SSRN 5239006](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5239006); [Stockholm Business School news, Sept 2025](https://www.su.se/english/divisions/stockholm-business-school/news/articles/2025-09-25-new-research-debunks-the-virtue-of-complexity-in-return-prediction-in-finance)
- **Federal Reserve FEDS paper 2025-089.** Treats the complexity debate as ongoing, notes that Nagel (2025) and Buncic (2025) warn apparent gains may be mechanical, and finds the virtue of complexity limited in FX forecasting. (From the search summary; the PDF was not read in full.) — [FEDS 2025-089](https://www.federalreserve.gov/econres/feds/files/2025089pap.pdf)
- **Cross-sectional complexity (Didisheim, Ke, Kelly & Malamud, DKKM).** DKKM apply RFF to cross-sectional SDF / factor pricing. They report high out-of-sample Sharpe ratios even with T = 12 months, but higher with T = 360 months. Nagel argues the longer-window advantage shows the gains come from learning with more data. — [Nagel 2025](https://voices.uchicago.edu/stefannagel/files/2025/07/Complexity_2.pdf)
- **Jensen, Kelly, Malamud & Pedersen, "Machine Learning and the Implementable Efficient Frontier."**
  - Status: SFI WP 22-63 (2022), in press at the Review of Financial Studies (SFI listing dated May 20, 2026; DOI 10.1093/rfs/hhag022).
  - Argument: strategies should be judged by net-of-cost return at each risk level. ML return forecasts that ignore costs lean on "fleeting, small-scale characteristics" and earn poor net returns.
  - Method: learns portfolio weights directly under a trading-cost-aware economic objective, which gives a better net frontier and an "economic feature importance" measure.
  - Everything is out of sample over 1981–2020 (per a Pedersen slide deck).

  — [SFI publication page](https://sfi.ch/en/publications/machine-learning-and-the-implementable-efficient-frontier); [SSRN 4187217](https://papers.ssrn.com/abstract=4187217); [Pedersen CBS slides](https://www.cbs.dk/files/cbs.dk/slides_lasse_heje_pedersen.pdf)
- **Leippold, Wang & Zhou (2022), "Machine Learning in the Chinese Stock Market," JFE 145(2):64–82 (PR).**
  - Unlike the US, liquidity is the single most important predictor in China.
  - Heavy retail participation raises short-term predictability, especially for small stocks.
  - Out-of-sample performance stays economically significant after transaction costs.

  — [SFI listing](https://www.sfi.ch/en/publications/machine-learning-in-the-chinese-stock-market)
- **Emerging markets (Emerging Markets Review, 2023, PR).** "Machine learning and the cross-section of emerging market stock returns" (cited by AHV as Hanauer & Kalsbach 2023) finds significant net returns after transaction costs and short-sale constraints, even when the universe is limited to big stocks. — [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S1566014123000274)
- **Global anomalies (Journal of Asset Management, 2023, PR).** ML composite predictors' long-short returns are reported to stay significant at transaction costs up to 300 bp. This figure comes from a search summary; it is probably a break-even cost and should be checked. — [Springer](https://link.springer.com/article/10.1057/s41260-023-00318-z)

### Inferences
- For a cross-sectional stock-rating product, the "virtue of complexity" debate is mostly about index timing and is of limited direct relevance. Its practical lesson is caution: heavily over-parameterized models trained on short windows can produce simple, unintended strategies (volatility-timed momentum) that look good by historical accident.
- The field's own leaders (Kelly, Pedersen) now publish that cost-blind ML return forecasts are not the right objective. That supports a design where any ML layer is optimized for net, implementable performance, not raw R².

### Gaps
- Exact net-of-cost Sharpe ratios and economic feature-importance rankings from JKMP could not be retrieved (SSRN returned 403; the search budget was exhausted).
- KMZ's own headline out-of-sample Sharpe ratio was not retrieved directly; only Nagel's replication statistics are given.
- The final published CPZ Sharpe ratio, the Gu-Kelly-Xiu (2021) autoencoder's own R² figures and journal details (believed to be Journal of Econometrics 2021), and FNW's count of selected characteristics (commonly cited as 13 of 62) were not verified in this session.
- Not covered for lack of search budget:
  - Kelly-Kuznetsov-Malamud-Xu transformer "AI asset pricing models" (2024–2025).
  - Chen-Kelly-Xiu "Expected Returns and Large Language Models."
  - Bryzgalova-Pelger-Zhu "Forest Through the Trees."
  - Cakici-Fieberg-Metko-Zaremba international ML.
  - Kozak-Nagel-Santosh "Shrinking the Cross-Section."
  - The Economics Letters (2025) paper "Is complexity virtuous?" ([ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0165176525005865)); its content is unverified.

## Q3. Where do ML gains come from? (Avramov, Cheng & Metzker 2023; transaction costs; turnover)

### Takeaway
Much of ML's gross alpha comes from microcaps, unrated and distressed firms, and high-volatility periods. Excluding these cuts value-weighted FF6 alphas by roughly half to more than 90%. After excluding microcaps, break-even trading costs (0.26%–0.54%) are at or below realistic cost estimates. The more recent Azevedo-Hoegner-Velikov working paper disagrees for the post-2005 high-liquidity era: well-built ML anomaly combinations still net about 0.6%–1.4% a month value-weighted. The evidence is genuinely mixed and depends on how costs are modeled.

### Cited Findings
- **Avramov, Cheng & Metzker (2023), "Machine Learning vs. Economic Restrictions," Management Science 69(5):2587–2619 (PR).**
  - Abstract: deep-learning signals "extract profitability from difficult-to-arbitrage stocks and during high limits-to-arbitrage market states." Excluding microcaps, distressed stocks or high-volatility episodes "considerably attenuates profitability." Performance deteriorates further under reasonable trading costs because of high turnover and extreme positions.
  - The signals are profitable "in long positions and recent years," with low downside risk.

  — [ACM 2023 (author PDF)](https://si-cheng.net/wp-content/uploads/2023/05/2023-ms-avramov_cheng_metzker-machine-learning-vs.-economic-restrictions.pdf); [IDEAS/RePEc](https://ideas.repec.org/a/inm/ormnsc/v69y2023i5p2587-2619.html)
- **ACM full-sample replication (US stocks, 1987–2017 test period, value-weighted long-short).**

  | Signal | Monthly return | FF6 alpha |
  |---|---|---|
  | GKX (NN3) | 1.56% (t = 4.53) | 0.92% |
  | CPZ | 2.18% | 1.87% |
  | IPCA | 0.95% | 0.62% |
  | CA (conditional autoencoder) | 1.16% | 0.75% |

  — [ACM 2023](https://si-cheng.net/wp-content/uploads/2023/05/2023-ms-avramov_cheng_metzker-machine-learning-vs.-economic-restrictions.pdf)
- **ACM economic restrictions.** Value-weighted FF6 alpha falls for GKX / CPZ / CA by:
  - 66% / 71% / 48% after excluding microcaps (below the NYSE 20th size percentile);
  - 53% / 77% / 75% after excluding unrated firms;
  - 78% / 69% / 94% after excluding distressed firms around rating downgrades.

  None of the deep-learning methods is significant at 5% after excluding distressed firms. The distressed screen uses look-ahead and is not tradable, so it is diagnostic only. Excluding microcaps removes 49% of the GKX sample by count; restricting to rated firms removes 78%. — [ACM 2023](https://si-cheng.net/wp-content/uploads/2023/05/2023-ms-avramov_cheng_metzker-machine-learning-vs.-economic-restrictions.pdf)
- **GKX signal excluding microcaps.** Value-weighted long-short 1.05% a month, but FF6 alpha only 0.31% and statistically insignificant; Stambaugh-Yuan four factors fully capture it. Among rated firms: long-short 1.02%, FF6 alpha 0.43%. — [ACM 2023](https://si-cheng.net/wp-content/uploads/2023/05/2023-ms-avramov_cheng_metzker-machine-learning-vs.-economic-restrictions.pdf)
- **IPCA holds up best in liquid stocks.** IPCA's FF6 alpha is 0.62% in the full sample and 0.61% excluding microcaps. ACM describe its performance as deteriorating "only modestly" in cheap-to-trade samples. They conclude that "accounting for nonlinearities is especially useful for difficult-to-value and difficult-to-arbitrage stocks." — [ACM 2023](https://si-cheng.net/wp-content/uploads/2023/05/2023-ms-avramov_cheng_metzker-machine-learning-vs.-economic-restrictions.pdf)
- **Turnover and break-even costs.**
  - Long-short turnover is at least 87% (GKX), 163% (CPZ), 113% (IPCA) and 148% (CA) a month.
  - Break-even costs: 0.94% / 1.12% / 0.53% / 0.48% in the full sample, but only 0.36% / 0.34% / 0.54% / 0.26% excluding microcaps.
  - Under the Brandt et al. (2009) cost model, one-way costs after 2002 are about 0.35% for the largest firms and 0.6% for the smallest. The 1987–2017 average is 0.67% (full sample) and 0.64% (ex-microcaps).
  - ACM conclude that reasonable costs "would make it difficult" for most ML strategies to earn meaningful risk-adjusted payoffs.

  — [ACM 2023](https://si-cheng.net/wp-content/uploads/2023/05/2023-ms-avramov_cheng_metzker-machine-learning-vs.-economic-restrictions.pdf)
- **Market states.** The GKX-signal FF6 alpha is an insignificant 0.22% a month when the VIX is low and 1.66% when it is high (full-sample average 0.92%). It is also higher with high sentiment, high market volatility and low market liquidity. IPCA and CA vary much less over time and "could even outperform in low limits-to-arbitrage market states." — [ACM 2023](https://si-cheng.net/wp-content/uploads/2023/05/2023-ms-avramov_cheng_metzker-machine-learning-vs.-economic-restrictions.pdf)
- **Long vs short leg.** For the GKX signal (value-weighted), the long leg's FF6 alpha is 0.77% a month (significant) and the short leg's −0.15% (insignificant). This is unlike classic anomalies, which are driven by the short leg. ML signals also keep predicting after 2001, but "anomalous return patterns in recent years are also confined to difficult-to-arbitrage stocks." — [ACM 2023](https://si-cheng.net/wp-content/uploads/2023/05/2023-ms-avramov_cheng_metzker-machine-learning-vs.-economic-restrictions.pdf)
- **Conflicting figures.** 2020 press coverage of an earlier draft reported payoff declines of 62% (ex-microcaps), 68% (ex-unrated) and 80% (ex-distressed). These differ from the published figures above; use the published Management Science numbers. — [CUHK Business School coverage](https://cbk.bschool.cuhk.edu.hk/the-limitations-of-using-ai-to-pick-stocks/) vs [ACM 2023](https://si-cheng.net/wp-content/uploads/2023/05/2023-ms-avramov_cheng_metzker-machine-learning-vs.-economic-restrictions.pdf)
- **Azevedo, Hoegner & Velikov, "The Expected Returns on Machine-Learning Strategies" (WP, AFA program).**
  - Design: ML models combine up to 320 published anomalies (Chen-Zimmermann), each used only after its publication date. Sample March 1957–December 2021; out-of-sample evaluation January 2005–December 2021. Portfolios are value-weighted deciles on NYSE breakpoints, and net returns use Chen-Velikov effective-spread cost estimates.
  - Out-of-sample R²: 0.05% (OLS-Huber) to 0.76% (LSTM1); feed-forward nets 0.19%–0.36%.
  - Gross performance: up to 1.63% a month, six-factor alpha up to 1.40%, Sharpe ratios 0.32–1.11.
  - Costs are about 20–25 bp a month in the post-2005 liquid era, with one-sided turnover of 60%–70%.
  - Net returns: 0.64% a month (ENet, t = 2.43) to 1.42% (LSTM1, t = 3.99). OLS-Huber, FFNN2 and FFNN5 become insignificant. LSTM generalized net alpha is 1.20% (t = 3.46).
  - The authors frame this as "contrary to" Avramov et al.

  — [AHV (AFA)](https://afajof.org/management/viewp.php?n=75544)
- **AHV on cost mitigation.** Longer holding periods, buy-hold spreads, quintiles, a high-market-cap filter (HMCAP20), a low-cost filter and cost-weighted signals cut turnover and costs but "do not improve net anomaly performance." Two-month holding is the only technique that helps across all models, and only by about 5 bp. — [AHV (AFA)](https://afajof.org/management/viewp.php?n=75544)
- **Studies cited within AHV.**
  - Chen & Velikov (2023): after costs, post-publication decay and decimalization, the strongest single anomalies net about 10 bp a month and combinations of the whole anomaly zoo about 20 bp.
  - Blitz et al. (2023): training ML on longer prediction horizons improves performance even after 25 bp-per-trade costs.

  — [AHV (AFA)](https://afajof.org/management/viewp.php?n=75544)

### Inferences
- The gains have three sources:
  1. Hard-to-arbitrage, illiquid and distressed names, plus high-volatility periods.
  2. High-turnover price-trend signals (reversal and momentum).
  3. Genuine nonlinear and interaction structure.

  Only the third is clearly relevant to S&P 500 constituents, and it is the smallest of the three after costs.
- AHV's more favorable net results are value-weighted and post-2005, but still include all CRSP stocks. They combine published anomalies rather than raw characteristics, which is closer to "ML as a combiner of known factor signals." Their linear ENet still nets 0.64% a month, so a substantial share of the net benefit does not need deep nonlinearity.
- Turnover is the main threat to an ML-based rating. A Buy/Hold/Sell product with stable ratings implicitly needs low turnover, which favors longer-horizon targets (Blitz et al.) and slow-moving signals.

### Gaps
- No reliable source was found that reports net-of-cost ML performance restricted to the S&P 500 or top-500 universe.
- AHV's results for the HMCAP20 filter alone, and its publication status, were not verified.
- JKMP's net-of-cost numbers were not retrieved.

## Q4. How do ML models do on large caps / S&P 500 only? Realistic monthly R² and long-short spread

### Takeaway
For roughly the largest 1,000 US stocks, the best published gross monthly out-of-sample R² is about 0.5%–0.7% for nets and trees, against about 0.3% for a three-variable OLS (GKX, 1987–2016). Twelve-month R² is about 4%–5% vs about 2.5%. Excluding microcaps, ML long-short spreads remain about 1% a month gross value-weighted, but factor-adjusted alpha falls to about 0.3% (insignificant) and is about break-even after realistic costs (ACM, 1987–2017). No peer-reviewed stock-level ML study restricted to S&P 500 constituents was verified.

### Cited Findings
- **GKX top 1,000 (1987–2016, gross, model trained on all stocks).** Monthly R²: NN3 0.70%, NN4 0.67%, NN5 0.64%, RF 0.63%, NN2 0.62%, GBRT 0.52%, NN1 0.49% vs OLS-3 0.31%, ENet 0.25%, GLM 0.14%, PCR 0.06%, PLS −0.14%. Annual R²: NN4 4.91%, NN5 4.86%, RF 4.80%, NN3 4.73% vs OLS-3 2.48%, ENet 1.90%. — [GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)
- **GKX large-cap-heavy portfolios.** Bottom-up forecasts of S&P 500-like and "Big" Fama-French portfolios reach monthly R² of 1.37%–1.80% (trees and nets) for the S&P 500 replica. Regularized linear models (PLS, PCR, OLS-3) give negative S&P 500 R². — [GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)
- **ACM, excluding microcaps (1987–2017).** GKX-signal value-weighted long-short 1.05% a month gross; FF6 alpha 0.31% (insignificant); break-even one-way cost 0.36%. Among rated firms (a large-cap-tilted universe): long-short 1.02%, FF6 alpha 0.43%. — [ACM 2023](https://si-cheng.net/wp-content/uploads/2023/05/2023-ms-avramov_cheng_metzker-machine-learning-vs.-economic-restrictions.pdf)
- **Cost benchmark for large caps.** Under the Brandt et al. (2009) model used by ACM, one-way costs for the largest firms are about 0.35% after 2002 (0.91% in 1987). — [ACM 2023](https://si-cheng.net/wp-content/uploads/2023/05/2023-ms-avramov_cheng_metzker-machine-learning-vs.-economic-restrictions.pdf)
- **Largest-stock study (OR Spectrum, 2023, PR).** "Especially on the largest stocks, where transaction costs are generally smaller," support-vector regression and nets still achieve a spread up to 20 bp above OLS. (From a search summary; the full paper was not read.) — [Springer OR Spectrum](https://link.springer.com/article/10.1007/s00291-022-00693-w)
- **Emerging markets, big stocks only.** Significant net ML returns survive when the universe is limited to big stocks. — [Emerging Markets Review 2023](https://www.sciencedirect.com/science/article/abs/pii/S1566014123000274)

### Inferences
- A realistic planning range for a monthly-rebalanced ML cross-sectional model on S&P 500 stocks is a gross out-of-sample R² of about 0.2%–0.7%, against about 0.2%–0.3% for a good parsimonious linear score. Twelve-month R² would be a few percent. These are extrapolations from top-1,000 evidence; S&P 500 constituents are larger, more efficiently priced and fewer, so values toward the lower end are prudent.
- Decile spreads within the S&P 500 (about 50 stocks per decile) would be noisier than the full-market GKX figures. The incremental ML alpha over a factor model plausibly falls to roughly 0–0.4% a month gross, and is near zero net of costs at monthly rebalancing. This rests on ACM's ex-microcap alpha of 0.31% (insignificant) and break-even of 0.36% against about 0.35% costs.
- Evidence that ML gains survive in large caps comes mainly from statistical R² (GKX) and from longer horizons, not from net long-short portfolios.

### Gaps
- No verified peer-reviewed study trains and evaluates ML stock-level models only on S&P 500 constituents at 1–12-month horizons with net-of-cost results.
- Krauss, Do & Huck (2017, EJOR), on daily S&P 500 statistical arbitrage with deep nets, trees and random forests, is believed to show gross profits that largely vanish after costs in recent years. It was not verified here because the search budget ran out.

## Q5. Which inputs matter most (momentum, liquidity, volatility, valuation), and how stable are they over time?

### Takeaway
Across models, the dominant inputs are price trends (short-term reversal, 12-month momentum, momentum change, industry momentum, maximum return), then liquidity and size, then volatility and beta, then valuation and fundamental signals. GKX report the top-third ranking as "remarkably stable over time." Market structure matters, however: in China, liquidity ranks first.

### Cited Findings
- **GKX importance ranking.** Four groups: (1) price trends (mom1m, mom12m, chmom, indmom, maxret, mom36m); (2) liquidity (turn, SD_turn, mvel1, dolvol, Amihud illiquidity, zerotrade, bid-ask spread); (3) risk (retvol, idiovol, beta, betasq); (4) valuation and fundamentals (ep, sp, agr, nincr). — [GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)
- **How importance is spread across models.** Penalized linear and dimension-reduction models' importance is "highly skewed toward momentum and reversal." Trees and nets "are more democratic, drawing predictive information from a broader set of characteristics." — [GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)
- **Stability.** Importance is averaged over 30 annual refits. The "rank of important characteristics (top-third of the covariates) is remarkably stable over time" for all models; Internet Appendix Figure A.1 shows NN3. — [GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)
- **Model complexity changes over time.** Elastic net selects fewer than 5 features in the first 10 test years and 20–40 after 2000. — [GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)
- **Interactions with size (NN3).**
  - Momentum is "most pronounced among large stocks."
  - The low-volatility anomaly is "strongest among large stocks."
  - Short-term reversal is linear among small stocks but concave among large stocks, mainly after positive prior-month returns.
  - Size and accruals show no interaction.

  — [GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)
- **Interactions with macro conditions.** The size effect is stronger when aggregate valuations are low (high book-to-market) and issuance is low. Low volatility is strongest in high-valuation, high-issuance environments. — [GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)
- **IPCA.** Only 8 characteristics are significant, and they carry nearly all of IPCA's accuracy. — [NBER w24540](https://www.nber.org/papers/w24540)
- **FNW.** Many previously identified predictors add no incremental information. — [NBER w23227](https://www.nber.org/papers/w23227)
- **China.** Liquidity is the most important predictor, unlike the US. — [Leippold, Wang & Zhou 2022](https://www.sfi.ch/en/publications/machine-learning-in-the-chinese-stock-market)

### Inferences
- For S&P 500 ratings, the ML evidence supports keeping momentum (12-month and industry), low volatility / low beta, and valuation in a factor score; the first two are reported as strongest among large caps. Short-term reversal and liquidity signals, which dominate importance in all-stock models, are mostly small-cap and high-turnover phenomena and add cost-heavy turnover at monthly horizons.
- The stable top-third ranking suggests a fixed-weight score built on these groups is not far from what ML "learns" at the group level. ML's edge lies more in conditional weighting (interactions with size and the macro state) than in discovering new inputs.

### Gaps
- Large-cap-specific importance rankings (e.g., importance computed only on the top 1,000 or the S&P 500) were not found.
- Importance stability after 2016 (post-GKX sample) was not verified.

## Q6. How interpretable are these models, and what methods exist to explain them?

### Takeaway
The academic literature mainly uses model-agnostic characteristic importance (drop-a-variable R² loss and sum of squared partial derivatives), partial-dependence and interaction plots, and, more recently, economic or portfolio-based importance (JKMP's "economic feature importance"). Structured models such as IPCA and FNW's additive model are interpretable by construction. SHAP-specific asset-pricing evidence was not verified in this session.

### Cited Findings
- **GKX importance measures.** Two measures: (1) the reduction in panel R² when a predictor is set to zero; (2) the sum of squared partial derivatives (SSD). The two give highly consistent rankings, with rank correlations of 84.0% (NN1) to 97.7% (RF). GKX also plot marginal effects with other covariates at their medians, characteristic × size interactions, and characteristic × macro interactions (top 100 interactions per model in the Internet Appendix). — [GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)
- **Opaque models still recover known anomalies.** "Despite their opaque nature, machine learning methods successfully identify mispriced stocks consistent with most anomalies." — [ACM 2023](https://si-cheng.net/wp-content/uploads/2023/05/2023-ms-avramov_cheng_metzker-machine-learning-vs.-economic-restrictions.pdf)
- **JKMP.** Their cost-aware framework yields "economic feature importance," which ranks features by contribution to the net-of-cost portfolio objective rather than to forecast R². — [SFI publication page](https://sfi.ch/en/publications/machine-learning-and-the-implementable-efficient-frontier)
- **IPCA.** Linear in characteristics, with an explicit anomaly intercept that tests whether a characteristic's return link is risk or mispricing. — [NBER w24540](https://www.nber.org/papers/w24540)
- **FNW.** Nonparametric but additive (one shape function per characteristic), selected by adaptive group LASSO, so each characteristic's effect can be plotted directly. — [NBER w23227](https://www.nber.org/papers/w23227)
- **CPZ.** The deep SDF model claims to identify "the key factors that drive asset prices." — [arXiv 1904.00745](https://arxiv.org/abs/1904.00745)
- **Nagel's warning.** Even when a complex model "works," its realized behavior can reduce to a simple strategy (volatility-timed momentum) that the model did not learn from data. Interpretability analysis is needed to tell genuine learning from mechanical artifacts. — [Nagel 2025](https://voices.uchicago.edu/stefannagel/files/2025/07/Complexity_2.pdf)

### Inferences
- A per-stock public report needs local explanations ("why is this stock rated Buy?"). Global importance rankings, as in GKX, do not provide these. An additive model (FNW-style, or a GLM with splines) or a linear score gives exact per-stock attributions. Tree or net models would need post-hoc attribution such as SHAP, which adds an approximation layer and is harder to publish as a fixed weights.yaml.
- Transparency cost, made concrete: in GKX, moving from GLM (additive, interpretable, top-1,000 R² 0.14%) or OLS-3 (0.31%) to NN3 (0.70%) buys about +0.4 to +0.55 pp of monthly R² in large caps, gross. Much of that gain may not survive costs (Q3–Q4).

### Gaps
- No verified peer-reviewed asset-pricing paper applying SHAP to the cross-section of returns was retrieved (the search budget was exhausted). SHAP's properties and its use in finance should be sourced separately if the report needs them.

## Q7. Is there evidence on hybrid approaches (linear factor score with ML only for weighting, or for nonlinear interactions)?

### Takeaway
There is no single definitive study of "fixed linear score + ML weights" for the S&P 500. Several strands, however, point to hybrids or structured models as the efficient middle ground for liquid stocks:
- IPCA (linear in characteristics) holds its alpha in cheap-to-trade stocks while deep nets lose most of theirs.
- ML used as a combiner of published anomaly signals (AHV) nets positive returns post-2005, including with linear elastic net.
- GKX simulations show linear methods win when the true structure is linear and additive.
- JKMP put ML on the portfolio-weighting and cost layer rather than the raw forecast.

### Cited Findings
- **IPCA in liquid stocks.** IPCA FF6 alpha is 0.62% (all stocks) vs 0.61% excluding microcaps. Deep-learning alphas fall 48%–71% under the same restriction. IPCA "could even outperform" in low limits-to-arbitrage states. — [ACM 2023](https://si-cheng.net/wp-content/uploads/2023/05/2023-ms-avramov_cheng_metzker-machine-learning-vs.-economic-restrictions.pdf)
- **GKX Monte Carlo.** Linear and generalized linear methods dominate when predictors enter linearly and additively. Trees and nets win only when the data contain nonlinear transformations and pairwise interactions. — [GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)
- **GKX: interactions drive the large-cap gain.** The additive-nonlinear GLM (no interactions) earns top-1,000 R² of 0.14%, below OLS-3's 0.31%. Nets that allow interactions reach 0.62%–0.70%. — [GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)
- **GKX ensembles.** An equal-weight ensemble of 11 models gives R² 0.43% and value-weighted Sharpe 1.33, comparable to the best single model (NN4, 1.35). — [GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)
- **AHV: ML as an anomaly combiner.** ML used only to combine up to 320 published anomaly signals into a composite earns net value-weighted returns of 0.64% a month with a linear elastic net and 1.42% with an LSTM (2005–2021). — [AHV (AFA)](https://afajof.org/management/viewp.php?n=75544)
- **FNW: additive nonlinearity without interactions.** Raises Sharpe ratios by 50% over linear panel regressions. — [NBER w23227](https://www.nber.org/papers/w23227)
- **JKMP: ML on the portfolio layer.** Weights are learned directly with a trading-cost-aware objective. Cost-blind ML forecasts tilt toward fleeting small-cap characteristics. — [SFI publication page](https://sfi.ch/en/publications/machine-learning-and-the-implementable-efficient-frontier)
- **Blitz et al. (2023), as cited by AHV.** Training ML on longer prediction horizons improves after-cost performance at 25 bp per trade. — [AHV (AFA)](https://afajof.org/management/viewp.php?n=75544)

### Inferences
- **A defensible v1 → v2 path** for a transparent S&P 500 rating app:
  1. v1: a fixed-weight linear factor score with published weights (momentum, low volatility / beta, valuation, profitability or quality), targeting 6–12-month returns.
  2. v2: let a regularized or interpretable learner choose the weights periodically. Rolling elastic net or IPCA-style estimation keeps weights publishable as dated YAML snapshots.
  3. Optionally add a small set of explicit, documented interactions, such as momentum × size or volatility × market state, which GKX find matter most among large stocks.

  Deep nets and trees offer at most about +0.3 to +0.4 pp of monthly gross R² in large caps. On ACM and JKMP's evidence, their net-of-cost edge in the largest stocks is small and fragile.
- Any ML-enhanced version should be evaluated on value-weighted, large-cap-only, net-of-cost, 6–12-month-horizon metrics, with turnover reported. Universe-wide equal-weighted R² or Sharpe ratios, which dominate the literature, overstate what applies to S&P 500 stocks.

### Gaps
- No verified paper directly tests a published fixed-weight linear factor score against the same score with ML-learned weights or ML interactions, restricted to S&P 500 constituents.
- Practitioner or industry evidence on hybrid "factor + ML overlay" products (e.g., from AQR, Robeco or Man) was not retrieved within the search budget.
