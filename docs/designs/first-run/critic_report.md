# Stage 7: Critic review of first-run-setup.md (FeatureRange, lines 1 to 759)

*   **Reviewers:** three fresh agents, run at the same time.
    *   `egm-design`, against the feature-spec standard: 1 Blocker, 15 Majors, 11 Nits.
    *   `egm-structural`, against the feature-spec standard: 1 Blocker, 1 Major, 11 Nits.
    *   `egm-style`: 6 Majors, 7 Nits.
*   **Date:** 2026-11-08
*   **After merging duplicates:** 2 Blockers, 17 Majors, 14 Nits. The ids in brackets name the
    reviewer finding each item comes from: D = design, S = structural, T = style.

## Blockers

### B1. Codex prints its status to standard error, so "standard output only" breaks every Codex journey [D1, confirmed]

*   **Confirmed by the Elephant.** In OpenAI's code at `rust-v0.165.0`, `codex-rs/cli/src/login.rs`
    prints these with `eprintln!` (standard error):
    *   "Logged in using ChatGPT", at line 482;
    *   "Not logged in", at line 506;
    *   "Successfully logged in";
    *   and the other "Logged in using …" modes: access token, personal access token, and Amazon
        Bedrock.
*   **What breaks:** reading standard output only, real Codex would always read "can't tell".
    *   CUJ 3, 4 and the Codex half of 4b never finish.
    *   The safety check never starts for Codex.
    *   Goal 3's before-and-after compare of `codex login status` would compare two empty strings.
*   **Fix:**
    *   **Set the stream per tool:** standard output for Claude Code's JSON, standard error for
        Codex's messages.
    *   **The stand-in matches it.** It writes to the same stream as each real tool.
    *   **Record the outputs.** Keep recorded real outputs as test fixtures, each with the stream it
        came on.
    *   **Classify every Codex mode.** Only "Logged in using ChatGPT" is a plan. API key, access
        token, personal access token and Bedrock are not.

### B2. There is no Risks and Mitigations section, which the standard requires [S-B1, D2]

*   **The problem.** Risks are scattered across the "fixed rules", Open Questions, §1, §2, §8 and
    the Non-Functional Requirements. Several are never stated at all.
*   **Fix:** a `## Risks and Mitigations` table with the root design's columns: Risk, Effect, How
    it is noticed, Handling, Status. At least:
    *   Anthropic says no;
    *   OpenAI's terms;
    *   running vendor install scripts fetched live inside the app;
    *   installers changing over time;
    *   the plan usage spent by checks and tests;
    *   the unsigned build and first-open override;
    *   who can see the source (M2);
    *   the stand-in reaching the real tool;
    *   macOS blocking `Tearsheet Engine`;
    *   support load for friends.

## Majors

### Two need the owner's decision

*   **M1. Taking the button back is not "one change" for copies already handed out** [D3].
    *   **Why.** `INSTALL_BUTTON` is fixed at build time, and auto-update is a non-goal. If Anthropic
        says no, every friend's copy keeps the button until they download a new one.
    *   **Options:**
        *   a build-time expiry date after which the button turns itself off;
        *   pulling the release and telling a known list of testers;
        *   building friends' copies with the switch off.
*   **M2. A private GitHub release gives every friend read access to the whole source** [D4].
    *   **Why.** Release files in a private repository can only be downloaded by accounts with read
        access to it. So each friend needs a GitHub account, an invite, and access to all the code
        and design documents. None of that is counted or listed as a risk.
    *   **Fix:** a separate private repository that holds only releases, or another way to share the
        file. Count the GitHub steps in CUJ 8, and have one non-owner account test the download.

### Correctness and getting stuck

*   **M3. Older Claude Code versions can still sign people out** [D5, T5].
    *   **Why.** The CHANGELOG's sign-out fixes in 2.1.301 and 2.1.317 were bugs in the status
        command itself, not caused by a kill. A minimum of 2.1.41 lets 2.1.41 to 2.1.316 through,
        and they would be read every 5 seconds.
    *   **Two gaps:** a read past 60 seconds keeps running while a new one may start, and "Stop the
        check" kills a live process.
    *   **Fix:**
        *   Treat Claude Code before 2.1.317 as too old.
        *   Never start a new status read while an earlier one for that tool is still running.
        *   Reword "removes the sign-out risk" to what it really does.
*   **M4. Update or install can loop when an older copy comes first on the PATH** [D6].
    *   **Why.** An older Homebrew or npm copy is found before `~/.local/bin`, and Codex's
        installer leaves it in place.
    *   **Fix:** each step runs at most once per click. If the path found after an install isn't
        the installed one, stop with "Another copy at <path> is found first".
*   **M5. "Can't tell" is still a dead end** [D7].
    *   **Why.** Codex has no minimum version, so an old Codex reads "can't tell" for ever.
    *   **Fix:**
        *   Add a minimum Codex version with a too-old state.
        *   After about 2 minutes of "can't tell", show the path and version found, "Show log", and
            a way out.
*   **M6. An in-app sign-in can hang with nothing to press** [D8].
    *   **Why.** The sign-in has no time limit, and its link is never shown.
    *   **Fix:**
        *   After about 15 seconds, show "Browser didn't open? Open the sign-in page".
        *   After about 2 minutes, offer the paste command, which runs in a real terminal where a
            pasted code works.
*   **M7. Only two of the check's outcomes are wired to the line** [D9].
    *   **The gaps:**
        *   "Couldn't finish" (a usage limit, or a sign-in error mid-check) has no pause code.
        *   A stopped or failed check with no report waiting lets the next ticker go straight to
            `runReport`.
        *   An already-paused line is passed by.
    *   **Fix:**
        *   Hold any report whose writing tool has no passed full check after setup's check was
            stopped, failed or couldn't finish.
        *   Give "couldn't finish" its own pause code.
*   **M8. The checking tool is never checked against a plan** [D10].
    *   **Why.** A Codex signed in with an API key gets its 5-call short check, billed to the
        person's API account, then is blocked from checking drafts until a full check runs.
    *   **Fix:** use the checking tool only after setup or Settings saw it ready on a plan, for
        example a saved `checker_ok`.
*   **M9. Codex's sign-in signs out first, so stopping it isn't safe in the API-key case** [D15].
    *   **Fix:**
        *   The button says it replaces the Codex sign-in for all of the person's Codex use.
        *   Correct "stopping is safe" for Codex.
        *   Read the status again after a cancel and say the result.
*   **M10. The paste-command fallback with click-through** [D14].
    *   **The gaps:**
        *   With the switch off, the click back lands on "Copy and open Terminal" again, so the
            counts aren't the same.
        *   A click meant only to bring the window forward can press Install.
        *   The switch-off path is never run for real.
    *   **Fix:**
        *   Move to the key card as soon as copy-and-open succeeds.
        *   Turn click-through off while a connect card with Install shows.
        *   Run the switch-off path once for real, or reword "built and tested".

### Testing and measurement

*   **M11. The plan-usage measurement relies on data the safety check never records** [D11].
    *   **Why.** `ProbeResult` has no rate-limit field, because the app's check calls `run_check`
        directly.
    *   **Fix:** copy each call's rate-limit reading into the check's report.
*   **M12. Test copies share the owner's plan, Massive key and SEC limit** [D12, T6].
    *   **The costs:**
        *   Each fresh test folder runs a real 25-call check, about 400 calls across the Stage 2
            test runs.
        *   A pasted key starts a price download that shares the free 5-calls-a-minute limit with
            the real app.
        *   "No SEC switch needed" depends on nobody starting a report in the test copy.
    *   **Fix:**
        *   A canned stand-in safety check for test launches, with one real run.
        *   No price download under a test Keychain name.
        *   Refuse reports in test mode.
*   **M13. Test-mode safety rests on one environment variable** [D13].
    *   **Why.** Without `TEARSHEET_TEST_TOOLS`, Install would run the real installer.
    *   **Fix:** any test switch turns on test mode, and `toolSteps` then refuses the real
        installers. Add a unit test.

### Document quality

*   **M14. "Line" still has two meanings in places the rename missed** [T1]. Lines 111, 399, 451,
    498, 647 and 666, plus the glossary's "one-line command".
*   **M15. Several goals promise more than their checks test** [T2].
    *   Goal 2 says "never used Terminal", but the check is a run by the owner.
    *   Goal 4's "says why" has no test.
    *   Goal 6 says "knows what they agreed to".
    *   Goal 7 lists installed tools and the data folder, but they are not checked.
    *   Goal 10 says "nobody" while its check allows an exception.
    *   **Fix:** reword each goal to match its check, or add the check.
*   **M16. CUJ 4b's click limit contradicts itself (4 or 5)** [T3, D-nit 3, S-note].
    *   **Fix:** state 4, or 5 if the person comes back between sign-ins. Or make the second sign-in
        wait until the window is back in front.
*   **M17. The "no personal data" list differs in four places, and paths contain the user name**
    [T4, D-nit 4].
    *   **Fix:** one list in §7 (email, key, account ID, sign-in link, raw tool output, and the home
        folder shown as `~`), referred to everywhere else.
*   **M18. Open Questions promises a safe default for each question but gives two** [S-M1].
    *   **Fix:** a table with the columns Question, What depends on it, Safe default, Settled
        when.

## Nits

*   **Wording:**
    *   Absolute words: "make sure", "never stuck", "proves" and "guarantee" (T5).
    *   Subjective words: "safe defaults", "simplest", "for no gain" (T10).
    *   Filler, slang and broken grammar (T12).
    *   "Fixed rules" relabelled as decisions and accepted risks (T7).
    *   "Anthropic's approval" or "answer" used consistently (T7).
    *   "The only part that runs programs" is wrong, because the engine runs the tools (D-nit 1).
*   **Numbers and scopes that disagree:** "from the link" with no link, 3 minutes vs "3 or more",
    "about 25" calls, and "one-person app" vs the friends (T8).
*   **Terms:**
    *   Add to the glossary: the switch, writing and checking tool, M4 and M11, CUJ, and "recipe"
        (T9, S-N2).
    *   One name for the brand-new path (T9).
*   **Structure:**
    *   Put the glossary where the root design puts it, or keep it and say why (S-N2).
    *   The Overview's stage numbers are off by one (S-N4).
    *   Goal 6's "Checked by" is nested wrongly (S-N5).
    *   CUJ names and switch-off handling are uneven (S-N6).
    *   §9 has no stage tag, and there is no stage-to-section map (S-N7).
    *   Repeated statements (S-N7, T11).
    *   The diagram's return arrow is misaligned (S-N8).
    *   Link styles vary, `../tearsheet.md` isn't linked relatively, and `login.rs` has no URL
        (S-N9).
    *   "§" is used for two documents (S-N10).
    *   Long lines and missing blank lines before lists (S-N11, T13).
*   **Goal 4's check** should be a window test, not an engine test, because `run_report` still
    refuses (D-nit 2).
*   **Goal 9's failure list** leaves out a failed download, a hung sign-in and the engine restart
    cap (D-nit 5).
*   **Goal 6's "where data goes"** leaves out iShares and the news sites (D-nit 6).
*   **The check's worst-case time**, or elapsed time shown while waiting (D-nit 7).
*   **Skip the full check on a return to setup** when one already passed (D-nit 8).
*   **The free plan:** after an upgrade, offer "Sign in again". Codex's plan can't be read (D-nit 9).
*   **"Done" should be exit 0 plus a fresh status read.** Use the success text only as a log hint
    (D-nit 10).
*   **Open the window before the first tool read** (`index.ts:59`). Note that `CLAUDE_CONFIG_DIR` and
    `CODEX_HOME` aren't seen by an app opened from Finder (D-nit 11).

## Author's notes (the Elephant)

*   **B1 is real.** It would have broken Codex completely, and the fix is small.
*   **M1 and M2 are the owner's calls.** M1 is how to take the button back from friends' copies,
    and M2 is how friends get the file without seeing the code.
*   **The rest have one sensible fix each** and can be resolved directly.
