-- ============================================================
-- Supabase Project 1: Site A (DBLP)
-- Chạy script này trong SQL Editor của Supabase Project 1
-- ============================================================

CREATE TABLE IF NOT EXISTS authors (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    affiliation TEXT,
    email       TEXT,
    source      TEXT
);

CREATE TABLE IF NOT EXISTS papers (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    year        INTEGER,
    venue       TEXT,
    doi         TEXT,
    abstract    TEXT,
    source      TEXT
);

CREATE TABLE IF NOT EXISTS paper_authors (
    paper_id    TEXT,
    author_id   TEXT,
    author_name TEXT,
    PRIMARY KEY (paper_id, author_id)
);

-- Indexes để tăng tốc query
CREATE INDEX IF NOT EXISTS idx_papers_year   ON papers(year);
CREATE INDEX IF NOT EXISTS idx_papers_venue  ON papers(venue);
CREATE INDEX IF NOT EXISTS idx_papers_doi    ON papers(doi);
CREATE INDEX IF NOT EXISTS idx_authors_name  ON authors(name);
CREATE INDEX IF NOT EXISTS idx_pa_author     ON paper_authors(author_id);
CREATE INDEX IF NOT EXISTS idx_pa_paper      ON paper_authors(paper_id);
