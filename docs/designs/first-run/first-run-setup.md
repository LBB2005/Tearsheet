# Fewest-click first run for Tearsheet

*   **Author:** Liam Blackshaw-Brown (drafted with Claude)
*   **Status:** Proposed (every section approved by the owner on 2026-11-08; not yet through
    `/egm-review`)
*   **Date:** 2026-11-08
*   **Drafted from:** [concepts_brief.md](./concepts_brief.md) and [clicks-today.md](./clicks-today.md)

--------------------------------------------------------------------------------

## Overview

Tearsheet is a personal macOS app. It turns an S&P 500 ticker into one cited research report. The
report is written by the person's own Claude Code or Codex command-line tool, on that person's own
paid plan. Data keys stay in the macOS Keychain.

This design covers everything between "someone has the download link" and "their first report has
started":

1.  **Stage 0. Make today's setup finishable.** On a brand-new Mac the current screens cannot be
    finished at all. Fix the two Terminal lines, the sign-in check and the first report.
2.  **Stage 1. A safe way to test it.** The owner can try the brand-new-user path on his own Mac
    without his real keys, tools or sign-ins being touched.
3.  **Stage 2. One setup screen.** It replaces the nine screens. It fills in what it can find by
    itself and asks only for what it can't.
4.  **Stage 3. A private download link.** A private GitHub release with a DMG and a zip, plus written
    steps for opening an app that Apple has not signed.

The fixed rules are:
*   **Every copy has an Install button** (owner's choice, 2026-11-08). It runs the official
    installer, then the sign-in command, which opens claude.ai or chatgpt.com in the browser. The
    person never pastes anything into Terminal. "Install both" does Claude Code and Codex one after
    the other.
*   **This goes ahead of Anthropic's approval, by the owner's choice.** Anthropic's documentation
    says third-party products may not offer claude.ai sign-in without its approval. The owner
    chose to give the button to himself and a few friends who test the private link now, and to
    ask Anthropic before launch. If Anthropic says no, one switch puts the paste line in the same
    spot on the screen. That fallback is built and tested in this design, not left for later.
    OpenAI's terms for Codex are still unchecked.
*   **Tearsheet never reads Claude Code's or Codex's credential files.** It asks each tool's own
    status command.

## The Problem

**Today's setup takes 13 clicks inside Tearsheet's window when Claude Code is already set up.**
That is 9 screens. Six of those clicks only move past a screen: Welcome, How it works, Connected,
the two FRED skip buttons and You're set up. The person's real job is two things: pasting a free
Massive price key and confirming an email. Most of the rest is Tearsheet's own steps.

**On a brand-new Mac, setup cannot be finished.** It takes about 20 clicks inside the window and
about 45 to 50 from the link. Then it stops:
*   **Claude Code.** Its installer puts `claude` in `~/.local/bin`, a folder a new Terminal window
    does not search. So the screen's next line, `claude auth login`, answers "command not found".
    Tearsheet itself looks in that folder, so the screen says "Installed" just before the line fails.
*   **Codex.** The screen's line is `npm install -g @openai/codex`. A new Mac has no npm. The
    nodejs.org install it points to then fails with a permission error.

**Five quieter faults make it worse:**
*   **The first report is turned away.** The engine refuses to start a report while the 25-call
    safety check runs, which takes about 3 minutes or more. Today the nine screens cover that wait.
    Once setup is short, the first ticker the person types is refused.
*   **Checking the sign-in could sign the person out.** Tearsheet runs `claude auth status` every 2
    seconds and kills it after 5. Claude Code's own changelog records sign-outs when that command is
    cut off partway through a token refresh. The owner runs several Claude Code sessions at once, so
    a sign-out would reach all of them.
*   **"Can't tell" looks like "signed out".** A slow answer, an older Claude Code without the `auth`
    command, or a change in its output all read as signed out. The screen then tells someone who is
    signed in to install and sign in again. With an old copy, it waits on "Waiting for you to sign
    in" for ever.
*   **"Signed in" is not checked against a plan.** A free claude.ai account, a Console API-key
    sign-in and a Codex API-key sign-in all count as ready. The person learns otherwise only when
    the safety check fails, after they think they are done.
*   **Nothing is written down when setup fails.** The window's side of setup keeps no log. A
    timeout, a crash and a sign-out all look the same afterwards.

**There is no link to download, and no safe way to test.**
*   The build is made for "the Mac it was built on" only. There is no release, no DMG and no
    first-open instructions.
*   A test copy on the owner's Mac shares his real Keychain entries and always finds his real tools.
    It skips the key step because his key is already saved. If a test key is pasted, it replaces
    his real one. Pasting the real Terminal line would update his Claude Code and sign him in again.

**Why it matters.** The owner's own rule: if one app does the job in 3 clicks and another in 20, the
person picks the first. A setup that cannot be finished loses everyone who isn't the owner.

## Goals

Each goal says how it is checked.

1.  **Few clicks inside Tearsheet's window.**
    *   Every click in the window counts, including the click that brings it back to the front.
        Keys (⌘Tab, ⌘V, Return) and typing don't count.
    *   At most **3 clicks** when Claude Code or Codex is already installed and signed in to a plan.
    *   At most **4 clicks** on a brand-new Mac, for either tool.
    *   *Checked by:* automated click-count tests, one for each journey CUJ 1 to CUJ 4, that fail
        when the count goes over.
2.  **A brand-new Mac can finish.** Someone who has never used Terminal can reach a started first
    report with either tool, using only what the screen says.
    *   *Checked by:* one real run on a second macOS user account that has no tools installed.
3.  **Reading the sign-in never signs anyone out.**
    *   *Checked by:* before and after every test, `loggedIn` and `orgId` from
        `claude auth status --json` and the output of `codex login status` are unchanged.
4.  **The first report is never refused because of setup.** A report asked for during the safety
    check waits in line and says how far the check has got. If the check fails, the waiting report
    says why in the same place.
    *   *Checked by:* an engine test that starts a report during a check and gets it queued, not
        refused.
5.  **Nothing is spent on the person's plan before they click something.** The safety check starts
    at their first click in setup, never when the window opens.
    *   *Checked by:* a test that opens setup and confirms no AI call is made.
6.  **The person knows what they agreed to before they finish.** Before the finishing step, the
    screen shows:
    *   which tool and plan will be used, and when a second tool is also used to check drafts;
    *   the email that SEC will receive, with a way to change it;
    *   where data goes: Anthropic or OpenAI for text, SEC for the email, Massive for the key and
        price requests.
    *   *Checked by:* the CUJ tests assert this text is on screen before the finish.
7.  **The owner can test the brand-new path on his own Mac without anything of his changing.**
    His Keychain entries, sign-ins, installed tools and data folder are the same afterwards.
    *   *Checked by:* the same before-and-after compare as goal 3, plus a check that the test copy
        never read or wrote the real Keychain service.
8.  **A private download link that opens.** The owner can download the DMG or the zip from a
    private GitHub release in a browser and reach the setup screen on macOS 27.2 by following the
    written first-open steps.
    *   *Checked by:* the real run in goal 2 starts from the browser download.
9.  **Every setup failure leaves a record, with no personal data in it.**
    *   *Checked by:* tests that run each failure (tool missing, timeout, signed out, copy failed,
        key rejected) and find one line for each in `setup.log`, with no email, key or account ID.

## Non-Goals

*   **Typing into the person's own Terminal.** The Install button runs its commands inside
    Tearsheet. The paste line, kept for a "no" from Anthropic, is pasted by the person.
*   **Reading Claude Code's or Codex's credential files.**
*   **Apple Developer ID signing, notarization and auto-update.** These are the planned way to
    remove the macOS block and the Keychain prompts that each new build brings. Until then each
    update costs those prompts again, and that is accepted.
*   **Intel Macs.** The build is Apple Silicon only. The first-open steps say how to check.
*   **A public launch.** The link stays private: the owner and a few friends who test it. A public
    launch waits on Anthropic's and OpenAI's answers, for the button and for Tearsheet using
    people's plans at all.
*   **Removing the Massive key.** Its sign-up clicks happen on massive.com, outside the window.
*   **Cutting clicks outside the window,** beyond clearer instructions and links that go straight to
    the right page.
*   **The FRED key during setup.** It is offered after the first report, using Home's existing
    "Economic figures aren't connected" prompt.
*   **An API-key option in setup.** Settings keeps the owner's existing billing setting.
*   **A feature flag for the new screen.** It replaces the old screens. Backing out is a git revert.
*   **A CI release workflow.** One local script builds and uploads.

## Open Questions

Facts the code depends on. For each one, the plan must give a safe default for an unexpected
answer, so building never waits on it.

*   **The safety check's share of a 5-hour usage window**, on Claude and on Codex. Measuring it
    means running a real 25-call check on the owner's plan. The engine already records each call's
    rate-limit reading (`CallRecord.rate_limit`), so the first check run in Stage 1's test gives the
    number.
*   **What `subscriptionType` says** for Free, Pro, Max, Team and Enterprise. Needed to tell a paid
    plan from a free one (D4).
*   **What a Massive key looks like**, and which massive.com page shows it. Needed to check a paste
    before sending it to Massive.
*   **Whether `claude auth status --json` always includes `email`.** It is seen on the owner's Mac
    but not documented.
*   **Whether `codex login status` can refresh tokens like Claude's status command does**, and its
    exit codes on version 0.165.
*   **Whether Claude Code's own install step always uses `~/.local/bin`.** Only the changelog says
    so. The full-path Terminal line depends on it.
*   **Whether macOS blocks `Tearsheet Engine` separately** in a copy downloaded through a browser.
*   **Whether an ad-hoc-signed zip shows "damaged"** after it is unzipped on macOS 27.2.
*   **How long Open Anyway stays in System Settings** after a block. About an hour is a
    recollection, not checked.
*   **Whether Claude Code's macOS sign-in depends on `HOME`.** This matters for any test that points
    `HOME` somewhere else.
*   **Anthropic's answer** on the Install button, and on Tearsheet using people's Claude plans at
    all. The owner asks before launch. **OpenAI's answer** for Codex likewise.
*   **Whether `open -a Terminal ~` always opens a new window.** Only the paste-line fallback needs
    it.

## Critical User Journeys (CUJs)

Click counts follow goal 1's rule. The click-count tests are written from these.

### CUJ 1: Claude Code already set up

*   **Given**: Claude Code is installed and signed in to a paid Claude plan. Tearsheet has never
    been opened. There is no Massive key.
*   **When**: The person opens Tearsheet, gets a free Massive key, pastes it, and finishes.
*   **Then**: Setup shows "Signed in as you@x.com, Claude Max" and the email with Change, without a
    click. The first report starts within 3 clicks. The safety check began at the first click, and
    the report waits for it with "Starts when the safety check finishes (n of 25)".

### CUJ 2: Brand-new Mac, Claude plan

*   **Given**: No Claude Code, no Codex, no npm. The person has a paid Claude plan.
*   **When**: They copy one line, paste it into a new Terminal window, sign in at claude.ai, come
    back, get a Massive key, paste it, and finish.
*   **Then**: The line installs and signs in using the full path, so it is never "command not
    found". If the download fails, the line stops with that error instead of a misleading one.
    The screen notices the sign-in when the window comes back. The first report starts within 4
    clicks.
*   **With the Install button (every copy for now)**: the button takes the place of the line.
    Tearsheet runs the same two commands and shows their progress in the window. Only the claude.ai
    sign-in happens outside, in the browser. Still within 4 clicks: the button removes Terminal,
    not a click.

### CUJ 3: Only Codex, already set up

*   **Given**: Codex is installed and signed in with ChatGPT. There is no Claude Code.
*   **When**: The person opens Tearsheet.
*   **Then**: Setup picks Codex by itself and never says Claude Code is missing. It asks for the
    email because Codex does not provide one. The first report starts within 3 clicks, plus
    typing the email.

### CUJ 4: Brand-new Mac, ChatGPT plan

*   **Given**: No tools and no npm. The person has a paid ChatGPT plan.
*   **When**: They choose the ChatGPT line, paste it into Terminal, sign in, come back, add the key
    and the email, and finish.
*   **Then**: The line is the official installer with its questions turned off, so Codex does not
    open itself before signing in. No Node.js is needed. The first report starts within 4 clicks.

### CUJ 4b: Brand-new Mac, both plans

*   **Given**: No tools. The person pays for a Claude plan and a ChatGPT plan.
*   **When**: They press Install both, sign in to Claude and then to ChatGPT in the browser, come
    back, add the key, and finish.
*   **Then**: Both tools install one after the other, then both sign-ins run one after the other.
    The list shows two connected rows: "Claude Code writes your reports" and "Codex checks each
    draft". The first report waits only for Claude Code's safety check. Codex's check runs after
    that report, and Claude Code checks its own drafts until Codex's check passes. Within 4 clicks.

### CUJ 5: Installed, but not ready

*   **Given**: The tool is installed but signed out, too old (Claude Code before 2.1.41), on a free
    plan, signed in with an API key, or not answering.
*   **When**: The person opens setup.
*   **Then**: Each case gets its own plain sentence and its own line:
    *   **Signed out:** sign in with the path that was found. No reinstall.
    *   **Too old:** update.
    *   **Free plan:** a paid plan is needed.
    *   **API key:** sign in with your plan account.
    *   **Not answering:** "Checking your Claude sign-in" and a retry, never an install line.

### CUJ 6: The first report during the safety check

*   **Given**: Setup has just finished and the safety check is at 8 of 25.
*   **When**: The person asks for a report.
*   **Then**: The report joins the line and shows the check's progress. The safety chip has "Stop
    the check". If the check fails or is stopped, the waiting report says why and offers "Run it
    again".

### CUJ 7: The owner tests the brand-new path on his own Mac

*   **Given**: The owner's real Tearsheet may be open and running reports. His Claude Code and Codex
    are signed in.
*   **When**: He starts a test copy with the test switches, and plays each state of the stand-in
    (missing, signed out, signed in, too old, usage limit).
*   **Then**: The test copy uses its own Keychain service name and data folder. The copy button
    copies the stand-in's line, never the real installer. The safety check makes real calls through
    his real Claude Code, but nothing signs in or out. His keys, sign-ins and real app are
    unchanged afterwards.

### CUJ 8: Downloading the private link

*   **Given**: The owner has the private release link on a Mac with Apple Silicon and macOS 27.2.
*   **When**: He downloads the DMG (or the zip), opens it, moves Tearsheet to Applications, and
    opens it.
*   **Then**: The first-open steps, in the release notes and in the DMG window, take him past macOS's
    block: "Click Done, not Move to Trash", then Privacy & Security, then Open Anyway. They also
    cover a "damaged" message and a second box for `Tearsheet Engine`. The setup screen appears. If
    macOS stops the engine, the app shows a plain error with those steps instead of restarting it
    without end.

### CUJ 9: The owner's existing install

*   **Given**: The owner's real install has `setup_done` set and reports in its database.
*   **When**: He updates to the new build.
*   **Then**: Home opens as before. Setup does not run again. No setting is lost.

## Technical Plan (Architecture)

The screen is **version 6** on the design canvas
(https://claude.ai/artifact/EgihdYmRw8Pw61kRSrjL7W): a short list of three rows on top (Your AI,
Price key, SEC email), and under it one question at a time (connect the AI, then the price key,
then the email and Start).

### How the pieces fit

```text
 ┌─────────────────────────── Window (renderer) ───────────────────────────┐
 │  Setup screen, version 6                                                │
 │    four small state machines: tool · key · email · safety check         │
 │    screenView(...) decides what shows, where focus goes, if Start works │
 │  Home: a report asked for during the check joins the line               │
 └───────┬──────────────────────────────────────────────────────▲──────────┘
         │ fixed, named calls (no command text ever comes from the window)
         ▼                                                      │ pushed events
 ┌─────────────────────────── Main process ────────────────────┴───────────┐
 │  toolWatch   reads each tool's status, one read at a time → tools_changed│
 │  installer   runs the fixed install and sign-in commands → install_progress
 │  lines       builds the paste line (the fallback, and Home's sign-in)    │
 │  terminal    copies a line and opens a new Terminal window (fallback)    │
 │  setupLog    logs/setup.log, with no email, key or account ID            │
 └───────┬─────────────────────────────────────────────────────────────────┘
         │ JSON-RPC over standard input and output (as today)
         ▼
 ┌─────────────────────────── Engine ──────────────────────────────────────┐
 │  complete_setup · cancel_safety_check · set_tool_paths   (new methods)  │
 │  the line waits for the safety check, and pauses if it fails            │
 │  test switches: Keychain name, SEC rate, program paths that must exist  │
 └─────────────────────────────────────────────────────────────────────────┘
```

### 1. Reading the tools (Stage 0)

*   **One owner.** A new main-process module, `toolWatch`, does every status read. It runs one read
    at a time and gives every caller the same answer. The window stops polling. Setup and Home
    listen for a `tools_changed` event and ask for a fresh read when the window comes to the
    front.
*   **When it reads.** Only while the window is in front and the screen is waiting on the person:
    at most every 5 seconds, and once each time the window comes back (D3a).
*   **Never cut off.** A status command is never killed partway through. A read that takes over 60
    seconds counts as "can't tell". This removes the sign-out risk the changelog describes.
*   **What it reads.** Standard output only, never standard error. For Claude Code it reads
    `loggedIn`, `authMethod`, `apiProvider`, `subscriptionType`, `email`, and whether an
    organisation is present. For Codex it reads the one status line.
*   **One answer per tool.** Each tool's status becomes one of: missing, too old (Claude Code before
    2.1.41), can't tell, signed out, signed in with an API key, free plan, or ready. The window
    shows a sentence for each. "Can't tell" never shows an install or sign-in.
*   **Safe defaults for the unknowns.**
    *   A `subscriptionType` value Tearsheet doesn't know counts as ready, and its code is logged.
    *   A missing `email` gives a field to type in.
*   **One picture of a tool.** `ToolStatus` is written once, in a shared file used by both the
    main process and the window, instead of twice as today.
*   **The engine follows changes.** When a tool's path changes (installed after launch, or moved),
    the main process sends the engine the new paths with a new `set_tool_paths` method. That method
    isn't on the window's list of allowed calls. The engine is never restarted for this, so a
    running report is safe.
*   **Which tool writes.** One function, `pickTool`, used by Setup and by the app: the saved
    `primary_tool` if it is ready, otherwise the first ready tool, Claude Code before Codex.
    The pick is saved when setup finishes.

### 2. Installing from inside the app (Stages 0 and 2)

*   **Fixed recipes.** A new main-process module, `installer`, holds two recipes, for Claude Code
    and for Codex. Each has an install command (the official installer, and for Codex
    `CODEX_NON_INTERACTIVE=1` so it asks no questions) and a sign-in command, by full path. The
    window can only say which recipe to run, never what to run.
*   **How a recipe runs.** The install command runs in a shell with `pipefail` on, so a failed
    download stops the recipe with the download's error. Both installers are made to run piped
    (`curl … | sh`), so they need no terminal.
*   **The sign-in needs no terminal** (checked 2026-11-08).
    *   **Claude Code.** `claude auth login` (2.1.317, read from the installed program) writes plain
        lines, opens the browser itself, and waits for the browser to hand the sign-in back to a
        local address. It asks for a pasted code only when its input is a real terminal and that
        hand-back fails. Tearsheet runs it with its input closed. The sign-in is done when it
        prints "Login successful." and exits 0.
    *   **Codex.** `codex login` (0.165.0, from OpenAI's published code at the `rust-v0.165.0` tag)
        starts a local sign-in page and opens the browser. When done, it prints "Successfully
        logged in" and exits 0. Only its API-key and access-token sign-ins look for a terminal,
        and Tearsheet uses neither.
    *   **`codex login` signs out first.** It clears any existing Codex sign-in before it starts.
        So Tearsheet runs it only when Codex reads as signed out, never on a signed-in Codex.
    *   **Output is cleaned before it is read.** Claude Code wraps its sign-in link in terminal
        link codes, and Tearsheet strips these codes from all output.
    *   **A sign-in the person gives up on can be stopped from the window.** Stopping it is safe:
        neither command saves a sign-in before it succeeds, and Codex is only run when already
        signed out.
*   **Progress.** Output becomes plain steps in the window: downloading, installing, installed,
    opening your browser. Sign-in links are never shown or logged.
*   **Install both.** Claude Code installs, then Codex, then Claude Code's sign-in, then Codex's,
    one at a time.
*   **Only what is missing.**
    *   **Installed but signed out:** the button runs only the sign-in.
    *   **Too old:** it runs the installer again, which updates the tool.
*   **When something fails.** The question card says what failed in plain words and offers Try
    again. It also shows the paste line, so the person is never stuck.
*   **The one switch.** A build setting, `INSTALL_BUTTON`, is on for now in every copy. Turned off,
    the window shows the paste line in the same spot, and the main process doesn't accept install
    calls at all. Both states have click-count tests, so a "no" from Anthropic is one change.
*   **Home's "Sign in again"** uses the same recipe when the switch is on, and the paste line when
    it is off.

### 3. The paste line, kept as the fallback (Stage 0)

*   **One line builder.** A new main-process module, `lines`, builds the line from the tool's
    status and one install-folder constant (`~/.local/bin`). The PATH fallback
    (`loginShellPath.ts`) uses the same constant.
    *   **Missing:** install, then sign in by full path, with `pipefail`.
    *   **Signed out:** the found path plus sign-in.
    *   **Both:** both installs, then both sign-ins.
*   **Copy and open.** One main-process call writes the line with Electron's clipboard, reads it
    back to make sure, then opens a new Terminal window (`open -a Terminal` on the home folder),
    never an existing one. It tells the window if the copy failed.

### 4. The setup screen (Stage 2)

*   **Layout (version 6).** The three-row list sits on top, and under it one question card at a
    time: connect the AI, then the price key, then the email and Start.
    *   When both tools are connected, the AI row shows two lines: "Claude Code writes your reports"
        and "Codex checks each draft".
    *   While a sign-in waits in the browser, the card moves on to the price key, so the person can
        do both at once.
*   **State.** Four pure state machines (tool, key, email, safety check) and one `screenView`
    function decide what shows. The component only connects events to them. This replaces the
    nine-step code instead of adapting it.
*   **The price key.**
    *   It is checked as soon as it is pasted. A local check first turns away anything that is
        clearly not a key (spaces, a `curl` or `http` line, an `@`), with words saying so.
    *   One check runs at a time, and only the latest answer counts.
    *   A rejected key is cleared, the field shows a short masked view, and "Try again" appears
        when Massive can't be reached.
*   **Focus.**
    *   The window takes the first click (`acceptFirstMouse`), so the click that brings it back also
        presses the button under it.
    *   After a trip to massive.com, the key field gets the focus, if the key is still missing and
        the person hasn't focused anything else.
*   **The email.** It is filled in from Claude Code's status when none is saved, shown in full with
    Change, and saved only at Start, with where it came from (`email_source`). Codex users type it.
*   **Start.**
    *   One new engine method, `complete_setup`, checks everything and saves the tool, the email,
        where the email came from and `setup_done` in one go.
    *   Home then opens with the company field focused.
*   **What is deleted.** The nine-step screens and their code: Welcome, How it works, Looking for,
    Install, Connected, Ready, the old switched-off one-click screen, the npm line and the
    nodejs.org link.
    *   The parts other pages use (safety state, tool words, small helpers) move out of `steps.ts`
        first, so nothing else breaks.

### 5. The first report and the safety check (Stage 0)

*   **When it starts.** The check starts at the person's first click once a tool is ready: Install,
    or "Get a free key". It never starts when the window opens.
*   **The first report waits instead of being refused.** If a check is running, Home adds the report
    to the existing line, which already waits for the check. It says "Starts when the safety check
    finishes (n of 25)".
*   **Stop the check.** A new engine method, `cancel_safety_check`, backs the chip's "Stop the
    check".
*   **Progress survives a reload.** The engine keeps the running check's progress and sends it with
    the settings. A window that reloads mid-check shows the real count, not "0 of 25".
*   **A failed or stopped check pauses the line.** If the check fails or is stopped while a report
    waits, the engine pauses the line with the reason, and the waiting report shows it with "Run it
    again". A check that later passes lets the line carry on.
*   **Two tools.** The checker tool is used only once its own full check has passed for its
    version.
    *   Its check runs after the first report ends.
    *   Until then the writer checks its own drafts, as it does today with one tool.

### 6. Testing the new-user path on the owner's Mac (Stage 1)

*   **Test switches.** Each is set only by a test launch, never by the app:
    *   a test Keychain name (`TEARSHEET_KEYCHAIN_SERVICE`), so his real Massive key is never seen
        or replaced;
    *   a separate data folder;
    *   a lower SEC rate (`TEARSHEET_SEC_RATE`), so a test copy beside the real app stays under
        SEC's limit;
    *   tool paths the engine checks actually exist.
*   **Stand-ins.** With `TEARSHEET_TEST_TOOLS` set, the installer's recipes and the paste lines
    point at stand-in scripts in a test folder instead of the real installers.
    *   The stand-in "installs" by putting a small script in the test folder.
    *   It "signs in" by changing a state file.
    *   It answers the version and status reads itself, and hands every other command to the real
        Claude Code or Codex.

    So the safety check makes real calls and proves the connection works, while nothing touches
    the real sign-ins.
*   **One launch script** starts such a test copy. It compares the real tools' sign-in status
    before and after.
*   **Click-count tests** in `Setup.test.tsx` cover every journey (CUJ 1 to 4b), with the switch on
    and off, and fail when a count goes over.

### 7. Logs (Stage 0)

*   **The setup log.** A new main-process module writes `logs/setup.log` with one timestamped line
    per event:
    *   where the PATH came from;
    *   each status read: path, exit code, time taken, and the status it turned into;
    *   each install step;
    *   copy and Terminal results;
    *   key-check codes;
    *   screen changes.
*   **The window's events.** The window sends its events through one call, which accepts only known
    event names and fields.
*   **No personal data.** The log never holds an email, a key, an account ID or a tool's raw output.
*   **The engine's side.** The engine log gets timestamps, and the app's safety check writes its
    report file as the command-line check already does.
*   **Show log in Finder.** Settings has this button next to the AI tools, so the log is easy to
    find and send.

### 8. The private download (Stage 3)

*   **One local release script** does the whole release:
    *   it builds the engine and the app;
    *   it makes the DMG with macOS's own `hdiutil`: the app, a link to Applications, and "How to
        open Tearsheet.txt";
    *   it makes the zip with `ditto`, then checks the unzipped copy's signature;
    *   it writes SHA-256 checksums and the release notes with the first-open steps;
    *   its summary says "Install button: on. Anthropic approval: not yet".
*   **Nothing goes up without a yes.** It asks before creating the release and before each upload.
*   **Engine restarts are capped.** If macOS stops the engine, the app restarts it at most 3 times
    in 30 seconds. After that it shows the error with the first-open steps.
*   **The real test.** One real run from a browser download, on a second macOS account the owner
    creates.

### 9. Data, compatibility and backing out

*   **What's new in the data.**
    *   one setting, `email_source`;
    *   three engine methods: `complete_setup`, `cancel_safety_check` and `set_tool_paths`;
    *   the window's events `tools_changed` and `install_progress`.
*   **Shared definitions.** The engine's protocol file and the window's copy of it are regenerated
    together.
*   **No database change.** An install that is already set up opens on Home as before.
*   **The old FRED-skip setting** is still read but no longer written.
*   **Backing out** is a git revert of each stage.

## Alternatives Considered

The brainstorm (`concepts_brief.md`, Alternatives Weighed) and the drafting decisions of
2026-11-08 together. Each row says what was given up and why.

### The shape of setup

| Alternative | For it | Against it | Why not chosen |
| :-- | :-- | :-- | :-- |
| Keep the nine screens and fix only what is broken | Little new code. Makes the brand-new path finishable fast. | Still nine screens, and about 13 clicks when Claude Code is set up. | Not dropped: its fixes that outlive the old screens (the lines, the status reads, the first report waiting) are Stage 0. It is not the end state. |
| The other eight layouts on the canvas (checklist, steps across, one thing at a time, found and left to do, ring, and mixes 7 to 9) | Each reached the click targets. | Each was less clear to the owner than version 6. | The owner tried them and picked version 6. |
| Finish by typing the first company and pressing Return | One click fewer on every path. | Setup has to carry Home's search box. The first report, which becomes an official prediction, starts the moment setup ends. Someone not ready to pick needs a way out, which costs the click back. | The owner chose a Start button. |
| Leave by itself once the key works, with no finish | No finishing click. | The email shown for SEC could disappear before it is read. There is no clear end point to test. | Breaks goal 6 and the click-count tests. |
| Adapt the nine-step state machine to one screen | Reuses tested code. | Most of it has no job on one screen. | Replaced instead: the shared parts move out and the rest is deleted. |
| A feature flag for the new screen | The old screens stay a click away. | Two setups to keep working in a one-person app. | A git revert backs it out. |

### Installing and signing in

| Alternative | For it | Against it | Why not chosen |
| :-- | :-- | :-- | :-- |
| Only the paste line, for everyone | Within Anthropic's rule today, with no approval needed. | Terminal, ⌘V, Return, and a confusing PATH note. | The owner wants no Terminal. It stays as the fallback behind one switch. |
| The Install button only in the owner's own builds, or also in his private download, or behind a hidden setting | Keeps the button away from friends until Anthropic answers. | Friends would test a different setup from the one meant to ship. | The owner chose the button in every copy for now, and to ask Anthropic before launch. |
| A real terminal inside the app | Shows the exact output. | Needs an extra native add-on in the build. The person never types into it. | A progress panel says enough, and the sign-ins need no terminal (checked). |
| Running the sign-ins through macOS's `script` command to give them a terminal | Would cover a sign-in that needed one. | An extra step for no gain. | Not needed: both sign-ins work with no terminal. |
| The bare `claude auth login` line | Short. | A new Mac's Terminal can't find it, because `~/.local/bin` isn't on its PATH. | Replaced by the full path. |
| `npm install -g @openai/codex` | Was Codex's documented line. | A new Mac has no npm. Node from nodejs.org then gives a permission error. | Replaced by the official curl installer. |
| The Codex curl line without `CODEX_NON_INTERACTIVE=1` | OpenAI's plain line. | Its "Start Codex now?" question can open Codex before the sign-in. | The setting turns the questions off. |
| One fixed install-and-sign-in line for every state | One line to maintain. | Reinstalling just to sign in can change the version, throw away a passed check, and leave two copies. | Each state gets its own line, or the button runs only the missing step. |
| Reading the tools' credential files | A quicker answer. | Touches files that belong to Claude Code and Codex. | Ruled out by the owner. The status commands give the same answer. |

### Both plans

| Alternative | For it | Against it | Why not chosen |
| :-- | :-- | :-- | :-- |
| Install one tool now, and offer the other on Home after the first report | Setup stays as short as possible. | The person sets up twice. | The owner chose Install both in setup. |
| Only ever install one tool | Simplest. | Someone with both plans loses Codex checking each draft. | The owner chose Install both. |
| Run Codex's full safety check before the first report | Codex checks the first report too. | Checks run one at a time, so the first report waits about 6 minutes instead of 3. | Codex's check runs right after the first report. |
| Let Codex check drafts after only the 5-call short check | Codex helps from the first report. | A weaker check than every later report gets. | Codex checks drafts only after its full check passes. |
| Pick the writing tool by what is installed, as `choose_tool` does today | Already built. | A signed-out Claude Code is picked over a signed-in Codex. | `pickTool` picks by sign-in first. |

### The safety check and the tools

| Alternative | For it | Against it | Why not chosen |
| :-- | :-- | :-- | :-- |
| Refuse reports while the check runs, as today | No change. | A short setup ends with the first ticker turned away. | The report joins the line and waits. |
| The 5-call short check for the first report | The first report starts sooner. | It skips the link and web-search probes, a weaker guarantee than every later report. | The first report waits for the full check (D1). |
| Start the check as soon as the window opens | Done sooner. | Spends 25 calls of the person's plan before they click anything. | It starts at the first click. |
| Read the sign-in status every 2 seconds and cut it off after 5 | Notices a sign-in quickly. | Claude Code's changelog ties sign-outs to that command being cut off mid-refresh. | One read at a time, never cut off, only while the window is in front. |
| Restart the engine when a tool's path changes, or send the path with each request | Simple to reason about. | A restart kills a running report. A per-request path doesn't reach the line's reports. | `set_tool_paths` updates the engine in place. |

### Testing and the release

| Alternative | For it | Against it | Why not chosen |
| :-- | :-- | :-- | :-- |
| Test with only a fresh data folder | Nothing new to build. | The Keychain is shared: the key step is skipped, and a pasted key replaces the real one. | Test switches plus stand-ins. |
| Paste the real install line on the owner's account | The most real test. | Updates his Claude Code and signs him in again. | Done once on a second macOS account instead. |
| A macOS virtual machine instead of a second account | Fully separate. | More setup for the same answer. | A second account is enough. |
| electron-builder's DMG target | Standard. | It downloads an extra program, and the build is set up to avoid downloads. | `hdiutil` and `ditto`, both part of macOS. |
| A CI release workflow | Nothing done by hand. | More machinery for a private link. | One local script that asks before each upload. |
| A one-line Terminal command that lifts macOS's block, instead of Open Anyway | Fewer clicks on first open. | It removes macOS's check for the app, and it's a pasted command again. | The first-open steps describe Open Anyway. |
| Apple Developer ID signing ($99 a year) | Removes macOS's block and the Keychain prompts on each new build. | Cost, and Apple's review steps. | Deferred until a public launch. |

--------------------------------------------------------------------------------

## Non-Functional Requirements

*   **Security and privacy.**
    *   Tearsheet never reads Claude Code's or Codex's credential files.
    *   Data keys stay in the macOS Keychain.
    *   The window can never send command text to the main process.
    *   The setup log holds no email, key, account ID, sign-in link or raw tool output.
    *   Organisation IDs and names never reach the window.
*   **The owner's own setup.** No test touches his real sign-ins, his real Keychain entries or his
    real data folder. Each manual test checks this before and after.
*   **Plan usage.** Nothing spends the person's plan before their first click in setup. The safety
    check uses about 25 calls. Its share of a 5-hour window is measured in the first Stage 1 test
    run and written here.
*   **Rollout and rollback.**
    *   Each stage is its own commit, backed out with a git revert.
    *   There is no database change.
    *   The Install button has one switch (`INSTALL_BUTTON`).

### Additional Resources

*   [concepts_brief.md](./concepts_brief.md): the brainstorm and its decisions D1 to D7.
*   [clicks-today.md](./clicks-today.md): the click count of today's setup.
*   Design canvas with the nine interactive versions; version 6 is the chosen one:
    https://claude.ai/artifact/EgihdYmRw8Pw61kRSrjL7W
*   Claude Code's CHANGELOG (status-command sign-outs, `claude auth` from 2.1.41).
*   Claude Code 2.1.317's `auth login` code, read from the installed program on 2026-11-08.
*   OpenAI Codex `codex-rs/cli/src/login.rs` at tag `rust-v0.165.0`.
*   Claude Code's and Codex's official install scripts, as of 2026-11-07.
*   [tearsheet.md](../tearsheet.md) §4, §12 to §14, and [report-look.md](../report-look.md)
    "The first-time path", both updated by this design.

### Future Improvements

*   **Apple Developer ID signing, notarization and auto-update**, to remove macOS's block and the
    Keychain prompts on each new build.
*   **A warning before a Claude sign-in ends**, from `loginExpiresAt` (Claude Code 2.1.318 and
    later).
*   **An Intel build.**
*   **The plan-usage cost of a report**, shown on the setup screen once it is measured.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

### How this list is organised

*   **By stage.** Each stage is its own commit, and keeps `npm run typecheck`, `npm test` (with its
    coverage floor) and `cd engine && uv run pytest` passing.
*   **Paths.** App paths are under `app/src/`, engine paths under `engine/src/tearsheet/`, and the
    rest are from the repository root.

### Stage 0: today's path made finishable

#### 1. `app/src/shared/tools.ts` (Create)

*   **Type / Scope**: Shared TypeScript module, used by the main process, the preload bridge and
    the window.
*   **Proposed Changes**:
    *   **`ToolStatus`, written once.** It moves here from `main/tools.ts` and `preload/api.d.ts`
        and gains these fields:
        *   `state`: one of `missing`, `too_old`, `cant_tell`, `signed_out`, `api_key`,
            `free_plan` or `ready`;
        *   `plan`: the plan label, or null;
        *   `email`: Claude Code only, or null;
        *   `hasOrg`: true or false.
    *   **`INSTALL_DIR`.** The constant `~/.local/bin`, as a function of the home folder.
    *   **`MIN_CLAUDE_VERSION`.** The constant `2.1.41`.
    *   **`pickTool(tools, savedPrimary)`.** Returns the saved tool if it is ready, else the first
        ready tool, Claude Code before Codex, else the first installed one, else null.

#### 2. `app/src/shared/flags.ts` (Create)

*   **Type / Scope**: Shared constant.
*   **Proposed Changes**:
    *   **The switch.** `INSTALL_BUTTON = true`, with a comment that says what turning it off does
        and why it exists (Anthropic's approval).
    *   **Only read at the top.** Read only where the app is put together: `main/index.ts`, and
        `App.tsx`, which passes it down. So every test can run both ways.

#### 3. `app/src/main/probe.ts` (Modify)

*   **Type / Scope**: Main-process module.
*   **Proposed Changes**:
    *   **Reading.** `--version` keeps its 5-second limit. The status command gets no kill: a
        status still running after 60 seconds gives `cant_tell`, its process is left to finish,
        and its late answer is ignored. Only standard output is read, and terminal escape codes
        are stripped first.
    *   **Claude Code's answer.** `readStatus(kind, output, version)` replaces `readLoggedIn` and
        maps the JSON to `state` with these rules, in order:
        *   version below `MIN_CLAUDE_VERSION` gives `too_old`;
        *   `loggedIn` false gives `signed_out`;
        *   `authMethod` other than the claude.ai sign-in, or a set `apiProvider`, gives `api_key`;
        *   a `subscriptionType` of `free` gives `free_plan`;
        *   any other `subscriptionType`, known or not, gives `ready`, and its value is logged as a
            code;
        *   no JSON at all gives `cant_tell`.
    *   **Claude Code's details.** `plan` comes from `subscriptionType`, `email` from `email`, and
        `hasOrg` from whether `orgName` is present.
    *   **Codex's answer.**
        *   "Logged in using ChatGPT" gives `ready`.
        *   "Logged in using an API key" gives `api_key`.
        *   "Not logged in" gives `signed_out`.
        *   Anything else gives `cant_tell`.
    *   **Logging.** Each read reports its path, exit code or signal, time taken and the state it
        gave to `setupLog`.
    *   The 30-second cache moves into `toolWatch`.

#### 4. `app/src/main/probe.test.ts` (Modify, now committed)

*   **Type / Scope**: Unit tests with shell-script stand-ins (19 already pass).
*   **Proposed Changes**: New cases:
    *   each `state`;
    *   escape codes stripped;
    *   standard error ignored;
    *   a status that sleeps past the limit gives `cant_tell`, and its process isn't killed;
    *   an unknown `subscriptionType` gives `ready`;
    *   no email gives null;
    *   `hasOrg`.

#### 5. `app/src/main/toolWatch.ts` and `toolWatch.test.ts` (Create)

*   **Type / Scope**: Main-process module and its tests, with a fake clock and a fake probe.
*   **Proposed Changes**:
    *   **One read at a time.** `read(force)` shares any read already under way.
    *   **Asked by the window.** `onWindowFocus()` and `setWaiting(boolean)` come from the window.
        While the window is focused and setup or Home is waiting on a tool, it reads at most every
        5 seconds, and once on each focus.
    *   **Pushes.** On a change it sends `tools_changed` to the window. It calls the engine's
        `set_tool_paths` when a path changes.
    *   **Tests:** single flight, the 5-second gap, no reads while blurred, an event only on a
        change, `set_tool_paths` only on a path change.

#### 6. `app/src/main/lines.ts` and `lines.test.ts` (Create)

*   **Type / Scope**: Main-process module and its tests.
*   **Proposed Changes**:
    *   **`lineFor(kinds, tools, testTools?)`.** Builds the paste line:
        *   **Missing:** `set -o pipefail;`, then the official installer, then `&&` and the
            full-path sign-in.
        *   **Signed out:** the found path plus the sign-in.
        *   **Too old:** the installer again.
        *   **Both:** both installs, then both sign-ins.
    *   **Codex's installer** always runs with `CODEX_NON_INTERACTIVE=1`.
    *   **Codex sign-in only when signed out.** It is never placed in a line for a Codex that reads
        `ready`, because it signs out first.
    *   **Test mode.** With `testTools` set, the lines name the stand-in installers instead.
    *   **Version stamp.** Each template carries "checked against installer of 2026-11-08".
    *   **Tests:** every state, both tools, and test mode.

#### 7. `app/src/main/terminal.ts` and `terminal.test.ts` (Create)

*   **Type / Scope**: Main-process module and its tests, with fake clipboard and spawn.
*   **Proposed Changes**:
    *   **`copyAndOpen(line)`.** Writes the line with Electron's `clipboard`, reads it back, and on
        a match opens a new Terminal window with `/usr/bin/open -a Terminal <home folder>`.
    *   **The answer.** It returns `{ copied, opened }`, and the window says which failed.
    *   **Replaces `openTerminal`.**
    *   Each outcome is logged.

#### 8. `app/src/main/setupLog.ts` and `setupLog.test.ts` (Create)

*   **Type / Scope**: Main-process module and its tests.
*   **Proposed Changes**:
    *   **One line per event.** `log(event, fields)` appends a timestamped line to
        `<data folder>/logs/setup.log`.
    *   **What it accepts.** Events come from a fixed list, and the fields from a fixed list of keys.
        Anything else is dropped.
    *   **No personal data.** Values that look like an email, a key or a URL are replaced with
        `[removed]`.
    *   **Tests:** unknown events dropped, emails and keys removed, and a log that can't be written
        never throws.

#### 9. `app/src/main/loginShellPath.ts` (Modify)

*   **Type / Scope**: Main-process module.
*   **Proposed Changes**:
    *   **One install folder.** `fallbackPath` uses `INSTALL_DIR`.
    *   **Where the PATH came from.** `loginShellPath()` also returns `login shell`, `fallback` or
        `shell failed`, for `setupLog`.
    *   A new `loginShellPath.test.ts` covers both cases.

#### 10. `app/src/main/tools.ts` (Modify)

*   **Type / Scope**: Main-process module.
*   **Proposed Changes**: Drops the unused `loginCommand` and `install` fields and the `ToolStatus`
    copy. It keeps the table of binaries, overrides and version and status arguments.

#### 11. `app/src/main/ipc.ts` and `ipc.test.ts` (Modify)

*   **Type / Scope**: The window-to-main bridge and its tests.
*   **Proposed Changes**:
    *   **New engine calls.** `CALLS` gains `completeSetup` (`complete_setup`) and
        `cancelSafetyCheck` (`cancel_safety_check`). `set_tool_paths` stays off the list.
    *   **New handlers:**
        *   `tearsheet:getTools(force)`, now through `toolWatch`;
        *   `tearsheet:windowState({ waiting })`;
        *   `tearsheet:copyAndOpenTerminal(kinds)`, where the main process builds the line itself;
        *   `tearsheet:setupLog(event, fields)`;
        *   `tearsheet:showSetupLog()`, which opens Finder at `logs/setup.log` with
            `shell.showItemInFolder`.
    *   **`tearsheet:openTerminal` is removed.**
    *   **Pushed events.** `tools_changed` and `install_progress` reach the window as notifications.
    *   **Tests:** the allowlist, and that the window can never send command text.

#### 12. `app/src/main/index.ts` (Modify)

*   **Type / Scope**: Main-process entry.
*   **Proposed Changes**:
    *   **The window.** `BrowserWindow` gets `acceptFirstMouse: true`.
    *   **The tool watcher.** It is created after the PATH fix, the first read happens before the
        engine starts (as today), and the window's focus and blur events are forwarded to it.
    *   **Logging and the installer.** It passes `setupLog` to the modules that use it. It
        registers `installer` handlers only when `INSTALL_BUTTON` is on (Stage 2).

#### 13. `app/src/main/engine.ts` and `engine.test.ts` (Modify)

*   **Type / Scope**: The engine process.
*   **Proposed Changes**:
    *   **Restart cap.** After 3 restarts within 30 seconds, it stops restarting and sets
        `fatalMessage`. The message names the signal and points to the first-open steps.
    *   **Tests:** the cap, and that the counter resets after a quiet minute.

#### 14. `app/src/main/external.ts` and `external.test.ts` (Modify)

*   **Type / Scope**: Allowed outside pages.
*   **Proposed Changes**: Removes `nodejs.org`. The Massive button opens its sign-up page.

#### 15. `app/src/preload/index.ts`, `api.d.ts` and `index.test.ts` (Modify)

*   **Type / Scope**: The bridge seen by the window.
*   **Proposed Changes**:
    *   **Bridge calls.** Exposes the new calls (`completeSetup`, `cancelSafetyCheck`,
        `windowState`, `copyAndOpenTerminal`, `setupLog`, `showSetupLog`, and in Stage 2 `install`
        and `cancelInstall`) and removes `openTerminal`.
    *   **One `ToolStatus`.** It is imported from `shared/tools.ts`.

#### 16. `engine/src/tearsheet/server.py` (Modify)

*   **Type / Scope**: Engine server.
*   **Proposed Changes**:
    *   **`m_cancel_safety_check`.** Cancels `safety_job` and answers `{ "stopped": bool }`.
    *   **`_safety_job` when stopped.** On cancel it closes the connector and sends `safety_done`
        with `finished: false` and the reason "You stopped the safety check.".
    *   **`_safety_job` when it ends.** It writes the check's report file (the same format as the
        command-line check) under `logs/`. If the check failed or was stopped while the line has
        reports waiting, the line pauses with `SAFETY_CHECK_FAILED` or `SAFETY_CHECK_STOPPED` and
        the reason. If it passed while the line is paused with one of those codes, the line
        carries on.
    *   **`m_complete_setup`.** Checks `primary_tool`, `sec_contact_email` (the engine's email
        rule) and `email_source` (`claude` or `typed`). It writes those three and `setup_done=1`
        in one database transaction, and answers `{ "ok": true }` or a parameter error naming the
        field.
    *   **`m_set_tool_paths {claude, codex}`.** Hands the paths to `config.set_program_paths`.
    *   **The check's progress in the settings.** The server keeps the latest `safety_progress`.
        `m_get_settings` gains `safety_running`: `{ tool, n, total }` while a check runs, null
        otherwise.
    *   **No change to `m_run_report`.** It still refuses during a check, and the window sends
        the report to the line instead.

#### 17. `engine/src/tearsheet/protocol.py` and `app/src/shared/protocol.ts` (Modify, regenerate)

*   **Type / Scope**: Protocol models.
*   **Proposed Changes**:
    *   **New parameters.** `CompleteSetupParams`, `ToolPathsParams` and, for cancel, `NoParams`,
        registered in `METHODS`.
    *   **New settings fields.** `SettingsResult` gains `email_source` and `safety_running`.
    *   **New line codes.** The line's pause codes gain the two safety codes.
    *   **Version and types.** `PROTOCOL_VERSION` goes up by one, and `npm run gen-types`
        regenerates `protocol.ts`.

#### 18. `engine/src/tearsheet/config.py` (Modify)

*   **Type / Scope**: Engine settings.
*   **Proposed Changes**:
    *   **One new setting.** `SETTINGS` gains `email_source`, which must be `claude` or `typed`.
    *   **Program paths.**
        *   `set_program_paths()` stores the paths the app passes.
        *   `find_program()` uses them first, then the environment, then the PATH.
        *   It returns a path only if it exists and can run.

    (The test switches in item 26 also live here.)

#### 19. `engine/src/tearsheet/batch.py` (Modify)

*   **Type / Scope**: The line.
*   **Proposed Changes**:
    *   **New codes.** `SAFETY_CHECK_FAILED` and `SAFETY_CHECK_STOPPED`.
    *   **New methods.** `pause(code, message)`, and `paused_for_safety()`, which is true when the
        pause has one of those codes.

#### 20. `engine/src/tearsheet/ai/__init__.py` (Modify)

*   **Type / Scope**: AI client set-up.
*   **Proposed Changes**:
    *   **The checking tool needs a full pass.** `checker_for` uses the other tool only when its
        stored check is a passed full check for its current version.
    *   **This changes an existing install.** A Codex with only a short-check pass stops checking
        drafts until its full check passes. Settings then shows "Codex checks each draft once its
        safety check passes" with Run the check. Nothing runs by itself outside setup. This
        changes the rule in `docs/designs/tearsheet.md` §4 for the checking tool only, and that
        section is updated (item 41).

#### 21. `engine/src/tearsheet/cli.py` (Modify)

*   **Type / Scope**: Engine logging.
*   **Proposed Changes**: The log format gains a timestamp.

#### 22. Engine tests (Modify and Create)

*   **Type / Scope**: pytest.
*   **Proposed Changes**:
    *   **`tests/test_server_setup.py` (new):**
        *   `complete_setup` passes, fails on each bad field, and writes all or nothing;
        *   `cancel_safety_check`;
        *   the line pauses on a failed or stopped check, and carries on after a pass;
        *   `set_tool_paths`;
        *   `get_settings` reporting `safety_running` during a check and null after it.
    *   **`tests/test_batch.py`:** the pause codes.
    *   **`tests/test_flags.py` or a new `tests/test_config_paths.py`:** `find_program` with
        missing and present paths, and the overrides.
    *   **`tests/test_ai_client.py`:** `checker_for` with a short pass, a full pass and a version
        change.
    *   **`tests/test_protocol.py`:** the new models.

#### 23. Window changes for Stage 0

*   **Type / Scope**: Renderer.
*   **Proposed Changes**:
    *   **`renderer/home/useRun.ts`.** `start()` sends a report to `addOne` when a safety check is
        running, which it knows from App's safety state. If the engine still answers
        `SAFETY_CHECK_RUNNING`, it falls back to `addOne`.
    *   **`renderer/home/run.ts`.** `refusal()` maps `SAFETY_CHECK_RUNNING` to "The safety check
        is running. The report joins the line."
    *   **`renderer/home/line.ts` and `LineParts.tsx`.**
        *   While a check runs, the waiting entry reads "Starts when the safety check finishes
            (n of 25)".
        *   A safety pause shows its reason with "Run it again", which starts the check, and
            "Cancel all".
    *   **`renderer/setup/SafetyChip.tsx`.** Its popover gains "Stop the check" while the check
        runs.
    *   **`renderer/App.tsx`.**
        *   Tools come from `tools_changed`, with no polling.
        *   It uses `pickTool`.
        *   It passes `cancelSafetyCheck`.
        *   On load, it starts its safety state from `safety_running` in the settings, so a
            reloaded window shows the real count.
        *   After the first report ends, it starts the other tool's check if that tool is ready
            and has no full pass.
    *   **`renderer/pages/Home.tsx`.**
        *   Its 2-second sign-in poll is removed, replaced by `windowState({ waiting: true })`.
        *   "Sign in again" uses `copyAndOpenTerminal` until Stage 2 adds the button.
    *   **`renderer/home/since.ts`.** The FRED line says the key is optional, free and takes about
        2 minutes.
    *   **`renderer/pages/Settings.tsx` and `settings/settings.ts`.** A tool row that reads signed
        out or missing gets the same action as Home. The AI tools section gets "Show log in
        Finder".
    *   **Today's setup screens.** They take their lines from the main process, so the brand-new
        path can be finished before Stage 2.
    *   **Tests.** Their tests (`useRun`, `run.test.ts`, `line.test.ts`, `settings.test.ts`,
        `App.test.tsx`) gain the cases above.

### Stage 1: the safe test

#### 24. `scripts/test-tools/standin` (Create)

*   **Type / Scope**: POSIX shell script, installed as `claude` or `codex` in a test folder.
*   **Proposed Changes**:
    *   **Its state.** It reads `<test folder>/state`: for each tool, one of `signed_out`,
        `signed_in`, `too_old` or `usage_limit`.
    *   **What it answers itself:**
        *   `--version`: 2.1.317 or 2.0.14 for Claude Code, 0.165.0 for Codex;
        *   the status commands, in each tool's real output format, with `you@example.com` and the
            `max` plan;
        *   `auth login` and `login`: prints the real tool's lines, waits 3 seconds, sets
            `signed_in`, then prints the real success line.
    *   **Usage limit.** In `usage_limit`, real calls print the tool's usage-limit message and exit
        1.
    *   **Everything else** is handed to the real program named in `TEARSHEET_REAL_CLAUDE` or
        `TEARSHEET_REAL_CODEX`.

#### 25. `scripts/test-tools/install-claude.sh` and `install-codex.sh` (Create)

*   **Type / Scope**: Shell scripts.
*   **Proposed Changes**: Each copies `standin` into the test folder under the tool's name, prints
    the real installer's success line, and sets the state to `signed_out`.

#### 26. Test switches (Modify: `engine/src/tearsheet/config.py`, `app/src/main/index.ts`, `lines.ts`, `installer.ts`)

*   **Type / Scope**: Engine and main process.
*   **Proposed Changes**:
    *   **`TEARSHEET_KEYCHAIN_SERVICE`** replaces the fixed name `Tearsheet` when it is set.
    *   **`TEARSHEET_SEC_RATE`** replaces 8 requests a second when it is set, and must be from 1
        to 8.
    *   **`TEARSHEET_TEST_TOOLS`.** When set, the main process points the PATH addition,
        `lines.ts` and `installer.ts` at the test folder and the stand-in installers. It also never
        adds `~/.local/bin` or Homebrew, so the real tools aren't found.

    Nothing in the app sets these.

#### 27. `scripts/try-new-user.sh` (Create)

*   **Type / Scope**: Shell script the owner runs.
*   **Proposed Changes**:
    *   **Sets up a fresh test.** It makes a temporary folder with `data/`, `tools/` and a state
        file.
    *   **Records the real sign-ins.** It saves `loggedIn` and `orgId` from the real
        `claude auth status --json`, and the real `codex login status` line.
    *   **Starts a test copy** with `open -n` and the test switches (`TEARSHEET_DATA_DIR`,
        `TEARSHEET_KEYCHAIN_SERVICE=Tearsheet-test`, `TEARSHEET_TEST_TOOLS`,
        `TEARSHEET_SEC_RATE=2`, and the real program paths for the stand-ins).
    *   **Checks afterwards.** When the test copy quits, it reads the same two values again and
        prints "unchanged" or what changed.
    *   **For automated runs,** `--hidden` adds `TEARSHEET_HIDDEN_WINDOW=1` and `open -g -j`.

#### 28. `app/src/renderer/test/bridge.ts` (Modify)

*   **Type / Scope**: The fake bridge for window tests.
*   **Proposed Changes**:
    *   **New fakes.** It gains `tools_changed` and `install_progress` emitters and fakes for the
        new calls.
    *   **Click counting.** A click counter wraps `userEvent.click`, so tests can assert counts.
    *   **Fixtures.** Tool fixtures for each `state`, and for both tools.

### Stage 2: the setup screen (version 6) and the Install button

#### 29. `app/src/main/installer.ts` and `installer.test.ts` (Create)

*   **Type / Scope**: Main-process module and its tests, with a fake spawn.
*   **Proposed Changes**:
    *   **The recipes** are fixed, for `claude` and `codex`. Each has `install` (the official
        installer in `/bin/sh -c` with `set -o pipefail`, and for Codex `CODEX_NON_INTERACTIVE=1`)
        and `signIn` (`<INSTALL_DIR>/claude auth login` or `<INSTALL_DIR>/codex login`).
    *   **`run(kinds)`.** It takes `['claude']`, `['codex']` or `['claude','codex']`.
        *   It works out the steps from `toolWatch`'s latest status: install if missing or too
            old, then sign in if not ready.
        *   It skips Codex's sign-in when Codex reads `ready`, because that sign-in signs out first.
        *   The order is: installs one by one, then sign-ins one by one.
    *   **How each step runs.** Input is closed. Output is read line by line with escape codes
        stripped. The step sends `install_progress` with `{ tool, step, status }`. Raw lines and
        links are never sent or logged.
    *   **Time limits.** Installs get 10 minutes. A sign-in waits until it exits or until
        `cancel()` stops it.
    *   **When a sign-in counts as done.** Exit 0 and the success line ("Login successful." or
        "Successfully logged in"). After that it forces a `toolWatch` read.
    *   **Failure.** It sends `install_progress` with `status: 'failed'` and a short plain reason.
        The window then offers Try again and shows the paste line.
    *   **Only when the switch is on.** The main process registers `tearsheet:install` and
        `tearsheet:cancelInstall` only when `INSTALL_BUTTON` is on.
    *   **Tests:** each order of steps, Codex skipped when ready, a failed download, a sign-in
        cancelled, both tools, and test mode (stand-in installers).

#### 30. `app/src/renderer/setup/state/tool.ts`, `key.ts`, `email.ts`, `safety.ts` and tests (Create)

*   **Type / Scope**: Pure reducers.
*   **Proposed Changes**:
    *   **tool:** found, missing, installing (with steps), signing in, can't tell, too old, API
        key, free plan, failed, or ready. It also holds which tools the person picked.
    *   **key:**
        *   States: empty, shape rejected, checking, rejected, unreachable, waiting for Massive's
            limit, works, already saved, or Keychain refused.
        *   One check at a time, and only the latest answer counts.
    *   **email:** none, suggested from Claude Code, typed, editing, invalid, or saved. It holds
        `email_source`, and a suggestion never replaces a typed email.
    *   **safety:** moved from `steps.ts` without changes, plus `stopped by you`.
    *   **Tests:** each state change, in the style of today's `steps.test.ts`.

#### 31. `app/src/renderer/setup/view.ts` and `view.test.ts` (Create)

*   **Type / Scope**: Pure function.
*   **Proposed Changes**:
    *   **`screenView(tool, key, email, safety, focus, installButton)`** returns:
        *   the three list rows: icon, words, and actions such as Connected, Change or Use
            another;
        *   which question card shows: `connect`, `key` or `finish`;
        *   that card's contents: the Install buttons or the paste line, depending on
            `installButton`;
        *   whether Start can be pressed, and if not, the reason ("Waiting for Claude Code to sign
            in", "Waiting for your Massive key", "Add your email");
        *   where focus goes.
    *   **The question card follows the mockup:**
        *   `connect` while the tool is missing or installing;
        *   `key` once the tool is signing in or ready and the key isn't working;
        *   `finish` once the key works.

#### 32. `app/src/renderer/setup/words.ts` and `helpers.ts` (Create)

*   **Type / Scope**: Shared text and helpers.
*   **Proposed Changes**:
    *   **`words.ts`.** `TOOL_TEXT` moves here, without the install and sign-in lines, which now
        live in the main process. It gains the sentences for each tool `state`, both data lines
        (one tool and both), and the safety-check items.
    *   **`helpers.ts`.**
        *   `isEmail`, `versionNumber` and `keyProblem` move here.
        *   It adds `keyShape(text)`, which rejects spaces, a `curl`, `http` or `~` start, and
            `@`, and adds `maskKey`.

#### 33. `app/src/renderer/setup/List.tsx` and `Question.tsx` (Create)

*   **Type / Scope**: React components.
*   **Proposed Changes**:
    *   **`List.tsx`.** The three rows from the mockup. With both tools connected, the AI row has
        two lines: "Claude Code … writes your reports" and "Codex … checks each draft".
    *   **`Question.tsx`.** The three cards from the mockup:
        *   **Connect:** "Install Claude Code", "Install Codex" and "Install both", or the paste
            line, with progress lines while installing.
        *   **Key:** "Get a free key" and the key field.
        *   **Finish:** the email with Change, or the email field, then the data line, then Start
            and its reason.
    *   **Motion.** As in the mockup: the settle-in, the list ticks being drawn, the question
        rising, and Start pulsing once when it can be pressed. All of it is off under Reduce
        motion.

#### 34. `app/src/renderer/pages/Setup.tsx` (Rewrite)

*   **Type / Scope**: React page.
*   **Proposed Changes**:
    *   **What it does.**
        *   It wires bridge events into the four reducers, renders `List` and `Question` from
            `screenView`, and calls `windowState({ waiting })`.
        *   It starts the safety check at the first click once a tool is ready.
        *   Start calls `completeSetup`, then `onFinish`.
    *   **What goes.** The nine-step flow, the progress line and the "Looking for" scan are
        removed.

#### 35. `app/src/renderer/pages/Setup.test.tsx` (Rewrite)

*   **Type / Scope**: Window tests, the click-count tests.
*   **Proposed Changes**:
    *   **One test per journey:** CUJ 1, 2, 3, 4 and 4b, plus "both already set up". Each runs with
        the switch on and off. A return to the window is modelled as one click on the control
        under the pointer.
    *   **Click limits.** It asserts at most 3 clicks when a tool is set up and at most 4 on a new
        Mac.
    *   **Before Start, it asserts:**
        *   the tool and plan line;
        *   the email with where it goes;
        *   the data line.
    *   **Also covered:**
        *   no AI call before the first click;
        *   `cant_tell` never shows an install;
        *   too old, free plan and API key;
        *   a key rejected by its shape;
        *   an email suggestion never replacing a typed one;
        *   Codex's sign-in never offered when Codex is ready.

#### 36. `app/src/renderer/setup/KeyCard.tsx` and a new `KeyCard.test.tsx` (Modify)

*   **Type / Scope**: React component, shared with Settings.
*   **Proposed Changes**:
    *   **Props.** It gains `checkOnPaste` and `showCheck`. Setup uses paste-only. Settings
        (`settings/Keys.tsx`) uses both (D7).
    *   **How a check runs.**
        *   A shape check runs before any call.
        *   One check at a time, and only the latest answer counts.
        *   A rejected key is cleared and the field focused.
        *   The masked key shows after a paste.
        *   "Try again" appears when Massive can't be reached.
    *   **The button.** It opens Massive's sign-up page.

#### 37. `app/src/renderer/setup/setup.css` (Modify)

*   **Type / Scope**: Styles.
*   **Proposed Changes**:
    *   **Removed:** the old screens' styles (welcome, how it works, scan, Connected ring, ready
        list).
    *   **Added:** the list, the cards, the pick buttons, the progress lines, the Connected pill,
        and the keycap reminder for the paste line, ported from `Spine.dc.html` on the canvas.

#### 38. Moving the shared parts, then deleting (Modify and Delete)

*   **Type / Scope**: Renderer housekeeping.
*   **Proposed Changes**:
    *   **First, the imports.** These files change their imports from `setup/steps` to the new
        modules: `App.tsx`, `nav.ts`, `nav.test.ts`, `pages/Home.tsx`, `pages/Settings.tsx`,
        `settings/General.tsx`, `settings/Keys.tsx`, `settings/settings.ts`,
        `settings/settings.test.ts`, `settings/topics.ts`, `setup/KeyCard.tsx` and
        `setup/SafetyChip.tsx`.
    *   **Then, in the same commit, these files are deleted:** `setup/steps.ts`,
        `setup/steps.test.ts`, `setup/intro.tsx`, `setup/tool.tsx`, `setup/tool.test.tsx` and
        `setup/details.tsx`.

#### 39. `app/src/renderer/pages/Home.tsx`, `pages/Settings.tsx` (Modify)

*   **Type / Scope**: React pages.
*   **Proposed Changes**: "Sign in again", and the Settings tool row, use `install(['claude'])` or
    `install(['codex'])` when the switch is on, and `copyAndOpenTerminal` when it is off.

### Stage 3: the private download

#### 40. `scripts/release.sh`, `scripts/release/How to open Tearsheet.txt`, `scripts/release/notes.md` (Create)

*   **Type / Scope**: Shell script and two text files.
*   **Proposed Changes**:
    *   **Before building.** It checks the repository is private (`gh repo view --json visibility`)
        and the working tree is clean.
    *   **Build.** It runs `npm run package` from `app/`.
    *   **DMG.** It makes `Tearsheet-<version>-arm64.dmg` with `hdiutil create`, from a folder that
        holds the app, a link to Applications, and "How to open Tearsheet.txt".
    *   **Zip.** It makes `Tearsheet-<version>-arm64.zip` with
        `ditto -c -k --keepParent --sequesterRsrc`. It unzips a copy and runs
        `codesign --verify --deep --strict`, and stops on failure.
    *   **Notes.** It writes `SHA256SUMS.txt` and fills `notes.md` with the version, the checksums
        and the first-open steps:
        *   click Done, not Move to Trash;
        *   then Privacy & Security, then Open Anyway;
        *   what to do about "damaged" or a second box for Tearsheet Engine;
        *   how to check for Apple Silicon;
        *   that each update shows these prompts again.
    *   **The switch.** It prints "Install button: on/off" from `shared/flags.ts`, with the
        reminder about Anthropic's approval.
    *   **Upload.** It asks "Create the release v<version> on <repo> (private)? [y/N]" and then
        asks once more before each upload (`gh release create`, `gh release upload`). Nothing goes
        up without a "y".

#### 41. Design docs (Modify)

*   **Type / Scope**: Documentation, in the same change as Stage 2.
*   **Proposed Changes**:
    *   **`docs/designs/report-look.md`.** "The first-time path" is rewritten as the one-screen
        spec, with a link to this design and the canvas.
    *   **`docs/designs/tearsheet.md`:**
        *   CUJ 6 describes the setup screen and the Install button.
        *   §4 gets the checking tool's full-check rule.
        *   §12 says the email comes from the Claude sign-in or is typed, and that the commands are
            run by the button or pasted.
        *   §13 is split into "private build now" and "signed build later".
        *   §14 records the owner's choice to ship the button ahead of Anthropic's approval, and
            the one switch.
        *   A31 is marked chosen, and items 41, 43, 45, 47 and 49 to 51 are updated to match.
    *   **`docs/designs/opening-and-setup.html`.** A note at the top says it is replaced by this
        design.
    *   **`app/electron-builder.yml`.** Its header comment says downloads come from
        `scripts/release.sh`.

### Verification Plan

*   **Compilation/Build**: `cd app && npm run typecheck && npm run build`, and
    `npm run package` once per stage.
*   **Unit Tests**: `cd app && npm test`, and `cd engine && uv run pytest`.
*   **Static Analysis & Linting**: `cd engine && uv run ruff check` (the repo's existing check).
*   **Test Coverage Requirement**: `npm run coverage` holds the floor in `app/vitest.config.ts`:
    91% of lines, and 96% for the `.tsx` screens. New modules are fully covered by their own tests.
*   **E2E/Integration**:
    *   **Stage 1:** `scripts/try-new-user.sh` with each stand-in state. It must say "unchanged" for
        the real sign-ins every time. Automated runs use `--hidden`, on a copy of the data, never
        the real data folder.
    *   **Stage 3:** one real run on a second macOS account, from a browser download of the
        private release. It must reach a started first report, and its time is recorded.
    *   **Never:** a live full report on a company during any test, because the first one in 30
        days becomes an official prediction.
*   **Before and after every manual test:** the real `claude auth status --json` (`loggedIn`,
    `orgId`) and `codex login status` are unchanged.

--------------------------------------------------------------------------------

*Drafted with EGM*
