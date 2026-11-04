# Goldfish Review Report

**Target:** `/Users/liamblackshaw-brown/code/Tearsheet/docs/designs/tearsheet.md` (`Lines 1037–1812`: "Detailed Implementation Plan" to the end of the file)
**Stage:** Stage 9, Implementation Readiness Test
**Standard:** `implementation-readiness-standard` (the Zero-Decision Rule)
**Date:** Nov 2, 2026

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-implementation-readiness` (instance A: Tooling defaults, Phase 0, Phase 2, Phase 3, Repository files, Verification Plan) | completed |
| `egm-implementation-readiness` (instance B: Phase 1) | completed |
| `egm-codebase-details` | completed |
| `egm-style` | completed |

Every instance returned a full report on the first attempt, so no retries were needed. Both readiness instances read the whole range. Each went into depth only on its own part.

## Summary

* **Verdict: the plan isn't ready to build yet.** In many places, a builder would still have to make a design decision that matters.
* **Counts after merging duplicates:** 2 Blocker, 32 Major, 11 Nit. The four instances raised 95 findings between them (19 + 25 + 27 + 24), which merge into the 45 below.
* **The main pattern.** Many items say "implements Technical Plan §N". But §N names the quantity without its formula, value or data source. This affects valuation, metrics, the risk-factor flag, peer ranking, momentum scaling, grading and the Goal 1 tally. Line 1039 says the method's numbers "are set in Technical Plan §7 and §8". Several aren't.
* **Other recurring gaps:**
  * how the pieces connect: the raw-store index, the narration output, the app–engine messages and the report links;
  * the lock-down settings and the state of the gate after a failed check;
  * Phase 0 can't run on its own, and nothing says what happens to its results.
* **Settle before the first official prediction.** Predictions are write-once, so a wrong choice in these can't be undone: B1, B2, M1, M2, M3, M5, M7, M24 and M26.
* **What already holds up.** The reviewers confirmed these, and nothing needs to change:
  * Cross-references: the item numbers, the "§N" references and the 14 step names all match between §1, §3 and item 34.
  * Item 17's tables match the §6 list, and the terminal command names are the same everywhere.
  * The bridge calls in item 45 map one-to-one onto the §2 requests.
  * Items 42–43 match the guide: the PATH fix; `--version` with a 5-second timeout; `claude auth status --json` read even on a non-zero exit; `codex login status`; the 30-second cache; and the override variables.
  * Phase 3 is an outline on purpose (line 1737).
* **Verification notes.** I checked every finding's line numbers and main claim against the current file (1,812 lines) before including it.
  * **Narrowed:** a reviewer said no Phase 0 step checks edgartools' offline mode. Item 13's `test_sec.py` (line 1264) does check it. M9 is narrowed to the gaps that remain: how edgartools reads the hash-named store, and the fallback.
  * **Downgraded from Major to Nit:**
    * the missing lockfiles and the data files outside the package (N3), because they matter only at Phase 3 packaging;
    * the undefined parser version (N1), because it is a one-line fix whose cost is extra re-reads, not wrong numbers.
  * **Dropped:** the claim that line 1057 leaves Phase 0 files out. That line is a summary, and the files are listed as Phase 0 items 3, 7, 11 and 12.
  * **Assumptions:** outside-API behaviour that the documents can't confirm is marked as an assumption to confirm in Phase 0, not stated as fact. This covers:
    * Agent SDK option meanings and Python spellings;
    * Codex approval values and its instruction-file name;
    * Massive endpoints;
    * Alpha Vantage and FRED error bodies;
    * ticker spellings per source;
    * edgartools' offline layout.

### Findings at a glance

| ID | Finding | Severity | Lens |
| --- | --- | --- | --- |
| B1 | The raw store keeps no record of what each stored file is | Blocker | readiness (A), codebase-details, style |
| B2 | Valuation can't be built "exactly as specified in §8" | Blocker | readiness (B), codebase-details |
| M1 | Metric formulas and the percentile method are undefined | Major | readiness (B) |
| M2 | The risk-factor red flag has no measure or threshold | Major | readiness (B), codebase-details, style |
| M3 | Peer selection needs a sector map and market values that no item supplies | Major | readiness (B), codebase-details, style |
| M4 | The S&P 500 list source is not chosen, not checked, not in the services table | Major | readiness (B), codebase-details, style |
| M5 | Price history, momentum scaling and "stale" can't be computed as written | Major | readiness (A, B), codebase-details, style |
| M6 | The Massive Phase 0 test contradicts §5; the fast path has no owner | Major | readiness (A, B), codebase-details, style |
| M7 | Which share class is rated, and ticker spellings per source, are open | Major | readiness (B) |
| M8 | The SEC Phase 0 test over-fetches; no re-download rule | Major | readiness (A), style |
| M9 | How edgartools reads the hash-named raw store is unspecified | Major | readiness (A, B), codebase-details |
| M10 | The usage test can't be scored | Major | readiness (A), style |
| M11 | The lock-down check doesn't test what §4 requires | Major | readiness (A), codebase-details, style |
| M12 | The link search's web search counts as a forbidden tool use | Major | codebase-details |
| M13 | Connector lock-down settings are named by intent; Codex loads the user's setup | Major | readiness (A), codebase-details, style |
| M14 | The lock-down gate has no stored state; AI failures inside a run are under-specified | Major | readiness (A, B), codebase-details, style |
| M15 | The engine's concurrency model isn't chosen | Major | readiness (A) |
| M16 | The AI call plan and call budget can't be implemented | Major | readiness (A, B), codebase-details |
| M17 | The narration output contract is undefined | Major | readiness (B), codebase-details |
| M18 | The numeric guard's word and pattern lists are not defined | Major | readiness (B), style |
| M19 | The citation check is looser than §11 | Major | readiness (B) |
| M20 | Escaping and Markdown have no order, and contradict the safety test | Major | style, codebase-details, readiness (B) |
| M21 | Report links, the frame, and the flag and re-read actions have no contract | Major | style, codebase-details, readiness (B) |
| M22 | App–engine messages are named but not shaped | Major | readiness (A, B), codebase-details |
| M23 | No rule picks which AI tool runs a report | Major | readiness (A, B), codebase-details |
| M24 | Prediction logging edge cases; schema differs from §10 | Major | readiness (B), codebase-details, style |
| M25 | Goal 1 labels, sampling and tally rules are undefined | Major | style, codebase-details, readiness (B) |
| M26 | Replay breaks on methodology edits, may write predictions, can't read newer databases | Major | readiness (B), codebase-details, style |
| M27 | Several feature rules have no owning plan item | Major | readiness (B), codebase-details, style |
| M28 | Phase 0 has no exit gate, no failure actions, no results record | Major | readiness (A), codebase-details |
| M29 | Phase 0 still depends on Phase 1 pieces | Major | codebase-details, style, readiness (A) |
| M30 | Grading (Phase 2) leaves several rules to the builder | Major | readiness (A), style, codebase-details |
| M31 | Stored test runs and the golden-set baseline are undefined | Major | readiness (A, B), codebase-details |
| M32 | Test plan gaps: AI layer, renderer, database, and no fake AI | Major | readiness (A, B), codebase-details |
| N1 | Version and hash definitions are loose | Nit | style, codebase-details, readiness (B) |
| N2 | `bands.yaml` naming | Nit | codebase-details, style |
| N3 | File-list bookkeeping | Nit | codebase-details |
| N4 | Unnamed tools; Phase 3 dependencies in Phase 1 | Nit | codebase-details, readiness (A, B), style |
| N5 | Verification Plan gaps | Nit | readiness (A), codebase-details, style |
| N6 | HTTP error handling and the SEC contact string | Nit | readiness (A, B), style, codebase-details |
| N7 | Phase bookkeeping | Nit | readiness (B), style |
| N8 | Two modules claim one rule | Nit | style |
| N9 | Words with more than one meaning; approximate wording | Nit | style |
| N10 | Internal shorthand | Nit | style |
| N11 | Small rule details | Nit | readiness (B) |

---

## Prioritized Findings (Blockers -> Major -> Nits)

### B1. The raw store keeps no record of what each stored file is - Severity: Blocker
* **Reviewer Lens:** `egm-implementation-readiness` (A), `egm-codebase-details`, `egm-style`
* **Affected Scope:** `Lines 1121–1125` (item 5), line 1256 (raw-store test), lines 1333 and 1345 (item 17 `filings` and `run_inputs`), line 1573 (item 38). Feature part: lines 264, 375, 390.
* **Discrepancy Description**:
  * **The labels go nowhere.** `put(bytes, url, source, status)` takes an address, a source and a status, but nothing stores them.
    * Phase 0 has no database.
    * The Phase 1 schema has no table linking a download to its hash. `run_inputs(run_id, raw_hash)` has no address or label, and `filings` has no hash.
    * `articles` and `prices_daily` carry `raw_hash`. Company facts, submissions, filing documents, FRED, Alpha Vantage and the holdings file don't.
  * **Three things need that link:**
    * replay, which must know which stored file answered which request (line 390);
    * the SEC client skipping files it already holds, which the 50-request repeat limit depends on (line 1231);
    * edgartools reading only stored files (line 1133).
  * **No run ID.** "Counts bytes stored per run" (line 1123) needs a run ID, which `put` doesn't receive.
  * **The hash input is ambiguous.** Line 1121 reads as hashing after compression.
    * Compressed output can differ for the same content. Gzip, for example, writes a timestamp unless told not to. That would break the test at line 1256 ("writing the same content twice gives one file").
    * No compression format is named.
  * **Error responses.** It's unclear whether they are stored. `put` takes a status, but line 1114 says non-200 responses are "never passed on as data".
  * **Why Blocker:** Goal 2 requires every official prediction to be replayable. That needs this mapping from the first prediction, and it can't be added afterwards for predictions already logged. The builder would also have to design the first migration's core table.
* **Rationale & Recommendation**:
  * **Tables.** Add:
    * `raw_objects(raw_hash PK, url, source, http_status, content_type, fetched_at, size, stored_size)`;
    * `fetch_log(run_id, request_key, raw_hash, fetched_at)`, or add `request_key` and `source` to `run_inputs`.

    Replay joins through these.
  * **Lookup.** Add `rawstore.latest(url) -> hash | None` for the SEC client's skip rule (M8).
  * **State in item 5:**
    * the hash is SHA-256 of the uncompressed bytes;
    * compression is stdlib gzip with a fixed timestamp;
    * `put` takes `run_id`;
    * only 200 responses of the expected content type are stored.
  * **Phase 0.** It has no database. Either move a minimal first migration into Phase 0 (these tables plus `tool_versions`, see M14), or keep a small index file there and say so.
  * **Tests:**
    * lookup by address;
    * re-fetching unchanged content gives the same hash and no new file.

### B2. Valuation can't be built "exactly as specified in §8" - Severity: Blocker
* **Reviewer Lens:** `egm-implementation-readiness` (B), `egm-codebase-details`
* **Affected Scope:** line 1039; line 1299 (`valuation.yaml`); line 1305 (`fred.yaml`); `Lines 1437–1444` (item 27). Feature part: `Lines 477–496`.
* **Discrepancy Description**: Line 1039 says the method's numbers are set in §7 and §8, and item 27 says "exactly as specified". §8 leaves these open:
  * **Terminal growth.** Only a ceiling is given ("no higher than the 10-year Treasury yield", line 479), not the rate. No FRED series ID is given for the yield; `fred.yaml` names series by description only.
  * **Stage 1:**
    * Is revenue growth held flat at the capped 3-year rate for years 1–5?
    * The margin "moves toward" the peer median (line 477). How fast, and does it get there?
  * **Tax:**
    * no rate is given for operating profit or for the after-tax cost of debt (line 482);
    * it isn't said whether the lease-cost add-back (line 480) comes before or after tax.
  * **Residual income:**
    * after the 10-year fade (line 486), is there a continuing value, or none?
    * how does book value move forward each year (what payout is assumed)?
  * **Peer multiples:**
    * how do the P/E value and the EV/EBIT value become one method value (lines 489–490)?
    * are negative-earnings peers dropped before or after the 10% trims (lines 490–491)?
  * **Banks, insurers and REITs:**
    * no rule says how a company is classed as one (lines 495–496);
    * "REIT peers" isn't defined when the sector group also holds non-REITs.
  * **Why Blocker:** these choices set every value gap. That sets every rating, range and trigger price on write-once predictions, so two builders would produce different ratings.
* **Rationale & Recommendation**: Add each value to §8 and `valuation.yaml` before item 27 starts. The reviewers suggest these defaults for Liam to accept or change:
  * terminal growth = the lower of 2.5% and the latest 10-year yield (for example FRED `DGS10`);
  * stage-1 growth flat at the capped rate, with the margin moving in a straight line to the peer median by year 5;
  * tax = the effective rate, clamped to 0–30%, or 21% when it's undefined;
  * residual income = a 10-year horizon, then zero excess return;
  * the peer-multiples value = the mean of the valid P/E and EV/EBIT values, with negative-earnings peers dropped before trimming;
  * banks, insurers and REITs identified by SIC lists in `peers.yaml` (for example 6798 for REITs);
  * REIT peers = the S&P 500 REITs.

  Add a test for each in `test_valuation.py`.

### M1. Metric formulas and the percentile method are undefined - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness` (B)
* **Affected Scope:** line 1424 (item 25); `Lines 1432–1434` (item 26). Feature part: `Lines 407–417`, 438, 453, 461.
* **Discrepancy Description**:
  * **No formulas.** §7's table names the metrics but gives no formulas. Undefined:
    * return on invested capital;
    * free cash flow (after stock-based compensation, as the DCF says at line 476?);
    * enterprise value (are leases, minority interest and preferred stock included?);
    * EBITDA, interest coverage, accruals, net issuance and earnings yield;
    * average or ending balances;
    * trailing 12 months or fiscal year.
  * **No percentile formula.** Ties and inclusive or exclusive ranking aren't defined, yet ratings turn on "at or above the 60th" across 15–41 values.
  * **Reference sets differ by use, and some aren't stated:**
    * the gap percentile leaves the company out (line 438);
    * the score includes it (line 416);
    * for the peer mix (line 453), it isn't said what each peer is ranked against.
  * **No interpolation rule.** Trigger prices need "the peer value gap at the Buy line" (line 461), which falls between ranked values.
  * **Empty factors.** No rule covers a factor with no valid metrics. This is common for banks, where gross profit ÷ assets, EV/EBIT and net debt ÷ EBITDA don't apply.
* **Rationale & Recommendation**:
  * **Metric table.** Add a metric-definitions table to §7: formula, XBRL inputs, period and direction, plus which metrics are skipped for financial companies.
  * **Percentile formula.** State one, for example (number below + 0.5 × ties) ÷ n, with the reference set for each use.
  * **Interpolation.** State the rule for line values.
  * **Empty factors.** State that a factor with no valid metrics passes its weight to the other factors.

### M2. The risk-factor red flag has no measure or threshold, and the red-flag phrase rules are unlisted - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness` (B), `egm-codebase-details`, `egm-style`
* **Affected Scope:** line 1039; line 1298 (`bands.yaml`); line 1410 (`compare.py`); line 1425; `Lines 1592–1597` (`test_flags.py`). Feature part: `Lines 456–459`.
* **Discrepancy Description**:
  * **No threshold value.** Line 1298 says `bands.yaml` holds "the risk-factor change threshold", and §7 says "above the threshold in the rating-lines file" (line 459). No value is given anywhere in the document.
  * **No measure.** `compare.py` "matches each paragraph to its closest paragraph" and scores "the share of text that is new or removed" (line 1410). None of these is given:
    * the similarity measure;
    * the minimum score for a match;
    * the unit (words, characters or paragraphs);
    * what the share is divided by.
  * **Unlisted phrase rules:**
    * the going-concern negation patterns (line 458);
    * the "not effective" match for Item 9A (line 457).
  * **Impact.** Each rule caps official ratings at Hold, and the `test_flags.py` cases can't be written without them.
* **Rationale & Recommendation**: In §7:
  * **Similarity.** Name the measure and the match cut-off, for example the `difflib.SequenceMatcher` ratio on normalized words, with a match at 0.8 or above.
  * **Change score.** Words in unmatched paragraphs in both years ÷ words in both years' section.
  * **Threshold.** Set its value as a drafter default in the rating-lines file, checked on the golden set.
  * **Phrase rules.** List the negation and Item 9A patterns as regexes, with a test for each.

### M3. Peer selection needs a sector map and market values that no item supplies - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness` (B), `egm-codebase-details`, `egm-style`
* **Affected Scope:** lines 1058, 1231, 1233, 1300, `1362–1365`, `1416–1418`, 1434. Feature part: lines 190, `400–403`, 346.
* **Discrepancy Description**:
  * **The groups aren't listed.** The 11 sector groups and the SIC ranges for each are never given (line 1300; §7 line 400).
    * "For example" leaves the override list open.
    * "Parent group" (line 401) has no meaning if the 11 groups are already top-level sectors.
  * **Ranking needs data nobody fetches.** Ranking "the 40 largest members by market value" (line 1416) needs a market value for every member of the sector group, often 60–80 companies, before the 40 are known.
    * Item 24 fetches facts and prices only for the chosen peers.
    * Item 18 keeps only the ticker and CIK from the holdings file.
    * The Phase 0 SEC and Massive budgets (lines 1231 and 1233; §5 line 346) assume 40 companies.
  * **Which group?** "Re-ranked as a percentile within the group" (line 1434) could mean the sector group or the peer group.
  * **Replacements.** No rule says whether a stale or unvalued peer is replaced by the 41st largest.
* **Rationale & Recommendation**:
  * **Ranking source.** Name it. The simplest is to store each holding's market value or weight from the ETF holdings file in `sp500_membership` and rank on that. Note that it is float-adjusted, and confirm in Phase 0 that the column exists.
  * **`peers.yaml`.** List the 11 groups with their SIC ranges and the full override list, drafted in Phase 1 and approved by Liam.
  * **Parent groups.** Delete them, or name each group's parent.
  * **Line 1434.** Say "within the peer group (the company plus its peers)".
  * **Replacements.** State the rule.

### M4. The S&P 500 list source is not chosen, its Phase 0 check doesn't exist, and it is missing from the outside services table - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness` (B), `egm-codebase-details`, `egm-style`
* **Affected Scope:** `Lines 1358–1365` (item 18). Feature part: line 189, `Lines 617–627`, line 979.
* **Discrepancy Description**:
  * **Not chosen or checked.** The decisions table still leaves IVV or SPY open, with "terms checked in Phase 0" (line 189). None of the Phase 0 tests (lines 1220–1247) checks the file's terms or format.
  * **Missing from the privacy list.** The issuer's site isn't in §12's outside services table. Line 617 calls that table "the only list", and the README and Settings screen copy it (Goal 7, line 979).
  * **Parsing is open:**
    * SPDR's file is a spreadsheet, which would need a reader such as `openpyxl`. That isn't a listed dependency (confirm in Phase 0).
    * Holdings files include cash and futures rows.
    * "About 500 rows" has no accepted range.
  * **Refresh and fallback.** Nothing triggers the daily refresh, and no script builds `sp500_bundled.csv`.
* **Rationale & Recommendation**:
  * Choose one issuer and give the file's address.
  * Add a terms-and-format check to item 12, and add a row to the §12 table.
  * **Parsing rules for item 18:**
    * skip the lines before the header;
    * keep equity rows only;
    * accept 495–510 equity rows, each matched to a CIK.
  * **Refresh:** at the start of a run, if the stored copy is more than a day old.
  * **Fallback file:** add `scripts/build_sp500_bundled.py`.

### M5. Price history, momentum scaling and "stale" can't be computed as written - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness` (A, B), `egm-codebase-details`, `egm-style`
* **Affected Scope:** lines 1372, 1374, 1434, 1584. Feature part: lines 342, 344, 348, 418.
* **Discrepancy Description**:
  * **SPY history is too short.** Momentum scaling compares SPY's 1-month volatility with "its own last 2 years" (lines 342 and 418). But a first run fetches only 14 months of SPY (lines 344 and 1372), and first runs can log official predictions.
  * **Undefined terms.** "1-month volatility" and "top fifth" aren't defined: the window length, whether it is annualized, and which rolling series is ranked.
  * **No calendar.** "Stale" means "more than one trading day old" (lines 1374 and 348), but no trading calendar, holiday source or time zone is named. Counting weekdays would mark prices stale after every market holiday. That would withhold sections 1–3 and the rating.
* **Rationale & Recommendation**:
  * **History.** Fetch SPY for 2 years plus 1 month, and change §5 line 344 to match. This should fit Massive's free history, believed to be 2 years; confirm in Phase 0.
  * **Definitions.** Define:
    * 1-month volatility, for example the standard deviation of the last 21 daily log returns × √252;
    * the top fifth, for example at or above the 80th percentile of that rolling series over the last 504 trading days.
  * **Calendar.** Name the source, for example `exchange_calendars` or Massive's market-holidays data (confirm in Phase 0).
  * **Staleness rule.** Prices are current when the latest stored close is from the last completed NYSE session before the run time (US Eastern).

### M6. The Massive Phase 0 test contradicts §5, counts bars only, and the fast path has no owner - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness` (A, B), `egm-codebase-details`, `egm-style`
* **Affected Scope:** `Lines 1232–1234` (item 12); line 1371 (item 19). Feature part: lines 300, `345–346`, 983.
* **Discrepancy Description**:
  * **The test fails by design.** It times a first-sector fill "through the summary if available", with a pass mark of 20 minutes (lines 1233–1234). But §5 says filling through the summary takes about 295 calls, about an hour (line 345).
  * **Bars only.** Item 19 needs unadjusted bars, splits and dividends (line 1371), but the §5 estimate (about 41 calls, line 346) counts bars only. If splits and dividends are separate calls per ticker (an assumption to confirm), the first fill is roughly three times larger. The 20-minute first-report goal (line 983) depends on this.
  * **The fast path has no owner.** §5 describes a one-time background backfill, then one call per trading day. Nothing gives it:
    * a command;
    * a trigger;
    * a rule for running alongside a report, given "only one run happens at a time" (line 300).
  * **Endpoint.** The summary is named only as "all-stocks daily summary".
* **Rationale & Recommendation**:
  * **Split `massive.py` into three records:**
    1. **First-sector fill, ticker by ticker.** Bars, splits and dividends for the company and 40 peers, with calls per endpoint and minutes taken. Pass: 20 minutes or less.
    2. **The summary.** Whether the free key can call it, and the projected backfill time. Recorded only, not pass/fail.
    3. **SPY.** The earliest date available.
  * **Endpoints.** Name them, and confirm in Phase 0.
  * **Backfill.** If the summary is available, give item 19 a `prices-backfill` path with its trigger, and say that it waits behind any report.

### M7. Which share class is rated, and how tickers are spelled per source, are open - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness` (B)
* **Affected Scope:** lines 1331, 1337, 1352, 1390, 1400, 1629. Feature part: lines 263, 340, 545.
* **Discrepancy Description**:
  * **Which class?** Each prediction stores one `share_class` (line 1352), but nothing says:
    * which class is rated for Alphabet or Berkshire;
    * in which class's price units the value, range and trigger prices are stated.

    The golden set includes GOOGL and BRK.B (line 1629).
  * **Format.** The format of `share_class` values is open.
  * **Ticker spellings may differ by source.** SEC may use `BRK-B` and Massive `BRK.B`. Alpha Vantage and the holdings file may differ again. All of these are assumptions to confirm.
* **Rationale & Recommendation**:
  * **Rated class.** State the rule, for example the class with the largest index weight. Per-share values are in that class's units, converted with the conversion ratio.
  * **Spellings.** Store one canonical ticker form as `share_class`, and add a per-source ticker map with tests.

### M8. The SEC Phase 0 test fetches more than a real run, and the SEC client has no re-download rule - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness` (A), `egm-style`
* **Affected Scope:** line 1131 (item 6); `Lines 1229–1231` (item 12). Feature part: line 264; Goal 5 (line 79).
* **Discrepancy Description**:
  * **Over-fetching.** Line 1229 fetches "listed peers' XBRL facts and filings". §3 step 2 (line 264) fetches XBRL facts for every peer, but filings only from the 3 largest peers.
    * Read literally, the test fetches filings for 40 peers.
    * That inflates the count against the 300-request pass mark.
    * It could trigger the bulk-data alternative (A9) for the wrong reason.
  * **What is counted.** Not stated:
    * whether the limits apply per ticker or across all 5;
    * whether each "first run" starts from an empty store. Overlapping peers would make later first runs look cheap.
  * **No re-download rule.** Item 6 doesn't say which downloads repeat each run.
    * Filing documents never change; the ticker list, submissions and company facts do.
    * With "fresh every run" (Goal 5), re-fetching 41 company-facts files plus submissions is about 43 requests before anything else.
    * So the repeat limit of 50 depends on a rule nobody has written.
* **Rationale & Recommendation**:
  * **Line 1229.** Rewrite it to match §3 step 2.
  * **Item 12:**
    * the limits apply per ticker;
    * each first run starts from an empty raw store;
    * `inputs.yaml` names 5 tickers from 5 different sectors.
  * **Re-download table for item 6, for example:**
    * the ticker list: once a day;
    * submissions and company facts: every run;
    * filing documents: never again, using B1's index;
    * Form 4: new filings only.

### M9. How edgartools reads from the hash-named raw store is unspecified, with no fallback - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness` (A, B), `egm-codebase-details`
* **Affected Scope:** lines 1058, 1066, 1133, 1264, 1396, 1406. Feature part: line 458.
* **Discrepancy Description**:
  * **No route from the store to edgartools.** Item 6 says edgartools' own downloading "is switched off; the exact setting is confirmed in Phase 0" (line 1133), and `test_sec.py` checks that it makes no requests (line 1264).
    * But the plan never says how edgartools finds stored bytes in a folder of files named by hash.
    * If its offline mode expects a local folder laid out like SEC's own paths (an assumption), the raw store can't feed it directly.
  * **No fallback** if no such setting exists. Stage 8 noted this under Stage 5 #5, and it is still open.
  * **Unlisted files.** The SEC files edgartools needs for the section split, Exhibit 13 and XBRL standardization aren't listed.
    * If standardization (line 1396) needs each filing's XBRL rather than the company-facts JSON (an assumption), item 6 needs extra downloads for 41 companies.
    * The Phase 0 request count would then measure the wrong set.
  * **Auditor's report.** The going-concern flag relies on edgartools isolating the auditor's report (line 1406), which isn't a numbered 10-K Item (an assumption to confirm).
* **Rationale & Recommendation**:
  * **Phase 0 check.** Add a step with a pass mark to `scripts/phase0/sec.py`. With the network blocked, edgartools must produce these from stored files only:
    * Items 1, 1A, 7 and 9A;
    * the auditor's report;
    * a standardized income statement.
  * **Integration route.** Name it, in this order of preference:
    1. route edgartools' fetches to a function that serves files from the raw store;
    2. write the run's stored files into edgartools' local folder layout;
    3. pass HTML or XML strings to it directly.
  * **File list.** In item 6, list the exact SEC files needed for each form.

### M10. The usage test can't be scored - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness` (A), `egm-style`
* **Affected Scope:** `Lines 1235–1240` (item 12). Feature part: `Lines 278–283`; glossary line 1027.
* **Discrepancy Description**:
  * **Which plan?** "The Pro plan" (line 1239) is Anthropic's plan (glossary, line 1027). No plan is named for Codex, and ChatGPT also has a plan called Pro.
  * **No measurable inputs or pass mark:**
    * "fits" has no number;
    * "narration-sized call" has no input size;
    * "3 of the tickers" isn't fixed, and small filers would flatter the result.
  * **No call mix.** The test "projects a full report from the call estimate in §3", but §3 gives a range of totals (30–45), not a mix of call types.
  * **No fallback.** "Where one is visible" gives no method for a tool that shows no usage reading.
* **Rationale & Recommendation**:
  * **Projection:** average usage per call type × a stated first-report mix at the top of the range (45 calls).
  * **Inputs:**
    * the narration call uses section 4's real input;
    * the sample is the 3 largest filers in `inputs.yaml`.
  * **Measurement:** read each tool's usage screen before and after, with no other use in between. Name the screens in Phase 0. If a tool shows no reading, record tokens only and mark it "not measurable".
  * **Pass:** a first report uses no more than a stated share of one 5-hour window, for example 50%, on Claude Pro and on Liam's ChatGPT plan (named in the test).

### M11. The lock-down check doesn't test what §4 requires, and leaks can't be detected - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness` (A), `egm-codebase-details`, `egm-style`
* **Affected Scope:** `Lines 1220–1228` (item 12); line 1805. Feature part: `Lines 327–333`.
* **Discrepancy Description**:
  * **Two §4 checks are missing.** §4 checks that "the tool reports its model" (line 330) and that "no user hooks, tool servers or instruction files load" (line 331). Item 12 only records model IDs (line 1227), and it has no pass condition for hooks or tool servers.
  * **The marker tests only Claude Code.** The marker goes only in a `CLAUDE.md` file (line 1221).
    * Codex's instruction file is probably `AGENTS.md` (confirm in Phase 0), so the Codex half of "no instruction files load" tests nothing.
    * The marker sits in "the call's parent folder". For a new temporary folder, that is the shared system temp folder.
  * **Leaks can't be detected:**
    * "No file contents" has no detection method. Comparing answers with the real `~/.ssh` would mean reading Liam's keys.
    * The prompt-injection test (line 1805) has no detection rule either.
  * **No field for the sign-in.** "Subscription sign-in in use" names no field to check for either tool.
  * **Short form.** "The first 5 of the same calls, with the same pass rules" (line 1228): "19 of 20 schema-valid" has no literal meaning for 5 calls.
* **Rationale & Recommendation**:
  * **Folders and markers.** Create per-call folders under `$TMPDIR/tearsheet-calls/<uuid>/`. Put both a `CLAUDE.md` and an `AGENTS.md` marker in `$TMPDIR/tearsheet-calls/`.
  * **Bait files.** Plant files holding random tokens, for example `$TMPDIR/tearsheet-calls/canary.txt` and a fake key under `~/.tearsheet-canary/`. Pass when no token appears in any answer and nothing matches a private-key pattern.
  * **New pass conditions:**
    * no tool servers reported at session start;
    * a model ID reported;
    * the sign-in confirmed on a named field for each tool (named in Phase 0).
  * **Short form:** 5 of 5 schema-valid.
  * **Injection test.** Plant a unique phrase plus an instruction to include it. Pass when the phrase appears nowhere in the report and no surviving claim cites the planted paragraph.

### M12. The link search's own web search counts as a forbidden tool use - Severity: Major
* **Reviewer Lens:** `egm-codebase-details`
* **Affected Scope:** lines 1139, 1158, `1171–1172`, `1187–1188`. Feature part: lines 305, 318.
* **Discrepancy Description**:
  * **The exception isn't carried through.** §4 makes web search the one exception to the lock-down rule (line 305). But the rule for every call says "any attempt to use a tool counts as a failure" (line 318), and item 8's rejected failures (line 1158) make no exception.
  * **Claude Code.** Web search is allowed (line 1171), but the permission callback "denies everything" (line 1172). Whether an allowed tool still reaches that callback isn't settled (an assumption to confirm).
  * **Codex.** "Any command, file-change or tool event counts as `AIToolAttempt`" (line 1187), yet web search is on for the link-search thread (line 1188). Whether a web-search event counts as a "tool event" is open.
  * **Effect.** Read as written, every link-search call fails as a tool attempt and triggers the short lock-down check.
  * **Untested.** The lock-down check never tests the one configuration that has a tool turned on.
* **Rationale & Recommendation**:
  * **Items 8–10.** State that on calls with `allow_web_search=True`:
    * only web-search events are allowed;
    * the event or tool is named for each AI tool, including whether web fetch counts as web search;
    * every other event is still an `AIToolAttempt`;
    * the permission callback allows web search on those calls only.
  * **Lock-down check.** Add a set of link-search-mode calls with planted instructions. Pass when only web-search events appear.

### M13. Connector lock-down settings are named by intent, and Codex still loads the user's own setup - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness` (A), `egm-codebase-details`, `egm-style`
* **Affected Scope:** `Lines 1171–1179` (item 9); `Lines 1184–1195` (item 10). Feature part: `Lines 305–315`. Guide: `/Users/liamblackshaw-brown/code/Tearsheet/docs/references/local-cli-guide.txt` lines 120, 161–163, 214, 219.
* **Discrepancy Description**:
  * **Claude Code: "allowed tools" may not hide tools.** "Allowed tools: none" (line 1171) may mean "pre-approved" in the Agent SDK, not "offered to the model" (an assumption to confirm). If so:
    * the model is still offered tools;
    * the callback denies them;
    * planted text in filings then causes repeated `AIToolAttempt` failures in real runs.
  * **Claude Code: option spelling.** `settingSources: []` (line 1173) is the TypeScript spelling from the guide, but item 9 is a Python module. The Python name is likely `setting_sources` (confirm in Phase 0).
  * **Claude Code: possible sign-in loss.** The guide says this option also drops sign-ins stored in `settings.json` (lines 161–163). The plan doesn't mention it.
  * **Claude Code: fallback flags.** The direct-`claude` fallback (line 1179) names no flags.
  * **Codex: user setup still loads.** §4's rule is "only our own instructions" and no tools (line 305). But:
    * the guide says `codex app-server` loads tool servers (MCP servers) from the user's `~/.codex` config (line 219);
    * Codex also reads its own instruction files;
    * item 10 has nothing like `settingSources: []` to stop this.
  * **Codex: environment not cleaned.** Item 10 has no environment allowlist (item 9 has one, at line 1174), so an `OPENAI_API_KEY` in Liam's environment isn't handled.
  * **Codex: isolation is a real design choice.** Moving Codex to an empty `CODEX_HOME` (guide, line 120) would also move its sign-in.
  * **Codex: approval policy unnamed.** "An approval policy that asks before every command" (line 1185) names no value.
    * If the available values let read-only commands run without asking (an assumption), a read-only sandbox still lets the model read `~/.ssh`.
    * The stream check (line 1187) only notices afterwards, once the data has gone to OpenAI.
  * **Codex: missing protocol rule.** Item 10's protocol rules leave out the guide's note that every error uses code -32600 (line 214). This matters for mapping errors.
* **Rationale & Recommendation**:
  * **Item 9:**
    * "Tools offered to the model: none (web search only when `allow_web_search=True`). Phase 0 confirms which SDK option removes tools from the model's list."
    * "User settings off: the Python option, confirmed in Phase 0."
    * Name the fallback's flags.
  * **Item 10.** Name these, all confirmed in Phase 0:
    * the approval-policy value;
    * the sandbox value;
    * the override that turns off tool servers and user instruction files.
  * **Item 10, also add:**
    * an environment allowlist that drops `OPENAI_API_KEY` unless API billing was chosen;
    * a pass condition that a planted file read produces an approval request (which is denied), and never a completed command;
    * the -32600 rule.
  * **If Codex can't be isolated,** say so explicitly and state the fallback. For example, the Connections screen shows Codex as "not usable with Tearsheet".

### M14. The lock-down gate has nowhere to keep its state, and AI failures inside a run are under-specified - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness` (A, B), `egm-codebase-details`, `egm-style`
* **Affected Scope:** `Lines 1156–1165` (item 8); lines 1190, 1227, 1355, 1532, 1567, 1804. Feature part: `Lines 287–293`, lines 300, 327, 334.
* **Discrepancy Description**:
  * **Gate state.**
    * Phase 0's `lockdown-check` stores tool versions (line 1227), but the database only arrives in Phase 1 (items 16–17).
    * `tool_versions(tool, version, lockdown_checked_at)` (line 1355) has no pass/fail, no "last call was a tool attempt" flag and no model IDs. So an engine restart clears the block.
    * It isn't said whether the engine reads `<bin> --version` itself, given that Electron owns tool detection (line 1567).
  * **Gate timing.**
    * Item 8 checks "before the first call in a run" (line 1165), but §3 says the check runs "before the next AI step" after a tool attempt (line 293).
    * So after a mid-run attempt, queued calls (3 in parallel) go on unchecked.
    * Line 1804 leaves out the tool-attempt trigger.
    * There is no outcome for a short check that fails mid-run, and nothing says whether it then re-runs at every report start (5 calls each time).
  * **Error classification.**
    * Only Codex's `relogin` error is mapped (line 1190).
    * Nothing says what signal from either tool means "usage limit", where the reset time comes from, or what counts as a temporary error.
    * No Phase 0 step records these signals.
  * **Retries.** The failure table's "retries once after 30 seconds" (line 291) has no home: `client.py` or `pipeline.py`?
  * **Steps with many calls.** For a step such as extraction, line 291 ("marks the step failed") and line 292 ("that section fails") conflict.
  * **Run states.** `runs.status` values aren't listed. A run left "running" after a crash could block "one run at a time" (line 300).
* **Rationale & Recommendation**:
  * **Table.** Create `tool_versions(tool PK, version, model_ids_json, lockdown_form, lockdown_passed, lockdown_checked_at, blocked_reason, blocked_at)`, in Phase 0 with B1's early migration. The engine runs `<bin> --version` itself.
  * **Gate rule in item 8:**
    * set the gate on a version change or on any `AIToolAttempt`;
    * while it is set, no new AI call starts;
    * then the short check runs; on a pass, clear the gate;
    * on a fail, end the AI steps with `run_failed` code `LOCKDOWN_FAILED` and keep the finished steps;
    * the tool stays blocked until a manual `lockdown-check` passes.
  * **Error table in item 8.** Unknown errors map to `AIUnavailable`. Back it with Phase 0 fixtures of each tool's signed-out and usage-limit output.
  * **Retries.** Put the 30-second retry in `client.py`.
  * **Many-call steps.** One failed call drops only its source or section, which is listed in the report.
  * **Run states.** List them. At startup, mark orphaned "running" runs as interrupted and resumable.

### M15. The engine's concurrency model isn't chosen - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness` (A)
* **Affected Scope:** line 1047 (Tooling defaults); `Lines 1104–1109`; lines 1156, `1184–1185`, 1195, 1535, `1562–1566`.
* **Discrepancy Description**:
  * **What the engine must do at once:**
    * run 3 AI calls at a time, each with a time limit (line 1156);
    * keep a rate limiter for each service (lines 1104–1109);
    * keep reading `codex app-server`'s output while it serves several threads (lines 1184 and 1195);
    * read `cancel` from standard input while a run is going (lines 1535 and 1562–1566).
  * **No model chosen.** The plan never says whether this uses threads or asyncio. The Python Agent SDK's `query` streams its messages asynchronously (an assumption to confirm).
  * **Risk.** Separate sessions building items 4, 8, 9, 10 and 37 could each choose differently, and the pieces wouldn't fit together.
* **Rationale & Recommendation**: Add a Tooling-defaults row, for example:
  * asyncio throughout, with `httpx.AsyncClient`;
  * `asyncio.Semaphore(3)` for parallel calls, and `asyncio.wait_for` for the 5-minute limit;
  * one async rate limiter per service;
  * `asyncio.create_subprocess_exec` for `codex app-server`, with separate readers for standard output and standard error;
  * synchronous code only in the calculation modules.

### M16. The AI call plan and the call budget can't be implemented as written - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness` (A, B), `egm-codebase-details`
* **Affected Scope:** line 1096; `Lines 1494–1496`; `Lines 1523–1524`; line 1533. Feature part: line 273, `Lines 280–283`, `596–597`.
* **Discrepancy Description**:
  * **Narration calls.**
    * Their number isn't stated: one per section, or one for all sections except section 7? That number drives the 30–45 call estimate and the Phase 0 "narration-sized call".
    * Which sections the AI writes isn't stated; sections 1–3 and 9 are mostly code output.
  * **Skeptic inputs.** What the skeptic receives isn't stated. Two checklist items need the rating and all the evidence items (lines 587 and 589).
  * **Budget accounting:**
    * When is the budget projected? The article count must be set before extraction.
    * What counts against the 50 calls: retries, the automatic 5-call lock-down check, re-checks after rewrites, extraction chunks?
    * What happens if the run is still over budget after both cuts? No error type exists for it.
  * **Rewrites.** It isn't said what a rewrite receives, or whether removals before a rewrite count in the direction split.
* **Rationale & Recommendation**:
  * **Call-plan table in item 34:** step, number of calls, inputs and model.
  * **Projection.** Define the projected-call formula, computed once before step 9.
  * **Budget rules:**
    * every call sent counts, including retries;
    * the lock-down check is logged but not counted;
    * add an `AIBudgetExhausted` error, raised before a call would exceed 50, which ends the run as "narrative incomplete".
  * **Rewrites.** State what a rewrite receives and how removals are counted.

### M17. The narration output contract is undefined - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness` (B), `egm-codebase-details`
* **Affected Scope:** `Lines 1202–1204` (item 11); line 1484 (`narrate.md`); `Lines 1495–1499`; line 1522 (`quotes.py`). Feature part: lines 273, 521, 575.
* **Discrepancy Description**:
  * **Section keys and sentence IDs.** `SectionDraft` holds "section key and sentences" (line 1203), but:
    * the section keys, including What to watch, aren't listed;
    * nothing says who assigns the sentence IDs that `SkepticFinding` (line 1204) and `claims` rely on.
  * **Quoted values can't be referenced.** `narrate.md` allows only `{{metric:name}}` placeholders (line 1484), but render also fills "values parsed from verified quotes" (line 1498). `QuotedValue` (line 1202) has no ID or value field, so a sentence can't point to a parsed quote.
  * **Open cases:**
    * the full placeholder namespace (metrics only, or also valuation values, prices, triggers, dates and the consensus?);
    * what happens to a sentence with an unknown placeholder;
    * how exactly a quote must match its paragraph (spacing, curly quotes, dashes, case);
    * which number to take from "raised to $250 from $230".
  * **Why it matters.** Quotes are the only path for AI-sourced numbers, so a wrong parse is a confirmed error under Goal 1.
* **Rationale & Recommendation**:
  * **Section keys.** List them.
  * **Sentence IDs.** Code assigns `sentence_id = <section>.<n>` after narration.
  * **Placeholders.** Publish the namespace, for example `metric:`, `value:`, `price:` and `quote:<id>`, with a formatting rule for each type.
  * **Quoted values.** Add `id` and `value_text` (a substring of the quote) to `QuotedValue`, and parse only `value_text`.
  * **Rejections:**
    * reject quotes whose value is ambiguous;
    * remove sentences with unknown placeholders.
  * **Matching.** State how text is normalized before the containment check.

### M18. The numeric guard's word and pattern lists are not defined - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness` (B), `egm-style`
* **Affected Scope:** line 1306 (`names.yaml`); lines 1499, 1520; `Lines 1600–1602`. Feature part: `Lines 573–580`.
* **Discrepancy Description**:
  * **Number words.** They are only illustrated ("doubled," "a third," "twenty"). It isn't said whether "third quarter", "first", "Q3", "FY24", "mid-single-digit" or "half" are blocked.
  * **Year context.** It isn't defined.
  * **Product names.** The capitalized-name rule doesn't say how it handles names like "iPhone 15".
  * **Line 1499.** It says render rejects "other digits", which leaves out number words.
  * **Impact.** These rules decide which sentences survive, and the tests at lines 1600–1602 need them.
* **Rationale & Recommendation**:
  * Put the blocked-word list, the allowed year and quarter patterns (as regexes) and the name-token rule in `names.yaml` or §11.
  * List the expected allow and block cases in the tests.
  * Change line 1499 to "calls `verify.numeric_guard` (§11)".

### M19. The citation check in item 33 is looser than §11 - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness` (B)
* **Affected Scope:** line 1521 (`citations.py`); line 1603. Feature part: lines 514, 581.
* **Discrepancy Description**:
  * **Peer filings anywhere.** Item 33 accepts "this company's filings, this run's peer filings or this run's articles" (line 1521). §11 allows peer filings in section 8 only (line 581), and the item drops that limit.
  * **Articles anywhere.** Nothing keeps article citations to section 7, where §9 keeps article text (line 514).
  * **Any old filing.** "This company's filings" accepts a paragraph from any filing ever stored.
* **Rationale & Recommendation**:
  * **Rule.** Every cited ID must be among the paragraph IDs sent to the narration call that wrote the sentence.
  * **Tests:**
    * a peer citation outside section 8;
    * a citation of an older filing.

### M20. Escaping and Markdown conversion have no order, and the result contradicts the safety test - Severity: Major
* **Reviewer Lens:** `egm-style`, `egm-codebase-details`, `egm-implementation-readiness` (B)
* **Affected Scope:** lines 1075, 1500, 1714, 1806. Feature part: lines 634, 639.
* **Discrepancy Description**: Line 1500 says "All AI and source text is escaped; any Markdown is converted with `markdown-it-py` and cleaned with `nh3`."
  * **Order.**
    * If everything is escaped first, no Markdown is left to convert.
    * If conversion comes first, the cleaned HTML has to bypass the template's escaping. Which text takes which path is the security decision, and the sentence leaves it to the builder.
  * **Missing settings:**
    * for `markdown-it-py`: whether raw HTML and links are allowed;
    * for `nh3`: the tag allowlist;
    * whether Jinja autoescape is on.
  * **Contradiction.** The test at line 1714 expects HTML and a `javascript:` link to "appear as plain text". Converted Markdown would not be plain text.
* **Rationale & Recommendation**: Choose one of these:
  * **Escape only,** and drop `markdown-it-py`.
  * **Two paths, stated exactly:**
    * source text (quotes, titles, URLs) is escaped by Jinja2 with autoescape on, and never rendered as Markdown;
    * AI sentence text goes through `markdown-it-py` with raw HTML off, then through `nh3` with a stated tag allowlist that leaves out `a`;
    * only that cleaned output is marked safe in the template.

  Then rewrite the test's expected result to match.

### M21. Report links, the sandboxed frame and the flag and re-read actions have no defined contract - Severity: Major
* **Reviewer Lens:** `egm-style`, `egm-codebase-details`, `egm-implementation-readiness` (B)
* **Affected Scope:** lines 1215, 1268, 1289, 1470, `1507–1508`, `1652–1655`, 1706, 1714. Feature part: lines 250, 326, 635.
* **Discrepancy Description**:
  * **Citation links have two targets.** They "link to the filing on SEC's site or to the original article" (line 1507). But "citation and 'flag this claim' links use the `tearsheet:` address" (line 1508).
    * No engine request handles a citation click.
    * The `tearsheet:` address format isn't defined.
  * **No note box.** `flag_claim` needs a note (line 250), but nothing collects one when a link is clicked.
  * **No re-read action.** "Re-read this filing" (lines 326 and 1470) has no request, link, bridge call or command.
  * **Terminal mode doesn't work.** Goal 1 runs in terminal mode (lines 1268 and 1289), but there:
    * `tearsheet:` links do nothing in a browser;
    * the HTML shows no claim IDs, so `tearsheet-engine flag` can't name a claim;
    * `run` names no output path.
  * **The frame isn't specified.** None of these is stated:
    * how the HTML gets into the frame (for example `srcdoc`);
    * the `sandbox` value;
    * the content-security-policy strings;
    * which Electron event catches a click inside a sandboxed frame (confirm in an early Phase 1c check).
  * **The test can't run as written.** Vitest alone can't run the "link does nothing" part of the test at line 1714.
* **Rationale & Recommendation**:
  * **Citations** become plain https links.
  * **Flag link:** define `tearsheet://flag/<claim_id>`. The main process shows a note box, then calls `flagClaim`.
  * **Re-read:** define `tearsheet://reread/<accession>`, with a `reread_filing` request and a `reread` command.
  * **Terminal HTML:**
    * print claim IDs next to each sentence (render takes a `mode` setting);
    * add `run --out <path>`.
  * **Frame:** specify the setup and the policy strings, and intercept frame navigation:
    * `tearsheet:` links become engine requests;
    * https links open in the default browser;
    * everything else is blocked.
  * **Test:** split it into an engine pytest (escaping and `nh3`) plus a test of the navigation handler, or add Playwright for Electron.

### M22. The app–engine messages are named but not shaped - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness` (A, B), `egm-codebase-details`
* **Affected Scope:** lines 1095, 1388, 1561, 1668, `1676–1677`, 1681, 1689, `1704–1713`. Feature part: `Lines 234–255`, lines 376, 393.
* **Discrepancy Description**:
  * **Launch.** "The corrected PATH, the tool paths and the data folder" (line 1677): it isn't said whether these are passed as environment variables or flags, or under what names. `engine.ts` and `config.py` must agree on them.
  * **Responses aren't defined:**
    * whether `run_report` returns a run ID straight away;
    * `get_report` has no argument and no return value;
    * the list requests have no fields;
    * `progress.state` values and `run_failed` error codes aren't listed. The window needs the codes to show a reset time or a sign-in command.
  * **Unclear names.** "Top 3 shown if unclear" (line 1388) has no response shape.
  * **Missing requests.** The Settings and Connections screens (lines 1708–1713) need:
    * key status;
    * the raw-data size and cap;
    * the backup folder;
    * a force option on `getTools` for "Check again" (line 1668).
  * **No protocol version.** Electron "stops on a protocol version mismatch" (line 1681), but item 2 defines no protocol version constant.
* **Rationale & Recommendation**:
  * **Message table.** Add one to §2 or item 37: name, parameters, result and error codes.
  * **Launch.** Name the variables, for example `TEARSHEET_DATA_DIR`, `TEARSHEET_PATH`, `TEARSHEET_CLAUDE_BIN` and `TEARSHEET_CODEX_BIN`. Give `serve` a `--data-dir` flag.
  * **New requests and responses:**
    * add `get_settings` and `set_setting`;
    * have `run_report` return candidates when the name is unclear;
    * give `get_report(report_id)` an HTML result.
  * **Bridge.** Add `getTools({force})` and `onNotification`.
  * **Version.** Add `PROTOCOL_VERSION` to item 2.

### M23. No rule picks which AI tool runs a report - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness` (A, B), `egm-codebase-details`
* **Affected Scope:** lines 1057, 1095, 1352, 1523, 1722. Feature part: lines 111, 315, 335, 582.
* **Discrepancy Description**:
  * **No choice.** With both tools connected, no setting, request field or command flag says which tool does extraction, narration and the Phase 1 skeptic. `predictions.ai_tool` (line 1352) records an answer that nothing chooses.
  * **"Connected" isn't defined.** Found? Signed in? Passed the lock-down check?
  * **No rule for failure** when:
    * the chosen tool hits its usage limit;
    * the other tool fails partway through the Phase 2 skeptic (line 1722).
  * **Not the open question.** This is separate from the open question about Liam's everyday tool (line 111), which only decides when Codex is built.
* **Rationale & Recommendation**:
  * **Setting.** Add `primary_tool` (default: Claude Code if it is connected, otherwise Codex), a `run --tool` flag and a settings request. Store the tool on the run.
  * **Definition.** "Connected" means available, signed in, and passed the lock-down check for its current version.
  * **Failures:**
    * there is no automatic switch when a usage limit is hit;
    * if the other tool's skeptic fails, fall back to a fresh session of the same tool, labelled "self-checked".

### M24. Prediction logging leaves edge cases open, and the schema differs from §10 - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness` (B), `egm-codebase-details`, `egm-style`
* **Affected Scope:** line 1352 (`predictions`); line 1454; `Lines 1543–1545`; line 1610. Feature part: lines 82, 493, 541, 545.
* **Discrepancy Description**:
  * **No valid valuation.** The rating is "capped at Hold" (line 493), with no range. It isn't said whether that run takes the 30-day slot and writes a row with no range and no probability, or counts as withheld (line 541).
  * **Missing `ticker`.** §10 lists the ticker (line 545), but `predictions` has no `ticker` column. Line 1544 claims "every field in §10".
  * **Undefined column.** `benchmark_levels_json` appears only at line 1352 and is defined nowhere.
  * **Nullable columns** aren't stated.
  * **Untestable test.** "No code path that updates a prediction row" (line 1610) can't be written as a test.
* **Rationale & Recommendation**:
  * **No-valuation case.** Decide it. For example: log it as Hold with a null range and probability, and leave it out of range and Brier grading.
  * **Schema:**
    * add `ticker`;
    * define or drop `benchmark_levels_json`;
    * mark which columns can be null.
  * **Write-once.** Add SQLite triggers that reject UPDATE and DELETE on `predictions`, with a test that an update fails.
  * **Timing.** Settle all of this before the first official prediction (Goal 8, line 82).

### M25. Goal 1 review labels, sampling and tally rules are undefined - Severity: Major
* **Reviewer Lens:** `egm-style`, `egm-codebase-details`, `egm-implementation-readiness` (B)
* **Affected Scope:** lines 1215, 1350, `1554–1555`, 1616. Feature part: `Lines 65–71`, `601–604`, line 1007.
* **Discrepancy Description**:
  * **Label strings.** `claim_reviews` holds three label sets, but the exact `origin` and `label` strings aren't listed:
    * spot-checks: "supported", "not supported", "wrong";
    * reader flags: "confirmed error", "not an error";
    * the per-report answer: yes or no.
  * **The tally uses different words** ("confirmed errors, citations that failed", line 1554). Not stated:
    * whether a spot-check "wrong" counts as a confirmed error, a failed citation, or both;
    * which labels the outside-checker share counts (lines 1555 and 1007).

    Each choice changes the Goal 1 verdict.
  * **Claims or citations?** Labels are per claim, but Goal 1 counts citations (line 67), and `claim_reviews` has no citation field.
  * **Also not stated:**
    * how the "5 per report" are chosen;
    * how a reader flag's resolution is stored: an update, or a new row;
    * which reports count: slice reports? re-runs? reports from before a fix, when the test is repeated (line 70)?
    * how the "including a bank or a REIT" condition is checked.
* **Rationale & Recommendation**:
  * **Mapping table in item 36:**
    * labels by origin;
    * confirmed errors = `confirmed_error` + `wrong`;
    * failed citations = `not_supported`;
    * outside-checker share = `not_supported` ÷ spot-checked claims.
  * **Columns.** Add `citation_index` and `resolves_review_id` to `claim_reviews`.
  * **Sampling.** Pick the 5 at random, with the seed stored on the report.
  * **Which reports count:**
    * leave slice reports out;
    * add a `goal1_round` setting for repeat tests;
    * check the scope using the sector groups and the `financials.py` class.
  * **Liam confirms** the two label mappings.

### M26. Replay breaks when methodology files change, may write predictions, and can't read newer databases - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness` (B), `egm-codebase-details`, `egm-style`
* **Affected Scope:** lines 1321, 1343, 1461, `1573–1575`. Feature part: line 270, `Lines 379–392`.
* **Discrepancy Description**:
  * **Methodology files aren't stored.** Runs store only the methodology hash and reference version (line 1343), not the files themselves.
    * Suppose `weights.yaml` is edited without a code change. The method code version stays the same, so "the current engine replays the run" (line 391) with the new weights, and replay fails.
    * Step 12 also depends on `names.yaml`.
  * **Replay can write.** It re-runs step 8 (line 1573), which saves the official prediction (line 270). Nothing says replay must not insert one.
  * **Previous rating.** It must be read as of the run time (line 1461).
  * **Comparison.** "Compares every number" isn't defined.
  * **Older releases.** Replaying with an older release (line 392) meets a database whose `user_version` is newer than that release knows about (line 1321). No behaviour is stated.
  * **Unclear wording.** Line 1575 ("lists the differences instead. This is the check made on each release") doesn't say what "instead" replaces.
* **Rationale & Recommendation**:
  * **Files.** Store each methodology and reference file set in the raw store under its hash, and have replay load files by hash.
  * **No writes.** Replay runs with writes disabled, or on an in-memory copy.
  * **Comparison.** Compare the outputs of steps 3–8 and 12 field by field, with exact equality.
  * **Previous rating.** Read it as of `run_at`.
  * **Older releases.** They open a newer database read-only and read only the tables they know, or replay on a copy.
  * **Line 1575.** Rewrite it as:
    * same version: any difference exits non-zero;
    * older version: print the differences and exit zero (used by item 51).

### M27. Several feature rules have no owning plan item - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness` (B), `egm-codebase-details`, `egm-style`
* **Affected Scope:** `Lines 1139–1149` (item 7); lines 1334, 1382, 1506. Feature part: lines 195, 509, 516, 519, `526–527`, 537.
* **Discrepancy Description**: For each of these, the builder must pick the module, the formula or list, and the storage:
  * **Next earnings date.** The estimate from past Item 2.02 8-Ks (line 537).
  * **Which 8-K press releases are read.** Item 7 says only "the company's 8-K press releases" (line 1149). §9 implies the last 30 days, plus Items 1.01, 2.01, 4.02 and 5.02 within 12 months (lines 519 and 526). This also affects the call budget.
  * **Instruction-like phrases.** The phrase list (line 516) isn't given, and `paragraphs` (line 1334) has no column to store the mark.
  * **Paywalled pages.** §9 skips them (line 509), but item 7's rejection rules (line 1143) leave them out.
  * **"Show up to 8" articles** (line 527). Item 7 caps links at 15 (line 1139), and item 32 has no show-8 rule.
  * **The S&P 500 comparison "shown alongside" the rating** (line 195). Which figure is shown, at report time?
  * **The analyst consensus.**
    * No §3 step calls `consensus(cik)` (line 1382).
    * Alpha Vantage needs a ticker, not a CIK.
* **Rationale & Recommendation**: Give each rule an owning item with its formula or list. For example:
  * the earnings-date estimate in `news.py` (same quarter last year + 364 days);
  * the 8-K set in item 7;
  * a `marked` column on `paragraphs`, with the phrase list in a reference file;
  * the paywall rule in item 7 and the show-8 rule in item 32;
  * the consensus called in step 2, with the resolved ticker.

### M28. Phase 0 has no exit gate, no actions on failure, and nowhere to record results - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness` (A), `egm-codebase-details`
* **Affected Scope:** `Lines 1055–1059`; lines 1133, 1188, 1238, 1247; `Lines 1784–1787` (item 54). Feature part: lines 115, 189, 306, 324, 378, 626.
* **Discrepancy Description**:
  * **No exit gate.** Nothing says whether Phase 1 may start if a pass mark fails.
  * **Failure actions cover only some tests:**
    * covered: the SDK lock-down fallback, high SEC counts (A9), and Massive (A34);
    * not covered: usage, news yield, and Codex failing the lock-down.
  * **Settings with no owner.** About ten settings are deferred to "confirmed in Phase 0", but no item records them or writes them into the code:
    * the SDK option names (line 306);
    * the edgartools switch (line 1133);
    * the Codex web-search setting (line 1188);
    * the Codex models (line 324), which no step chooses;
    * how each tool returns structured output;
    * the field that shows the subscription sign-in;
    * the holdings-file issuer and terms (line 189), which no step checks;
    * Massive's limits and terms (line 115); the Massive script checks only the summary and the timing;
    * the session-history result (lines 626 and 1238), with no action if history is kept.
  * **Pruning.** The decision (line 378) has no assumed reports-per-year rate to project from.
  * **Item 54** records only the Goal 1 result and drafter-default changes (line 1787).
* **Rationale & Recommendation**:
  * **Results item.** Add an item that writes `docs/phase0-results.md` and updates the `config.py` defaults. One row per assumption: pass mark, measured value and action on failure. For example:
    * usage fails: test on Max, or lower the budget and the article cap;
    * news fails: section 7 uses press releases plus whatever articles were read;
    * Codex fails: it shows as "not usable with Tearsheet".
  * **Settings list.** List every "confirmed in Phase 0" setting with the file it lands in.
  * **Pruning.** State a reports-per-year rate.
  * **Session history.** Turn it off where possible, or add it to the §12 table.
  * **Item 54.** Extend it to record the Phase 0 results under Open Questions (line 115).

### M29. Phase 0 still depends on Phase 1 pieces, and the permanent lock-down check reads throwaway inputs - Severity: Major
* **Reviewer Lens:** `egm-codebase-details`, `egm-style`, `egm-implementation-readiness` (A)
* **Affected Scope:** lines 1093, 1206, 1217, 1220, 1227, 1247, 1488, 1619; `Lines 1760–1768` (item 52).
* **Discrepancy Description**:
  * **No database.** `lockdown-check` stores tool versions (line 1227), but the database is a Phase 1 item (see M14).
  * **No way to set the key.** The Massive script needs a key, but `set-key` is a Phase 1 command (line 1217).
  * **No link-search prompt.** `inputs.yaml` has a draft extraction prompt but no draft link-search prompt; `news_search.md` arrives in Phase 1 (line 1488).
  * **Throwaway inputs for a permanent command.**
    * The permanent `lockdown-check` reads "the hand-written inputs in `scripts/phase0/inputs.yaml`" (line 1220), which won't exist in a packaged app. Its prompts have no permanent home.
    * `Phase0Probe` (line 1206) and "Phase 0 checks" (line 1619) keep throwaway names on a permanent safety gate, a remnant of Stage 8 N1.
    * "All five also record raw-data bytes" (line 1247), but the lock-down check downloads nothing.
  * **CI.** `ci.yml` is listed "from Phase 0", but it runs `replay` and the generated-types check (lines 1767–1768), which arrive in Phase 1.
* **Rationale & Recommendation**:
  * **Database.** Move the minimal database, with M14's `tool_versions`, into Phase 0, or store tool versions in a file until Phase 1.
  * **Key.** Use `keyring`'s own command line, or an environment variable, for the Massive key in Phase 0.
  * **Link search.** Add a draft link-search prompt to `inputs.yaml`.
  * **Lock-down check:**
    * move its prompts to `engine/src/tearsheet/ai/prompts/lockdown.md` (add the file to item 30);
    * rename `Phase0Probe` to `LockdownProbe`;
    * say "the four scripts" at line 1247.
  * **CI.** Mark each step with the phase it starts in.

### M30. Grading (Phase 2) leaves several rules to the builder - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness` (A), `egm-style`, `egm-codebase-details`
* **Affected Scope:** `Lines 1718–1733` (item 48). Feature part: line 347, `Lines 557–565`.
* **Discrepancy Description**:
  * **End price.** No rule gives the end price at each horizon, or says when a prediction is "due".
  * **Hold band.** It isn't said whether it scales at 3 and 6 months; only the range does (line 563).
  * **Seed.** The 1,000 random-rating simulations (line 564) have no seed, so re-grading gives different numbers.
  * **Headline window.** "Each 12-month span" (line 561) could be rolling or calendar years.
  * **Confidence intervals.** No method is given (line 565).
  * **Timing.** It isn't said:
    * whether grading when the app opens counts as a run under "one run at a time";
    * how it shares Massive's rate limit with a report.
  * **File list.**
    * Line 1720 says "No new files", but line 1727 creates `test_grading.py`.
    * The files touched to add `grade_due` (line 1725) aren't listed.
    * Line 1724 packs several rules into one sentence with an unclear "it".
  * **Why Major, not Blocker:** grading rules are versioned and re-grading adds new rows, so a wrong choice can be corrected later.
* **Rationale & Recommendation**: In §10 and `grading.yaml`:
  * **End price:** the last close on or before the start date plus N calendar months. A prediction is due once a later close exists.
  * **Hold band:** state whether it scales.
  * **Seed:** derive it from the prediction ID and the grading version.
  * **Headline window:** a rolling span.
  * **Confidence intervals:** Wilson intervals for hit rates, and a fixed-seed bootstrap for mean excess return.
  * **Timing:** grading waits behind any report.

  Also fix line 1720 and list the files, and split line 1724 into bullets.

### M31. Stored test runs and the golden-set baseline are undefined - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness` (A, B), `egm-codebase-details`
* **Affected Scope:** `Lines 1618–1619`; `Lines 1621–1634` (item 40); lines 1756, 1768; `Lines 1796–1800`. Feature part: line 392.
* **Discrepancy Description**:
  * **Stored test runs aren't defined.**
    * CI (line 1768), the release pipeline (line 1756) and the Determinism check (line 1796) all use "stored fixture runs", which are defined nowhere.
    * `tests/fixtures/` holds raw responses only (line 1618).
    * No command takes a data-folder option to point `replay` at them.
  * **Size.** Fixtures "for the golden tickers", with about 40 peers each, mean data for hundreds of companies. That is likely too big for plain git (an assumption).
  * **`eval golden` (lines 1634 and 1798) is underspecified:**
    * It doesn't say whether it runs live or offline at a fixed date. Live data drifts with each new 10-Q, which invalidates the hand-checked numbers.
    * It doesn't say whether it calls the AI. Twenty full reports are about 600–900 calls.
    * "The last golden run" has no stored location.
    * Only 4 of the 20 tickers are named.
  * **Live tests.**
    * `tests/live/` holds "Phase 0 checks" (line 1619), which contradicts item 12.
    * Nothing keeps it out of a plain `uv run pytest`.
* **Rationale & Recommendation**:
  * **`eval golden`:**
    * runs code steps 1–8 offline, from a frozen raw store at a fixed `as_of` date recorded in `tickers.yaml`;
    * writes a committed `evals/golden/last_run.json` and compares against it.
  * **Tickers.** Name all 20.
  * **Fixtures:**
    * add `engine/tests/fixtures/runs/` (a database plus a raw folder), and a script that builds it;
    * keep trimmed fixtures in git (for example 15 peers);
    * keep the full golden store outside git at a stated location, or in Git LFS.
  * **Commands.** Add `--data-dir` to every command.
  * **Live tests.** Exclude `tests/live/` by default with a pytest marker.

### M32. Test plan gaps: no offline tests for the AI layer, renderer or database, and no fake AI connector - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness` (A, B), `egm-codebase-details`
* **Affected Scope:** `Lines 1249–1264` (item 13); `Lines 1577–1619` (item 39).
* **Discrepancy Description**:
  * **AI layer tested only live.** Phase 0 tests cover HTTP, the raw store, SEC and articles only. The connector rules most likely to break, which matter most for safety, are tested only live:
    * **Codex:** replies without `jsonrpc`; colliding request IDs; denied approvals; events treated as tool attempts; the `relogin` mapping; draining standard error.
    * **Claude Code:** the callback denying and recording; removing `ANTHROPIC_API_KEY`; no user settings loading.
    * **`client.py`:** the budget; the 3-at-a-time limit; the time limit; the schema retry; the version gate.
    * **`news.py`:** the allowlist filter and the 15-link cap.
    * **HTTP:** retry and backoff.
  * **Phase 1 modules with no listed tests:**
    * `render.py` (escaping);
    * `flow.py` (the 30% rule, tone notes, budget cuts, the direction split);
    * `extract.py` (the 60,000-token split, the cache key, ID checks, re-read deletion);
    * `skeptic.py`;
    * `methodology.py` (the hash);
    * `db` (upgrades, the copy before an upgrade, keeping 10 backups);
    * `membership.py`, `analyst.py` and `fred.py`.
  * **Rules with no tests:** the uncertainty level and its triggers, the split check, and the probability cap.
  * **No fake AI.** `test_pipeline.py` and `test_news.py` need a fake AI connector, which isn't specified.
* **Rationale & Recommendation**:
  * **New test files:**
    * `test_codex.py`, run against a scripted fake `app-server` that replays recorded messages;
    * `test_claude_code.py`, with the SDK stubbed and the options passed to it checked;
    * `test_ai_client.py`, `test_render.py`, `test_flow.py`, `test_extract.py`, `test_methodology.py`, `test_db.py` and `test_membership.py`.
  * **Other gaps.** Add named cases for the remaining modules and rules.
  * **Fake AI.** Add `tests/fakes/ai.py`: a scripted connector that returns canned answers and can raise each error type.

### N1. Version and hash definitions are loose - Severity: Nit
* **Reviewer Lens:** `egm-style`, `egm-codebase-details`, `egm-implementation-readiness` (B)
* **Affected Scope:** lines 1305, `1313–1314`, 1334, 1408, 1470. Feature part: lines 386, 388, 479.
* **Discrepancy Description**:
  * **Parser version.** It appears in paragraph IDs (line 1408), the `paragraphs` table (line 1334) and the evidence cache key (line 1470). But item 2 defines only `ENGINE_VERSION` and `METHOD_CODE_VERSION`. Using the engine version would re-read every filing on every release.
  * **Methodology hash.** "Sorted contents" (line 1313) doesn't say whether it hashes raw bytes or the parsed YAML. If raw bytes, a comment-only edit would start a new grading group.
  * **Reference version.** It is "computed" (line 1314), but §6 calls it a version number (line 386). It's unclear whether `allowlist.local.yaml` counts.
  * **`fred.yaml`.** It sits outside the hash, although its 10-year yield caps DCF terminal growth (line 479).
* **Rationale & Recommendation**:
  * Add `PARSER_VERSION`, an integer in `text/parse.py`. Raising it also raises `METHOD_CODE_VERSION`.
  * Hash canonical JSON of the parsed files.
  * Define `reference_version` as a hash that includes `allowlist.local.yaml` when present.
  * Move the 10-year series ID into `valuation.yaml`, or put `fred.yaml` in the hash.

### N2. `bands.yaml` has a different name in the feature part and collides with "Hold band" - Severity: Nit
* **Reviewer Lens:** `egm-codebase-details`, `egm-style`
* **Affected Scope:** line 1298; line 1729. Feature part: lines 381, 459, 560.
* **Discrepancy Description**:
  * **Two names.** §6 calls this file "rating lines" (line 381), and §7 calls it "the rating-lines file" (line 459).
  * **A clash.** Elsewhere, "band" means the grading Hold band (lines 560 and 1729), which lives in `grading.yaml` outside the hash. A builder could put the Hold bands in `bands.yaml`, which would undo the Stage 8 M3 fix.
* **Rationale & Recommendation**:
  * Rename the file `rating_lines.yaml`.
  * Map the feature part's names (rating lines, peer-group rules, grading rules) to file names once.

### N3. File-list bookkeeping - Severity: Nit
* **Reviewer Lens:** `egm-codebase-details`
* **Affected Scope:** `Lines 1061–1078` (item 1); lines 1292, 1358, 1720, 1748, 1751, 1793.
* **Discrepancy Description**:
  * **Item 48** says "No new files", but it creates `test_grading.py`.
  * **Item 50.** "(Create / Modify)" isn't given per file.
  * **Lockfiles.** Neither is listed:
    * `app/package-lock.json`, which `npm ci` (line 1793) requires;
    * `engine/uv.lock`, which item 1's "pin every dependency" needs.
  * **Data files outside the package.** `engine/methodology/` and `engine/data/` sit outside `engine/src/tearsheet/`, and item 1 names no build backend or package-data rule. So the loader and the Phase 3 bundle (line 1751) have no defined way to find them.
* **Rationale & Recommendation**:
  * List both lockfiles as Create.
  * Move both folders under the package, or declare them as package data.
  * Fix the markings on items 48 and 50.

### N4. Some tools and dependencies aren't named, and two Phase 3 dependencies sit in Phase 1 - Severity: Nit
* **Reviewer Lens:** `egm-codebase-details`, `egm-implementation-readiness` (A, B), `egm-style`
* **Affected Scope:** lines 1048, 1076, `1640–1642`, 1696, 1802.
* **Discrepancy Description**:
  * **Not named:**
    * a JSON Schema → TypeScript generator for item 46;
    * a coverage tool for the 85% bar, such as `pytest-cov`;
    * a fuzzy-match tool for item 21;
    * an Electron end-to-end test tool.
  * **Phase 3 material in Phase 1.** `electron-updater` and an empty `electron-builder.yml` are in item 41.
  * The trading calendar and the compression format are covered in M5 and B1.
* **Rationale & Recommendation**:
  * Name each tool (stdlib `difflib` is enough for fuzzy matching).
  * Move `electron-updater` and `electron-builder.yml` to Phase 3.

### N5. Verification Plan gaps - Severity: Nit
* **Reviewer Lens:** `egm-implementation-readiness` (A), `egm-codebase-details`, `egm-style`
* **Affected Scope:** lines 1537, 1794, `1801–1806`. Feature part: line 981.
* **Discrepancy Description**:
  * **Coverage list.** Line 1802 says it covers the modules that "make or check numbers", but it leaves out:
    * `flags` (red flags cap ratings);
    * `peers`;
    * `data/prices` (total return).
  * **Coverage bar.** CI doesn't enforce the 85% bar.
  * **Timings.**
    * Line 981 says a full repeat report is timed in Phase 0, but Phase 0 has no report pipeline.
    * Neither that timing nor the 40-peer timing (line 1537) appears in the Verification Plan.
* **Rationale & Recommendation**:
  * Add the three modules to the coverage list, and enforce the bar in CI.
  * Move the repeat-report timing to item 34, and correct line 981.
  * Add both timings to the Verification Plan.

### N6. HTTP error handling and the SEC contact string - Severity: Nit
* **Reviewer Lens:** `egm-implementation-readiness` (A, B), `egm-style`, `egm-codebase-details`
* **Affected Scope:** line 1094; `Lines 1104–1114`; lines 1254, 1382.
* **Discrepancy Description**:
  * **Validity check.** Responses are judged by status code and content type only (line 1114). These assumptions need confirming:
    * Alpha Vantage may report rate limits and bad keys in a normal 200 JSON body (`Note`, `Information` or `Error Message`);
    * FRED may use "." for missing values.
  * **Limits and retries:**
    * the 25-a-day limiter needs a count that survives restarts;
    * the number of retries, the delays and the handling of `Retry-After` aren't given.
  * **Contact email.** "<project contact email>" (line 1094) doesn't say whose. Hard-coding Liam's would send it with every future user's SEC traffic.
* **Rationale & Recommendation**:
  * Add a body check per service.
  * Keep the daily count in `settings`.
  * Retry 3 times with exponential backoff, honouring `Retry-After`.
  * Make the contact email a setting.

### N7. Phase bookkeeping - Severity: Nit
* **Reviewer Lens:** `egm-implementation-readiness` (B), `egm-style`
* **Affected Scope:** line 1240; `Lines 1272–1290`; line 1537.
* **Discrepancy Description**:
  * **Unassigned items.** Phase 1a covers items 14–34 and Phase 1c covers items 41–47. Items 36–39 (Goal 1 tally, protocol and server, replay, tests) aren't assigned to a sub-phase.
  * **Slice metrics.** Phase 1a's "one metric per factor" doesn't name which metric.
  * **Repeated measurements.** The end-of-1a measurements are stated three times (lines 1240, 1280 and 1537).
  * **No consequence on failure.** Neither the usage re-test nor the under-3-minutes timing says what happens if it fails.
* **Rationale & Recommendation**:
  * Assign each item to a sub-phase.
  * Name the slice metrics.
  * Keep the measurements in item 34 only, and state the action on failure.

### N8. Two modules claim one rule - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** lines 1444, 1453, 1499, 1520.
* **Discrepancy Description**:
  * **Uncertainty triggers:** in both `combine.py` (line 1444) and `range.py` (line 1453).
  * **Numeric guard:** in both `render.py` (line 1499) and `numeric_guard.py` (line 1520).
* **Rationale & Recommendation**:
  * `combine.py` returns the three valuation triggers. `range.py` adds the free-cash-flow trigger and applies all four.
  * `render.py` calls `verify.numeric_guard`.

### N9. Words with more than one meaning, and approximate wording - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** lines 1058, 1121, 1155, `1157–1165`, 1467, 1469, 1507, 1800.
* **Discrepancy Description**:
  * **Words with more than one meaning:**
    * **"Tool"** means both the AI program and the model's use of a tool (lines 1157–1165).
    * **"Source"** means a data provider (`put(..., source, ...)`, line 1121), the AI's input (`sources`, line 1155) and cited text.
    * **"Target"** (line 1800): the app has no target.
    * **"One call per item"** (line 1467) collides with 10-K Items.
  * **Approximate or conflicting wording:**
    * "about 40 peer CIKs" (line 1058) against "40 listed peers" (line 1233);
    * "the tool's own count where available" (line 1469): the count is needed before the call, but tools report it afterwards;
    * "a short quote" (line 1507) has no length.
  * "About 500 rows" is covered in M4.
* **Rationale & Recommendation**:
  * **Tool:** write "AI tool" for Claude Code and Codex, and "tool use" for the model's action (for example `AIToolUseAttempt`).
  * **Source:** rename `put`'s argument to `provider`.
  * **Target:** write "rating, score, or bear/base/bull value".
  * **Item:** write "one call per source section".
  * **Peers:** use 40.
  * **Token count:** keep only the estimate of 4 characters per token.
  * **Quote length:** show the full cited paragraph, or give a character limit.

### N10. Internal shorthand - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** lines 1158, 1195, 1649, 1707, 1732.
* **Discrepancy Description**: Five phrases are shorthand that a new reader has to decode:
  * "Background output" (line 1195);
  * "Failures that are rejected" (line 1158);
  * "between markers" (line 1649);
  * "the A18 note" (line 1707);
  * "√ scaling" (line 1732).
* **Rationale & Recommendation**:
  * Line 1195: "standard error, read continuously".
  * Line 1158: "treated as failures".
  * Line 1649: "prints PATH between two marker lines, so shell start-up output is ignored".
  * Line 1707: quote the note's text from §10 (line 569).
  * Line 1732: "spread scaled by √(months ÷ 12)".

### N11. Small rule details - Severity: Nit
* **Reviewer Lens:** `egm-implementation-readiness` (B)
* **Affected Scope:** line 1426. Feature part: lines 426, 468, 481.
* **Discrepancy Description**:
  * **"Bought"** in the insider-buying note isn't pinned to a Form 4 transaction code.
  * **Shared boundaries.** The volatility cut-offs share endpoints, so exactly 30% (line 426: "20–30% Medium; 30–45% High") and exactly 28% (line 481: "20–28%; 28–40%") each fall into two buckets.
* **Rationale & Recommendation**:
  * Pin "bought" to Form 4 transaction code P.
  * State which side of each boundary is inclusive.

---

## Resolution (Nov 3)

Liam chose "Fix them with me." All 45 findings are fixed in `docs/designs/tearsheet.md`, and `design_draft.md` is kept in sync. None was contested. Seven were fixed differently from the reviewers' suggestion, and those are marked **Changed**. The design grew from 1,812 to 2,164 lines. After the edits, the item numbers (1–54) and alternatives (A1–A38) still run in order, every table has matching columns, and every item and alternative reference points to one that exists.

### How each finding was fixed

| ID | Fix | Where |
| --- | --- | --- |
| B1 | `raw_objects` and `fetch_log` tables; hash of the uncompressed bytes; gzip with a fixed timestamp; `put(…, provider, …, run_id)`; `latest(url)`; key parameters stripped from stored addresses. The index tables arrive in a Phase 0 migration, `0001_core.sql`. | Items 4, 5, 13, 17, 38; §3, §6 |
| B2 | Every valuation value written down as a drafter default: terminal growth = the lower of 2.5% and DGS10; flat growth for years 1–5; a straight-line margin path to the peer median by year 5; tax kept between 0% and 30%, or 21%; the cost of debt; zero excess return after year 10 in residual income; negative-earnings peers dropped before trimming; the mean of P/E and EV/EBIT; SIC lists for banks, insurers and REITs. | Item 27; §8 |
| M1 | A metric-definitions table, the percentile formula with ties, the reference set for each use, the trigger rule from ranked gaps, and empty factors passing their weight. | Items 25, 26, 28; §7 |
| M2 | `difflib` matching at 0.8, the change-score formula, a 0.30 threshold, and the Item 9A and going-concern patterns. | Items 23, 25; §7 |
| M3 | **Changed:** peer groups use the GICS sector and index weight from the IVV holdings file, instead of an SIC map plus a separate market-value ranking. The SIC map is kept as a fallback (A36). Parent groups are removed. Left-out peers are not replaced. | Items 18, 24; §7; Decisions; A36 |
| M4 | IVV chosen. A Phase 0 check of its terms and format. Parsing rules, a 495–510 equity-row check, a daily refresh, `build_sp500_bundled.py`, and a row in the §12 table. | Items 12, 18; §12; Risks |
| M5 | **Changed:** SPY is stored for 2 years, the volatility window is 480 trading days (so it fits within 2 years), volatility is defined, and the NYSE calendar comes from `exchange_calendars`. | Items 19, 26; Tooling; §5 |
| M6 | `massive.py` split into three records, including dividends and market-wide splits. A `prices-backfill` job that waits for any report. | Items 12, 19; §5 |
| M7 | The rated class is the one with the largest index weight, and values are stated in its units. A canonical ticker form plus `ticker_for(provider, …)`. | Items 21, 22; §3 |
| M8 | **Changed:** limits per ticker, each first run from an empty store, 5 sectors in the inputs file, and a re-download table with a same-day rule. The repeat pass mark goes from 50 to 60, because company facts alone are about 41 requests. | Items 6, 12 |
| M9 | **Changed:** edgartools now only splits sections, with a route order and a fallback. Line items come from one tag list (A38). A Phase 0 offline check. | Items 6, 12, 22, 23; A38 |
| M10 | Projection from the call plan at 45 calls; the 3 largest filers; usage screens read before and after; pass = 50% of one 5-hour window on Claude Pro and on Liam's ChatGPT plan. | Item 12 |
| M11 | Separate folders for each call, `CLAUDE.md` and `AGENTS.md` markers, bait files, checks for tool servers, the model and the sign-in field, 5 of 5 for the short form, and an injection-test rule. | Item 12; §4; Verification Plan |
| M12 | The web-search exception carried through the call rules, the callback and the Codex stream check. 5 link-search calls added to the lock-down check. | Items 8, 9, 10, 12; §4 |
| M13 | Options named by function, with the believed Python spellings marked as Phase 0 confirmations. Codex config overrides, an environment allowlist that drops `OPENAI_API_KEY`, an approval policy that asks even before read-only commands, the -32600 rule, and a "not usable" fallback. | Items 9, 10; §4 |
| M14 | A `tool_versions` table with gate state, kept in the Phase 0 migration. A gate rule that holds new calls, the `LOCKDOWN_FAILED` outcome, an error table with fixtures, retries in `client.py`, failures in many-call steps, and run states. | Items 5, 8, 17, 34; §3, §4 |
| M15 | A concurrency row in Tooling defaults: asyncio throughout. | Tooling defaults |
| M16 | A call-plan table, a projection formula, budget rules, `AIBudgetExhausted`, the inputs for rewrites and the skeptic, and 6 AI-written sections. | Items 8, 31, 33, 34; §3, §11 |
| M17 | Section keys, code-assigned sentence IDs, a placeholder namespace with formats, `QuotedValue.value_text` and IDs, and the matching normalization. | Items 11, 31, 33 |
| M18 | Blocked words, year context, quarter patterns and the name rule. `render.py` calls the guard. | Items 14, 31, 33; §11 |
| M19 | The cited ID must have been sent to the narration call that wrote the sentence, and each call gets only its own section's sources. | Items 31, 33; §11 |
| M20 | **Changed:** escape only. `markdown-it-py` and `nh3` are dropped (A37). | Items 1, 31; §12; A37 |
| M21 | `tearsheet://flag/<id>` and `tearsheet://reread/<accession>`; plain https citations; `app` and `file` render modes; `run --out` and `show`; an `srcdoc` iframe with an empty sandbox; content-security-policy strings; `navigation.ts`; a split test; an early Phase 1c check. | Items 12, 31, 32, 42, 45, 47; §12 |
| M22 | A message table with results and error codes, launch variables, `PROTOCOL_VERSION`, `get_settings` and `set_setting`, `reread_filing`, and bridge listeners. | Items 2, 37, 43, 44, 45; §2 |
| M23 | A `primary_tool` setting, `--tool`, a definition of "connected", no automatic switch, and the Phase 2 skeptic falling back to "self-checked". | Items 3, 8, 48; §4 |
| M24 | A no-valuation run is an official Hold with no range. `ticker` added, `benchmark_levels_json` dropped, columns that can be empty listed, and write-once triggers. | Items 17, 28, 35; §10 |
| M25 | A label table by origin, the tally mapping, `citation_index` and `resolves_review_id`, a seeded random pick, `goal1_round`, and which reports count. Liam confirms the mapping. | Items 17, 36; §11; Future Improvements |
| M26 | Methodology and reference files stored by hash, read-only replay, comparison field by field, the previous rating as of the run, a read-only rule for newer databases, and the exit codes rewritten. | Items 5, 15, 38; §6 |
| M27 | The 8-K set, the earnings-date rule, the `marked` column and phrase file, the paywall rule, the show-8 rule, the S&P 500 comparison in section 1, and `consensus(ticker)` in step 2. | Items 7, 14, 17, 20, 32; §3, §9 |
| M28 | `docs/phase0-results.md` with a failure-action table and a list of the Phase 0 settings, an exit gate, a pruning rate, and item 54 extended. | Items 12, 54; Phase 0 intro; §6 |
| M29 | **Changed:** the database is in Phase 0 and `set-key` moved to Phase 0 (instead of using keyring's own command line). The link-search draft prompt, `lockdown.md`, `LockdownProbe`, "the four scripts", and a phase marked on each CI step. | Phase 0 intro; items 5, 11, 12, 52 |
| M30 | The end price and due date, the Hold band scaled at 3 and 6 months, a seed, a rolling headline window, Wilson and bootstrap intervals, timing as a job, and the file list and bullets. | Item 48; §10 |
| M31 | `eval golden` runs offline from a frozen store at `~/Tearsheet Golden/`, with `last_run.json`, all 20 tickers named, fixture runs, `--data-dir` and the `live` marker. | Items 1, 3, 12, 39, 40, 51, 52; Verification Plan |
| M32 | `test_ai_client.py`, `test_claude_code.py`, `test_codex.py`, the fake AI, and new test files for render, flow, extract, methodology, the database and membership, plus named cases. | Items 13, 39 |
| N1 | `PARSER_VERSION`, a canonical-JSON hash, `reference_version` defined, and the DGS10 series moved into `valuation.yaml`. | Items 14, 15, 23; §6 |
| N2 | Renamed `rating_lines.yaml`; feature-part names mapped to file names. | Item 14 |
| N3 | Both lockfiles listed, the data files moved inside the package, and the markings on items 48 and 50 fixed. | Items 1, 14, 18, 41, 48, 50 |
| N4 | Tools named (`json-schema-to-typescript`, `pytest-cov`, `difflib`); `electron-builder` and `electron-updater` moved to Phase 3. | Tooling; items 41, 46, 50 |
| N5 | Coverage list extended and enforced in CI, timings moved to item 34, the NFR wording fixed. | Item 34; Verification Plan; NFR |
| N6 | Body checks for each service, the daily count in `settings`, retry timings, and the contact email as a setting. | Items 3, 4; §12 |
| N7 | Items assigned to sub-phases, the slice metrics named, measurements kept in one place, and actions on failure. | Phase 1 intro; item 34 |
| N8 | `combine.py` and `range.py` split the triggers; `render.py` calls the guard. | Items 27, 28, 31 |
| N9 | `AIToolUseAttempt`, "tool-use attempt", `provider`, "one call per source section", 40 peers, the 4-characters estimate, the full cited paragraph. | Throughout |
| N10 | All five phrases rewritten. | Items 8, 10, 42, 47, 48 |
| N11 | "Bought" means Form 4 code P; each range includes its lower end. | Item 25; §7, §8 |

### Drafter defaults Liam should check before the first official prediction

These are finance or judgement choices. They are written into the design, and any of them can be changed:

1. **Valuation (B2):** terminal growth at the lower of 2.5% and the 10-year yield; the tax rate kept between 0% and 30%; residual income ends at year 10; the multiples value is the mean of P/E and EV/EBIT.
2. **Peer groups (M3):** the GICS sectors from the IVV file, in place of SIC-code groups.
3. **Risk-factor red flag (M2):** a 0.30 change threshold, checked on the golden set.
4. **No-valuation runs (M24):** logged as an official Hold.
5. **Goal 1 tally (M25):** a "wrong" spot-check label counts as a confirmed error, and "not supported" counts as a failed citation.
6. **Usage pass mark (M10):** 50% of one 5-hour window.
7. **Golden tickers (M31):** the 20 names in item 40.
8. **Bank, insurer and REIT SIC lists (B2):** approved in Phase 1b.

### Still to confirm in Phase 0

Item 12 lists every outside fact the fixes depend on, each with the file it lands in. They include the Agent SDK option names, Codex's approval values and overrides, Massive's endpoints, the IVV file's columns, ticker spellings, and the edgartools route. If Codex can't be locked down, it is marked "not usable with Tearsheet."
