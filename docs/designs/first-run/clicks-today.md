# Clicks today: from the download link to the first report

* **Author:** Claude (EGM brainstorm, step 1), for Liam Blackshaw-Brown
* **Date:** 2026-11-08
* **Counted from:** the code on `main` at 162865c (`app/src/renderer/pages/Setup.tsx`,
  `app/src/renderer/setup/*`), Claude Code's and Codex's own install scripts (read, not run),
  and macOS 27.2's rules for apps that are not signed by Apple.

## How this counts

* **A click** is one mouse click or trackpad tap anywhere: in Tearsheet, the browser, Finder,
  System Settings or Terminal. A double-click counts as one. A drag counts as one.
* **Keys** (⌘V, Return, ⌘Tab) and **typing** (an email, a password) are listed apart. They take
  time, but they are not clicks.
* Counts inside Tearsheet are exact: they come from the code. Counts on other sites (Massive,
  claude.ai, FRED) are estimates, marked **~**, because those sites can change and depend on the
  person (Google sign-in or email, an email to confirm).
* The link does not exist yet. Part 1 counts what a private GitHub release with a DMG would cost.

## Part 1. Getting the app open (before Tearsheet's first screen)

| # | Where | What the person does | Clicks |
| --: | :-- | :-- | --: |
| 1 | Message | Click the link | 1 |
| 2 | GitHub | Signed in already? If not: sign in (typing, ~2 clicks, maybe a 2FA code) | 0 (~2) |
| 3 | GitHub | Click `Tearsheet-0.0.1-arm64.dmg` (about 265 MB) | 1 |
| 4 | Browser | Safari may ask "Allow downloads from github.com?" | 0–1 |
| 5 | Browser | Open the download | 1 |
| 6 | DMG window | Drag Tearsheet onto Applications | 1 |
| 7 | Finder | Open Applications, double-click Tearsheet | 2 |
| 8 | macOS | "Tearsheet Not Opened. Apple could not verify…": click Done | 1 |
| 9 | macOS | Apple menu → System Settings | 2 |
| 10 | System Settings | Privacy & Security, scroll down, click **Open Anyway** | 2 |
| 11 | macOS | Touch ID or password (typing), then "Open Anyway" again in the last box | 1 |
| | | **Total** | **12–15** |

Not known until Liam tries it: whether macOS also stops the engine inside the app (a second
program, `Tearsheet Engine`) once. If it does, that adds about 5 more clicks, or one Terminal line.
Only Apple signing ($99 a year) removes steps 8–11.

## Part 2. Inside Tearsheet: setup today

Nine screens: Welcome, How it works, Looking for Claude Code, Install and sign in, Connected,
Prices, Economic figures, Email, You're set up.

### Scenario A: Claude Code already installed and signed in (Liam's case)

| # | Screen | Click | Clicks |
| --: | :-- | :-- | --: |
| 1 | Welcome | Set up Tearsheet | 1 |
| 2 | How it works | Next | 1 |
| 3 | Looking for Claude Code | (moves on by itself after 1.5 s) | 0 |
| 4 | Connected | Next: prices | 1 |
| 5 | Prices | Open massive.com | 1 |
| 6 | massive.com | Sign up (Google or email), maybe confirm an email, open the dashboard, copy the key | ~5–8 |
| 7 | Back to Tearsheet | Click the window (or ⌘Tab), click the key field, ⌘V | 2 |
| 8 | Prices | Check (or Return), then Continue | 2 |
| 9 | Economic figures | Skip for now, then Continue without it | 2 |
| 10 | Email | Click the field (it has no focus), type, Continue (or Return) | 2 |
| 11 | You're set up | Open Tearsheet | 1 |
| 12 | Home | Type a ticker, Return: the report starts | 0 |
| | | **Inside Tearsheet** | **14** |
| | | **With massive.com** | **~19–22** |

Adding the optional FRED key instead of skipping it costs about 12 more clicks: open the site, make
an account, open API Keys, request a key (a reason to type and a box to tick), copy it, come back,
click the field, check, continue.

### Scenario B: a brand-new Mac (no Claude Code, no Codex)

Everything in A, plus:

| # | Screen | Click | Clicks |
| --: | :-- | :-- | --: |
| 1 | Claude Code isn't on this Mac yet | Show me how | 1 |
| 2 | Install, card 1 | Copy, then Open Terminal | 2 |
| 3 | Terminal | ⌘V, Return; wait about a minute | 0 |
| 4 | Back to Tearsheet | Click the window | 1 |
| 5 | Install, card 2 | Copy | 1 |
| 6 | Terminal | Click it, ⌘V, Return | 1 |
| 7 | Terminal | **Breaks here:** "command not found: claude" (see below) | — |
| 8 | Browser (if it had worked) | claude.ai sign-in and Authorize | ~3–5 |
| 9 | Back to Tearsheet | Click the window, then Continue | 2 |
| | | **Extra inside Tearsheet** | **8** |
| | | **Extra outside** | **~3–5** |

**Why step 7 breaks.** Claude Code's installer puts `claude` in `~/.local/bin` and only prints
"Native installation exists but ~/.local/bin is not in your PATH" with a line to paste. A new
Mac's Terminal does not look in that folder, so `claude auth login` is not found. Tearsheet itself
does look there, so its card 1 says "Installed" while card 2 cannot work. A new person is stuck.

**Scenario B in total:** about 22 clicks inside Tearsheet, about 30–35 with the outside sites,
plus Part 1's 12–15. **About 45–50 clicks from the link to the first report**, and today it cannot
be finished without knowing the PATH fix.

### Scenario C: only Codex installed and signed in

Scenario A, plus one click: "I use ChatGPT: connect Codex instead" on the "Claude Code isn't on
this Mac yet" screen, because setup always looks for Claude Code first. **15 inside Tearsheet.**

### Scenario D: Codex chosen on a brand-new Mac

Today's line is `npm install -g @openai/codex`, and a new Mac has no npm. The screen says to install
Node.js from nodejs.org first: download, open, about 6 clicks through Apple's installer, a password.
On that Node, `npm install -g` then fails with a permission error. OpenAI's own README now leads
with `curl -fsSL https://chatgpt.com/codex/install.sh | sh`. **Today this path does not finish.**

## Where the clicks go

| Kind | Scenario A | Scenario B | Can Tearsheet remove it? |
| :-- | --: | --: | :-- |
| Screens whose only job is a Next or Continue button (Welcome, How it works, Connected, the FRED skip pair, Ready) | 7 | 8 | Yes: these are Tearsheet's own. |
| Copy and Open Terminal as separate buttons, two Terminal lines | 0 | 4 | Mostly: one button can copy one line and open Terminal. |
| Clicking back into Tearsheet, clicking an unfocused field, a Check button | 4 | 6 | Mostly: focus the field when the window comes back, check on paste. |
| The email | 2 | 2 | Partly: Claude Code's own sign-in status (`claude auth status --json`) includes the account email, so it could be filled in and shown. |
| macOS blocking an unsigned app | 12–15 | 12–15 | No, except with Apple signing. |
| Making a Massive account and copying a key | ~5–8 | ~5–8 | Only by not needing a key from the person. |
| Installing Claude Code and signing in to claude.ai | 0 | ~4–6 | No: Anthropic's rule keeps install and sign-in buttons out of Tearsheet. The person pastes the line. |

**What this shows.** Of the 14 clicks inside Tearsheet in Scenario A, about 13 are Tearsheet's own
and could go. The clicks Tearsheet cannot remove are outside it: macOS's block (12–15), Massive's
sign-up (~5–8), and for a new Mac, Claude Code's install and sign-in (~4–6). Even with zero clicks
inside Tearsheet, a brand-new person still makes about 20–30 clicks between the link and the first
report. "Under 5 clicks" is reachable only inside Tearsheet's window, unless the Massive key and
the macOS block change.
