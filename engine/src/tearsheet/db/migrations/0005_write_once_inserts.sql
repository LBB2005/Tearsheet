-- Write-once means a row can't be put back over itself either. The UPDATE and DELETE
-- triggers of 0002 don't fire for INSERT OR REPLACE (SQLite deletes the old row without
-- delete triggers unless recursive_triggers is on), so a REPLACE could rewrite an official
-- prediction. These BEFORE INSERT triggers refuse a row whose key is already there.
CREATE TRIGGER predictions_write_once_insert BEFORE INSERT ON predictions
WHEN EXISTS (SELECT 1 FROM predictions WHERE prediction_id = NEW.prediction_id)
BEGIN
    SELECT RAISE(ABORT, 'predictions are write-once');
END;

CREATE TRIGGER claim_reviews_add_only_insert BEFORE INSERT ON claim_reviews
WHEN EXISTS (SELECT 1 FROM claim_reviews WHERE review_id = NEW.review_id)
BEGIN
    SELECT RAISE(ABORT, 'claim reviews are add-only');
END;

-- Grades: a grading-rules change adds new rows (a new grading_version); a stored grade is
-- never changed, removed or replaced.
CREATE TRIGGER grades_write_once_insert BEFORE INSERT ON grades
WHEN EXISTS (
    SELECT 1 FROM grades
    WHERE prediction_id = NEW.prediction_id
      AND horizon_months = NEW.horizon_months
      AND grading_version = NEW.grading_version
)
BEGIN
    SELECT RAISE(ABORT, 'grades are write-once');
END;
CREATE TRIGGER grades_write_once_update BEFORE UPDATE ON grades
BEGIN
    SELECT RAISE(ABORT, 'grades are write-once');
END;
CREATE TRIGGER grades_write_once_delete BEFORE DELETE ON grades
BEGIN
    SELECT RAISE(ABORT, 'grades are write-once');
END;
