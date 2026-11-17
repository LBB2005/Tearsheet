-- Dig deeper's snapshots (dig/snapshot.py): today's picture of one stock beside its newest
-- report, saved once and never changed. Migrations only add tables and columns.
--
-- snapshot_id is also the run_id of the snapshot's fetch_log rows (dig-<cik>-<stamp>-<hex>),
-- so every byte it was built from can be found again (replay-dig). report_id and run_id are
-- the report's. versions_json holds DIG_CODE_VERSION and the engine version; inputs_hash is
-- the hash of the fetched bytes and the report ids; json is the whole protocol.DigSnapshot.
CREATE TABLE dig_snapshots (
    snapshot_id   TEXT PRIMARY KEY,
    cik           INTEGER NOT NULL,
    created_at    TEXT NOT NULL,
    close_date    TEXT,
    report_id     TEXT,
    run_id        TEXT,
    versions_json TEXT NOT NULL,
    inputs_hash   TEXT NOT NULL,
    json          TEXT NOT NULL
);

CREATE INDEX dig_snapshots_by_cik ON dig_snapshots (cik, created_at);

-- Write-once, as predictions are (0002, 0005): no update, no delete, and no INSERT OR
-- REPLACE over a stored snapshot.
CREATE TRIGGER dig_snapshots_write_once_update BEFORE UPDATE ON dig_snapshots
BEGIN
    SELECT RAISE(ABORT, 'dig snapshots are write-once');
END;

CREATE TRIGGER dig_snapshots_write_once_delete BEFORE DELETE ON dig_snapshots
BEGIN
    SELECT RAISE(ABORT, 'dig snapshots are write-once');
END;

CREATE TRIGGER dig_snapshots_write_once_insert BEFORE INSERT ON dig_snapshots
WHEN EXISTS (SELECT 1 FROM dig_snapshots WHERE snapshot_id = NEW.snapshot_id)
BEGIN
    SELECT RAISE(ABORT, 'dig snapshots are write-once');
END;
