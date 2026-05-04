import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const get = async (p) => { try { const r = await fetch(`${API}${p}`); return r.ok ? await r.json() : null; } catch { return null; } };
const post = async (p, b) => { try { const r = await fetch(`${API}${p}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); return await r.json(); } catch { return null; } };

export function GraphExplorerTab() {
  const [paperId, setPaperId] = useState("paper_00001");
  const [bfs, setBfs] = useState(null);
  const [dfs, setDfs] = useState(null);
  const [path, setPath] = useState(null);
  const [pathTarget, setPathTarget] = useState("paper_00001_dup");
  const [depth, setDepth] = useState(2);
  const [unified, setUnified] = useState(null);
  const [topo, setTopo] = useState(null);
  const [partition, setPartition] = useState(null);
  const [clusters, setClusters] = useState(null);
  const [loading, setLoading] = useState("");
  const [graphBuilt, setGraphBuilt] = useState(false);

  const buildGraph = async () => {
    setLoading("Building graph...");
    const r = await post("/graph/build", {});
    if (r) setGraphBuilt(true);
    setLoading("");
  };

  const runBFS = async () => { setLoading("BFS..."); setBfs(await get(`/graph/bfs?start=${paperId}&depth=${depth}`)); setLoading(""); };
  const runDFS = async () => { setLoading("DFS..."); setDfs(await get(`/graph/dfs?start=${paperId}&depth=${depth}`)); setLoading(""); };
  const runPath = async () => { setLoading("Path..."); setPath(await get(`/graph/path?source=${paperId}&target=${pathTarget}`)); setLoading(""); };
  const runUnified = async () => { setLoading("Unified..."); setUnified(await get(`/unified/paper/${paperId}`)); setLoading(""); };
  const runTopo = async () => { setLoading("Topology..."); setTopo(await get("/topology/analysis")); setLoading(""); };
  const runPartition = async () => { setLoading("Partition..."); setPartition(await get("/partitioning/analyze")); setLoading(""); };
  const runClusters = async () => { setLoading("Clusters..."); setClusters(await get("/topology/clusters")); setLoading(""); };

  const S = { card: { background: "#0d1520", border: "1px solid #1e2d40", borderRadius: 10, padding: 16, marginBottom: 12 },
    label: { fontSize: 10, color: "#2a5080", letterSpacing: 2, marginBottom: 10 },
    btn: { background: "rgba(77,159,255,.15)", border: "1px solid #4d9fff33", color: "#4d9fff", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 },
    btnGreen: { background: "rgba(0,232,122,.15)", border: "1px solid #00e87a33", color: "#00e87a", padding: "8px 18px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700 },
    input: { background: "#0a1018", border: "1px solid #1e2d40", color: "#c0ccd8", padding: "6px 10px", borderRadius: 5, fontSize: 11, width: 160, fontFamily: "'JetBrains Mono', monospace" },
    val: { fontSize: 20, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" },
    small: { fontSize: 10, color: "#4a6070" },
  };

  return (
    <div style={{ animation: "fadein .3s ease" }}>
      {/* Build Graph */}
      <div style={S.card}>
        <div style={S.label}>◈ KNOWLEDGE GRAPH ENGINE</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button style={S.btnGreen} onClick={buildGraph}>⚡ BUILD GRAPH</button>
          <span style={S.small}>{graphBuilt ? "✓ Graph ready" : "Build graph first to enable analysis"}</span>
          {loading && <span style={{ color: "#ffcc00", fontSize: 11, animation: "pulse 1s infinite" }}>● {loading}</span>}
        </div>
      </div>

      {/* Input controls */}
      <div style={S.card}>
        <div style={S.label}>◈ TRAVERSAL CONTROLS</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={S.small}>Paper ID:</label>
          <input style={S.input} value={paperId} onChange={e => setPaperId(e.target.value)} />
          <label style={S.small}>Depth:</label>
          <input style={{ ...S.input, width: 50 }} type="number" value={depth} onChange={e => setDepth(+e.target.value)} min={1} max={5} />
          <label style={S.small}>Target:</label>
          <input style={S.input} value={pathTarget} onChange={e => setPathTarget(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button style={S.btn} onClick={runBFS}>BFS</button>
          <button style={S.btn} onClick={runDFS}>DFS</button>
          <button style={S.btn} onClick={runPath}>SHORTEST PATH</button>
          <button style={S.btn} onClick={runUnified}>UNIFIED VIEW</button>
          <button style={S.btn} onClick={runTopo}>TOPOLOGY</button>
          <button style={S.btn} onClick={runPartition}>PARTITION</button>
          <button style={S.btn} onClick={runClusters}>CLUSTERS</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* BFS Result */}
        {bfs && (
          <div style={S.card}>
            <div style={S.label}>◈ DISTRIBUTED BFS</div>
            <div style={{ display: "flex", gap: 20, marginBottom: 10 }}>
              <div><span style={{ ...S.val, color: "#4d9fff" }}>{bfs.nodes_visited}</span> <span style={S.small}>nodes</span></div>
              <div><span style={{ ...S.val, color: "#ff4d88" }}>{bfs.cross_site_hops}</span> <span style={S.small}>cross-site hops</span></div>
            </div>
            {bfs.levels && Object.entries(bfs.levels).map(([d, l]) => (
              <div key={d} style={{ fontSize: 11, color: "#4a6070", marginBottom: 4 }}>
                Depth {d}: <span style={{ color: "#4d9fff" }}>{l.count} nodes</span>
                {l.nodes?.slice(0, 3).map(n => <span key={n} style={{ color: "#2a5080", marginLeft: 6, fontSize: 9 }}>{n}</span>)}
              </div>
            ))}
          </div>
        )}

        {/* DFS Result */}
        {dfs && (
          <div style={S.card}>
            <div style={S.label}>◈ DISTRIBUTED DFS</div>
            <div style={{ display: "flex", gap: 20, marginBottom: 10 }}>
              <div><span style={{ ...S.val, color: "#bb88ff" }}>{dfs.nodes_visited}</span> <span style={S.small}>nodes</span></div>
              <div><span style={{ ...S.val, color: "#ff4d88" }}>{dfs.cross_site_hops}</span> <span style={S.small}>cross-site</span></div>
            </div>
            <div style={{ fontSize: 10, color: "#4a6070" }}>
              Order: {dfs.traversal_order?.slice(0, 8).join(" → ")}
            </div>
          </div>
        )}

        {/* Shortest Path */}
        {path && (
          <div style={S.card}>
            <div style={S.label}>◈ SHORTEST PATH</div>
            {path.error ? <div style={{ color: "#ff3d5a", fontSize: 12 }}>{path.error}</div> : (
              <>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ ...S.val, color: "#00e87a" }}>{path.path_length}</span> <span style={S.small}>hops</span>
                  <span style={{ ...S.val, color: "#ff4d88", marginLeft: 16 }}>{path.cross_site_edges}</span> <span style={S.small}>cross-site</span>
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                  {path.path?.map((n, i) => (
                    <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4,
                        background: n.site === "site_a" ? "rgba(77,159,255,.15)" : "rgba(255,77,136,.15)",
                        color: n.site === "site_a" ? "#4d9fff" : "#ff4d88", border: `1px solid ${n.site === "site_a" ? "#4d9fff33" : "#ff4d8833"}` }}>
                        {n.id}
                      </span>
                      {i < path.path.length - 1 && <span style={{ color: "#2a4050" }}>→</span>}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Unified View (Multi-Model) */}
        {unified && (
          <div style={{ ...S.card, gridColumn: "span 2" }}>
            <div style={S.label}>◈ MULTI-MODEL UNIFIED VIEW (SEAMLESS INTEGRATION)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 15 }}>
              
              {/* 1. Relational Model */}
              <div style={{ padding: 12, borderRadius: 8, background: "rgba(77,159,255,.05)", border: "1px solid #4d9fff22" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#4d9fff", marginBottom: 8, letterSpacing: 1 }}>SQL / RELATIONAL</div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{unified.models?.relational?.data?.title}</div>
                <div style={{ fontSize: 10, color: "#4a6070", marginBottom: 4 }}>AUTHORS:</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {unified.models?.relational?.data?.authors?.map(a => (
                    <div key={a.author_id} style={{ fontSize: 11, color: "#c0ccd8", background: "#0a1018", padding: "2px 6px", borderRadius: 4, border: "1px solid #1e2d40" }}>
                      • {a.author_name} <span style={{ fontSize: 9, color: "#2a5080" }}>({a.author_id})</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, fontSize: 10, color: "#2a5080" }}>
                  Source: {unified.models?.relational?.data?.source || "Unknown"} | Year: {unified.models?.relational?.data?.year}
                </div>
              </div>

              {/* 2. Graph Model */}
              <div style={{ padding: 12, borderRadius: 8, background: "rgba(0,232,122,.05)", border: "1px solid #00e87a22" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#00e87a", marginBottom: 8, letterSpacing: 1 }}>GRAPH / NETWORK</div>
                <div style={{ marginBottom: 10 }}>
                  <span style={{ ...S.val, color: "#00e87a", fontSize: 18 }}>{unified.models?.graph?.data?.degree}</span> <span style={S.small}>total connections</span>
                </div>
                
                <div style={{ fontSize: 10, color: "#4a6070", marginBottom: 4 }}>SAME_AS LINKS (ENTITY RESOLUTION):</div>
                {unified.models?.graph?.data?.same_as_links?.length > 0 ? (
                  unified.models?.graph?.data?.same_as_links.map(link => (
                    <div key={link} style={{ fontSize: 11, color: "#00e87a", fontWeight: 700, background: "rgba(0,232,122,.1)", padding: "4px 8px", borderRadius: 4, border: "1px solid #00e87a33", marginBottom: 4 }}>
                      🔗 {link}
                    </div>
                  ))
                ) : <div style={S.small}>No identity links found</div>}

                <div style={{ fontSize: 10, color: "#4a6070", marginTop: 10, marginBottom: 4 }}>TOP NEIGHBORS (CO-AUTHORSHIP):</div>
                <div style={{ maxHeight: 100, overflowY: "auto", display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {unified.models?.graph?.data?.neighbors?.slice(0, 15).map(n => (
                    <span key={n.id} style={{ fontSize: 9, padding: "2px 4px", borderRadius: 3, background: "#0a1018", color: "#4a6070", border: "1px solid #131e2c" }}>
                      {n.id}
                    </span>
                  ))}
                </div>
              </div>

              {/* 3. Document Model */}
              <div style={{ padding: 12, borderRadius: 8, background: "rgba(187,136,255,.05)", border: "1px solid #bb88ff22" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#bb88ff", marginBottom: 8, letterSpacing: 1 }}>DOCUMENT / JSON</div>
                <div style={{ fontSize: 10, color: "#4a6070", marginBottom: 4 }}>ABSTRACT FRAGMENT:</div>
                <div style={{ fontSize: 11, color: "#c0ccd8", fontStyle: "italic", lineHeight: 1.5, background: "rgba(0,0,0,.2)", padding: 8, borderRadius: 6 }}>
                  "{unified.models?.document?.data?.abstract?.substring(0, 250)}..."
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={S.small}>SCHEMA METADATA:</div>
                  <pre style={{ fontSize: 8, color: "#2a5080", margin: 0, marginTop: 4 }}>
                    {JSON.stringify(unified.models?.document?.data?._meta?.field_mapping, null, 2)}
                  </pre>
                </div>
              </div>

            </div>
            <div style={{ marginTop: 15, textAlign: "right", borderTop: "1px solid #1e2d40", paddingTop: 10 }}>
              <span style={{ fontSize: 10, color: "#2a5080" }}>
                Architectural Pattern: <strong>{unified.integration?.method}</strong> | Strategy: {unified.integration?.join_strategy}
              </span>
            </div>
          </div>
        )}

        {/* Partition Analysis */}
        {partition && !partition.error && (
          <div style={S.card}>
            <div style={S.label}>◈ GRAPH PARTITIONING (METIS-STYLE)</div>
            <div style={{ fontSize: 10, color: "#bb88ff", marginBottom: 8 }}>{partition.algorithm}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ padding: 8, borderRadius: 6, background: "rgba(255,61,90,.05)", border: "1px solid #ff3d5a22" }}>
                <div style={{ fontSize: 9, color: "#ff3d5a", fontWeight: 700, marginBottom: 4 }}>CURRENT (Source-Based)</div>
                <div style={{ fontSize: 11, color: "#4a6070" }}>A: {partition.current_partition?.site_a_nodes} | B: {partition.current_partition?.site_b_nodes}</div>
                <div style={{ fontSize: 11, color: "#ff3d5a" }}>Edge-Cut: {partition.current_partition?.edge_cut} ({(partition.current_partition?.edge_cut_ratio * 100).toFixed(1)}%)</div>
                <div style={{ fontSize: 10, color: "#4a6070" }}>Balance: {partition.current_partition?.balance}</div>
              </div>
              <div style={{ padding: 8, borderRadius: 6, background: "rgba(0,232,122,.05)", border: "1px solid #00e87a22" }}>
                <div style={{ fontSize: 9, color: "#00e87a", fontWeight: 700, marginBottom: 4 }}>OPTIMAL (Kernighan-Lin)</div>
                <div style={{ fontSize: 11, color: "#4a6070" }}>A: {partition.optimal_partition?.partition_a_nodes} | B: {partition.optimal_partition?.partition_b_nodes}</div>
                <div style={{ fontSize: 11, color: "#00e87a" }}>Edge-Cut: {partition.optimal_partition?.edge_cut} ({(partition.optimal_partition?.edge_cut_ratio * 100).toFixed(1)}%)</div>
                <div style={{ fontSize: 10, color: "#4a6070" }}>Balance: {partition.optimal_partition?.balance}</div>
              </div>
            </div>
            <div style={{ marginTop: 10, padding: 8, borderRadius: 6, background: "rgba(187,136,255,.08)", border: "1px solid #bb88ff22" }}>
              <span style={{ ...S.val, color: "#bb88ff", fontSize: 16 }}>{partition.improvement?.hop_reduction_pct}%</span>
              <span style={S.small}> hop reduction • {partition.improvement?.edges_saved} edges saved</span>
            </div>
          </div>
        )}

        {/* Topology */}
        {topo && !topo.error && (
          <div style={S.card}>
            <div style={S.label}>◈ DEEP TOPOLOGY ANALYSIS</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
              {[
                ["Nodes", topo.nodes, "#4d9fff"],
                ["Edges", topo.edges, "#ff4d88"],
                ["Avg Degree", topo.degree_stats?.avg_degree, "#bb88ff"],
              ].map(([l, v, c]) => (
                <div key={l} style={{ textAlign: "center" }}>
                  <div style={{ ...S.val, color: c, fontSize: 18 }}>{v}</div>
                  <div style={S.small}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "#4a6070" }}>Edge-Cut: <span style={{ color: "#ff3d5a" }}>{topo.edge_cut?.cross_site_edges}</span> cross / <span style={{ color: "#00e87a" }}>{topo.edge_cut?.intra_site_edges}</span> intra</div>
              <div style={{ fontSize: 11, color: "#4a6070" }}>Ratio: <span style={{ color: "#bb88ff" }}>{(topo.edge_cut?.edge_cut_ratio * 100).toFixed(1)}%</span></div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#4a6070" }}>Clusters: <span style={{ color: "#4d9fff" }}>{topo.clusters?.total_components}</span> | Largest: <span style={{ color: "#ff4d88" }}>{topo.clusters?.largest_cluster_size}</span> | Mixed: <span style={{ color: "#00e87a" }}>{topo.clusters?.mixed_site_clusters}</span></div>
              <div style={{ fontSize: 11, color: "#4a6070" }}>Bottleneck Risk: <span style={{ color: topo.performance_impact?.bottleneck_risk === "HIGH" ? "#ff3d5a" : "#ffcc00" }}>{topo.performance_impact?.bottleneck_risk}</span></div>
              <div style={{ fontSize: 11, color: "#4a6070" }}>Locality: <span style={{ color: "#00e87a" }}>{(topo.performance_impact?.locality_ratio * 100).toFixed(1)}%</span></div>
            </div>
            <div style={{ fontSize: 9, color: "#1e3040", marginTop: 8 }}>{topo.theory_reference}</div>
          </div>
        )}

        {/* Clusters */}
        {clusters && (
          <div style={S.card}>
            <div style={S.label}>◈ CONNECTED COMPONENTS ({clusters.total} clusters)</div>
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              {clusters.clusters?.map(c => (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "4px 0", borderBottom: "1px solid #0d1520" }}>
                  <span style={{ color: c.is_cross_site ? "#00e87a" : "#4a6070" }}>Cluster #{c.id}</span>
                  <span style={{ color: "#4d9fff" }}>{c.size} nodes</span>
                  <span style={{ color: "#2a4050" }}>{c.edges} edges</span>
                  <span style={{ fontSize: 9, color: c.is_cross_site ? "#00e87a" : "#2a4050" }}>{c.is_cross_site ? "CROSS-SITE" : "local"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
