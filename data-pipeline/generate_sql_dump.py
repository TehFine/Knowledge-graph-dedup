"""
generate_sql_dump.py — Tạo file SQL từ dữ liệu local để chạy trong Supabase SQL Editor
────────────────────────────────────────────────────────────────────────────────────────
Usage:
    cd data-pipeline
    python generate_sql_dump.py

Output:
    output/sql_dump_site_a.sql   — Dùng cho Supabase Project 1 (Site A)
    output/sql_dump_site_b.sql   — Dùng cho Supabase Project 2 (Site B)
    output/sql_dump_coordinator.sql — Dùng cho Supabase Project 3 (Coordinator)
"""

import os, sqlite3, json
from datetime import datetime

OUT_DIR = os.path.join(os.path.dirname(__file__), "output")
DB_A_PATH = os.path.join(OUT_DIR, "site_a.db")
DB_B_PATH = os.path.join(OUT_DIR, "site_b.db")
GT_PATH = os.path.join(OUT_DIR, "ground_truth.json")


def escape(val):
    """Escape a value for SQL string literal. Returns 'NULL' for None."""
    if val is None:
        return "NULL"
    s = str(val)
    # Escape single quotes by doubling them
    s = s.replace("'", "''")
    return f"'{s}'"


def generate_site_sql(sqlite_path: str, source_tag: str, schema_sql: str, site_label: str) -> str:
    """Generate SQL file content for one site."""
    lines = []
    lines.append(f"-- ============================================================")
    lines.append(f"-- SQL Dump for {site_label}")
    lines.append(f"-- Generated: {datetime.now().isoformat()}")
    lines.append(f"-- Source: {sqlite_path}")
    lines.append(f"-- ============================================================")
    lines.append("")
    lines.append("-- 1. Create schema (safe to run multiple times)")
    lines.append(schema_sql)
    lines.append("")

    conn = sqlite3.connect(sqlite_path)
    conn.row_factory = sqlite3.Row

    # Authors
    authors = [dict(r) for r in conn.execute(
        "SELECT id, name, affiliation, email, source FROM authors"
    ).fetchall()]
    if authors:
        lines.append("-- 2. Insert authors")
        lines.append(f"INSERT INTO authors (id, name, affiliation, email, source) VALUES")
        vals = []
        for a in authors:
            vals.append(
                f"  ({escape(a['id'])}, {escape(a['name'])}, {escape(a.get('affiliation'))}, "
                f"{escape(a.get('email'))}, {escape(a.get('source') or source_tag)})"
            )
        lines.append(",\n".join(vals))
        lines.append("ON CONFLICT (id) DO NOTHING;")
        lines.append(f"-- Authors count: {len(authors)}")
        lines.append("")

    # Papers
    papers = [dict(r) for r in conn.execute(
        "SELECT id, title, year, venue, doi, abstract, source FROM papers"
    ).fetchall()]
    if papers:
        lines.append("-- 3. Insert papers")
        lines.append(f"INSERT INTO papers (id, title, year, venue, doi, abstract, source) VALUES")
        vals = []
        for p in papers:
            yr = 'NULL' if p.get('year') is None else str(p['year'])
            vals.append(
                f"  ({escape(p['id'])}, {escape(p['title'])}, {yr}, "
                f"{escape(p.get('venue'))}, {escape(p.get('doi'))}, "
                f"{escape(p.get('abstract'))}, {escape(p.get('source') or source_tag)})"
            )
        lines.append(",\n".join(vals))
        lines.append("ON CONFLICT (id) DO NOTHING;")
        lines.append(f"-- Papers count: {len(papers)}")
        lines.append("")

    # Paper Authors
    pa_rows = [dict(r) for r in conn.execute(
        "SELECT paper_id, author_id, author_name FROM paper_authors"
    ).fetchall()]
    if pa_rows:
        lines.append("-- 4. Insert paper_authors")
        batch_size = 500
        for i in range(0, len(pa_rows), batch_size):
            batch = pa_rows[i:i+batch_size]
            lines.append(f"INSERT INTO paper_authors (paper_id, author_id, author_name) VALUES")
            vals = []
            for pa in batch:
                vals.append(
                    f"  ({escape(pa['paper_id'])}, {escape(pa['author_id'])}, {escape(pa['author_name'])})"
                )
            lines.append(",\n".join(vals))
            lines.append(f"ON CONFLICT (paper_id, author_id) DO NOTHING;")
            if i % 5000 == 0:
                lines.append(f"-- Progress: {i+len(batch)}/{len(pa_rows)} paper_authors")
        lines.append(f"-- Paper_Authors count: {len(pa_rows)}")
        lines.append("")

    conn.close()

    # Final verification queries
    lines.append("-- 5. Verification queries")
    lines.append("SELECT 'authors' as table_name, COUNT(*) as count FROM authors;")
    lines.append("SELECT 'papers' as table_name, COUNT(*) as count FROM papers;")
    lines.append("SELECT 'paper_authors' as table_name, COUNT(*) as count FROM paper_authors;")
    lines.append("")

    return "\n".join(lines)


def generate_coordinator_sql() -> str:
    """Generate SQL for Coordinator database."""
    lines = []
    lines.append(f"-- ============================================================")
    lines.append(f"-- SQL Dump for Coordinator Database")
    lines.append(f"-- Generated: {datetime.now().isoformat()}")
    lines.append(f"-- ============================================================")
    lines.append("")
    lines.append("-- 1. Create schema (safe to run multiple times)")
    lines.append("""
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

CREATE INDEX IF NOT EXISTS idx_res_decision  ON resolution_results(decision);
CREATE INDEX IF NOT EXISTS idx_res_score     ON resolution_results(score DESC);
CREATE INDEX IF NOT EXISTS idx_res_paper_a   ON resolution_results(paper_a_id);
CREATE INDEX IF NOT EXISTS idx_res_paper_b   ON resolution_results(paper_b_id);
""")
    lines.append("")

    # Ground truth
    if os.path.exists(GT_PATH):
        with open(GT_PATH, "r", encoding="utf-8") as f:
            gt = json.load(f)
        pairs = gt.get("pairs", [])
        if pairs:
            lines.append("-- 2. Create ground_truth table")
            lines.append("""
CREATE TABLE IF NOT EXISTS ground_truth (
    id          SERIAL PRIMARY KEY,
    site_a_id   TEXT,
    site_b_id   TEXT,
    site_a_title TEXT,
    site_b_title TEXT,
    doi         TEXT,
    label       TEXT,
    UNIQUE(site_a_id, site_b_id)
);
""")
            lines.append(f"-- 3. Insert {len(pairs)} ground truth pairs")
            batch_size = 500
            for i in range(0, len(pairs), batch_size):
                batch = pairs[i:i+batch_size]
                lines.append(f"INSERT INTO ground_truth (site_a_id, site_b_id, site_a_title, site_b_title, doi, label) VALUES")
                vals = []
                for p in batch:
                    vals.append(
                        f"  ({escape(p.get('site_a_id'))}, {escape(p.get('site_b_id'))}, "
                        f"{escape(p.get('site_a_title'))}, {escape(p.get('site_b_title'))}, "
                        f"{escape(p.get('doi'))}, {escape(p.get('label'))})"
                    )
                lines.append(",\n".join(vals))
                lines.append("ON CONFLICT DO NOTHING;")
                if i % 2000 == 0:
                    lines.append(f"-- Progress: {i+len(batch)}/{len(pairs)} ground truth pairs")
            lines.append("")
            lines.append("-- 4. Verification")
            lines.append("SELECT COUNT(*) as ground_truth_count FROM ground_truth;")
            lines.append("")

    return "\n".join(lines)


def main():
    print("=" * 60)
    print("  SQL Dump Generator")
    print("  Knowledge Graph Dedup Project")
    print("=" * 60)

    # Schema for site tables
    SCHEMA_SITE = """
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

CREATE INDEX IF NOT EXISTS idx_papers_year   ON papers(year);
CREATE INDEX IF NOT EXISTS idx_papers_venue  ON papers(venue);
CREATE INDEX IF NOT EXISTS idx_papers_doi    ON papers(doi);
CREATE INDEX IF NOT EXISTS idx_authors_name  ON authors(name);
CREATE INDEX IF NOT EXISTS idx_pa_author     ON paper_authors(author_id);
CREATE INDEX IF NOT EXISTS idx_pa_paper      ON paper_authors(paper_id);
"""

    # Generate Site A SQL
    print("\n[1/3] Generating Site A SQL...")
    sql_a = generate_site_sql(DB_A_PATH, "DBLP", SCHEMA_SITE, "Site A (DBLP)")
    out_a = os.path.join(OUT_DIR, "sql_dump_site_a.sql")
    with open(out_a, "w", encoding="utf-8") as f:
        f.write(sql_a)
    size_mb = os.path.getsize(out_a) / (1024 * 1024)
    print(f"     -> Saved: {out_a} ({size_mb:.1f} MB)")

    # Generate Site B SQL
    print("\n[2/3] Generating Site B SQL...")
    sql_b = generate_site_sql(DB_B_PATH, "SemanticScholar", SCHEMA_SITE, "Site B (Semantic Scholar)")
    out_b = os.path.join(OUT_DIR, "sql_dump_site_b.sql")
    with open(out_b, "w", encoding="utf-8") as f:
        f.write(sql_b)
    size_mb = os.path.getsize(out_b) / (1024 * 1024)
    print(f"     -> Saved: {out_b} ({size_mb:.1f} MB)")

    # Generate Coordinator SQL
    print("\n[3/3] Generating Coordinator SQL...")
    sql_coord = generate_coordinator_sql()
    out_coord = os.path.join(OUT_DIR, "sql_dump_coordinator.sql")
    with open(out_coord, "w", encoding="utf-8") as f:
        f.write(sql_coord)
    size_mb = os.path.getsize(out_coord) / (1024 * 1024)
    print(f"     -> Saved: {out_coord} ({size_mb:.1f} MB)")

    print(f"\n{'='*60}")
    print(f"  DONE! Generated 3 SQL dump files.")
    print(f"{'='*60}")
    print(f"\n  Next steps:")
    print(f"  1. Open Supabase Dashboard: https://supabase.com/dashboard/projects")
    print(f"  2. Vào từng project -> SQL Editor")
    print(f"  3. Copy nội dung file SQL tương ứng vào và chạy")
    print(f"")
    print(f"  ├── Project 1 (Site A):     sql_dump_site_a.sql")
    print(f"  ├── Project 2 (Site B):     sql_dump_site_b.sql")
    print(f"  └── Project 3 (Coordinator): sql_dump_coordinator.sql")


if __name__ == "__main__":
    main()
