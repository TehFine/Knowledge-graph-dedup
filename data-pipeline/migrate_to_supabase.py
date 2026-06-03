"""
migrate_to_supabase.py — Đọc dữ liệu từ SQLite local và upload lên Supabase
────────────────────────────────────────────────────────────────────────────
Usage:
    cd data-pipeline
    python migrate_to_supabase.py

Yêu cầu:
    - File .env ở thư mục gốc project với các biến:
        DATABASE_URL_SITE_A, DATABASE_URL_SITE_B, DATABASE_URL_COORDINATOR
    - File SQLite: output/site_a.db, output/site_b.db
"""

import os, sys, sqlite3, json
from contextlib import contextmanager
from dotenv import load_dotenv
from psycopg2.extras import execute_values

# Load .env từ thư mục gốc project (cấp trên của data-pipeline)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dotenv_path = os.path.join(PROJECT_ROOT, ".env")
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)
    print(f"OK Loaded .env from {dotenv_path}")
else:
    print(f"FAIL .env file not found at {dotenv_path}")
    sys.exit(1)

# ── Connection strings ───────────────────────────────────────
DATABASE_URL_SITE_A = os.environ.get("DATABASE_URL_SITE_A")
DATABASE_URL_SITE_B = os.environ.get("DATABASE_URL_SITE_B")
DATABASE_URL_COORDINATOR = os.environ.get("DATABASE_URL_COORDINATOR")

if not all([DATABASE_URL_SITE_A, DATABASE_URL_SITE_B, DATABASE_URL_COORDINATOR]):
    print("FAIL Missing one or more DATABASE_URL_* environment variables!")
    print("  Check your .env file has: DATABASE_URL_SITE_A, DATABASE_URL_SITE_B, DATABASE_URL_COORDINATOR")
    sys.exit(1)

# ── Paths ─────────────────────────────────────────────────────
OUT_DIR = os.path.join(os.path.dirname(__file__), "output")
DB_A_PATH = os.path.join(OUT_DIR, "site_a.db")
DB_B_PATH = os.path.join(OUT_DIR, "site_b.db")

# ── Schema SQL (từ supabase/ folder) ─────────────────────────
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

SCHEMA_COORDINATOR = """
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
"""


# ── Helpers ──────────────────────────────────────────────────

def get_pg_conn(database_url: str):
    """Kết nối PostgreSQL (autocommit mặc định là False — an toàn với PgBouncer)."""
    import psycopg2
    return psycopg2.connect(database_url)


def create_tables(conn, schema_sql: str, label: str):
    """Tạo bảng từ schema SQL."""
    cur = conn.cursor()
    try:
        cur.execute(schema_sql)
        conn.commit()
        print(f"  OK Tables created/verified for {label}")
    except Exception as e:
        conn.rollback()
        print(f"  FAIL Error creating tables for {label}: {e}")
        raise


def count_table(cur, table: str) -> int:
    """Đếm số dòng trong bảng."""
    cur.execute(f"SELECT COUNT(*) FROM {table}")
    return cur.fetchone()[0]


# ── Migration functions ──────────────────────────────────────

def migrate_site(sqlite_path: str, pg_url: str, site_label: str, source_tag: str):
    """Migrate dữ liệu từ SQLite lên PostgreSQL cho 1 site."""
    print(f"\n{'='*60}")
    print(f"  Migrating {site_label} ({source_tag})")
    print(f"  SQLite: {sqlite_path}")
    print(f"{'='*60}")

    # Kết nối SQLite
    if not os.path.exists(sqlite_path):
        print(f"  FAIL SQLite file not found: {sqlite_path}")
        return

    sqlite_conn = sqlite3.connect(sqlite_path)
    sqlite_conn.row_factory = sqlite3.Row

    # Đọc dữ liệu từ SQLite
    print(f"\n  [1/4] Reading data from SQLite...")

    authors = [dict(r) for r in sqlite_conn.execute(
        "SELECT id, name, affiliation, email, source FROM authors"
    ).fetchall()]
    print(f"       -> {len(authors)} authors")

    papers = [dict(r) for r in sqlite_conn.execute(
        "SELECT id, title, year, venue, doi, abstract, source FROM papers"
    ).fetchall()]
    print(f"       -> {len(papers)} papers")

    paper_authors = [dict(r) for r in sqlite_conn.execute(
        "SELECT paper_id, author_id, author_name FROM paper_authors"
    ).fetchall()]
    print(f"       -> {len(paper_authors)} paper_authors")

    # Kết nối PostgreSQL và tạo bảng
    print(f"  [2/4] Connecting to Supabase and creating tables...")
    pg_conn = get_pg_conn(pg_url)
    create_tables(pg_conn, SCHEMA_SITE, site_label)
    cur = pg_conn.cursor()

    # Insert authors
    print(f"  [3/4] Inserting data into Supabase...")
    try:
        batch_size = 500
        author_rows = [(a["id"], a["name"], a.get("affiliation"), a.get("email"), a.get("source") or source_tag) for a in authors]
        for i in range(0, len(author_rows), batch_size):
            batch = author_rows[i:i+batch_size]
            execute_values(
                cur,
                """INSERT INTO authors (id, name, affiliation, email, source)
                   VALUES %s
                   ON CONFLICT (id) DO NOTHING""",
                batch
            )
        pg_conn.commit()
        print(f"       OK {len(authors)} authors inserted")

        # Insert papers
        paper_rows = [(p["id"], p["title"], p.get("year"), p.get("venue"), p.get("doi"), p.get("abstract"), p.get("source") or source_tag) for p in papers]
        for i in range(0, len(paper_rows), batch_size):
            batch = paper_rows[i:i+batch_size]
            execute_values(
                cur,
                """INSERT INTO papers (id, title, year, venue, doi, abstract, source)
                   VALUES %s
                   ON CONFLICT (id) DO NOTHING""",
                batch
            )
        pg_conn.commit()
        print(f"       OK {len(papers)} papers inserted")

        # Insert paper_authors
        pa_rows = [(pa["paper_id"], pa["author_id"], pa["author_name"]) for pa in paper_authors]
        for i in range(0, len(pa_rows), batch_size):
            batch = pa_rows[i:i+batch_size]
            execute_values(
                cur,
                """INSERT INTO paper_authors (paper_id, author_id, author_name)
                   VALUES %s
                   ON CONFLICT (paper_id, author_id) DO NOTHING""",
                batch
            )
        pg_conn.commit()
        print(f"       OK {len(paper_authors)} paper_authors inserted")

    except Exception as e:
        pg_conn.rollback()
        print(f"  FAIL Error during insert: {e}")
        raise

    # Verify
    print(f"  [4/4] Verifying...")
    cur.execute("SELECT COUNT(*) FROM authors")
    print(f"       OK Authors in Supabase: {cur.fetchone()[0]}")
    cur.execute("SELECT COUNT(*) FROM papers")
    print(f"       OK Papers in Supabase: {cur.fetchone()[0]}")
    cur.execute("SELECT COUNT(*) FROM paper_authors")
    print(f"       OK Paper_Authors in Supabase: {cur.fetchone()[0]}")

    sqlite_conn.close()
    pg_conn.close()
    print(f"  OK {site_label} migration complete!")


def init_coordinator(pg_url: str):
    """Khởi tạo Coordinator database với schema."""
    print(f"\n{'='*60}")
    print(f"  Initializing Coordinator Database")
    print(f"{'='*60}")

    print(f"\n  [1/2] Connecting to Supabase Coordinator...")
    pg_conn = get_pg_conn(pg_url)
    create_tables(pg_conn, SCHEMA_COORDINATOR, "Coordinator")

    print(f"  [2/2] Verifying...")
    cur = pg_conn.cursor()
    cur.execute("SELECT COUNT(*) FROM resolution_results")
    print(f"       OK resolution_results table: {cur.fetchone()[0]} rows")
    cur.execute("SELECT COUNT(*) FROM jobs")
    print(f"       OK jobs table: {cur.fetchone()[0]} rows")
    pg_conn.commit()

    pg_conn.close()
    print(f"  OK Coordinator database initialized!")


def upload_ground_truth(pg_url: str):
    """Upload ground_truth.json vào Coordinator (như 1 bảng tham chiếu)."""
    gt_path = os.path.join(OUT_DIR, "ground_truth.json")
    if not os.path.exists(gt_path):
        print(f"\n  WARN Ground truth file not found at {gt_path}, skipping...")
        return

    print(f"\n  Uploading ground truth data to Coordinator...")

    with open(gt_path, "r", encoding="utf-8") as f:
        gt = json.load(f)

    pg_conn = get_pg_conn(pg_url)
    cur = pg_conn.cursor()

    # Tạo bảng ground_truth nếu chưa có
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ground_truth (
            id          SERIAL PRIMARY KEY,
            site_a_id   TEXT,
            site_b_id   TEXT,
            site_a_title TEXT,
            site_b_title TEXT,
            doi         TEXT,
            label       TEXT
        )
    """)
    pg_conn.commit()

    try:
        batch_size = 500
        pairs = gt.get("pairs", [])
        print(f"       -> {len(pairs)} ground truth pairs to upload")

        rows = [(p["site_a_id"], p["site_b_id"], p.get("site_a_title"), p.get("site_b_title"), p.get("doi"), p.get("label")) for p in pairs]
        for i in range(0, len(rows), batch_size):
            batch = rows[i:i+batch_size]
            execute_values(
                cur,
                """INSERT INTO ground_truth (site_a_id, site_b_id, site_a_title, site_b_title, doi, label)
                   VALUES %s
                   ON CONFLICT DO NOTHING""",
                batch
            )
        pg_conn.commit()
        cur.execute("SELECT COUNT(*) FROM ground_truth")
        print(f"       OK Ground truth uploaded: {cur.fetchone()[0]} pairs")
        pg_conn.commit()
    except Exception as e:
        pg_conn.rollback()
        print(f"  FAIL Error uploading ground truth: {e}")
    finally:
        pg_conn.close()


# ── MAIN ─────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  Local -> Supabase Migration Tool")
    print("  Knowledge Graph Dedup Project")
    print("=" * 60)

    print(f"\nProject root: {PROJECT_ROOT}")
    print(f"Output dir:   {OUT_DIR}")

    print(f"\nDATABASE_URL_SITE_A:      {DATABASE_URL_SITE_A[:40]}...")
    print(f"DATABASE_URL_SITE_B:      {DATABASE_URL_SITE_B[:40]}...")
    print(f"DATABASE_URL_COORDINATOR: {DATABASE_URL_COORDINATOR[:40]}...")

    # 1. Migrate Site A
    migrate_site(DB_A_PATH, DATABASE_URL_SITE_A, "Site A (DBLP)", "DBLP")

    # 2. Migrate Site B
    migrate_site(DB_B_PATH, DATABASE_URL_SITE_B, "Site B (Semantic Scholar)", "SemanticScholar")

    # 3. Initialize Coordinator
    init_coordinator(DATABASE_URL_COORDINATOR)

    # 4. Upload ground truth to Coordinator
    upload_ground_truth(DATABASE_URL_COORDINATOR)

    print(f"\n{'='*60}")
    print(f"  ALL MIGRATIONS COMPLETE!")
    print(f"{'='*60}")
    print(f"\nNext steps:")
    print(f"  1. Start backend services: docker-compose up -d")
    print(f"  2. Open frontend: http://localhost:3000")
    print(f"  3. Run entity resolution via API: POST /resolution/start")


if __name__ == "__main__":
    main()
