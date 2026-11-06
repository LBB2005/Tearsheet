-- Articles a run tried to read but couldn't, by site, so always-paywalled sites can be found
-- and dropped from the allowlist (Phase 0 news result; `tearsheet-engine news-sites`).
CREATE TABLE article_skips (
    run_id  TEXT NOT NULL,
    url     TEXT NOT NULL,
    site    TEXT NOT NULL,
    reason  TEXT NOT NULL,
    at      TEXT NOT NULL,
    PRIMARY KEY (run_id, url)
);
CREATE INDEX article_skips_site ON article_skips (site);
