# Industry practice and live track records of AI-driven stock selection (as of 2 Nov 2026)

Notes for the report writer:
- **Labels.** Every performance number is tagged. **[Issuer]** means the fund or firm published it. **[Third-party data]** means Morningstar, Schwab or a data vendor compiled it. **[Anonymous press]** means unnamed people told the press and nothing is audited. **[Academic]** means peer or NBER research. **[Computed]** means I derived it from price data.
- **Sources marked "(search summary)".** I saw these only as search-result summaries and did not open the page. Treat them as lower confidence and verify them before quoting.
- **Search limit.** The session's web-search budget ran out partway through. Coverage is thin for retail AI research products (Q4) and for Two Sigma, Renaissance and WorldQuant (Q2). Those topics sit under Gaps, not Findings.

---

## Q1. Live track records: AI-run funds, ETFs and indices vs. benchmarks

### Takeaway
The longest live record of a fully AI-picked US equity fund is AIEQ (IBM Watson / EquBot, launched Oct 2017). Over about 9 years it returned roughly half of what the S&P 500 did: about 9.6%/yr against about 14.7%/yr. It also trailed its own Morningstar category over 5 years. Newer AI and LLM ETFs are tiny (tens of millions of dollars) and have records of months to about 2 years. Institutional AI funds report positive absolute returns: Bridgewater AIA, Numerai and AQR's ML-heavy funds. All of these figures are self-reported or come from anonymous sources, and Bridgewater's AI fund trailed its human-run flagship in 2025. The best independent evidence is NBER WP 35273. It finds that AI hedge funds' edge over non-AI peers was about 50 bp/month before 2017 and has been statistically zero since.

### Cited Findings

**AIEQ: Amplify AI Powered Equity ETF (formerly ETFMG; EquBot index, IBM Watson)**
- **[Issuer] Official performance as of 30 Sep 2026 (NAV).**
  - Short periods: 1M −2.98%, 3M −1.02%, 6M +13.30%, YTD +8.79%, 1Y +9.70%.
  - Longer periods: 3Y +18.58%, 5Y +4.45%.
  - Since inception: cumulative +127.45%, annualized +9.61%. At closing price, since-inception is +126.57% cumulative and +9.57%/yr.
  - Inception for performance is 10/16/2017 and the launch date is 10/17/2017.
  - The comparison index shown is the fund's own AI Powered Equity Index (AIEQTR), not the S&P 500: YTD +9.34%, 1Y +10.45%.
  - [Amplify ETFs AIEQ page](https://amplifyetfs.com/aieq/)
- **[Issuer] Fund facts.**
  - Expense ratio 0.75%. Net assets $111,436,313 as of 30 Oct 2026.
  - Adviser: Amplify Investments. Sub-adviser: Tidal Investments.
  - The issuer says it uses "IBM Watson for machine learning, sentiment analysis and natural language processing." Inputs are news, social media, analyst reports, financial statements, and technical and macro data on thousands of US companies.
  - [Amplify ETFs AIEQ page](https://amplifyetfs.com/aieq/)
- **[Third-party data] Schwab/Morningstar table as of 30 Sep 2026.**
  - AIEQ NAV: YTD +8.8%, 1Y +9.7%, 3Y +18.6%, 5Y +4.4%, since inception +9.6%/yr.
  - Morningstar Mid-Cap Blend category: YTD +10.1%, 1Y +11.3%, 3Y +15.3%, 5Y +7.9%. AIEQ trails its own category over YTD, 1Y and 5Y and beats it over 3Y.
  - [Schwab AIEQ performance](https://www.schwab.wallst.com/Prospect/Research/etfs/performance.asp?symbol=aieq)
- **[Computed] S&P 500 proxy over the same window.**
  - SPY dividend-adjusted close was 222.43 on 16 Oct 2017 and 762.63 on 30 Sep 2026. That is about +242.9% cumulative, or about 14.7%/yr over about 8.96 years.
  - Against AIEQ NAV (+127.45%, 9.61%/yr), AIEQ trailed by about 115 percentage points cumulative, or about 5.1 pp/yr.
  - Data came from the Financial Modeling Prep historical-price tool in this session; the arithmetic is mine. SPY includes its own small expense ratio. The report writer should cross-check this against S&P 500 TR index data.
- **[Press] 24/7 Wall St. (Rich Duprey, 26 Aug 2026, syndicated on Yahoo Finance).**
  - Says AIEQ gained +100.2% since its 17 Oct 2017 launch against roughly +199.7% for the S&P 500. No end date is given, and these look like price returns.
  - The same article's YTD / 1Y figures (no as-of date) for other AI ETFs, against the S&P 500 at +12.68% / +18.34%:
    - AMOM (Qraft AI-Enhanced US Large Cap Momentum, launched May 2019): +19.84% / +23.50%.
    - AINT (Finq AI International): +19.68% YTD.
    - AIEQ: +11.90% / +16.12%.
    - AIUP (Finq AI Up): +11.59% YTD.
    - AIVL (WisdomTree US AI Enhanced Value): +8.20% / +11.50%.
  - Expense ratios: 0.75% for AIEQ, AMOM, AIUP and AINT; 0.38% for AIVL.
  - [Yahoo Finance / 24/7 Wall St.](https://finance.yahoo.com/markets/stocks/articles/ai-help-beat-stock-market-152310707.html)
- **Risk statistics (search summary).** PortfoliosLab reports AIEQ's annualized alpha vs. the S&P 500 as −5.08%, with beta 1.13 and R² 0.86. [PortfoliosLab AIEQ](https://portfolioslab.com/symbol/AIEQ)
- **Conflicting year-by-year claim (search summary).** A 2023 Dividend.com piece says AIEQ underperformed the index every year since inception. Yahoo's annual-returns table reportedly shows AIEQ ahead in some years, such as 2019 and 2020. The conflict is unresolved. [Dividend.com](https://www.dividend.com/active-etfs-channel/how-are-ai-driven-etfs-performing/); [Yahoo AIEQ performance](https://finance.yahoo.com/quote/AIEQ/performance/)

**LLM-driven ETFs (2024–2026)**
- **Intelligent Alpha's LLM ETF (search summary).**
  - Launched September 2024 as the "Intelligent Livermore ETF" (LIVR). It uses multiple LLMs (reported as ChatGPT, Claude and Gemini) to emulate the strategies of famous investors such as Buffett, Druckenmiller and Tepper.
  - A human analyst sets up the inputs and reviews the portfolio. Expense ratio 0.69%.
  - [Fortune, 19 Sep 2024](https://www.fortune.com/2024/09/19/etf-warren-buffett-druckenmiller-tepper-finance-investors); [Financial Planning](https://www.financial-planning.com/articles/intelligent-alpha-launches-chatbot-powered-etf)
  - The ticker now appears as **GPT**. Data providers disagree on whether GPT is the "Intelligent Alpha Atlas ETF" or the "Intelligent Livermore ETF". [TipRanks](https://www.tipranks.com/etf/gpt/etf-analysis); [P&I ETF data](https://etf.pionline.com/fund/GPT)
- **GPT performance and size (search summary; no benchmark comparison from the issuer).**
  - ETFdb, as of 14 Jun 2026: YTD +10.14%. [ETFdb](https://etfdb.com/advisor_reports/GPT/)
  - P&I, as of 17 Jul 2026: AUM $22.90M. [P&I](https://etf.pionline.com/fund/GPT)
  - KoalaGains: NAV YTD about +14.9% through 30 Sep 2026, inception 17 Sep 2024. [KoalaGains](https://koalagains.com/etfs/NASDAQ/GPT/performance-returns)
- **Category size (search summary; fetch returned 403).** Technology.org (15 Oct 2026) reports that fewer than six ETFs rely solely on AI for research and stock picks. Together they hold about $30M, and each has only months of history. [Technology.org](https://www.technology.org/2026/10/15/ai-managed-etfs-stock-picking-beat-sp-500/)
- **Paper-trading and media tests, not live money (search summary).**
  - A 2026 test of seven LLMs' $100k paper portfolios had "GPT-5.5" leading at +26.35% from 20 Jan to 22 May. Five of the seven beat an S&P 500 ETF proxy. [GoBull](https://gobull.ai/blog/best-ai-model-for-stock-analysis)
  - Money.com found that 5 of 6 ChatGPT/Gemini picks failed to beat the benchmark. [Money.com](https://money.com/ai-picks-stocks-this-month/)
  - These are short-window simulations and should not be presented as track records.

**Bridgewater AIA Labs / AIA Macro (machine-learning macro fund; not stock-picking)**
- **[Anonymous press] 2025 results.** AIA Labs 15 rose **+11%** in 2025, while the human-run flagship Pure Alpha 18 gained **+34%** (its best since 2010). AIA Labs was created in 2023. The 2025 figures come from an unnamed person who saw them; Bridgewater does not publish fund returns. [Institutional Investor, 8 Jan 2026](https://www.institutionalinvestor.com/article/behind-bridgewaters-surge)
- **[Anonymous press] 2026 year to date.** AIA Macro was **+16.4%** through 29 Sep 2026, against Pure Alpha **+18.4%** over the first nine months. AIA Macro has an annualized **13.2%** since its late-2023 launch and manages more than $4.5bn.
  - The AIA figure comes from one unnamed person; the Pure Alpha figure comes from Reuters, citing unnamed sources.
  - [Hedgeweek, 2 Oct 2026](https://hedgeweek.com/news/bridgewaters-pure-alpha-up-18-4-ytd-as-macro-strategy-rebounds)
  - First half of 2026: AIA Macro +8.1% (Reuters via The Star, search summary). [The Star, 2 Jul 2026](https://www.thestar.com.my/tech/tech-news/2026/07/02/bridgewater039s-flagship-macro-fund-gains-81-in-first-half-amid-market-volatility-sources-say)
  - Conflict: another outlet gives 11.3% annualized since launch, not 13.2% (search summary). [ValueTheMarkets](https://www.valuethemarkets.com/cryptocurrency/news/bridgewater-associates-pure-alpha-and-aia-macro-performance-insights)

**Numerai (crowd-sourced ML; global equity market-neutral hedge fund "Numerai One")**
- **[Issuer] 2024 and fund scale.**
  - 2024 net return **+25.45%**, Sharpe **2.75**, one down month, described as the "best year in our history."
  - Assumes Founding Class fees of 1% management and 20% incentive, an investor in since 1 Sep 2019, and a 0% risk-free rate.
  - AUM grew from $60M to $450M over three years. **JPMorgan Asset Management secured $500M of capacity.**
  - The page does not say whether the figures are audited and gives no since-inception number.
  - [Numerai blog, 26 Aug 2025](https://blog.numer.ai/jpmorgan-secures-500m-capacity/)
- **2023 (search summary).** Secondary coverage says the fund lost about 17% in 2023 before the 2024 rebound. [FinanceFeeds](https://financefeeds.com/ai-hedge-fund-numerai-secures-up-to-500-million-backing-from-jpmorgan/)

**Eurekahedge AI Hedge Fund Index**
- **[Index provider, via press] Early record.** In March 2017, Eurekahedge's AI/ML hedge funds showed annualized returns of 7.35% (5 years), 9.57% (3 years) and 10.56% (2 years), with Sharpe ratios of 1.51 and 1.53 (2- and 3-year). They outperformed the average global hedge fund in every year from 2011 to 2016 except 2012, and were more volatile than the average hedge fund. [Opalesque (Eurekahedge release, Mar 2017)](https://www.opalesque.com/663664/Eurekahedge_Artificial_intelligence_hedge_funds_outperform_average_global366.html)
- **Construction and long-run record (search summary).** The index is equal-weighted with about 10 constituents (the count has varied). Press reports say it beat hedge-fund peers since 2013 but **lagged the S&P 500** over about 15 years. [HedgeCo](https://www.hedgeco.net/news/?p=58736); [Financial News](https://fnlondon-spa-stg.sc.onservo.com/articles/some-hedge-funds-thought-ai-would-help-them-beat-the-market-then-things-got-real-d45be29e?mod=home)

**Independent academic evidence: NBER Working Paper 35273, "The Growth and Performance of Artificial Intelligence in Asset Management" (Chen, Sialm, Xu; NBER Digest 1 Sep 2026)** — [NBER Digest](https://www.nber.org/digest/202609/artificial-intelligence-and-hedge-fund-investing)
- **[Academic] Data.** More than 116,000 SEC adviser filings from 2012–2024, classified by an LLM. HFR fund performance from 2005–2024. Strategy descriptions for 7,896 US hedge funds.
- **[Academic] Size.** AI-driven funds were about 2.7% of hedge funds in 2023 and held about **$12B AUM in 2024**, roughly 1.2–1.4% of US hedge fund assets.
- **[Academic] Performance.**
  - AI funds outperformed non-AI funds by **about 50 bp/month before 2017**. **After 2017 the gap was statistically indistinguishable from zero**, consistent with the monthly advantage shrinking by about 6 bp each year.
  - Early adopters did not keep their edge.
  - Compared with non-AI "sibling" funds at the same adviser, AI funds still beat them by about 35 bp/month.
- **[Academic] Correlation and flows.** Average pairwise return correlation was 0.021 among AI funds and 0.124 among non-AI funds. There was **no evidence investors allocate more based on AI disclosures alone, absent demonstrated returns.**

### Inferences
- The one long, public, fully AI-picked equity record (AIEQ) underperformed the S&P 500 by about 5 pp/yr over about 9 years. That is a strong, citable counter-example to "AI that beats the market" claims, and it supports the app's no-outperformance-marketing posture.
- AI ETFs that beat the S&P 500 do so over short YTD or 1Y windows (for example AMOM). This is the classic cherry-picked-window pattern. A graded track record should report fixed, pre-declared horizons and since-inception results against a stated benchmark.
- Institutional AI results (Bridgewater AIA, Numerai, AQR) are positive in absolute terms but unaudited or anonymously sourced, and are not stock-picking-vs-S&P comparisons. Bridgewater's AI fund trailed its human flagship in both 2025 and 2026 YTD.
- Academic evidence suggests any AI edge decays as adoption spreads. A product built on widely available LLMs should expect no durable, structural alpha.
- AIEQ benchmarks itself against its own AI index rather than the S&P 500. The app should avoid self-referential benchmarks.

### Gaps
- No 2024–2026 Eurekahedge AI Hedge Fund Index annual returns were found. Its current status (still published or discontinued) is unconfirmed.
- AIEQ's audited calendar-year returns vs. S&P 500 TR were not retrieved; issuer and PortfoliosLab pages either blocked or omitted them. AIEQ's peak AUM and its asset decline were not verified.
- No issuer-verified benchmark comparison was found for GPT/LIVR, and the ticker-to-fund mapping is unresolved.
- Closed AI ETFs were not verified because search ran out. Examples include EquBot's international AIIQ, several Qraft ETFs and the VanEck social-sentiment ETF BUZZ. Closures and survivorship bias are relevant to a fair summary.
- Numerai's 2025 and 2026 returns and its audited since-inception record were not found.
- No current live record was found for an LLM-only hedge fund with a disclosed track record.

---

## Q2. How major quant firms describe their use of ML/AI

### Takeaway
Serious firms describe ML and LLMs as research and signal-production tools inside existing systematic, human-governed processes, not as autonomous stock pickers. Common uses are NLP on text, signal weighting, coding productivity, and agentic hypothesis generation. Every AI-generated idea passes the same statistical and investment-committee hurdles as human research. Firms stress caveats about overfitting, multiple testing, hallucination and interpretability.

### Cited Findings
- **Man Group: AlphaGPT ([Issuer]).**
  - An LLM-based agentic research workflow with three agents: an idea generator, an implementer that writes Python against Man's tools and databases, and an evaluator that applies the same statistical, risk and economic-rationale tests as human research.
  - The Investment Committee reviews AI hypotheses under the same framework. Every step is logged. "Human-in-the-loop." "We can't leave it unsupervised just yet."
  - Risks the article names: multiple-testing / p-hacking producing spurious signals, hallucination and drift, and success mostly limited to systematic equities.
  - Man says its edge is proprietary data and infrastructure rather than the technology itself.
  - Authors: Ziang Fang and Jason Moore.
  - [Man Group, "What AI can do for alpha"](https://www.man.com/insights/what-ai-can-do-for-alpha)
- **Man Group live-signal count (search summary).** Fang says AlphaGPT has produced "several dozen" signals approved for live trading. [Hedgeweek](https://hedgeweek.com/news/man-group-deploys-agentic-ai-for-quant-signal-discovery)
- **AQR / Cliff Asness, 2024 view.**
  - Generative AI is "evolutionary, not revolutionary" and "still just statistics."
  - NLP is "definitely the current most-used thing at AQR." ML is also used for signal weighting and coding productivity.
  - Credits Bryan Kelly, AQR's head of machine learning. Calls AI washing "not cool."
  - [Hedgeweek, 23 May 2024 (citing P&I)](https://www.hedgeweek.com/ai-is-still-just-statistics-says-aqrs-cliff-asness/)
- **AQR / Asness, 2025 view.**
  - FT-reported quote that AQR is "surrendering more to the machines." HedgeCo's characterization: ML now handles factor weightings, signal detection and portfolio construction, and Asness accepts some loss of interpretability for better returns.
  - Apex multi-strategy was about +15.6% YTD to Sep 2025 (Reuters). HedgeCo does not attribute this return to ML.
  - [HedgeCo, 7 Oct 2025](https://hedgeco.net/news/10/2025/cliff-asness-accelerates-ai-push-at-aqr-as-market-widens.html)
  - "AI has now taken over parts of his job" (Bloomberg, 3 Dec 2024; headline only). [BNN Bloomberg](https://bnnbloomberg.ca/business/technology/2024/12/03/aqrs-cliff-asness-says-ai-has-now-taken-over-parts-of-his-job)
  - A single secondary source claims about one-fifth of flagship signals now run through ML (search summary, unverified). [Realtid](https://www.realtid.se/bors-finans/maskinerna-tar-over-wall-street-overlamnat-oss/)
- **BlackRock Systematic ([Issuer], search summary).**
  - Uses LLMs "fine-tuned to perform specific investment tasks." Its earnings-call model is trained on about 400,000 transcripts from more than 17,000 firms, paired with two decades of market data.
  - BlackRock says the model reached **61.3% accuracy** forecasting 40-day post-earnings returns, against **49.7–54.9%** for GPT-4 and successors. This is self-reported.
  - Portfolio managers set themes, add priors and correct LLM errors.
  - [BlackRock, "Alpha Reimagined"](https://www.blackrock.com/us/individual/insights/alpha-reimagined); [Advisor Perspectives repost, 20 Jun 2025](https://www.advisorperspectives.com/commentaries/2025/06/20/reimagined-alpha)
  - Raffaele Savi and Jeff Shen co-lead systematic equity, with about $378B (search summary). [Bloomberg Línea](https://www.bloomberglinea.com/negocios/el-equipo-de-doctores-cuantitativos-de-blackrock-encamina-a-la-firma-hacia-un-ano-historico/)
- **Bridgewater ([Issuer] quotes via press).**
  - AIA Labs (2023) uses AI/ML to generate returns. "Humans train the machine that sets the rules." AI has been part of Bridgewater's work since 2012.
  - Greg Jensen says the firm has pursued "the vision of the artificial investor that can do everything a human can."
  - [Institutional Investor, 8 Jan 2026](https://www.institutionalinvestor.com/article/behind-bridgewaters-surge)
  - The CEO has said AI-fund returns are uncorrelated with the human-run bets (search summary). [AI Street](https://www.ai-street.co/p/bridgewater-ceo-ai-fund-generating-unique-alpha)
- **Numerai ([Issuer]).** Any data scientist or AI can submit stock signals via API. Approaches include tree ensembles, transformers and LLM-reasoning signals, combined into a meta-model. Contributors stake the NMR token, and Numerai ran a $1M NMR buyback. [Numerai blog](https://blog.numer.ai/jpmorgan-secures-500m-capacity/)

### Inferences
- Industry practice matches the app's design: code produces the rating, and the LLM writes the narrative and summarizes text. Firms use LLMs mainly to process unstructured text (earnings calls, filings, news) into features or summaries, while final positions come from systematic, validated models with human governance.
- Man's and AQR's caveats (multiple testing, interpretability) directly support publishing the rating methodology and a graded track record rather than claiming predictive power.
- BlackRock's 61.3% vs. about 50–55% for general GPT-4 is self-reported and task-specific. It suggests off-the-shelf LLMs are only modestly better than chance at directional return forecasting, which argues against having Claude generate the Buy/Hold/Sell call itself.

### Gaps
- Not researched because the search budget ran out:
  - Two Sigma's public statements on ML.
  - WorldQuant's BRAIN crowd-alpha platform and its scale claims.
  - Renaissance Technologies, as reported in Zuckerman's 2019 book and press. Medallion return figures circulate widely but were **not verified this session**.
- Man AHL's specific ML use (as opposed to Man Numeric's AlphaGPT) was not covered by the Man article retrieved.
- The FT's June 2025 AQR article was not opened directly, so the "one-fifth of signals" and the Apex/Delphi annualized figures (19% / 14.6%, from a Chinese-language summary) are unverified.

---

## Q3. Bank and practitioner reports on AI in investing; bank LLM workflows

### Takeaway
Since J.P. Morgan's 2017 Big Data and AI primer, surveys show AI adoption among asset managers is now the majority but sits overwhelmingly upstream, in research, summarization and idea generation. Only about 5% use AI for autonomous recommendations or trades, and only 8% report improved returns as a realized benefit (Mercer 2026). Banks have deployed internal LLM assistants for research retrieval and summarization (Morgan Stanley 2023, Goldman 2025), not for producing ratings.

### Cited Findings
- **J.P. Morgan, "Big Data and AI Strategies: Machine Learning and Alternative Data Approach to Investing" (May 2017; Marko Kolanovic and Rajesh T. Krishnamachari).**
  - About 280 pages. Classifies alternative data sources (sentiment, transactions, satellite) and ML methods (supervised, unsupervised, deep, reinforcement).
  - Includes a handbook of more than 500 alternative-data and technology providers. Widely used as a university text. (Search summary.)
  - [Cornell course materials listing](https://coursematerials.johnson.cornell.edu/details/264c07a0); [ETF Express, Nov 2017](https://etfexpress.com/2017/11/28/when-intelligent-data-becomes-game-changer/); [IP mailing list, Jun 2017](https://seclists.org/interesting-people/2017/Jun/17)
- **CFA Institute employer survey (fielded Feb 2024, published Aug 2024; about 200 respondents; search summary).**
  - About 85% say the industry needs AI/GenAI standards and ethical guidelines. 82% say the lack of standards is a significant barrier to adoption.
  - 47% say their firm is not well prepared for AI regulatory change. 70% need workforce training on AI compliance and risk.
  - [CFA Institute press release](https://cfainstitute.org/about/press-room/2024/ai-in-investment-sector-survey); [ai-CIO](https://www.ai-cio.com/news/investment-firms-ai-adoption-hindered-by-lack-of-standards-cfa-institute-finds/)
- **CFA Institute member survey (Feb–Mar 2024; search summary).** Professionals expected AI to enhance 51% of workflows and replace 31% within five years. [Funds Europe](https://funds-europe.com/cfa-institute-highlights-need-for-ai-genai-in-investing/)
- **Mercer 2024 global manager survey.** 91% of managers are using AI (54%) or planning to (37%) in investment strategy or asset-class research. Use is more common for bottom-up security selection than top-down macro (search summary). [Mercer 2024 survey](https://www.mercer.com/insights/investments/portfolio-strategies/ai-in-investment-management-survey); [Portfolio Adviser](https://portfolio-adviser.com/mercer-finds-ai-now-used-by-majority-of-asset-managers-in-investment-process/)
- **Mercer 2026 "AI in Asset Management" survey (131 managers, Feb–Mar 2026).**
  - Adoption: 55% have AI integrated in at least one strategy's investment process, 27% are piloting, 18% have none.
  - Type of use: 73% automation or co-pilot, 68% insight and analysis, **5% autonomous or semi-autonomous recommendations or trades.**
  - Realized benefits: 69% efficiency, 55% faster or better insights, **8% improved returns**, 8% reduced risk.
  - Barriers: 69% data quality, 59% regulatory or compliance. 91% plan to increase use within 12 months.
  - AI is "largely a partner rather than a decision-maker" (Beverley Sharp, Mercer).
  - [Wealth Professional, 22 May 2026](https://www.wealthprofessional.ca/news/industry-news/most-asset-managers-are-using-ai-but-few-let-it-call-the-shots/392509)
- **Morgan Stanley (search summary).**
  - AI @ Morgan Stanley Assistant is GPT-4-based and was fully live for advisers in Sep 2023. It gives access to about 100,000 research reports and documents.
  - OpenAI's case study reports that more than 98% of adviser teams use it. AI @ Morgan Stanley Debrief drafts meeting notes. AskResearchGPT serves the institutional securities division.
  - [OpenAI case study](https://openai.com/index/morgan-stanley/); [PYMNTS](https://www.pymnts.com/artificial-intelligence-2/2023/morgan-stanley-to-launch-ai-powered-assistant-for-financial-advisors/); [NBC News](https://www.nbcnews.com/business/business-news/ai-trading-floor-morgan-stanley-expands-openai-powered-chatbot-tools-rcna176800)
- **Goldman Sachs (search summary).**
  - GS AI Assistant rolled out firmwide in June 2025 to about 46,000 employees after a pilot with about 10,000 users.
  - Research analysts use it for summarization, data extraction, drafting and translating research. It runs multiple models behind the firewall (reported model list varies). A separate "Banker Copilot" also exists.
  - [Fortune, 24 Jun 2025](https://fortune.com/2025/06/24/goldman-sachs-internal-ai-assistant); [Fox Business](https://foxbusiness.com/technology/goldman-sachs-announces-firmwide-launch-ai-assistant)
- **NBER WP 35273 (see Q1).** Shows AI-driven hedge funds remain a small share of the industry: about 2.7% of funds and about $12B. [NBER Digest](https://www.nber.org/digest/202609/artificial-intelligence-and-hedge-fund-investing)

### Inferences
- The industry norm is to use LLMs for retrieval, summarization and drafting over a curated, firm-controlled corpus, with humans owning the conclusion. The app's architecture (code-built rating, Claude-written cited narrative) is consistent with how Morgan Stanley and Goldman publicly describe their tools.
- Mercer's finding that only 8% cite improved returns gives the app an industry-sourced line for its transparency messaging. Firms adopt AI mainly for efficiency, not proven alpha.

### Gaps
- Not retrieved:
  - CFA Institute's 2019 "AI Pioneers in Investment Management".
  - The 2023 "Handbook of AI and Big Data Applications in Investments".
  - Any 2025–2026 CFA Institute AI reports.
- J.P. Morgan's own LLM tools (for example LLM Suite) and any public J.P. Morgan follow-ups to the 2017 report were not researched.
- Morgan Stanley's reported evaluation framework for accuracy and hallucination was not verified (OpenAI and Morgan Stanley pages returned 403).
- No public data was found on error rates of bank LLM research tools.

---

## Q4. AI-generated research products for retail investors (2025–2026)

### Takeaway
Coverage is weak because the search budget ran out before this question. The evidence found is limited to small LLM-run ETFs and paper-trading or media tests. Product details, disclaimer practices and reported errors for Seeking Alpha, Morningstar, Bloomberg, Robinhood, Public.com and Perplexity Finance remain **unverified** and need follow-up.

### Cited Findings
- **Intelligent Alpha's LLM ETF.** This is a retail-accessible LLM-built portfolio. A human analyst reviews LLM outputs, it charges 0.69%, and AUM was about $23M in Jul 2026 (search summary). [Fortune](https://www.fortune.com/2024/09/19/etf-warren-buffett-druckenmiller-tepper-finance-investors); [P&I](https://etf.pionline.com/fund/GPT)
- **Money.com.** Ran ChatGPT and Gemini monthly stock picks as a media feature; 5 of 6 picks failed to beat the benchmark (search summary). [Money.com](https://money.com/ai-picks-stocks-this-month/)
- **GoBull.** Runs public LLM paper-trading comparisons of seven models over about 4 months in 2026. These are simulated, not live money (search summary). [GoBull](https://gobull.ai/blog/best-ai-model-for-stock-analysis)
- **Morgan Stanley's assistant.** It is adviser-facing, not retail-facing; clients get AI output only through a human adviser (search summary). [OpenAI case study](https://openai.com/index/morgan-stanley/)

### Inferences
- Media "ChatGPT picks stocks" features and paper-trading leaderboards are the dominant retail-facing "evidence." They involve short windows and no live money, so the app should not cite them as validation.
- Because the app is a public publisher of ratings, the retail competitors' disclaimer language and any correction or retraction incidents are important precedents. This needs dedicated follow-up research.

### Gaps
None of the following were verified this session (attempted fetches of Seeking Alpha returned 403, and search ran out). They are leads only and must not be reported as fact without sources:
- **Seeking Alpha.** Quant Ratings (factor-based Strong Buy / Sell grades) and its marketed rating performance. It is unknown whether that performance is backtested or live, and what disclosures it carries. Any LLM "virtual analyst" or summary features are also unverified.
- **Morningstar.** Its AI assistant (reportedly "Mo") and any AI-written analyst content, plus how it labels them.
- **Bloomberg.** Reported errors and corrections in AI-generated news summaries during 2025. Reportedly covered by the NYT in March 2025; not verified.
- **Robinhood.** "Cortex" AI research features (reportedly announced 2025 for Gold subscribers): scope, disclaimers, regulatory review.
- **Public.com.** "Alpha" AI assistant: scope and disclaimers.
- **Perplexity Finance and Yahoo Finance AI summaries.** Data sources, accuracy claims, disclaimers.
- **Regulatory actions against retail AI research features.** None were found. That is absence of evidence, not evidence of absence.

---

## Q5. Regulation: AI washing, the predictive data analytics rule, FINRA guidance, and implications for an AI-assisted ratings publisher

### Takeaway
US enforcement so far targets **misrepresenting** AI: claiming AI or ML capabilities a firm does not have, or making unsupported "AI-driven forecast" claims. It has not targeted the use of AI as such. Cases are brought under existing anti-fraud and Marketing Rule provisions. The Gensler-era predictive data analytics rule was withdrawn on 12 Jun 2025. FINRA treats AI-generated communications under its existing technology-neutral rules (Rule 2210 content standards). Enforcement appears quieter under the current SEC, but examiners still check that AI claims match operations.

### Cited Findings
- **SEC, 18 Mar 2024: the first "AI washing" cases (settled, neither admitting nor denying).**
  - **Delphia (USA)** paid a $225,000 penalty. It falsely claimed to use ML on clients' collective data.
  - **Global Predictions** paid a $175,000 penalty. It called itself the "first regulated AI financial advisor" and advertised "[e]xpert AI-driven forecasts". It also had a separate false tax-loss-harvesting claim.
  - Both firms were censured and given cease-and-desist orders; Global Predictions also had to retain a compliance consultant. Both were charged under Advisers Act §206 and the **Marketing Rule (206(4)-1)** and compliance rule. Total penalties were $400,000.
  - [MoFo](https://www.mofo.com/pdf/resources/insights/240320-sec-targets-ai-washing-with-two-new-settled-cases); [Harvard Law Forum on Corporate Governance](https://corpgov.law.harvard.edu/2024/04/18/decoding-the-secs-first-ai-washing-enforcement-actions); [Insurance Journal](https://amp.insurancejournal.com/news/national/2024/03/21/765964.htm); [CASRAI enforcement record (verified 25 Sep 2026)](https://casrai.org/guides/ai-washing-enforcement-sec-ftc-record)
  - Gensler said advisers "should not mislead the public" about using an AI model when they are not. [CASRAI](https://casrai.org/guides/ai-washing-enforcement-sec-ftc-record)
- **SEC settled order (blogged 5 Nov 2024): adviser falsely marketed as an AI-driven automated trading platform.**
  - The adviser, its parent, the CEO and a board member raised nearly $4M from 45 investors. They also made false AUM and performance claims.
  - The CEO paid more than $460,000 in disgorgement, interest and penalty and received a 5-year industry bar. The board member paid a $60,000 penalty. The adviser was censured.
  - [Seward & Kissel 40 Act Blog](https://40actblog.sewkis.com/insights/sec-charges-investment-company-ceo-and-board-member-for-alleged-misleading-statements-regarding-use-of-artificial-intelligence/)
  - The blog does not name the firm. I believe it is the Rimar Capital matter, but that is unconfirmed.
- **FTC "Operation AI Comply" (25 Sep 2024).** A consumer-protection parallel. DoNotPay ("robot lawyer") faced a proposed $193,000 order for marketing AI substitution claims without testing. Rytr was cited over AI-generated fake reviews. [CASRAI](https://casrai.org/guides/ai-washing-enforcement-sec-ftc-record)
- **Predictive data analytics (PDA) rule.**
  - Proposed 26 Jul 2023 as "Conflicts of Interest Associated with the Use of Predictive Data Analytics by Broker-Dealers and Investment Advisers." It would have required advisers to "eliminate or neutralize" conflicts.
  - **Formally withdrawn on 12 Jun 2025** with 13 other proposals. The SEC said it does not intend to issue final rules on them. One source says 17 Jun; 12 Jun is better supported.
  - [Paul Hastings](https://www.paulhastings.com/insights/client-alerts/sec-withdraws-14-pending-rule-proposals); [Ropes & Gray](https://www.ropesgray.com/en/insights/alerts/2025/06/sec-clears-unfinished-rulemakings-from-regulatory-agenda); [National Law Review](https://natlawreview.com/article/sec-formally-withdraws-fourteen-rule-proposals)
- **FINRA Regulatory Notice 24-09 (27 Jun 2024).**
  - Creates no new requirements. FINRA rules are technology-neutral and "continue to apply when member firms use Gen AI."
  - Rule 2210 content standards apply "whether member firms' communications are generated by a human or technology tool."
  - Rule 3110 supervision should address technology governance. The rules apply equally to third-party or vendor-embedded AI.
  - It cites concerns about "accuracy, privacy, bias, intellectual property."
  - It points to Advertising Regulation FAQs **B.4** (supervising chatbot communications) and **D.8** (AI-created communications).
  - [FINRA RN 24-09](https://www.finra.org/rules-guidance/notices/24-09)
- **Chatbot classification under Rule 2210 (law-firm commentary, search summary).** One-on-one chatbot exchanges with a retail investor are likely "correspondence." Standardized replies sent to more than 25 retail investors within 30 days are likely "retail communications." AI chatbot content must not be promissory or misleading. [Stradley Ronon](https://www.stradley.com/publications/with-great-power-comes-great-responsibility-finra-underscores-regulatory-implications-of-using-ai); [Mayer Brown](https://mayerbrown.com/-/media/files/perspectives-events/publications/2024/07/legal-update-finra-publishes-regulatory-notice.pdf)
- **FINRA 2025 Annual Regulatory Oversight Report.** Featured AI as a focus area. [Debevoise](https://www.debevoise.com/insights/publications/2025/02/finras-2025-regulatory-oversight-report-focus-on)
- **2025–2026 enforcement tone (search summary; vendor and law blogs, low confidence).**
  - Presto Automation settled in Jan 2025 without a fine. One source says there were no AI-focused SEC actions in H1 2026.
  - FY2026 SEC exam priorities include checking whether firms' AI "representations and disclosures fairly reflect operations and controls."
  - A Sept 2026 Zoe Financial settlement involved a client-matching algorithm and was described as AI-adjacent, not AI washing.
  - [Quartz](https://qz.com/sec-ai-washing-enforcement-small-companies-investors-100826); [Best AI for Advisors](https://bestaiforadvisors.com/ai-compliance/sec-ai-washing-and-exam-priorities/); [NTD CISO](https://ntdciso.com/insights/sec-ai-washing-enforcement-2026/)
- **Academic.** NBER finds no evidence that investors reward AI disclosures without returns, which weakens the commercial case for AI-heavy marketing. [NBER Digest](https://www.nber.org/digest/202609/artificial-intelligence-and-hedge-fund-investing)

### Inferences
- The legal risk lies in claims that do not match operations. "AI-driven forecasts," "uses ML to make picks" (if the rating is in fact rules-based code) and implied outperformance are exactly the fact patterns in Delphia and Global Predictions. The app's posture fits the enforcement record: describe accurately that code builds the rating and Claude writes the narrative, and avoid "AI beats the market."
- If the app ever becomes or partners with a registered adviser or broker-dealer, two regimes apply. Marketing Rule constraints on hypothetical or backtested performance apply to advisers. FINRA Rule 2210 content standards apply to member-firm communications, including AI-generated text. A graded live track record (not backtests) with clear periods and benchmarks would be the defensible format under either regime.
- With the PDA rule withdrawn, no AI-specific SEC rule currently governs AI-assisted ratings. Exposure runs through general anti-fraud provisions and, for registrants, the Marketing Rule and exam scrutiny of AI representations.

### Gaps
- **Publisher's exclusion.** Not researched: the Advisers Act §202(a)(11)(D) exclusion as interpreted in *Lowe v. SEC* (1985), which decides whether a public, impersonal, regularly published ratings site must register as an investment adviser. This is central to a free public ratings site and should be researched from primary sources (statute, SEC staff guidance, case law), including how personalized or interactive AI features could affect the exclusion.
- **SEC primary sources.** Not opened: the Mar 2024 press release (2024-36) and the Rimar-type order. Primary SEC sources for the 2025–2026 actions (Presto, the DOJ/SEC Nate/Saniger case, Zoe Financial) were not retrieved.
- **FINRA FAQ text.** The current wording of Advertising Regulation FAQs B.4 and D.8 was not retrieved.
- **Other bodies.** Not covered: the SEC Investor Advisory Committee's AI recommendations, state regulators (NASAA), the EU AI Act, and UK FCA positions on AI-generated investment research.
