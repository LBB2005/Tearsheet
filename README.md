# Tearsheet

A Mac app for personal research. You type an S&P 500 company name or ticker, and get one research report in which every claim is cited.

**What it is.** Code builds every number: the metrics, the factor score, the Buy/Hold/Sell rating and the 12-month price range, all from public data. Your own AI tool, Claude Code or Codex, signed in to the subscription you already pay for, reads the filings and articles and writes the cited narrative. It runs with no tools, and it is never asked for a number. Code and a second AI pass check every claim before you see it.

**What it is not.** It doesn't claim to beat the market, and it doesn't trade. It gives no advice tailored to you. For large US stocks, the best published models explain under 5% of a stock's 12-month return. So Tearsheet aims to be accurate, traceable and honest about uncertainty, not to out-predict anyone.

> **Not financial advice.** Reports are general research, not personalised investment advice. Check the sources and make your own decisions.

## Status

**Phase 1 and Phase 2, in progress.** Phase 0 is done and approved ([docs/phase0-results.md](docs/phase0-results.md)). Phase 2 adds grading, the Codex connector and the other-tool skeptic; Codex passed its lock-down check on 6 Nov 2026. The engine writes a report from the terminal. `run TICKER` writes the thin slice (Phase 1a), and `run TICKER --full` writes the full method's code steps and all six AI-written sections. Each company's first live full report in any 30 days is logged as an official prediction (it can't be changed afterwards) and graded at 3, 6 and 12 months. Progress and open questions: [docs/phase1-progress.md](docs/phase1-progress.md). The design is in [docs/designs/tearsheet.md](docs/designs/tearsheet.md). A plain Mac window (Phase 1c) runs reports, shows them and flags claims; see [The Mac app](#the-mac-app).

## Requirements

*   macOS, with Python 3.12 and [`uv`](https://docs.astral.sh/uv/).
*   Claude Code or Codex, installed and signed in (`claude auth login` or `codex login`). With both, each passes `lockdown-check --tool claude` or `--tool codex`, and the other tool checks each report's draft.
*   Free keys for Massive (prices), FRED (economic series) and Alpha Vantage (analyst consensus). They are stored in the macOS Keychain under the service name `Tearsheet`, never in files.
*   A contact email for SEC, which asks every program for one.

## Terminal mode

From the repository root:

```bash
cd engine && uv sync && cd ..
uv run --project engine tearsheet-engine set-key massive
uv run --project engine tearsheet-engine set-setting sec_contact_email you@example.com
uv run --project engine tearsheet-engine lockdown-check
```

Then:

```bash
uv run --project engine tearsheet-engine run AAPL --full
uv run --project engine tearsheet-engine replay <run ID>
uv run --project engine tearsheet-engine spot-check
uv run --project engine tearsheet-engine goal1
uv run --project engine tearsheet-engine grade
```

`run` prints the path of the HTML report. `replay` re-runs a run's code steps from its stored inputs and checks that the numbers are identical. `spot-check` walks you through the citations to check and asks the Goal 1 question, and `goal1` prints the tally. `set-key` reads the key from a hidden prompt. `lockdown-check` checks that Claude Code runs with no tools, no user settings and your subscription sign-in. Every command takes `--data-dir`. The default data folder is `~/Library/Application Support/Tearsheet/`.

The Phase 0 test scripts and their commands are listed in [docs/phase0-results.md](docs/phase0-results.md).

## The Mac app

A plain window for the same engine (Phase 1c): New report, Progress, Reports (with "flag this claim"), the prediction log, Settings and Connections. From the repository root:

```bash
cd app && npm install && npm run build && npm start
```

It starts the engine with `uv run tearsheet-engine serve` from this repository, and uses the same data folder as terminal mode. `npm run dev` runs it with hot reload. A signed app you can double-click comes in Phase 3.

## What leaves your Mac

Nothing leaves your Mac except what this table lists (design, Technical Plan §12). Reports, the prediction log and raw downloads stay on your computer.

| Service | Key needed | Cost | What is sent |
| :-- | :-- | :-- | :-- |
| SEC EDGAR | None (each request carries the contact email you enter) | Free | Requests for the company's and peers' filings |
| iShares (BlackRock) | None | Free | A download of the IVV holdings file, at most once a day |
| Massive | Your free key | Free plan | The tickers researched and their peers |
| FRED | Your free key | Free | Requests for the listed economic series |
| Alpha Vantage | Your free key | Free (25 calls a day) | The ticker researched (analyst consensus) |
| Article sites on the allowlist | None | Free | Page requests |
| Claude Code (Anthropic) or Codex (OpenAI) | Your own sign-in | Your existing subscription | Filing and article text, the computed numbers sent with that text, and draft sections. Whether each tool keeps its own session history of these calls is checked in Phase 0. |
| Benzinga through Massive | Only if you choose the paid analyst option | $99/month | The ticker researched |

## Development

```bash
cd engine
uv run pytest
uv run ruff check . ../scripts
```

The tests run offline. Tests marked `live` are skipped unless you run `uv run pytest -m live`.

## License

MIT. See [LICENSE](LICENSE).
