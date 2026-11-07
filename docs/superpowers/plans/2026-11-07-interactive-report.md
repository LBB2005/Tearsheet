# The interactive report: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every chart, bar, ring slice, tile and table row in the report shows a readout when
pointed at or focused, and a click opens a bigger version of it in the right-hand panel, with
the switches the spec lists, without the report ever reloading.

**Architecture:**
- **The engine** gains one call, `get_report_numbers`. It sends the report's numbers as data,
  plus what can be worked out from stored data: each peer's metric values and 12-month return,
  and 3- and 5-year total returns where the history is stored. Every item carries its readout,
  written by the fixed templates in `readouts.py`. The report template uses the same functions,
  so the report and the panel always say the same thing.
- **The report** stays script-free. Each item becomes a "hot" element: in the app a
  `tearsheet://open/<view>[/<item>]` link, in a file a `tabindex="0"` element. Its readout is a
  hidden child shown by CSS on `:hover` and `:focus-visible`, and hidden when printing.
- **The app.** `navigation.ts` turns the new link into an `open` action, and the main process
  sends it to the window on one new preload event. The right-hand panel shows one view at a
  time: the price chart (`ChartPane`, unchanged in behaviour) or a view pane. Both share the
  panel's switch, its width buttons and its close button. Each view keeps its state per report
  in a `ViewMemory`, and its pure logic lives in `app/src/renderer/views/*.ts`, which is tested.

**Tech Stack:** Electron and React 18 (TypeScript, Vitest, node environment); Python 3.12 engine
(Jinja2, pydantic, pytest).

**Spec:** `docs/superpowers/specs/2026-11-07-interactive-report-design.md`, building on
`docs/superpowers/specs/2026-11-06-chart-round-two-design.md`.

## Global Constraints

- The report stays the engine's HTML, in an iframe with `srcdoc` and an empty `sandbox`
  attribute, with no scripts.
- All AI and source text stays escaped plain text.
- The CSPs are unchanged: `CSP` in `render.py` is not edited.
- `tearsheet:` links are handled by `navigation.ts`.
- The window stays sandboxed, with no Node access. The window gets one new call
  (`getReportNumbers`) and one new listener (`onOpenView`) through the preload bridge, and
  nothing else.
- Under Reduce motion, nothing animates. In the report, readouts appear and go with no
  transition at all. In the app, the global rule in `styles.css` already stops every animation;
  new CSS adds none that escapes it.
- The report never reloads for these actions. The text frame's load key is
  `[reportId, view, narrow, asked]` in `useReport.ts`, and no task changes that line.
  Opening, switching or closing a view never changes the text or numbers frame's `srcDoc`.
- **Readout wording** comes from fixed plain-language templates in
  `engine/src/tearsheet/readouts.py`, filled with stored numbers. No AI writes any of it.
- **No new storage:** no migration and no new table or column. What isn't stored is left out
  and says so plainly.
- **Width limits** stay: the panel is never narrower than `CHART_MIN` (360) and the report
  never narrower than `TEXT_MIN` (340), whatever view the panel shows.
- **Code style:** comments are plain sentences that explain why. Copy is in sentence case, with
  curly apostrophes (’) as in the rest of the app.
- **CSS tokens:** use the existing tokens `--up`, `--down`, `--accent`, `--accent2`, `--hold`,
  `--muted`, `--line` and `--panel`, and no new colours.
- **`app/src/shared/protocol.ts`** is only ever regenerated with `npm run -s gen-types` (from
  `app/`), never edited by hand.
- **Test windows:** any check in a window uses a hidden window on a copy of Liam's data, never
  his own window or data. The controller does the hidden-window check, after Task 12.

## Review Focus

1. **Keyboard focus left on a link in a column that then hides** (the frame narrows to one
   column while a numbers link has focus). The readout must not be drawn over the text column.
   Readouts are shown by `display`, never by `visibility: visible`, so a hidden column's
   readout stays hidden. Owner: Task 11, `test_readouts_never_draw_through_a_hidden_column`.
2. **A link clicked while the panel slides shut.** The panel opens again on the view asked for;
   it doesn't finish closing. Owner: Task 4. `asked` with `open: false` never returns null, and
   `openView` clears the close timer (test `a link while the panel is closed or closing always
   opens it`).
3. **Another report opened while a view is showing.** The old report's numbers are never shown
   for the new one, and each view starts afresh. Owner: Task 4, `currentNumbers` and
   `ViewMemory` tests.
4. **A link naming an item that isn't there,** such as a metric an older report lacks, row 9 of
   a 3-row table, or a bad index. The view opens with nothing picked and doesn't fail. Owner:
   Task 5, `pickIndex` and `pickKey` tests. Each later view uses them.
5. **A table column where one cell reads "not meaningful"** among the dollar values. By the
   spec, that column sorts as text. The order is stable, and the filter still matches it.
   Owner: Task 9, `a column with one word cell sorts as text`.

## Calls this plan makes on the spec

- **Wording lives in Python, once.** The engine sends each item's readout with its numbers, so
  the app needs no wording functions of its own.
- **Link shape:** `tearsheet://open/<view>` or `tearsheet://open/<view>/<item>`.
  - **Views:** `price`, `factors`, `metrics`, `methods`, `returns`, `flags`, `economy`,
    `rings`, and `table-<section key>`.
  - **Items:** `[A-Za-z0-9_.-]{1,64}`, such as a metric name, a method code, a red-flag code, a
    FRED series, `company` / `peers` / `spy`, a slice key, or a row or factor index from 0.
  - A link to `price` always opens the price chart with its 12-month range on.
- **Where each tile opens:**
  - the score ring and the rating tile open Score by factor;
  - the price and buy-trigger tiles open the price chart;
  - the estimated value and value gap tiles open Value per share;
  - the range tile opens the price chart;
  - the past-year tile opens Total return.
- **The 1-year return** uses the report's own three figures where the report has them. Each
  peer's own 12-month return is worked out with the pipeline's own rule (252 trading days to the
  report's price date). 3 and 5 years are calendar years to the report's price date, offered only
  when the company's and SPY's stored closes reach back to within 7 days of the start. Peers are
  given for 1 year only, with a note.
- **No buy-trigger switch.** The spec's per-view list gives the buy trigger no switch, and the
  price chart stays "as it is now", where the buy line always shows. So Goal 3's "buy trigger"
  is met by the price chart's line, and by its readout in the report.
- **Peer-rating slices** have no list: the run keeps only the counts. The rings view says so.
  The checks ring lists the kept claims by section, and each removed claim with its reasons.
- **The price chart stays mounted** while the panel is open, once it has been shown, so
  switching back to it never replays its draw-in and keeps its range and toggles. As today, it
  starts afresh each time the panel opens.
- **Readouts sit in reserved places, never over prose.**
  - In a numbers panel, a readout covers that panel's heading line and grows upward.
  - On a chart, it sits on the chart's top edge.
  - Under a Full-report table, it shows in a strip kept free below the table.
  - Under the narrow window's key tiles, it shows just below them.
- **Keyboard readouts use `:focus-visible`,** so a mouse click (which focuses the link) never
  leaves a readout up after the pointer leaves.
- **A report file** keeps readouts for whatever it draws. The pipeline's file is written
  without numbers today, and that isn't changed here.

---

### Task 1: The readout wording

**Files:**
- Create: `engine/src/tearsheet/readouts.py`
- Test: `engine/tests/test_readouts.py`

**Interfaces:**
- **Produces:** pure functions that each return one `str`. Prices are written with
  `render.format_value("price", v)`. A move against today's price is a whole percent, rounded
  half up (`math.floor(x + 0.5)`). It is left out when `today` is None or not above 0, and when
  it rounds to 0 it reads "about the same as today’s $X".
  - `ordinal(k: int) -> str`
  - `score(percentile: int) -> str`
  - `factor(name: str, percentile: int, weight: float) -> str`. The weight is a fraction,
    written like the template: `("%.1f" % (w * 100)).rstrip("0").rstrip(".")`.
  - `metric(label: str, text: str, median_text: str | None, percentile: int | None, ticker: str) -> str`
  - `peer_metric(peer: str, label: str, text: str, own_text: str, ticker: str) -> str`
  - `week(day_iso: str, close: float, today: float | None) -> str`
  - `target(case: Literal["bull", "base", "bear"], value: float, today: float | None) -> str`
  - `past_year(first: float | None, last: float | None, bear: float | None, bull: float | None) -> str`
  - `total_return(name: str, pct: float | None, years: int, *, group: bool = False) -> str`.
    `pct` is in percent, such as -3.0.
  - `method_label(code: str) -> str`: DCF is "Discounted cash flow", RESIDUAL_INCOME is
    "Residual income", MULTIPLES is "Multiples". Anything else has `_` turned into spaces and is
    capitalised.
  - `method(code: str, value: float, today: float | None) -> str`
  - `price(value: float, day_text: str | None) -> str`
  - `estimate(value: float, today: float | None) -> str`
  - `band(bear: float, bull: float) -> str`
  - `trigger(value: float | None, text: str) -> str`
  - `gap(percentile: int | None) -> str`
  - `rating(call: str, capped: bool, percentile: int | None) -> str`
  - `red_flag(label: str, found: bool) -> str`
  - `red_flags(found: int, total: int) -> str`
  - `economy(label: str, value: str, day_text: str) -> str`
  - `peer_rating(call: str, count: int, total: int) -> str`
  - `claims(kind: Literal["kept", "removed"], count: int, total: int) -> str`
  - `kept_item(title: str, count: int) -> str`
  - `removed_item(text: str, reasons: list[str]) -> str`
  - `table_row(header: list[str], row: list[str]) -> str`. The first cell is the subject, with
    its first letter in capitals. Each later non-empty cell is written as "header cell", with
    the header's first letter in lower case unless its first two letters are both capitals. A
    header shorter than the row leaves the cell unnamed.

- [ ] **Step 1: Write the failing tests.** In `test_readouts.py`, one `pytest.mark.parametrize`
  table of `(call, expected)` pairs, with exactly these strings:
  - `ordinal`: 1 is "1st", 2 is "2nd", 3 is "3rd", 4 is "4th", 11 is "11th", 12 is "12th",
    13 is "13th", 21 is "21st", 93 is "93rd" and 101 is "101st".
  - `score(74)`: "Score: 74th percentile. Better than 74 of 100 peers on the weighted factors."
  - `factor("profitability", 79, 0.2)`: "Profitability: 79th percentile. Better than 79 of 100 peers. Counts for 20% of the score."
  - `factor("balance sheet", 76, 0.075)`: "Balance sheet: 76th percentile. Better than 76 of 100 peers. Counts for 7.5% of the score."
  - `metric("Operating margin", "65.2%", "28.3%", 95, "NVDA")`: "Operating margin: 65.2%. The peer median is 28.3%. 95% of peers are below NVDA."
  - `metric("Interest coverage", "425.8×", None, None, "NVDA")`: "Interest coverage: 425.8×. No peer values are stored."
  - `peer_metric("AMD", "Operating margin", "12.0%", "65.2%", "NVDA")`: "AMD: operating margin 12.0%, against 65.2% for NVDA."
  - `week("2025-11-14", 162.4, 187.2)`: "Close on 14 Nov 2025: $162.40, 13% below today’s $187.20."
  - `week("2025-11-14", 200.0, 187.2)`: "Close on 14 Nov 2025: $200.00, 7% above today’s $187.20."
  - `week("2026-11-06", 187.2, 187.2)`: "Close on 6 Nov 2026: $187.20, about the same as today’s $187.20."
  - `week("2025-11-14", 162.4, None)`: "Close on 14 Nov 2025: $162.40."
  - `target("bull", 419.62, 200.13)`: "Bull case: $419.62 in 12 months, 110% above today’s $200.13. The top of the range, its 90th percentile."
  - `target("base", 233.70, 200.13)`: "Base case: $233.70 in 12 months, 17% above today’s $200.13. The middle of the range, its 50th percentile."
  - `target("bear", 130.16, 200.13)`: "Bear case: $130.16 in 12 months, 35% below today’s $200.13. The bottom of the range, its 10th percentile."
  - `target("bull", 419.62, None)`: "Bull case: $419.62 in 12 months. The top of the range, its 90th percentile."
  - `past_year(180.0, 231.0, 130.16, 419.62)`: "Past year: $180.00 to $231.00, up 28%. The 12-month range runs from $130.16 to $419.62."
  - `past_year(200.0, 150.0, None, None)`: "Past year: $200.00 to $150.00, down 25%."
  - `past_year(200.0, 200.5, None, None)`: "Past year: $200.00 to $200.50, about level."
  - `past_year(None, None, 130.16, 419.62)`: "The 12-month range runs from $130.16 to $419.62."
  - `total_return("NVDA", -3.0, 1)`: "NVDA: down 3.0% over the past year, with dividends."
  - `total_return("Peer group", 45.2, 1, group=True)`: "Peer group: up 45.2% over the past year, with dividends, each peer weighted the same."
  - `total_return("S&P 500", 13.4, 1)`: "S&P 500: up 13.4% over the past year, with dividends."
  - `total_return("NVDA", 210.46, 3)`: "NVDA: up 210.5% over the past 3 years, with dividends."
  - `total_return("NVDA", 0.04, 1)`: "NVDA: unchanged over the past year, with dividends."
  - `total_return("NVDA", None, 5)`: "NVDA: not stored for the past 5 years."
  - `method("DCF", 115.24, 200.13)`: "Discounted cash flow: $115.24 a share, 42% below today’s $200.13."
  - `method("RESIDUAL_INCOME", 546.10, None)`: "Residual income: $546.10 a share."
  - `method_label("EARNINGS_POWER")`: "Earnings power"
  - `price(200.13, "4 Nov 2026")`: "Price: $200.13 on 4 Nov 2026."
  - `price(200.13, None)`: "Price: $200.13."
  - `estimate(236.36, 200.13)`: "Estimated value: $236.36 a share, 18% above today’s $200.13."
  - `band(130.16, 419.62)`: "12-month range: $130.16 to $419.62, from the bear case to the bull case."
  - `trigger(263.73, "$263.73")`: "Buy trigger: $263.73. The price at which the rating would turn Buy, with the score and the peer value gaps held fixed."
  - `trigger(None, "not reachable by price alone")`: "Buy trigger: not reachable by price alone."
  - `gap(82)`: "Value gap percentile: 82. The gap between estimated value and price is at the 82nd percentile of the valued peers."
  - `gap(None)`: "Value gap percentile: not available."
  - `rating("Hold", True, 74)`: "Rating: Hold, capped by a red flag. Score: 74th percentile of its peer group."
  - `rating("Buy", False, None)`: "Rating: Buy."
  - `red_flag("Going concern", False)`: "Going concern: clear. Any red flag found caps the rating at Hold."
  - `red_flag("Risk-factor change", True)`: "Risk-factor change: found. It caps the rating at Hold."
  - `red_flags(1, 4)`: "1 of 4 checks found a red flag. Any one caps the rating at Hold."
  - `red_flags(0, 4)`: "No red flags found in 4 checks."
  - `economy("10-year Treasury yield", "4.9%", "4 Nov 2026")`: "10-year Treasury yield: 4.9% on 4 Nov 2026, from FRED."
  - `peer_rating("Buy", 8, 41)`: "Buy: 8 of 41 companies in the group, rated before red-flag caps."
  - `claims("kept", 41, 53)`: "Kept: 41 of 53 claims passed every check."
  - `claims("removed", 12, 53)`: "Removed: 12 of 53 claims failed a check and were taken out."
  - `kept_item("Business", 4)`: "Business: 4 claims kept."
  - `kept_item("Business", 1)`: "Business: 1 claim kept."
  - `removed_item("Revenue rose 12%.", ["number not in source", "no citation"])`: "Revenue rose 12%. Removed: number not in source; no citation."
  - `removed_item("Revenue rose 12%.", [])`: "Revenue rose 12%. Removed."
  - `table_row(["Factor", "Percentile", "Weight used"], ["profitability", "93", "30.0%"])`: "Profitability: percentile 93, weight used 30.0%."
  - `table_row(["Method", "Value per share", "Note"], ["DCF", "$115.24", ""])`: "DCF: value per share $115.24."
  - `table_row(["Year", "EPS"], ["2025", "$4.10"])`: "2025: EPS $4.10."
  - `table_row(["Method"], ["DCF", "$115.24"])`: "DCF: $115.24."

  Add `test_no_readout_holds_markup_of_its_own`: none of these functions adds `<`, `>` or `&`
  of its own. Check it by calling each with plain inputs and asserting none of those
  characters is in the result.
- [ ] **Step 2: Run the tests to see them fail.** Run
  `cd engine && PATH=$HOME/.local/bin:$PATH uv run pytest -q tests/test_readouts.py`.
  Expected: they fail with `ModuleNotFoundError: tearsheet.readouts`.
- [ ] **Step 3: Implement `readouts.py`.** It has a module docstring that says the wording is
  fixed, filled only with stored numbers, and shared by the report template and the app's
  bigger views. It uses no Jinja and no `Markup`.
- [ ] **Step 4: Run the tests to see them pass.** Run
  `uv run pytest -q tests/test_readouts.py && uv run ruff check . && uv run ruff format --check .`.
  Expected: everything passes.
- [ ] **Step 5: Commit.** Run `git add engine/src/tearsheet/readouts.py engine/tests/test_readouts.py`, then
  `git commit -m "Write each readout from a fixed plain-language template"`.

### Task 2: The report's numbers for the app

**Files:**
- Create: `engine/src/tearsheet/report_views.py`
- Modify:
  - `engine/src/tearsheet/protocol.py`: the models below, `NumbersParams`,
    `METHODS["get_report_numbers"]`, and `ALL_MODELS`;
  - `engine/src/tearsheet/server.py`: `m_get_report_numbers`, beside `m_get_chart`;
  - `app/src/main/ipc.ts`: `CALLS.getReportNumbers = 'get_report_numbers'`;
  - `app/src/preload/index.ts` and `app/src/preload/api.d.ts`;
  - `app/src/shared/protocol.ts`, regenerated.
- Test:
  - `engine/tests/test_report_views.py`
  - `engine/tests/test_server_lookups.py`
  - `app/src/main/ipc.test.ts`

**Interfaces:**
- **Consumes:** Task 1's `readouts`. It also uses `report_numbers.numbers_for` and
  `run_price_date`, `pipeline.twelve_month_return` and `TRADING_DAYS`, `charts.SPY_CIK`, and
  `render.format_value`, `METRIC_KINDS` and `RED_FLAG_LABELS`.
- **Produces, in `protocol.py`:** these models, all `Strict`.
  - `NumbersParams`: `report_id: str`.
  - `FactorItem`: `name: str`, `percentile: int`, `weight: float` (a fraction) and
    `readout: str`.
  - `PeerValue`: `ticker: str`, `value: float`, `text: str` and `readout: str`.
  - `MetricItem`:
    - `name: str`, `label: str` and `value: float`;
    - `text: str`, the value written as the report writes it ("65.2%", "425.8×");
    - `peer_median: float | None` and `median_text: str | None`;
    - `percentile: int | None`;
    - `peers: list[PeerValue]`, sorted by value from highest to lowest;
    - `readout: str`.
  - `MethodItem`: `method: str`, `label: str`, `value: float` and `readout: str`.
  - `Mark`: `value: float` and `readout: str`.
  - `Band`: `bear: float`, `base: float`, `bull: float` and `readout: str`.
  - `ReturnRow`: `name: str`, `value: float | None` (in percent, to one decimal) and
    `readout: str`.
  - `ReturnSpan`:
    - `years: Literal[1, 3, 5]`;
    - `company: ReturnRow`;
    - `peers: ReturnRow | None`, for 1 year only;
    - `spy: ReturnRow`;
    - `each_peer: list[ReturnRow]`, for 1 year only and empty otherwise, sorted from highest
      value to lowest with None last.
  - `RedFlagItem`: `code: str`, `label: str`, `found: bool` and `readout: str`.
  - `EconomyItem`: `series: str`, `label: str`, `value: str`, `date: str` and `readout: str`.
  - `Slice`:
    - `key: Literal["buy", "hold", "sell", "kept", "removed"]`;
    - `label: str` and `count: int`;
    - `readout: str`;
    - `items: list[str] | None`, which is None when the run didn't keep the list.
  - `Ring`: `total: int` and `slices: list[Slice]`.
  - `ReportTable`: `key: str` (the section's key), `title: str` (the section's title) and
    `rows: list[list[str]]`, where the first row is the header.
  - `ReportNumbers`:
    - `report_id: str` and `ticker: str`;
    - `score_readout: str | None`;
    - `factors: list[FactorItem] | None`;
    - `metrics: list[MetricItem] | None`;
    - `methods: list[MethodItem] | None`;
    - `price: Mark | None`, `estimate: Mark | None` and `range: Band | None`;
    - `returns: list[ReturnSpan] | None`, which is 1 year first, then 3 and 5 where stored;
    - `red_flags: list[RedFlagItem] | None` and `red_flags_readout: str | None`;
    - `economy: list[EconomyItem] | None`;
    - `peer_ratings: Ring | None` and `claims: Ring | None`;
    - `tables: list[ReportTable]`.
- **Produces, in `report_views.py`:**
  - `SPAN_SLACK_DAYS = 7`.
  - `span_return(store: PriceStore, cik: int, end: date, years: int) -> float | None`. This is
    the total return as a fraction, from the close on or before `end` minus `years` calendar
    years (29 Feb becomes 28 Feb) to the last close on or before `end`. The stored closes must
    reach back to within `SPAN_SLACK_DAYS` of that start. If they start after it, the return
    runs from the first stored close. It is None with fewer than two closes, or when the
    history starts later than the slack allows.
  - `views_for(conn, report: dict, run_id: str, cik: int, *, report_id: str, ticker: str) -> dict`.
    The dict has every key of `ReportNumbers` except `report_id` and `ticker`. Each part is
    built behind `report_numbers._guard`, so an odd stored row leaves that part None and never
    raises. `tables` is `[]` when the report has none.
  - `peer_ticker(conn, holdings, cik: int) -> str`. It tries the bundled holdings' first
    ticker, then the newest row of the `tickers` table for the cik, then `f"CIK {cik}"`.
- **Produces, in the window:**
  - `window.tearsheet.getReportNumbers(reportId: string): Promise<CallResult<ReportNumbers>>`.

- [ ] **Step 1: Write the failing tests.** In `test_report_views.py`, reuse `seed`,
  `make_report`, `LINES` and `TABLES` from `tests/test_report_numbers.py`. Extend `seed`
  locally in two ways:
  - insert `tickers` rows `('AAA', 2)` and `('BBB', 3)`, and leave cik 4 without one;
  - insert 400 days of closes for ciks 2, 3, 4 and `SPY_CIK`.

  The tests:
  - `test_factors_and_methods_carry_their_readouts`:
    - `factors[0]` is `{"name": "profitability", "percentile": 93, "weight": 0.3, "readout": "Profitability: 93rd percentile. Better than 93 of 100 peers. Counts for 30% of the score."}`;
    - `methods[0]["label"]` is `"Discounted cash flow"`;
    - `price["readout"]` is `"Price: $200.13 on 4 Nov 2026."`;
    - `range["readout"]` starts with `"12-month range: $130.16 to $419.62"`.
  - `test_each_metric_lists_each_peers_value`: for the first metric, `peers` is
    `[{"ticker": "CIK 4", "value": 12.0, ...}, {"ticker": "BBB", "value": 9.0, ...}, {"ticker": "AAA", "value": 6.0, ...}]`.
    Each peer has `text` written by `METRIC_KINDS`, and its `readout` is built with
    `readouts.peer_metric`.
  - `test_one_year_uses_the_reports_own_figures`: with the `LINES` returns line, the 1-year
    span has company -3.0, peers 45.2 and spy 13.4.
  - `test_each_peers_12_month_return_is_worked_out_from_stored_prices`: each entry of
    `each_peer` equals `round(100 * twelve_month_return(store, peer, price_date), 1)`.
  - `test_without_the_reports_line_the_year_is_worked_out_too`: with no returns line, the
    company and spy come from `twelve_month_return`, and the peers are the mean of `each_peer`
    (skipping None).
  - `test_longer_spans_need_both_histories`: there are three cases.
    - With 400 days of history, `[s["years"] for s in returns]` is `[1]`.
    - With 6 years of daily closes for the company and SPY, it is `[1, 3, 5]`.
    - With 6 years for the company and 400 days for SPY, it is `[1]`.
  - `test_longer_spans_leave_the_peers_off`: the 3-year span has `peers is None` and
    `each_peer == []`.
  - `test_span_return_allows_a_week_of_slack`: a history starting 5 days after the 5-year start
    gives a number, and one starting 9 days after gives None.
  - `test_tables_are_every_table_the_full_report_shows`: `[t["key"] for t in tables]` is
    `["score", "valuation"]`, and the rows are the stored text unchanged.
  - `test_the_checks_ring_lists_kept_by_section_and_each_removed_claim`:
    - give the report two sections with sentences, and `removed` as
      `[{"id": "x", "text": "Revenue rose 12%.", "reasons": ["number not in source"]}]`;
    - the kept slice's `items` are built with `readouts.kept_item`, one per section with
      sentences, in section order;
    - the removed slice's `items` is `["Revenue rose 12%. Removed: number not in source."]`.
  - `test_peer_rating_slices_have_no_list`: each peer-rating slice has `items is None`, and the
    counts are 8, 26 and 7 with a total of 41.
  - `test_red_flags_are_the_four_checks_then_any_other`: 4 items, with `found` True only for
    `risk_factor_change`. `red_flags_readout` is
    `"1 of 4 checks found a red flag. Any one caps the rating at Hold."`.
  - `test_an_old_report_gives_none_never_an_error`: `views_for` on `{"sections": []}` with an
    unknown run gives None for every part and `[]` for tables.

  In `test_server_lookups.py`, add `test_get_report_numbers_method`, following
  `test_get_chart_method`. Its result validates with `ReportNumbers.model_validate`, and an
  unknown report answers with `error.data.code == "ENGINE_ERROR"`.

  In `ipc.test.ts`, check that `engineMethod('getReportNumbers')` is `'get_report_numbers'`.
- [ ] **Step 2: Run the tests to see them fail.** Run
  `uv run pytest -q tests/test_report_views.py tests/test_server_lookups.py` and
  `cd ../app && npx vitest run src/main/ipc.test.ts`. Expected: they fail with
  `ModuleNotFoundError` and an unknown method.
- [ ] **Step 3: Implement.**
  - **`views_for`** reads the price date with `run_price_date`. `today` for the readouts is the
    report's `price.value`, or else the last weekly close.
  - **The kept-by-section counts** come from `report["sections"][*]["sentences"]`, using the
    section titles. The removed claims come from `report["removed"]`.
  - **`m_get_report_numbers`** loads the report row and its JSON as `m_get_report` does. An
    unknown report raises `EngineError("ENGINE_ERROR", f"No report {id}.")`. It gets the
    ticker from `report.get("ticker")`.
  - **The bridge:** add the preload call `getReportNumbers`, with
    `call('getReportNumbers', { report_id })`, and its line in `api.d.ts`.
  - **Regenerate the types:** run `cd app && npm run -s gen-types`.
- [ ] **Step 4: Run the tests to see them pass.** Run
  `uv run pytest -q && uv run ruff check . && uv run ruff format --check .`, then
  `cd ../app && npx vitest run && npm run -s typecheck`. Expected: everything passes.
- [ ] **Step 5: Commit.** Use the message "Send the report’s numbers to the app, with each
  peer’s values and the longer total-return spans".

### Task 3: The open link, from the report to the window

**Files:**
- Modify:
  - `app/src/main/navigation.ts`
  - `app/src/main/index.ts`, in the `will-frame-navigate` handler
  - `app/src/preload/index.ts` and `app/src/preload/api.d.ts`
  - `engine/src/tearsheet/render.py`, for `OPEN_VIEWS` and `open_link`
- Test:
  - `app/src/main/navigation.test.ts`
  - `app/src/main/views.test.ts`, a cross-check against `render.py`
  - `engine/tests/test_render.py`

**Interfaces:**
- **Produces, in `navigation.ts`:**
  - `export const VIEWS = ['price', 'factors', 'metrics', 'methods', 'returns', 'flags', 'economy', 'rings'] as const`;
  - `export type ViewKind = (typeof VIEWS)[number]`;
  - `` export type ViewId = ViewKind | `table-${string}` ``;
  - `NavigationAction` gains `{ kind: 'open'; view: ViewId; item: string | null }`.
- **Produces, in `render.py`:**
  - `OPEN_VIEWS` is the same eight names, as a tuple.
  - `open_link(view: str, item: object = None) -> str | None`.
    - It returns None for a view that isn't in `OPEN_VIEWS` and doesn't match
      `table-[a-z_]{1,32}`, so a template slip shows up as a missing link in Task 11's counts.
    - It drops an item whose `str()` doesn't match `[A-Za-z0-9_.-]{1,64}`, so an odd stored
      code still opens its view.
    - It never raises.
- **Produces, from the main process:** it sends
  `window.webContents.send('tearsheet:open-view', { view, item })`.
- **Produces, in the preload:**
  `onOpenView(fn: (payload: { view: ViewId; item: string | null }) => void): () => void`.

- [ ] **Step 1: Write the failing tests.**
  - **In `navigation.test.ts`:**
    - `'tearsheet://open/factors'` gives `{ kind: 'open', view: 'factors', item: null }`.
    - `'tearsheet://open/metrics/operating_margin'` gives item `'operating_margin'`.
    - `'tearsheet://open/table-valuation/2'` gives view `'table-valuation'` and item `'2'`.
    - Add these to the `it.each` block list:
      - `'tearsheet://open/'`;
      - `'tearsheet://open/settings'`;
      - `'tearsheet://open/factors/a/b'`;
      - `'tearsheet://open/table-'`;
      - `'tearsheet://open/table-Valuation'`;
      - `'tearsheet://open/factors/<script>'`;
      - `'tearsheet://open/factors?x=1'`;
      - `'tearsheet://open/factors#x'`;
      - `` `tearsheet://open/factors/${'x'.repeat(65)}` ``.
  - **`views.test.ts`** reads `../../../engine/src/tearsheet/render.py`, finds the
    `OPEN_VIEWS = (...)` tuple, and expects its names to equal `VIEWS`.
  - **In `test_render.py`, `test_open_link`:**
    - `open_link("metrics", "operating_margin")` is
      `"tearsheet://open/metrics/operating_margin"`;
    - `open_link("table-valuation", 2)` is `"tearsheet://open/table-valuation/2"`;
    - `open_link("flags", "<x>")` is `"tearsheet://open/flags"`;
    - `open_link("nope")` is None, and so is `open_link("table-Bad Key")`.
- [ ] **Step 2: Run the tests to see them fail.** Run
  `cd app && npx vitest run src/main` and `cd ../engine && uv run pytest -q tests/test_render.py -k open_link`.
  Expected: they fail.
- [ ] **Step 3: Implement.**
  - **Parsing:** a `tearsheet:` URL with host `open` must have an empty `search` and `hash`.
    Its raw `pathname` is split on `/` into exactly one or two parts, each decoded on its own.
  - **The main process:** the `will-frame-navigate` handler gains the `open` branch, beside
    `flag`. The frame's navigation is still cancelled first, so neither frame reloads.
  - **The comment** at the top of `navigation.ts` names the new link.
- [ ] **Step 4: Run the tests to see them pass.** Run `npx vitest run && npm run -s typecheck`
  and `uv run pytest -q tests/test_render.py`. Expected: everything passes.
- [ ] **Step 5: Commit.** Use the message "Let a report link ask the app to open a chart or
  table bigger".

### Task 4: The panel shows one view at a time

**Files:**
- Create:
  - `app/src/renderer/panel/state.ts`
  - `app/src/renderer/panel/memory.ts`
  - `app/src/renderer/panel/titles.ts`
  - `app/src/renderer/panel/useReportNumbers.ts`
  - `app/src/renderer/panel/PanelHead.tsx`
  - `app/src/renderer/panel/ViewFrame.tsx`
  - `app/src/renderer/panel/ViewPane.tsx`
  - `app/src/renderer/panel/panel.css`
- Modify:
  - `app/src/renderer/report/useReport.ts`
  - `app/src/renderer/pages/Report.tsx`
  - `app/src/renderer/chart/ChartPane.tsx`: its width buttons and close move to `PanelSize`,
    and it gains `switcher`, `away`, `rangeAsk` and `onHistory`;
  - `app/src/renderer/chart/chart.css`
- Test:
  - `app/src/renderer/panel/state.test.ts`
  - `app/src/renderer/panel/memory.test.ts`
  - `app/src/renderer/panel/titles.test.ts`
  - `app/src/renderer/panel/useReportNumbers.test.ts`

**Interfaces:**
- **Consumes:** Task 2's `getReportNumbers` and `ReportNumbers`, and Task 3's `ViewId`,
  `ViewKind` and `onOpenView`.
- **Produces, in `state.ts`:**
  - `interface Panel { view: ViewId; item: string | null; last: ViewId | null; rangeAsk: number }`.
    `last` is the last view other than the price chart, for the switch. `rangeAsk` counts the
    links to `price`, each of which turns the 12-month range on.
  - `const FIRST: Panel = { view: 'price', item: null, last: null, rangeAsk: 0 }`.
  - `opened(p: Panel): Panel`, used by ⌘3 and the Chart button as the panel opens. It gives
    `{ ...p, view: 'price', item: null, rangeAsk: 0 }`.
  - `asked(p: Panel, open: boolean, view: ViewId, item: string | null): Panel | null`. This is a
    link from the report. It returns null only when `open` is true and the same view and item
    already show.
    - Otherwise it gives the asked view and item.
    - `last` becomes the view, unless the view is `price`.
    - A link to `price` adds 1 to `rangeAsk`.
  - `switched(p: Panel, view: ViewId): Panel`, the panel's own switch. It gives
    `{ ...p, view, item: null }`.
- **Produces, in `memory.ts`:** `class ViewMemory`, with `get<S>(view: ViewId, start: S): S`
  and `set<S>(view: ViewId, state: S): void`.
- **Produces, in `titles.ts`:** `viewTitle(view: ViewId, tables: ReportTable[] | null): string`.
  - The titles are:
    - price is "Price chart";
    - factors is "Score by factor";
    - metrics is "Key metrics";
    - methods is "Value per share by method";
    - returns is "Total return";
    - flags is "Red flags";
    - economy is "Economy";
    - rings is "Peer ratings and checks".
  - A `table-<key>` view is `${title} table` for the table with that key, or "Table" when there
    is none.
- **Produces, in `useReportNumbers.ts`:**
  - `currentNumbers(loaded: { reportId: string; numbers: ReportNumbers } | null, reportId: string | null): ReportNumbers | null`.
    It returns the numbers only when they are for this report. An older load of the same report
    stays on show while a newer one loads, so nothing blanks.
  - `useReportNumbers(reportId: string | null, wanted: boolean, version: number): { numbers: ReportNumbers | null; problem: string | null; retry: () => void }`.
    It loads when `wanted` (a view other than the price chart is showing), and again when
    `version` changes.
- **Produces, in `PanelHead.tsx`:**
  - `PanelSwitch({ view, last, title, onShow })` is a `segc` with `aria-label="Panel shows"`
    and buttons "Price chart" and `title(last)`. It renders only when `last !== null`.
  - `PanelSize({ wide, size, onSize, onClose })` is the existing `segc cwid` group,
    `aria-label="Chart width"`, shown when `wide`, plus the `ibtn` close button. The button's
    label is now "Close the panel" and its title "Close the panel (⌘3)".
- **Produces, in `ViewFrame.tsx`:**
  - `interface PanelChrome { switcher: ReactNode; size: ReactNode }`.
  - `ViewFrame({ chrome, title, subtitle, readout, controls, children })` lays out the pane
    with the price chart's own classes: `.cpin`, then the switcher, then
    `.cph` > `.cpt` / `.vread` / `.cpctl` (the view's controls, then `chrome.size`), then
    `.vbody`.
  - `interface ViewProps<S> { chrome: PanelChrome; numbers: ReportNumbers; ticker: string; item: string | null; state: S; setState: (s: S) => void }`.
- **Produces, in `ViewPane.tsx`:**
  - `ViewPane({ view, item, numbers, problem, retry, ticker, memory, chrome, width, swap })`.
    `swap` means the panel was already open as the pane mounted.
  - It renders `<section className="cpane vpane[ swap][ narrowp]" style={{ width }}>`.
  - It looks the view up in `VIEW_PANES: Partial<Record<ViewKind | 'table', ViewSpec>>`, where
    `ViewSpec = { start: unknown; Pane: (p: ViewProps<any>) => ReactElement }`. Tasks 5 to 10
    each add an entry.
  - A view not yet listed, or numbers not yet loaded, shows `.skel`. A `problem` shows the
    `.cmsg` "This view didn’t load. {problem}" with Try again.
- **Produces, from `useReport`, on `ReportPage`:**
  - `panel: Panel`;
  - `openView(view: ViewId, item: string | null): void`;
  - `showView(view: ViewId): void`;
  - `memory: ViewMemory`;
  - `numbersVersion: number` and `historyDownloaded(): void`.
- **Produces, from `ChartPane`, new props:**
  - `switcher?: ReactNode`;
  - `away?: boolean`, which hides the pane without unmounting it;
  - `rangeAsk?: number`, accepted and passed here; Task 5 gives it its behaviour;
  - `onHistory?: () => void`, called after the full history downloads.

- [ ] **Step 1: Write the failing tests.**
  - **`state.test.ts`:**
    - `the same chart again does nothing`: `asked(p, true, 'factors', null)` is null when `p`
      shows factors with no item.
    - `a link while the panel is closed or closing always opens it`: `asked(FIRST, false, 'factors', null)`
      is `{ view: 'factors', item: null, last: 'factors', rangeAsk: 0 }`.
    - `another item in the same view picks it`: factors to factors with item `'1'`.
    - `a link to the price chart asks for the range`: `rangeAsk` goes from 0 to 1, and `last`
      is unchanged.
    - `⌘3 opens the price chart`: `opened({ view: 'metrics', item: 'x', last: 'metrics', rangeAsk: 2 })`
      is `{ view: 'price', item: null, last: 'metrics', rangeAsk: 0 }`.
    - `the switch goes back to the price chart and keeps last`.
  - **`memory.test.ts`:** `get` gives `start` until `set`. The views are kept apart. A new
    `ViewMemory`, which is made for a new report, starts afresh.
  - **`titles.test.ts`:** each of the nine titles. `table-valuation` with tables
    `[{ key: 'valuation', title: 'Valuation', rows: [] }]` is "Valuation table". `table-x`
    with no tables is "Table".
  - **`useReportNumbers.test.ts`:** `currentNumbers` gives null for another report's load,
    null with no load, and the numbers for this report's load.
- [ ] **Step 2: Run the tests to see them fail.** Run `cd app && npx vitest run src/renderer/panel`.
  Expected: they fail.
- [ ] **Step 3: Implement.**
  - **`useReport`:**
    - It keeps `panel`, which starts at `FIRST`, and replaces it with `FIRST` and a new
      `ViewMemory` whenever `reportId` changes.
    - `toggleChart`, as it opens the panel from closed, also sets `opened(panel)`. Closing is
      unchanged.
    - `openView` applies `asked`, and does nothing when that is null.
      - If the panel isn't open, it opens as `toggleChart` would, at Half on Text, and clears
        the close timer.
      - It never changes the text-frame key or calls `show`.
    - It subscribes to `window.tearsheet.onOpenView`, like `onFlagRequested`, and applies only
      while the report page is active.
  - **`Report.tsx`:**
    - It renders `ChartPane` once the price chart has been shown during this opening (a ref,
      reset when the panel closes), with `away={panel.view !== 'price'}`,
      `rangeAsk={panel.rangeAsk}` and `onHistory={page.historyDownloaded}`.
    - It gets the numbers from
      `useReportNumbers(reportId, panel.view !== 'price', page.numbersVersion)`.
    - A narrow window gives the view the whole window, as it does the chart. Behind a Full
      panel, a link just switches the view.
    - It renders `ViewPane` while `panel.view !== 'price'`, keyed by `${reportId}:${view}`,
      with the same width as the chart today. It gets `swap` when the panel was already open
      as it mounted.
    - Both get the same `PanelSwitch` and `PanelSize`, built once from `page.split`,
      `onSize` and `page.toggleChart`.
  - **`ChartPane`** draws `switcher` as the first line of `.cpin`, and uses `PanelSize` in
    place of its own width buttons and close. It calls `onHistory` when its download resolves
    `ok`.
  - **CSS:**
    - `.cpane.away` is `position: absolute; top: 0; right: 0; bottom: 0; visibility: hidden; pointer-events: none`.
      It isn't `display: none`, because a CSS animation restarts when shown again, and the
      draw-in must not replay.
    - `.cpane.swap` has no `split-in` animation, and nor does `.narrow .cpane.swap` (no
      `cp-in`). Its `.cpin` fades in with the existing `fade` keyframes over 150 ms.
    - `.pswitch` sits above `.cph`.
    - `.vread` is the readout line: 13 px, `--text`, 2 lines at most, in the space where the
      chart shows `.cpbig`.
- [ ] **Step 4: Run the tests to see them pass.** Run `npx vitest run && npm run -s typecheck`.
  Expected: everything passes.
- [ ] **Step 5: Commit.** Use the message "Let the right-hand panel show one view at a time,
  with a switch back to the price chart".

### Task 5: The price chart with its range, and Score by factor

**Files:**
- Create:
  - `app/src/renderer/views/pick.ts`
  - `app/src/renderer/views/factors.ts`
  - `app/src/renderer/views/Factors.tsx`
  - `app/src/renderer/views/views.css`
- Modify:
  - `app/src/renderer/panel/ViewPane.tsx`, to list `factors`;
  - `app/src/renderer/chart/ChartPane.tsx`, for `rangeAsk`.
- Test:
  - `app/src/renderer/views/pick.test.ts`
  - `app/src/renderer/views/factors.test.ts`

**Interfaces:**
- **Consumes:** `ViewProps` and `ViewFrame` from Task 4, and `FactorItem` from Task 2.
- **Produces, in `pick.ts`:**
  - `pickIndex(item: string | null, count: number): number | null`. It accepts only a whole
    number from 0 to `count - 1`, written as plain digits.
  - `pickKey<T>(item: string | null, list: T[], key: (t: T) => string): number | null`.
- **Produces, in `factors.ts`:**
  - `type FactorSort = 'percentile' | 'weight'`;
  - `interface FactorsState { sort: FactorSort; median: boolean }`;
  - `FACTORS_START: FactorsState = { sort: 'percentile', median: true }`;
  - `sortFactors(fs: FactorItem[], sort: FactorSort): { at: number; f: FactorItem }[]`. `at` is
    the stored index, which is what the report's link names. Percentile sorts by percentile from
    high to low, then weight from high to low, then name. Weight sorts by weight from high to
    low, then percentile from high to low, then name.

- [ ] **Step 1: Write the failing tests.**
  - **`pick.test.ts`:**
    - `pickIndex('2', 3)` is 2;
    - `pickIndex('3', 3)`, `pickIndex('-1', 3)`, `pickIndex('1.5', 3)`, `pickIndex('x', 3)`,
      `pickIndex('', 3)` and `pickIndex(null, 3)` are all null;
    - `pickKey('DCF', methods, (m) => m.method)` finds it, and `pickKey('NOPE', …)` is null.
  - **`factors.test.ts`:** use profitability (93, 0.3), momentum (35, 0.25) and balance sheet
    (76, 0.075).
    - By percentile the names are `['profitability', 'balance sheet', 'momentum']`.
    - By weight they are `['profitability', 'momentum', 'balance sheet']`.
    - Ties fall back as specified.
    - The `at` values keep the stored index.
- [ ] **Step 2: Run the tests to see them fail.** Run `npx vitest run src/renderer/views`.
  Expected: they fail.
- [ ] **Step 3: Implement.**
  - **`Factors`:**
    - The controls are a `segc` "Sort by" with Percentile and Weight, and a `tg` toggle "Peer
      median", drawn like `ChartPane`'s toggles.
    - The body has one row per factor: the name, a percentile bar (`--accent`, on `--line`), the
      percentile, and the weight as text with a thin `--accent2` weight bar. A line at 50 shows
      while the median is on, labelled "Peer median".
    - Each row is a button. Hover and focus set the readout to the factor's `readout`. The row
      `pickIndex(item, n)` names gets class `picked` and is scrolled into view once.
    - The readout falls back to `numbers.score_readout`.
    - No factors shows ".vgap" with "Score by factor isn’t stored for this report."
  - **`ChartPane`:** `toggles.fan` starts at `rangeAsk > 0 && !!series?.range` once the
    series is in. An effect turns the range on through `flip('fan')` when `rangeAsk` rises
    above the last value it saw and the range is off.
- [ ] **Step 4: Run the tests to see them pass.** Run `npx vitest run && npm run -s typecheck`.
  Expected: everything passes.
- [ ] **Step 5: Commit.** Use the message "Open Score by factor bigger, sorted by percentile or
  weight, and the price chart with its range".

### Task 6: Key metrics

**Files:**
- Create:
  - `app/src/renderer/views/scale.ts`
  - `app/src/renderer/views/metrics.ts`
  - `app/src/renderer/views/Metrics.tsx`
- Modify:
  - `app/src/renderer/panel/ViewPane.tsx`
  - `app/src/renderer/views/views.css`
- Test:
  - `app/src/renderer/views/scale.test.ts`
  - `app/src/renderer/views/metrics.test.ts`

**Interfaces:**
- **Consumes:** `MetricItem` and `PeerValue` (Task 2), and `pickKey` (Task 5).
- **Produces, in `scale.ts`:**
  - `interface Scale { lo: number; hi: number }`.
  - `scaleOf(values: number[], pad: number): Scale`. The span is padded by `pad` times itself
    on each side. A zero span is padded by `max(|v| * 0.1, 0.01)`. With no values it is
    `{ lo: 0, hi: 1 }`.
  - `at(v: number, s: Scale): number`, a percentage clamped to [0, 100].
- **Produces, in `metrics.ts`:**
  - `interface MetricsState { sort: 'report' | 'below'; peers: boolean; median: boolean }`;
  - `METRICS_START = { sort: 'report', peers: false, median: true }`;
  - `sortMetrics(ms: MetricItem[], sort): MetricItem[]`. Below sorts by percentile from high
    to low, with null last, keeping the report's order among ties.
  - `metricScale(m: MetricItem, s: MetricsState): Scale`. It covers the value, the median when
    on and not null, and every peer when `peers` is on, with `pad` 0.08.

- [ ] **Step 1: Write the failing tests.**
  - **`scale.test.ts`:**
    - `scaleOf([0, 10], 0.1)` is `{ lo: -1, hi: 11 }`;
    - `scaleOf([5, 5], 0.1)` is `{ lo: 4.5, hi: 5.5 }`;
    - `scaleOf([], 0.1)` is `{ lo: 0, hi: 1 }`;
    - `at(-5, { lo: 0, hi: 10 })` is 0, and `at(5, …)` is 50.
  - **`metrics.test.ts`:**
    - Below order puts 95, 67 and null in that order.
    - Report order is unchanged.
    - With peers off, the scale ignores a peer at 100.
    - With peers on, it covers it.
    - With the median off, it ignores the median.
- [ ] **Step 2: Run the tests to see them fail.** Run `npx vitest run src/renderer/views`.
  Expected: they fail.
- [ ] **Step 3: Implement `Metrics`.**
  - **The controls:** a `segc` "Sort by" with Report order and Share below, and toggles "Each
    peer" and "Peer median".
  - **Each row:** the label, the company's `text`, and a track scaled by `metricScale`. On the
    track sit:
    - the company's dot (`--accent`);
    - the median tick (`--muted`), while the median is on;
    - each peer's small dot (`--accent2`), while "Each peer" is on. Each peer dot is a
      focusable button whose readout is the peer's.
  - **The readout:** hover or focus on a row shows the metric's `readout`.
  - **The picked metric** is `pickKey(item, metrics, (m) => m.name)`.
  - **No peer values** disables "Each peer", with the title "No peer values are stored for this
    report."
- [ ] **Step 4: Run the tests to see them pass.** Run `npx vitest run && npm run -s typecheck`.
  Expected: everything passes.
- [ ] **Step 5: Commit.** Use the message "Open the key metrics bigger, with each peer’s own
  value".

### Task 7: Value per share by method

**Files:**
- Create:
  - `app/src/renderer/views/methods.ts`
  - `app/src/renderer/views/Methods.tsx`
- Modify:
  - `app/src/renderer/panel/ViewPane.tsx`
  - `app/src/renderer/views/views.css`
- Test: `app/src/renderer/views/methods.test.ts`

**Interfaces:**
- **Consumes:** `MethodItem`, `Mark` and `Band` (Task 2), and `scaleOf` and `at` (Task 6).
- **Produces, in `methods.ts`:**
  - `interface MethodsState { range: boolean; price: boolean; estimate: boolean }`;
  - `METHODS_START`, with all three on;
  - `canShow(n: ReportNumbers): MethodsState`, which says what is stored;
  - `methodsScale(n: ReportNumbers, s: MethodsState): Scale`. It covers the method values, plus
    the price, the estimate, and the range's bear and bull, each only while it is both shown
    and stored, with `pad` 0.05.

- [ ] **Step 1: Write the failing tests.**
  - With everything on, the scale covers bear 130.16 and bull 419.62.
  - With the range off, it covers only the methods (115.24 to 546.10), the price and the
    estimate.
  - With all three off, it covers the methods alone.
  - With no price stored, `canShow(...).price` is false.
- [ ] **Step 2: Run the tests to see them fail.** Run `npx vitest run src/renderer/views`.
  Expected: they fail.
- [ ] **Step 3: Implement `Methods`.**
  - **The controls:** toggles "12-month range", "Today’s price" and "Estimate", each disabled
    with a plain title when it isn't stored.
  - **The body:**
    - one row per method, with its dot and value;
    - the range as a `--accent2` band, with its readout on hover;
    - the price as a dashed `--hold` line, and the estimate as a solid `--accent` line, each with
      its readout on hover.
  - **The picked method** is `pickKey(item, methods, (m) => m.method)`. The readout falls back
    to `numbers.estimate.readout`.
- [ ] **Step 4: Run the tests to see them pass.** Run `npx vitest run && npm run -s typecheck`.
  Expected: everything passes.
- [ ] **Step 5: Commit.** Use the message "Open value per share by method bigger, with the
  range, price and estimate on or off".

### Task 8: Total return

**Files:**
- Create:
  - `app/src/renderer/views/returns.ts`
  - `app/src/renderer/views/Returns.tsx`
- Modify:
  - `app/src/renderer/panel/ViewPane.tsx`
  - `app/src/renderer/views/views.css`
- Test: `app/src/renderer/views/returns.test.ts`

**Interfaces:**
- **Consumes:**
  - `ReturnSpan` and `ReturnRow` (Task 2);
  - `scaleOf` and `at` (Task 6);
  - `numbersVersion` and `historyDownloaded` (Task 4), so that 3 and 5 years appear after the
    price chart's history download.
- **Produces, in `returns.ts`:**
  - `type Years = 1 | 3 | 5`;
  - `interface ReturnsState { years: Years; peers: boolean; spy: boolean; each: boolean }`;
  - `RETURNS_START = { years: 1, peers: true, spy: true, each: false }`;
  - `spansOffered(spans: ReturnSpan[]): Years[]`;
  - `shownSpan(spans: ReturnSpan[], years: Years): ReturnSpan | null`. It gives that span, or
    the 1-year span when the one remembered isn't stored.
  - `returnRows(span: ReturnSpan, s: ReturnsState): { kind: 'company' | 'peers' | 'spy' | 'peer'; row: ReturnRow }[]`.
    The company comes first. The peer group follows when `peers` is on and the span has it,
    then the S&P 500 when `spy` is on, then each peer when `each` is on, in the engine's order.
  - `PEERS_NOTE = 'Peers have about 14 months of prices stored, so they are left off spans longer than 1 year.'`
  - `SPANS_NOTE = 'Longer spans show once the full price history is stored. Picking 5Y on the price chart downloads it.'`

- [ ] **Step 1: Write the failing tests.**
  - `spansOffered` of the 1-year and 3-year spans is `[1, 3]`.
  - `shownSpan(spans, 5)` falls back to the 1-year span.
  - At 1 year with everything on, the rows are company, peers, spy and each peer.
  - At 3 years, there is no peer group row and no each-peer row, even with both on.
  - With spy off, there is no S&P 500 row.
  - A row whose value is null is kept, so its readout still says it isn't stored.
- [ ] **Step 2: Run the tests to see them fail.** Run `npx vitest run src/renderer/views`.
  Expected: they fail.
- [ ] **Step 3: Implement `Returns`.**
  - **The controls:**
    - a `segc` "Span" with 1Y, 3Y and 5Y, where a span not offered is disabled with title
      `SPANS_NOTE`;
    - the toggles "Peers", "S&P 500" and "Each peer". Peers and Each peer are disabled with
      title `PEERS_NOTE` beyond 1 year.
  - **The bars:** they run from a zero line, scaled by `scaleOf([0, ...values], 0.1)`. The
    company is `--hold`, a negative bar is `--down`, and the rest are `--accent`.
  - **The notes:** `PEERS_NOTE` shows under the bars beyond 1 year. The picked row comes from
    the item, which is `company`, `peers` or `spy`.
- [ ] **Step 4: Run the tests to see them pass.** Run `npx vitest run && npm run -s typecheck`.
  Expected: everything passes.
- [ ] **Step 5: Commit.** Use the message "Open the total return bigger, with each peer and 1, 3
  or 5 years where stored".

### Task 9: The Full report's tables

**Files:**
- Create:
  - `app/src/renderer/views/table.ts`
  - `app/src/renderer/views/Table.tsx`
- Modify:
  - `app/src/renderer/panel/ViewPane.tsx`, which lists `table` for every `table-<key>` view;
  - `app/src/renderer/views/views.css`
- Test: `app/src/renderer/views/table.test.ts`

**Interfaces:**
- **Consumes:** `ReportTable` (Task 2) and `pickIndex` (Task 5).
- **Produces, in `table.ts`:**
  - `cellNumber(text: string): number | null`. It ignores spaces and thousands commas, and
    reads `$`, `%`, `×`, a leading `-` or `−`, brackets for negative, and the words `thousand`,
    `million`, `billion` and `trillion` as multipliers. Anything else is null.
  - `numericColumn(rows: string[][], col: number): boolean`. It is true when there is at least
    one data row and every data cell reads as a number.
  - `type Sort = { col: number; dir: 'asc' | 'desc' } | null`;
  - `interface TableState { sort: Sort; filter: string }` and `TABLE_START = { sort: null, filter: '' }`;
  - `interface Row { at: number; cells: string[] }`, where `at` is the data row's index from 0;
  - `tableRows(rows: string[][], s: TableState): Row[]`. It drops the header and filters by any
    cell containing the trimmed filter, ignoring case. It then sorts as numbers when
    `numericColumn`, and otherwise as text with
    `localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })`. The sort is stable,
    and `desc` reverses the comparison, not the stability.
  - `nextSort(s: Sort, col: number): Sort`: off, then ascending, then descending, then
    ascending again.

- [ ] **Step 1: Write the failing tests.**
  - **`cellNumber`:**
    - `'$1.2 billion'` is 1.2e9;
    - `'(3.4)%'` is -3.4;
    - `'14.2×'` is 14.2;
    - `'-$340.3 million'` is -340.3e6;
    - `'$2,500.0 billion'` is 2.5e12;
    - `'$1,234.50'` is 1234.5;
    - `'93'` is 93;
    - `'30.0%'` is 30;
    - `'−5.1%'` is -5.1;
    - `'1,234,567'` is 1234567;
    - `'(3.4)'` is -3.4;
    - `'not meaningful'`, `''` and `'4 Nov 2026'` are null.
  - **Sorting:**
    - `a column of money sorts by size`: `$340.3 million`, `$1.2 billion` and `$90` ascending
      give `$90`, `$340.3 million`, `$1.2 billion`.
    - `a column with one word cell sorts as text`: `$115.24`, `not meaningful` and `$236.36`
      are sorted as text, and that sort is stable.
    - `the filter matches any cell, whatever its case`: `'dcf'` keeps the DCF row, and `'   '`
      keeps every row.
    - `a filter that matches nothing gives no rows`.
    - `nextSort` cycles as specified.
- [ ] **Step 2: Run the tests to see them fail.** Run `npx vitest run src/renderer/views`.
  Expected: they fail.
- [ ] **Step 3: Implement `Table`.**
  - **The controls:** a `type="search"` input, `aria-label="Filter rows"` and
    `placeholder="Filter rows"`, with a "3 of 5 rows" count.
  - **The header:** each header cell is a button that sets `nextSort`, with `aria-sort` on its
    `th`.
  - **No match** shows "No rows match the filter." under the header.
  - **The picked row** is `pickIndex(item, rows.length - 1)`, matched against `Row.at`.
  - **The title** is `viewTitle(view, numbers.tables)`.
- [ ] **Step 4: Run the tests to see them pass.** Run `npx vitest run && npm run -s typecheck`.
  Expected: everything passes.
- [ ] **Step 5: Commit.** Use the message "Open the Full report’s tables bigger, to sort by any
  column and filter by typing".

### Task 10: Red flags, the economy and the rings

**Files:**
- Create:
  - `app/src/renderer/views/figures.ts`
  - `app/src/renderer/views/Figures.tsx`, which exports `RedFlags`, `Economy` and `Rings`
- Modify:
  - `app/src/renderer/panel/ViewPane.tsx`
  - `app/src/renderer/views/views.css`
- Test: `app/src/renderer/views/figures.test.ts`

**Interfaces:**
- **Consumes:** `RedFlagItem`, `EconomyItem`, `Ring` and `Slice` (Task 2), and `pickKey`
  (Task 5).
- **Produces, in `figures.ts`:**
  - `ringArcs(ring: Ring, gap: number): { key: Slice['key']; from: number; to: number }[]`.
    The fractions of the way round run in slice order, each slice shortened by `gap` (a
    fraction) at its end but never below 0.005. Slices with a count of 0 are left out, and a
    total of 0 gives `[]`.
  - `NO_PEER_LIST = 'Which peers are Buy, Hold or Sell isn’t stored for this report.'`
- These views have no switches of their own; their state is `null`.

- [ ] **Step 1: Write the failing tests.**
  - The counts 8, 26 and 7 give three arcs, starting at 0 with each `from` equal to the
    previous slice's unshortened end, and the last unshortened end is 1.
  - A slice with a count of 0 is left out.
  - A total of 0 gives `[]`.
  - A single slice runs from 0 to `1 - gap`.
- [ ] **Step 2: Run the tests to see them fail.** Run `npx vitest run src/renderer/views`.
  Expected: they fail.
- [ ] **Step 3: Implement the three views.**
  - **`RedFlags`:** the meter, larger, with each check as a row ("found" in `--hold`, "clear"
    in `--muted`). Each row is a button with its readout. The meter's readout is
    `red_flags_readout`, and the picked row is by code.
  - **`Economy`:** the figures as large tiles, each with its readout, picked by series.
  - **`Rings`:** both rings as SVG at about 160 px, drawn from `ringArcs`.
    - Each slice is focusable, and shows its readout on hover and focus.
    - Under each ring is a list per slice, with the slice's label, count and `items`. When
      `items` is null, the list says `NO_PEER_LIST`.
    - The picked slice is by key, and its list is open.
  - **Missing data:** a part that isn't stored shows ".vgap" with "{Title} isn’t stored for
    this report."
- [ ] **Step 4: Run the tests to see them pass.** Run `npx vitest run && npm run -s typecheck`.
  Expected: everything passes.
- [ ] **Step 5: Commit.** Use the message "Open the red flags, the economy and the rings bigger,
  with what each slice holds".

### Task 11: Readouts and click links in the report

**Files:**
- Create: `engine/src/tearsheet/templates/report/_hot.html.j2`
- Modify:
  - `engine/src/tearsheet/render.py`, which passes `ro=readouts` and `open_link` to the
    template;
  - `engine/src/tearsheet/templates/report.html.j2`, for the CSS;
  - `report/_numbers.html.j2`, `report/_svg.html.j2` and `report/_full.html.j2`
- Test: `engine/tests/test_render.py`

**Interfaces:**
- **Consumes:** Task 1's `readouts` (as `ro`), and Task 3's `open_link` and its view names.
- **Produces, in `_hot.html.j2`:** `hot(view, item, text, cls="")`, a `{% call %}` macro.
  - **In app mode, with a link:** it gives `<a class="hot {cls}" href="{open_link}" aria-label="{text}">{caller}<span class="ro" aria-hidden="true">{text}</span></a>`.
  - **In file mode:** it gives the same `<a>` with no `href`, plus `tabindex="0"` and
    `role="group"`. It is focusable, with no link.

- [ ] **Step 1: Write the failing tests** in `test_render.py`. Compare text against
  `html.unescape(page)`.
  - `test_every_item_links_to_its_bigger_view` (app mode, `numbers()`):
    - each `tearsheet://open/` href matches
      `^tearsheet://open/(price|factors|metrics|methods|returns|flags|economy|rings|table-[a-z_]{1,32})(/[A-Za-z0-9_.-]{1,64})?$`;
    - the set contains:
      - `factors/0`, `factors/1` and `factors/2`;
      - `metrics/operating_margin` and `metrics/interest_coverage`;
      - `methods/DCF`, `methods/RESIDUAL_INCOME` and `methods/MULTIPLES`;
      - `returns/company`, `returns/peers` and `returns/spy`;
      - `flags/restatement`, `flags/material_weakness`, `flags/going_concern` and
        `flags/risk_factor_change`;
      - `economy/UNRATE` and `economy/DGS10`;
      - `rings/buy`, `rings/hold`, `rings/sell`, `rings/kept` and `rings/removed`;
      - `price` and `factors`, for the score ring.
    - with a report section holding `TABLES["score"]`, `table-score/0` and `table-score/1`.
  - `test_readouts_use_the_fixed_wording`: the fixture's ticker is EXM, and its price is $200.13.
    The page contains, exactly:
    - "Profitability: 93rd percentile. Better than 93 of 100 peers. Counts for 30% of the score."
    - "Operating margin: 65.2%. The peer median is 28.3%. 95% of peers are below EXM."
    - "Bull case: $419.62 in 12 months, 110% above today’s $200.13. The top of the range, its 90th percentile."
    - "Close on 14 Nov 2025: $180.00, 10% below today’s $200.13."
    - "Score: 74th percentile. Better than 74 of 100 peers on the weighted factors."
    - "1 of 4 checks found a red flag. Any one caps the rating at Hold."
    - "Buy: 8 of 41 companies in the group, rated before red-flag caps."
    - with a section holding `TABLES["score"]`, "Profitability: percentile 93, weight used 30.0%."
  - `test_the_past_year_has_a_readout_for_each_week_and_each_case`: 52 `"Close on "`
    readouts, and one each of "Bull case:", "Base case:" and "Bear case:".
  - `test_a_file_keeps_readouts_by_focus_without_app_links`: file mode has no `tearsheet://`,
    every `class="hot` element has `tabindex="0"`, and the readout strings are present.
  - `test_printing_hides_the_readouts`: an `@media print` block holds `.ro` with
    `display: none`.
  - `test_readouts_show_on_hover_and_keyboard_focus_only`:
    - the CSS has `:hover` and `:focus-visible` rules that show `.ro`;
    - no rule shows `.ro` on plain `:focus` or `:focus-within`, so a click doesn't leave it up.
  - `test_readouts_never_animate`: no CSS rule whose selector names `.ro` or `.hot` has
    `transition` or `animation`, and the motion block doesn't name them.
  - `test_readouts_never_draw_through_a_hidden_column` (Review Focus 1): no rule sets `.ro`, or
    anything holding it, to `visibility: visible`. `.ro` is hidden and shown by `display`.
  - `test_numbers_are_drawn_not_injected` gains a check: with the evil factor name, no
    `aria-label` holds a raw `<`.
  - The existing link, script and CSP tests stay as they are and pass.
- [ ] **Step 2: Run the tests to see them fail.** Run `uv run pytest -q tests/test_render.py`.
  Expected: the new tests fail.
- [ ] **Step 3: Implement the template.** "Readout box" means `position: relative`.
  - **Where readouts sit:**
    - **A numbers panel** (`.p`) is a readout box. A `.ro` in it is
      `position: absolute; left: 10px; right: 10px; bottom: calc(100% - 30px)`. That covers the
      heading line and grows upward over the gap. Later panels paint over earlier ones, so it is
      never hidden.
    - **The key strip** (`.keys`) is a readout box, and its readouts sit at `top: 100%`, just
      below it.
    - **Each Full-report table** goes in `<div class="tw">`, a readout box with
      `padding-bottom: 28px`. Its readouts fill that strip (`bottom: 0`). A muted `.rhint`
      sits there while no row is pointed at: "Point at a row to read it; click it to open the
      table bigger." In file mode the hint is "Point at a row to read it."
  - **The readout itself:**
    - `.ro { display: none; pointer-events: none; padding: 6px 9px; border-radius: 9px; background: #0E1422; border: 1px solid var(--line); color: var(--text); font: 12px/1.4 var(--ui); z-index: 5 }`.
    - It shows with `display: block` on `.hot:hover > .ro`, `.hot:focus-visible > .ro`,
      `.hit:hover > .ro`, `tr:hover > td > .hot > .ro` and `tr:has(:focus-visible) .ro`.
    - `.hot:has(.hit:hover) > .ro { display: none }`.
    - `.hot { color: inherit; text-decoration: none; display: block }`. A `.hot:hover` gets a
      faint background with no transition.
  - **Charts drawn in SVG:**
    - The SVG goes in `<div class="cw">`. Over it sits `.hits`, `position: absolute`, a flex row
      or column of plain (unpositioned) `.hit` spans, so their readouts sit against `.hits`, at
      `bottom: 100%`.
    - **The price path:**
      - one `.hit` per week, spread evenly over the weekly line's x span;
      - a second column `.tgts` over the range's labels, with three cells whose heights split
        at the midpoints between `y_bull`, `y_base` and `y_bear`.
      - The whole chart is `hot("price", none, ro.past_year(...))`.
    - **The methods chart:** a flex column of one `.hit` per method row. The whole chart is
      `hot("methods", none, ro.estimate(...))`.
  - **Each item.** Below, "view / item: readout" means
    `{% call hot(view, item, ro.readout(...)) %}…{% endcall %}`, and a missing item is `none`.
    - **The score ring:** factors: `ro.score`.
    - **The panel-1 tiles:**
      - price is price: `ro.price`;
      - estimated value is methods: `ro.estimate`;
      - the buy trigger is price: `ro.trigger`;
      - the value gap is methods: `ro.gap`.
    - **Factor bars:** factors / `loop.index0`: `ro.factor`, with the `.bar` grid as the hot
      element.
    - **Metric tiles:** metrics / `m.name`: `ro.metric`.
    - **Returns bars:** returns / `company`, `peers` or `spy`: `ro.total_return`, with
      `group=True` for the peer group.
    - **The red-flag meter:** flags: `ro.red_flags`. Each `.kv` is flags / code: `ro.red_flag`.
    - **Each economy figure:** economy / `e.series`: `ro.economy`.
    - **Legend entries:** rings / key: `ro.peer_rating` or `ro.claims`.
    - **Ring slices:** each `dn-seg` circle is wrapped in SVG `<a href="{open_link}" tabindex="-1">`
      in app mode. Its readout is a `.ro.ro-{key}` child of `.donut`, which is a readout box,
      shown by five explicit rules such as `.donut:has(.dn-buy:hover) > .ro-buy`. The keyboard
      path is the legend.
    - **Key tiles:**
      - rating is factors: `ro.rating`;
      - price is price: `ro.price`;
      - estimate is methods: `ro.estimate`;
      - range is price: `ro.band`;
      - past year is returns: `ro.total_return`.
    - **Full-report table rows:** the first cell is `"table-" ~ s.key` / `loop.index0`:
      `ro.table_row(head, row)`.
      In app mode, each other cell's text is wrapped in `<a class="cell" href=… tabindex="-1">`,
      so a click anywhere in the row opens it.
  - **Shared method names:** the methods chart's `names` dict is replaced by
    `ro.method_label`.
  - **Printing:** `@media print { .ro, .rhint { display: none !important } .tw { padding-bottom: 0 } }`.
  - **Motion:** nothing new goes in the motion block.
  - **Both frames:** the text and numbers frames render this same template, so both carry the
    links with no app change.
- [ ] **Step 4: Run the tests to see them pass.** Run `uv run pytest -q && uv run ruff check . && uv run ruff format --check .`.
  Expected: everything passes.
- [ ] **Step 5: Commit.** Use the message "Give every chart, bar, ring, tile and row in the
  report a readout, and a link to its bigger version".

### Task 12: The design doc, and every check

**Files:**
- Modify: `docs/designs/report-look.md`

- [ ] **Step 1: Update the doc.**
  - **Under "The chart":** add an italic note in the style of the round-two note. It points at
    `docs/superpowers/specs/2026-11-07-interactive-report-design.md` and says:
    - the right-hand panel now shows one view at a time;
    - a click on a chart, table, ring or tile in the report opens it there;
    - ⌘3 still opens the price chart.
  - **Under "Rules this keeps":** the "App links" line names the open links beside flag and
    re-read.
  - **The Shortcuts table:** ⌘3 reads "Open or close the panel (it opens on the price chart)".
  - **Under "Motion":** readouts in the report appear with no motion.
- [ ] **Step 2: Run the engine's checks.** From `engine/`, run
  `PATH=$HOME/.local/bin:$PATH uv run pytest -q && uv run ruff check . && uv run ruff format --check .`.
  Expected: everything passes.
- [ ] **Step 3: Run the app's checks.** From `app/`, run
  `npx vitest run && npm run -s typecheck && npm run -s gen-types && git diff --exit-code src/shared/protocol.ts && npm run -s build`.
  Expected: everything passes, and `protocol.ts` is unchanged.
- [ ] **Step 4: Commit and hand over.** Commit the doc with the message "Point the report’s
  design doc at the interactive report", then hand over to the controller for the
  hidden-window check.
