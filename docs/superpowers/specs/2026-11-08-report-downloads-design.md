# Report downloads: PDF, slide deck and Excel

* **Date:** 2026-11-08
* **Status:** approved by Liam and built on branch `claude/report-downloads-5a7309` (8 Nov 2026). The Excel became a classic bank model with a Financials tab (see the decisions below); the PDF includes analystdb's ratings and targets, never S&P Global's figures.
* **Research behind it:** `reports/Bank style equity research templates.md`; sample looks in
  `docs/designs/download-looks/` (Liam picked **Look 2, Modern research**).

## Why

Liam wants to take a finished Tearsheet report out of the app: to print it, send it, present it,
or work with its numbers. The files should look like a bank's equity research, carry Tearsheet's
own signature, and match the report exactly.

## What Liam decided

| Topic | Decision |
|---|---|
| Formats | All three: PDF, slide deck (.pptx), Excel (.xlsx). Built in that order, each tested before the next. |
| PDF contents | A summary page (page 1), then the full report. |
| Sources in the PDF | Numbered notes: each claim carries small note numbers; a Sources section at the end lists each note's source name, quoted paragraph and link. |
| Look | Light and print-friendly. **Look 2, Modern research**: Charter body, Avenir Next labels and headings, navy `#0B2D5B` rules, greys, and the bear / base / bull colours `#D55E00` / `#0B2D5B` / `#0072B2`. |
| Tearsheet signature | As in Look 2: the Tearsheet glass logo with "TEARSHEET RESEARCH" in spaced capitals at the top, a short cyan "price line" rule (`#0E7490` → `#7FE3F7`) under the headline, and the small logo in the footer. |
| Buttons | At the end of the report only: Download PDF, Download slide deck, Download Excel. |
| Saving | Straight to `~/Downloads`, named like `JPM Tearsheet 8 Nov 2026.pdf`. A short note says it saved, with Show in Finder. |
| Older reports | Every saved report can be downloaded. All 24 of Liam's saved reports load their full numbers (checked on a copy of the data). |
| AI | None. Every file is built from the saved report when Liam clicks. Writing a report takes no longer; a click takes seconds. |
| Excel scope | **Option A now, the live model (B) later.** A numbers workbook copied from the saved report, with the EGM review's fixes (`docs/designs/downloads-excel-review.md`). |
| Deck length | **12 main slides + 6 appendix**, like a CFA Research Challenge deck (`research_notes/Bank style equity research templates/deck_length.md`). |
| After the downloads | Save each valuation method's assumptions when a report is written (a new step row replay doesn't compare), so later workbooks can show them and support what-ifs. A separate step, after this one. |

## Goals

* Three files that look like a bank wrote them, from any saved report, in seconds.
* Every number and quote in a file equals the saved report's. Tests prove it.
* Every page, slide and sheet carries "Research data, not investment advice."
* Tearsheet's signature on every file.

## Non-goals

* No new AI calls, no AI-written text.
* No forecasts Tearsheet doesn't make (no next-year earnings estimates, no consensus unless the
  report already shows analystdb's figures).
* No changes to the prediction log, the report text, or how reports are written.
* No buttons outside the report's end; no Save dialog.

## Anti-goals (would be a failure even if it works)

* A file whose number differs from the report's, or a quote attached to the wrong claim.
* A file that looks like a real bank's note (no bank names, logos, or the banks' FINRA wording).
* A download that changes anything in the store.
* A test that writes an official prediction or opens a visible, focus-taking window.

## Constraints

* The prediction log is write-once; downloads only read saved reports.
* Tests use saved reports from a copy of the data, never a live run on a new company.
* Test windows stay hidden, on a copy of the data, launched with `open -g`, never take focus.
* Electron is 33.4 (Chromium 130): CSS `@page` margin boxes (running headers, "Page X of Y")
  aren't supported, so page numbers come from `printToPDF`'s `footerTemplate`.

## How it works

### The flow

1. The report's end (the engine's HTML, `report.html.j2`, app mode) gets a "Download" row with
   three links: `tearsheet://download/<format>/<report id>`, format `pdf`, `pptx` or `xlsx`.
2. `main/navigation.ts` learns a `download` action (format and report id checked by pattern,
   anything else blocked, as for `flag` and `open`). `main/index.ts` passes it to a new
   `main/downloads.ts`.
3. `downloads.ts` picks the file name in `~/Downloads` (`<TICKER> Tearsheet <d Mon yyyy>.<ext>`,
   adding ` (2)`, ` (3)` if taken; the date is the report's), asks the engine for the file, writes
   it, and tells the window: saved (with the path) or failed (with a plain reason). The renderer
   shows a small note at the bottom of the report page: "Saved JPM Tearsheet 8 Nov 2026.pdf to
   Downloads · Show in Finder". Show in Finder is `shell.showItemInFolder`.
4. A second click while a file is being made is ignored for that format.

### The engine (all three files are made from the saved report)

A new module `engine/src/tearsheet/export/` reads a saved report the way `m_get_report` does:
the stored report JSON (`sections`), `report_numbers.numbers_for(...)`, the run's company name
(`companies.run_company`), and the analyst panel only if the report page shows it. Read-only.

* **PDF:** a new server method `print_report(report_id)` returns print HTML from a new template
  `print.html.j2` (Look 2's styles, US Letter). The app's main process loads that HTML into a
  hidden `BrowserWindow` (`show: false`, never focused, sandboxed, no scripts) and calls
  `webContents.printToPDF({ pageSize: 'Letter', printBackground: true, displayHeaderFooter: true,
  footerTemplate })`. The footer template carries "Tearsheet Research · Research data, not
  investment advice" and "Page X of Y". Charter and Avenir Next are part of macOS, and Chromium
  embeds the used letters in the PDF, so it looks the same on any computer.
* **Excel:** `export_xlsx(report_id, path)` writes the workbook with XlsxWriter (formulas carry
  their computed values, so Quick Look shows numbers too).
* **Slide deck:** `export_pptx(report_id, path)` writes the deck with python-pptx.
* New engine dependencies: `xlsxwriter`, `python-pptx` (which brings `Pillow`; `lxml` is already
  there). The packaged engine grows by roughly 15 MB (estimate).

### The PDF, page by page

1. **Front page (Look 2).** Header: logo + TEARSHEET RESEARCH, ticker and date. Main column:
   "Company note · date", company name and ticker, a code-written headline (`Hold: base case
   $350.58 by Nov 2027, 4.8% above today's price, with very high uncertainty`), the cyan rule,
   the Summary view's call line in bold, then **Key points**: the first surviving claim of each
   section (as the app's Summary shows), each with its note numbers. Exhibits: 1 share price
   (weekly closes, 12 months), 2 value per share by method with the estimated value, 3 score
   factors. Sidebar: rating box, base case and its month, price and its date, upside, estimated
   value, uncertainty, the 12-month range bar, ticker, sector, score, peer ratings, 52-week
   range, 12-month returns, and the as-of dates.
2. **The full report.** Every section in order with its code-written lines, its tables as
   numbered exhibits with source lines, and every surviving claim with its note numbers; red
   flags stand out as in the app. Then the numbers the app shows in its numbers column: key
   metrics vs peer medians, returns, peer ratings, economy, red-flag checks, the checks and the
   methodology.
3. **Sources.** Numbered notes in order of first use: source name (e.g. "10-K, Item 1A" or
   "CNBC, 13 Oct 2026"), the quoted paragraph, and the link. One note per citation, so a quote
   is never attached to the wrong claim.
4. **Important information.** Independent-research wording (not the banks' FINRA wording): made
   by software from public filings, prices and news; research data, not investment advice; not
   an offer or recommendation to buy or sell; no warranty; check the sources; how the rating,
   score and range are defined; the official prediction id when the report is one.

Sizes (Look 2, from the research): body 9.5 pt Charter on about 13 pt leading; company name
20 pt; headline 12.5 pt; section heads 8.5 pt caps; tables 7.5 pt; source lines 6.5 pt italic;
footer 6.5 pt. Margins 0.55 in top, 0.6 in sides, 0.5 in bottom plus the footer. Tables and
exhibits don't split across pages.

### The slide deck

16:9 (13.333 × 7.5 in), white, Look 2's navy, greys and signature: logo + TEARSHEET RESEARCH at
the top left, the cyan rule under the cover title, "Research data, not investment advice" and
"Tearsheet Research · page" in every footer. Every slide has a one-sentence title written by code
from the numbers, and a source line. Text is taken from the report as is.

*My call:* the deck uses **Arial**, not Avenir Next, because a .pptx doesn't carry its fonts and
Arial is on every Mac and PC; colours, layout and signature stay Look 2's.

Text slides fit as many whole claims as the space allows (claims are never cut or reworded);
a line says how many more are in the PDF. Titles on number slides state the number
(e.g. "Estimated value $310.88, the median of 2 methods; price $334.49").

**Main (12):**
1. Recommendation: name, verdict line, call box (rating, price and date, base case, upside,
   uncertainty), range bar, three code-written points, 12-month price chart.
2. Key points: the first surviving claim of each section, with note numbers.
3. The business (its claims).
4. Recent results (its claims).
5. News and industry trends (their claims).
6. Valuation by method: every method with its value or the reason it isn't used, and the
   estimated value.
7. Bear / base / bull: range chart and table, with the price and upside.
8. Score vs peers: the factors with percentiles and weights.
9. Key metrics vs peer medians.
10. Returns and price: 12-month returns vs peers and the S&P 500, peer rating counts, price chart.
11. Risks: its claims and any red flags.
12. What to watch: its claims and the buy / sell triggers.

**Appendix (6):** A1 the economy; A2 checks (claims kept and removed, red-flag checks);
A3 method (how the rating, score and range are made); A4–A5 sources (the deck's numbered notes;
more slides if they don't fit); A6 important information.

### The Excel workbook

Bank formatting from the research: Arial 10, gridlines off, frozen panes, navy header bands,
units rows, typed figures in blue `#0000FF`, formulas black, links green `#008000`, number
formats `#,##0.0_);(#,##0.0)`, `0.0%`, `0.0x`. Cover tab with the logo, the label and how to
read it; a Checks tab comparing each figure with the saved report; a Sources tab with the same
numbered notes as the PDF.

**Scope: Option A** (Liam, 8 Nov), with the EGM review's fixes:

* **Tabs:** Cover · Summary · Valuation · Score and metrics · Returns and peers · Economy ·
  Sources · Checks.
* **Cover:** a fixed **Official call** box (rating, score, base case, bear / bull, price and date);
  whether the report is an official prediction (its id and date) or not, and why if known;
  "Prices as of [date], in that day's shares" plus any split since; run id, report id, engine
  version, method code version and methodology hash; the colour key; the label.
* **Colour key:** blue = copied from the saved report; black = a formula; nothing in the file
  recalculates the report or changes its rating.
* **Valuation:** read from the saved valuation table, so methods that aren't used show their
  reason (e.g. "not meaningful for banks and insurers").
* **Sources:** the same numbered notes as the PDF, read from the saved claims.
* **Checks that can fail:** the median of the valid method values equals the estimated value
  (to $0.01); upside = base ÷ price − 1; bear < base < bull; for an official prediction, bear /
  base / bull equal the prediction row. Each shows OK or CHECK in green or red, rolled up to a
  master check on the Cover.
* **Named cells** for the key results (Price, Value, Bear, Base, Bull, each method's value), with
  other tabs referring to the names, so a later live model replaces one cell, not many.
* Withheld ratings and thin-slice reports: tabs with nothing stored say so instead of showing
  blanks.

**Later (not this build):** the live model (Option B), after reports save their inputs; see the
EGM review for what it needs (inputs saved at report time, a test plan that really recalculates,
an Official call box beside every what-if).

## Testing

* **Engine:** for each format, build the file from a fixture report and from three saved
  reports in a copy of the data (a bank, a normal company, a red-flag case), then read the file
  back (PDF HTML, XlsxWriter cells via openpyxl, pptx text) and check every number, date and
  quote equals `numbers_for` and the stored claims, the label is present on every page / slide /
  sheet, and note numbers map to the right citations.
* **App:** `navigation.test.ts` for the `download` action (good and bad links); `downloads.test.ts`
  for file naming (` (2)`, dates, odd tickers like `BRK.B`) and the saved / failed messages;
  the note and Show in Finder in a renderer test.
* **End to end, hidden:** the built app on a copy of the data, hidden window, `open -g`: click each
  link on a saved report, check the three files land in a scratch Downloads folder and open.
* No live run, no official prediction, nothing written to the real store.

## Left to the builder

* Exact page breaks and spacing within Look 2's rules.
* The Download row's styling in the app's report (match the report's current look tokens).
* Error wording, in plain language.

## Changes after Liam saw the samples (8 Nov 2026)

* **Excel restyled** as a classic bank model: white, Arial, thin grey rules, bold totals, blue for
  typed figures and black for formulas; five tabs (Summary, Financials, Valuation, Peers, Sources &
  checks); four charts (share price, revenue and margin, valuation range, 1-year return vs peers);
  a hover note on every typed figure saying where it came from.
* **Financials tab:** the last three fiscal years and the last 12 months, rebuilt read-only from
  the run's stored SEC company facts the engine's way (`normalize.Financials`). Checks tie its LTM
  figures to the report's metric inputs and each peer median formula to the report's own.
* **Analyst ratings:** in the PDF only ("The street's view"), analystdb's ratings and targets as of
  the report's price date; S&P Global's trust-check figures are left out.
* **Deck:** sources grouped by passage fit one slide, so the appendix is 5 slides (17 in all).

## Next (agreed, not built)

* Save each valuation method's assumptions when a report is written (a step row replay doesn't
  compare), so later workbooks can show them and support what-ifs.
* The live valuation model (Option B), after that; see `docs/designs/downloads-excel-review.md`.
