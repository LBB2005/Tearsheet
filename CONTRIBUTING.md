# Contributing to Tearsheet

Thanks for wanting to help. Tearsheet is a small project with one maintainer, so short, focused
pull requests are easiest to review. For anything bigger than a fix, open an issue first so we can
agree on the approach.

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Security problems go to
[SECURITY.md](SECURITY.md), not to a public issue.

## The one rule for tests

**Tests never run a live report on a real company.** A full report calls SEC, Massive, FRED and
your AI tool, writes an official prediction that can't be changed afterwards, and spends your plan's
usage. So:

- The engine's tests run offline with fakes (`tests/test_pipeline.py`'s `FakeData` and
  `FakeConnector`, saved answers in `engine/tests/fixtures/`). Don't add a test that needs the
  network or a signed-in AI tool, unless it is marked `live` (skipped by default) and doesn't write a
  report.
- The app's screen tests use a fake bridge (`app/src/renderer/test/bridge.ts`); no engine starts.
- Hidden-window checks of the real app run on a **copy** of the data folder, with stand-in AI tools
  (`scripts/test-tools/`, `TEARSHEET_CLAUDE_BIN`, `TEARSHEET_CODEX_BIN`) and
  `PYTHON_KEYRING_BACKEND=keyring.backends.null.Keyring`. See [docs/test-builds.md](docs/test-builds.md).
- Never point a test or a check at the real data folder (`~/Library/Application Support/Tearsheet/`).

## Set up

You need a Mac with Apple silicon, [Node.js](https://nodejs.org/) 22 and npm, and
[`uv`](https://docs.astral.sh/uv/) (it installs Python 3.12 for you).

```bash
git clone https://github.com/LBB2005/Tearsheet.git
cd Tearsheet
```

### The engine (Python, `engine/`)

```bash
cd engine
uv sync
uv run pytest                        # offline tests, with the coverage bar
uv run ruff check . ../scripts       # lint
uv run ruff format --check . ../scripts
uv run tearsheet-engine --data-dir tests/fixtures/runs replay --all   # stored runs give identical numbers
```

### The app (Electron + React + TypeScript, `app/`)

```bash
cd app
npm ci
npm run typecheck
npm test                 # or npm run coverage, which CI runs, with the coverage floor
npm run build
npm run dev              # the app with hot reload, using this checkout's engine
```

If you change the engine's protocol (`engine/src/tearsheet/protocol.py`), regenerate the app's types
with `npm run gen-types` and commit `app/src/shared/protocol.ts`.

`npm run dev` uses your real data folder and Keychain unless you point it elsewhere, for example
`TEARSHEET_DATA_DIR=/tmp/tearsheet-dev npm run dev`.

### Packaging

```bash
cd app
npm run package          # a release build, signed ad hoc: app/dist/mac-arm64/Tearsheet.app
npm run package:test     # a test build, which honours the TEARSHEET_* test switches
```

Signing with a Developer ID switches on only from environment variables
([docs/launch/signing.md](docs/launch/signing.md)). Without them both commands build ad hoc.

## Before you open a pull request

CI (`.github/workflows/ci.yml`) runs all of the above plus a secret scan. Run the same locally:

```bash
(cd engine && uv run ruff check . ../scripts && uv run ruff format --check . ../scripts && uv run pytest)
(cd app && npm run typecheck && npm run coverage && npm run build)
```

- Keep the coverage floors (`engine/pyproject.toml`, `app/vitest.config.ts`). If a change breaks a
  screen test because you changed words or roles, fix the test; don't lower the floor.
- Numbers come from code, never from the AI. A change to how a number, a score or the rating is
  made needs a test and a note in the pull request, and stored runs must still replay identically.
- Write user-facing text in plain, short English.
- Never commit API keys, tokens, `.env` files, personal email addresses or paths under your home
  folder.

## Optional: a pre-commit secret scan

CI scans every push with [gitleaks](https://github.com/gitleaks/gitleaks). To catch a secret before
it is committed, install gitleaks (`brew install gitleaks`) and turn on the repository's hook:

```bash
git config core.hooksPath .githooks
```

`.githooks/pre-commit` scans only what you staged and stops the commit if it finds a secret. It
does nothing if gitleaks isn't installed. To turn it off again: `git config --unset core.hooksPath`.

## Reporting bugs and asking for features

Use the issue forms. For a bug, **Settings → About and help → Copy diagnostics** gives the versions
and the end of the log, with emails, keys and your home folder taken out. Paste it into the form.
Questions and ideas that aren't bugs go to [Discussions](https://github.com/LBB2005/Tearsheet/discussions).

## Licence

By contributing you agree that your work is released under the [MIT licence](LICENSE).
