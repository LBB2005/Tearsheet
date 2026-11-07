# The chart, round two

*Written 2026-11-06 from Liam's answers in chat. This changes parts of "The chart" and "Motion"
in `docs/designs/report-look.md`; everything else there still holds.*

## Why

Liam tried the chart in the app once the new look was in main. Three things got in his way.

- **The report rebuilds.** The engine lays the report out again, and the frame is replaced,
  whenever:
  - the chart opens or closes;
  - the Numbers / Text switch flips.

  A frame-by-frame recording on AAPL showed what that looks like:
  - the report area is completely blank for about a quarter of a second;
  - the report's own entrance animations play again;
  - it comes back at the top, so the reader loses their place.
- **The chart replays its entrance.** Every range or toggle change redraws the price line from
  scratch over 1.1 s, then fades in the buy line, the fan and the filing markers. Clicking
  through ranges feels flashy.
- **Its size is hard to change.**
  - The thin divider is the only control.
  - The chart reopens at the width it was left at, which he doesn't want.
  - There is no way to change its height.

## Goals (Liam's choices)

1. **The report is never rebuilt by the chart.** This covers the chart opening, closing and
   resizing, and the Numbers / Text switch flipping. In all of these:
   - no blank frame;
   - no replayed entrance animation;
   - the passage the reader was on stays in view.
2. **Width.**
   - Narrow, Half, Wide and Full buttons sit in the chart's header, always showing.
   - The divider stays, and is easier to see and grab.
   - The chart opens at Half every time.
   - The Settings choice "When the chart opens" goes away.
3. **Height.**
   - A line between the price chart and the volume bars drags to give either one more room.
   - A Volume toggle next to Peers and S&P 500 hides the bars, and the price chart takes their
     height.
   - The height he sets is remembered the next time the chart opens.
4. **Motion: glide.**
   - The line draws in once each time the chart opens for a report.
   - After that, a range change or a toggle glides the line from its old shape to its new one
     in about a third of a second.
   - Nothing else in the chart replays its entrance.
5. **The starting range is a setting.** Settings gets a choice of the range the chart opens on.
   Today it is always 1Y.
6. **Every control takes a real click.** That includes the chart's own buttons and the
   toolbar's. The check that proves it reads each control's computed `-webkit-app-region` and
   tests what is under its centre, because synthetic CDP clicks skip the window's drag area.
   That is how the Chart button's bug, fixed in 7ba528a, got through.

## Non-goals

- No new chart styles: no candles, no filled area.
- Nothing remembered per company.
- The Summary / Full report switch (⌘1 and ⌘2) still loads that view, as it does today.
- A narrow window still gives the chart the whole window.

## Anti-goals

These would make the change a failure even if it works:

- any blank or white frame in the report area during a chart action;
- motion that keeps replaying as he clicks around;
- losing the reader's place in the report.

## Constraints (unchanged)

- **The report** stays the engine's HTML, in an iframe with `srcdoc` and an empty `sandbox`
  attribute, with no scripts.
- **All AI and source text** stays escaped plain text.
- **The content-security policies** stay as they are.
- **Flag and re-read links** stay `tearsheet:` links handled by `navigation.ts`.
- **The window** stays sandboxed, with no Node access.
- **Reduce motion:** with the Mac's Reduce motion setting on, there is no draw-in and no glide.
  Changes are instant.
- **Width limits:** the chart is never narrower than 360 px, and the report never narrower than
  340 px (`split.ts`).

## My calls (for Liam to check)

- **The width presets.**
  - Narrow is a third of the space, but never under 360 px.
  - Half is as today.
  - Wide is two thirds, but leaves the report its 340 px.
  - Full is as today.
  - The header shows which one is on. After a drag to a width between presets, none is on.
- **The divider** gets a 12 px grab area and a grip that grows on hover, as in the chat mockup.
  - A double-click still returns to Half.
  - The snap labels ("Half", "Full", "Narrowest") stay.
  - A dragged width lasts until the chart closes.
- **The height memory** covers both the price/volume split and the Volume toggle, for every
  company. Volume is on until he turns it off. The split stops before either part gets too short
  to read, so that the price chart keeps at least two axis labels.
- **"The chart opens on"** offers every range, 1W to All.
  - **Default:** 1Y, so nothing changes until he picks something else.
  - **5Y or All:** if the full history isn't stored yet, the chart opens on that range and
    downloads it, just as picking 5Y does now.
- **The Numbers / Text switch** shows the other column at once, with no blank frame, and each
  column keeps its own place. It still starts on Text each time the chart opens. When it
  appears is under "Settled after the reviewer's read".
- **Keeping the place.** The promise is that the passage in view stays in view as the report
  narrows or widens, with the browser's scroll anchoring doing the work. It is not an exact
  pixel position: a two-column page that reflows into one column can't keep one.

## Settled after the reviewer's read

**Liam's answers:**

- **The report beside a Narrow chart** shows both of its columns when they fit, as it does with
  the chart closed. When the space gets too tight for both, it drops to one column, and the
  Numbers / Text switch appears in the toolbar. That is usually at Half or wider. The switch only
  shows while the report is in one column.
- **The draw-in** plays each time the chart opens, and each time another report opens while the
  chart is open. A range change, a toggle, a resize or the switch never replays it.

**My calls:**

- **What "never rebuilt" covers.** It covers what the chart does to the report: opening,
  closing, resizing and the switch. The report still loads afresh, as today, when:
  - ⌘1 or ⌘2 changes the view;
  - another report or company opens;
  - a re-read finishes.
- **The engine keeps its render options.** `column` and `narrow` stay, for report files and the
  golden set. The app asks for a layout that follows the frame's width instead, and the old
  options keep meaning what they mean today.
- **Lines that appear or go.** A line with no old shape fades in over about a fifth of a
  second, and one switched off fades out. That covers Peers and the S&P 500, and the fan, the
  buy line or the markers coming into or leaving view. The lines already showing glide with the
  axis.
- **Where the new choices live.** They go in `prefs.ts` with the window's other small
  preferences:
  - the starting range;
  - the price/volume split, stored as a share of the plot height, so it survives window
    resizes;
  - Volume on or off.

  The old "When the chart opens" choice and the remembered last width are ignored and cleared.
- **The real-click check** uses the hidden-window helpers already written for this work, outside
  the repo. It reads each control's computed `-webkit-app-region` and what is under its centre.

## Left to the builder

- **The report's layout:** how it lays itself out by the frame's width instead of by render
  options. Because the frame has no scripts, the layout has to come from CSS in the report's own
  stylesheet, reacting to the frame's width. The same goes for how the two column views are kept
  ready.
- **The glide:** how the lines are matched point for point between ranges, and how the fan,
  buy line and markers follow.
- **The width buttons:** how they and the drag share `split.ts`.

## Done looks like

- Unit tests for every new piece of pure logic: presets, height limits, the glide's point
  matching, and the settings.
- A hidden-window recording on a copy of Liam's data (never his own window or data) shows four
  things:
  - no blank frame when the chart opens, closes or resizes, or the switch flips;
  - the passage in view staying in view;
  - no replayed draw-in after the first;
  - every control passing the real-click check.
- All existing checks still pass.
