# Cross-Sectional Stock Return Predictors (Factor Models and Anomalies): Replication, Publication Decay, Large Caps, and Trading Costs

Scope note: these notes cover research current to Nov 2026. "PR" = peer-reviewed journal; "WP" = working paper; "Vendor" = asset-manager or practitioner publication (AQR, Research Affiliates, Robeco, etc., which have a commercial interest in factor products); "Secondary" = third-party summary (Alpha Architect, CXO Advisory, ETF.com, etc.) that I could not check against the original tables. Unless stated otherwise, academic long-short returns are **gross of trading costs** (paper portfolios). Where I pulled numbers directly from a paper's text in this session, that is marked "verified from paper text."

---

## Q1. Core factor models (CAPM, FF3, FF5, Carhart, q-factor, Stambaugh-Yuan): which characteristics predict returns?

### Takeaway
Every model since CAPM adds factors built from the same few characteristics: **value (B/M)**, **size**, **momentum**, **profitability/ROE** and **investment/asset growth** (low investment is good). The model "horse races" (FF5 vs q/q5 vs Stambaugh-Yuan) disagree on which construction prices anomalies best, but they agree on the core ideas. Profitability and investment are now standard. Value's standalone role has shrunk (it is largely spanned by profitability and investment in FF5 and q-models). No model includes a factor that rewards high historical growth.

### Cited Findings
- **FF3 (PR, JFE 1993):** The original HML (value) factor averaged about 0.4% per month from July 1963 to Dec 1991 (gross, US, value-weighted 2x3 sorts). — [Alpha Architect summary of Fama-French value-premium work](https://alphaarchitect.com/is-the-value-premium-smaller-than-we-thought/) (Secondary)
- **q-factor vs FF5 (WP/PR, Hou-Mo-Xue-Zhang "Which Factors?"):** In spanning tests, the q-factor model (market, size, investment, ROE) "largely subsumes" the Fama-French 5- and 6-factor models, and the q5 model captures the Stambaugh-Yuan model. Replicated Stambaugh-Yuan factors correlate 0.80 and 0.84 with the q-factors. FF5's RMW uses annual sorts on operating profitability. The q-model's ROE factor uses monthly sorts on the latest quarterly ROE. — [IDEAS/RePEc listing](https://ideas.repec.org/p/ecl/ohidic/2018-03.html); [NBER w20682 summary](https://causalclaims.trfetzer.com/paper/w20682.html); [IBKR Quant summary](https://www.interactivebrokers.com/campus/ibkr-quant-news/building-a-better-q-factor-asset-pricing-model/) (Secondary)
- **q5 model (adds an expected-growth factor):** Across 150 anomalies, the average absolute high-minus-low alpha falls to 0.19% per month under q5, from 0.28% per month under the q-factor model. — [IBKR Quant summary](https://www.interactivebrokers.com/campus/ibkr-quant-news/building-a-better-q-factor-asset-pricing-model/) (Secondary)
- **Stambaugh-Yuan mispricing factors (PR, RFS 2017; MGMT and PERF clusters built from 11 anomalies):** Their own paper finds their 4-factor model (market, size, MGMT, PERF) prices anomalies better than FF5 and q. On their 11 anomalies, FF5 leaves all but one with significant alphas, and the q-model leaves seven. The ranking is similar on HXZ's 73-anomaly set. — [Swedroe/ETF.com summary](https://www.etf.com/node/94138.md) (Secondary); [Stambaugh-Yuan WP (Wharton)](https://rodneywhitecenter.wharton.upenn.edu/wp-content/uploads/2014/04/05.15Stambaugh1.pdf)
- The FF5-vs-q-vs-SY disagreement turns on factor construction and on which test is used. The literature has not settled it. — [Swedroe "Battle of new factor models"](https://www.etf.com/node/94258.md) (Secondary)
- **Carhart (1997) / momentum:** Momentum (UMD/WML) is the "fourth factor." Over 1927:01–2013:03, a winner-minus-loser decile portfolio had a Sharpe ratio of 0.71 (market: 0.40), a beta of −0.58, and an unconditional CAPM alpha of 22.3% per year (t = 8.5), gross. — [Daniel & Moskowitz, NBER w20439 (PR version JFE 2016)](https://www.nber.org/papers/w20439) (verified from paper text)
- **Distress/leverage (Campbell, Hilscher & Szilagyi, PR, JF 2008, 63(6):2899–2939):** The abstract says the distress-return patterns are "more pronounced for stocks with possible informational or arbitrage-related frictions" and are "inconsistent with the conjecture that the value and size effects are compensation for the risk of financial distress." — [EconBiz record](https://econbiz.de/Record/in-search-of-distress-risk-campbell-john/10010295772)
- **Harvey, Liu & Zhu (PR, RFS 2016):** They catalog **316 factors** from 313 published papers plus working papers (US, mid-1960s–2012). They recommend a **t > 3.0** hurdle for new factors and conclude that "most claimed research findings in financial economics are likely false." — [NBER w20592](https://nber.org/papers/w20592); [SSRN](https://papers.ssrn.com/abstract=2513152)

### Inferences
- For the app, the factor models give the strongest support to profitability (RMW/ROE), investment/asset growth (inverse), momentum, and value. Value is weaker as a standalone factor once profitability and investment are controlled for.
- A "low leverage" factor has no slot in any mainstream model. In the q/FF5 world, balance-sheet safety mostly enters through profitability and through quality composites (QMJ "safety"), not as its own priced factor.
- Model choice matters for grading. If the app later reports alphas, FF5 and q5 will give different answers. Raw sector-relative excess return, the app's planned grading, avoids having to pick a model.

### Gaps
- I did not re-fetch the original FF3 (1993), Carhart (1997) or FF5 (2015) papers in this session. From memory, FF (2015, JFE) report that HML becomes redundant once RMW and CMA are included (1963–2013 US). This should be verified against [Fama & French 2015, JFE](https://doi.org/10.1016/j.jfineco.2014.10.010) before quoting.
- I found no sourced claim that book leverage on its own carries a positive premium for low-leverage firms. The distress literature points the other way: high-distress stocks earn low returns. That supports avoiding distress, but I did not retrieve exact return magnitudes (e.g., Campbell et al.'s 1981–2003 sample) in this session.

---

## Q2. Evidence for each of the app's six factors: key papers, historical premium, post-2000 and post-2010 performance

### Takeaway
Ranked by evidence for US large caps over 1–12-month horizons: **(1) profitability/quality is strongest and most consistent**, including in large caps and in the 2010s. **(2) Momentum is strong historically and works in large caps**, but has been weak since 2007 and is prone to crashes. **(3) Value has a long-run premium but is very weak among big stocks since 1991**, with a −58% drawdown from 2007 to 2020. **(4) Earnings quality/accruals was strong pre-2000 but decayed after publication.** **(5) Balance-sheet strength has little standalone support**; it works mainly as a component of quality or F-score or as distress avoidance. **(6) There is no "growth" premium**: high historical asset or sales growth predicts *lower* returns. "Good growth" survives only as profitability, or as forecast growth inside the q5 model.

### Cited Findings

**Post-2000 / post-2010 factor performance (US, Fama-French library factors, gross, long-short)**
- **Through May 2026**, per an aggregator built on the Ken French data library (geometric CAGRs). This is a less-established site; verify against the French library before publishing.
  - **HML (value):** +5.4%/yr Jul 1963–Dec 2006; **−2.0%/yr Jan 2007–May 2026**. By decade: 2000s +7.4%, 2010s −2.6%, 2020s (to May 2026) +0.8%.
  - **Momentum:** +9.2%/yr 1963–2006; **+0.7%/yr 2007–May 2026**. By decade: 2000s −2.0%, 2010s +2.6%, 2020s +3.9%.
  - **RMW (profitability):** **+2.7%/yr in both periods**. By decade: 2000s +7.6%, 2010s +1.2%, 2020s +2.0%. Peak Oct 2023, then −22.5% from that peak by May 2026.
  - **CMA (investment):** +4.0%/yr pre-2007; **−0.3%/yr after**. By decade: 2000s +6.5%, 2010s +0.1%, 2020s −0.5%.
  - **SMB (size):** +2.2%/yr pre-2007; −1.0%/yr after.
  - **Drawdowns:** HML peaked Dec 2006, had a worst drawdown of −57.8% (trough Sep 2020), and was still −32.8% below its peak in May 2026. Momentum's index was −25.8% below its Nov 2008 peak.
  - Source: [finobservatory.org/factors](https://finobservatory.org/factors) (Secondary aggregator of French data; it notes these are paper returns with no costs)
- **Blitz (Robeco), "Factor Performance 2010–2019: A Lost Decade?" (Vendor; later in Journal of Index Investing 2020):** The four non-market Fama-French factors averaged **−0.28%/yr in 2010–2019 vs +3.95%/yr in 1963–2009**. Only profitability was clearly positive, at about half its pre-2010 level. Momentum earned +3.45%/yr and low-risk factors about 6–10%/yr. Blitz calls the decade "remarkably similar to 1990–1999." — [Robeco PDF](https://robeco.com/files/docm/docu-robeco-factor-performance-2010-2019-a-lost-decade.pdf); [CXO summary](https://www.cxoadvisory.com/strategic-allocation/equity-factor-performance-during-the-2010s/)

**(a) Value / valuation**
- **Fama & French, "The Value Premium" (PR, Review of Asset Pricing Studies 2021; WP Jan 2020).** They measure value-portfolio returns in excess of the market (not HML).
  - Big value minus market: **0.36%/mo (1963–1991) → 0.05%/mo (1991–2019)**.
  - Small value minus market: 0.58% → 0.33%/mo.
  - Overall: 0.42% → 0.11%/mo; full sample 0.26%/mo.
  - High volatility means the second-period confidence interval includes negative values for the first time. The authors do not conclude that the premium is dead.
  - Sources: [Chicago Booth Review](https://www.chicagobooth.edu/review/value-stock-premium-shrinking); [CXO summary](https://www.cxoadvisory.com/?p=33657); [Benefits Canada](https://benefitscanada.com/?p=62869) (Secondary summaries)
- **Israel & Moskowitz (PR, JFE 2013):** Over 86 years of US data, the value premium **weakens with firm size and is weak among the largest stocks**. The long side supplies about 60% of the value premium. They find little evidence that changes in trading costs or institutional ownership altered the premia over time. — [AQR page](https://www.aqr.com/Insights/Research/Journal-Article/The-Role-of-Shorting-Firm-Size-and-Time-on-Market-Anomalies); [ETF.com summary](https://www.etf.com/sections/index-investor-corner/swedroe-look-ways-3-factors-work)
- **Arnott, Harvey, Kalesnik & Linnainmaa, "Reports of Value's Death May Be Greatly Exaggerated" (PR, FAJ 77:44–67, 2021; Research Affiliates authors):** They attribute value's underperformance partly to B/P failing to capture growing intangible assets. Since about 2015, capitalized intangibles equal roughly half of tangible book for value stocks, and exceed book value for growth stocks. — [SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3488748); [FAJ](https://www.tandfonline.com/doi/full/10.1080/0015198X.2020.1842704); [Research Affiliates](https://www.researchaffiliates.com/publications/journal-papers/reports-of-values-death-may-be-greatly-exaggerated)
- **Blitz & Hanauer, "Resurrecting the Value Premium" (WP/Vendor, Oct 2020):** They conclude "a solid value premium is still clearly present" in the cross-section when value is better constructed. — [Capital Spectator summary](https://www.capitalspectator.com/?p=15060) (Secondary)

**(b) Growth**
- **Asset growth (Cooper, Gulen & Schill, PR, JF 2008):** Low-asset-growth firms beat high-asset-growth firms by **19.5%/yr equal-weighted** (+9.1% vs −10.4%) and **8.4%/yr value-weighted** (US, gross). High growth predicts **lower** returns. — [CXO summary](https://cxoadvisory.com/fundamental-valuation/asset-growth-cross-section-stock-returns) (Secondary)
- **But in big stocks:** "There is no asset growth anomaly in the average returns on the big stocks that account for more than 90% of total market cap" (US, Jun 1963–Dec 2005). — [Fama & French, "Dissecting Anomalies," JF 2008 (PR)](https://www.johnhcochrane.com/s/fama_french_dissecting_anomalies_JF.pdf); [CFA Digest summary](https://rpc.cfainstitute.org/research/cfa-digest/2009/02/dissecting-anomalies-digest-summary)
- **Robustness challenge:** A later paper argues the asset-growth premium largely reflects omitted CRSP delisting returns and external financing. — [Alpha Architect summary](https://alphaarchitect.com/2015/03/daily-academic-alpha-sham-strategy-or-accounting-alpha/) (Secondary)
- **Novy-Marx's "good growth":** The paper's title frames gross profitability as "The Other Side of Value: Good Growth." Profitable firms earn higher returns despite higher valuations. — [NBER w15940](https://nber.org/papers/w15940)
- **q5 expected-growth factor (Hou, Mo, Xue, Zhang):** Its factor is *forecast* investment growth, not historical sales or EPS growth. It lowers average anomaly alphas from 0.28% to 0.19%/mo across 150 anomalies. — [IBKR summary](https://www.interactivebrokers.com/campus/ibkr-quant-news/building-a-better-q-factor-asset-pricing-model/) (Secondary)

**(c) Profitability / quality**
- **Novy-Marx, "The Other Side of Value: The Gross Profitability Premium" (PR, JFE 2013, 108(1):1–28):** Gross profits-to-assets has "roughly the same power as book-to-market" for predicting the cross-section. The most profitable firms beat the least profitable by **0.31%/mo (t = 2.49), 1962–2010**, with an FF3 alpha of **0.52%/mo (t = 4.49)**, gross. — [NBER WP abstract](https://www.nber.org/papers/w15940); [Alpha Architect summary for the figures](https://alphaarchitect.com/?p=59260) (Secondary; I did not verify whether the figures are value-weighted)
- **Asness, Frazzini & Pedersen, "Quality Minus Junk" (PR, Review of Accounting Studies 2019, 24(1):34–112):** QMJ is long profitable, growing, safe, high-payout stocks and short "junk." One summary of a 2017 WP version reports a gross annualized Sharpe ratio of about 0.41 for long-sample US QMJ. A quality+value blend reached about 0.7 (US). — [Published version (CBS repository, open access)](https://research-api.cbs.dk/ws/portalfiles/portal/60211462/lasse_heje_pedersen_et_al_quality_minus_junk_publishersversion.pdf); [CXO summary](https://www.cxoadvisory.com/?p=23772) (Secondary; Sharpe figures unverified against published tables)
- RMW was the only FF factor clearly positive in 2010–2019 (Blitz, above). It compounded at a steady +2.7%/yr both before and after 2007 (finobservatory, above).

**(d) Balance-sheet strength / low leverage**
- **Piotroski (PR, Journal of Accounting Research 2000).** The F-score has 9 binary signals, including leverage, liquidity and equity issuance, applied within high-B/M stocks.
  - Selecting financially strong high-B/M firms raises the mean return by **at least 7.5%/yr**.
  - Long high-F / short low-F earned about **23%/yr over 1976–1996** (US, gross; heavily small-cap).
  - A replication found that aligning portfolio formation dates cut the gross annual hedge return from **8.9% to 6.0%**.
  - Sources: [Wikipedia (secondary)](https://en.wikipedia.org/wiki/Joseph_Piotroski); [Ivey-hosted copy of Piotroski (2000)](https://test2.ivey.uwo.ca/media/3775523/value_investing_the_use_of_historical_financial_statement_information.pdf); [Creighton replication record](https://researchworks.creighton.edu/esploro/outputs/journalArticle/Value-Stocks-and-Accounting-Screens-Has/991006117468602656)
- **Distress:** see Campbell-Hilscher-Szilagyi (Q1). Distress-related return patterns are concentrated where arbitrage frictions are high, i.e., less so in S&P 500 names. — [EconBiz record](https://econbiz.de/Record/in-search-of-distress-risk-campbell-john/10010295772)

**(e) Earnings quality / accruals**
- **Sloan (PR, The Accounting Review 1996):** This is the original accruals anomaly. Green, Hand & Soliman (PR, Management Science 2011, 57(5):797–816) find that hedge returns to Sloan's strategy "appear to have decayed, to the point that returns are on average, no longer reliably positive" in the US. They attribute this partly to growth in hedge-fund capital trading the strategy. — [IDEAS listing](https://ideas.repec.org/a/inm/ormnsc/v57y2011i5p797-816.html); [Penn State record](https://pure.psu.edu/en/publications/going-going-gone-the-apparent-demise-of-the-accruals-anomaly/)
- **Contrary view:** A Columbia study finds the accruals anomaly "still persists and its magnitude has not declined." — [Columbia Business School](https://business.columbia.edu/faculty/research/persistence-accruals-anomaly)
- **Size:** Through 2005, accruals (along with momentum and net stock issues) produced strong abnormal returns in the extremes even among **big stocks** (US 1963–2005). — [Fama & French 2008](https://www.johnhcochrane.com/s/fama_french_dissecting_anomalies_JF.pdf); [CFA Digest](https://rpc.cfainstitute.org/research/cfa-digest/2009/02/dissecting-anomalies-digest-summary)

**(f) Price momentum**
- **Jegadeesh & Titman (PR, JF 1993, 48(1):65–91):** Past 3–12-month winners outperform losers by roughly **1% per month** over 3–12-month holding periods (US 1965–1989, gross). — [IDEAS](https://ideas.repec.org/a/bla/jfinan/v48y1993i1p65-91.html); [Alpha Architect, 30 years out-of-sample](https://alphaarchitect.com/momentum-factor-investing-30-years-of-out-of-sample-data/) (Secondary for the ~1% figure)
- **Size:** Momentum shows **no reliable relation with firm size**. It is present across size groups over 86 years. The long side supplies about half the momentum premium. — [Israel & Moskowitz (AQR page)](https://www.aqr.com/Insights/Research/Journal-Article/The-Role-of-Shorting-Firm-Size-and-Time-on-Market-Anomalies). Fama-French (2008) find momentum strong in big stocks and only half as strong in microcaps. — [CFA Digest](https://rpc.cfainstitute.org/research/cfa-digest/2009/02/dissecting-anomalies-digest-summary)
- **Recent:** The iShares MSCI USA Momentum ETF (long-only, *not* the UMD long-short factor) was up 15.5% year-to-date in July 2025, about double the S&P 500. It was hit hard in the April 2025 tariff sell-off and rebounded fastest. — [Capital Spectator (Secondary)](https://capitalspectator.substack.com/p/momentum-is-still-2025s-top-performer)

### Inferences
- **Supported for the app:** profitability/quality (strongest and most consistent; works in large caps and held up in the 2010s), momentum (works in large caps; needs crash management), and value (long-run support, but in large caps the 1991–2019 premium was about 0.05%/mo vs market). Value is best used in combination with profitability (see Q6).
- **Weak / reframe:**
  - "Growth" as historical revenue or EPS growth has no premium and is often negative (asset growth, investment). If kept, it should be reframed as *profitable* or *quality* growth, or as earnings revisions/surprise (not covered here). Otherwise the score should be inverted on asset/investment growth (low investment = good), noting that in big stocks even that effect is weak.
  - Balance-sheet strength has little standalone evidence. Use it as a safety/quality component or a distress screen.
  - Earnings quality/accruals has published-and-decayed evidence. Keep it at low weight, or fold it into a cash-based profitability measure.
- The post-2007 record (HML −2.0%/yr, CMA −0.3%/yr, momentum +0.7%/yr, RMW +2.7%/yr, all gross long-short and all-cap) suggests the realistic expected spread for a sector-relative large-cap composite is small: tens of basis points per month at most, before costs. The app's grading should expect a low hit rate and noisy 12-month outcomes.

### Gaps
- I could not verify Sloan's (1996) original hedge-return magnitude (commonly quoted as about 10% per year) in this session.
- Lakonishok, Shleifer & Vishny (1994) on "glamour" (high sales growth) underperformance was not retrieved. It is the standard citation for "no growth premium" and should be added with figures.
- I have no verified post-2010 large-cap-only performance for accruals, F-score or leverage signals. Some claims that F-score returns reversed after the original sample appear in blog sources only (e.g., [Seeking Alpha](https://seekingalpha.com/article/4407684-why-piotroskis-f-score-no-longer-works)); unverified.
- Exact calendar-year 2020–2025 UMD/HML/RMW returns were not obtained. The finobservatory figures are decade CAGRs and should be checked against the [Ken French library](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html).
- QMJ's published (2019) Sharpe ratios and its large-cap-only results were not verified.

---

## Q3. Replication and decay: Harvey-Liu-Zhu, McLean-Pontiff, Hou-Xue-Zhang, Jensen-Kelly-Pedersen, Chen-Zimmermann

### Takeaway
Whether an anomaly "replicates" depends on the method. **In-sample, published anomalies mostly replicate**: 98% of clear predictors per Chen-Zimmermann, and about 82–85% per Jensen-Kelly-Pedersen. **Once microcaps are removed and returns are value-weighted, about 65% fail** (Hou-Xue-Zhang). **Out of sample, returns roughly halve**: −58% after publication (McLean-Pontiff), and data-mined signals decay just as much (Chen-Lopez-Lira-Zimmermann). The practical rule is to haircut any published premium by about 50%, and by more for large caps and price-based signals.

### Cited Findings
- **McLean & Pontiff, "Does Academic Research Destroy Stock Return Predictability?" (PR, JF 2016)** — verified from paper text:
  - 97 predictors from 79 studies.
  - Average monthly long-short return: **0.582% in-sample → 0.402% out-of-sample but pre-publication → 0.264% post-publication**.
  - That is **26% lower out-of-sample and 58% lower post-publication**. The 26% is an upper bound on data mining, which implies about a **32% publication (arbitrage) effect**.
  - Returns are equal-weighted unless the original study used value-weighting, and are gross.
  - Decay is larger for predictors with higher in-sample returns or t-stats, and for predictors built **only from price and trading data**.
  - Post-publication returns are **lower** for portfolios concentrated in **liquid, low-idiosyncratic-risk stocks**, i.e., large caps.
  - After publication, a predictor's correlation with other published predictors rises.
  - Sources: [Gwern-hosted PDF](https://Www.Gwern.net/doc/economics/2016-mclean.pdf); [Counterpoint-hosted PDF](https://counterpointfunds.com/wp-content/uploads/2017/07/PredictabilityMcleanPontiff.pdf)
- **Hou, Xue & Zhang, "Replicating Anomalies" (PR, RFS 2020, 33(5):2019–2133)** (447 anomalies in the 2017 NBER WP):
  - **65% of 452 anomalies fail |t| ≥ 1.96** when microcaps are controlled with NYSE breakpoints and value-weighted returns.
  - **96% of the "trading frictions" category fail.**
  - At a multiple-testing hurdle of t ≥ 2.78, **82% fail**.
  - Replicated anomalies have much smaller magnitudes than originally reported.
  - Microcaps are about 3% of market cap but about 60% of stocks.
  - Using equal-weighting and NYSE-Amex-NASDAQ breakpoints, the failure rate drops to about 43%.
  - Value, momentum, investment and profitability survive best.
  - Sources: [IDEAS](https://ideas.repec.org/a/oup/rfinst/v33y2020i5p2019-2133..html); [Alpha Architect](https://alphaarchitect.com/replicating-anomalies/); [CXO](https://www.cxoadvisory.com/big-ideas/most-stock-anomalies-fake-news/) (Secondary for the EW figure)
- **Critique of HXZ:** Using CAPM alphas instead of raw returns gives much higher replication rates, and the microcap concentration of anomalies was already known. — [Systematically Biased Substack](https://systematicallybiased.substack.com/p/pockets-of-replicability-post5) (Secondary/opinion)
- **Jensen, Kelly & Pedersen, "Is There a Replication Crisis in Finance?" (PR, JF 2023; NBER w28432, 2021):**
  - A Bayesian framework applied to **153 factors in 93 countries**, grouped into **13 themes**.
  - Most factors replicate, survive joint modeling, and hold up out of sample. The replication rate is about **85% (84.9%)**, measured as a significant CAPM alpha. A "non-trivial (but not disastrous) minority" fails.
  - Data and code are public at jkpfactors.com.
  - Sources: [NBER PDF](https://nber.org/system/files/working_papers/w28432/w28432.pdf); [CXO summary](https://www.cxoadvisory.com/big-ideas/re-examining-equity-factor-research-replicability/); [Alpha Architect](https://alphaarchitect.com/is-there-a-replication-crisis-in-finance/)
- **Chen & Zimmermann, "Open Source Cross-Sectional Asset Pricing" (PR, Critical Finance Review 2022, 11(2):207–264; Fed FEDS 2021-037):**
  - 319 characteristics. Of **161 clearly significant in the original papers, 98% of reproduced long-short portfolios have t > 1.96**.
  - 44 with mixed original evidence have reproduced t-stats averaging about 2.
  - Regressing reproduced on original t-stats gives a slope of **0.90 and R² of 83%**.
  - Data (long-short returns for 205+ predictors) are public (OpenSourceAP/CrossSection GitHub).
  - Sources: [Federal Reserve](https://www.federalreserve.gov/econres/feds/open-source-cross-sectional-asset-pricing.htm); [NOW Publishers](https://nowpublishers.com/article/Details/CFR-0112)
- **Chen, Lopez-Lira & Zimmermann, "Does Peer-Reviewed Research Help Predict Stock Returns?" (WP, arXiv 2212.10317; AFA/AEA 2024):**
  - Data-mining **29,000 accounting ratios** for t > 2 gives predictability similar to peer-reviewed predictors.
  - For both, **about 50% of predictability remains post-sample** (51–53% depending on version).
  - Predictors with peer-reviewed risk-based explanations decay *more*, not less.
  - Peer review attributes only about 18–20% of predictors to risk.
  - Source: [arXiv](https://arxiv.org/html/2212.10317v5)
- **Harvey, Liu & Zhu (PR, RFS 2016):** 316 factors; recommend t > 3.0. — [NBER](https://nber.org/papers/w20592)
- **Counterpoint:** A 2022 arXiv paper argues "most claimed statistical findings in cross-sectional return predictability are likely true." — [arXiv 2206.15365](https://arxiv.org/pdf/2206.15365) (WP; contents not reviewed in detail)

### Inferences
- The papers do not conflict. They answer different questions. Chen-Zimmermann and JKP ask "is the published in-sample number reproducible?" (yes, mostly). HXZ asks "does it survive without microcaps?" (mostly no). McLean-Pontiff and Chen-Lopez-Lira-Zimmermann ask "does it persist after publication?" (about half does).
- For an S&P 500 app, the relevant number combines all three. Start from the large-cap, value-weighted replication (HXZ), then apply roughly 50% post-publication decay. McLean-Pontiff show decay is worse in liquid stocks.
- Price-only signals (momentum, reversal) decayed more post-publication than accounting signals (McLean-Pontiff). Yet momentum is one of HXZ's survivors. That is a reason to keep momentum but not overweight it.

### Gaps
- I did not retrieve JKP's US-only or large-cap-only replication rate, or their post-publication decay estimate. Their factor-level data (jkpfactors.com) would let the app team compute S&P 500-universe premia directly.
- I did not verify HXZ's category-level survival rates (e.g., exact % of value/profitability anomalies that survive) from the paper itself.

---

## Q4. How much weaker are anomalies among large caps / S&P 500 stocks, and after trading costs?

### Takeaway
Much weaker. Microcaps are about 60% of stocks but about 3% of market cap, and they drive many anomalies. In big stocks, the value premium fell to about 0.05%/mo vs market (1991–2019), and asset growth disappears. **Momentum, profitability and (through 2005) accruals/issuance hold up in big stocks.** After realistic trading costs and post-publication decay, the **average anomaly earns about 4 bps per month** (Chen-Velikov). **Low-turnover signals survive costs; high-turnover signals mostly don't** (Novy-Marx-Velikov).

### Cited Findings
- **Fama & French, "Dissecting Anomalies" (PR, JF 2008), US Jun 1963–Dec 2005:** Microcaps are about 60% of stocks but about 3% of market value, and they dominate equal-weighted sorts. Net stock issues, accruals and momentum are strong in microcaps, small *and* big stocks. **Asset growth has no anomaly among big stocks.** Momentum is half as strong in microcaps. — [Paper PDF](https://www.johnhcochrane.com/s/fama_french_dissecting_anomalies_JF.pdf); [CFA Digest](https://rpc.cfainstitute.org/research/cfa-digest/2009/02/dissecting-anomalies-digest-summary)
- **Hou, Xue & Zhang (PR, RFS 2020):** 65% of 452 anomalies fail once microcaps are mitigated and returns value-weighted; 96% of trading-frictions anomalies fail. — [IDEAS](https://ideas.repec.org/a/oup/rfinst/v33y2020i5p2019-2133..html); [Alpha Architect](https://alphaarchitect.com/replicating-anomalies/)
- **Israel & Moskowitz (PR, JFE 2013):** The value premium is weak among the largest stocks. Momentum has no reliable relation to size. — [AQR](https://www.aqr.com/Insights/Research/Journal-Article/The-Role-of-Shorting-Firm-Size-and-Time-on-Market-Anomalies)
- **Fama & French (2021):** Big value minus market was 0.05%/mo in 1991–2019 vs 0.36%/mo in 1963–1991. — [Chicago Booth Review](https://www.chicagobooth.edu/review/value-stock-premium-shrinking)
- **McLean & Pontiff (PR, JF 2016):** Post-publication returns are lower for predictors concentrated in liquid, low-idiosyncratic-risk stocks. — [PDF](https://Www.Gwern.net/doc/economics/2016-mclean.pdf) (verified)
- **Novy-Marx & Velikov, "A Taxonomy of Anomalies and Their Trading Costs" (PR, RFS 2016, 29(1):104–147; NBER w20721):**
  - Transaction costs reduce every strategy's profitability and significance.
  - Most anomalies with **one-sided monthly turnover below 50%** keep significant net spreads, at least when designed to mitigate costs. Few higher-turnover strategies do.
  - A **buy/hold spread** (stricter rules to enter a position than to keep it) is the single most effective simple cost mitigation.
  - **Size, value and profitability strategies have the greatest capacity.**
  - One secondary summary reports average costs over 1963–2013 of about 5.7 bp/mo for size and 5.5 bp/mo for value, vs about 48.4 bp/mo for momentum. These figures are unverified against the paper.
  - Sources: [NBER](https://www.nber.org/papers/w20721); [Author PDF](https://mysimon.rochester.edu/novy-marx/research/ToAatTC.pdf); [Alpha Architect](https://alphaarchitect.com/trading-costs-destroy-factor-investing/) (Secondary for bp figures)
- **Chen & Velikov, "Zeroing in on the Expected Returns of Anomalies" (PR, JFQA 2023; Fed WP 2020):**
  - 204 anomalies, adjusted for effective bid-ask spreads, post-publication decay and the post-2000s trading era.
  - The **average anomaly's expected return is about 4 bps/month net** (8 bps in the 2020 WP).
  - The strongest anomalies net at most about 10 bps after controlling for data mining. **Combining anomalies nets about 20 bps/month.**
  - WP path for the average anomaly: about 66 bps/mo gross → 38 bps after costs → 13 bps after post-publication effects.
  - These estimates exclude price impact, so they are optimistic.
  - Sources: [Federal Reserve](https://www.federalreserve.gov/econres/feds/zeroing-in-on-the-expected-returns-of-anomalies.htm); [Cambridge/JFQA](https://www.cambridge.org/core/journals/journal-of-financial-and-quantitative-analysis/article/zeroing-in-on-the-expected-returns-of-anomalies/945133D5A3ECEEAF466AEE91551FD225); [CXO](https://cxoadvisory.com/?p=30582)

### Inferences
- In the S&P 500 universe, trading costs per trade are low (tight spreads). The bigger issue is that **gross premia are themselves much smaller** in big stocks, and decay faster there.
- For a ratings product (not a fund), trading costs matter less directly. But they matter for interpreting the evidence: premia that only exist before costs, or in microcaps, should not drive Buy/Sell calls on S&P 500 names.
- Monthly-turnover signals (short-term reversal, monthly-updated momentum) are the most cost-fragile. Quarterly or annual fundamental signals (profitability, value) are the most robust. A rating-change buffer (buy/hold spread), e.g. requiring a larger score move to change a rating than to keep it, follows Novy-Marx-Velikov's best mitigation and also reduces rating churn.
- Combining signals roughly multiplies the net expected return (about 4 → about 20 bps/mo in Chen-Velikov). This supports a composite score over any single factor.

### Gaps
- I found no study that reports factor premia specifically within S&P 500 constituents (as opposed to "big" NYSE-breakpoint stocks) for the post-2010 period. The app team could compute this from Chen-Zimmermann or JKP data restricted to the largest 500 stocks.
- The exact Novy-Marx-Velikov net spreads per anomaly were not retrieved.

---

## Q5. What happened to value (2007–2020 and after) and to momentum (crashes)?

### Takeaway
**Value:** HML peaked in Dec 2006, fell about 58% to Sep 2020, and as of May 2026 was still about 33% below its peak, despite a 2021–2022 rebound. Explanations include intangibles missing from book value and widening valuation spreads. Big-stock value has been close to zero since 1991. **Momentum:** crashes are rare but severe, and they occur in "panic" rebounds after market falls (1932, 2009). Volatility-scaled ("dynamic") momentum roughly doubles the Sharpe ratio. Momentum has been modest since 2007 (about +0.7%/yr gross long-short).

### Cited Findings
- **HML drawdown:** −57.8% peak-to-trough (Dec 2006 → Sep 2020); still −32.8% below the Dec 2006 peak as of May 2026. HML CAGR −2.0%/yr Jan 2007–May 2026. — [finobservatory (French-library aggregator)](https://finobservatory.org/factors) (Secondary)
- **Fama-French "lost decade":** The non-market FF factors averaged −0.28%/yr in 2010–2019 vs +3.95% in 1963–2009, mostly due to value. — [Robeco/Blitz](https://robeco.com/files/docm/docu-robeco-factor-performance-2010-2019-a-lost-decade.pdf) (Vendor)
- **Big value shrinkage:** 0.36 → 0.05%/mo (1963–91 vs 1991–2019). — [Chicago Booth Review on Fama-French 2021](https://www.chicagobooth.edu/review/value-stock-premium-shrinking)
- **Intangibles explanation (Arnott et al., FAJ 2021):** B/P misses intangibles. For growth stocks, capitalized intangibles exceed book value. — [SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3488748)
- **Value spreads / "less efficient market" (Asness, AQR; Vendor, published in JPM; won a 2025 Bernstein Fabozzi/Jacobs Levy outstanding-article award):**
  - Argues markets have become less efficient in relative stock pricing over 30+ years. Value spreads (expensive-to-cheap valuation ratios) have been wider than ever and have stayed wide longer.
  - Asness blames social media, indexing and low rates as candidates, but reportedly rejects low rates.
  - Sources: [AQR news](https://www.aqr.com/Our-Firm/News/2025/AQRs-The-Less-Efficient-Market-Hypothesis-Wins-Outstanding-Article-Recognition-in-26th-Annual-Bernstein-Fabozzi-Jacobs-Levy-Awards); [Morningstar summary](https://www.morningstar.com.au/insights/stocks/254489/legendary-investor-markets-are-less-efficient-and-social-media-is-the-big-culprit) (Secondary)
- **Value 2020s:** By decade, HML is +0.8%/yr in the 2020s through May 2026. — [finobservatory](https://finobservatory.org/factors). Long-only value ETFs did well in 2023–2025 (e.g., iShares MSCI USA Value Factor: +14.3% in 2023, +7.3% in 2024, +32.7% in 2025). These are total returns, not premia, and say nothing about value vs growth. — [iShares](https://www.ishares.com/us/products/251616/ishares-msci-usa-value-factor-etf)
- **Daniel & Moskowitz, "Momentum Crashes" (PR, JFE 2016, 122(2):221–247; NBER w20439)** — verified from paper text; US 1927:01–2013:03, decile WML, gross:
  - WML Sharpe 0.71 vs market 0.40; CAPM alpha 22.3%/yr.
  - **July–August 1932:** the past-loser decile returned **+232%** vs winners +32%.
  - **March–May 2009:** losers **+163%** vs winners +8%.
  - Crashes are "partly forecastable." They occur in **"panic" states, after market declines and when volatility is high**. In bear markets, the momentum portfolio's up-market beta is −1.51 vs a down-market beta of −0.70, so it behaves like a short call option.
  - A dynamic strategy that scales exposure by forecast mean and variance **"approximately doubles the alpha and Sharpe ratio"** of static momentum.
  - The two longest momentum slumps were June 1932–Dec 1939 and March 2009–March 2013.
  - Source: [NBER](https://www.nber.org/papers/w20439)
- **2009 crash magnitude:** "Momentum lost more than 73% within a period of three months" in 2009 (Dierkes & Krupski, as summarized). — [Alpha Architect](https://alphaarchitect.com/risk-of-momentum-crashes/) (Secondary)
- **Momentum since 2007:** +0.7%/yr CAGR Jan 2007–May 2026, vs +9.2%/yr 1963–2006 (French UMD, gross). Its index is still −25.8% below its Nov 2008 peak. — [finobservatory](https://finobservatory.org/factors) (Secondary)
- **Momentum in 2025:** The long-only USA momentum ETF was a top performer in H1 2025 despite an April tariff-sell-off hit. — [Capital Spectator](https://capitalspectator.substack.com/p/momentum-is-still-2025s-top-performer) (Secondary)

### Inferences
- For 12-month-graded ratings, momentum crash risk is concentrated in sharp market rebounds after bear markets. In those regimes the app's "Sell" ratings on past losers will look worst. Down-weighting momentum when market volatility is high and the market has recently fallen follows Daniel-Moskowitz.
- Value in large caps is the factor most likely to disappoint users. Evidence since 1991 is close to zero for big value. If kept, it should be measured with multiple metrics (earnings, cash flow, sales; possibly intangibles-adjusted book) rather than B/P alone, and paired with profitability.

### Gaps
- I did not obtain AQR's current (2025–2026) value-spread percentile readings or the exact 2020–2022 HML rebound magnitude from a primary source.
- Hasler's "Is the Value Premium Smaller Than We Thought?" (Critical Finance Review, forthcoming/2023) argues the value premium is sensitive to construction choices. I did not review its numbers. — [CFR PDF](https://cfr.ivo-welch.org/forthcoming/papers/hasler2023value.pdf)
- The Arnott et al. abstract names two sources of value's underperformance. I verified only the intangibles source in this session; the second (reported elsewhere as relative-valuation compression) is unverified.

---

## Q6. How to combine factors (equal vs optimized weights, timing, sector-neutral vs not) and sector-relative vs market-wide ranking

### Takeaway
The evidence favors **simple, diversified, integrated composites** over timed or optimized ones. **Value-spread "contrarian" timing adds little** (AQR). **Integrating signals at the stock level beats mixing single-factor portfolios** for long-only investors (AQR, contested). Combining anomalies roughly quintuples the net expected return of the average anomaly (Chen-Velikov). **Sector/industry-relative characteristics are better return predictors** (Asness-Porter-Stevens). Whether to neutralize sectors depends on construction: **long-short benefits, long-only on average does not** (Ehsani-Harvey-Li).

### Cited Findings
- **Asness, Chandra, Ilmanen & Israel, "Contrarian Factor Timing Is Deceptively Difficult" (PR, JPM 2017; AQR = Vendor):**
  - Tested value-spread timing that varies weights from 50% to 150% on HML, UMD and BAB.
  - Gross Sharpe sometimes rises modestly and sometimes falls. For example, non-industry-neutral BAB *fell* from 0.53 to 0.40 when timed.
  - In multi-factor portfolios that already hold value, timing "undermines diversification"; the more diversified the base portfolio, the harder timing helps.
  - Correlations between value spreads and next-year returns are "frail." Results are gross; costs would reduce them further.
  - Sources: [AQR](https://www.aqr.com/Insights/Research/Journal-Article/Contrarian-Factor-Timing-is-Deceptively-Difficult); [CXO summary](https://www.cxoadvisory.com/value-premium/valuation-based-factor-timing/)
- **Daniel & Moskowitz (PR, JFE 2016):** Volatility/state-based *risk* scaling of momentum doubles its Sharpe ratio. This is a form of timing that does work, but for crash risk, not for return forecasts. — [NBER](https://www.nber.org/papers/w20439)
- **Fitzgibbons, Friedman, Pomorski & Serban, "Long-Only Style Investing: Don't Just Mix, Integrate" (Journal of Investing 2017; AQR = Vendor):** Scoring each stock on multiple factors at once (integration) beats blending separate single-factor portfolios (mixing). It avoids holding stocks whose exposures offset, e.g., cheap but negative momentum. — [AQR](https://www.aqr.com/Insights/Research/White-Papers/Long-Only-Style-Investing); [ai-CIO](https://www.ai-cio.com/news/factor-investing-allocation-vs-integration/). A 2018 critique ("Much Ado About Nothing?") argues the real issue is deriving optimal factor exposures, not mix vs integrate. — [vLex](https://eu.vlex.com/vid/the-mixed-vs-the-855646895)
- **Value + momentum + quality complementarity:** The QMJ paper reports an optimal quality/value combination with a gross Sharpe of about 0.7 (US) vs about 0.41 for QMJ alone (WP-version figures). Novy-Marx (2013) reports that controlling for profitability greatly improves value strategies. — [CXO on QMJ](https://www.cxoadvisory.com/?p=23772) (Secondary); [NBER w15940](https://www.nber.org/papers/w15940)
- **Chen & Velikov (PR, JFQA 2023):** Combining anomalies nets about 20 bps/mo vs about 4 bps for the average single anomaly, after costs and decay. — [Federal Reserve](https://www.federalreserve.gov/econres/feds/zeroing-in-on-the-expected-returns-of-anomalies.htm)
- **Asness, Porter & Stevens, "Predicting Stock Returns Using Industry-Relative Firm Characteristics" (AQR WP, Feb 2000):**
  - Splitting characteristics (size, B/M, CF/P, employee growth, past returns) into a **within-industry deviation** and an **industry-vs-market component** gives "better proxies" for expected returns.
  - Within-industry and across-industry effects can have *opposite* signs: short-horizon reversal is within-industry, while momentum has an across-industry part.
  - They suggest industry-relative sorting may be better for quant stock selection.
  - Source: [AQR](https://www.aqr.com/Insights/Research/Working-Paper/Predicting-Stock-Returns-Using-IndustryRelative-Firm-Characteristics)
- **Ehsani, Harvey & Li, "Is Sector Neutrality in Factor Investing a Mistake?" (PR, FAJ 2023, 79(3):95–117; Research Affiliates co-author):** A characteristic's predictive power splits into across-industry and within-industry parts. Analytically and in bootstraps, "the average long–short investor is more likely to benefit from hedging out sector bets, whereas the long-only investor should, on average, avoid sector neutralization." The answer depends on portfolio construction and on the factor. — [Duke PDF](https://people.duke.edu/~charvey/Research/Published_Papers/P165_Is_sector_neutrality.pdf); [CFA Institute](https://rpc.cfainstitute.org/research/financial-analysts-journal/2023/is-sector-neutrality-in-factor-investing-a-mistake); [Alpha Architect](https://alphaarchitect.com/is-sector-neutrality-in-factor-investing-a-mistake/)
- **Factor momentum (Ehsani & Linnainmaa, JF 2022; Gupta & Kelly "Factor Momentum Everywhere," AQR/JPM 2019):** Factors' own past returns predict their future returns. This is one of the few timing signals with published support. — [AEA listing](https://www.aeaweb.org/conference/2020/preliminary/paper/RHhbnykd); [AQR JPM PDF](https://www.aqr.com/-/media/AQR/Documents/Insights/Journal-Article/Factor-Momentum-Everywhere-JPM-Quant-19.pdf?sc_lang=en) (contents not reviewed in detail this session)

### Inferences
- **Sector-relative percentile ranking fits the app's grading.** Ratings graded against a sector benchmark are effectively a within-sector long-short test, which is the setting where Ehsani-Harvey-Li find sector neutrality helps and where Asness-Porter-Stevens find industry-relative characteristics predict better. For valuation especially, raw P/E or P/B mostly ranks sectors (e.g., banks vs software), not stock-level mispricing.
- **Grading against SPY is different.** Against SPY, sector exposure is part of the outcome. Long-only investors on average lose by neutralizing sectors (Ehsani-Harvey-Li). The app should expect sector-neutral scores to explain sector-relative excess returns better than SPY-relative ones, and should report both separately.
- **Weighting:** Without strong out-of-sample evidence for optimized or timed weights, equal (or near-equal, evidence-tilted) weights across a few robust factors are the defensible default. Evidence-tilted would mean higher weight on profitability/quality and momentum, lower on stand-alone growth, leverage and accruals.
  - Compute the composite at the stock level (integration), not by averaging separate factor ratings.
  - The only well-supported "timing" is risk-based scaling of momentum in high-volatility, post-crash regimes.
- **Overfitting risk:** Picking factor weights by backtest on the same S&P 500 history invites the data-mining problem Harvey-Liu-Zhu and Chen-Lopez-Lira-Zimmermann document. Any weighting choice should be fixed ex ante and validated out of sample.

### Gaps
- I did not retrieve quantitative evidence comparing equal-weight vs mean-variance-optimized factor composites in US large caps (e.g., DeMiguel-Garlappi-Uppal 1/N-type results applied to factors).
- I did not retrieve Haddad, Kozak & Santosh, "Factor Timing" (RFS 2020), which reports that timing the dominant principal components of anomalies is valuable. It should be checked as a counterpoint to AQR's skepticism.
- I found no study that measures directly whether *sector-relative* vs *market-wide* percentile composites better predict 12-month sector-relative excess returns in S&P 500 stocks specifically. This is an empirical question the app could test on its own history using JKP or Chen-Zimmermann data.
- Novy-Marx's "Backtesting Strategies Based on Multiple Signals" (overfitting bias in composite signals) was not retrieved, though it bears on how many factors to combine.
