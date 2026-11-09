# Fewest-click first run for Tearsheet

*   **Author:** Liam Blackshaw-Brown (drafted with Claude)
*   **Status:** Proposed (every section approved by the owner on 2026-11-08; through all five
    `/egm-review` rounds on 2026-11-08, with every finding fixed or decided by the owner)
*   **Date:** 2026-11-08
*   **Drafted from:** [concepts_brief.md](./concepts_brief.md) and [clicks-today.md](./clicks-today.md)

--------------------------------------------------------------------------------

## Overview

Tearsheet is a personal macOS app. It turns an S&P 500 ticker into one cited research report. The
report is written by the person's own Claude Code or Codex command-line tool, on that person's own
paid plan. Data keys stay in the macOS Keychain.

It has three parts:
*   **the window,** built with Electron and React;
*   **the main process,** which starts the engine and runs the setup commands: the tools' status
    reads, installs and sign-ins;
*   **the engine,** a separate Python program (`Tearsheet Engine` inside the app). It writes the
    reports through the person's AI tool, and talks to the main process over JSON-RPC on its
    standard input and output.

This design covers everything between "someone has the download link" and "their first report has
started", in four stages:

*   **Stage 0. Groundwork.** The parts every later stage needs:
    *   the install and sign-in steps;
    *   a sign-in check that doesn't sign anyone out;
    *   a first report that waits for the safety check instead of being turned away.

    No one new gets the app before Stage 3. So the old screens aren't patched in the meantime,
    and only the owner, whose tools are set up, uses them.
*   **Stage 1. A safe way to test it.** The owner can try the brand-new-Mac path on his own Mac
    without his real keys, tools or sign-ins being touched.
*   **Stage 2. One setup screen.** It replaces the nine screens. It fills in what it can find by
    itself and asks only for what it can't.
*   **Stage 3. A download link.** A GitHub release with a DMG and a zip, on the project's
    repository, which the owner makes public first. It comes with written steps for opening an app
    that Apple has not signed.

| Stage | Technical Plan sections | Detailed Implementation items |
| :-- | :-- | :-- |
| 0 | §1, §2 (the list of steps), §3, §5, §7 | 1 to 23 |
| 1 | §6 | 24 to 27 |
| 2 | §2 (the Install button), §4 | 28 to 39, and 41 (the design docs) |
| 3 | §8 | 40 |
| All | §9 | |

**Why now, and for whom.**
*   **The root design brought forward.** The root design ([tearsheet.md](../tearsheet.md)) is for
    personal use. It plans setup for non-technical people as its Goal 9, after Goal 1 (10 real
    reports, checked), which isn't finished yet.
*   **A smaller audience.** This design brings setup forward for the owner and a few friends who
    test the download link, not the public at large. The owner chose to do it now so friends can
    try Tearsheet while Goal 1 runs.
*   **Sized for that audience:** a link that isn't announced, no Apple signing, and no support
    beyond a setup log.

**Decisions and accepted risks** (each is also a row in Risks and Mitigations):
*   **Every copy has an Install button** (owner's choice, 2026-11-08). It runs the official
    installer, then the sign-in command, which opens claude.ai or chatgpt.com in the browser. The
    person doesn't paste anything into Terminal unless a step fails. "Install both" does Claude
    Code and Codex one after the other.
*   **This goes ahead of Anthropic's approval, by the owner's choice.** Anthropic's documentation
    says third-party products may not offer claude.ai sign-in without its approval. The owner
    chose to give the button to himself and a few friends who test the download link now, and to
    ask Anthropic before launch. If Anthropic says no, one switch puts the paste command in the same
    spot on the screen in new builds, and an online off switch does the same in copies already
    handed out (owner's choice, 2026-11-08). That fallback is built in this design and tested
    with the stand-ins; it is not run against the real installers.
*   **OpenAI's terms for Codex are still unchecked.** The brief made checking them a condition
    before anyone else gets the link. The owner accepts this for friends testing, as he does for
    Anthropic's approval, and checks both before launch.
*   **Tearsheet never reads Claude Code's or Codex's credential files.** It asks each tool's own
    status command.

### Words used in this design

| Word | Meaning |
| :-- | :-- |
| **The line** | Tearsheet's queue of reports, written one after another. A report asked for while something else runs waits in it. |
| **The safety check** | 25 test calls that check the AI tool can only read and write text for Tearsheet: no commands, no files. It takes about 3 minutes. It runs during setup for the writing tool, and again whenever the person clicks Run the check. |
| **The short check** | A 5-call version of the safety check. It runs before a tool's first call when no check has passed yet for that tool's version, for example after each tool update. |
| **The Install button** | The setup button that installs and signs in to Claude Code, Codex or both, inside Tearsheet. |
| **The paste command** | The one command to paste into Terminal that does the same. It shows when the Install button's switch is off, or when an install or sign-in step fails. |
| **The switch** | `INSTALL_BUTTON`, a build setting. On (as now): the Install button. Off: the paste command in the same spot. "With the switch off" in the journeys means the button is off, whichever of its two switches turned it off. |
| **The online off switch** | One small file in the public repository, which each copy reads when it opens. Set to `off`, it turns the Install button into the paste command in every copy, including ones already handed out. It can only turn the button off, never on. With the build setting, these are the button's two switches (§2). |
| **Writing tool, checking tool** | The writing tool writes the reports (`primary_tool`). The checking tool is the other one, when it is connected too; it checks each draft. |
| **Brand-new Mac** | A Mac with neither tool installed and no npm. "The brand-new-Mac path" is setup on such a Mac. |
| **Test mode** | A copy started with `TEARSHEET_TEST_TOOLS` set, which only the test script does (§6). It has a canned safety check, and runs no real installer, report, grading or price download. |
| **Stand-in** | A small test program that answers like Claude Code or Codex, so tests never touch the real ones. |
| **CUJ** | Critical user journey: one path through setup, with its click count. |
| **The canvas** | The interactive mockups at https://claude.ai/artifact/EgihdYmRw8Pw61kRSrjL7W. Version 6 is the chosen one. |
| **D1 to D7, D3a, M4, M11** | From [concepts_brief.md](./concepts_brief.md): D1 to D7 and D3a are its Key Decisions, and M4 and M11 are findings from its review. This design changes some of them; see "What changed from the brief" below. |
| **§1 to §9** | This design's Technical Plan sections. The root design's are written as "[tearsheet.md](../tearsheet.md) section N". |
| **Lock-down check** | The root design's name for the safety check ([tearsheet.md](../tearsheet.md) section 4). |
| **Checks each draft** | The root design's skeptic pass: when a second AI tool is connected, it reviews each report draft that the first tool wrote. |
| **The safety chip** | A small status pill at the top right of the window, showing the check's progress, with "Stop the check". |
| **Official prediction** | The first full report on a company in 30 days is logged as a prediction and graded later. It counts toward the root design's Goal 1 ([tearsheet.md](../tearsheet.md) Glossary). |
| **Grading** | The engine checking past predictions against prices once they are due. |
| **SEC email** | SEC, the US agency that publishes company filings, asks every program that downloads them for a contact email. Tearsheet sends it with each filing download, and to no one else. |
| **Massive** | The market-data company whose free key gives Tearsheet its prices. |
| **FRED** | The St. Louis Fed's free source of economic figures. Its key is optional, and is offered after the first report. |

### What changed from the brief

| The brief said | This design says | Why |
| :-- | :-- | :-- |
| Tearsheet never runs the install or sign-in itself | An Install button in every copy, with a switch back to the paste command | Owner's choice, 2026-11-08, ahead of Anthropic's approval |
| The only tester is the owner | The owner and a few friends | Owner's choice |
| D2: a lower SEC rate in test mode | No SEC rate switch | Reports and grading are off in test mode, so a test copy sends SEC nothing |
| D2: test mode copies the stand-in's command | Test mode also runs the Install button with stand-in installers | The button is the default path |
| D3: clicks counted for "Copy the line and open Terminal" | Counted again for the Install button (the CUJ click table) | The first step changed |
| D5: save `email_source` | Not saved | Nothing reads it after setup |
| M11: a new `complete_setup` engine method | Start saves with the existing `set_setting` | It already checks each value |
| M4: pass the tool paths to the engine, or restart it | The engine looks the tools up on the same PATH | Less code, and no restart |
| A private download link (a private GitHub release) | A release on the repository, made public | A private release needs access that, on a personal account, also lets people change the code. Owner's choice. |

## The Problem

**Today's setup takes 13 clicks inside Tearsheet's window when Claude Code is already set up.**
That is 9 screens. Six of those clicks only move past a screen: Welcome, How it works, Connected,
the two FRED skip buttons and You're set up. The person's real job is two things: pasting a free
Massive price key and confirming an email. Most of the rest is Tearsheet's own steps.

**On a brand-new Mac, setup cannot be finished.** It takes about 20 clicks inside the window and
about 45 to 50 counting from the download link. Then it stops:
*   **Claude Code.** Its installer puts `claude` in `~/.local/bin`, a folder a new Terminal window
    does not search. So the screen's next command, `claude auth login`, answers "command not found".
    Tearsheet itself looks in that folder, so the screen says "Installed" just before that command
    fails.
*   **Codex.** The screen's command is `npm install -g @openai/codex`. A new Mac has no npm. The
    nodejs.org install it points to then fails with a permission error.

**Five quieter faults make it worse:**
*   **The first report is turned away.** The engine refuses to start a report while the 25-call
    safety check runs, which takes about 3 minutes. Today the nine screens cover that wait.
    Once setup is short, the first ticker the person types is refused.
*   **Checking the sign-in could sign the person out.** Tearsheet runs `claude auth status` every 2
    seconds and kills it after 5. Claude Code's changelog records sign-outs when that command ends
    partway through a token refresh, fixed in 2.1.301 and again in 2.1.317. A kill ends it the
    same way. The owner runs several Claude Code sessions at once, so a sign-out would reach all
    of them.
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
    his real one. Pasting the real install command would update his Claude Code and sign him in
    again.

**Why it matters.** The owner's own rule: if one app does the job in 3 clicks and another in 20, the
person picks the first. A setup that cannot be finished loses everyone who isn't the owner.

## Goals

Each goal says how it is checked.

1.  **Few clicks inside Tearsheet's window.**
    *   Every click in the window counts, including the click that brings it back to the front.
        Keys (⌘Tab, ⌘V, Return) and typing don't count.
    *   At most **3 clicks** when Claude Code or Codex is already installed and signed in to a plan.
    *   At most **4 clicks** on a brand-new Mac with one tool. With both (CUJ 4b), 4 clicks when the
        person stays in the browser for both sign-ins, and 5 if they come back to Tearsheet
        between them.
    *   *Checked by:* automated click-count tests, one for each journey CUJ 1 to CUJ 4b (two for
        CUJ 4b), that fail when the count goes over.
2.  **A brand-new Mac can finish with only what the screen says.** With either tool, a person can
    reach a started first report by following the screen, without opening Terminal.
    *   *Checked by:* one real run by the owner on a second macOS user account that has no tools
        installed, following only the screen, using Install both, so both tools' install and
        sign-in run for real once. This does not show that someone who has never used Terminal can
        do it. The first friends' runs, with their setup logs, are the first evidence of that.
3.  **Reading the sign-in does not sign anyone out.** A status command is never killed, and it is
    never run on a Claude Code version with the known sign-out bugs (before 2.1.317).
    *   *Checked by:* before and after every test, `loggedIn` and `orgId` from
        `claude auth status --json` and the message from `codex login status` are unchanged. Unit
        tests check that no status read is killed or started on a too-old version.
4.  **The first report is not refused because of setup.** A report asked for during the safety
    check waits in line and shows how far the check has got. If the check fails, is stopped or
    can't finish, the waiting report shows the reason in the same place.
    *   *Checked by:* window tests that start a report during a check and see it join the line
        with the count, and that each of the three endings shows its reason on the waiting report.
        Engine tests check that the line pauses with each reason (item 22).
5.  **Nothing is spent on the person's plan before they click something.** Their first click in
    setup is their go-ahead for the safety check, and the check never starts when the window opens.
    *   If the writing tool is ready at that click, the check starts then.
    *   If not (a new Mac, where the first click is Install), it starts by itself the moment the
        tool becomes ready, after its sign-in.
    *   *Checked by:* a test that opens setup and confirms no AI call is made. Another test clicks
        Install and confirms the check starts only once the stand-in reads ready.
6.  **The screen shows what will be used, before the finish.**
    *   *Shown before Start:*
        *   which tool and plan will be used, and when a second tool is also used to check drafts;
        *   the email that SEC will receive, with a way to change it;
        *   where data goes: Anthropic or OpenAI for the AI text; SEC for the email and filing
            downloads; Massive for the key and prices; iShares for the S&P 500 list; the news
            sites a report reads, only when the news setting is on (off by default); GitHub,
            for the online off switch's file at each launch (no personal data sent); and
            claude.ai or chatgpt.com, for the install scripts, only when Install is pressed. This is the outside-services list ([tearsheet.md](../tearsheet.md)
            section 12), which item 41 updates.
    *   *Checked by:* the CUJ tests assert this text is on screen before Start.
7.  **The owner can test the brand-new-Mac path on his own Mac without changing his setup.** His
    Keychain entries, sign-ins and installed tools are the same afterwards, and the test copy
    writes nothing to his data folder.
    *   *Checked by:* `try-new-user.sh` compares the real sign-ins (goal 3) and the real tools'
        paths and versions before and after. Unit tests check that a test launch reads and writes
        only the test Keychain name and the test data folder. (His data folder itself can change
        during a test, because his real app may be writing reports, so it is not compared.)
8.  **A download link that opens, with no GitHub account.** Anyone with the link can download the
    DMG or the zip from the GitHub release in a browser and reach the setup screen on macOS 27.2
    by following the written first-open steps.
    *   *Checked by:* the real run in goal 2 starts from the browser download, in a browser that
        is not signed in to GitHub.
9.  **Every setup failure leaves a record, with no personal data in it.**
    *   *Checked by:* tests that run each failure (tool missing, can't tell, signed out, a failed
        download, a sign-in stopped or stuck, another copy found first, copy failed, key rejected,
        and the engine's restart cap) and find one entry for each in `setup.log`, with none of
        §7's personal data.
10. **No Terminal unless a step fails.** While the switch is on, no journey asks the person to open
    Terminal or paste anything into it, unless an install or sign-in step fails or is stuck.
    *   *Checked by:* the CUJ 1 to 4b tests with the switch on assert that the paste command is
        never shown and Terminal is never opened. The failure tests assert that it is shown then.

## Non-Goals

*   **Typing into the person's own Terminal.** The Install button runs its commands inside
    Tearsheet. The paste command, kept for a "no" from Anthropic, is pasted by the person.
*   **Reading Claude Code's or Codex's credential files.**
*   **Apple Developer ID signing, notarization and auto-update.** These are the planned way to
    remove the macOS block and the Keychain prompts that each new build brings. Until then each
    update costs those prompts again, and that is accepted.
*   **Intel Macs.** The build is Apple Silicon only. The first-open steps say how to check.
*   **A public launch.** The link is shared only with the owner's friends who test it, and isn't
    announced. The repository is public, though, so anyone who finds it can download a copy. A
    public launch waits on Anthropic's and OpenAI's answers, for the button and for Tearsheet
    using people's plans at all.
*   **Removing the Massive key.** Its sign-up clicks happen on massive.com, outside the window.
*   **Cutting clicks outside the window,** beyond clearer instructions and links that go straight to
    the right page.
*   **The FRED key during setup.** It is offered after the first report, using Home's existing
    "Economic figures aren't connected" prompt.
*   **An API-key option in setup.** Settings keeps the owner's existing billing setting.
*   **A feature flag for the new screen.** It replaces the old screens. Backing out is a git revert.
*   **A CI release workflow.** One local script builds and uploads.

## Open Questions

Facts the code depends on. Each has a default that the code uses until the answer is known, so
building never waits on it.

| Question | What depends on it | Default until it is settled | Settled when |
| :-- | :-- | :-- | :-- |
| The safety check's share of a 5-hour usage window, on Claude and on Codex | The plan-usage entry in Non-Functional Requirements | Nothing waits on it. The number is written there once measured. | Stage 1: one `tearsheet-engine lockdown-check` per tool on a throwaway data folder, with each call's rate-limit reading in the check's report (§5) |
| What `subscriptionType` says for Free, Pro, Max, Team and Enterprise | Telling a paid Claude plan from a free one (D4) | Only `free` counts as a free plan. Any other value counts as ready, and its value is logged. | The owner's reading, then the first friends' setup logs |
| What a Massive key looks like, and which massive.com page shows it | The local shape check before a key is sent | Only spaces, a URL, `curl`, `~` and `@` are refused. Anything else goes to Massive's own check. | The owner's key, and the key-check codes in the logs |
| Whether `claude auth status --json` always includes `email` | The email suggestion | A missing email gives a field to type in | The first friends' setup logs |
| Whether `codex login status` can refresh tokens, and its exit codes on 0.165 | Whether a read could sign someone out of Codex | Read one at a time, at most every 5 seconds, never killed. The message decides, not the exit code. | Reading `login.rs` at 0.165 before Stage 0's probe change |
| Which Codex versions print today's status messages | Reading an older Codex's status | A message Tearsheet doesn't know reads "can't tell", which has its 2-minute way out (CUJ 5). Codex has no minimum version. | Reading older `login.rs` tags, if a friend's log shows "can't tell" |
| Whether Claude Code's install step always uses `~/.local/bin` | The paste command's sign-in path | The Install button signs in by the path it finds. Only the paste command uses `~/.local/bin`. | The Stage 3 real run |
| Whether macOS blocks `Tearsheet Engine` separately in a browser download | The first-open steps | The steps cover a second box, and the restart cap shows them (§8) | The Stage 3 real run |
| Whether an ad-hoc-signed zip shows "damaged" after it is unzipped on macOS 27.2 | The first-open steps | The steps cover "damaged". The DMG is the main download. | The Stage 3 real run |
| How long Open Anyway stays in System Settings after a block | The first-open steps' wording | The steps say to click Open Anyway right after the block | The Stage 3 real run |
| Whether Claude Code's macOS sign-in depends on `HOME` | Any test that points `HOME` somewhere else | No test changes `HOME`. The stand-ins keep their state in their own file. | Only if a test needs to change `HOME` |
| Anthropic's answer on the Install button, and on Tearsheet using people's Claude plans | Whether the button ships at launch | The button is on for the owner and friends (the owner's choice). The switch turns it off. | Before launch: the owner asks |
| OpenAI's answer for Codex | The same, for Codex | The same | Before launch: the owner asks |
| Whether `open -a Terminal ~` always opens a new window | The paste-command fallback | The card says to paste into the Terminal window that just opened, and the command works in any window | The Stage 2 runs with the switch off |

## Critical User Journeys (CUJs)

Click counts follow goal 1's rule. The click-count tests are written from these.

**The clicks, journey by journey** (with the Install button on):

| Journey | Clicks inside Tearsheet's window | Total |
| :-- | :-- | --: |
| CUJ 1: Claude Code already set up | Get a free key (1). Back from massive.com onto the key field (2). ⌘V. Start (3). | 3 |
| CUJ 2: Brand-new Mac, Claude plan | Install Claude Code (1). Sign in, in the browser. Back onto Get a free key (2). Back onto the key field (3). ⌘V. Start (4). | 4 |
| CUJ 3: Only Codex, already set up | Get a free key (1). Back onto the key field (2). ⌘V. The email field takes the focus: type the email. Start (3). | 3 |
| CUJ 4: Brand-new Mac, ChatGPT plan | Install Codex (1). Sign in, in the browser. Back onto Get a free key (2). Back onto the key field (3). ⌘V. Type the email. Start (4). | 4 |
| CUJ 4b: Brand-new Mac, both plans | Install both (1). Sign in to Claude, then to ChatGPT, in the browser: the ChatGPT page opens by itself when the Claude sign-in ends. Back onto Get a free key (2). Back onto the key field (3). ⌘V. Start (4). | 4, or 5 |

*   **Return in the email field also presses Start**, so a typed email saves one more click.
*   **CUJ 4b's 5th click.** If the person comes back to Tearsheet between the two sign-ins, the
    second one brings the browser forward again, and getting back costs one more click. The tests
    check both paths: 4 clicks, and 5.
*   **With the switch off,** the first click is "Copy and open Terminal" instead. Once the copy
    works, the card moves on to the price key, so the click back from the browser lands on Get a
    free key, as it does with the button. The counts are the same.
*   **A click that only brings the window forward never presses Install** (§4, Focus). Coming back
    to an Install button therefore costs one more click. No journey above does that.

### CUJ 1: Claude Code already set up

*   **Given**: Claude Code is installed and signed in to a paid Claude plan. Tearsheet has never
    been opened. There is no Massive key.
*   **When**: The person opens Tearsheet, gets a free Massive key, pastes it, and finishes.
*   **Then**: Setup shows "Signed in as you@x.com, Claude Max" and the email with Change, without a
    click. The first report starts within 3 clicks. The safety check began at the first click, and
    the report waits for it with "Starts when the safety check finishes (n of 25)".
*   **With the switch off**: no change, because nothing is installed.

### CUJ 2: Brand-new Mac, Claude plan

*   **Given**: No Claude Code, no Codex, no npm. The person has a paid Claude plan.
*   **When**: They press Install Claude Code, sign in at claude.ai when the browser opens, come
    back, get a Massive key, paste it, and press Start.
*   **Then**: Tearsheet runs the official installer and the sign-in, and shows their progress in the
    window. The person doesn't open Terminal. The screen notices the sign-in when the window comes
    back. The first report starts within 4 clicks.
    *   **If the download fails,** the card says so and offers Try again and the paste command.
    *   **If the browser doesn't open** within 15 seconds, the AI row offers "Open the sign-in
        page".
    *   **If the sign-in hasn't finished after 2 minutes,** the AI row also offers the paste
        command, which runs in Terminal, where Claude Code can take a pasted code. Copying it stops
        the in-app sign-in first.
*   **With the switch off** (if Anthropic says no): one paste command takes the button's place,
    and the person pastes it into a new Terminal window. It signs in by full path, so it is never
    "command not found". It stops with the download's error if the download fails. Still within
    4 clicks.

### CUJ 3: Only Codex, already set up

*   **Given**: Codex is installed and signed in with ChatGPT. There is no Claude Code.
*   **When**: The person opens Tearsheet.
*   **Then**: Setup picks Codex by itself and never says Claude Code is missing. It asks for the
    email because Codex does not provide one. Once the key works, the email field takes the focus.
    The first report starts within 3 clicks, plus typing the email.
*   **With the switch off**: no change, because nothing is installed.

### CUJ 4: Brand-new Mac, ChatGPT plan

*   **Given**: No tools and no npm. The person has a paid ChatGPT plan.
*   **When**: They press Install Codex, sign in at chatgpt.com when the browser opens, come back,
    add the key and the email, and press Start.
*   **Then**: Tearsheet runs OpenAI's official installer with its questions turned off, so Codex
    does not open itself before signing in. No Node.js is needed, and no Terminal. A failed
    download or a stuck sign-in is handled as in CUJ 2. The first report starts within 4 clicks.
*   **With the switch off**: the same steps are one paste command. Still within 4 clicks.

### CUJ 4b: Brand-new Mac, both plans

*   **Given**: No tools. The person pays for a Claude plan and a ChatGPT plan.
*   **When**: They press Install both, sign in to Claude and then to ChatGPT in the browser, come
    back, add the key, and finish.
*   **Then**: Both tools install one after the other, then both sign-ins run one after the other.
    The list shows two connected rows: "Claude Code writes your reports" and "Codex checks each
    draft". The first report waits only for Claude Code's safety check. Codex checks each draft
    from the first report on, after the same 5-call short check any tool gets before its first
    call. Within 4 clicks, or 5 if the person comes back between the two sign-ins.
*   **With the switch off**: one paste command installs both and runs both sign-ins. The same
    counts.

### CUJ 5: Installed, but not ready

*   **Given**: The tool is installed but signed out, too old, on a free plan, signed in with an API
    key, or giving no clear answer.
*   **When**: The person opens setup.
*   **Then**: Each case gets its own plain sentence and at most one install or sign-in button.
    With the switch off, that button becomes the paste command for the same steps.

    | Case | What the person reads | The button, and what it runs |
    | :-- | :-- | :-- |
    | **Signed out** | "Claude Code is signed out." | **Sign in to Claude Code**: only the sign-in, at the path that was found. No reinstall. |
    | **Too old** (Claude Code before 2.1.317) | "This Claude Code is too old for Tearsheet." | **Update Claude Code**: the installer again, then a sign-in only if still needed. Only for a copy in the official folder (`~/.local/bin`). A copy installed another way, such as Homebrew or npm, gets no button: "This Claude Code was installed another way (<folder>). Update it the way you installed it." |
    | **Free plan** | "Claude Code needs a paid Claude plan, like Pro or Max." | **Sign in again**, for after upgrading on claude.ai: `claude auth login`. |
    | **API key, Claude Code** | "This sign-in uses an API key. Tearsheet runs on your Claude plan." | **Sign in with your Claude account**: `claude auth login`. |
    | **Not a ChatGPT sign-in, Codex** (an API key, an access token, Amazon Bedrock or workload identity) | "This Codex sign-in doesn't use your ChatGPT plan. Signing in with ChatGPT replaces it for all your Codex use, not only Tearsheet's." | **Sign in with ChatGPT**: `codex login`, which signs out first. |
    | **Can't tell** | "Checking your Claude sign-in…". After 2 minutes: the folder and version found, with Try again and Show log, and "Use Codex instead" when Codex is ready. | No install or sign-in. |

*   **Codex's plan can't be read.** Its status says "Logged in using ChatGPT" but not which plan.
    A free ChatGPT account therefore reads ready. If it can't run the safety check, the check's
    reason is shown, and a brand-new install's reports wait until a check passes (§5).

### CUJ 6: The first report during the safety check

*   **Given**: Setup has just finished and the safety check is at 8 of 25.
*   **When**: The person asks for a report.
*   **Then**: The report joins the line and shows the check's progress. The safety chip, which
    shows in the toolbar after setup, has "Stop the check". If the check fails, is stopped or
    can't finish, the waiting report shows why and offers "Run it again". On a brand-new install, a report asked for later, before any check has
    passed, starts the check again and waits for it.

### CUJ 7: The owner tests the brand-new-Mac path on his own Mac

*   **Given**: The owner's real Tearsheet may be open and running reports. His Claude Code and Codex
    are signed in.
*   **When**: He runs `scripts/try-new-user.sh --state claude=missing` (or `signed_out`,
    `signed_in`, `too_old`, `api_key`, and the same for `codex` except `too_old`), and goes
    through setup in the
    test copy.
*   **Then**: The test copy is in test mode, with its own Keychain name and data folder.
    *   **With the Install button,** the stand-in installers run. They put a stand-in program at
        the test paths, and its sign-in only changes the test folder's state file.
    *   **With the switch off,** the copy button copies the stand-in's command, never the real
        installer.
    *   **The safety check is a canned one.** It makes no AI calls, saves nothing, and passes,
        fails or stops partway as the state file says. The stand-ins answer only the version,
        status and sign-in commands, so nothing in a test copy reaches his real tools.
        Measuring the real check's plan usage is a separate command-line run (§6).
    *   **Reports are off.** A report joins the line, then stops with "Reports are off in a test
        copy", before any data or AI call.
    *   His keys, sign-ins and real app are unchanged afterwards.
    *   These runs need the new screen, so they happen from Stage 2 on.

### CUJ 8: Downloading from the link

*   **Given**: A friend has the release link, on a Mac with Apple Silicon and macOS 27.2. They have
    no GitHub account.
*   **When**: They download the DMG (or the zip), open it, move Tearsheet to Applications, and
    open it.
*   **Then**: The first-open steps, in the release notes and in the DMG window, take them past
    macOS's block: "Click Done, not Move to Trash", then Privacy & Security, then Open Anyway.
    They also cover a "damaged" message and a second box for `Tearsheet Engine`. The setup screen
    appears. If macOS stops the engine, the app shows a plain error with those steps instead of
    restarting it without end.

### CUJ 9: The owner's existing install

*   **Given**: The owner's real install has `setup_done` set and reports in its database.
*   **When**: He updates to the new build.
*   **Then**: Home opens as before. Setup does not run again. No setting is lost. Codex goes on
    checking drafts while it is signed in with ChatGPT (§1, "Which tool checks").

### CUJ 10: Anthropic says no after friends have copies

*   **Given**: Friends have copies with the Install button. Anthropic tells the owner no.
*   **When**: The owner changes the online off switch's file to `off`, and turns `INSTALL_BUTTON`
    off for new builds.
*   **Then**: Each copy reads the file each time it opens. From its next launch it shows the
    paste command where the Install button was, in setup, on Home and in Settings. An Install
    pressed before then is refused, and the card shows the paste command. A copy that can't reach
    the file keeps the last value it read.

## Technical Plan (Architecture)

The screen is **version 6** on the design canvas
(https://claude.ai/artifact/EgihdYmRw8Pw61kRSrjL7W): a short list of three rows on top (Your AI,
Price key, SEC email), and under it one question at a time (connect the AI, then the price key,
then the email and Start).

### How the pieces fit

```text
 ┌─────────────────────────── Window (renderer) ───────────────────────────┐
 │  Setup screen, version 6                                                │
 │    three small state machines: tool · email · safety check              │
 │    screenView(...) decides what shows, where focus goes, if Start works │
 │  Home: a report asked for during the check joins the line               │
 └───────┬──────────────────────────────────────────────────────▲──────────┘
         │ fixed, named calls (never command text)              │ pushed events
         ▼                                                      │
 ┌─────────────────────────── Main process ─────────────────────┴──────────┐
 │  toolWatch   one status read at a time → tools_changed                  │
 │  toolSteps   one list of install and sign-in steps                      │
 │  installer   runs that list one step at a time → install_progress       │
 │  pasteCommand  joins that list into the paste command (the fallback)    │
 │  terminal    copies the command, opens a new Terminal window            │
 │  setupLog    logs/setup.log, with none of §7's personal data            │
 └───────┬─────────────────────────────────────────────────────────────────┘
         │ JSON-RPC over standard input and output (as today)
         ▼
 ┌─────────────────────────── Engine ──────────────────────────────────────┐
 │  cancel_safety_check (new); a stopped check pauses waiting reports      │
 │  the line waits for the safety check                                    │
 │  checks drafts with Codex only on a ChatGPT sign-in                     │
 │  test mode (TEARSHEET_TEST_TOOLS): canned check, no reports             │
 │  test switches: Keychain name; a set program path is final              │
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
    seconds counts as "can't tell", and no new read of that tool starts until the earlier one has
    ended. This adds no kill to the sign-out bugs in the changelog. The versions with those bugs
    are handled by the next rule.
*   **Too old first.** The version is read first (`--version`, which is quick and safe). Claude
    Code before 2.1.317, the version with the last status-command sign-out fix, counts as too old,
    and its status command is never run. Codex has no minimum: a status message Tearsheet doesn't
    know reads "can't tell".
*   **What it reads, from the stream each tool uses.**
    *   **Claude Code** writes its JSON to standard output. From it Tearsheet reads `loggedIn`,
        `authMethod`, `apiProvider`, `subscriptionType` and `email`.
    *   **Codex** writes its status message to standard error (`login.rs` prints it with
        `eprintln!`). Only "Logged in using ChatGPT" is a plan sign-in. "API key configured" and
        "Logged in using" an access token, a personal access token, Amazon Bedrock or workload
        identity are not. "Not logged in" is signed out.
    *   **The other stream** is ignored. Recorded real outputs, each with the stream it came on,
        are kept as test fixtures.
*   **One answer per tool.** Each tool's status becomes one of: missing, too old, can't tell,
    signed out, signed in some other way than a plan (`api_key`), free plan, or ready. The window
    shows a sentence for each. "Can't tell" never shows an install or sign-in.
*   **Defaults for the unknowns.**
    *   A `subscriptionType` value Tearsheet doesn't know counts as ready, and its code is logged.
    *   A missing `email` gives a field to type in.
*   **Sign-ins set in a shell profile.** An app opened from Finder doesn't see `CLAUDE_CONFIG_DIR`
    or `CODEX_HOME` set in the person's shell profile. The login-shell read that fixes the PATH
    (`loginShellPath.ts`) also takes these two, and they are passed to the status reads and the
    engine. So Tearsheet reads the same sign-in as Terminal.
*   **The window opens first.** The first status read runs while the window loads. The engine no
    longer waits for it, because it no longer gets the tool paths from it.
*   **One picture of a tool.** `ToolStatus` is written once, in a shared file used by both the
    main process and the window, instead of twice as today.
*   **The engine finds the tools itself.** The main process stops passing fixed program paths to
    the engine at launch, and passes only the PATH. The engine already looks a program up each time
    it needs one. So the window and the engine always find the same program, including one
    installed after launch, with no restart. A program path set for a test launch is final in both.
*   **Which tool writes.** Only setup decides this. One function, `pickTool`, proposes the first
    ready tool, Claude Code before Codex, and Start saves it as `primary_tool`. After setup, the app
    and the engine both use the saved `primary_tool`, as they do today, so a signed-out tool still
    shows "Sign in again".
*   **Which tool checks.** When Codex would be the checking tool, the engine checks how it is
    signed in before any call. Its connector already asks Codex at launch (`account/read`). If it
    isn't a ChatGPT plan sign-in, and API billing is off, Codex doesn't check drafts and the draft
    is checked by the writing tool, as when no second tool is connected. So a Codex signed in with
    an API key isn't billed for checks. The rule is in the engine, so it holds for the command line
    too. (Claude Code as the checking tool keeps today's per-answer sign-in check.)

### 2. Installing from inside the app (Stages 0 and 2)

*   **One list of steps.** A new main-process module, `toolSteps`, turns the person's pick and each
    tool's status into an ordered list of steps: installs first, then sign-ins, one tool at a time.
    *   **Every rule lives in it once:**
        *   the official installers;
        *   `pipefail`;
        *   `CODEX_NON_INTERACTIVE=1`, so Codex's installer asks no questions;
        *   "too old means install again";
        *   "Codex's sign-in never on a Codex that reads ready";
        *   "in test mode, never the real installers".
    *   **The Install button** (`installer`) runs the list one step at a time.
    *   **The paste command** (§3) joins the same list into one command.
    *   **The window** can only say which tools to set up, never what to run.
*   **Re-planned after every step.** After each step, the button reads the tools' status again and
    asks `toolSteps` for the rest of the list.
    *   **Sign-ins use the path the status gives.** So a Codex installed by Homebrew signs in where
        it really is, and a test launch signs in its stand-in.
    *   **A step that is no longer needed is dropped.** For example, an update that left the tool
        signed in needs no sign-in.
    *   **Each step runs at most once per click.** If the re-plan gives a step that already ran,
        the button stops instead of looping.
    *   **Another copy found first.** After an install, the status may still find a different copy
        first on the PATH, such as an older Homebrew or npm copy that the installer left in place.
        The card then stops with "Another copy at <folder> is found first", with the home folder
        written as `~`, and offers Show log. It never runs the installer again. Claude Code's
        changelog (2.1.277) also records sign-outs when an older copy runs on the same Mac, so
        this is said, not worked around.
*   **The commands are shown before they run.** The connect card shows the exact commands, in small
    type and in full, under "These are the commands Tearsheet runs". It takes them from the same
    list. This keeps the root design's rule ([tearsheet.md](../tearsheet.md) section 12) and costs
    no click.
*   **How a step runs.**
    *   **Installs** run in a shell with `pipefail` on, so a failed download stops with its own
        error.
    *   **Sign-ins** run with their input closed. Neither tool needs a terminal for this (checked
        2026-11-08, see Additional Resources).
    *   **Output** is read from both streams, with terminal codes stripped.
    *   **Done** means exit 0, then a fresh status read that shows the step worked. The tools'
        success messages are only noted in the log.
*   **Codex's sign-in signs out first.** It clears any existing Codex sign-in before it starts.
    *   So it never runs on a Codex that reads ready.
    *   It does run when Codex reads signed out, or signed in some other way than ChatGPT, where
        replacing that sign-in is the point. The card says first that it replaces that sign-in for
        all the person's Codex use, not only Tearsheet's.
*   **A sign-in can be stopped from the window.**
    *   **Claude Code's** saves nothing before it succeeds, so stopping it changes nothing.
    *   **Codex's** has already cleared the old sign-in, so stopping it leaves Codex signed out.
    *   **After a stop,** the status is read again and the card says what it found.
*   **A sign-in that seems stuck.** By then the card has moved on to the price key, so these
    show on the AI row of the list, which is always on screen and doesn't change what is under the
    pointer.
    *   **After 15 seconds,** the row offers "Browser didn't open? Open the sign-in page". The
        main process keeps the sign-in link from the tool's output and opens it itself, only when
        its host is one of the tool maker's sign-in hosts. The link never reaches the window or
        the log.
    *   **After 2 minutes,** the row also offers the paste command. It runs in a real Terminal,
        where Claude Code can take a pasted code. Copying it stops the in-app sign-in first, so two
        sign-ins of one tool never run at once.
*   **Progress.** Output becomes plain steps in the window: downloading, installing, installed,
    opening your browser.
*   **Install both.** Claude Code installs, then Codex, then Claude Code's sign-in, then Codex's,
    one at a time. Codex's sign-in page opens as soon as Claude Code's sign-in ends.
*   **Only what is missing.**
    *   **Installed but signed out:** the button runs only the sign-in.
    *   **Too old:** it runs the installer again, which updates the tool, but only for a copy in
        the official folder. A copy installed another way gets the sentence in CUJ 5 instead.
*   **When something fails.** The question card says what failed in plain words and offers Try
    again. It also shows the paste command, so there is always a next step.
*   **Two switches.** The button shows only when both say on. Each can only turn it off.
    *   **The build switch.** `INSTALL_BUTTON` is on for now in every copy. Turned off, the window
        shows the paste command in the same spot, and the main process doesn't accept install
        calls at all. Both states have click-count tests, so new builds change with one edit.
    *   **The online off switch, for copies already handed out** (owner's choice, 2026-11-08).
        *   **The file.** `release/install-button.txt` in the public repository, holding `on` or
            `off`. Only the owner can change it. Its address is built into each copy.
        *   **When it is read.** Once each time Tearsheet opens, by the main process, with a
            5-second limit. The request is a plain GET with no cookies and no personal data.
        *   **When it takes effect.** At the next launch, so a button never disappears from under
            the pointer. An Install pressed after a fresh `off` is refused, and the card then shows
            the paste command.
        *   **When it can't be read.** The copy uses the last value it read, saved in the data
            folder. A copy that has never read it uses its build's setting.
        *   **In test mode,** the file is read only from `TEARSHEET_SWITCH_URL`, when that is set,
            so tests never reach the real address.
*   **Home's "Sign in again"** uses the same list of steps when the switch is on, and the paste
    command when it is off.
*   **Never the real installers when a test or a path is set.** If `TEARSHEET_TEST_TOOLS`,
    `TEARSHEET_KEYCHAIN_SERVICE`, `TEARSHEET_CLAUDE_BIN` or `TEARSHEET_CODEX_BIN` is set,
    `toolSteps` gives only the stand-in installers from the test folder, or no install step at all.
    A set program path is final, so a second copy installed elsewhere would never be used. The card
    says why: "A program path is set for Claude Code, so Tearsheet won't install another copy".

### 3. The paste command, kept as the fallback (Stage 0)

*   **One command, from the same list.** A new main-process module, `pasteCommand`, joins the
    `toolSteps` list into one command with `&&`. The command can't re-read the status between its
    steps, so a sign-in after an install in the same command uses a fixed path:
    *   the path a test launch set, when there is one;
    *   otherwise the official install folder (`~/.local/bin`), which the PATH fallback
        (`loginShellPath.ts`) also uses.
*   **Copy and open.** One main-process call writes the command with Electron's clipboard, reads
    it back to check it, then opens a new Terminal window (`open -a Terminal` on the home folder),
    never an existing one. It tells the window if the copy failed. Once the copy works, the card
    moves on to the price key, and the AI row keeps a "Show the command again" link.

### 4. The setup screen (Stage 2)

*   **Layout (version 6).** The three-row list sits on top, and under it one question card at a
    time: connect the AI, then the price key, then the email and Start.
    *   When both tools are connected, the AI row shows both: "Claude Code writes your reports"
        and "Codex checks each draft".
    *   While a sign-in waits in the browser, the card moves on to the price key, so the person can
        do both at once.
*   **State.** Three pure state machines (tool, email, safety check) and one `screenView`
    function decide what shows. The component only connects events to them. This replaces the
    nine-step code instead of adapting it.
*   **The price key.** `KeyCard`, shared with Settings, does the whole check, as it does today,
    and Setup only learns that the key works. The check:
    *   runs as soon as a key is pasted, after a local shape check;
    *   runs one at a time, and only the latest answer counts;
    *   clears the field after a rejection;
    *   offers "Try again" when Massive can't be reached.
*   **Focus.**
    *   The window takes the first click (`acceptFirstMouse`), so the click that brings it back also
        presses the button under it.
    *   **Except Install.** An Install button ignores a click that arrives within half a second of
        the window coming to the front, so a click meant only to bring the window back never starts
        an install.
    *   After a trip to massive.com, the key field gets the focus, if the key is still missing and
        the person hasn't focused anything else.
    *   Once the key works, the email field gets the focus if the email is empty or being changed.
        Return in the email field presses Start.
*   **The email.** SEC asks every program that downloads its filings for a contact email, and
    Tearsheet sends it with each filing download, to no one else. It is filled in from Claude Code's
    status when none is saved, shown in full with Change, and saved only at Start. Codex users
    type it. A suggestion never replaces an email the person typed. The engine's email rule
    decides: the window's check only enables Start, and the engine's answer is shown if it says no.
*   **Start.**
    *   It saves the tool and the email with the engine's existing `set_setting`, which already
        checks each value, then writes `setup_done` last. A failure partway leaves setup open with
        what was saved, so nothing is lost.
    *   Home then opens with the company field focused.
*   **What is deleted.** The nine-step screens and their code: Welcome, How it works, Looking for,
    Install, Connected, Ready, the old switched-off one-click screen, the npm command and the
    nodejs.org link.
    *   The parts other pages use (safety state, tool words, small helpers) move out of `steps.ts`
        first, so nothing else breaks.

### 5. The first report and the safety check (Stage 0)

*   **When it starts.** The person's first click in setup (Install, or "Get a free key") is the
    go-ahead. The check starts then if the writing tool is ready, and otherwise by itself the moment
    it becomes ready. It never starts when the window opens. It doesn't start at all if a full
    check has already passed for that tool's version, for example when setup opens again after a
    failed Start.
*   **The first report waits instead of being refused.** If a check is running, Home adds the report
    to the existing line, which already waits for the check. It says "Starts when the safety check
    finishes (n of 25)".
*   **Stop the check.** A new engine method, `cancel_safety_check`, backs the chip's "Stop the
    check". It lets the call in progress end and then stops, so no AI tool is killed partway. The
    chip says "Stopping after this call" meanwhile.
*   **Progress survives a reload.** The engine keeps the running check's progress and sends it with
    the settings. A window that reloads mid-check shows the real count, not "0 of 25". The chip
    also shows the minutes so far.
*   **A check that doesn't pass.** It can end in three ways without passing. Each uses what the
    engine already stores, and nothing new is saved.
    *   **It fails.** The engine's existing block applies, as today: a failed full check saves
        `lockdown_failed`, every AI step is refused, and a waiting report ends with
        `LOCKDOWN_FAILED`, which pauses the line. The report shows the reason with "Run it again".
        After a full pass clears the block, its Resume writes it.
    *   **The person stops it, or it can't finish** (a usage limit or a sign-in error partway).
        Nothing is saved, as today. If the writing tool has never had a check recorded (no
        `tool_versions` row: a brand-new install), the line pauses with the new
        `SAFETY_CHECK_STOPPED` or `SAFETY_CHECK_UNFINISHED`. This happens only when reports are
        waiting and the line isn't already paused; a pause already set is kept. The waiting
        report shows the reason with "Run it again", and a later full pass carries the line on.
    *   **A tool that was checked before** keeps today's rule: its next report runs the 5-call
        short check first. So stopping a check in Settings, or a usage limit partway through one
        after a tool update, changes nothing for the owner.
*   **A report asked for before any check passed.** On a brand-new install, when the writing tool
    has no check recorded and none has passed while the app has been open, Home starts the safety
    check and adds the report to the line, which waits for it. The window reads this from the
    existing `lockdown` field in the settings.
*   **Plan usage is recorded.** Each check call's rate-limit reading is copied into the check's
    report file, so the Stage 1 measurement has its numbers.
*   **Two tools.** The checking tool works as it does today, with one added condition: Codex
    checks drafts only on a ChatGPT sign-in (§1, "Which tool checks"). Once connected, it checks
    each draft, after the 5-call short check every tool gets before its first call. Setup runs the
    full check only for the writing tool, so the first report never waits for two checks.

### 6. Testing the brand-new-Mac path on the owner's Mac (Stage 1)

*   **Test switches.** The test script sets them; the app never does:
    *   a test Keychain name (`TEARSHEET_KEYCHAIN_SERVICE`), so his real Massive key is never seen
        or replaced;
    *   a fresh data folder (`TEARSHEET_DATA_DIR`, which the app also sets in normal use);
    *   program paths (`TEARSHEET_CLAUDE_BIN`, `TEARSHEET_CODEX_BIN`) pointing into a test folder.
        A set path is final in the window and the engine, so the real tools are never found. These
        are also the engine's ordinary path overrides;
    *   `TEARSHEET_TEST_TOOLS`, the test folder, which holds the stand-in installers and the state
        file.
*   **Two separate rules.**
    *   **No real installers** when any test switch or program path is set (§2). This rule is
        broad on purpose.
    *   **Test mode** is on only when `TEARSHEET_TEST_TOOLS` is set, which the test script always
        does and nothing else does. A program path alone doesn't turn it on. The main process
        and the engine each read it in one function. In test mode:
        *   the safety check is a canned one: 25 progress steps with no AI call, ending as the
            state file says (passed, failed or couldn't finish). It never saves a result, so it
            can never mark a real tool as checked. An ending that doesn't pass pauses waiting
            reports with its code, so each message can be seen;
        *   saving a Massive key starts no price download, so a test copy doesn't share the free
            key's 5-calls-a-minute limit with the real app;
        *   grading doesn't run;
        *   a report in the line stops before any data or AI call, with "Reports are off in a test
            copy".

    So no switch for SEC's request limit is needed. SEC asks programs to stay under 10 requests a
    second, and a test copy beside the real app could push the two over it together. But SEC is
    only asked by a report or by grading, and both are off in test mode.
*   **Stand-ins.** The stand-in installers put a small stand-in program at those test paths.
    *   The stand-in "installs" by putting a small script in the test folder.
    *   It "signs in" by changing a state file. Its Codex sign-in sets "signed out" first, as the
        real one does.
    *   It answers the version, status and sign-in commands itself, on the same stream as the real
        tool, and fails any other command. So nothing in a test copy reaches his real tools.
*   **Measuring the check's plan usage** needs real calls, so it doesn't use a test copy. It is one
    `tearsheet-engine lockdown-check --tool claude` and one `--tool codex`, each with `--data-dir`
    on a throwaway folder. They run the same `run_check` as the app, on his real tools, and the
    report file has each call's rate-limit reading (§5). Nothing signs in or out.
*   **One launch script** starts such a test copy. It compares the real tools' sign-in status,
    paths and versions before and after.
*   **When it runs.** The full CUJ 7 runs need the new screen, so they happen in Stage 2. Until
    then, the old screens would still copy the real install command. Stage 1 delivers the test
    tools and the two measurement runs.
*   **Click-count tests** in `Setup.test.tsx` cover every journey (CUJ 1 to 4b), with the switch on
    and off, and fail when a count goes over. They are built with the screen, in Stage 2
    (item 35).

### 7. Logs (Stage 0)

*   **The setup log.** A new main-process module writes `logs/setup.log` with one timestamped entry
    per event:
    *   where the PATH came from;
    *   each status read: path, exit code, time taken, and the status it turned into;
    *   each install step;
    *   copy and Terminal results;
    *   key-check codes, read from the answers passing through the main process.

    The window sends no log entries of its own. Every failure the log needs is already visible in
    the main process.
*   **No personal data.** The log never holds:
    *   an email;
    *   a key;
    *   an account or organisation ID;
    *   a sign-in link;
    *   a tool's raw output;
    *   the home folder's name: paths are written with `~`.

    Every other place in this design that mentions personal data means this list.
*   **The engine's side.** The engine log gets timestamps, and the app's safety check writes its
    report file as the command-line check already does, with each call's rate-limit reading.
*   **Show log in Finder.** Settings has this button next to the AI tools, so the log is easy to
    find and send.

### 8. The download (Stage 3)

*   **Where it goes** (owner's choice, 2026-11-08). A release on the project's own GitHub
    repository, which the owner makes public before the first friend's copy. People may read and
    use the code, but only the owner can change it: on GitHub, others can only copy it to their
    own account (a fork) or propose a change for him to accept. Anyone with the link downloads
    without a GitHub account.
*   **Why not a private repository.** A private release can only be downloaded by accounts that
    can see the repository. On a personal GitHub account there is no read-only access: anyone
    invited can also push changes.
*   **Before it goes public.** The owner makes the repository public himself; the script never
    changes it. First he runs a secret scanner (`gitleaks` or `trufflehog`) once over the whole
    history. After that, GitHub's own secret scanning watches new pushes. The repository already
    has an MIT licence (`LICENSE`), which lets people use the code, and item 40 adds the notice
    for the code adapted from Realm.
*   **One local release script** does the whole release:
    *   it builds the engine and the app;
    *   it makes the DMG with macOS's own `hdiutil`: the app, a link to Applications, and "How to
        open Tearsheet.txt";
    *   it makes the zip with `ditto`, then checks the unzipped copy's signature;
    *   it writes SHA-256 checksums and the release notes with the first-open steps;
    *   its summary shows both switches and "Anthropic approval: not yet".
*   **Nothing goes up without a yes.** It asks before creating the release and before each upload.
*   **Engine restarts are capped.** If macOS stops the engine, the app restarts it at most 3 times
    in 30 seconds. After that it shows the error with the first-open steps.
*   **The real test.** One real run from a browser download, on a second macOS account the owner
    creates.

### 9. Data, compatibility and backing out (all stages)

*   **What's new in the data.**
    *   one engine method, `cancel_safety_check`, and the check's progress in the settings;
    *   the pause codes `SAFETY_CHECK_STOPPED` and `SAFETY_CHECK_UNFINISHED`, and the report code
        `TEST_COPY`;
    *   two entries in the outside-services list: GitHub, and the install scripts (Goal 6,
        item 41);
    *   the window's events `tools_changed` and `install_progress`;
    *   `install-switch.json` in the data folder, and `release/install-button.txt` in the
        repository (Stage 2).
*   **Shared definitions.** The engine's protocol file and the window's copy of it are regenerated
    together.
*   **No database change.** An install that is already set up opens on Home as before.
*   **The old FRED-skip setting** is still read but no longer written, so a git revert back to
    the old screens still works.
*   **Backing out** is a git revert of each stage.

## Risks and Mitigations

| Risk | Effect | How it is noticed | Handling | Status |
| :-- | :-- | :-- | :-- | :-- |
| Anthropic says no to the Install button | Copies run the claude.ai sign-in from a third-party app without approval, including copies already handed out | Anthropic's answer to the owner | Both switches (§2): the build switch for new builds, and the online off switch for copies already handed out, from their next launch | Accepted by the owner for friends testing. Open until Anthropic answers. |
| The online off switch misses a copy, or is changed by someone else | A copy that never reaches the file keeps the button after a "no". Anyone who could push to the repository could turn the button off. | Each read and its result are in the copy's setup log | The copy keeps the last value it read. The file can only turn the button off. Only the owner can push. | Accepted |
| OpenAI's terms for Codex are unchecked | The same, for the ChatGPT sign-in and Codex use | The owner reads them before launch | The same switches cover Codex's button | Accepted for friends testing |
| The repository is public | Anyone who finds it can read the code and download a copy with the Install button, not only friends. Its whole history is public, including the author email on each commit. | The release's download counts (`gh release view --json assets`) | The link isn't announced. The online off switch covers the button. A secret scan of the whole history before it goes public, then GitHub's secret scanning. Only the owner can change the code. | Accepted (owner's choice, 2026-11-08) |
| The notice for code adapted from another project is missing | The MIT licence (`LICENSE`) covers Tearsheet's own code, but the code adapted from Realm needs its notice, which `THIRD-PARTY-NOTICES.md` should hold and doesn't yet | The release script's check (item 40) | Item 40 creates the file, and the script stops without it | Handled |
| The vendors' install scripts are fetched live and run inside the app | A changed or compromised script runs with the person's rights, with no Terminal window to watch | Not by the app | Only the two official HTTPS addresses, listed in the outside-services list. The commands are shown in full before they run. Progress is logged, without §7's personal data. This is the same risk as pasting the vendors' own commands. | Accepted: it is the vendors' documented install path |
| The installers change over time (folder, questions, messages) | An install reports success but the tool isn't found, or a question blocks it | The fresh status read after each step, and the setup log | "Done" is exit 0 plus a fresh status read, not a message. Installs have a 10-minute limit. Each command carries the date it was checked. | Open: checked again before each release |
| An older copy of a tool is found first on the PATH | The installer runs in a loop, and an older Claude Code on the same Mac can sign the person out (changelog 2.1.277) | The fresh status read after an install | Each step runs once per click. The card stops with "Another copy at <folder> is found first". A too-old copy outside the official folder is never updated by the button. | Handled |
| Claude Code's status command signs people out on older versions | A read every 5 seconds could sign the person out of every session | Goal 3's before-and-after compare | Before 2.1.317 counts as too old, and its status is never read. A status read is never killed. | Handled |
| Plan usage spent by checks and tests | The safety check spends 25 calls of the person's plan. Tests could spend the owner's. | The check's report file, with each call's rate-limit reading | Nothing before the first click. A canned check in test mode. Two command-line runs measure the real cost. | Handled. The share is measured in Stage 1. |
| A stand-in reaches the real tool | A test signs the owner in or out, or updates his Claude Code | `try-new-user.sh`'s before-and-after compare | The stand-ins fail every command but version, status and sign-in. A set path is final. No real installer runs when a test switch or path is set. | Handled |
| A free ChatGPT account reads ready | Codex is picked, and its safety check fails or can't finish | The check's result | The check's reason is shown, and a brand-new install's reports wait until a check passes (§5) | Accepted: Codex's status doesn't show the plan |
| `CLAUDE_CONFIG_DIR` or `CODEX_HOME` set only in a shell profile | An app opened from Finder reads a different sign-in, and shows a signed-in person as signed out | Signed out on screen while Terminal says signed in | The login-shell read takes both variables | Handled |
| The build is unsigned | macOS blocks the app. Friends must use Open Anyway, and each update repeats it and the Keychain prompts. | The first-open steps | Written steps in the DMG and the release notes | Accepted until Developer ID signing |
| macOS blocks `Tearsheet Engine` | The app opens but can't write reports, and would restart the engine without end | The restart cap: 3 restarts in 30 seconds | The cap shows the first-open steps | Open until the Stage 3 real run |
| Support load for friends | The owner answers setup problems by message | Friends' messages | The setup log, "Show log in Finder", and a plain sentence for each failure | Accepted |

## Alternatives Considered

The brainstorm (`concepts_brief.md`, Alternatives Weighed) and the drafting decisions of
2026-11-08 together. Each row says what was given up and why.

### The shape of setup

| Alternative | For it | Against it | Why not chosen |
| :-- | :-- | :-- | :-- |
| Keep the nine screens and fix only what is broken | Little new code. Makes the brand-new-Mac path finishable fast. | Still nine screens, and about 13 clicks when Claude Code is set up. | Not dropped: its fixes that outlive the old screens (the commands, the status reads, the first report waiting) are Stage 0. It is not the end state. |
| The other eight layouts on the canvas (checklist, steps across, one thing at a time, found and left to do, ring, and mixes 7 to 9) | Each reached the click targets. | Each was less clear to the owner than version 6. | The owner tried them and picked version 6. |
| Finish by typing the first company and pressing Return | One click fewer on every path. | Setup has to carry Home's search box. The first report, which becomes an official prediction, starts the moment setup ends. Someone not ready to pick needs a way out, which costs the click back. | The owner chose a Start button. |
| Leave by itself once the key works, with no finish | No finishing click. | The email shown for SEC could disappear before it is read. There is no clear end point to test. | Breaks goal 6 and the click-count tests. |
| A new `complete_setup` engine method and an `email_source` setting | Saves everything in one transaction, and records where the email came from. | Repeats checks `set_setting` already does, and nothing reads `email_source` after setup. | Start saves each value with `set_setting` and writes `setup_done` last. |
| Adapt the nine-step state machine to one screen | Reuses tested code. | Most of it has no job on one screen. | Replaced instead: the shared parts move out and the rest is deleted. |
| A feature flag for the new screen | The old screens stay a click away. | Two setups to keep working in an app with a handful of users. | A git revert backs it out. |

### Installing and signing in

| Alternative | For it | Against it | Why not chosen |
| :-- | :-- | :-- | :-- |
| Only the paste command, for everyone | Within Anthropic's rule today, with no approval needed. | Terminal, ⌘V, Return, and a confusing PATH note. | The owner wants no Terminal. It stays as the fallback behind the button's two switches. |
| The Install button only in the owner's own builds, or also in his private download, or behind a hidden setting | Keeps the button away from friends until Anthropic answers. | Friends would test a different setup from the one meant to ship. | The owner chose the button in every copy for now, and to ask Anthropic before launch. |
| An expiry date built into each copy, after which the button turns itself off | Nothing to do later, and no network read. | The button turns off on that date even if Anthropic says yes, and stays on until then if Anthropic says no sooner. | The owner chose the online off switch. |
| Pulling the download and telling each friend to update | No new code. | Copies already installed keep the button until each friend downloads again. | The owner chose the online off switch. |
| The online off switch's file in a secret gist, applied while the window is open | Takes effect sooner. | With the repository public, the gist's address is public too. A live change can pull a button from under the pointer. | A file in the repository, applied at the next launch. |
| A real terminal inside the app | Shows the exact output. | Needs an extra native add-on in the build. The person never types into it. | A progress panel says enough, and the sign-ins need no terminal (checked). |
| Running the sign-ins through macOS's `script` command to give them a terminal | Would cover a sign-in that needed one. | An extra step that nothing needs. | Not needed: both sign-ins work with no terminal. |
| The bare `claude auth login` command | Short. | A new Mac's Terminal can't find it, because `~/.local/bin` isn't on its PATH. | Replaced by the full path. |
| `npm install -g @openai/codex` | Was Codex's documented command. | A new Mac has no npm. Node from nodejs.org then gives a permission error. | Replaced by the official curl installer. |
| The Codex curl command without `CODEX_NON_INTERACTIVE=1` | OpenAI's plain command. | Its "Start Codex now?" question can open Codex before the sign-in. | The setting turns the questions off. |
| One fixed install-and-sign-in command for every state | One command to maintain. | Reinstalling just to sign in can change the version, throw away a passed check, and leave two copies. | Each state gets its own command, or the button runs only the missing step. |
| Reading the tools' credential files | A quicker answer. | Touches files that belong to Claude Code and Codex. | Ruled out by the owner. The status commands give the same answer. |

### Both plans

| Alternative | For it | Against it | Why not chosen |
| :-- | :-- | :-- | :-- |
| Install one tool now, and offer the other on Home after the first report | Setup stays as short as possible. | The person sets up twice. | The owner chose Install both in setup. |
| Only ever install one tool | The least code. | Someone with both plans loses Codex checking each draft. | The owner chose Install both. |
| Run Codex's full safety check during setup too | Both tools fully checked before the first report. | Checks run one at a time, so the first report waits about 6 minutes instead of 3. | Codex keeps today's short check, so no second full check is needed. |
| Require Codex's full safety check before it may check drafts | Codex would be held to the same check as the writing tool. | Stricter than the project's own rule: after every Codex update, Codex would quietly stop checking drafts until someone clicks Run the check. | Codex keeps today's rule: the 5-call short check before its first call. |
| Pick the writing tool by what is installed, as `choose_tool` does today | Already built. | A signed-out Claude Code is picked over a signed-in Codex. | `pickTool` picks by sign-in first. |

### The safety check and the tools

| Alternative | For it | Against it | Why not chosen |
| :-- | :-- | :-- | :-- |
| Refuse reports while the check runs, as today | No change. | A short setup ends with the first ticker turned away. | The report joins the line and waits. |
| The 5-call short check for the first report | The first report starts sooner. | It skips the link and web-search probes, a weaker check than every later report gets. | The first report waits for the full check (D1). |
| Start the check as soon as the window opens | Done sooner. | Spends 25 calls of the person's plan before they click anything. | It starts at the first click. |
| Read the sign-in status every 2 seconds and cut it off after 5 | Notices a sign-in quickly. | Claude Code's changelog records sign-outs when that command ends mid-refresh. | One read at a time, never cut off, only while the window is in front. |
| Keep the minimum Claude Code at 2.1.41, where `claude auth` arrived | More versions work without an update. | 2.1.41 to 2.1.316 carry the status-command sign-out bugs, and would be read every 5 seconds. | Before 2.1.317 counts as too old. |
| Let the engine run `codex login status` itself before each report | One rule in the engine. | A second owner of status reads, and more reads of a command that may refresh tokens. | The engine uses the sign-in type its Codex connector already reads at launch (`account/read`). |
| The main process saves a list of the tools that read ready, for the engine | Uses the status reads setup already makes. | A second copy of what the engine already knows, which goes stale while the window is in the background, and does nothing for the command line. | Dropped in review: the engine reads the sign-in type itself. |
| A minimum Codex version (the version whose messages were checked) | Catches old output formats. | Not tied to a known bug. An older Codex would hit a dead end and stop checking drafts. | Dropped in review: an unknown message reads "can't tell". |
| A stored safety hold, separate from the engine's lock-down block | One rule for all three endings. | Repeats the existing block, and would hold every report after any stopped check, including the owner's. | Dropped in review: a failed check uses the existing block, and only a never-checked tool is held after a stop. |
| Restart the engine when a tool's path changes, or send the path with each request | Simple to reason about. | A restart kills a running report. A per-request path doesn't reach the line's reports. | The main process stops fixing the paths at launch. The engine looks the program up on the same PATH each time, so nothing has to be sent. |

### Testing and the release

| Alternative | For it | Against it | Why not chosen |
| :-- | :-- | :-- | :-- |
| Test with only a fresh data folder | Nothing new to build. | The Keychain is shared: the key step is skipped, and a pasted key replaces the real one. | Test switches plus stand-ins. |
| A real safety check in every test run | Tests the real check each time. | 25 calls of the owner's plan per fresh test folder, about 400 across the Stage 2 runs. | A canned check in test mode. |
| A test copy whose stand-ins hand the check's calls to the real tools, to measure plan usage | Measures through the app. | Extra switches, and the only way a test copy could reach the real tools. The command-line check already runs the same check. | Dropped in review: one `tearsheet-engine lockdown-check` per tool. |
| Test mode turned on by any test switch, including the program paths | One rule for both jobs. | The program paths are also ordinary overrides, so following the engine's own advice to set one would quietly stop reports and fake the check. | Dropped in review: no real installers when any is set; test mode only from `TEARSHEET_TEST_TOOLS`. |
| Paste the real install command on the owner's account | The most real test. | Updates his Claude Code and signs him in again. | Done once on a second macOS account instead. |
| A macOS virtual machine instead of a second account | Fully separate. | More setup for the same answer. | A second account is enough. |
| electron-builder's DMG target | Standard. | It downloads an extra program, and the build is set up to avoid downloads. | `hdiutil` and `ditto`, both part of macOS. |
| A CI release workflow | Nothing done by hand. | More machinery for a link shared with a few friends. | One local script that asks before each upload. |
| A release on the private repository, with friends invited | The code stays private. | Each friend needs a GitHub account and an invite, and on a personal account an invited person can also change the code. | The owner doesn't want anyone else changing the code. |
| A second private repository that holds only the downloads | The code stays private, and invited people can't change it. | Each friend still needs a GitHub account, an invite and a sign-in to download. | The owner is fine with the code being public. |
| A second public repository that holds only the downloads | One-click download, and the code stays private for now. | A second repository to keep, and releases move again when the code goes public. | The owner is fine with the code being public now. |
| A Google Drive or iCloud link | No GitHub for friends. | A manual upload each release, outside the script. | A GitHub release is one script, and the owner wants the code on GitHub. |
| A Terminal command that lifts macOS's block, instead of Open Anyway | Fewer clicks on first open. | It removes macOS's check for the app, and it's a pasted command again. | The first-open steps describe Open Anyway. |
| Apple Developer ID signing ($99 a year) | Removes macOS's block and the Keychain prompts on each new build. | Cost, and Apple's review steps. | Deferred until a public launch. |

--------------------------------------------------------------------------------

## Non-Functional Requirements

*   **Security and privacy.**
    *   Tearsheet never reads Claude Code's or Codex's credential files.
    *   Data keys stay in the macOS Keychain.
    *   The window can never send command text to the main process.
    *   The setup log holds none of §7's personal data.
    *   Organisation IDs and names never reach the window.
    *   Each launch reads the online off switch's file. The request carries no personal data.
*   **The owner's own setup.** No test touches his real sign-ins, his real Keychain entries or his
    real data folder. Each manual test checks the sign-ins and tools before and after, and test
    mode keeps a test copy from running installers, reports or grading (§6).
*   **Plan usage.** Nothing spends the person's plan before their first click in setup. The safety
    check uses 25 calls. Its share of a 5-hour window is measured in Stage 1's two command-line
    runs and written here.
*   **Rollout and rollback.**
    *   Each stage is its own commit, backed out with a git revert.
    *   There is no database change.
    *   The Install button has two switches: the build switch and the online off switch (§2).

### Additional Resources

*   [concepts_brief.md](./concepts_brief.md): the brainstorm and its decisions D1 to D7.
*   [clicks-today.md](./clicks-today.md): the click count of today's setup.
*   Design canvas with the nine interactive versions; version 6 is the chosen one:
    https://claude.ai/artifact/EgihdYmRw8Pw61kRSrjL7W
*   Claude Code's CHANGELOG, read 2026-11-08: the status-command sign-out fixes in 2.1.301 and
    2.1.317, the sign-outs from an older copy on the same Mac (2.1.277), and `claude auth` from
    2.1.41: https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md
*   **Claude Code 2.1.317's `auth login` code,** read from the installed program on 2026-11-08.
    *   It writes plain lines and opens the browser itself.
    *   It waits for the browser to hand the sign-in back to a local address.
    *   It asks for a pasted code only when its input is a real terminal and that hand-back fails.
    *   When done, it prints "Login successful." and exits 0.
    *   It wraps its sign-in link in terminal link codes.
*   **OpenAI Codex [`codex-rs/cli/src/login.rs`](https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/cli/src/login.rs),
    at tag `rust-v0.165.0`.**
    *   It prints every message to standard error (`eprintln!`).
    *   `codex login status` prints one of: "Logged in using ChatGPT"; "API key configured" with a
        masked key; "Logged in using" an access token, a personal access token, an Amazon Bedrock
        key or workload identity; or "Not logged in".
    *   `codex login` clears any existing sign-in first.
    *   It starts a local sign-in page and opens the browser.
    *   When done, it prints "Successfully logged in" and exits 0.
    *   Only its API-key and access-token sign-ins look for a terminal.
*   **The official install scripts, as of 2026-11-07:** https://claude.ai/install.sh and
    https://chatgpt.com/codex/install.sh. The commands the Install button runs are:
    *   **Claude Code:** `curl -fsSL https://claude.ai/install.sh | bash`, then
        `<path>/claude auth login`.
    *   **Codex:** `curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh`,
        then `<path>/codex login`.
*   [tearsheet.md](../tearsheet.md) sections 4 and 12 to 14, and [report-look.md](../report-look.md)
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

*   **By stage.** Each stage is its own commit. At the end of each, these pass:
    `cd app && npm run typecheck`, `cd app && npm run coverage` (it runs the tests and holds the
    floor in `app/vitest.config.ts`: 91% of lines, 94% of functions, 88% of branches, and the
    separate limits for the `.tsx` screens), and `cd engine && uv run pytest`.
*   **Stage tags inside an item.** A part tagged "(Stage 2)" inside an earlier stage's item is
    built in the Stage 2 commit.
*   **Paths** are from the repository root, in full. "The data folder" means the app's data
    folder (`TEARSHEET_DATA_DIR`), not a repository path.
*   **"The four test variables"** are `TEARSHEET_KEYCHAIN_SERVICE`, `TEARSHEET_CLAUDE_BIN`,
    `TEARSHEET_CODEX_BIN` and `TEARSHEET_TEST_TOOLS` (§6). `TEARSHEET_DATA_DIR`,
    `TEARSHEET_SWITCH_URL` and `TEARSHEET_HIDDEN_WINDOW` are also set by the test script, but are
    not among the four.
*   **"The button is on"** means `INSTALL_BUTTON` is true and the online off switch's value saved
    before this launch isn't `off` (item 2). "The switch" means `INSTALL_BUTTON` only.
*   **Merge main first.** Main moved on after this plan was written (commit f597b24): Settings
    has an eighth topic, About (`app/src/renderer/settings/About.tsx`), and
    `settings/topics.ts`, `test/bridge.ts`, `main/menu.ts` and `main/ipc.ts` changed. Merge main
    before Stage 0 starts, and apply items 11, 23, 28 and 38 to the merged files.

### Stage 0: groundwork

#### 1. `app/src/shared/tools.ts` and `tools.test.ts` (Create)

*   **Type / Scope**: Shared TypeScript module, used by the main process, the preload bridge and
    the window, and its tests.
*   **Proposed Changes**:
    *   **`ToolStatus`, written once.** It moves here from `app/src/main/tools.ts` and
        `app/src/preload/api.d.ts` and gains three required fields:
        *   `state`: one of `missing`, `too_old`, `cant_tell`, `signed_out`, `api_key`,
            `free_plan` or `ready`;
        *   `plan`: the plan label, or null;
        *   `email`: Claude Code only, or null.
    *   **The old fields stay, worked out from `state`,** so readers that only show words keep
        working. `reason` keeps today's meaning.

        | `state` | `available` | `loggedIn` |
        | :-- | :-- | :-- |
        | `missing` | false | null |
        | `too_old`, `cant_tell` | true | null |
        | `signed_out` | true | false |
        | `api_key`, `free_plan`, `ready` | true | true |

        The three readers that decide something move to `state` (item 23): App's `signedOut`,
        Settings' `canCheck`, and Settings' checking-tool tile.
    *   **`installDir(kind, home)`.** `~/.local/bin` for both tools. Claude Code's
        `install.sh` uses it, and Codex's sets `BIN_DIR="${CODEX_INSTALL_DIR:-$HOME/.local/bin}"`
        (both read 2026-11-08).
    *   **`MIN_CLAUDE_VERSION`.** The constant `2.1.317`, the version with the last
        status-command sign-out fix.
    *   **Helpers moved here** so the main process can use them: `versionNumber` and `isEmail`
        from `app/src/renderer/setup/steps.ts`, and `tildePath` from
        `app/src/renderer/settings/settings.ts`. Their importers change in the same commit:
        `settings/settings.ts`, `settings/settings.test.ts`, `pages/Settings.tsx`,
        `setup/details.tsx` and `setup/tool.tsx`, all under `app/src/renderer/`.
    *   **`pickTool(tools)`.** Used only by Setup. Returns the first `ready` tool, Claude Code
        before Codex; else the first tool that isn't `missing`, in the same order; else null.
    *   **Tests:** the `state` table, `pickTool`'s order, and the moved helpers.

#### 2. `app/src/shared/flags.ts` (Create)

*   **Type / Scope**: Shared constants.
*   **Proposed Changes**:
    *   **The switch.** `INSTALL_BUTTON = true`, with a comment that says what turning it off does
        and why it exists (Anthropic's approval). It replaces `ONE_CLICK_ENABLED`
        (`app/src/renderer/setup/steps.ts:10`) and the `OneClick` screen, deleted in item 38.
    *   **The online off switch's address** (Stage 2). `SWITCH_URL =
        "https://raw.githubusercontent.com/LBB2005/Tearsheet/main/release/install-button.txt"`.
    *   **Who reads it.** Only `app/src/main/index.ts` imports this file. No renderer file does:
        App gets "the button is on" from `getInstallButton()` (item 29) and passes it down, so
        every window test can run both ways.

#### 3. `app/src/main/probe.ts` (Modify)

*   **Type / Scope**: Main-process module.
*   **Proposed Changes**:
    *   **Reading.**
        *   `--version` runs first and keeps its 5-second limit. A Claude Code version below
            `MIN_CLAUDE_VERSION` gives `too_old`, and the status command is not run. Codex has
            no minimum.
        *   The status command is never killed. If it is still running after `statusLimitMs` (60
            seconds by default; a parameter, so tests can use a short one), the read gives
            `cant_tell`. Its process is left to finish, its late answer is ignored, and no new
            status read of that tool starts until it has ended.
        *   Terminal escape codes are stripped before parsing.
    *   **One stream per tool.** Claude Code's status is read from standard output, and Codex's
        from standard error. The other stream is ignored.
    *   **Claude Code's answer.** `readStatus(kind, output)` replaces `readLoggedIn` and maps the
        JSON to `state` with these rules, in order:
        1.  no JSON object gives `cant_tell`;
        2.  `loggedIn` false gives `signed_out`;
        3.  `loggedIn` anything but true gives `cant_tell`;
        4.  `authMethod` other than `"claude.ai"`, or a set `apiProvider`, gives `api_key`;
        5.  `subscriptionType` `"free"` gives `free_plan`;
        6.  otherwise `ready`. An unknown or missing `subscriptionType` is written in the log's
            `plan` field.
    *   **Claude Code's details.** `plan` comes from `subscriptionType`, and `email` from `email`.
    *   **Codex's answer.** The first line of standard error that starts with one of these
        decides, so a warning line before it doesn't matter:
        *   "Logged in using ChatGPT" gives `ready`;
        *   "API key configured", "Logged in using access token", "Logged in using personal
            access token", "Logged in using Amazon Bedrock" and "Logged in using workload
            identity" give `api_key`;
        *   "Not logged in" gives `signed_out`;
        *   no such line gives `cant_tell`.
    *   **Login-shell variables.** Each read runs with the `CLAUDE_CONFIG_DIR` and `CODEX_HOME`
        that `loginShellPath()` found (item 9).
    *   **Logging.** Each read logs a `status_read` entry to `setupLog`: path, exit code or
        signal, time taken, and the resulting state.
    *   **The 30-second cache is removed.** `toolWatch` decides when to read (item 5).

#### 4. `app/src/main/probe.test.ts` (Modify) and `app/src/main/probe.fixtures/` (Create)

*   **Type / Scope**: Unit tests with shell-script stand-ins (19 committed today), and recorded
    outputs.
*   **Proposed Changes**:
    *   **Existing tests that change.**
        *   The `standIn` helper gains a stream option, and the Codex cases move to standard
            error.
        *   The `readLoggedIn` block is rewritten for `readStatus`.
        *   The 30-second cache tests are removed.
        *   Whole-object `toEqual` cases gain `state`, `plan` and `email`.
    *   **New cases:**
        *   each `state`, and each `readStatus` rule in order;
        *   escape codes stripped;
        *   each tool read from its own stream only, and a Codex warning line before its status;
        *   a version below the minimum never runs the status command;
        *   a status that sleeps past a short `statusLimitMs` gives `cant_tell`, its process
            isn't killed, and no second read of that tool starts while it runs;
        *   an unknown or missing `subscriptionType` gives `ready`;
        *   no email gives null.
    *   **Fixtures.** Each is kept with the stream it came on.
        *   Recorded on the owner's Mac: Claude Code's status, and Codex's "Logged in using
            ChatGPT", "API key configured" and "Not logged in". Every identifier is replaced
            before it is committed, not only the email: the email becomes `you@example.com`, and
            `orgId`, the organisation name and any account ID become fixed fake values. The
            repository becomes public in Stage 3.
        *   Copied from `login.rs` at `rust-v0.165.0`, and marked as such: the access-token,
            personal-access-token, Amazon Bedrock and workload-identity messages, which the owner
            can't produce.

#### 5. `app/src/main/toolWatch.ts` and `toolWatch.test.ts` (Create)

*   **Type / Scope**: Main-process module and its tests, with a fake clock and a fake probe.
*   **Proposed Changes**:
    *   **One read at a time.** `read(force)` shares any read already under way. Without
        `force`, it returns the last answer when that is under 5 seconds old.
    *   **Told by the window.** `onWindowFocus()`, `onWindowBlur()` and `setWaiting(boolean)`.
        *   While the window is focused and waiting (setup or Home is waiting on a tool), it reads
            every 5 seconds on a timer.
        *   Each time the window comes to the front, it reads once, waiting or not.
        *   While the window is in the background, the timer stops.
    *   **Pushes.** On a change it sends `tools_changed` to the window.
    *   **Tests:** a shared read, the 5-second timer, no timer reads while blurred, one read on
        each focus, and an event only on a change.

#### 6. `app/src/main/toolSteps.ts`, `pasteCommand.ts` and their tests (Create)

*   **Type / Scope**: Main-process modules and their tests.
*   **Proposed Changes**:
    *   **`stepsFor(kinds, tools, { noRealInstallers, testTools })` in `toolSteps.ts`.** This is
        the one place the install and sign-in rules live. `testTools` is the test folder's path,
        or undefined. It returns `{ steps, blocked }`: `steps` is an ordered list of
        `{ tool, kind: 'install' | 'signIn', command }`, and `blocked` a list of
        `{ tool, reason }`.
    *   **Which state gets which steps:**

        | `state` | Steps |
        | :-- | :-- |
        | `missing` | The installer, then the sign-in |
        | `too_old`, in `installDir` | The installer, then the sign-in |
        | `too_old`, anywhere else | None. Blocked: "This Claude Code was installed another way (<folder>). Update it the way you installed it." |
        | `signed_out`, `api_key`, `free_plan` | The sign-in |
        | `ready`, `cant_tell` | None |

        The button re-plans after each step (item 29), so a sign-in that an update made
        unnecessary is dropped there. The paste command can't re-plan, so it keeps it.
    *   **The commands:**
        *   Claude Code's installer: `curl -fsSL https://claude.ai/install.sh | bash`.
        *   Codex's installer:
            `curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh`.
        *   The sign-ins: `<path>/claude auth login` and `<path>/codex login`. The path is the
            one the status gives. The probe gives a set test path even for a missing tool. After
            an install in the same list with no such path, it is `installDir(kind)`.
        *   With `testTools` set, the installers are `<testTools>/install-claude.sh` and
            `<testTools>/install-codex.sh`.
        *   Each command template has a code comment: "checked against the installer, 2026-11-08".
    *   **Order:** every install first, then every sign-in, Claude Code before Codex.
    *   **No real installers** when `noRealInstallers` is on (item 10). Then only the stand-in
        installers from `testTools` are given. Without `testTools`, each install is blocked:
        *   with a program path set: "A program path is set for Claude Code
            (TEARSHEET_CLAUDE_BIN), so Tearsheet won't install another copy." (or Codex);
        *   otherwise: "Test settings are on, so Tearsheet won't run the real installer."
    *   **`commandFor(kinds, tools, options)` in `pasteCommand.ts`.** It joins the commands from
        `stepsFor` into the paste command, `set -o pipefail; A && B && …`, so a failed download
        stops the rest.
    *   **Tests**, for both modules:
        *   every row of the table, for both tools;
        *   Codex skipped when ready;
        *   a tool installed by Homebrew signs in at its own path;
        *   a too-old copy in a Homebrew folder is blocked with its reason;
        *   test mode, including a sign-in after an install, which must name the test path and
            never `~/.local/bin`;
        *   each of the four test variables alone never gives a real installer, with the right
            reason;
        *   the paste command starts with `set -o pipefail;` and joins with `&&`.

#### 7. `app/src/main/terminal.ts` and `terminal.test.ts` (Create)

*   **Type / Scope**: Main-process module and its tests, with fake clipboard and spawn.
*   **Proposed Changes**:
    *   **`copyAndOpen(command)`.** Writes the command with Electron's `clipboard`, reads it back,
        and on a match runs `/usr/bin/open -a Terminal <home folder>`. Whether that always opens
        a new window is an Open Question; the card's words work either way.
    *   **The answer.** It returns `{ copied, opened }`, and the window says which failed.
    *   **Replaces `openTerminal` in Stage 2**, when the old screens that call it are deleted
        (item 38).
    *   Each outcome is logged as a `copy_terminal` entry.

#### 8. `app/src/main/setupLog.ts` and `setupLog.test.ts` (Create)

*   **Type / Scope**: Main-process module and its tests.
*   **Proposed Changes**:
    *   **One entry per event.** `log(event, fields)` appends a timestamped line to
        `<data folder>/logs/setup.log`.
    *   **The events it accepts:** `path_source`, `test_rules`, `status_read`, `install_step`,
        `step_blocked`, `another_copy_found`, `sign_in_link_opened`, `copy_terminal`,
        `key_check`, `install_switch_read` and `engine_restart_cap`.
    *   **The fields it accepts:** `tool`, `state`, `plan`, `path`, `exit`, `signal`, `ms`, `step`,
        `status`, `reason_code`, `source`, `copied`, `opened`, `code`, `value`, `test_mode` and
        `no_real_installers`. Any other event or field is dropped.
    *   **No personal data (§7's list).** Before a value is written:
        *   a home-folder prefix becomes `~`;
        *   anything matching an email (`[^\s@]+@[^\s@]+\.[^\s@]+`) or a link (`https?://\S+`)
            becomes `[removed]`;
        *   any run of 20 or more letters, digits, `-` or `_` becomes `[removed]`, which covers
            Massive and FRED keys and `sk-` keys.
    *   **Goal 9.** Each failure Goal 9 lists is logged by the module that meets it, and that
        module's test checks its one entry: probe (missing, can't tell, signed out), installer
        (failed download, a stopped or stuck sign-in, another copy found first), terminal (copy
        failed), ipc (key rejected), and engine (the restart cap).
    *   **Tests:** unknown events and fields dropped; emails, links and keys removed; the home
        folder written as `~`; and a log that can't be written never throws.

#### 9. `app/src/main/loginShellPath.ts` and `loginShellPath.test.ts` (Modify and Create)

*   **Type / Scope**: Main-process module and its new tests.
*   **Proposed Changes**:
    *   **One install folder.** `fallbackPath` uses `installDir`.
    *   **The new return shape.** `loginShellPath()` returns
        `{ path, source, claudeConfigDir?, codexHome? }` instead of a string. `source` is:
        *   `login_shell` when the shell printed the markers;
        *   `shell_failed` when the shell ran but failed, timed out or printed no markers, so the
            usual folders are used.

        Its one caller, `app/src/main/index.ts`, logs `source` as `path_source`.
    *   **Two more variables.** The same login-shell run also prints `CLAUDE_CONFIG_DIR` and
        `CODEX_HOME` between its markers, and returns them when they are set.
    *   **Tests:** the login shell, a failed shell, and both variables.

#### 10. `app/src/main/tools.ts` and `tools.test.ts` (Modify and Create)

*   **Type / Scope**: Main-process module and its new tests.
*   **Proposed Changes**:
    *   Drops the unused `loginCommand` and `install` fields and the `ToolStatus` copy. Each
        tool's entry keeps its program name, override variable, version arguments and status
        arguments, and gains the stream its status is read from.
    *   **`noRealInstallers(env)`.** True when any of the four test variables is set.
    *   **`testMode(env)`.** True only when `TEARSHEET_TEST_TOOLS` is set.
    *   **Tests:** each of the four alone turns on `noRealInstallers`, and only
        `TEARSHEET_TEST_TOOLS` turns on `testMode`.

#### 11. `app/src/main/ipc.ts` and `ipc.test.ts` (Modify)

*   **Type / Scope**: The window-to-main bridge and its tests.
*   **Proposed Changes**:
    *   **New engine call.** `CALLS` gains `cancelSafetyCheck` (`cancel_safety_check`).
    *   **Key-check codes are logged.** The answers to `checkKey` that pass through
        `tearsheet:call` are logged as `key_check` entries, by their code only.
    *   **Changed handler.** `tearsheet:getTools(force)` now goes through `toolWatch`.
    *   **New handlers (Stage 0):**
        *   `tearsheet:windowState({ waiting })`;
        *   `tearsheet:copyAndOpenTerminal(kinds)`, where the main process builds the command
            itself;
        *   `tearsheet:commandsFor(kinds)`, which returns the exact command text for the connect
            card to show, and only reads;
        *   `tearsheet:showSetupLog()`, which opens Finder at `logs/setup.log` with
            `shell.showItemInFolder`.
    *   **New handlers (Stage 2):** `tearsheet:install`, `tearsheet:cancelInstall` and
        `tearsheet:openSignInPage()` (registered only when the switch is on), and
        `tearsheet:getInstallButton()` (always), all from item 29.
    *   **`tearsheet:openTerminal` stays until Stage 2.** The old screens still call it, and it is
        removed with them (item 38).
    *   **Pushed events.** `tools_changed` and `install_progress` reach the window as
        notifications.
    *   **Tests:** the `CALLS` allowlist, and that the window can never send command text.

#### 12. `app/src/main/index.ts` (Modify)

*   **Type / Scope**: Main-process entry.
*   **Proposed Changes**:
    *   **The window.** `BrowserWindow` gets `acceptFirstMouse: true`, and it is created before the
        first tool read instead of after it (today `createWindow` awaits `getTools` first).
        `TEARSHEET_HIDDEN_WINDOW` keeps working through `app/src/main/lifecycle.ts`, as today.
    *   **No fixed program paths for the engine.** It stops setting `TEARSHEET_CLAUDE_BIN` and
        `TEARSHEET_CODEX_BIN` from the first probe, so the engine starts without waiting for it.
        The engine gets the PATH and the login shell's `CLAUDE_CONFIG_DIR` and `CODEX_HOME`. A
        program path set in the environment passes through untouched.
    *   **The tool watcher.** It is created after `loginShellPath()` returns. Its first read runs
        while the window loads, and the window's `focus` and `blur` events call
        `onWindowFocus()` and `onWindowBlur()`.
    *   **Test rules.** It computes `noRealInstallers` and `testMode` from `process.env` once,
        logs both as `test_rules`, and passes them to `toolSteps` and (Stage 2) `installSwitch`.
    *   **Logging.** It creates `setupLog` and passes it to `probe`, `toolWatch`, `terminal`,
        `ipc`, `engine` and (Stage 2) `installer` and `installSwitch`.
    *   **The Install button** (Stage 2). It registers `installer`'s handlers only when
        `INSTALL_BUTTON` is on, and starts `installSwitch`'s read at launch.

#### 13. `app/src/main/engine.ts` and `engine.test.ts` (Modify)

*   **Type / Scope**: The engine process.
*   **Proposed Changes**:
    *   **Restart cap.** When the engine stops for the third time within any 30 seconds, it stops
        restarting. As at `engine.ts:139-141`, it sets `fatalMessage` and emits `fatal`. The
        message names the signal and points to the first-open steps. Stops more than 30 seconds
        old don't count. A later manual `start()` clears `fatalMessage`, as today. It logs an
        `engine_restart_cap` entry.
    *   **Tests:** the cap, the 30-second window, and the log entry.

#### 14. `app/src/main/external.ts` and `external.test.ts` (Modify, Stage 2)

*   **Type / Scope**: Allowed outside pages.
*   **Proposed Changes**:
    *   **Removes `nodejs.org`**, together with the old screens that link to it
        (`app/src/renderer/setup/tool.tsx:85`, deleted in item 38).
    *   **Sign-in hosts.** A separate list, used only by `openSignInPage` (item 29): `claude.ai`,
        `claude.com` and `auth.openai.com`, checked against the real sign-in links when Stage 2
        is built.
    *   **Tests:** `nodejs.org` refused, and each sign-in host accepted only by `openSignInPage`.

#### 15. `app/src/preload/index.ts`, `api.d.ts` and `index.test.ts` (Modify)

*   **Type / Scope**: The bridge seen by the window.
*   **Proposed Changes**:
    *   **Bridge calls (Stage 0).** Exposes `cancelSafetyCheck`, `windowState`,
        `copyAndOpenTerminal`, `commandsFor` and `showSetupLog`.
    *   **Bridge calls (Stage 2).** Exposes `install`, `cancelInstall`, `openSignInPage` and
        `getInstallButton`, and removes `openTerminal` (item 38).
    *   **One `ToolStatus`.** It is imported from `app/src/shared/tools.ts`.
    *   The fake bridge changes in the same commit as each of these (items 23 and 28).

#### 16. `engine/src/tearsheet/server.py` (Modify)

*   **Type / Scope**: Engine server.
*   **Proposed Changes**:
    *   **`m_cancel_safety_check`.** Sets a stop flag that `run_check` reads before each probe
        (item 20), and answers `{ "stopping": bool }`. The call in progress ends normally. The
        task is never cancelled, so no AI tool process is killed.
    *   **`_safety_job` when it ends.** It writes the check's report file under `logs/` with
        `report.to_json()` and the command-line check's file-name pattern (`cli.py:125-127`).
        Then, before it returns, so the line (which looks again every second) can't start a
        report first:
        *   **Failed.** `record_check` saves `lockdown_failed`, as today. The existing block then
            refuses each AI step, and a waiting report ends with `LOCKDOWN_FAILED`, which pauses
            the line as today.
        *   **Stopped, or couldn't finish.** These are the cases where `report.inconclusive` is
            set (a stop sets it too, item 20) or the check raised: today's `finished = False`
            cases. Nothing is recorded, as today, and `safety_done` has `finished: false`. If
            the checked tool is the writing tool (`primary_tool`) and has no `tool_versions`
            row, the server calls `ReportLine.pause()` with `SAFETY_CHECK_STOPPED` or
            `SAFETY_CHECK_UNFINISHED` and the reason, then `_line_changed()`.
        *   **Passed.** If the line is paused with one of those two codes, the server calls
            `carry_on()`, `_line_changed()` and `_kick_line()`, as `m_carry_on_line` does
            (`server.py:1047-1052`). A `LOCKDOWN_FAILED` pause keeps today's Resume.
    *   **The check's progress in the settings.** The server keeps the latest `safety_progress`
        and the check's start time. `m_get_settings` gains `safety_running`:
        `{ tool, n, total, started_at }` while a check runs, null otherwise. The existing
        `lockdown` field already tells the window whether the writing tool has ever been
        checked.
    *   **`m_run_report`** still refuses during a check, outside test mode as today, and the
        window sends the report to the line instead.
    *   **`SERVICES`** gains two entries: "GitHub (Tearsheet's off switch)": no key, free, one
        plain request at each launch with no personal data; and "claude.ai and chatgpt.com
        install scripts": no key, free, only when Install is pressed. (`SERVICES` has no Alpha
        Vantage row today, though `tearsheet.md` lists one; item 41 adds only these two.)
    *   **Test mode** (`config.test_mode()`, item 18):
        *   `_safety_job` runs the canned check: 25 `safety_progress` steps a fifth of a second
            apart, with the real probe names, and no AI call. It ends as `check=` in
            `<TEARSHEET_TEST_TOOLS>/state` says: `pass` (the default), `fail` or `unfinished`.
            It never calls `record_check`. An ending that doesn't pass calls `ReportLine.pause()`
            with its code (`LOCKDOWN_FAILED` for `fail`), so each message can be seen. A stop
            works as above.
        *   `Server.__init__` sets `backfill_enabled` off, so neither `m_check_key`, `m_set_key`
            nor `start()` starts the price download.
        *   `m_grade_due` grades nothing and answers that nothing is due.
        *   A report, from `m_run_report` or the line, ends before any data or AI call with the
            code `TEST_COPY` and "Reports are off in a test copy".

#### 17. Protocol models (Modify, regenerate)

*   **Type / Scope**: `engine/src/tearsheet/protocol.py`, `engine/src/tearsheet/__init__.py` and
    the generated `app/src/shared/protocol.ts`.
*   **Proposed Changes**:
    *   **New method.** `cancel_safety_check`, with `NoParams` and a new
        `CancelSafetyCheckResult` (`stopping: bool`), registered in `METHODS`.
    *   **New settings field.** `SettingsResult` gains `safety_running: SafetyRunning | None`,
        defaulting to None so existing fixtures still parse. `SafetyRunning` is
        `{ tool, n, total, started_at }`.
    *   **Codes.** `LinePause.code` is a plain string, so the two safety codes need no list.
        `RunFailedNote.code` gains `TEST_COPY`, because a test-mode report ends as `run_failed`.
    *   **`ALL_MODELS`** gains `CancelSafetyCheckResult` and `SafetyRunning`.
    *   **Version and types.** `PROTOCOL_VERSION` in `engine/src/tearsheet/__init__.py` goes up by
        one, and `npm run gen-types` regenerates `app/src/shared/protocol.ts`.

#### 18. `engine/src/tearsheet/config.py` (Modify)

*   **Type / Scope**: Engine settings.
*   **Proposed Changes**:
    *   **Program paths.** In `find_program()`, a set `TEARSHEET_CLAUDE_BIN` is final for Claude
        Code, and a set `TEARSHEET_CODEX_BIN` for Codex: it is used only if it exists and can run,
        with no fallback, and otherwise the tool counts as not found. A tool whose own variable
        isn't set is looked up on the PATH, as today.
    *   **`keychain_service()`.** A function that returns `TEARSHEET_KEYCHAIN_SERVICE` when it is
        set, and `Tearsheet` otherwise. It replaces the `KEYCHAIN_SERVICE` constant at each use
        (`config.py:64`, `:87`, `:101`), and `cli.py:59` prints it.
    *   **`test_mode()`.** True only when `TEARSHEET_TEST_TOOLS` is set, as the main process's
        `testMode` (item 10). A set program path alone doesn't turn it on.

#### 19. `engine/src/tearsheet/batch.py` (Modify)

*   **Type / Scope**: The line.
*   **Proposed Changes**:
    *   **Two new codes.** `SAFETY_CHECK_STOPPED` and `SAFETY_CHECK_UNFINISHED`, set only by the
        server through `pause()`. `PAUSE_CODES`, the report-end codes that pause the line, is
        unchanged. A failed check reuses `LOCKDOWN_FAILED`.
    *   **One new method.** `ReportLine.pause(code, message)`, next to `carry_on()`. It is new
        because today no pause is set from outside `ReportLine`. It does nothing when no report
        is waiting or a pause is already set, so a report's Resume is never lost.

#### 20. The AI tools package (Modify)

*   **Type / Scope**: `client.py`, `codex.py`, `claude_code.py` and `lockdown.py` under
    `engine/src/tearsheet/ai/`: the sign-in rule, the Claude Code environment, and the safety
    check.
*   **Proposed Changes**:
    *   **A sign-in that isn't a plan stops before any call** (`client.py`, `codex.py`).
        `CodexConnector` gains a public `start()` that runs today's `_start()`, including
        `account/read`. `AIClient.start()` awaits it for a connector that has it, before the
        lock-down gate. If `account_type` isn't in `subscription_auth_sources` (`"chatgpt"`) and
        API billing (`codex_billing`) is off, it raises `AIAuthError`. A signed-out Codex already
        raises `AIAuthError` there.
        *   **So the checking tool steps down with no call made:** the pipeline already catches
            any `AIError` from the checking tool and self-checks the rest of the draft
            (`pipeline.py:2050-2060`). `checker_for` stays synchronous and unchanged.
        *   **The same rule protects the writing tool**, which until now found out only from its
            first answer.
    *   **`CLAUDE_CONFIG_DIR`** (`claude_code.py`). `ENV_ALLOWLIST` (`:75-85`) gains it, passed
        only when set. It only changes where Claude Code finds its sign-in; the lock-down's flags
        still switch the person's settings, tools and plugins off, and the safety check covers
        it. Codex's list already has `CODEX_HOME`.
    *   **`ProbeResult.rate_limit`** (`lockdown.py`). `evaluate()` copies `answer.rate_limit` from
        the `RawAnswer`, which both tools fill, and the report file lists it.
    *   **`run_check(..., should_stop)`** (`lockdown.py`). A callback read before each probe. When
        it says stop, the check ends after the probe in progress with
        `report.inconclusive = "You stopped the safety check"`, and `_score()`'s pass verdict is
        skipped. So a stop is never recorded as a failed check.

#### 21. `engine/src/tearsheet/cli.py` (Modify)

*   **Type / Scope**: The command line.
*   **Proposed Changes**: The log format gains a timestamp, and line 59 prints
    `keychain_service()` (item 18).

#### 22. Engine tests (Modify, under `engine/tests/`)

*   **Type / Scope**: pytest.
*   **Proposed Changes**:
    *   **`test_setup_checks.py`,** with its existing `safety_harness` and fake connector:
        *   `cancel_safety_check` stops after the probe in progress, with no task cancel, and
            records nothing;
        *   a failed check pauses waiting reports through the existing block;
        *   a stopped or unfinished check on a never-checked writing tool pauses waiting reports;
            on a tool with a `tool_versions` row, or on the checking tool, it changes nothing;
        *   neither replaces a pause already set, and a full pass carries the line on and
            restarts it;
        *   `get_settings` reporting `safety_running` with `started_at`, and the two new
            `SERVICES` entries;
        *   test mode: the canned check's three endings, never a `record_check`, no price
            download after `check_key` or `set_key`, no grading, and reports ending with
            `TEST_COPY`;
        *   test mode off when only `TEARSHEET_CLAUDE_BIN` is set.
    *   **`test_batch.py`:** `pause()` on an empty line and on a paused line does nothing.
    *   **`test_pipeline.py`:** the checking tool's cases at `:1120-1144` are extended: Codex on
        ChatGPT checks; Codex on an API key with billing off raises before any call and the draft
        is self-checked; with billing on it checks.
    *   **`test_lockdown.py`:** `rate_limit` in each probe and in the report, and a stopped check
        that is inconclusive and leaves no `tool_versions` row.
    *   **`test_claude_code.py`:** `CLAUDE_CONFIG_DIR` passed when set, and not otherwise.
    *   **`test_keychain.py`:** with `TEARSHEET_KEYCHAIN_SERVICE` set, both reading and saving a
        key use the test name and never `Tearsheet` (Goal 7).
    *   **A new `test_config_paths.py`:** `find_program` with a set path that exists, a set path
        that doesn't (not found, no fallback), and none set. It imports the real `find_program`,
        because `conftest.py`'s autouse fixture replaces it, and unsets the `TEARSHEET_*`
        variables.
    *   **`test_protocol.py`:** the new models.

#### 23. Window changes for Stage 0 (Modify, under `app/src/renderer/`)

*   **Type / Scope**: Renderer, its tests and the fake bridge.
*   **Proposed Changes**:
    *   **`home/useRun.ts`.** `RunDeps` gains `safety` (App's safety state), `lockdown` (the
        settings' map) and `startSafetyCheck(tool)`. `start()`:
        *   sends a report to the line's `addOne` when a safety check is running;
        *   when the writing tool has no `lockdown` entry and no check has passed while the app
            has been open, calls `startSafetyCheck` and then `addOne`;
        *   falls back to `addOne` if `run_report` answers `SAFETY_CHECK_RUNNING`.

        During a check, `addOne`'s toast says "It starts when the safety check finishes."
    *   **`home/run.ts`.** `refusal()` maps `SAFETY_CHECK_RUNNING` to "The safety check is
        running. The report joins the line."
    *   **`home/line.ts` and `home/LineParts.tsx`.**
        *   **A new `LineWaiting` card,** shown in Home's `notice` slot when reports are waiting,
            none is being written, and a check runs: "Starts when the safety check finishes
            (n of 25)". Today the line shows only inside `RunView`, which Home doesn't show
            before a first run.
        *   **A safety pause's controls:**

            | Pause code | What it says | Buttons |
            | :-- | :-- | :-- |
            | `LOCKDOWN_FAILED` | The check's reason | Run it again (the full check), Cancel all. After a pass, the paused report's Resume, as today. |
            | `SAFETY_CHECK_STOPPED` | "You stopped the safety check. Reports wait until it passes." | Run it again, Cancel all. The line carries on by itself after a pass. |
            | `SAFETY_CHECK_UNFINISHED` | "The safety check couldn't finish: <reason>" | The same |

            "Cancel all" is the line's existing `onCancelAll`. "Carry on" is hidden for these
            three, because carrying on would skip the full check.
    *   **`setup/SafetyChip.tsx` and `setup/steps.ts`.** The chip's popover gains "Stop the check"
        while the check runs, then "Stopping after this call" until it ends; `SafetyState` in
        `steps.ts` gains a `stopping` field for it. The chip shows the minutes since
        `started_at`.
    *   **`App.tsx`.**
        *   Tools come from `tools_changed`, with no polling.
        *   It passes `cancelSafetyCheck`, `startSafetyCheck`, `safety` and `lockdown` to `useRun`.
        *   On load, it starts its safety state from `safety_running` and `lockdown` in the
            settings.
        *   `signedOut` becomes `state === 'signed_out'`.
        *   After setup, `SafetyChip` shows in the `Toolbar` while a check runs, so "Stop the
            check" is reachable from Home (CUJ 6).
        *   Home's `notice` is `LineWaiting` or `LinePaused`, as above.
    *   **`pages/Home.tsx`.** Its 2-second sign-in poll is removed, replaced by
        `windowState({ waiting: true })`. "Sign in again" uses `copyAndOpenTerminal` until Stage 2
        adds the button.
    *   **`home/RunView.tsx`.** "Sign in again in Terminal: `{failure.fix}`" (`:100-103`), which
        shows the bare `claude auth login`, becomes the same "Sign in again" action as Home.
    *   **`home/since.ts`.** The FRED prompt says the key is optional, free and takes about 2
        minutes, and shows FRED's required notice with a link to its terms, as Settings → About
        does on main.
    *   **`pages/Settings.tsx` and `settings/settings.ts`.**
        *   **Each tool row's action, by `state`:** `missing`, the paste command's copy and open
            (Stage 0) or Install (Stage 2); `signed_out`, `api_key`, `free_plan`, the same sign-in
            as Home's; `too_old`, Update, or the CUJ 5 sentence for a copy outside
            `installDir`; `cant_tell`, Try again and Show log; `ready`, none.
        *   `canCheck` becomes `state === 'ready'`.
        *   **The checking-tool tile** reads "Off: Codex isn't signed in with ChatGPT" when Codex
            isn't `ready` and `codex_billing` isn't `api`, matching the engine (item 20).
        *   The AI tools section gets "Show log in Finder".
    *   **The fake bridge, `test/bridge.ts`.** `FakeBridge` is mapped over `TearsheetApi`, so in
        the same commit it gains fakes for item 15's Stage 0 calls, and its `TOOLS` fixture gains
        `state`, `plan` and `email`. Its `emit()` already sends any notification, so
        `tools_changed` needs no new emitter.
    *   **Existing tests that change in this commit:**
        *   `pages/Home.test.tsx`: the poll and `openTerminal` cases (`:104-122`) become the
            `windowState` and `copyAndOpenTerminal` cases;
        *   `pages/Line.test.tsx`: the toast during a check (`:185` keeps today's text otherwise);
        *   the `ToolStatus` literals in `settings/lockdown.test.ts`, `settings/topics.test.ts`,
            `settings/settings.test.ts`, `setup/steps.test.ts`, `pages/Setup.test.tsx` and
            `setup/tool.test.tsx`, which gain the three new fields;
        *   `App.test.tsx`, `pages/Settings.test.tsx`, `home/run.test.ts` and
            `home/line.test.ts`, which gain the cases above. `useRun` has no test file of its
            own; its cases go in `pages/Home.test.tsx` and `App.test.tsx`.

### Stage 1: the safe test

**The test folder.** `scripts/try-new-user.sh` (item 27) makes it, and items 16, 24 and 25 use it:

| Path | What it is |
| :-- | :-- |
| `<tmp>/` | The test folder: `TEARSHEET_TEST_TOOLS` |
| `<tmp>/state` | The state file: one `key=value` per line (below) |
| `<tmp>/standin`, `<tmp>/install-claude.sh`, `<tmp>/install-codex.sh` | Copied from `scripts/test-tools/` |
| `<tmp>/tools/claude`, `<tmp>/tools/codex` | `TEARSHEET_CLAUDE_BIN` and `TEARSHEET_CODEX_BIN`. No file there means `missing`. |
| `<tmp>/data/` | `TEARSHEET_DATA_DIR` |

**The state file's keys:**

| Key | Values | Read by |
| :-- | :-- | :-- |
| `claude` | `signed_out`, `signed_in`, `api_key`, `too_old` | the stand-in |
| `codex` | `signed_out`, `signed_in`, `api_key` | the stand-in |
| `login` | `normal` (the default) or `hang`, which makes a sign-in wait until it is stopped | the stand-in |
| `install` | `ok` (the default) or `fail` | the stand-in installers |
| `check` | `pass` (the default), `fail` or `unfinished` | the engine's canned check (item 16) |

#### 24. `scripts/test-tools/standin` (Create)

*   **Type / Scope**: POSIX shell script, copied to `<tmp>/tools/claude` or `<tmp>/tools/codex`.
*   **Proposed Changes**:
    *   **Its state.** It reads `$(dirname "$0")/../state` and knows which tool it is from its own
        file name.
    *   **What it answers itself:**
        *   `--version`: 2.1.317, or 2.1.300 when `claude=too_old`, for Claude Code; 0.165.0 for
            Codex;
        *   the status commands, in each tool's real output format and on the same stream as the
            real tool (Codex's on standard error), with `you@example.com` and the `max` plan;
        *   Claude Code's `auth login` and Codex's `login`: it prints the real tool's opening
            messages on the real tool's stream, including a sign-in link on the real host
            (`https://claude.ai/oauth/authorize?standin=1`, or
            `https://auth.openai.com/oauth/authorize?standin=1`). It waits 3 seconds, sets
            `signed_in`, and prints the real success message. Its Codex `login` sets
            `signed_out` first, as the real one does. With `login=hang` it waits until it is
            stopped.
    *   **Everything else** fails with exit code 1 and "Stand-in: not a real Claude Code" (or
        Codex). It never calls a real program.

#### 25. `scripts/test-tools/install-claude.sh` and `install-codex.sh` (Create)

*   **Type / Scope**: Shell scripts, copied into the test folder.
*   **Proposed Changes**: Each copies `<tmp>/standin` to `<tmp>/tools/<name>`, prints the real
    installer's success message, and sets the tool's state to `signed_out`. With `install=fail`,
    it prints a download error and exits with code 22, as `curl -f` does.

#### 26. `app/src/main/standin.test.ts` (Create)

*   **Type / Scope**: Vitest test of the stand-ins, run in a temporary test folder.
*   **Proposed Changes**: It checks that:
    *   each state answers `--version` and the status command on the right stream;
    *   a sign-in only changes the state file, and Codex's sets `signed_out` first;
    *   `login=hang` waits until stopped, and `install=fail` exits 22;
    *   any other command exits 1 without starting another program (checked with an empty
        `PATH`).

#### 27. `scripts/try-new-user.sh` (Create)

*   **Type / Scope**: Shell script the owner runs.
*   **Proposed Changes**:
    *   **Sets up a fresh test.** It makes the test folder above, copies the three scripts in, and
        writes the state file.
    *   **Records the real sign-ins and tools.** It saves `loggedIn` and `orgId` from the real
        `claude auth status --json`, the real `codex login status` message (from standard error),
        and each real tool's path and version.
    *   **`--state claude=<state> codex=<state> check=… login=… install=…`** sets the state
        file. `claude=missing` or `codex=missing` leaves that tool's file out. The state can
        also be changed while the test runs, by editing one line of the state file.
    *   **Starts a test copy** of the bundle that `npm run package` builds,
        `app/dist/mac-arm64/Tearsheet.app`, never the owner's `/Applications` copy. `open` doesn't
        pass the shell's environment on, so each variable is given with `--env`:

        ```bash
        open -n -W \
          --env TEARSHEET_DATA_DIR=<tmp>/data \
          --env TEARSHEET_KEYCHAIN_SERVICE=Tearsheet-test \
          --env TEARSHEET_TEST_TOOLS=<tmp> \
          --env TEARSHEET_CLAUDE_BIN=<tmp>/tools/claude \
          --env TEARSHEET_CODEX_BIN=<tmp>/tools/codex \
          app/dist/mac-arm64/Tearsheet.app
        ```

        `--switch-url <url>` adds `TEARSHEET_SWITCH_URL`, and `--switch-off` writes `off` into
        `<tmp>/data/install-switch.json` first, so the copy opens with the button off (Stage 2).
    *   **Stops if the test rules aren't on.** Within 20 seconds, `<tmp>/data/logs/setup.log`
        must show a `test_rules` entry with `test_mode` and `no_real_installers` true. If not, it
        stops the copy with `kill` on the process of `<bundle>/Contents/MacOS/Tearsheet` and exits
        with an error.
    *   **Checks afterwards.** When the test copy quits, it reads every saved value again: both
        sign-ins and both tools' paths and versions. It prints "unchanged", or what changed.
    *   **For automated runs,** `--hidden` adds `--env TEARSHEET_HIDDEN_WINDOW=1` (read today by
        `app/src/main/lifecycle.ts`) and `open -g -j`, so the copy never shows or takes focus.

### Stage 2: the setup screen (version 6) and the Install button

#### 28. `app/src/renderer/test/bridge.ts` and `test/app.tsx` (Modify)

*   **Type / Scope**: The fake bridge and the test app for window tests.
*   **Proposed Changes**:
    *   **New fakes,** in the same commit as item 15's Stage 2 calls: `install`, `cancelInstall`,
        `openSignInPage` and `getInstallButton`. The `openTerminal` fake (`bridge.ts:214`) goes
        with item 38. `install_progress` is sent with the existing `emit()`.
    *   **Click counting.** In `test/app.tsx`, where `userEvent.setup` is called, a counter wraps
        every click, so tests can assert counts.
    *   **Fixtures.** A `ToolStatus` fixture for each `state`, for each tool, and for both tools.

#### 29. The installer and the online off switch (Create)

*   **Type / Scope**: `app/src/main/installer.ts`, `installSwitch.ts` and their tests (with a fake
    spawn and a fake fetch), and the online off switch's file, `release/install-button.txt`.
*   **Proposed Changes**:
    *   **`run(kinds)`.** It takes `['claude']`, `['codex']` or `['claude','codex']`.
    *   **One step at a time, re-planned after each.** It runs the first step from `stepsFor`
        (item 6). Then it forces a `toolWatch` read and calls `stepsFor` again on the fresh status,
        until nothing is left. So a sign-in always uses the path the status gives (Homebrew, npm,
        or a test path), and a sign-in that an update made unnecessary is dropped.
    *   **How each step runs.** `/bin/bash -o pipefail -c <command>`, with the login shell's
        PATH and its `CLAUDE_CONFIG_DIR` and `CODEX_HOME`. Input is closed. Output is read line
        by line from both streams. A sign-in's link is taken out first (below), then terminal
        escape codes are stripped. Raw lines and links are never sent or logged. Each step logs
        an `install_step` entry.
    *   **The message.** `install_progress` is `{ tool, step, status, reason? }`. `step` is
        `install` or `signIn`. `status` is one of:

        | `status` | When |
        | :-- | :-- |
        | `downloading` | An install step starts |
        | `installing` | Its first output line arrives |
        | `installed` | It exits 0, and the fresh read finds the tool |
        | `opening_browser` | A sign-in step starts |
        | `slow` | A sign-in is still running after 15 seconds |
        | `stuck` | A sign-in is still running after 2 minutes |
        | `done` | A sign-in exits 0, and the fresh read says `ready` |
        | `cancelled` | `cancel()` stopped a sign-in |
        | `blocked` | `stepsFor` blocked the step; `reason` is its reason |
        | `failed` | Anything else; `reason` says why, in a sentence |

        The window shows these as the progress words in §2: downloading, installing,
        installed, opening your browser.
    *   **Failures and their reasons:**
        *   a non-zero exit: "The download failed." for an install, "The sign-in didn't
            finish." for a sign-in;
        *   an install still running after 10 minutes: its process is killed (an installer, not
            a status command), with "The install took more than 10 minutes, so it was stopped.";
        *   a sign-in that exits 0 but reads `free_plan` or `api_key`: that state's CUJ 5
            sentence;
        *   the re-plan gives a step that already ran in this `run`: "Tearsheet stopped, because
            the same step came up again.";
        *   after an install, the path the status finds isn't the one the installer wrote
            (`installDir`, or the test path): "Another copy at <folder> is found first.", with
            the home folder written as `~`, also logged as `another_copy_found`.

        The window then offers Try again and shows the paste command.
    *   **The sign-in link.** Claude Code wraps its link in terminal link codes, so the link is
        read out before the codes are stripped. The first link whose host is on `external.ts`'s
        sign-in list (item 14) is kept in the main process for `openSignInPage`. It is never sent
        or logged. In test mode, `openSignInPage` logs `sign_in_link_opened` and doesn't open the
        browser.
    *   **Copying the paste command during a sign-in** calls `cancel()` first, so two sign-ins of
        one tool never run at once.
    *   **After a cancel.** It sends `cancelled`, then forces a `toolWatch` read, whose
        `tools_changed` shows what it found. For Codex this is usually signed out, because its
        sign-in signs out first.
    *   **Only when the switch is on.** The main process registers `tearsheet:install`,
        `tearsheet:cancelInstall` and `tearsheet:openSignInPage` only when `INSTALL_BUTTON` is on.
        An install call is refused when the saved value or this launch's fresh value is `off`,
        and the window then shows the paste command.
    *   **`installSwitch.ts`.**
        *   At launch it reads `SWITCH_URL` (in test mode, `TEARSHEET_SWITCH_URL`, or nothing)
            with Electron's `net.fetch`, a 5-second limit and `credentials: 'omit'`.
        *   After trimming whitespace, the body counts only if it is exactly `on` or `off`.
        *   It saves the value and the date to `<data folder>/install-switch.json`, and logs an
            `install_switch_read` entry.
        *   `getInstallButton()` answers "the button is on": `INSTALL_BUTTON`, and the value
            saved before this launch isn't `off`. A fresh value therefore takes effect at the
            next launch.
        *   **Tests:** `on`, `off`, `off` with a newline, any other text, a timeout, no saved
            value, the saved value used when offline, a fresh `off` refusing an install, a saved
            or fresh `on` never showing the button when `INSTALL_BUTTON` is false, and test mode
            never reading `SWITCH_URL`.
    *   **`release/install-button.txt`.** Created with the contents `on`.
    *   **Tests (installer):**
        *   each order of steps, and re-planning after each;
        *   Codex skipped when ready;
        *   each `status` and each failure reason above;
        *   messages on standard error;
        *   exit 0 without a fresh `ready` read is not `done`;
        *   a sign-in cancelled, then read again;
        *   the 15-second and 2-minute events, with short timings passed in;
        *   the link kept only for a sign-in host, never sent, and not opened in test mode;
        *   both tools;
        *   test mode, where a sign-in after a stand-in install uses the test path.

#### 30. `app/src/renderer/setup/state/tool.ts`, `email.ts`, `safety.ts` and their tests (Create)

*   **Type / Scope**: Pure reducers.
*   **Proposed Changes**:
    *   **`tool`.** Its states are `missing`, `installing`, `signing_in`, `signed_out`, `too_old`,
        `api_key`, `free_plan`, `cant_tell`, `failed` and `ready`. Each `ToolStatus.state` maps to
        the state of the same name. `installing`, `signing_in` and `failed` come from
        `install_progress`. It also holds which tools the person picked.
    *   **The key isn't a reducer.** Setup only holds missing, works or already saved. It learns
        these from `KeyCard`'s `onWorks` and the settings. `KeyCard` owns the check (item 36).
    *   **`email`.** Its states are `none`, `suggested` (from Claude Code), `typed`, `editing`,
        `invalid` and `saved`. A suggestion never replaces a typed email.
    *   **`safety`.** Moved from `app/src/renderer/setup/steps.ts` unchanged, including the
        `stopping` field that Stage 0 added (item 23).
    *   **Tests:** each state change, in the style of today's `steps.test.ts`.

#### 31. `app/src/renderer/setup/view.ts` and `view.test.ts` (Create)

*   **Type / Scope**: Pure function.
*   **Proposed Changes**:
    *   **`screenView(tool, key, email, safety, focus, buttonOn)`** returns:
        *   the three list rows, each with its icon, words and actions (below);
        *   which question card shows: `connect`, `key` or `finish`, and its contents;
        *   whether Start can be pressed, and if not, the reason: "Waiting for Claude Code to sign
            in", "Waiting for your Massive key" or "Add your email";
        *   where focus goes.
    *   **Each tool state's card and AI row:**

        | Tool state | Card | AI row |
        | :-- | :-- | :-- |
        | `missing` | `connect`: the Install buttons, or the paste command when the button is off | "Not set up yet" |
        | `missing`, after the copy to Terminal worked (button off) | `key` | "Waiting for Claude Code", with "Show the command again" |
        | `installing` | `connect`, with the progress words | The progress words |
        | `signing_in` | `key`: the card moves on | "Waiting for you to sign in", with "Stop signing in"; then "Browser didn't open? Open the sign-in page" at `slow`, and the paste command at `stuck` |
        | `signed_out`, `too_old`, `api_key`, `free_plan` | `connect`, with the CUJ 5 sentence and its one button | The CUJ 5 sentence |
        | `cant_tell` | `connect`: "Checking your Claude sign-in…". After 2 minutes, the folder and version found, Try again, Show log, and "Use Codex instead" or "Use Claude Code instead" when the other tool is ready. | "Checking…" |
        | `failed` | `connect`, with the reason, Try again and the paste command | The reason |
        | `ready` | `key` until the key works, then `finish` | The Connected pill. With both tools, both lines: "Claude Code … writes your reports" and "Codex … checks each draft". |

    *   **The other rows' actions.** The email row has Change. The price key row has "Use
        another key", which clears the key so another can be pasted.

#### 32. `app/src/renderer/setup/words.ts` and `helpers.ts` (Create)

*   **Type / Scope**: Shared text and helpers.
*   **Proposed Changes**:
    *   **`words.ts`.**
        *   `TOOL_TEXT`, `ToolText` and `checkText` move here. `TOOL_TEXT` loses its install and
            sign-in commands, which now live in the main process.
        *   It gains the CUJ 5 sentence for each tool `state`, and the safety-check items.
        *   **The data sentence,** for one tool and for both: Anthropic or OpenAI for the AI
            text; SEC for the email and filing downloads; Massive for the key and prices;
            iShares for the S&P 500 list; GitHub for the off switch's file; claude.ai or
            chatgpt.com for the install scripts, when Install was pressed; and the news sites a
            report reads, only when the `news_articles` setting is on (off by default since
            main's commit f597b24).
        *   Every on-screen string in this design is kept here once, and items refer to it by
            its key.
    *   **`helpers.ts`.**
        *   `keyProblem`, `KeyService` and `SERVICE_NAME` move here.
        *   It adds `keyShape(text)`, which rejects spaces, a `curl`, `http` or `~` start, and
            `@`, and `maskKey`.

#### 33. `app/src/renderer/setup/List.tsx` and `Question.tsx` (Create)

*   **Type / Scope**: React components.
*   **Proposed Changes**:
    *   **`List.tsx`.** The three rows, with the words and actions `screenView` gives (item 31).
    *   **`Question.tsx`.** The three cards:
        *   **Connect:** "Install Claude Code", "Install Codex" and "Install both", or the paste
            command when the button is off. Above them, in small type under "These are the
            commands Tearsheet runs", are the commands for all three choices, from
            `commandsFor`. Progress words show while installing. Before a Codex sign-in that
            replaces another sign-in, the card shows CUJ 5's warning.
        *   **Key:** "Get a free key" and the key field.
        *   **Finish:** the email with Change, or the email field, then the data sentence, then
            Start and its reason.
    *   **The Install guard.** Every button that starts an install or a sign-in (the three
        Install buttons, and CUJ 5's Update and Sign in buttons) ignores a click within half a
        second of the window's `focus` event.
    *   **Motion,** from the committed mockup (item 37): the list fading in, its ticks being
        drawn, the question card rising, and Start pulsing once when it can be pressed. All of
        it is off under `prefers-reduced-motion`.

#### 34. `app/src/renderer/pages/Setup.tsx` (Rewrite)

*   **Type / Scope**: React page.
*   **Proposed Changes**:
    *   **What it does.**
        *   It wires bridge events into the three reducers, renders `List` and `Question` from
            `screenView`, shows `SafetyChip` at the top right as today, and calls
            `windowState({ waiting })`: true while the tool isn't `ready`, false once it is.
        *   **The go-ahead for the safety check** is the first click on any button or field in
            Setup. It starts the check then if the writing tool is ready, or as soon as it becomes
            ready. It doesn't start one when `safetyPassedFor` says a full check already passed
            for that tool's version.
        *   **Start** saves `primary_tool` and `sec_contact_email` with `setSetting`, then
            `setup_done` last, then calls `onFinish`. If a save fails, Start stays and shows the
            engine's reason. Home then opens with the company field focused (App's `fieldRef`).
    *   **What goes.** The nine-step flow, the progress bar and the "Looking for" scan.

#### 35. `app/src/renderer/pages/Setup.test.tsx` (Rewrite)

*   **Type / Scope**: Window tests, the click-count tests.
*   **Proposed Changes**:
    *   **The journeys:** CUJ 1, 2, 3, 4 and 4b, plus "both already set up". CUJ 4b runs twice:
        staying in the browser, and coming back between the sign-ins. Each runs with the button
        on and with it off. A return to the window is modelled as one click on the control under
        the pointer.
    *   **Click limits.** At most 3 clicks when a tool is set up, at most 4 on a brand-new Mac,
        and 5 for CUJ 4b's return path.
    *   **Before Start, it asserts:**
        *   the tool and plan sentence;
        *   the email with where it goes;
        *   the data sentence, naming Anthropic or OpenAI, SEC, Massive, iShares and GitHub;
            claude.ai or chatgpt.com when Install was pressed; and the news sites only when
            `news_articles` is on.
    *   **Also covered:**
        *   no AI call before the first click;
        *   `cant_tell` never shows an install, and its 2-minute contents;
        *   each row of item 31's table;
        *   a key rejected by its shape;
        *   an email suggestion never replacing a typed one;
        *   Codex's sign-in: never offered when Codex is `ready`; offered for `signed_out` with no
            warning; offered with CUJ 5's warning for each sign-in that isn't ChatGPT;
        *   with the button off, the card moving to the price key once the copy works;
        *   the Install guard ignoring a click right after the window comes forward;
        *   `slow` and `stuck` showing their fallbacks on the AI row while the key card is up,
            and the paste command only at `stuck` or after a failure (goal 10);
        *   copying the paste command at `stuck` stopping the in-app sign-in first;
        *   the waiting report's reason after each of the three check endings (goal 4);
        *   an Install refused after a fresh `off`, then the paste command on the card (CUJ 10).

#### 36. `app/src/renderer/setup/KeyCard.tsx` and a new `KeyCard.test.tsx` (Modify)

*   **Type / Scope**: React component, shared with Settings.
*   **Proposed Changes**:
    *   **Props.** `checkOnPaste`: the check runs as soon as a key is pasted. `showCheck`: a Check
        button is shown. Setup uses `checkOnPaste` only. Settings
        (`app/src/renderer/settings/Keys.tsx`) uses both (D7).
    *   **How a check runs.**
        *   A shape check runs before any call.
        *   One check at a time, and only the latest answer counts.
        *   A rejected key is cleared and the field focused.
        *   The masked key shows after a paste.
        *   "Try again" appears when Massive can't be reached.
    *   **"Get a free key"** opens Massive's sign-up page.

#### 37. The setup styles and their mockup (Modify and Create)

*   **Type / Scope**: `app/src/renderer/setup/setup.css` (Modify), and the mockup it comes from,
    `docs/designs/first-run/canvas/Spine.dc.html` (Create).
*   **Proposed Changes**:
    *   **The mockup is committed first.** Version 6 of the canvas, `Spine.dc.html`, is copied into
        `docs/designs/first-run/canvas/` before Stage 2 starts, so the build doesn't depend on an
        outside page.
    *   **Removed:** the old screens' styles (welcome, how it works, scan, Connected ring, ready
        list).
    *   **Added,** ported from that file: the list, the cards, the three Install buttons, the
        progress words, the Connected pill, and the key-cap picture of ⌘V beside the paste
        command.

#### 38. Moving the shared parts, then deleting (Modify and Delete, under `app/src/`)

*   **Type / Scope**: Renderer housekeeping.
*   **Proposed Changes**:
    *   **Where each export of `renderer/setup/steps.ts` goes:**

        | Names | New home |
        | :-- | :-- |
        | `ToolKind` | `shared/tools.ts` |
        | `isEmail`, `versionNumber` | `shared/tools.ts` (moved in Stage 0, item 1) |
        | `TOOL_TEXT`, `ToolText`, `checkText` | `renderer/setup/words.ts` |
        | `KeyService`, `SERVICE_NAME`, `keyProblem` | `renderer/setup/helpers.ts` |
        | `SAFETY_CALLS`, `SafetyState`, `safetyStarted`, `applySafetyNote`, `SafetyView`, `safetyView`, `SAFETY_CHECKS`, `checksPassed`, `safetyPassedFor` | `renderer/setup/state/safety.ts` |
        | `ONE_CLICK_ENABLED`, `SetupStep`, `STEP_ORDER`, `AFTER_CONNECT`, `ResumeInput`, `resumeStep`, `nextStep`, `nextLabel`, `hasProgress`, `progressSegment` | Deleted. Only the old `Setup.tsx` and `tool.tsx` use them. |

    *   **First, the imports.** These files change their imports to the new modules:
        `renderer/App.tsx`, `renderer/nav.ts`, `renderer/nav.test.ts`, `renderer/pages/Home.tsx`,
        `renderer/pages/Settings.tsx`, `renderer/settings/General.tsx`,
        `renderer/settings/Keys.tsx`, `renderer/settings/settings.ts`,
        `renderer/settings/settings.test.ts`, `renderer/settings/topics.ts`,
        `renderer/setup/KeyCard.tsx` and `renderer/setup/SafetyChip.tsx`.
    *   **Then, in the same commit, these files are deleted:** `renderer/setup/steps.ts`,
        `steps.test.ts`, `intro.tsx`, `tool.tsx`, `tool.test.tsx` and `details.tsx`.
    *   **And `openTerminal` goes with them.** `tearsheet:openTerminal` is removed from
        `main/ipc.ts`, `preload/index.ts`, `preload/api.d.ts`, the fake bridge
        (`renderer/test/bridge.ts:214`) and their tests. The old screens were its last callers,
        because Home switches to `copyAndOpenTerminal` in Stage 0 (item 23).
    *   **`nodejs.org`** leaves `main/external.ts` in the same commit (item 14).

#### 39. `app/src/renderer/pages/Home.tsx`, `pages/Settings.tsx` and `home/RunView.tsx` (Modify)

*   **Type / Scope**: React pages.
*   **Proposed Changes**:
    *   **When the button is on,** "Sign in again" on Home and in the run view, and each Settings
        tool row's action, use `install(['claude'])` or `install(['codex'])`. When it is off, they
        use `copyAndOpenTerminal`.
    *   **Where a sign-in's progress shows.** On Home and in the run view, in the "Sign in again"
        box. In Settings, under the tool's row. Each shows the progress words, "Browser didn't
        open? Open the sign-in page" at `slow`, the paste command at `stuck`, and a failure's
        reason with Try again and the paste command.
    *   **The commands shown** come from `commandsFor`. `Home.tsx:183`'s `TOOL_TEXT[kind].login`,
        which item 32 removes, is replaced by it.
    *   **Tests:** `pages/Home.test.tsx` and `pages/Settings.test.tsx` gain the button on and off,
        and each progress state.

### Stage 3: the download

#### 40. Release script and its files (Create)

*   **Type / Scope**: `scripts/release.sh`; two text files, `scripts/release/How to open
    Tearsheet.txt` and the release-notes template `scripts/release/notes.md`; and
    `THIRD-PARTY-NOTICES.md` at the repository root.
*   **Proposed Changes**:
    *   **Before building**, it checks that:
        *   the working tree is clean;
        *   the repository is public (`gh repo view --json visibility`). If it is private, it
            stops with "Friends can't download from a private repository. Make it public first
            (§8)." It never changes the visibility itself;
        *   `LICENSE` (MIT, as today) and `THIRD-PARTY-NOTICES.md` exist.
    *   **`THIRD-PARTY-NOTICES.md`** is created in this stage. It holds the MIT notice for the code
        adapted from Realm, which `app/src/main/probe.ts`, `tools.ts` and `loginShellPath.ts` name
        in their first lines, as `tearsheet.md` promises.
    *   **Build.** It runs `npm run package` from `app/`, which builds the engine
        (`scripts/build-engine.sh`) and then the app, into `app/dist/`.
    *   **DMG.** It makes `Tearsheet-<version>-arm64.dmg` with `hdiutil create`, from a folder that
        holds the app, a link to Applications, and "How to open Tearsheet.txt".
    *   **Zip.** It makes `Tearsheet-<version>-arm64.zip` with
        `ditto -c -k --keepParent --sequesterRsrc`. It unzips a copy and runs
        `codesign --verify --deep --strict`, and stops on failure.
    *   **Notes.** It writes `SHA256SUMS.txt`, and fills the template into `app/dist/notes.md`
        (the committed template is never overwritten) with the version, the checksums and the
        first-open steps:
        *   click Done, not Move to Trash;
        *   then Privacy & Security, then Open Anyway;
        *   what to do about "damaged" or a second box for Tearsheet Engine;
        *   how to check for Apple Silicon;
        *   that each update shows these prompts again.
    *   **The switches.** It prints "Install button: on/off" from `app/src/shared/flags.ts`, the
        online off switch's current value read from `SWITCH_URL`, and "Anthropic approval: not
        yet".
    *   **Upload.** It asks "Create the release v<version> on LBB2005/Tearsheet (public)? [y/N]"
        before `gh release create`, then asks once more before each `gh release upload`.
        Nothing goes up without a "y".

#### 41. Design docs (Modify)

*   **Type / Scope**: Documentation, in the same change as Stage 2, and one config comment.
*   **Proposed Changes**:
    *   **`docs/designs/report-look.md`.** "The first-time path" is rewritten as the one-screen
        spec, with a link to this design and the committed mockup (item 37).
    *   **`docs/designs/tearsheet.md`.** Line numbers are as of 2026-11-08; the quoted text is
        what to find.
        *   **CUJ 6** describes the setup screen and the Install button.
        *   **Section 12:**
            *   The email comes from the Claude sign-in or is typed, and the commands are run by
                the button or pasted. They are still shown in full before they run, on the
                connect card.
            *   The outside-services table ("This is the only list", near line 636) gains two
                rows, matching `SERVICES` (item 16): GitHub for the online off switch (no key,
                free, one plain request at each launch, no personal data sent), and the claude.ai
                and chatgpt.com install scripts (no key, free, only when Install is pressed). So
                "Nothing leaves the Mac except what the outside services table lists" (near line
                1022) stays true.
            *   "A public download link waits on both checks" (near line 675) is replaced with
                the owner's choice: a public repository and release now, with the Install button,
                ahead of Anthropic's approval and the OpenAI terms check, covered by the online
                off switch.
        *   **Goal 9** (near line 84) notes it was brought forward for the owner and a few
            friends.
        *   **The risk rows** "Scheduled after Goal 1" and "Built only if Anthropic approves"
            (near lines 689 and 692) record this design's choices.
        *   **Section 13** is split into "unsigned build from a public GitHub release now" and
            "signed build later".
        *   **Section 14** records the owner's choice to ship the button ahead of Anthropic's
            approval, and its two switches: the build switch, and the online off switch for copies
            already handed out.
        *   **Alternative A31** ("Detect only, with no install or sign-in button", near line 954)
            is marked as replaced. This design installs from inside the app, and keeps
            detect-and-paste as the fallback when the button is off.
        *   **Its Detailed Implementation items** point to this design for what changed:
            *   43 (`tools.ts` and `probe.ts`): the status reads, the stream per tool, and no kill;
            *   45 (`ipc.ts` and `preload/index.ts`): the new calls and events;
            *   47 (the renderer): the one setup screen in place of the nine;
            *   49 (`install.ts` and `signin.ts`): built here as `toolSteps.ts` and
                `installer.ts`;
            *   50 (packaging): the release script and the first-open steps;
            *   51 (`.github/workflows/release.yml`): not built; the local release script
                replaces it.
    *   **`docs/designs/opening-and-setup.html`.** A note at the top says this design replaces it.
    *   **`app/electron-builder.yml`.** Its header comment says downloads come from
        `scripts/release.sh`.

### Verification Plan

*   **Compilation/Build**: `cd app && npm run typecheck && npm run build`, and
    `npm run package` once per stage.
*   **Unit Tests**: `cd app && npm run coverage` (which runs every test), and
    `cd engine && uv run pytest`.
*   **Static Analysis & Linting**: `cd engine && uv run ruff check` (the repo's existing check).
*   **Test Coverage Requirement**: the floor in `app/vitest.config.ts`: 91% of lines, 94% of
    functions, 88% of branches, and the separate `.tsx` limits. Each new module meets the same
    floor through its own tests.
*   **E2E/Integration**:
    *   **Stage 1:** `app/src/main/standin.test.ts` (item 26). Also one
        `tearsheet-engine lockdown-check --tool claude --data-dir <throwaway folder>` and one with
        `--tool codex`, which measure the safety check's share of each plan. The real sign-ins are
        compared before and after each, and must be unchanged.
    *   **Stage 2:** about 16 `scripts/try-new-user.sh --hidden` runs on the new screen, in the
        script's temporary data folder, never the real one:
        *   **the brand-new Mac** (`claude=missing codex=missing`): Install Claude Code, Install
            Codex, and Install both;
        *   **already set up:** `claude=signed_in`, and `codex=signed_in` alone;
        *   **CUJ 5:** `claude=signed_out`, `claude=too_old`, `claude=api_key` and `codex=api_key`;
        *   **failures:** `login=hang` (both fallbacks) and `install=fail`;
        *   **the check:** `check=fail`, `check=unfinished`, and Stop the check;
        *   **the button off:** the first two runs again with `--switch-off`, which seeds the
            test copy's saved switch value with `off`.

        Each must say "unchanged" for the real sign-ins and tools. The button-off path is tested
        here with the stand-ins only, not against the real installers.
    *   **Stage 3:** one real run on a second macOS account, from a browser download of the
        release in a browser not signed in to GitHub, using **Install both**, so both sign-ins run
        for real once. It must reach a started first report, and its time is recorded.
    *   **No test runs a live full report against the owner's data folder,** because the first
        report on a company in 30 days becomes an official prediction in his record. The Stage 3
        run uses a new data folder on a second account, so its prediction never reaches his
        record. It may run to the end, or be cancelled once it has started.
*   **Before and after every test that uses the real tools:** the real `claude auth status
    --json` (`loggedIn`, `orgId`), `codex login status`, and both tools' paths and versions are
    unchanged.

--------------------------------------------------------------------------------

*Drafted with EGM*
