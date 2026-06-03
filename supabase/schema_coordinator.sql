-- ============================================================
-- Supabase Project 3: Coordinator
-- Chạy script này trong SQL Editor của Supabase Project 3
-- Lưu kết quả Entity Resolution và Job tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS resolution_results (
    id          SERIAL PRIMARY KEY,
    paper_a_id  TEXT,
    paper_b_id  TEXT,
    title_a     TEXT,
    title_b     TEXT,
    doi_a       TEXT,
    doi_b       TEXT,
    score       REAL,
    decision    TEXT,
    breakdown   TEXT,
    created_at  DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS jobs (
    id          SERIAL PRIMARY KEY,
    status      TEXT DEFAULT 'pending',
    year        INTEGER,
    total_pairs INTEGER DEFAULT 0,
    processed   INTEGER DEFAULT 0,
    merged      INTEGER DEFAULT 0,
    reviewed    INTEGER DEFAULT 0,
    separated   INTEGER DEFAULT 0,
    site_a_ok   INTEGER DEFAULT 1,
    site_b_ok   INTEGER DEFAULT 1,
    started_at  DOUBLE PRECISION,
    finished_at DOUBLE PRECISION
);

-- Indexes để tăng tốc filter theo decision và score
CREATE INDEX IF NOT EXISTS idx_res_decision  ON resolution_results(decision);
CREATE INDEX IF NOT EXISTS idx_res_score     ON resolution_results(score DESC);
CREATE INDEX IF NOT EXISTS idx_res_paper_a   ON resolution_results(paper_a_id);
CREATE INDEX IF NOT EXISTS idx_res_paper_b   ON resolution_results(paper_b_id);
