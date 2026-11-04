-- The first part of the database (design item 5). Migrations only add tables and columns.

-- One row per stored file in the raw-data folder, keyed by the SHA-256 of its uncompressed bytes.
CREATE TABLE raw_objects (
    raw_hash        TEXT PRIMARY KEY,
    provider        TEXT NOT NULL,
    content_type    TEXT NOT NULL,
    size            INTEGER NOT NULL,
    stored_size     INTEGER NOT NULL,
    first_run_id    TEXT NOT NULL,
    first_stored_at TEXT NOT NULL
);

-- Which run used which stored file. request_key is the address with key parameters removed.
-- fetched_at is when the bytes came from the network; a run that reuses a stored copy gets
-- its own row with the stored copy's fetch time. Replay reads a run's inputs through this table.
CREATE TABLE fetch_log (
    fetch_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id      TEXT NOT NULL,
    provider    TEXT NOT NULL,
    request_key TEXT NOT NULL,
    raw_hash    TEXT NOT NULL REFERENCES raw_objects (raw_hash),
    fetched_at  TEXT NOT NULL
);
CREATE INDEX fetch_log_by_request ON fetch_log (request_key, fetched_at);
CREATE INDEX fetch_log_by_run ON fetch_log (run_id);

-- The lock-down gate's state for each AI tool (item 8).
CREATE TABLE tool_versions (
    tool                TEXT PRIMARY KEY,
    version             TEXT,
    model_ids_json      TEXT,
    lockdown_form       TEXT,
    lockdown_passed     INTEGER,
    lockdown_checked_at TEXT,
    blocked_reason      TEXT,
    blocked_at          TEXT
);

CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);
