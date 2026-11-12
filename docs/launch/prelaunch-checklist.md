# Pre-launch checklist (Show HN, Reddit, LinkedIn/X, Product Hunt)

Written 11 Nov 2026 on branch `claude/prelaunch-0bc75b`. Everything Liam has to click, decide or
write is here. Nothing on GitHub was changed, nothing was pushed, and no release was made.

## 1. What's done (on the branch)

| # | Item | Where |
|---|---|---|
| 1 | **CI fixed.** The engine Lint job failed on one formatting slip; ruff check and format, engine tests (1,094) and replay, app typecheck, tests (2,000+, coverage floors) and build all pass locally | `engine/tests/test_render_look.py` |
| 2 | **Update banner.** At launch and at most once a day, one plain GET to GitHub's Releases API. A newer version (semver, betas handled) shows "Tearsheet X is out · Download · What's new · Dismiss". Settings → About and help → **Check for updates** (on by default). Listed in the README's "What leaves your Mac", Settings → Privacy and setup's data sentence. Checked in a hidden test build against a local fake feed: banner, Download, What's new (browser calls stubbed), Dismiss, the setting | `app/src/main/updates.ts`, `app/src/renderer/shell/UpdateBanner.tsx` |
| 3 | **Signing, notarization, electron-updater: wired, off.** Switch on from environment variables only. Without them `npm run package` and `package:test` build exactly as before (config checked identical; both built and checked ad hoc) | `app/electron-builder.cjs`, `app/build/signing.cjs`, `app/build/entitlements.mac.plist`, [signing.md](signing.md) |
| 4 | **Community files.** CONTRIBUTING, Code of Conduct (Contributor Covenant 2.1), SECURITY, CHANGELOG, issue forms (bug report asks for Copy diagnostics), PR template | repo root, `.github/` |
| 5 | **README.** Release, CI and macOS badges; hero GIF; "Why Tearsheet?"; Contributing section. Screenshots, FAQ, disclaimers and "How accurate is it?" kept | `README.md` |
| 6 | **Hero GIF, social preview, demo video.** 10 s, recorded from a hidden test build on a copy of the data with the stand-in Claude Code | `docs/images/hero.gif` (3.5 MB), `docs/launch/social-preview.png` (1280×640), `docs/launch/demo.mp4` (0.8 MB, for LinkedIn/X) |
| 7 | **Secret scan.** gitleaks in CI over the whole history, plus an optional pre-commit hook. Full-history scan: **no real secrets**; 2 false positives (a made-up demo key in the setup mockup, a test fixture id) listed in `.gitleaksignore` | `.github/workflows/ci.yml`, `.githooks/pre-commit` |

### Found on the way (needs a decision)

- **Tearsheet really needs macOS 15.** The bundled numpy needs macOS 14 and orjson (loaded by
  edgartools for every report) needs macOS 15. Done (code review, 12 Nov): `mac.minimumSystemVersion`
  is `'15.0'` in `app/electron-builder.cjs`, so an older Mac gets Apple's own "needs a newer macOS"
  message instead of a failing first report, and the README says macOS 15+.
- **Your personal Gmail is on every commit.** Every commit in the public history carries it as the
  author email (see the GitHub noreply item below).
- **`scripts/release.sh` has a signed mode** (code review, 12 Nov): with the signing variables set it
  uploads electron-builder's notarized DMG and zip plus `latest-mac.yml` ([signing.md](signing.md) §5).
- **Launch-readiness M1 says "share only by private link until the lawyer check".** A public launch
  goes against that. Decide before posting anything.

## 2. What Liam must do

### Before launch

| # | What | How / values |
|---|---|---|
| L1 | **Review and merge this branch** | The coordinator session asks you. Then push main and check CI goes green (it has been red since 9 Nov). |
| L2 | **Ship a release with the banner** (for example `0.1.1-beta`) | Copies of 0.1.0-beta have no banner, so launch-day users need a version that has it. Bump `app/package.json` and `ENGINE_VERSION`, add the CHANGELOG entry, then `scripts/release.sh`. |
| L3 | **Lawyer check (M1)** | A quick check from a US securities lawyer on publishing ratings and price ranges. [launch-readiness.md §5](launch-readiness.md) has the questions. |
| L4 | **Email Massive (M11)** | Ask them to confirm a free app is fine when each person uses their own free key. A "no" leaves no price source. |
| L5 | **Name check (S5)** | "Tearsheet" is a common finance word. Check the GitHub name, domains, the Mac App Store and a trademark search (USPTO). |
| L6 | **The $99 Apple decision** | Without it every HN/Reddit user meets "Apple could not verify…" and must click Open Anyway in System Settings, and there's no auto-update. With it: [signing.md](signing.md) has every step. Apple's approval can take a day or two, so decide a week before launch. |
| L7 | **GitHub noreply email** | GitHub → Settings → Emails: tick "Keep my email addresses private" and "Block command line pushes that expose my email". Then in this repo: `git config user.email <ID>+LBB2005@users.noreply.github.com` (the exact address is shown on that page). Past commits keep the old address unless the history is rewritten (`git filter-repo --mailmap`), which changes every commit hash and breaks the existing release tag. My pick: set it for new commits and leave the history. |
| L8 | **Minimum macOS** | Decide the `minimumSystemVersion: '15.0'` line above, or rebuild the engine's wheels for older macOS (more work). |
| L9 | **HN account** | Use an account with some history and karma if you have one; a brand-new account's Show HN often sinks. Don't ask anyone to upvote (HN penalises it). |
| L10 | **Write your own launch posts by hand** | Your words, your story: why you built it, what's honest about its limits. Don't post AI-written text. |

### GitHub settings (Liam clicks; nothing was changed)

| Setting | Where | Value |
|---|---|---|
| Description | Repo home → About (gear) | `Type an S&P 500 ticker, get one research report where every claim is cited. Free Mac app: code makes the rating, your own Claude Code or Codex writes the text.` |
| Website | same | `https://github.com/LBB2005/Tearsheet/releases/latest` (or leave empty) |
| Topics | same | `macos`, `electron`, `react`, `typescript`, `python`, `equity-research`, `stock-analysis`, `sec-edgar`, `investing`, `finance`, `sp500`, `llm`, `claude-code`, `codex`, `ai-agents`, `open-source` |
| Social preview | Settings → General → Social preview → Edit → Upload | `docs/launch/social-preview.png` |
| Discussions | Settings → General → Features → Discussions | On. Categories: Q&A, Ideas, Show and tell, Announcements. Pin a "Welcome / how to report a bug" post. The issue forms already point questions there. |
| Private vulnerability reporting | Settings → Code security → Private vulnerability reporting | Enable (SECURITY.md points to it) |
| Secret scanning + push protection | Settings → Code security | Enable both (free for public repos) |
| Dependabot alerts | Settings → Code security | Enable |
| Labels | Issues → Labels | Keep `bug`, `enhancement`, `good first issue`, `help wanted`, `question`; add `needs-info` |
| Branch rule (optional) | Settings → Rules → New ruleset for `main` | Require status checks `engine`, `app`, `secrets` to pass. Only once CI is green. |
| Release notes | Releases | Mark the newest release "Latest" when it's no longer a beta. |

### Good first issues (drafts; create them on GitHub yourself)

1. **Settings → About: show when Tearsheet last checked for updates**
   > The update check (app/src/main/updates.ts) keeps `lastChecked` in `<userData>/updates.json`.
   > Show it under "Check for updates" in Settings → About and help, e.g. "Last checked today at
   > 14:05". Add it to `UpdateStatus`, the IPC answer and the screen test in
   > `app/src/renderer/pages/Updates.test.tsx`. No new network requests.

2. **Copy diagnostics: include the Mac's chip**
   > `app/src/main/diagnostics.ts` builds the text from `AboutInfo`. Add the chip (for example
   > "Apple M2", from `os.cpus()[0].model`) next to the macOS version, with a unit test in
   > `diagnostics.test.ts`. Keep the scrubbing of emails, keys and the home folder.

3. **Help → Keyboard shortcuts**
   > The menu (`app/src/main/menu.ts`) has shortcuts like ⌘N, ⌘K, ⌘L and ⌘,. Add a "Keyboard
   > Shortcuts" item under Help that opens a small sheet listing them, built from the same list so it
   > can't drift. Include a screen test.

4. **Prediction log: export JSON as well as CSV**
   > The log's Export saves a CSV through `saveCsv` (`app/src/main/downloads.ts`). Add a JSON option
   > with the same rows and field names, saved the same way (new file name, never overwriting).
   > Tests in `downloads.test.ts` and `pages/Log.test.tsx`.

5. **Docs: a glossary of the report's terms**
   > Add `docs/glossary.md` explaining percentile score, value gap, bear/base/bull range, buy
   > trigger, red flags and "official prediction", each in two or three plain sentences, linked from
   > the README's "How the rating works". Good for a first contribution that isn't code.

## 3. Launch week

| When | What |
|---|---|
| A week before | L1–L10 done or decided. Release with the banner out. Try the download on a second Mac user account (fresh `~/Library`), from the Releases page, following only the README. |
| 2–3 days before | Draft the posts by hand. Record a longer screen video if you want one (the 10 s `demo.mp4` is ready). Clear your calendar for launch day. |
| **Day 1 (Tue, Wed or Thu)** | **Show HN, posted between 12:00 and 17:00 UTC** (morning in the US). Title like "Show HN: Tearsheet – cited stock research reports from your own Claude Code or Codex". Link to the GitHub repo. Post your first comment straight away: why you built it, how the rating works, what it doesn't do, that it's unsigned (if so) and macOS 15+. Stay for 3–4 hours and answer every comment calmly. |
| Day 1–2 | Watch Issues, Discussions and lbb.aifinance@gmail.com. Fix anything that blocks installs first; ship a patch release (the banner tells existing users). |
| **Day 2–3** | **Product Hunt.** Schedule for 12:01 a.m. Pacific. Gallery: the GIF, the README screenshots, `social-preview.png`. Maker comment in your own words. |
| Day 2 onward | **Reddit, one subreddit at a time,** a day or more apart: read each sub's self-promotion rules first. Good fits: r/macapps, r/ClaudeAI, r/SideProject; finance subs (r/investing, r/stocks) often ban self-promotion, so check or skip. Post natively (GIF or video in the post), and reply to comments. |
| Day 2 onward | **LinkedIn and X:** upload `docs/launch/demo.mp4` (or a longer recording) as native video, not a link. Put the GitHub link in the first comment/reply. |
| After the week | Thank contributors, triage issues into `good first issue` / `help wanted`, update the CHANGELOG, and note what you learned in `docs/launch/`. |

Keep saying the same honest things everywhere: general research, not personal advice; no track
record yet (first grades in February 2027); code makes the numbers, the AI writes cited text.
