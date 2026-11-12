-- The watchlist (watchlist.py) and each report's levels (report_levels.py). Migrations only add
-- tables and columns.

-- One row per company ever watched: its note and alert settings. Kept when the company leaves
-- every list, so adding it back brings them back. Not tied to `companies`: a watched company
-- may have no report, and so no `companies` row.
CREATE TABLE watch_companies (
    cik            INTEGER PRIMARY KEY,
    first_added_at TEXT NOT NULL,
    note           TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 10000),
    note_at        TEXT,
    -- Alerts. 1 on, 0 off. alert_move is the move from the report's price that alerts (0.10 is
    -- 10%); NULL is off.
    alert_range    INTEGER NOT NULL DEFAULT 1 CHECK (alert_range IN (0, 1)),
    alert_trigger  INTEGER NOT NULL DEFAULT 1 CHECK (alert_trigger IN (0, 1)),
    alert_move     REAL DEFAULT 0.10 CHECK (alert_move IS NULL OR (alert_move > 0 AND alert_move < 10)),
    alert_age      INTEGER NOT NULL DEFAULT 1 CHECK (alert_age IN (0, 1))
);

-- A deleted list is kept (deleted_at set) until its undo has passed, then erased.
CREATE TABLE watch_lists (
    list_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
    position   INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    deleted_at TEXT
);
CREATE UNIQUE INDEX watch_lists_by_name ON watch_lists (name COLLATE NOCASE)
    WHERE deleted_at IS NULL;

-- A company in a list. added_as is what was typed ("GOOG", "brk-b"), for the CSV round trip.
CREATE TABLE watch_items (
    list_id  INTEGER NOT NULL REFERENCES watch_lists (list_id) ON DELETE CASCADE,
    cik      INTEGER NOT NULL REFERENCES watch_companies (cik),
    position INTEGER NOT NULL,
    added_at TEXT NOT NULL,
    added_as TEXT NOT NULL,
    PRIMARY KEY (list_id, cik)
) WITHOUT ROWID;
CREATE INDEX watch_items_by_cik ON watch_items (cik);

-- Where each alert last stood, against which report, as of which close: the memory that makes
-- an alert fire once per crossing. side is 'below', 'inside' or 'above' (range, trigger_*) and
-- 'down', 'inside' or 'up' (move). report_id is the report measured against, or the official
-- prediction when the company has no report on show.
CREATE TABLE watch_alert_state (
    cik        INTEGER NOT NULL REFERENCES watch_companies (cik),
    kind       TEXT NOT NULL CHECK (kind IN ('range', 'trigger_buy', 'trigger_sell', 'move')),
    report_id  TEXT NOT NULL,
    side       TEXT NOT NULL,
    close_date TEXT NOT NULL,
    PRIMARY KEY (cik, kind)
) WITHOUT ROWID;

-- Each alert that fired. ref is the report (range, trigger_*, move) or the prediction (age).
-- The UNIQUE key is the dedup: one event per company, kind, reference, direction and close.
-- text is the sentence written when it fired, so the page, the history and the Mac
-- notification say the same.
CREATE TABLE watch_events (
    event_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    cik         INTEGER NOT NULL REFERENCES watch_companies (cik),
    kind        TEXT NOT NULL CHECK (kind IN ('range', 'trigger_buy', 'trigger_sell', 'move', 'age')),
    ref         TEXT NOT NULL,
    side        TEXT NOT NULL,
    close_date  TEXT NOT NULL,
    price       REAL,
    level       REAL,
    text        TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    notified_at TEXT,
    seen_at     TEXT,
    UNIQUE (cik, kind, ref, side, close_date)
);
CREATE INDEX watch_events_unseen ON watch_events (cik) WHERE seen_at IS NULL;
CREATE INDEX watch_events_by_cik ON watch_events (cik, event_id);

-- Each report's code-made levels as numbers, in the shares of its price date (price_date):
-- written when the report is saved; older reports are filled once from their code-written
-- lines (source 'parsed', to the cent). Erasing a report erases its row.
-- buy_reachable / sell_reachable: 1 a price, 0 "not reachable by price alone", NULL no
-- trigger at all (withheld rating, no valuation).
CREATE TABLE report_levels (
    report_id        TEXT PRIMARY KEY REFERENCES reports (report_id) ON DELETE CASCADE,
    run_id           TEXT NOT NULL,
    cik              INTEGER NOT NULL,
    price_date       TEXT NOT NULL,
    price            REAL,
    rating           TEXT CHECK (rating IN ('Buy', 'Hold', 'Sell')),
    capped           INTEGER NOT NULL DEFAULT 0 CHECK (capped IN (0, 1)),
    uncertainty      TEXT,
    score_percentile INTEGER,
    estimate         REAL,
    bear             REAL,
    base             REAL,
    bull             REAL,
    buy_trigger      REAL,
    sell_trigger     REAL,
    buy_reachable    INTEGER CHECK (buy_reachable IN (0, 1)),
    sell_reachable   INTEGER CHECK (sell_reachable IN (0, 1)),
    source           TEXT NOT NULL CHECK (source IN ('run', 'parsed'))
);
CREATE INDEX report_levels_by_cik ON report_levels (cik);

-- Lookups by run that list and mark code already make without an index
-- (report_marks.kept_because, companies._report_rows).
CREATE INDEX predictions_by_run ON predictions (run_id);
