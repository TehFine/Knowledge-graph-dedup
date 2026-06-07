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
  const [communities, setCommunities] = useState(null);
  const [vertexCut, setVertexCut] = useState(null);
  const [multiLevelK, setMultiLevelK] = useState(null);
  const [loading, setLoading] = useState("");
  const [graphBuilt, setGraphBuilt] = useState(false);
  const [kValue, setKValue] = useState(3);

  const buildGraph = async () => {
    setLoading("Building graph...");
    const r = await post("/graph/build", {});
    if (r) setGraphBuilt(true);
    setLoading("");
  };

  const runBFS      = async () => { setLoading("BFS...");      setBfs(await get(`/graph/bfs?start=${paperId}&depth=${depth}`)); setLoading(""); };
  const runDFS      = async () => { setLoading("DFS...");      setDfs(await get(`/graph/dfs?start=${paperId}&depth=${depth}`)); setLoading(""); };
  const runPath     = async () => { setLoading("Path...");     setPath(await get(`/graph/path?source=${paperId}&target=${pathTarget}`)); setLoading(""); };
  const runUnified  = async () => { setLoading("Unified...");  setUnified(await get(`/unified/paper/${paperId}`)); setLoading(""); };
  const runTopo      = async () => { setLoading("Topology...");   setTopo(await get("/topology/analysis")); setLoading(""); };
  const runPartition = async () => { setLoading("Partition...");  setPartition(await get(`/partitioning/analyze?k=${kValue}`)); setLoading(""); };
  const runClusters  = async () => { setLoading("Clusters...");   setClusters(await get("/topology/clusters")); setLoading(""); };
  const runCommunities = async () => { setLoading("Communities..."); setCommunities(await get("/topology/communities")); setLoading(""); };
  const runVertexCut = async () => { setLoading("Vertex-Cut...");  setVertexCut(await get(`/partitioning/vertex-cut?k=${kValue}`)); setLoading(""); };
  const runMultiLevel = async () => { setLoading("Multi-Level..."); setMultiLevelK(await get(`/partitioning/multi-level?k=${kValue}`)); setLoading(""); };

  const S = {
    card:     { background: "#0d1520", border: "1px solid #1e2d40", borderRadius: 10, padding: 16, marginBottom: 12 },
    label:    { fontSize: 10, color: "#2a5080", letterSpacing: 2, marginBottom: 10 },
    btn:      { background: "rgba(77,159,255,.15)", border: "1px solid #4d9fff33", color: "#4d9fff", padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600, flex: "1 1 auto", minWidth: 90, textAlign: "center" },
    btnGreen: { background: "rgba(0,232,122,.15)", border: "1px solid #00e87a33", color: "#00e87a", padding: "10px 20px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700 },
    input:    { background: "#0a1018", border: "1px solid #1e2d40", color: "#c0ccd8", padding: "8px 10px", borderRadius: 5, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", width: "100%" },
    val:      { fontSize: 20, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" },
    small:    { fontSize: 10, color: "#4a6070" },
  };

  return (
    <div style={{ animation: "fadein .3s ease" }}>
      {/* ── Scoped mobile CSS ── */}
      <style>{`
        /* Result panels: 2-col desktop → 1-col mobile */
        .exp-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        /* Traversal control rows */
        .exp-input-row {
          display: grid;
          grid-template-columns: 1fr 60px 60px 1fr;
          gap: 10px;
          align-items: end;
        }
        .exp-btn-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin-top: 12px;
        }
        /* Unified 3-col inner grid */
        .exp-unified-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 15px;
        }
        /* Topo stats 3-col inner */
        .exp-topo-stats {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
          margin-bottom: 10px;
        }
        /* Span 2 columns (unified card) */
        .exp-span2 {
          grid-column: span 2;
        }

        @media (max-width: 900px) {
          /* Traversal inputs: 2-col on tablet */
          .exp-input-row {
            grid-template-columns: 1fr 1fr !important;
          }
        }
        @media (max-width: 768px) {
          /* Results: single column */
          .exp-grid {
            grid-template-columns: 1fr !important;
          }
          /* Unified card: no span override needed since grid is 1-col */
          .exp-span2 {
            grid-column: span 1 !important;
          }
          /* Traversal inputs: stack vertically */
          .exp-input-row {
            grid-template-columns: 1fr !important;
          }
          /* Buttons: 2 per row on mobile */
          .exp-btn-row {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          /* Unified inner 3-col → 1-col */
          .exp-unified-grid {
            grid-template-columns: 1fr !important;
          }
          /* Topo stats 3-col → 3-col but smaller */
          .exp-topo-stats {
            grid-template-columns: 1fr 1fr 1fr !important;
            gap: 6px;
          }
        }

        @media (max-width: 420px) {
          .exp-btn-row {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          .exp-topo-stats {
            grid-template-columns: 1fr 1fr 1fr !important;
          }
        }
      `}</style>

      {/* ── Build Graph ── */}
      <div style={S.card}>
        <div style={S.label}>◈ KNOWLEDGE GRAPH ENGINE</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button style={S.btnGreen} onClick={buildGraph}>⚡ BUILD GRAPH</button>
          <span style={S.small}>{graphBuilt ? "✓ Graph ready" : "Build graph first to enable analysis"}</span>
          {loading && <span style={{ color: "#ffcc00", fontSize: 11, animation: "pulse 1s infinite" }}>● {loading}</span>}
        </div>
      </div>

      {/* ── Traversal Controls ── */}
      <div style={S.card}>
        <div style={S.label}>◈ TRAVERSAL CONTROLS</div>

        {/* Input fields: 3-col on desktop, stack on mobile */}
        <div className="exp-input-row">
          <div>
            <div style={{ ...S.small, marginBottom: 5 }}>Paper ID</div>
            <input style={S.input} value={paperId} onChange={e => setPaperId(e.target.value)} placeholder="paper_00001" />
          </div>
          <div>
            <div style={{ ...S.small, marginBottom: 5 }}>Depth</div>
            <input style={{ ...S.input, textAlign: "center" }} type="number" value={depth} onChange={e => setDepth(+e.target.value)} min={1} max={5} />
          </div>
          <div>
            <div style={{ ...S.small, marginBottom: 5 }}>k (partitions)</div>
            <input style={{ ...S.input, textAlign: "center" }} type="number" value={kValue} onChange={e => setKValue(+e.target.value)} min={2} max={8} />
          </div>
          <div>
            <div style={{ ...S.small, marginBottom: 5 }}>Target (Shortest Path)</div>
            <input style={S.input} value={pathTarget} onChange={e => setPathTarget(e.target.value)} placeholder="paper_00001_dup" />
          </div>
        </div>

        {/* Action buttons: 4-col desktop, 2-col mobile */}
        <div className="exp-btn-row" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
          <button style={S.btn} onClick={runBFS}>BFS</button>
          <button style={S.btn} onClick={runDFS}>DFS</button>
          <button style={S.btn} onClick={runPath}>SHORTEST PATH</button>
          <button style={S.btn} onClick={runUnified}>UNIFIED</button>
          <button style={S.btn} onClick={runTopo}>TOPOLOGY</button>
          <button style={S.btn} onClick={runPartition}>PARTITION</button>
          <button style={S.btn} onClick={runVertexCut}>VERTEX-CUT</button>
          <button style={S.btn} onClick={runMultiLevel}>MULTI-LEVEL</button>
          <button style={S.btn} onClick={runClusters}>CLUSTERS</button>
          <button style={S.btn} onClick={runCommunities}>COMMUNITIES</button>
        </div>
      </div>

      {/* ── Results Grid ── */}
      <div className="exp-grid">

        {/* BFS Result */}
        {bfs && (
          <div style={S.card}>
            <div style={S.label}>◈ DISTRIBUTED BFS</div>
            <div style={{ display: "flex", gap: 20, marginBottom: 10, flexWrap: "wrap" }}>
              <div><span style={{ ...S.val, color: "#4d9fff" }}>{bfs.nodes_visited}</span> <span style={S.small}>nodes</span></div>
              <div><span style={{ ...S.val, color: "#ff4d88" }}>{bfs.cross_site_hops}</span> <span style={S.small}>cross-site hops</span></div>
              <div><span style={{ ...S.val, color: "#00e87a" }}>{bfs.api_calls_count}</span> <span style={S.small}>network calls</span></div>
            </div>
            {bfs.levels && Object.entries(bfs.levels).map(([d, l]) => (
              <div key={d} style={{ fontSize: 11, color: "#4a6070", marginBottom: 4 }}>
                Depth {d}: <span style={{ color: "#4d9fff" }}>{l.count} nodes</span>
                {l.nodes?.slice(0, 3).map(n => <span key={n} style={{ color: "#2a5080", marginLeft: 6, fontSize: 9 }}>{n}</span>)}
              </div>
            ))}
            {bfs.api_calls_log && (
              <div style={{ marginTop: 10, borderTop: "1px solid #1e2d40", paddingTop: 8 }}>
                <div style={{ ...S.small, fontWeight: 700, color: "#ffaa00", marginBottom: 4 }}>FEDERATED QUERY LOG:</div>
                <div style={{ maxHeight: 90, overflowY: "auto", fontFamily: "monospace", fontSize: 9, color: "#8a9ba8", background: "#060a10", padding: 6, borderRadius: 4 }}>
                  {bfs.api_calls_log.map((log, idx) => (
                    <div key={idx} style={{ borderBottom: "1px solid #121926", padding: "2px 0" }}>⚡ {log}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* DFS Result */}
        {dfs && (
          <div style={S.card}>
            <div style={S.label}>◈ DISTRIBUTED DFS</div>
            <div style={{ display: "flex", gap: 20, marginBottom: 10, flexWrap: "wrap" }}>
              <div><span style={{ ...S.val, color: "#bb88ff" }}>{dfs.nodes_visited}</span> <span style={S.small}>nodes</span></div>
              <div><span style={{ ...S.val, color: "#ff4d88" }}>{dfs.cross_site_hops}</span> <span style={S.small}>cross-site</span></div>
              <div><span style={{ ...S.val, color: "#00e87a" }}>{dfs.api_calls_count}</span> <span style={S.small}>network calls</span></div>
            </div>
            <div style={{ fontSize: 10, color: "#4a6070", wordBreak: "break-word", marginBottom: 6 }}>
              Order: {dfs.traversal_order?.slice(0, 8).join(" → ")}
            </div>
            {dfs.api_calls_log && (
              <div style={{ marginTop: 10, borderTop: "1px solid #1e2d40", paddingTop: 8 }}>
                <div style={{ ...S.small, fontWeight: 700, color: "#ffaa00", marginBottom: 4 }}>FEDERATED QUERY LOG:</div>
                <div style={{ maxHeight: 90, overflowY: "auto", fontFamily: "monospace", fontSize: 9, color: "#8a9ba8", background: "#060a10", padding: 6, borderRadius: 4 }}>
                  {dfs.api_calls_log.map((log, idx) => (
                    <div key={idx} style={{ borderBottom: "1px solid #121926", padding: "2px 0" }}>⚡ {log}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Shortest Path */}
        {path && (
          <div style={S.card}>
            <div style={S.label}>◈ SHORTEST PATH</div>
            {path.error ? <div style={{ color: "#ff3d5a", fontSize: 12 }}>{path.error}</div> : (
              <>
                <div style={{ marginBottom: 8, display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <div><span style={{ ...S.val, color: "#00e87a" }}>{path.path_length}</span> <span style={S.small}>hops</span></div>
                  <div><span style={{ ...S.val, color: "#ff4d88" }}>{path.cross_site_edges}</span> <span style={S.small}>cross-site</span></div>
                  <div><span style={{ ...S.val, color: "#00e87a" }}>{path.api_calls_count}</span> <span style={S.small}>network calls</span></div>
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                  {path.path?.map((n, i) => (
                    <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{
                        fontSize: 10, padding: "2px 6px", borderRadius: 4,
                        background: n.site === "site_a" ? "rgba(77,159,255,.15)" : "rgba(255,77,136,.15)",
                        color: n.site === "site_a" ? "#4d9fff" : "#ff4d88",
                        border: `1px solid ${n.site === "site_a" ? "#4d9fff33" : "#ff4d8833"}`,
                      }}>
                        {n.id}
                      </span>
                      {i < path.path.length - 1 && <span style={{ color: "#2a4050" }}>→</span>}
                    </span>
                  ))}
                </div>
                {path.api_calls_log && (
                  <div style={{ marginTop: 10, borderTop: "1px solid #1e2d40", paddingTop: 8 }}>
                    <div style={{ ...S.small, fontWeight: 700, color: "#ffaa00", marginBottom: 4 }}>FEDERATED QUERY LOG:</div>
                    <div style={{ maxHeight: 90, overflowY: "auto", fontFamily: "monospace", fontSize: 9, color: "#8a9ba8", background: "#060a10", padding: 6, borderRadius: 4 }}>
                      {path.api_calls_log.map((log, idx) => (
                        <div key={idx} style={{ borderBottom: "1px solid #121926", padding: "2px 0" }}>⚡ {log}</div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Unified View (Multi-Model) — spans 2 cols on desktop, 1 on mobile */}
        {unified && (
          <div style={{ ...S.card, marginBottom: 0 }} className="exp-span2">
            <div style={S.label}>◈ MULTI-MODEL UNIFIED VIEW (SEAMLESS INTEGRATION)</div>
            <div className="exp-unified-grid">

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
                <div style={{ fontSize: 10, color: "#4a6070", marginTop: 10, marginBottom: 4 }}>TOP NEIGHBORS:</div>
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
                  <pre style={{ fontSize: 8, color: "#2a5080", margin: 0, marginTop: 4, overflowX: "auto" }}>
                    {JSON.stringify(unified.models?.document?.data?._meta?.field_mapping, null, 2)}
                  </pre>
                </div>
              </div>

            </div>
            {/* Cross-Model Correlation Insights */}
            {unified.cross_model_correlation?.cross_model_insights?.length > 0 && (
              <div style={{ marginTop: 15, borderTop: "1px solid #1e2d40", paddingTop: 12 }}>
                <div style={S.label}>◈ CROSS-MODEL CORRELATION INSIGHTS (SEAMLESS JOIN)</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {unified.cross_model_correlation.cross_model_insights.map((insight, idx) => (
                    <div key={idx} style={{
                      padding: "8px 12px", borderRadius: 6,
                      background: insight.type.includes("graph") ? "rgba(0,232,122,0.06)" :
                                  insight.type.includes("document") ? "rgba(187,136,255,0.06)" :
                                  "rgba(77,159,255,0.06)",
                      border: `1px solid ${insight.type.includes("graph") ? "#00e87a22" : insight.type.includes("document") ? "#bb88ff22" : "#4d9fff22"}`,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: insight.type.includes("graph") ? "#00e87a" : insight.type.includes("document") ? "#bb88ff" : "#4d9fff" }}>
                          {insight.type.includes("→") ? insight.type : `${insight.type}: ${insight.correlation}`}
                        </span>
                        <span style={{ fontSize: 8, color: "#2a4050", fontFamily: "'JetBrains Mono', monospace" }}>
                          [{insight.models_involved?.join(" + ")}]
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: "#8aa0b8", lineHeight: 1.5 }}>{insight.detail}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                  <span style={{ fontSize: 9, color: unified.cross_model_correlation.consistency_check?.status === "CONSISTENT" ? "#00e87a" : "#ffcc00", fontWeight: 700 }}>
                    ● {unified.cross_model_correlation.consistency_check?.status}
                  </span>
                  <span style={{ fontSize: 9, color: "#2a4050" }}>— {unified.cross_model_correlation.summary}</span>
                </div>
              </div>
            )}
            <div style={{ marginTop: 12, textAlign: "right", borderTop: "1px solid #1e2d40", paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              <span style={{ fontSize: 9, color: "#2a4050" }}>
                {unified.integration?.join_types?.slice(0, 2).map((jt, i) => (
                  <span key={i} style={{ marginRight: 8 }}>▸ {jt}</span>
                ))}
              </span>
              <span style={{ fontSize: 10, color: "#2a5080" }}>
                <strong>{unified.integration?.method}</strong> · {unified.integration?.join_strategy?.substring(0, 50)}...
              </span>
            </div>
          </div>
        )}

        {/* Partition Analysis */}
        {partition && !partition.error && (
          <div style={S.card}>
            <div style={S.label}>◈ ADVANCED GRAPH PARTITIONING (METIS & VERTEX-CUT)</div>
            <div style={{ fontSize: 10, color: "#bb88ff", marginBottom: 8 }}>Comparing Edge-Cut vs Vertex-Cut bisection:</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ padding: 8, borderRadius: 6, background: "rgba(255,61,90,.05)", border: "1px solid #ff3d5a22" }}>
                <div style={{ fontSize: 9, color: "#ff3d5a", fontWeight: 700, marginBottom: 4 }}>EDGE-CUT PARTITIONING (METIS/KL)</div>
                <div style={{ fontSize: 11, color: "#4a6070" }}>A: {partition.optimal_partition?.partition_a_nodes} | B: {partition.optimal_partition?.partition_b_nodes}</div>
                <div style={{ fontSize: 11, color: "#ff3d5a" }}>Edge-Cut: {partition.optimal_partition?.edge_cut} ({(partition.optimal_partition?.edge_cut_ratio * 100).toFixed(1)}%)</div>
                <div style={{ fontSize: 10, color: "#4a6070" }}>Balance: {partition.optimal_partition?.balance}</div>
              </div>
              <div style={{ padding: 8, borderRadius: 6, background: "rgba(0,232,122,.05)", border: "1px solid #00e87a22" }}>
                <div style={{ fontSize: 9, color: "#00e87a", fontWeight: 700, marginBottom: 4 }}>VERTEX-CUT PARTITIONING (GREEDY)</div>
                <div style={{ fontSize: 11, color: "#4a6070" }}>Edges per Partition: {partition.vertex_cut?.partitions_edges?.join(" | ")}</div>
                <div style={{ fontSize: 11, color: "#00e87a" }}>Replication Factor: {partition.vertex_cut?.replication_factor}</div>
                <div style={{ fontSize: 11, color: "#00e87a" }}>Vertex-Cut Ratio: {(partition.vertex_cut?.vertex_cut_ratio * 100).toFixed(1)}% ({partition.vertex_cut?.replicated_vertices} nodes)</div>
                <div style={{ fontSize: 10, color: "#4a6070" }}>Balance: {partition.vertex_cut?.balance}</div>
              </div>
            </div>
            <div style={{ marginTop: 10, padding: 8, borderRadius: 6, background: "rgba(187,136,255,.08)", border: "1px solid #bb88ff22" }}>
              <span style={{ ...S.val, color: "#bb88ff", fontSize: 16 }}>{partition.improvement?.hop_reduction_pct}%</span>
              <span style={S.small}> hop reduction in edge-cut • Vertex-Cut replication factor: {partition.vertex_cut?.replication_factor}x</span>
            </div>
          </div>
        )}

        {/* Topology */}
        {topo && !topo.error && (
          <div style={S.card}>
            <div style={S.label}>◈ DEEP TOPOLOGY ANALYSIS + COMMUNITY DETECTION</div>
            <div className="exp-topo-stats">
              {[
                ["Nodes",      topo.nodes,                  "#4d9fff"],
                ["Edges",      topo.edges,                  "#ff4d88"],
                ["Avg Degree", topo.degree_stats?.avg_degree, "#bb88ff"],
                ["Communities", topo.community_detection_louvain?.num_communities, "#00e87a"],
              ].filter(([l,v,c]) => v !== undefined && v !== null).map(([l, v, c]) => (
                <div key={l} style={{ textAlign: "center", padding: "6px 4px", background: `${c}08`, borderRadius: 8, border: `1px solid ${c}18` }}>
                  <div style={{ ...S.val, color: c, fontSize: 16 }}>{v}</div>
                  <div style={S.small}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "#4a6070" }}>Edge-Cut: <span style={{ color: "#ff3d5a" }}>{topo.edge_cut?.cross_site_edges}</span> cross / <span style={{ color: "#00e87a" }}>{topo.edge_cut?.intra_site_edges}</span> intra</div>
              <div style={{ fontSize: 11, color: "#4a6070" }}>Ratio: <span style={{ color: "#bb88ff" }}>{(topo.edge_cut?.edge_cut_ratio * 100).toFixed(1)}%</span></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
              <div style={{ padding: 8, borderRadius: 6, background: "rgba(0,232,122,.05)", border: "1px solid #00e87a22" }}>
                <div style={{ fontSize: 9, color: "#00e87a", fontWeight: 700, marginBottom: 4 }}>LOUVAIN COMMUNITIES</div>
                <div style={{ fontSize: 11, color: "#4a6070" }}>Communities: {topo.community_detection_louvain?.num_communities}</div>
                <div style={{ fontSize: 11, color: "#00e87a" }}>Modularity: {topo.community_detection_louvain?.modularity}</div>
                <div style={{ fontSize: 10, color: "#4a6070" }}>Cross-site: {topo.community_detection_louvain?.cross_site_communities}</div>
                <div style={{ fontSize: 9, color: "#1e3040", marginTop: 4 }}>{topo.community_detection_louvain?.modularity_interpretation}</div>
              </div>
              <div style={{ padding: 8, borderRadius: 6, background: "rgba(77,159,255,.05)", border: "1px solid #4d9fff22" }}>
                <div style={{ fontSize: 9, color: "#4d9fff", fontWeight: 700, marginBottom: 4 }}>CLUSTERS & DENSITY</div>
                <div style={{ fontSize: 11, color: "#4a6070" }}>Clusters: {topo.clusters?.total_components} | Largest: {topo.clusters?.largest_cluster_size}</div>
                <div style={{ fontSize: 11, color: "#4d9fff" }}>Avg Density: {topo.clusters?.avg_density}</div>
                <div style={{ fontSize: 10, color: "#4a6070" }}>Mixed (cross-site): {topo.clusters?.mixed_site_clusters}</div>
              </div>
            </div>
            <div>
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
            <div style={{ maxHeight: 220, overflowY: "auto" }}>
              {clusters.clusters?.map(c => (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "5px 0", borderBottom: "1px solid #0d1520", gap: 8 }}>
                  <span style={{ color: c.is_cross_site ? "#00e87a" : "#4a6070", flexShrink: 0 }}>Cluster #{c.id}</span>
                  <span style={{ color: "#4d9fff", flexShrink: 0 }}>{c.size} nodes</span>
                  <span style={{ color: "#2a4050", flexShrink: 0 }}>{c.edges} edges</span>
                  <span style={{ fontSize: 9, color: c.is_cross_site ? "#00e87a" : "#2a4050", flexShrink: 0 }}>{c.is_cross_site ? "CROSS" : "local"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Community Detection (Louvain) */}
        {communities && !communities.error && (
          <div style={S.card}>
            <div style={S.label}>◈ COMMUNITY DETECTION (LOUVAIN — MODULARITY MAXIMIZATION)</div>
            <div style={{ display: "flex", gap: 20, marginBottom: 10, flexWrap: "wrap" }}>
              <div><span style={{ ...S.val, color: "#00e87a" }}>{communities.num_communities}</span> <span style={S.small}>communities</span></div>
              <div><span style={{ ...S.val, color: "#bb88ff" }}>{communities.modularity}</span> <span style={S.small}>modularity</span></div>
              <div><span style={{ ...S.val, color: "#4d9fff" }}>{communities.largest_community}</span> <span style={S.small}>largest</span></div>
              <div><span style={{ ...S.val, color: "#ff4d88" }}>{communities.cross_site_communities}</span> <span style={S.small}>cross-site</span></div>
            </div>
            <div style={{ fontSize: 11, color: "#4a6070", marginBottom: 8 }}>
              Community sizes (top): {communities.community_sizes?.slice(0, 8).join(" · ")}
            </div>
            <div style={{ fontSize: 10, color: "#1e3040", fontStyle: "italic", padding: "6px 8px", background: "rgba(187,136,255,0.05)", borderRadius: 4 }}>
              {communities.comparison_with_components}
            </div>
          </div>
        )}

        {/* Vertex-Cut Partitioning */}
        {vertexCut && !vertexCut.error && (
          <div style={S.card}>
            <div style={S.label}>◈ VERTEX-CUT PARTITIONING (k={vertexCut.num_partitions})</div>
            <div style={{ display: "flex", gap: 20, marginBottom: 10, flexWrap: "wrap" }}>
              <div><span style={{ ...S.val, color: "#00e87a" }}>{vertexCut.replication_factor}x</span> <span style={S.small}>replication factor</span></div>
              <div><span style={{ ...S.val, color: "#ff4d88" }}>{vertexCut.replicated_vertices}</span> <span style={S.small}>replicated vertices</span></div>
              <div><span style={{ ...S.val, color: "#bb88ff" }}>{(vertexCut.vertex_cut_ratio * 100).toFixed(1)}%</span> <span style={S.small}>vertex-cut ratio</span></div>
              <div><span style={{ ...S.val, color: "#4d9fff" }}>{vertexCut.balance}</span> <span style={S.small}>balance</span></div>
            </div>
            <div style={{ fontSize: 11, color: "#4a6070" }}>
              Edges per partition: [{vertexCut.partitions_edges?.join(", ")}]
            </div>
            <div style={{ fontSize: 10, color: "#1e3040", fontStyle: "italic", marginTop: 6 }}>
              {vertexCut.comparison}
            </div>
          </div>
        )}

        {/* Multi-level k-way Partitioning (METIS) */}
        {multiLevelK && !multiLevelK.error && (
          <div style={S.card}>
            <div style={S.label}>◈ MULTI-LEVEL k-way PARTITIONING (METIS-style k={multiLevelK.k})</div>
            <div style={{ display: "flex", gap: 20, marginBottom: 10, flexWrap: "wrap" }}>
              <div><span style={{ ...S.val, color: "#bb88ff" }}>{multiLevelK.edge_cut}</span> <span style={S.small}>edge-cut</span></div>
              <div><span style={{ ...S.val, color: "#00e87a" }}>{(multiLevelK.edge_cut_ratio * 100).toFixed(1)}%</span> <span style={S.small}>cut ratio</span></div>
              <div><span style={{ ...S.val, color: "#4d9fff" }}>{multiLevelK.balance}</span> <span style={S.small}>balance</span></div>
              <div><span style={{ ...S.val, color: "#ffcc00" }}>{multiLevelK.coarsening_rounds}</span> <span style={S.small}>coarsening rounds</span></div>
            </div>
            <div style={{ fontSize: 11, color: "#4a6070", marginBottom: 6 }}>
              Partition sizes: [{multiLevelK.partition_sizes?.join(", ")}] — <span style={{ color: multiLevelK.balance_quality === "BALANCED" ? "#00e87a" : "#ffcc00" }}>{multiLevelK.balance_quality}</span>
            </div>
            <div style={{ fontSize: 10, color: "#1e3040", fontStyle: "italic", background: "rgba(77,159,255,0.04)", padding: "6px 8px", borderRadius: 4 }}>
              {multiLevelK.summary}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
