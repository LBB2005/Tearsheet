# Stage 6: Comprehension test of first-run-setup.md

*   **Target:** [first-run-setup.md](./first-run-setup.md), lines 1 to 1306. FeatureRange is 1 to
    684, DetailedRange 685 to 1306.
*   **Reviewer:** `egm-comprehension` (a fresh agent with no conversation history). No document
    standard; this tests whether the document is understandable on its own.
*   **Date:** 2026-11-08
*   **Read:** the whole target, and the files it names: `concepts_brief.md`, `clicks-today.md`, the
    named parts of `tearsheet.md` and "The first-time path" in `report-look.md`. The canvas (an
    external claude.ai artifact) could not be checked.

## What this proposes

Tearsheet's nine setup screens become one screen, "version 6" of a mockup.
*   **The layout.** Three rows sit on top: Your AI, Price key, SEC email. Under them, one card
    shows at a time: connect the AI, then the price key, then the email and Start.
*   **Finding the tool.** The screen finds Claude Code or Codex by itself, and reads each tool's
    sign-in and plan from its own status command.
*   **The Install button.** One button each for Claude Code, Codex, or both. It runs the official
    installers and sign-ins from inside the app, and shows the commands first.
*   **The switch.** A build constant, `INSTALL_BUTTON`, swaps the button for a copy-and-open-Terminal
    paste line if Anthropic says no.

The work comes in four stages:
*   **Stage 0, groundwork:**
    *   one main-process status reader that never cuts off the status command;
    *   one list of steps that feeds both the button and the paste line;
    *   a setup log with no personal data;
    *   a report asked for during the 25-call safety check joins the report queue instead of
        being refused, and the check can be stopped.
*   **Stage 1, safe testing:** test switches and stand-in tool scripts, so the owner can rehearse
    the brand-new path on his own Mac without touching his Keychain or sign-ins.
*   **Stage 2:** the new screen and the Install button.
*   **Stage 3:** a local script that builds an unsigned, Apple-Silicon-only DMG and zip, and uploads
    them to a private GitHub release with first-open steps.

The targets are at most 3 window clicks when a tool is already set up and at most 4 on a new Mac.
The audience is the owner and a few friends, ahead of Anthropic's and OpenAI's answers.

## How the existing system works, per this document

*   **The parts.** Tearsheet is an Electron window and main process, plus a separate engine process,
    which talk over JSON-RPC on standard input and output.
*   **How reports get written.** The engine writes reports through the person's own Claude Code or
    Codex, on their paid plan. Data keys sit in the Keychain.

Setup today is nine screens, about 13 clicks when Claude Code is already set up. On a new Mac it
can't be finished:
*   the `claude auth login` line it shows isn't on a new Terminal's PATH;
*   the Codex line needs npm, which a new Mac doesn't have.

Five quieter faults make it worse:
*   The window runs `claude auth status` every 2 seconds and kills it after 5 seconds, which can
    sign people out.
*   Any status it can't read counts as signed out.
*   Nobody checks that the sign-in is on a paid plan.
*   Nothing is logged.
*   The engine refuses reports while the safety check runs, and today the nine screens hide that
    wait.

On top of that, a test copy on the owner's Mac shares his Keychain and finds his real tools, and
there is no release build to download.

Both summaries could be written from the document alone, so no section is a Blocker. Each section
can be summarised on its own; the problems come from parts that don't agree.

## Findings

### 1. The click budget is never counted out (Major)

*   **Where:** Goal 1 (lines 117-123); CUJ 1 to 4b (lines 217-265); Focus (lines 456-460); item 31
    (line 1115).
*   **The gap:** No CUJ lists the clicks that meet the main goal. The reader has to rebuild them from
    scattered rules, and the rules don't cover every case.
    *   CUJ 1 works out as: Get a free key (1), the click back onto whatever is under the pointer
        (2), ⌘V, Start (3).
    *   CUJ 3 and 4 say "plus typing the email". The only focus rule moves focus to the key field.
        Nothing says the email field takes focus once the key works.
    *   If it doesn't, typing the email costs a click, so CUJ 3 becomes 4 clicks and CUJ 4 becomes
        5, over the targets.
    *   The brief's D3 counted the clicks, but for the old "Copy the line and open Terminal"
        button, which this design replaced.

### 2. It's unclear when the safety check starts on a new Mac (Major)

*   **Where:** Goal 5 (lines 136-138); line 223; §5 "When it starts" (lines 478-479); item 34 (line
    1157); lines 445-446.
*   **The gap:** The rule is "the person's first click once a tool is ready", but the example given
    is "Install", which is clicked before any tool is ready. The card can also move on to the price
    key while the browser sign-in is still pending, so "Get a free key" may come before the tool is
    ready too.
    *   **Reading 1:** clicking Install counts as consent, and the check starts by itself once
        sign-in completes.
    *   **Reading 2:** the check starts at the next click after the tool is ready, which could be as
        late as Start.
    *   The two give different waits for the first report, and change what Goal 5's test checks.

### 3. CUJ 5 can't be read with the switch on, and "line" means too many things (Major)

*   **Where:** the glossary (lines 61, 65); CUJ 5 (lines 272-277); and lines 361, 527, 1126, 1144
    and 1174.
*   **The gap:** The glossary defines "the line" as the report queue. The same word is also used for:
    *   the paste line, and the `lines` module;
    *   an "install line";
    *   Codex's "status line";
    *   each log entry;
    *   the "data line";
    *   the "tool and plan line".
*   **Why it matters:** CUJ 5 promises each case "its own plain sentence and its own line". With
    the Install button on, a reader can't tell whether Signed out, Too old and API key show a
    button, a paste line or plain text, or what a button would say.

### 4. A Codex user signed in with an API key gets contradictory answers (Major)

*   **Where:** CUJ 5 (line 276); §2 (lines 388 and 408-409); item 6 (line 783); item 35 (line
    1183).
*   **The gap:** The rule "Codex's sign-in only when Codex reads signed out" leaves no sign-in step
    for a Codex in the `api_key` state.
    *   CUJ 5 still promises "API key: sign in with your plan account".
    *   The test at line 1183 says it differently: "never offered when Codex is ready".
    *   "Only when signed out" and "skip when ready" give different results for exactly this case.

### 5. Item 41 would mark A31 "chosen", but A31 is the opposite of this design (Major)

*   **Where:** item 41 (line 1275), against `tearsheet.md` A31 (lines 954-959).
*   **The gap:** A31 is "Detect only, with no install or sign-in button". This design puts an
    Install button in every copy. The instruction comes from the brief, written when the plan was
    still detect-only. Following item 41 as written would put a contradiction into the root design.

### 6. "Official prediction" is never defined, and the test plan contradicts itself (Major)

*   **Where:** line 580; Goal 2 (lines 124-127); the Verification Plan (lines 1296-1300).
*   **The gap:**
    *   The Stage 3 run "must reach a started first report", while line 1299 forbids "a live full
        report on a company during any test" because of official predictions.
    *   The term is defined only in `tearsheet.md`'s glossary, which this document doesn't point to.
    *   The tester doesn't know whether to let the report run, cancel it, or ignore it because it's
        a throwaway account.

### 7. The document never says why setup asks for an email for SEC (Major)

*   **Where:** lines 74 and 142-144; the "SEC email" row (line 318); §4 "The email" (lines 461-464).
*   **The gap:** It says SEC "will receive" the email, but not why SEC needs it. SEC asks every
    program that downloads its filings for a contact email. That reason is in `tearsheet.md` §12
    and the brief's M8, and neither is cited here.

### Nits

*   **8. The main parts are never introduced.** The engine first appears as "the engine refuses…"
    (line 86), and Electron only at line 435. Nothing says the engine is a separate Python program,
    or that `Tearsheet Engine` is its executable inside the app.
*   **9. Terms used without a definition:**
    *   Massive (a market-data company) and FRED (the source of economic figures);
    *   the safety chip;
    *   "checks each draft", which is the root design's skeptic pass;
    *   grading, and the command-line check;
    *   "safety check" as the root design's "lock-down check" (`tearsheet.md` §4).

    Line 505 also says no switch for SEC's request limit is needed, without saying why one might be.
*   **10.** The glossary covers D1 to D7, but line 357 cites D3a.
*   **11. Some screen details exist only in the canvas,** which a new team member may not be able
    to open: "Use another" (line 1109), the motion "as in the mockup" (lines 1146-1148) and
    `Spine.dc.html` (line 1206).
*   **12. The install commands are never shown in the design,** and the CHANGELOG and install
    scripts are cited without links.
*   **13. The design overrides several brief decisions, but doesn't list them in one place:**
    *   "Tearsheet never runs the install or sign-in itself";
    *   "the only tester is the owner";
    *   D2's lower SEC rate and copy-only test mode;
    *   D3's click sequence;
    *   D5's `email_source`.
*   **14. CUJ 7 describes only the paste-line case.** It doesn't cover the stand-in installers
    behind the Install button, or how the owner "plays each state".
*   **15. It's unclear what users get after Stage 0,** and whether the old nine screens can be
    finished between Stage 0 and Stage 2.
*   **16. The FRED-skip setting is kept readable without a reason.** The brief's reason is that a
    git revert back to the old screens still works.

**The reviewer's priority:**
*   Fix 4 and 5 first. They contradict other parts of the plan, and 5 would write the error into
    `tearsheet.md`.
*   1 and 2 decide whether the click counts and "nothing spent before a click" can be checked from
    the document at all.
