# Stage 5: Initial Zoom Out review of first-run-setup.md

*   **Target:** [first-run-setup.md](./first-run-setup.md), the whole file (lines 1 to 1238)
*   **Reviewer:** `egm-zoom-out` (a fresh agent with no conversation history), using the
    Zoom-Out Standard
*   **Date:** 2026-11-08
*   **Verdict:** needs changes. 0 Blockers, 7 Majors, 8 Nits. The context was enough to review.

Line numbers refer to `first-run-setup.md` as committed in `5300321`.

## What holds up (the reviewer's words, shortened)

The design is well grounded and already reuses a lot:
*   the report line, which already waits for the safety check;
*   `useRun`'s join-the-line path;
*   Home's FRED prompt;
*   the command-line safety report format;
*   the `TEARSHEET_HIDDEN_WINDOW` test pattern.

## Majors

### M1. The Install button is the largest new component, and it doesn't lower any click count

*   **Lines:** 30-39, 203-206, 345-384, 533 vs 380-382, 1008-1032.
*   **Problem.**
    *   The doc itself says "the button removes Terminal, not a click".
    *   It still costs a lot:
        *   a process runner with a cancel;
        *   matching on the tools' success lines;
        *   stripping escape codes from output;
        *   relying on behaviour read from the installed program and OpenAI's source, not from
            documentation;
        *   a build switch, with every click-count test run twice.
    *   It reverses the brief's owner decision (`concepts_brief.md:715`, `:788`) and goes against
        `tearsheet.md:673`.
    *   The doc rejects a feature flag for the screen ("two setups to keep working", 533), then
        adds one for installing (380-382).
    *   CUJ 4 (216-222) describes only the paste line.
*   **Suggestion.** Ship Stages 0 to 3 with the paste line, and add the button as its own stage once
    Anthropic answers. If the owner keeps it now, add a goal it can be measured against ("a person
    never opens Terminal"), and make the CUJs lead with the button.

### M2. The install steps are written twice (`lines.ts` and `installer.ts`), and the copies already disagree

*   **Lines:** 386-396, 715-730, 1008-1032, 375-377, 168-169.
*   **Problem.**
    *   Both modules separately encode the same rules:
        *   which steps each state needs;
        *   `pipefail`;
        *   `CODEX_NON_INTERACTIVE=1`;
        *   "Codex sign-in only when signed out";
        *   "too old means run the installer again";
        *   the order of the steps.
    *   They already differ:
        *   `lines` signs in with the found path;
        *   `installer` always uses `<INSTALL_DIR>/claude auth login`.
    *   So the button's sign-in-only path fails for a tool installed by Homebrew or npm.
*   **Suggestion.** One function that turns a tool's status into an ordered list of commands.
    `lines` joins the list for the paste line, and `installer` runs it one command at a time. After
    an install step, sign in with the path the next status read finds.

### M3. The two-tool path changes the checking-tool rule in everyday use

*   **Lines:** 224-232, 373-374, 402-403, 446-449, 549-557, 564, 873-883, 929-930.
*   **Problem.**
    *   Item 20's `checker_for` change needs a full passed check for the tool's current version.
        That is stricter than the project's own rule, where the gate runs a 5-call short check
        after a version change (`client.py:432-448`, `tearsheet.md:342`).
    *   After every Codex update, Codex quietly stops checking the owner's drafts until he clicks
        Run the check.
    *   "Nothing runs by itself outside setup" (881) contradicts App starting the other tool's
        check after the first report (929-930).
    *   Install both on a brand-new Mac serves one kind of tester.
*   **Suggestion.**
    *   Setup connects one tool.
    *   A second tool keeps today's behaviour: used when connected, gated by the short check.
    *   Drop item 20 and the App trigger.

### M4. `set_tool_paths` can be removed by not fixing the tool paths at launch

*   **Lines:** 310, 337-340, 511, 567, 711-713, 835, 858-861, 976-978.
*   **Problem.**
    *   The engine already looks up each program every time it needs one (`ai/__init__.py:33`,
        `config.py:335-341`). It only uses a fixed path because the main process sets
        `TEARSHEET_CLAUDE_BIN` and `TEARSHEET_CODEX_BIN` at launch (`index.ts:59-60`, `:77-78`).
    *   If the main process stops setting them, the window and the engine both take the first
        match on the same PATH. That removes a new method, a protocol model, a config function, a
        push, and their tests.
    *   For tests, a set override should be final in the engine, as it already is in the probe
        (`probe.ts:56`). Leaving `~/.local/bin` out won't hide the real tools if the login-shell
        PATH already includes it.
*   **Suggestion.** Pass only the PATH. Make a set `TEARSHEET_*_BIN` override final in the engine.
    Point those overrides at the test folder.

### M5. `pickTool` adds another place that decides the tool, and in App it can hide a sign-out

*   **Lines:** 341-343, 557, 650-651, 925.
*   **Problem.** Reports still pick their tool in the engine's `choose_tool`, which uses the saved
    `primary_tool`.
    *   If App uses `pickTool`, a signed-out Claude Code plus a ready Codex makes App show Codex,
        so the "signed out" warning goes away.
    *   Meanwhile the engine still writes with the signed-out Claude Code.
*   **Suggestion.** Use `pickTool` only in Setup, to propose the tool and save `primary_tool` at
    Start. App keeps showing `primary_tool`.

### M6. The price-key check is written twice (the Setup `key.ts` reducer and `KeyCard`)

*   **Lines:** 409-414, 1041-1043, 1076-1077, 1128-1140.
*   **Problem.** Both own the same rules: the shape check, one check at a time, only the latest
    answer counts, and clearing a rejected key. `KeyCard` already holds this state
    (`KeyCard.tsx:74-92`). The email check also stays in TypeScript and in the engine.
*   **Suggestion.**
    *   Keep the key check in `KeyCard`, for both Setup and Settings. Setup's key state is then
        just missing, works or already saved.
    *   Let the engine's email rule be the only one.

### M7. The doc doesn't say it pulls the root design's Goal 9 forward, or that its audience changed

*   **Lines:** 11-15, 34-38, 83-84, 139-141.
*   **Problem.**
    *   The root design schedules non-technical setup as Goal 9, after Goal 1 (`tearsheet.md:84`).
    *   The brief's audience was the owner only. This design's is the owner and a few friends.
    *   That shift drives the button, Install both and the release, but the doc never names it or
        says where Goal 1 stands.
*   **Suggestion.** One paragraph naming the shift: Goal 9 brought forward, why now, and Goal 1's
    status. Then size the scope to "owner plus a few friends".

## Nits

*   **N1. Stage 0 rewires the nine old screens that Stage 2 throws away** (939-940). Make Stage 0
    shared groundwork and drop that bullet. The click-count tests are placed in Stage 1 in one place
    (471) and in Stage 2 in another (item 35). Put them in one stage.
*   **N2. Parts with no reader or no traffic:**
    *   `email_source`: nothing reads it after setup.
    *   `hasOrg`: nothing uses it since D5.
    *   The stand-in's `usage_limit` state.
    *   `TEARSHEET_SEC_RATE`: tests never send SEC requests.
    *   `safety_running` in the settings: it only helps on a window reload.
*   **N3. The window-to-main log channel is only needed for "screen changes".** Every listed failure
    is already visible in the main process. Consider dropping the channel.
*   **N4. Reuse the existing `LOCKDOWN_FAILED` pause code for a failed check** and add only a
    "stopped" code. Skip the new helpers.
*   **N5. The Technical Plan has too much detail.** It includes version numbers, source tags,
    escape-code stripping and `acceptFirstMouse`. The price key is described four times. Keep the
    Technical Plan to components and data flow, and move the evidence to Additional Resources.
*   **N6. Some terms aren't defined:** "the line", "safety check", the canvas, and D1/D3a/D4/D7.
    Add a short glossary.
*   **N7. Goal 7's Keychain check has no step that carries it out.** Add it to `try-new-user.sh`,
    or drop the clause.
*   **N8. The zip adds one open question and one checking step.** This is the owner's decision
    (D6), so it is only a reminder of the cost.

## Author's notes (the Elephant, not the reviewer)

These say where the findings meet decisions the owner already made. They are not fixes yet.

*   **M1 and M3's "setup connects one tool" argue against two owner decisions:** the Install button
    in every copy, and Install both. The decisions stay unless the owner changes them.
*   **Doc fixes that keep both decisions:**
    *   M1's second suggestion: add the goal "a person never opens Terminal", and make the CUJs
        lead with the button.
    *   M3's engine fix: drop item 20, so Codex keeps today's short-check rule.
*   **M3's engine fix also changes what the owner was told earlier.** Codex would check drafts from
    the first report on, with no 6-minute wait and no change to his own setup.
*   **M2 is a real bug for the owner's Mac.** His Codex is installed by Homebrew
    (`/opt/homebrew/bin/codex`), so a sign-in through `<INSTALL_DIR>` would miss it.
*   **M4, M5 and M6 are simplifications with no change to what the person sees.**
*   **N2's `safety_running` was added on the owner's approval at the end of drafting.** Dropping it
    is the owner's call.

---

# Re-audit after the author's fixes (the one re-check this round allows)

*   **Target:** `first-run-setup.md` after the fixes (lines 1 to 1269, not yet committed)
*   **Reviewer:** a new `egm-zoom-out` agent, given this report as context
*   **Verdict:** needs changes. 0 Blockers, 2 Majors (one caused by the fixes, one missed in the
    first review), 6 new Nits.

## The first findings, now

| Finding | Status | Note |
| :-- | :-- | :-- |
| M1 Install button cost | Resolved | Goal 10 "Nobody opens Terminal", and the CUJs lead with the button. Leftover: the real run should use Install both, so both sign-ins run for real once. |
| M2 Install steps written twice | Resolved | Leftovers: §3 repeats rules, and the "path after an install" rule is in two places. Simpler: re-plan with `stepsFor` after each step. CUJ 5 "Too old: update" vs item 6 "install plus sign-in". |
| M3 Checking rule changed | Resolved | The glossary now misstates the rule (Nit B). |
| M4 `set_tool_paths` | Resolved | |
| M5 `pickTool` in App | Resolved | |
| M6 Key check twice | Resolved | The email check in the window is fine as a gate only. |
| M7 Goal 9 brought forward | Resolved, with gaps | Record that OpenAI's unchecked terms are accepted for friends (the brief made them a condition). Item 41 should also update `tearsheet.md:84`, `:689` and `:692`. |
| N1 Old screens and click tests | Partly | The stage gap is in Major A(b). |
| N2 Unused parts | Partly | `email_source` still has no reader after setup. `safety_running` is kept by the owner. |
| N3 Window log channel | Resolved | |
| N4 Reuse `LOCKDOWN_FAILED` | Resolved, one wrong claim | The server doesn't set `line.paused` today; `ReportLine` does. Add `ReportLine.pause()`, or say so. |
| N5 Too much detail | Partly | The "checked 2026-11-08" evidence block should move to Additional Resources. |
| N6 Glossary | Resolved | One entry is wrong (Nit B). |
| N7 Keychain test | Partly | No item builds the Keychain-name test. |
| N8 Zip cost | Open | Owner's decision (D6). |

## New findings

### Major A. The safe test doesn't yet protect the owner's real Claude Code sign-in

*   **(a) The test-mode paste line signs in to the real tool.**
    *   "After an install, sign in at `INSTALL_DIR`" means `~/.local/bin/claude auth login` under the
        real home folder. That runs his real Claude Code whenever the paste line shows in test mode:
        with the switch off, or after a failed install step.
    *   **Fix:** after an install, sign in at the status's path when an override is set, otherwise
        at `INSTALL_DIR`, and test it.
*   **(b) Stage 1 still runs on the old screens.**
    *   The old Install screen copies the real installer and `claude auth login`, so CUJ 7 can't
        hold at Stage 1.
    *   Stage 0 removes `tearsheet:openTerminal` while the old screens still call it, which breaks
        "every stage keeps the tests passing".
    *   **Fix:** keep `openTerminal` until the old screens are deleted. Stage 1 delivers the test
        tools and the cost measurement only, and the CUJ 7 runs happen on Stage 2's screen.

### Major D. A security rule from the root design is dropped without saying so

*   **The rule.** `tearsheet.md:661` says install and sign-in commands "are shown in full before
    they run". The old switched-off one-click screen did this.
*   **The gap.** This design runs `curl … | sh` inside the app but shows only progress words.
*   **Fix:** show the exact commands from `lineFor` in the card before the button is pressed. It
    costs no click. Or record that the rule is dropped.

### Nits

*   **Nit B. The glossary misstates the check rules.**
    *   A new tool version gets the short check, not the full one.
    *   The short check clears the gate once any check has passed for that version.
    *   The paste line also shows when an install fails.
*   **Nit C. One range for the click-count tests.** Goal 1 says CUJ 1 to 4. Goal 10 and item 35
    say CUJ 1 to 4b.
*   **Nit E. `complete_setup` repeats checks the engine already does.**
    *   `set_setting` already checks each value.
    *   Writing `setup_done` last acts as the commit.
    *   Dropping it, along with `email_source`, removes a method, a model, a protocol version
        change and their tests.
*   **Nit F.** Move the "checked 2026-11-08" evidence block to Additional Resources.
*   **The Goal 2 real run should use Install both** (from M1).
*   **Item 22 or 26 should build the Keychain-name unit test** (from N7).

## Author's notes

*   **The round-1 re-check cap is reached.** By EGM's rule there is no third run of round 1.
*   **Major A (a) is a safety issue for the owner's real Claude Code.** It is fixed either way.
*   **Rounds 2 to 5 review the fixed document from scratch,** so the fixes still get checked.
