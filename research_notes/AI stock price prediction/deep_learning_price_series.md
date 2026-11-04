# Deep Learning and Time-Series Models for Forecasting Stock Prices and Returns from Price, Volume, and Order Data (2017–2026)

Scope note: these notes cover models that take price, volume, and order-book data as input (LSTMs, CNNs, GNNs, transformers, and time-series foundation models). They also cover public forecasting competitions and the methodological critiques of this work. Figures come from the primary papers wherever I could extract the full text. Several key numbers are from working-paper versions (noted inline), which can differ slightly from the published journal versions. The web-search budget ran out partway through, so some items rest on search snippets only (flagged) or are listed under Gaps.

---

## Q1. What do the credible studies show? (Fischer & Krauss 2018; Krauss, Do & Huck 2017; Jiang, Kelly & Xiu 2023; Sezer et al. 2020; GNN and transformer studies)

### Takeaway
The best-designed studies use survivorship-free S&P 500 or CRSP universes, train-only normalization, and multi-decade out-of-sample tests. They find real but small *daily-to-weekly cross-sectional* predictability from past prices, and it is mostly a nonlinear repackaging of short-term reversal. The edge decayed sharply after about 2001 and was roughly zero or negative after transaction costs by 2010–2015. At monthly or longer horizons, and for large value-weighted stocks, the best evidence (the CNN chart-image study) shows gross Sharpe ratios around 0.2–0.5 before any costs. The headline GNN papers have serious leakage and test-design flaws.

### Cited Findings

**Fischer & Krauss (2018), "Deep learning with LSTM networks for financial market predictions," EJOR 270(2):654–669**
- Universe and design: S&P 500 constituents from December 1992 to October 2015, made survivor-bias free by using month-end constituent lists. Each "study period" has a 750-day training window and a 250-day trading window, and trading windows do not overlap. The only feature is a 240-day sequence of standardized 1-day returns, standardized with the *training-set* mean and standard deviation. The target is whether a stock will beat the cross-sectional median the next day. The portfolio buys the top k=10 stocks and shorts the bottom 10, rebalanced daily. — [Fischer & Krauss WP, EconStor](https://www.econstor.eu/bitstream/10419/157808/1/886576210.pdf); published version: [IDEAS/EJOR](https://ideas.repec.org/a/eee/ejores/v270y2018i2p654-669.html)
- Headline before costs: 0.46% per day with a Sharpe ratio of 5.8. Comparisons: random forest 0.43%, standard deep net 0.32%, logistic regression 0.26% per day (k=10). Directional accuracy was 54.3%. — [Fischer & Krauss WP](https://www.econstor.eu/bitstream/10419/157808/1/886576210.pdf)
- After costs of 5 bps per half-turn: 0.26% per day, 82.29% annualized, Sharpe 2.34. Random forest: 0.23% per day and Sharpe 1.87. Logistic regression: 0.06% per day, not significant (t = 1.67). Maximum drawdown was 52.33%. — [Fischer & Krauss WP](https://www.econstor.eu/bitstream/10419/157808/1/886576210.pdf)
- **Post-2010 decline:** The paper splits results into three periods. In 1993–2000, cumulative payout exceeded $11 per $1 of average daily investment, and the authors attribute this to LSTMs being "unknown to or completely unfeasible" for most professionals at the time. In 2001–2009 ("moderation"), the payout was $4 for the LSTM and $5.6 for the random forest. In 2010/01–2015/10 ("deterioration"), the random forest "destroys more than 1 USD in value" and the LSTM is only "able to keep capital approximately constant, after transaction costs". In other words, net returns were about zero for the final 6 years. — [Fischer & Krauss WP](https://www.econstor.eu/bitstream/10419/157808/1/886576210.pdf)
- Source of the profit: the selected stocks show high volatility, below-mean momentum, and short-term reversal. A simple 5-day reversal rule earns 0.23% per day before costs. That rule explains 52.1% of the variance of the LSTM's long leg and 53.6% of its short leg. The remaining alpha is 31 bps per day before costs and 11 bps per day after costs. — [Fischer & Krauss WP](https://www.econstor.eu/bitstream/10419/157808/1/886576210.pdf)

**Krauss, Do & Huck (2017), "Deep neural networks, gradient-boosted trees, random forests: Statistical arbitrage on the S&P 500," EJOR 259(2):689–702**
- Same universe and period (S&P 500 constituents, Dec 1992 to Oct 2015, survivor-bias free) and the same daily long-short design. The inputs are lagged returns. — [Krauss, Do & Huck WP (FAU 03/2016)](https://www.iwf.rw.fau.de/files/2016/03/03-2016.pdf); [IDEAS/EJOR](https://ideas.repec.org/a/eee/ejores/v259y2017i2p689-702.html)
- Before costs, with k=10: the ensemble earns 0.45% per day, the deep net 0.33%, gradient-boosted trees 0.37%, and random forest 0.43%. After costs, the ensemble earns 0.25% per day. Note that the *deep net was the weakest* of the three base learners. — [Krauss, Do & Huck WP](https://www.iwf.rw.fau.de/files/2016/03/03-2016.pdf)
- Sub-periods: during the 09/2008–12/2009 financial crisis, the ensemble returned more than 400% annualized after costs (Sharpe 4.5). In the final sub-period through 10/2015, every model and the ensemble produced *negative* annualized returns of −14% to −25% after costs, while mean returns before costs stayed positive. The authors write that since 2001 "markets have become more efficient in respect to standard machine learning statistical arbitrage". — [Krauss, Do & Huck WP](https://www.iwf.rw.fau.de/files/2016/03/03-2016.pdf)

**Jiang, Kelly & Xiu (2023), "(Re-)Imag(in)ing Price Trends," Journal of Finance 78:3193–3249**
- Design: a CNN classifies black-and-white images of the past 5, 20, or 60 days of OHLC prices, volume, and a moving average. It predicts the probability of a positive return over the next 5, 20, or 60 days. The universe is US stocks from 1993 to 2019. The model is trained and validated *once* on 1993–2000 and then held fixed for the 2001–2019 test period. — [JKX working paper (Aug 2021)](https://www.aidf.nus.edu.sg/wp-content/uploads/2022/02/Xiu-Re-Imagining-Price-Trends.pdf); publication details: [Yale Economics](https://economics.yale.edu/research/re-imagining-price-trends), [SSRN](https://papers.ssrn.com/abstract=3756587)
- Out-of-sample accuracy for 20-day returns ranges from 52.5% to 53.6% depending on image size, against 52.1% for momentum and 50.4% for short-term reversal. For 60-day returns it ranges from 52.9% to 53.6%. — [JKX WP, Table 2](https://www.aidf.nus.edu.sg/wp-content/uploads/2022/02/Xiu-Re-Imagining-Price-Trends.pdf)
- **Monthly holding period (R20), gross of costs.** Equal-weight long-short decile Sharpe ratios: 2.35 (I5), 2.16 (I20), 1.29 (I60). Comparisons: momentum 0.25, monthly reversal 0.55, weekly reversal 1.23. **Value-weight** Sharpe ratios: 0.45 (I5), 0.49 (I20), 0.17 (I60, not significant), with value-weight long-short returns of only about 2–5% a year. Monthly turnover is 173–187%. — [JKX WP, Tables 3–4](https://www.aidf.nus.edu.sg/wp-content/uploads/2022/02/Xiu-Re-Imagining-Price-Trends.pdf)
- **Quarterly holding period (R60), gross.** Equal-weight Sharpe ratios: 1.30 (I5), 0.37 (I20), 0.43 (I60). Value-weight Sharpe ratios: 0.47, 0.32, 0.23. — [JKX WP, Tables 3–4](https://www.aidf.nus.edu.sg/wp-content/uploads/2022/02/Xiu-Re-Imagining-Price-Trends.pdf)
- **Weekly holding period:** equal-weight Sharpe ratios reach 7.2, with 1.5 for value weight in the working paper. The JF abstract, as quoted in search results, gives 7.2 equal-weight and 1.7 value-weight. The authors say the weekly result is *not* meant as an achievable trading result. — [JKX WP](https://www.aidf.nus.edu.sg/wp-content/uploads/2022/02/Xiu-Re-Imagining-Price-Trends.pdf); JF figure per [SSRN search snippet](https://papers.ssrn.com/abstract=3756587)
- **Size sensitivity:** when the model is trained only on the largest 2,000 firms, the I20/R20 Sharpe falls to 0.44 equal-weight and 0.42 value-weight. The I60/R20 Sharpe falls to −0.10 and −0.13. — [JKX WP, robustness table](https://www.aidf.nus.edu.sg/wp-content/uploads/2022/02/Xiu-Re-Imagining-Price-Trends.pdf)
- Transfer learning: a 5-day CNN applied to 60-day histories sampled every 12 days earns a quarterly equal-weight Sharpe of 0.9. A CNN trained directly on 60-day images earns 0.4. — [JKX WP](https://www.aidf.nus.edu.sg/wp-content/uploads/2022/02/Xiu-Re-Imagining-Price-Trends.pdf)
- Independent replications (search snippets only; I did not verify them). A BSIC replication restricted to the 500 largest stocks reports a Sharpe of "slightly above 1", and its own out-of-sample Sharpe was 0.42 — [BSIC](https://bsic.it/technical-analysis-on-steroids/). A GitHub replication reports a gross decile long-short return of +8.9% a year and Sharpe 0.72 on all names from 1999, and Sharpe 1.22 on the Russell 1000 — [ArjunDivecha/Pattern](https://github.com/ArjunDivecha/Pattern)

**Sezer, Gudelek & Ozbayoglu (2020), systematic review, Applied Soft Computing**
- This is a systematic review of deep learning for financial time-series forecasting from 2005 to 2019. It is organized by application (index, forex, commodity) and by model type (CNN, DBN, LSTM). It concludes that DL models "have been reported to outperform" traditional ML. That statement describes what the papers *report*, not an independent validation. — [arXiv 1911.13288](https://arxiv.org/abs/1911.13288)

**Graph neural networks: Feng et al. (2019), "Temporal Relational Ranking for Stock Prediction" (RSR / Temporal Graph Convolution), ACM TOIS**
- Headline: backtested "average return ratio" of 98% on NYSE and 71% on NASDAQ. — [arXiv 1809.09441](https://arxiv.org/abs/1809.09441)
- Design flaws, from the full text:
  - The test window is 2017 only: 237 trading days from 01/03/2017 to 12/08/2017. Training covers 2013–2015 and validation 2016.
  - Prices are normalized "by dividing it by its maximum value throughout the entire 2013–2017 dataset", which leaks future information into the features.
  - Stocks are kept only if they traded on more than 98% of days since 2013 and *never* traded below $5 during 2013–2017. This filter introduces survivorship and look-ahead bias.
  - Transaction costs "are ignored".
  - The strategy buys the single top-ranked stock each day.
  - Hyperparameters are grid-searched "regarding IRR".
  - Time-series and shallow-ML baselines are explicitly omitted.
  - [Feng et al. full text, arXiv PDF](https://arxiv.org/pdf/1809.09441)

**Transformers: generic long-horizon forecasting benchmark (Zeng et al., AAAI 2023, "Are Transformers Effective for Time Series Forecasting?")**
- On the Exchange-Rate dataset, the naive "Repeat" baseline, which repeats the last value, "surprisingly outperforms all Transformer-based methods... (around 45%)". The authors attribute this to Transformers overfitting "sudden change noises". At the 96-step horizon, MSE is 0.081 for Repeat, 0.148 for FEDformer, 0.197 for Autoformer, and 0.847 for Informer. — [Zeng et al. arXiv 2205.13504](https://arxiv.org/abs/2205.13504) (Table 2 in the [PDF](https://arxiv.org/pdf/2205.13504))
- In a 2026 benchmark on daily returns of five large US stocks with a 20-day horizon, the train-from-scratch transformers mostly had *negative* skill against a zero-return random walk. Examples: iTransformer −0.0246 on AAPL, −0.0280 on AMZN, and −0.0519 on META; PatchTST −0.0345 on AAPL and −0.0705 on META. See Q2. — [arXiv 2606.27100](https://arxiv.org/html/2606.27100)

### Inferences
- The two most-cited "credible" daily S&P 500 studies (Krauss et al. and Fischer & Krauss) are honest about their own decay. On data after 2010, the net result is roughly zero (LSTM) or −14% to −25% a year (KDH ensemble). They are daily statistical-arbitrage results with very high turnover, so they say nothing about 12-month price levels.
- Even in the strongest academic paper (JKX), the economically relevant variant is value-weighted, monthly, and gross. For large stocks it gives a Sharpe of about 0.45–0.49 before costs, with nearly 180% monthly turnover. After realistic costs that is probably close to the weekly-reversal benchmark and below standard factor premia. JKX themselves treat the high equal-weight numbers as evidence of predictability, not as tradeable strategies.
- In the price-only literature, deep learning mainly recovers known anomalies (short-term reversal, volatility, momentum) through nonlinear representations. It does not uncover information about fundamental value.
- GNN and transformer "stock prediction" papers that report very large returns tend to share the leakage pattern seen in RSR: global normalization, a survivor-filtered universe, a test window of one year or less, no costs, and no naive baseline. The burden of proof is on any such paper to show it avoids these.

### Gaps
- I could not retrieve the published EJOR or JF versions; figures are from the working papers. Fischer & Krauss and Krauss et al. may differ slightly in print, and JKX's JF version reports a 1.7 value-weight weekly Sharpe against 1.5 in the 2021 working paper.
- I did not retrieve the number of papers in Sezer et al. (2020); it is not in the arXiv abstract.
- I found and vetted no 2023–2026 GNN or stock-specific transformer study with a survivorship-free universe, net-of-cost returns, and a random-walk baseline. That is not proof that none exists, because the search budget ran out.
- No post-2015 out-of-sample replication of Fischer & Krauss was retrieved.

---

## Q2. How do time-series foundation models (Chronos, TimesFM, Moirai, Lag-Llama, Kronos, etc.) perform on stock returns against a random-walk baseline?

### Takeaway
Off-the-shelf, general-purpose foundation models do *not* reliably beat a random walk on stock returns. Zero-shot, they produce negative out-of-sample R² for daily returns (Chronos −1.37%, TimesFM −2.80%) and lose to gradient-boosted trees. On 20-day returns for five mega-caps, only 2 of 10 tasks beat the random walk at p < 0.05 without multiple-testing correction, and some models do far worse. Models pre-trained from scratch on finance data, or finance-native models like Kronos, do better on ranking and volatility metrics. Even so, none of the studies reports net-of-cost evidence, and all of the positive evidence is at daily or shorter horizons.

### Cited Findings

**Rahimikia, Ni & Wang (Nov 2025), "Re(Visiting) Time Series Foundation Models in Finance" (FoFI 2026; arXiv 2511.18578)**
- Data: daily excess returns spanning 34 years and 94 countries, about 2 billion observations. Testing covers the US and seven other markets with an expanding window. The test period for the benchmarks is 2001–2023, and the target is *next-day* returns. — [Rahimikia et al. PDF](http://wp.lancs.ac.uk/fofi2026/files/2026/03/FoFI-2026-020-Eghbal-Rahimikia.pdf)
- Benchmarks, US stocks, averaged across windows: linear regression has an out-of-sample R² of −0.47% and CatBoost −0.10%. "Direction accuracies are all just above 51%". Small caps are more predictable than large caps. — [Rahimikia et al.](http://wp.lancs.ac.uk/fofi2026/files/2026/03/FoFI-2026-020-Eghbal-Rahimikia.pdf)
- **Zero-shot:** Chronos-large with 512 lags has an out-of-sample R² of −1.37% and directional accuracy just above 51%. TimesFM-500M has an R² of −2.80% and directional accuracy *just below 50%*. Long-short annual returns are 20.17% for Chronos and −1.47% for TimesFM. Twelve more TSFM architectures give "generally similar results". Fine-tuning "yields limited improvements". — [Rahimikia et al.](http://wp.lancs.ac.uk/fofi2026/files/2026/03/FoFI-2026-020-Eghbal-Rahimikia.pdf)
- **Pre-trained from scratch on financial data**, re-trained each year to avoid look-ahead: Chronos-small's R² improves from −77.07% to −3.18% with window 5 and from −1.27% to −0.59% with window 512. It earns 36.84% annualized with Sharpe 5.42; TimesFM-20M earns 30.36% with Sharpe 3.66. These models are still "less effective in terms of goodness-of-fit than benchmark models". — [Rahimikia et al.](http://wp.lancs.ac.uk/fofi2026/files/2026/03/FoFI-2026-020-Eghbal-Rahimikia.pdf)
- With added factors and synthetic data, Chronos-small reaches 51.74% directional accuracy against 51.16% for CatBoost, and a Sharpe of 6.78 against 6.46. All of these portfolios are daily-rebalanced long-short "without accounting for transaction costs". The authors also find "gradual degradation in portfolio performance" over time for all models. — [Rahimikia et al.](http://wp.lancs.ac.uk/fofi2026/files/2026/03/FoFI-2026-020-Eghbal-Rahimikia.pdf)
- The authors note that off-the-shelf TSFMs carry possible look-ahead bias, because their pretraining corpora may overlap the test periods. — [Rahimikia et al.](http://wp.lancs.ac.uk/fofi2026/files/2026/03/FoFI-2026-020-Eghbal-Rahimikia.pdf)

**"Pretrained Time-Series Foundation Models for Financial Return Forecasting" (2026), arXiv 2606.27100**
- Data: five stocks (GOOG, AAPL, AMZN, JPM, META), daily adjusted closes from 15 Sep 2014 to 15 Feb 2026. Evaluation runs from 22 Aug 2024 to Feb 2026 with a **20-business-day horizon** and 10 rolling origins. Models tested: TimeGPT, TimesFM-2.5, Moirai-2.0, Chronos v1, and Chronos-2 (zero-shot), against NBEATS, NHITS, PatchTST, iTransformer, KAN, AR(1), and a zero-return random walk. The metric is MAE skill relative to the random walk. — [arXiv 2606.27100](https://arxiv.org/html/2606.27100)
- TSFMs win 8 of 10 task rankings, but gains over the random walk are "small and sparse". The one-sided Diebold–Mariano test is significant only for Chronos on AMZN (p = 0.0421) and Moirai-2.0 on GOOG (p = 0.0421). These are raw p-values, which the authors call "exploratory evidence rather than... family-level discoveries". — [arXiv 2606.27100](https://arxiv.org/html/2606.27100)
- Per-task skill against the random walk ranges widely:
  - GOOG, Moirai-2.0: +0.229
  - AMZN, Chronos: +0.086
  - AAPL, TimesFM-2.5: −0.032
  - JPM, TimesFM-2.5: −0.047
  - META, Moirai-2.0: −0.455
  - META, Chronos-2: −0.481
  - [arXiv 2606.27100](https://arxiv.org/html/2606.27100)
- The paper does no trading backtest and no cost analysis. It states that "The results should not be read as evidence of trading alpha" and that TSFMs "do not solve the fundamental difficulty of financial return prediction." — [arXiv 2606.27100](https://arxiv.org/html/2606.27100)
- A published critique accepts this restraint and adds concerns: "epistemic overreach of zero-shot deployment when local n is small", and a gap between optimizing point MAE and calibrating tail risk. — [Noguer i Alonso & Pereira Franklin (2026), Zenodo](https://zenodo.org/records/22990802)

**Look-ahead via pretraining data: "Does Training on Future Data Pay?" (2026), arXiv 2609.20554**
- The study covers five sets of financial TSFMs, 14 equity markets, and four horizons. Model vintages trained on data from *after* the forecast origin generally *reduced* accuracy in the US: they had higher MSE in 18 of 20 model-set/horizon combinations. With one-month forecasts, the median change in certainty-equivalent return was −1.77 percentage points in the US and −2.14 points internationally. The authors conclude that temporal exposure violates the information set but is not by itself proof of inflated results. — [arXiv 2609.20554](https://arxiv.org/abs/2609.20554)

**Kronos (finance-native foundation model, arXiv 2508.02739; reportedly AAAI 2026)**
- Kronos is pre-trained on "over 12 billion K-line records from 45 global exchanges". In zero-shot tests it reports a 93% higher price-forecasting RankIC than the leading TSFM, 87% higher than the best non-pretrained baseline, a 9% lower volatility-forecasting MAE, and a 22% gain in synthetic-data fidelity. The abstract mentions no net-of-cost trading test. — [arXiv 2508.02739](https://arxiv.org/abs/2508.02739)
- A secondary blog repeats the Rahimikia figure of a TimesFM-500M zero-shot R² of −2.80%. — [Pebblous blog (secondary)](https://blog.pebblous.ai/report/kronos-financial-foundation-model/en/)

### Inferences
- The consistent pattern is that generic pretraining (energy, traffic, weather, retail) does not transfer to equity returns. That fits returns being low-persistence, close to a martingale, and heavy-tailed.
- Kronos's gains are *relative* (+93% RankIC). If the baseline RankIC is small, which is typical for price-only daily signals (I did not retrieve Kronos's absolute RankIC levels), the absolute edge is still small. Its 9% gain on volatility MAE is more plausible, because volatility is genuinely persistent. Inference: foundation models are more useful for forecasting the *width* of a price range (volatility) than its *direction*.
- MAE-on-returns favors forecasts shrunk toward zero or the median. "Beating the random walk on MAE" by about 10⁻³ is economically meaningless without a cost-aware backtest.
- In the 2026 five-stock study, the test window (about 18 months, 10 non-overlapping 20-day windows) is the "tiny test window" problem from Q3. The 2024–2026 test period also likely falls within or near the pretraining corpora of TimesFM-2.5, Moirai-2.0, and Chronos-2.

### Gaps
- I found no benchmark of Lag-Llama or Moirai on large panels of stock returns with a random-walk baseline beyond the papers above. Rahimikia et al. cover 12 more architectures, but I did not extract which ones.
- I found no study at 6- or 12-month horizons for any TSFM on equities.
- I did not retrieve Kronos's full results, including absolute RankIC levels and any backtest with costs.

---

## Q3. What are the most common methodological failures, and how widespread are they?

### Takeaway
The failures are well documented qualitatively, and specific papers show each one. However, I found **no survey that quantifies their prevalence across the literature.** That absence is itself telling: the reviews I found catalog architectures rather than auditing baselines, costs, or leakage. The strongest concrete evidence is from individual papers:
- A naive "tomorrow equals today" forecast gets 95–98% "accuracy" on price levels and beats LSTMs.
- A naive Repeat forecast beats all transformers on exchange rates by about 45%.
- A highly cited GNN paper combines whole-sample normalization, a survivor filter, a one-year test, and no costs.

### Cited Findings
- **Predicting price levels instead of returns:** A 2025 study in *Humanities & Social Sciences Communications* found the following (search snippet only; full text not retrieved because of a paywall/redirect). Using today's price as tomorrow's forecast "yields an accuracy of 95% to 98%". The authors conclude that "the LSTM model performs worse than the most naïve approach to predicting a continuous price." — [Nature HSSC 2025, s41599-025-04761-8](https://www.nature.com/articles/s41599-025-04761-8)
- **Naive persistence beats sophisticated models on random-walk-like series:** On Exchange-Rate, Repeat outperforms all Transformer models by about 45%. At the 720-step horizon, MSE is 0.823 for Repeat, 1.195 for FEDformer, and 2.478 for Informer. — [Zeng et al. 2023](https://arxiv.org/abs/2205.13504)
- **Look-ahead in normalization, survivorship, tiny test windows, and no costs, all in one highly cited paper:** RSR (Feng et al., TOIS 2019) normalizes by each stock's 2013–2017 maximum, filters out stocks that ever traded below $5 through 2017, tests on 237 days in 2017, ignores costs, and tunes on IRR. — [Feng et al.](https://arxiv.org/pdf/1809.09441)
- **Contrast with good practice:** Fischer & Krauss standardize with training-set statistics only, use month-end constituent lists to remove survivor bias, test over roughly 23 years, and report results at 5 bps per half-turn. Even so, net returns were about zero after 2010. — [Fischer & Krauss WP](https://www.econstor.eu/bitstream/10419/157808/1/886576210.pdf)
- **Transaction costs are decisive at high turnover:** Krauss et al.'s ensemble falls from 0.45% to 0.25% per day after costs and turns negative (−14% to −25% a year) in the final sub-period. — [Krauss, Do & Huck WP](https://www.iwf.rw.fau.de/files/2016/03/03-2016.pdf). JKX's CNN portfolios turn over 155–187% a month, and all reported Sharpe ratios are gross. — [JKX WP](https://www.aidf.nus.edu.sg/wp-content/uploads/2022/02/Xiu-Re-Imagining-Price-Trends.pdf)
- **No costs, even in 2025–2026 foundation-model work:** Rahimikia et al.'s Sharpe ratios of 5–7 come from daily long-short portfolios "without accounting for transaction costs". — [Rahimikia et al.](http://wp.lancs.ac.uk/fofi2026/files/2026/03/FoFI-2026-020-Eghbal-Rahimikia.pdf). The 2026 five-stock TSFM benchmark has no backtest at all. — [arXiv 2606.27100](https://arxiv.org/html/2606.27100)
- **Non-robustness of order-book DL:** A benchmark of limit-order-book models (search snippet) reports that DNN price-trend predictors "are not consistently reliable as they often exhibit non-robust and non-generalizable performance". — [Prata et al. 2024, Artificial Intelligence Review](https://link.springer.com/article/10.1007/s10462-024-10715-4)
- **Reviews don't audit these issues:** A PeerJ CS systematic review covers 49 DL stock-forecasting studies from 2020–2024, selected from 1,552 records and mostly published in *Expert Systems with Applications* and *IEEE Access*. It lists RMSE, MAPE, and accuracy as metrics but gives no counts of naive baselines, cost adjustments, or leakage checks. — [Akşehir & Kılıç 2024, PeerJ CS (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11623133/)
- **Look-ahead in LLM- and pretrained-model finance studies** is now a research topic in its own right. Examples include a standardized benchmark of point-in-time look-ahead bias ([arXiv 2601.13770](https://arxiv.org/pdf/2601.13770)), a "one-switch" decision-time leakage benchmark ([arXiv 2605.23959](https://arxiv.org/pdf/2605.23959)), and the TSFM vintage study ([arXiv 2609.20554](https://arxiv.org/abs/2609.20554)). I did not read the first two in full.

### Inferences
- Rules of thumb for vetting any paper or tutorial:
  - **Price-level RMSE or MAPE with no persistence baseline:** the result is almost certainly meaningless. Persistence wins on random-walk series.
  - **Normalization or scaling fit on the full sample:** this is leakage.
  - **Universe defined by stocks alive at the end:** this introduces survivorship bias.
  - **Test window of one year or less, or a single bull year:** this cannot separate skill from beta or luck.
  - **No costs with daily rebalancing:** the profits are likely to vanish.
- The methodological failures are concentrated in engineering and CS venues. The finance-journal papers (EJOR, JF, RFS) generally avoid the worst errors, and they also report much smaller and decaying effects.

### Gaps
- **I found no quantitative audit** with figures like "X% of DL stock papers predict price levels" or "Y% omit transaction costs". A search summary mentioned a systematic review of sentiment-enhanced DL in which only 5 studies reported finance-aware metrics (net profit or Sharpe) and only 1 adjusted for transaction fees. I could not tie it to a specific verifiable source, so it should not be cited without checking.
- The Nature HSSC 2025 finding rests on a search snippet; its full text, data, and period were not retrieved.

---

## Q4. What do public competitions show (M6, Kaggle Jane Street/Optiver/Two Sigma/G-Research, Numerai)?

### Takeaway
M6 is the most relevant evidence for this app. It was a live, one-year test (2022–2023) of **4-week** forecasts on 50 US stocks and 50 ETFs. Only **23.3%** of teams beat a naive equal-probability forecast on ranking returns, **28.8%** beat an equal-weight buy-everything portfolio on risk-adjusted return, and **6.7%** beat both. No team beat the investment benchmark in all 12 months, and forecasting accuracy was essentially uncorrelated with investment results (r = 0.04). Kaggle's finance competitions are intraday or anonymized-feature tasks with no bearing on 12-month single-stock targets. Numerai uses 20- and 60-business-day residual-return targets with engineered, point-in-time features.

### Cited Findings

**M6 Financial Forecasting Competition (Makridakis, Spiliotis, Hollyman, Petropoulos, Swanson & Gaba; International Journal of Forecasting)**
- Design:
  - Universe: 50 US stocks plus 50 international ETFs, with $300,000 in prizes.
  - Timing: 12 rolling submission points four weeks apart, starting in 2022 (rounds from 6 Mar 2022 to 8 Jan 2023) and ending in 2023.
  - Forecast task: for each asset, participants gave the probability of falling in each return quintile over the next four weeks (about 20 trading days).
  - Investment task: participants submitted portfolio weights, scored by IR = return / standard deviation.
  - [M6 paper, arXiv 2310.13357](https://arxiv.org/abs/2310.13357)
- Benchmarks: the forecasting benchmark gives each quintile probability 0.2 and scores an **RPS of 0.16**. The investment benchmark holds equal long positions in all 100 assets. — [M6 paper](https://arxiv.org/abs/2310.13357)
- **Results:** Of 163 teams on the global leaderboard, **38 (23.3%) beat the RPS benchmark**, **47 (28.8%) beat the IR benchmark**, and **11 (6.7%) beat both**. Only **3 teams** beat the forecasting benchmark in all 12 months; **none** beat the investment benchmark in all 12, and one team managed 11 months. — [M6 paper](https://arxiv.org/abs/2310.13357)
- On RPS, teams "perform either similarly well or significantly worse than the benchmark" throughout the competition. The median team RPS was 0.162, worse than the benchmark's 0.16, and the mean was 0.179. The best accuracy improvement over the *average* submission was only 12.7%. — [M6 paper](https://arxiv.org/abs/2310.13357)
- On investment, the benchmark IR was 0.453, against a team mean of −3.421 (SD 9.832) across the 148 teams with original portfolios; 31.76% of those beat the benchmark IR. A small top group earned roughly 30% returns. — [M6 paper](https://arxiv.org/abs/2310.13357)
- **Forecasting and investing were disconnected:** the correlation between IR and RPS was r = 0.04 across 138 teams. It peaked at r = 0.7 among the top 20% and was 0.12 among the top 5%. "In our data, we found no clear connection between the two." — [M6 paper](https://arxiv.org/abs/2310.13357)
- Organizers' conclusion: the findings show "the great difficulty associated with trying to consistently outperform the market". "Wisdom of crowds" aggregation and risk models added value. — [M6 paper](https://arxiv.org/abs/2310.13357)
- An independent factor-model analysis found that "most competitors could not generate significant out-performance" against randomly selected long-only and long-short portfolios, and that identifying skill is difficult. — [Benchmarking M6 Competitors, arXiv 2406.19105](https://arxiv.org/abs/2406.19105)
- A participant paper, ranked 5th of 163 on forecasting, confirms that only 38 participants beat the "M6 dummy" naive benchmark. — [arXiv 2303.01855](https://arxiv.org/pdf/2303.01855)
- A 2025 IJF follow-up concludes that performance consistency mattered more than engagement for profitable investing (search snippet). — [IJF 2025, 41(4):1404–1412](https://ideas.repec.org/a/eee/intfor/v41y2025i4p1404-1412.html)

**Numerai**
- Targets "represent the future performance of a given stock relative to the given era", and the fund seeks returns "not explained by broader trends". The main v6 target, `target_jupiter_60`, measures returns over **60 business days**. Other targets differ in residualization and horizon (20 vs 60 market days). Features are engineered by Numerai and "point-in-time to avoid leakage issues". — [Numerai docs](https://docs.numer.ai/numerai-tournament/data)

### Inferences
- M6 is the closest public test to "rate S&P 500 stocks over the next month". It suggests that roughly three out of four serious forecasters cannot beat "every quintile is equally likely" on relative 4-week returns, and that a better forecast does not reliably produce a better portfolio. Because M6 ran live, it is free of look-ahead and survivorship bias, which makes it more trustworthy than any backtest above.
- M6 IR is computed from adjusted closing-price returns, and the paper describes no cost deduction. Costs would therefore widen the gap between active teams and the passive benchmark.
- Numerai shows that sophisticated practitioners *do* target 1–3-month horizons, but they use residualized (beta- and factor-neutral) relative returns and large engineered feature sets, not raw price series or absolute price levels.

### Gaps
- **Kaggle competitions:** the competition pages render with JavaScript and could not be read, and the search budget ran out before I could find write-ups. From background knowledge, *unverified in this session and to be checked before citing*:
  - Jane Street Market Prediction (2020–21) and Jane Street Real-Time Market Data Forecasting (2024–25) used anonymized features and very short-horizon "responders".
  - Optiver Realized Volatility (2021) forecast 10-minute realized volatility.
  - Optiver Trading at the Close (2023) forecast 60-second moves around the Nasdaq closing auction.
  - G-Research Crypto (2022) forecast 15-minute crypto returns.
  - Two Sigma "Using News to Predict Stock Movements" (2018) forecast roughly 10-day residualized returns.
  - Winning solutions are widely reported to be gradient-boosted trees, neural-network ensembles, or both.
  - All of these are intraday to about 2-week horizons and say nothing direct about 12-month targets.
- I found no audited public performance figures for Numerai's hedge fund.
- I did not extract the M6 per-method breakdown (whether DL entrants did better or worse than statistical or judgmental entrants).

---

## Q5. Does any of this work at monthly-to-annual horizons, or is it confined to intraday and daily horizons? (and relevance to the app)

### Takeaway
Credible deep-learning evidence from price and volume data is concentrated at **intraday to weekly** horizons, and it decays over time and after costs. At **1–3 months** there is modest, gross, mostly small-cap evidence: JKX's value-weight Sharpe is about 0.2–0.5. M6's live 4-week test shows most forecasters cannot beat a naive baseline. At **6–12 months** I found **no credible evidence** that DL on price, volume, or order data forecasts individual large-cap returns or price levels better than a random walk with drift. For an app that publishes a 12-month price range and a Buy/Hold/Sell rating per S&P 500 stock, this literature does not justify a directional forecast. At most it supports volatility-based range construction and a random-walk baseline.

### Cited Findings
- Daily-horizon studies show strong early results that decayed: about zero net after 2010 for the LSTM, and −14% to −25% a year net for the KDH ensemble. — [Fischer & Krauss WP](https://www.econstor.eu/bitstream/10419/157808/1/886576210.pdf); [Krauss, Do & Huck WP](https://www.iwf.rw.fau.de/files/2016/03/03-2016.pdf)
- The predictive edge falls as the horizon lengthens and as stocks get larger (JKX, US 2001–2019, gross):
  - Weekly, equal-weight: Sharpe 7.2.
  - Monthly, equal-weight: about 2.2–2.4. Monthly, value-weight: about 0.45–0.49.
  - Quarterly, equal-weight: 0.37–1.30. Quarterly, value-weight: 0.23–0.47.
  - Training on only the largest 2,000 firms cuts the I20/R20 Sharpe to 0.44 equal-weight and 0.42 value-weight.
  - [JKX WP](https://www.aidf.nus.edu.sg/wp-content/uploads/2022/02/Xiu-Re-Imagining-Price-Trends.pdf)
- JKX's accuracy-to-Sharpe heuristic: each +0.5% of accuracy adds roughly +0.1 to the annualized Sharpe of a timing strategy. Improving monthly accuracy from 52% to 53% lifts the Sharpe from about 0.6 to 0.8. — [JKX WP](https://www.aidf.nus.edu.sg/wp-content/uploads/2022/02/Xiu-Re-Imagining-Price-Trends.pdf)
- In the live 4-week M6 test, 23.3% of teams beat the naive RPS, 28.8% beat the equal-weight IR, and none beat the IR benchmark in every month. — [M6 paper](https://arxiv.org/abs/2310.13357)
- For 20-day returns of five mega-caps, TSFMs are significant in only 2 of 10 tasks, with uncorrected p-values. — [arXiv 2606.27100](https://arxiv.org/html/2606.27100)
- Rahimikia et al. report out-of-sample R² below zero at the daily horizon even for the best benchmark, and less predictability in large caps than in small caps. — [Rahimikia et al.](http://wp.lancs.ac.uk/fofi2026/files/2026/03/FoFI-2026-020-Eghbal-Rahimikia.pdf)
- At the monthly horizon with firm characteristics rather than raw prices, Gu, Kelly & Xiu find trees and neural networks perform best. The dominant signals are "variations on momentum, liquidity, and volatility", and ML gains are "in some cases doubling the performance of leading regression-based strategies". — [Gu, Kelly & Xiu, NBER w25398](https://www.nber.org/papers/w25398)
- In the TSFM look-ahead study, *one-month* forecasts from vintages exposed to future data had median certainty-equivalent differences of −1.77pp (US) and −2.14pp (international). This shows that monthly economic value from these models is fragile. — [arXiv 2609.20554](https://arxiv.org/abs/2609.20554)
- Numerai's production targets are 20 and 60 business days of residual return, which shows where practitioners believe forecastable structure exists. — [Numerai docs](https://docs.numer.ai/numerai-tournament/data)

### Inferences
- **Horizon mismatch.** The app needs 12-month absolute price levels for individual S&P 500 stocks. The literature's credible results are about *cross-sectional rankings* (relative returns) over days to weeks, gross of costs, and strongest in small and illiquid stocks. Forecasting a 12-month *absolute* level is the framing in which a naive random walk with drift is hardest to beat, because market beta and drift dominate.
- **What is defensible for the app:**
  - Anchor the 12-month central estimate on a random walk with drift, for example the current price compounded at a market or CAPM expected return, or on analyst consensus.
  - Set the *range* from volatility forecasts, such as implied volatility or GARCH/HAR. Volatility is genuinely predictable, which is consistent with Kronos's volatility MAE gains, and 12-month ranges driven by volatility are calibratable.
  - If the app shows any price-pattern signal, label it as a short-horizon technical indicator (reversal or momentum), not a 12-month forecast.
  - Any claimed model should be evaluated against a random-walk baseline on a survivorship-free, point-in-time S&P 500 panel, with out-of-sample periods after 2015.
- **Buy/Hold/Sell:** M6 suggests that most forecasters' 1-month relative rankings are no better than uniform. It also shows that ranking skill does not translate into portfolio performance (r = 0.04). A rating built only on price-series DL would likely be noise for large caps. Stating this openly in each report's methodology section would make it more credible.
- **Citations to avoid in the app:** tutorial-style LSTM "price prediction" charts that track price closely. These are lagged copies of the price and are beaten by the persistence baseline (see Q3). The same goes for headline GNN returns such as RSR's 98%.

### Gaps
- I found **no study (DL or otherwise) of price, volume, or order data that forecasts 6–12-month single-stock returns or price levels** for large US stocks against a random walk with drift. A non-retrieval does not prove absence, because the search budget ran out.
- I did not verify the exact monthly R² figures or sample period for Gu, Kelly & Xiu (2020, RFS) from the full text. The NBER abstract does not state the horizon, though the paper is widely cited as a monthly study.
- I did not retrieve "Charting by Machines" (Murray, Xia & Xiao, JFE 2024) or Kelly, Malamud & Zhou's "Virtue of Complexity", both of which may add monthly-horizon evidence from price-based ML.
- I found no evidence on DL forecasts of *12-month volatility or price ranges* for S&P 500 stocks against implied-volatility baselines. This would be the most directly useful follow-up for the app's range feature.
