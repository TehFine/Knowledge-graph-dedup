"""
Site B — Semantic Scholar Node
FastAPI service cung cấp dữ liệu từ site_b.db
Port: 8002
"""

import sqlite3, os, time
from contextlib import contextmanager
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional

DB_PATH = os.environ.get("DB_PATH", "./data/site_b.db")
SITE_ID = "site_b"

app = FastAPI(title="Site B — Semantic Scholar", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

@app.get("/health")
def health():
    return {"site": SITE_ID, "status": "online", "ts": time.time()}

@app.get("/papers")
def list_papers(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    year: Optional[int] = None,
    venue: Optional[str] = None,
):
    offset = (page - 1) * size
    filters, params = [], []
    if year:
        filters.append("year = ?"); params.append(year)
    if venue:
        filters.append("venue LIKE ?"); params.append(f"%{venue}%")
    where = ("WHERE " + " AND ".join(filters)) if filters else ""

    with get_db() as db:
        total = db.execute(f"SELECT COUNT(*) FROM papers {where}", params).fetchone()[0]
        rows  = db.execute(
            f"SELECT * FROM papers {where} LIMIT ? OFFSET ?",
            params + [size, offset]
        ).fetchall()
    return {
        "site": SITE_ID,
        "total": total,
        "page": page,
        "size": size,
        "data": [dict(r) for r in rows],
    }

@app.get("/papers/{paper_id}")
def get_paper(paper_id: str):
    with get_db() as db:
        row = db.execute("SELECT * FROM papers WHERE id=?", (paper_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Paper not found")
        authors = db.execute(
            "SELECT author_id, author_name FROM paper_authors WHERE paper_id=?",
            (paper_id,)
        ).fetchall()
    result = dict(row)
    result["authors"] = [dict(a) for a in authors]
    return result

@app.get("/authors")
def list_authors(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    name: Optional[str] = None,
):
    offset = (page - 1) * size
    filters, params = [], []
    if name:
        filters.append("name LIKE ?"); params.append(f"%{name}%")
    where = ("WHERE " + " AND ".join(filters)) if filters else ""

    with get_db() as db:
        total = db.execute(f"SELECT COUNT(*) FROM authors {where}", params).fetchone()[0]
        rows  = db.execute(
            f"SELECT * FROM authors {where} LIMIT ? OFFSET ?",
            params + [size, offset]
        ).fetchall()
    return {
        "site": SITE_ID,
        "total": total,
        "page": page,
        "size": size,
        "data": [dict(r) for r in rows],
    }

@app.get("/candidates")
def get_candidates(
    year: Optional[int] = None,
    name_prefix: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
):
    filters, params = [], []
    if year:
        filters.append("p.year = ?"); params.append(year)
    if name_prefix:
        filters.append("pa.author_name LIKE ?"); params.append(f"{name_prefix}%")
    where = ("WHERE " + " AND ".join(filters)) if filters else ""

    with get_db() as db:
        rows = db.execute(f"""
            SELECT DISTINCT p.id, p.title, p.year, p.venue, p.doi,
                   pa.author_name
            FROM papers p
            JOIN paper_authors pa ON p.id = pa.paper_id
            {where}
            LIMIT ?
        """, params + [limit]).fetchall()

    return {"site": SITE_ID, "count": len(rows), "data": [dict(r) for r in rows]}

@app.get("/stats")
def stats():
    with get_db() as db:
        n_papers  = db.execute("SELECT COUNT(*) FROM papers").fetchone()[0]
        n_authors = db.execute("SELECT COUNT(*) FROM authors").fetchone()[0]
        by_year   = db.execute(
            "SELECT year, COUNT(*) as cnt FROM papers GROUP BY year ORDER BY year"
        ).fetchall()
        by_venue  = db.execute(
            "SELECT venue, COUNT(*) as cnt FROM papers GROUP BY venue ORDER BY cnt DESC LIMIT 10"
        ).fetchall()
    return {
        "site": SITE_ID,
        "papers": n_papers,
        "authors": n_authors,
        "by_year": [dict(r) for r in by_year],
        "top_venues": [dict(r) for r in by_venue],
    }

# ── Graph Neighbors (for distributed traversal) ──────────────
@app.get("/graph/neighbors")
def graph_neighbors(paper_id: str):
    """
    Trả về neighbors của 1 paper trong local graph.
    Neighbor = papers cùng author (co-authorship graph).
    Dùng cho BFS/DFS distributed traversal.
    """
    with get_db() as db:
        authors = db.execute(
            "SELECT author_id FROM paper_authors WHERE paper_id=?",
            (paper_id,)
        ).fetchall()
        author_ids = [a["author_id"] for a in authors]
        if not author_ids:
            return {"paper_id": paper_id, "site": SITE_ID, "neighbors": []}

        placeholders = ",".join(["?"] * len(author_ids))
        rows = db.execute(f"""
            SELECT DISTINCT p.id, p.title, p.year, p.venue, p.doi,
                   pa.author_id as shared_author_id, pa.author_name as shared_author
            FROM papers p
            JOIN paper_authors pa ON p.id = pa.paper_id
            WHERE pa.author_id IN ({placeholders}) AND p.id != ?
            LIMIT 50
        """, author_ids + [paper_id]).fetchall()

    return {
        "paper_id": paper_id,
        "site": SITE_ID,
        "neighbors": [dict(r) for r in rows],
        "edge_type": "co_authorship",
    }

# ── Graph Edges (all co-authorship edges) ─────────────────────
@app.get("/graph/edges")
def graph_edges(limit: int = Query(500, ge=1, le=5000)):
    """
    Trả về tất cả edges trong local graph (co-authorship).
    Edge = (paper_i, paper_j) nếu share ít nhất 1 author.
    Dùng cho partitioning analysis và topology.
    """
    with get_db() as db:
        rows = db.execute(f"""
            SELECT DISTINCT pa1.paper_id as source, pa2.paper_id as target,
                   pa1.author_id as shared_author, pa1.author_name
            FROM paper_authors pa1
            JOIN paper_authors pa2 ON pa1.author_id = pa2.author_id
                                   AND pa1.paper_id < pa2.paper_id
            LIMIT ?
        """, (limit,)).fetchall()

    return {
        "site": SITE_ID,
        "edge_count": len(rows),
        "edges": [dict(r) for r in rows],
        "edge_type": "co_authorship",
    }

# ── Document Fragment (for multi-model integration) ───────────
@app.get("/documents/{paper_id}")
def get_document(paper_id: str):
    """
    Trả về document fragment cho 1 paper.
    Schema khác Site A: full_name, org thay vì name, affiliation.
    Đây là phần "Document" trong Multi-Model Integration.
    """
    with get_db() as db:
        paper = db.execute("SELECT * FROM papers WHERE id=?", (paper_id,)).fetchone()
        if not paper:
            raise HTTPException(404, "Paper not found")
        authors = db.execute(
            "SELECT author_id, author_name FROM paper_authors WHERE paper_id=?",
            (paper_id,)
        ).fetchall()

    doc = dict(paper)
    doc["authors"] = [dict(a) for a in authors]
    doc["_meta"] = {
        "source": SITE_ID,
        "model": "document",
        "schema_version": "1.0",
        "field_mapping": {
            "title": "title",
            "authors": "paper_authors.author_name",
            "venue": "venue",
            "year": "year",
            "identifier": "doi",
        }
    }
    return doc
