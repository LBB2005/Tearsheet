# Phase 0 results

*   **Status:** Waiting for Liam's live runs. Nothing below has been measured yet.
*   **Approved by Liam:** *(date)*
*   **Exit gate** (design, Phase 0): Phase 1 starts when every test below has a measured value, and each test has either passed or had its failure action applied. Liam approves this file.

## Decided before the runs

*   **Everyday AI tool: Claude Code** (Liam, 2026-11-03). The Codex connector, its lock-down check and its usage test move to Phase 2, where the other-tool skeptic needs them (design, Open Questions).
*   **The iShares IVV holdings file** returned the fund's web page instead of the CSV to a plain download on 2026-11-03, even though the reply was labelled `text/csv`. `scripts/phase0/inputs.yaml` was therefore built from the SPDR (SPY) holdings file dated 2026-11-02 (index weights, no sector column) joined with Wikipedia's S&P 500 list (GICS sector and CIK). The SEC script tests the IVV download again from Liam's Mac.
*   **The five test tickers:** AAPL (Information Technology), AMZN (Consumer Discretionary), JPM (Financials, a bank), JNJ (Health Care) and CAT (Industrials). Only these five GICS sectors have more than 40 members, which a 40-peer list needs.
*   **The SDK passes its whole environment to Claude Code.** The Agent SDK merges this process's environment with its `env` option. So the connector starts Claude Code through a small launcher script that clears everything except the allowlist (`ai/claude_code.py`). The launcher holds variable names, never values.

## Commands

Run these from `~/code/Tearsheet`, in this order. Keys and the email are entered once.

```bash
cd engine && uv sync && cd ..
uv run --project engine tearsheet-engine set-key massive
uv run --project engine tearsheet-engine set-key fred
uv run --project engine tearsheet-engine set-key alphavantage
uv run --project engine tearsheet-engine set-setting sec_contact_email you@example.com
uv run --project engine tearsheet-engine lockdown-check
uv run --project engine python scripts/phase0/sec.py
uv run --project engine python scripts/phase0/massive.py
uv run --project engine python scripts/phase0/usage.py
uv run --project engine python scripts/phase0/news.py
uv run --project engine python scripts/phase0/signals.py
uv run --project engine python scripts/phase0/signals.py --alphavantage
```

The next day (a new US Eastern date), repeat the SEC run in the folder the first run printed:

```bash
uv run --project engine python scripts/phase0/sec.py --repeat --data-dir "<folder>"
```

Each script prints a table to paste below, and writes its full results to `scripts/phase0/results/`.

## Results

One row per test. "Action taken" is filled in only when a test fails (see the next section).

| Test | Pass mark | Measured | Pass or fail | Action taken |
| :-- | :-- | :-- | :-- | :-- |
| Lock-down, Claude Code (Agent SDK) | Zero tool actions or attempts, and only web-search events on the 5 link-search calls; no bait token, marker text or private-key text in any answer; no tool servers at session start; a model ID on every call; the subscription sign-in confirmed on every call; at least 19 of 20 answers schema-valid on the first try | | | |
| Lock-down, Codex | Moved to Phase 2 | — | — | — |
| Usage, Claude Code on Pro | A projected first report (45 calls) uses no more than 50% of one 5-hour window | | | |
| Usage, Codex | Moved to Phase 2 | — | — | — |
| SEC requests, first run | Per ticker, at most 300 requests, and no 403 or 429 responses | | | |
| SEC requests, next-day repeat | Per ticker, at most 60 requests | | | |
| edgartools offline | With the network blocked, Items 1, 1A, 7 and 9A, the auditor's report and the 10-Q MD&A come from stored files only | | | |
| S&P 500 list file (IVV) | 495–510 equity rows, all matched to a CIK; address, columns and terms recorded | | | |
| Massive: first-sector fill | 20 minutes or less | | | |
| Massive: all-stocks daily summary | Recorded only: available on the free key or not, and the projected backfill time | | | |
| Massive: plan facts | Recorded: SPY's earliest date (believed 2 years back), the delay before a close is available, the call limit and the terms | | | |
| News yield | At least 5 readable articles per ticker | | | |
| Session history kept by Claude Code | Recorded by the usage script (believed off, with `--no-session-persistence`) | | | |
| Raw-data bytes per run | Recorded by every script; decides whether pruning is built | | | |

**Pruning decision.** The 5 GB cap fills within a year if one year's runs (150 first reports and 150 repeat reports, Technical Plan §6) store more than about 5 GB. That is about 17 MB per run on average. Fill this in from the bytes per run above:

*   Bytes per first report: *(from the SEC, Massive and news scripts)*
*   Bytes per repeat report: *(from the SEC repeat run)*
*   Projected bytes per year: *(150 × first + 150 × repeat)*
*   Pruning needed: *(yes or no)*

## If a test fails

| Test fails | Action |
| :-- | :-- |
| Lock-down, on the Agent SDK | Fallback mode (item 9): `tearsheet-engine set-setting claude_mode cli`, then run `lockdown-check` again. If that fails too, Claude Code shows as "not usable with Tearsheet." |
| Lock-down, on Codex | Codex shows as "not usable with Tearsheet" (item 10). Phase 2. |
| Usage | Test again on Max, or lower the call budget and the article cap (15 → 8). Liam chooses, and the choice is recorded here. |
| SEC request counts | Revisit the SEC bulk-data store (A9). |
| Massive timing or limits | Adjust the performance goal. If the free plan can't give 14 months of history, Liam re-decides the price source (A34). |
| edgartools offline | Use the next route in item 6. |
| S&P 500 list file | Use the SPDR (SPY) holdings file instead (a spreadsheet, so `openpyxl` is added then), or the bundled list until a release ships a fix. |
| News yield | Section 7 uses the press releases plus whatever articles were read, and says so; the allowlist is widened. |
| A tool keeps its own session history | Turn it off where the tool allows it; otherwise add a note to the outside services table. |

## Settings confirmed in Phase 0

Each believed value sits behind one named constant. Once a run settles it, write the confirmed value here and change the constant if it differs.

| Setting | Believed value | Constant (file) | Settled by | Confirmed value |
| :-- | :-- | :-- | :-- | :-- |
| Agent SDK option for the tools offered to the model | `tools=[]`, which the SDK turns into `--tools ""` | `OFFERED_TOOLS_OPTION` (`ai/claude_code.py`) | `lockdown-check` | |
| Agent SDK option for the settings that load | `setting_sources=[]`, which becomes `--setting-sources=` | `SETTING_SOURCES_OPTION` (`ai/claude_code.py`) | `lockdown-check` | |
| The subscription sign-in still works with no settings loaded | Yes | — | `lockdown-check` | |
| The sign-in field, and its value for a subscription | `apiKeySource` in the session-start message; `"none"` means a claude.ai sign-in | `SIGN_IN_FIELD`, `SUBSCRIPTION_SIGN_IN` (`ai/claude_code.py`) | `lockdown-check` | |
| Web-search tool names on the link-search call | `WebSearch` (offered); `WebSearch` or `web_search` in the stream | `WEB_SEARCH_TOOL`, `WEB_SEARCH_TOOLS` (`ai/claude_code.py`) | `lockdown-check` link probes | |
| How Claude Code returns structured output | The JSON schema is written in the message, and the answer is read from the result text | `STRUCTURED_OUTPUT = "prompt"` (`ai/claude_code.py`); the other value is `"json_schema"` (`--json-schema`) | `lockdown-check` (19 of 20 valid) | |
| Session history turned off | `--no-session-persistence`, passed through the SDK | `NO_SESSION_HISTORY_FLAG` (`ai/claude_code.py`) | `usage.py` (history folders created) | |
| Environment allowlist | `PATH`, `HOME`, `USER`, `LOGNAME`, `TMPDIR` and the locale variables | `ENV_ALLOWLIST` (`ai/claude_code.py`) | `lockdown-check` (the sign-in still works) | |
| Fallback-mode flags | `claude -p --output-format stream-json --verbose --setting-sources= --strict-mcp-config --permission-prompts none --no-session-persistence --tools ""` | `FALLBACK_FLAGS` (`ai/claude_code.py`) | Only if the SDK check fails | |
| Claude Code's models | `haiku` for extraction; `sonnet` for narration, the skeptic and the link search | `CLAUDE_MODELS` (`config.py`) | `lockdown-check` (model IDs seen) | |
| Codex's approval policy, sandbox, overrides, web search, events and sign-in field | — | Phase 2 (`ai/codex.py`) | Phase 2 | — |
| Claude Code's signed-out signal | Messages such as "Please run /login", "Not logged in" or an `authentication_failed` error | `ERROR_TABLE` (`ai/client.py`); fixtures in `engine/tests/fixtures/ai/` | `signals.py` | |
| Claude Code's usage-limit signal | "usage limit reached", "hit your limit … resets …", a `rate_limit` error or a rejected rate-limit event | `ERROR_TABLE` (`ai/client.py`) | Saved whenever one happens (`logs/ai-signals/`) | |
| edgartools route | Route 1: the stored HTML goes straight to edgartools' `parse_html` | `EDGARTOOLS_ROUTE` (`data/sec.py`); `text/parse.py` in Phase 1 | `sec.py` | |
| Massive's address | `https://api.massive.com` | `MASSIVE_BASE_URL` (`config.py`) | `massive.py` | |
| Massive's endpoints | Polygon's paths: `/v2/aggs/ticker/{ticker}/range/1/day/{start}/{end}`, `/v3/reference/dividends`, `/v3/reference/splits`, `/v2/aggs/grouped/locale/us/market/stocks/{day}` | `MASSIVE_DAILY_BARS`, `MASSIVE_DIVIDENDS`, `MASSIVE_SPLITS`, `MASSIVE_DAILY_SUMMARY` (`config.py`; `data/prices.py` in Phase 1) | `massive.py` | |
| How the Massive key is sent | An `Authorization: Bearer` header, which keeps it out of addresses | `MASSIVE_AUTH_HEADER` (`http.py`) | `massive.py` | |
| Massive's refused-call statuses | `ERROR`, `NOT_AUTHORIZED` | `MASSIVE_ERROR_STATUSES` (`http.py`) | `massive.py` | |
| Massive's free-plan call limit | 5 calls a minute | `MASSIVE_CALLS_PER_MINUTE` (`config.py`); the `massive_calls_per_minute` setting | `massive.py` and the plan page | |
| Massive's free-plan history | 2 years | `MASSIVE_HISTORY_YEARS` (`config.py`) | `massive.py` | |
| Massive's close delay | Not known | Recorded only | `massive.py` | |
| Massive's all-stocks daily summary on the free plan | Not known | Recorded only (`data/prices.py` in Phase 1) | `massive.py` | |
| The IVV file's address, columns and terms | The `1467271812596.ajax?fileType=csv` address; columns Ticker, Name, Sector, Asset Class, Weight | `IVV_HOLDINGS_URL` (`scripts/phase0/sec.py`; `data/membership.py` in Phase 1) | `sec.py` | |
| Ticker spellings per provider | SEC `BRK-B`, Massive `BRK.B`, iShares `BRKB` | `resolve.py` (Phase 1) | `sec.py`, `massive.py` | |
| Alpha Vantage's error fields | A JSON body with `Note`, `Information` or `Error Message` | `ALPHAVANTAGE_ERROR_FIELDS` (`http.py`) | `signals.py --alphavantage` | |
