# Goldfish Annotated Review Report

**Status:** resolved. The owner said "Yes, fix them" (2026-11-08), so every PROPOSE FIX below is
applied. M1 (the online off switch) and M2 (a public repository) are decided by the owner.

**Target:** [first-run-setup.md](./first-run-setup.md), FeatureRange, with the matching
Detailed Implementation items changed too, so the two halves agree.

**Source:** [critic_report.md](./critic_report.md) (Stage 7).

## Counts

| Category | Count | Findings |
| :-- | --: | :-- |
| PROPOSE FIX, applied | 16 Majors, 2 Blockers, 21 Nits | B1, B2, M3 to M18, and the Nits marked below |
| ESCALATE (owner's decision) | 2 | M1, M2 |
| CONTEST | 0 | |
| DECLINE | 4 Nits | listed below |

## Blockers

### B1. Codex prints its status to standard error [`egm-design`] - Severity: High

*   ***AI Suggestion:*** PROPOSE FIX, applied.
*   ***Justification:*** Confirmed in `login.rs` at `rust-v0.165.0`: every message uses
    `eprintln!`. The check also found that the API-key mode prints "API key configured - <masked>",
    not "Logged in using an API key" as item 3 said. Both would have made Codex read "can't tell".
*   ***Edits:*** §1 "What it reads, from the stream each tool uses"; items 3, 4, 10, 24, 27 and 29
    (stream per tool, every Codex mode, recorded fixtures, the stand-in on the same stream);
    Additional Resources lists the real messages and links the file.

### B2. No Risks and Mitigations section [`egm-structural`, `egm-design`] - Severity: High

*   ***AI Suggestion:*** PROPOSE FIX, applied.
*   ***Edits:*** a new `## Risks and Mitigations` table before Alternatives, with the root design's
    columns and 15 rows. The Overview's "fixed rules" now say each is also a row there.

## Majors

| Id | Category | What changed in the design |
| :-- | :-- | :-- |
| M1 | ESCALATE, decided | The owner chose B, an online off switch (2026-11-08). Added: the glossary row, §2 "The online off switch", CUJ 10, two risk rows, two rejected alternatives (an expiry date, pulling the download), an Open Questions row for where the file lives, and items 2, 11, 12, 15, 29, 35, 40 and 41. |
| M2 | ESCALATE, decided | The owner chose to make the repository public (2026-11-08): people may read and use the code, and only he can change it. Goal 8 (no GitHub account needed), CUJ 8, §8 (where it goes, why not private, before it goes public), four risk rows (who can see it, the button reaching anyone, the public history, no licence), four rejected alternatives, an Open Questions row for the licence, a "What changed" row, and item 40 (a public check and a history check). |
| M3 | PROPOSE FIX | Claude Code before 2.1.317 counts as too old, and its status is never run (changelog: fixes in 2.1.301 and 2.1.317). No second read of a tool while one runs. Stop the check lets the call in progress end. The Problem's changelog claim reworded to what the changelog says. |
| M4 | PROPOSE FIX | §2 and item 29: each step at most once per click, and "Another copy at <folder> is found first". Changelog 2.1.277 cited. |
| M5 | PROPOSE FIX | `MIN_CODEX_VERSION` 0.165.0 with a too-old state. Can't tell for 2 minutes shows the folder, version, Try again, Show log and "Use the other tool". |
| M6 | PROPOSE FIX | §2 "A sign-in that seems stuck": "Open the sign-in page" at 15 seconds (the main process keeps and opens the link, only for the tool maker's hosts), the paste command at 2 minutes. |
| M7 | PROPOSE FIX | §5 "A check that doesn't pass holds the line": three endings, the new `SAFETY_CHECK_UNFINISHED`, a saved hold that pauses an empty or already-paused line, cleared by a pass. Items 16, 17, 19, 22 and 23. |
| M8 | PROPOSE FIX | §1 "Which tool checks": the main process saves `ready_tools`; `checker_for` uses the other tool only when listed. Item 20 reused for it. |
| M9 | PROPOSE FIX | CUJ 5 and §2: the warning that Codex's sign-in replaces the other sign-in everywhere; stopping it leaves Codex signed out; a fresh read after a stop. |
| M10 | PROPOSE FIX | Switch off: the card moves to the price key once the copy works. The Install guard ignores a click within half a second of the window coming forward. "Built and tested" reworded to "tested with the stand-ins". |
| M11 | PROPOSE FIX | `ProbeResult.rate_limit`, copied into the check's report file (§5, §7, item 20). |
| M12 | PROPOSE FIX | Test mode: a canned check (real one with `--real-check`), no price download, no grading, reports end with `TEST_COPY`. |
| M13 | PROPOSE FIX | Test mode is on when any of the four switches is set, in both processes, with unit tests for each alone. |
| M14 | PROPOSE FIX | The "line" leftovers renamed to "command" or "entry", including the glossary, the diagram and items 7, 8, 11 and 32. |
| M15 | PROPOSE FIX | Goals 2, 4, 6, 7 and 10 reworded to what their checks show, and their checks extended. |
| M16 | PROPOSE FIX | CUJ 4b says 4, or 5 if the person comes back between sign-ins, in Goal 1, the table and item 35, which tests both. |
| M17 | PROPOSE FIX | One personal-data list in §7, including the home folder as `~`. Goal 9, the diagram, NFR and item 8 point to it. |
| M18 | PROPOSE FIX | Open Questions is a table with a default and a "settled when" for each row. |

## Nits

| Nit | Category | What changed |
| :-- | :-- | :-- |
| Absolute words (T5) | PROPOSE FIX | "make sure", "never stuck", "guarantee" and "never refused" reworded |
| Subjective words (T10) | PROPOSE FIX | "safe defaults", "simplest", "for no gain" reworded |
| Filler, slang, broken grammar (T12) | DECLINE | No specific lines were given; the rewrapped and edited paragraphs were checked |
| "Fixed rules" as decisions (T7) | PROPOSE FIX | Now "Decisions and accepted risks" |
| "Approval" vs "answer" (T7) | PROPOSE FIX | "Approval" for what is needed, "answer" for Anthropic's reply |
| "The only part that runs programs" (D-nit 1) | PROPOSE FIX | The Overview says the engine runs the AI tools |
| Numbers and scopes (T8) | PROPOSE FIX | "from the download link", "about 3 minutes", "25 calls", "a handful of users" |
| Glossary terms (T9, S-N2) | PROPOSE FIX | Added: the switch, writing and checking tool, brand-new Mac, test mode, CUJ, M4 and M11, §1 to §9. "Recipe" replaced. |
| One name for the brand-new path (T9) | PROPOSE FIX | "Brand-new Mac" and "the brand-new-Mac path" |
| Glossary placement (S-N2) | DECLINE | Kept before the Problem, which uses its words |
| Stage numbers off by one (S-N4) | PROPOSE FIX | Bullets instead of 1 to 4 |
| Goal 6 nesting (S-N5) | PROPOSE FIX | "Shown before Start" and "Checked by" are now siblings |
| CUJ names and switch-off handling (S-N6) | PROPOSE FIX | Table names match the headings; every CUJ 1 to 4b has a "With the switch off" line |
| §9 stage tag and a stage map (S-N7) | PROPOSE FIX | "(all stages)" and a stage-to-section table in the Overview |
| Repeated statements (S-N7, T11) | DECLINE | The repeats are short and each sits where a reader needs it |
| Diagram's return arrow (S-N8) | PROPOSE FIX | Rebuilt with the arrow in one column |
| Link styles, `login.rs` URL (S-N9) | PROPOSE FIX | tearsheet.md linked relatively; `login.rs` linked at its tag |
| "§" for two documents (S-N10) | PROPOSE FIX | § is this design's; the root design's are "section N" |
| Long lines, blank lines before lists (S-N11, T13) | PROPOSE FIX for long lines; DECLINE for blank lines | Prose lines rewrapped to 100 characters. Lists after a paragraph line render correctly in CommonMark. |
| Goal 4's check is an engine test (D-nit 2) | PROPOSE FIX | Now window tests plus engine tests |
| Goal 9's failure list (D-nit 5) | PROPOSE FIX | Adds a failed download, a stopped or stuck sign-in, another copy found first and the restart cap |
| Goal 6's data list (D-nit 6) | PROPOSE FIX | Adds iShares and the news sites |
| The check's elapsed time (D-nit 7) | PROPOSE FIX | The chip shows the minutes so far |
| Skip a full check that already passed (D-nit 8) | PROPOSE FIX | §5 "When it starts" |
| Free plan after an upgrade; Codex's plan (D-nit 9) | PROPOSE FIX | CUJ 5's free plan offers Sign in again; a note that Codex's plan can't be read; a risk row |
| "Done" is exit 0 plus a fresh read (D-nit 10) | PROPOSE FIX | §2 and item 29 |
| Open the window first; `CLAUDE_CONFIG_DIR`, `CODEX_HOME` (D-nit 11) | PROPOSE FIX | §1, items 3, 9 and 12, and a risk row |
