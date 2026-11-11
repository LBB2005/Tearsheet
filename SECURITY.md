# Security policy

## Reporting a problem

Please report security problems privately, not in a public issue or discussion.

- **Preferred:** GitHub's private vulnerability reporting. On the repository, open the **Security**
  tab and choose **Report a vulnerability**.
- **Or email** [lbb.aifinance@gmail.com](mailto:lbb.aifinance@gmail.com) with "Tearsheet security" in
  the subject.

Include what you found, the steps to reproduce it, the Tearsheet version (Settings → About and help),
and what an attacker could do with it. Please don't include real API keys or personal data.

You should hear back within 7 days. Tearsheet has one maintainer, so a fix may take a little longer;
you'll be told the plan and credited in the release notes if you want to be.

## Supported versions

Only the newest release on [Releases](https://github.com/LBB2005/Tearsheet/releases) gets fixes.

## What is in scope

- The Mac app (`app/`) and the engine (`engine/`) in this repository.
- How Tearsheet keeps your keys (macOS Keychain), runs your AI tool (Claude Code or Codex), and
  handles text from filings, press releases and web pages (prompt injection that changes a number,
  a rating, or runs a tool).
- The release build's hardening: Electron's fuses, the window's sandbox and content-security
  policy, and the test switches a release build must ignore ([docs/test-builds.md](docs/test-builds.md)).

Out of scope: the third-party services Tearsheet calls (SEC, Massive, FRED, Anthropic, OpenAI,
GitHub), and problems that need someone who already controls your Mac.
