"""
Site B — Semantic Scholar Node
FastAPI service cung cấp dữ liệu từ Supabase Project 2 (PostgreSQL)
Port: 8002
"""

import os, time
from contextlib import contextmanager
from fastapi import FastAPI, Query, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")
SITE_ID = "site_b"

app = FastAPI(title="Site B — Semantic Scholar", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Ensure CORS headers on ALL responses, even 500 errors ──
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"},
        headers={"Access-Control-Allow-Origin": "*"},
    )

@contextmanager
def get_db():
    conn = psycopg2.connect(DATABASE_URL)
    try:
        yield conn
    finally:
        conn.close()

def fetchall_dict(cursor):
    cols = [desc[0] for desc in cursor.description]
    return [dict(zip(cols, row)) for row in cursor.fetchall()]

def fetchone_dict(cursor):
    cols = [desc[0] for desc in cursor.description]
    row = cursor.fetchone()
    return dict(zip(cols, row)) if row else None

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
        filters.append("year = %s"); params.append(year)
    if venue:
        filters.append("venue LIKE %s"); params.append(f"%{venue}%")
    where = ("WHERE " + " AND ".join(filters)) if filters else ""

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(f"SELECT COUNT(*) FROM papers {where}", params)
        total = cur.fetchone()[0]
        cur.execute(
            f"SELECT * FROM papers {where} LIMIT %s OFFSET %s",
            params + [size, offset]
        )
        rows = fetchall_dict(cur)
    return {"site": SITE_ID, "total": total, "page": page, "size": size, "data": rows}

@app.get("/papers/{paper_id}")
def get_paper(paper_id: str):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM papers WHERE id=%s", (paper_id,))
        row = fetchone_dict(cur)
        if not row:
            raise HTTPException(404, "Paper not found")
        cur.execute(
            "SELECT author_id, author_name FROM paper_authors WHERE paper_id=%s",
            (paper_id,)
        )
        authors = fetchall_dict(cur)
    row["authors"] = authors
    return row

@app.get("/authors")
def list_authors(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    name: Optional[str] = None,
):
    offset = (page - 1) * size
    filters, params = [], []
    if name:
        filters.append("name LIKE %s"); params.append(f"%{name}%")
    where = ("WHERE " + " AND ".join(filters)) if filters else ""

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(f"SELECT COUNT(*) FROM authors {where}", params)
        total = cur.fetchone()[0]
        cur.execute(f"SELECT * FROM authors {where} LIMIT %s OFFSET %s", params + [size, offset])
        rows = fetchall_dict(cur)
    return {"site": SITE_ID, "total": total, "page": page, "size": size, "data": rows}

@app.get("/candidates")
def get_candidates(
    year: Optional[int] = None,
    name_prefix: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
):
    filters, params = [], []
    if year:
        filters.append("p.year = %s"); params.append(year)
    if name_prefix:
        filters.append("pa.author_name LIKE %s"); params.append(f"{name_prefix}%")
    where = ("WHERE " + " AND ".join(filters)) if filters else ""

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(f"""
            SELECT DISTINCT p.id, p.title, p.year, p.venue, p.doi,
                   pa.author_name
            FROM papers p
            JOIN paper_authors pa ON p.id = pa.paper_id
            {where}
            LIMIT %s
        """, params + [limit])
        rows = fetchall_dict(cur)

    return {"site": SITE_ID, "count": len(rows), "data": rows}

@app.get("/stats")
def stats():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM papers")
        n_papers = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM authors")
        n_authors = cur.fetchone()[0]
        cur.execute("SELECT year, COUNT(*) as cnt FROM papers GROUP BY year ORDER BY year")
        by_year = fetchall_dict(cur)
        cur.execute("SELECT venue, COUNT(*) as cnt FROM papers GROUP BY venue ORDER BY cnt DESC LIMIT 10")
        by_venue = fetchall_dict(cur)
    return {
        "site": SITE_ID,
        "papers": n_papers,
        "authors": n_authors,
        "by_year": by_year,
        "top_venues": by_venue,
    }

# ── Graph Neighbors (for distributed traversal) ──────────────
@app.get("/graph/neighbors")
def graph_neighbors(paper_id: str):
    """
    Trả về neighbors của 1 paper trong local graph.
    Neighbor = papers cùng author (co-authorship graph).
    Dùng cho BFS/DFS distributed traversal.
    """
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT author_id FROM paper_authors WHERE paper_id=%s", (paper_id,))
        author_ids = [row[0] for row in cur.fetchall()]
        if not author_ids:
            return {"paper_id": paper_id, "site": SITE_ID, "neighbors": []}

        placeholders = ",".join(["%s"] * len(author_ids))
        cur.execute(f"""
            SELECT DISTINCT p.id, p.title, p.year, p.venue, p.doi,
                   pa.author_id as shared_author_id, pa.author_name as shared_author
            FROM papers p
            JOIN paper_authors pa ON p.id = pa.paper_id
            WHERE pa.author_id IN ({placeholders}) AND p.id != %s
            LIMIT 50
        """, author_ids + [paper_id])
        rows = fetchall_dict(cur)

    return {
        "paper_id": paper_id,
        "site": SITE_ID,
        "neighbors": rows,
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
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(f"""
            SELECT DISTINCT pa1.paper_id as source, pa2.paper_id as target,
                   pa1.author_id as shared_author, pa1.author_name
            FROM paper_authors pa1
            JOIN paper_authors pa2 ON pa1.author_id = pa2.author_id
                                   AND pa1.paper_id < pa2.paper_id
            LIMIT %s
        """, (limit,))
        rows = fetchall_dict(cur)

    return {
        "site": SITE_ID,
        "edge_count": len(rows),
        "edges": rows,
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
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM papers WHERE id=%s", (paper_id,))
        paper = fetchone_dict(cur)
        if not paper:
            raise HTTPException(404, "Paper not found")
        cur.execute(
            "SELECT author_id, author_name FROM paper_authors WHERE paper_id=%s",
            (paper_id,)
        )
        authors = fetchall_dict(cur)

    paper["authors"] = authors
    paper["_meta"] = {
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
    return paper
