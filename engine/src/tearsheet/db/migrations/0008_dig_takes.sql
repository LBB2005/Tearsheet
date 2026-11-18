-- Dig deeper's AI takes (dig/take.py): one take on one stock, written from a snapshot and the
-- report it names, saved once and never changed. Migrations only add tables and columns.
--
-- snapshot_id is the dig_snapshots row the take was written from; report_id is that snapshot's
-- report. versions_json holds DIG_CODE_VERSION, the prompt versions and the engine version.
-- draft_json keeps the AI's drafts and the skeptic's marks as given, with who wrote and checked
-- the take, so replay-dig can put the take together again; json is the whole protocol.DigTake.
CREATE TABLE dig_takes (
    take_id       TEXT PRIMARY KEY,
    cik           INTEGER NOT NULL,
    snapshot_id   TEXT NOT NULL,
    report_id     TEXT,
    created_at    TEXT NOT NULL,
    versions_json TEXT NOT NULL,
    draft_json    TEXT NOT NULL,
    json          TEXT NOT NULL
);

CREATE INDEX dig_takes_by_cik ON dig_takes (cik, created_at);

-- Write-once, as snapshots are (0007): no update, no delete, and no INSERT OR REPLACE over a
-- stored take.
CREATE TRIGGER dig_takes_write_once_update BEFORE UPDATE ON dig_takes
BEGIN
    SELECT RAISE(ABORT, 'dig takes are write-once');
END;

CREATE TRIGGER dig_takes_write_once_delete BEFORE DELETE ON dig_takes
BEGIN
    SELECT RAISE(ABORT, 'dig takes are write-once');
END;

CREATE TRIGGER dig_takes_write_once_insert BEFORE INSERT ON dig_takes
WHEN EXISTS (SELECT 1 FROM dig_takes WHERE take_id = NEW.take_id)
BEGIN
    SELECT RAISE(ABORT, 'dig takes are write-once');
END;
