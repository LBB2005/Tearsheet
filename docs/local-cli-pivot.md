# Stress test: open source, local AI CLIs instead of the Claude API

* **Date:** 2026-11-02
* **Proposal (from Liam):** make the app open source and run its AI steps through the AI command-line tools already installed and signed in on each user's computer (Claude Code, Codex, and others), following `Auto-Connect to Local AI CLIs Implementation Guide.pdf` (based on Realm, MIT license). The app would stop paying for the Claude API.
* **Status:** proposal under discussion. `docs/brief.md` (v4) is **not** updated yet. It will become v5 once the questions at the end are answered.

---

## 0. Update, Nov 2: personal use

**Liam's answer:** the app is for personal use. Each person runs their own copy with their own AI tools and their own keys, Jev included.

**Correction to §2.** §2 treated the app as a public product, because brief v4 §1 says "Public app that other people use." For personal use, the subscription route works:

- Running your own signed-in Claude Code from your own software is documented use: `claude -p`, the Agent SDK, and `claude setup-token` for scripts.
- The restriction in §8 targets developers who offer a Claude login, or route usage through *other people's* plans, as part of a product.
- **The one grey area is publishing the code so others can run their own copy.** Anthropic's pages don't address it. Three habits keep it on the personal-use side:
  1. No "Sign in with Claude" button. The app only detects a Claude Code the user has already signed in to.
  2. The README offers an API key as the alternative.
  3. No hosted service that runs AI for other people.

**Limits that still apply on a subscription:**

- Plan limits assume ordinary individual use. Reports you ask for yourself fit that. A nightly job that generates 500 reports through your subscription probably doesn't, so scheduled jobs stay code-only.
- One report reads about 150K tokens of filings plus the narrative calls. A few reports a day is fine on a Max plan.

**What personal use removes from brief v4,** on top of §3:

- **The price-data display license.** Only true if your price source's tier allows personal use.
- **Sign-in, quotas, the budget guard and hosting.**
- **Most of the publisher legal posture,** unless something is published. That is the next question.

**Second answer, Nov 2: free to use.** Liam: the app should cost nothing beyond the AI subscriptions people already have. Jev is the only exception, and its cost is small.

- **Default AI route:** the user's own signed-in Claude Code or Codex. An API key is only a fallback. Assumed launch tools: Claude Code and Codex, which the guide also suggests. (Assumption, not confirmed.)
- **Old §16 Q2 (monetization):** answered. Free, no paid tier.
- **Jev:** each user brings their own key.
- **New risk, price data is now the only part that may not be free.** The score needs daily prices for all ~500 companies (momentum, P/E, and the sector percentiles that rank them). Free price sources usually cap requests per day or tickers per month, and some limit commercial or bulk use.
  - **Two ways to keep it free:**
    - Find a free source whose personal-use terms cover ~500 tickers a day.
    - Compute only what a single report needs, then estimate peer percentiles from fewer prices. This is weaker.
  - **Still to check:** which free sources allow this.
  - **Narrowed, Nov 2:** no intraday data is needed. Only daily closing prices, fetched when a report runs, for the company and its sector peers (about 20–70 companies), covering the last 12 months.
    - **Uses:** the stock's own valuation (P/E, market value, the value-vs-price gap behind the rating), the 12-month range's starting point, momentum, and ranking those against peers.
    - **Factors that need no prices at all:** profitability, growth, balance sheet, accruals and share issuance.
    - **Fetch size:** a few dozen requests per report, not 500 a day.
- **Assumed, not confirmed:** reports are seen only by the person who ran them, with no public ratings site. This follows from personal use. If that holds, there is no public track record, and the prediction log is each user's own.
- **Subscription limits per report are unmeasured.** A report reads about 150K tokens of filings. A Pro plan's usage window may fit only a few reports. Measure on Pro and Max in Phase 0.

**Third answer, Nov 2: a downloadable desktop app for anyone.** Liam: the code lives on GitHub, and there is also a plain download link. People install it and run it as an app, not in a web browser. It has to be very easy for non-technical people. This rules out the terminal-only Python tool in §5. The guide's design (Electron, install and sign-in buttons) is the right starting shape, with the cautions in §9.

**Fourth answer, Nov 2: no app account; detect first, then a button.** Liam: the app has no sign-in of its own. On launch it detects Claude Code and Codex. If either is installed and already signed in, the app just uses it. If not, one button installs it or signs the user in. This is the guide's design (Steps 1–2 detect, Steps 6–7 install and sign-in) and the "free + one-click" row in §9.1.

- **Launch tools:** Claude Code and Codex (confirmed).
- **Accepted risk:** the install and sign-in button is the case Anthropic's Agent SDK docs say needs prior approval for third-party products (§8). Two steps, both cheap:
  1. Email Anthropic sales before the public download link goes live, describing the app. The button runs Claude Code's own login, and the app never sees credentials.
  2. Build the button so a single setting can switch it off. If Anthropic says no, the app falls back to auto-detect plus written instructions, and offers an API key.
- **OpenAI's terms for Codex:** still to check, with the same switch-off setting.

**Fifth answer, Nov 2: Google sign-in for storage; success bar = useful to Liam.**

- **Google sign-in** is the one account step: "just to store data." Everything else auto-connects.
  - **Challenge:** the desktop design already stores everything in a SQLite file on the computer, which needs no account. Google sign-in adds an account step to an app meant to auto-connect, and it should earn its place. It would help with backup, using the app on more than one computer, or keeping the prediction log safe if a laptop dies.
  - **If kept:** store data in the user's *own* Google Drive, using the narrowest access the API allows (only files the app created, or a hidden app-data folder). Do not use a shared database Liam runs (Firebase or similar): then Liam would hold other people's data and pay for it.
  - **To check:**
    - **Verification steps:** what Google's app verification requires for those access levels.
    - **Unverified apps:** they show a "Google hasn't verified this app" warning and have a user cap.
    - **Full Drive access:** it needs a paid security review, so avoid it.
- **Resolved, Nov 2: Google sign-in dropped for now.** Liam agreed it isn't needed yet. All data stays in a SQLite file on the computer. Backup or sync can come back later as a user's own Google Drive folder, if needed.
- **Success bar: "if the app is useful for me, that's the bar."**
  - **What it settles:** the public track record, pre-registration and the legal review become optional. They aren't needed to meet the bar, and they stay in the design only as good practice for the prediction log.
  - **Tension with the earlier answers:** the bar can be met on Liam's own Mac, using his own Claude Code. The download link, the one-click install and sign-in buttons, the $99/year Apple signing, auto-update, and Windows are all for *other* people, so they don't count toward the bar.
  - **Sequencing proposal:** first build the report engine and a simple window on Liam's Mac, and use it until the reports are useful. Then package it for other people. This reorders the work; it does not drop the desktop app.

**Changes to [decided] items, to record in v5:**

- §1 "A web app" becomes "a downloadable desktop app (source on GitHub, plus a direct download), built for non-technical users."
- §1 "Runs on the Claude API using Max 20x's $200/month API credits" becomes "free to use: runs on the user's own Claude Code or Codex subscription (API key as fallback); the user supplies their own Jev key."
- §1 "Public app that other people use" becomes "personal use; code published so others can run their own copy."

---

## 1. What this reverses

Three **[decided]** items in brief v4 change. Liam can change them; they are listed so the change is recorded on purpose, not by drift.

| Brief v4 [decided] | Under this proposal |
| :-- | :-- |
| §1 "A web app" | A program each user runs on their own computer (desktop app or local tool) |
| §1 "Runs on the Claude API using Max 20x's $200/month API credits" | Runs on each user's own AI tools and their own subscriptions or keys |
| §1 "Public app that other people use" | Still public, but as open-source software people install, not a hosted service |

Items that follow from those three and also change:

- **§2 user flow:** sign-in, the per-user limit, the ticker-day cache and the budget guard all go away.
- **§7 price-data license:** the plan to buy one before anyone else uses the app is replaced by each user fetching their own data.
- **§10 stack:** Vercel, auth and the job runner go away.

---

## 2. The largest problem: the subscription route needs Anthropic's approval for a public release

*Superseded for personal use. See §0. This section still applies if the app is ever offered as a product or hosted for other people.*

The guide states this itself (page 12, "Rules and risks"): Anthropic's Claude Agent SDK documentation says third-party developers may not offer claude.ai login or subscription rate limits in their products without prior approval, and should use API keys instead. **Checked against Anthropic's docs on Nov 2 (§8): confirmed, and Claude Code's legal page goes further.** It also bars routing requests through users' Pro or Max plans on their behalf. No approval process is documented beyond "contact sales."

What follows:

- **Open-sourcing does not change this.** The rule is about what a product offers, not about who hosts it or whether the code is public. A "Sign in with Claude" button in a public release is the case the rule names.
- **The guide's main selling point (subscription billing) is clean only for personal use.** "Using your own subscription on your own Mac is the normal case," per the guide.
- **The other vendors are no better.** OpenAI's terms for apps that drive Codex on a ChatGPT login are unchecked (the guide's own open question). Gemini needs an API key, because Google ended the free personal login for this use.

**Strongest counter-argument:** an open-source tool that only calls whatever `claude` program the user already installed and signed in to is different from a product that offers a login. That may be true, but it is Anthropic's call, not ours. The guide's options are: ship "bring your own API key" for Claude, get approval, or keep subscription use personal.

**What survives regardless:** **bring-your-own API key** reaches the stated goal (open source, Liam pays nothing for AI) without the terms risk. At the stress test's estimate of $0.27–0.50 per fresh report, a user generating a few reports a week pays a few dollars a month. The local-CLI route can then be an extra option, labelled for personal use, until Anthropic answers.

---

## 3. What this fixes

- **The cost problem disappears.** The stress test's largest finding ($200/month allows only about 13–24 fresh reports a day, and nightly pre-generation would cost about $3,000/month) no longer applies. Each user pays for their own AI. No budget guard, global cap, or per-user limit is needed.
- **The price-data display license may no longer be needed.** The planned license (~$149+/month) exists because the app would show prices to other people. If each user's copy fetches prices with that user's own free or paid key, Liam is not redistributing data. This must not be undermined by bundling price data in the repo or a shared server.
- **The design already suits it.** Brief v4 keeps every number, score, rating and range in Python, and uses the LLM only to extract and write. The parts that matter for the track record do not depend on which AI tool a user has.
- **The regulatory picture changes.** Software a person runs for themselves is a different situation from a site publishing ratings to the public. This changes the question for the securities lawyer; it does not answer it.

---

## 4. What this breaks or makes harder

1. **The public track record has no home.** With every user running their own copy, there is no single prediction log.
   - **Fix:** the rating is code-only, so a scheduled job in the open repository (for example a nightly GitHub Action) can compute ratings for all ~500 companies from public data and commit the log and hash to the repo. That gives a public, time-stamped record with no AI calls.
   - **Catch:** it needs prices, so publishing ratings derived from prices brings back a licensing question for that one job.
2. **"Same report for everyone" ends.** The brief's publisher model (§15) assumes one report per ticker per day. Numbers stay identical across users, but narratives will differ by tool (Claude, Codex, Gemini, Qwen) and by quality.
3. **Model pinning and evals multiply.** Brief §6 pins Claude model IDs and prompt versions, and that cannot be guaranteed across a dozen tools that change their own models. Each supported tool needs its own golden-set run, so twelve tools means twelve eval suites.
   - **Fix:** support one or two tools at launch. The guide itself suggests Claude Code and Codex alone.
4. **These tools are agents, not plain model calls.** Claude Code and Codex come with file, shell and web tools, and their own long system prompts written for coding. The brief's rule is "no agents, no LLM-driven control flow."
   - **Fix:** each extraction or narration call must switch off tools (deny every permission request), set its own system prompt where the tool allows it, demand schema-bound output, and treat any tool-use attempt as a failure.
   - **Unchecked:** whether Codex and the ACP tools allow replacing the system prompt.
5. **Subscription usage limits.** Subscriptions have usage windows and weekly caps. One fresh report reads about 150K tokens of filings plus narrative and skeptic calls, so heavy use will hit a plan's limits. Fine for a few reports a day, not for bulk.
6. **Jev is [decided] and probably a hosted service.** If it charges per call, each user would need their own Jev key, or Jev becomes optional with the brief's existing fallback to the AI tool.
7. **Two runtimes.** The guide recommends Electron with a TypeScript background process, while the engine is Python, so a desktop build ships Node and Python together. Packaging Python inside Electron is the hardest part of the build.
8. **SEC fair-access rules apply to each user.** Each copy must send a User-Agent with that user's own contact email to EDGAR.

---

## 5. A smaller version to weigh against the guide's

*Ruled out on Nov 2: Liam wants a double-click app for non-technical users (§0). Kept here as the record of the alternative weighed.*

The guide describes a consumer desktop app: Electron, a Connections screen, install and sign-in buttons, auto-update, signed Mac builds. That is a lot of product before any stock analysis exists. A smaller open-source shape:

- **One language:** a Python package (`uvx <name> TSLA`) that writes an HTML report and opens it in the browser, or serves a small local page.
- **AI access:**
  - an API key (Anthropic or OpenAI) as the supported default;
  - the user's own `claude` program through the Python Claude Agent SDK as an option, labelled for personal use;
  - Codex through `codex app-server`, which speaks plain JSON lines over standard input and output and works from any language.
- **No install or sign-in buttons.** The README tells people to run `claude auth login` themselves.
- **No Electron, no Vercel, no auth, no job runner.** SQLite instead of Postgres.
- **Public track record:** a nightly GitHub Action (§4 item 1) plus a static site for the methodology and the record.

**What it gives up:** non-technical users. Anyone who can't run one terminal command can't use it. So the choice depends on who the users are (a question for later).

---

## 6. What carries over from brief v4 unchanged

- The whole numbers layer: metrics, score, valuation, range, rating, red flags (§4 steps 1–7, §8).
- The text layer's structure: sections, paragraph IDs, year-over-year comparison, extract → narrate → verify (§5).
- The research conclusions: LLMs read and write; code predicts.
- The track-record rules (§9), now run by the repository's scheduled job instead of a server.

---

## 7. Open questions this raises (to work through one at a time)

1. Given the approval rule, is bring-your-own API key an acceptable default, with subscription use as a personal-use option?
2. Who is the user: people who can run a terminal command, or anyone who downloads an app? This decides Python tool vs. Electron app.
3. Which AI tools are supported at launch (one, two, or many)?
4. Where does the public track record live, and which price source can it legally use?
5. What happens to Jev in an open-source build?
6. Which open-source license (MIT, Apache-2.0)? Copying Realm's files requires keeping its MIT notice in a THIRD-PARTY-NOTICES file.
7. Do the earlier brainstorm questions still apply? Several §16 questions change or disappear: Q1 freshness, Q2 monetization, Q7 job runner and auth.

---

## 8. Terms check (Anthropic), Nov 2, 2026

These are paraphrases. Read the linked pages before deciding, because they change.

1. **Agent SDK overview and Quickstart** ([overview](https://code.claude.com/docs/en/agent-sdk/overview.md), [quickstart](https://code.claude.com/docs/en/agent-sdk/quickstart.md)): unless previously approved, third-party developers may not offer claude.ai login or subscription rate limits in their products, including agents built on the Agent SDK. Use API keys instead. **Confirmed; it matches the guide.**
2. **Claude Code legal and compliance page** ([link](https://code.claude.com/docs/en/legal-and-compliance.md), "Authentication and credential use"):
   - Third-party developers may not offer Claude.ai login in their own apps, or route requests through Free, Pro, Max or Ultra plan credentials on behalf of their users. This is broader than item 1: it covers routing usage through users' plans, not only offering a login button.
   - The same section says this does not stop an end user from signing in to the *unmodified* Claude Code program with their own subscription.
   - It also says the advertised plan limits assume ordinary, individual use of Claude Code and the Agent SDK.
3. **Consumer Terms** ([link](https://www.anthropic.com/legal/consumer-terms), section 3): access by automated means (a bot, a script) is restricted except with an API key or where Anthropic explicitly permits it. Claude Code's own docs describe headless use (`claude -p`, and `claude setup-token` for scripts and CI pipelines) on a subscription, which reads as that explicit permission for a person's own automation. No page reconciles the two.
4. **How to get approval:** no form or process is documented. The legal page says to contact sales about permitted authentication methods.

**Conclusion for this proposal:**

- **Liam's own use on his own Mac:** fine. That is ordinary individual use of his own Claude Code.
- **A public open-source app that drives *other people's* signed-in Claude Code for them:** this is what item 2's "route requests through plan credentials on behalf of their users" appears to describe. No page addresses the open-source, user-installed case directly, so treat it as **not permitted without approval** until sales says otherwise.
- **Bring-your-own Anthropic API key:** permitted without any approval.
- **Codex on ChatGPT logins:** still unchecked. OpenAI's terms need the same reading before anything ships.

---

## 9. Stress test: a free, download-and-run app for non-technical users (Nov 2)

### 9.1 The core tension: free, one-click, and inside Anthropic's terms — pick two without approval

A non-technical person has never installed Claude Code. To make the app "download and it works," the app has to install Claude Code for them (or use the copy bundled inside the Claude Agent SDK, which the guide says works with nothing installed) and then sign them in with a button. That button is the case Anthropic's Agent SDK docs name: a third-party product offering claude.ai login (§8, item 1). Personal use stops being the right description once the app is downloaded by strangers who sign in through it.

| Combination | How it works | Catch |
| :-- | :-- | :-- |
| **Free + one-click** | The app bundles Claude Code and has a "Sign in with Claude" button | Needs Anthropic's prior approval; ask sales first |
| **Free + inside the terms** | The user installs and signs in to Claude Code themselves; the app only detects it | One terminal step, which non-technical users struggle with |
| **One-click + inside the terms** | The user pastes an API key into the app | Costs money per report (about $0.30–0.50), so not free |

A fourth route avoids the conflict for Codex only if OpenAI's terms allow third-party apps to drive Codex on a ChatGPT login. That is unchecked.

The guide's Realm app ships the one-click version. That shows it can be built, not that it is approved.

### 9.2 Desktop-app costs and friction that "free" hides

- **Apple developer membership: $99/year, paid by Liam.** Without it, the Mac app can't be signed and notarized. Since macOS 15 (Sequoia), the old right-click "Open" shortcut for unsigned apps is gone, and users must find an override in System Settings. That is a dead end for non-technical users.
- **Windows code signing** costs extra too, or users see a SmartScreen warning. The guide suggests Mac first, Windows later.
- **Two runtimes in one app.** The UI and AI adapters are TypeScript in Electron (needed to reuse Realm's MIT code). The numbers engine is Python (needed for edgartools). The app must ship its own Python. That is the hardest packaging task in the build.
- **Auto-update is required, not optional.** Claude Code and Codex rename flags and change output formats (the guide says this happened during Realm's development), and SEC filing formats drift. An app that can't update itself breaks for every user at once. Electron's updater with GitHub Releases does this for free.
- **The Jev key is a sign-up and a payment method.** For non-technical users that is a second account to create. Proposal: Jev is optional. Without a key, the app uses the AI tool's own check, which the brief already uses when Jev is down, and shows "verified with Jev" only when a key is set.
- **Free price data** should need no account if possible, for the same reason. Still to check which sources allow it (§0).
- **SEC contact header:** every copy of the app calls EDGAR. Use the project's own contact email in the User-Agent; each user's requests come from their own internet address, so the 10-requests-a-second limit applies per user.

### 9.3 What this changes in the brief's stack (§10)

| v4 | Desktop app |
| :-- | :-- |
| Next.js on Vercel | Electron app (Mac first), UI in the same web technologies |
| Python FastAPI service | Python engine bundled inside the app, started by Electron |
| Trigger.dev / Inngest | Not needed; reports run inside the app |
| Postgres (Supabase / Neon) | SQLite file on the user's computer |
| Auth provider | Not needed |
| Claude API key | Adapters for Claude Code and Codex, API key as fallback (guide Steps 1–7) |

---

## 10. Remaining questions with proposed defaults (Nov 2)

The brief's §16 questions and this doc's §7 questions, after the answers above. "Default" means what the design assumes unless Liam overrides it. These go into brief v5.

| # | Question | Status / proposed default |
| :-- | :-- | :-- |
| §16 Q1 | Report freshness | **Answered (Liam):** every run is fresh: new numbers *and* new written sections each time. **Proposal to keep usage down:** the AI's evidence extraction from a filing is saved per filing, because a filing never changes after it is filed, so the same input gives the same evidence. Only the narrative and the check are redone each run. This removes most of a run's token use (the ~150K tokens of filing reading) without making the report less fresh. |
| §16 Q2 | Monetization | **Answered:** free. |
| §16 Q3 | Finava | **Default:** stays separate. No shared code, data or accounts. |
| §16 Q4 | Factor weights | **Default:** the research ranking in brief v4 §8 (profitability > momentum > valuation > the rest, growth recast as capital discipline). Exact numbers are set in `/egm-draft`. |
| §16 Q5 | DCF rules | **Default:** a Morningstar-style three-stage DCF with the v4 §8 rules. Details in `/egm-draft`. |
| §16 Q6 | Financials / REITs | **Default:** banks and insurers on price-to-book against ROE (equity-level); REITs on price/FFO. Details in `/egm-draft`. |
| §16 Q7 | Job runner, host, auth | **Answered by the desktop app:** Electron (Mac first) plus a bundled Python engine plus SQLite. No server, job runner or auth. |
| §16 Q8 | PDF export | **Default:** not at launch. Electron can print a report to PDF cheaply later. |
| §16 Q9 | Name | Open; not blocking. |
| §16 Q10 | Base case of the range | **Accepted (Liam):** today's price grown at the expected return plus one-third of the gap to estimated value (three-year closing). The range width comes from a volatility forecast and is declared as 10th–90th percentiles. |
| §16 Q11 | Skeptic independence | **Resolved by the switch:** if both Claude Code and Codex are connected, the skeptic runs on whichever one did not write the draft (a different model family, as the AI research recommends). With only one connected, it uses the same tool in a fresh session. |
| §16 Q12 | Rating horizon | **Default:** 12 months. |
| §7 Q5 | Jev | **Default:** optional. Without a key, claims are checked by the AI tool itself, and the report shows "verified with Jev" only when a key is set. |
| §7 Q6 | License | **Default:** MIT, the same as Realm, with Realm's notice kept in THIRD-PARTY-NOTICES.md for any copied files. |
| §0 | Free price source | **To research:** a source with no account, or a free account, whose personal-use terms allow about 12 months of daily closes for a company and its sector peers per report. |
| §8 | Anthropic and OpenAI terms | **Action before the public download link:** email Anthropic sales and check OpenAI's terms. The install and sign-in button can be switched off by a setting. |

---

## 11. News, bank and hedge-fund blogs, and other articles (Nov 2)

**Liam's ask:** each report also scans recent news, investment-bank blogs, hedge-fund blogs and other credible articles about the company. The report appears in the app in a polished report format, which will get its own brainstorm.

### 11.1 What the research says it can and can't do

- **Context, not prediction.** For large companies, news is priced in within about a day (AI report). It belongs in the narrative ("what's happening and why it matters") and must never move the score or rating. That matches brief v4 §7.
- **Bank and fund writing has known biases.** Sell-side targets run about 15 points optimistic and 56% of street ratings are Buy (traditional report). Fund letters often argue for positions the fund already holds. The report should label each source's type and, where visible, its stance. The skeptic check should flag a news section that leans one way.

### 11.2 How it can stay free

The news step can run on the user's own Claude Code or Codex, which can search the web on the user's subscription. No paid news feed is needed.

- **Run it as its own step:** web search and page reading allowed, every other tool denied.
- **Save locally:** each article's text, URL and fetch date, with paragraph IDs, so claims cite paragraphs and get checked like filing claims (citation check, Jev, skeptic).
- **Show in the app:** headline, source, date, link, and the AI's short summary. Not the article text. Saving text locally for checking is personal use; showing whole articles is not needed.

### 11.3 Risks

1. **Security: web pages can carry instructions aimed at the AI.** This step drives the user's own Claude Code, which normally can run commands on their computer. Guards:
   - Deny every tool except web search and page reading.
   - Run in an empty temporary folder.
   - Require schema-bound output, and treat anything an article "asks" as text.
   - Never run the news step in the same session that has file or shell access.
2. **"Credible" needs a definition the AI doesn't make.** Use an editable allowlist of sources, grouped by type:
   - news outlets;
   - public bank research and insights pages;
   - public fund letters and memos;
   - short-seller reports;
   - company press releases.

   The AI may only cite sources on the list. Anything else is shown as "other," or dropped.
3. **Much bank research is paywalled or client-only.** Public bank and asset-manager pages are mostly about the economy and markets, not single companies. Expect company-specific bank views to come mainly through news coverage of rating changes, not the reports themselves.
4. **Dates.** Every item carries its publication date. The report covers a fixed window (proposed: the last 30 days, plus older items only if they are major events). Undated items are dropped.
5. **Usage.** Searching and reading articles adds tokens to each run. Cap the number of articles read (proposed: up to 15) and summarised (up to 8).

### 11.4 Changes to brief v4

- News moves from Phase 3 into v1, through the user's own AI tool, not a licensed feed.
- §5 gains a "web articles" source type next to filings, with the same paragraph IDs and checks.
- New report section: **News and what credible sources are saying**, with dated items, source type, links and summaries.

### 11.5 Open: report look and feel

To brainstorm separately: how the report looks in the app (layout, charts, what is on the first screen).

---

## 12. Report outline, agreed Nov 2

Liam approved the outline below. He added macro and micro trends. Macro was only partly covered, as "market context" (rates and the sector). Industry-level trends had no section of their own.

1. Rating, score and price range
2. Score breakdown by factor
3. Valuation detail
4. Business and competitive position
5. Key risks and red flags
6. Recent results and management commentary
7. News and what credible sources are saying (§11)
8. **Macro and industry trends** (replaces "Market context")
   - **Macro forces that matter to *this* company, and where they stand now.**
     - **Which forces:** only those the company itself names as material: rate and currency sensitivity (10-K Item 7A); risk factors about rates, inflation, commodities and consumer spending (Item 1A).
     - **Current readings:** code-computed numbers from FRED (rates, inflation, unemployment, growth).
     - **What it does not do:** predict where the economy is going. The research found that aggregate predictors don't beat a simple average out of sample (Welch & Goyal).
   - **Industry ("micro") trends.** Demand, pricing, competition, costs, regulation and technology shifts in the company's industry.
     - **Sources:**
       - the "known trends and uncertainties" the company must disclose in its MD&A;
       - the same section in the filings of 3–5 of its largest peers, which shows whether a trend is company-specific or industry-wide;
       - the news scan.
     - **Cost:** peer filings are read once and saved per filing (§10, Q1), so other reports in the same sector reuse them.
   - **How the stock and its sector have moved:** code-computed relative strength against the sector and SPY.
9. Methodology and sources

**Guard against filler:** every trend statement must cite a filing paragraph, an article on the allowlist, or a computed number. Generic lines like "rates remain elevated", with no link to this company, are cut by the skeptic check.

**Still open:** how this looks in the app (§11.5).
