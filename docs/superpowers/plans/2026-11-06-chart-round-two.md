# The chart, round two: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opening, closing and resizing the chart never rebuilds the report. The chart gets:
- width presets, and it opens at Half;
- a height split and a Volume toggle;
- glide motion;
- a starting-range setting.

**Architecture:**
- **The report.** The engine gains one more layout, `column="auto"`, which lays the report out by
  its own frame width in CSS. From 860 px it shows both columns; below that, the one column
  `side` names. The app keeps up to two frames, one per side. It shows the right one without
  reloading, and changes the frame's width instead of its document.
- **The chart.** It keeps its first-open draw-in, and then glides its lines between states using
  pure helpers in `chart/glide.ts`.

**Tech Stack:** Electron and React 18 (TypeScript, Vitest); Python 3.12 engine (Jinja2, pydantic, pytest).

**Spec:** `docs/superpowers/specs/2026-11-06-chart-round-two-design.md`

## Global Constraints

- **The report** stays the engine's HTML, in an iframe with `srcdoc` and an empty `sandbox`
  attribute, with no scripts.
- **All AI and source text** stays escaped plain text.
- **The content-security policies** stay as they are.
- **Flag and re-read links** stay `tearsheet:` links handled by `navigation.ts`.
- **The window** stays sandboxed, with no Node access.
- **Reduce motion:** no draw-in, no glide and no fades. Changes are instant.
- **Width limits:** the chart is never narrower than 360 px (`CHART_MIN`), and the report never
  narrower than 340 px (`TEXT_MIN`).
- **Old render options:** `column="both" | "numbers" | "text"` and `narrow` keep their meaning
  for files and the golden set.
- **Test windows:** checks run in hidden windows on a copy of Liam's data, never his own window,
  data or computer use.

## Review Focus

1. **Rapid range clicks mid-glide.** The next glide starts from where the line is now, with no
   jump. Owner: Task 5, `between` test.
2. **The Numbers switch before the numbers frame has loaded.** The text frame stays showing
   until it is ready, never blank. Owner: Task 2, `shownSide` test.
3. **A stored volume share in a much shorter window.** The price chart still gets
   `PRICE_MIN`. Owner: Task 4, `volumeHeight` clamp test.
4. **A bad or old value in storage.** It falls back to the defaults: `1Y`, a share of 0.1,
   Volume on. Owner: Tasks 4 and 6, prefs tests.
5. **5Y as the starting range with no Massive key.** The chart opens on 5Y and shows the plain
   "needs a Massive key" line, not a stuck download. Owner: Task 7, hidden-window check.

---

### Task 1: The engine's layout that follows the frame

**Files:**
- Modify:
  - `engine/src/tearsheet/render.py` (`render_html`; a new `TWO_COLUMNS_MIN = 860`)
  - `engine/src/tearsheet/templates/report.html.j2`
  - `engine/src/tearsheet/protocol.py` (`GetReportParams`)
  - `engine/src/tearsheet/server.py` (`m_get_report`)
  - `app/src/preload/api.d.ts`
  - `app/src/preload/index.ts`
  - `app/src/shared/protocol.ts`, regenerated with `npm run gen-types`
- Test: `engine/tests/test_render.py`

**Interfaces:**
- **Produces:** `render_html(..., column="auto", side="text"|"numbers", motion=True)`.
  - **auto:** renders both columns, with the key strip when `narrow`, in
    `<body class="... col-auto side-{side}">`.
  - **motion=False:** leaves out the entrance-motion CSS block.
  - **The protocol:** `GetReportParams` gains `column: "auto"`, `side`, and `motion: bool = True`.
  - **The preload API:** `getReport(reportId, { view, column, side, narrow, motion })`.

- [ ] **Step 1: The failing tests** (`test_render.py`):
  - `test_auto_layout_holds_both_columns_and_names_its_side`: the auto render has the `nums`
    div and the `textcol` div, its body class holds `col-auto side-numbers`, and its CSS holds
    `@media (max-width: 859px)`.
  - `test_auto_layout_keeps_the_key_strip_for_a_narrow_window_only`: there is a `class="keys"`
    element with `narrow=True` and none with `narrow=False`.
  - `test_still_render_has_no_entrance_motion`: `motion=False` has no `@keyframes rise`, and the
    default render has it.
  - `test_old_columns_render_as_before`: `column="text"` still has no `nums`.
  - `test_auto_layout_is_refused_in_file_mode_as_both`: file mode still forces both columns.
- [ ] **Step 2:** Run `cd engine && uv run pytest -q tests/test_render.py`. They fail.
- [ ] **Step 3: Implement.**
  - **Template CSS:** below 860 px, a collapsed column keeps its box, so it keeps its scroll:
    `flex: 0 0 0; width: 0; min-width: 0; padding: 0; border: 0; overflow: hidden;
    visibility: hidden`.
  - **`side-numbers` below 860 px** takes the `.col-numbers .nums` look, including the 560 px
    rule.
  - **`.keys`** is hidden from 860 px.
  - **The protocol and server** pass `side` and `motion` through.
- [ ] **Step 4:**
  - Run `uv run pytest -q` and `uv run ruff check . && uv run ruff format --check .`. All pass.
  - Run `cd ../app && npm run -s gen-types`; `protocol.ts` updates.
- [ ] **Step 5:** Commit: "Let the report lay itself out by its frame's width".

### Task 2: Two frames that keep their place

**Files:**
- Modify:
  - `app/src/renderer/report/view.ts`
  - `app/src/renderer/report/useReport.ts`
  - `app/src/renderer/pages/Report.tsx`
  - `app/src/renderer/report/report.css`
- Test:
  - `app/src/renderer/report/view.test.ts`
  - `app/src/renderer/report/columns.test.ts`, a cross-check of 860 against `render.py`

**Interfaces:**
- **Consumes:** Task 1's `column: 'auto'`, `side` and `motion`.
- **Produces:**
  - **In `view.ts`:**
    - `TWO_COLUMNS_MIN = 860`;
    - `oneColumn(reportWidth: number): boolean`, which is `reportWidth < TWO_COLUMNS_MIN`;
    - `renderOptions({ view, side, wide, motion }): RenderOptions`, returning
      `{ view, column: 'auto', side, narrow: !wide, motion }`;
    - `shownSide(side: Side, one: boolean, numbersReady: boolean): Side`. It returns
      `'numbers'` only when `one && side === 'numbers' && numbersReady`.
  - **The `ReportPage` from `useReport`:**
    - drops `frame`;
    - gains `frames: { text: ReportResult | null; numbers: ReportResult | null }`, and the
      `text` doc stays in `report`;
    - gains `oneColumn: boolean` and `setOneColumn(one: boolean)`;
    - gains `numbersReady: boolean` and `setNumbersReady(ready: boolean)`.

- [ ] **Step 1: The failing tests:**
  - **`renderOptions`:** it always asks for `auto`, and for `narrow` only in a narrow window.
  - **`oneColumn(859)` and `oneColumn(860)`:** true and false.
  - **`shownSide`:** check its truth table. That includes the Numbers switch before the
    numbers frame is ready, which must show text.
  - **`columns.test.ts`:** it reads `../../../../engine/src/tearsheet/render.py` and checks
    that `TWO_COLUMNS_MIN = 860` matches.
- [ ] **Step 2:** Run `npx vitest run src/renderer/report`. They fail.
- [ ] **Step 3: Implement.**
  - **The text doc** loads on `[reportId, view, narrow, asked]`. Opening, closing or resizing
    the chart no longer changes that key.
  - **The numbers doc** loads with `motion: false`, the first time `side` is `numbers` for the
    text doc's key, and is dropped when that key changes.
  - **`Report.tsx`** renders the text frame, plus the numbers frame once it is loaded. They are
    stacked in `.rframe`, and each is keyed by its doc's key.
    - The frame `shownSide` names gets class `on`. The other is `visibility: hidden`, at the
      same size.
    - The numbers frame's `onLoad` calls `setNumbersReady(true)`.
    - A layout effect calls `setOneColumn(oneColumn(reportWidth))`, where `reportWidth` is
      `avail - chartW - DIV` while the chart is beside the report, and `avail` otherwise.
  - **`ReportTools`** shows the Numbers / Text switch only when `chartOpen && wide &&
    oneColumn`.
  - **The draw-ins:** opening the chart no longer replays the report's own entrance, because
    the frame isn't replaced.
- [ ] **Step 4:** Run `npx vitest run` and `npm run -s typecheck`. They pass.
- [ ] **Step 5:** Commit: "Keep the report's frame as the chart opens, closes and resizes".

### Task 3: Width presets, opening at Half, an easier divider

**Files:**
- Modify:
  - `app/src/renderer/chart/split.ts`
  - `app/src/renderer/chart/prefs.ts`
  - `app/src/renderer/report/useReport.ts`
  - `app/src/renderer/pages/Report.tsx`
  - `app/src/renderer/chart/ChartPane.tsx` (header)
  - `app/src/renderer/chart/chart.css`
  - `app/src/renderer/App.tsx` (one call)
- Test:
  - `app/src/renderer/chart/split.test.ts`
  - `app/src/renderer/chart/prefs.test.ts`

**Interfaces:**
- **Produces, in `split.ts`:**
  - `type Preset = 'narrow' | 'half' | 'wide' | 'full'`;
  - `SnapMode` gains `'narrow' | 'wide'`;
  - `presetSplit(p: Preset, avail: number): Split`;
  - `splitWidth` follows `narrow` and `wide` as the space changes;
  - `openWidth`, `openSplit` and `ChartOpens` are removed.
- **Produces, in `prefs.ts`:** `forgetOldChartPrefs(store?)` removes `chart.opens` and
  `chart.lastWidth`. `chartOpens`, `setChartOpens`, `lastWidth` and `setLastWidth` are removed.
- **Produces, in `ChartPane`:** the props `full` and `onFull` become `size: SnapMode | null`
  and `onSize(p: Preset)`.

- [ ] **Step 1: The failing tests:**
  - **avail 1200:** narrow 400, half 600, wide 800, full 1200.
  - **avail 900:** narrow 360, half 450, wide 552, full 900.
  - **avail 700:** every preset is full, because it is too narrow.
  - **`splitWidth`:** `{ mode: 'wide' }` follows the space from 1200 to 900.
  - **`forgetOldChartPrefs`:** it clears both old keys.
- [ ] **Step 2:** Run `npx vitest run src/renderer/chart`. They fail.
- [ ] **Step 3: Implement.**
  - **Narrow** is `min(widest, max(CHART_MIN, round(avail / 3)))`.
  - **Wide** is `max(CHART_MIN, min(widest, round(avail * 2 / 3)))`.
  - **Opening:** the chart opens at `presetSplit('half', avail)`, and `setSplit` no longer
    stores a width.
  - **The header:** it gets a `segc` group, `aria-label="Chart width"`, with Narrow, Half,
    Wide and Full, shown in a wide window. It replaces the Full-size icon button. The button
    whose preset equals `size` gets `on`.
  - **The divider:** a grab area of at least 12 px (`.divider::before`, 2 px out each side). The
    grip grows to 64 px and turns the accent colour on hover. The double-click and the snap
    labels stay.
  - **`App.tsx`** calls `forgetOldChartPrefs()` once.
- [ ] **Step 4:** Run `npx vitest run` and `npm run -s typecheck`. They pass.
- [ ] **Step 5:** Commit: "Open the chart at Half, with Narrow, Half, Wide and Full buttons and a
  divider that's easier to grab".

### Task 4: The height split and the Volume toggle

**Files:**
- Create: `app/src/renderer/chart/height.ts`
- Modify:
  - `app/src/renderer/chart/ChartPane.tsx`
  - `app/src/renderer/chart/prefs.ts`
  - `app/src/renderer/chart/chart.css`
- Test:
  - `app/src/renderer/chart/height.test.ts`
  - `app/src/renderer/chart/prefs.test.ts`

**Interfaces:**
- **Produces, in `height.ts`:**
  - `VOL_MIN = 24`, `PRICE_MIN = 90` and `SHARE_DEFAULT = 0.1`;
  - `volumeHeight(share: number, plotH: number, on: boolean): number`. It returns 0 when off,
    and otherwise `clamp(round(share * plotH), VOL_MIN, plotH - PRICE_MIN)`. When
    `plotH - PRICE_MIN < VOL_MIN`, it returns `max(0, plotH - PRICE_MIN)`.
  - `shareFor(volH: number, plotH: number): number`.
- **Produces, in `prefs.ts`:**
  - `volumeShare()` and `setVolumeShare(n)`, stored as `chart.volumeShare`. A stored value is
    used only if it is in (0, 1); otherwise `SHARE_DEFAULT`.
  - `volumeOn()` and `setVolumeOn(b)`, stored as `chart.volume`. `'0'` means off; anything else
    means on.
- **Produces, in `ChartPane`:** the plot height is `H - TOP - AXIS_H - 12`. `geometry` takes
  `volH` in place of `VOL_H`, and `Geo` gains `volH`.

- [ ] **Step 1: The failing tests:**
  - `volumeHeight(0.1, 500, true)` is 50.
  - `volumeHeight(0.9, 500, true)` is 410.
  - `volumeHeight(0.1, 100, true)` is 10.
  - `volumeHeight(0.5, 400, false)` is 0.
  - `shareFor(50, 500)` is 0.1.
  - **The prefs:** the defaults, a bad stored share (`'2'`, `'x'`), and `'0'` for Volume off.
- [ ] **Step 2:** Run `npx vitest run src/renderer/chart`. They fail.
- [ ] **Step 3: Implement.**
  - **The Volume toggle** joins the 12-month range, Peers and S&P 500, starting from
    `volumeOn()` and stored on each flip. With Volume off there are no bars, no handle and no
    volume highlight on hover. The hover text still reads the volume.
  - **The handle** is a `div.hsplit` over the chart, between the price chart and the bars, from
    `x0` to `x1`.
    - It has `role="separator"`, `aria-orientation="horizontal"`, `aria-label="Price and
      volume heights"` and `tabIndex={0}`.
    - Dragging it sets the share live, and letting go stores it. The drag stops propagation, so
      it doesn't start a measure.
    - ArrowUp and ArrowDown change the share by 0.02, and a double-click resets it to
      `SHARE_DEFAULT`.
- [ ] **Step 4:** Run `npx vitest run` and `npm run -s typecheck`. They pass.
- [ ] **Step 5:** Commit: "Let the price chart and the volume bars share the height as you drag,
  and hide the volume".

### Task 5: Glide, one draw-in, and fades for lines that come and go

**Files:**
- Create: `app/src/renderer/chart/glide.ts`
- Modify:
  - `app/src/renderer/chart/ChartPane.tsx`
  - `app/src/renderer/chart/chart.css`
- Test: `app/src/renderer/chart/glide.test.ts`

**Interfaces:**
- **Produces, in `glide.ts`:**
  - `GLIDE_MS = 350`, `FADE_MS = 200` and `GLIDE_POINTS = 160`;
  - `ease(t: number): number`, which is `1 - (1 - t) ** 3`, clamped to [0, 1];
  - `resample(xs: number[], ys: (number | null)[], x0: number, x1: number, n: number):
    number[] | null`. It gives the y at `n` evenly spaced x from `x0` to `x1`, by linear
    interpolation. Outside the line's defined span it holds the nearest defined y. It returns
    null with fewer than 2 defined points.
  - `between(from: number[], to: number[], t: number): number[]`, which uses `ease(t)`.

- [ ] **Step 1: The failing tests:**
  - **A straight line** resampled to 5 points gives the exact ys.
  - **Nulls at the start** hold the first defined y.
  - **Fewer than 2 points** gives null.
  - **`between`:** it returns `from` at `t = 0` and `to` at `t = 1`, and is monotonic at 0.5.
  - **A restart mid-glide:** `between(between(a, b, 0.5), c, 0)` equals
    `between(a, b, 0.5)`. That is Review Focus 1.
- [ ] **Step 2:** Run `npx vitest run src/renderer/chart/glide.test.ts`. It fails.
- [ ] **Step 3: Implement.**
  - **The draw-in:**
    - The `.play` group keeps one key for the pane's life, and has the class `first` until the
      first range or toggle change.
    - The draw-in CSS in `chart.css` is scoped to `.play.first`.
    - `restart()` no longer bumps the key.
  - **A range or toggle change:**
    - **Glide:** the main, peer and S&P lines and the area are drawn from
      `between(prev, next, ease)`, frame by frame, for `GLIDE_MS`. `prev` is the line as it is
      drawn at that moment, kept in a ref.
    - **Snap:** everything else is drawn at its new place at once.
    - **Fade in:** an element present now and not before gets `c-enter`, an opacity fade over
      `FADE_MS`. That covers the peers, S&P, fan, buy line and markers.
    - **Fade out:** a line switched off is drawn once more from its last points with
      `c-leave`, for `FADE_MS`.
  - **Resizing** the pane, from the presets, the divider or the window, redraws without
    gliding.
  - **Reduce motion** (`matchMedia('(prefers-reduced-motion: reduce)')`): no glide; the CSS
    has no fades.
- [ ] **Step 4:** Run `npx vitest run` and `npm run -s typecheck`. They pass.
- [ ] **Step 5:** Commit: "Glide the chart's lines between ranges instead of drawing them again".

### Task 6: The starting range in Settings

**Files:**
- Modify:
  - `app/src/renderer/chart/prefs.ts`
  - `app/src/renderer/chart/ChartPane.tsx`
  - `app/src/renderer/pages/Settings.tsx`
- Test: `app/src/renderer/chart/prefs.test.ts`

**Interfaces:**
- **Produces:** `startRange(store?): Range` and `setStartRange(r: Range, store?)`, stored as
  `chart.startRange`. The default is `'1Y'`, and an unknown value falls back to `'1Y'`.

- [ ] **Step 1: The failing tests:** the default, a stored `'3M'`, and a stored `'1D'`, which
  gives `'1Y'`.
- [ ] **Step 2:** Run `npx vitest run src/renderer/chart/prefs.test.ts`. It fails.
- [ ] **Step 3: Implement.**
  - **`ChartPane`:** `range` starts at `startRange()`. When that is 5Y or All, `waiting`
    starts true, so the history download runs once the stored series arrives.
  - **Settings' Chart section:** "When the chart opens" becomes "The chart opens on". It is a
    `segc` group of `RANGE_ORDER` buttons, `aria-labelledby="set-opens"`, and stores on click.
    The header comment changes to match.
- [ ] **Step 4:** Run `npx vitest run` and `npm run -s typecheck`. They pass.
- [ ] **Step 5:** Commit: "Let Settings choose the range the chart opens on".

### Task 7: The docs, every check, and a hidden-window proof

**Files:**
- Modify: `docs/designs/report-look.md`, sections "The chart" and "Motion". Point them at the
  round-two design and fix the lines it changes.

- [ ] **Step 1:** Run the full checks: ruff, pytest, replay, typecheck, the app tests,
  gen-types in sync, and the build. All pass.
- [ ] **Step 2: A hidden-window recording** on the data copy, with frames captured as
  `anim.mjs` does. It shows:
  - the report's frame is never replaced on open, close, a preset change, a divider drag or the
    switch;
  - the passage in view stays in view, checked by a marker paragraph's position in the frame;
  - no draw-in after the first;
  - no blank frame;
  - with 5Y as the starting range and no key, the "needs a Massive key" line.
- [ ] **Step 3: The real-click check** (`hits.mjs`): for every button, the divider and the
  height handle, nothing covers its centre, and no drag area holds it.
- [ ] **Step 4:** Commit the docs, then report to Liam.
