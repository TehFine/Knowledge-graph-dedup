"""
Graph Engine — Handles all advanced graph operations:
  1. Graph Partitioning (Kernighan-Lin bisection, METIS-style)
  2. Distributed Traversal (BFS, DFS, Shortest Path)
  3. Multi-Model Integration (Relational + Graph + Document)
  4. Topology Analysis (Edge-Cut, Clusters, Performance Impact)
"""

import networkx as nx
import time, json
from collections import deque

# ── Graph Builder ─────────────────────────────────────────────

def build_knowledge_graph(edges_a: list, edges_b: list, cross_edges: list) -> nx.Graph:
    """
    Build unified knowledge graph from both sites.
    Nodes = papers, Edges = co-authorship within sites + SAME_AS across sites.
    """
    G = nx.Graph()
    for e in edges_a:
        G.add_node(e["source"], site="site_a")
        G.add_node(e["target"], site="site_a")
        G.add_edge(e["source"], e["target"], type="co_author", site="site_a",
                   author=e.get("shared_author", ""))
    for e in edges_b:
        G.add_node(e["source"], site="site_b")
        G.add_node(e["target"], site="site_b")
        G.add_edge(e["source"], e["target"], type="co_author", site="site_b",
                   author=e.get("shared_author", ""))
    for e in cross_edges:
        G.add_node(e["paper_a_id"], site="site_a")
        G.add_node(e["paper_b_id"], site="site_b")
        G.add_edge(e["paper_a_id"], e["paper_b_id"], type="same_as",
                   score=e.get("score", 0))
    return G

# ── 1. Graph Partitioning (Kernighan-Lin / METIS-style) ──────

def analyze_partitioning(G: nx.Graph) -> dict:
    """
    Compare current partition (by source site) vs optimal (Kernighan-Lin).
    Kernighan-Lin minimizes edge-cut — same goal as METIS.
    """
    if len(G.nodes()) < 4:
        return {"error": "Graph too small", "nodes": len(G.nodes())}

    # Current partition (by site)
    current_a = {n for n, d in G.nodes(data=True) if d.get("site") == "site_a"}
    current_b = {n for n, d in G.nodes(data=True) if d.get("site") == "site_b"}

    current_cut = sum(1 for u, v in G.edges()
                      if (u in current_a) != (v in current_a))

    # Optimal partition (Kernighan-Lin bisection — METIS-style)
    try:
        opt_a, opt_b = nx.community.kernighan_lin_bisection(G, max_iter=50)
        optimal_cut = sum(1 for u, v in G.edges()
                          if (u in opt_a) != (v in opt_a))
    except Exception:
        opt_a, opt_b = current_a, current_b
        optimal_cut = current_cut

    total_edges = G.number_of_edges()
    hop_reduction = 0
    if current_cut > 0:
        hop_reduction = round((current_cut - optimal_cut) / current_cut * 100, 1)

    return {
        "algorithm": "Kernighan-Lin Bisection (METIS-equivalent)",
        "total_nodes": G.number_of_nodes(),
        "total_edges": total_edges,
        "current_partition": {
            "method": "source-based (DBLP vs Semantic Scholar)",
            "site_a_nodes": len(current_a),
            "site_b_nodes": len(current_b),
            "edge_cut": current_cut,
            "edge_cut_ratio": round(current_cut / max(total_edges, 1), 4),
            "balance": round(min(len(current_a), len(current_b)) /
                           max(len(current_a), len(current_b), 1), 3),
        },
        "optimal_partition": {
            "method": "Kernighan-Lin Bisection",
            "partition_a_nodes": len(opt_a),
            "partition_b_nodes": len(opt_b),
            "edge_cut": optimal_cut,
            "edge_cut_ratio": round(optimal_cut / max(total_edges, 1), 4),
            "balance": round(min(len(opt_a), len(opt_b)) /
                           max(len(opt_a), len(opt_b), 1), 3),
        },
        "improvement": {
            "hop_reduction_pct": hop_reduction,
            "edges_saved": current_cut - optimal_cut,
            "summary": f"METIS partitioning reduces cross-site hops by {hop_reduction}%"
        }
    }

# ── 2. Distributed Traversal ─────────────────────────────────

def distributed_bfs(G: nx.Graph, start: str, max_depth: int = 3) -> dict:
    """BFS trên distributed graph, tracking cross-site hops."""
    if start not in G:
        return {"error": f"Node {start} not found"}
    visited = {}
    queue = deque([(start, 0)])
    cross_site_hops = 0
    levels = {}
    start_site = G.nodes[start].get("site", "unknown")

    while queue:
        node, depth = queue.popleft()
        if node in visited or depth > max_depth:
            continue
        visited[node] = {
            "depth": depth,
            "site": G.nodes[node].get("site", "unknown"),
        }
        levels.setdefault(depth, []).append(node)
        for neighbor in G.neighbors(node):
            if neighbor not in visited:
                n_site = G.nodes[neighbor].get("site", "unknown")
                c_site = G.nodes[node].get("site", "unknown")
                if n_site != c_site:
                    cross_site_hops += 1
                queue.append((neighbor, depth + 1))

    return {
        "algorithm": "Distributed BFS",
        "start_node": start,
        "start_site": start_site,
        "max_depth": max_depth,
        "nodes_visited": len(visited),
        "cross_site_hops": cross_site_hops,
        "levels": {d: {"count": len(ns), "nodes": ns[:10]} for d, ns in levels.items()},
        "visited": dict(list(visited.items())[:50]),
    }

def distributed_dfs(G: nx.Graph, start: str, max_depth: int = 3) -> dict:
    """DFS trên distributed graph, tracking cross-site edges."""
    if start not in G:
        return {"error": f"Node {start} not found"}
    visited = {}
    stack = [(start, 0)]
    cross_site = 0
    traversal_order = []

    while stack:
        node, depth = stack.pop()
        if node in visited or depth > max_depth:
            continue
        visited[node] = {"depth": depth, "site": G.nodes[node].get("site", "unknown")}
        traversal_order.append(node)
        for nb in G.neighbors(node):
            if nb not in visited:
                if G.nodes[nb].get("site") != G.nodes[node].get("site"):
                    cross_site += 1
                stack.append((nb, depth + 1))

    return {
        "algorithm": "Distributed DFS",
        "start_node": start,
        "nodes_visited": len(visited),
        "cross_site_hops": cross_site,
        "traversal_order": traversal_order[:30],
        "visited": dict(list(visited.items())[:50]),
    }

def shortest_path(G: nx.Graph, source: str, target: str) -> dict:
    """Shortest path giữa 2 papers, tracking cross-site edges."""
    if source not in G:
        return {"error": f"Source {source} not found"}
    if target not in G:
        return {"error": f"Target {target} not found"}
    try:
        path = nx.shortest_path(G, source, target)
        cross = sum(1 for i in range(len(path)-1)
                    if G.nodes[path[i]].get("site") != G.nodes[path[i+1]].get("site"))
        path_details = [{"id": n, "site": G.nodes[n].get("site", "?")} for n in path]
        return {
            "algorithm": "Dijkstra Shortest Path",
            "source": source, "target": target,
            "path_length": len(path) - 1,
            "cross_site_edges": cross,
            "path": path_details,
        }
    except nx.NetworkXNoPath:
        return {"source": source, "target": target, "path_length": -1,
                "error": "No path exists"}

# ── 3. Multi-Model Integration ───────────────────────────────

SCHEMA_MAP = {
    "site_a": {
        "source_name": "DBLP",
        "name_field": "name", "affil_field": "affiliation",
        "id_format": "paper_XXXXX",
    },
    "site_b": {
        "source_name": "Semantic Scholar",
        "name_field": "full_name", "affil_field": "org",
        "id_format": "paper_XXXXX_dup",
    },
}

def unified_paper_view(paper_id: str, relational: dict, graph_data: dict,
                       document: dict) -> dict:
    """Combine relational + graph + document into unified view."""
    site = "site_a" if not paper_id.endswith("_dup") else "site_b"
    schema = SCHEMA_MAP.get(site, SCHEMA_MAP["site_a"])

    return {
        "paper_id": paper_id,
        "models": {
            "relational": {
                "type": "SQL/Relational",
                "data": relational,
                "schema": {"table": "papers", "joins": ["paper_authors"]},
            },
            "graph": {
                "type": "Graph/Network",
                "data": graph_data,
                "schema": {"nodes": "papers", "edges": ["co_author", "same_as"]},
            },
            "document": {
                "type": "Document/JSON",
                "data": document,
                "schema": {"format": "JSON", "fields": ["abstract", "metadata"]},
            },
        },
        "schema_mapping": schema,
        "integration": {
            "method": "Mediator/Wrapper (Özsu Ch.3)",
            "join_strategy": "Seamless — single API merges all 3 models",
        }
    }

# ── 4. Topology Analysis ─────────────────────────────────────

def deep_topology_analysis(G: nx.Graph) -> dict:
    """Proper edge-cut ratio, cluster detection, performance impact."""
    if len(G.nodes()) == 0:
        return {"error": "Empty graph"}

    # Proper Edge-Cut Ratio
    site_a_nodes = {n for n, d in G.nodes(data=True) if d.get("site") == "site_a"}
    total_edges = G.number_of_edges()
    cross_edges = sum(1 for u, v in G.edges()
                      if (u in site_a_nodes) != (v in site_a_nodes))
    intra_edges = total_edges - cross_edges
    edge_cut_ratio = round(cross_edges / max(total_edges, 1), 4)

    # Connected Components (Clusters)
    components = list(nx.connected_components(G))
    cluster_sizes = sorted([len(c) for c in components], reverse=True)
    largest = max(cluster_sizes) if cluster_sizes else 0

    # Cluster Density
    densities = []
    for comp in components[:20]:
        sub = G.subgraph(comp)
        n = sub.number_of_nodes()
        e = sub.number_of_edges()
        max_e = n * (n - 1) / 2
        densities.append(round(e / max_e, 4) if max_e > 0 else 0)

    # Cross-site clusters (have nodes from both sites)
    mixed = sum(1 for c in components
                if any(G.nodes[n].get("site") == "site_a" for n in c)
                and any(G.nodes[n].get("site") == "site_b" for n in c))

    # Degree distribution
    degrees = [d for _, d in G.degree()]
    avg_deg = round(sum(degrees) / max(len(degrees), 1), 2)

    # Performance impact
    perf = {
        "high_degree_nodes": sum(1 for d in degrees if d > avg_deg * 2),
        "isolated_nodes": sum(1 for d in degrees if d == 0),
        "bottleneck_risk": "HIGH" if largest > len(G.nodes()) * 0.5 else
                          "MEDIUM" if largest > len(G.nodes()) * 0.2 else "LOW",
        "estimated_message_cost": cross_edges * 2,
        "locality_ratio": round(intra_edges / max(total_edges, 1), 4),
    }

    return {
        "nodes": G.number_of_nodes(),
        "edges": total_edges,
        "edge_cut": {
            "cross_site_edges": cross_edges,
            "intra_site_edges": intra_edges,
            "edge_cut_ratio": edge_cut_ratio,
            "interpretation": f"{edge_cut_ratio*100:.1f}% of edges cross site boundaries"
        },
        "clusters": {
            "total_components": len(components),
            "largest_cluster_size": largest,
            "avg_cluster_size": round(sum(cluster_sizes) / max(len(cluster_sizes), 1), 1),
            "top_10_sizes": cluster_sizes[:10],
            "mixed_site_clusters": mixed,
            "avg_density": round(sum(densities) / max(len(densities), 1), 4),
        },
        "degree_stats": {
            "avg_degree": avg_deg,
            "max_degree": max(degrees) if degrees else 0,
            "min_degree": min(degrees) if degrees else 0,
        },
        "performance_impact": perf,
        "theory_reference": "Özsu & Valduriez Ch.4 — Edge-Cut and Cluster Density",
    }
