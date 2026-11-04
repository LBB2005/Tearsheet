# Non-factor-model stock return signals: technical analysis, event-driven signals, and alternative signals (evidence review, as of Nov 2026)

Scope: signals beyond value/growth/profitability/balance-sheet/earnings-quality/momentum, judged for US large caps (S&P 500) at 1–12 month horizons, with emphasis on what can be built from free data (SEC EDGAR Forms 4, 8-K, 13F, 10-K text; prices). "Gross" means before trading costs unless stated. Several figures come from abstracts or secondary summaries because full texts were paywalled; these are flagged.

## Q1. Technical analysis: what do Brock-Lakonishok-LeBaron (1992), Lo-Mamaysky-Wang (2000), Sullivan-Timmermann-White (1999), Park & Irwin (2007) and later studies find, and does any of it survive costs among large caps?

### Takeaway
Classic chart/indicator rules (moving averages, trading-range breaks) looked strong on the Dow over 1897–1986, but once data-snooping is controlled and costs are applied they stop working after roughly 1962–1987, and the best rule cannot be picked ex ante. The only price-based "technical" signals with credible modern cross-sectional evidence are those already in factor libraries (momentum/reversal/trend aggregates), which are mostly gross and equal-weighted, so they do not justify a separate technical-analysis score for S&P 500 names.

### Cited Findings
- **Brock, Lakonishok & LeBaron (1992, JF 47(5):1731–1764).** Tested moving-average and trading-range-break rules on the Dow Jones index, 1897–1986. Buy signals gave consistently higher returns than sell signals, and returns after buy signals were less volatile. Returns after sell signals were negative. The patterns were inconsistent with random-walk, AR(1), GARCH-M and EGARCH null models. — [IDEAS/RePEc abstract](https://ideas.repec.org/a/bla/jfinan/v47y1992i5p1731-64.html)
- BLL split the sample into 4 subperiods (1897–1914, 1915–1938, 1939–1962, 1963–1986). A secondary summary says the 50-day average performed best and a 1% band improved results; this is a secondary account. — [Alpha Architect summary](https://alphaarchitect.com/2014/08/old-school-academics-on-moving-average-rules-remarkable/)
- **Sullivan, Timmermann & White (1999, JF 54:1647–1691).** Expanded BLL's 26 rules into a large universe of rules, applied them to 100 years of daily DJIA data, and used White's Reality Check bootstrap to separate skill from luck. They also tested BLL's rules out of sample on 1987–1996. — [FMG/LSE discussion paper page](https://www.fmg.ac.uk/publications/discussion-papers/data-snooping-technical-trading-rule-performance-and-bootstrap); [LSE Research Online](https://researchonline.lse.ac.uk/id/eprint/119144)
- Later work summarizes STW's out-of-sample result as finding no significantly profitable rule for the DJIA, S&P 500 index or S&P 500 futures. — [Re-examining technical analysis with White's Reality Check and Hansen's SPA test (secondary)](https://c.mql5.com/forextsd/forum/211/Re-Examining%20the%20Profitability%20of%20Technical%20Analysis%20with%20Whitets%20Reality%20Check%20and%20Hansen9s%20SPA%20Tes.pdf)
- **Bajgrowicz & Scaillet (2012, JFE 106:473–491).** Tested 7,846 rules on daily DJIA prices from January 1897 to July 2011, correcting for data snooping with the False Discovery Rate:
  - An investor could never have picked the future best rules ex ante; there is no out-of-sample persistence.
  - Even in sample, low transaction costs wipe out the performance.
  - Since 1962, most rules are unprofitable even at zero cost.
  - Pre-1962 rules may have paid only if round-trip costs were below about 16–70 bps.
  - Sources: [IDEAS abstract](https://ideas.repec.org:443/a/eee/jfinec/v106y2012i3p473-491.html); [CFA Institute digest](https://rpc.cfainstitute.org/research/cfa-digest/2013/02/technical-trading-revisited-false-discoveries-persistence-tests-and-transaction-costs-digest)
- The 2008 working-paper version of Bajgrowicz-Scaillet found that before costs and after data-snooping adjustment, rules outperformed over 1897–1996. That backtested outperformance disappeared across the whole rule universe in January 1997–July 2007. — [CXO Advisory summary](https://www.cxoadvisory.com/?p=1631)
- **Lo, Mamaysky & Wang (2000, JF).**
  - Method: automated pattern recognition with nonparametric kernel regression (head-and-shoulders, double tops/bottoms, and others) on a large sample of US stocks, 1962–1996.
  - Test: they compared conditional and unconditional return distributions. Several indicators "provide incremental information and may have some practical value", but this is a distributional test, not a cost-adjusted trading test.
  - Pattern frequency: double tops and bottoms were the most common patterns.
  - Caveats: classic head-and-shoulders patterns "may not be optimal", and statistically informative patterns need not be profitable.
  - Sources: [NBER w7613](https://www.nber.org/papers/w7613); [CFA Institute digest](https://rpc.cfainstitute.org/-/media/documents/article/cfa-digest/2001/dig-v31-n1-811-pdf.pdf)
- **Park & Irwin (2007, J. Economic Surveys 21(4):786–826)**, "What do we know about the profitability of technical analysis?" — [IDEAS listing](https://ideas.repec.org/a/bla/jecsur/v21y2007i4p786-826.html). A secondary source credits it with a tally of 95 modern studies: 56 positive, 20 negative (the rest mixed). This is unverified against the paper. — [blog citing Park & Irwin](https://thortradecopier.com/blog/does-technical-analysis-work)
- The 2004 precursor (Park & Irwin working paper) reports that technical analysis is widely used, especially in futures and FX. About 30–40% of practitioners view it as important at horizons up to 6 months. — [AgEcon working paper](https://ageconsearch.umn.edu/record/37487/files/AgMAS04_04.pdf)
- **Cross-sectional "trend factor": Han, Zhou & Zhu (2016, JFE 122(2):352–375).**
  - Construction: combines short-, intermediate- and long-horizon moving-average signals into one cross-sectional forecast.
  - Headline claim: more than doubles the Sharpe ratios of the short-term reversal, momentum and long-term reversal factors.
  - Sources: [WUSTL profile/abstract](https://profiles.wustl.edu/en/publications/a-trend-factor-any-economic-gains-from-using-information-over-inv/)
  - A 2015 update reports a **gross** 1.63%/month return with a monthly Sharpe ratio of 0.47, vs 0.23 (short-term reversal) and 0.10 (momentum).
  - Portfolio design: long/short **equal-weighted** extreme quintiles, rebalanced monthly. — [CXO Advisory](https://cxoadvisory.com/?p=22343); [Quantpedia](https://vvv.quantpedia.com/?p=533)

### Inferences
- For an S&P 500 rating engine, classic TA rules (MA crossovers, chart patterns) have no credible net-of-cost evidence for large caps at 1–12 month horizons. The best evidence (Bajgrowicz-Scaillet) says the DJIA, the large-cap benchmark, shows nothing since 1962 even before costs.
- The trend factor's reported performance is gross and equal-weighted, so it is likely concentrated in small, costly-to-trade stocks. Treat it as a variant of momentum and reversal, not as a new orthogonal signal for mega-caps.
- If the app shows "technical" context (e.g., price vs 200-day MA, distance from 52-week high), present it as descriptive, not as a scored alpha input. The 52-week-high variant is the exception with real evidence (see Q2).

### Gaps
- Exact BLL table values (e.g., annualized buy- vs sell-signal returns) were not retrievable; the paper is paywalled on JSTOR. Commonly quoted figures (around 12% annualized after buy signals vs negative after sell signals) are unverified here.
- STW's exact Reality Check p-values for 1897–1986 vs 1987–1996 were not retrieved.
- Park & Irwin's exact study counts and its post-1990 conclusions were not verified against the paper.
- No study was found that tests classic TA rules specifically on individual S&P 500 constituents net of realistic costs post-2010.

## Q2. Short-term reversal, industry momentum (Moskowitz & Grinblatt 1999), 52-week-high momentum (George & Hwang 2004), and seasonality

### Takeaway
All four have peer-reviewed evidence. Only short-term reversal has explicit evidence of surviving costs in large caps, and it is a 1-week to 1-month, high-turnover signal that is poorly suited to a monthly or quarterly rating. Industry momentum and 52-week-high momentum mostly overlap with standard momentum. Same-calendar-month seasonality is robust but small per month and also high-turnover.

### Cited Findings
- **Short-term reversal: De Groot, Huij & Zhou (2012, J. Banking & Finance 36:371–382).** The cost drag on reversal profits comes largely from trading small caps. Restricting to large caps cuts costs sharply. Reversal strategies earned **30–50 bps per week net of costs**. Sources differ on the sample (NYSE 1990–2009 or 1991–2010). — [IDEAS](https://ideas.repec.org/a/eee/jbfina/v36y2012i2p371-382.html); [EUR repository](https://repub.eur.nl/pub/25718)
- Secondary summaries add two caveats. Net profitability is limited to roughly the largest 100 stocks. One summary also reports that highly liquid stocks show short-term *momentum*, with reversal driven by illiquid, low-turnover stocks. Frazzini et al. estimate reversal capacity at about $9bn in the US before costs overwhelm it. — [Quantpedia](https://quantpedia.com/strategies/short-term-reversal-in-stocks); [Alpha Architect](https://alphaarchitect.com/alpha-from-short-term-signals/)
- **Industry momentum: Moskowitz & Grinblatt (1999, JF 54(4):1249–1290).** Strong industry momentum explains much of individual-stock momentum, and stock momentum is significantly less profitable after controlling for it. Industry strategies (buy past-winner industries, sell past losers) are "highly profitable". Predictability is strongest at the 1-month horizon and lasts up to about a year. — [IDEAS](https://ideas.repec.org/a/bla/jfinan/v54y1999i4p1249-1290.html); [AQR-hosted paper](https://www.aqr.com/Insights/Research/Journal-Article/Do-Industries-Explain-Momentum)
- **52-week high: George & Hwang (2004, JF 59:2145–2176).** Nearness of the current price to the 52-week high explains a large portion of momentum profits. Unlike standard momentum, these returns **do not reverse in the long run**, suggesting momentum and long-term reversal are separate phenomena. — [abstract mirror](https://academicnewsletter.sufe.edu.cn/info/361244); [CXO Advisory](https://www.cxoadvisory.com/1284/technical-trading/the-52-week-high-as-a-momentum-indicator-for-individual-stocks/)
- **International comparison, 51 countries (Gupta, Locke & Scrimgeour 2010).** Industry and 52-week-high strategies both earn positive returns, but neither beats conventional momentum. — [Waikato research commons](https://researchcommons.waikato.ac.nz/handle/10289/4088)
- **Seasonality: Heston & Sadka (2008, JFE 87:418–445).** Stocks with high past returns in a given calendar month tend to have high returns in the same calendar month in future years. The sample is NYSE/AMEX, 1963–2002. The effect survives controls (one at a time) for earnings announcements, dividends, size, industry, factor exposures and calendar month. — [abstract mirror](https://academicnewsletter.sufe.edu.cn/info/357254); [UMD Smith summary](https://www.rhsmith.umd.edu/news/seasonality-stock-market-returns)
- Follow-up work (Keloharju, Linnainmaa & Nyberg, "Return Seasonalities") finds same-month history up to about 20 years old is informative. A same-month long-short strategy earned about 13% per year over 1963–2011 (gross). — [NBER w20815](https://www.nber.org/papers/w20815.pdf)
- **International seasonality (Heston & Sadka 2010, JFQA).** Same-calendar-month outperformance persists for up to 5 years in Canada, Japan and 12 European countries. — [IDEAS](https://ideas.repec.org/a/cup/jfinqa/v45y2010i05p1133-1160_00.html)

### Inferences
- **Short-term reversal:** the only one of these with explicit large-cap, net-of-cost evidence. Its horizon (weekly) is mismatched to a 1–12 month rating and needs weekly turnover. It is a reasonable minor tilt, such as a "recent 1-month move" flag, but should not be a core score component.
- **52-week-high ratio:** cheap to compute from free prices, and its non-reversal property makes it suitable for 6–12 month horizons. Because it overlaps with momentum, add it only as a refinement of the existing momentum pillar, not as a new pillar.
- **Industry momentum:** can be computed from free prices plus SIC codes from EDGAR. Its incremental value over stock momentum in a 500-name universe is likely modest.
- **Seasonality:** robust but needs 10–20 years of monthly history per stock. It is very high-turnover, rotating monthly, and hard to explain in a research report. It is low priority.

### Gaps
- Exact monthly spreads for Moskowitz-Grinblatt (industry) and George-Hwang (52-week high) were not retrieved; the full texts are paywalled.
- No found study gives net-of-cost, value-weighted, S&P 500–only results for industry momentum, 52-week high or seasonality.
- Post-publication decay estimates specific to these four signals were not found individually; see the McLean-Pontiff and Chen-Velikov aggregate evidence in Q6.

## Q3. Earnings events: post-earnings-announcement drift (Bernard & Thomas 1989/1990), its decay, earnings surprises, and guidance changes

### Takeaway
PEAD was large in 1974–1990s data (about 4.2% top-minus-bottom over 60 days), but for stocks above the NYSE 20th size percentile it has been essentially **zero since about 2006**. Prices now absorb analyst-measured surprises on the announcement day. A 2025 working paper finds no significant PEAD factor ex-microcaps over 2001–2024. For S&P 500 names, earnings surprise is now an announcement-day event, not a 1–12 month drift signal. Evidence on guidance changes is thinner and mostly older.

### Cited Findings
- **Bernard & Thomas (1989, J. Accounting Research 27:1–36).** The high-minus-low SUE decile spread earned about **4.2% over the 60 trading days** after announcement. It was positive in 41 of 48 quarters, 1974–1985. — [Event Study Tools summary](https://www.eventstudytools.com/earnings-announcements)
- Bernard & Thomas (1990) found that about 25–30% of the drift occurs in the 3-day windows around the *next* earnings announcements. — [Wikipedia summary](https://en.wikipedia.org/wiki/Post%E2%80%93earnings-announcement_drift)
- **Martineau (2022), "Rest in Peace Post-Earnings Announcement Drift," Critical Finance Review 11:613–646.** Sources for all sub-points: [CFR paper PDF](https://cfr.ivo-welch.org/published/papers/martineau2021rest.pdf); [IDEAS](https://ideas.repec.org/a/now/jnlcfr/104.00000122.html)
  - **Samples:** a Compustat sample from 1973 and an I/B/E/S sample from 1984, both through 2019. They cover 593,654 and 312,462 announcements respectively.
  - **Headline:** "For large stocks, PEAD have been non-existent since 2006." Since 2006, analyst earnings surprises fail to positively predict 60-day post-announcement returns for all-but-microcap stocks (above the NYSE 20th percentile). For microcaps the same holds since 2016.
  - **By period:** 1984–1990 showed slow, continuous drift. Over 1991–2010 drift weakened. In 2006–2010 it remained only for the top surprise quintile. From 2011 there is no pronounced drift.
  - **Announcement-day response:** the effect of a surprise on the 2-day [0,1] return rose from 20 bps to **120 bps** for all-but-microcaps (and from 30 to 100 bps for microcaps). Announcement-day R² rose from 1.7% to 11.7% for all-but-microcaps, with the biggest jump after 2005.
  - **Responsiveness:** all-but-microcap prices are 6 times more responsive to surprises on the announcement date in 2016–2019 than in 1984–1990.
  - **Random-walk surprises** (seasonal EPS change, computable without analysts): for all-but-microcaps they predict post-announcement returns only before 1990.
  - **Remaining PEAD:** concentrated in microcaps with poor information environments. Microcaps (per Hou et al. 2020) are 3.2% of market cap but 60.7% of stocks.
- **Debate since 2022 (UCLA Anderson Review):**
  - Two 2025 papers claim PEAD persists. Hirshleifer, Peng & Wang (RFS 2025) report a drift t-stat of about 14. Dickerson, Julliard & Mueller (JFE) find an earnings-drift factor important. Neither filters microcaps, and DJM uses announcement-return-based surprises.
  - Subrahmanyam (2025 working paper, Feb 2001–Dec 2024) replicates the drift factor. The t-stat is 2.18 with all stocks but **1.43 excluding microcaps** (bottom 20% NYSE size, about 3% of market value).
  - Source: [UCLA Anderson Review](https://anderson-review.ucla.edu/is-post-earnings-announcement-drift-a-thing-again/)
- **Management forecasts:** markets also underreact to information in management forecast errors, producing predictable post-announcement returns (JBFA 2009). — [IDEAS](https://ideas.repec.org/a/bla/jbfnac/v36y2009i7-8p822-837.html)

### Inferences
- For S&P 500 constituents, do not score "last quarter's earnings surprise" as a forward 1–12 month return predictor. The large-cap evidence says it is priced within 1–2 days.
- It remains useful descriptive content for a report ("beat/miss and stock reaction").
- Surprise-based signals need consensus estimates, which in I/B/E/S are **licensed**. A random-walk SUE can be computed from free EDGAR XBRL data, but it has had no predictive power for non-microcaps since about 1990 (Martineau).
- The academic literature still reports "significant PEAD" in full-universe, equal-weighted, microcap-inclusive tests. Those results should not transfer to an S&P 500 app.

### Gaps
- No credible recent large-cap evidence was found specifically on **management guidance raises/cuts** (e.g., post-2010, S&P 500) and subsequent 1–12 month returns. A search snippet mentioned an earnings-warnings study (372 firms, 1998–1999) finding negative post-warning drift, but its source could not be pinned down.
- Analyst forecast revision signals (a close cousin) were not researched in depth here and also need licensed I/B/E/S data.
- The 18% annualized PEAD figure sometimes quoted for Bernard & Thomas could not be verified.

## Q4. Insider trading (Form 4), share buybacks and issuance (net issuance anomaly), and dividend initiations

### Takeaway
Of all EDGAR-derivable signals, **insider purchases**, especially "opportunistic" (non-routine) ones, have the strongest evidence. Cohen-Malloy-Pomorski report 82 bps/month value-weighted for opportunistic trades vs about 0 for routine ones, and insider sales are largely uninformative. **Net share issuance** (issuers underperform, repurchasers outperform) is one of the most robust and lowest-turnover anomalies and is computable from free filings. Dividend initiation and omission drift is documented but old, and these events are rare among S&P 500 firms.

### Cited Findings
- **Lakonishok & Lee (2001, RFS 14(1):79–111).** Covers all NYSE/AMEX/Nasdaq firms, 1975–1995. Markets barely move when insiders trade or report. Insiders' predictive ability comes from **purchases**; **sales have no predictive ability**. Stock-picking ability is driven by **smaller firms**. — [IDEAS](https://ideas.repec.org/a/oup/rfinst/v14y2001i1p79-111.html)
- **Jeng, Metrick & Zeckhauser (2003, REStat 85(2):453–471), 1975–1996:**
  - The purchase portfolio earns significant abnormal returns; a search summary of the NBER version gives about 40 bps/month (see Gaps). The sale portfolio earns none.
  - **Abnormal returns in small firms are not significantly different from large firms.**
  - Top executives do not earn more than other insiders.
  - Sources: [NBER w6913](https://www.nber.org/papers/w6913); [Harvard listing](https://rzeckhauser.scholars.harvard.edu/publications/estimating-returns-insider-trading-performance-evaluation-perspective)
- **Cohen, Malloy & Pomorski (2012, JF 67(3):1009–1043), "Decoding Inside Information":**
  - Classification: insiders who trade in the same calendar month over several consecutive years are "routine"; those with no pattern are "opportunistic".
  - Returns: a long-short portfolio of opportunistic trades earns **value-weighted abnormal returns of 82 bps/month**. Routine trades earn essentially zero.
  - A separate regression-based comparison implies opportunistic trades' predictive ability exceeds routine trades' by 158 bps/month; this is a different quantity.
  - Sources: [NBER w16454](https://www.nber.org/papers/w16454); [NBER Digest](https://www.nber.org/digest/apr11/decoding-inside-information); [Harvard Law School Forum](https://corpgov.law.harvard.edu/?p=25072)
- **Brochet (2010), effect of SOX's 2-business-day Form 4 deadline.** Insider *purchase* filings became more informative. The mean 3-day CAR from SEC receipt rose from **0.59% pre-SOX to 1.89% post-SOX**. — [Harvard Law School Forum](https://corpgov.law.harvard.edu/2009/10/30/sox-and-insider-trades/)
- **Net issuance: Pontiff & Woodgate (2008, JF 63(2):921–945).**
  - Post-1970 share issuance has strong cross-sectional predictive power, stronger than book-to-market, size or momentum.
  - The effect holds from 1-month to 3-year holding periods.
  - The pre-1970 period shows no significant predictability for most horizons.
  - Source: [IDEAS](https://ideas.repec.org/a/bla/jfinan/v63y2008i2p921-945.html)
- **International issuance:** McLean, Pontiff & Watanabe (2009, JFE) find share issuance predicts returns in 41 countries. — [IDEAS](https://ideas.repec.org/a/eee/jfinec/v94y2009i1p1-17.html)
- **Buybacks: Ikenberry, Lakonishok & Vermaelen (1995, JFE 39:181–208).** Open-market repurchase announcements, 1980–1990:
  - 4-year buy-and-hold abnormal return of **12.1%**, about 2.9% per year.
  - **45.3% for value (high B/M) repurchasers**, and no drift for glamour stocks.
  - Interpreted as underreaction.
  - Sources: [abstract mirror](https://academicnewsletter.sufe.edu.cn/info/358169); [NBER w7325 (annualized citation)](https://www.nber.org/papers/w7325.pdf)
- **Dividend initiations and omissions: Michaely, Thaler & Womack (1995, JF 50(2):573–608).** Over the 12 months after the announcement (excluding the event month):
  - Initiators earn **+7.5%** market-adjusted; omitters earn **−11.0%**.
  - The drift after omissions is stronger and more robust, and "more pronounced than that following earnings surprises".
  - Controlling for the size of the yield change shrinks or eliminates the asymmetry.
  - Source: [NBER w4778](https://www.nber.org/papers/w4778)

### Inferences
- **Insider signal design:**
  - Weight purchases, ignore or down-weight sales, and use the CMP routine/opportunistic filter.
  - All inputs (filer, role, date, shares, price, transaction code P/S) are in **free** EDGAR Form 4 XML.
  - CMP's 82 bps/month is value-weighted, and JMZ find no small/large difference, so the signal plausibly applies to large caps.
  - Opportunistic open-market purchases are rare in mega-caps, so the signal will be **sparse**: most S&P 500 names will be "no signal" in a given quarter.
  - Post-SOX filings are faster, so the announcement CAR is captured within days. A user reading a monthly-updated report gets the tail of the drift, not the 3-day jump.
- **Net issuance:** compute as the log change in split-adjusted shares outstanding over 12 months (XBRL `dei:EntityCommonStockSharesOutstanding` or the cover page) and/or buybacks net of issuance from the cash-flow statement. Turnover is low, so it is likely to survive costs (see Novy-Marx & Velikov in Q6). It may already be partly captured in a "shareholder yield"/value pillar; check overlap.
- **Buyback announcements** are now mostly continuous authorizations disclosed in 10-Q/10-K. The 1980s announcement effect is likely weaker today, and the value-stock conditioning matters.
- **Dividend initiations and omissions:** rare among S&P 500 firms. They are useful as event flags in a report (e.g., "dividend cut") rather than as a scored cross-sectional signal.

### Gaps
- Lakonishok & Lee's exact abnormal return magnitudes, including the oft-quoted 7.4% figure, were not verified.
- Jeng-Metrick-Zeckhauser published magnitudes conflict across summaries (about 40 vs more than 50 bps/month), and sources also conflict on how much accrues in the first 5 days vs the first month (one-sixth vs one-quarter). Verify against the published REStat paper.
- No found study measures the decay of the CMP opportunistic-insider signal post-2012 or restricts it to S&P 500 constituents.
- Post-2000 buyback-announcement drift and the effect of the 2003 Rule 10b-18 / 2023 SEC buyback-disclosure changes were not researched.

## Q5. Short interest and securities lending (incl. Rapach, Ringgenberg & Zhou 2016), institutional holdings from 13F, and options-implied signals (Cremers & Weinbaum, skew)

### Takeaway
- **Short interest:** Rapach-Ringgenberg-Zhou is a **market-timing** (aggregate) result, not a stock-selection signal. At the stock level, extreme short interest predicts underperformance mostly in equal-weighted, small-cap portfolios (APR 2005: −215 bps/month EW but an insignificant −39 bps VW).
- **Options:** signals (put-call IV spread, smirk) have strong but gross, weekly-horizon evidence and need licensed data.
- **13F:** "best ideas" and holdings-copy strategies have mixed evidence, limited by the 45-day reporting lag.

### Cited Findings
- **Rapach, Ringgenberg & Zhou (2016, JFE 121(1):46–65):**
  - Aggregate short interest (equal-weighted average of SI/shares outstanding, detrended) is "arguably the strongest known predictor of aggregate stock returns".
  - Annual R² is **12.89% in sample and 13.24% out of sample**.
  - The predictive power comes mainly through a cash-flow channel.
  - Source: [abstract mirror](https://academicnewsletter.sufe.edu.cn/info/356349)
- The RRZ out-of-sample timing strategy did not outperform in 1990–1995 and underperformed in 2000–2007. — [CXO Advisory](https://cxoadvisory.com/short-selling/aggregate-short-interest-and-future-stock-market-returns)
- **Asquith, Pathak & Ritter (2005, JFE)**, 1988–2002. Short-sale-constrained stocks (high short interest, low institutional ownership) underperform by about **215 bps/month equal-weighted** but only **39 bps/month value-weighted, which is not significant**. For the overwhelming majority of stocks, short-sale constraints are unlikely to bind. — [abstract mirror](https://academicnewsletter.sufe.edu.cn/info/357555)
- **Cremers & Weinbaum (2010, JFQA 45(2):335–367):**
  - Stocks with relatively expensive calls (positive call-minus-put implied-volatility spread) outperform stocks with relatively expensive puts by **50 bps per week**.
  - Predictability is larger when option liquidity is high and stock liquidity is low.
  - Lending rebate rates show it is not driven by hard-to-borrow stocks.
  - **Predictability declined over the sample period.**
  - Source: [IDEAS](https://ideas.repec.org/a/cup/jfinqa/v45y2010i02p335-367_00.html)
- The Cremers-Weinbaum hedge returns appear to **exclude trading costs**. — [CXO Advisory](https://www.cxoadvisory.com/volatility-effects/do-informed-traders-tip-their-hands-via-option-purchases/)
- A 2026 arXiv study reports option-implied-signal predictability (including the IV spread) remaining significant through 2024 at 1- and 4-week horizons. This is a working paper, not peer-reviewed. — [arXiv 2608.26115](https://arxiv.org/pdf/2608.26115)
- **Xing, Zhang & Zhao (2010, JFQA 45(3):641–662)**, all optionable US firms, 1996–2005. Stocks with the steepest smirks (expensive OTM puts relative to ATM calls) underperform the least-smirked stocks by **10.9% per year**. — [IDEAS](https://ideas.repec.org/a/cup/jfinqa/v45y2010i03p641-662_00.html). A secondary summary reports a weekly-rebalanced, 3-factor-adjusted return of about 15% per year **before transaction costs**. — [CXO Advisory](https://www.cxoadvisory.com/volatility-effects/smirking-because-they-know-something/)
- **13F, mutual funds (Blume & Keim):** mutual-fund managers' "best ideas" (largest overweights relative to market weights) generate significant returns. For other institutional types they find no evidence of positive risk-adjusted returns. — [Wharton Rodney White Center WP](https://rodneywhitecenter.wharton.upenn.edu/wp-content/uploads/2014/04/1023.pdf)
- **13F, hedge funds (Iqbal, Jivraj & Angelini, "Systematic 13F Hedge Fund Alpha").** They apply the Cohen-Polk-Silli "best ideas" method to hedge-fund 13Fs:
  - Risk-adjusted outperformance vs the S&P 500 requires selecting long-horizon managers.
  - The short-term-manager version performs similarly to the S&P 500 TR.
  - Quarterly reformation frictions and costs would reduce returns.
  - Sources: [CXO Advisory](https://www.cxoadvisory.com/investing-expertise/exploiting-consensus-hedge-fund-conviction-stock-picks/); [Quantpedia](https://quantpedia.com/strategies/alpha-cloning-following-13f-fillings)
- The delay between quarter-end and 13F availability (up to 45 days) may overstate how exploitable 13F signals are. — [U. Miami Business Law Review](https://business-law-review.law.miami.edu/form-13f-retail-investors-friend-worst-enemy/)

### Inferences
- **Short interest:**
  - Do not use RRZ as a stock-level signal. At most it is a market-regime note.
  - Stock-level short interest is published twice monthly by FINRA/exchanges and is broadly free. The APR evidence implies the value-weighted (large-cap) effect is weak, so for S&P 500 names it is better treated as a risk flag ("short interest X% of float, top decile") than a scored alpha input.
  - Securities-lending fees and utilization are **licensed** (e.g., data vendors).
- **Options-implied signals:**
  - These need option IV surfaces (OptionMetrics or vendor feeds), which are **licensed**. Free delayed chains exist but are not research-grade.
  - The signals are weekly-horizon and gross, and Cremers-Weinbaum already show decay within their sample.
  - Low priority for a free-data, monthly-updated app.
- **13F:**
  - Free from EDGAR, but the evidence for a generic "institutional ownership change" signal in large caps is weak in what was found.
  - Positive results depend on manager selection (long-horizon "best ideas").
  - Every S&P 500 stock is held by hundreds of 13F filers, so aggregate ownership changes in mega-caps are mostly index and flow noise.
  - Use 13F descriptively (top holders, ownership trend) rather than as a scored signal.

### Gaps
- No primary source was retrieved for Boehmer, Jones & Zhang (2008) or Boehmer, Huszar & Jordan (2010, "The good news in short interest", on lightly shorted stocks outperforming). Their large-cap and net-of-cost results are unverified.
- No primary source was retrieved for Gompers & Metrick (2001) on institutional demand, or Cohen, Polk & Silli (2010) original effect sizes.
- No large-cap-only (S&P 500), value-weighted, net-of-cost tests of option-IV-spread or smirk signals were found. Post-2010 decay estimates come only from a non-peer-reviewed 2026 arXiv paper.
- No citation was retrieved for FINRA's free short-interest publication schedule. This is stated from general knowledge and should be verified before relying on it in product docs.

## Q6. 8-K and filing events: executive departures, restatements (Item 4.02), material weaknesses (Item 9A / SOX 404), auditor changes (Item 4.01), going-concern opinions, and 10-K text changes

### Takeaway
- **Restatements:** large negative **announcement** returns (about −9% over 2 days in 1995–1999).
- **Going-concern opinions:** about −14% one-year drift, but contested and limited after costs.
- **Material weaknesses:** negative, with evidence of pre-disclosure pricing.
- **Executive departures:** mixed and sign-ambiguous.
- **Auditor changes:** no usable return evidence was found.

The strongest free-EDGAR *text* signal is **"Lazy Prices"** (changes in 10-K/10-Q language), with up to 188 bps/month alpha (1995–2014) and no announcement effect. For S&P 500 firms, going-concern opinions and many 8-K negatives are rare; they are better as red-flag overlays than as cross-sectional scores.

### Cited Findings
- **Restatements: Palmrose, Richardson & Scholz (2004, JAE).**
  - 403 restatements announced 1995–1999.
  - Average abnormal return of about **−9% over a 2-day window**.
  - Larger declines for fraud, more accounts affected, income-decreasing restatements, and restatements attributed to auditors or management.
  - Source: [abstract mirror](https://academicnewsletter.sufe.edu.cn/info/412647)
- Across studies, short-window restatement CARs range from about −6% (Dechow et al. 1996) to −10% (GAO 2003; Palmrose et al. 2004). — [secondary review, Cameron Univ. journal](https://www.cameron.edu/storage/departments/business/Journals/Vol-14-Financial-Restatements-And-Their-Impact.pdf); [GAO-03-395R](https://www.govinfo.gov/content/pkg/GAOREPORTS-GAO-03-395R/pdf/GAOREPORTS-GAO-03-395R.pdf)
- Hennes, Leone & Miller (2008, The Accounting Review 83(6):1487–1520) argue that restatement research must distinguish **irregularities** (intentional) from **errors**, with respect to CEO/CFO turnover consequences. — [Kellogg listing](https://www.kellogg.northwestern.edu/faculty/research/detail/2008/the-importance-of-distinguishing-errors-from-irregularities-in-restatement)
- **Material weaknesses:** a Credit Suisse First Boston analysis of 74 firms announcing material weaknesses (Oct 2004–Feb 2005) found the stocks fell after announcement and did not recover over the next 20 trading days. — [IR Impact](https://www.ir-impact.com/2005/06/verdict/)
- **Going concern: Kausar, Taffler & Tan (2009, J. Accounting Research 47(1):213–239).**
  - First-time going-concern opinions, 1993–2005.
  - About **−14% drift over the following year**; the market underreacts to GC opinions but fully reacts to GC withdrawals.
  - "After adjusting for transactions costs, the opportunity to earn profits ... is limited."
  - Sources: [Manchester research portal](https://research.manchester.ac.uk/en/publications/the-going-concern-market-anomaly/); [abstract mirror](https://academicnewsletter.sufe.edu.cn/info/413410)
- **Challenge to the going-concern drift (AAA Auditing conference paper, 2001–2010 data).** The drift replicates under the original matching. It **disappears completely** when firms are matched on the financial-risk characteristics auditors use. — [AAA conference abstract](https://convention2.allacademic.com/one/aaa/audit13/online_program_direct_link/view_paper/629978/)
- **Executive departures** — evidence is mixed:
  - Studies of sudden executive deaths find little systematic average effect. — [U. Michigan Deep Blue](https://deepblue.lib.umich.edu/items/7d6f88f4-67a0-46ab-8e98-3b1c8d6e05c6/full)
  - Reactions depend on departing-CEO and successor characteristics (e.g., positive returns after generalist successors in 164 sudden deaths). — [Bielefeld record](https://pub.uni-bielefeld.de/record/2958463)
  - Other studies report positive, negative or null CARs depending on the departure type. No study specific to 8-K Item 5.02 was found.
- **10-K/10-Q text changes: Cohen, Malloy & Nguyen (2020, JF 75(3):1371–1415), "Lazy Prices":**
  - Data: the full history of US 10-K/10-Q filings, 1995–2014.
  - Portfolio: short "changers" and long "non-changers" (year-over-year textual similarity) earns **up to 188 bps/month alpha (over 22%/yr)**.
  - Changes predict future earnings, profitability, news and even bankruptcies.
  - There is **no announcement effect**, consistent with investor inattention.
  - Sources: [NBER w25084](https://www.nber.org/papers/w25084); [IDEAS](https://ideas.repec.org/a/bla/jfinan/v75y2020i3p1371-1415.html)

### Inferences
- **Lazy Prices:** the best fit for the app's stated data philosophy. It uses free EDGAR text, a low-frequency (quarterly/annual) update, a 1–12 month horizon, and is mechanically explainable ("Risk Factors section changed 35% vs last year").
  - The "up to 188 bps" is the best-case specification and almost certainly gross.
  - Large-cap-specific, value-weighted and post-2014 performance was not verified.
  - Expect post-publication decay of the order McLean-Pontiff document (see Q7).
- **Restatements (Item 4.02 non-reliance), material weaknesses (Item 9A), going-concern opinions, auditor changes (Item 4.01):** most of the price impact is on announcement (restatements) or contested (going concern).
  - Use them as **binary red flags** that cap the rating or add a "governance/accounting risk" note.
  - Do not use them as ranked cross-sectional alpha. They are rare in the S&P 500, and post-event drift evidence is weak, old or contested.
- **Executive departures (Item 5.02):** the return sign is ambiguous. Include as report context only.

### Gaps
- Exact Hennes-Leone-Miller (2008) return figures for irregularities vs errors were not retrieved.
- No academic event study of **auditor changes** (Item 4.01) with return magnitudes was found in this pass. Hennes, Leone & Miller (2014), "Determinants and market consequences of auditor dismissals after accounting restatements", exists ([Kellogg](https://www.kellogg.northwestern.edu/faculty/research/detail/2014/determinants-and-market-consequences-of-auditor-dismissals-after-accounting/)), but its figures were not retrieved.
- A search snippet (source not pinned down) reported that for 404(b) material-weakness disclosures, no event-date reaction is observable on average because informed trading moves prices beforehand. It is unverified.
- No study was found of post-2014 or large-cap-only performance of Lazy Prices, or of whether it survives costs.
- Other 8-K items (e.g., Item 1.01 material agreements, 2.05 restructuring, 2.06 impairments) were not covered.

## Q7. Cross-cutting: for each signal, effect size, sample, large-cap validity, post-publication decay, and data source (free vs licensed)

### Takeaway
On average, anomaly returns fall about 26% out of sample and **58% after publication**. After realistic trading costs and post-publication decay, the **average** anomaly's expected net return is about **4 bps/month**, with the strongest at about 10 bps and multi-signal combinations at about 20 bps. Only low-turnover signals (one-sided monthly turnover below about 50%) tend to survive costs. Signals for an S&P 500 rating should therefore be low-turnover, value-weighted-robust and modestly weighted, with the expectation that any single signal adds little.

### Cited Findings
- **McLean & Pontiff (2016, JF 71(1)), 97 published predictors:** returns are about **26% lower out of sample** (an upper bound on data mining) and about **58% lower post-publication**. Predictors with larger in-sample returns decay more, and they become more correlated with other published predictors after publication. — [SSRN copy](https://counterpointfunds.com/wp-content/uploads/2017/07/PredictabilityMcleanPontiff.pdf); [CFA Institute digest](https://rpc.cfainstitute.org/research/cfa-digest/2016/06/does-academic-research-destroy-stock-return-predictability-digest-summary)
- **Chen & Velikov (2023, JFQA), "Zeroing in on the expected returns of anomalies":**
  - After effective-spread trading costs and post-publication decay, the average anomaly's expected return is "a measly **4 bps per month**".
  - The strongest anomalies net at best about 10 bps after controlling for data mining.
  - Combinations net about 20 bps.
  - Price impact is *not* modeled, so these figures are an upper bound.
  - Sources: [Cambridge/JFQA](https://www.cambridge.org/core/journals/journal-of-financial-and-quantitative-analysis/article/zeroing-in-on-the-expected-returns-of-anomalies/945133D5A3ECEEAF466AEE91551FD225); [Federal Reserve FEDS page](https://www.federalreserve.gov/econres/feds/zeroing-in-on-the-expected-returns-of-anomalies.htm)
- **Novy-Marx & Velikov (2016, RFS), "A Taxonomy of Anomalies and Their Trading Costs":**
  - Most anomalies with **one-sided monthly turnover below 50%** keep significant net spreads when cost-mitigated; few higher-turnover strategies do.
  - Far fewer clear t>3 after costs.
  - The most effective mitigation is a buy/hold spread (stricter entry than exit criteria).
  - Capacity is inversely related to turnover.
  - Sources: [NBER w20721](https://nber.org/papers/w20721); [Alpha Architect summary](https://alphaarchitect.com/2017/05/trading-costs-destroy-factor-investing/)
- **Chen & Zimmermann (2022, Critical Finance Review 11(2):207–264), Open Source Cross-Sectional Asset Pricing:**
  - Reproduces 319 characteristics.
  - Of the 161 clearly significant in the original papers, **98%** have reproduced long-short t-stats above 1.96.
  - A regression of reproduced on original t-stats has slope 0.90 and R² of 83%.
  - Sources: [SSRN](https://papers.ssrn.com/abstract=3604626); [Federal Reserve page](https://www.federalreserve.gov/econres/feds/open-source-cross-sectional-asset-pricing.htm)
- The OSAP project posts free monthly long-short portfolio returns and code. Counts differ by release (205 predictors in one download set; later releases describe about 525 reproduced predictors). Signal construction code runs on WRDS (CRSP/Compustat/I/B/E/S), which is licensed. — [Federal Reserve page](https://www.federalreserve.gov/econres/feds/open-source-cross-sectional-asset-pricing.htm); [CXO Advisory](https://www.cxoadvisory.com/big-ideas/open-source-stock-predictor-data-and-code/)
- Microcaps are 3.2% of aggregate market cap but 60.7% of stocks, and they account for many published anomalies (Hou, Xue & Zhang 2020, as cited by Martineau). — [Martineau 2022 PDF](https://cfr.ivo-welch.org/published/papers/martineau2021rest.pdf)

### Inferences
Summary scorecard for the app. Effect sizes are from the cited findings above; the large-cap and data-source judgments are inferences.

| Signal | Headline effect (sample; gross unless noted) | Large-cap evidence | Decay / cost concern | Data source |
|---|---|---|---|---|
| Classic TA rules (MA, breakouts, patterns) | BLL: buy > sell signals, DJIA 1897–1986 | DJIA itself: unprofitable since 1962 even at zero cost (Bajgrowicz-Scaillet) | Fully decayed; cost-killed | Free prices |
| Trend factor (multi-horizon MA) | 1.63%/mo gross, EW quintiles | Not shown for VW/large caps | Likely high turnover | Free prices |
| Short-term reversal (1 wk–1 mo) | 30–50 bps/wk **net**, large caps (De Groot et al.) | Yes, mainly top ~100 stocks | High turnover; capacity about $9bn | Free prices |
| Industry momentum | "Highly profitable"; strongest at 1-mo horizon (MG 1999) | Not verified | Overlaps momentum | Free prices + SIC (EDGAR) |
| 52-week-high proximity | Explains much of momentum; no long-run reversal (GH 2004) | Not verified | Overlaps momentum | Free prices |
| Same-month seasonality | about 13%/yr L/S 1963–2011 | Not verified | Very high turnover | Free prices (10–20 yrs history) |
| PEAD / earnings surprise | 4.2%/60 days (1974–85) | **None since 2006** for non-microcaps | Dead in large caps | I/B/E/S (licensed); RW-SUE from XBRL (free, but uninformative for non-microcaps) |
| Opportunistic insider purchases | 82 bps/mo VW (CMP 2012) | JMZ: no small/large difference | Sparse in mega-caps; decay unmeasured | **Free** EDGAR Form 4 |
| Insider sales | No predictive power (LL 2001; JMZ) | — | — | Free Form 4 |
| Net share issuance | Stronger than B/M, size, momentum post-1970 (PW 2008); 41 countries | Plausible (low turnover) | Low turnover, likely survives costs | **Free** XBRL shares outstanding / cash-flow statement |
| Buyback announcements | +12.1% 4-yr BHAR; +45.3% value firms (1980–90) | Not verified | Old sample | Free 8-K/10-Q text |
| Dividend initiation/omission | +7.5% / −11.0% over 12 mo | Rare events in S&P 500 | Old sample | Free 8-K / prices |
| Aggregate short interest | Market R² 13.24% OOS (annual) | N/A (market timing) | Uneven OOS | Free-ish exchange data |
| Stock short interest | −215 bps/mo EW, −39 bps VW (n.s.) | Weak | — | Free-ish exchange data; lending fees licensed |
| Option IV spread / smirk | 50 bps/wk (CW); 10.9%/yr (XZZ) | Not shown; decay within CW sample | Weekly, gross | **Licensed** (OptionMetrics) |
| 13F holdings / best ideas | Mixed; depends on manager selection | Weak/undocumented | 45-day lag | **Free** EDGAR 13F |
| Restatement (Item 4.02) | about −9% 2-day CAR (1995–99) | Announcement effect | Mostly immediate | **Free** 8-K |
| Material weakness (9A/404) | Negative; no 20-day recovery (74 firms, 2004–05) | Small samples | Pre-disclosure pricing | **Free** 10-K/8-K |
| Going-concern opinion | about −14% 1-yr drift (1993–2005) | Very rare in S&P 500 | Contested; limited net of costs | **Free** 10-K audit report |
| Executive departure (5.02) | Mixed sign | — | — | **Free** 8-K |
| 10-K text change ("Lazy Prices") | up to 188 bps/mo alpha (1995–2014) | Not verified | Expect about 58% post-pub decay | **Free** EDGAR text |

- **Priority for a free-data S&P 500 app:**
  1. Net share issuance (if not already in the value/quality pillars).
  2. Opportunistic insider purchases (sparse, but positive evidence and free).
  3. 10-K/10-Q textual change (Lazy Prices).
  4. 52-week-high proximity as a refinement of momentum.

  Use accounting/governance events (Item 4.02, 9A material weakness, going concern, auditor change) as red-flag overrides, not ranked scores. Deprioritize classic TA, PEAD, options-implied and 13F-based alpha scores.
- **Expected signal value:** given McLean-Pontiff and Chen-Velikov, any added signal should get modest weight. Its value is mostly diversification across a composite (combinations net about 20 bps/month in Chen-Velikov vs about 4 bps for the average single anomaly), not standalone alpha.

### Gaps
- No single source gives post-publication, value-weighted, S&P 500–only net returns for each signal above. The large-cap column is largely inference from size-conditioned evidence.
- Signal-specific post-publication decay figures (e.g., for net issuance, insider, Lazy Prices) were not retrieved individually. The OSAP signal documentation and portfolio files would allow this but were not downloaded in this pass.
