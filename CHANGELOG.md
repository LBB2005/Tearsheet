# Changelog

All notable changes to Tearsheet are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- An update banner: at launch and at most once a day, Tearsheet asks GitHub for the newest version
  and shows "Tearsheet X is out · Download · What's new · Dismiss" when a newer one is out. Turn it
  off with **Check for updates** in Settings → About and help.
- Signing with an Apple Developer ID, notarization and electron-updater are wired in and switch on
  only when the signing variables are set ([docs/launch/signing.md](docs/launch/signing.md)). Builds
  are still signed ad hoc.
- Contributing guide, code of conduct, security policy, issue forms and a pull-request template.
- A secret scan (gitleaks) in CI, and an optional pre-commit hook.

### Fixed

- CI's engine lint step (a formatting slip in a test file).

## [0.1.0-beta] - 2026-11-11

The first download, a beta for a few friends. Apple silicon only; signed ad hoc, so macOS asks you
to click **Open Anyway** the first time.

### Added

- **One cited report per company.** Type an S&P 500 ticker or name. Code makes every number from
  SEC filings, Massive prices and FRED data; your own Claude Code or Codex reads the filings and
  writes the text, and checks remove any claim its sources don't support. Each point links to the
  filing section or press release it came from, with a **Flag** link to report a wrong one.
- **A code-made rating.** Buy, Hold or Sell from six factor scores, with a 12-month bear, base and
  bull price range and how uncertain it is. The AI is never asked for a number.
- **The prediction log.** The first rated report on each company in any 30 days is logged as an
  official prediction that can't be changed, and graded at 3, 6 and 12 months.
- **The report line.** Queue several companies, a sector, or the whole S&P 500; it waits for usage
  limits and carries on by itself, and never goes past 80% of a usage window without asking.
- **Downloads:** a PDF company note, a slide deck and an Excel workbook from each report.
- **20+ looks, light and dark,** with every colour, font and size adjustable in Settings → Appearance.
- **One setup screen** that finds or installs Claude Code or Codex, signs it in, runs a safety check,
  and helps you get the free Massive and FRED keys. Keys live in the macOS Keychain.
- **Settings → About and help:** the versions, Send feedback (opens your own Mail), Copy diagnostics
  (scrubbed of emails, keys and your home folder), the terms, privacy and how to uninstall.
- A packaged `Tearsheet.app` with its own Python 3.12 inside, and `scripts/release.sh` for the DMG
  and zip.

### Security

- Release builds ignore every development and test switch, refuse Chromium's remote-debugging
  switches, and turn off `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` and Node's `--inspect` with
  Electron's fuses. The window runs sandboxed with context isolation and a strict content-security
  policy.
- Your AI tool runs with no tools, no user settings and its session history off, and text from
  filings and web pages is fenced so it can't pose as instructions.
- An online off switch for the Install button, for copies already handed out.

[Unreleased]: https://github.com/LBB2005/Tearsheet/compare/v0.1.0-beta...HEAD
[0.1.0-beta]: https://github.com/LBB2005/Tearsheet/releases/tag/v0.1.0-beta
