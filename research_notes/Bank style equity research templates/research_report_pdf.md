# Layout and Formatting of Bank-Quality Equity Research PDFs (Sell-Side and Independent)

**How the evidence was gathered:** Most of the specifics below come from real PDFs I opened and parsed directly with pypdf: page size, page count, embedded font names, text size counted by characters, x/y positions of text, and RGB fill operators in the page content streams. These are first-hand measurements, not summaries from secondary sources. The samples are:

- **J.P. Morgan, North America Equity Research, earnings update.** The Baldwin Group, 05 Nov 2025, 20 pp, hosted by Insurance Journal: [JPM BWIN](https://www.insurancejournal.com/app/uploads/2025/11/JPM_The_Baldwin_Group_3Q_2025-11-05_5115824.pdf).
- **J.P. Morgan, Europe Equity Research, conference feedback note.** Valeo, 03 Jun 2026, 10 pp. The metadata says it is licensed to a single recipient at the FT: [JPM Valeo](https://d1e00ek4ebabms.cloudfront.net/production/uploaded-files/JPM_Valeo_SA_Feedback_fr_2026-06-03_5323673-e85955dc-116b-4b6f-8d33-00dffeb8c5bb.pdf).
- **Goldman Sachs, company update.** ACM Research (ACMR), 26 May 2026, 8 pp: [GS ACMR](https://pingpan-reports.pages.dev/812451214255522.pdf).
- **Morgan Stanley, earnings update.** Palantir (PLTR), 03 Feb 2026, 17 pp: [MS PLTR](https://pingpan-reports.pages.dev/184428545811222.pdf).
- **Morningstar full equity report.** Oracle, Dec 2014, 21 pp, distributed by the Belgian investors' association VFB: [Morningstar ORCL](https://vfb.be/Media/Default/images/Oracle.pdf).

**Caveats on the samples:**

- The GS and MS files come from a third-party mirror, so I could not confirm they are authentic.
- Their metadata shows they were re-printed through iOS's "pdftopdf" filter onto A4. So their **page size (A4) is an artifact of that re-print, not evidence of what GS or MS natively use**, and absolute positions may be scaled.
- The Morningstar sample dates from 2014, before the 2018–2026 window. I use it for structure only.
- RGB fills were counted only in page content streams, not in embedded chart XObjects or images, so the colour findings are approximate.

## Front page: what sits on page 1 and how it is laid out

### Takeaway
Page 1 of a bank note is a two-column page:

- **Main column (wide, left), roughly 55–70% of the width.** It holds the thesis-style headline and a bolded summary paragraph, then three to five bullets or paragraphs that each start with a bold run-in head.
- **Sidebar (narrow, right), roughly 25–35% of the width.** It holds the rating, price target (PT), price and date, ticker(s), sector, analyst names with phone and email, a small key-data block and a mini estimates table.
- **Footer.** A fixed conflict-of-interest paragraph plus a pointer to the disclosures at the back.

JPM, GS and MS all follow this pattern with small differences: GS can put its rating and key-data box later in a short note, and MS adds a "Reaction to earnings" scorecard. The CFA Research Challenge sets the minimum list of first-page items: company, exchange, ticker, sector, industry, recommendation, current price as of a date, and target price with % upside or downside.

### Cited Findings
**J.P. Morgan page 1 (BWIN, Nov 2025).** Measured from [JPM BWIN](https://www.insurancejournal.com/app/uploads/2025/11/JPM_The_Baldwin_Group_3Q_2025-11-05_5115824.pdf).

- **Top-right page header:** "North America Equity Research", then the date in DD Month YYYY form ("05 November 2025"), the J.P. Morgan logotype and www.jpmorganmarkets.com.
- **Main column (starts at x = 85 pt, about 1.18 in from the left edge):**
  - Company name, 20 pt Arial Bold.
  - Headline as a verdict/thesis line, 13 pt Arial ("3Q25 Wrap: Results Close to Expectations, Nothing to Get Excited About").
  - A bold Times New Roman 10 pt summary paragraph.
  - Bullets indented to x = 100 pt, each opening with a bold sentence, in Times New Roman 10 pt.
- **Right sidebar (starts at x = 425 pt of a 612 pt page, so about 150 pt or 2.1 in wide):**
  - Rating word ("Neutral") in 14 pt Arial Bold.
  - Ticker(s) in Bloomberg/RIC style ("BWIN, BWIN US").
  - "Price (04 Nov 25): $23.01".
  - "▼Price Target (Dec-26): $33.00", where the arrow shows the direction of the PT change and the PT carries an expiry month.
  - "Prior (Dec-26): $34.00".
  - Sector ("Insurance - Life & Nonlife").
  - Analyst names in 8.5 pt Arial Bold, the lead analyst suffixed "AC" (certifying analyst), each with phone and email, then the legal entity "J.P. Morgan Securities LLC".
  - A "Quarterly Forecasts (FYE Dec)" Adj. EPS table: rows Q1–Q4 and FY, columns 2024A/2025E/2026E, actuals suffixed "A". Headed 9 pt Arial Bold, cells 8 pt Arial Narrow.
  - A "Style Exposure" chart.
- **Page-1 footer, in order:**
  1. A disclosures pointer in 11 pt Arial Narrow Bold ("See page 15 for analyst certification and important disclosures.").
  2. The conflict-of-interest paragraph.
  3. A single blanket source line for the page's exhibits ("Sources for: Style Exposure – J.P. Morgan Global Markets Strategy; all other tables are company data and J.P. Morgan estimates.").
  4. A per-recipient licensing line ("This document is being provided for the exclusive use of [name] at [firm]…").

**J.P. Morgan page 2 sidebar ("Company Data" block).** From [JPM BWIN](https://www.insurancejournal.com/app/uploads/2025/11/JPM_The_Baldwin_Group_3Q_2025-11-05_5115824.pdf).

- **Price Performance:** YTD/1m/3m/12m, absolute and relative.
- **Company Data:** Shares O/S (mn), 52-week range ($), Market cap ($ mn), Exchange rate, Free float (%), 3M ADV (mn), 3M ADV ($ mn), Volatility (90 Day), Index (RUSSELL 2000), BBG ANR (Buy | Hold | Sell) count.
- **Key Metrics (FYE Dec), columns FY24A/FY25E/FY26E:**
  - Financial Estimates: revenue lines, Adj. net income, Adj. EPS, BBG EPS (consensus), DPS, BVPS.
  - Margins and Growth.
  - Ratios.
  - Valuation: Dividend yield, Adj. P/E.
- **Main column:** "Summary Investment Thesis and Valuation".

**J.P. Morgan Europe (Valeo, Jun 2026).** Same template: rating "Overweight", "Price (02 Jun 26): €14.06", "Price Target (Jun-27): €22.00", "See page 5 for analyst certification and important disclosures, including non-US analyst disclosures." — [JPM Valeo](https://d1e00ek4ebabms.cloudfront.net/production/uploaded-files/JPM_Valeo_SA_Feedback_fr_2026-06-03_5323673-e85955dc-116b-4b6f-8d33-00dffeb8c5bb.pdf)

**Goldman Sachs page 1 (ACMR, May 2026).** From [GS ACMR](https://pingpan-reports.pages.dev/812451214255522.pdf).

- **Top right:**
  - "Equity Research" label.
  - Analyst block at about 72% across the page: each analyst's name, phone (+852…) and email, with the entity "Goldman Sachs (Asia) L.L.C."
  - Date and time stamp "26 May 2026 | 9:21AM HKT".
- **Main column (x = 50 pt):**
  - Headline in 17.5 pt GS Sans Condensed with the structure "Company (TICKER): thesis phrase; second thesis phrase; Rating". It opens "ACM Research (ACMR): Enhanced tools…" and ends "; Buy".
  - A 9.5 pt lead paragraph ending "Maintain Buy."
  - Paragraphs with bold run-in heads ("Enhanced tools to support advanced applications:", "Earnings revision:").
- **Footer:** the conflict paragraph, then a pointer to the Reg AC certification and the Disclosure Appendix (or gs.com/research/hedge.html), then a note that non-US analysts are not FINRA-registered.
- **Key-data box (on page 3 in this short note, after "Price Target Risks and Methodology"):**
  - "ACMR 12m Price Target: $95.50 Price: $73.35 Upside: 30.2%".
  - Rating "Buy" in 13.5 pt.
  - "GS Forecast" block: Market cap $4.8bn, Enterprise value $4.2bn, 3m ADTV $73.1mn, region, industry ("Greater China Technology"), M&A Rank, and "Leases incl. in net debt & EV?: Yes".
  - Forecast table, columns 12/25, 12/26E, 12/27E, 12/28E: Revenue New and Old, EBITDA, EPS New and Old, P/E, P/B, Dividend yield, CROCI. Then a quarterly EPS row.
  - Source line ending "Price as of 22 May 2026 close."

**Morgan Stanley page 1 (PLTR, Feb 2026).** From [MS PLTR](https://pingpan-reports.pages.dev/184428545811222.pdf).

- **Header:** note-type label ("Update").
- **Main column (x = 41 pt):**
  - Company and region line, 13.5 pt ("Palantir Technologies Inc. | North America").
  - Headline, 23.5 pt MS Gloriola Light ("4Q25 Results – The Path to $10 Billion in Revenue in Clear View").
  - A 3-line standfirst summary, 11.5 pt.
  - Body, 9 pt, each paragraph opening with a bold run-in head.
  - A "Key Takeaways" bullet list (heading 11.5 pt). Its last bullet restates the rating (EW) and the $205 PT with its valuation basis: 55x CY30 FCF/share of $5.30, discounted at a 13% WACC.
  - A "Reaction to earnings" scorecard with three judgments: Impact to our thesis (Unchanged), Financial results versus consensus (Meaningful upside), Direction of next 12-month consensus EPS (Meaningful revision higher).
- **Right sidebar (x = 374 pt of 595, about 37% of the width):**
  - Entity "Morgan Stanley & Co. LLC".
  - Analysts with role ("Equity Analyst", "Research Associate"), email and phone.
  - "Palantir Technologies Inc.(PLTR.O, PLTR US)" (Reuters RIC and Bloomberg ticker).
  - "Software | United States of America".
  - Label/value pairs in 7 pt Roboto Bold: Stock Rating Equal-weight; Industry View Attractive; Price target $205.00; "Shr price, close (Feb 2, 2026) $147.76"; "Mkt cap, curr (mm) $322,245"; "52-Week Range $207.52-66.12".
  - Conflict paragraph and "refer to the Disclosure Section, located at the end of this report", in 8 pt Roboto Condensed Light.
  - Publication timestamp "February 3, 2026 05:01 AM GMT".

**Morningstar page 1 (2014 format).** From [Morningstar ORCL](https://vfb.be/Media/Default/images/Oracle.pdf).

- **Strip across the top of every page:** Last Price, Fair Value, Consider Buy, Consider Sell, Uncertainty, Economic Moat, Moat Trend, Stewardship, Morningstar Credit Rating, Industry Group. The star rating uses a "MorningstarSymbolsOne" glyph font.
- **Under the strip:** company name, ticker and exchange ("Oracle Corporation ORCL (NYSE)").
- **Main column:** Investment Thesis with a date.
- **Sidebar blocks:**
  - **Vital Statistics:** Market Cap, 52-Week High/Low, 52-Week Total Return, YTD Total Return, Last Fiscal Year End, 5-Yr Forward Revenue CAGR, 5-Yr Forward EPS CAGR, Price/Fair Value.
  - **Valuation Summary and Forecasts:** Price/Earnings, EV/EBITDA, EV/EBIT, Free Cash Flow Yield, Dividend Yield.
  - **Financial Summary and Forecasts:** Revenue, YoY, EBIT, Net Income (Adjusted), Diluted EPS, Free Cash Flow.
  - **Profile.**
  - **A "Contents" list with page numbers.**
  - **Analyst block:** name with CFA and CPA, "Senior Analyst", email and phone.
  - **Four dates:** "Research as of", "Estimates as of", "Pricing data through", "Rating updated as of".
  - **Holdings note:** the primary analyst does not own the stock.

**Generic guidance.**

- Page 1 should carry the recommendation, target price and earnings estimates, plus ticker, sector, market cap, float and a condensed historical/forecast financial table — [AnalystPrep](https://analystprep.com/cfa-level-1-exam/equity/elements-of-company-research-report/) (search summary)
- In a company update, page 1 covers the rating, PT and its basis, recent results versus expectations, and estimates for key metrics — [Mergers & Inquisitions](https://mergersandinquisitions.com/equity-research-report/)
- CFA Research Challenge reports must state company name, exchange, ticker, sector, industry, recommendation (buy/sell/hold), current price as of a date, and target price with % increase or decrease. Teams must use the front cover supplied by CFA Institute — [CFA RC Written Report Guidelines (2024)](https://www.cfainstitute.org/-/media/documents/support/research-challenge/challenge/rc-written-report-guidelines.pdf)

### Inferences
- **Recommended page-1 grid for a template on Letter:**
  - Main column from about 0.8–1.2 in left margin to about 5.7 in.
  - A 2.0–2.3 in right sidebar.
  - A full-width footer band for the disclosures pointer.
  - The sidebar runs top to bottom in this order: rating → PT (with horizon month and prior PT) → price with as-of date → upside % → ticker(s) and exchange → sector → analysts → key data → estimates mini-table → optional small price chart.
  - This order is common to JPM and MS. GS folds the same fields into a key-data box.
- **Headlines are written as a claim, not a label:** "Company (TICKER): verdict-style phrase; Rating" (GS) or "Event – thesis" (JPM, MS).
- **Every number carries an as-of date:** price close date, estimates date, PT horizon. This is a strong "looks like a bank" cue.

### Gaps
- I did not obtain recent public PDFs for BofA, Citi, UBS, Barclays or Jefferies, so their page-1 layouts are not verified here.
- I did not see a page-1 price chart in the JPM, GS or MS update samples. Price charts are more typical of initiations and of independent reports (CFRA/Argus), but this is not verified from samples.
- I found no current (2020s) Morningstar sample. Morningstar's later formats reportedly replaced "Stewardship" with a Capital Allocation rating (my background knowledge, not verified here).

## Page structure: initiation vs company update, sections, order and page counts

### Takeaway
- **Updates** (earnings wraps, conference notes) run about **8–20 pages**, and **5–7 of those pages are disclosures** whatever the length.
- **Initiations** run about **50–100+ pages**.
- **Update order:** page-1 summary → results versus estimates and consensus tables → estimate changes → model and segment tables → thesis, valuation and PT methodology → risks to rating and PT → financial statements → disclosures.
- **Initiation and full-report order** (CFA RC, Morningstar): thesis or investment summary → business description → industry and competitive position → financial analysis → valuation → risks → ESG/governance → appendices.

### Cited Findings
**Measured page splits:**

| Note | Pages | Content | Disclosures | Source |
|---|---|---|---|---|
| JPM BWIN earnings wrap | 20 | pp 1–14 | pp 15–20 (6 pp) | [JPM BWIN](https://www.insurancejournal.com/app/uploads/2025/11/JPM_The_Baldwin_Group_3Q_2025-11-05_5115824.pdf) |
| JPM Valeo conference feedback | 10 | pp 1–4 | pp 5–10 (6 pp) | [JPM Valeo](https://d1e00ek4ebabms.cloudfront.net/production/uploaded-files/JPM_Valeo_SA_Feedback_fr_2026-06-03_5323673-e85955dc-116b-4b6f-8d33-00dffeb8c5bb.pdf) |
| GS ACMR update | 8 | pp 1–3 | Disclosure Appendix pp 4–8 (5 pp) | [GS ACMR](https://pingpan-reports.pages.dev/812451214255522.pdf) |
| MS PLTR earnings update | 17 | pp 1–10 | Disclosure Section pp 11–17 (7 pp) | [MS PLTR](https://pingpan-reports.pages.dev/184428545811222.pdf) |

**JPM update section and table order.** From [JPM BWIN](https://www.insurancejournal.com/app/uploads/2025/11/JPM_The_Baldwin_Group_3Q_2025-11-05_5115824.pdf).

- **Tables, in order:**
  - Table 1: 3Q25 Earnings: Actual versus Expected
  - Table 2: Historical Revenues, Margins, and Cash Flow
  - Table 3: 3Q25 Earnings: Actual versus JPM Estimates and Consensus
  - Tables 4–5: reconciliations of Net Income to Adjusted EBITDA and to Adjusted Net Income
  - Table 6: Revenue Analysis by Segment
  - Table 7: Margin Analysis by Segment
  - Table 8: Guidance
- **Sections after the tables:** "Investment Thesis, Valuation and Risks", then "Risks to Rating and Price Target". The risks section is written as "could outperform our price target if:" bullets for a Neutral rating.

**MS update order.** From [MS PLTR](https://pingpan-reports.pages.dev/184428545811222.pdf).

- **Exhibits, in order:**
  - Exhibit 1: a KPI dashboard
  - Exhibit 2: Model Changes
  - Exhibit 3: Revenue Drivers
  - Exhibits 4–6: Income Statement, Balance Sheet, Cash Flow Statement
- **Then a "Risk Reward" page** with Bull, Base and Bear cases. For PLTR these were stated as 2030e FCF of $19.1B, $15.5B and $12.5B.

**GS update order.** Thesis paragraphs → "Valuation" → "Price Target Risks and Methodology" (TP basis plus numbered downside risks) → Exhibit 1: Earnings revision (New/Old/Diff by year) → Exhibit 2: P&L Summary (quarterly and annual) → key-data box → GS Factor Profile → Disclosure Appendix — [GS ACMR](https://pingpan-reports.pages.dev/812451214255522.pdf)

**Morningstar full-report section order (contents box).** Investment Thesis, Morningstar Analysis, Analyst Note, Valuation, Growth and Profitability, Scenario Analysis, Economic Moat, Moat Trend, Bulls Say/Bears Say, Credit Analysis, Financial Health, Capital Structure, Enterprise Risk, Management & Ownership, Analyst Note Archive, Additional Information, Morningstar Analyst Forecasts, Comparable Company Analysis, Methodology for Valuing Companies. The report is 21 pp — [Morningstar ORCL](https://vfb.be/Media/Default/images/Oracle.pdf)

**Initiation length and update content:**

- Initiating-coverage reports tend to run 50–100 pages or more, with heavy industry research. Company updates are the most common type — [Mergers & Inquisitions](https://mergersandinquisitions.com/equity-research-report/)
- M&I's typical update order: page-1 update, rating and PT → operations and financial summary charts → valuation (DCF/DDM plus comps, with justified multiples) → a short thesis, catalysts and risks section that it calls "more of an afterthought" — [Mergers & Inquisitions](https://mergersandinquisitions.com/equity-research-report/)

**CFA Research Challenge (2024 guidelines, the de facto student initiation template):**

- At most 10 A4 pages, excluding the CFA-supplied front cover, plus an appendix of up to 10 A4 pages.
- Required sections: Business Description, Industry Overview and Competitive Positioning, Investment Summary, Valuation, Financial Analysis, Investment Risks, ESG.
- Scoring out of 100: Business Description 5, Industry/Competitive 10, Investment Summary 15, Valuation 20, Financial Analysis 20, Investment Risks 15, ESG 15.
- Reports must use only public information and be written from the perspective of an independent analyst.

Source: [CFA RC Written Report Guidelines](https://www.cfainstitute.org/-/media/documents/support/research-challenge/challenge/rc-written-report-guidelines.pdf). Older rules (2012–13) had the same 10-page A4 limit — [CFA RC Official Rules 2013](https://kse.ua/wp-content/uploads/2019/05/Official-Rules-2013.pdf) (search summary).

### Inferences
- **Template budget:** about 1 page of summary, 2–10 pages of body, and a fixed 4–7-page disclosures block.
- **Short GS-style notes:** about 3 pages of content plus 5 pages of disclosures, so disclosures can be more than half the PDF.
- **Initiation template order:** Investment summary/thesis (1–2 pp) → Valuation and PT (DCF + comps + scenario/bull-base-bear) → Risks to rating/PT → Catalysts → Company overview/business description → Industry and competition → Financial analysis → Financial statements appendix (IS/BS/CF) → Disclosures.

### Gaps
- I did not open a full bank initiation PDF, so the initiation section order is drawn from the CFA RC rules, M&I and the Morningstar full report, not from a bank sample.
- No source gave average page counts by bank.

## Typography, colour, page size, margins and running headers/footers

### Takeaway
- **Page size:** US banks publish on **US Letter** (JPM uses Letter even for Europe Equity Research). The **CFA RC mandates A4**, and Morningstar's European-distributed report is A4.
- **Fonts:** body text is **9–10 pt**. Sidebars, tables and exhibits are **7–8 pt**, often in a **condensed sans**. Disclosures are **7–7.5 pt**. Headlines are **13–24 pt**.
- **Serif vs sans:** JPM still sets body text in **Times New Roman** with Arial/Arial Narrow for the furniture. GS (GS Sans) and MS (MS Gloriola + Roboto) use proprietary sans families, and Morningstar uses Univers Condensed.
- **Colour:** one brand blue or navy plus light grey or pale-blue table shading.
- **Running elements:** a header with analyst, team, date and logo on every inner page, and a page number.

### Cited Findings
**J.P. Morgan (2025–26, authored in Eidosmedia Prime).** From [JPM BWIN](https://www.insurancejournal.com/app/uploads/2025/11/JPM_The_Baldwin_Group_3Q_2025-11-05_5115824.pdf) and [JPM Valeo](https://d1e00ek4ebabms.cloudfront.net/production/uploaded-files/JPM_Valeo_SA_Feedback_fr_2026-06-03_5323673-e85955dc-116b-4b6f-8d33-00dffeb8c5bb.pdf).

- **Page size:** 612×792 pt (US Letter) for both the North America and the Europe report.
- **Fonts by character count:** TimesNewRomanPSMT dominant, then ArialNarrow, Times Bold, Helvetica, ArialNarrow-Bold, Arial.
- **Page-1 sizes:** body 10 pt Times; company name 20 pt Arial Bold; headline 13 pt Arial; rating 14 pt Arial Bold; analyst names 8.5 pt; sidebar tables 7–8 pt Arial Narrow; header 9 pt Arial Bold; footer pointer 11 pt Arial Narrow Bold.
- **Whole document:** most text is 9–10 pt, with tables and disclosures at 7–8 pt.
- **Inner-page margins:** body column starts at x = 60 pt (0.83 in).
- **Running header** at about y = 740 pt (0.7 in from the top), 7 pt Arial: page number, lead analyst name with "AC", phone, email, "North America Equity Research", date, logo.
- **Colours:** most frequent fill is steel blue #4F89BC, then black, link blue #0000FF, white, grey #7F7F7F and light-grey shading #EFEFEF.

**Goldman Sachs (2026).** From [GS ACMR](https://pingpan-reports.pages.dev/812451214255522.pdf).

- **Fonts:** GSSans-Regular/Bold/Medium/Light and GSSansCondensed (plus Univers LT Std and Arial in embedded exhibits).
- **Sizes:** body 9.5 pt; headline 17.5 pt GS Sans Condensed; key-data rating word 13.5 pt; exhibit tables about 6–7 pt; disclosures 7.5 pt.
- **Running elements:** "Equity Research" label at the top right; the footer pairs the date with the page number and the inner header pairs the company name with its ticker ("ACM Research (ACMR)").
- **Colours:** navy #00355E and light grey #EAEAED (only a few vector fills could be measured).

**Morgan Stanley (2026).** From [MS PLTR](https://pingpan-reports.pages.dev/184428545811222.pdf).

- **Fonts:** MSGloriolaIIStd Light/Regular/Medium/Bold for text; Roboto, Roboto Condensed and Roboto Black for the sidebar, labels and exhibits.
- **Sizes:** body 9 pt; headline 23.5 pt; standfirst 11.5 pt; sidebar labels 7 pt; analyst contact lines 5 pt; disclosures 7 pt.
- **Running footer:** "Morgan Stanley Research" plus page number. The note type ("Update") appears in the header.
- **Colours:** blue #005B91, pale-blue shading #E2F2FF, grey #F4F4F4, dark navy #232860 and a rare orange accent #FF3F00.

**Morningstar (2014).** From [Morningstar ORCL](https://vfb.be/Media/Default/images/Oracle.pdf).

- **Page size:** 595×842 pt (A4).
- **Fonts:** Univers LT Std Light Condensed and Bold Condensed only.
- **Sizes:** body 8.5 pt on page 1 and 9 pt inside; tables 7.5 pt; company name 15.5 pt; section heads 13.5 pt; the legal disclaimer repeated in the header of every page at 5 pt.
- **Footer:** "Page X of 21".

**CFA RC:** the report must be on A4 paper. The guideline PDF itself is US Letter and set in Aptos, Georgia Bold, Azo Sans and Arial — [CFA RC Written Report Guidelines](https://www.cfainstitute.org/-/media/documents/support/research-challenge/challenge/rc-written-report-guidelines.pdf)

**Production tools:** banks use Word templates, though some large banks have custom programs — [Mergers & Inquisitions](https://mergersandinquisitions.com/equity-research-report/) (author comment). JPM PDFs carry "Eidosmedia Prime 8.0" as the PDF creator, which is a newsroom-style structured publishing system — [JPM BWIN](https://www.insurancejournal.com/app/uploads/2025/11/JPM_The_Baldwin_Group_3Q_2025-11-05_5115824.pdf)

### Inferences
- **Recommended spec ("looks like a bank wrote it"):**
  - US Letter (A4 option for European or CFA-style output).
  - 0.6–0.85 in side margins on inner pages; a slightly wider left margin (about 1.0–1.2 in) on page 1.
  - Body 9–10 pt with about 11–12 pt leading.
  - Sidebar and tables 7–8 pt in a condensed sans (Arial Narrow, Roboto Condensed, Univers Condensed or similar).
  - Exhibit titles 8–9 pt bold; headline 18–24 pt; disclosures 6.5–7.5 pt.
  - One brand colour (navy/steel blue) for rules, table header bars and chart series 1, with 5–10% grey or pale-blue row shading.
- **Typeface:** "GSSans" is presumably Goldman's proprietary Goldman Sans typeface, and "MSGloriolaIIStd" is a Morgan Stanley licence of the Gloriola family. Both are inferences from the embedded font names.
- **Serif vs sans:** a serif body (JPM) reads as traditional or bank-like. The newer house styles (GS, MS) use all-sans text.

### Gaps
- **Margins:** these were measured only from text extents. Exact margin specs, leading and paragraph spacing are not published by any bank. I found no public bank research style guide.
- **Native page size for GS and MS:** could not be determined because the samples were re-printed onto A4.
- **European banks (UBS, Barclays):** no sample obtained, so their A4 versus Letter usage is unverified. JPM Europe uses Letter.

## Charts and tables: price charts, estimates, financial summaries, valuation tables, football fields, source lines

### Takeaway
- **Numbering and titles:** every table and chart is numbered ("Table n:" at JPM, "Exhibit n:" at GS and MS) and given a title. MS titles are often full-sentence takeaways.
- **Source line:** every exhibit has a "Source:" line directly underneath, naming the data vendor(s) plus "[Bank] estimates" or "[Bank] Research".
- **Table types:**
  - Estimates tables compare New vs Old, or Actual vs JPM vs Consensus.
  - Financial summaries are columnar by fiscal year, with "A"/"E" suffixes on actuals and estimates.
  - Valuation pages show bull/base/bear scenarios.

### Cited Findings
**JPM:**

- Tables are titled "Table n: …".
- Seven of eleven source lines are exactly "Source: Company reports and J.P. Morgan estimates." Others add vendors ("Company reports, Bloomberg Finance L.P., and J.P. Morgan estimates."; "J.P. Morgan Global Markets Strategy for Performance Drivers…").
- Notes are appended after the source ("Note: Acquired Revenues in Current…").
- Estimates use the "A" suffix for reported quarters ("0.65A").

Source: [JPM BWIN](https://www.insurancejournal.com/app/uploads/2025/11/JPM_The_Baldwin_Group_3Q_2025-11-05_5115824.pdf)

**GS:**

- Exhibits are titled "Exhibit n: …" ("Exhibit 1: Earnings revision", "Exhibit 2: ACMR P&L Summary").
- The earnings-revision table puts New/Old/Diff side by side for 2026E/2027E/2028E, with margin rows in % and diffs in ppts.
- The P&L summary combines quarters (1Q25…4Q26E) and years (2022…2028E) with QoQ and YoY growth blocks.
- Source lines: "Source: Company data, Goldman Sachs Global Investment Research" and "Source: Company data, Goldman Sachs Research estimates, FactSet. Price as of 22 May 2026 close."

Source: [GS ACMR](https://pingpan-reports.pages.dev/812451214255522.pdf)

**MS:**

- Exhibits are titled "Exhibit n:" with sentence titles ("13 out of 26 KPIs Are Upticking Quarter-over-Quarter"), then Model Changes, Revenue Drivers, Income Statement, Balance Sheet and Cash Flow Statement.
- 13 source lines, e.g., "Source: Company data, Morgan Stanley Research estimates", "Source: Refinitiv, Morgan Stanley Research", "Source: Company data, Morgan Stanley Research; $s in millions".
- A "Risk Reward" exhibit gives Bull/Base/Bear values.

Source: [MS PLTR](https://pingpan-reports.pages.dev/184428545811222.pdf)

**FINRA price-chart rule:** if a rating or PT has been assigned for at least one year, the report must include a line graph of daily closing prices for the shorter of the rated period or 3 years. The graph must mark the dates of each rating or PT change and depict each rating and PT, current to the most recent calendar quarter — [FINRA Rule 2241(c)(3)](https://www.finra.org/rules-guidance/rulebooks/finra-rules/2241)

**Price-target history in practice:**

- JPM gives a table of columns "Date | Rating | Price ($) | Price Target ($)", e.g., "08-Nov-22 N 27.54 31", alongside the chart — [JPM BWIN](https://www.insurancejournal.com/app/uploads/2025/11/JPM_The_Baldwin_Group_3Q_2025-11-05_5115824.pdf)
- GS has "Price target and rating history chart(s)" plus "Target price history table(s)", noting the targets are unadjusted for corporate actions — [GS ACMR](https://pingpan-reports.pages.dev/812451214255522.pdf)

**Valuation tables:** reports cite specific multiples and DCF inputs, e.g., a Jazz example with comps at 20.7x and 15.3x EV/EBITDA, an 8.07% discount rate and 0.3% terminal growth. Some banks now show targets by case — [Mergers & Inquisitions](https://mergersandinquisitions.com/equity-research-report/)

**Morningstar:** includes Scenario Analysis, Morningstar Analyst Forecasts and Comparable Company Analysis sections, and states that historical/forecast data sources are Morningstar Estimates — [Morningstar ORCL](https://vfb.be/Media/Default/images/Oracle.pdf)

**Argus quantitative reports** include a price chart, key stock statistics, a detailed financial statement history, a peer comparison table and a sector overview — [Argus Research](https://www.argusresearch.com/AboutUs/OurServices/QuantitativeResearchReports.aspx) (search summary)

**Value Line single page:** combines a long-term price chart, a statistical array of historical financial data, and 3- to 5-year projections. The Timeliness, Safety and Technical ranks sit in the upper-left box — [Value Line "one ranks"](https://www3.valueline.com/vlu/one-ranks.html); [BetterInvesting guide](https://www.betterinvesting.org/getmedia/4667cfdd-c36f-4555-83fd-197f6a360f43/How-to-Read-a-VL-Report.pdf) (search summary)

### Inferences
- **Exhibit chrome for a template:**
  - Numbered bold title above the exhibit, optionally a sentence-style insight.
  - Optional units sub-caption ("US$ mn", "FYE Dec").
  - Thin rules rather than full grids; brand-colour header bar or rule; light alternating shading.
  - Right-aligned numbers, negatives in parentheses (JPM shows "(39)"), estimates columns marked "E" (optionally shaded).
  - A source line in about 6.5–7 pt beneath every exhibit, in the form "Source: [Company filings / FactSet / Bloomberg], [Tool name] estimates."
- **Football field charts:** not seen in these update samples. They are more an initiation and investment-banking convention. Use a horizontal-bar range chart with the current price and the PT as vertical lines.

### Gaps
- I did not observe a football field, DCF summary table or WACC table in the bank samples. Their styling is not verified.
- I did not visually inspect chart styles (line weights, gridlines) because I parsed text and vector operators only, not rendered images.

## Sources and citations

### Takeaway
- **Banks cite at exhibit level** through "Source:" lines plus a blanket page-1 line ("all other tables are company data and [bank] estimates"). They describe filings generically as "company reports" or "company data".
- **Banks rarely cite 10-K or 10-Q page numbers.** None of the three bank samples used footnotes or endnotes to filings.
- **The CFA RC restricts sources to public information.**

### Cited Findings
- **JPM** uses a page-1 blanket sourcing line plus a per-table "Source: Company reports and J.P. Morgan estimates." No footnotes to specific 10-K or 10-Q pages appear in the extracted text — [JPM BWIN](https://www.insurancejournal.com/app/uploads/2025/11/JPM_The_Baldwin_Group_3Q_2025-11-05_5115824.pdf)
- **GS and MS** name third-party vendors in source lines (FactSet, Refinitiv) and add a pricing as-of note ("Price as of 22 May 2026 close.") — [GS ACMR](https://pingpan-reports.pages.dev/812451214255522.pdf); [MS PLTR](https://pingpan-reports.pages.dev/184428545811222.pdf)
- **Bloomberg consensus** shows up as a named row ("BBG EPS", "BBG ANR (Buy | Hold | Sell)") in the JPM key-metrics block — [JPM BWIN](https://www.insurancejournal.com/app/uploads/2025/11/JPM_The_Baldwin_Group_3Q_2025-11-05_5115824.pdf)
- **Morningstar** states its analysts use publicly available information, and that historical/forecast data are Morningstar Estimates that may reflect adjustments — [Morningstar ORCL](https://vfb.be/Media/Default/images/Oracle.pdf)
- **CFA RC** reports must contain only publicly available information — [CFA RC Written Report Guidelines](https://www.cfainstitute.org/-/media/documents/support/research-challenge/challenge/rc-written-report-guidelines.pdf)

### Inferences
- **For an independent tool,** filing-level citations could become a differentiator, e.g., "Source: Company 10-K FY2025, p. 47; [Tool] estimates". Readers expect the bank-style source line, so keep that format and append filing and page references to it.

### Gaps
- I found no bank style rule on footnotes vs source lines. I found no source documenting 10-K page-number citation norms in sell-side research.

## Disclaimers and disclosures

### Takeaway
- **What US broker research must carry under FINRA Rule 2241:**
  - Rating definitions.
  - A buy/hold/sell ratings distribution, including the share of IB clients in each category.
  - A price/rating/PT history chart once coverage passes one year.
  - Valuation method and risks.
  - Conflict disclosures: IB compensation, 1% ownership, market making, analyst holdings and compensation.
- **Placement:** these go on the front page or behind a clear front-page pointer.
- **Banks in practice:** a fixed conflict paragraph and a page pointer on page 1, then a 5–7-page disclosure appendix at the back (analyst certification under Reg AC, important disclosures, ratings distribution, PT history, rating definitions, country-by-country distribution legends).
- **Independent, non-broker research (Morningstar model):** replaces these with "not investment advice / informational purposes only / not an offer / no warranty / opinions as of date" wording and a conflicts statement.

### Cited Findings
**FINRA Rule 2241 requirements:**

- **(c)(1):** a reasonable basis for any rating or PT, a clear explanation of the valuation method, and a fair presentation of the risks.
- **(c)(2):** define each rating's meaning (including time horizon and benchmark) in every report, consistent with its plain meaning. Disclose the percentage of all rated securities in buy, hold and sell categories, and the percentage in each category for which IB services were provided in the past 12 months, current as of the most recent calendar quarter end.
- **(c)(3):** the price chart rule described in the charts section.
- **(c)(4):** disclose:
  - the analyst's or household's financial interest;
  - analyst compensation based on IB revenues;
  - managing or co-managing an offering, or receiving IB compensation, in the past 12 months, or expecting to seek it in the next 3 months;
  - non-IB compensation;
  - the client relationship type;
  - 1%+ beneficial ownership;
  - market making;
  - analyst compensation from the subject company;
  - any other material conflict.
- **(c)(6):** disclosures must be on the front page or referenced there, may be hyperlinked electronically, and must be "clear, comprehensive and prominent".
- **(c)(7):** reports covering six or more companies may point readers to where current disclosures can be found.

Source: [FINRA Rule 2241](https://www.finra.org/rules-guidance/rulebooks/finra-rules/2241)

**Analyst certification:** this comes from SEC Regulation AC, not Rule 2241. GS's footer explicitly references "Reg AC certification" — [GS ACMR](https://pingpan-reports.pages.dev/812451214255522.pdf). JPM marks certifying analysts with "AC" on the cover and prints the Analyst Certification at the start of the disclosures — [JPM BWIN](https://www.insurancejournal.com/app/uploads/2025/11/JPM_The_Baldwin_Group_3Q_2025-11-05_5115824.pdf)

**Page-1 conflict paragraph.** This is near-identical boilerplate at JPM, GS and MS. Each opens with the firm name plus the phrase "does and seeks to do business with companies covered in its research reports". Each continues that investors should be aware of a possible conflict affecting objectivity, and should treat the report as only a single factor in their investment decision.

- **JPM** follows it with "See page N for analyst certification and important disclosures" — [JPM BWIN](https://www.insurancejournal.com/app/uploads/2025/11/JPM_The_Baldwin_Group_3Q_2025-11-05_5115824.pdf)
- **GS** points to the Disclosure Appendix or www.gs.com/research/hedge.html — [GS ACMR](https://pingpan-reports.pages.dev/812451214255522.pdf)
- **MS** points to the "Disclosure Section, located at the end of this report" — [MS PLTR](https://pingpan-reports.pages.dev/184428545811222.pdf)

**Ratings-distribution tables (real figures):**

- **JPM, as of 04 Oct 2025:**

  | Population | Overweight (buy) | Neutral (hold) | Underweight (sell) |
  |---|---|---|---|
  | Global Equity Research coverage | 50% | 38% | 12% |
  | Global coverage, IB clients | 50% | 48% | 35% |
  | JPMS coverage | 48% | 40% | 12% |
  | JPMS coverage, IB clients | 73% | 69% | 52% |

  Source: [JPM BWIN](https://www.insurancejournal.com/app/uploads/2025/11/JPM_The_Baldwin_Group_3Q_2025-11-05_5115824.pdf)
- **MS "Global Stock Ratings Distribution", as of 31 Jan 2026:** Overweight/Buy 1,520 (41%); Equal-weight/Hold 1,579 (43%); Not-Rated/Hold 4 (0%); Underweight/Sell 592 (16%); total 3,695. The table has further columns for Investment Banking Clients (IBC) and Other Material Investment Services Clients (MISC) — [MS PLTR](https://pingpan-reports.pages.dev/184428545811222.pdf)

**Rest of the disclosure appendix:**

- **JPM:** ETF/authorized-participant disclosures, sanctions language, and long country-by-country legal-entity paragraphs (EEA via J.P. Morgan SE/BaFin, UK, Chile, China, Colombia and others) — [JPM BWIN](https://www.insurancejournal.com/app/uploads/2025/11/JPM_The_Baldwin_Group_3Q_2025-11-05_5115824.pdf); [JPM Valeo](https://d1e00ek4ebabms.cloudfront.net/production/uploaded-files/JPM_Valeo_SA_Feedback_fr_2026-06-03_5323673-e85955dc-116b-4b6f-8d33-00dffeb8c5bb.pdf)
- **GS:** analyst compensation, non-US analysts not subject to FINRA 2241/2242 restrictions, Conviction Lists, and "Differing Levels of Service" — [GS ACMR](https://pingpan-reports.pages.dev/812451214255522.pdf)
- **MS:** a statement that its research is not individually tailored investment advice, and "Important Disclosures for Morgan Stanley Smith Barney LLC Customers" — [MS PLTR](https://pingpan-reports.pages.dev/184428545811222.pdf)

**Independent/non-broker model (Morningstar):**

- Every page header carries a 5 pt disclaimer saying that:
  - the information, data, analyses and opinions are not investment advice, are provided solely for informational purposes, are not an offer to buy or sell a security, and are not warranted to be correct, complete or accurate;
  - opinions are as of the date written and subject to change without notice;
  - Morningstar is not responsible for trading decisions or losses;
  - redistribution is prohibited;
  - "Please see important disclosures at the end of this report".
- The end-of-report disclosures explain the star rating methodology and add a "Conflicts of Interest" list:
  - no material interests held by Morningstar or the analyst;
  - analysts follow the CFA Institute Code of Ethics;
  - analyst compensation is derived from Morningstar's overall earnings;
  - no commissions are received and companies are not charged to be rated;
  - only publicly available information is used;
  - the report was not made available to the issuer before publication.

Source: [Morningstar ORCL](https://vfb.be/Media/Default/images/Oracle.pdf)

**Publisher exclusion (US):** in *Lowe v. SEC* (1985) the Supreme Court held that publishers of bona fide newsletters fell within the Advisers Act exclusion for "the publisher of any bona fide newspaper, news magazine or business or financial publication of general and regular circulation", so they did not have to register as investment advisers — [Lowe v. SEC (Cornell LII)](https://www.law.cornell.edu/supremecourt/text/472/181). Practitioner summaries list three criteria: bona fide (genuine, disinterested commentary rather than marketing), impersonal advice, and general and regular circulation — [IBKR publisher-exclusion spotlight](https://brokerage.ibkr.com/webinars/spotlight-publisher-exclusion.pdf) (search summary)

**Argus:** discloses at the end of each report, and its disclaimer describes Argus Research Co. as an independent investment research provider — [GMU finance forum presentation](https://ollitest.gmu.edu/finforum/pdf/lc_210908_Analyst_Opinions-How_Used-Why_Trusted_presentation.pdf) (search summary)

### Inferences
**What a non-broker independent research tool should print instead of FINRA disclosures** (template recommendation, not legal advice):

- **Page-1 footer:** a one-line pointer, e.g., "For information only; not investment advice. See important disclosures and methodology on page N."
- **Page-header micro-disclaimer** (Morningstar style).
- **Back-of-report "Important Disclosures" block (1–2 pp):**
  - nature of the publisher (not a broker-dealer or registered investment adviser; impersonal, general-circulation research);
  - not an offer or solicitation;
  - no warranty, with data-vendor attributions;
  - opinions as of the date and subject to change;
  - rating definitions with time horizon and benchmark (mirroring 2241(c)(2) good practice);
  - methodology for PT and fair value;
  - conflicts statement (no issuer compensation, author holdings);
  - if applicable, an AI-generation and model-limitations statement;
  - past performance and forward-looking statements caveats.
- **Avoid imitation:** an independent tool should avoid the bank-specific "does and seeks to do business" sentence and Reg AC references unless they actually apply. Using them could misrepresent the publisher's status.

### Gaps
- I found no authoritative source stating that a "not investment advice" disclaimer by itself carries legal weight. Courts and the SEC look at substance and circulation (per the search summary for *Lowe*), so this needs legal review.
- I did not verify the exact wording of the FINRA Rule 2241 amendment proposals (Regulatory Notice 25-06, SIFMA comment) — [SIFMA comment letter](https://www.sifma.org/wp-content/uploads/2025/06/SIFMA-Comment-Letter-Regulatory-Notice-25-06.pdf)

## Rating systems and how ratings and price targets are displayed

### Takeaway
- **Bulge-bracket banks use three-tier relative ratings:**
  - Buy/Neutral/Sell: GS, UBS, Citi.
  - Overweight/Equal-weight/Underweight: MS, Barclays.
  - Overweight/Neutral/Underweight: JPM.
  - Buy/Neutral/Underperform: BofA.
  - Buy/Hold/Underperform: Jefferies.
- **PT horizon:** typically 12 months. At MS the rating horizon is 12–18 months, and JPM ties its rating horizon to a dated PT.
- **Independents** use stars or numeric ranks: Morningstar 1–5 stars, CFRA STARS 1–5, Value Line Timeliness/Safety 1–5, Argus Buy/Hold/Sell.
- **Display:** the rating is shown as a bold word in the sidebar or title, next to the PT, price and upside. Direction arrows and "Prior" PTs show changes.
- **Sell ratings are a minority:** 12–16% at JPM and MS.

### Cited Findings
- **JPM** uses Overweight/Neutral/Underweight. Each is measured over the duration of the PT indicated in the report, relative to the average total return of the stocks in the analyst's (or team's) coverage universe — [JPM BWIN](https://www.insurancejournal.com/app/uploads/2025/11/JPM_The_Baldwin_Group_3Q_2025-11-05_5115824.pdf). An April 2023 compilation gave the older wording "over the next six to twelve months" — [Broker rating definitions compilation](https://tools.euroland.com/tools/ee/Config/Company/ae-america/pdfs/rating_definitions.pdf)
- **MS** uses Overweight/Equal-weight/Not-Rated/Underweight. Total return is measured against the average of the analyst's industry (or industry team's) coverage universe, on a risk-adjusted basis, over the next 12–18 months. MS says it does not assign Buy/Hold/Sell. For FINRA purposes it maps Overweight to Buy, Equal-weight and Not-Rated to Hold, and Underweight to Sell. Its sidebar also shows an Industry View (e.g., "Attractive") — [MS PLTR](https://pingpan-reports.pages.dev/184428545811222.pdf)
- **GS** uses Buy/Neutral/Sell, assigned by total return potential relative to the coverage universe for regional Investment Lists, with a 12-month price target — [Broker rating definitions compilation](https://tools.euroland.com/tools/ee/Config/Company/ae-america/pdfs/rating_definitions.pdf); [GS ACMR](https://pingpan-reports.pages.dev/812451214255522.pdf)
- **UBS** uses Buy/Neutral/Sell. Ratings depend on the Forecast Stock Return (12-month expected dividends plus price appreciation) versus a Market Return Assumption (the one-year local interest rate plus 5%). The neutral band is ±6% in the 2025 version, widened to ±15% for stocks with volatility above 50% — [UBS Equity Ratings System](https://research.ibb.ubs.com/openaccess/compliance_pdf/Equity_Ratings_System.pdf); [UBS disclosures](https://research.ibb.ubs.com/openaccess/compliance/116137_1_new.html) (search summary)
- **BofA** (older BofA Merrill Lynch rating key, third-party copy): Buy means at least 10% expected total return and most attractive in the coverage cluster; Neutral means flat or up but less attractive; Underperform means least attractive. Volatility Risk Ratings run A (low), B (medium), C (high). Income Ratings are 7 (dividend same or higher, secure), 8 (same or lower, not secure) and 9 (no dividend) — [search summary of a BofAML key; host likely](https://epstein-data.com/HOUSE_OVERSIGHT_014429). This should be verified against current BofA Securities disclosures.
- **Barclays and Jefferies:** broker-rating feeds confirm the labels in use (Barclays "Overweight"/"Equal Weight"; Jefferies "Hold"/"Underperform") but not their definitions — [finanzen.at broker ratings](https://www.finanzen.at/analysen?p=146) (search summary)
- **Display at JPM:** rating word in 14 pt bold, then PT with a horizon month ("Price Target (Dec-26)"), a ▼/▲ change arrow, and "Prior (Dec-26)". In the PT history table, ratings are abbreviated "OW"/"N" — [JPM BWIN](https://www.insurancejournal.com/app/uploads/2025/11/JPM_The_Baldwin_Group_3Q_2025-11-05_5115824.pdf)
- **Display at GS:** the rating is the last word of the headline, plus a box reading "12m Price Target / Price / Upside %" with the rating in 13.5 pt — [GS ACMR](https://pingpan-reports.pages.dev/812451214255522.pdf)
- **Display at MS:** a "Stock Rating / Industry View / Price target" label-value stack — [MS PLTR](https://pingpan-reports.pages.dev/184428545811222.pdf)
- **Labels and frequency:** ratings are Buy/Hold/Sell with varying terminology (e.g., "OUTPERFORM [BUY]", "NEUTRAL [HOLD]"). Sell ratings are rare and Holds are less common than Buys — [Mergers & Inquisitions](https://mergersandinquisitions.com/equity-research-report/). The JPM and MS distributions above (Underweight 12% and 16%) quantify this.
- **Morningstar:** 1–5 stars from four components: moat, fair value estimate, uncertainty around that estimate, and current price. High-uncertainty stocks need a larger margin of safety for 4–5 stars. Moat ratings go through a moat committee — [Morningstar Equity Research Methodology (2023)](https://s205.q4cdn.com/437373358/files/doc_downloads/2025/07/Morningstar-Equity-Research-Methodology-2023-06-14.pdf) (search summary). In 2014 the report header also showed "Consider Buy" and "Consider Sell" prices (e.g., FV $42.00, Consider Buy $29.40, Consider Sell $56.70) — [Morningstar ORCL](https://vfb.be/Media/Default/images/Oracle.pdf)
- **CFRA:** STARS from 1 to 5. 4 STARS (Buy) means total return is expected to outperform the relevant benchmark over the coming 12 months, and 3 STARS means Hold. The STARS methodology dates from 1987 — [CFRA sample report](https://go.cfraresearch.com/MSA_Sample_Research); [Schwab CFRA Stock Report Guide](https://www.schwab.wallst.com/Client/Content/Documents/CFRAStockReportGuide.pdf) (search summary; the guide was too large to fetch)
- **Value Line:** Timeliness 1 (best) to 5 (worst) for relative price performance over 6–12 months across about 1,700 stocks. Safety 1–5 is derived equally from Financial Strength and Price Stability. A Technical rank and Beta sit in the upper-left box — [Value Line "one ranks"](https://www3.valueline.com/vlu/one-ranks.html); [Dummies](https://www.dummies.com/article/how-to-read-a-value-line-investment-survey-275078) (search summary)
- **Argus:** Buy/Hold/Sell with a target price, plus 12-month and 5-year rating scales. Quantitative reports carry an "A6" Buy/Hold/Sell rating with sub-component scores — [Argus Research](https://www.argusresearch.com/AboutUs/OurServices/QuantitativeResearchReports.aspx); [Schwab stock summary](https://www.schwab.wallst.com/research/Public/StockProviders/ThirdParty) (search summary)

### Inferences
- **Template rating box:**
  - Rating word in bold caps, 13–14 pt, optionally on a brand-colour or green/amber/red chip. The banks sampled appear to use plain text, so colour coding is more of a retail convention.
  - PT with its horizon ("12m PT" or "PT (Dec-27)").
  - Current price with its close date.
  - Upside/downside %.
  - Prior rating and prior PT with ▲/▼ when they change.
- **Disclosures:** always define the rating scale, horizon and benchmark on the disclosures page.
- **Bank-style naming:** pairing a relative scale (Overweight/Equal-weight/Underweight) with an Industry View reads as most bank-like. Stars or 1–5 ranks read as retail/independent.

### Gaps
- No primary definitions were found for Citi, Barclays or Jefferies thresholds and horizons. The Citi labels (Buy/Neutral/Sell) are from my background knowledge and are not sourced here.
- The BofA definitions come from an older third-party copy whose host attribution comes from a search summary. The current BofA Securities rating key is not verified.
- Whether banks colour-code ratings on page 1 could not be confirmed from text extraction. This needs rendered-page inspection.
