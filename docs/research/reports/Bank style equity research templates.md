# Bank-Grade Downloads Follow Rules, Not Brand Fonts

Sell-side research looks professional because it follows a few strict layout rules, not because of a special typeface or colour. Page one has two columns. A wide main column holds a headline that makes a claim and a bold summary. A narrow sidebar holds the rating, the price target, the dated price, the upside, key data and a small estimates table. Body text runs 9–10 pt, tables 7–8 pt and legal text about 7 pt, printed on white with one navy or blue and light greys. Every table and chart is numbered and has a source line beneath it, and five to seven pages of disclosures close the document. Decks follow the same logic: the whole call goes on slide one, each slide makes one point in a full-sentence title, and each has a source line. Bank Excel models colour typed inputs blue, formulas black and cross-sheet links green, and include a check that must read zero. For Tearsheet this means three templates. The first is a US Letter PDF in Source Serif 4 and Source Sans 3 at 9.5 pt, with navy #0B2D5B rules. The second is a 16:9 Arial deck with 24 pt titles on white. The third is an Arial 10 workbook with blue #0000FF inputs on pale yellow #FFF2CC, plus a Checks tab that proves it reproduces the saved report. Two cautions apply. Tearsheet is not a broker, so it should print independent-research disclaimers rather than the banks' FINRA wording. And until the app moves past Electron 33, page headers and footers must come from Electron's print templates rather than CSS.

## The three templates at a glance

All three files share one set of design tokens, so the PDF, the deck and the workbook read as one house style. Values with a bank in the last column are anchored in measured bank PDFs; the rest are design choices made for Tearsheet.

**Shared colour tokens**

| Token | Hex | Use |
|---|---|---|
| Ink | #1A1A1A | Body text and numbers |
| Secondary grey | #595959 | Labels, axis text, source lines, running headers |
| Navy (primary) | #0B2D5B | Headings, rules, table headers, base case, chart series 1 |
| Blue | #0072B2 | Second chart series; bull case |
| Vermilion | #D55E00 | Bear case, always dashed |
| Orange accent | #E69F00 | Highlights the subject company in peer charts; fills and thick lines only, never text |
| Light navy | #8FA9CF | Football-field method bars, with a navy outline |
| Header tint | #DCE6F2 | Table header fill in the PDF |
| Light fill | #F2F2F2 | Sidebar background, zebra rows, estimate columns |
| Rule | #BFBFBF | 0.5 pt table hairlines |
| Gridline | #D9D9D9 | Chart gridlines |
| Zero line | #B3B3B3 | Chart zero and reference lines |
| Negative (optional) | #C00000 | Negative numbers, always also in brackets |

### PDF report: US Letter, serif body, navy rules

| Element | Tearsheet spec | Bank benchmark |
|---|---|---|
| Paper | US Letter, 8.5 × 11 in, portrait; A4 as a setting | J.P. Morgan uses Letter even for European research ([JPM Valeo](https://d1e00ek4ebabms.cloudfront.net/production/uploaded-files/JPM_Valeo_SA_Feedback_fr_2026-06-03_5323673-e85955dc-116b-4b6f-8d33-00dffeb8c5bb.pdf)) |
| Margins | 0.75 in top, 0.7 in bottom, 0.6 in sides; on page 1 the main column starts about 1.0 in from the left | JPM body starts 0.83 in from the edge on inner pages and 1.18 in on page 1 ([JPM BWIN](https://www.insurancejournal.com/app/uploads/2025/11/JPM_The_Baldwin_Group_3Q_2025-11-05_5115824.pdf)) |
| Page 1 grid | 4.9 in main column, 0.2 in gutter, 2.2 in right sidebar, full-width footer band | JPM sidebar about 2.1 in wide; MS sidebar about 37% of the page ([MS PLTR](https://pingpan-reports.pages.dev/184428545811222.pdf)) |
| Body text | Source Serif 4, 9.5 pt on 13 pt leading | JPM Times New Roman 10 pt; GS 9.5 pt; MS 9 pt |
| Headings, sidebar, tables, charts | Source Sans 3, tabular figures | JPM Arial and Arial Narrow; MS Roboto; GS its own GS Sans |
| Company name and ticker | 20 pt bold sans, navy | JPM 20 pt Arial Bold |
| Headline | 14 pt sans, ink, one or two lines, written as a claim (Company (TICK): margins have bottomed; Buy) | JPM 13 pt; GS 17.5 pt; MS 23.5 pt |
| Summary paragraph | 10 pt bold serif, three or four lines | JPM 10 pt bold Times |
| Paragraph openings | Each paragraph opens with a bold run-in phrase | All three banks |
| Section heads | 11 pt bold sans, navy, 12 pt space above and 4 pt below | — |
| Rating | BUY in 14 pt bold caps, navy text in a 1 pt navy box, no traffic-light colour | JPM 14 pt bold word; GS 13.5 pt |
| Sidebar text | 8 pt; grey labels on the left, ink values right-aligned | MS 7 pt labels; JPM 7–8 pt |
| Tables | 7.5–8 pt, header 7.5 pt bold on #DCE6F2. 1 pt navy rules above the header, under it and at the bottom; 0.5 pt #BFBFBF hairlines between groups; no vertical lines | JPM 7–8 pt Arial Narrow; GS 6–7 pt |
| Exhibit title | `Exhibit 3: Margins recover to 18% by FY27E` in 8.5–9 pt bold, units below in 7.5 pt grey | GS and MS number exhibits; JPM numbers tables |
| Source line | 6.5–7 pt grey, directly under every exhibit | Every exhibit at all three banks |
| Running header (from page 2) | 7.5 pt grey: Company (TICK) on the left, Tearsheet Research · 8 Nov 2026 on the right | JPM 7 pt running header with date |
| Footer | 7 pt grey: Tearsheet Research, then a disclosure pointer, then Page X of Y | Page numbers and a page-1 pointer at all three |
| Disclosures | 7 pt on 8.5 pt leading, never below 6 pt | JPM 7–8 pt; GS 7.5 pt; MS 7 pt |
| Charts | Inline SVG. One gridline direction in #D9D9D9, zero line #B3B3B3, no border or background, labels on the data instead of legends | UK ONS chart spec ([ONS](https://service-manual.ons.gov.uk/data-visualisation/build-specifications/chart-elements)) |

The sidebar runs from top to bottom in this order: rating box → 12-month base value with its horizon month (e.g. Nov-27), with ▲ or ▼ against the last saved report → price with its close date → upside % → a small bear/base/bull range bar with a current-price marker → ticker, exchange and sector → key data (market cap, EV, 52-week range, shares out, average daily value traded) → a mini estimates table (FY2025A, FY2026E and FY2027E for revenue, EPS, P/E, EV/EBITDA and FCF yield) → the as-of dates for the report, prices and data. The report runs to seven pages: a summary; valuation and the 12-month range (football field, blend weights and the bear/base/bull table); financials and estimates; peers and factor scores; risks and what to watch; a numbered source list; and one page of important disclosures and methodology.

### Slide deck: 16:9, Arial, one message per slide

| Element | Tearsheet spec | Benchmark |
|---|---|---|
| Slide | 16:9, 13.333 × 7.5 in, white background on every slide, cover included | Bank style is dense exhibits on white ([Anthropic pitch-deck skill](https://www.claudepluginhub.com/skills/anthropics-investment-banking-plugins-vertical-plugins-investment-banking/pitch-deck)) |
| Fonts | Arial for all text (Georgia allowed for titles); never Aptos or Calibri on their own; no font embedding | Aptos falls back to Calibri when missing ([Office Watch](https://office-watch.com/2023/microsofts-font-substitution-for-aptos-really-sucks/)) |
| Cover | Company (TICK) in 36 pt bold navy and a 20 pt verdict line. A block with rating, price, 12-month base value and upside. A full-width bear/base/bull range bar and three one-line thesis points | The guides put the whole recommendation up front ([M&I](https://mergersandinquisitions.com/stock-pitch-guide/)) |
| Kicker | 10 pt caps in grey, letter-spaced, above the title (VALUATION) | Vendor bank spec ([SlideSpeak](https://slidespeak.co/slide-design-prompts/prompts/pitch-book)) |
| Action title | 24 pt bold navy: one sentence with a number, two lines at most; drop to 20 pt rather than overflow | Full-sentence titles ([SlideSpeak](https://slidespeak.co/slide-design-prompts/prompts/pitch-book)) |
| Title rule | 1 pt navy line under the title at y ≈ 1.3 in | 1 px navy rule ([SlideSpeak](https://slidespeak.co/slide-design-prompts/prompts/pitch-book)) |
| Body | 14 pt, 12 pt minimum; at most 6 bullets per box, 2 lines each | 11–14 pt, at most 6–7 bullets of 2 lines ([Anthropic skill](https://www.claudepluginhub.com/skills/anthropics-investment-banking-plugins-vertical-plugins-investment-banking/pitch-deck)) |
| Tables | Real table objects. Header 11 pt bold, white on navy #0B2D5B; body 11 pt, 10 pt minimum. Numbers right-aligned, zebra rows #F2F2F2, totals bold over a rule | Header 10–12 pt bold on the brand colour; body 9–11 pt ([Anthropic skill](https://www.claudepluginhub.com/skills/anthropics-investment-banking-plugins-vertical-plugins-investment-banking/pitch-deck)) |
| Charts | Axis labels 11 pt #595959, gridlines #D9D9D9, labels on the data, readable in black and white | Black-and-white rule ([Deckary](https://deckary.com/blog/investment-banking-pitch-book)) |
| Source line | 8 pt grey italic at bottom left (Source: …; market data as of …), then numbered notes | 8–9 pt italic ([Anthropic skill](https://www.claudepluginhub.com/skills/anthropics-investment-banking-plugins-vertical-plugins-investment-banking/pitch-deck)) |
| Footer | 8 pt: "For information only. Not investment advice." on the left; Tearsheet Research and the slide number on the right | Footer disclaimer on every slide ([SlideSpeak](https://slidespeak.co/slide-design-prompts/prompts/pitch-book)) |
| Grid | 0.5 in side margins. Title box at (0.5 in, 0.35 in), 12.3 × 0.9 in. Content area 12.3 × 5.3 in. Footer at y ≈ 7.05 in. 12 columns with 0.25 in gutters | — |
| Theme colours | Accent1 #0B2D5B, Accent2 #0072B2, Accent3 #7F7F7F, Accent4 #8FA9CF, Accent5 #E69F00, Accent6 #D55E00 | Native charts take series colours from Accents 1–6 ([python-pptx](https://python-pptx.readthedocs.io/en/latest/user/charts.html)) |

The nine slides run in this order. First comes the recommendation. Second is business and key metrics: a strip of key figures and a 12-month price chart. Third is the thesis in three numbered points, each with a quantified impact. Fourth is the valuation football field with a multiples table, and fifth the bear/base/bull scenarios with drivers and implied prices. Sixth shows peers and factor scores as a heat-map table, and seventh the risks with mitigants plus a dated what-to-watch timeline. The last two slides are sources and disclosures. A PDF copy ships alongside the .pptx.

### Excel workbook: blue inputs, black formulas, a master check

| Element | Tearsheet spec | Benchmark |
|---|---|---|
| Font | Arial 10 everywhere; sheet title 12 pt bold navy | No source confirms a bank standard; chosen because it is installed everywhere |
| Inputs (assumptions you may change) | Blue font #0000FF on pale yellow #FFF2CC with a thin border; Inputs tab coloured yellow | Blue text on yellow ([Wall Street Prep](https://www.wallstreetprep.com/knowledge/financial-modeling-techniques/)); mark inputs by fill or border, not font alone ([ICAEW Code](https://www.icaew.com/-/media/corporate/files/technical/technology/excel-community/financial-modelling-code.ashx)) |
| Hard-coded data (historicals, peers, saved report figures) | Blue #0000FF, no fill, plus a source-ID column | Hard-codes are blue and tied to a source ([Financial Edge](https://www.fe.training/free-resources/financial-modeling/financial-model-formatting-numbers/)) |
| Formulas | Black #000000 | Same source |
| Links to other sheets | Green #008000 | Same source, which says some models use green |
| Check cells | Pass: fill #C6EFCE, font #006100. Fail: fill #FFC7CE, font #9C0006 | Checks get conditional formatting ([ICAEW Code](https://www.icaew.com/-/media/corporate/files/technical/technology/excel-community/financial-modelling-code.ashx)) |
| Header band | White bold text on navy #0B2D5B | — |
| Units row | Italic #595959 on #F2F2F2, e.g. (US$ in millions, except per share) | Label every unit ([ICAEW Code](https://www.icaew.com/-/media/corporate/files/technical/technology/excel-community/financial-modelling-code.ashx)) |
| Amounts | `#,##0.0_);(#,##0.0);"–"_)`: millions to 1 dp, negatives in brackets, zero shown as a dash | Millions to 1 dp, brackets for negatives ([IB guide](https://ibinterviewquestions.com/guides/valuation-investment-banking/formatting-standards-color-conventions-ib-models)) |
| Per share / percent / multiples | `$#,##0.00_);($#,##0.00)` / `0.0%_);(0.0%);"–"_)` / `0.0x` | `0.0x` keeps the cell numeric (tested in openpyxl) |
| Periods | Across the columns, headed FY2025A, FY2026E | Time runs horizontally ([ICAEW Code](https://www.icaew.com/-/media/corporate/files/technical/technology/excel-community/financial-modelling-code.ashx)) |
| Layout | Gridlines off. Freeze panes below the period header and right of columns B–D (label, units, source). Widths: A 2, B 40, C 10, D 10, periods 11 | ICAEW: freeze the labels and the timeline |
| Master check | Row 1 of every sheet shows `=Checks!$C$2` (OK or ERROR) in green or red | ICAEW: master check on every sheet |
| Tabs | Cover · Summary · Inputs · Historicals · Forecast · DCF · ResidualIncome · Multiples · Valuation · Sensitivity · Peers · Returns · Checks · Sources · Notes | ICAEW: inputs → calculations → outputs |
| Scenarios | Each driver has Bear, Base and Bull columns plus a Live column, `=INDEX(F12:H12,ScenarioIdx)`, set by a Bear/Base/Bull dropdown | ICAEW: one place per input, plus a scenario engine |
| Sensitivity | A plain formula grid (not an Excel Data Table): WACC down the side, terminal growth across, ±100 bp in 50 bp steps. The centre cell must equal the DCF value | — |
| Protection | Lock all cells, unlock the inputs, protect sheets with no password | — |
| Print | Landscape, one page wide; the footer carries the one-line disclaimer and the page number | — |

## Page one of a bank note carries the whole verdict

### Four real notes share the same two-column front page

The layout facts come from parsing four recent bank PDFs directly. Two are from J.P. Morgan: an earnings wrap on The Baldwin Group from November 2025 and a Valeo conference note from June 2026. The others are a Goldman Sachs update on ACM Research from May 2026 and a Morgan Stanley earnings update on Palantir from February 2026. A 2014 Morningstar report was used for structure only. **The Goldman and Morgan Stanley files came from a third-party mirror and were re-printed onto A4.** Their authenticity is unconfirmed, and their page size says nothing about house style. No BofA, Citi, UBS, Barclays or Jefferies sample was found, and no full bank initiation was opened.

J.P. Morgan's main column opens with the company name in **20 pt Arial Bold**, then a **13 pt headline that gives a verdict on the quarter** instead of a label, a bold 10 pt Times summary, and bullets that each open with a bold sentence. Its sidebar, about 2.1 in wide, stacks the rating word in 14 pt bold, Bloomberg and Reuters tickers, the price with its close date, the price target with its expiry month (an arrow shows it was cut, with the prior target beneath), the sector, the analysts and a quarterly EPS table with reported quarters marked "A" ([JPM BWIN](https://www.insurancejournal.com/app/uploads/2025/11/JPM_The_Baldwin_Group_3Q_2025-11-05_5115824.pdf)).

Morgan Stanley's sidebar takes about 37% of the page. It stacks label/value pairs: stock rating, industry view, a $205 price target, the dated price, market cap and 52-week range. Then it adds a three-line scorecard of its reaction to earnings: the thesis is unchanged, results were well above consensus, and consensus EPS is heading meaningfully higher ([MS PLTR](https://pingpan-reports.pages.dev/184428545811222.pdf)).

Goldman makes the rating the last word of the headline, in the pattern Company (TICKER): thesis; Buy. In a short note it moves the box with its 12-month target, price and **30.2% upside** to page 3 ([GS ACMR](https://pingpan-reports.pages.dev/812451214255522.pdf)).

The CFA Research Challenge, the student standard, sets the minimum front page as company, exchange, ticker, sector, industry, recommendation, dated price, and target price with % upside ([CFA RC guidelines](https://www.cfainstitute.org/-/media/documents/support/research-challenge/challenge/rc-written-report-guidelines.pdf)).

Two habits do most of the work of looking like a bank. The headline makes a claim rather than naming a topic, and **every number carries a date**: the price close, the target's horizon month, the estimates date and a publication timestamp. Morningstar even prints four separate as-of dates in its sidebar ([Morningstar ORCL](https://vfb.be/Media/Default/images/Oracle.pdf)). Tearsheet's saved report already knows these dates, so printing them costs nothing.

### Updates run 8–20 pages, and disclosures fill a third or more

| Note | Pages | Content | Disclosures |
|---|---|---|---|
| JPM Baldwin earnings wrap ([source](https://www.insurancejournal.com/app/uploads/2025/11/JPM_The_Baldwin_Group_3Q_2025-11-05_5115824.pdf)) | 20 | pp 1–14 | 6 pp |
| JPM Valeo conference note ([source](https://d1e00ek4ebabms.cloudfront.net/production/uploaded-files/JPM_Valeo_SA_Feedback_fr_2026-06-03_5323673-e85955dc-116b-4b6f-8d33-00dffeb8c5bb.pdf)) | 10 | pp 1–4 | 6 pp |
| GS ACM Research update ([source](https://pingpan-reports.pages.dev/812451214255522.pdf)) | 8 | pp 1–3 | 5 pp |
| MS Palantir earnings update ([source](https://pingpan-reports.pages.dev/184428545811222.pdf)) | 17 | pp 1–10 | 7 pp |

**Initiations run 50 to 100 pages or more** ([Mergers & Inquisitions](https://mergersandinquisitions.com/equity-research-report/)).

Inside an update, the order runs from news to valuation. J.P. Morgan opens with tables of results against its own estimates and against consensus, then segment revenue and margins, then guidance. Only after that does it turn to thesis, valuation and risks, and it writes the risks as conditions under which the stock could beat or miss the target ([JPM BWIN](https://www.insurancejournal.com/app/uploads/2025/11/JPM_The_Baldwin_Group_3Q_2025-11-05_5115824.pdf)).

Morgan Stanley runs a KPI dashboard, then model changes and the three financial statements. These lead to a **Risk Reward page with bull, base and bear cases**. For Palantir, the three cases are framed as 2030 free cash flow of $19.1bn, $15.5bn and $12.5bn ([MS PLTR](https://pingpan-reports.pages.dev/184428545811222.pdf)).

Full reports put the thesis first. The CFA Research Challenge allows at most 10 A4 pages of body text ([CFA RC guidelines](https://www.cfainstitute.org/-/media/documents/support/research-challenge/challenge/rc-written-report-guidelines.pdf)). It scores sections out of 100 points:

| Section | Points |
|---|---|
| Valuation | 20 |
| Financial analysis | 20 |
| Investment summary | 15 |
| Risks | 15 |
| ESG | 15 |
| Industry | 10 |
| Business description | 5 |

Tearsheet's seven-page plan compresses that initiation order. It needs only one page of disclosures, because no broker rules apply.

### Banks disagree on fonts but agree on size and restraint

Each bank picks different faces. J.P. Morgan sets body text in Times New Roman and everything else in Arial and Arial Narrow. Goldman uses its own GS Sans and GS Sans Condensed, with 9.5 pt body text and 7.5 pt disclosures. Morgan Stanley pairs a Gloriola family with Roboto, with 9 pt body text and a 23.5 pt headline. Morningstar uses only Univers Condensed, at 8.5–9 pt ([JPM BWIN](https://www.insurancejournal.com/app/uploads/2025/11/JPM_The_Baldwin_Group_3Q_2025-11-05_5115824.pdf); [GS ACMR](https://pingpan-reports.pages.dev/812451214255522.pdf); [MS PLTR](https://pingpan-reports.pages.dev/184428545811222.pdf); [Morningstar ORCL](https://vfb.be/Media/Default/images/Oracle.pdf)). Serif or sans is therefore a house choice. What the banks share is the size ladder: **9–10 pt body text, 7–8 pt tables and sidebars (usually in a condensed sans), about 7 pt legal text and 13–24 pt headlines**. That body size sits at or just below Butterick's 10–12 pt guidance for print ([Practical Typography](https://practicaltypography.com/point-size.html)), because the sidebar narrows the main column.

Tearsheet cannot borrow the bank fonts. Downloading Goldman Sans means accepting a restricted licence ([Goldman Sachs Design](https://design.gs.com/foundation/typography/goldman-sans)). That licence forbids implying any link to Goldman, and Goldman can end it without notice ([Typeroom](https://www.typeroom.eu/goldman-sachs-releases-goldman-sans-aka-a-bespoke-typeface-with-a-catch)).

The recommended pair is Source Serif 4 for body text and Source Sans 3 for everything else, which gives the classic serif-body look. Bundle both in the app and load them with `@font-face` from local paths, so printing never needs the network. IBM Plex or Inter would give the all-sans Goldman or Morgan Stanley look instead. All of these are believed to use the SIL Open Font License, but that was not re-checked, so confirm the licence files before bundling. The zero-effort fallback is J.P. Morgan's own mix of Times New Roman, Arial and Arial Narrow, all three already installed on this Mac in `/System/Library/Fonts/Supplemental`.

Colour is just as restrained. In the measured fills, J.P. Morgan uses steel blue #4F89BC, grey #7F7F7F and light grey #EFEFEF. Goldman uses navy #00355E with #EAEAED. Morgan Stanley uses blue #005B91, pale blue #E2F2FF, grey #F4F4F4, dark navy #232860 and a rare orange #FF3F00 ([JPM BWIN](https://www.insurancejournal.com/app/uploads/2025/11/JPM_The_Baldwin_Group_3Q_2025-11-05_5115824.pdf); [GS ACMR](https://pingpan-reports.pages.dev/812451214255522.pdf); [MS PLTR](https://pingpan-reports.pages.dev/184428545811222.pdf)). These counts cover only the pages' own drawing commands, not chart images, so they are approximate. Still, the pattern of one blue plus light greys is clear. Tearsheet's navy #0B2D5B belongs to the same family, with a computed 13.6:1 contrast on white.

Printing and colour-blind readers change three details. First, J.P. Morgan's #7F7F7F grey reaches only **4.0:1 contrast on white**. That is below WCAG's 4.5:1 for normal text, though above the 3:1 it requires for chart marks ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)), so Tearsheet keeps that grey for marks and sets small text in #595959 (7.0:1).

Second, green #007A4D and red #C00000 print at almost the same grey: lightness 45 against 40 on a 0–100 scale. They are also a classic colour-blind confusion pair. So signs and brackets should carry up and down, and dash patterns and text labels should separate the bull, base and bear lines. Even the colour-blind-safe Okabe-Ito blue and vermilion sit only about 8 lightness points apart ([Okabe-Ito palette](https://search.r-project.org/CRAN/refmans/see/html/okabeito_colors.html)).

Third, the banks appear to print the rating as a plain bold word, while traffic-light chips read as retail. This rests on text extraction, not a check of rendered pages.

### Electron 33 can print all of this, with one workaround

Tearsheet's `app/package.json` pins Electron `^33.2.1`. The installed copy is 33.4.11, which ships Chromium 130 ([Electron 33](https://electronjs.org/zh/blog/electron-33-0)). CSS `@page` margin boxes, which let a stylesheet draw running headers, arrived in Chrome 131 ([Chrome 131 release notes](https://developer.chrome.com/release-notes/131)). Electron 34 ships Chromium 132 ([Electron 34](https://electronjs.org/zh/blog/electron-34-0)).

Until the upgrade, headers and footers come from `printToPDF`'s `headerTemplate` and `footerTemplate`. These render in a separate, limited document. Only inline styles work, and font sizes must be set explicitly in points or the text renders tiny. Images work only as base64, and JavaScript does not run ([jsreport](https://jsreport.net/learn/chrome-pdf); [Gotenberg wiki](https://github.com/sanzstez/gotenberg-ruby/wiki)). In practice that means setting the headers and footers in Arial. It also means a header on page 1, unless page 1 is printed separately and merged.

The print call needs `preferCSSPageSize: true` and `printBackground: true`, which defaults to false ([Electron docs](https://www.electronjs.org/docs/latest/api/web-contents)). The stylesheet needs `print-color-adjust: exact` so the tints print. Chromium repeats table headers on every page ([Chromium review](https://codereview.chromium.org/2021703002)), and `break-inside: avoid` keeps each exhibit with its source line.

Two features are missing even in current Chrome: `target-counter`, for "see page N" references, and `string-set`, for running section titles ([Chrome for Developers](https://developer.chrome.com/blog/print-margins)). So the page-1 pointer should either say "at the end of this report", as Morgan Stanley's does, or come from a two-pass print.

No new renderer is needed. The engine already renders reports as Jinja HTML with SVG chart partials, so the PDF is a new print template and stylesheet, and its charts stay sharp vectors.

## Every exhibit carries a number, a title and a source line

Banks number every exhibit: J.P. Morgan numbers its tables, and Goldman and Morgan Stanley number their exhibits. Morgan Stanley often writes the title as a sentence that states the takeaway ([MS PLTR](https://pingpan-reports.pages.dev/184428545811222.pdf)). A source line sits directly beneath each one. Seven of J.P. Morgan's eleven source lines repeat one formula naming company reports and J.P. Morgan estimates. Vendors are added when used, and notes follow the source ([JPM BWIN](https://www.insurancejournal.com/app/uploads/2025/11/JPM_The_Baldwin_Group_3Q_2025-11-05_5115824.pdf)). Goldman and Morgan Stanley name FactSet or Refinitiv and add the date the price was taken ([GS ACMR](https://pingpan-reports.pages.dev/812451214255522.pdf)).

The tables share small conventions: reported periods end in "A" and estimates in "E", negatives sit in brackets, and estimate changes appear as New, Old and Diff columns side by side.

What the banks do not do is cite filings precisely. None of the three bank samples footnotes a 10-K or 10-Q page; filings appear only as company reports or company data. This is where Tearsheet can beat them.

In the PDF, keep the familiar format and add the filing, period, page and a short ID that resolves on the Sources page:

`Source: Company 10-K FY2025, p. 47 [S3]; market data as of 7 Nov 2026 close; Tearsheet estimates.`

In the deck, the same line goes bottom-left in 8–9 pt italic, followed by numbered notes that match superscripts on the slide. It sits in a footnote box about 32.5 cm wide on 16:9 ([Anthropic skill](https://www.claudepluginhub.com/skills/anthropics-investment-banking-plugins-vertical-plugins-investment-banking/pitch-deck)). Bank pitch books source every data point ([Deckary](https://deckary.com/blog/investment-banking-pitch-book)), so the deck should end with the full list.

In the workbook, a source-ID column next to every hard-coded row points to the Sources tab. Cell comments can hold exact filing references, but the column stays the main record, because comments disappear when printed.

The clearest public chart spec comes from the UK Office for National Statistics. It calls for a #B3B3B3 zero line and other gridlines in #D9D9D9, drawn behind the data and usually in one direction only. Labels go on the data instead of in legends, and charts have no borders or backgrounds ([ONS](https://service-manual.ons.gov.uk/data-visualisation/build-specifications/chart-elements)). Bank pitch-book guidance adds that every chart must still read in black and white ([Deckary](https://deckary.com/blog/investment-banking-pitch-book)). Tables follow suit: thin horizontal rules rather than full grids look more like a bank and survive greyscale printing.

For valuation, Wall Street Prep describes the football field as a floating bar chart that sets several methods side by side. The usual rows are DCF, trading comparables, precedent deals and the 52-week range ([Wall Street Prep](https://www.wallstreetprep.com/knowledge/football-field-valuation-real-example-excel-template/)). The 52-week range and analyst targets are reference points rather than methods ([Financial Edge](https://www.fe.training/free-resources/valuation/football-field-analysis/)).

Tearsheet's version would show DCF, residual income and multiples, each from low to high, plus the blended value and a lighter 52-week row. A solid ink line would mark the current price and a dashed navy line the 12-month base value.

Morgan Stanley Research presents bear, base and bull cases instead of a single point estimate ([EconBiz case record](https://econbiz.de/Record/the-risk-reward-framework-at-morgan-stanley-research-srinivasan-suraj/10013109175)). That is the closest sell-side precedent for Tearsheet's 12-month range.

FINRA also requires a broker that has rated a stock for a year to show a daily price chart marked with every rating and target change ([FINRA Rule 2241](https://www.finra.org/rules-guidance/rulebooks/finra-rules/2241)). Tearsheet is not bound by that rule, but it saves every report, so it could draw the same chart from its own past calls.

## Disclaimers should copy the bank's shape, not its legal wording

US broker research falls under FINRA Rule 2241. Each report must define its ratings with horizon and benchmark. It must show the share of buy, hold and sell ratings, and how many in each were investment-banking clients. It must include the rating history chart and explain the valuation method and risks. It must also disclose conflicts such as banking fees, stakes of 1% or more, market making and analyst holdings. All of this goes on the front page, or is clearly referenced there ([FINRA Rule 2241](https://www.finra.org/rules-guidance/rulebooks/finra-rules/2241)). Analyst certification is a separate rule, SEC Regulation AC. That is why J.P. Morgan tags certifying analysts "AC" and Goldman's footer cites Reg AC.

In practice, all three banks print a near-identical conflict paragraph on page one. It says the firm does business with companies it covers, so the reader should treat the report as one factor in a decision. A pointer to the disclosures follows, and a 5–7-page appendix closes the document. The published distributions lean towards Buy. J.P. Morgan's global coverage is **50% Overweight, 38% Neutral and 12% Underweight** ([JPM BWIN](https://www.insurancejournal.com/app/uploads/2025/11/JPM_The_Baldwin_Group_3Q_2025-11-05_5115824.pdf)). Morgan Stanley's is **41%, 43% and 16% across 3,695 stocks** ([MS PLTR](https://pingpan-reports.pages.dev/184428545811222.pdf)).

The ratings themselves are three-tier and relative. J.P. Morgan rates Overweight, Neutral or Underweight against its coverage universe, over the life of the target. Morgan Stanley rates Overweight, Equal-weight or Underweight against the analyst's industry coverage, over 12–18 months. UBS compares a stock's forecast return with a market return assumption, using a ±6% neutral band ([UBS ratings system](https://research.ibb.ubs.com/openaccess/compliance_pdf/Equity_Ratings_System.pdf)). Tearsheet's Buy/Hold/Sell is fine, as long as its disclosures page states the 12-month horizon and the benchmark.

Independent publishers use a different pattern. Morningstar prints a 5 pt disclaimer in every page header. It says the report is not investment advice and is for information only. It is also not an offer, carries no warranty, and states opinions as of the date written. The report then ends with a conflicts list: no holdings, no commissions, no charge to companies for being rated, public information only, and no preview for the company ([Morningstar ORCL](https://vfb.be/Media/Default/images/Oracle.pdf)). Pershing Square's decks say the material is for information only and not a recommendation ([PSH 2019](https://pershingsquareholdings.com/wp-content/uploads/2025/07/2019-Annual-Investor-Update-Presentation.pdf)), and is not an offer or solicitation ([PSH 2022](https://pershingsquareholdings.com/wp-content/uploads/2025/07/2022-Annual-Investor-Presentation.pdf)). They add that it rests on publicly available information ([PSH 2026](https://assets.pershingsquareholdings.com/wp-content/uploads/2026/02/11144917/2026-Annual-Investor-Presentation.pdf)), and that its forward-looking statements carry no duty to update ([PSH disclaimer](https://pershingsquare.s3.us-east-1.amazonaws.com/Robinhood+Disclaimer.pdf)).

In *Lowe v. SEC*, the Supreme Court held that bona fide publications of general and regular circulation need not register as investment advisers ([Cornell LII](https://www.law.cornell.edu/supremecourt/text/472/181)). But no source shows that a "not investment advice" line carries legal weight on its own; what the publication actually does matters more. For a personal app the stakes are low. If reports are ever shared or published, the wording deserves a lawyer's look.

Each Tearsheet file should follow the independent pattern. The PDF prints a page-1 footer line ("For information only; not investment advice. See important disclosures at the end of this report") and a short grey line in the running header. It closes with one page of Important Disclosures. That page says Tearsheet is not a broker-dealer or registered adviser, and offers impersonal research for general readers. It says nothing in the report is an offer or solicitation, and it names the data sources with no warranty given. It dates every opinion to the report date and defines each rating with its horizon and benchmark. It explains how values are calculated and what holdings or conflicts exist. It also states that the narrative is AI-generated and may contain errors, and it adds the usual caveats on forward-looking statements and past performance. The deck repeats the footer line on every slide and ends with a disclosures slide at 8–9 pt. The workbook puts a short version on the Cover, the full text on Notes, and the one-liner in the print footer.

Leave out the banks' sentence about doing business with covered companies, any Reg AC language or "AC" markers, and legal-entity lines. Each implies a regulated status Tearsheet does not have. One further suggestion, not drawn from any source: keep the report's own term, such as "12-month base value", rather than relabelling it a price target.

## Pitch decks put the rating and the range on slide one

The guides agree on a fixed order. Mergers & Inquisitions sets six sections. The recommendation comes first: long or short, the current price, how far the stock is mispriced and what it should be worth. Then come company background and a thesis of **two or three factors the market has missed**, each tied to a per-share impact. Catalysts in the next **6–12 months** follow, then valuation, and finally two or three risks with mitigants ([M&I stock pitch guide](https://mergersandinquisitions.com/stock-pitch-guide/)). A hedge-fund interview version runs about **5.5 minutes**: 30 seconds of thesis, 60 of business, 90 on what the market is missing, 60 of catalysts, 60 of valuation and 30 of risks ([Wall Street Playbook](https://wallstreetplaybook.org/hedge-fund-interview-prep)). CFA Research Challenge teams get 10 minutes ([CFA Institute](https://blogs.cfainstitute.org/researchchallenge/volunteers)). Bank pitch books for a first meeting run 15–25 slides ([Deckary](https://deckary.com/blog/investment-banking-pitch-book)).

Tearsheet's nine slides match the short pitch. A long version would add a slide per thesis point, financial history against consensus, sensitivities and an appendix.

Two visual styles exist. Conference decks are sparse: the 2024 Sohn idea-contest winner's title slide carried little more than the word IDEA and the ticker ASML in large type ([Hedge Fund Alpha](https://hedgefundalpha.com/sohn-new-york-conference-2024-full-coverage-in-pdf)). Bank decks are dense exhibits with footnotes. A deck generated from a saved report and read on screen or paper belongs in the second style. Hedge-fund evidence is thinner than bank evidence, since Sohn slides sit mostly behind paywalls and no activist deck was read slide by slide.

Bank deck rules are strict about consistency. Title, logo, page number and footer sit in the same place on every slide, because "inconsistency signals carelessness". Charts and tables dominate, and dense analysis is split across slides ([Deckary](https://deckary.com/blog/investment-banking-pitch-book)).

Anthropic's pitch-deck skill caps each box at six or seven bullets of two lines. It requires real table objects, with a bold header on the brand colour and a bold total row above a separator. It also rounds multiples to one decimal (9.7x) and growth rates to whole percentages. Its type sizes are as follows ([Anthropic skill](https://www.claudepluginhub.com/skills/anthropics-investment-banking-plugins-vertical-plugins-investment-banking/pitch-deck)):

| Element | Size |
|---|---|
| Titles | 40–48 pt bold |
| Body | 11–14 pt |
| Table headers | 10–12 pt bold |
| Table body | 9–11 pt |
| Footnotes | 8–9 pt italic |

A vendor's bank-style spec writes full-sentence titles under a small uppercase section label, with a thin navy rule. It uses navy #0c2340, a gold accent #b08d3f and #f4f6f8 zebra rows ([SlideSpeak](https://slidespeak.co/slide-design-prompts/prompts/pitch-book)). That is the same idea as Tearsheet's tokens: navy plus one warm accent.

The 40–48 pt title size suits a cover. A full-sentence title has to fit in two lines across a 13.3 in slide, which in practice means about 24 pt.

On the valuation slides, M&I wants a credible long to show a base case **20–30% above the price**, an upside case of **50% or more** and a downside of only **5–10%**. It also advises against stating scenario probabilities ([M&I](https://mergersandinquisitions.com/stock-pitch-guide/)). So a natural caption for the scenario slide compares bull upside with bear downside. Valuation bridges are drawn as waterfall charts ([Deckary](https://deckary.com/blog/investment-banking-pitch-book)). No source showed how banks colour bull, base and bear on slides, so those colours are Tearsheet's own choice.

python-pptx builds native, editable charts for most types except 3D, coloured from theme Accents 1–6. But it **cannot build combo charts** ([python-pptx](https://python-pptx.readthedocs.io/en/latest/user/charts.html)). So the football field (bars plus price lines) and any bar-plus-line chart should be rendered as 2–3× images in the same palette.

Its `fit_text()` forces Calibri, handles bold oddly, and does not keep its sizing when the text changes ([python-pptx analysis](https://python-pptx.readthedocs.io/en/latest/dev/analysis/txt-fit-text.html)). Text should instead be sized in code from a fixed ladder: titles 24 then 20 pt, body 14 then 12 pt. Anything still too long spills onto the next slide rather than shrinking.

Fonts are the other trap. Aptos is a cloud font that falls back to Calibri ([Office Watch](https://office-watch.com/2023/microsofts-font-substitution-for-aptos-really-sucks/)). Embedded fonts are unreliable in PowerPoint for Mac ([Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/5653309/powerpoint-for-mac-keeps-losing-embedded-fonts-aft)). Google Slides swaps embedded fonts and turns charts into static images ([SlideModel](https://slidemodel.com/fix-compatibility-powerpoint-google-slides/)). Arial and Georgia, both installed on this Mac and used without embedding, avoid all three problems. A PDF of the deck is the copy that looks right everywhere. Keynote's handling of native charts is untested, and python-pptx is not yet an engine dependency.

## Bank models colour every cell and prove themselves with a check

The colour code is close to universal. Financial Edge, a bank training firm, colours hard-coded numbers blue, assumptions blue on a coloured background, formulas black, and links to other sheets sometimes green ([Financial Edge](https://www.fe.training/free-resources/financial-modeling/financial-model-formatting-numbers/)). Wall Street Prep shows hard-coded inputs as blue text on yellow shading ([Wall Street Prep](https://www.wallstreetprep.com/knowledge/financial-modeling-techniques/)).

The ICAEW Financial Modelling Code (2024) adds that inputs must be marked by fill or border rather than font colour alone. A workbook also needs a formatting key and consistent styles, and extra decimals overstate precision ([ICAEW Code](https://www.icaew.com/-/media/corporate/files/technical/technology/excel-community/financial-modelling-code.ashx)). The exact #0000FF blue and #008000 green come from secondary guides ([modelmint](https://modelmint.pages.dev/guides/how-to-color-code-a-financial-model.html)). The add-in vendor Macabacus dissents by shading inputs blue ([Macabacus](https://macabacus.com/blog/improving-model-readability-with-color-formatting)). The convention is not absolute, but blue, black and green is what bankers recognise.

Number formats follow the same habits. Amounts are in millions to one decimal with negatives in brackets, percentages go to one decimal, and multiples carry an "x". Totals are bold, with a single border above subtotals and a double border above grand totals ([IB guide](https://ibinterviewquestions.com/guides/valuation-investment-banking/formatting-standards-color-conventions-ib-models)).

The ICAEW Code also sets the structure. Logic runs from inputs to calculations to outputs, top to bottom and left to right, so the workbook reads like a book. Periods run across the columns, with one timeline per sheet. A dashboard, a clickable table of contents and a user-guide sheet live inside the workbook, and nothing is hidden, whether sheets, calculations or white text. Each row repeats one formula all the way across, and constants stay out of formulas. Each sheet copies in what it needs from other sheets rather than referencing them mid-calculation, and iterative calculation stays off ([ICAEW Code](https://www.icaew.com/-/media/corporate/files/technical/technology/excel-community/financial-modelling-code.ashx)). Wall Street Prep tolerates a switchable circular reference for interest ([Wall Street Prep](https://www.wallstreetprep.com/knowledge/financial-modeling-techniques/)). Tearsheet's model avoids the problem by taking net debt as an input.

Scale matters too. Real sell-side models are full earnings models built down to segment and product level. Visible Alpha says it collects full working models from **more than 250 sell-side firms**, a figure it reports itself ([S&P Global Visible Alpha](https://www.spglobal.com/market-intelligence/en/solutions/visible-alpha-insights)). Tearsheet's workbook is a summary valuation model, and its Cover should say so.

Checks are what make a model trustworthy. ICAEW asks for an equality check with a tolerance wherever two separately computed values should match, with conditional formatting on every check. It also wants a master check visible in the frozen pane of every sheet, and a split between alerts for business conditions and error checks ([ICAEW Code](https://www.icaew.com/-/media/corporate/files/technical/technology/excel-community/financial-modelling-code.ashx)). Tearsheet's Checks tab sets each model value against the saved report value. That covers each valuation method's value, the blended value, the bear, base and bull values, and every historical figure used. Each row shows the difference, a tolerance (0.005 per share, or 0.05 for $m figures) and a 1 or 0 pass flag, computed by `=IF(ABS(C5-D5)<=F5,1,0)`. Sanity rows confirm that weights sum to 100%, WACC exceeds terminal growth, bear ≤ base ≤ bull, and no required input is blank. The master check is `=IF(MIN(G5:G30)=1,"OK","ERROR")`.

The report-matching rows should be labelled alerts, which hold only while the inputs match the saved report. That way a user who changes WACC sees a divergence rather than an error.

The library choice decides whether the file opens correctly. openpyxl writes formulas but stores no results: in a local test its formula cell read back empty ([openpyxl](https://openpyxl.readthedocs.io/en/stable/tutorial.html)), so Quick Look and other previewers would show blanks. XlsxWriter stores 0 as each formula's result unless given a value, and a test formula given 15 read back as 15 ([XlsxWriter docs](https://xlsxwriter.readthedocs.io/working_with_formulas.html)). Because Tearsheet's engine already computes every number in code, **XlsxWriter is the natural fit, with each formula's Python result passed in as its stored value**.

Two tools can verify the output. Headless LibreOffice 26.8.2.2 on this Mac recalculated and filled the stored values while keeping gridlines off and freeze panes ([LibreOffice](https://www.libreoffice.org/)). The pure-Python `formulas` library computed the same values without LibreOffice ([formulas docs](https://formulas.readthedocs.io/en/stable/)).

The test should assert that the master check reads OK, that the key outputs equal the saved report, and that no cell holds #REF! or #DIV/0!. Avoid Excel Data Tables, dynamic arrays, LET and LAMBDA, macros, external links, and post-2010 functions without their `_xlfn.` prefix. XlsxWriter, like python-pptx, still has to be added to the engine's dependencies.

## Conclusion

The research turns "how do we look like Goldman?" into a more useful question: which cues do readers use to judge whether research is credible? The answer is a set of data habits rather than decoration: dated numbers, a verdict sidebar, numbered and sourced exhibits, restrained colour and a closing disclosures block. Those habits suit Tearsheet unusually well. Its engine already holds every number, date and source, so the bank look is mostly a templating job. One set of design tokens, shared by the HTML print template, the .pptx theme and the XlsxWriter styles, will make the three downloads read as one house. Proprietary bank fonts and exact bank colours are neither needed nor allowed, and the banks themselves split between serif and sans, and between steel blue and navy.

Tearsheet can also beat the banks in two places. Its citations can name the filing and page, while sell-side PDFs cite only generic company sources. And its workbook's Checks tab proves the numbers reproduce the published report, which no sell-side PDF offers. A third, optional step is to print Tearsheet's own past ratings and ranges on the price chart. FINRA forces brokers to show this, and it would give an honest record of how past calls held up. Four risks remain open. On evidence, the Goldman and Morgan Stanley samples came from an unverified mirror, and five other banks went unsampled. Chart styling was not checked on rendered pages, and Keynote's handling of native charts is untested. The legal weight of the disclaimers matters only if reports leave Liam's Mac. The one engineering decision that changes the plan is moving to Electron 34 or later. That would let CSS draw the running headers and keep them off page 1.
