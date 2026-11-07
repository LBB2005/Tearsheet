# The interactive report

*Written 2026-11-07 from Liam's answers in chat. It builds on
`docs/superpowers/specs/2026-11-06-chart-round-two-design.md`: the report never reloads for
chart actions, and the right-hand chart panel has width buttons.*

## Why

Liam wants the report's charts, tables and rings to be things he can explore, not just pictures.
He wants to point at them to read exact values, and to open them bigger to sort, compare and
change what they show.

## Goals (Liam's choices)

1. **Point to read.** Every chart, bar, ring slice, tile and table row in the report shows a
   small readout when pointed at. It gives the number and what it means. For example:
   "Profitability: 79th percentile. Better than 79 of 100 peers. Counts for 20% of the score."
2. **Click to open bigger.** Clicking any chart, table or ring in the report opens a bigger
   version in the right-hand chart panel, where ⌘3's price chart opens today.
   - The report stays readable on the left.
   - The left sidebar doesn't change.
   - The panel keeps its Narrow, Half, Wide and Full buttons.
3. **What the bigger version can do:**
   - **Sort and filter:** tables sort by a column, and filter by typing.
   - **Compare with others:** add peers or the S&P 500, or show each peer's own value.
   - **Medians and ranges:** show or hide the peer median, the 12-month range and the buy
     trigger.
   - **Time span:** pick the period a chart covers, where the data has a history.
4. **The first round covers the whole report:**
   - the past year and the 12-month range;
   - score by factor, and the key metrics against the peer median;
   - value per share by method, and the 12-month total return;
   - the Full report's tables, the red-flag checks, the economy figures, and the peer-rating
     and checks rings.

## Non-goals

- **No scripts in the report** (Liam's choice). The readouts are the report's own CSS; everything
  else happens in the app.
- No editing of the report's data.
- No new data sources. The bigger versions show what the report and the engine already store.

## Anti-goals

These would make it a failure even if it works:

- the report flashing, reloading or losing its place when a bigger version opens or closes;
- readouts that cover the passage being read, or that stay up after the pointer leaves;
- a panel that looks or behaves like a different app from the price chart beside it.

## Constraints (unchanged)

- **The report** stays the engine's HTML, in an iframe with `srcdoc` and an empty `sandbox`
  attribute, with no scripts.
- **All AI and source text** stays escaped plain text.
- **The content-security policies** stay as they are.
- **Clicks from the report reach the app only as `tearsheet:` links handled by
  `navigation.ts`**, as the flag and re-read links do now. A new link kind names the chart or
  table to open.
- **The window** stays sandboxed, with no Node access.
- **Reduce motion:** nothing animates.
- **Readouts work by keyboard too.** A readout also shows while its item has keyboard focus.

## My calls (for Liam to check)

- **One view at a time.**
  - The panel shows one thing at a time: the price chart, or the chart or table opened from the
    report.
  - A small switch at the top of the panel goes back to the price chart.
  - ⌘3 still opens the price chart.
- **Opening.** Clicking a chart in the report opens the panel at Half if it is closed, and
  switches what it shows if it is open. Clicking the same chart again does nothing.
- **What gets each switch.** Each bigger version gets only the switches that fit its data:
  - **Price and 12-month range:** the price chart as it is now, opened with the 12-month range
    on.
  - **Score by factor:** sort by percentile or by weight, and the peer median on or off.
  - **Key metrics:**
    - sort by the share of peers below;
    - show each peer's own value;
    - the peer median on or off.
  - **Value per share by method:** the 12-month range, today's price and the estimate, each on
    or off.
  - **Total return:**
    - peers and the S&P 500 on or off, and each peer's own return;
    - a time span of 1, 3 or 5 years, where the history is stored.
  - **The Full report's tables:** sort by any column, and filter by typing.
  - **Red flags, the economy, and the rings:** the same figures larger, each with its readout,
    and for the rings a list of what each slice holds.
- **No time span without a history.** Time span is offered only where a history is stored: the
  price and the total return. A metric stored only as today's value doesn't get one.
- **Readout wording.** It comes from fixed plain-language templates per chart, filled with the
  stored numbers. No AI writes it.

## Settled after the reviewer's read (my calls)

- **Data.**
  - **What counts as stored.** A bigger version shows only what is stored, or what can be worked
    out from it, and says plainly when something isn't there. Working out from stored data
    doesn't break the "no new data sources" rule. Each peer's 12-month return, for example, comes
    from the peers' daily prices the engine already keeps.
  - **Time spans.** The total return offers 1, 3 or 5 years only as far as the company's and the
    S&P 500's stored history goes, which is 5 years after the full history has downloaded. Peers
    have about 14 months stored, so they are left off longer spans, with a note saying so.
  - **Lists that aren't stored are left out.** A ring slice's list of which peers are Buy, Hold
    or Sell is shown only if the run kept it. No new storage is added for it.
- **The Full report's tables arrive as text.**
  - A column whose cells all read as numbers, such as "$1.2 billion", "(3.4)%" or "14.2×", sorts
    as numbers; any other column sorts as text.
  - The filter matches any cell.
  - Every table the Full report shows is included.
- **Clicking a tile, a row or a slice** opens the view it belongs to, with that item picked out.
  - A key-metric tile opens key metrics.
  - A red-flag row opens red flags.
  - A ring slice opens its ring.
- **Readouts in a report file.** A file opened in a browser keeps the readouts, since hovering
  works there too. Printing hides them.
- **Where the panel can't sit beside the report,** a click opens it the way ⌘3 opens the chart
  there.
  - In a narrow window, it takes the window.
  - Behind a Full panel, the Full panel switches to the new view.
- **What a view remembers.** Each view keeps its sort, filter, switches and span while the report
  is open, and starts afresh when another report opens. ⌘3 still opens and closes the panel,
  whatever it shows; opening it with ⌘3 shows the price chart.
- **Both report frames** carry the new links. A click never reloads either frame.

## Left to the builder

- How the readouts are drawn in CSS without scripts. For example, hidden labels shown on
  `:hover` and `:focus-within`, with focusable elements such as links or `tabindex`.
- How the app gets the numbers for the bigger versions: the report's numbers as data next to its
  HTML, or a method of their own.
- The new `tearsheet:` link's shape, and how `navigation.ts` passes it on.
- How the panel's views share the width buttons, and the code with `ChartPane`.

## Done looks like

- Every chart, table, ring and tile in the report has a readout by pointer and by keyboard.
- Every chart, table and ring opens bigger in the right-hand panel with the switches listed
  above.
- The report never reloads or loses its place doing any of that.
- Tests cover:
  - the readout wording;
  - the sort and filter;
  - the link handling;
  - each view's switches.
- A hidden-window check on a copy of Liam's data, never his own window, shows four things:
  - the readouts on pointer and focus;
  - clicks opening each view;
  - the report keeping its place;
  - every control passing the real-click check, with drag areas read in page order.
- All existing checks pass.
