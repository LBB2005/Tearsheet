# Text analysis (NLP) of SEC filings, earnings calls and news for predicting stock returns: dictionary methods through FinBERT

Research notes, current as of 2 Nov 2026. Scope: pre-LLM and transformer-era (FinBERT) text signals. LLM-specific return prediction is covered elsewhere.

Method note for the report writer: the main numbers come from primary paper texts I read in full: the Ke-Kelly-Xiu PDF (Aug 2021 version), the Lazy Prices NBER working paper (rev. March 2019), the Loughran-McDonald (2011) JF article, and the FinBERT arXiv paper (2020). I also read the official Loughran-McDonald (SRAF) and Hoberg-Phillips data pages. Partway through, the shared web-search budget for this session ran out. SSRN, Annual Reviews and Columbia also returned HTTP 403. As a result, several well-known papers could not be checked against a source: Tetlock 2007 in full, Li 2008 in full, Loughran-McDonald 2014/2016/2020, the earnings-call papers, the risk-factor disclosure papers, and Lee-Ma-Wang's search-based peers. They appear under "Gaps" and are labelled unverified, not presented as findings.

## Q1. Filings: the Loughran-McDonald finance dictionary, tone in 10-Ks, and the LM surveys

### Takeaway
The LM (2011) word lists fix a real measurement problem: 73.8% of Harvard "negative" word counts in 10-Ks are not negative in a finance context. Fin-Neg tone is related to the 4-day filing-window return, volume, volatility, SUE, fraud and material weakness. However, the *level* of negative tone in a 10-K did **not** significantly predict the following 12 months of risk-adjusted returns in LM's own trading test. For a 1–12 month score, raw tone level is a weak candidate. Tone is better used in the narrative, or as an input to *change* measures (Q2).

### Cited Findings
- LM sample: 50,115 firm-year 10-K/10-K405 filings on EDGAR, 1994–2008 (filters include ≥2,000 words and day 0–3 returns/volume available). — [Loughran & McDonald 2011, JF 66(1)](https://www.uts.edu.au/globalassets/sites/default/files/adg_cons2015_loughran-mcdonald-je-2011.pdf)
- "Almost three-fourths (73.8%)" of negative word counts from the Harvard-IV-4 TagNeg list come from words that are typically not negative in finance. Examples are tax, cost, capital, board, liability, foreign and vice. Others, such as mine, cancer, crude and tire, mainly proxy for industry. — [LM 2011](https://www.uts.edu.au/globalassets/sites/default/files/adg_cons2015_loughran-mcdonald-je-2011.pdf)
- Word lists created: Fin-Neg 2,337 words (about half, 1,121, overlap with Harvard), Fin-Pos 353, Uncertainty 285, Litigious 731, plus strong-modal and weak-modal lists. — [LM 2011](https://www.uts.edu.au/globalassets/sites/default/files/adg_cons2015_loughran-mcdonald-je-2011.pdf)
- Return link (short window only). Sorting 10-Ks into quintiles by Harvard negative proportion shows "no discernable pattern" in the [0,3]-day filing-period excess return (buy-and-hold minus the CRSP VW index). Sorting by Fin-Neg gives a monotonic pattern: high-Fin-Neg quintiles have sharply negative median filing returns. — [LM 2011](https://www.uts.edu.au/globalassets/sites/default/files/adg_cons2015_loughran-mcdonald-je-2011.pdf)
- tf-idf term weighting "substantially mitigate[s]" the attenuation bias from misclassified high-frequency words. With weighting, the Harvard and Fin-Neg lists "generally produce similar results." — [LM 2011](https://www.uts.edu.au/globalassets/sites/default/files/adg_cons2015_loughran-mcdonald-je-2011.pdf)
- Section choice: measuring tone on the MD&A alone does **not** give a clearer link to filing-date returns than the full 10-K, so LM use full 10-Ks. — [LM 2011](https://www.uts.edu.au/globalassets/sites/default/files/adg_cons2015_loughran-mcdonald-je-2011.pdf)
- **No 12-month predictability from tone levels.** Each June from 1997, firms were sorted into quintiles on the prior year's 10-K Fin-Neg or Harvard counts, going long low-negative and short high-negative. Over the next 12 months, the four-factor alphas were positive but "none of the values are statistically significant." LM conclude this is "not enough to warrant active trading." The test is gross of costs. — [LM 2011](https://www.uts.edu.au/globalassets/sites/default/files/adg_cons2015_loughran-mcdonald-je-2011.pdf)
- The word lists are significantly related to filing-date returns, trading volume, subsequent return volatility, SUE, fraud and material weaknesses. Fin-Neg also correlates more strongly with returns than Harvard in seasoned equity offering (SEO) and news samples (preliminary evidence). — [LM 2011](https://www.uts.edu.au/globalassets/sites/default/files/adg_cons2015_loughran-mcdonald-je-2011.pdf)
- Current dictionary: 7 sentiment categories (negative, positive, uncertainty, litigious, strong modal, weak modal, constraining). The file covers 1993–2025 and the page was last updated March 2026. The base is extended with words from 10-Ks and earnings calls, and post-2018 versions add filing abbreviations. **License: free for academic research; commercial use requires a license** (contact loughranmcdonald@gmail.com). — [SRAF, Notre Dame](https://sraf.nd.edu/loughranmcdonald-master-dictionary/)
- Investor attention to filings is low. LM (2017), as cited by Cohen-Malloy-Nguyen, report that the average firm's annual report is downloaded from EDGAR only 28.4 times by investors right after filing. — [Cohen, Malloy & Nguyen NBER WP 25084](https://www.nber.org/system/files/working_papers/w25084/w25084.pdf)

### Inferences
- For a public commercial web app, the LM dictionary needs a commercial license. Plan for this, or use an open alternative such as FinBERT (Q7), which also has license terms to check.
- LM's own null result on 12-month returns means "this 10-K reads negative" should not enter the score as a level. It is more defensible as (a) a short-window event feature, or (b) a way to *sign* year-over-year changes, which is how Cohen-Malloy-Nguyen use the LM lists (Q2).
- If dictionary counts are used, use tf-idf weighting and the full document or section, not proportional raw counts.

### Gaps
- Loughran & McDonald (2016, JAR, "Textual Analysis in Accounting and Finance: A Survey") and (2020, Annual Review of Financial Economics, "Textual Analysis in Finance") could not be retrieved: Annual Reviews returned 403 and the search budget was exhausted. Their specific conclusions are not verified here. From prior knowledge (unverified), they warn against off-the-shelf dictionaries and the Fog index, favour transparency and replicability, and caution about data-snooping in ML text models. Confirm against the originals before citing.
- No post-2008 out-of-sample test of LM tone levels for 1–12 month returns among large caps was found.

## Q2. "Lazy Prices": year-over-year changes in 10-K/10-Q text (and risk-factor disclosure studies)

### Takeaway
Of all the free-SEC-text signals, year-over-year *similarity* of a firm's own filings has the strongest documented 1–12 month return predictability. Over 1995–2014, "non-changers" minus "changers" earned 34–58 bp/month value-weighted (up to ~7%/yr, t=3.59) and 18–45 bp/month equal-weighted. Returns accrue over about 6 months, persist to 18 months, show no reversal, and have **zero announcement-day reaction**. Changes in Item 1A Risk Factors were the most return-rich: up to 188 bp/month five-factor alpha (t=2.76). The authors themselves call the section-level results "suggestive but not definitive". The effect is not a small-cap artifact. The paper's sample ends in 2014, and no post-publication decay evidence was found.

### Cited Findings
- Publication: Cohen, Malloy & Nguyen, "Lazy Prices," *Journal of Finance* 75(3), 1371–1415, June 2020 (DOI 10.1111/jofi.12885). — [IDEAS/RePEc](https://ideas.repec.org/a/bla/jfinan/v75y2020i3p1371-1415.html). The figures below come from the NBER WP 25084 version (Sept 2018, rev. March 2019) and may differ slightly from the published tables. — [NBER WP 25084](https://www.nber.org/system/files/working_papers/w25084/w25084.pdf)
- Universe and sample: all complete 10-K, 10-K405, 10-KSB and 10-Q filings on EDGAR, 1995–2014, i.e. effectively all US public firms. Tables are removed. The average 10-K has 44,430 words and the average 10-Q about one-third of that. — [NBER WP 25084](https://www.nber.org/system/files/working_papers/w25084/w25084.pdf)
- Construction: four similarity measures of this year's document against last year's: cosine (term-frequency vectors), Jaccard (word sets), minimum edit distance, and "simple" (a diff/track-changes word count normalized by average document size). Each 10-K is compared with the prior 10-K, and each 10-Q with the **same quarter's 10-Q of the prior year**, to avoid seasonality. Quintiles use the prior month's distribution. Stocks enter the month after filing and are held 3 months, with monthly rebalancing. LM's Master Dictionary supplies the negative, uncertainty and litigious counts used to characterize the changed text. — [NBER WP 25084](https://www.nber.org/system/files/working_papers/w25084/w25084.pdf)
- Effect size, full documents: Q5−Q1 (long non-changers, short changers) earns 18–45 bp/month equal-weighted, robust to FF3 plus momentum and liquidity factors. **Value-weighted, it earns up to 58 bp/month (t=3.59)**, and the abstract range is 34–58 bp/month, "up to 7% per year." Both legs contribute: changers have negative future returns and non-changers positive ones. — [NBER WP 25084](https://www.nber.org/system/files/working_papers/w25084/w25084.pdf)
- Horizon: returns "accrue gradually over the course of the subsequent 6 months, and do not reverse." Elsewhere the paper says they "continue to accrue out to 18 months." The event-time window from t−10 to t+10 days around filing shows "no statistically or economically detectable effect." Price discovery happens 6–12 months after the change. — [NBER WP 25084](https://www.nber.org/system/files/working_papers/w25084/w25084.pdf)
- Section-level results (Table VII, by 10-K Item):
  - MD&A changes predict returns at 11–22 bp/month, often *smaller* than changes in Item 3 Legal Proceedings, Item 7A Quantitative and Qualitative Disclosures About Market Risk, and "particularly" Item 1A Risk Factors.
  - Risk Factors changes give L/S alphas "up to 188 basis points per month (t=2.76) in Panel A of Table VII, or over 22%" per year.
  - The authors caution that there is "some variation in the consistency of these results across the different specifications," and so treat the section results as "suggestive but not definitive."
  - The Risk Factors result holds in the post-SOX 2003–2014 subperiod (Appendix Table A-1).

  — [NBER WP 25084](https://www.nber.org/system/files/working_papers/w25084/w25084.pdf)
- Content of changes: changes about litigation and lawsuits underperform non-changers by over 71 bp/month (8.5%/yr, t=3.29). Changes mentioning the CEO/CFO team are also especially informative. 86% of changes carry "negative" sentiment. The 14% that are "positive" changes predict significantly *positive* future returns. — [NBER WP 25084](https://www.nber.org/system/files/working_papers/w25084/w25084.pdf)
- Real effects: changes predict future earnings, profitability, news announcements, bankruptcies and negative earnings surprises. Analysts do not anticipate them. Lower similarity is associated with more negative sentiment, more uncertainty, more litigiousness and CEO/CFO changes. — [NBER WP 25084](https://www.nber.org/system/files/working_papers/w25084/w25084.pdf)
- Large caps and costs:
  - Value-weighted returns are somewhat larger than equal-weighted, and the effect is "not concentrated in small firms."
  - The average changer (short leg) is *larger* than the average long, at a $3.5B versus $2.5B market cap, and is cheaper to short.
  - Turnover is "very modest."
  - Results are robust to industry adjustment, excluding 2000/2001/2008/2009, excluding M&A/SEO periods, and controlling for document length.
  - The authors argue limits to arbitrage are not a significant driver, but they do **not** report returns explicitly net of transaction costs.

  — [NBER WP 25084](https://www.nber.org/system/files/working_papers/w25084/w25084.pdf)
- Inattention mechanism: the predictability is weaker when more investors download both this year's and last year's 10-K together, measured from SEC EDGAR log files (Table VIII). — [NBER WP 25084](https://www.nber.org/system/files/working_papers/w25084/w25084.pdf)
- Earlier literature on changes:
  - Brown & Tucker (2011) find year-over-year MD&A modifications relate to future operating changes, and that contemporaneous 10-K filing returns increase with MD&A change. Price responses to MD&A modifications "have weakened over time," because MD&As became longer but more like the prior year's.
  - Feldman et al. (2010) find a modestly higher contemporaneous and future return for positive MD&A tone.

  — [as summarized in NBER WP 25084](https://www.nber.org/system/files/working_papers/w25084/w25084.pdf)
- Risk-factor and cautionary-language stickiness: Nelson & Pritchard (2007) find that firms facing greater litigation risk change cautionary (safe-harbor) language more year over year, but do not remove it when that risk falls. — [as summarized in NBER WP 25084](https://www.nber.org/system/files/working_papers/w25084/w25084.pdf)
- Secondary confirmation that the 188 bp headline belongs to the Risk Factors section: [Quantt blog](https://www.quantt.co.uk/resources/lazy-prices-snowflake-cortex-ai). The primary source above supersedes it.

### Inferences
- This is the most directly usable text-to-score signal for the app. It needs only free EDGAR text, and the app already parses Items 1, 1A, 7 and 7A.
- Recommended feature set, based on the paper's construction:
  - Compute YoY similarity per Item (1A first, then 3, 7A and 7) against the prior-year 10-K, and against the same-quarter prior-year 10-Q.
  - Use at least two measures (cosine on term frequencies and Jaccard on word sets).
  - Sign the *changed* text with negative, litigious and uncertainty counts, or with FinBERT.
  - Use a 3–6 month horizon.
- The asymmetry matters for a public app. Most of the spread comes from changers underperforming, and the long side's alpha "quickly reverts to zero." Large unexplained change in Risk Factors works better as a *red flag* than as a buy signal.
- The paragraph-level parsing the app already does is well suited to the "what changed" diff. LLMs can explain *what* changed in the narrative while the similarity score feeds the numeric score.
- Item 1A became mandatory only mid-2000s (see Gaps), so YoY risk-factor diffs exist for S&P 500 firms only from about FY2006 onward. That is still about 18 years of history.

### Gaps
- **Post-publication decay:** no source found on Lazy Prices performance after 2014 (sample end), 2018 (SSRN/NBER release) or 2020 (JF). Generic anomaly decay estimates (e.g., McLean & Pontiff 2016) were not retrieved. Treat current-day effect size as unknown and likely smaller.
- No S&P 500-only or top-500-by-cap subsample result was found. The large-cap evidence is indirect: value-weighting and the average changer size of $3.5B.
- Classic risk-factor disclosure studies could not be verified because the search budget ran out. From prior knowledge (unverified):
  - Campbell, Chen, Dhaliwal, Lu & Steele (2014, Review of Accounting Studies): risk-factor disclosures are informative about risk, and market beta and volatility respond to them.
  - Kravet & Muslu (2013, RAST): increases in risk-disclosure text are associated with higher post-filing volatility and trading.
  - Item 1A was mandated for 10-Ks for fiscal years ending on or after 1 Dec 2005.
  - Also, risk-factor text increasingly mirrors prior years, which the SEC tried to address in its 2020 Reg S-K modernization (summary required if Item 1A exceeds 15 pages).

  Verify each before citing.
- Whether returns are net of trading costs is not reported explicitly in the paper text I read.

## Q3. Readability and the Fog index (Li 2008 and critiques)

### Takeaway
Readability is a documented *correlate* of weaker and less persistent earnings and of slower price incorporation. It is not a well-established 1–12 month return predictor for large caps. The Fog index in particular has been criticized for financial text (LM 2014; unverified here). It belongs in the narrative ("this filing got much longer or harder to read"), not in the score.

### Cited Findings
- Li (2008, JAE): the annual reports of firms with lower earnings, and of firms with positive but less persistent earnings, are harder to read. — [as summarized in Cohen-Malloy-Nguyen NBER WP 25084](https://www.nber.org/system/files/working_papers/w25084/w25084.pdf)
- Lee (2012, TAR): less earnings-related information is incorporated into price in the 3 days after a 10-Q for firms with longer or less readable 10-Qs. — [as summarized in NBER WP 25084](https://www.nber.org/system/files/working_papers/w25084/w25084.pdf)
- Dyer, Lang & Stice-Lawrence (2017, JAE): 10-Ks have become longer and more complex over time. — [as summarized in NBER WP 25084](https://www.nber.org/system/files/working_papers/w25084/w25084.pdf)
- Lazy Prices results are "not driven solely by changes in the length" of documents. Similarity predicts returns after controlling for length. — [NBER WP 25084](https://www.nber.org/system/files/working_papers/w25084/w25084.pdf)
- The current LM Master Dictionary includes a complexity flag and syllable counts per word, which supports readability measures built for finance. — [SRAF](https://sraf.nd.edu/loughranmcdonald-master-dictionary/)

### Inferences
- If readability is used at all, use the year-over-year *change* in length or complexity, and treat it as a companion to the Lazy Prices similarity score. Do not use a cross-sectional Fog level; Fog is mechanically driven by polysyllabic finance words such as "financial," "company" and "operations."

### Gaps
- Loughran & McDonald (2014, JF, "Measuring Readability in Financial Disclosures") could not be retrieved. From prior knowledge (unverified), they argue the Fog index is poorly specified for 10-Ks and propose 10-K file size as a simpler readability proxy.
- Li (2008) exact sample and coefficients were not retrieved from the primary source.
- No source found showing that readability predicts 1–12 month returns among large caps.

## Q4. Hoberg-Phillips text-based industries (TNIC) and peer groups versus SIC codes

### Takeaway
TNIC peer sets are built from cosine similarity of 10-K Item 1 product descriptions and are redrawn every year. The authors show they explain profitability, leverage, Tobin's Q, dividends and managers' own named rivals better than SIC/NAICS. The data are downloadable, covering 1989–2023. I found **no verified evidence specifically on valuation-multiple accuracy or percentile ranking** using TNIC versus SIC or GICS. That evidence exists in the literature (e.g., Lee, Ma & Wang 2015, below), but could not be checked in this session.

### Cited Findings
- Hoberg & Phillips, "Text-Based Network Industries and Endogenous Product Differentiation," NBER WP 15991 (2010, rev. 2012). Published in *Journal of Political Economy* 124(5): 1423–1465 (2016). Built from product descriptions in 50,673 annual 10-Ks. Each firm gets its own competitor set, updated yearly. Compared with existing classifications, these sets better explain managers' discussion of high competition, the rivals managers name as peers, and firm characteristics such as profitability and leverage. — [NBER w15991](https://www.nber.org/papers/w15991)
- The data library offers:
  - TNIC (2016 JPE)
  - newer Doc2Vec-embedding classifications (Hoberg & Phillips 2025, JF, "Scope, Scale and Competition: The 21st Century Firm")
  - TNIC-based HHI and total similarity
  - product-market fluidity (Hoberg, Phillips & Prabhala 2014, JF)
  - vertical TNIC (Frésard, Hoberg & Phillips 2020, RFS)
  - firm scope data

  Stated coverage is 1989–2023, updated annually. The page says TNIC "sharply improve[s] upon SIC and NAICS codes" in explaining profitability, Tobin's Q and dividends. It also lists "Text-Based Industry Momentum" (Hoberg & Phillips 2018, JFQA 53(6)). License terms are not stated on the page. — [Hoberg-Phillips Data Library](https://hobergphillips.tuck.dartmouth.edu/)
- Firms are placed on a unit sphere of product-word vectors, and competitors are the firms located close by. — [Hoberg-Phillips Data Library](https://hobergphillips.tuck.dartmouth.edu/)
- Lazy Prices uses an industry adjustment (sorting within industry, then aggregating). Results stay strong, so the change signal is not an industry artifact. — [NBER WP 25084](https://www.nber.org/system/files/working_papers/w25084/w25084.pdf)

### Inferences
- For "percentile vs peers" displays, TNIC-style peers are a defensible upgrade over SIC. The app already parses Item 1, so it could compute its own text-similarity peers for the S&P 500 each year, using cosine similarity on Item 1 nouns or FinBERT/embedding vectors. That avoids the data lag, since the public files end at 2023.
- A practical design is a blend: GICS or SIC for the label, and text-similarity nearest neighbors for the comparison set. Show both and cite which one is used.

### Gaps
- **No verified evidence on valuation or percentile accuracy.** Unverified items from prior knowledge:
  - Lee, Ma & Wang (2015, JFE, "Search-Based Peer Firms") compare EDGAR co-search peers with GICS and other schemes on co-movement, valuation multiples, growth, R&D, leverage and profitability. I believe they report search-based peers outperform GICS6, and that TNIC is competitive but below search-based peers in most tests.
  - Bhojraj, Lee & Oler (2003, JAR) find GICS beats SIC, NAICS and Fama-French for valuation multiples and return co-movement.

  These need to be checked; the search budget ran out before I could retrieve them.
- Whether TNIC peers improve S&P 500-only percentile rankings, which is a narrower universe than TNIC's all-firm network, was not tested in any source found.
- Hoberg-Phillips (2018, JFQA) text-based industry momentum effect sizes were not retrieved; only the citation was confirmed.
- The TNIC data license for commercial or public-web use is unknown.

## Q5. News and media text: Tetlock (2007), Tetlock-Saar-Tsechansky-Macskassy (2008), RavenPack/Thomson Reuters, and speed of pricing

### Takeaway
News-text sentiment robustly predicts **next-day** returns, but it is priced fast:
- **For large caps (above the NYSE median), the full response is complete within about 1 day** (11 bp on day 1) in the Ke-Kelly-Xiu data.
- Dictionary and RavenPack signals are fully priced within 2–3 days.
- Gross daily long-short Sharpe ratios are high: 2.3 (LM), 3.3 (RavenPack) and 4.2 (SESTM) equal-weighted. They fall to about 0.7–1.2 value-weighted, and drop sharply after transaction costs.

For a 1–12 month large-cap score, news sentiment adds almost nothing, and it requires licensed news data.

### Cited Findings
- Tetlock (2007, JF): high pessimism in the WSJ "Abreast of the Market" column precedes lower market returns the next day. Pessimism was first measured as a factor from 77 Harvard General Inquirer categories, then refined to negative and weak words. Tetlock notes word counts are "noisy measures." — [as summarized in LM 2011](https://www.uts.edu.au/globalassets/sites/default/files/adg_cons2015_loughran-mcdonald-je-2011.pdf)
- Tetlock, Saar-Tsechansky & Macskassy (2008, JF 63: 1437–1467), "More Than Words":
  - A higher fraction of Harvard negative words in firm-specific news forecasts low earnings.
  - Prices briefly underreact.
  - Predictability is strongest for stories focused on fundamentals.
  - A secondary summary reports about 21.1% annualized gross return for a daily long-positive/short-negative strategy on Dow Jones News Service (DJNS) stories about S&P 500 firms, 1980–2004, that "transaction costs eliminate."

  This is search-snippet-level evidence from a secondary source; the primary page returned 403. — [CXO Advisory summary](https://cxoadvisory.com/?p=860)
- Ke, Kelly & Xiu (KKX) data and design:
  - Dow Jones Newswires, Jan 1989–Apr 2020: 25.7M unique articles, of which 11.99M are single-firm-tagged.
  - Out-of-sample test window: Feb 2004–Apr 2020.
  - Positions are formed at the open after news (articles from 9:00–9:30am excluded), roughly 100 stocks per day.

  — [KKX, Aug 2021 version](https://par.nsf.gov/servlets/purl/10289824); [NBER w26186](https://www.nber.org/papers/w26186)
- **RavenPack and LM versus SESTM (same Dow Jones news), daily long-short, gross of costs:**
  - Equal-weighted annualized Sharpe ratios: SESTM 4.21, RavenPack (Composite Sentiment Score) 3.26, Jegadeesh-Wu "word power" 2.92, LM dictionary (tf-idf) 2.32.
  - Value-weighted: SESTM 1.24, RavenPack 0.73, word power 0.79, LM 0.86.
  - Average one-day L-S return: 32 bp (SESTM), 20 (word power), 18 (RavenPack), 15 (LM).
  - An equal-weighted combination of the four signals has a Sharpe ratio of 5.28.

  — [KKX](https://par.nsf.gov/servlets/purl/10289824)
- **Speed of pricing:**
  - WP, RavenPack and LM signals are "fully incorporated into prices within two or three days," and SESTM needs about 4 days.
  - Big stocks (above the NYSE median) respond 11 bp on the first day, and "their price response is complete after one day."
  - Small stocks respond 46 bp, which is more than 4 times as large, and take about 3 days.
  - Fresh news (novelty ≥0.75) moves prices 36 bp versus 22 bp for stale news. Fresh news takes 4 days to be absorbed, stale news 2.
  - Intraday, the L-S earns about 18 bp in the first 30 minutes after news, decaying steadily.

  — [KKX](https://par.nsf.gov/servlets/purl/10289824)
- **Decay since commercialization:** the RavenPack strategy's cumulative-return slope "noticeably flattens" after 2008 and especially from mid-2014. The authors link this anecdotally to rapid growth in RavenPack subscriptions. The SESTM slope stays stable. — [KKX](https://par.nsf.gov/servlets/purl/10289824)
- Related news-return literature cited by KKX (not individually verified): Engelberg (2008), Garcia (2013, JF, "Sentiment during recessions"), Heston & Sinha (2017, "News vs. sentiment"), Boudoukh, Feldman, Kogan & Richardson (2019), Jegadeesh & Wu (2013, JFE, "Word power"), and Tetlock (2011, stale news). — [KKX references](https://par.nsf.gov/servlets/purl/10289824)

### Inferences
- For S&P 500 names, news sentiment is effectively a 1-day signal and is fully arbitraged within the app's 1–12 month horizon. It is useful for the narrative ("recent coverage is negative because…") but should not drive the score.
- The RavenPack flattening after 2014 is a concrete example of text-signal decay once a signal is commercialized and widely subscribed.
- If news is used at all, novelty or "freshness" filtering (cosine similarity against the prior 5 days of articles) is a cheap, well-founded way to de-duplicate wire stories for the LLM evidence layer.

### Gaps
- Tetlock (2007) exact sample (1984–1999 WSJ column, as I recall) and coefficients, and the reversal within a week, are not verified from the primary source because of 403s and the exhausted search budget.
- Heston & Sinha (2017; Thomson Reuters News Analytics, now LSEG MarketPsych/News Analytics) results were not retrieved. From prior knowledge (unverified), daily news sentiment predicts returns for 1–2 days, while weekly aggregated news predicts returns for up to about one quarter.
- No study found on RavenPack or Thomson Reuters signals for 1–12 month horizons among large caps specifically.

## Q6. Earnings-call text: tone, management versus Q&A sections, vocal cues

### Takeaway
Earnings calls are a recognized source of incremental information. FinBERT's authors find that dictionary and classic-ML methods understate the informativeness of earnings-call text by at least 18% relative to FinBERT. Most of the classic call-specific findings could not be verified in this session: Q&A tone outweighing the presentation, post-call drift, and vocal-affect results.

### Cited Findings
- Huang, Wang & Yang ("FinBERT," Contemporary Accounting Research, 2023; DOI 10.1111/1911-3846.12832): other approaches underestimate the textual informativeness of earnings conference calls "by at least 18%" compared with FinBERT. — [HKUST Business Insight summary of the CAR paper](https://bm.hkust.edu.hk/bizinsight/2026/01/finbert-large-language-model-extracting-information-financial-text)
- The FinBERT pretraining corpus includes 136,578 earnings-call transcripts from 7,740 firms, 2004–2019, sourced from Seeking Alpha. That is about 1.3B tokens. — [Yang, Uy & Huang 2020, arXiv 2006.08097](https://arxiv.org/abs/2006.08097)
- KKX find that excluding news around earnings-announcement days only modestly lowers the SESTM equal-weighted Sharpe ratio, from 4.21 to 3.59. News text carries information beyond earnings-day content. — [KKX](https://par.nsf.gov/servlets/purl/10289824)
- The LM Master Dictionary now includes words found in earnings calls. — [SRAF](https://sraf.nd.edu/loughranmcdonald-master-dictionary/)

### Inferences
- Transcripts are licensed data: commercial vendors, or Seeking Alpha and similar under their terms. The app currently uses 10-K, 10-Q and 8-K earnings releases. Note that 8-K Exhibit 99.1 press releases are free on EDGAR and are the closest free substitute, though they lack the Q&A section.

### Gaps (all unverified; search budget exhausted)
- Price, Doran, Peterson & Bliss (2012, Journal of Banking & Finance): call tone (especially Q&A, using a finance-adapted dictionary) explains announcement returns and drift over about 60 days.
- Matsumoto, Pronk & Roelofsen (2011, The Accounting Review): the Q&A section is more informative than the presentation.
- Mayew & Venkatachalam (2012, JF, "The Power of Voice"): managerial vocal affect (positive or negative emotion) predicts future performance and returns.
- Larcker & Zakolyukina (2012, JAR): deceptive-language markers predict restatements.
- Sample periods, effect sizes, large-cap applicability and decay for all of these are unverified. They need a follow-up search.

## Q7. Machine-learned text models: Ke-Kelly-Xiu (SESTM), "Jiang-Kelly-Xiu on text", and FinBERT versus dictionaries

### Takeaway
Supervised, return-trained text models beat dictionaries and commercial scores on the same news. SESTM's equal-weighted Sharpe is 81% higher than LM's (4.21 versus 2.32) and 30% higher than RavenPack's. Net of realistic costs, however, the best SESTM portfolio Sharpe is about 1.0. Its value-weighted, large-cap tilted version has a gross Sharpe of 1.24.

FinBERT is an open, finance-pretrained BERT. It beats LM and classic ML on sentiment classification, and generic BERT by 4–16% accuracy. Its pretraining corpus is exactly 10-K Items 1, 1A and 7, earnings calls, and analyst reports. Its published evidence is about classification and informativeness, not a stand-alone 1–12 month return strategy.

### Cited Findings
- **SESTM method:**
  - (1) screen sentiment-charged words by their correlation with returns;
  - (2) assign positive and negative weights with a two-topic model;
  - (3) score each article by penalized likelihood.
  - Training labels are 3-day returns (t−1 to t+1).
  - Rolling window: 15-year train, 5-year validate, 1-year test, re-estimated 17 times.

  — [KKX](https://par.nsf.gov/servlets/purl/10289824); [NBER w26186](https://www.nber.org/papers/w26186)
- **SESTM performance, daily, gross of costs, Feb 2004–Apr 2020 out of sample:**
  - Equal-weighted L-S: Sharpe 4.21, 32 bp/day, max drawdown 26.3%, daily turnover 94%, FF5+momentum alpha 31 bp/day.
  - Value-weighted L-S: Sharpe 1.24, 9 bp/day, max drawdown 22.1%.
  - The value-weighted short leg alone has a Sharpe of −0.07, so for large caps the signal works only on the long side.

  — [KKX Table 2](https://par.nsf.gov/servlets/purl/10289824)
- Improvement over Jegadeesh-Wu "word power" (the closest predecessor that also learns word weights from returns): a 44% higher equal-weighted Sharpe and 57% higher value-weighted. — [KKX](https://par.nsf.gov/servlets/purl/10289824)
- **Net of costs:**
  - Assumed costs are 10 bp for large stocks and 20 bp for stocks below the NYSE 20th percentile, approximating Frazzini et al. (2018).
  - With a turnover-constrained equal-weighted strategy, net Sharpe peaks at about 1.05 (γ=0.6–0.7, net 6.0–6.2 bp/day) versus a gross 3.77–4.13.
  - At γ=0.9, the gross Sharpe is 4.34 and net 0.89.

  — [KKX Table 6](https://par.nsf.gov/servlets/purl/10289824)
- Robustness: trading 200 stocks instead of 100 gives Sharpe 3.68 (EW) and 1.09 (VW). Excluding earnings days gives 3.59 (EW) and 1.20 (VW). Adding bigrams gives 4.07 (EW) and 1.46 (VW). — [KKX Table 3](https://par.nsf.gov/servlets/purl/10289824)
- **FinBERT (CAR 2023):**
  - Outperforms the LM dictionary, naive Bayes, SVM, random forest, CNN and LSTM on researcher-labeled analyst-report sentences.
  - Is better at finding sentiment in sentences other models label neutral.
  - Its advantage is larger with small training samples and finance-specific vocabulary.
  - Also beats other models at identifying ESG discussion.
  - The summary page does not report numeric accuracies.

  — [HKUST Business Insight](https://bm.hkust.edu.hk/bizinsight/2026/01/finbert-large-language-model-extracting-information-financial-text)
- **FinBERT corpus and accuracy (precursor paper by the same authors):**
  - Pretraining corpus of 4.9B tokens:
    - 10-K/10-Q: 2.5B tokens; 60,490 10-Ks and 142,622 10-Qs of Russell 3000 firms, 1994–2019; Items 1 and 7 from 10-Ks and Item 1A from 10-Ks and 10-Qs.
    - Earnings calls: 1.3B tokens.
    - Analyst reports: 1.1B tokens; 488,494 Investext reports on S&P firms, 1995–2008.
  - Best-model accuracy versus uncased BERT:
    - PhraseBank: 0.872 vs 0.835 (+4.4%).
    - FiQA: 0.844 vs 0.730 (+15.6%).
    - AnalystTone (10,000 hand-labeled analyst-report sentences): 0.887 vs 0.850 (+4.3%).
  - Code and models are publicly released.

  — [Yang, Uy & Huang 2020, arXiv 2006.08097](https://arxiv.org/abs/2006.08097)

### Inferences
- FinBERT is a natural, cheap, open drop-in for paragraph-level sentiment in the app's pipeline, because it was pretrained on the same 10-K items the app parses. The best use is to *sign the changed paragraphs* in the YoY diff (Q2), not to score tone levels.
- SESTM-style supervised learning is the strongest pre-LLM approach, but its edge is in short-horizon news on small and volatile stocks. Its large-cap, value-weighted and net-of-cost edge is far smaller.
- A filing-based analog could train word weights on post-filing 3–6 month returns. I found no published, verified large-cap result for that.

### Gaps
- "Jiang, Kelly & Xiu" is best known for "(Re-)Imag(in)ing Price Trends" (JF 2023), which uses price-chart *images*, not text. The Kelly-Xiu text follow-up I believe is relevant is Chen, Kelly & Xiu, "Expected Returns and Large Language Models" (SSRN 4416687, 2022/2023). It compares embeddings from LLMs and smaller transformers (BERT, RoBERTa, LLaMA) against word-based methods such as SESTM and dictionaries, using global news. SSRN returned 403, so its figures are unverified. The other researcher covering LLMs may have them.
- FinBERT CAR (2023) exact accuracy numbers versus LM on analyst-report sentences were not retrieved; only the abstract claims are available. A secondary site claims 97% vs 71% on PhraseBank, which is unverified and conflicts in magnitude with the 0.872 from the authors' own 2020 paper. Do not use it.
- No study found that runs FinBERT-scored 10-K tone as a 1–12 month portfolio among large caps.
- FinBERT model license terms were not checked.

## Q8. Cross-signal summary: effect size, horizon, large-cap relevance, decay, data needs

### Takeaway
For a free-SEC-text, large-cap, 1–12 month score, the evidence clearly favours **year-over-year change and similarity in 10-K/10-Q sections, especially Item 1A Risk Factors**. Dictionary tone *levels* show no significant 12-month alpha. News and RavenPack-type sentiment is priced within about a day for large caps and needs licensed data. FinBERT is best used as a component (signing changes, classifying paragraphs) rather than as a standalone signal. TNIC is best used for peer sets.

### Cited Findings
| Signal | Effect size (as reported) | Horizon | Large caps? | Costs | Decay evidence | Data | Source |
|---|---|---|---|---|---|---|---|
| YoY 10-K/10-Q similarity (Lazy Prices), whole doc | 34–58 bp/mo VW (t=3.59); 18–45 bp/mo EW; 1995–2014, all EDGAR filers | Accrues over ~6 mo, persists to 18 mo, no reversal; no announcement effect | Yes: VW ≥ EW; changers avg $3.5B cap | Gross; low turnover, cheap shorts | None found post-2014 | Free EDGAR | [NBER WP 25084](https://www.nber.org/system/files/working_papers/w25084/w25084.pdf) |
| YoY change in Item 1A Risk Factors | Up to 188 bp/mo 5-factor alpha (t=2.76), "suggestive"; holds 2003–2014 | Same | Not separately reported | Gross | None found | Free EDGAR | [NBER WP 25084](https://www.nber.org/system/files/working_papers/w25084/w25084.pdf) |
| Litigation-related changes | 71 bp/mo (t=3.29) | Same | n/a | Gross | None found | Free EDGAR | [NBER WP 25084](https://www.nber.org/system/files/working_papers/w25084/w25084.pdf) |
| MD&A changes | 11–22 bp/mo | Same | n/a | Gross | Brown-Tucker: announcement response weakened over time | Free EDGAR | [NBER WP 25084](https://www.nber.org/system/files/working_papers/w25084/w25084.pdf) |
| 10-K negative tone level (LM Fin-Neg) | Monotonic [0,3]-day filing return; 12-mo four-factor alpha positive but insignificant; 1994–2008 | Days only | n/a | Gross | n/a | Free EDGAR + LM dictionary (commercial license) | [LM 2011](https://www.uts.edu.au/globalassets/sites/default/files/adg_cons2015_loughran-mcdonald-je-2011.pdf); [SRAF](https://sraf.nd.edu/loughranmcdonald-master-dictionary/) |
| News sentiment, LM dictionary | EW Sharpe 2.32, VW 0.86; 15 bp/day; 2004–2020 | Priced within 2–3 days | Big stocks: priced within 1 day | Gross | n/a | Licensed (DJ Newswires) | [KKX](https://par.nsf.gov/servlets/purl/10289824) |
| RavenPack CSS | EW Sharpe 3.26, VW 0.73; 18 bp/day | 2–3 days | Same | Gross | Slope flattens after 2008 and mid-2014 | Licensed | [KKX](https://par.nsf.gov/servlets/purl/10289824) |
| SESTM (supervised ML on news) | EW Sharpe 4.21 (32 bp/day), VW 1.24 (9 bp/day) | ~4 days | Big stocks: 11 bp day 1, done in 1 day | Net EW Sharpe ≤ ~1.05 | Stable through 2020 | Licensed | [KKX](https://par.nsf.gov/servlets/purl/10289824) |
| WSJ/DJNS negative-word share (Tetlock 2007/2008) | ~21.1% annualized gross L/S (secondary source), S&P 500, 1980–2004 | Next day | S&P 500 sample | Costs eliminate profits | n/a | Licensed news | [CXO Advisory](https://cxoadvisory.com/?p=860); [LM 2011](https://www.uts.edu.au/globalassets/sites/default/files/adg_cons2015_loughran-mcdonald-je-2011.pdf) |
| FinBERT sentiment | Accuracy 0.872/0.844/0.887 vs BERT 0.835/0.730/0.850; ≥18% more call informativeness than alternatives | n/a (classification) | n/a | n/a | n/a | Open model; pretraining used EDGAR, Seeking Alpha calls, Investext | [arXiv 2006.08097](https://arxiv.org/abs/2006.08097); [HKUST](https://bm.hkust.edu.hk/bizinsight/2026/01/finbert-large-language-model-extracting-information-financial-text) |
| TNIC peers | Better explains profitability, leverage, Tobin's Q, dividends and managers' named rivals than SIC/NAICS | n/a | Covers all 10-K filers | n/a | n/a | Free download, 1989–2023; license unstated | [NBER w15991](https://www.nber.org/papers/w15991); [HP Data Library](https://hobergphillips.tuck.dartmouth.edu/) |

### Inferences
- Priority for the score layer:
  1. Item 1A YoY similarity plus the sign of the changed text.
  2. Item 3, 7A and 7 YoY similarity.
  3. A whole-document 10-K/10-Q similarity composite.

  Weight these as a negative flag for heavy changers over a 3–6 month horizon. Treat the magnitude as uncertain and probably decayed since publication. Effect sizes come from 1995–2014 gross-of-cost tests on all EDGAR filers, not S&P 500-specific tests.
- News, dictionary-tone levels and readability belong in the narrative only. Their documented predictive horizon for large caps is days, or the effect is insignificant at 12 months.
- Licensing is a design constraint for a public app. The LM dictionary needs a commercial license, TNIC terms are unknown, and news and transcripts are licensed data. Self-computed similarity on EDGAR text, plus open FinBERT (check its license), avoids most of this.

### Gaps
- No verified study gives post-publication or out-of-sample (post-2014/2020) performance for Lazy Prices, LM tone or TNIC-based signals.
- No verified S&P 500-only results exist for any of the filing-text signals.
- Several foundational papers could not be checked against primary sources this session: Tetlock 2007 in full, LM 2014/2016/2020, Li 2008 in full, the earnings-call papers, the risk-factor disclosure papers, Lee-Ma-Wang 2015, and Chen-Kelly-Xiu. The shared web-search budget was exhausted and SSRN, Annual Reviews and Columbia returned 403. A follow-up pass could verify them.
