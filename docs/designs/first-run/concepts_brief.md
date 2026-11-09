# Fewest-click first run for Tearsheet

* **Author:** Liam Blackshaw-Brown
* **Date:** 2026-11-08

## Overview

Tearsheet is a personal macOS app (an Electron 33 and React window with a bundled Python engine).
It turns an S&P 500 ticker into one cited research report. The narrative is written by the person's
own Claude Code or Codex command-line tool, running on their own paid plan. Data keys are kept in
the macOS Keychain.

**The problem.** First-run setup today is nine screens.
* Someone who already has Claude Code spends 14 clicks inside Tearsheet's window (13 by the rows of
  `clicks-today.md`'s own table).
* On a brand-new Mac it takes about 45 to 50 clicks from the download link to the first report, and
  the person cannot finish:
  * the bare `claude auth login` line is not found in a new Terminal, because `~/.local/bin` is not on
    that Terminal's PATH;
  * the Codex line needs npm, which a new Mac does not have.

**The proposal.**
* Setup becomes one screen that fills itself in:
  * it finds Claude Code or Codex and reads the sign-in from the tool's own status command;
  * it shows one Terminal line (install and sign-in together) only when it is needed;
  * it asks only for a free Massive price key, checked as soon as it is pasted;
  * it fills in the SEC contact email from Claude Code's sign-in status, with a Change control;
  * the 25-call safety check runs in the background.
* FRED moves to after the first report. "How it works" shrinks to a few words.
* Target: under 5 clicks inside the window.
* Also in scope:
  * a private GitHub release of the unsigned, Apple-Silicon-only app, with first-open steps;
  * a safe way for the owner to test the brand-new-user path on his own Mac.

**Target user.** Only the owner for now. A private link may later go to others.

**What the six-lens review found, in short.**
* **The direction holds up, and much of it is deletion and reuse.** These parts already exist:
  * detection through the status command;
  * the search of `~/.local/bin`;
  * Home's prompt to add FRED after the first report;
  * the status call that carries the email.

  The owner's finished setup carries over with no work.
* **Blocker 1: the first report is refused.** The engine refuses to start a report while the safety
  check runs. A 2-click setup would end with the first ticker turned away.
* **Blocker 2: the planned test is not safe.** There is no safe way today to test the brand-new path
  on the owner's account:
  * a test copy shares his real Keychain entries;
  * it always finds his real tools;
  * pasting the real Terminal line would update Claude Code and sign him in again.
* **The largest unproven assumption is that reading the sign-in status is harmless.** Claude Code's
  own changelog records sign-outs when `claude auth status` exits in the middle of a token refresh.
  Tearsheet kills that command after 5 seconds and polls it every 2 seconds.
* **The click target leaves two things undefined:** whether clicking back into the window counts,
  and whether there is a finishing button. If both count, the brand-new path is 5 clicks, not
  "about 3".

## Analysis

### How this review was run

All six lenses read the concept, `clicks-today.md`, the setup and main-process code, the engine
files, the design doc, the packaging files and the saved installer copies. None opened Claude Code or
Codex credential files or Keychain items. The synthesizer re-checked the claims the blockers rest on
(`server.py:689-694`, `server.py:942-943`, `config.py:64`, `probe.ts`, `client.py:441-491`, the
Codex installer's prompt code, the Claude installer's exit paths and the changelog lines on sign-outs)
against the files.

| Reviewer | Lens | Status |
| :-- | :-- | :-- |
| `egm-zoom-out` | Contrarian / YAGNI | completed |
| `egm-design` | Cost, quota and architecture risk | completed |
| `egm-comprehension` | UX for a first-time user | completed |
| `egm-implementation-readiness` | Migration, compatibility and open questions | completed |
| `egm-codebase-details` | Codebase grounding, reuse and debuggability | completed |
| `egm-structural` | Maintainability and tech debt | completed |

**Paths.**
* Code paths are relative to the repository root.
* "Claude installer", "Codex installer", "Codex README" and "CHANGELOG" mean copies saved during
  the brainstorm (since removed) of Claude Code's `install.sh`, Codex's `install.sh`, Codex's
  `README.md` and Claude Code's `CHANGELOG.md`.

### Risk summary

| # | Finding | Severity | Raised by |
| --: | :-- | :-- | :-- |
| B1 | The background safety check blocks the first report | Blocker | all six |
| B2 | The brand-new-path test cannot be kept apart from the owner's real keys, tools and sign-ins | Blocker | all six |
| M1 | Reading the sign-in status can sign the owner out; polling has no single owner | Major | design, comprehension, readiness, codebase, structural, zoom-out |
| M2 | "Can't tell" is shown as "signed out"; an older copy of the tool can trap the screen | Major | comprehension, readiness, codebase, structural, design |
| M3 | "Signed in" is not "signed in to a paid plan" | Major | comprehension, readiness, codebase, structural, design |
| M4 | Which tool is used has four owners already; auto-Codex adds a fifth | Major | readiness, codebase, structural, design, zoom-out |
| M5 | One fixed Terminal line cannot fit every state, and both lines can fail in misleading ways | Major | all six |
| M6 | "Copy and open Terminal" can paste the wrong thing, or paste into a running session | Major | design, codebase, structural, readiness, comprehension |
| M7 | Check-on-paste and focus-on-return have failure modes with nothing to press | Major | comprehension, design, readiness, codebase, structural |
| M8 | The SEC email: when it is saved, what if it is missing, and whether it is a work address | Major | comprehension, readiness, structural, design |
| M9 | There is no named finishing moment, and the click target is not defined well enough to test | Major | comprehension, zoom-out, codebase |
| M10 | Fewer screens hide what each report costs and where data goes | Major | comprehension, design |
| M11 | The one screen is four state machines at once, and "setup finished" has no engine owner | Major | structural, readiness |
| M12 | The nine-step code should be replaced, not adapted, but `steps.ts` is shared with eight other files | Major | structural, zoom-out, readiness |
| M13 | The release build is not set up, and an ad-hoc-signed release costs something on every update | Major | all six |
| M14 | Setup failures leave no record anywhere | Major | codebase |
| M15 | Two design docs disagree with the concept and the code | Major | structural, zoom-out, codebase |
| M16 | The terms position is clear only for the owner's own use | Major | design |

### Blockers

#### B1. The background safety check moves the block from setup to the first report

**What happens.**
* The concept says the 25-call check "does not block finishing setup". That is already true today:
  the Connected screen says the check keeps going while you carry on (`app/src/renderer/setup/tool.tsx:262`).
* The block comes later. The engine refuses `run_report` and `resume` while a check runs, with "The
  safety check is running. Wait for it to finish, then start the report."
  (`engine/src/tearsheet/server.py:689-694`, `:828-829`, `:874`).
* Home's `start()` calls `runReport` directly (`app/src/renderer/home/useRun.ts:175-184`), and
  `refusal()` has no special case for this code (`app/src/renderer/home/run.ts:247-254`).
* Today the nine screens give the check its roughly 3 minutes. A 2-click setup ends in seconds, so the
  first ticker the person types is turned away.

**What makes it worse.**
* The wait can be far longer than 3 minutes. The 25 probes run one after another, each with a
  300-second limit (`engine/src/tearsheet/ai/lockdown.py:250`, `:270-285`;
  `engine/src/tearsheet/config.py:135`).
* Nothing can stop a check: `m_cancel` only cancels reports (`server.py:923-927`), and the window
  has no call for it (`app/src/main/ipc.ts:13-45`).
* On a screen that fills itself in, the check would start as soon as a signed-in tool is found. It
  would spend 25 calls on the person's plan before they click anything.

**What already exists.**
* The report line already waits for the check before it starts the next report
  (`server.py:942-953`; `_something_running` includes `_safety_running`).
* The AI client already runs a 5-call short check before the first AI call, whenever this tool
  version has no recorded pass (`engine/src/tearsheet/ai/client.py:441-447`, `:470-491`). The full
  check adds the link-search and web-search probes the short check lacks (`lockdown.py:264`,
  `:326-327`). It is also the only way to clear a tool that failed.

**Required before drafting.** Choose one:
* **(a)** A report asked for during the check joins the existing line. The screen shows "Starts when
  the safety check finishes (n of 25)".
* **(b)** The full check does not run during setup. The 5-call short check covers the first report,
  and the full check runs after it.

Either way:
* add a way to cancel the check;
* start it only after an action by the person;
* measure the check's share of the 5-hour usage window on Claude and on Codex;
* if the check fails, the waiting report must say why, in the same place.

#### B2. The brand-new-path test cannot be kept apart from the owner's real state

**The keys are shared.**
* The Keychain service name is fixed: `KEYCHAIN_SERVICE = "Tearsheet"`
  (`engine/src/tearsheet/config.py:64`, `:81-102`).
* A fresh `TEARSHEET_DATA_DIR` separates only the database (`app/src/main/index.ts:24`;
  `app/src/main/lifecycle.ts:18-21`). So a "new user" test:
  * sees the owner's Massive key as `set` (`server.py:200-204`, `:1562`) and skips the key step
    (`app/src/renderer/setup/steps.ts:42`);
  * overwrites his real key if a test key is pasted (`server.py:1488`);
  * starts a price download that shares his free key's limit of 5 calls a minute
    (`server.py:1490-1492`; `config.py:161`).

**The real tools are always found.**
* `~/.local/bin` and `/opt/homebrew/bin` are always added to the search path
  (`app/src/main/loginShellPath.ts:14-16`).
* Pointing `TEARSHEET_CLAUDE_BIN` at a missing path makes the window say "missing"
  (`app/src/main/probe.ts:56-58`).
* The same value goes to the engine (`index.ts:60`, `:77`). `find_program` accepts it without
  checking that it exists (`config.py:337-339`), so the window and the engine disagree.

**The real line breaks the test's rules.**
* The Claude installer always fetches the latest version (Claude installer `:149`) and runs
  `claude install` (`:226`). That would move his 2.1.317 forward.
* The line then runs `claude auth login`, which the owner has ruled out.

**The real first-open path can be seen only once.**
* Once Open Anyway is clicked, macOS remembers the app.
* Environment variables do not reach an app opened from Finder.

**Two engines can go over SEC's limit.** A test copy beside the real app has its own SEC limiter at
8 requests a second (`config.py:159`). Together the two can reach 16 a second, over SEC's 10.

**Test methods that exist or are cheap.** Cheapest first:
* **(a) No Mac state touched.** Click-count tests in `Setup.test.tsx`, one for each scenario. They
  use the fake bridge's `freshSettings` and tool fixtures (`app/src/renderer/test/bridge.ts:24-27`,
  `:52-55`).
* **(b) Test hooks in the owner's own account:**
  * a test-only Keychain service name set by an environment variable, which the app never sets
    itself (the same pattern as `TEARSHEET_HIDDEN_WINDOW`, `lifecycle.ts:10-16`);
  * a separate `TEARSHEET_DATA_DIR`;
  * stand-in `claude` and `codex` scripts passed through `TEARSHEET_CLAUDE_BIN` and
    `TEARSHEET_CODEX_BIN`, like the ones in `app/src/main/probe.test.ts:37-56`;
  * in test mode, copy buttons that copy a harmless `echo` line instead of the real one;
  * `find_program` that checks a passed path exists;
  * a lower SEC rate whenever the real app may be running;
  * a launch command that passes the variables, such as `open -n -a Tearsheet --env ...`.
* **(c) A second macOS user account.** It has its own home folder, login Keychain and search path. It
  has no tools installed and gets its own Gatekeeper block. It is the only way to run the real
  Terminal lines without touching the owner's sign-ins. It needs one claude.ai sign-in inside that
  account.
* **(d) A macOS virtual machine.** Same as (c), with more setup.

**Before and after every test,** compare `loggedIn` and `orgId` from `claude auth status --json`
and the output of `codex login status`, to show that nothing changed.

### Major findings

#### Reading the tools

**M1. Reading the sign-in status is not a harmless read, and nobody owns how often it runs.**
* **The command can sign people out.** The changelog records:
  * `claude auth status` exiting before a slow token refresh was saved, which could sign you out
    (CHANGELOG `:252`, fixed in 2.1.317);
  * sign-outs after a short command such as `claude auth status` exited mid-refresh (`:1021`);
  * a reverted change to the command that "may have made sign-outs more frequent" (`:1930`);
  * a failing refresh that caused 401s in other sessions (`:28`). The owner runs several Claude Code
    sessions at once.
* **Tearsheet cuts it off.** The probe kills each command after 5 seconds and has no guard against
  two runs at once (`app/src/main/probe.ts:11`, `:31`, `:73-78`).
* **Many places call it.** Setup and Home each poll every 2 seconds (`app/src/renderer/pages/Setup.tsx:40`,
  `:192-215`; `app/src/renderer/pages/Home.tsx:325-343`). Seven renderer call sites each choose
  whether to skip the 30-second cache.
* **Requirement.** The main process owns the rhythm:
  * one probe at a time, with callers sharing its answer;
  * until the program exists, check only for the program and its version;
  * read the status only while waiting for a change, at most once every 10 to 15 seconds;
  * stop once the person is signed in;
  * check again when the window comes back, with a minimum gap;
  * never kill a status command partway through: let it finish, and ignore a late answer.

  The window listens for a `tools_changed` event instead of polling. Whether `codex login status`
  has the same refresh behaviour is unproven.

**M2. "Can't tell" is shown as "signed out", and an older copy of the tool can trap the screen.**
* **No answer counts as "signed out".** Any status the probe cannot read becomes `loggedIn: null`
  (`probe.ts:46-47`), and setup treats null as signed out (`steps.ts:40-41`). Causes:
  * a timeout during a refresh;
  * a Claude Code older than 2.1.41, which has no `auth` command (CHANGELOG `:8446`);
  * a change in the output format;
  * a warning printed after the JSON. The probe joins stdout and stderr (`probe.ts:33`) and parses
    from the first `{` to the end (`probe.ts:41`).
* **The person is then told to install and sign in again,** which on the owner's Mac breaks his rule.
* **An older copy can trap the screen.** `findOnPath` takes the first match (`probe.ts:16-27`), and
  `~/.local/bin` comes last. If an older npm or Homebrew copy is earlier on the path, the line
  installs and signs in a new copy that Tearsheet never looks at. The screen never changes, and with
  no Continue button there is no way out.
* **Requirement.**
  * Read stdout only, and treat missing fields as possible.
  * Give "can't tell" its own words ("Checking your Claude sign-in"), retry it, and never show the
    install line for it.
  * Show the Terminal line only after a clear `loggedIn: false` or a missing program.
  * Set a minimum version (2.1.41) with its own message.
  * Always show the path and version that were found.
  * Keep recorded real outputs for each tool version as test files, and refresh them when the tools
    update.

**M3. "Signed in" is not the same as "signed in to a paid plan".**
* **The Codex check passes API keys.** Codex counts as signed in on any "logged in" text
  (`probe.ts:49-50`), which includes "Logged in using an API key" (`probe.test.ts:193`).
* **The Claude check reads only `loggedIn`.**
  * A Console sign-in now reports `api_key` (CHANGELOG `:2170`).
  * Claude Code can fall back to Console billing (`:18-19`).
  * A free claude.ai account also shows `loggedIn: true`.
* **The screen's own wording is not checked.** "No API key in use" is fixed text
  (`setup/tool.tsx:250`).
* **The catch comes too late.** Today only the safety check's "runs on your plan, not an API key"
  item catches this (`steps.ts:183`). Under the concept that check runs after the person thinks they
  are done.
* **Requirement.**
  * Read `authMethod`, `apiProvider` and `subscriptionType` from the same status call.
  * For Codex, accept only "Logged in using ChatGPT".
  * Show the result in words ("Signed in as you@x.com, Claude Max"; "This sign-in uses an API key;
    Tearsheet needs a plan").
  * `subscriptionType` has briefly shown the wrong value during a refresh (CHANGELOG `:8087`), so
    check twice before warning.
  * Decide whether the design doc's API-key option (`docs/designs/tearsheet.md:165`) is dropped.

**M4. Which tool is used already has four owners, and the automatic switch to Codex adds a fifth.**
* **The current owners:**
  * Setup defaults to Claude unless `primary_tool` says Codex (`Setup.tsx:130`);
  * App uses `primaryTool ?? 'claude'`, then the first available (`app/src/renderer/App.tsx:370`);
  * the engine's `choose_tool` picks the first program it finds and ignores the sign-in
    (`engine/src/tearsheet/ai/client.py:629-641`);
  * the design doc says "connected" means the check passed (`tearsheet.md:308`), while the code says
    found and not blocked (`engine/src/tearsheet/ai/__init__.py:101-112`).
* **Two cases go wrong:**
  * If Claude Code is installed but signed out and Codex is signed in, the concept shows a sign-in
    line while a ready Codex sits idle.
  * If the automatic pick is not saved, a later Claude Code install moves reports to Claude without
    a word, while the passed check belongs to Codex.
* **The engine's tool paths are fixed at launch** (`index.ts:59-60`, `:77-78`; `config.py:335-339`).
  After a reinstall, the window can show one version while the engine checks another.
* **Requirement.**
  * One pure `pickTool(tools, savedPrimary)`, used by Setup and App: the first tool signed in to its
    plan, otherwise the first one installed.
  * Save the pick as `primary_tool` when setup finishes.
  * Pass the probe's path with each engine request, or restart the engine when the probe result
    changes.
  * Rewrite `tearsheet.md:308` to match.

#### The Terminal line

**M5. One fixed line cannot fit every state, and both lines can fail in ways that mislead.**

*Claude Code.*
* **The line works when the download works.** The installer exits with an error code when its own
  steps fail (Claude installer `:155`, `:173`, `:212`, `:217`, `:255`). It prints "Installation
  complete!" when it succeeds (`:258-260`).
* **A failed download still runs the second half.** In zsh a pipe's exit status is that of its last
  command, here `bash`. If `curl` fails, `bash` runs an empty script and exits 0. The second half
  then runs and prints "no such file or directory: ~/.local/bin/claude", which points at the wrong
  problem. Turn on `pipefail` for the line, or download to a file first.
* **The folder `~/.local/bin` is assumed, not stated.** The script hands over to the downloaded
  program's own `install` step (`:223-226`). Only the changelog supports that folder. If it moves,
  the line fails exactly the way today's line does.

*Codex.*
* **Today's line is the npm one** (`steps.ts:220`).
* **The official installer asks questions.** It asks "Start Codex now? [y/N]" through `/dev/tty`,
  even when piped (Codex installer `:1007-1020`, `:1064-1069`, `:1500`). Answering `y` opens Codex
  itself before `codex login` runs.
* **It can do more than install.** It can offer to uninstall an existing npm or Homebrew copy
  (`:1085-1110`), and it edits `~/.zprofile` (`:576-631`).
* **A setting turns the questions off.** `CODEX_NON_INTERACTIVE=1` does it, but only on the `sh` side
  of the pipe (`:6`, `:1010-1014`). The README uses the same `| VAR=value sh` form (Codex README
  `:31`). Line to test:
  `curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh && ~/.local/bin/codex login`.

*Both.*
* **Signed out needs no reinstall.** "Installed but signed out" needs only `<found path> auth login`
  (or `login`), built from `ToolStatus.path`. A reinstall:
  * can change the version, which throws away a passed check (`steps.ts:105-108`) and costs another
    25 calls;
  * over a Homebrew copy, makes two copies, and the path order then decides which one runs.
* **The installers print extra commands that look like part of the job.** Claude Code prints a
  "not in your PATH" note, and Codex prints `export PATH=... && codex` (Codex installer
  `:1040-1062`). Tearsheet does not need either. One sentence under the line should say so.
* **Home has the same broken line.** "Sign in again" shows the bare `claude auth login`
  (`app/src/renderer/pages/Home.tsx:183`), which fails for a new person who is signed out later.
* **The commands live in two places.** The ones in `app/src/main/tools.ts:13-14`, `:25-26` and
  `:35-36` are unused. The ones shown are in `steps.ts:205-224`.
* **Requirement.**
  * One line builder in the main process takes the probe result and one install-folder constant. The
    fallback PATH (`loginShellPath.ts:14`) and the "Where Tearsheet looked" text (`tool.tsx:54`) use
    the same constant.
  * Setup and Home both use the builder.
  * Each line template records the installer version and date it was checked against.
  * After about 90 seconds with no change, the screen shows recovery steps: "If Terminal shows red
    text or stopped, press Control-C, then Command-N, and paste again."

**M6. "Copy and open Terminal" can paste the wrong thing, or paste into a running session.**
* **A failed copy goes unnoticed.** The copy uses the window's `navigator.clipboard`, which needs
  focus and quietly ignores failure (`app/src/renderer/setup/parts.tsx:61-68`).
* **The copy and the Terminal call are separate.** Opening Terminal is a separate main-process call
  (`ipc.ts:96-98`). If Terminal takes focus first, the copy fails. The person then pastes whatever
  was on the clipboard before, perhaps the Massive key, which ends up in shell history.
* **The paste can land in a live session.** `open Terminal.app` brings forward an existing window. On
  the owner's Mac that may be a running Claude Code session, which would take the paste as a prompt.
* **Requirement.**
  * One main-process call writes the clipboard with Electron's `clipboard`, reads it back to confirm,
    opens a new Terminal window only after the copy worked, and tells the window either way.
  * The line comes from the M5 builder, never from the window.
  * Next to the button: "In Terminal, press Command-V, then Return."
  * Opening a window types nothing, so Anthropic's rule still holds.

#### The key and the email

**M7. Check-on-paste and focus-on-return have failure modes with nothing to press.**
* **The clipboard probably holds the wrong thing.** On a new Mac it most likely still holds the
  Terminal line Tearsheet just copied, or it holds a password. Focusing the key field on return and
  checking on paste sends it to Massive. The person then reads "Check that you copied all of it"
  (`steps.ts:237`), which is the wrong advice.
* **The field gets in the way of a retry.**
  * It is a password field, so the person cannot see what they pasted (`KeyCard.tsx:124`).
  * A rejected value stays in it (`KeyCard.tsx:91`), so a second paste adds to the old text.
  * It is disabled while a check runs (`KeyCard.tsx:130`).
* **A slow answer looks like a hang.**
  * "Couldn't reach Massive just now" (`steps.ts:238`) leaves nothing to press without a Check
    button.
  * Key checks share the 5-calls-a-minute limiter with the price download that starts once a key is
    saved (`server.py:319`, `:1474-1475`, `:1490-1492`).
  * Quick re-pastes can keep the field on "Checking..." for up to a minute, and the answers can come
    back out of order.
* **Focus can go to the wrong place.** Moving focus on every return can take it away from the email
  Change field, or fire after Terminal rather than Massive. Electron's first click on an inactive
  window only brings it forward, because the window has no `acceptFirstMouse` (`index.ts:83-100`).
* **Settings changes too.** KeyCard is shared with Settings (`app/src/renderer/settings/Keys.tsx:9`,
  `:79`), so removing its Check button there is a separate decision.
* **The Massive button opens the home page** (`KeyCard.tsx:28`). Deeper massive.com pages are already
  allowed (`app/src/main/external.ts:3`).
* **Requirement.**
  * Check the key's shape locally before any network call; this needs to know what a Massive key
    looks like. Recognise pastes that are clearly not a key (spaces, `curl`, `http`, `@`).
  * Clear or select the field after a rejection.
  * Show a short masked view of what was pasted.
  * Run one check at a time, wait briefly after a paste, and use only the latest answer.
  * Show "waiting for Massive's limit", and a Try again link when Massive cannot be reached.
  * Move focus only to the first unfinished field, only after the massive.com trip, and only if the
    person has not focused another field.
  * Keep a slow background poll as a backup for a missed focus event.
  * Open Massive's sign-up or keys page, and say which string to copy.

**M8. The SEC email: when it is saved, what happens when it is missing, and whose address it is.**
* **Where it goes.** The email goes in the User-Agent of every SEC request
  (`engine/src/tearsheet/config.py:311-319`).
* **A missing email has no rule.** Nothing says what happens when `email` is missing, null or empty:
  API-key sign-ins, other `apiProvider` values, older versions, or `IS_DEMO` (CHANGELOG `:8839`).
  The changelog never mentions an `email` field, so this rests on the owner's observed output.
* **The person may never see it.** If setup finishes itself as soon as the key works, the email is
  saved before the Change control can be used.
* **It can be overwritten.** A screen that keeps reading the status can write the Claude email back
  over one the person typed.
* **It may be a work address.** A Team or Enterprise account (`orgName` present) usually means one,
  and a work plan used for personal research is its own question.
* **Claude Code is careful with the address too.** It now asks before a tool call sends the account
  email to the network (CHANGELOG `:242`), so showing and confirming it matters.
* **Requirement.**
  * Fill the email only when none is saved; read it once, as a suggestion, and never re-sync it.
  * Store where it came from (`email_source`: from the Claude status, or typed). Never overwrite a
    typed one.
  * Save it only at the finishing click.
  * Fall back to a typed field for Codex, and for a missing or empty email.
  * Use the engine's email check (`config.py:193-199`).
  * Say on the same line where it goes: "SEC, the US agency that publishes company filings, gets this
    email with each filing download, and no one else."
  * Suggest a personal address when `orgName` is present.
  * Pass only `loggedIn`, `authMethod`, `apiProvider`, `subscriptionType`, `email` and whether an
    organisation is present to the window. Never pass `orgId` or `orgName` itself, and never log the
    email.

#### The screen itself

**M9. There is no named finishing moment, and the click target is not defined well enough to test.**
* **The concept never names its second click.** It removes Check and Continue but never says what
  "about 2" clicks are. If the screen leaves by itself when the key passes, the email it was meant to
  show disappears before it is read.
* **Returning to the window is counted as a click in `clicks-today.md`** (rows A7, B4 and B9). The
  proposal does not say whether it counts.
* **With both counted, the brand-new path is 5:**

  | Path | Clicks in the window, with return clicks and a finish button |
  | :-- | :-- |
  | Claude Code signed in (A) | Open massive.com (1), click back (1), finish (1) = 3 |
  | Brand-new Mac (B) | Copy and open Terminal (1), click back (1), Open massive.com (1), click back (1), finish (1) = 5 |

  B drops to 3 or 4 only if the person uses Command-Tab to return, or if `acceptFirstMouse` lets the
  click that brings the window forward also press a button. 5 misses "under 5".
* **Requirement.**
  * Name one finishing button, for example "Start my first report". While it cannot be used, it
    says what is still missing ("Waiting for your Massive key"). The screen never leaves on its own.
  * Write down how a return to the window is counted.
  * Write the target as automated click-count tests for scenarios A to D.

**M10. Fewer screens hide what each report costs and where data goes.**
* **The text names Claude even for Codex users.** Welcome says "written by your own Claude" and
  "You'll need a paid Claude plan" (`app/src/renderer/setup/intro.tsx:21`, `:37`).
* **Two plans pay when both tools are present.** Reports also use the other tool to check each draft
  (`ai/__init__.py:115-132`; `app/src/renderer/settings/settings.ts:130-142`). Setup never says so,
  and the owner's Mac is exactly this case.
* **The per-report cost is never shown.** The design's Phase 0 target, at most half of a 5-hour
  window on Pro per report (`tearsheet.md:173`), appears on no setup screen.
* **"How it works" is the only place that says where data goes** (`intro.tsx:75-83`), and its words
  are written for Claude only.
* **Requirement.**
  * One line under the tool row names the tool, the plan and the cost, and says when the second tool
    is also used.
  * One sentence names each place data goes: Anthropic or OpenAI for text, SEC for the email, Massive
    for the key and price requests. It is visible without a click.
  * Tool words come from one table, so Codex users never read about Claude.
  * Say what the safety check checks ("that Claude Code can only read and write text for Tearsheet:
    no commands, no files"). "Safety check" alone reads as a scan of the Mac.

**M11. The one screen is four state machines at once, and "setup finished" has no engine owner.**
* **Four independent pieces of state:**
  * **tool:** missing, can't tell, signed out, on a plan, on an API key, too old;
  * **key:** empty, checking, rejected, unreachable, works, already saved, Keychain refused;
  * **email:** none, suggested, typed, editing, invalid, save failed;
  * **safety check:** not started, running, passed, failed, unfinished.

  Focus sits on top of all four. `Setup.tsx` already holds 14 `useState` hooks and 4 refs
  (`Setup.tsx:65-83`) for a straight-line flow.
* **The writes are scattered.** `primary_tool` is saved at Connected (`Setup.tsx:219-220`), the email
  at its own step (`app/src/renderer/setup/details.tsx:71-80`), and `setup_done` at the end
  (`Setup.tsx:258-264`).
* **Live check progress exists only in the window's memory** (`App.tsx:232-236`, `:248-250`). With
  nothing known, `safetyView` defaults to "running 0 of 25" (`steps.ts:174`), even when nothing is
  running.
* **Requirement.**
  * Each piece is a pure reducer in its own module, following the tested pattern of `steps.ts` and
    `steps.test.ts`.
  * One pure `screenView(tool, key, email, safety, focus)` decides what shows, where focus goes and
    whether Finish works. The component only wires events.
  * One engine method, `complete_setup {primary_tool, sec_contact_email, email_source}`, checks the
    requirements and writes them with `setup_done` in one transaction.
  * The engine reports live check progress, and the window reads it from the engine instead of using
    a default.

**M12. The nine-step code should be replaced, not adapted, but `steps.ts` is shared.**
* **What the one screen does not need:**
  * `STEP_ORDER`, `resumeStep`, `nextStep`, `nextLabel`, `hasProgress` and `progressSegment`
    (`steps.ts:12-90`);
  * Welcome and How it works (`intro.tsx`);
  * Find, Install and Connected (`tool.tsx:15-140`, `:224-277`);
  * Ready (`details.tsx:169-244`);
  * the switched-off one-click install: `ONE_CLICK_ENABLED` (`steps.ts:8-10`), `OneClick`
    (`tool.tsx:142-210`) and `tool.test.tsx`;
  * the npm line and nodejs.org hint (`steps.ts:220`; `tool.tsx:82-89`; `external.ts:3`).
* **`steps.ts` is not setup-only.** Eight files outside setup import its types and helpers: `App.tsx`,
  `nav.ts`, `Home.tsx`, `settings.ts`, `General.tsx`, `Settings.tsx`, `topics.ts` and `Keys.tsx`.
* **FRED later needs no new code.** Home already says "Economic figures aren't connected", with an
  "Add the key" button (`app/src/renderer/home/since.ts:157`; `Home.tsx:286-297`). It already
  ignores `fred_skipped` (`since.ts:30-31`).
* **Carry-over needs no work.** `setup_done=1` opens Home (`App.tsx:170`), and the engine marks setup
  done for an install that already has reports (`server.py:1563-1568`).
* **Backing out has limits.** An older engine opens a newer database read-only
  (`engine/src/tearsheet/db/__init__.py:100-111`), so the old screens could not save `setup_done`.
* **Requirement.**
  * First move the shared parts out of `steps.ts`: safety state into its own module, tool words into
    their own, and `isEmail`, `versionNumber` and `keyProblem` into a helpers module.
  * Then delete the nine-step code, `OneClick` and their tests in the same change.
  * Keep `KeyCard`, `parts.tsx`, `SafetyChip` and the email save logic.
  * No database migration. Write only existing settings, or add new ones through `SETTINGS`,
    `SetSettingParams` and a regenerated `shared/protocol.ts`.
  * Stop writing `fred_skipped`, but leave it readable so a revert still works.
  * Back out with a git revert, not a flag.

#### Release and first open

**M13. The release build is not set up, and an ad-hoc-signed release costs something on every update.**
* **There is no release build yet.**
  * The only target is `dir` (`app/electron-builder.yml:25-28`), and its header says the build is
    "for the Mac it was built on" (`:5-6`).
  * The design doc's §13 describes Developer ID signing, notarization and auto-update
    (`tearsheet.md:663-668`).
* **The zip and the engine can each fail to open.**
  * A zip that loses the symlinks inside Electron's frameworks breaks the signature. macOS then calls
    the app "damaged", with no Open Anyway route. This is likely but not verified.
  * Whether macOS blocks `Tearsheet Engine` separately is unknown (`clicks-today.md:37-38`). Only a
    copy downloaded through a browser, and so quarantined, will show it.
  * If macOS kills the engine, the app restarts it every second with no limit
    (`app/src/main/engine.ts:122-130`). The log shows only "[engine exited: code null signal SIGKILL]".
* **Every new build costs something.**
  * Each new ad-hoc build likely meets Gatekeeper again (12 to 15 clicks).
  * The Keychain can ask again, because access is tied to the program that saved the key
    (`config.py:73-78`). `uv python install 3.12` can pick up a newer patch release
    (`scripts/build-engine.sh:24`).
  * The release has the same app ID and data folder as the owner's local build. If the local build is
    running, the one-copy lock quits the new copy (`lifecycle.ts:18-43`).
* **What newcomers trip on.**
  * The block dialog offers "Move to Trash" next to "Done".
  * Open Anyway may stay in Privacy & Security only for a limited time (about an hour, from
    recollection, not verified).
  * The release is Apple-Silicon-only, and nothing tells an Intel owner why it will not open.
* **Requirement.**
  * Add a `dmg` target. Check that it needs no download, since the config avoids downloads
    (`electron-builder.yml:18-19`); `hdiutil create` is the fallback.
  * If a zip is kept, make it with electron-builder or `ditto`, and check the unzipped copy with
    `codesign --verify --deep --strict`.
  * Cap engine restarts (for example 3 in 30 seconds), then show the error screen with the signal and
    the first-open steps.
  * Put the first-open steps in the release notes and the DMG window, before the double-click: "Click
    Done, not Move to Trash", what to do if it says "damaged" or a second "Tearsheet Engine" box
    appears, and how to check for an Apple chip.
  * Write down the per-update Keychain and Gatekeeper cost next to the first-open steps.

#### Diagnostics

**M14. Setup failures leave no record anywhere.**
* **The main process logs nothing.** The only log is the engine's stderr in `logs/engine.log`
  (`engine.ts:110`; `index.ts:80`).
  * `loginShellPath` hides the shell's errors and never records which PATH it used
    (`loginShellPath.ts:29-40`).
  * The probe discards output and exit codes, and turns a timeout kill into exit code 1
    (`probe.ts:31-32`). "Timed out", "crashed" and "signed out" all look the same.
  * `openTerminal` ignores errors (`ipc.ts:96-98`).
  * "Where Tearsheet looked" is fixed text, not the PATH actually used (`tool.tsx:54`).
* **The app's safety check writes no report.** The command-line check writes a JSON report
  (`engine/src/tearsheet/cli.py:125-127`); the app's check does not (`server.py:1506-1554`).
* **The engine log is thin.** It has no timestamps and records only warnings and worse
  (`cli.py:862-866`).
* **Requirement.**
  * Add a local `logs/setup.log` with timestamped lines for: where the PATH came from; each probe's
    path, exit code or signal, duration and parsed sign-in fields; screen state changes; copy and
    Terminal results; and key-check result codes.
  * Never log the email, `orgId`, `orgName`, raw status output or any key. Codex's API-key line
    echoes part of a key (`probe.test.ts:193`).
  * Add a "Show log in Finder" action.
  * Write the safety check's JSON report from `_safety_job`, reusing `report.to_json()`.
  * Add timestamps to the engine log.

#### Documents and terms

**M15. Two design docs disagree with the concept and the code.**
* **The code's own spec is `docs/designs/report-look.md:164-218`** ("The first-time path", cited at
  `Setup.tsx:1`). It describes the nine screens, the npm line and the switched-off one-click button.
* **In `docs/designs/tearsheet.md`:**
  * CUJ 6 (`:159-165`) describes a Connections screen with an install button and an API-key option;
  * §12 (`:640`, `:660-661`) describes an email the user types and install commands that "run";
  * §13 (`:663-668`) describes signed, notarized, auto-updating builds;
  * A31 (`:954-959`) marks "detect only" as rejected, but it is now the plan;
  * items 41, 43, 45, 47 and 49 to 51 describe parts that will not exist.
* **`docs/designs/opening-and-setup.html` still describes the old flow.**
* **Requirement.**
  * Rewrite `report-look.md`'s first-time path as the one-screen spec.
  * In the same change as the code, update the `tearsheet.md` sections above:
    * split §13 into "private build now" and "signed build later";
    * mark A31 as chosen, and keep one-click as an alternative to revisit if Anthropic approves;
    * remove or defer item 49.
  * Mark `opening-and-setup.html` as superseded.

**M16. The terms position is clear only for the owner's own use.**
* **Owner-only use is covered.** Copy-and-open-Terminal, plus plan usage that starts with no click,
  are fine as the owner's own use (`tearsheet.md:672`).
* **Use by others is not.** That is the case Anthropic's rule names for anyone else (`:673`).
* **OpenAI's terms are still unchecked** (`:674`), yet the concept makes Codex an automatic path.
* **Requirement.** Write into the draft that the private link stays with a single user until each
  company's terms are checked for others.

### Nits

* **`clicks-today.md`'s own sums are slightly high.** Scenario A's rows add to 13, not 14
  (`clicks-today.md:50-61`). Scenario B's "8 extra" counts the click on Terminal (row 6), so about 7.
  The direction does not change.
* **The screen can briefly show "missing" to someone who has the tool,** if the line appears before
  the probe answers (up to two 5-second calls). Reserve the space, and show the line only after a
  clear answer.
* **Startup can stall before the window appears.** The login shell runs synchronously for up to
  5 seconds, plus up to 10 seconds of probing (`loginShellPath.ts:30-34`; `index.ts:59`).
* **A different config folder can hide a sign-in.** If `CLAUDE_CONFIG_DIR` or `CODEX_HOME` is set in
  the person's shell, a sign-in made in Terminal may be invisible to the app. Compare
  `configDirectory` with the default and warn when they differ.
* **A missing FRED key can look like a fault.** The person never chose to skip it, so "Economic
  figures aren't connected" can read as broken. The later prompt should say it is optional, free and
  takes about 2 minutes, and it must not interrupt reading.
* **`loginExpiresAt` (2.1.318, CHANGELOG `:157`) could warn before a sign-in ends.** The owner's
  2.1.317 does not have it yet.
* **`ToolStatus` is written out twice** (`app/src/main/tools.ts:40-48`;
  `app/src/preload/api.d.ts:9-17`). Adding fields means editing both. Define it once.
* **The email check exists in TypeScript and in Python** (`steps.ts:93-95`; `config.py:193-199`).
  Let the engine's decide.
* **Check calls happen after setup too.** After each Claude Code update, the first report spends
  5 short-check calls. With both tools connected, a second gate runs on the other tool. Count these
  in the cost figures.

### What holds up

These come after the critique on purpose. They are the parts the lenses agreed need little or no new
code.

* Reading the sign-in from the status command, never the credential files, is already built
  (`probe.ts:1-3`, `:63`; `tools.ts:24`, `:34`).
* The full-path Terminal line is the whole PATH fix. Tearsheet and the engine already look in
  `~/.local/bin` (`loginShellPath.ts:14`; `config.py:335-341`), so a tool installed after Tearsheet
  opens is found without a restart. An npm or nvm install made later would still need a restart.
* The email needs no new command. The probe already runs `claude auth status --json`
  (`tools.ts:24`); only an `email` field on `ToolStatus` is new.
* FRED after the first report already exists on Home.
* The owner's finished setup carries over.
* The engine already falls back to Codex when Claude Code is missing (`client.py:629-641`).

### Where the lenses disagreed

* **When the full safety check runs.** Zoom-out would not run it during setup, and let the 5-call
  short check cover the first report. Structural, codebase and comprehension would queue the first
  report behind it. Design and readiness accept either. This is decision D1 below.
* **Test stand-ins.** Zoom-out wants two or three fixed stand-ins and no fake that changes state.
  Structural wants one dev-only shim that answers `--version` and status from a state file and passes
  every other command to the real program. With the shim, the safety check runs on the real tool and
  spends real plan usage, but it never signs in or out. This is decision D2.
* **The zip.** Zoom-out would ship only the DMG, because a zip mainly serves auto-update, which waits
  for Developer ID signing. The others would ship both and check the zip. This is decision D6.
* **Release by hand or scripted.** Zoom-out: build on the owner's Mac and upload with `gh release
  create`, no CI. Structural: script it so nothing is done by hand. Both are met by one local script
  and no CI.
* **`fred_skipped`.** Zoom-out would delete it. Structural would keep its meaning and add a new offer
  state. Readiness notes that a revert to the old screens resumes at the FRED step unless it is set.
  Both are met by keeping it readable, no longer writing it, and treating Home's existing line as the
  "later" step.

## Goals vs. Non-Goals

* **In-Scope Goals:**
  * One setup screen that finds Claude Code or Codex, reads its sign-in from the tool's own status
    command, and tells "signed in to a plan", "signed in some other way", "signed out", "too old" and
    "can't tell" apart.
  * One Terminal line for each tool and state:
    * missing: install plus sign-in, with the full path and a failed download stopping the line;
    * signed out: the found path plus sign-in;
    * too old: an update.
  * The Codex line uses the official curl installer with `CODEX_NON_INTERACTIVE=1`.
  * One button that copies the line in the main process and opens a new Terminal window.
  * The Massive key checked on paste, with a local shape check, one check at a time, and a way to try
    again.
  * The SEC email suggested from Claude Code's status, shown with where it goes, changeable, and
    saved only at the finishing click. Codex users and missing emails get a typed field.
  * A named finishing button that never leaves on its own.
  * The first report waits for the full safety check (D1), with a way to stop the check. Nothing is spent on the plan before the person acts.
  * FRED offered after the first report, using Home's existing prompt.
  * "How it works" cut to one sentence naming the tool, the plan and where data goes.
  * Click-count tests for scenarios A to D, with a written rule for how returns to the window count.
  * A fixed "Sign in again" line on Home.
  * A local setup log with no personal data.
  * A private GitHub release (DMG and zip, D6) with first-open steps, built and
    uploaded by one local script.
  * A safe test method: test hooks on the owner's account plus one real run on a separate macOS
    account or virtual machine.
  * The design docs updated in the same change.
* **Out-of-Scope Non-Goals:**
  * Tearsheet running any install or sign-in itself, or typing into Terminal.
  * Reading Claude Code or Codex credential files.
  * Apple Developer ID signing, notarization and auto-update. These are the planned way out of the
    per-update Gatekeeper and Keychain prompts, for later.
  * Intel builds.
  * Public distribution, and testers other than the owner.
  * Removing the need for a Massive key, the only way to cut Massive's sign-up clicks.
  * Cutting clicks outside the window, beyond clearer instructions and deeper links.
  * The FRED key during setup.
  * An API-key option in setup (D4).
  * Clearing OpenAI's terms. This is needed before anyone else gets the link, not for this work.

## Alternatives Weighed

* **Keep the nine screens and fix only what is broken.** That means the two Terminal lines, the
  Next-only screens removed, FRED dropped and the email prefilled. Scenario A falls to about 3 clicks
  with little new code. *Not rejected:* it becomes stage 0 below, because it makes the brand-new
  path finishable before the new screen exists.
* **A one-click install and sign-in button inside Tearsheet** (`ONE_CLICK_ENABLED`). *Rejected:*
  Anthropic's rule forbids third-party products offering claude.ai login without approval. Delete the
  switched-off code, and keep it as an alternative to revisit if Anthropic approves.
* **Reading the tools' credential files to learn the sign-in.** *Rejected* by the owner. The status
  command gives the same answer.
* **Run the full 25-call check during setup and refuse reports while it runs.** This is today's
  engine behaviour, under the concept as written. *Rejected:* it turns the first report away. It is
  replaced by queueing, or by deferring the check (D1).
* **Start the safety check as soon as a signed-in tool is found when the app opens.** *Rejected:* it
  spends 25 calls of the person's plan before they click anything.
* **Poll the sign-in status every 2 seconds.** *Rejected:* the changelog ties sign-outs to the
  status command exiting mid-refresh. It is replaced by one probe at a time, triggered by focus, with
  a slow backup and no killing.
* **One fixed install-and-sign-in line for every state.** *Rejected:* reinstalling only to sign in
  can change the version, throw away a passed check, and leave two copies.
* **The bare `claude auth login` line.** *Rejected:* it is not found on a new Mac's Terminal PATH.
* **`npm install -g @openai/codex`.** *Rejected:* a new Mac has no npm, and a Node install from
  nodejs.org then gives a permission error.
* **The official Codex curl line without `CODEX_NON_INTERACTIVE=1`.** *Rejected:* its "Start Codex
  now?" question can open Codex before `codex login` runs.
* **Moving on by itself once the key passes.** *Rejected:* the auto-filled SEC email might never be
  seen, which defeats "shown, so the person knows".
* **Pick the tool by presence, as `choose_tool` does today.** *Rejected:* a signed-out Claude Code
  would be chosen over a signed-in Codex. Pick by sign-in first.
* **Test the brand-new path with only a fresh `TEARSHEET_DATA_DIR`.** *Rejected:* the Keychain is
  shared, so the key step is skipped and a pasted key overwrites the real one.
* **Paste the real Terminal line on the owner's account to test it.** *Rejected:* it updates Claude
  Code and runs a sign-in.
* **Polling-based "fills itself in" with no finish button.** *Rejected* for the same reason as moving
  on by itself, and because it gives no testable end point.
* **A feature flag for the new screen.** *Rejected* for a one-user app: replace the old screens and
  back out with a git revert.
* **Adapting the nine-step state machine to one screen.** *Rejected:* most of it has no job on one
  screen. Move out the shared parts and delete the rest.
* **A CI release workflow.** *Rejected for now:* a local script that builds and runs `gh release
  create` is enough for one private member.
* **A zip in the release.** *Open (D6):* it mainly serves auto-update, which waits for signing, and
  it risks the "damaged" failure if made badly.
* **`xattr -dr com.apple.quarantine /Applications/Tearsheet.app` instead of System Settings' Open
  Anyway.** *Open:* for an owner-only link, one pasted line replaces 5 to 6 clicks and may also cover
  the engine. It removes macOS's check for that app, so the first-open steps should still describe
  Open Anyway.
* **Apple Developer ID signing ($99 a year).** *Deferred:* it is the only thing that removes the
  Gatekeeper steps and the per-build Keychain prompts.

## Key Decisions & Staging for Next Steps

### Decisions already made by the owner (carry forward unchanged)

* The click target counts only Tearsheet's window.
* Using the Claude sign-in email is fine if it is shown and changeable.
* FRED comes after the first report.
* "How it works" stays short.
* The release link is private.
* The only tester for now is the owner.
* Tearsheet never runs the install or sign-in itself, and never reads credential files.

### Decisions made after the review (2026-11-08)

The owner asked for these to be settled without him ("handle them"). Each says what was chosen and
why, so the draft can carry it forward or argue with it.

* **D1. The safety check and the first report: the report waits for the full check.**
  * A report asked for while the check runs joins the existing line (`server.py:942-953`) instead of
    being refused. The screen says "Starts when the safety check finishes (8 of 25)".
  * Why not the 5-call short check: it leaves out the link-search and web-search probes, so the first
    report would run with a weaker guarantee than every later one. §4 of the design puts the full
    check in front of AI calls on a new tool version.
  * The check starts at the person's first click in setup ("Get a free key" or "Copy the line and
    open Terminal"), not when the screen opens. It then runs while they sign up at Massive, which takes
    a few minutes anyway. Nothing is spent on their plan before they act.
  * The safety chip gets "Stop the check". A stopped check counts as not finished, and the waiting
    report says so with "Run it again".
  * A check that fails shows its reason where the waiting report is, not only in the chip.
  * Before the draft: measure the check's share of the 5-hour window on Claude, from the rate-limit
    readings the engine already records for each call (`client.py` `CallRecord.rate_limit`), and on
    Codex.
* **D2. Testing the brand-new path: test switches on the owner's account, plus one real run.**
  * Test switches, each set only by a test launch and never by the app:
    * a test Keychain service name (`TEARSHEET_KEYCHAIN_SERVICE`), so the test never sees or
      overwrites the real Massive key;
    * a separate `TEARSHEET_DATA_DIR`;
    * stand-ins through `TEARSHEET_CLAUDE_BIN` and `TEARSHEET_CODEX_BIN`;
    * in test mode, the copy button copies the stand-in's own install and sign-in line, so the real
      installer can't be pasted by mistake;
    * `find_program` checks that a passed path exists, so the window and the engine agree;
    * a lower SEC rate in test mode, so a test copy beside the real app stays under SEC's limit.
  * The stand-in is a small shim with a state file. It answers `--version`, the sign-in status and the
    sign-in line itself (missing, signed out, signed in, too old, usage limit). It hands every other
    command to the real tool. So the safety check makes real calls through the owner's real Claude
    Code, which proves the connection works, while nothing signs in or out.
  * One real run before the release, in a second macOS user account that the owner creates. Its
    claude.ai sign-in is his own action in a separate account and does not touch his main one.
    Tearsheet's sessions never create the account or sign in.
  * Before and after every test: compare `loggedIn` and `orgId` from `claude auth status --json` and
    the output of `codex login status`.
* **D3. How clicks are counted: every click in Tearsheet's window, including the one that brings it
  back to the front.**
  * Keys (⌘Tab, ⌘V, Return) and typing don't count.
  * Target: at most 3 clicks when Claude Code is already set up, at most 4 on a brand-new Mac.
  * How it fits:
    * The window takes the first click (`acceptFirstMouse`), so the click that brings it back also
      presses the button under it.
    * The key field has focus whenever the window comes back while the key is still missing.
    * There is a named finishing button that never leaves on its own.
  * Claude Code already set up: Get a free key (1), the click back onto the key field (2), ⌘V, Start
    (3).
  * Brand-new Mac: Copy the line and open Terminal (1), the click back onto "Get a free key" (2), the
    click back onto the key field (3), ⌘V, Start (4).
  * The draft may remove Start by making "type your first company and press Return" the finish. That
    would bring both counts down by one.
* **D3a. Reading the sign-in status (M1): one read at a time, never cut off partway.**
  * No 5-second kill for the status command. A read that takes over 60 seconds is "can't tell".
  * Read only while the window is in front and the screen is waiting on the person: at most every 5
    seconds, and once each time the window comes back to the front.
  * This goes in Stage 0, because it also applies to today's screens.
* **D4. What "on a paid plan" means.**
  * Claude Code is ready when `authMethod` is the claude.ai sign-in and `subscriptionType` is a paid
    plan. A free plan gets "Claude Code needs a paid Claude plan, like Pro or Max". An API-key or
    Console sign-in gets "Tearsheet runs on your Claude plan. Sign in with your Claude account" and the
    sign-in line.
  * Codex is ready when it says "Logged in using ChatGPT". An API-key sign-in gets the same kind of
    line.
  * Setup offers no API-key option. Settings keeps the existing billing setting for the owner.
* **D5. The email.**
  * Shown in full on the setup screen with "SEC gets this email with each filing download" and
    Change.
  * Saved at the finishing click, with `email_source` set to the Claude sign-in. Settings keeps
    masking it as it does today.
  * No warning about organisations: `orgName` can't tell a work account from a personal one.
* **D6. The release.**
  * DMG and zip, both: `Tearsheet-0.0.1-arm64.dmg` and `Tearsheet-0.0.1-arm64.zip`.
  * SHA-256 checksums and the first-open steps go in the release notes. The DMG window shows the steps
    too.
  * The per-update Gatekeeper and Keychain prompts are accepted until Developer ID signing, since the
    owner is the only tester.
  * One local script builds both and uploads them. Each upload is confirmed by the owner first.
* **D7. Settings' key card.** It checks on paste too, and keeps its Check button. Setup's card has no
  Check button.

### Proposed staging

* **Stage 0: make today's path finishable.** No new screen; small and reversible.
  * Fix the Claude line: full path, and stop on a failed download.
  * Replace the Codex line with the curl installer and `CODEX_NON_INTERACTIVE=1`.
  * For "signed out", show only the found path plus sign-in.
  * Fix Home's "Sign in again" line.
  * One line builder and one copy-and-open call in the main process.
  * One probe at a time, never killed partway through, with a separate "can't tell" state; read
    `authMethod` too.
  * The first report joins the line during a check (D1).
  * Add `setup.log` and timestamps in the engine log.
* **Stage 1: a safe way to test.**
  * The test Keychain service name, stand-ins, harmless copy lines in test mode, and `find_program`
    checking that a path exists.
  * Click-count tests for scenarios A to D in `Setup.test.tsx`.
  * Recorded real status outputs as test files.
* **Stage 2: the one screen.**
  * Move the shared parts out of `steps.ts`.
  * Build the reducers and `screenView`, the paste check, the focus rule, the email suggestion,
    `complete_setup`, `pickTool` and the finishing button.
  * Delete the nine-step code, `OneClick` and the npm hint.
  * Rewrite `report-look.md`'s first-time path and the `tearsheet.md` sections in the same change.
* **Stage 3: the private release.**
  * The `dmg` target (and zip per D6), one local build-and-upload script, and the first-open steps.
  * The engine restart cap.
  * One real run from a browser download on a separate macOS account, on macOS 27.2. It settles
    whether `Tearsheet Engine` is blocked separately.
* Then run `/egm-draft` with this brief.

### How success is measured

* **Automated:** the click-count tests pass for scenarios A to D: at most 3 clicks with Claude Code
  set up, at most 4 on a brand-new Mac (D3).
* **Real run:** on a clean macOS account, the time from opening the app to a *started* first report,
  not only the clicks.
* **Owner's account untouched:** before and after every test, `claude auth status --json`
  (`loggedIn`, `orgId`) and `codex login status` are unchanged.
* **Cost:** the safety check's measured share of a 5-hour window, on Claude and on Codex, is written
  into the draft.

### Facts still to check

* Which values `subscriptionType` takes for Free, Pro, Max, Team and Enterprise (D4).

* Whether macOS blocks `Tearsheet Engine` separately on a downloaded copy.
* How long Open Anyway stays available after a block (about an hour is a recollection, not verified).
* Whether an ad-hoc-signed zip shows "damaged" on macOS 27.2.
* Whether Claude Code's own `install` step always uses `~/.local/bin`. Only the changelog supports
  it.
* Whether `codex login status` can refresh tokens, and what its exit codes are on 0.165.
* Whether Claude Code's macOS sign-in depends on `HOME`. This matters for any test that points `HOME`
  elsewhere.
* What a Massive key looks like, for the local shape check, and which Massive page shows it.
* That the `email` field is present in `claude auth status --json` across versions. It is observed on
  the owner's Mac but not documented in the saved changelog.
