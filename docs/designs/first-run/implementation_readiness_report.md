# Stage 9: Implementation readiness of first-run-setup.md

*   **Target:** [first-run-setup.md](./first-run-setup.md), the Detailed Implementation Plan, lines
    1016 to 1823. Lines 1 to 1015 were read as context.
*   **Reviewers:** three fresh agents, run at the same time.
    *   `egm-implementation-readiness`, against the implementation-readiness standard: 3 Blockers,
        17 Majors, 14 Nits.
    *   `egm-codebase-details`, against the same standard: 1 Blocker, 16 Majors, 14 Nits.
    *   `egm-style`: 20 Majors, 37 Nits.
*   **Date:** 2026-11-08
*   **After merging duplicates:** 4 Blockers, 32 Majors, and the Nits grouped below. Ids in
    brackets name the reviewer findings: R = readiness, C = codebase, S = style.
*   **Verdict:** not ready. Followed literally, Stage 0 fails `npm run typecheck`, `npm test` and
    `uv run pytest`, and "Stop the check" would block the person's tool.

**Checked and found correct** (codebase reviewer): the `tearsheet.md` line references in item 41,
`index.ts:59` awaiting `getTools`, `probe.ts:31`'s 5-second kill, the 19 committed probe tests,
item 38's list of the 12 importers of `setup/steps`, the `SETTINGS` checks for `primary_tool`,
`sec_contact_email` and `setup_done`, `lockdown-check`'s `--tool` and `--data-dir`, `_run_line`
waiting for the check, `m_run_report` refusing during a check, `carry_on()`, and the coverage
floors.

## Blockers

### B1. Stage 0 breaks typecheck and the tests [R-B1, C-M7, C-M16]

*   `FakeBridge` (`test/bridge.ts`) is mapped over `TearsheetApi`, so the Stage 0 bridge calls
    (item 15) need fakes in Stage 0. Item 28 adds them in Stage 1, together with Stage 2's install
    fakes, which then fail as extra properties.
*   Existing tests that Stage 0 breaks are not listed: `Home.test.tsx:104-122` (the 2-second poll
    and `openTerminal`), `probe.test.ts` (`readLoggedIn`, the 30-second cache, Codex on standard
    output, whole-object `toEqual`), and the `ToolStatus` literals in `lockdown.test.ts`,
    `topics.test.ts`, `settings.test.ts`, `steps.test.ts`, `Setup.test.tsx` and `tool.test.tsx`.
*   Removing `openTerminal` in Stage 2 leaves an extra key in `makeBridge()`.
*   **Fix:** split item 28 by stage (Stage 0 fakes and fixtures; Stage 2 install fakes), and list
    every existing test file that changes, with what changes.

### B2. `checker_for` would have to become async, and the plan doesn't decide it [R-B2, C-M1]

*   `checker_for` is synchronous and only builds a client. `account/read` runs inside the async
    `CodexConnector._start()`, at the first call, so "as today" is wrong.
*   Callers: `server.py:352` (`_live_checker`, used at `:844` and `:885`), `cli.py:169` and
    `:277`, and `test_pipeline.py:1120-1144`.
*   **Fix:** keep `checker_for` synchronous. Check the sign-in at the checker's first `start()`,
    and have the pipeline fall back to self-checking on a named exception, which a signed-out
    Codex's `AIAuthError` also maps to. Extend `test_pipeline.py` instead of a new file.

### B3. The Keychain switch is tested in Stage 0 but built in Stage 1 [R-B3, C-M8]

*   `config.KEYCHAIN_SERVICE` is a fixed `"Tearsheet"`, printed at `cli.py:59`. Item 22's test is
    Stage 0; item 26's code is Stage 1. Item 26 also repeats item 6's stand-in installers.
*   **Fix:** move the switch into item 18 as a `keychain_service()` function, update `cli.py:59`,
    and cut item 26 down to the scripts.

### B4. "Stop the check" would be saved as a failed check and block the tool [C-B1, R-M1]

*   `LockdownReport` has `inconclusive` and `stopped_by`, not `stopped`. A stop that leaves
    `inconclusive` unset goes through `_score()` ("only N of 25 calls ran", so `passed=False`),
    and `_safety_job` then calls `record_check(passed=False)`, which saves `lockdown_failed`.
*   **Fix:** a stop sets `report.inconclusive` ("You stopped the safety check"), so nothing is
    recorded and `safety_done` has `finished: false`. Add a `test_lockdown.py` case: a stopped
    check leaves no `tool_versions` row.

## Majors

### Engine

| Id | Finding | Fix |
| :-- | :-- | :-- |
| M1 [R-M3, C-M3] | `ENV_ALLOWLIST` (`claude_code.py:75-85`) drops `CLAUDE_CONFIG_DIR`, so the engine reads a different Claude sign-in from the window. | Add `ai/claude_code.py` to Stage 0: allow `CLAUDE_CONFIG_DIR` when set, with a test. |
| M2 [R-M4, C-M4] | In test mode the price download still starts: `m_check_key` (`server.py:1490-1492`) and `start()` (`:384`) call `_start_backfill()` too. | Use `backfill_enabled`, set off in test mode, and test it through `check_key`. |
| M3 [R-M17, C-N11, S-M17] | After `pause()` or a carry-on, nothing notifies the window or restarts the line. Item 16 compares "the tool", not the writing tool. | Call `_line_changed()` after each, and `_kick_line()` after a carry-on. Pause inside `_safety_job` before it returns. Compare with `primary_tool`. |
| M4 [C-M2] | Claude Code's connector has no `rate_limit` attribute; it is on each `RawAnswer`. | Copy `answer.rate_limit` into `ProbeResult` in `lockdown.evaluate()`. |

### The window

| Id | Finding | Fix |
| :-- | :-- | :-- |
| M5 [R-M2, C-M5, C-M6] | The first report waiting for the check has no component on Home (`showsRun` is false before any run; `LineStrip` is only in `RunView`). `addOne`'s toast is wrong during a check. `SafetyChip` is only in `Setup.tsx`, so "Stop the check" is gone after Start. | Name a waiting card for Home's notice slot, change the toast during a check, show the chip in App's toolbar, and hide Carry on for the two safety pauses. |
| M6 [R-M5, C-M11] | `ToolStatus`'s old `available`, `loggedIn` and `reason` have no defined values for the new states, and many files read them (`canCheck` would allow a check on a too-old tool). | A table from `state` to the old fields, or move every reader to `state` and list them. |
| M7 [R-M14, C-M9] | Home and Settings in Stage 2 don't say where progress, the fallbacks, a failure and the paste command show. `Home.tsx:183` reads `TOOL_TEXT[kind].login`, which item 32 removes. `RunView.tsx:100-103` still says "Sign in again in Terminal: claude auth login". | Specify Home's and Settings' sign-in states, use `commandsFor`, and add `RunView.tsx` to items 23 and 39. |
| M8 [C-M10] | Settings' tile says Codex checks drafts for any signed-in Codex, including an API-key sign-in the engine now skips. | The tile reads Off when Codex isn't `ready` and API billing is off. |
| M9 [S-M7, S-M8, R-nit] | `screenView`'s card rule leaves out signed out, too old, API key, free plan, failed and can't tell. The tool reducer's states don't match `ToolStatus.state`. | One table: each tool state, its reducer state and its card. |
| M10 [S-M18] | Item 23 doesn't say which controls each safety pause shows ("Run it again", Resume, "Cancel all"), or Settings' action for each state. | List them per code and per state. |
| M11 [S-M19] | "The first click" that allows the safety check isn't defined. | "The first click on any button or field in Setup." |
| M12 [C-M16, R-nit] | `steps.ts` exports with no new home: `ToolKind`, `KeyService`, `SERVICE_NAME`, `ToolText`, `checkText`, `checksPassed`, `SafetyView`, `safetyView`, `safetyPassedFor`. | A table of each name and its new module. |

### The main process and the Install button

| Id | Finding | Fix |
| :-- | :-- | :-- |
| M13 [R-M6, S-M4, C-N13] | `stepsFor` has no `noRealInstallers` input and nowhere to return a reason. "Not ready" isn't listed. The shell and `pipefail` placement aren't fixed, so a failed download could carry on. | `stepsFor(kinds, tools, { noRealInstallers, testTools }) → { steps, blocked }`. List the states that get a step. Pin `set -o pipefail; A && B` and `/bin/bash -o pipefail -c`. |
| M14 [R-M7, S-M5] | `install_progress` has no list of `step` and `status` values, no reason field, no rule for the progress words, and no outcome at the 10-minute limit. | Define the message fully. |
| M15 [S-M6] | Item 29 says a sign-in is done when "not signed out"; its test says "ready". | One rule (`ready`), and what shows when it ends on `free_plan` or `api_key`. |
| M16 [R-M10] | The plan assumes Codex's installer uses `~/.local/bin`, which nothing checks. | One install folder per tool, checked from the script before Stage 2. |
| M17 [S-M15] | `toolWatch`'s 5-second rule, `force` and the 30-second cache are undefined. | State them in item 5. |
| M18 [S-M16, C-N14] | Status parsing: no literal `authMethod` value, no catch-all rule, Codex matching by "first line" (a warning line breaks it), and fixtures that can't be recorded for Bedrock or workload identity. | Literal values, a final `cant_tell`, "a line that starts with", and fixtures copied from `login.rs` where they can't be recorded. |
| M19 [R-M8, S-M10] | `setupLog`'s event and field lists and its redaction patterns aren't given. The restart cap isn't logged. No test covers Goal 9. | List them, log the cap, add the test. |
| M20 [S-M1] | "The switch" means both `INSTALL_BUTTON` and the combined value, which has three names. Two lines disagree on which saved value the window gets. | Define "the button is on" once in item 2, and keep "the switch" for `INSTALL_BUTTON`. |
| M21 [S-M13] | The off switch's file ends with a newline, so an exact `on`/`off` match fails. | "After trimming whitespace, exactly `on` or `off`." |
| M22 [R-M15, C-M13, S-M12] | No item creates `release/install-button.txt`, and `SWITCH_URL` isn't written out. | Create it (contents `on`) in Stage 2. URL: `https://raw.githubusercontent.com/LBB2005/Tearsheet/main/release/install-button.txt`. |

### Testing and the release

| Id | Finding | Fix |
| :-- | :-- | :-- |
| M23 [R-M11, S-M3, S-M20, C-M12] | The test folder's layout and state-file format are undefined, `open` doesn't pass the environment, the app bundle isn't named, and the script compares "two values" instead of all of them. | One layout block, `open -n -W --env NAME=value <bundle>`, the bundle path, a check of `setup.log` that test mode is on, and a compare of every saved value. |
| M24 [R-M16, C-M14, S-M14] | No item builds the stand-ins' own tests. | A vitest test that runs `scripts/test-tools/standin`. |
| M25 [S-M14] | The Verification Plan's run list is unclear (every combination, or a chosen few?), doesn't say how "switch off" is produced, and says "a copy of the data". | List the runs, say how off is made, and say "the script's temporary data folder". |
| M26 [R-M13] | Probe fixtures would publish `orgId` and the organisation name once the repository is public. | Replace every identifier, not only the email. |
| M27 [R-M12] | `Spine.dc.html`, which Stage 2 is built from, is only on the external canvas. | Commit version 6 under `docs/designs/first-run/` before Stage 2. |
| M28 [C-M15, R-nit] | The repository already has an MIT licence (`LICENSE`, `app/package.json`, `engine/pyproject.toml`), so "no licence yet" is wrong. `THIRD-PARTY-NOTICES.md`, promised for the code adapted from Realm, doesn't exist. | Fix the licence rows and Open Question, and have item 40 check `LICENSE` and create the notices file. |

### Writing

| Id | Finding | Fix |
| :-- | :-- | :-- |
| M29 [S-M2] | The test variables have several names ("the four switches", "a test switch or path", "the test switches"), and the lists differ between items. | "The four test variables", listed in item 10. |
| M30 [S-M11] | The path rule ("app paths are under `app/src/`") doesn't resolve item 38's, item 36's or item 22's paths. | Full paths from the repository root. |
| M31 [S-M12] | Stage 0 items have "(Stage 2)" parts with no stated rule. `TEARSHEET_HIDDEN_WINDOW` is never read by any item. | Say tagged parts land in that stage's commit. Read the variable in item 12. |
| M32 [S-M9] | Item 35's Codex case contradicts item 33: the warning shows only when a sign-in replaces another. | "Offered for signed out with no warning, and with the warning for each sign-in that isn't ChatGPT." Add GitHub and the install scripts to the data sentence (R-M9). |

## Nits (grouped)

*   **Protocol** [C-N1, R]: `PROTOCOL_VERSION` is in `engine/src/tearsheet/__init__.py`;
    `LinePause.code` is a plain string; name the new result models and add them to `ALL_MODELS`;
    `safety_running` needs a `started_at` for the minutes after a reload.
*   **Coverage** [C-N2, R]: `npm test` doesn't enforce the floor; `npm run coverage` does, with
    functions at 94% and branches at 88% too.
*   **Restart cap** [C-N3, R]: follow `engine.ts:139-141` (`fatalMessage` and `fatal`); pick one
    counting rule.
*   **Ordering** [C-N4, R]: remove `nodejs.org` with the old screens, not in Stage 0; `installSwitch`
    is named in Stage 0; the safety reducer's "Stopping" state is needed in Stage 0.
*   **Reuse** [C-N5, C-N6, C-N7]: `tildePath`, `versionNumber` and `isEmail` to `shared/`; the
    existing `tests/test_setup_checks.py` harness instead of a new file; the fake bridge's
    `emit()` already sends any notification.
*   **Old switch** [C-N8]: `INSTALL_BUTTON` replaces `ONE_CLICK_ENABLED` and `OneClick`.
*   **Services** [C-N9]: `SERVICES` today has no Alpha Vantage row while `tearsheet.md` does, so
    "matching item 41" needs care.
*   **APIs** [C-N10, C-N12, R]: `loginShellPath()`'s new return shape; `useRun`'s new `RunDeps`
    fields; `toolWatch.onWindowBlur()`; a parameter for the 60-second limit in tests.
*   **Sign-in link and fetch** [R]: take Claude Code's link out before stripping its terminal link
    codes; `net.fetch` with `credentials: 'omit'`.
*   **Missing UI** [R]: a control to stop an in-app sign-in, "Show the command again", the chip
    in the new Setup, and focusing the company field after Start.
*   **Wording and structure** [S-N1 to S-N37]: one action-tag pattern in headings; item 11's
    handler list; synonyms (single flight, escape codes, the waiting entry); UI strings that
    differ from the spec's; "goal" capitalisation; the item 41 cross-references; and the other
    small points in the style report.

## Changes on main to fold in (from the launch-readiness session, 2026-11-08)

*   **News pages are off by default** (engine setting `news_articles`). Goal 6's data list and the
    data sentence should say news sites are read only when that setting is on.
*   **FRED's required notice** now lives in Settings → About. The FRED prompt after the first
    report (item 23, `since.ts`) can show it too.
*   **Settings has an eighth topic, About,** and `settings/topics.ts`, the test bridge and
    `main/ipc.ts` changed. Items 23, 28, 38 and 11 touch these files, so the next merge of main
    needs care.

## Resolution (2026-11-08)

The owner said "Yes, fix them". The facts each fix depends on were checked in the code first:
`LockdownReport` (`inconclusive`, `stopped_by`), `_score()`, `backfill_enabled`, the pipeline's
fallback on any checker `AIError` (`pipeline.py:2050-2060`), Codex's `account_type` and
`SUBSCRIPTION_SIGN_IN = {"chatgpt"}`, the importers of each `steps.ts` export, `npm run package`
building the engine, `TEARSHEET_HIDDEN_WINDOW` in `lifecycle.ts`, `app/dist/` as the build output,
the repository `LBB2005/Tearsheet`, and Codex's installer using
`${CODEX_INSTALL_DIR:-$HOME/.local/bin}`.

| Finding | What changed |
| :-- | :-- |
| B1 | Item 23 adds the Stage 0 bridge fakes and fixtures and lists every existing test that changes. Item 28 moves to Stage 2 with only the Stage 2 fakes and the click counter. Item 38 removes the `openTerminal` fake. |
| B2 | `checker_for` stays synchronous. `AIClient.start()` checks Codex's `account_type` before the gate, and the pipeline's existing fallback self-checks. Tests extend `test_pipeline.py`. |
| B3 | The Keychain switch is `keychain_service()` in item 18 (Stage 0), with `cli.py:59`. Item 26 is now the stand-ins' test. |
| B4 | A stop sets `report.inconclusive`, skips `_score()`'s verdict and records nothing (item 20), with a `test_lockdown.py` case. |
| M1 | `CLAUDE_CONFIG_DIR` added to `ENV_ALLOWLIST` (item 20), with a test. |
| M2 | `backfill_enabled` off in test mode (item 16), tested through `check_key`. |
| M3 | `_line_changed()` and `_kick_line()`, pause before `_safety_job` returns, and the writing tool only (item 16). |
| M4 | `answer.rate_limit` copied in `evaluate()` (item 20). |
| M5 | A `LineWaiting` card in Home's notice slot, the toast during a check, `SafetyChip` in the toolbar after setup, and Carry on hidden for safety pauses (item 23). |
| M6 | A table from `state` to the old fields, and the three deciding readers moved to `state` (items 1 and 23). |
| M7 | Item 39 says where a sign-in's progress shows on Home, in the run view and in Settings, uses `commandsFor`, and adds `RunView.tsx`; item 23 fixes the run view's bare command in Stage 0. |
| M8 | Settings' checking-tool tile matches the engine (item 23). |
| M9 | One table of tool states, cards and AI rows (items 30 and 31). |
| M10 | Per-code controls for safety pauses, and per-state Settings actions (item 23). |
| M11 | The go-ahead is the first click on any button or field in Setup (item 34). |
| M12 | A table of each `steps.ts` export and its new home (item 38). |
| M13 | `stepsFor`'s signature and `{ steps, blocked }`, a state-to-steps table, the exact commands, `set -o pipefail; A && B`, and `/bin/bash -o pipefail -c` (items 6 and 29). |
| M14 | `install_progress` fully defined, with each failure's reason and the 10-minute outcome (item 29). |
| M15 | Done means a fresh `ready`; `free_plan` or `api_key` after exit 0 is a failure with its CUJ 5 sentence (item 29). |
| M16 | `installDir(kind)`, `~/.local/bin` for both, read from both scripts (item 1). |
| M17 | `toolWatch`'s timer, focus read, blur and `force` defined; the 30-second cache removed (items 3 and 5). |
| M18 | Literal `authMethod`, a catch-all, "a line that starts with", and fixtures copied from `login.rs` where they can't be recorded (items 3 and 4). |
| M19 | `setupLog`'s events, fields and redaction patterns listed; the restart cap logged; Goal 9 checked by each module's test (items 8 and 13). |
| M20 | "The button is on" defined once; "the switch" kept for `INSTALL_BUTTON` (intro, items 2 and 29). |
| M21 | Whitespace trimmed before `on`/`off` (item 29). |
| M22 | `release/install-button.txt` created; `SWITCH_URL` written out (items 2 and 29). |
| M23 | The test folder's layout and state-file keys in one table, the `open --env` command and bundle path, a `test_rules` check, and a compare of every value (Stage 1, item 27). |
| M24 | `app/src/main/standin.test.ts` (item 26). |
| M25 | The Stage 2 runs listed (about 16), `--switch-off`, and "the script's temporary data folder" (Verification Plan, item 27). |
| M26 | Every identifier replaced in the fixtures (item 4). |
| M27 | `Spine.dc.html` committed under `docs/designs/first-run/canvas/` before Stage 2 (item 37). |
| M28 | The licence rows corrected (the repository has MIT), and item 40 creates and checks `THIRD-PARTY-NOTICES.md`. |
| M29 | "The four test variables", defined in the intro and used throughout. |
| M30 | Full paths from the repository root. |
| M31 | The stage-tag rule stated; `TEARSHEET_HIDDEN_WINDOW` noted as read by `lifecycle.ts`. |
| M32 | Item 35's Codex warning cases and the data sentence (GitHub, the install scripts, news only when on). |
| Nits | Protocol (`__init__.py`, `LinePause.code`, new models, `started_at`), coverage (`npm run coverage` and all four floors), the restart cap's one rule, `nodejs.org` moved to Stage 2, the moved helpers, the existing test harness, `ONE_CLICK_ENABLED`, `SERVICES`' missing Alpha Vantage row noted, `loginShellPath()`'s return shape, `RunDeps`, `onWindowBlur()`, the 60-second limit as a parameter, the sign-in link read before stripping, `credentials: 'omit'`, a "Stop signing in" control, "Show the command again", the chip in Setup, the company field after Start, long headings, item 41's cross-references, and the release-notes template. |
| Main's changes | Goal 6 and the data sentence read news sites only when the setting is on; the FRED prompt shows FRED's notice; the intro says to merge main (f597b24) before Stage 0. |
