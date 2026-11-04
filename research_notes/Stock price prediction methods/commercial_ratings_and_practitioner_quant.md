# Commercial Stock Rating Products and Practitioner Multi-Factor Quant Research

Research date: 2026-11-02. Labels used throughout: **[SELF]** = vendor self-reported; **[INDEP]** = independent or academic; **[BACKTEST]** = hypothetical or backtested; **[LIVE]** = real-time or real-money; **[GROSS]** / **[NET]** = before or after trading costs and fees.

Research-process note for the report writer: this session's shared web-search budget ran out partway through. Primary-source checks on the bank quant desks (Goldman Sachs, J.P. Morgan, Morgan Stanley, BofA "Quant Profiles"), MSCI Barra model documents, S&P DJI SPIVA, IBD's own methodology pages and Value Line's own performance claims could not be completed. These are listed under Gaps rather than filled in from memory.

---

## Q1. How are the major rating products built, and how have they performed?

### Takeaway
Every consumer rating product reviewed advertises large outperformance for its top bucket. Almost all of those numbers are self-reported, equal-weighted, gross of trading costs, and often backtested. Independent or live evidence is far weaker:
- Value Line's edge is not capturable after costs (Choi 2000) and appears to have faded since the early 1990s.
- AAII screens mostly lose significance after costs.
- The only long live, net-of-fee, investable record found, the IBD 50 ETF, returned about 1.9%/yr against about 13.3%/yr for the S&P 500 from 2015 to 2024.

### Cited Findings

**Zacks Rank (earnings-estimate-revision model)**
- **Methodology [SELF].** Zacks reports the "equal weighted performance of a hypothetical portfolio" of Rank #1 stocks.
  - Rebalancing was monthly from January 1988 through December 2013, then weekly from 12/31/13.
  - Results exclude commissions, the average bid-ask spread, price impact and (before 2013) overnight returns on certain month-ends.
  - Zacks states the returns "are not based on a backtest" but on the rank lists clients had at the start of each period. It also says they "are not achievable with actual portfolios" and "are higher than the returns an investor could achieve investing real money." — [Zacks Rank disclosure](https://go.zackspro.com/rank-disclosure)
- **Universe changes [SELF].** Through 1995 the universe excluded ADRs, Canadian-only listings, OTC BB stocks and single-analyst stocks. Single-analyst stocks were included from 1996 to 2007, and all ranked stocks from 2008 on. — [Zacks Rank disclosure](https://go.zackspro.com/rank-disclosure)
- **Third-party attestation [SELF-reported attestation].** Baker Tilly Virchow Krause LLP examined the period from 1988 to April 2, 2018. PKF Mueller examined April 2, 2018 to March 31, 2022. The disclosure does not address survivorship. — [Zacks Rank disclosure](https://go.zackspro.com/rank-disclosure)
- **Headline figure [SELF, GROSS].** The disclosure's comparison figure for the S&P 500 is +11.3%/yr for January 1, 1988 to July 7, 2025, per a search snippet. The fetched page had the Rank #1 annualized figure blank.
  - Zacks-sourced articles cite different "since 1988" Rank #1 averages: ">26%/yr" (2013 article), "31.8%/yr", and "+23.94%/yr" (recent page).
  - The figure drifts with end date and methodology. — [Zacks Rank disclosure](https://go.zackspro.com/rank-disclosure); [Nasdaq/Zacks 2013 article](https://www.nasdaq.com/articles/blackrock-blk-anatomy-success-2013-05-06)
- **Selected calendar years [SELF, GROSS].**
  - 2022: #1 −7.6%, #2 −13.3%, #3 −25.2%, #4 −25.4%, #5 −20.1%, S&P 500 −18.0%. The ranking was not monotonic: #5 beat #3 and #4.
  - 2008: #1 −40.4% vs S&P 500 −37.0%. The top bucket trailed the index. — [Zacks Rank disclosure](https://go.zackspro.com/rank-disclosure)

**Value Line Timeliness Rank**
- **Choi (2000), JFQA [INDEP].** Covers 1965–1996 using factor regressions and size/book-to-market/momentum-matched benchmarks, with post-earnings-announcement-drift cases removed. Value Line rankings show "performance beyond what is predicted by existing models of expected return." After transaction costs, however, profitable capture of the abnormal returns is "doubtful." — [IDEAS/RePEc abstract](https://ideas.repec.org/a/cup/jfinqa/v35y2000i03p485-498_00.html)
- **Literature overview [INDEP].** A review of the literature says most researchers find the anomaly too small to exploit after costs. The academic interest dates to Shelton (1969) and Black (1973).
- **Contrary view [INDEP].** Zhang, Nguyen & Le (2010, *Financial Review*) argue the enigma persists and is not explained by PEAD. — [Half a century of research on Value Line (Emerald review)](https://www.deepdyve.com/lp/emerald-publishing/half-a-century-of-research-on-value-line-a-comprehensive-review-2kg3GXYF5p); [IDEAS: Financial Review 2010](https://ideas.repec.org/a/bla/finrev/v45y2010i2p355-373.html)
- **Decay of the spread [INDEP analysis of SELF data].** CXO Advisory used Value Line's own annual return data for 1965 to 2008 with annual re-sorting.
  - The Group 1 minus Group 5 spread "roughly disappeared" over the sample. The trend slope turned negative in the early 1990s, and the average spread over the last decade (about 1999–2008) was negative.
  - Weekly re-sorting results were excluded because of high, hard-to-estimate frictions. — [CXO Advisory](https://www.cxoadvisory.com/investing-expertise/performance-trend-for-value-lines-timeliness-ranking/)

**Morningstar stock star ratings**
- **Construction [SELF].** The star rating compares market price with the analyst's DCF-based fair value estimate, adjusted for an uncertainty rating. The economic moat rating (none/narrow/wide, defined by returns on invested capital above the cost of capital) feeds the fair value. — [Morningstar Equity Research Methodology](https://s21.q4cdn.com/198919461/files/doc_downloads/press_kits/2014/MorningstarEquityResearch_Methodology.pdf); [Morningstar Moat Rating](https://s21.q4cdn.com/198919461/files/doc_news/archive/Economic-Moat-Rating.pdf)
- **Performance [SELF, dated].**
  - In a 2012 discussion, 1-star stocks trailed 5-star stocks by about 2,600 bp over the trailing three years, though 1-star names did better in Q1 2012. — [Morningstar.ca via search](https://www.morningstar.ca/ca/news/188358/how-our-stock-star-ratings-have-performed-.aspx) (page now redirects; content not re-verified)
  - In-house research by Miller: wide-moat 5-star stocks returned 19%/yr over the 10 years to end-2012, while 1-star wide-moat stocks lost 4%/yr. Not peer-reviewed. — [WealthManagement: Do Economic Moats Beat the Market?](https://www.wealthmanagement.com/investing-strategies/do-economic-moats-beat-the-market-)
- **Moat categories [INDEP, UNVERIFIED].** A web-search summary described Haggard, "Economic Moats and Stock Performance: Is Warren Buffett Wrong?", *Journal of Investing* (April 2026), as controlling for size, age, listing and sector. It reportedly found wide-moat index returns similar to the S&P 500 at all horizons, and value/growth classification a better predictor than moat-based models. No URL for the paper was captured, so treat this as unverified (see Gaps).
- **Do not conflate with fund stars.** Most published Morningstar "star" performance studies cover the fund rating, a different, backward-looking product. Example: a 2003–2015 global study found a 1.03% annualized 5-star-over-1-star premium for equity funds. — [Morningstar fund rating global study](https://www.morningstar.com/content/dam/marketing/shared/research/foundational/780133_The_Morningstar_Rating_for_Funds__Analyzing_the_Performance_of_the_Star_Rating_Globally.pdf)

**S&P Capital IQ, now CFRA, STARS (Stock Appreciation Ranking System, 1 = strong sell to 5 = strong buy)**
- **Performance [SELF, model].** STARS began 1/1/1987 (CFRA states inception 12/31/1986).
  - Through 12/31/2013, 5-STARS stocks rose 3,056% on a price basis vs 663% for the S&P 500.
  - On a total-return basis since 12/31/1992: 1,387% vs 542%.
  - 2013 was the 20th year in 27 that Strong Buys beat the S&P 500. — [S&P Capital IQ press release, Jan 2014](https://press.spglobal.com/2014-01-14-S-P-Capital-IQ-Equity-Research-Top-Picks-Continue-Outperformance-of-S-P-500-Since-Inception); [CFRA FAQ](https://www.cfraresearch.com/faq/)
- **Methodology disclosure [SELF].** Model portfolios with time-weighted returns on daily valuations.
  - Stocks were equally weighted at inception. Additions enter at the category's average value at the prior month-end, with no rebalancing; deletions occur at the close on the deletion date.
  - Dividends are included only since 12/31/2004. Results exclude taxes, commissions and fees; CFRA gives a 1.5% fee example that turns a 33.1% 3-year gross return into 27.2% net.
  - A new analyst process using quantitative tools began 2/3/2014, so CFRA reports a separate chart from 1/31/2014.
  - CFRA concedes shorter periods may not have beaten the S&P 500. — [CFRA STARS performance disclosure](https://www.cfraresearch.com/legal/performance-disclosure-stars-performance-charts)

**Seeking Alpha Quant Ratings**
- **Self-reported backtests [SELF, BACKTEST].** Figures vary by source and date:
  - "over 4,000%" vs about 500% for the S&P 500 since 2010;
  - 4,386% vs 528%, attributed to S&P Global as calculator;
  - 1,754% vs 385%;
  - "since 2009 … +1,734% vs 369%";
  - annualized 26.97% vs 13.53%, with Strong Buys said to have beaten the S&P 500 every year since 2010.
  - Seeking Alpha's sell-rating page describes "a backtested hypothetical portfolio of all the daily 'Strong Sell and Sell' ratings for 14 years from Jan 2010 to Aug 2024." — [Ryan O'Connell review](https://ryanoconnellfinance.com/seeking-alpha-premium-review/); [Financer review](https://financer.com/invest/seeking-alpha-premium-review/); [MoneysMyLife review](https://www.moneysmylife.com/seeking-alpha-quant-rating-review/); [SA Quant Sell Ratings](https://about.seekingalpha.com/quant-sell-ratings)
- **Benchmark [SELF].** Seeking Alpha says the ratings were backtested against the S&P 500 Total Return Index. The full report sits at seekingalpha.com/performance/quant, which was not retrievable. — [SA Help: back-tested](https://help.seekingalpha.com/premium/have-seeking-alphas-quant-ratings-been-back-tested)
- **University of Kentucky study [described as INDEP, known only via SA's own summary].** An April 2024 SA post says a University of Kentucky study led by Russell Jame analyzed seven years of SA quant ratings, recommendations and factor grades. It reports that the ratings predict future returns and correlate strongly with 100+ previously documented return predictors. The paper itself was not located, so effect sizes, period and cost treatment are unverified. — [SA product team post](https://seekingalpha.com/article/4683185-university-of-kentucky-study-finds-seeking-alpha-quant-ratings-beat-the-market-sa-quant)
- **SA's own hedging [SELF].** "No rating system can predict future returns with certainty." — [SA Help: accuracy](https://help.seekingalpha.com/how-accurate-are-seeking-alpha-quant-ratings)

**TipRanks Smart Score**
- **Construction [SELF].** 1–10 score from eight factors, including:
  - ratings of top-performing analysts,
  - hedge fund buying and selling,
  - insider transactions,
  - fundamentals and technicals.
  - Third parties also list blogger and news sentiment. 8–10 = Outperform, 4–7 = Neutral, 1–3 = Underperform.
  - The universe is US stocks with market cap ≥$30M and 3-month average volume ≥$30K on NYSE or Nasdaq.
  - Per Questrade, roughly the top 4% of stocks get a 10, and 6 of the 8 inputs are unique to TipRanks. — [TipRanks Stocks to Buy](https://www.tipranks.com/stocks-to-buy); [Questrade explainer](https://forward.questrade.com/learning/platform-tutorials/researching-investments/research---questrade-trading)
- **Performance [SELF, BACKTEST].** Smart Score 10 stocks since January 2016. Two snapshots of the same page differed:
  - search snippet: total return +461.6%, alpha over the S&P 500 +193.6%, annualized +18.2%;
  - page fetched on 2026-11-02: +433.7%, +157.1%, +16.9%.
  - No as-of date, rebalancing rule, weighting or cost treatment is disclosed. — [TipRanks Stocks to Buy](https://www.tipranks.com/stocks-to-buy)

**Investor's Business Daily (IBD) ratings and the IBD 50**
- **Construction [partial; IBD's own methodology not retrieved].** Ratings are 1–99 percentile ranks. The EPS Rating and Relative Strength Rating carry the most weight in the Composite Rating.
  - The commonly replicated RS formula (40% last 63 trading days, 20% each for the 126/189/252-day windows) comes from a third-party TradingView script, not IBD. — [TradingView RS script](https://www.tradingview.com/script/lsLzfQqs-RS-Rating-Multi-Timeframe); [EliteTrader thread](https://www.elitetrader.com/et/threads/ibd-ranking-system.324604/post-4728570)
- **Live record [LIVE, NET of 0.80% expense ratio].** The Innovator IBD 50 ETF (FFTY) launched April 8, 2015. As of 12/31/2024:
  - since-inception NAV return 1.88%/yr vs 13.29%/yr for the S&P 500;
  - 5-year −2.96%/yr vs 14.53%/yr.
  - A third-party snapshot dated 04/08/26 shows 5-year price performance of −23.74%. — [Innovator FFTY page via search](https://innovatoretfs.com/fund/ffty); [Innovator factsheet](https://innovatoretfs.com/pdf/ffty_factsheet.pdf)
- **Possible relabeling (unverified).** One data site now lists the fund as "CapForce IBD 50 ETF (FFTY)," suggesting a sponsor or name change. — [StockAnalysis](https://stockanalysis.com/stocks/ffty/)

**MarketBeat MarketRank**
- **Construction [SELF].**
  - The overall score compares a company's average category scores with other companies' averages. Categories include analyst coverage (prior 90 days), dividends, ESG, earnings and valuation, short interest, and "MarketBeat follows" (watchlist additions over 30 days).
  - 1–5 stars; 5 is about the 99th percentile. Category weights are not published. — [MarketBeat Top MarketRank](https://www.marketbeat.com/stocks/top-marketrank/)
- **Track record.** No published track record was found for MarketRank.

**Validea guru strategies**
- **Methodology [SELF, mixed BACKTEST and live model, GROSS].**
  - Strategies are Validea's interpretations of published guru strategies, not endorsed by the gurus.
  - 10- and 20-stock equal-weighted portfolios, with four staggered rebalancing schedules (every 4th Friday).
  - No real money and no trading costs. For portfolios with inception on or after 12/30/2005, returns combine back-tested and live model results. — [Validea model portfolio user guide](https://zeusnew.validea.com/aboutus/modelportfoliosuserguide.pdf); [Validea factor portfolios](https://www.validea.com/?aid=251)
- **Performance [SELF].** Annualized since July 2003, as of 5/15/2025, against an 8.5% benchmark:
  - Motley Fool Small-Cap Growth 13.50%;
  - Zweig Growth 12.70%;
  - Graham Value 10.90%;
  - Dreman Contrarian 6.10%.
  - Separately, the Top Five Gurus portfolio is shown at +890.6% cumulative since 2003 and the Validea Hot List at +699.2% (January 2024 update). No independent audit was found. — [Validea blog](https://blog.validea.com/?p=33905); [Top Five Gurus archive](https://archive.validea.com/20230131/topfivegurusportfolio.htm); [Hot List archive](https://archive.validea.com/20240111/valideahotlistportfolio.htm)

**AAII stock screens**
- **Methodology [SELF, BACKTEST, GROSS].** Hypothetical portfolios built from the Stock Investor Pro database, back to the start of 1998. Results exclude commissions and bid-ask spreads.
  - AAII's Piotroski screen first restricts to the lowest 20% price-to-book (stricter than Piotroski's original). Its average monthly turnover since 1998 is 23.1%. — [AAII screening review](https://www.aaii.com/journal/article/2010-year-end-screening-review-across-the-board-gains); [CXO Advisory](https://www.cxoadvisory.com/?p=4199)
- **Schadler & Cotten (2008), *Financial Services Review* [INDEP].** AAII's claim that 91% of screens beat the S&P 500 "overstates the effectiveness" of the screens. After transaction costs, only 32% significantly beat the S&P 500, and only 26% of low-cost strategies significantly beat their best-fit indices. — [FSR abstract](https://openjournals.libs.uga.edu/fsr/article/view/4917)
- **Krauss, Kruger & Beerstecher (2015) [INDEP].** AAII's F-Score screen showed about 24% gross annual return over the prior decade. With 0.2% commissions plus 0.5% spread per round trip, the strategy is "largely impractical" for individuals. — [CXO Advisory summary](https://www.cxoadvisory.com/?p=28363)
- **January 1998 – March 2018 study [INDEP, secondary summary].** Screens averaged a 12.1% gross CAGR vs 7.0–8.5% for benchmarks, falling to 9.4% after 0.5% frictions. — [CXO Advisory summary](https://www.cxoadvisory.com/?p=28363)
- **North & Stevens (2015) [INDEP].** More than 30% of screens earned statistically significant excess returns not explained by transaction costs or multifactor risks. — [FSR: Investment performance of AAII stock screens](https://openjournals.libs.uga.edu/fsr/article/view/3239)

**Analyst recommendations generally (context for any Buy/Hold/Sell product)**
- **Barber, Lehavy, McNichols & Trueman (2001), *Journal of Finance* [INDEP].** Consensus recommendations earn gross abnormal returns. But high trading with daily rebalancing means none of the strategies earns a net excess return reliably above zero after costs. — [CFA Digest summary](https://rpc.cfainstitute.org/-/media/documents/article/cfa-digest/2001/dig-v31-n4-952-pdf.pdf); [Stanford GSB](https://www.gsb.stanford.edu/faculty-research/working-papers/can-investors-profit-prophets-consensus-analyst-recommendations)
- **Barber, Lehavy & Trueman (2007), *Journal of Financial Economics* 85:490–517 [INDEP].** Sample January 1996 – June 2003.
  - Independent research firms' buys beat investment-bank buys by 3.1 bp/day (about 8 pp annualized).
  - Bank holds and sells beat independents' holds and sells by 1.8 bp/day (about 4.5 pp annualized). — [IDEAS/RePEc](https://ideas.repec.org/a/eee/jfinec/v85y2007i2p490-517.html); [UC Davis news](https://www.ucdavis.edu/news/independents-outperformed-banks-stock-advice-study-says)

### Inferences
- The products cluster into three types:
  1. Analyst-judgment ratings: Morningstar (valuation and moat) and CFRA STARS (analyst plus quant inputs since 2014).
  2. Single-signal or price-earnings models: Zacks (estimate revisions), Value Line (earnings and price momentum), IBD (EPS growth plus relative strength).
  3. Multi-factor or alt-data aggregates: Seeking Alpha (factor grades), TipRanks (crowd, insider and fund signals), MarketBeat (analyst coverage and attention).
  - The proposed app's composite score belongs to type 3, and its Buy/Hold/Sell maps onto a FINRA 2241-style rating scale.
- Headline returns at Zacks, Seeking Alpha, TipRanks, Validea and AAII are equal-weighted and gross of costs. Several include micro- and small-caps (TipRanks' floor is a $30M market cap).
  - Anomaly returns are typically concentrated in small, illiquid names (inference; not directly tested here). An S&P 500-only product should therefore expect much smaller spreads than these headlines.
- Independent evidence repeatedly finds that the measured signal is real but small after costs: Value Line (Choi), AAII (Schadler & Cotten; Krauss et al.) and analyst consensus (Barber et al. 2001).
- Edges also appear to decay over time: Value Line's spread has drifted toward zero since the early 1990s.
- The best natural experiment for a "ratings into portfolio" record is FFTY (IBD 50). Live and net of fees, it trailed the S&P 500 by about 11 pp/yr over about 9.7 years.

### Gaps
- The Haggard (2026, *Journal of Investing*) moat study is known only from a search-engine summary; its URL and full text were not retrieved.
- No independent, peer-reviewed test of Morningstar's stock star ratings (as opposed to its fund stars or moat categories) was found. Morningstar's own recent stock-rating performance reports were not retrieved; the Canadian article redirects.
- Current headline Zacks Rank #1 annualized return (through 2025 or 2026) could not be read; the disclosure page left it blank in extraction. No independent academic test of the Zacks Rank itself was found. The Zacks Rank construction (estimate-revision components: agreement, magnitude, upside, surprise) is widely described, but Zacks' page blocked fetching, so it was not verified this session.
- No CFRA STARS performance after 2013 was found.
- Value Line's own current Timeliness performance claims, and the performance of Value Line's mutual funds that tried to implement the ranks, were not retrieved (search budget exhausted).
- The Seeking Alpha / University of Kentucky (Jame) paper was not located. Its effect sizes, sample and cost assumptions are unknown. SA's official quant performance page (seekingalpha.com/performance/quant) returned 403. Construction details, commonly described as five sector-relative factor grades (valuation, growth, profitability, momentum, EPS revisions), were not verified.
- IBD's official Composite/EPS/RS formulas and any IBD-published track record for its ratings were not retrieved. FFTY data after 12/31/2024 from the sponsor was not retrieved, and the possible sponsor change is unconfirmed.
- No track record, self-reported or independent, was found for MarketBeat MarketRank.

---

## Q2. How do these products present their track records, and which practices are credible or misleading?

### Takeaway
Credible practices among these vendors are rare but identifiable:
- time-stamped, non-backtested rank lists with third-party attestation (Zacks);
- explicit cost, dividend and weighting disclosure plus a separate record after a methodology change (CFRA);
- statements that results are unachievable in real portfolios.

Misleading practices are common:
- backtests presented as headline results (Seeking Alpha, TipRanks, AAII, part of Validea);
- splicing backtest onto live (Validea after 2005);
- gross, equal-weighted, high-turnover results;
- cumulative-percent framing over long windows;
- headline numbers that shift between pages;
- reporting only the top bucket.

### Cited Findings
- **Live versus backtest labeling.**
  - Zacks explicitly says its returns "are not based on a backtest" but on the lists clients actually had, and warns they are "not achievable with actual portfolios." — [Zacks disclosure](https://go.zackspro.com/rank-disclosure)
  - Seeking Alpha's sell ratings are presented as a "backtested hypothetical portfolio … Jan 2010 to Aug 2024." — [SA Quant Sell Ratings](https://about.seekingalpha.com/quant-sell-ratings)
  - TipRanks' Smart Score figures are backtested from 2016. — [TipRanks](https://www.tipranks.com/stocks-to-buy)
- **Splicing backtest and live.** For Validea portfolios with inception on or after 12/30/2005, "returns include a combination of back tested and live model returns." — [Validea user guide](https://zeusnew.validea.com/aboutus/modelportfoliosuserguide.pdf)
- **Costs.**
  - Zacks excludes commissions, spreads and price impact, despite weekly rebalancing since 2014. — [Zacks disclosure](https://go.zackspro.com/rank-disclosure)
  - AAII excludes commissions and spreads, with the Piotroski screen turning over 23.1% a month. — [CXO Advisory](https://www.cxoadvisory.com/?p=4199)
  - Validea excludes trading costs. — [Validea user guide](https://zeusnew.validea.com/aboutus/modelportfoliosuserguide.pdf)
  - CFRA excludes fees and commissions but quantifies the drag with an example. — [CFRA disclosure](https://www.cfraresearch.com/legal/performance-disclosure-stars-performance-charts)
- **Benchmark and dividend mismatches.**
  - CFRA includes dividends in STARS returns only since 12/31/2004. Its "price return" record (3,056% vs 663%) compares price-only series.
  - CFRA notes its STARS universe differs from the S&P 500: some stocks were never in the index, and the index excludes ADRs. — [CFRA disclosure](https://www.cfraresearch.com/legal/performance-disclosure-stars-performance-charts); [S&P 2014 release](https://press.spglobal.com/2014-01-14-S-P-Capital-IQ-Equity-Research-Top-Picks-Continue-Outperformance-of-S-P-500-Since-Inception)
  - Zacks notes its S&P 500 comparison figures for 2016–2018 differ from index returns because it uses IVV over 28- or 35-day periods. — [Zacks disclosure](https://go.zackspro.com/rank-disclosure)
- **Universe drift.** Zacks' universe changed in 1996 and 2008. — [Zacks disclosure](https://go.zackspro.com/rank-disclosure)
- **Methodology-change transparency (good practice).** CFRA separately reports performance from 1/31/2014 because a new analyst process began 2/3/2014. — [CFRA disclosure](https://www.cfraresearch.com/legal/performance-disclosure-stars-performance-charts)
- **Third-party verification (good practice).** Zacks' Rank #1 schedules were examined by Baker Tilly (1988 to April 2018) and PKF Mueller (April 2018 to March 2022). Coverage after March 2022 was not shown. — [Zacks disclosure](https://go.zackspro.com/rank-disclosure)
- **Inconsistent headline figures.**
  - Zacks' "since 1988" #1 average has been cited at >26%, 31.8% and 23.94%. — [Nasdaq/Zacks](https://www.nasdaq.com/articles/blackrock-blk-anatomy-success-2013-05-06)
  - Seeking Alpha's Strong Buy cumulative return has been cited at 4,386%, "over 4,000%", 1,754% and 1,734%. — [Ryan O'Connell](https://ryanoconnellfinance.com/seeking-alpha-premium-review/); [MoneysMyLife](https://www.moneysmylife.com/seeking-alpha-quant-rating-review/)
  - TipRanks' page changed from 18.2% to 16.9% annualized between snapshots without an as-of date. — [TipRanks](https://www.tipranks.com/stocks-to-buy)
  - Validea's cumulative and annualized figures differ across pages and dates. — [Validea blog](https://blog.validea.com/?p=33905)
- **Counting bias.** AAII's "91% of screens beat the S&P 500" ignores statistical significance and risk. After costs only 32% significantly beat the index. — [Schadler & Cotten 2008](https://openjournals.libs.uga.edu/fsr/article/view/4917)
- **Top-bucket-only reporting.** Zacks' full #1–#5 table shows non-monotonic years (2022: #5 −20.1% beat #3 −25.2% and #4 −25.4%) and top-bucket losses vs the index (2008: #1 −40.4% vs S&P −37.0%). Marketing usually cites only the #1 average. — [Zacks disclosure](https://go.zackspro.com/rank-disclosure)
- **Live, investable records are the hardest test.** The IBD 50 ETF (FFTY) returned 1.88%/yr net vs 13.29% for the S&P 500 (4/8/2015–12/31/2024). — [Innovator FFTY](https://innovatoretfs.com/fund/ffty)

### Inferences
Design implications for the new app, synthesized from the patterns above:
- Publish only point-in-time, time-stamped ratings, ideally hashed or archived at issue time.
- Never splice backtests onto live results, and label any backtest separately as supplemental (mirrors GIPS; see Q5).
- Report all buckets (Buy/Hold/Sell) and the spread between them, not just Buy.
- Use total-return benchmarks (SPY and sector ETFs) measured over exactly the same windows.
- Show results both equal-weighted and cap-weighted, and both gross and after an explicit cost assumption.
- Show calendar-year or rolling-window tables so bad years are visible.
- Keep a methodology-version log with separate records per version (as CFRA does).
- Show the ratings distribution (percent Buy/Hold/Sell, as FINRA 2241 requires of broker research) and a per-stock rating-history chart.
- Consider periodic third-party verification (as Zacks does).
- Cumulative-percent framing over long windows ("+4,386%") is the least informative and most promotional format. Annualized excess return with confidence intervals and hit rates is more honest.

### Gaps
- No vendor among those reviewed was found to publish Brier scores, calibration curves or confidence intervals for its ratings. That absence is itself notable, but a broader survey was not possible.
- Survivorship and delisting treatment is not disclosed by Zacks, TipRanks, Seeking Alpha or Validea in the material retrieved. Whether delisted stocks' terminal returns are included is unknown.
- No information was found on whether Morningstar, Seeking Alpha or TipRanks publish rating-history charts or ratings-distribution statistics alongside performance.

---

## Q3. What multi-factor stock-selection research have banks and asset managers published? What did they find about combining factors and about US large-cap factor performance over the last decade?

### Takeaway
Asset-manager research (AQR, Research Affiliates) and index providers (MSCI, S&P DJI) support three points:
1. Integrated multi-factor scoring (one composite score per stock) beats mixing single-factor sleeves under tracking-error limits. The cost is higher concentration and turnover.
2. Value suffered a historic drawdown through 2020, partly a measurement problem with intangibles.
3. Over the 10 years to September 2026, US large/mid-cap single-factor indexes roughly matched the cap-weighted market: momentum slightly ahead, enhanced value slightly behind, both with lower Sharpe ratios. Performance was extremely regime-dependent and mega-cap/AI-driven.

Primary research from the Goldman Sachs, J.P. Morgan, Morgan Stanley and BofA quant desks could not be retrieved this session.

### Cited Findings
**Combining factors**
- **AQR, Fitzgibbons, Friedman, Pomorski & Serban, "Long-Only Style Investing: Don't Just Mix, Integrate" (2017).**
  - The paper compares a "portfolio mix" of single-style portfolios with an "integrated" portfolio built from one combined score per asset. It concludes long-only smart-beta investors "should consider integrating styles in portfolio construction." — [AQR paper page](https://www.aqr.com/insights/research/white-papers/long-only-style-investing)
  - A secondary summary says integrated portfolios outperformed mixed ones under tracking-error constraints. — [ai-CIO](https://www.ai-cio.com/news/factor-investing-allocation-vs-integration/)
  - In AQR's companion example, value and momentum holdings overlapped only about 50% between the mix and integrated portfolios. — [Alpha Architect summary](https://alphaarchitect.com/should-investors-combine-or-separate-their-factor-exposures/)
  - Publication venue conflict: one source gives *Journal of Investing* 26(4), Nov 2017, pp. 153–164; AQR's page text says *Journal of Portfolio Management* (Winter 2017). The PDF filename uses "JOI". — [AQR page](https://www.aqr.com/insights/research/white-papers/long-only-style-investing); [ai-CIO](https://www.ai-cio.com/news/factor-investing-allocation-vs-integration/)
- **Research Affiliates counterpoint, "Multi-Factor Design: Mixing vs Integrating" webinar.**
  - Integration has higher absolute return empirically only at high concentration levels.
  - Benefits are stronger with less correlated factors, which pushes toward highly concentrated portfolios.
  - Integration can raise turnover and trading costs. — [Research Affiliates deck](https://www.researchaffiliates.com/documents/2019-webinars/Multi-Factor%20Design-Mixing-vs-Integrating.pdf)

**Value's long drawdown and its measurement**
- **Research Affiliates, Arnott, Harvey, Kalesnik & Linnainmaa, "Reports of Value's Death May Be Greatly Exaggerated," *Financial Analysts Journal* 77(1), 2021.**
  - Value's underperformance stems from (1) book-to-price ignoring increasingly important intangible assets and (2) value stocks' valuations falling relative to growth.
  - Capitalizing intangibles (iHML) would have improved HML by 2.2 pp/yr since 2008.
  - Value's peak relative to growth moves from December 2006 to December 2016 when intangibles are counted.
  - Research Affiliates discloses a commercial interest. — [Research Affiliates](https://www.researchaffiliates.com/insights/journal-papers/reports-of-values-death-may-be-greatly-exaggerated); [IDEAS](https://ideas.repec.org/a/taf/ufajxx/v77y2021i1p44-67.html)

**MSCI factor indexes (index provider; returns NET of withholding tax, no fees; backtested before launch)**
- **MSCI USA Enhanced Value Index (as of 9/30/2026).** Sector-relative value using P/B, forward P/E and EV/CFO; launched 12/12/2014 and backtested before that.
  - Annualized 10-year 13.92% vs 14.75% for MSCI USA; 5-year 16.80% vs 12.86%; 3-year 32.10% vs 22.45%; 1-year 60.87% vs 14.96%; YTD 2026 46.57% vs 12.34%; since 11/28/1997 10.02% vs 8.80%.
  - Calendar years vs MSCI USA:

    | Year | Enhanced Value | MSCI USA |
    |---|---|---|
    | 2016 | 14.98 | 10.89 |
    | 2017 | 21.28 | 21.19 |
    | 2018 | −11.72 | −5.04 |
    | 2019 | 26.50 | 30.88 |
    | 2020 | −1.15 | 20.73 |
    | 2021 | 28.21 | 26.45 |
    | 2022 | −14.76 | −19.85 |
    | 2023 | 13.39 | 26.49 |
    | 2024 | 6.45 | 24.58 |
    | 2025 | 31.85 | 17.31 |

  - 10-year Sharpe 0.64 vs 0.81 for the market; tracking error 7.71%; turnover 36.32%; maximum drawdown 60.04% (6/2007–3/2009) vs 55.36%.
  - Concentration: 146 stocks; Micron Technology is 23.89% of the index (vs 1.82% of the parent); Information Technology is 43.61%. — [MSCI USA Enhanced Value factsheet](https://www.msci.com/documents/10199/255599/msci-usa-enhanced-value-index-usd-net.pdf)
- **MSCI USA Momentum Index (as of 9/30/2026).** Launched 2/15/2013, backtested before that.
  - Annualized 10-year 15.84% vs 14.75%; 5-year 12.96% vs 12.86%; 3-year 30.70% vs 22.45%; 1-year 26.07% vs 14.96%; YTD 27.94% vs 12.34%; since 6/30/1994 13.56% vs 10.71%.
  - Calendar years vs MSCI USA:

    | Year | Momentum | MSCI USA |
    |---|---|---|
    | 2016 | 4.64 | 10.89 |
    | 2017 | 37.24 | 21.19 |
    | 2018 | −2.02 | −5.04 |
    | 2019 | 27.44 | 30.88 |
    | 2020 | 29.18 | 20.73 |
    | 2021 | 12.64 | 26.45 |
    | 2022 | −17.87 | −19.85 |
    | 2023 | 8.98 | 26.49 |
    | 2024 | 31.99 | 24.58 |
    | 2025 | 17.34 | 17.31 |

  - 10-year Sharpe 0.77 vs 0.81; tracking error 8.37%; trailing 12-month turnover 112.67%.
  - Concentration: 125 stocks; Information Technology 52.46%. — [MSCI USA Momentum factsheet](https://www.msci.com/documents/10199/255599/msci-usa-momentum-index-usd-net.pdf)
- **MSCI quality in 2025.** MSCI USA Quality returned 10.44% in 2025 vs 11.81% for MSCI USA in CAD terms. — [MSCI factsheet via search](https://www.msci.com/documents/10199/255599/msci-usa-momentum-index-usd-net.pdf)
- **Cboe mid-2025.** Momentum had the best YTD factor performance and Quality the worst. — [Cboe Canada](https://etfmarket.cboe.com/canada/en/news/factor-investing-in-focus-what-etfs-say-about-mark)

**S&P DJI and Morningstar commentary on recent factor performance**
- **S&P DJI December 2024 dashboard.** Magnificent-7 stocks explained the "vast majority" of Value's underperformance and Growth's outperformance in 2024. — [S&P DJI factor dashboard Dec 2024](https://spglobal.com/spdji/en/documents/performance-reports/dashboard-sp-500-factor-2024-12.pdf)
- **S&P DJI March 2025 Market Measure.** The S&P 500 Low Volatility Index was the best factor index, up 4.7%. Momentum outperformed in 2024 and early 2025. — [S&P DJI Market Measure March 2025](https://spglobal.com/spdji/en/index-tv/article/the-market-measure-march-2025)
- **S&P DJI Indexology, November 2024.** Reviewed the strong recent performance of the S&P 500 Quality-Value-Momentum multi-factor index. Content not read beyond the title. — [Indexology blog](https://www.indexologyblog.com/2024/11/12/a-review-of-the-recent-strong-performance-of-the-sp-500-quality-value-momentum-multi-factor-index/)
- **June/Q2 2026 commentary.** The S&P 500 Enhanced Value Index gained 2.37% in June 2026 while the S&P 500 Value Index was nearly flat (+0.05%). Cap-weighted indexes "masked strength" in momentum, quality and low volatility. — [Advisor Perspectives (S&P DJI commentary)](https://www.advisorperspectives.com/commentaries/2026/07/01/s-p-factor-performance-highlights-momentum-in-june-q2)
- **Morningstar US Quality Factor Index.** Gained 77% cumulatively in 2023–24 vs 59% for the market, then lagged in 2025. Quality and momentum both underperformed in the March–April 2025 selloff. — [Morningstar: Why Quality Stocks Aren't Doing Better This Year](https://global.morningstar.com/en-ca/stocks/why-quality-stocks-arent-doing-better-this-year); [Morningstar: Stock Strategies Paying Off in 2025](https://www.morningstar.com/markets/stock-strategies-that-are-paying-off-2025)
- **MSCI factor classification framework.** MSCI FaCS aggregates 16 factors (e.g., book-to-price, earnings and dividend yield, long-term reversal, leverage, earnings variability, beta) from the Barra global equity model GEMLT into 6 factor groups: Value, Size, Momentum, Quality, Yield and Volatility. — [MSCI factsheet](https://www.msci.com/documents/10199/255599/msci-usa-enhanced-value-index-usd-net.pdf)

### Inferences
- Over the 10 years to September 2026, neither single-factor tilt reviewed beat the cap-weighted US market on a risk-adjusted basis (Sharpe 0.64 for value, 0.77 for momentum, vs 0.81). Returns came in large, regime-specific bursts:
  - momentum in 2017, 2020 and 2024;
  - value in 2016, 2021, 2022 and 2025–26;
  - deep shortfalls in 2020, 2023 and 2024.
- A composite score among S&P 500 names should therefore be judged over long windows and with confidence intervals. Three- to twelve-month excess returns will be dominated by factor-regime noise.
- "Value" and "momentum" indexes in 2026 hold heavy, overlapping positions in AI and semiconductor names. Micron is about 24% of the value index and 5.5% of the momentum index; IT is 44% and 52% respectively.
  - Factor labels are therefore not stable descriptions of style. A factor composite can be implicitly a sector bet unless it is scored sector-relative and capped.
- AQR's integration evidence supports computing one composite score per stock rather than averaging separate factor portfolios. Research Affiliates' caveats imply the benefit comes with concentration and turnover that must be disclosed and costed.

### Gaps
- Not retrieved because the search budget was exhausted:
  - Goldman Sachs (GS quant/factor baskets, GSAM factor research);
  - J.P. Morgan Quantitative and Derivatives Strategy;
  - Morgan Stanley quant research;
  - BofA "Quant Profiles" (Savita Subramanian's team) and its factor-performance tables.
  - Much of this is client-only research.
- MSCI Barra US equity model documentation (e.g., USE4 descriptors) and MSCI's multi-factor index research (e.g., "Foundations of Factor Investing", Diversified Multiple-Factor indexes) were not retrieved.
- Full-year 2025 S&P DJI factor dashboard figures and S&P DJI SPIVA scorecard results were not retrieved; spglobal.com returned 403.
- AQR's quantitative results (information ratios, turnover) for mixed vs integrated portfolios were not read; only the abstract and secondary summaries were.
- The MSCI 2025 Quality figure (10.44% vs 11.81% CAD) comes from a search snippet and was not cross-checked against a USD factsheet.

---

## Q4. How has smart-beta / factor ETF live performance compared with backtests?

### Takeaway
The evidence is consistent and large:
- Smart-beta indexes beat the market by about 3%/yr in their pre-launch backtests (about 4.1%/yr for multi-factor), then trail it by about 0.5–1%/yr once live (Huang, Song & Xiang, JFQA 2024).
- Vanguard found 87% of new indexes beat the market in backfilled history but only 51% after going live.
- Academic anomalies weaken after publication.

The leading explanation is data mining in index construction, which is worst for discretionary multi-factor designs, exactly the category a composite-score product belongs to.

### Cited Findings
- **Huang, Song & Xiang, "The Smart Beta Mirage," JFQA 59(6): 2515–2546 (September 2024) [INDEP].**
  - Market-adjusted returns of smart-beta indexes drop from about 3% "on paper" before ETF listing to about −0.50% to −1% after listing.
  - The drop is not explained by changing factor premia, launch timing or diminishing returns to scale.
  - The authors find "strong evidence of data mining in the construction of smart beta indexes," and say investors respond to backtests with inflows. — [IDEAS/RePEc](https://ideas.repec.org/a/cup/jfinqa/v59y2024i6p2515-2546_2.html); [Cambridge](https://www.cambridge.org/core/journals/journal-of-financial-and-quantitative-analysis/article/smart-beta-mirage/35CA1CEA091A485DDA960BB2D9930BC9)
  - Sample: 238 US single- and multi-factor equity smart-beta ETFs listed 2000–2018, about 80% of Morningstar-classified US equity smart-beta ETF AUM.
  - The working paper gave 2.77%/yr before listing vs −0.44%/yr after. Data mining is "particularly significant" in multi-factor indexes, where sponsors freely choose and combine factors. — [search summary of paper](https://resolve.cambridge.org/core/services/aop-cambridge-core/content/view/35CA1CEA091A485DDA960BB2D9930BC9/S0022109023000674a.pdf/smart_beta_mirage.pdf)
  - Per a university press release, multi-factor indexes averaged 4.11%/yr before listing and −0.79%/yr after. — [HKU Business School press release](https://hkubs.hku.hk/media/press-release/disrupt-your-traditional-perception-to-etfs-discover-how-short-interest-of-etfs-benefits-the-stock-market)
- **Vanguard, Dickson et al., "Joined at the Hip: ETF and Index Development" (2012) [INDEP of index sponsors].**
  - Of 370 indexes, 87% beat the broad US market over their backfilled period, but only 51% did after going live.
  - Backtested annualized excess return over the five years before launch was about 10%.
  - Half of more than 1,000 indexes were under six months old when an ETF tracking them launched. — [Institutional Investor](https://www.institutionalinvestor.com/article/b14zpnk4mmzk55/study-finds-many-etf-indexes-misleading); [PlanAdviser](https://www.planadviser.com/vanguard-principal-advises-against-rearview-mirror-investing/2/); [BenefitsPro](https://benefitspro.com/2012/07/23/hypothetical-performance-data-skews-future-etf-per)
- **InvestmentNews coverage.** "Smart-beta funds don't live up to the backtesting." — [InvestmentNews](https://investmentnews.com/mutual-funds/smart-beta-funds-dont-live-up-to-the-backtesting/196778)
- **McLean & Pontiff, "Does Academic Research Destroy Stock Return Predictability?", *Journal of Finance* (February 2016) [INDEP].**
  - The final version studies 97 cross-sectional predictors. Investors appear to learn about mispricing from publications.
  - An earlier draft estimated about 35% post-publication decay. The paper could not account for fund fees, transaction costs or taxes. — [Ivey working paper](https://ivey.uwo.ca/media/3775549/pontiff.pdf); [HedgeFundAlpha summary](https://hedgefundalpha.com/?p=521337)
- **Live rating-driven ETF.** The IBD 50 ETF (FFTY) returned 1.88%/yr vs 13.29% for the S&P 500, April 2015 – December 2024, live and net. — [Innovator FFTY](https://innovatoretfs.com/fund/ffty)
- **Index-provider disclosure.** MSCI's factor factsheets state that data before launch (Enhanced Value 12/12/2014; Momentum 2/15/2013) is back-tested and that "there are frequently material differences between back-tested performance and actual results." — [MSCI Enhanced Value factsheet](https://www.msci.com/documents/10199/255599/msci-usa-enhanced-value-index-usd-net.pdf)

### Inferences
- A new composite-score product should assume its own backtest overstates live excess return by roughly 3–5 pp/yr, the size of the pre- and post-launch gap.
- The credible response is to:
  - fix and publish the methodology before going live;
  - keep a version log;
  - grade only live, time-stamped calls;
  - treat any backtest as clearly labeled supplemental context, never as the headline.
- Multi-factor composites are the most vulnerable to data mining (Huang et al.). The number of factor and weighting variants tried during design should be disclosed.

### Gaps
- The final published McLean & Pontiff figures (commonly cited as returns 26% lower out-of-sample and 58% lower post-publication) could not be confirmed this session. Only the about-35% working-paper estimate is sourced.
- Research Affiliates' papers on smart-beta failure modes (e.g., Arnott, Beck, Kalesnik & West 2016, "How Can 'Smart Beta' Go Horribly Wrong?") were not retrieved.
- Backtest-overfitting literature (Bailey, Borwein, López de Prado & Zhu; Harvey, Liu & Zhu's t > 3 hurdle) was not retrieved this session. It is likely covered by the parallel factors and anomalies notes file.

---

## Q5. What standards exist for presenting investment performance honestly (GIPS, SEC Marketing Rule, FINRA)?

### Takeaway
- **GIPS** bars hypothetical or backtested results from composites; they may appear only as clearly labeled supplemental information.
- **SEC Marketing Rule (2020)** requires net with gross results, specific time periods, and strict conditions for hypothetical performance. The SEC has fined advisers for posting hypothetical performance on public websites.
- **FINRA Rule 2241** requires research reports with ratings to define each rating's horizon and benchmark, disclose the Buy/Hold/Sell distribution, and chart rating history.
- **FINRA Rule 2210 amendment (approved October 15, 2026)** will permit projections only for audiences able to evaluate them, not mass retail.

These rules are the best available template for an honest public track record, even if the app falls outside their formal reach.

### Cited Findings
- **GIPS (CFA Institute), Q&A database.**
  - Composite returns "must only contain actual portfolios managed by the firm and must not include hypothetical or back-tested results." Firms may present such results "clearly labeled as supplemental information."
  - A three-year back-tested composite history does not satisfy GIPS. — [GIPS Q&A 330](https://www.gipsstandards.org/?GIPSID=330); [GIPS Q&A 4961](https://www.gipsstandards.org/qadatabase/4961)
  - Per a secondary summary, GIPS also prohibits linking simulated or backtested results with actual performance and prohibits retroactive composite creation. — [GIPS compliance summary (secondary)](https://skills.sh/joellewis/finance_skills/gips-compliance)
- **SEC-overlap definitions.** The GIPS organization's Marketing Rule webinar defines hypothetical performance to include model, backtested, and targeted or projected returns, which are prohibited in advertisements unless conditions are met. — [GIPS/SEC Marketing Rule webinar slides](https://www.gipsstandards.org/wp-content/uploads/2022/07/composite-construction-sec-marketing-rule-webinar-slides.pdf)
- **SEC Marketing Rule, Rule 206(4)-1 (adopted December 2020).**
  - Prohibits "gross performance, unless the advertisement also presents net performance," and requires results for "specific time periods in most circumstances."
  - Hypothetical performance (which excludes interactive analysis tools) is allowed only with policies "reasonably designed to ensure that the performance is relevant to the likely financial situation" of the audience, plus disclosure of underlying information.
  - Extracted performance must be accompanied by, or promptly offered with, total-portfolio results.
  - Third-party ratings and testimonials are allowed only with conditions.
  - Compliance date: 18 months after the effective date. — [SEC press release 2020-334](https://www.sec.gov/news/press-release/2020-334)
- **SEC enforcement on hypothetical performance.**
  - September 2023: nine advisers settled for advertising hypothetical performance to the general public on their websites without the required policies; $850,000 combined penalties. The SEC said advisers "generally would not be able to include hypothetical performance in advertisements directed to a mass audience." — [Sidley](https://www.sidley.com/en/insights/newsupdates/2023/09/sec-marketing-rule-enforcement-charges-against-nine-registered-investment-advisers); [K&L Gates](https://www.klgates.com/Hypothetical-Performance-Crackdown-Nine-Firms-Charged-With-Violations-of-Investment-Adviser-Marketing-and-Recordkeeping-Rules-9-13-2023)
  - April 2024: five more advisers settled for $200,000 combined. In four cases hypothetical performance was not alleged to be misleading; the charge was lack of relevance policies. — [SEC press release 2024-46](https://www.sec.gov/news/press-release/2024-46); [Simpson Thacher](https://www.stblaw.com/about-us/publications/view/2024/07/09/sec-settles-with-advisers-for-marketing-rule-violations-(registered-funds-regulatory-update))
- **FINRA Rule 2241 (research analysts and research reports).**
  - A rating system must "clearly define in each research report the meaning of each rating," including time horizon and benchmarks, consistent with the rating's plain meaning.
  - Each report must disclose the percentage of all rated securities rated buy/hold/sell, and the percentage in each category for which the firm provided investment-banking services in the prior 12 months, current to the most recent quarter-end.
  - Each report must include a price chart marking every rating or price-target assignment or change (covering the rating period or 3 years, whichever is shorter).
  - Ratings and price targets need "a reasonable basis," a clear explanation of valuation method, and "a fair presentation of the risks." — [FINRA Rule 2241](https://www.finra.org/rules-guidance/rulebooks/finra-rules/2241)
- **FINRA Rule 2210 (communications with the public).**
  - Rule 2210(d)(1)(F) generally prohibits projecting performance.
  - On October 15, 2026 the SEC approved SR-FINRA-2026-004, adding exception (F)(iv). It permits performance projections and targeted returns if the member:
    - keeps records supporting a reasonable basis;
    - adopts written policies so the communication is relevant to the audience's likely financial situation and objectives;
    - discloses criteria, assumptions, risks and limitations.
  - The exception excludes most mass-market and general retail communications.
  - Effective date: a FINRA Regulatory Notice within 60 days of approval, with effectiveness no later than 180 days after that notice.
  - FINRA does not treat Marketing Rule-compliant disclosures as automatically sufficient. — [Alston & Bird, Oct 20, 2026](https://www.alston.com/en/insights/publications/2026/10/sec-approves-finra-rule-2210-change); [Ropes & Gray, Feb 2026](https://www.ropesgray.com/en/insights/alerts/2026/02/finra-proposes-rule-change-to-permit-projections-of-performance-and-targeted-returns); [FINRA filing](https://www.finra.org/sites/default/files/2026-02/SR-FINRA-2026-004-Federal-Register-Notice.pdf)
- **CFRA practice.** CFRA's STARS disclosure models the regulatory-style net-of-fee illustration (10% gross with a 1.5% fee gives 8.35% net) and warns that model results do not reflect actual trading. — [CFRA disclosure](https://www.cfraresearch.com/legal/performance-disclosure-stars-performance-charts)

### Inferences
These standards map directly onto the planned app's track-record page:
- Define each rating with a horizon and benchmark (e.g., "Buy = expected to beat sector ETF over 12 months"), as Rule 2241 requires.
- Publish the Buy/Hold/Sell distribution and a per-stock rating-history chart.
- Report only actual, time-stamped calls in the headline record (GIPS).
- Label any backtest as supplemental and never link it to live results.
- Show results net of an explicit cost assumption alongside gross (Marketing Rule).
- Use standard periods: 3, 6 and 12 months, and 1/5/10 years as history accrues.
- Do not show projected returns or targets to a mass retail audience. That is the regulatory direction even after the 2026 FINRA change.
- The SEC's view that hypothetical performance is generally inappropriate for mass-audience websites is directly relevant to a public web app.

### Gaps
- Not fetched or verified this session:
  - the publisher's exclusion from the Investment Advisers Act definition of "investment adviser" and *Lowe v. SEC*, 472 U.S. 181 (1985) (Justia returned 403); this is likely the key question for whether a public, impersonal rating site is subject to the Marketing Rule at all;
  - the Marketing Rule's specific requirement for 1-, 5- and 10-year periods in portfolio performance (in the rule text, not the press release);
  - the exact compliance date (November 4, 2022).
- The GIPS 2020 standard text itself (provisions on supplemental and theoretical performance and the 5-to-10-year history build-up) was not retrieved; only official Q&A entries were.
- Whether any SEC or FINRA enforcement since April 2024 has targeted stock-rating publishers specifically was not checked.
- Legal applicability to the app is a question for securities counsel, not these notes.
