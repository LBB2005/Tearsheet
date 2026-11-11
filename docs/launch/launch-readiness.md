# Launch readiness: what Tearsheet needs before strangers use it

*Checked 8 Nov 2026 against the code on `main` (fa22eee) and each service's own pages. Not legal advice.*

Handled in other sessions, so not covered here: first-run setup, packaging (signing, notarization, auto-update), and the AI tools' terms (the Anthropic email, OpenAI's terms).

Already fine: every key is in the Keychain; the app sends nothing to Liam (no usage stats, no crash reports, no update check; its one request of its own is the off-switch file from GitHub at each launch, with no personal data); SEC gets each person's own email; Claude Code and Codex run with session history off; the PDF and the deck carry the "not investment advice" line on every page.

## Status

Built on 8 Nov 2026 (Liam picked "build your picks"): M2 (option A), M3, M4, M5, M6, M7, M8 (option A), M9 and M10.

- **News (M2).** A new setting, `news_articles`, is off by default. With it off, section 7 reads the company's 8-K press releases from SEC and lists the link search's allowlisted links as "Not read". `tearsheet-engine set-setting news_articles on` brings back today's article reader for Liam's own copy.
- **iShares (M3).** `membership.shipped` replaces the daily download. It uses the bundled list, or an older stored IVV file if that one is newer.
- **FRED notice (M4)** and the help page (M9) are in Settings → About and help, along with the version (M7) and Send feedback (M8). The Help menu has Tearsheet Help and Send Feedback… too.
- **Disclaimers (M5).** The line now shows under the rating, on the Prediction log and on every Excel tab, and the deck's cover label is "Rating".
- **Licences (M6).** `THIRD-PARTY-NOTICES.md` exists. The build ships it, plus the Electron and Chromium licences and `PYTHON-PACKAGES.md`, and puts an MIT stand-in in place of Unidecode.
- **Privacy list (M10).** Settings → Privacy and the README list Codex and the AI's web search, and no longer list iShares, Alpha Vantage or Benzinga.

Built on 10-11 Nov 2026 for the friends beta (0.1.0-beta):

- **Feedback address.** `FEEDBACK_EMAIL` (now in `app/src/shared/feedback.ts`) is lbb.aifinance@gmail.com. About and help and the README's FAQ name it.
- **S1.** "Prices from Massive, for your own use." is on every deck slide's footer, every Excel tab (row 4 and the printed footer), the PDF's price exhibits and the Important information text.
- **S2.** Copy diagnostics in Settings → About and help (`app/src/main/diagnostics.ts`).
- **S3.** The analyst panel is left out where analystdb doesn't answer. Section 1's consensus line shows without "(design, Open Questions)" (the stored words stay, for replays). The Goal 1 round and the Alpha Vantage row show only with `tearsheet-engine set-setting author_tools on`.
- **S6.** One wording everywhere: "General research, not personalised investment advice." (`engine/src/tearsheet/wording.py`, `app/src/shared/wording.ts`; a test checks they match).
- **The off switch** is reachable now that the repository is public (10 Nov 2026); the release dry run read `on`.

Still open: M1 (the lawyer) and M11 (the Massive email) are Liam's to do.

## The checklist

### Must-have before a public link

| # | Item | Size | My pick |
|:--|:--|:--|:--|
| M1 | **Quick check from a securities lawyer** on publishing ratings and price ranges (§5). Until then, share by private link only. | Liam, not code | Do it |
| M2 | **News articles.** Most big news sites' terms forbid automated downloading, and several forbid using their articles with AI (§1.5). Public builds should stop downloading article pages. | Small–medium | Option A (below) |
| M3 | **iShares holdings file.** BlackRock's site terms forbid automated copying. Stop the daily download and use the S&P 500 list shipped with each release. That list is already what the app usually uses (§1.4). | Small | Turn it off |
| M4 | **FRED's required notice.** FRED requires one exact sentence and a link to its terms, shown to users (§1.3). | Small | Add to Settings |
| M5 | **Disclaimer gaps.** Add the line to the Prediction log, next to the rating in the app, and to every Excel tab. Rename the deck's "Recommendation" cover label to "Rating" (§2). | Small | Do it |
| M6 | **Licence notices.** `THIRD-PARTY-NOTICES.md` is missing, though files are adapted from Realm (MIT). The bundle also holds one GPL library, Unidecode, which edgartools pulls in (§4). | Small | Add notices; stand-in for Unidecode |
| M7 | **Version number** that a person can find and quote in a bug report (§4). | Small | Settings → About |
| M8 | **Send feedback / report a bug** (§4). | Small | Option A (below) |
| M9 | **Help page** with a short privacy note, simple terms of use and uninstall steps (§3, §4). | Small (writing) | One page, linked in the app |
| M10 | **Fix the "What leaves your Mac" list.** It leaves out Codex (OpenAI) and the AI's web search. It still lists Alpha Vantage and Benzinga, which aren't used (§3). | Small | Do it |
| M11 | **Ask Massive** by email to confirm that a free app is fine when each person uses their own free key. Their terms point that way (§1.2). A "no" would leave no price source, so ask early. | 5 minutes | Ask |

### Should-have

| # | Item | Why |
|:--|:--|:--|
| S1 | A line on the downloads: "Prices from Massive, for your own use." | Massive's terms forbid sharing its data, and the PDF, deck and Excel hold prices (§1.2). |
| S2 | A **Copy diagnostics** button: versions plus the last part of `engine.log`, with emails and keys removed, copied for the person to paste into feedback. | Opt-in crash info that never sends itself (§4). |
| S3 | Hide the parts meant only for Liam: the Goal 1 round setting, the analystdb panel's empty line, the Alpha Vantage key row, and section 1's line "(design, Open Questions)". | A stranger would be confused by them. |
| S4 | If any article downloading stays, read each site's robots.txt and obey it. | Reuters and WSJ block every page for unnamed programs (§1.5). |
| S5 | Check the name "Tearsheet" (domains, App Store, trademarks). | Open question in the design. |
| S6 | One consistent disclaimer wording. Today there are two: "General research, not personalised investment advice…" and "Research data, not investment advice." | Plainer, and easier to test. |

### Later

| # | Item |
|:--|:--|
| L1 | Automatic crash reports. Only opt-in, and only if S2 isn't enough, because it breaks "nothing goes to Liam". |
| L2 | A "Delete all my Tearsheet data" button. |
| L3 | A licensed news feed (design A26), if the news section matters enough to pay for. |
| L4 | Add GitHub (the update check) to the privacy list once auto-update ships. |

### Choices inside the must-haves

**M2, news articles.**

- **A. Filings and the company's own press releases, plus a link list (my pick).** Public builds read SEC filings and the 8-K press releases, which they already do. They also show other coverage as headlines with links, without downloading it. Liam's own build keeps today's reader behind a build switch, like the first-run session's `INSTALL_BUTTON`.
  - Pros: no terms problem, and every claim stays checked.
  - Cons: section 7 gets thinner. It already says so when fewer than 5 articles were read.
- **B. Keep downloading, only from sites whose terms allow it, and obey robots.txt.**
  - Pros: more outside coverage.
  - Cons: each of ~70 sites must be checked, and few big outlets will pass.
- **C. Download nothing; the AI summarises from its own web search.**
  - Cons: claims can't be checked against saved text. This goes against Goal 3.

**M8, feedback.**

- **A. A "Send feedback" item in the Help menu and Settings (my pick).** It opens the person's own Mail with a filled-in email: version, macOS version, and a blank for what happened.
  - Pros: nothing sends itself.
  - Cons: needs a public feedback address. Liam picks it; better not his personal Gmail.
- **B. A link to GitHub Issues.**
  - Pros: public and searchable.
  - Cons: needs the repository public and a GitHub account.
- **C. An in-app form that posts to a server.**
  - Cons: breaks "no hosted server".

---

## 1. Data terms, source by source

Wording from US government pages is quoted exactly (it isn't copyrighted). Company terms are paraphrased with their section numbers, so read the linked section for the exact wording.

| Source | Used today? | Other people, each with their own key? | Own key each? |
|:--|:--|:--|:--|
| SEC EDGAR | Yes | Yes; public data | No key. Own email, see 1.1 |
| Massive | Yes (prices) | Looks yes; confirm (M11) | **Yes**, required |
| FRED | Yes (5 series) | Yes | **Yes**, required |
| iShares (BlackRock) | Tries daily, often fails | No, without permission | No key |
| Alpha Vantage | **No** (key row only) | Personal use only | Yes |
| News article sites | Yes | Mostly no (1.5) | No key |

### 1.1 SEC EDGAR

- **Rule** ([Accessing EDGAR Data](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data)): "Current max request rate: 10 requests/second." Under "User-Agent Declaration", the sample header is `User-Agent: Sample Company Name AdminContact@<sample company domain>.com`.
- **Distributed apps.** None of SEC's pages say whether each install needs its own contact. That covers the page above, the [webmaster FAQ](https://www.sec.gov/about/webmaster-frequently-asked-questions), [privacy and security policy](https://www.sec.gov/privacy) and [developer resources](https://www.sec.gov/about/developer-resources). Developer resources describes the limit as per user ("limit each user to a total of no more than 10 requests per second").
- **On breach** ([privacy policy](https://www.sec.gov/privacy)): limits are placed on "the offending IP address(es)". Access comes back once the rate has stayed under the limit for 10 minutes.
- **Reuse** ([webmaster FAQ](https://www.sec.gov/about/webmaster-frequently-asked-questions)): "All Government-created content on sec.gov and EDGAR public filing content are free to access and reuse."
- **Verdict: keep what the app does.** It sends `Tearsheet/<version> <the person's email>` at under 10 requests a second (`config.sec_user_agent`).
  - Each person is the requester, so a block hits only their own address.
  - One shared Tearsheet contact would put Liam's address on everyone's traffic.

### 1.2 Massive

The terms were updated 3 Nov 2026 and read directly from the pages.

- **Personal use only.** [Individuals Terms](https://massive.com/legal/individuals-terms-of-service) §2 gives access for your own personal, non-commercial, non-business purposes. It lets you build and run your own personal apps and analyses.
- **Own key each.** §3.3: you may not share an account or credentials to give another person access. A key shipped inside the app is therefore out; each person's own free key is required. The app already works this way.
- **Tools acting for you are allowed.** §7 lets AI tools and other services you connect process the data only on your behalf, never for their own purposes. [Market Data Terms](https://massive.com/legal/market-data-terms-of-service) §5(c) says the same: a tool working only for you doesn't count as someone else.
- **No sharing.** Market Data Terms §1 and §5(c) forbid sharing or redistributing the data. The §1 list also includes "provide a service or application to other users". Tearsheet never passes Massive data between people, but that phrase is why M11 asks Massive. A person who emails a PDF that holds prices would be sharing data, hence S1.

### 1.3 FRED

Read through a page-reading tool, because direct downloads timed out. Check the wording at the links.

- **Own key each** ([API keys](https://fred.stlouisfed.org/docs/api/api_key.html)): "All users of an application shall use their own API key." The app already works this way.
- **Required notice** ([Terms of Use](https://fred.stlouisfed.org/docs/api/terms_of_use.html)): "This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis."
  - You must also display a link to those terms to your users.
  - You may not use the St. Louis Fed's logo, or imply that it endorses the app.
  - **The app shows neither the notice nor the link today (M4).**
- **The five series** (CPI, unemployment, real GDP growth, the dollar index and the 10-year yield) come from BLS, BEA and the Fed Board. No third-party copyright was found, though only partial notes were read.

### 1.4 iShares (BlackRock)

- The US iShares terms page returned "not found". The footer links to [BlackRock's terms](https://www.blackrock.com/corporate/compliance/terms-and-conditions), and those terms:
  - allow downloads for personal use;
  - forbid using robots, spiders or other automatic devices to copy the site without permission ("Prohibited Uses"). Ordinary web browsers are excepted.
- robots.txt doesn't block the holdings path, but the terms are what count.
- Phase 0 found the address returning a web page, so the bundled list is already the usual source.
- **Verdict:** turn the automatic download off and refresh `sp500_bundled.csv` with each release (M3). Index changes then wait for the next release. That's fine if releases are monthly.

### 1.5 News article sites (8 of the ~70 on the allowlist checked)

| Site | Bans automated downloading? | Bans use with AI? | robots.txt for unnamed programs |
|:--|:--|:--|:--|
| Reuters ([Thomson Reuters terms](https://legal.thomsonreuters.com/en/legal-notices/terms-of-use), [robots.txt](https://www.reuters.com/robots.txt)) | Yes (robots.txt header and the Thomson Reuters terms) | Not found | **Whole site blocked** |
| AP ([mirror](https://tostracker.app/document/associated-press)) | Yes (§3.B) | Yes (§3.B, §4.A) | Articles open |
| New York Times ([mirror](https://tostracker.app/document/nytimes)) | Yes (§4.1); says robots.txt isn't permission | Yes, including retrieval for AI answers | Articles open |
| WSJ / Dow Jones ([mirror](https://tostracker.app/document/dowjones)) | Yes (§9.4.1) | Yes, including use for AI grounding (§9.4.2) | **Whole site blocked** |
| [CNBC](https://www.cnbc.com/nbcuniversal-terms-of-service/) | Only in its paid-product terms | Not found | Articles open |
| [Yahoo](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html) | Yes (§2(d)) | Not found for outside AI | Articles open |
| [Motley Fool](https://www.fool.com/legal/terms-and-conditions/fool-rules/) | Yes (§8); no scraping or abstracts (§7) | Not found | Articles open |
| Business Wire | Couldn't load | Couldn't load | Couldn't load |

- AP, NYT and Dow Jones were read from a terms-tracking mirror, because their own pages refused automated reading.
- Most of these sites also block named AI agents such as ClaudeBot and GPTBot.
- **Verdict:** a public app that downloads these pages and passes them to an AI is the riskiest thing in the app. Fetching on each person's own Mac for their own reading is the strongest argument for it. But NYT and Dow Jones name exactly this use. Hence M2, option A.

### 1.6 Alpha Vantage

Not used. Its overview endpoint went premium in Phase 0. [Its terms](https://www.alphavantage.co/terms_of_service/) §2(a) allow personal, non-commercial use under each person's own sign-up. Remove its key row and its README line (S3, M10).

## 2. Disclaimers

| Place | Has the line? | Gap and fix |
|:--|:--|:--|
| Report in the app | Only at the very end of the text column, after the downloads | Nothing next to the rating and range. Add one short line under the rating card (M5). |
| Report saved as a file | Yes, at the top | — |
| **Prediction log** | **No** (only "Descriptive, not conclusive") | Add the line (M5). |
| PDF | Yes: footer on every page, plus "Important information" | — |
| Slide deck | Yes: footer on every slide, plus the "Important information" slide | Cover label says "Recommendation", while the disclaimer says it is "not… a recommendation". Rename it "Rating" (M5). |
| Excel | On screen, only at the foot of the Summary tab; in the printed footer of every tab; in the file properties | Add it to every tab's header lines (M5). |
| Analyst ratings panel | Yes | — |
| Setup | Yes ("Research to read, not investment advice") | — |
| Sidebar, home | No, but they only show a rating tag | Fine once the report and log carry it. |

## 3. Privacy: what leaves the Mac

Synced with the code on 9 Nov 2026 (`SERVICES` in `engine/src/tearsheet/server.py`, which Settings → Privacy shows, and the README's table).

| Goes to | What | Why |
|:--|:--|:--|
| SEC (sec.gov) | Your contact email (in every request), your internet address, and which companies' filings (the company and its peers) | Filings; SEC asks every program for a contact |
| Massive | Your key, your address, and the tickers (company, peers, SPY; the background fill asks for whole-market daily prices). The key goes only to Massive's own API address | Prices |
| FRED (St. Louis Fed) | Your key, your address, and the 5 series names | Economy figures in section 8 |
| News sites on the allowlist | Nothing unless you open a link: articles are listed as links and not downloaded. With `news_articles` on, your address and a request for each article page | News section |
| Your AI tool: Anthropic (Claude Code) or OpenAI (Codex) | Filing and press-release text, the numbers sent with it, draft sections, and a web search for news about the company. Under your own plan's privacy terms and training setting. Tearsheet turns session history off in both tools. Codex also loads your own `~/.codex/AGENTS.md` and sends it to OpenAI with each call; Codex has no setting to stop it (`ai/codex.py`, `USER_INSTRUCTION_FILES`) | Reading and writing the report |
| GitHub (raw.githubusercontent.com) | Your address, and one plain request for the off-switch file at each launch | The Install button's online off switch |
| claude.ai and chatgpt.com | Your address, and a download of Claude Code's or Codex's official install script, only when you press Install | Installing the AI tool |
| Apple | Only if you point the backup folder at an iCloud folder | Your choice |
| **Liam** | **Nothing** | — |

No longer contacted: iShares (the S&P 500 list ships with each release, M3), Alpha Vantage and Benzinga.

**Stays on the Mac:** reports, the prediction log, raw downloads, settings, keys (Keychain), logs and saved downloads.

**Where it lives** (for the uninstall note):

- `~/Library/Application Support/Tearsheet/` holds the database, raw data, reports, logs and the app's window data.
- `~/Tearsheet Backups/`.
- Keychain items named "Tearsheet", plus "Tearsheet Safe Storage" if Electron made one.
- Files saved to `~/Downloads`.

**Fixes for the in-app list (M10):** done 8 Nov 2026; the GitHub, install-script and `AGENTS.md` lines were added on 9 Nov 2026.

## 4. What a stranger would miss

| Need | Today | Pick |
|:--|:--|:--|
| Version number | Only in the default About box: "0.0.1". The engine's own version shows only inside the PDF. | Settings → About: app and engine versions, plus links to Help, Privacy, Terms, Feedback and the FRED notice (M7, M4). Liam picks the first public number, say 0.1.0. |
| Send feedback / report a bug | Nothing; no Help menu | M8, option A |
| Crash logs | `logs/engine.log` stays on the Mac (about 67 KB here); no crash reporter | S2: Copy diagnostics. Nothing automatic. |
| README or help page | The README is for developers (uv, terminal) | A one-page user help: what it is, what it isn't, setup, privacy, terms and uninstall (M9) |
| Privacy note | Settings → What leaves your Mac (fix in M10) | Link it from Help |
| Terms of use | Only the MIT licence (no warranty on the code) | A short page (M9): research only, not advice; no warranty; your own AI plan and data providers' terms apply; predictions can't be changed |
| Uninstall note | None | In the help page (§3 lists the places) |
| Licence notices | `THIRD-PARTY-NOTICES.md` missing; probe, tools and the PATH fix are adapted from Realm (MIT) | M6. Most bundled Python libraries are MIT, BSD or Apache; certifi, orjson and tqdm are MPL-2.0 (needs a notice). Unidecode is GPL-2.0-or-later, via edgartools. edgartools loads it on start (checked: it is loaded once a filing is parsed), but only its company-name search uses it, which Tearsheet never calls. Options: ship a tiny stand-in module in its place (my pick), or follow the GPL for the bundled app. |

## 5. The legal question: publishing ratings and price ranges

**This is a summary of public sources, not legal advice. Liam should get a quick check from a qualified US securities lawyer before a public release (M1).**

**The federal rule.** The Investment Advisers Act, §202(a)(11) ([15 U.S.C. 80b-2](https://www.law.cornell.edu/uscode/text/15/80b-2)), defines an adviser as any person who:

> "for compensation, engages in the business of advising others, either directly or through publications or writings, as to the value of securities or as to the advisability of investing in, purchasing, or selling securities…"

It excludes:

> "(D) the publisher of any bona fide newspaper, news magazine or business or financial publication of general and regular circulation"

**How courts and the SEC read the exclusion.**

- The Supreme Court in [Lowe v. SEC, 472 U.S. 181 (1985)](https://www.law.cornell.edu/supremecourt/text/472/181) said the Act is aimed at "those who provide personalized advice attuned to a client's concerns".
  - Also: "The mere fact that a publication contains advice and comment about specific securities does not give it the personalized character that identifies a professional investment adviser."
  - "Bona fide" means genuine, not "designed to tout any security in which petitioners had an interest".
  - "Regular" means not "timed to specific market activity".
- The [SEC staff's 2013 paper](https://www.sec.gov/about/offices/oia/oia_investman/rplaze-042012.pdf) sums up the exclusion as three tests:
  - advice is impersonal, "not tailored to the individual needs of a specific client";
  - it is bona fide, "disinterested commentary and analysis rather than promotional material";
  - it has general and regular circulation, "rather than issued from time to time in response to episodic market activity".
- On compensation, the same paper says "the receipt of any economic benefit" generally counts.
- In a 2015 letter about a website ([Jonathon Hendricks](https://www.sec.gov/divisions/investment/noaction/2015/jonathon-hendricks-012615-202a.htm)), the SEC staff said a website "could similarly qualify" if the tests are met. They called it "a factual and not a legal determination" and declined to say more.
- No SEC source was found on software that makes a rating on demand.
- **States have their own rules**, for example [Wis. Stat. § 551.102(15)](https://docs.legis.wisconsin.gov/statutes/statutes/551/i/102), which adds "electronic means". A public download also reaches people in other countries, with their own rules.

**Points that cut each way, to put to the lawyer:**

1. Is a report that software makes on demand, for the ticker a person types, "of general and regular circulation"? Or does it look more like a personal reply?
2. Is a free, open-source app with no fees, ads or accounts "for compensation"? Would donations, a paid tier later, or career benefit change that?
3. Do "Buy / Hold / Sell" and the word "Recommendation" matter? The design already weighed peer-relative labels (A20).
4. Who is the "publisher": Liam, or the person's own Mac? Does it matter that Liam never sees a report?
5. Would a public track record (design A30) change anything? Which state rules apply to Liam?

**Until the check:** share only by private link with people Liam knows. Keep the "not personalised advice" wording, and don't advertise results.
