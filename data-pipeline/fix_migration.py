"""
fix_migration.py — Chạy migration từng bước nhỏ, in lỗi ra màn hình
Dùng để debug và fix paper_authors + Site B + Coordinator
"""
import os, sys, sqlite3, traceback
from dotenv import load_dotenv
from psycopg2.extras import execute_values
import psycopg2

load_dotenv("d:\\knowledge-graph-dedup\\.env")

DATABASE_URL_SITE_A   = os.environ["DATABASE_URL_SITE_A"]
DATABASE_URL_SITE_B   = os.environ["DATABASE_URL_SITE_B"]
DATABASE_URL_COORDINATOR = os.environ["DATABASE_URL_COORDINATOR"]

OUT_DIR  = "d:\\knowledge-graph-dedup\\data-pipeline\\output"
DB_A     = os.path.join(OUT_DIR, "site_a.db")
DB_B     = os.path.join(OUT_DIR, "site_b.db")

BATCH = 200   # nhỏ hơn để tránh timeout trên pooler


def pg(url):
    conn = psycopg2.connect(url, connect_timeout=30)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("SET statement_timeout = 0")   # tắt timeout
    return conn


def safe_executemany(cur, sql, rows, label):
    """Insert rows theo từng batch nhỏ, in progress."""
    total = len(rows)
    inserted = 0
    for i in range(0, total, BATCH):
        batch = rows[i:i+BATCH]
        try:
            execute_values(cur, sql, batch)
            cur.connection.commit()
            inserted += len(batch)
            pct = inserted * 100 // total
            print(f"  {label}: {inserted}/{total} ({pct}%)", end="\r", flush=True)
        except Exception as e:
            cur.connection.rollback()
            print(f"\n  WARN batch {i//BATCH} failed: {e} — skipping")
    print(f"\n  OK {label}: {inserted}/{total} rows inserted")


def migrate_site(db_path, pg_url, label, source):
    print(f"\n{'='*55}\n  {label}\n{'='*55}")

    sqlite_conn = sqlite3.connect(db_path)
    sqlite_conn.row_factory = sqlite3.Row
    authors      = [dict(r) for r in sqlite_conn.execute("SELECT * FROM authors").fetchall()]
    papers       = [dict(r) for r in sqlite_conn.execute("SELECT * FROM papers").fetchall()]
    paper_authors = [dict(r) for r in sqlite_conn.execute("SELECT * FROM paper_authors").fetchall()]
    sqlite_conn.close()
    print(f"  SQLite: {len(authors)} authors / {len(papers)} papers / {len(paper_authors)} paper_authors")

    conn = pg(pg_url)
    cur  = conn.cursor()

    # Schema
    cur.execute("""
        CREATE TABLE IF NOT EXISTS authors (
            id TEXT PRIMARY KEY, name TEXT NOT NULL,
            affiliation TEXT, email TEXT, source TEXT);
        CREATE TABLE IF NOT EXISTS papers (
            id TEXT PRIMARY KEY, title TEXT NOT NULL,
            year INTEGER, venue TEXT, doi TEXT, abstract TEXT, source TEXT);
        CREATE TABLE IF NOT EXISTS paper_authors (
            paper_id TEXT, author_id TEXT, author_name TEXT,
            PRIMARY KEY (paper_id, author_id));
    """)
    conn.commit()

    # Check existing counts
    cur.execute("SELECT COUNT(*) FROM authors"); a_cnt = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM papers");  p_cnt = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM paper_authors"); pa_cnt = cur.fetchone()[0]
    print(f"  Current DB: {a_cnt} authors / {p_cnt} papers / {pa_cnt} paper_authors")

    # Authors
    if a_cnt < len(authors):
        rows = [(a["id"], a["name"], a.get("affiliation"), a.get("email"), a.get("source") or source) for a in authors]
        safe_executemany(cur, "INSERT INTO authors VALUES %s ON CONFLICT (id) DO NOTHING", rows, "authors")
    else:
        print(f"  SKIP authors (already {a_cnt})")

    # Papers
    if p_cnt < len(papers):
        rows = [(p["id"], p["title"], p.get("year"), p.get("venue"), p.get("doi"), p.get("abstract"), p.get("source") or source) for p in papers]
        safe_executemany(cur, "INSERT INTO papers VALUES %s ON CONFLICT (id) DO NOTHING", rows, "papers")
    else:
        print(f"  SKIP papers (already {p_cnt})")

    # Paper_authors
    if pa_cnt < len(paper_authors):
        rows = [(pa["paper_id"], pa["author_id"], pa["author_name"]) for pa in paper_authors]
        safe_executemany(cur, "INSERT INTO paper_authors VALUES %s ON CONFLICT (paper_id, author_id) DO NOTHING", rows, "paper_authors")
    else:
        print(f"  SKIP paper_authors (already {pa_cnt})")

    # Verify
    cur.execute("SELECT COUNT(*) FROM authors"); a2 = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM papers");  p2 = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM paper_authors"); pa2 = cur.fetchone()[0]
    print(f"  Final: {a2} authors / {p2} papers / {pa2} paper_authors")
    conn.close()


def init_coordinator(pg_url):
    print(f"\n{'='*55}\n  COORDINATOR\n{'='*55}")
    conn = pg(pg_url)
    cur  = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS resolution_results (
            id SERIAL PRIMARY KEY, paper_a_id TEXT, paper_b_id TEXT,
            title_a TEXT, title_b TEXT, doi_a TEXT, doi_b TEXT,
            score REAL, decision TEXT, breakdown TEXT, created_at DOUBLE PRECISION);
        CREATE TABLE IF NOT EXISTS jobs (
            id SERIAL PRIMARY KEY, status TEXT DEFAULT 'pending',
            year INTEGER, total_pairs INTEGER DEFAULT 0,
            processed INTEGER DEFAULT 0, merged INTEGER DEFAULT 0,
            reviewed INTEGER DEFAULT 0, separated INTEGER DEFAULT 0,
            site_a_ok INTEGER DEFAULT 1, site_b_ok INTEGER DEFAULT 1,
            started_at DOUBLE PRECISION, finished_at DOUBLE PRECISION);
        CREATE TABLE IF NOT EXISTS ground_truth (
            id SERIAL PRIMARY KEY, site_a_id TEXT, site_b_id TEXT,
            site_a_title TEXT, site_b_title TEXT, doi TEXT, label TEXT,
            UNIQUE(site_a_id, site_b_id));
    """)
    conn.commit()
    print("  OK Schema created")

    # Load ground truth
    import json
    gt_path = os.path.join(OUT_DIR, "ground_truth.json")
    with open(gt_path) as f:
        gt = json.load(f)
    pairs = gt.get("pairs", [])
    print(f"  Loading {len(pairs)} ground truth pairs...")

    cur.execute("SELECT COUNT(*) FROM ground_truth"); existing = cur.fetchone()[0]
    if existing < len(pairs):
        rows = [(p["site_a_id"], p["site_b_id"], p.get("site_a_title"), p.get("site_b_title"), p.get("doi"), p.get("label")) for p in pairs]
        safe_executemany(cur, "INSERT INTO ground_truth (site_a_id,site_b_id,site_a_title,site_b_title,doi,label) VALUES %s ON CONFLICT (site_a_id,site_b_id) DO NOTHING", rows, "ground_truth")
    else:
        print(f"  SKIP ground_truth (already {existing})")

    cur.execute("SELECT COUNT(*) FROM resolution_results"); rr = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM jobs"); jb = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM ground_truth"); gt_cnt = cur.fetchone()[0]
    print(f"  Final: {rr} resolution_results / {jb} jobs / {gt_cnt} ground_truth")
    conn.close()


if __name__ == "__main__":
    print("="*55)
    print("  Knowledge Graph — Supabase Migration (v2)")
    print("="*55)
    try:
        migrate_site(DB_A, DATABASE_URL_SITE_A, "Site A (DBLP)", "DBLP")
        migrate_site(DB_B, DATABASE_URL_SITE_B, "Site B (Semantic Scholar)", "SemanticScholar")
        init_coordinator(DATABASE_URL_COORDINATOR)
        print(f"\n{'='*55}")
        print("  ALL MIGRATIONS COMPLETE!")
        print("="*55)
    except Exception:
        traceback.print_exc()
        sys.exit(1)
