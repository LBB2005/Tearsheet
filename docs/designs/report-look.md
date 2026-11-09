# Tearsheet: report look and feel

*   **Status:** Approved by Liam (Nov 5 2026), including the two deliberate changes below. The
    first-time setup and the home page were added the same day, after Liam chose their questions
    and their motion (A. Settle for every moment), and the new app icon (2. Glass).
*   **Answers:** the "Report look and feel" open question in [`tearsheet.md`](tearsheet.md)
*   **References:** three clickable prototypes.
    *   [`report-look-c-prototype.html`](report-look-c-prototype.html), published as "Tearsheet
        look C prototype", covers the pages and the report.
    *   [`report-look-c-chart-split.html`](report-look-c-chart-split.html), published as
        "Tearsheet chart split", covers the sidebar and the chart. Where the two differ, this one
        is newer.
    *   [`opening-and-setup.html`](opening-and-setup.html), published as "Tearsheet opening and
        setup", covers the first-time setup and the home page. It also shows three motion styles
        Liam didn't pick, for reference.

## What Liam chose

Over six rounds of mockups, Liam settled on:

1.  **Glass with very little glow.** Dark see-through panels in the main area over a faint
    colored light. There is no glow on text or numbers.
2.  **Three parts.** A sidebar on the left; then the report, with its numbers column and its
    text; and a price chart that opens from the right.
3.  **Full data** (look C). The numbers column carries the most numbers and charts.
4.  **A native Mac window, styled like Claude.** There is no separate title strip. The window
    buttons sit where macOS puts them, at the top-left corner, with a sidebar button beside them.
5.  **A Summary view that opens first.** It is built only from claims that passed the checks.
    The full report is one click (or ⌘2) away.
6.  **Dark by default.** Since Nov 8, Settings → Appearance also offers light looks and Match the
    Mac (below).
7.  **Mac menus and shortcuts.** They work only while Tearsheet is the app in front.

## The window

*   **Sidebar** (232 px, flat, "Raised": a step lighter than the page, `#1B1E25` in the dark
    Tearsheet look, Liam's pick of five on Nov 8; Sidebar contrast on Appearance sets how much,
    and light mode keeps its grey sidebar). It has no boxes, pills or borders, and no desktop
    color shows through. From top to bottom:
    *   New report (⌘N) and Look up (⌘K) as plain rows;
    *   a small "Reports" label with Search and a sort and filter button, then one row per
        company (look 3 of the sidebar mockups, picked by Liam on Nov 7): the ticker, a tick for
        an official prediction, the last close, muted, and a Buy / Hold / Sell tag. Pinned
        companies come first, then Today, Yesterday, Previous 7 days, Previous 30 days and Older.
        The sort and filter menu sorts by newest, A to Z, rating or the move since the report, and
        filters by rating, official prediction and sector; it also shows Hidden reports. Each row
        has a "…" menu, also on right-click: Pin to top, Show in Prediction log, Select, Delete.
        ⌘-click and ⇧-click select several. ↑ ↓ move, ⌘⌫ deletes, Esc ends a selection or the
        search. Delete hides at once with Undo; an official prediction's report is only ever
        hidden. Older reports of a company open from inside it, where its menu can delete one.
    *   Prediction log, Settings (⌘,), and a status line. The status line says "● Claude Code
        ready"; during a run it shows "Writing JPM, step 9 of 14" with a thin progress bar.

    Hiding the sidebar (⌃⌘S or its button) removes it completely. The toolbar then moves right
    to make room for the window buttons.
*   **Toolbar** (52 px). It holds the page title with a one-line subtitle, the Numbers / Text
    switch while the chart is open, and the Chart button (⌘3). While a report runs, Cancel run
    takes the Chart button's place. You drag the window by any empty part of the toolbar.
    *   On a report, the title is the report's top bar (picked on 2026-11-07 from round 2 of
        the top-bar designs: A's left side with C's box). On the left: the ticker, the last
        close to the cent and the day's move ("NVDA $186.64 +$3.41 (+1.9%)"). On the right,
        in one rounded box: the rating (with "capped" and a coloured dot), the base case
        against the last close, the 12-month range as a small line, and the peer score. Then
        the report's date, which opens the company's other reports, and the toolbar's buttons.
    *   When room runs short, parts drop out in this order: the close's date, the peer score,
        the range, the move in dollars, "capped", the base case, the rating, the move in %.
        The ticker and the price always stay. Pointing at a part says what it means.
*   **Main area:** painted dark glass.
    *   Panels: see-through, with a 14 px radius and a hairline border.
    *   Font: Avenir Next, a Mac system font, with tabular figures.
*   **Colors:**

| Role | Color |
| :-- | :-- |
| Accent | cyan `#7FE3F7` |
| Second accent | `#8FA2FF` |
| Hold | amber `#FFC56B` |
| Up / Buy | `#63DFA5` |
| Down / Sell | `#FF7F8A` |
| Text | `#EAF1F7` |
| Muted text | `#92A4B6` |

*   **Narrow windows** (under about 1,100 px):
    *   The sidebar is hidden, and its button opens it over the report.
    *   A row of five key-number tiles sits above the text: rating and score, price, estimated
        value, range, and the past year.
    *   The chart, when open, still sits beside the report, as in a wide window. (Until
        2026-11-08 it took the whole window, and crossing 1,100 px made it jump; Liam chose to
        keep the split.) Only a page too narrow for both (under 708 px, which no window
        Tearsheet allows leaves) gives the chart all of it.

## Pages

1.  **Report.**
    *   **The numbers column (548 px), in order:**
        *   rating, with the score ring, the red-flag note, price, estimated value, buy trigger
            and value gap percentile;
        *   the past year's weekly prices running into the 12-month range, drawn as a fan;
        *   factor percentiles with weights, with a line at the peer median;
        *   eight key metrics against the peer median;
        *   value per share by method;
        *   12-month total return against the peers and the S&P 500;
        *   the red-flag meter;
        *   five economic figures from FRED;
        *   rings for peer ratings and for claims kept and removed.
    *   **The text column** has a Summary / Full report switch.
        *   **Summary:** a code-written line with the call and its numbers, the red flag, the
            first surviving claim of each section (with its sources, Flag, and Read the
            section), then the triggers and checks.
        *   **Full report:** section links with claim counts, then all nine sections in one
            scroll. Each claim has source chips that fold out the quoted paragraph, and a Flag
            link. The list of removed claims and their reasons stays.
2.  **New report, which is also the home page** (see "Opening Tearsheet" below). A large look-up
    field, then the company, sector and peer-group rule, which come from the bundled S&P 500 list
    as you type. While it runs, the page shows:
    *   five stages;
    *   a 14-segment ring;
    *   the step list.

    If your plan's usage limit stops a run, a red box shows the engine's message and reset time,
    with Resume.
3.  **Prediction log.** It shows:
    *   the "descriptive, not conclusive" notice;
    *   three tiles;
    *   the reports table.

    Until real predictions are graded, it shows an empty state. There is no stripe pattern
    anywhere, and the app never shows the prototype's example rows.
4.  **Settings.** Liam picked this layout on Nov 6, from two rounds of mockups: "Sidebar list",
    in the "Outline" style.
    *   A list of seven topics on the left, each with the app sidebar's own line icons. There is
        one short page per topic, and the toolbar names the topic.
    *   **General:** the main AI tool and "The chart opens on" (below), as Mac pop-up menus, and the
        SEC email. A note at the top, with a button, for each thing that needs you.
    *   **Appearance** (Nov 8, Liam's version B of three, "Look gallery"): six looks as pictures
        (Tearsheet, Graphite, Evergreen, Amber, Dusk, High contrast), each dark and light, with
        Dark / Light / Match the Mac beside the title. Then the accent colour, text size (the
        window's zoom), the glow (40% by default), the Buy/Hold/Sell colours from tested sets only
        (Standard, Colour-blind friendly, High contrast), Animations, and a row kept for the home
        background. Customize… opens every colour, the font and boldness, corners, glass and the
        chart's lines, with a warning when text gets hard to read. Theme files (Import…, Export…,
        a `.tearsheet-theme` file read as untrusted), Save as a look, and Reset, each with Undo. The
        report's frame follows the look; a report file keeps the dark look at full glow.
        Also since Nov 8: a **More looks** card after the six opens a page of twenty more to
        scroll through (Midnight, Terminal, Ledger, Glacier, Rosewood, Cobalt, Moss, Ultraviolet,
        Lavender, Coral, Copper, Signal, Aurora, Sunset, Espresso, Carbon, Neon, Newsprint, Mono,
        Desert), each dark and light with its own font, corners and glow; picking one brings
        those three unless you changed them yourself. **Sidebar contrast** (next to Glow, 50% by
        default) sets how much lighter the sidebar is than the page in dark mode.
    *   **AI tools:** each tool's job and version, its safety check, and "Look for AI tools
        again". The paths and the lock-down details are behind "Show details".
    *   **Data keys:** Massive, FRED and Alpha Vantage.
    *   **Storage and backup:** the downloads bar, the storage limit, and the backup folder.
    *   **Privacy:** "What leaves your Mac".
    *   **Advanced:** the Goal 1 round, and how the 5Y and All ranges download.
    *   A topic that needs you gets a dot, red or amber. Together with General's notes, the dots
        replace the four health tiles.
    *   Motion: each page settles in part by part, and the picked topic's icon draws itself.

**Overlays:**

*   **Look-up box (⌘K):** searches the bundled S&P 500 list by ticker or name. It says which
    companies already have a report.
*   **Flag sheet:** drops from the toolbar.
*   **Small notices:** they rise from the bottom right.

## Opening Tearsheet: first-time setup and the home page

### What Liam chose

*   **Both:** a short setup the first time someone opens Tearsheet, then a home page every time
    after.
*   **Built for someone who has never used Terminal:** plain words, a copy button for anything
    typed, and each step ticks itself off. There is no "I'm done" button.
*   **Claude Code:** two guided Terminal steps for now. A one-click install and sign-in is
    designed too, but stays switched off until Anthropic approves it (Technical Plan §14, CUJ 6).
*   **Keys:** a Massive key is required, because there is no rating without prices. The FRED key
    can be skipped, and reports then say "economic figures not connected".
*   **The safety check** (the lock-down check, Technical Plan §4) runs in the background while
    setup carries on.
*   **Home:** a Claude-style "Which company today?" field.
*   **No sample report.**
*   **Motion:** A. Settle for every moment (below).

### The first-time path

Setup happens inside the app window, with no sidebar. A four-part progress line sits in the
toolbar from step 3 on: Claude Code, Prices, Details, Ready.

1.  **First open.** The name, one line on what Tearsheet is, and three short lines: every number is
    computed by code from public data; every sentence links to its source; everything is kept on
    the Mac. One button, **Set up Tearsheet**, with "About 5 minutes. You'll need a paid Claude
    plan. Research to read, not investment advice." The mark is a placeholder until the icon
    session finishes.
2.  **How it works.** One picture: Tearsheet on the Mac in the middle, Claude Code on one side, and
    SEC EDGAR, Massive and FRED on the other, each with what it does and what it needs. Below it,
    "What leaves your Mac": the companies looked up, and the filing and article text Claude reads,
    never the user's own files. The full list stays in Settings (Technical Plan §12).
3.  **Looking for Claude Code.** The app runs its usual detection (`probe.ts`).
    *   **Found and signed in:** it goes straight to step 5.
    *   **Not found:** "Claude Code isn't on this Mac yet. Adding it takes about two minutes. You'll
        need a paid Claude plan, like Pro or Max." Buttons: **Show me how**, and "I use ChatGPT:
        connect Codex instead". A small "Where Tearsheet looked" link lists the folders checked.
    *   **Found but signed out:** step 4 opens at its sign-in step.
4.  **Install and sign in.** Two numbered cards, each with the exact line and a Copy button:
    *   **Install it:** `curl -fsSL https://claude.ai/install.sh | bash`, with an **Open Terminal**
        button. Opening Terminal types and runs nothing.
    *   **Sign in:** `claude auth login`. The browser opens for the Claude sign-in.

    The page checks again every 2 seconds while it is open, and ticks each card off by itself
    ("Installed: Claude Code 2.1.317", "Signed in to your Claude plan"). "Tearsheet never sees your
    password." For Codex the lines are `npm install -g @openai/codex` and `codex login`, with a note
    to install Node.js first if `npm` isn't found.
    *   **The one-click version** (built, switched off): one card showing both commands in full,
        and an **Install and sign in** button. It appears only once Anthropic approves, and a
        setting turns it off.
5.  **Connected.** A check, "Claude Code is connected", and three facts: the version, "Signed in
    to your Claude plan" and "No API key in use". The safety check starts here, shown as a large
    ring with one line on what it proves. After about 2 seconds the ring moves to a small chip at
    the top right ("Safety check, 7 of 25"), and setup carries on. Clicking the chip lists the six
    things being checked, in plain words, with a tick as each one passes.
6.  **Prices.** "Prices come from Massive." Two cards: **Get a free key** (opens massive.com in the
    browser), and **Paste it here**, with a Check button. The check makes one Massive call and
    shows a real number as proof: "Works. SPY closed at $735.59 on Nov 5." The key goes to the
    Keychain and is never shown again. A line explains that the free plan is end-of-day prices at
    5 calls a minute, which is why a first report takes about 20 minutes. Continue waits for a
    working key.
7.  **Economic figures,** marked Optional. The same two cards for a FRED key, with the 10-year
    Treasury yield as proof. **Skip for now** shows "Skipped. Reports will say 'economic figures
    not connected' until you add the key in Settings", and the button becomes Continue without
    it.
8.  **Your email, for SEC.** One field, with the reason: SEC asks every program that downloads its
    filings for a contact email, and Tearsheet sends it only to SEC. Continue checks it looks like
    an email.
9.  **You're set up.** A checklist: Claude Code (connected, with its version), the safety check
    (passed, or a small ring with the calls left), prices, economic figures (or "Skipped. Add the
    key in Settings"), and the SEC email. One line says a first report takes about 20 minutes on
    the free plan, and later reports in the same sector are quicker. **Open Tearsheet** hands over
    to the app: the sidebar opens and the home page fills the middle.

Setup is remembered once finished. If the app quits halfway, it reopens at the first step that
isn't done.

### The home page

*   **It is also New report**, so ⌘N goes there. ⌘K, on this page, puts the cursor in its field;
    elsewhere it opens the look-up box.
*   **Layout:** a small greeting ("Welcome to Tearsheet" the first time, then "Good evening" and
    so on), the heading **Which company today?**, and a large field: "Ticker or company name, like
    NVDA or Nvidia". The toolbar is empty apart from the window buttons.
*   **Typing** searches the bundled S&P 500 list on the Mac, by ticker first and then by name, and
    shows up to five matches with the sector and either "New report" or "Report from Nov 5".
    Return or a click starts the report; the up and down arrows move. A name outside the S&P 500
    says so.
*   **Below the field:**
    *   for a new user, "Try" with four companies, and a line that a first report takes about 20
        minutes and the app says when it's ready;
    *   for a returning user, "Recent" with ticker and price, then **Since you were last here**:
        prices updated (to which close), the next grade due, and anything not connected, each with
        its fix.
*   **Starting a report** replaces the page with the run view: the ring, the five stages and the
    step list. The sidebar adds the company as "writing…", and its status line follows the run.

### When something breaks later

A key that stops working, Claude Code signing out, or a failed safety check shows in two places:

*   at the top of the home page, as a red box with the fix ("Claude Code is signed out. New
    reports can't be written until you sign in again. Your saved reports still open." with **Sign
    in again**, which shows the one Terminal line and notices by itself);
*   in the sidebar's status line, in red.

Saved reports always open, whatever is broken.

### Motion: A. Settle

The same rules as the rest of the app: CSS only, each thing plays once, and nothing moves when
the Mac's Reduce motion setting is on.

*   **Entering a screen:** each part fades up from 10 px below, one after another, about 70 ms
    apart and half a second each.
*   **Leaving a screen:** the content fades and lifts 8 px, in about a quarter of a second.
*   **Changes in place** (a tick, "Works", "Saved"): the new line fades up the same way.
*   **The safety ring** fades out in the middle while the chip fades in at the top right.
*   **Into the app:** setup fades away, the sidebar opens by width, and the home page fades up.
*   **While waiting:** three small dots pulse under the Claude Code icon; spinners are small rings.

### What the setup needs from the engine and the app

*   **The engine:**
    *   check a key with one call (Massive: SPY's latest close; FRED: the latest 10-year yield),
        saving it to the Keychain only if it works;
    *   run the full safety check from the app, with progress after each of its 25 calls;
    *   remember that setup is finished, and which step it reached.
*   **The app:**
    *   detection again every 2 seconds while step 4 is open (the probe's "check again");
    *   open Terminal, and open massive.com and FRED's site in the normal browser;
    *   no new access for the window: these go through the preload bridge as named commands.
*   **Rules kept:** keys never shown, logged or sent to the window after saving; sign-in status
    only from each tool's own status command, never its token files; no command runs on the
    user's behalf until the one-click version is approved and switched on.

### The app icon: 2. Glass

Liam picked the glass tile from the setup mockup over the Fan (Nov 5), then version 2 of four
refined versions in [`app-icon-versions.html`](app-icon-versions.html), published as "Tearsheet
app icon versions".

*   **The drawing:** Apple's 824 continuous-corner square on the 1024 grid. A deep tile shading
    from `#1B2E44` at the top to `#060B14`, light along the top edge, and a soft cyan light low on
    the right. On it, two grey lines of text (`#7487A0`) and a cyan price line (`#8EEFFF`) with a
    faint fill under it. The 16 and 32 px sizes use a simpler drawing: one grey line and a thicker
    price line.
*   **Everywhere:** it replaces the Fan as the Dock and Finder icon (`app/build/icon/`, built with
    `make-icns.sh`), and as the mark on the welcome screen, beside the home page's greeting, and
    in the run view. Nothing in the app still shows the Fan.
*   **Motion:** it fades up like everything else. In the run view, its price line fills in as the
    14 steps finish and completes when the report is ready. The Dock's progress bar and its bounce
    when a report is ready stay as they are.

### My calls in the setup (for Liam to check)

*   Setup happens inside the app window rather than in a separate window.
*   The home page doubles as New report.
*   The safety check shows as a chip during setup, then moves to the sidebar's status line.
*   A skipped key, or a sign-out later, shows on the home page with the fix.
*   The key checks prove themselves with one real number each.

## The chart

*Round two (2026-11-06,
[`docs/superpowers/specs/2026-11-06-chart-round-two-design.md`](../superpowers/specs/2026-11-06-chart-round-two-design.md))
changes several points below:*

*   *The chart opens at Half every time. Narrow, Half, Wide and Full buttons sit in its header.*
*   *A drag line above the volume bars sets the height, and there is a Volume toggle.*
*   *Settings picks the range the chart opens on.*
*   *The report is never reloaded as the chart opens, closes or resizes.*
*   *The line draws in once each time the chart opens, then glides between ranges.*

*The interactive report (2026-11-07,
[`docs/superpowers/specs/2026-11-07-interactive-report-design.md`](../superpowers/specs/2026-11-07-interactive-report-design.md))
builds on it:*

*   *The right-hand panel now shows one view at a time.*
*   *A click on a chart, table, ring or tile in the report opens it there, bigger, with its own
    switches.*
*   *⌘3 still opens the price chart.*

*   **Where it opens.** The Chart button (⌘3) opens the chart from the right as a **split**
    beside the report. A divider sits between them.
*   **Dragging the divider:**
    *   **Limits:** the chart is never narrower than 360 px, and the report never narrower than
        340 px.
    *   **Full:** dragging past the report's limit snaps to Full, which is everything right of the
        sidebar. **Full never covers the sidebar.**
    *   **Half:** there is a soft snap there (within 16 px), and a double-click on the divider
        returns to it.
    *   **Feedback:** the divider shows a grip line, and a small label reads "Half", "Full" or
        "Narrowest" as it snaps.
*   **Beside the chart.** A Numbers / Text switch in the toolbar picks which report column stays.
    It starts on Text. In Full, the report is hidden, and dragging the divider brings it back.
*   **Ranges:** 1W, 1M, 3M, 6M, YTD, 1Y, 5Y and All. There is no 1D, because the free price plan
    is end-of-day only.
    *   **5Y and All, the first time.** The app downloads the company's full price history in one
        call, with a short "downloading" state.
    *   **What they show.** Whatever the plan serves, labelled honestly. That is 5 years today,
        though the plan only promises 2. If less is served, 5Y greys out and All shows what is
        there.
    *   **Compare lines.** The S&P 500 line can run the full length with one more call. The peer
        line stays at the stored 14 months.
*   **What it shows:**
    *   daily closes with volume underneath;
    *   markers for the SEC filings the report read;
    *   the buy-trigger line.
*   **Toggles,** all off at first:
    *   the 12-month range, as a fan ahead of today;
    *   peers, equal-weighted;
    *   the S&P 500.

    With either compare line on, all lines start from 100.
*   **Interaction.** Hover reads a day's price, change and volume. Dragging across measures the
    change between two dates.
*   **The Settings choice: "The chart opens on".** It picks the range the chart opens on, from 1W
    to All. The default is 1Y. (Round two replaced "When the chart opens", which offered Full,
    Half or Where I left it.)

## Motion

Motion is CSS-led, plays once, and is off when the Mac's Reduce motion setting is on. Readouts in
the report appear with no motion.

*   **Opening a report:**
    *   panels rise in turn;
    *   bars grow;
    *   rings draw;
    *   the price line traces, and the fan fades in.
*   **The chart:**
    *   opening slides the split in from the right while the numbers column slides away;
    *   dragging the divider resizes it live;
    *   snapping settles it;
    *   resizing the window or the sidebar moves it with them at once, with no glide, keeping
        its share of the width, as in a Mac app (only a width button, a double-click or an
        arrow key glides the divider);
    *   on range or toggle changes, the lines glide to their new shape in about a third of a
        second. The draw-in plays only as the chart opens (round two).
*   **The sidebar** slides away, and the toolbar shifts to make room for the window buttons.
*   **Switching views** slides the text in, and changing pages makes the content rise.
*   **A run:** the step ring and the sidebar status line advance.
*   **Overlays:** they scale or drop in.

## Shortcuts

All are menu shortcuts, so they work only while Tearsheet is in front.

| Shortcut | Action |
| :-- | :-- |
| ⌘K | Look up a company (on the home page, its own field) |
| ⌘N | New report, which is the home page |
| ⌘1 / ⌘2 | Summary / Full report |
| ⌘3 | Open or close the panel (it opens on the price chart) |
| ⌘[ / ⌘] | Previous / next company |
| ⌃⌘S | Show or hide the sidebar |
| ⌘F | Find in the report |
| ⌘, | Settings |
| ⌘W | Close the window. Tearsheet keeps running, so a report being written carries on; the Dock icon brings the window back as it was. ⌘Q quits. |

## Rules this keeps (Technical Plan §12, items 31, 32, 42, 47)

*   **The report frame.** The report (numbers and text) is still the engine's HTML in an `iframe`
    with `srcdoc` and an empty `sandbox`, with no scripts. Its charts are inline SVG drawn by the
    template.
    *   The Summary / Full switch and the section links work with same-page links and CSS.
    *   The app's ⌘1 / ⌘2 and the Numbers / Text switch reload the report showing that view or
        column. That is an engine render option, and the scroll position resets.
*   **The price chart and the divider** are app UI beside the report frame, not inside it. That
    is why they can be interactive.
*   **Text.** All AI and source text stays escaped plain text.
*   **Security policies.** They do not change. Avenir Next ships with macOS, so no outside fonts
    are used.
*   **App links.** Flag, re-read and open links stay `tearsheet:` links handled by
    `navigation.ts`.
*   **The window.** It stays sandboxed with no Node access. The menus reach the window through
    one new preload event.

### Two deliberate changes, for Liam's OK

1.  **Same-page links in the report.**
    *   **The links.** Inside a `srcdoc` frame, a bare `#id` resolves against the app's own
        address, so app-mode links are written `about:srcdoc#id`. File mode uses plain `#id`.
    *   **The test.** `test_render.py` would allow these same-page links and nothing else.
    *   **`navigation.ts`.** Electron does not send same-page jumps through
        `will-frame-navigate`, so `navigation.ts` is unchanged.
    *   **Fallback.** If the jumps don't stay inside the page in testing, the Summary / Full
        switch moves into the toolbar, and the section links become a list at the top of the
        Full report.
2.  **More from the engine.**
    *   **In the report:** the numbers as numbers, not only as sentences, plus a year of weekly
        prices, the metrics against peer medians, the economic figures and the claim counts.
    *   **New calls:**
        *   the sidebar list, one row per company with its latest price;
        *   a look-up over the S&P 500 list;
        *   the chart's series: daily closes and volume, the peers, and SPY;
        *   a one-call download of a company's full price history, for 5Y and All.

## Settled after the builder check (my calls)

*   **Reports saved before this change** are rendered from what is stored. Prices and metrics
    are kept for every run, so most of the new numbers fill in. Anything missing says "not
    stored for this report", and running the report again gives the full view.
*   **New report** shows the company and the peer-group rule from the bundled list, with no
    network call. The run then starts as it does today.

## Not in this version

*   A light mode.
*   An AI-written summary: a possible later addition, through the same checks.
*   PDF export.
*   A rebuild in Swift.
*   A 1D range: it needs a paid price plan.
*   Pinned reports in the sidebar.
*   A sample report during setup (Liam, Nov 5): nothing shows until the user's own first
    report is done.

## Left to the builder

*   Exact spacing and the order of the minor panels.
*   The wording of the FRED labels.
*   Which eight metrics fill the tiles. The prototype's set is: operating margin, return on
    invested capital, gross profit to assets, interest coverage, free cash flow yield, earnings
    yield, accruals to assets, and cash flow to net income.
*   How file mode shows the report without the app's sidebar and chart. It keeps claim IDs and
    has no `tearsheet:` links.
