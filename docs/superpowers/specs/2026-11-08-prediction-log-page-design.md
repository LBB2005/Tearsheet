# The prediction log page: screener, good-pick consensus and a compare chart

* **Date:** 2026-11-08
* **Status:** approved by Liam ("b … implement this fast"), 8 Nov 2026. Built on branch
  `claude/prediction-page-c5a4ec`.
* **Mockups:** the Design canvas "Prediction log redesign",
  https://claude.ai/artifact/9mDYyPSquPT2mpxm7JzjAM. Round 1 had 8 layouts; Liam liked 4 (good
  picks shortlist) and 7 (range ladder) most, with parts of 1 and 2. Round 2 mixed them; he picked
  **B · Screener + shortlist**, with "an option to see all".

## Why

The prediction log page (`app/src/renderer/pages/Log.tsx`) was one table: date, ticker, rating,
bear, base, bull and grades. With 39 official predictions, and hundreds coming from the bigger
report line, Liam wants to filter them, find the good stocks quickly, and compare several stocks
on one chart.

## What Liam decided

| Topic | Decision |
|---|---|
| Layout | Version B: a filter column on the left; on the right, good-pick cards, the results table and the compare chart. |
| Good pick | A **consensus of 4 checks**: rated Buy · base case at least 20% above today's price · peer score at least 40 · chance of beating peers at least 50%. A good pick meets at least **3 of 4**. The three numbers and the "3" can be changed. Today: MU and DAL meet 4, CMCSA and PSX meet 3. |
| See all | The default shows **every** prediction. "Good picks only" is a choice, never forced; the cards row can expand to show every prediction as a card. |
| Filters | Rating, sector, risk (the report's uncertainty level) and grades, each with counts; plus the consensus rule. |
| Chart | % return with the S&P 500 as a grey dashed line. Range buttons 1M, 3M, 1Y, Since prediction. |
| Picking | Tick boxes on the rows and clicking a card, up to 6. |
| Extras | A bear-to-bull bar on each row (log scale against today's price), open the report from a row, export the shown rows to CSV. |

Drafter's calls (Liam saw them and didn't object):

* **Since prediction** plots each stock's **lead over the S&P 500** from its own prediction day
  (stock return − SPY return over the same days), with 0% meaning level with the S&P. That is how
  grading measures it, and it works when picks were made on different days. The x axis is trading
  days since each prediction.
* **Upside** uses today's price (what is left of the predicted move).
* **One company, several predictions:** only the newest prediction per company is a good-pick card
  and goes on the chart; older ones still list in the table (marked "older").

## Goals

* Narrow the log to the stocks Liam cares about in a few clicks, with counts that show what each
  filter does.
* "Good picks" is visible at once, and the rule behind it reads in plain words on the page.
* Compare up to 6 stocks against each other and the S&P 500.
* Look like the rest of the app (look C, the app's colour tokens; light and other looks work).

## Non-goals and anti-goals

* No change to how predictions are made, stored or graded. **Nothing on this page writes to
  `predictions` or `grades`.** No AI calls, no network fetches.
* It must not read as advice: "Good pick" is a filter on the method's own numbers, under the
  "Descriptive, not conclusive … not investment advice" notice.
* Prices agree with the report chart and grading: split-adjusted, total return.

## The page

* **Toolbar:** title and subtitle as today; **Export N rows (CSV)** and **Grade what is due**.
* **Notice:** the existing "Descriptive, not conclusive" line.
* **Left column (filters):**
  * *Good-pick consensus:* "at least N of 4" chips (1–4) and three sliders (upside 0–60%, peer
    score 0–90, beat peers 30–80%). Remembered between launches (localStorage, like `chart/prefs.ts`).
  * *Show:* All predictions (default) · ★ Good picks only, with counts.
  * *Rating*, *Sector*, *Risk*: tick boxes with counts. *Grades*: waiting / graded, with counts.
  * Clear filters.
* **Right column:**
  * **Good picks** cards: ticker, rating, upside, the 4 check squares, "N of 4". Clicking a card
    adds it to the chart. A "Show all as cards" switch lists every shown prediction as a card.
  * **Results table:** tick box · ticker, ★ if good, company · sector and risk · rating · check
    squares · peer score · beat-peers chance · bear-to-bull bar (log scale, today's price in the
    middle, white tick at base) · upside · open-report arrow. Sorted by checks met, then upside;
    a sort menu offers upside, peer score, chance, date made, ticker. Grades already in show
    under the ticker. Every shown row is listed (the list scrolls; nothing is cut off).
  * **Compare chart:** ticked stocks and the S&P 500, range chips, legend with each line's change.
* Empty states keep today's wording ("No official predictions yet …", "Nothing graded yet …").

## Data

* `list_predictions` gains `name`, `sector`, `share_class`, `score`, `probability`, `uncertainty`,
  `report_id` (newest report of the run), `price` and `price_date` (newest stored close, put into
  the prediction's shares with any split since, so it compares with bear, base and bull).
* New read-only call **`prediction_prices`** `{ciks, since}` → `{dates, spy, series: [{cik,
  total}]}`: SPY's trading days from `since`, and each company's and SPY's total-return index on
  them (`charts._index`).
* The window works out the checks, filters, sorting, bar positions and chart lines (`log/log.ts`
  and `log/compare.ts`), all pure and tested.

## Export

**Export N rows (CSV)** writes the shown rows to `~/Downloads/Tearsheet predictions 8 Nov 2026.csv`
(a free name if taken) through the main process, then offers Show in Finder.

## Testing

* Engine: the new fields (including a split after the prediction) and `prediction_prices`, and
  that neither call writes.
* Window logic: checks and their edges, every filter, sorting, the 6-tick limit, bar positions,
  chart lines for each range and Since prediction, CSV text.
* Page: filters change rows; ticking draws a line; good-only and see-all; export; open report.
* A hidden test window on a copy of the data, never a live report.
