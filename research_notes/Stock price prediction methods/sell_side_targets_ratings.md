# Sell-Side Equity Research: How Price Targets and Ratings Are Built, and How Accurate and Useful They Are

Scope note: these notes are about US large caps where possible. Exact figures were checked against primary full text for Asquith, Mikhail & Au (NBER WP 9246, the working-paper version of the 2005 JFE paper), Brown, Call, Clement & Sharp (March 2013 SSRN working paper of the 2015 JAR paper), and Barber, Lehavy, McNichols & Trueman (2001 JF full text). Other figures come from journal abstracts (IDEAS/RePEc, publisher pages), regulator pages (FINRA, SEC) and FactSet. Where a figure came only from a search snippet or a secondary summary, it is flagged. The web search budget for this session ran out partway through, so some items are listed under Gaps rather than verified.

## 1. How do sell-side analysts construct price targets in practice? Which methods dominate?

### Takeaway
Earnings multiples dominate how price targets are set and justified. Typically this is P/E or PEG applied to the analyst's own forward EPS forecast, with EV/EBIT(DA) multiples counted in the same family. DCF is a widely used secondary or cross-check method. It is the main method in a minority of reports, though analyst surveys show it is used about as often as P/E. Studies find no evidence that the choice of method improves target accuracy or changes how the market reacts.

### Cited Findings
- **Asquith, Mikhail & Au (2005), content analysis.** The sample is 1,126 full reports by 56 Institutional Investor All-America analysts, 1997–1999, drawn from Investext and Zacks. 99.1% of reports mention some earnings multiple: P/E, relative P/E, or EBIT/EBITDA multiples, which the authors put in one "earnings or cash flow multiples" category. Only 12.8% use any form of DCF (FCFF, FCFE, APV or EVA). 25.1% use asset multiples (book value, market-to-book, replacement or liquidation value), and fewer than 3.6% use any other method. Every report that names a method names an earnings multiple; the 0.9% that do not name an earnings multiple name no method at all. — [Asquith, Mikhail & Au, NBER WP 9246](https://www.nber.org/papers/w9246.pdf); published version [JFE 75(2):245–282](https://ideas.repec.org/a/eee/jfinec/v75y2005i2p245-282.html)
- In Asquith et al., DCF is more common in downgrades (20.8%) than in upgrades (13.7%) or reiterations (11.1%). — [NBER WP 9246](https://www.nber.org/papers/w9246.pdf)
- In Asquith et al., valuation method dummies are insignificant in the market-reaction regressions. Earnings multiples hit their targets slightly more often than DCF overall. The only consistent result is that analysts using a "unique" proprietary method have a significantly lower probability of hitting the target. The authors, who teach DCF, call this "disappointing." They suggest some analysts may run a DCF and then express the result as a multiple. — [NBER WP 9246](https://www.nber.org/papers/w9246.pdf)
- **Brown, Call, Clement & Sharp (2015), survey.** The survey covered 365 sell-side analysts, with 18 follow-up interviews. The stock-recommendation version asked how often each valuation model is used to support recommendations (N = 181 possible), on a 0–6 scale where "always" means 5 or 6. Results: P/E or PEG, 61.33% always (mean 4.42); "cash flow model", 60.22% always (mean 4.37); dividend discount model, 12.22%; earnings-momentum/surprise model, 9.44%; EVA, 7.73%; residual income model, 4.97%; price/volume (technical) model, 2.76%. Only P/E/PEG and cash-flow models score significantly above the scale midpoint. The authors stress that reliance on P/E or PEG makes the analyst's EPS forecast the key input to the target. — [Brown, Call, Clement & Sharp, SSRN WP March 2013](https://shareholderforum.com/ACCESS/Library/20130300_Brown-Call-Clement-Sharp.pdf); [JAR 2015 record](https://academicnewsletter.sufe.edu.cn/info/413237)
- **Demirakos, Strong & Walker (2004).** 104 reports from international investment banks on 26 large (UK-listed) companies. Analysts typically pick either a P/E model or an explicit multi-period DCF as their *dominant* model. None used price-to-cash-flow as the dominant model. Use of comparables varies by sector, and some analysts who build explicit DCF models still rely on a comparative model. — [Lancaster eprints record, Accounting Horizons 18(4):221–240](https://eprints.lancs.ac.uk/id/eprint/43896)
- **Bradshaw (2002).** "The use of target prices to justify sell-side analysts' stock recommendations," Accounting Horizons 16(1):27–41. A secondary source says it shows targets are often a P/E multiple applied to forward earnings estimates; the primary text was not retrieved. — [Bradshaw CV (citation)](https://ccc.bc.edu/content/dam/bc1/schools/carroll/faculty/PDFs/Bradshaw,%20Mark%20CV.pdf)
- Brown et al. (2015) report that industry knowledge is the most important input to both earnings forecasts and stock recommendations. Private communication with management ranks above the analyst's own primary research and recent 10-K/10-Q filings. — [Brown et al. WP](https://shareholderforum.com/ACCESS/Library/20130300_Brown-Call-Clement-Sharp.pdf); [Temple Fox news summary](https://www.fox.temple.edu/news/despite-regulations-financial-analysts-say-private-calls-executives-are-essential)

### Inferences
- A credible LLM report should show a primary multiples-based target (forward P/E or EV/EBITDA against peers and history) and a DCF cross-check. A DCF-only target would look unlike real sell-side practice. Using familiar methods matters for credibility, not for accuracy: none of the studies found that the method improves hit rates.
- The target is a forward multiple times a forward EPS estimate. Errors in the EPS forecast and in the multiple assumption therefore compound, so the app should show both inputs explicitly (multiple × EPS = target) so they can be graded separately.
- A proprietary or unusual valuation method was the only method linked to lower accuracy in Asquith et al. This argues for transparent, standard methods.

### Gaps
- No study retrieved gives separate usage shares for EV/EBITDA vs P/E, or any share for sum-of-the-parts (SOTP). Asquith et al. combine EBIT/EBITDA multiples with P/E. SOTP use (common for conglomerates and banks) is not quantified in the sources found.
- Exact tables and percentages from Demirakos et al. (2004) and Bradshaw (2002) were not retrieved; only abstract-level findings are verified.
- No post-2015 content study of valuation methods in US large-cap reports was found.

## 2. What is the typical structure of a bank initiation or update report, and how are ratings defined and distributed?

### Takeaway
A sell-side report has three summary outputs (a rating, a 12-month price target, and multi-year EPS forecasts), followed by written justification, a valuation section, risks to the target, and a regulatory disclosure appendix. In the US, FINRA Rule 2241 sets much of that appendix: rating definitions, the firm-wide rating distribution, a price-target history chart, the valuation method, risks to the target, and conflicts. Large banks define ratings *relative* to the analyst's coverage universe, not as absolute return calls.

### Cited Findings
- **Report contents (Asquith et al., 1997–1999).** 100% of reports contain a summary recommendation. 99.1% contain current-year EPS and 95.3% at least one later year. Only 72.6% contain a price target: over 90% of strong buy/buy reports but only 11.1% of hold reiterations. 28.5% include income-statement forecasts, 17.1% cash-flow-statement forecasts and 5.1% balance-sheet forecasts. Segment data appears in 10.0%, product in 4.2% and geographic in 3.6%. 97% contain written justifications, coded on 16 criteria (value, relative value, sales growth, earnings growth, new products, cost efficiencies, M&A, management, competition, risk and others). Reiterations make up 65.6% of reports. — [NBER WP 9246](https://www.nber.org/papers/w9246.pdf)
- In Asquith et al., 52.5% of covered firms had an underwriting relationship with the analyst's brokerage, and the bank held the stock in 84.2% of cases. Downgrades are slightly less likely to come with an underwriting relationship (46.4%). The coefficient on the brokerage–firm relationship proxy is negative, which suggests the market discounts good news from non-independent banks. — [NBER WP 9246](https://www.nber.org/papers/w9246.pdf)
- **FINRA Rule 2241 disclosure requirements.**
  - (c)(1)(B): every rating or price target must have "a reasonable basis", explain the valuation method, and fairly present the risks that could stop the target being reached.
  - (c)(2): each rating must be defined in every report, including time horizon and benchmark, and be consistent with its plain meaning.
  - (c)(2)(A)–(C): each rated report must show the percentage of all rated securities in buy, hold and sell, plus the percentage in each category that were investment-banking clients in the prior 12 months, current to the latest quarter-end.
  - (c)(3): a line chart of daily closing prices marking every rating and price-target change, covering the shorter of the rating period or 3 years.
  - (c)(4): conflict disclosures, including 1%+ beneficial ownership, investment-banking compensation, market making and analyst holdings, placed on or referenced from the front page.
  - (b)(2)(I): quiet periods of 10 days after an IPO and 3 days after a secondary offering the firm managed.
  - [FINRA Rule 2241](https://www.finra.org/rules-guidance/rulebooks/finra-rules/2241)
- **Morgan Stanley rating definitions** (from a search snippet of the disclosures page; the live page timed out on fetch). Overweight, Equal-weight and Underweight are judged against the average total return of the analyst's industry (or country MSCI index) coverage universe, risk-adjusted, over the next 12–18 months. Unless stated otherwise, price targets have a 12–18-month horizon. The firm says its ratings are not equivalent to buy, hold and sell, but for regulatory distribution purposes Equal-weight and Not-Rated count as Hold. — [Morgan Stanley Research Disclosures](https://www.morganstanley.com/eqr/disclosures/webapp/generalresearch)
- **Goldman Sachs.** At its November 2002 switch to a three-tier system, ratings were relative to the analyst's coverage universe. The launch distribution across 1,874 securities was 26% Outperform, 52% In-Line and 22% Underperform. Goldman later renamed the tiers Buy/Neutral/Sell; this rename was not verified from a primary source here. Figures are from a search snippet; the page returned 403 on fetch. — [Goldman Sachs press release, 4 Nov 2002](https://www.goldmansachs.com/pressroom/press-releases/2002/2002-11-04)
- Asquith et al. (2002 WP) note that around 2002 Merrill Lynch and Goldman cut from five rating levels to three and began requiring price targets with positive ratings, along with a chart of past rating and target changes. Rule 2241 later made that chart mandatory. — [NBER WP 9246](https://www.nber.org/papers/w9246.pdf)
- **Market-wide distribution today (FactSet, S&P 500).** In late June 2025 there were 12,319 ratings on S&P 500 stocks: 56.4% Buy, 38.7% Hold, 4.9% Sell. The 5-year month-end average Buy share was 55.1%. Buy share was 53.6% at end-October 2024 and 55.7% in late March 2025. Figures are from search snippets of FactSet Earnings Insight PDFs. — [FactSet Earnings Insight, 27 Jun 2025](https://advantage.factset.com/hubfs/Website/Resources%20Section/Research%20Desk/Earnings%20Insight/EarningsInsight_062725C.pdf); [FactSet Earnings Insight, 20 Mar 2025](https://advantage.factset.com/hubfs/Website/Resources%20Section/Research%20Desk/Earnings%20Insight/EarningsInsight_032025.pdf)

### Inferences
- For credibility, the app's report should follow this order:
  - A cover with rating, 12-month target and bear/base/bull range.
  - Investment thesis.
  - Estimates table (EPS for FY1/FY2/FY3, with revenue and margins).
  - Valuation section naming the method and its inputs.
  - Catalysts.
  - Risks to the price target.
  - A disclosure appendix with rating definitions, the app's own rating distribution across its 500 names, and a price/target history chart.
  This mirrors Rule 2241 even though a non-broker app is not bound by it.
- The app has to choose between absolute ratings ("Buy = expected total return > X%") and relative ratings ("Overweight vs S&P 500 or sector over 12 months") and state the choice explicitly. Banks use relative definitions, which makes "grading against outcomes" a relative-return test, not an absolute one.
- Publishing its own Buy/Hold/Sell distribution next to the street's (about 56/39/5 on the S&P 500) would let users see whether the app's model shares the street's optimism.

### Gaps
- **Morgan Stanley risk-reward framework.** Its published bull/base/bear values with scenario descriptions shown on a chart could not be documented from a primary or reliable source before the search budget ran out. It is widely seen in MS reports, but no public methodology document was retrieved.
- J.P. Morgan rating definitions (Overweight/Neutral/Underweight, relative to the analyst's coverage universe) and current Goldman and Morgan Stanley rating-distribution percentages were not retrieved from primary pages: Goldman returned 403 and Morgan Stanley timed out.
- No content analysis of post-2015 initiation-report structure (page counts, section ordering, scenario analysis prevalence) was found.

## 3. How accurate are price targets?

### Takeaway
Twelve-month price targets are optimistic and imprecise. In US data for 2000–2009, about 38% were met at the end of the 12-month horizon and about 64% at some point during it. Implied returns exceeded realised returns by about 15 percentage points on average, and the mean absolute error was about 45%. The more upside a target implies, the less likely it is to be hit. Analysts show only weak persistent differences in target accuracy.

### Cited Findings
- **Bradshaw, Brown & Huang (2013), RAST 18(4):930–955.** US 12-month targets, 2000–2009.
  - About 38% of targets are met at the end of the 12-month horizon and about 64% at any time during it.
  - Target-implied returns exceed actual returns by 15% on average.
  - Absolute target-price errors average 45%.
  - Evidence of persistent differences in target-forecasting ability between analysts is "statistically significant but economically weak". The market does not react differently to target revisions from analysts with better past accuracy.
  - (Verified from the abstract; the full text was not retrieved, so the number of targets is not confirmed.) — [IDEAS/RePEc abstract, BBH 2013](https://ideas.repec.org/a/spr/reaccs/v18y2013i4d10.1007_s11142-012-9216-5.html)
- **Earlier working-paper version (Bradshaw & Brown, March 2005).** About 100,000 twelve-month targets from Thomson Financial, 1997–2002. Prices were at or above target at 12 months only 26% of the time and reached the target at any point 35% of the time, much lower than the published 2000–2009 figures. Targets were more likely to be met in strong markets, for experienced analysts and for large brokers. They were less likely to be met for higher implied upside and more volatile stocks. — [CXO Advisory summary](https://www.cxoadvisory.com/investing-expertise/do-stocks-ever-hit-analyst-target-prices). Note that the WP and published figures differ substantially, likely because of different sample periods and definitions; cite the published 38%/64%.
- **Asquith, Mikhail & Au (2005).** 818 targets, 1997–1999, All-America analysts, US. A target counts as accurate if the price touches it at any time within 12 months.
  - 54.28% were achieved.
  - Targets that were missed got, on average, to 84% of the target (maximum price over the target).
  - Targets that were achieved were overshot by about 37% on average.
  - Targets implying 0–10% upside were hit 74.42% of the time and 10–20% upside 59.57%. Those implying 70%+ upside were hit in under 25% of cases.
  - Of 22 below-current-price targets, 20 were achieved.
  - The average implied upside was 32.9% overall: 36.6% for reiterations, 28.9% for upgrades and 19.1% for downgrades. Even a downgrade to hold carried +5.5% average implied upside.
  - The sample period was a strongly rising market (1997–1999); the authors leave it to the reader whether this is good accuracy.
  - [NBER WP 9246](https://www.nber.org/papers/w9246.pdf)
- **Bonini, Zanetti, Bianchini & Salvi (2010), JBFA 37(9–10):1177–1217.** Italian stocks. The paper builds a multi-layer accuracy metric. Forecast errors are larger for bigger predicted gains, larger firms and loss-making firms. Heavier analyst coverage and stronger prior momentum are associated with *lower* accuracy. A secondary summary reports errors "as high as 36.6%", which the authors read as systematic bias. — [Stevens research record](https://researchwith.stevens.edu/en/publications/target-price-accuracy-in-equity-research/); [Bocconi IRIS record](https://iris.unibocconi.it/handle/11565/3719659)
- The authors' 2008 companion paper cites the 2006 working-paper version of their accuracy study. It reports mean target prediction errors of 46.81% for strong buys, 31.98% for buys and 4% for sells. It also finds a significant positive relation between errors and ex-ante implied returns. — [Bianchini, Bonini, Salvi & Zanetti, "Portfolio Returns and Target Prices," EFMA 2008](https://www.efmaefm.org/0EFMAMEETINGS/EFMA%20ANNUAL%20MEETINGS/2008-Athens/papers/Bonini.pdf)
- Asquith et al. find that target-price revisions move prices more than comparable EPS-forecast revisions. Once all report contents are considered together, EPS revisions are partly subsumed, so targets carry information even though they are inaccurate. — [NBER WP 9246](https://www.nber.org/papers/w9246.pdf)
- A 2025 study summarised by CXO Advisory reports that weighting analyst-covered stocks by target-implied predicted returns produced 2.36% annualised alpha versus an equal-weighted portfolio of all covered stocks. This is a secondary teaser summary only; authors, sample and costs were not verified. — [CXO Advisory](https://www.cxoadvisory.com/investing-expertise/do-stocks-ever-hit-analyst-target-prices)

### Inferences
- **Grading metrics.** The app should report, per report and in aggregate:
  - (a) whether the price was at or beyond the base target at month 12 (sell-side benchmark about 38%);
  - (b) whether it touched the target at any time within 12 months (benchmark about 64% for 2000–2009 and 54% for 1997–1999 All-Americans);
  - (c) signed and absolute percentage error at month 12 (sell-side benchmark: about +15 points optimism, 45% mean absolute error);
  - (d) whether the realised price fell inside the bear–bull range, a coverage test the sell-side literature does not provide.
  "Touch" metrics flatter accuracy a lot relative to end-of-horizon metrics, so both should be shown.
- Hit rates fall sharply as implied upside rises. A base case implying 30%+ upside on an S&P 500 name should therefore be treated as low-probability by construction. The base-case implied return distribution should be calibrated, for example by shrinking toward the market's expected return, rather than copying sell-side optimism.
- The sell-side literature has no clear evidence that analysts persistently differ in target-forecasting skill, so even a modestly calibrated model could match or beat consensus on absolute error.

### Gaps
- The full text of Bradshaw, Brown & Huang (2013) was not retrieved: sample size, large-cap subsample results and signed versus absolute error by rating are unverified.
- Bonini et al. (2010) sample period and exact headline figures were not verified from the published paper.
- Later target-price studies (for example Dechow & You 2020 on determinants of target-implied returns, Da & Schaumburg 2011 on within-industry relative target-implied returns) could not be retrieved before the search budget ran out. No evidence was found on large-cap-specific (S&P 500) target accuracy, or on how often realised prices fall inside published bull–bear ranges.

## 4. Do recommendations and recommendation changes predict returns? How much is left after costs, and what changed after the 2003 Global Settlement and MiFID II?

### Takeaway
Recommendation *changes* move prices at announcement, with some drift afterwards, strongest for downgrades and sells. Consensus *levels* earned gross abnormal returns of about 4% a year in 1985–1996, but nothing reliable after trading costs and nothing among the few hundred largest firms. After 2003, post-revision drift has been found to be indistinguishable from zero, and investors respond better to banks that issue fewer Buys. The value of ratings for US large caps is mostly in the information they carry at announcement, not in a tradable signal.

### Cited Findings
- **Womack (1996), JF 51(1):137–167.** New buy and sell recommendations from major US brokers: 1,573 changes by the top 14 research departments, 1989–1991, per Barber et al. 2001. Post-event drift averages +2.4% for buys and is short-lived; for sells it averages −9.1% and lasts six months. — [IDEAS abstract](https://ideas.repec.org/a/bla/jfinan/v51y1996i1p137-67.html). Three-day size-adjusted announcement returns, as reported by Asquith et al.: +2.98% for additions to strong buy, −1.94% for removals from strong buy, −4.69% for additions to strong sell, +0.32% for removals from strong sell. — [NBER WP 9246](https://www.nber.org/papers/w9246.pdf)
- **Barber, Lehavy, McNichols & Trueman (2001), JF 56(2):531–563.** Zacks data, 1985–1996: over 360,000 recommendations from 269 brokers and 4,340 analysts.
  - Buying the most favourably rated stocks earned 18.8% a year (annualised geometric) against 5.78% for the least favourable and 14.5% for the value-weighted market. That is a raw spread of 102 bp a month.
  - After controlling for market, size, book-to-market and momentum, gross abnormal returns were +4.13% a year for the top portfolio and −4.91% for the bottom, about 75 bp a month long-short.
  - Daily rebalancing drives annual turnover of 433–478%. At an estimated 1.31% round-trip cost (4.12% for neglected stocks), abnormal *net* returns are "not reliably greater than zero".
  - Delaying the reaction by a week or half a month cuts the top-portfolio gross alpha to about 2%.
  - The effect is concentrated in small firms: "among the few hundred largest firms we find no reliable differences" between top- and bottom-rated stocks.
  - The least-favoured portfolio skews to small caps, consistent with reluctance to put Sells on large firms that could bring banking business.
  - [Barber et al. 2001 full text](https://www.econ.sdu.edu.cn/__local/7/26/CB/D35D313131640B8A5AA5DC9E205_D1BDD5A4_2B8A0.pdf?e=.pdf); [IDEAS](https://ideas.repec.org/a/bla/jfinan/v56y2001i2p531-563.html)
- **Jegadeesh, Kim, Krische & Lee (2004), JF.** Secondary sources describe two results. Changes in consensus recommendation predict future returns. The level of the consensus loses significance once price and earnings momentum and other quantitative signals are controlled for, because analysts tend to favour "glamour" stocks. A 2010 Financial Management paper notes that the 2004 study formed portfolios quarterly and held them for 6 months, which may understate value. The primary abstract was not retrieved: the publisher returned 403. — [Financial Management 2010 paper (Deep Blue)](https://deepblue.lib.umich.edu/bitstream/handle/2027.42/79054/j.1755-053X.2010.01083.x.pdf)
- **Barber, Lehavy, McNichols & Trueman (2006), JAE 41:87–117.**
  - The share of Buy ratings fell steadily from mid-2000. The authors attribute this at least partly to NASD Rule 2711, which required firms to publish their rating distributions.
  - Upgrades to Buy from brokers with the *smallest* share of Buys significantly outperform those from brokers with the largest. Downgrades to Hold or Sell from those brokers significantly underperform. — [Stanford GSB abstract](https://www.gsb.stanford.edu/faculty-research/publications/buys-holds-sells-distribution-investment-banks-stock-ratings)
  - The sample was 438,000 recommendations on more than 12,000 firms by 463 brokers. The figure of about 50 bp a month comes from secondary coverage, not the abstract. — [University of Michigan press release](https://news.umich.edu/stock-buy-recommendations-from-brokers-who-seldom-give-such-advice-fare-better)
- **2003 Global Research Analyst Settlement.** Agreed in principle on 20 Dec 2002, announced 28 Apr 2003, final judgments 31 Oct 2003. Ten firms settled: Bear Stearns, Citigroup/SSB, CSFB, Goldman, J.P. Morgan, Lehman, Merrill, Morgan Stanley, UBS Warburg and Piper Jaffray. Deutsche Bank and Thomas Weisel settled in 2004. Payments were $487.5m in penalties, $387.5m in disgorgement, $432.5m for independent research and $80m for investor education, about $1.4bn in total. — [SEC Global Settlement page](https://www.sec.gov/spotlight/globalsettlement.htm)
- **Altınkılıç, Hansen & Ye (2016), JFE 119(2):371–398.** For 2003–2010, the era of high-frequency algorithmic trading, average post-revision return drift after recommendation changes "is no longer significantly different from zero". The authors link this to lower trading frictions and a smaller information-production role for analysts. — [IDEAS abstract](https://ideas.repec.org/a/eee/jfinec/v119y2016i2p371-398.html)
- **FactSet S&P 500 quintile test (one year, June 2017–June 2018).** The quintile with the most Buy ratings (average 78.6% Buy) returned +17.5% on average and +17.1% median. The quintile with the fewest Buys (15.6%) returned +12.0% average and +6.5% median. The top three quintiles beat the bottom two, but Q4 was the worst performer. This is a single-year, gross, unadjusted comparison. FactSet's headline "Lowest % Buy are top performers in 2018" shows the result flips from year to year. — [FactSet Insight, 18 Jun 2018](https://insight.factset.com/how-have-analysts-performed-relative-to-their-stock-ratings); [FactSet Insight 2018 counter-example](https://insight.factset.com/sp-500-companies-with-lowest-percent-of-buy-ratings-are-top-performers-in-2018)
- **MiFID II (research unbundling, January 2018).**
  - Fang, Hope, Huang & Moldovan (2020, RAST), difference-in-differences: sell-side coverage of European firms fell, especially for firms less important to the sell-side. Individual analyst forecasts became *more* accurate, recommendations drew larger market reactions, and buy-side firms did more research in-house. — [BI Open record](https://biopen.bi.no/bi-xmlui/handle/11250/2992577)
  - Lang, Pinto & Sul (2024, JAE): high-quality analysts (more accurate, experienced, senior) were more likely to leave the sell-side for the buy-side. Those who stayed made more informative forecasts, and firms replaced lost coverage with more investor-relations events. — [IDEAS](https://ideas.repec.org/a/eee/jaecon/v77y2024i1s0165410123000411.html)
  - ESMA's Securities and Markets Stakeholder Group (2025) summarises the literature as showing better forecast accuracy, alongside higher analyst workloads and "juniorization". — [ESMA SMSG advice, Feb 2025](https://www.esma.europa.eu/sites/default/files/2025-02/ESMA24-229244789-5256_SMSG_advice_on_Research_provisions.pdf)

### Inferences
- For S&P 500 names, the best evidence (Barber et al. 2001 on large firms; Altınkılıç et al. 2016 after 2003) suggests the *level* of a Buy/Hold/Sell rating has little or no net-of-cost predictive value. The app should not market its ratings as alpha-generating. It should grade them honestly against relative returns (stock minus S&P 500 or sector ETF over 12 months) and present them as a summary of the thesis.
- Barber et al. (2006) show that a broker with a stingy rating distribution has more informative upgrades. An app that issues few Buys is more credible, and its Buys are more likely to be informative.
- MiFID II evidence suggests fewer analysts with less conflicted incentives produce better forecasts. That supports an independent, non-banking-conflicted app, provided it is transparent.

### Gaps
- Barber, Lehavy, McNichols & Trueman (2003, FAJ, "Prophets and Losses") reportedly found that in 2000–2001 the most-recommended stocks badly underperformed the least-recommended. Exact figures were not verified.
- Kadan, Madureira, Wang & Zach (2009, RFS) on the Global Settlement's effect on rating optimism and informativeness was not retrieved.
- Loh & Stulz (2011) on which recommendation changes are influential, and Bradley et al. (2014) on intraday timing, were not retrieved.
- No study retrieved gives net-of-cost returns to recommendation strategies for 2010–2026 or for S&P 500 constituents specifically. FactSet's quintile notes are single-year and gross.
- Changes after 2024 (UK FCA re-permitting bundled research payments in 2024; the EU Listing Act loosening unbundling) were not researched.

## 5. How accurate are analyst earnings forecasts versus time-series models, and do estimate revisions predict returns?

### Takeaway
Analysts beat a random walk for short-horizon EPS forecasts of large, mature, stable firms, which describes most of the S&P 500. That advantage disappears for longer horizons, small or young firms, losses and large EPS changes. For 2- to 3-year earnings, simply extrapolating analysts' 1-year-ahead forecast does best. Analysts revise slowly, and that slowness is part of why earnings-revision and earnings-surprise momentum predict returns.

### Cited Findings
- **Bradshaw, Drake, Myers & Myers (2012), RAST 17(4):944–968.** Simple random-walk forecasts are *more* accurate than analysts' annual EPS forecasts over longer horizons, for smaller or younger firms, and when analysts forecast negative EPS or large EPS changes. A naive extrapolation of the analyst 1-year-ahead forecast is the most accurate predictor of 2- and 3-year-ahead earnings. The authors conclude that prior claims of analyst superiority are "incomplete, misleading, or both". — [IDEAS abstract](https://ideas.repec.org/a/spr/reaccs/v17y2012i4d10.1007_s11142-012-9185-8.html)
- A later Brazilian study's literature table, attributing these to Bradshaw et al. (2012): analyst superiority falls with fewer analysts, more volatile earnings and smaller firms, and rises with firm age. This is secondary. — [Scielo RAM](https://www.scielo.br/j/ram/a/h9ykx9zyYMPkRLBmrS8mjSM/?lang=en)
- **Chan, Jegadeesh & Lakonishok (1996), JF 51(5):1681–1713.** Past returns and past earnings surprises each predict future returns after controlling for the other, and for market, size and book-to-market. Stocks with strong price and earnings momentum show little later reversal. Analysts' earnings forecasts adjust sluggishly to past news, especially for the worst past performers, which the authors read as gradual absorption of information. — [IDEAS abstract](https://ideas.repec.org/a/bla/jfinan/v51y1996i5p1681-1713.html)
- **Asquith et al. (2005).** EPS-forecast revisions move prices, but target-price revisions have a larger and more significant effect. Once report text and target changes are included, the significance of EPS revisions falls. — [NBER WP 9246](https://www.nber.org/papers/w9246.pdf)
- **Brown et al. (2015).** Analysts say their main motivation for accurate EPS forecasts is to use them as inputs to recommendations. Forecast accuracy is among the *lowest*-rated drivers of their pay. Predictability of a company's earnings is the lowest-rated factor in coverage decisions. 24% report research-management pressure to *lower* EPS forecasts, which the authors link to the "walk-down" to beatable numbers (Richardson et al. 2004). — [Brown et al. WP](https://shareholderforum.com/ACCESS/Library/20130300_Brown-Call-Clement-Sharp.pdf)
- **Bradshaw & Brown (2005 working paper, later Bradshaw, Brown & Huang 2013).** According to CXO's summary of the working paper, analysts show persistent differences in EPS-forecasting and stock-picking ability but not in target-price forecasting. — [CXO Advisory summary](https://www.cxoadvisory.com/investing-expertise/do-stocks-ever-hit-analyst-target-prices)

### Inferences
- For S&P 500 companies, consensus FY1 EPS is a strong benchmark that a model working only from SEC filings is unlikely to beat at short horizons. The app should anchor near-term EPS to consensus, or show its own estimate against consensus, and be humble about FY2–FY3, where naive extrapolation works as well.
- Because earnings revisions drift, an "estimate momentum" panel (direction of consensus revisions over the past 1–3 months) is a defensible, evidence-backed signal to show. It is more defensible than the rating level.
- The walk-down pattern means grading EPS forecasts against reported results should use forecasts frozen at report date. Late-quarter consensus is biased toward beatable numbers.

### Gaps
- Classic studies of analyst superiority over time-series models (Brown, Hagerman, Griffin & Zmijewski 1987; O'Brien 1988), and the size of revision drift after 2003 or among large caps, were not retrieved. Exact effect sizes for revision-momentum strategies (for example Givoly & Lakonishok 1979; Stickel 1991) are not documented here.
- Recent evidence on whether earnings-revision momentum survives costs in US large caps after 2010 was not found.
- No primary figures were retrieved for mean absolute EPS forecast error among S&P 500 firms.

## 6. What are the known biases, and what is the typical Buy/Hold/Sell distribution?

### Takeaway
Sell-side output leans systematically optimistic. Ratings are skewed to Buy: about 55% Buy, 39% Hold and 6% Sell historically, and about 56/39/5 for the S&P 500 in 2025. Targets imply about 15 points more return than is realised, and analysts drop or avoid targets on negative calls. Analysts are paid mainly for client service and management access, not accuracy, and some report pressure from research management.

### Cited Findings
- Mikhail, Walther & Willis (2002), cited in Asquith et al.: about 55% of all recommendations are buys or strong buys, 39% holds and only 6% sells or strong sells. In Asquith's All-America sample, 40.0% are buy and 28.7% hold; strong buy takes most of the rest. — [NBER WP 9246](https://www.nber.org/papers/w9246.pdf)
- **S&P 500, 2025 (FactSet).** 56.4% Buy, 38.7% Hold, 4.9% Sell across 12,319 ratings in June 2025; the 5-year average Buy share is 55.1%. At company level, Amazon had 97% Buy, while Expeditors had 44% Sell and Garmin 40% Sell. From search snippets. — [FactSet Earnings Insight, Jun 2025](https://advantage.factset.com/hubfs/Website/Resources%20Section/Research%20Desk/Earnings%20Insight/EarningsInsight_062725C.pdf)
- **Optimism in targets.**
  - Target-implied returns exceed realised returns by 15 percentage points on average (2000–2009). — [BBH 2013 abstract](https://ideas.repec.org/a/spr/reaccs/v18y2013i4d10.1007_s11142-012-9216-5.html)
  - Average implied upside was 32.9% in 1997–1999 All-America reports. Downgrades to hold still implied +5.5%. — [NBER WP 9246](https://www.nber.org/papers/w9246.pdf)
- **Targets omitted on bad news.** Price targets appear in over 90% of buy and strong-buy reports but only 11.1% of hold reiterations and 50.6% of hold downgrades. 62.8% of downgrades without a target had one in the prior report. — [NBER WP 9246](https://www.nber.org/papers/w9246.pdf)
- **Reluctance to issue Sells on large firms.** The least-favourably-rated portfolio skews to small firms, "consistent with the conventional wisdom that analysts are more reluctant to issue sell recommendations for the larger firms, as they are more likely to generate future investment banking business." — [Barber et al. 2001](https://www.econ.sdu.edu.cn/__local/7/26/CB/D35D313131640B8A5AA5DC9E205_D1BDD5A4_2B8A0.pdf?e=.pdf)
- **Incentives and pressure (Brown et al. 2015).**
  - 24% (15%) of analysts report research-management pressure to issue *lower* EPS forecasts (*less* favourable recommendations). 17% (24%) report pressure for *higher* forecasts (*more* favourable recommendations).
  - 82.7% say broker or client votes are very important to their careers, against 37.3% for Institutional Investor rankings. One interviewee said 25% of the bonus pool is allocated on broker votes.
  - Accuracy and timeliness of EPS forecasts and profitability of recommendations are the lowest-rated pay determinants. Industry knowledge is the highest.
  - Analysts say issuing below-consensus forecasts or recommendations is most likely to *raise* their credibility with clients.
  - [Brown et al. WP](https://shareholderforum.com/ACCESS/Library/20130300_Brown-Call-Clement-Sharp.pdf)
- **Bank conflicts.** 52.5% of covered firms in Asquith's sample had an underwriting relationship with the analyst's bank, and the market discounts good news from such banks. — [NBER WP 9246](https://www.nber.org/papers/w9246.pdf)
- **Regulatory responses.**
  - NASD Rule 2711 (now FINRA Rule 2241) mandated published rating distributions, which coincided with a steady fall in Buy share from mid-2000. — [Barber et al. 2006 abstract](https://www.gsb.stanford.edu/faculty-research/publications/buys-holds-sells-distribution-investment-banks-stock-ratings)
  - The Global Settlement imposed about $1.4bn in payments, including $432.5m for independent research. — [SEC](https://www.sec.gov/spotlight/globalsettlement.htm)
- **Model-choice bias.** Analysts rely on P/E or PEG, and the stock prices of their covered firms appear to reflect these simple models more than residual-income value. — [Brown et al. WP](https://shareholderforum.com/ACCESS/Library/20130300_Brown-Call-Clement-Sharp.pdf)

### Inferences
- Without bank conflicts, the app can target a more balanced rating distribution. If its methodology implies roughly symmetric relative-return expectations against the S&P 500, a credible split might be about one third each, though this is a design choice, not a sourced figure. Ratings defined relative to the index or sector naturally force some Sells.
- The app should always publish a target, including on Hold and Sell calls. That fixes a documented sell-side bias and makes grading complete.
- Showing street consensus (rating mix and mean target) beside the app's call, with the street's documented optimism noted, would make the app look credible and honest.

### Gaps
- Herding evidence (for example Welch 2000; Jegadeesh & Kim 2010, "Do analysts herd?", NBER w12866, surfaced but not read) was not retrieved and quantified.
- Kadan et al. (2009) on post-settlement rating distributions and informativeness was not verified.
- Current Buy/Hold/Sell distributions for individual large banks (from their Rule 2241 disclosure pages) were not retrieved.

## 7. What do buy-side practitioners say about how they use sell-side targets?

### Takeaway
The evidence here is thinner. The buy-side mostly pays the sell-side for industry knowledge and access to company management, rewarding it through broker votes, not for the accuracy of targets or ratings. Rating and target levels are treated as low-value relative to the analysis, and after MiFID II the buy-side moved more research in-house.

### Cited Findings
- Brown et al. (2015) state that, consistent with Institutional Investor surveys of what institutional clients value most, industry knowledge ranks first. The accuracy and timeliness of EPS forecasts and the profitability of stock recommendations rank lowest among determinants of analyst pay. — [Brown et al. WP](https://shareholderforum.com/ACCESS/Library/20130300_Brown-Call-Clement-Sharp.pdf)
- Broker votes are the main way the buy-side rewards the sell-side: commission dollars are allocated by perceived service quality. 82.7% of sell-side analysts call broker votes very important to their careers. — [Brown et al. WP](https://shareholderforum.com/ACCESS/Library/20130300_Brown-Call-Clement-Sharp.pdf)
- An interviewed analyst, paraphrased: investors value an analyst's direct contact with senior management "more than anything", and mentioning a recent call with management makes portfolio managers pay attention. Client demand for information is the top driver of coverage decisions. — [Brown et al. WP](https://shareholderforum.com/ACCESS/Library/20130300_Brown-Call-Clement-Sharp.pdf)
- Asquith et al. quote the practitioner view that ratings and target prices "are just the skin and bones" of research, and that the substance lies in the analysis and detail. Their regressions support this: report text and the strength of arguments carry information beyond the rating. — [NBER WP 9246](https://www.nber.org/papers/w9246.pdf)
- After MiFID II, buy-side firms turned to more in-house research (Fang et al. 2020), and high-quality sell-side analysts moved to the buy-side (Lang, Pinto & Sul 2024). — [BI Open](https://biopen.bi.no/bi-xmlui/handle/11250/2992577); [IDEAS](https://ideas.repec.org/a/eee/jaecon/v77y2024i1s0165410123000411.html)
- The market appears to know that targets are hard to forecast. In Bradshaw, Brown & Huang (2013), announcement returns do not respond differently to target revisions from historically more accurate analysts. — [BBH 2013 abstract](https://ideas.repec.org/a/spr/reaccs/v18y2013i4d10.1007_s11142-012-9216-5.html)

### Inferences
- The most valued part of a report is the narrative: industry context, the thesis and what would change it. An LLM report built from SEC filings can match the filing-based part of this but not management access. The app should play to the analysis and transparency, and present the rating and target as a summary, not the product.
- Since professionals treat targets as noisy, scenario ranges (bear/base/bull) with stated assumptions are probably more useful and more honest than a single point target.

### Gaps
- No direct buy-side survey on how sell-side *price targets* specifically are used was retrieved. Brown, Call, Clement & Sharp (2016, JAE) on buy-side analysts, Institutional Investor All-America survey rankings of attributes, Greenwich Associates data and CFA Institute member surveys were all identified as relevant but not fetched before the search budget ran out.
