# Phase 0 results

*   **Status:** Liam's live runs are in progress. Lock-down: passed. SEC first run: passed for 3 of 5 tickers; the CAT and JPM problems are fixed, and a fresh run of both passed on 2026-11-05. IVV file: failed. Massive: passed. Usage: passed. News: passed for 4 of 5 (AAPL short). Signed-out signal: captured. Alpha Vantage: its company overview is now premium-only. Still to run: the next-day SEC repeat.
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
| Lock-down, Claude Code (Agent SDK) | Zero tool actions or attempts, and only web-search events on the 5 link-search calls; no bait token, marker text or private-key text in any answer; no tool servers at session start; a model ID on every call; the subscription sign-in confirmed on every call; at least 19 of 20 answers schema-valid on the first try | 2026-11-04, Claude Code 2.1.317, full form, 3 minutes. 20 of 20 answers schema-valid. No tool events on the 20 probes; only `WebSearch` events (1 to 3 per call) on the 5 link-search calls. No tool permission requests, no leaks, no tool servers. `apiKeySource` was `none` on all 25 calls. Models: `claude-haiku-5-5` and `claude-sonnet-5-5`. The bait files were removed afterwards. Report: `logs/lockdown-claude-full-20261104T225256Z.json` | Pass | — |
| Lock-down, Codex | Moved to Phase 2 | — | — | — |
| Usage, Claude Code on Pro | A projected first report (45 calls) uses no more than 50% of one 5-hour window | 2026-11-05, 17 calls (14 extraction on Haiku, 3 narration on Sonnet) for AAPL, AMZN and JPM. Readings: 4% before, 4% after extraction, 4% after narration (typed as "0.04"; Liam confirmed the page said 4%). The usage page shows whole percents, so the 17 calls moved it by less than 1 point. Even if all of that point came from the 3 Sonnet calls, 13 Sonnet calls plus 32 Haiku calls come to under 5% of a window. Tokens: about 39,000 per extraction call and 30,600 per narration call, so about 1.65 million for a first report. Every call's rate-limit event was the `seven_day` type with no utilization figure, so the tool gives no usage number of its own. The script printed a negative projection and "pass" from the "0.04" reading; it now reports a reading that goes down as not measurable. Results: `scripts/phase0/results/usage-20261105T013958Z.json` | Pass | — |
| Usage, Codex | Moved to Phase 2 | — | — | — |
| SEC requests, first run | Per ticker, at most 300 requests, and no 403 or 429 responses | 2026-11-04: AAPL 102, AMZN 103, JPM 116, JNJ 81, CAT 410. All responses 200. CAT's count is 334 Form 4s: a recent insider purchase (2026-11-02) triggered the 3-year history fetch for the routine test, which pulled every older Form 4 (292). Results: `scripts/phase0/results/sec-first-20261104T225902Z.json` | Fail (CAT) | Fixed 2026-11-05 (`data/sec.py`, with tests), so the A9 bulk store isn't needed: when a recent purchase appears, only older Form 4s filed in the purchases' calendar months (or in the first 5 days of the next month) are fetched, because the routine test only compares those months. On CAT's stored data: Form 4s 334 → 87, requests 410 → about 163. The routine rule is unchanged; the design's wording ("plus the 3 years before") should say "plus the same months in the 3 years before". Confirmed live 2026-11-05 with a fresh first run (`sec.py --tickers CAT JPM`): CAT 163 requests (87 Form 4s), JPM 117, all 200, both pass. Results: `scripts/phase0/results/sec-first-20261105T020303Z.json` |
| SEC requests, next-day repeat | Per ticker, at most 60 requests | | | |
| edgartools offline | With the network blocked, Items 1, 1A, 7 and 9A, the auditor's report and the 10-Q MD&A come from stored files only | 2026-11-04, route 1: every section was found offline for all 5 tickers, except JPM's auditor's report. JPM's 10-K doesn't follow item order, so edgartools puts the auditor's report at the end of "Item 7" (it starts at character 406,536 of 419,380) and "Item 8" starts at the income statement. Our `auditor_report` looks only in Item 8 | Fail (JPM) | Fixed 2026-11-05 (`data/sec.py`, with tests). Not a parser problem, so route 2 isn't needed: `auditor_report` looks in Item 8 first, then in the other sections, for the heading followed by the "To the Board of Directors" line (which skips table-of-contents mentions, as in JPM's Item 15). On the stored 10-Ks it finds the report for all 5 companies: Item 8 for AAPL, AMZN, JNJ and CAT, Item 7 for JPM. Route 1 stays. The fresh JPM run on 2026-11-05 passed the offline check. |
| S&P 500 list file (IVV) | 495–510 equity rows, all matched to a CIK; address, columns and terms recorded | 2026-11-04, from Liam's Mac: the address returned an HTML page again (as on 2026-11-03) | Fail | Failure action: the SPDR (SPY) file or the bundled list. The SPY file has no sector column, so GICS sectors would need another source. To be decided. |
| Massive: first-sector fill | 20 minutes or less | 2026-11-04: 17.2 minutes, 90 calls, all 200. AAPL and its 40 peers each got 296 daily bars (14 months) plus their dividends, the market's splits (2,097) and 2 years of SPY (502 bars). Results: `scripts/phase0/results/massive-20261105T000354Z.json` | Pass | — |
| Massive: all-stocks daily summary | Recorded only: available on the free key or not, and the projected backfill time | 2026-11-04: available on the free key (12,593 stocks for one day). Backfill: 295 calls at 5 a minute, about 59 minutes. The script printed 3,540 "min" because of a units bug (it was seconds), now fixed in `scripts/phase0/massive.py` | Recorded | — |
| Massive: plan facts | Recorded: SPY's earliest date (believed 2 years back), the delay before a close is available, the call limit and the terms | 2026-11-04: SPY's history starts 2021-11-05, so **5 years**, not 2. The 2026-11-04 close was available by 18:46 Eastern the same day. 90 calls at 5 a minute got no refusals. Plan page (Liam, 2026-11-05), "Stocks Basic", $0 a month: 5 API calls a minute, **2 years** of historical data, end-of-day data, reference data and corporate actions. So the API served more history than the plan promises; Tearsheet relies on only the documented 2 years. No personal-use wording on the plan card; the full terms weren't read | Recorded | — |
| News yield | At least 5 readable articles per ticker | 2026-11-05: readable articles (with a date and at least 150 words): AAPL 1, AMZN 7, JPM 5, JNJ 7, CAT 5. Links suggested: AAPL 3, AMZN 8, JPM 10, JNJ 9, CAT 6, all on the allowlist. Not read: 9 paywalled (5 for JPM, 2 for AAPL), 1 under 150 words, 1 HTTP 404. AAPL's search returned only 3 links, all from CNBC, two of them paid CNBC pages, in Apple's earnings week. The script doesn't yet record which addresses were skipped. Results: `scripts/phase0/results/news-20261105T014621Z.json` | Fail (AAPL); pass for the other 4 | Failure action, to apply: section 7 falls back to the press releases plus the articles read, and says so; the allowlist is widened. Also proposed: the link-search prompt asks for links spread across several sites, and the script records skipped addresses and their sites, so always-paywalled sites can be dropped from the allowlist. |
| Session history kept by Claude Code | Recorded by the usage script (believed off, with `--no-session-persistence`) | 2026-11-05: no session-history folders were created by the 17 calls | Off, as believed | — |
| Alpha Vantage free plan (`signals.py --alphavantage`) | The company overview answers on the free key | 2026-11-05: `OVERVIEW` (the analyst consensus source in the design) answered "This is a premium endpoint" on the free key. Results: `scripts/phase0/results/alphavantage-20261105T014801Z.json` | Fail | The free analyst-consensus source no longer works. Liam re-decides the analyst ratings source (design, Open Questions): Benzinga through Massive, another free source, or no consensus line. |
| Raw-data bytes per run | Recorded by every script; decides whether pruning is built | | | |

**Pruning decision.** The 5 GB cap fills within a year if one year's runs (150 first reports and 150 repeat reports, Technical Plan §6) store more than about 5 GB. That is about 17 MB per run on average. Fill this in from the bytes per run above:

*   Bytes per first report: *(from the SEC, Massive and news scripts)*. SEC part, 2026-11-04: AAPL 11.5 MB, AMZN 10.4 MB, JPM 18.2 MB, JNJ 12.1 MB, CAT 12.6 MB (13.0 MB on average). Massive part: 1.0 MB for a first-sector fill (shared by later reports in that sector).
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
| Agent SDK option for the tools offered to the model | `tools=[]`, which the SDK turns into `--tools ""` | `OFFERED_TOOLS_OPTION` (`ai/claude_code.py`) | `lockdown-check` | Confirmed 2026-11-04: no tools were offered on the 20 probes, and only `WebSearch` on the link-search calls |
| Agent SDK option for the settings that load | `setting_sources=[]`, which becomes `--setting-sources=` | `SETTING_SOURCES_OPTION` (`ai/claude_code.py`) | `lockdown-check` | Confirmed 2026-11-04: none of Liam's own skills, plugins or tool servers loaded. The session-start message still lists Claude Code's built-in skills, agents and plugins, which can't run with no tools offered |
| The subscription sign-in still works with no settings loaded | Yes | — | `lockdown-check` | Yes (2026-11-04) |
| The sign-in field, and its value for a subscription | `apiKeySource` in the session-start message; `"none"` means a claude.ai sign-in | `SIGN_IN_FIELD`, `SUBSCRIPTION_SIGN_IN` (`ai/claude_code.py`) | `lockdown-check` | Confirmed 2026-11-04: `apiKeySource` was `none` on all 25 calls |
| Web-search tool names on the link-search call | `WebSearch` (offered); `WebSearch` or `web_search` in the stream | `WEB_SEARCH_TOOL`, `WEB_SEARCH_TOOLS` (`ai/claude_code.py`) | `lockdown-check` link probes | `WebSearch`, both offered and in the stream (2026-11-04) |
| How Claude Code returns structured output | The JSON schema is written in the message, and the answer is read from the result text | `STRUCTURED_OUTPUT = "prompt"` (`ai/claude_code.py`); the other value is `"json_schema"` (`--json-schema`) | `lockdown-check` (19 of 20 valid) | `"prompt"` kept: 20 of 20 valid (2026-11-04) |
| Session history turned off | `--no-session-persistence`, passed through the SDK | `NO_SESSION_HISTORY_FLAG` (`ai/claude_code.py`) | `usage.py` (history folders created) | Confirmed 2026-11-05: no history folders created |
| Environment allowlist | `PATH`, `HOME`, `USER`, `LOGNAME`, `TMPDIR` and the locale variables | `ENV_ALLOWLIST` (`ai/claude_code.py`) | `lockdown-check` (the sign-in still works) | Confirmed 2026-11-04: the sign-in worked with only these variables |
| Fallback-mode flags | `claude -p --output-format stream-json --verbose --setting-sources= --strict-mcp-config --permission-prompts none --no-session-persistence --tools ""` | `FALLBACK_FLAGS` (`ai/claude_code.py`) | Only if the SDK check fails | Not needed: the SDK check passed (2026-11-04) |
| Claude Code's models | `haiku` for extraction; `sonnet` for narration, the skeptic and the link search | `CLAUDE_MODELS` (`config.py`) | `lockdown-check` (model IDs seen) | Confirmed 2026-11-04: `haiku` ran as `claude-haiku-5-5` and `sonnet` as `claude-sonnet-5-5` |
| Codex's approval policy, sandbox, overrides, web search, events and sign-in field | — | Phase 2 (`ai/codex.py`) | Phase 2 | — |
| Claude Code's signed-out signal | Messages such as "Please run /login", "Not logged in" or an `authentication_failed` error | `ERROR_TABLE` (`ai/client.py`); fixtures in `engine/tests/fixtures/ai/` | `signals.py` | Confirmed 2026-11-04: an `authentication_failed` error with "Not logged in · Please run /login", read as signed out by the error table. Saved as `engine/tests/fixtures/ai/claude_signed_out_recorded.json`, which the tests now check |
| Claude Code's usage-limit signal | "usage limit reached", "hit your limit … resets …", a `rate_limit` error or a rejected rate-limit event | `ERROR_TABLE` (`ai/client.py`) | Saved whenever one happens (`logs/ai-signals/`) | |
| edgartools route | Route 1: the stored HTML goes straight to edgartools' `parse_html` | `EDGARTOOLS_ROUTE` (`data/sec.py`); `text/parse.py` in Phase 1 | `sec.py` | Route 1 confirmed 2026-11-04: every section was read offline for all 5 tickers |
| Massive's address | `https://api.massive.com` | `MASSIVE_BASE_URL` (`config.py`) | `massive.py` | Confirmed 2026-11-04: all 90 calls answered with 200 |
| Massive's endpoints | Polygon's paths: `/v2/aggs/ticker/{ticker}/range/1/day/{start}/{end}`, `/v3/reference/dividends`, `/v3/reference/splits`, `/v2/aggs/grouped/locale/us/market/stocks/{day}` | `MASSIVE_DAILY_BARS`, `MASSIVE_DIVIDENDS`, `MASSIVE_SPLITS`, `MASSIVE_DAILY_SUMMARY` (`config.py`; `data/prices.py` in Phase 1) | `massive.py` | Confirmed 2026-11-04: all four paths worked on the free key |
| How the Massive key is sent | An `Authorization: Bearer` header, which keeps it out of addresses | `MASSIVE_AUTH_HEADER` (`http.py`) | `massive.py` | Confirmed 2026-11-04: the Bearer header was accepted |
| Massive's refused-call statuses | `ERROR`, `NOT_AUTHORIZED` | `MASSIVE_ERROR_STATUSES` (`http.py`) | `massive.py` | Not seen yet: no call was refused on 2026-11-04 |
| Massive's free-plan call limit | 5 calls a minute | `MASSIVE_CALLS_PER_MINUTE` (`config.py`); the `massive_calls_per_minute` setting | `massive.py` and the plan page | Confirmed: 5 a minute on the plan page (2026-11-05), and 5 a minute worked with no refusals (2026-11-04) |
| Massive's free-plan history | 2 years | `MASSIVE_HISTORY_YEARS` (`config.py`) | `massive.py` | 2 years, as believed: the plan page says 2 (2026-11-05), although the API served SPY back to 2021-11-05. `MASSIVE_HISTORY_YEARS` stays 2, since the extra years aren't promised |
| Massive's close delay | Not known | Recorded only | `massive.py` | The 2026-11-04 close was available by 18:46 Eastern the same day |
| Massive's all-stocks daily summary on the free plan | Not known | Recorded only (`data/prices.py` in Phase 1) | `massive.py` | Available (12,593 stocks for 2026-11-04); a 14-month backfill is about 59 minutes at 5 calls a minute |
| The IVV file's address, columns and terms | The `1467271812596.ajax?fileType=csv` address; columns Ticker, Name, Sector, Asset Class, Weight | `IVV_HOLDINGS_URL` (`scripts/phase0/sec.py`; `data/membership.py` in Phase 1) | `sec.py` | |
| Ticker spellings per provider | SEC `BRK-B`, Massive `BRK.B`, iShares `BRKB` | `resolve.py` (Phase 1) | `sec.py`, `massive.py` | |
| Alpha Vantage's error fields | A JSON body with `Note`, `Information` or `Error Message` | `ALPHAVANTAGE_ERROR_FIELDS` (`http.py`) | `signals.py --alphavantage` | Partly confirmed 2026-11-05: both refusals were caught as "not data" (a premium-endpoint message and a burst-limit message). The bad-request reply wasn't seen, because the second call hit the 1-a-second limit first. `ALPHAVANTAGE_REQUESTS_PER_SECOND = 1` was added (`config.py`, used in `http.py`) |
