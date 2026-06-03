"""
Coordinator — Entity Resolution Engine
- Gọi Site A và Site B song song
- Tính similarity score cho từng cặp paper
- Quyết định MERGE / REVIEW / SEPARATE
- Xử lý failure khi site nào đó bị kill
- Lưu kết quả + queue job pending
Port: 8000
"""

import os, json, time, asyncio
from contextlib import contextmanager
import psycopg2
from dotenv import load_dotenv

load_dotenv()
from typing import Optional
import httpx
import networkx as nx
from fastapi import FastAPI, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from graph_engine import (
    build_knowledge_graph, analyze_partitioning,
    distributed_bfs, distributed_dfs, shortest_path,
    unified_paper_view, deep_topology_analysis,
)

SITE_A = os.environ.get("SITE_A_URL", "http://localhost:8001")
SITE_B = os.environ.get("SITE_B_URL", "http://localhost:8002")
DATA_DIR = "./data"
DATABASE_URL = os.environ.get("DATABASE_URL")  # Supabase Project 3
QUEUE_FILE = os.path.join(DATA_DIR, "pending_queue.json")
GT_FILE = os.path.join(DATA_DIR, "ground_truth.json")
os.makedirs(DATA_DIR, exist_ok=True)

TIMEOUT = 5.0  # giây timeout mỗi request tới site

tags_metadata = [
    {"name": "System", "description": "Kiểm tra trạng thái hệ thống và các node"},
    {"name": "Entity Resolution", "description": "Quản lý và theo dõi tiến trình khử trùng lặp (Record Linkage)"},
    {"name": "Graph Engine & Topology", "description": "Các thuật toán đồ thị, phân hoạch, và duyệt phân tán"},
    {"name": "Multi-Model", "description": "Tích hợp dữ liệu đa mô hình"},
]

app = FastAPI(
    title="Coordinator — Entity Resolution API",
    version="2.0",
    description="Hệ thống điều phối phân giải thực thể (Entity Resolution) và xử lý đồ thị tri thức phân tán (Distributed Knowledge Graph).",
    openapi_tags=tags_metadata
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Global graph cache
_graph_cache: Optional[nx.Graph] = None

# ── Result DB ─────────────────────────────────────────────────
@contextmanager
def get_db():
    conn = psycopg2.connect(DATABASE_URL)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def fetchall_dict(cursor):
    cols = [desc[0] for desc in cursor.description]
    return [dict(zip(cols, row)) for row in cursor.fetchall()]

def fetchone_dict(cursor):
    cols = [desc[0] for desc in cursor.description]
    row = cursor.fetchone()
    return dict(zip(cols, row)) if row else None

# ── Similarity Engine ─────────────────────────────────────────

def levenshtein(a: str, b: str) -> int:
    a, b = a.lower().strip(), b.lower().strip()
    if a == b: return 0
    m, n = len(a), len(b)
    dp = list(range(n + 1))
    for i in range(1, m + 1):
        prev = dp[0]; dp[0] = i
        for j in range(1, n + 1):
            temp = dp[j]
            if a[i-1] == b[j-1]:
                dp[j] = prev
            else:
                dp[j] = 1 + min(prev, dp[j], dp[j-1])
            prev = temp
    return dp[n]

def str_sim(a: str, b: str) -> float:
    if not a or not b: return 0.0
    a, b = a.lower().strip(), b.lower().strip()
    if a == b: return 1.0
    ml = max(len(a), len(b))
    return 1 - levenshtein(a, b) / ml if ml else 1.0

def token_sort_sim(a: str, b: str) -> float:
    sa = " ".join(sorted(a.lower().split()))
    sb = " ".join(sorted(b.lower().split()))
    return str_sim(sa, sb)

def compute_similarity(pa: dict, pb: dict) -> dict:
    # 1. DOI exact match → instant high score
    doi_match = 0.0
    if pa.get("doi") and pb.get("doi"):
        doi_match = 1.0 if pa["doi"].strip() == pb["doi"].strip() else 0.0

    # 2. Title similarity
    title_sim = max(
        token_sort_sim(pa.get("title", ""), pb.get("title", "")),
        str_sim(pa.get("title", ""), pb.get("title", "")),
    )

    # 3. Year match
    year_sim = 1.0 if pa.get("year") == pb.get("year") else 0.5

    # 4. Venue similarity
    venue_sim = token_sort_sim(pa.get("venue", ""), pb.get("venue", ""))

    # 5. Author name (dùng author_name field từ candidates)
    author_sim = token_sort_sim(
        pa.get("author_name", ""), pb.get("author_name", "")
    )

    # Weighted
    if doi_match == 1.0:
        total = min(1.0, 0.4 * doi_match + 0.3 * title_sim + 0.2 * author_sim + 0.1 * venue_sim)
    else:
        total = 0.35 * title_sim + 0.25 * author_sim + 0.20 * venue_sim + 0.20 * year_sim

    return {
        "total": round(total, 3),
        "breakdown": {
            "doi":    round(doi_match, 2),
            "title":  round(title_sim, 2),
            "author": round(author_sim, 2),
            "venue":  round(venue_sim, 2),
            "year":   round(year_sim, 2),
        }
    }

def decide(score: float) -> str:
    if score >= 0.82: return "MERGE"
    if score >= 0.62: return "REVIEW"
    return "SEPARATE"

# ── Site Health ───────────────────────────────────────────────

async def check_site(client: httpx.AsyncClient, url: str) -> bool:
    try:
        r = await client.get(f"{url}/health", timeout=TIMEOUT)
        return r.status_code == 200
    except Exception:
        return False

async def fetch_candidates(client: httpx.AsyncClient, url: str, year: int, limit: int) -> list:
    try:
        r = await client.get(
            f"{url}/candidates",
            params={"year": year, "limit": limit},
            timeout=TIMEOUT
        )
        if r.status_code == 200:
            return r.json().get("data", [])
    except Exception:
        pass
    return []

# ── Resolution Job ────────────────────────────────────────────

resolution_status = {
    "running": False,
    "job_id": None,
    "processed": 0,
    "total": 0,
    "log": [],
    "site_a": "unknown",
    "site_b": "unknown",
}

def add_log(msg: str, level: str = "info"):
    entry = {"ts": time.strftime("%H:%M:%S"), "msg": msg, "level": level}
    resolution_status["log"].append(entry)
    if len(resolution_status["log"]) > 300:
        resolution_status["log"] = resolution_status["log"][-300:]
    print(f"[{entry['ts']}] {msg}")

async def run_resolution_job(years: list, limit_per_year: int, job_id: int):
    global resolution_status
    resolution_status["running"] = True
    resolution_status["log"] = []
    resolution_status["processed"] = 0

    add_log("Coordinator started — entity resolution initiated", "system")

    pending_queue = []
    stats = {"merged": 0, "reviewed": 0, "separated": 0, "total": 0}

    async with httpx.AsyncClient() as client:
        for year in years:
            # Check site status
            site_a_ok = await check_site(client, SITE_A)
            site_b_ok = await check_site(client, SITE_B)
            resolution_status["site_a"] = "online" if site_a_ok else "offline"
            resolution_status["site_b"] = "online" if site_b_ok else "offline"

            ok_sym = '+' if site_a_ok else 'X'
            ko_sym = '+' if site_b_ok else 'X'
            add_log(f"Year {year} — Site A: [{ok_sym}]  Site B: [{ko_sym}]", "info")

            # Fetch candidates from both sites (parallel)
            candidates_a, candidates_b = await asyncio.gather(
                fetch_candidates(client, SITE_A, year, limit_per_year),
                fetch_candidates(client, SITE_B, year, limit_per_year),
            )

            if not site_a_ok or not site_b_ok:
                add_log(f"Year {year}: One site offline — queuing {limit_per_year} pairs for retry", "warn")
                pending_queue.append({"year": year, "status": "pending"})
                # Save queue
                with open(QUEUE_FILE, "w") as f:
                    json.dump(pending_queue, f, indent=2)
                continue

            add_log(f"Year {year}: {len(candidates_a)} from A × {len(candidates_b)} from B — blocking applied", "info")

            # Blocking: nhóm theo 2 ký tự đầu của title
            blocks: dict[str, list] = {}
            for pa in candidates_a:
                key = (pa.get("title", "")[:2]).lower()
                blocks.setdefault(key, {"a": [], "b": []})["a"].append(pa)
            for pb in candidates_b:
                key = (pb.get("title", "")[:2]).lower()
                if key in blocks:
                    blocks[key]["b"].append(pb)

            results_batch = []
            for block_key, block in blocks.items():
                for pa in block["a"]:
                    for pb in block["b"]:
                        sim = compute_similarity(pa, pb)
                        decision = decide(sim["total"])

                        results_batch.append((
                            pa.get("id"), pb.get("id"),
                            pa.get("title"), pb.get("title"),
                            pa.get("doi"), pb.get("doi"),
                            sim["total"], decision,
                            json.dumps(sim["breakdown"]),
                            time.time()
                        ))

                        stats["total"] += 1
                        if decision == "MERGE":   stats["merged"] += 1
                        elif decision == "REVIEW": stats["reviewed"] += 1
                        else:                      stats["separated"] += 1

                        resolution_status["processed"] = stats["total"]

            # Batch insert
            with get_db() as db:
                cur = db.cursor()
                cur.executemany("""
                    INSERT INTO resolution_results
                    (paper_a_id,paper_b_id,title_a,title_b,doi_a,doi_b,score,decision,breakdown,created_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """, results_batch)
                cur.execute("""
                    UPDATE jobs SET processed=%s,merged=%s,reviewed=%s,separated=%s,site_a_ok=%s,site_b_ok=%s
                    WHERE id=%s
                """, (stats["total"], stats["merged"], stats["reviewed"],
                      stats["separated"], int(site_a_ok), int(site_b_ok), job_id))

            add_log(
                f"Year {year}: {len(results_batch)} pairs processed — "
                f"MERGE:{stats['merged']} REVIEW:{stats['reviewed']} SEP:{stats['separated']}",
                "success"
            )

            await asyncio.sleep(0.1)  # yield

        # Retry pending queue
        if pending_queue:
            add_log(f"Retrying {len(pending_queue)} queued year(s)...", "warn")
            for item in pending_queue:
                site_a_ok = await check_site(client, SITE_A)
                site_b_ok = await check_site(client, SITE_B)
                if site_a_ok and site_b_ok:
                    add_log(f"Both sites online — retrying year {item['year']}", "success")
                    # (simplified: just log for demo)
                    item["status"] = "retried"
                else:
                    add_log(f"Sites still down — year {item['year']} remains queued", "error")
            with open(QUEUE_FILE, "w") as f:
                json.dump(pending_queue, f, indent=2)

    # Finish
    with get_db() as db:
        cur = db.cursor()
        cur.execute("UPDATE jobs SET status='done', finished_at=%s WHERE id=%s", (time.time(), job_id))

    add_log("─" * 40, "divider")
    add_log(f"Resolution complete — {stats['total']} pairs total", "system")
    add_log(f"MERGE:{stats['merged']}  REVIEW:{stats['reviewed']}  SEPARATE:{stats['separated']}", "system")

    # Auto-build knowledge graph for topology/partitioning analysis
    add_log("Building knowledge graph for analysis...", "info")
    try:
        import httpx as _httpx
        async with _httpx.AsyncClient() as _c:
            ea = await _c.get(f"{SITE_A}/graph/edges?limit=2000", timeout=10)
            eb = await _c.get(f"{SITE_B}/graph/edges?limit=2000", timeout=10)
            edges_a = ea.json().get("edges", []) if ea.status_code == 200 else []
            edges_b = eb.json().get("edges", []) if eb.status_code == 200 else []
        with get_db() as db:
            cur = db.cursor()
            cur.execute(
                "SELECT paper_a_id, paper_b_id, score FROM resolution_results WHERE decision='MERGE'"
            )
            merges = fetchall_dict(cur)
        global _graph_cache
        _graph_cache = build_knowledge_graph(edges_a, edges_b, merges)
        add_log(f"Graph built: {_graph_cache.number_of_nodes()} nodes, {_graph_cache.number_of_edges()} edges", "success")
    except Exception as e:
        add_log(f"Graph build failed: {e}", "warn")

    resolution_status["running"] = False

# ── API Endpoints ─────────────────────────────────────────────

class StartJobRequest(BaseModel):
    years: list[int] = [2018, 2019, 2020, 2021, 2022, 2023]
    limit_per_year: int = 80

@app.get("/health", tags=["System"])
def health():
    return {"site": "coordinator", "status": "online", "ts": time.time()}

@app.post("/resolution/start", tags=["Entity Resolution"])
async def start_resolution(req: StartJobRequest, bg: BackgroundTasks):
    if resolution_status["running"]:
        return {"error": "Job already running"}

    with get_db() as db:
        cur = db.cursor()
        cur.execute(
            "INSERT INTO jobs (status, started_at) VALUES ('running', %s) RETURNING id",
            (time.time(),)
        )
        job_id = cur.fetchone()[0]

    resolution_status["job_id"] = job_id
    resolution_status["processed"] = 0
    bg.add_task(run_resolution_job, req.years, req.limit_per_year, job_id)
    return {"job_id": job_id, "status": "started"}

@app.get("/resolution/status", tags=["Entity Resolution"])
def get_status():
    return {
        **resolution_status,
        "log": resolution_status["log"][-50:],  # last 50 log lines
    }

@app.get("/resolution/results", tags=["Entity Resolution"])
def get_results(
    decision: Optional[str] = None,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
):
    offset = (page - 1) * size
    filters, params = [], []
    if decision:
        filters.append("decision = %s"); params.append(decision.upper())
    where = ("WHERE " + " AND ".join(filters)) if filters else ""

    with get_db() as db:
        cur = db.cursor()
        cur.execute(f"SELECT COUNT(*) FROM resolution_results {where}", params)
        total = cur.fetchone()[0]
        cur.execute(
            f"SELECT * FROM resolution_results {where} ORDER BY score DESC LIMIT %s OFFSET %s",
            params + [size, offset]
        )
        rows = fetchall_dict(cur)
    return {
        "total": total,
        "page": page,
        "data": rows,
    }

@app.get("/resolution/stats", tags=["Entity Resolution"])
def get_resolution_stats():
    with get_db() as db:
        cur = db.cursor()
        cur.execute("""
            SELECT decision, COUNT(*) as cnt, AVG(score) as avg_score
            FROM resolution_results GROUP BY decision
        """)
        by_decision = fetchall_dict(cur)
        cur.execute("SELECT COUNT(*) FROM resolution_results")
        total = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM resolution_results WHERE decision='MERGE'")
        merged = cur.fetchone()[0]
        cur.execute("""
            SELECT title_a, title_b, score FROM resolution_results
            WHERE decision='MERGE' ORDER BY score DESC LIMIT 10
        """)
        top_merges = fetchall_dict(cur)

    # Proper topology metrics from graph cache
    topo = {}
    if _graph_cache and _graph_cache.number_of_nodes() > 0:
        topo = deep_topology_analysis(_graph_cache)

    edge_cut_ratio = topo.get("edge_cut", {}).get("edge_cut_ratio", 0)
    cluster_info = topo.get("clusters", {})

    return {
        "total_pairs": total,
        "by_decision": by_decision,
        "edge_cut_ratio": edge_cut_ratio,
        "cross_site_edges": topo.get("edge_cut", {}).get("cross_site_edges", 0),
        "intra_site_edges": topo.get("edge_cut", {}).get("intra_site_edges", 0),
        "cluster_count": cluster_info.get("total_components", 0),
        "largest_cluster": cluster_info.get("largest_cluster_size", 0),
        "avg_cluster_density": cluster_info.get("avg_density", 0),
        "mixed_clusters": cluster_info.get("mixed_site_clusters", 0),
        "graph_nodes": topo.get("nodes", 0),
        "graph_edges": topo.get("edges", 0),
        "top_merges": top_merges,
    }

@app.get("/sites/status", tags=["System"])
async def sites_status():
    async with httpx.AsyncClient() as client:
        a_ok = await check_site(client, SITE_A)
        b_ok = await check_site(client, SITE_B)
    return {
        "site_a": {"url": SITE_A, "status": "online" if a_ok else "offline"},
        "site_b": {"url": SITE_B, "status": "online" if b_ok else "offline"},
        "coordinator": {"status": "online"},
    }

@app.get("/metrics/f1", tags=["Entity Resolution"])
def compute_f1():
    """So sánh kết quả với ground truth để tính Precision/Recall/F1"""
    if not os.path.exists(GT_FILE):
        return {"error": "Ground truth file not found"}

    with open(GT_FILE) as f:
        gt = json.load(f)

    gt_pairs = {(p["site_a_id"], p["site_b_id"]) for p in gt["pairs"]}

    with get_db() as db:
        cur = db.cursor()
        cur.execute(
            "SELECT paper_a_id, paper_b_id FROM resolution_results WHERE decision='MERGE'"
        )
        merged = fetchall_dict(cur)

    predicted = {(r["paper_a_id"], r["paper_b_id"]) for r in merged}
    tp = len(predicted & gt_pairs)
    fp = len(predicted - gt_pairs)
    fn = len(gt_pairs - predicted)

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall    = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1        = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0

    return {
        "true_positives":  tp,
        "false_positives": fp,
        "false_negatives": fn,
        "precision": round(precision, 3),
        "recall":    round(recall, 3),
        "f1":        round(f1, 3),
        "ground_truth_total": len(gt_pairs),
        "predicted_total":    len(predicted),
    }

@app.get("/queue", tags=["Entity Resolution"])
def get_queue():
    if not os.path.exists(QUEUE_FILE):
        return {"queue": []}
    with open(QUEUE_FILE) as f:
        return {"queue": json.load(f)}

# ══════════════════════════════════════════════════════════════
# NEW: Graph Build, Partitioning, Traversal, Multi-Model, Topology
# ══════════════════════════════════════════════════════════════

async def _build_graph():
    """Fetch edges from both sites + merge results → build graph."""
    global _graph_cache
    async with httpx.AsyncClient() as client:
        try:
            ea = await client.get(f"{SITE_A}/graph/edges?limit=2000", timeout=10)
            eb = await client.get(f"{SITE_B}/graph/edges?limit=2000", timeout=10)
            edges_a = ea.json().get("edges", []) if ea.status_code == 200 else []
            edges_b = eb.json().get("edges", []) if eb.status_code == 200 else []
        except Exception:
            edges_a, edges_b = [], []

    with get_db() as db:
        cur = db.cursor()
        cur.execute(
            "SELECT paper_a_id, paper_b_id, score FROM resolution_results WHERE decision='MERGE'"
        )
        cross = fetchall_dict(cur)
    _graph_cache = build_knowledge_graph(edges_a, edges_b, cross)
    return _graph_cache

@app.post("/graph/build", tags=["Graph Engine & Topology"])
async def build_graph():
    """Build/rebuild the knowledge graph from site data + resolution results."""
    G = await _build_graph()
    return {"nodes": G.number_of_nodes(), "edges": G.number_of_edges(), "status": "built"}

# ── Partitioning ──────────────────────────────────────────────
@app.get("/partitioning/analyze", tags=["Graph Engine & Topology"])
async def partitioning_analyze():
    """METIS-style partitioning analysis comparing current vs optimal."""
    if not _graph_cache or _graph_cache.number_of_nodes() < 4:
        await _build_graph()
    return analyze_partitioning(_graph_cache)

# ── Traversal ─────────────────────────────────────────────────
@app.get("/graph/bfs", tags=["Graph Engine & Topology"])
async def graph_bfs(start: str, depth: int = Query(3, ge=1, le=6)):
    """Distributed BFS from a paper node."""
    if not _graph_cache:
        await _build_graph()
    return distributed_bfs(_graph_cache, start, depth)

@app.get("/graph/dfs", tags=["Graph Engine & Topology"])
async def graph_dfs(start: str, depth: int = Query(3, ge=1, le=6)):
    """Distributed DFS from a paper node."""
    if not _graph_cache:
        await _build_graph()
    return distributed_dfs(_graph_cache, start, depth)

@app.get("/graph/path", tags=["Graph Engine & Topology"])
async def graph_path(source: str, target: str):
    """Shortest path between two papers across sites."""
    if not _graph_cache:
        await _build_graph()
    return shortest_path(_graph_cache, source, target)

@app.get("/graph/neighbors", tags=["Graph Engine & Topology"])
async def graph_neighbors(paper_id: str):
    """Cross-site aware neighbors for a paper."""
    async with httpx.AsyncClient() as client:
        results = {"paper_id": paper_id, "neighbors": []}
        for name, url in [("site_a", SITE_A), ("site_b", SITE_B)]:
            try:
                r = await client.get(f"{url}/graph/neighbors", params={"paper_id": paper_id}, timeout=5)
                if r.status_code == 200:
                    data = r.json()
                    for n in data.get("neighbors", []):
                        n["from_site"] = name
                    results["neighbors"].extend(data.get("neighbors", []))
            except Exception:
                pass
    # Also add SAME_AS neighbors from resolution
    if _graph_cache and paper_id in _graph_cache:
        for nb in _graph_cache.neighbors(paper_id):
            edge = _graph_cache.edges[paper_id, nb]
            if edge.get("type") == "same_as":
                results["neighbors"].append({
                    "id": nb, "edge_type": "same_as",
                    "score": edge.get("score", 0), "from_site": "cross_site"
                })
    return results

# ── Multi-Model Integration ──────────────────────────────────
@app.get("/unified/paper/{paper_id}", tags=["Multi-Model"])
async def unified_view(paper_id: str):
    """Seamless join: Relational + Graph + Document for one paper."""
    relational, document = {}, {}
    async with httpx.AsyncClient() as client:
        for url in [SITE_A, SITE_B]:
            try:
                r = await client.get(f"{url}/papers/{paper_id}", timeout=5)
                if r.status_code == 200:
                    relational = r.json()
                    d = await client.get(f"{url}/documents/{paper_id}", timeout=5)
                    if d.status_code == 200:
                        document = d.json()
                    break
            except Exception:
                continue

    graph_data = {}
    if _graph_cache and paper_id in _graph_cache:
        nbs = list(_graph_cache.neighbors(paper_id))
        graph_data = {
            "node": paper_id,
            "site": _graph_cache.nodes[paper_id].get("site", "unknown"),
            "degree": _graph_cache.degree(paper_id),
            "neighbors": [{"id": n, "site": _graph_cache.nodes[n].get("site", "?"),
                          "edge_type": _graph_cache.edges[paper_id, n].get("type", "?")}
                         for n in nbs[:20]],
            "same_as_links": [n for n in nbs if _graph_cache.edges[paper_id, n].get("type") == "same_as"],
        }

    return unified_paper_view(paper_id, relational, graph_data, document)

# ── Topology ──────────────────────────────────────────────────
@app.get("/topology/analysis", tags=["Graph Engine & Topology"])
async def topology_analysis():
    """Deep topology analysis with proper edge-cut and cluster detection."""
    if not _graph_cache or _graph_cache.number_of_nodes() < 2:
        await _build_graph()
    return deep_topology_analysis(_graph_cache)

@app.get("/topology/clusters", tags=["Graph Engine & Topology"])
async def topology_clusters():
    """List connected components / clusters in the graph."""
    if not _graph_cache:
        await _build_graph()
    G = _graph_cache
    comps = list(nx.connected_components(G))
    clusters = []
    for i, c in enumerate(sorted(comps, key=len, reverse=True)[:20]):
        sub = G.subgraph(c)
        sites = {G.nodes[n].get("site") for n in c}
        clusters.append({
            "id": i, "size": len(c), "edges": sub.number_of_edges(),
            "sites": list(sites), "is_cross_site": len(sites) > 1,
            "sample_nodes": list(c)[:5],
        })
    return {"total": len(comps), "clusters": clusters}

@app.get("/graph/data", tags=["Graph Engine & Topology"])
async def graph_data(mode: str = "linked"):
    """
    Return graph data based on processing stage:
    - raw: Two separate sites, internal links only.
    - linked: Sites connected via SAME_AS edges.
    - merged: Duplicates collapsed into single super-nodes.
    """
    if not _graph_cache:
        await _build_graph()
    
    G = _graph_cache
    
    if mode == "raw":
        # Filter out SAME_AS edges
        nodes = []
        for n, d in G.nodes(data=True):
            nodes.append({"id": n, "site": d.get("site", "unknown"), "val": 1 + G.degree(n)})
        links = []
        for u, v, d in G.edges(data=True):
            if d.get("type") != "same_as":
                links.append({"source": u, "target": v, "type": d.get("type"), "score": 1.0})
        return {"nodes": nodes, "links": links}

    elif mode == "linked":
        # Return everything as is (what we had before)
        nodes = [{"id": n, "site": d.get("site", "unknown"), "val": 1 + G.degree(n)} for n, d in G.nodes(data=True)]
        links = [{"source": u, "target": v, "type": d.get("type"), "score": d.get("score", 1.0)} for u, v, d in G.edges(data=True)]
        return {"nodes": nodes, "links": links}

    elif mode == "merged":
        # Identify clusters of duplicates using SAME_AS edges
        same_as_subgraph = nx.Graph([(u, v) for u, v, d in G.edges(data=True) if d.get("type") == "same_as"])
        clusters = list(nx.connected_components(same_as_subgraph))
        
        # Mapping from original node ID to cluster ID
        node_to_cluster = {}
        for i, cluster in enumerate(clusters):
            cluster_id = f"merged_{i}"
            for node in cluster:
                node_to_cluster[node] = cluster_id
        
        # Build merged graph data
        merged_nodes = {}
        merged_links = set()
        
        # Add all nodes (either as clusters or original singletons)
        for n, d in G.nodes(data=True):
            cid = node_to_cluster.get(n, n)
            if cid not in merged_nodes:
                merged_nodes[cid] = {
                    "id": cid,
                    "site": "merged" if cid.startswith("merged_") else d.get("site"),
                    "source_ids": [n] if cid.startswith("merged_") else [n],
                    "val": 0
                }
            elif cid.startswith("merged_") and n not in merged_nodes[cid]["source_ids"]:
                merged_nodes[cid]["source_ids"].append(n)

        # Add links, mapping them to cluster IDs
        for u, v, d in G.edges(data=True):
            if d.get("type") == "same_as":
                continue # These are now collapsed
            
            cu = node_to_cluster.get(u, u)
            cv = node_to_cluster.get(v, v)
            
            if cu != cv:
                # Add link between clusters (or cluster and node)
                pair = tuple(sorted((cu, cv)))
                merged_links.add(pair)
        
        # Final formatting
        nodes_list = list(merged_nodes.values())
        # Calculate degree for sizing
        for n_obj in nodes_list:
            n_id = n_obj["id"]
            deg = sum(1 for p in merged_links if n_id in p)
            n_obj["val"] = 2 + deg * 0.8
            
        links_list = [{"source": u, "target": v, "type": "co_author", "score": 1.0} for u, v in merged_links]
        
        return {"nodes": nodes_list, "links": links_list}

    return {"error": "Invalid mode"}
