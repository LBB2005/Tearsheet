# Excel download: a numbers workbook first, or the full live model now?

* **Author:** Claude, for Liam Blackshaw-Brown
* **Date:** 2026-11-08
* **Status:** options for review. Nothing is built yet.

## What this is for

Tearsheet is Liam's personal Mac app (Electron + React in `app/`, a Python 3.12 engine in
`engine/`, a SQLite store). It turns an S&P 500 ticker into a cited research report with a
rating (Buy / Hold / Sell against its peer group), a peer percentile score and a 12-month
bear / base / bull price range. Liam is adding three downloads at the end of a finished report:
a PDF, a slide deck and an Excel file. Each file is made from the saved report at the moment he
clicks, with no AI calls, so it adds no time to writing a report.

This note is only about the Excel file. Liam wants it to look like a bank made it and, if it
models anything, to be accurate. He asked for the pros and cons of two options.

Hard rules that apply to every option:

* The prediction log is never changed. A company's first rated report in 30 days is its
  official prediction, write-once by database triggers (`engine/src/tearsheet/db/migrations/0002_report.sql`).
  Downloads only read saved reports.
* No live full report may be run on a new company as a test, since it would become an official
  prediction. Tests use saved reports or a copy of the data.
* Every file carries the label "Research data, not investment advice."

## What the engine does today (facts)

* **Estimated value** = the median of the valid valuation methods (the average of two; the one
  value when only one is valid). `engine/src/tearsheet/valuation/combine.py`.
* **DCF**: revenue grows at the 3-year rate, capped at the peer group's 90th percentile and
  floored at −10%, held for years 1–5, faded in a straight line to the terminal rate by year 10;
  margin moves to the peer median by year 5; reinvestment = revenue increase ÷ peer median
  sales-to-capital; terminal growth = the lower of 2.5% and the 10-year yield.
  `valuation/dcf.py`.
* **Residual income**: book value + present value of (ROE − cost of equity) × prior book value
  for years 1–10, ROE fading to the peer median. `valuation/residual_income.py`.
* **Peer multiples**: P/E and EV/EBIT, peers with earnings ≤ 0 dropped, then the top and bottom
  10% trimmed, harmonic mean of the rest; valid with at least 5 peers left. `valuation/multiples.py`.
* **Banks, insurers, REITs** use different method sets. `valuation/financials.py`.
* **12-month range**: base = price × (1 + cost of equity − dividend yield) + ⅓ × (value − price);
  bear and bull are the 10th and 90th percentiles of a lognormal spread from the stock's 12-month
  volatility moved halfway toward the peer median. `valuation/range.py`.
* **What a saved report keeps**: the final value, the risk-free rate, each method's value per
  share, the range, the price and its date, the rating, the score and factor percentiles, key
  metrics with peer medians, 12-month returns, peer rating counts, the economy series, and every
  claim with its cited source quote (`report_numbers.numbers_for`, `step_outputs` rows).
  All 24 of Liam's saved reports load these in full.
* **What a saved report does not keep**: the inputs each method used (the company's
  `ValuationInputs`, the peer group statistics, the cost of equity, the volatility). These exist
  only in memory during a run (`pipeline.py`, `value()`).
* **Replay** (`replay.py`) re-runs a run's code steps from its stored raw inputs, read-only, and
  checks every step output matches the stored one exactly. So those inputs can be rebuilt.
* **Golden test** (`golden.py`, `evals/golden/`): 20 hard-case companies frozen offline. It
  checks hand-checked inputs against EDGAR (within 0.5%) and compares every rating, score and
  bear / base / bull with the last reviewed run (`last_run.json`). It does not check any download.
* **Tools**: XlsxWriter can write formulas together with their computed results, so the file
  shows the right numbers even in Quick Look before Excel recalculates. LibreOffice
  (`/opt/homebrew/bin/soffice`) and the pure-Python `formulas` library can recalculate a
  workbook in tests. Neither is shipped inside the app.

## Option A: a numbers workbook now, the live model as a later step

**What it holds.** Cover · Summary · Valuation (each method's value, typed in) · Range ·
Score and factors · Key metrics vs peers · Returns · Peers · Economy · Sources (numbered,
matching the PDF's notes) · Checks · Notes. Bank formatting: Arial 10, blue typed figures,
navy header bands, units rows, frozen panes, gridlines off. The Checks tab compares every
figure with the saved report and must read OK.

**Pros**

* Matches the report exactly, because every figure is copied from the saved report.
* Small build; ships with the PDF and the deck.
* Works the same for all 24 saved reports and every future one.
* No new golden test: a test that each cell equals the saved number is enough.

**Cons**

* No what-ifs: Liam can't change growth or the discount rate and see the value move.
* The method values are typed numbers, so the workbook shows *what* the engine found, not *how*.

## Option B: the full live model now

**What it adds.** An Inputs tab (the company's inputs and the peer group statistics, blue on
pale yellow); DCF, Residual income and Multiples tabs with every step as a formula; a Valuation
tab that takes the median; a Range tab with the lognormal formula (`NORM.S.INV`); a Bear / Base /
Bull switch; a sensitivity grid (discount rate × terminal growth); Checks that compare the
formulas' results with the saved report.

**What it needs.**

* At click time, the engine rebuilds the run's inputs through replay and writes them into the
  workbook.
* A second copy of the valuation maths, as Excel formulas, that must stay in step with the
  Python.
* A new golden step: build the model for each of the 20 golden companies, recalculate it
  (LibreOffice or `formulas`), and check the value and bear / base / bull against the engine
  within 0.5%.

**Pros**

* Liam can change an input and see the value and the range move: a real model.
* Shows how each number was reached, which is what a bank model does.
* The golden step proves the formulas reproduce the engine on the hardest 20 companies.

**Cons**

* By far the biggest piece: rough estimate 4–5 times the work of Option A.
* Two copies of the method. Any methodology change needs the formulas changed too, or the
  golden step fails.
* Replay at click time may take several seconds per download (not measured).
* Edge cases each need their own sheet logic: banks and insurers (no DCF), REITs (FFO), one
  method only, negative earnings, fewer than 5 valid peers.
* The rating and score are peer rankings across about 40 companies; they stay typed numbers.
  Edited inputs change the model's value but never the official rating, so the workbook must
  say so plainly.

## A middle option to weigh (C)

Option A, plus a live Range tab only: the method values stay typed, but the median, the base
case and the bear / bull spread are formulas. That still needs replay for the cost of equity and
the volatilities, but only a handful of inputs. It gives one meaningful what-if (change the
value or the volatility, see the range move) at a fraction of Option B's cost.

## Questions for reviewers

1. Which option should come first, and why?
2. What could make each option wrong or misleading for Liam?
3. What hidden costs or risks are missing above?
4. Is the golden-test plan for Option B enough to call the model accurate?
