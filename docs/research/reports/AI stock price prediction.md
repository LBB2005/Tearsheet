# AI Reads Companies Well, Forecasts Them Poorly

Machine learning and AI can forecast stock returns, but the measurable edge is small and decays quickly. It lives mostly in small, illiquid stocks and at horizons of days, and for S&P 500 companies over 1–12 months almost none of it survives honest testing and realistic trading costs. In the benchmark study, neural networks roughly double a three-variable regression's out-of-sample R² among the 1,000 largest US stocks (**0.70% vs 0.31% a month; about 4.9% vs 2.5% at 12 months**). Once microcaps are excluded, however, the ML long-short alpha drops to an insignificant **0.31% a month**, and its break-even trading cost (0.36%) is about what large-cap trades actually cost. Deep learning on price charts went to roughly zero net returns after 2010. News sentiment, including GPT-4-scored headlines, is priced within one or two days for large caps and stops paying at 20 bp round-trip costs; the only text signal with documented 1–12-month reach is year-over-year change in a company's own 10-K language. LLMs are genuinely useful for reading, extracting and classifying filings, but their forecasts are optimistic, overconfident and contaminated by memorized history, and the contamination is worst for the famous large caps the app covers. Live records agree with the research. The longest-running AI-picked US equity ETF has gained about half what the S&P 500 did since 2017, and AI hedge funds' edge over peers has been statistically zero since 2017. The design implication is to give each job to the tool with evidence behind it: a transparent code-built factor rating, a volatility-based price range, and an LLM confined to cited evidence and prose under verification. Everything the app publishes should then be graded in a pre-registered public scorecard that tells readers plainly how many years it will take to tell skill from luck.

## Machine learning on firm data doubles forecast power, mostly where trading is costly

The dominant AI approach in academic finance feeds dozens of firm characteristics, such as past returns, size, liquidity, volatility and valuation ratios, into trees and neural networks and asks them to predict next month's return for every stock. The reference study, Gu, Kelly and Xiu (*Review of Financial Studies*, 2020), uses about 30,000 US stocks, 94 characteristics and their interactions with macro variables. It refits annually and tests out of sample over 1987–2016 ([GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)). A three-layer network lifts monthly out-of-sample R² from 0.16% for a three-variable OLS (size, book-to-market, momentum) to 0.40% across all stocks. The value-weighted long-short decile Sharpe ratio rises from 0.61 to **1.35**. These R² values are small by construction: they are measured against a zero forecast, and the authors note that a historical-mean benchmark would inflate them by about 3 percentage points. Every portfolio figure is gross of costs, with monthly turnover of **110–130%** for the networks against 58% for the simple regression ([GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)).

The authors' most relevant claim for an S&P 500 product is that tree methods and neural networks "are especially successful among large stocks." The table below shows their models evaluated on the 1,000 largest stocks.

| Model (top 1,000 US stocks, 1987–2016, gross) | Monthly out-of-sample R² | 12-month out-of-sample R² |
|---|---|---|
| OLS-3 (size, value, momentum) | 0.31% | 2.48% |
| Elastic net (all features) | 0.25% | 1.90% |
| Additive spline model (no interactions) | 0.14% | 1.82% |
| Random forest | 0.63% | 4.80% |
| Neural net NN3 / NN4 | 0.70% / 0.67% | 4.73% / 4.91% |

Source: ([GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf))

The table carries two lessons. First, the large-cap gain comes from **interactions between characteristics**, not from nonlinearity alone. An additive nonlinear model without interactions does worse than the three-variable regression, and so does a penalized linear model using every feature, so "more variables, still linear" is not a safe default either. Second, the gain persists at the 12-month horizon, where R² roughly doubles from 2.5% to about 4.9%, so it is not just a short-term-reversal artifact. The models largely agree on what matters: price trends first (momentum, short-term reversal, industry momentum), then liquidity, volatility and valuation. GKX describe the top third of that ranking as "remarkably stable over time," and their network finds momentum and the low-volatility effect strongest among large stocks ([GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf)). That stability suggests a well-chosen factor score already contains most of what ML "learns" about which inputs matter. ML's edge lies in how it weights those inputs conditionally.

The trouble starts when you ask where the profits come from. Avramov, Cheng and Metzker (*Management Science*, 2023) replicate GKX and three successor models. They find deep-learning signals "extract profitability from difficult-to-arbitrage stocks and during high limits-to-arbitrage market states" ([ACM 2023](https://si-cheng.net/wp-content/uploads/2023/05/2023-ms-avramov_cheng_metzker-machine-learning-vs.-economic-restrictions.pdf)). Excluding microcaps cuts the GKX signal's value-weighted six-factor alpha by 66%. What remains is a raw 1.05% a month long-short return with an alpha of only **0.31%**, which is statistically insignificant and fully explained by the Stambaugh-Yuan factors. Outside microcaps, its break-even one-way trading cost is **0.36%**, against estimated one-way costs of roughly **0.35%** for the largest firms after 2002. The alpha also depends on the market regime: 0.22% a month when the VIX is low, 1.66% when it is high. The one model that held up was IPCA, a structured approach that keeps returns linear in characteristics. Its alpha barely moves when microcaps are dropped, from 0.62% to 0.61% ([ACM 2023](https://si-cheng.net/wp-content/uploads/2023/05/2023-ms-avramov_cheng_metzker-machine-learning-vs.-economic-restrictions.pdf)).

The evidence is not one-sided. Azevedo, Hoegner and Velikov use ML to combine up to 320 published anomalies, each admitted only after its publication date. Over 2005–2021 they report value-weighted net returns of **0.64% a month for an elastic net up to 1.42% for an LSTM**, after costs of 20–25 bp a month, and they explicitly frame this as contrary to Avramov et al. ([AHV](https://afajof.org/management/viewp.php?n=75544)). Their sample still spans all CRSP stocks, however, and a linear elastic net captures a large share of the net benefit. Their result therefore reads more as "ML as a disciplined combiner of known signals" than as proof that deep nonlinearity pays in large caps. They also find that the usual cost-cutting tricks (longer holding periods, size filters, buy-hold spreads) reduce turnover without improving net performance. They cite separate evidence that training on longer prediction horizons does help after costs ([AHV](https://afajof.org/management/viewp.php?n=75544)).

The field's leaders have moved in the same direction. Jensen, Kelly, Malamud and Pedersen (in press at *RFS*) argue that ML forecasts which ignore costs load on "fleeting, small-scale characteristics." Their alternative learns portfolio weights directly under an objective that includes trading costs ([SFI](https://sfi.ch/en/publications/machine-learning-and-the-implementable-efficient-frontier)). The "virtue of complexity" result, which claimed that massively over-parameterized models time the market better, has been sharply challenged. Nagel shows the model mechanically turns into a volatility-timed momentum strategy, and controlling for that strategy cuts its alpha to 1.2% a year (t = 0.95) ([Nagel 2025](https://voices.uchicago.edu/stefannagel/files/2025/07/Complexity_2.pdf)). The lesson for any product is that a complex model can reduce to a simple strategy nobody intended, so interpretability is a safeguard, not a luxury.

For S&P 500 constituents, a reasonable synthesis has three parts:

- Gross monthly R² of roughly 0.2–0.7% for ML, against about 0.2–0.3% for a good linear score.
- R² of a few percent at 12 months.
- Incremental net alpha over the linear score near zero at monthly rebalancing.

Two caveats pull in opposite directions. No verified peer-reviewed study trains and tests stock-level ML only on S&P 500 members with net-of-cost results, so this range is extrapolated from top-1,000 evidence and the low end is the prudent assumption. On the other hand, the app's 6–12-month horizon is exactly where nonlinear R² gains persist and turnover is lowest. That makes it the most favorable setting for a modest, slow-moving ML weighting layer, if one is ever added.

## Deep learning on price charts has decayed to zero after costs

A second line of work ignores fundamentals. It feeds raw price, volume or order-book histories to LSTMs, CNNs, graph networks, transformers and, most recently, pre-trained time-series foundation models. The most carefully designed studies use S&P 500 universes free of survivorship bias and decades-long tests, and they show steady decay.

Fischer and Krauss trained an LSTM on 240-day return sequences of S&P 500 members from 1992 to 2015. It earned 0.46% a day before costs and 0.26% after 5 bp per half-turn. The profits were concentrated in the 1990s, though: over 2010–2015 the LSTM was only "able to keep capital approximately constant, after transaction costs," and a random forest lost money ([Fischer & Krauss](https://www.econstor.eu/bitstream/10419/157808/1/886576210.pdf)). A simple five-day reversal rule explains about **52% of the variance** of the LSTM's long and short legs, so the network was largely rediscovering a known anomaly. Krauss, Do and Huck ran an ensemble of deep nets, boosted trees and random forests on the same universe. In the final sub-period it returned **−14% to −25% a year after costs**, and the deep net was the weakest of its three learners. The authors conclude that markets have "become more efficient in respect to standard machine learning statistical arbitrage" ([Krauss, Do & Huck](https://www.iwf.rw.fau.de/files/2016/03/03-2016.pdf)).

The most credible evidence at a monthly horizon comes from Jiang, Kelly and Xiu (*Journal of Finance*, 2023). They train a CNN on images of past price charts and hold the model fixed over a 2001–2019 test. Equal-weighted monthly Sharpe ratios above 2 shrink to **0.45–0.49 value-weighted**, gross of costs, with monthly turnover of **173–187%**. At a quarterly horizon the value-weighted Sharpe ratios fall to 0.23–0.47, and training only on the largest 2,000 firms gives 0.42 ([JKX](https://www.aidf.nus.edu.sg/wp-content/uploads/2022/02/Xiu-Re-Imagining-Price-Trends.pdf)). Directional accuracy for 20-day returns is 52.5–53.6%, against 52.1% for plain momentum. With turnover near 180% a month, little of that small value-weighted edge survives realistic costs for a large-cap investor.

Outside these finance-journal papers, quality drops quickly. A highly cited graph-network paper reported a 98% average return ratio on NYSE stocks, but its design had serious flaws ([Feng et al.](https://arxiv.org/pdf/1809.09441)):

- It normalized prices by each stock's maximum over the full 2013–2017 sample, which leaks future prices into the inputs.
- It kept only stocks that never traded below $5 through 2017, a survivorship filter.
- It tested on just 237 trading days of 2017.
- It tuned hyperparameters on returns and ignored trading costs.

Models that predict price *levels* rather than returns look impressive only because a naive "tomorrow equals today" forecast already scores 95–98% "accuracy." One 2025 study reports that an LSTM did worse than that naive forecast ([Nature HSSC 2025](https://www.nature.com/articles/s41599-025-04761-8)). On exchange-rate data, which behaves like a random walk, simply repeating the last value beats every transformer tested by about 45% ([Zeng et al.](https://arxiv.org/abs/2205.13504)). A 2024 systematic review of 49 deep-learning stock-forecasting studies catalogs architectures and error metrics. It does not check whether the studies used naive baselines, deducted costs or controlled for leakage ([Akşehir & Kılıç 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11623133/)).

Time-series foundation models have not changed the picture:

- **Daily returns, zero-shot.** On a 34-year, 94-country daily panel, Chronos and TimesFM produced out-of-sample R² of **−1.37% and −2.80%** for next-day returns. That is worse than linear regression and gradient-boosted trees, and fine-tuning helped little ([Rahimikia et al.](http://wp.lancs.ac.uk/fofi2026/files/2026/03/FoFI-2026-020-Eghbal-Rahimikia.pdf)).
- **Daily returns, finance-trained.** Models pre-trained from scratch on financial data post daily long-short Sharpe ratios of roughly 3.7–6.8. These are "without accounting for transaction costs," and performance degraded over time ([Rahimikia et al.](http://wp.lancs.ac.uk/fofi2026/files/2026/03/FoFI-2026-020-Eghbal-Rahimikia.pdf)).
- **20-day returns on mega-caps.** A 2026 test of five foundation models on five mega-caps found gains over a random walk that were "small and sparse." They were significant in only 2 of 10 tasks, using p-values not corrected for multiple tests, and some models did far worse than the random walk on META. The authors warn the results "should not be read as evidence of trading alpha" ([arXiv 2606.27100](https://arxiv.org/html/2606.27100)).
- **Kronos.** This finance-native model reports a 93% higher rank IC than the best generic model, but no trading test net of costs. Its more credible claim is a **9% lower volatility-forecasting error** ([Kronos](https://arxiv.org/abs/2508.02739)). That fits a broader pattern: volatility is genuinely persistent and forecastable, while price direction is not.

The cleanest test is the one that ran live. In the M6 competition (2022–2023), 163 teams forecast four-week return quintiles and built portfolios for 50 US stocks and 50 ETFs over 12 monthly rounds ([M6](https://arxiv.org/abs/2310.13357)):

- Only **23.3%** beat a naive forecast that gave every quintile a 20% probability.
- 28.8% beat an equal-weight portfolio on risk-adjusted return, and only **6.7%** beat both benchmarks.
- No team beat the investment benchmark in all 12 months.
- Forecast accuracy and investment results were essentially unrelated (r = 0.04).

Because it ran live, M6 is free of the lookahead and survivorship problems that plague backtests. Practitioners who do forecast at these horizons, such as Numerai, target 20- and 60-business-day *residual* returns (returns after removing market and factor effects) built from engineered point-in-time features, not raw prices ([Numerai](https://docs.numer.ai/numerai-tournament/data)). This research found no credible study showing that price-based deep learning forecasts 6–12-month returns or price levels of large US stocks better than a random walk with drift.

## Filing changes, not news tone, carry text signals past a month

Text analysis has a longer academic history than deep learning. Its evidence is unusually useful for an app built on SEC filings, because the one robust long-horizon text signal comes from free EDGAR documents.

The first lesson is about measurement. Loughran and McDonald (2011) showed that **73.8%** of the negative-word counts that a general-purpose dictionary (Harvard IV-4) finds in 10-Ks come from words that are not negative in finance, such as "tax," "cost" and "liability." They built finance-specific word lists in response. Their negative-tone measure tracks four-day filing-window returns, volatility, earnings surprises and fraud. But when they sorted firms on 10-K negativity and held the portfolios for 12 months, "none of the values are statistically significant," and they judged the effect "not enough to warrant active trading" ([LM 2011](https://www.uts.edu.au/globalassets/sites/default/files/adg_cons2015_loughran-mcdonald-je-2011.pdf)). The dictionary is free for academic research but needs a commercial license for a public product ([SRAF](https://sraf.nd.edu/loughranmcdonald-master-dictionary/)).

What does predict returns over months is *change*. Cohen, Malloy and Nguyen's "Lazy Prices" (*Journal of Finance*, 2020) compares each firm's 10-K and 10-Q with its own filing from the prior year, using cosine, Jaccard and edit-distance similarity. Over 1995–2014, firms whose filings barely changed outperformed firms whose filings changed by **34–58 bp a month value-weighted (up to about 7% a year, t = 3.59)** ([Lazy Prices](https://www.nber.org/system/files/working_papers/w25084/w25084.pdf)). The returns build gradually over about six months, keep building out to 18 months, and do not reverse. There is **no price reaction at all around the filing date**, which points to investor inattention. That fits evidence that the average annual report is downloaded by investors only 28.4 times right after filing. Other findings from the paper ([Lazy Prices](https://www.nber.org/system/files/working_papers/w25084/w25084.pdf)):

- Changes to Item 1A Risk Factors were the most informative, with long-short alphas of up to 188 bp a month, though the authors call their section-level results "suggestive but not definitive."
- Changes that mention litigation underperformed by 71 bp a month.
- About 86% of changes carry negative sentiment.
- The effect is "not concentrated in small firms": the average changer has a $3.5 billion market cap, larger than the average firm on the long side.
- Turnover is very modest.

The caveats matter. The sample ends in 2014, the returns are gross of costs, there is no S&P 500-only result, and this research found no evidence on whether the effect has decayed since publication. Its current size should be treated as unknown and probably smaller.

News is the opposite case: the signal is strong and fast, and the data is expensive. Ke, Kelly and Xiu use 25.7 million Dow Jones articles. Their supervised sentiment model, SESTM, earns a daily equal-weighted Sharpe ratio of 4.21 gross, beating the commercial RavenPack score (3.26) and the LM dictionary (2.32) on the same news ([KKX](https://par.nsf.gov/servlets/purl/10289824)). For large caps, though, the edge mostly disappears:

- For stocks above the NYSE median size, the price response to news is **11 bp on day one, and "their price response is complete after one day."**
- The value-weighted Sharpe ratio falls to 1.24, and the value-weighted short leg earns nothing (Sharpe −0.07).
- After realistic costs, the best turnover-limited portfolio nets a Sharpe of about **1.05**, against roughly 4 gross.

RavenPack's own cumulative return curve "noticeably flattens" after 2008 and especially from mid-2014. The authors link this to growth in RavenPack subscriptions, a concrete case of a text signal decaying once it is sold widely ([KKX](https://par.nsf.gov/servlets/purl/10289824)). For a large-cap rating with a 1–12-month horizon, news sentiment is material for the narrative, not an input to the score, and it requires licensed news feeds.

Transformer-era tools sharpen classification more than prediction. FinBERT is an openly released BERT model pre-trained on 10-K Items 1, 1A and 7, earnings calls and analyst reports. It beats generic BERT on finance sentiment benchmarks: 0.872 vs 0.835 accuracy on Financial PhraseBank and 0.844 vs 0.730 on FiQA ([Yang, Uy & Huang](https://arxiv.org/abs/2006.08097)). Its authors also report that other methods understate how informative earnings-call text is by at least 18% ([HKUST](https://bm.hkust.edu.hk/bizinsight/2026/01/finbert-large-language-model-extracting-information-financial-text)). As a stand-alone return signal it disappoints. In Lopez-Lira and Tang's head-to-head test, FinBERT labeled 75% of headlines neutral and its drift strategy lost money (Sharpe −0.33) ([Lopez-Lira & Tang](https://arxiv.org/pdf/2304.07619)). Its natural job is to sign the paragraphs that changed between filings as positive or negative.

Text also improves peer groups. Hoberg and Phillips build text-based industries from 10-K product descriptions and redraw them every year. These industries explain profitability, leverage and the rivals managers themselves name better than SIC or NAICS codes do ([NBER w15991](https://www.nber.org/papers/w15991)). The public data files end in 2023, however, and their license terms are not stated ([Hoberg-Phillips](https://hobergphillips.tuck.dartmouth.edu/)).

## LLMs read filings competently but forecast like a fading news signal

Large language models entered return prediction through news, and the best-designed study shows both their promise and its limits. Lopez-Lira and Tang score headlines for 4,123 US stocks with a GPT-4 snapshot whose training data ends in September 2021. They test only on October 2021 to May 2024, after that cutoff ([Lopez-Lira & Tang](https://arxiv.org/pdf/2304.07619)). Their main results:

- The tradable drift strategy earns a Sharpe ratio of **2.97** before costs, but the drift lasts only "one to two trading days."
- The short leg, on negative news, does most of the work (26 vs 8 bp a day).
- Turnover is about 190% a day, and the strategy is **unprofitable at 20 bp round-trip costs**.
- Predictability is roughly five to six times stronger in small stocks.
- The Sharpe ratio decayed from **6.54 in late 2021 to 1.22 in early 2024** as LLM adoption spread.
- GPT-4 adds most on "complex synthesis" news such as insider transactions. Formulaic news such as earnings announcements is already priced efficiently.

Chen, Kelly and Xiu build a version from LLM embeddings across 16 global markets. It reports a net Sharpe around 1.5, with a "significantly lower" long-short return for large firms ([Li discussion](https://jacobslevycenter.wharton.upenn.edu/wp-content/uploads/2024/09/ExpectedReturnAndLLM_Discussion_SophiaZhengziLi_NoPause.pdf)). Point-in-time models, trained only on text available at each date, reach out-of-sample Sharpe ratios of about 1.0–1.5 on 2014–2020 news. That shows the signal is not purely memorization, though two of those authors consult for AQR and a third works there ([NBER w35247](https://www.nber.org/papers/w35247)). All of this is a 1–2-day effect, and none of it supports an LLM-derived 12-month rating.

The claim that LLMs analyze financial statements better than analysts has not held up. The most-cited paper, Kim, Muhn and Nikolaev's "Financial Statement Analysis with Large Language Models," was **withdrawn by its authors in February 2025**. A co-author had found "inconsistencies in the data and analyses" ([arXiv 2407.17866](https://arxiv.org/abs/2407.17866)). Even its draft claimed only about 60% directional accuracy on earnings changes. BlackRock reports that its fine-tuned earnings-call model reaches 61.3% accuracy on 40-day post-earnings returns, against 49.7–54.9% for GPT-4 and its successors ([BlackRock](https://www.blackrock.com/us/individual/insights/alpha-reimagined)). The figure is self-reported and task-specific, and it suggests general-purpose LLMs are barely better than a coin flip at predicting direction.

As readers, LLMs are much better, and getting the right document into the model matters more than which model is used:

- **FinanceBench.** GPT-4-Turbo answered 19% of filing questions correctly with a shared vector store, 79% with the full document in context, and 85% when given the right page. Questions requiring calculations across several financial statements were the hardest ([FinanceBench](https://arxiv.org/abs/2311.11944)).
- **Vals.ai Finance Agent.** This stricter benchmark scores an answer zero if it misses any required number. The best model in October 2026 reached **67.85%**, so even frontier agents fail about one in three expert tasks on SEC filings ([Vals.ai](https://www.vals.ai/benchmarks/fabv2-1)).
- **FinBen.** This benchmark summarizes the pattern: LLMs do best at information extraction and textual analysis, and struggle with forecasting and advanced reasoning ([FinBen](https://arxiv.org/abs/2402.12659)).

A deeper problem makes most LLM backtests uninterpretable: models memorize financial history. They recall exact values from before their training cutoff. Instructions to respect a historical date "fail to prevent recall-level accuracy," and masking names and dates fails because models "reconstruct entities and dates from minimal context" ([Lopez-Lira, Tang & Zhu](https://arxiv.org/abs/2504.14765)). One study measures how often a model shows knowledge it should not have yet. This measure is "materially positive throughout the in-sample period and collapses essentially to zero right after the training-data cutoff," and forecasting power is larger where it is higher ([Gao, Jiang & Yan](https://arxiv.org/abs/2512.23847)). A benchmark built for this problem finds that most published LLM trading agents fail to beat baselines once they are evaluated after their cutoff ([Look-Ahead-Bench](https://arxiv.org/pdf/2601.13770)). Glasserman and Lin find that the distortion from a model's general knowledge about a company is stronger for larger companies ([Glasserman & Lin](https://arxiv.org/abs/2309.17322)). That makes famous S&P 500 names the worst case.

Studies of LLM trading agents follow the same pattern: the longer, broader and more forward-looking the test, the smaller the edge.

- **FINSABER.** Earlier LLM timing strategies' advantages "deteriorate significantly" when tested over two decades and more than 100 symbols. The authors attribute the earlier wins to survivorship bias and data snooping ([FINSABER](https://arxiv.org/abs/2505.07078)).
- **StockBench.** In a test on 20 Dow stocks in March–June 2025, after the models' cutoffs, 8 of 14 models beat a 0.4% buy-and-hold return by small margins. No costs were modeled ([StockBench](https://arxiv.org/html/2510.02209v2)).
- **LiveTradeBench.** A model's rank on chatbot leaderboards does not predict its trading results ([LiveTradeBench](https://arxiv.org/abs/2511.03628)).
- **Production fleets.** A six-month study of LLM trading fleets in live production found them unprofitable, and frontier models' decision quality was "statistically indistinguishable" ([Barton et al.](https://arxiv.org/abs/2609.05663)).

For an app that uses an LLM to write narratives, the evidence on bias is the most actionable:

- **Optimism and overconfidence.** GPT-4o's return forecasts are "overoptimistic yet understate extreme upside returns." They extrapolate trends that later reverse and produce "confidence intervals that are too narrow," and these biases "resist correction through prompt engineering" ([Chen, Green, Gulen & Zhou](https://www.aeaweb.org/conference/2026/program/paper/zNrQ4Yn6)).
- **Optimism across vendors.** Of 16 models tested, 14 lean optimistic, and "pessimism appears only in Anthropic's frontier tier" ([OptimismBench](https://arxiv.org/abs/2607.26981)).
- **Breadth without accuracy.** When FactSet added generative AI to analysts' tools, their reports drew on 26% more sources and covered 24% more topics. Yet their relative forecast accuracy declined when information-processing demands were high ([Xue, Zhang & Zhu](https://arxiv.org/abs/2512.19705)).

LLMs widen and speed up coverage; they do not make it more accurate.

The table below compares the four approaches in the app's setting: large US stocks at 1–12-month horizons.

| Approach | Best headline result (gross) | Large-cap, 1–12-month evidence | After realistic costs | Defensible role in the app |
|---|---|---|---|---|
| ML on firm characteristics | Top-1,000 monthly R² 0.70% vs 0.31% for OLS; value-weighted Sharpe 1.35 | Alpha outside microcaps 0.31% a month, insignificant | Break-even cost ≈ large-cap cost; AHV nets 0.64–1.42% a month across all stocks | Transparent factor score; optional regularized weighting |
| Deep learning on prices | LSTM 0.46% a day (1992–2015); CNN equal-weighted monthly Sharpe above 2 | CNN value-weighted monthly Sharpe 0.45–0.49; nothing credible at 6–12 months | Roughly zero after 2010 | Volatility input for range width |
| Text: filings and news | News model (SESTM) equal-weighted Sharpe 4.21 daily; Lazy Prices 34–58 bp a month value-weighted | News priced within 1 day for large stocks; filing changes build over 6–18 months | News net Sharpe ≈ 1; Lazy Prices low turnover, gross only | Filing-change red flag; peer groups; narrative |
| LLMs | GPT-4 headline drift Sharpe 2.97 | Effect about one-fifth of small-cap; nothing at 12 months | Unprofitable at 20 bp | Extraction, classification, cited prose |

Sources: [GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf); [ACM 2023](https://si-cheng.net/wp-content/uploads/2023/05/2023-ms-avramov_cheng_metzker-machine-learning-vs.-economic-restrictions.pdf); [AHV](https://afajof.org/management/viewp.php?n=75544); [Fischer & Krauss](https://www.econstor.eu/bitstream/10419/157808/1/886576210.pdf); [JKX](https://www.aidf.nus.edu.sg/wp-content/uploads/2022/02/Xiu-Re-Imagining-Price-Trends.pdf); [Lazy Prices](https://www.nber.org/system/files/working_papers/w25084/w25084.pdf); [KKX](https://par.nsf.gov/servlets/purl/10289824); [Lopez-Lira & Tang](https://arxiv.org/pdf/2304.07619)

## Honest evaluation means counting trials, freezing data in time and waiting years

Every result above could be produced by accident, and the corrections for that are well established.

### Each variant tried raises the bar a backtest must clear

Bailey and López de Prado argue that the most important information missing from almost every published backtest is the number of trials attempted. A backtest that does not control for how widely its authors searched "is worthless, regardless of how excellent the reported performance might be" ([DSR](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf)). Their Deflated Sharpe Ratio raises the significance bar from zero to the Sharpe ratio you would expect from the best of N trials that have no skill. It also adjusts for sample length, skewness and fat tails. In their worked example, a strategy with an annualized Sharpe of 2.5 over five years of daily data fails a 95% confidence test once the search is accounted for.

Their formula for the expected best Sharpe gives a rough rule for the app's own factor backtest, assuming the Sharpe ratio of a no-skill strategy varies by about 1/years ([DSR](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf)):

- Tuning **20 independent variants over 10 years should produce an annualized Sharpe of about 0.6 by luck alone**.
- 100 variants over 10 years should produce about 0.8.
- With XBRL data starting around 2009–2011, 50 variants imply roughly 0.55–0.6.

Harvey and Liu show that the common practice of halving backtested Sharpe ratios is "a serious mistake." The correct adjustment for multiple testing is nonlinear: a cut of more than 50% for Sharpe ratios below about 0.4, and at most 25% for those above 1.0. In their example, a Sharpe of 0.75 on 20 years of monthly data falls to 0.32 once 200 tests are accounted for. They also note that at least 316 factors have been tested on US equities ([Harvey & Liu](https://people.duke.edu/~charvey/Research/Published_Papers/P120_Backtesting.PDF)).

A third tool, the Probability of Backtest Overfitting, measures how often the in-sample winner ends up below the median out of sample. It is estimated with a resampling method called combinatorially symmetric cross-validation ([PBO](https://papers.ssrn.com/abstract=2326253)). For an LLM report pipeline, every prompt or model change that is checked against historical outcomes counts as a trial too.

### Leakage hides in restated fundamentals, index lists and model weights

Three classic leaks dominate financial ML, and LLMs add a fourth.

- **Restated fundamentals.** Fundamentals must be point-in-time, meaning only what was known on the date. Compustat's periodic re-standardization alters historical values and introduces lookahead bias ([Yale SOM](https://som.yale.edu/sites/default/files/2024-07/Re-Standardized%20Financial%20Statement%20Data.pdf)). The SEC's XBRL `frames` endpoint returns each company's value from the "last filing that most closely fits the requested period," which builds in later restatements ([SEC](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)). A backtest data store should key every fact to its filing acceptance timestamp and make it usable only from the next trading session.
- **Overlapping labels.** With monthly rebalancing and 12-month targets, each observation's outcome window overlaps the next 11. Standard k-fold cross-validation therefore leaks unless overlapping observations are removed ("purged") and a buffer period ("embargo") is added after each test fold ([Purged CV](https://en.wikipedia.org/wiki/Purged_cross-validation)).
- **Today's index list.** The universe must be historical. Backtesting today's S&P 500 list builds in past winners. A backtest that "buys Tesla ten years ago" inside the index is invalid, because Tesla joined only in December 2020 ([Optuma](https://docs.optuma.com/im-a-survivor/)). Vendors claim that survivor-only data adds 3–8% a year of fictitious performance, a figure with no academic verification ([Backtrex](https://backtrex.com/en/blog/survivorship-bias-trading-backtesting)).
- **Model training data.** Any historical evaluation of an off-the-shelf LLM over dates before its training cutoff is contaminated. That makes the app's forward log the only clean evidence for anything the LLM touches.

### Proper scoring rules grade probabilities and ranges without rewarding hedging

A "probability of beating its sector" should be graded with the Brier score. The score splits into reliability (calibration), resolution (how well forecasts discriminate) and uncertainty (driven by the base rate). A reliability diagram plots the observed frequency against the forecast probability in each bin ([Brier score](https://en.wikipedia.org/wiki/Brier_score)). The meaningful headline number is the Brier skill score against the realized base rate, not against 50%.

Price ranges need more care, because "price landed inside the range" rewards ever-wider ranges. The Gneiting–Raftery interval score charges the range's width plus a penalty of 2/α times any distance by which the outcome misses the range. It is proper only when the ends of the range are declared quantiles ([scoringutils](https://www.rdocumentation.org/packages/scoringutils/versions/2.1.1/topics/interval_score); [Gneiting & Raftery](https://apps.dtic.mil/sti/html/tr/ADA459827/index.html)). Comparing intervals whose quantile levels are not specified has been called "difficult and perhaps unsolvable" ([arXiv 2209.08307](https://arxiv.org/pdf/2209.08307)). The app therefore has to state in advance what its bear, base and bull cases mean, for example the 10th percentile, median and 90th percentile of 12-month total return. Three checks then become possible: coverage near 80%, roughly 10% of outcomes in each tail, and a lower interval score than a naive range based on volatility.

### Five hundred forecasts a year are worth far fewer independent observations

Statistical power is the constraint most products ignore. A t-statistic equals the information ratio times the square root of the number of years ([Harvey & Liu](https://people.duke.edu/~charvey/Research/Published_Papers/P120_Backtesting.PDF)). The table below shows what that implies for a live track record; the hit-rate rows come from standard binomial power calculations.

| True skill | Needed to reach t = 2 | Needed to reach t = 3 |
|---|---|---|
| Information ratio 0.5 | About **16 years** | 36 years |
| Information ratio 1.0 | 4 years | 9 years |
| 55% hit rate (vs 50%) | About 617 independent forecasts | — |
| 52% hit rate (vs 50%) | About 3,860 independent forecasts | — |

The S&P 500 does not supply 500 independent forecasts a year. Forecasts made on the same date share market and sector shocks. With an average pairwise correlation of just 0.02, a 500-stock cohort is worth about 46 independent observations, so confirming a 55% hit rate would take roughly 13 non-overlapping annual cohorts. Standard errors must be clustered by forecast date and by firm: firm effects bias ordinary standard errors, and Fama-MacBeth regressions correct only for time effects ([Petersen](https://www.nber.org/papers/w11280.pdf)).

Harvey and Liu add that "there is no true OOS that uses historical data," because researchers already know what happened; only genuinely unseen data is clean ([Harvey & Liu](https://people.duke.edu/~charvey/Research/Published_Papers/P120_Backtesting.PDF)). That is why methodologists keep recommending pre-registration to finance: fixing the analysis plan publicly before the data exist ([ZBW](https://open-science-future.zbw.eu/en/preregistration-economic-research/); [DSR](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf)).

## AI-branded funds trail the market while serious firms keep AI upstream

The longest public record of a fully AI-picked US stock portfolio belongs to the AI Powered Equity ETF (AIEQ). It launched in October 2017 using IBM Watson for "machine learning, sentiment analysis and natural language processing." Through September 2026 it returned **9.61% a year** at net asset value. Its own page benchmarks it against its own AI index rather than the S&P 500 ([Amplify](https://amplifyetfs.com/aieq/)). Other sources fill in the comparison:

- One count puts its gain since launch at about +100%, against roughly +200% for the S&P 500 ([24/7 Wall St.](https://finance.yahoo.com/markets/stocks/articles/ai-help-beat-stock-market-152310707.html)).
- It trailed even its Morningstar mid-cap blend category over five years: 4.4% a year vs 7.9% ([Schwab](https://www.schwab.wallst.com/Prospect/Research/etfs/performance.asp?symbol=aieq)).
- One analytics site estimates its annualized alpha against the S&P 500 at about −5%, with a beta of 1.13 ([PortfoliosLab](https://portfolioslab.com/symbol/AIEQ)).

Newer LLM-run ETFs are tiny. Fewer than six funds rely solely on AI, holding about $30 million combined, each with only months of history ([Technology.org](https://www.technology.org/2026/10/15/ai-managed-etfs-stock-picking-beat-sp-500/)). The AI ETFs that do beat the index tend to do so over year-to-date or one-year windows, the classic pattern of a cherry-picked period. Media experiments do no better: in one, five of six ChatGPT and Gemini picks failed to beat the benchmark ([Money.com](https://money.com/ai-picks-stocks-this-month/)).

Institutional AI funds report better absolute results, but none of these are audited public comparisons:

- **Bridgewater.** Its machine-learning macro fund rose about 11% in 2025 while its human-run flagship gained 34%, according to an unnamed source ([Institutional Investor](https://www.institutionalinvestor.com/article/behind-bridgewaters-surge)). It trailed again through September 2026, 16.4% vs 18.4% ([Hedgeweek](https://hedgeweek.com/news/bridgewaters-pure-alpha-up-18-4-ytd-as-macro-strategy-rebounds)).
- **Numerai.** This fund crowdsources ML models into a market-neutral portfolio. It reports a 2024 net return of 25.45% with a Sharpe ratio of 2.75, and it secured $500 million of capacity from JPMorgan ([Numerai](https://blog.numer.ai/jpmorgan-secures-500m-capacity/)). That followed a reported 17% loss in 2023 ([FinanceFeeds](https://financefeeds.com/ai-hedge-fund-numerai-secures-up-to-500-million-backing-from-jpmorgan/)).

The best independent evidence is NBER Working Paper 35273 ([NBER Digest](https://www.nber.org/digest/202609/artificial-intelligence-and-hedge-fund-investing)). AI-driven hedge funds outperformed non-AI peers by about **50 bp a month before 2017, and by a margin statistically indistinguishable from zero since**, with the edge shrinking about 6 bp a year. They managed only about $12 billion in 2024, and investors did not allocate more money on the strength of AI disclosures alone.

How serious firms describe their own use of AI is consistent with this evidence:

- **Man Group.** Its AlphaGPT system pairs an idea-generating agent with one that writes the code and one that evaluates the result using the same statistical, risk and economic-rationale tests applied to human research. Every hypothesis still goes through the investment committee. Man names p-hacking and hallucination as risks and says "We can't leave it unsupervised just yet" ([Man Group](https://www.man.com/insights/what-ai-can-do-for-alpha)). The system has reportedly produced several dozen signals approved for live trading ([Hedgeweek](https://hedgeweek.com/news/man-group-deploys-agentic-ai-for-quant-signal-discovery)).
- **AQR.** Cliff Asness calls generative AI "evolutionary, not revolutionary" and "still just statistics." NLP is the firm's most-used application, and it uses ML to weight signals ([Hedgeweek](https://www.hedgeweek.com/ai-is-still-just-statistics-says-aqrs-cliff-asness/)).
- **BlackRock.** It fine-tunes LLMs on about 400,000 earnings-call transcripts, and its portfolio managers set themes and correct model errors ([BlackRock](https://www.blackrock.com/us/individual/insights/alpha-reimagined)).
- **Banks.** Banks use LLMs as internal research librarians. Morgan Stanley's GPT-4 assistant searches about 100,000 research reports for its advisers ([OpenAI](https://openai.com/index/morgan-stanley/)). Goldman rolled out its assistant to about 46,000 employees in 2025 for summarizing and drafting ([Fortune](https://fortune.com/2025/06/24/goldman-sachs-internal-ai-assistant)).

Mercer's 2026 survey of 131 asset managers captures the industry norm ([Wealth Professional](https://www.wealthprofessional.ca/news/industry-news/most-asset-managers-are-using-ai-but-few-let-it-call-the-shots/392509)). 55% have AI in at least one strategy's investment process. Only **5% use it for autonomous or semi-autonomous recommendations or trades**, and only **8% report improved returns** as a realized benefit, against 69% citing efficiency.

Regulators have so far targeted false claims about AI rather than its use. In March 2024 the SEC brought its first "AI washing" cases: it fined Delphia $225,000 and Global Predictions $175,000 under the Marketing Rule and anti-fraud provisions. Global Predictions had advertised "[e]xpert AI-driven forecasts" ([MoFo](https://www.mofo.com/pdf/resources/insights/240320-sec-targets-ai-washing-with-two-new-settled-cases)). The SEC withdrew its proposed rule on conflicts in predictive data analytics on 12 June 2025 ([Paul Hastings](https://www.paulhastings.com/insights/client-alerts/sec-withdraws-14-pending-rule-proposals)). FINRA's Regulatory Notice 24-09 says its content standards for communications apply "whether member firms' communications are generated by a human or technology tool" ([FINRA](https://www.finra.org/rules-guidance/notices/24-09)). One question is central to a free public ratings site and was not researched: whether the site qualifies for the Advisers Act exclusion for publishers, and whether interactive AI features could put that exclusion at risk. It needs legal review.

## Build the app so each task goes to the tool with evidence behind it

The evidence points to an architecture in three parts. Code makes every call that will be graded. The LLM does the reading and writing it is demonstrably good at. The scorecard is designed to resist every pitfall above.

### The rating: a published factor score with a filing-change flag

The Buy/Hold/Sell rating should come from a transparent linear score over the factor groups that ML consistently ranks highest and finds strongest among large stocks. These are 12-month and industry momentum, low volatility or beta, valuation, and profitability. The score should target 6–12-month relative returns, with its weights published and versioned. ML's documented gain in large caps is roughly 0.3–0.4 percentage points of gross monthly R². That gain comes mostly from interactions and disappears at about the level of large-cap trading costs ([GKX 2020](https://dachxiu.chicagobooth.edu/download/ML.pdf); [ACM 2023](https://si-cheng.net/wp-content/uploads/2023/05/2023-ms-avramov_cheng_metzker-machine-learning-vs.-economic-restrictions.pdf)). A neural net would therefore cost the app its explainability for little expected benefit.

If a second version wants learned weights, there are two options that keep the method publishable. A rolling elastic net or an IPCA-style estimate produces weights that can be released as dated snapshots, and IPCA is the structure that kept its alpha in liquid stocks ([ACM 2023](https://si-cheng.net/wp-content/uploads/2023/05/2023-ms-avramov_cheng_metzker-machine-learning-vs.-economic-restrictions.pdf)). A few explicit, documented interactions, such as momentum × size, would capture the part of the nonlinear gain that GKX attribute to interactions.

The text layer should add a year-over-year similarity score for Items 1A, 3, 7A and 7, each compared with the prior year's filing, with FinBERT signing the changed paragraphs as positive or negative. It should work mainly as a red flag over 3–6 months, because most changes are negative and the effect's size since 2014 is unknown ([Lazy Prices](https://www.nber.org/system/files/working_papers/w25084/w25084.pdf)). Dictionary tone levels, readability and news sentiment belong in the narrative, not the score.

The app should state publicly that the realistic expectation for this rating is a small edge at best. In M6, three of four serious forecasters could not beat a uniform guess when ranking stocks over four weeks ([M6](https://arxiv.org/abs/2310.13357)).

### The range: volatility around a drift anchor

A 12-month absolute price level is the framing in which a random walk with drift is hardest to beat, because moves in the overall market dominate. The base case should therefore start from the current price compounded at an expected return, such as a market or CAPM-style drift. The bear and bull cases should come from a volatility forecast, either implied volatility or a GARCH/HAR-type model, and be defined as declared quantiles. Volatility is the one quantity where pre-trained time-series models show a plausible gain ([Kronos](https://arxiv.org/abs/2508.02739)). A range defined by quantiles can be scored properly: by coverage, by tail balance, and by the interval score against a naive range built from trailing volatility ([scoringutils](https://www.rdocumentation.org/packages/scoringutils/versions/2.1.1/topics/interval_score)).

### The narrative: an LLM reader under verification

The LLM should do four things: extract evidence with exact span citations from documents placed in its context; classify events such as guidance changes, insider activity and litigation; write prose constrained to numbers computed in Python; and never set the rating, the price target or any probability. Two benchmark results argue for retrieving whole filing sections and checking every number against XBRL. FinanceBench accuracy jumped from 19% to 79% when the right document was in context ([FinanceBench](https://arxiv.org/abs/2311.11944)), and the best model still tops out at 68% on Vals' strict expert tasks ([Vals.ai](https://www.vals.ai/benchmarks/fabv2-1)).

Frontier models skew optimistic and overconfident. The skeptic pass should therefore use a different model family from the writer. It should look specifically for extrapolation from recent price moves and for prose that is more bullish than the code-built rating ([Chen, Green, Gulen & Zhou](https://www.aeaweb.org/conference/2026/program/paper/zNrQ4Yn6); [OptimismBench](https://arxiv.org/abs/2607.26981)). Each report should fix its as-of date, archive the exact documents retrieved, and log the model version and training cutoff. Memorized facts from after the as-of date can leak into the narrative even when every number is computed in code ([Lopez-Lira, Tang & Zhu](https://arxiv.org/abs/2504.14765)).

Data licensing is a hard constraint. The LM dictionary needs a commercial license ([SRAF](https://sraf.nd.edu/loughranmcdonald-master-dictionary/)), and news and earnings-call transcripts come from licensed feeds. Text from 10-K, 10-Q and 8-K filings is free.

### The track record: pre-registered, free of survivorship bias and labelled descriptive

The table summarizes how each published output should be graded.

| Published output | Primary metric | Naive baseline to beat | Key rule |
|---|---|---|---|
| Buy/Hold/Sell | Hit rate and mean excess return versus the sector, by rating | Random ratings with the same Buy/Hold/Sell mix; always Hold | Define how Holds are scored before launch |
| P(beat sector) | Brier score, reliability diagram, Brier skill score | Realized base rate | Cluster standard errors by forecast date |
| Bear/base/bull range | Coverage, tail balance, interval score, pinball (quantile) loss | Range from trailing or implied volatility | Declare the quantiles; score in return terms |
| Factor-score backtest | Deflated or haircut Sharpe, probability of overfitting | Expected best Sharpe of N no-skill trials | Log every variant; never mix with live results |

Sources: [DSR](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf); [Harvey & Liu](https://people.duke.edu/~charvey/Research/Published_Papers/P120_Backtesting.PDF); [Brier score](https://en.wikipedia.org/wiki/Brier_score); [scoringutils](https://www.rdocumentation.org/packages/scoringutils/versions/2.1.1/topics/interval_score)

Before the first report, the scoring rulebook should be hashed into the append-only log. It should fix:

- the definition of each metric and the benchmark indices;
- the start price and the forecast horizons;
- what the bear, base and bull quantiles mean;
- how corporate actions and delistings are handled;
- the date of the first formal skill test.

Later rule changes should apply only to future predictions. The log's running hash should be published to a third-party timestamp so that deletions and back-dating can be detected. The coverage universe should also be committed in advance, because a hash cannot stop a publisher from quietly dropping hard names. Every prediction must be graded to its horizon, including companies that are acquired, delisted or removed from the index, using index membership and sector classification as they stood at the time.

Results should carry clustered confidence intervals and an estimate of how many independent observations they represent. Until the pre-registered evaluation date, they should be labelled "descriptive, not statistically conclusive." Marketing should describe the system accurately (code builds the rating, an LLM writes the cited narrative) and avoid "AI-driven forecast" language, which matches the facts in the SEC's AI-washing cases ([MoFo](https://www.mofo.com/pdf/resources/insights/240320-sec-targets-ai-washing-with-two-new-settled-cases)).

## Conclusion

The evidence suggests that AI's comparative advantage in investing is reading, not predicting. That suits an app that publishes research rather than trading on it. The tasks with strong evidence (extracting facts from filings, classifying complex events, finding what changed in a 10-K, forecasting volatility) are the ones that make a report useful and credible. The tasks with weak evidence (12-month directional calls on large caps, calibrated probabilities, arithmetic across several statements) are the ones the app should keep in auditable code. The split also solves an evaluation problem that the literature makes vivid. Because LLMs memorize history, nothing they produce about S&P 500 names can be honestly backtested, whereas a code-built rating can be tested on point-in-time data. Keeping the LLM out of the graded outputs keeps the track record clean.

The second takeaway concerns what the scorecard can and cannot prove. At realistic information ratios, a few years of forward record can disprove bold claims but cannot confirm modest skill. The app's credibility will therefore come from the rigor and candor of its grading rather than from its numbers. That is also a commercial differentiator: the best-known AI fund benchmarks itself against its own index, investors do not reward an AI label without returns, and this research found almost no retail product that publishes a pre-registered, Brier-scored record free of survivorship bias. Three large questions remain open: whether Lazy Prices still works after 2014, whether ML adds anything net of costs within the S&P 500 specifically, and how the publisher's exclusion applies. The app's own log and a legal review will have to answer them.
