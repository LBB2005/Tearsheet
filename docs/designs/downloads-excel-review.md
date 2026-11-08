# Excel download: review of options A, B and C

* **Author:** EGM synthesizer (six-lens brainstorm), for Liam Blackshaw-Brown
* **Date:** 2026-11-08
* **Reviews:** `docs/designs/downloads-excel-options.md`
* **Status:** brainstorm brief. Nothing is built.

## Overview

The Excel file is one of three downloads at the end of a finished Tearsheet report. Liam wants it
to look like a bank made it and, if it models anything, to be accurate. The options doc offers:

* **A:** a numbers workbook copied from the saved report now, with a live model later.
* **B:** the full live model now (DCF, residual income, multiples and range as formulas).
* **C:** A plus a live 12-month Range tab.

Six reviewers read the options doc and checked it against the engine code. All six would ship A
first. They found that the doc's account of replay, the golden test and Option C's cost is wrong
in places that change the decision. They also found that A, as described, has a Checks tab that
can never fail, and that A can disagree with the app after a stock split.

All paths below are under `engine/src/tearsheet/` unless shown otherwise. No reviewer ran
anything. Nobody checked the claim that "all 24 saved reports load in full", because that needs
the live database.

## Analysis

### Reviewer status

| Reviewer | Lens | Status | Favours |
| --- | --- | --- | --- |
| `egm-zoom-out` | Contrarian / YAGNI | completed | A, cut down; skip C |
| `egm-design` | Cost and architecture | completed | A, then C without replay |
| `egm-comprehension` | The person opening the file | completed | A |
| `egm-implementation-readiness` | Compatibility and readiness | completed | A, then C from stored prices |
| `egm-codebase-details` | Code accuracy and reuse | completed | C, built as A first |
| `egm-structural` | Long-term upkeep | completed | A, laid out so C can be added |

The synthesizer checked these points in the code itself: `replay.py:34, 146-214`,
`valuation/range.py:35-46`, `valuation/common.py:86-93`, `methodology/rating_lines.yaml:37`,
`golden.py:33`, `evals/golden/tickers.yaml`, `report_numbers.py:155-161, 304-323`,
`pipeline.py:518-523, 628-654` and `__init__.py:8`. All of them match what the reviewers said.

### Blockers

**1. B has no plan for when replay doesn't match.** (all six lenses)
* `replay()` returns only a pass/fail result and throws away the rebuilt run that holds the
  inputs (`replay.py:173-214`). B needs a new function that returns the inputs.
* Replay runs today's code. If the method code version differs, it only notes it
  (`replay.py:213`). That version is now 3 (`__init__.py:8`), so the maths has changed before, and
  older runs are expected to differ (`cli.py:341-344`).
* It refuses any run with no stored methodology copy (`replay.py:160-161`).
* **Needed before choosing B:**
  * Run the read-only replay check on the 24 saved reports and see which ones match. This is a
    decision for Liam: replay opens the data folder read-only and works on a copy in memory.
  * Show live tabs only when replay matches exactly and the code version is the same. Otherwise
    fall back to the A workbook, with a line on the Cover saying why.

**2. B's golden step can pass without proving anything.** (structural, implementation-readiness,
design, codebase-details, comprehension)
* **Cached results:** XlsxWriter saves next to each formula whatever result Python gives it. If
  that comes from the engine, Quick Look and the Checks read OK even when the formula is wrong.
  If LibreOffice doesn't recalculate on load, the test just reads Python's numbers back. (This
  LibreOffice point was from a reviewer's memory and has not been checked.)
* **Default inputs only:** it never tests edited inputs, which are the reason B exists.
* **Edge cases:** nobody knows which ones the golden companies reach. Examples: the 3-point rule
  (`valuation/dcf.py:74-77`), the sales-to-capital fallback (`dcf.py:63`), no trimming under 10
  peers, the 0.3 default volatility (`pipeline.py:1468`) and the cost-of-debt limits
  (`common.py:109-111`).
* **Tolerance and scope:** 0.5% is far too loose for the same maths on the same inputs (see the
  fact table). Golden runs only on Liam's Mac (`golden.py:32`), never in CI, and it builds fresh
  runs in memory (`golden.py:158`), so the replay path used at download time is never tested.
* **Needed:**
  * a normal CI test that uses the Python functions as the answer key, on made-up inputs that hit
    every branch plus edited inputs, matching to about a cent;
  * forced recalculation, or no cached values, in that test;
  * a test with a deliberately wrong formula that must fail;
  * a test tied to `METHOD_CODE_VERSION`, so any change to the maths forces a look at the
    formulas.

**3. C's what-if, as written, contradicts itself.** (comprehension: Blocker; zoom-out, structural,
codebase-details: Major)
* The cost of equity is not a separate input. It is looked up from the stock's volatility in four
  bands (7.5 / 9 / 11 / 13.5%; `common.py:86-93`, `methodology/valuation.yaml:6-10`).
* The same rate drives the DCF discount rate, the residual income value and the base case
  (`dcf.py:29`, `pipeline.py:1284-1285`). In C the method values stay typed.
* So if Liam changes the volatility, the spread moves but the value under it doesn't. In the
  engine, crossing 20%, 28% or 40% would make the base case jump.
* **Needed:** either lock the volatility so only the value can be edited, or make the cost of
  equity a lookup formula that the base case follows, and say plainly that the method values
  don't follow.

### Major

**4. A's Checks tab can never fail.** (zoom-out, codebase-details, comprehension) It compares each
copied figure with the figure it was copied from. Either drop the tab and keep that check as a
test, or make the checks real formulas:
* the median of the method values against the stored value;
* the range against the prediction row's exact figures (`db/migrations/0002_report.sql:228-230`);
* the base case rebuilt from its parts.

Saved method values are text rounded to the cent, so the tolerance can't be tighter than $0.01.

**5. A is missing some of the data the doc says it has.** (implementation-readiness,
codebase-details, zoom-out, design)
* **Method rows:** `numbers_for` keeps only rows shown as dollar amounts
  (`report_numbers.py:155-161`). Methods marked "not meaningful" and the reasons, which matter for
  banks, insurers and REITs, are lost. Read the valuation table directly.
* **Sources:** `numbers_for` returns only claim counts, not the quotes
  (`report_numbers.py:304-323`). The Sources tab needs its own read of the saved report
  (`pipeline.py:2356-2363`).
* **Withheld ratings:** a withheld rating writes no score or valuation section
  (`pipeline.py:2285`), so those tabs will be empty.
* **Not stored anywhere:** the cost of equity, FFO per share, the P/E versus EV/EBIT split (the
  method value is their average, `valuation/multiples.py:82`) and the dividend yield.
* **Peers:** the peer list needs its own query. `report_views.views_for` can supply it.

**6. After a stock split, the workbook won't match the app.** (all six lenses) Saved prices and
ranges are in the shares of the price date. The app's top bar rescales them for later splits
(`report_numbers.py:384-388`). The workbook must say "Prices as of [date], in that day's shares"
and give the split factor since then.

**7. Not every report is an official prediction.** (comprehension, codebase-details)
* Thin-slice runs and repeat runs within 30 days log no prediction (`pipeline.py:1358-1378`).
* Thin-slice reports also value with the DCF only (`pipeline.py:1273-1275`). The options doc
  never mentions report mode.
* The Cover should say "Official prediction, logged [date]" or "Not official: [reason]".

**8. Blue text means "you can change this" to a bank reader.** (comprehension) In A nothing
recalculates. A colour key should say "copied from the saved report; nothing here recalculates".

**9. Replay at download time is the wrong tool for getting the inputs.** (design, zoom-out,
implementation-readiness)
* **Cost:** replay copies the whole database into memory (`replay.py:105-120`) and reruns every
  step through to render, just to recover about 30 numbers.
* **Server:** its `asyncio.run` (`replay.py:183`) can't be called inside the engine's async
  server (`server.py:1605`) without a separate thread.
* **Better:** save the inputs when the report is made, in their own step row that replay doesn't
  compare, as `timings` already does (`pipeline.py:518-523`, `replay.py:34`). Don't add them to
  the `value` row: replay compares every key there (`replay.py:140-143`), so all old runs would
  stop matching. That's tens of KB per run with no added run time.
* **Limit:** this only helps future reports.

**10. A can show "how" cheaply, for future reports.** (zoom-out, design) Each method's `details`
already holds the growth used, the start and target margins, the discount rate, the cost of
equity, the terminal growth and the terminal share (`dcf.py:101-111`, `residual_income.py:39-45`,
`multiples.py:74`). Only `risk_free` and `value` are saved today (`pipeline.py:632-640`). Saving
`details` in a new row (as in item 9) lets A show the assumptions as typed figures. This is a small
engine change, not a download change, and it doesn't touch the prediction log.

**11. C doesn't need replay.** (design, codebase-details, implementation-readiness, zoom-out)
There are two read-only ways to get its inputs, both fast:
* **From stored prices:** recompute the volatility and dividend yield with the engine's own
  functions (`pipeline.py:284-288, 318-322, 1109`), take the peer volatilities from the
  `peer_groups` rows (`pipeline.py:1129-1133`), and look up the cost of equity.
* **From the saved range:** work it back: blended volatility = ln(bull ÷ bear) ÷ (2 × 1.2816).

Either way, check the result by rebuilding the saved range to the cent. Design's estimate is that
C costs about 1.3 to 1.5 times A.

**12. B's Inputs tab is much bigger than described.** (zoom-out, design, structural,
codebase-details)
* **Peer table:** multiples need every peer's price, EPS, enterprise value parts and EBIT
  (`multiples.py:43, 53`), and REIT peers need FFO (`pipeline.py:1294-1304`). That's roughly 40
  rows by 20 to 25 fields.
* **Peer medians:** they include the company itself (`pipeline.py:1218-1225`), so typed "peer
  statistics" wouldn't move when Liam edits the company.
* **Key-metric medians:** these leave the company out and have no lease add-back
  (`report_numbers.py:247`), so they can't be reused as the valuation's peer statistics.

**13. Edits never move the rating, and the rating isn't only a peer ranking.** (comprehension)
* The rating ranks this company's own gap between value and price against its peers' gaps
  (`pipeline.py:1454-1480`).
* The uncertainty level also counts valuation warnings (`valuation/combine.py:42-45`).
* So an edit that should logically turn Hold into Buy still shows Hold. Every live tab needs a
  fixed "Official call" box next to "Your what-if value: $X (does not change the rating)".

**14. Excel details.** (codebase-details, implementation-readiness, structural)
* **The z value:** use the methodology's fixed 1.2816 in a typed cell, not `NORM.S.INV`, which
  gives 1.28155 and can move a figure by a cent.
* **Newer functions:** they need XlsxWriter's `use_future_functions` setting (or the `_xlfn.`
  prefix), or Excel shows `#NAME?`. Avoid `LET`, `FILTER` and `SORT`.
* **Safe functions:** `MEDIAN` skips blank cells. `PERCENTILE.INC` matches `percentile_value`.
* **Trimmed harmonic mean:** codebase-details says `1/TRIMMEAN(1/x, 0.2)` matches the Python trim.
  The synthesizer did not check this.
* **Blank peers:** write peers with zero sales-to-capital as blanks, not 0.

**15. Set A up so it isn't a dead end.** (structural, codebase-details)
* Build it from one data object.
* Give the key results workbook names (Value, Price, Bear, Base, Bull, each method's value), and
  have the other tabs refer to those names. C or B can then turn a typed cell into a formula in one
  place.
* Don't type the same figure on several tabs, and don't make tests check fixed cell addresses.
* Put the run ID, report ID, engine version, method code version and methodology hash on the
  Cover.
* Name each file by report ID, since one run can hold two reports.

**16. The options doc is missing what Liam needs to decide.** (structural, zoom-out, comprehension)
* Effort in days for A, so "4 to 5 times the work" can be costed.
* What "accurate" means: matching the engine, or being right.
* What Liam will actually do with the file.
* A plain-English line for each term: replay, golden test, harmonic mean, lognormal, ValuationInputs,
  DCF, residual income, EV/EBIT, FFO, sales-to-capital, and cost of equity (including that it comes
  from volatility).

### Nits

* **Tab count:** twelve tabs is a lot for about 60 numbers. Zoom-out suggests four: a front
  sheet, score and metrics, returns/peers/economy, and sources. Only one reviewer raised this.
* **Missing volatility:** the range then uses 0.3 for the spread but 13.5% for the cost of equity
  (`pipeline.py:1466-1468`, `common.py:89`). The workbook should say when this happens.
* **Packaging:** XlsxWriter is pure Python and small. There is no xlsx library today
  (`engine/pyproject.toml:8-19`). Keep `formulas` in the dev group, and skip LibreOffice tests when
  it isn't installed, as the `live` tests are skipped.
* **Tension over cached values:** comprehension suggests computing them with `formulas` when the
  file is built. That would put `formulas` in the app, and implementation-readiness calls it a
  third copy of the maths. This only matters for C or B.
* **Replay is read-only (confirmed):** it opens the data folder read-only, works on a copy in
  memory, and has prediction logging off (`replay.py:106-118`, `pipeline.py:1361-1366`). The
  database triggers block changing or deleting a prediction, not adding one
  (`0002_report.sql:243-250`). So the safety depends on logging staying off. Keep a test for that.

### Facts in the options doc that the code contradicts

| The doc says | The code says |
| --- | --- |
| "20 hard-case companies" in the golden set | 19. The restatement slot is empty (`evals/golden/tickers.yaml:18-19`). |
| The golden test compares results with the last run, and implies a 0.5% tolerance | The 0.5% (`golden.py:33`) is only for hand-checked EDGAR inputs. Bear, base and bull are compared exactly, to 4 decimals (`golden.py:172-174, 333`). |
| The range uses a lognormal spread (B plans `NORM.S.INV`) | Fixed z = 1.2816 (`rating_lines.yaml:37`, `range.py:45`). |
| The cost of equity is one of the inputs | It is looked up from volatility (`common.py:86-93`). |
| `numbers_for` keeps every claim with its cited quote | It returns counts only (`report_numbers.py:304-323`). |
| It keeps each method's value per share | Only rows shown as dollar amounts, rounded to the cent (`report_numbers.py:155-161`). |
| Replay means "those inputs can be rebuilt" | Only if the replay matches. It returns pass/fail and uses today's code (`replay.py:208-214`). |
| C "still needs replay" | It can be built from stored prices, or worked back from the saved range (item 11). |
| B needs "the peer group statistics" | It needs a table of every peer (item 12). |
| The DCF summary | Leaves out the 3-point rule (`dcf.py:74-77`), the blended discount rate (`dcf.py:26-42`), the lease add-back (`common.py:40-43`) and the rule that drops the DCF when free cash flow is negative on both measures (`dcf.py:49-57`). |
| "Negative earnings" is a DCF edge case | It only affects multiples. |

### The doc's four questions

1. **Which first?** A. All six reviewers agree, including the one who favours C next.
2. **What could mislead Liam?**
   * **A:** split basis, checks that can't fail, blue text that looks editable, and reports that
     aren't official predictions.
   * **C:** the volatility what-if.
   * **B:** a model built with newer code than the report beside it.
   * **All:** edits that never move the rating.
3. **Hidden costs?**
   * a new replay function that returns the inputs;
   * replay drift after every change to the maths;
   * the peer table for B;
   * a test that really recalculates;
   * the async server conflict;
   * the `_xlfn.` / future-functions setting;
   * thin-slice and withheld-rating reports.
4. **Is the golden plan for B enough?** No. See Blocker 2.

## Goals vs. Non-Goals

* **In-scope goals (now):**
  * **The workbook:** bank style, built only from the saved report, working for all 24 saved
    reports and future ones.
  * **The Cover:**
    * the official call (rating, score, range, price and date);
    * whether the report is an official prediction;
    * the share basis and the split factor since then;
    * the run and report IDs, the method code version and the methodology hash;
    * a key saying what is fixed and what is live;
    * "Research data, not investment advice."
  * **Checks:** ones that can fail, or none.
  * **Layout:** workbook names for the key results, so C or B can be added later without rework.
  * **Optional small engine change:** save each method's `details` and the range inputs in a new
    step row that replay doesn't compare. Future reports could then show assumptions and support C
    cheaply.
* **Out-of-scope non-goals (now):**
  * live DCF, residual income or multiples formulas (Option B);
  * a sensitivity grid made of formulas;
  * any what-if that changes the official rating;
  * replay when Liam clicks;
  * shipping LibreOffice or `formulas` in the app;
  * any write to the prediction log;
  * any live report run as a test.

## Alternatives Weighed

* **B now. Rejected for now.**
  * Replay can't hand back the inputs today, and older reports may not match.
  * The inputs table covers every peer, not a few statistics.
  * The golden step as planned can't prove the formulas are accurate.
  * Every future change to the maths has to be made twice.
  * Its main payoff, what-ifs, never changes the official call.
* **C as written (replay for a few inputs, volatility editable, cost of equity typed). Rejected.**
  Its one what-if contradicts itself (Blocker 3), and it doesn't need replay (item 11).
* **C built from stored prices, with the cost of equity following volatility. Kept as a possible
  next step.** The panel is split. Codebase-details favours it, design and
  implementation-readiness would do it after A, and zoom-out would skip it.
* **A Python-computed sensitivity grid, pasted as values. Kept as the cheapest what-if.** It is
  exact by construction and can't drift from the engine. It needs the inputs saved at report time
  (item 9). Zoom-out prefers it to any live formulas.
* **Replay at click time versus saving inputs at report time. Saving wins** for future reports.
  Use replay only for older reports, and only when it matches exactly.
* **A Checks tab versus a test.** Either make the checks real (item 4) or move them into the test
  suite.
* **Twelve tabs versus four.** Open. Only one reviewer raised it.

## Recommendation

**Build Option A now.** All six reviewers back it. It is accurate because every figure comes from
the saved report, and it works for every report. Lay it out with named cells (item 15) so the next
step adds formulas in one place. Consider the small engine change in item 10, so future reports
carry their assumptions.

**Then decide between C and a Python sensitivity grid**, once Liam names a what-if he'd use. Build
either one from stored prices or saved inputs, never from replay at click time. Hold B until a
read-only replay of the 24 reports shows they match, the inputs are saved at report time, and the
test plan in Blocker 2 exists.

**Top 3 risks**

1. **Checks that pass without checking.** A's Checks tab compares copies with their own source.
   B's and C's cached results and LibreOffice tests can read Python's own numbers back. Either way,
   a wrong figure looks verified.
2. **The workbook disagreeing with the app.** In A, after a split, or for a report that wasn't
   an official prediction. In C or B, when a live tab is built with today's code from a report the
   older code made, or when volatility moves the range but not the value.
3. **What-ifs that look like they change the call.** Edited inputs never move the rating, which
   ranks the value gap against peers'. Without a fixed "Official call" box, Liam could read a
   what-if value as a new rating.
