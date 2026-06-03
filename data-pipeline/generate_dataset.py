"""
generate_dataset.py — Tạo và seed dữ liệu lên Supabase
──────────────────────────────────────────────────────────────
Chạy local:     python generate_dataset.py
Upload Supabase: python generate_dataset.py --upload
"""

import sqlite3, json, random, re, os, argparse
from faker import Faker

fake = Faker()
random.seed(42)

# ── Thư mục output ──────────────────────────────────────────
OUT = os.path.join(os.path.dirname(__file__), "output")
os.makedirs(OUT, exist_ok=True)

DB_A   = os.path.join(OUT, "site_a.db")
DB_B   = os.path.join(OUT, "site_b.db")
GT_FILE = os.path.join(OUT, "ground_truth.json")

# ── Hằng số ─────────────────────────────────────────────────
N_UNIQUE_AUTHORS = 1500
N_UNIQUE_PAPERS  = 9000
N_OVERLAP        = 1000          # papers xuất hiện ở cả 2 site
N_ONLY_A         = 4000          # papers chỉ có ở site A
N_ONLY_B         = 4000          # papers chỉ có ở site B

VENUES = [
    "ACL", "EMNLP", "NAACL", "ICLR", "NeurIPS", "ICML",
    "VLDB", "SIGMOD", "ICDE", "WWW", "KDD", "AAAI",
    "CVPR", "ICCV", "ECCV", "IJCAI", "CIKM", "WSDM",
    "ESWC", "ISWC", "COLING", "ACM MM", "RecSys", "EDBT",
]

KEYWORDS = [
    "deep learning", "graph neural network", "transformer",
    "knowledge graph", "entity resolution", "distributed system",
    "natural language processing", "computer vision", "reinforcement learning",
    "federated learning", "contrastive learning", "pre-trained model",
    "question answering", "named entity recognition", "relation extraction",
    "link prediction", "node classification", "graph embedding",
    "database", "query optimization", "data integration",
    "schema matching", "ontology", "semantic web",
]

# ── Helpers ──────────────────────────────────────────────────

def make_doi(idx):
    return f"10.18653/v{idx // 100}.{idx % 100:04d}"

def abbrev_first(name: str) -> str:
    parts = name.split()
    if len(parts) >= 2:
        return f"{parts[0][0]}. {' '.join(parts[1:])}"
    return name

def abbrev_all_first(name: str) -> str:
    parts = name.split()
    if len(parts) >= 2:
        initials = "".join(p[0] + "." for p in parts[:-1])
        return f"{initials} {parts[-1]}"
    return name

def swap_last_first(name: str) -> str:
    parts = name.split()
    if len(parts) >= 2:
        return f"{parts[-1]}, {' '.join(parts[:-1])}"
    return name

def add_middle_name(name: str) -> str:
    parts = name.split()
    if len(parts) >= 2:
        mid = fake.first_name()[0] + "."
        return f"{parts[0]} {mid} {' '.join(parts[1:])}"
    return name

def strip_middle(name: str) -> str:
    return re.sub(r'\s[A-Z]\.\s', ' ', name).strip()

def make_name_variant(name: str) -> str:
    fns = [
        abbrev_first, abbrev_all_first, swap_last_first,
        add_middle_name, strip_middle,
        lambda n: n.lower().title(),
        lambda n: n,
    ]
    return random.choice(fns)(name)

def make_title_variant(title: str) -> str:
    variants = [
        lambda t: t,
        lambda t: t.replace("Natural Language Processing", "NLP"),
        lambda t: t.replace("Deep Learning", "DL"),
        lambda t: t.replace("Graph Neural Network", "GNN"),
        lambda t: t.replace(" for ", " for the "),
        lambda t: t.replace(" Using ", " via "),
        lambda t: t + ": A Survey" if not t.endswith("Survey") else t,
        lambda t: "A " + t if not t.startswith("A ") else t,
    ]
    return random.choice(variants)(title)

def make_affil_variant(affil: str) -> str:
    variants = [
        lambda a: a,
        lambda a: a.replace("University", "Univ."),
        lambda a: a.replace("Institute of Technology", "Tech"),
        lambda a: a.split(",")[0] if "," in a else a,
        lambda a: a + ", USA" if not a.endswith("USA") else a,
    ]
    return random.choice(variants)(affil)

# ── Tạo dữ liệu gốc ─────────────────────────────────────────

def gen_authors(n):
    authors = []
    for i in range(n):
        name = fake.name()
        affil = f"{fake.company()} University" if random.random() > 0.3 else \
                f"Institute of {fake.bs().title()}"
        authors.append({
            "id": f"auth_{i:04d}",
            "name": name,
            "affiliation": affil,
            "email": fake.email(),
        })
    return authors

def gen_papers(n, authors, start_doi=0):
    papers = []
    for i in range(n):
        n_authors = random.randint(1, 5)
        paper_authors = random.sample(authors, min(n_authors, len(authors)))
        kws = random.sample(KEYWORDS, random.randint(2, 4))
        title_parts = random.sample(kws, 2)
        title = f"{title_parts[0].title()} for {title_parts[1].title()}"
        if random.random() > 0.6:
            title += f": A {random.choice(['Survey', 'Study', 'Framework', 'Benchmark', 'Novel Approach'])}"

        papers.append({
            "id": f"paper_{start_doi + i:05d}",
            "title": title,
            "year": random.randint(2018, 2023),
            "venue": random.choice(VENUES),
            "doi": make_doi(start_doi + i),
            "abstract": fake.paragraph(nb_sentences=4),
            "authors": [a["id"] for a in paper_authors],
            "author_names": [a["name"] for a in paper_authors],
        })
    return papers

# ── SQLite (chạy local) ──────────────────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS authors (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    affiliation TEXT, email TEXT, source TEXT
);
CREATE TABLE IF NOT EXISTS papers (
    id TEXT PRIMARY KEY, title TEXT NOT NULL,
    year INTEGER, venue TEXT, doi TEXT, abstract TEXT, source TEXT
);
CREATE TABLE IF NOT EXISTS paper_authors (
    paper_id TEXT, author_id TEXT, author_name TEXT,
    PRIMARY KEY (paper_id, author_id)
);
CREATE INDEX IF NOT EXISTS idx_papers_year  ON papers(year);
CREATE INDEX IF NOT EXISTS idx_papers_venue ON papers(venue);
CREATE INDEX IF NOT EXISTS idx_papers_doi   ON papers(doi);
CREATE INDEX IF NOT EXISTS idx_authors_name ON authors(name);
"""

def create_db(path):
    if os.path.exists(path):
        os.remove(path)
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    conn.commit()
    return conn

def insert_authors_sqlite(conn, authors, source):
    conn.executemany(
        "INSERT OR IGNORE INTO authors VALUES (?,?,?,?,?)",
        [(a["id"], a["name"], a["affiliation"], a["email"], source) for a in authors]
    )

def insert_papers_sqlite(conn, papers, source):
    conn.executemany(
        "INSERT OR IGNORE INTO papers VALUES (?,?,?,?,?,?,?)",
        [(p["id"], p["title"], p["year"], p["venue"], p["doi"], p["abstract"], source) for p in papers]
    )
    rows = [(p["id"], aid, aname) for p in papers for aid, aname in zip(p["authors"], p["author_names"])]
    conn.executemany("INSERT OR IGNORE INTO paper_authors VALUES (?,?,?)", rows)

# ── Supabase / PostgreSQL (chạy với --upload) ────────────────

def get_pg_conn(database_url: str):
    import psycopg2
    return psycopg2.connect(database_url)

def insert_authors_pg(conn, authors, source):
    cur = conn.cursor()
    cur.executemany(
        "INSERT INTO authors VALUES (%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING",
        [(a["id"], a["name"], a["affiliation"], a["email"], source) for a in authors]
    )
    conn.commit()

def insert_papers_pg(conn, papers, source):
    cur = conn.cursor()
    cur.executemany(
        "INSERT INTO papers VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING",
        [(p["id"], p["title"], p["year"], p["venue"], p["doi"], p["abstract"], source) for p in papers]
    )
    rows = [(p["id"], aid, aname) for p in papers for aid, aname in zip(p["authors"], p["author_names"])]
    cur.executemany(
        "INSERT INTO paper_authors VALUES (%s,%s,%s) ON CONFLICT (paper_id, author_id) DO NOTHING",
        rows
    )
    conn.commit()

# ── MAIN ─────────────────────────────────────────────────────

def generate_data():
    print("=" * 60)
    print("  Knowledge Graph Dataset Generator")
    print("=" * 60)

    print("\n[1/5] Generating authors pool...")
    all_authors = gen_authors(N_UNIQUE_AUTHORS)

    print("[2/5] Generating papers pool...")
    overlap_papers = gen_papers(N_OVERLAP, all_authors, start_doi=0)
    only_a_papers  = gen_papers(N_ONLY_A,  all_authors, start_doi=N_OVERLAP)
    only_b_papers  = gen_papers(N_ONLY_B,  all_authors, start_doi=N_OVERLAP + N_ONLY_A)

    print("[3/5] Creating duplicate variants for overlap papers...")
    overlap_variants = []
    ground_truth = []

    for p in overlap_papers:
        variant_id = p["id"] + "_dup"
        variant_authors = [make_name_variant(n) for n in p["author_names"]]
        variant_affils  = [make_affil_variant(
            all_authors[i % len(all_authors)]["affiliation"]
        ) for i in range(len(p["authors"]))]

        variant = {
            "id": variant_id,
            "title": make_title_variant(p["title"]),
            "year": p["year"],
            "venue": p["venue"] + " " + str(p["year"]) if random.random() > 0.5 else p["venue"],
            "doi": p["doi"],
            "abstract": p["abstract"],
            "authors": [a + "_v" for a in p["authors"]],
            "author_names": variant_authors,
        }
        overlap_variants.append(variant)
        ground_truth.append({
            "site_a_id": p["id"], "site_b_id": variant_id,
            "site_a_title": p["title"], "site_b_title": variant["title"],
            "doi": p["doi"], "label": "DUPLICATE"
        })

    authors_b = [{
        "id": a["id"] + "_v", "name": make_name_variant(a["name"]),
        "affiliation": make_affil_variant(a["affiliation"]), "email": a["email"],
    } for a in all_authors]

    return all_authors, authors_b, overlap_papers, only_a_papers, overlap_variants, only_b_papers, ground_truth


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--upload", action="store_true",
                        help="Upload trực tiếp lên Supabase thay vì ghi SQLite local")
    parser.add_argument("--db-site-a", default=os.environ.get("DATABASE_URL_SITE_A"),
                        help="PostgreSQL connection string cho Supabase Project 1 (Site A)")
    parser.add_argument("--db-site-b", default=os.environ.get("DATABASE_URL_SITE_B"),
                        help="PostgreSQL connection string cho Supabase Project 2 (Site B)")
    args = parser.parse_args()

    all_authors, authors_b, overlap_papers, only_a_papers, \
        overlap_variants, only_b_papers, ground_truth = generate_data()

    if args.upload:
        # ── Upload lên Supabase ──────────────────────────────
        if not args.db_site_a or not args.db_site_b:
            print("\n❌ Thiếu connection string!")
            print("   Dùng: --db-site-a 'postgresql://...' --db-site-b 'postgresql://...'")
            print("   Hoặc set env: DATABASE_URL_SITE_A, DATABASE_URL_SITE_B")
            return

        print("\n[4/5] Uploading to Supabase Project 1 (Site A — DBLP)...")
        conn_a = get_pg_conn(args.db_site_a)
        insert_authors_pg(conn_a, all_authors, "DBLP")
        insert_papers_pg(conn_a, overlap_papers, "DBLP")
        insert_papers_pg(conn_a, only_a_papers, "DBLP")
        cur = conn_a.cursor()
        cur.execute("SELECT COUNT(*) FROM papers")
        count_a = cur.fetchone()[0]
        conn_a.close()
        print(f"   ✓ Site A: {count_a} papers uploaded")

        print("[4/5] Uploading to Supabase Project 2 (Site B — Semantic Scholar)...")
        conn_b = get_pg_conn(args.db_site_b)
        insert_authors_pg(conn_b, authors_b, "SemanticScholar")
        insert_papers_pg(conn_b, overlap_variants, "SemanticScholar")
        insert_papers_pg(conn_b, only_b_papers, "SemanticScholar")
        cur = conn_b.cursor()
        cur.execute("SELECT COUNT(*) FROM papers")
        count_b = cur.fetchone()[0]
        conn_b.close()
        print(f"   ✓ Site B: {count_b} papers uploaded")

    else:
        # ── Ghi SQLite local ─────────────────────────────────
        print("\n[4/5] Writing Site A database (local SQLite)...")
        conn_a = create_db(DB_A)
        insert_authors_sqlite(conn_a, all_authors, "DBLP")
        insert_papers_sqlite(conn_a, overlap_papers, "DBLP")
        insert_papers_sqlite(conn_a, only_a_papers, "DBLP")
        conn_a.commit()
        count_a = conn_a.execute("SELECT COUNT(*) FROM papers").fetchone()[0]
        conn_a.close()

        print("[4/5] Writing Site B database (local SQLite)...")
        conn_b = create_db(DB_B)
        insert_authors_sqlite(conn_b, authors_b, "SemanticScholar")
        insert_papers_sqlite(conn_b, overlap_variants, "SemanticScholar")
        insert_papers_sqlite(conn_b, only_b_papers, "SemanticScholar")
        conn_b.commit()
        count_b = conn_b.execute("SELECT COUNT(*) FROM papers").fetchone()[0]
        conn_b.close()

    # ── Lưu ground truth (luôn ghi ra file) ──────────────────
    print("[5/5] Saving ground truth...")
    with open(GT_FILE, "w", encoding="utf-8") as f:
        json.dump({"total_duplicates": len(ground_truth), "pairs": ground_truth}, f, indent=2, ensure_ascii=False)

    print("\n" + "=" * 60)
    print("  DONE!")
    print(f"  Site A: {count_a} papers")
    print(f"  Site B: {count_b} papers")
    print(f"  Duplicates: {len(ground_truth)} pairs")
    print(f"  Ground truth: {GT_FILE}")
    if not args.upload:
        print(f"\n  Tip: Dùng --upload để seed thẳng lên Supabase")
    print("=" * 60)


if __name__ == "__main__":
    main()
