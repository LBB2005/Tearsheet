# Stage 8: Intermediate Zoom Out of first-run-setup.md

*   **Target:** [first-run-setup.md](./first-run-setup.md), lines 1 to 1772 (the full file).
*   **Reviewer:** `egm-zoom-out`, a fresh agent, against the zoom-out standard. It first read
    [zoom_out_report.md](./zoom_out_report.md), [comprehension_report.md](./comprehension_report.md),
    [critic_report.md](./critic_report.md) and [goldfish_review_report.md](./goldfish_review_report.md).
*   **Focus:** the additions and fixes made after Stages 6 and 7.
*   **Date:** 2026-11-08
*   **Verdict:** needs changes. 0 Blockers, 6 Majors, 7 Nits.

## What held up

Most of the Stage 6 and 7 fixes are the right size:
*   each tool's status read from its own stream;
*   status reads never killed, and a Claude Code minimum tied to a known bug;
*   each step at most once per click;
*   the warning before Codex's sign-in replaces another one;
*   one list of personal data;
*   the Open Questions table.

The over-reach sits in four places: the safety-check hold, what turns on test mode, the Codex
minimum version, and `--real-check`. The two owner decisions (the online off switch and the public
repository) are fine as decisions, but the root design's privacy rule wasn't updated to match. Two
fixes contradict another section.

## Majors

### M1. The online off switch and the public download break two root-design rules

*   **Lines:** 89, 204-211, 243-246, 602-615, 835, 932, 1497-1504, 1714-1739.
*   **What is wrong:**
    *   The root design's outside-services table is "the only list" (`tearsheet.md:636`), and
        "Nothing leaves the Mac except what the outside services table lists" (`:1022`). Settings
        shows that list from the engine's `SERVICES` (`server.py:58`).
    *   This design adds a GitHub request at every launch, and live fetches of the two install
        scripts. Neither is in Goal 6's list, item 35's check, `SERVICES` or item 41.
    *   `tearsheet.md:675` says "A public download link waits on both checks". A release on a
        public repository is a public download, and item 41 doesn't replace that sentence.
*   **Fix:**
    *   In item 41, add two rows to `tearsheet.md` section 12: GitHub for the off switch (one plain
        request at each launch, nothing sent), and the claude.ai and chatgpt.com install scripts
        (only when Install is pressed).
    *   Add the same to `SERVICES`, Goal 6 and item 35's check.
    *   Have item 41 replace the "public download waits" sentence with the risk the owner accepted.

### M2. Test mode turns on outside test launches, and §6 and item 10 disagree about what turns it on

*   **Lines:** 92, 714-723 against 1162-1164, 1290-1291 and 1423; also 1261-1269 and 1395-1396.
*   **What is wrong:**
    *   §6 names "a separate data folder" as a switch. Items 10, 18 and 26 name the two program
        paths instead.
    *   **Built from §6:** the main process always passes `TEARSHEET_DATA_DIR` to the engine
        (`app/src/main/index.ts:76`), so every real engine would start in test mode.
    *   **Built from item 10:** `TEARSHEET_CLAUDE_BIN` and `TEARSHEET_CODEX_BIN` are ordinary path
        overrides (`tearsheet.md:2039`), and the engine's own error tells people to set them
        (`ai/__init__.py:36-39`). Doing so would quietly turn off reports, grading and price
        downloads, and fake the safety check.
    *   **The fake check could skip the real one.** Nothing says it must not save its result. If it
        calls `record_check`, a real tool's version would be marked as passed without a real check
        (`ai/client.py:432-448`). The stand-in also reports 2.1.317, the owner's real version.
*   **Fix:** split the two jobs.
    *   **Never run the real installers:** stays broad, inside `toolSteps` only. Refuse them if any
        test switch or path override is set.
    *   **Test mode** (fake check, no reports, no grading, no price download): on only from
        `TEARSHEET_TEST_TOOLS`, which `try-new-user.sh` always sets. The program paths stay plain
        overrides.
    *   Say that the fake check never calls `record_check`, and correct §6's list.

### M3. The safety-check hold rebuilds the engine's existing lock-down block, and reaches beyond setup

*   **Lines:** 84, 693-704, 1246-1260, 1276-1279, 1301-1307, 1331-1335, 1355-1357, 1370-1371.
*   **What already exists:**
    *   A failed full check saves `blocked_reason='lockdown_failed'` (`ai/client.py:328-340`), and
        `AIClient.start()` then refuses every AI step (`:432-448`).
    *   `LOCKDOWN_FAILED` already pauses the line (`batch.py:31-33`, `:175-182`), and only a full
        pass clears it.
    *   `get_settings` already sends each tool's `lockdown` state (`server.py:1584-1593`).
*   **What the design adds on top:** a stored `safety_hold`, a protocol field, a refusal in
    `m_run_report`, pausing an empty line, a change to `add`, routing in `useRun`, and App state.
*   **The scope problem:** `_safety_job` also runs Settings' Run the check. So if the owner stops a
    check, or hits a usage limit partway, after a tool update, no report runs until a full 25-call
    check passes. Today the 5-call short check lets the next report through (`ai/__init__.py:101-106`).
*   **A smaller loss:** replacing a pause that is already set drops its `run_id`, so the report that
    paused the line loses its Resume (`batch.py:184-195`).
*   **Fix:** work the hold out from `tool_versions`, and store nothing new.
    *   A writing tool with no `tool_versions` row has never been checked (a new install whose setup
        check was stopped or couldn't finish): hold it until a full check passes.
    *   A failed check uses the existing `blocked_reason`, and the window reads both from the
        existing `lockdown` field.
    *   Installs that already have a row keep today's short-check rule.
    *   Never replace a pause that is already set.
    *   This drops `safety_hold`, its protocol field and its tests. The two new codes can stay as
        message codes.

### M4. The Codex minimum version makes a Codex that probably works a dead end, and stops it checking drafts

*   **Lines:** 268, 374, 429-431, 491-494, 526-531, 555-560, 1013-1014.
*   **What is wrong:**
    *   0.165.0 isn't tied to a known bug. It is the owner's own installed version
        (`docs/phase1-progress.md:124`).
    *   An older Codex reads too old, and its only button runs OpenAI's installer, which leaves a
        Homebrew or npm copy first on the PATH. The card then stops with "Another copy … is found
        first". The dead end has moved from "can't tell" to "too old".
    *   Too old isn't ready, so `ready_tools` leaves that Codex out and it stops checking drafts,
        although the engine talks to Codex through its app-server, not `codex login status`.
*   **Fix:**
    *   Drop `MIN_CODEX_VERSION`. A message Tearsheet doesn't recognise already reads "can't tell",
        which now has the 2-minute way out.
    *   If a minimum stays, settle it now from older `login.rs` tags, and don't let "too old" remove
        a tool from `ready_tools`.
    *   For both tools: when a too-old copy isn't in the official folder, say how that copy updates
        instead of running the official installer.

### M5. The sign-in fallbacks are on a card that has already gone, and the 2-minute paste command can start a second sign-in

*   **Lines:** 322-325, 582-588, 640-641, 1483-1486, 1547-1551, 1576-1578, 1629.
*   **What is wrong:**
    *   Item 31 shows the connect card only while the tool is missing or installing. Once a sign-in
        starts, the key card shows.
    *   Item 33 puts "Open the sign-in page" and the paste command on the connect card, so as
        written they never appear.
    *   At 2 minutes the in-app sign-in is still running, while the paste command invites a second
        sign-in of the same tool. For Codex, that one signs out first.
*   **Fix:**
    *   Show the `slow` and `stuck` fallbacks on the AI row of the list, which is always on screen
        and doesn't change what is under the pointer.
    *   Copying the paste command stops the in-app sign-in first. The stop rules already cover what
        happens then.

### M6. `--real-check` and the stand-ins' hand-off repeat the existing command-line check

*   **Lines:** 263, 405-407, 726-727, 741-745, 748-751, 843, 936-938, 1402-1403, 1424, 1441,
    1444-1445, 1750-1753.
*   **What is wrong:** with the fake check, no reports and no grading, the only use of the hand-off
    to the real tools is Stage 1's plan-usage measurement. `tearsheet-engine lockdown-check --tool
    <t> --data-dir <tmp>` (`cli.py:86-139`) already runs the same `run_check` on the real tool and
    writes the report file. With item 20's `rate_limit` field, one run per tool gives the numbers.
*   **Fix:**
    *   Stage 1's measurement becomes one `lockdown-check` per tool, on a throwaway data folder.
    *   The stand-ins answer only the version, status and sign-in commands, and fail anything else.
    *   This removes `TEARSHEET_REAL_CHECK`, `--real-check`, `TEARSHEET_REAL_CLAUDE` and
        `TEARSHEET_REAL_CODEX`, Stage 1's test copy on the old screens, and the only way a test
        copy can reach the owner's real tools.

## Nits

*   **N1. `ready_tools` repeats something the engine already knows.** The Codex connector asks Codex
    which sign-in it uses (`account/read`) before any AI call (`codex.py:373-374`), and
    `client.py:503-513` refuses sign-ins that aren't a plan. Checking that in `checker_for` keeps
    the rule in the engine, works from the command line, avoids a stale list, and drops the
    main-process write into the engine's settings.
*   **N2. The off switch can be smaller within the owner's decision.**
    *   With the repository public, `SWITCH_URL` is public too, so a "secret" gist isn't secret.
        A file in the repository itself is the obvious place, which closes its Open Question.
    *   Use a fresh value at the next launch, or when an install call is refused, instead of
        swapping the card while it is open. This drops `install_button_changed`, and no button
        disappears from under the pointer.
*   **N3. Out-of-date "one switch"** at line 942, and "one change" at 600-601. There are two now.
*   **N4. A hand-made history scan.** It looks for Massive key shapes nobody knows yet, FRED keys
    look like any 32-character hash, and it is a one-time job in a script that runs at every
    release. Run `gitleaks` or `trufflehog` once by hand before going public, and rely on GitHub's
    secret scanning after. Keep the check that the repository is public.
*   **N5. Risks table.** Some rows say "—" for how the risk is noticed; row 835 has a signal in the
    release's download counts. Row 834 is "Accepted", not "Handled". The four off-switch rows and
    the four public-repository rows could each become two.
*   **N6. The 15-second "Open the sign-in page".** Both tools open the browser themselves, and the
    2-minute paste command already covers a browser that didn't open. Dropping it removes reading
    links from tool output, a host list, a handler and a state. The owner's call.
*   **N7. Drift between copies.** The off switch alone is described in about 15 places. M2 and M5
    each come from one copy that wasn't updated. Keep timings and switch lists in the items, and
    have other sections point to them.

## Stage 5 findings, now

| Finding | Status |
| :-- | :-- |
| M1 Install button cost | Still resolved. The button now has a second switch (N2, N3). |
| M2 Install steps written twice | Resolved |
| M3 Checking rule changed | Resolved as written, but M3 and M4 above bring back the same kind of everyday-use change |
| M4 `set_tool_paths` | Resolved, but test mode (M2 above) now overloads the same override variables |
| M5 `pickTool` in App | Resolved |
| M6 Key check twice | Resolved |
| M7 Goal 9 brought forward | Resolved for `:84`, `:689` and `:692`. Sections 12 and 14 still need item 41 edits (M1 above). |
| Round 1 Major A (test paste line) | Resolved |
| Round 1 Major D (commands shown) | Resolved |
| Nit E / `email_source` | Resolved |

## Author's notes (the Elephant)

*   **M2 and M5 are real contradictions.** Both come from one copy of a rule not matching another,
    which is also N7's point.
*   **M3, M4, M6 and N1 each replace new machinery with something the engine already has.** M3 also
    stops a change that would have reached the owner's everyday use after a stopped check.
*   **M1 is required** by the root design's privacy rule.
*   **N6 is the owner's call:** keep or drop the 15-second "Open the sign-in page" button.

## Resolution (2026-11-08)

The owner said "Yes, fix them". The reviewer's code citations were checked first, and all held.

| Finding | What changed in the design |
| :-- | :-- |
| M1 | Goal 6 lists GitHub (the off switch) and the install scripts. Item 16 adds both to `SERVICES`. Item 41 adds both rows to `tearsheet.md` section 12 and replaces `:675` with the owner's accepted choice. |
| M2 | Two rules: no real installers when any test switch or program path is set; test mode only from `TEARSHEET_TEST_TOOLS`. §6's list corrected. The canned check never calls `record_check`. Items 10, 12, 18, 22 and 26. |
| M3 | `safety_hold` removed. A failed check uses the existing `lockdown_failed` block. A stopped or unfinished check pauses waiting reports only for a tool with no `tool_versions` row, and never replaces a pause. A tool checked before keeps today's short-check rule. Home starts the check when a never-checked tool's report is asked for. §5, CUJ 5 and 6, items 16, 17, 19, 22 and 23. |
| M4 | `MIN_CODEX_VERSION` removed: an unknown message reads "can't tell". A too-old Claude Code outside `~/.local/bin` gets a sentence, not the installer. |
| M5 | The `slow` and `stuck` fallbacks are on the AI row of the list. Copying the paste command stops the in-app sign-in first. CUJ 2, §2, items 29, 31, 33 and 35. |
| M6 | `--real-check`, `TEARSHEET_REAL_CHECK` and the stand-ins' hand-off removed. Stage 1 measures with one `tearsheet-engine lockdown-check` per tool on a throwaway folder. The stand-ins fail every command but version, status and sign-in. |
| N1 | `ready_tools` removed. `checker_for` uses the Codex connector's `account_type` (`account/read`) before any call. |
| N2 | The switch's file is `release/install-button.txt` in the public repository. A fresh value takes effect at the next launch; an Install after a fresh `off` is refused. `install_button_changed` removed. |
| N3 | "Two switches" throughout. |
| N4 | The script's history check removed. The owner runs `gitleaks` or `trufflehog` once before going public; GitHub's secret scanning after that. |
| N5 | The Risks table rewritten: off-switch rows and public-repository rows merged, a signal for each, "Accepted" where the handling is the decision. |
| N6 | The owner chose to keep the 15-second "Open the sign-in page" (2026-11-08). No change. |
| N7 | The copies that disagreed (§6 and item 10, §2 and item 31) now match. The design still repeats some rules across sections. |

Also recorded as rejected alternatives: the stored hold, `ready_tools`, a Codex minimum, the test
copy that reached the real tools, test mode from any switch, and the gist applied live.
