-- The sidebar's marks (report_marks.py).
--
-- A hidden report has left the sidebar and the look-up box but is still stored, and can be
-- brought back. The report of an official prediction, and a report with reviews, is only ever
-- hidden, because predictions and claim_reviews are write-once and add-only. Any other report
-- is hidden first and erased once its undo has passed.
CREATE TABLE hidden_reports (
    report_id TEXT PRIMARY KEY,
    hidden_at TEXT NOT NULL
);

-- A pinned company's row sits at the top of the sidebar, above the date groups.
CREATE TABLE pinned_companies (
    cik       INTEGER PRIMARY KEY,
    pinned_at TEXT NOT NULL
);
