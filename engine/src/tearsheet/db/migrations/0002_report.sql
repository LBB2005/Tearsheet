-- Reports and predictions (design item 17). Migrations only add tables and columns.

-- Reference data --------------------------------------------------------------------------

-- financial_class is 'bank', 'insurer', 'reit' or '' (item 27).
CREATE TABLE companies (
    cik             INTEGER PRIMARY KEY,
    name            TEXT NOT NULL,
    sic             INTEGER,
    sector          TEXT,
    financial_class TEXT NOT NULL DEFAULT ''
);

-- Tickers in the canonical form (BRK.B), with a dated history (item 21).
CREATE TABLE tickers (
    ticker           TEXT NOT NULL,
    cik              INTEGER NOT NULL,
    share_class      TEXT NOT NULL DEFAULT '',
    conversion_ratio REAL NOT NULL DEFAULT 1,
    date_from        TEXT NOT NULL,
    date_to          TEXT,
    PRIMARY KEY (ticker, date_from)
);
CREATE INDEX tickers_by_cik ON tickers (cik);

CREATE TABLE sp500_membership (
    cik       INTEGER NOT NULL,
    date_from TEXT NOT NULL,
    date_to   TEXT,
    source    TEXT NOT NULL,
    PRIMARY KEY (cik, date_from)
);

-- One snapshot per refresh of the holdings file (item 18).
CREATE TABLE sp500_holdings (
    as_of    TEXT NOT NULL,
    cik      INTEGER NOT NULL,
    ticker   TEXT NOT NULL,
    sector   TEXT NOT NULL,
    weight   REAL NOT NULL,
    raw_hash TEXT NOT NULL,
    PRIMARY KEY (as_of, ticker)
);
CREATE INDEX sp500_holdings_by_cik ON sp500_holdings (cik, as_of);

CREATE TABLE filings (
    accession   TEXT PRIMARY KEY,
    cik         INTEGER NOT NULL,
    form        TEXT NOT NULL,
    filed_at    TEXT NOT NULL,
    accepted_at TEXT,
    period_end  TEXT,
    items       TEXT,
    raw_hash    TEXT
);
CREATE INDEX filings_by_cik ON filings (cik, form, filed_at);

-- Paragraph IDs: accession#item#pN@parser-version (item 23). marked = instruction-like
-- phrases found (Technical Plan §9).
CREATE TABLE paragraphs (
    id             TEXT PRIMARY KEY,
    source_id      TEXT NOT NULL,
    section        TEXT NOT NULL,
    ordinal        INTEGER NOT NULL,
    text           TEXT NOT NULL,
    parser_version INTEGER NOT NULL,
    marked         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX paragraphs_by_source ON paragraphs (source_id, section, ordinal);

CREATE TABLE articles (
    id           TEXT PRIMARY KEY,
    url          TEXT NOT NULL,
    final_url    TEXT NOT NULL,
    publisher    TEXT,
    source_type  TEXT,
    published_at TEXT,
    fetched_at   TEXT NOT NULL,
    raw_hash     TEXT NOT NULL
);

-- Prices (Technical Plan §5) -----------------------------------------------------------------

CREATE TABLE prices_daily (
    cik              INTEGER NOT NULL,
    share_class      TEXT NOT NULL DEFAULT '',
    date             TEXT NOT NULL,
    close_unadjusted REAL NOT NULL,
    volume           REAL,
    source           TEXT NOT NULL,
    raw_hash         TEXT NOT NULL,
    PRIMARY KEY (cik, share_class, date)
);

-- kind is 'split' (ratio_or_amount = new shares per old share) or 'dividend' (cash per share).
CREATE TABLE corporate_actions (
    cik             INTEGER NOT NULL,
    share_class     TEXT NOT NULL DEFAULT '',
    date            TEXT NOT NULL,
    kind            TEXT NOT NULL,
    ratio_or_amount REAL NOT NULL,
    source          TEXT NOT NULL,
    PRIMARY KEY (cik, share_class, date, kind)
);

-- Calculations ---------------------------------------------------------------------------

CREATE TABLE metrics (
    run_id      TEXT NOT NULL,
    cik         INTEGER NOT NULL,
    name        TEXT NOT NULL,
    value       REAL,
    inputs_json TEXT NOT NULL,
    PRIMARY KEY (run_id, cik, name)
);

CREATE TABLE peer_groups (
    run_id   TEXT NOT NULL,
    cik      INTEGER NOT NULL,
    peer_cik INTEGER NOT NULL,
    weight   REAL NOT NULL,
    PRIMARY KEY (run_id, peer_cik)
);

-- Runs -----------------------------------------------------------------------------------

-- mode: 'slice' or 'full'. status: running, stopped, interrupted, cancelled, failed, done,
-- done_incomplete.
CREATE TABLE runs (
    run_id               TEXT PRIMARY KEY,
    cik                  INTEGER,
    mode                 TEXT NOT NULL,
    ai_tool              TEXT,
    started_at           TEXT NOT NULL,
    ended_at             TEXT,
    status               TEXT NOT NULL,
    failed_step          TEXT,
    last_step_done       TEXT,
    engine_version       TEXT NOT NULL,
    method_code_version  INTEGER NOT NULL,
    methodology_hash     TEXT NOT NULL,
    reference_version    TEXT NOT NULL,
    model_ids_json       TEXT,
    prompt_versions_json TEXT,
    request_counts_json  TEXT,
    ai_calls             INTEGER NOT NULL DEFAULT 0,
    cuts_json            TEXT,
    inputs_hash          TEXT,
    bytes_stored         INTEGER
);

CREATE TABLE step_outputs (
    run_id TEXT NOT NULL,
    step   TEXT NOT NULL,
    json   TEXT NOT NULL,
    PRIMARY KEY (run_id, step)
);

-- Report content -------------------------------------------------------------------------

CREATE TABLE reports (
    report_id          TEXT PRIMARY KEY,
    run_id             TEXT NOT NULL,
    created_at         TEXT NOT NULL,
    narrative_complete INTEGER NOT NULL,
    goal1_round        INTEGER
);

-- The only stored copy of the report text; the HTML is generated from it.
CREATE TABLE sections (
    report_id TEXT NOT NULL,
    key       TEXT NOT NULL,
    json      TEXT NOT NULL,
    PRIMARY KEY (report_id, key)
);

CREATE TABLE claims (
    claim_id           TEXT PRIMARY KEY,
    report_id          TEXT NOT NULL,
    section            TEXT NOT NULL,
    sentence_id        TEXT NOT NULL,
    stance             TEXT NOT NULL,
    citations_json     TEXT NOT NULL,
    check_results_json TEXT NOT NULL,
    removed            INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX claims_by_report ON claims (report_id, section);

-- Reader flags, spot-check labels and per-report answers (Technical Plan §11). Rows are only
-- ever added.
CREATE TABLE claim_reviews (
    review_id          TEXT PRIMARY KEY,
    report_id          TEXT NOT NULL,
    claim_id           TEXT,
    citation_index     INTEGER,
    origin             TEXT NOT NULL,
    label              TEXT NOT NULL,
    note               TEXT,
    resolves_review_id TEXT,
    created_at         TEXT NOT NULL
);
CREATE TRIGGER claim_reviews_add_only_update BEFORE UPDATE ON claim_reviews
BEGIN
    SELECT RAISE(ABORT, 'claim reviews are add-only');
END;
CREATE TRIGGER claim_reviews_add_only_delete BEFORE DELETE ON claim_reviews
BEGIN
    SELECT RAISE(ABORT, 'claim reviews are add-only');
END;

-- Predictions ----------------------------------------------------------------------------

-- previous_rating, previous_rating_at, probability, bear, base and bull can be empty (no
-- earlier rating, or no valid valuation). Every other column is required. The peer list and
-- weights are the run's peer_groups rows.
CREATE TABLE predictions (
    prediction_id         TEXT PRIMARY KEY,
    run_id                TEXT NOT NULL,
    cik                   INTEGER NOT NULL,
    ticker                TEXT NOT NULL,
    share_class           TEXT NOT NULL,
    run_at                TEXT NOT NULL,
    score                 REAL NOT NULL,
    rating                TEXT NOT NULL,
    previous_rating       TEXT,
    previous_rating_at    TEXT,
    probability           REAL,
    bear                  REAL,
    base                  REAL,
    bull                  REAL,
    uncertainty           TEXT NOT NULL,
    percentile_lines_json TEXT NOT NULL,
    accessions_json       TEXT NOT NULL,
    latest_acceptance_at  TEXT NOT NULL,
    methodology_hash      TEXT NOT NULL,
    method_code_version   INTEGER NOT NULL,
    engine_version        TEXT NOT NULL,
    ai_tool               TEXT NOT NULL,
    model_ids_json        TEXT NOT NULL,
    inputs_hash           TEXT NOT NULL
);
CREATE INDEX predictions_by_cik ON predictions (cik, run_at);
CREATE TRIGGER predictions_write_once_update BEFORE UPDATE ON predictions
BEGIN
    SELECT RAISE(ABORT, 'predictions are write-once');
END;
CREATE TRIGGER predictions_write_once_delete BEFORE DELETE ON predictions
BEGIN
    SELECT RAISE(ABORT, 'predictions are write-once');
END;

-- A grading-rules change adds new rows; old rows are never overwritten.
CREATE TABLE grades (
    prediction_id   TEXT NOT NULL,
    horizon_months  INTEGER NOT NULL,
    graded_at       TEXT NOT NULL,
    grading_version INTEGER NOT NULL,
    start_price     REAL,
    results_json    TEXT NOT NULL,
    PRIMARY KEY (prediction_id, horizon_months, grading_version)
);

-- Saved AI evidence (Technical Plan §4).
CREATE TABLE evidence_cache (
    cache_key  TEXT PRIMARY KEY,
    items_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);
