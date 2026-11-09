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
*   **Built for someone who has never used Terminal:** plain words, and each row ticks itself
    off. Setup ends with a Start button.
*   **Claude Code and Codex:** an Install button that installs and signs in from inside the app
    (Liam's choice of 2026-11-08, ahead of Anthropic's approval), with the paste command as the
    fallback when the button is off ([first-run-setup.md](./first-run/first-run-setup.md)).
*   **Keys:** a Massive key is required, because there is no rating without prices. The FRED key
    is offered on Home after the first report, and reports say "economic figures not connected"
    until it is added.
*   **The safety check** (the lock-down check, Technical Plan §4) runs in the background while
    setup carries on.
*   **Home:** a Claude-style "Which company today?" field.
*   **No sample report.**
*   **Motion:** A. Settle for every moment (below).

### The first-time path

Since Nov 8 2026, setup is **one screen**, inside the app window with no sidebar. It replaces the
nine screens chosen on Nov 5. The full design is
[`first-run/first-run-setup.md`](first-run/first-run-setup.md), and its mockup, version 6 of the
canvas, is committed as [`first-run/canvas/Spine.dc.html`](first-run/canvas/Spine.dc.html).
Where the notes above or below differ from this section, this section and that design win.

**On top: a list of three rows.** It is always on screen, and each row ticks itself off.

1.  **Your AI.** "Not set up yet", then the progress words while installing, then "Waiting for
    you to sign in", then the Connected pill with the account and plan ("Signed in as you@x.com,
    Claude Max"). With both tools it shows two lines: "Claude Code writes your reports" and "Codex
    checks each draft". While a sign-in waits in the browser, this row also offers "Browser didn't
    open? Open the sign-in page" after 15 seconds, and the paste command after 2 minutes.
2.  **Price key.** Massive, then the masked key and "works", with "Use another key".
3.  **SEC email.** The email in full, with Change.

**Below: one question card at a time,** in this order.

1.  **Connect the AI that writes your reports.** Shown only while no tool is ready.
    *   Three buttons: **Install Claude Code** ("I have a Claude plan"), **Install Codex** ("I have
        a ChatGPT plan") and **Install both** ("I have both plans").
    *   Above them, in small type under "These are the commands Tearsheet runs", are the exact
        commands for all three choices.
    *   Tearsheet runs the official installer, then the tool's own sign-in, which opens claude.ai
        or chatgpt.com in the browser. The card shows the progress words: downloading,
        installing, installed, opening your browser. The person never opens Terminal unless a
        step fails.
    *   A tool that is installed but not ready (signed out, too old, a free plan, an API-key
        sign-in) gets one plain sentence and one button for the missing step.
2.  **Get a free price key.** **Get a free key** opens Massive's sign-up page. Coming back, the key
    field has the focus. The key is checked as soon as it is pasted, then goes to the Keychain.
    While a sign-in waits in the browser, the card has already moved on to this one, so both can
    happen at once.
3.  **The email, then Start.** The email from the Claude sign-in, with Change, or a field to type
    it (Codex doesn't give one). SEC asks every program that downloads its filings for a contact
    email, and no one else gets it. Then one sentence says where data goes (the outside services
    list, Technical Plan §12), and **Start**. Return in the email field also presses Start. Until
    Start can be pressed, it says why: "Waiting for Claude Code to sign in", "Waiting for your
    Massive key" or "Add your email".

**When the button is off, or a step fails.** The card shows one command to paste into Terminal
instead, with **Copy and open Terminal** and a picture of ⌘V. It runs the same steps. Once the copy
works, the card moves on to the price key, and the AI row keeps "Show the command again". The
button has two switches, the build switch and the online off switch (Technical Plan §14).

**The safety check** starts at the person's first click, or on a brand-new Mac the moment the tool
is signed in. It never starts when the window opens. It shows as the chip at the top right, with
"Stop the check". A report asked for meanwhile waits in the line: "Starts when the safety check
finishes (n of 25)".

**Clicks inside the window:** 3 when a tool is already set up, and 4 on a brand-new Mac (5 with
both plans, if the person comes back between the two sign-ins).

**FRED** is no longer part of setup. Home offers it after the first report ("Economic figures
aren't connected").

**Motion:** the list fades in, its ticks draw themselves, each card rises in, and Start pulses
once when it can be pressed. None of it plays when Reduce motion is on.

**Start** saves the tool and the email, then marks setup finished, and Home opens with the
company field focused. If a save fails, setup stays open with what was saved.

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
    in again**, which runs the sign-in from inside the app, or shows the paste command when the
    Install button is off, and notices by itself);
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
*   **The app:** this part is replaced by [first-run-setup.md](./first-run/first-run-setup.md)
    §1 to §3: one status read at a time, never cut off, only while the window is in front; the
    install and sign-in steps from one list, run by the Install button or pasted; and massive.com
    and FRED's site opened in the normal browser. The window still gets no new access: everything
    goes through the preload bridge as named calls.
*   **Rules kept:** keys never shown, logged or sent to the window after saving; sign-in status
    only from each tool's own status command, never its token files; the commands are shown in
    full before they run.

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

### Key numbers, under the chart (2026-11-09)

Liam picked design 4, "Groups you open and close", from five table layouts on the key-numbers
canvas, then the recommendation on each of three questions.

*   **Where.** In the price chart's panel, directly under the chart. The panel scrolls: the chart
    keeps the panel's full height, exactly as before, and you scroll down to reach the table. Other
    views in the panel don't have it.
*   **The four groups,** each a header row (arrow, name in small capitals, a one-line summary on
    the right) that opens and closes its rows:
    *   **Price and trading:** price, day's move, 52-week range, 12-month return, average daily
        volume (the last 63 sessions);
    *   **Size and value:** market value, enterprise value, P/E, EV/EBITDA, EV/sales;
    *   **Profit and cash:** revenue, operating margin, free cash flow, free cash flow yield,
        return on equity;
    *   **Debt and safety:** net debt, net debt/EBITDA, interest cover, cash flow/profit, return
        on capital.
*   **Each row:** the number's name, the company's value, and "Peers X" (the median of the
    report's peers) where there is one. The day's move and the 12-month return are green or red.
    A source line closes the table: prices from Massive, figures from SEC filings, peers the
    median of the report's peers (for the 12-month return, the report's equal-weighted peer
    group return).
*   **Where each number comes from.** Nothing is worked out afresh or stored anew; the engine's
    `key_numbers.py` reads what is already there. Price and day's move are the top bar's
    (`report_numbers.bar_numbers`), so they are the last close Tearsheet has. The 52-week range
    and volume come from the stored daily prices, split-adjusted. The 12-month return is the
    report's own line. Everything else is the run's stored metrics and the inputs each one kept
    (`metrics.inputs_json`), for the company and each peer; P/E, EV/EBITDA and EV/sales are those
    inputs divided the other way up. They are at the report's price date, which the working says.
*   **A number that can't be filled** shows a dash and why in a few words: "not for banks" (and
    insurers, where the report leaves the measure out), "no profit", "EBITDA below zero", "no
    interest found", "under a year stored", "not stored". It is never estimated.
*   **The working.** Clicking a row (or Return on it) opens its working underneath in plain words,
    from the stored inputs: "The price, $530.61, ÷ diluted earnings per share over the past 12
    months, $19.15: 27.7×. The peer median is 29.3×, across 38 peers with a profit."
*   **The summaries** follow fixed rules from the rows, never the AI: the price and the year's
    move; the market value and how many of P/E, EV/EBITDA and EV/sales are below the peers'
    ("cheaper than peers on 2 of 3"); revenue and how many of operating margin, free cash flow
    yield and return on equity are above the peers'; net debt (or net cash) and whether net
    debt/EBITDA is above or below the peers' ("more debt than peers"). An even split names both
    ("below peers on 1 of 3, above on 1").
*   **Open and closed.** Price and trading and Size and value start open. What Liam opens and
    closes is kept (`chart.keyGroups` in the window's storage) and used for every report.
*   **Keyboard.** Group headers and rows are buttons with `aria-expanded`; Tab reaches them, and
    Return or Space opens and closes them.
*   **Motion.** The arrow turns and the rows settle in; nothing moves under Reduce motion.
*   **In the PDF.** The same table, every group open, sits in page 1's sidebar as Exhibit 4 (the
    later exhibits count on from 5). With it there, the sidebar's "12-month low–high" line and
    small 12-month return table give way to its 52-week range and 12-month return, so page 1
    still fits; the S&P 500's return stays in the PDF's numbers section.

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
