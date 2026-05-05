import { useState, useEffect, useRef, useCallback } from "react";
import { GraphExplorerTab } from "./GraphExplorer";
import { GraphVisualizer } from "./GraphVisualizer";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ── API helpers ───────────────────────────────────────────────
const get = async (path) => {
  try {
    const r = await fetch(`${API}${path}`);
    if (!r.ok) throw new Error(r.statusText);
    return await r.json();
  } catch (e) {
    console.error(path, e.message);
    return null;
  }
};

const post = async (path, body) => {
  try {
    const r = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await r.json();
  } catch (e) {
    console.error(path, e.message);
    return null;
  }
};

// ── Components ────────────────────────────────────────────────

function StatusDot({ status }) {
  const color =
    status === "online" ? "#00e87a"
    : status === "offline" ? "#ff3d5a"
    : "#ffcc00";
  return (
    <span style={{
      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
      background: color, boxShadow: `0 0 8px ${color}`,
      animation: status === "online" ? "pulse 2.5s infinite" : "none",
      marginRight: 6,
    }} />
  );
}

function StatCard({ label, value, sub, color = "#4d9fff" }) {
  return (
    <div style={{
      background: "#0d1520", border: "1px solid #1e2d40",
      borderRadius: 10, padding: "16px 20px", minWidth: 140,
      boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
    }}>
      <div style={{ fontSize: 24, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>{value ?? "—"}</div>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#4a6070", marginTop: 4, letterSpacing: 1.2, textTransform: "uppercase" }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "#334455", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function DecisionBadge({ decision }) {
  const styles = {
    MERGE:    { bg: "rgba(0,232,122,0.12)", border: "#00e87a44", color: "#00e87a" },
    REVIEW:   { bg: "rgba(255,204,0,0.12)", border: "#ffcc0044", color: "#ffcc00" },
    SEPARATE: { bg: "rgba(255,61,90,0.12)", border: "#ff3d5a44", color: "#ff3d5a" },
  };
  const s = styles[decision] || styles.SEPARATE;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
      padding: "2px 7px", borderRadius: 4,
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
    }}>{decision}</span>
  );
}

function ScoreBar({ score, decision }) {
  const color =
    decision === "MERGE" ? "#00e87a"
    : decision === "REVIEW" ? "#ffcc00"
    : "#ff3d5a";
  return (
    <div style={{ height: 3, background: "#1a2533", borderRadius: 2, overflow: "hidden", marginTop: 6 }}>
      <div style={{ width: `${score * 100}%`, height: "100%", background: color, borderRadius: 2, transition: "width .4s" }} />
    </div>
  );
}

// ── TABS ──────────────────────────────────────────────────────
const TABS = ["Dashboard", "Resolution", "Results", "Metrics", "Graph Explorer", "Graph Visualizer", "Data Explorer"];

export default function App() {
  const [tab, setTab] = useState("Dashboard");
  const [sites, setSites] = useState({ site_a: {}, site_b: {}, coordinator: {} });
  const [resStatus, setResStatus] = useState(null);
  const [resStats, setResStats] = useState(null);
  const [results, setResults] = useState([]);
  const [resultTotal, setResultTotal] = useState(0);
  const [f1, setF1] = useState(null);
  const [siteAStats, setSiteAStats] = useState(null);
  const [siteBStats, setSiteBStats] = useState(null);
  const [papers, setPapers] = useState([]);
  const [papersTotal, setPapersTotal] = useState(0);
  const [paperSite, setPaperSite] = useState("a");
  const [paperPage, setPaperPage] = useState(1);
  const [filterDecision, setFilterDecision] = useState("");
  const [resultPage, setResultPage] = useState(1);
  const [jobRunning, setJobRunning] = useState(false);
  const [queue, setQueue] = useState([]);
  const pollRef = useRef(null);

  // ── Poll status ────────────────────────────────────────────
  const refreshAll = useCallback(async () => {
    const [s, rs, rstat, f, q] = await Promise.all([
      get("/sites/status"),
      get("/resolution/status"),
      get("/resolution/stats"),
      get("/metrics/f1"),
      get("/queue"),
    ]);
    if (s) setSites(s);
    if (rs) {
      setResStatus(rs);
      setJobRunning(rs.running);
    }
    if (rstat) setResStats(rstat);
    if (f) setF1(f);
    if (q) setQueue(q.queue || []);
  }, []);

  useEffect(() => {
    refreshAll();
    const siteStats = async () => {
      const [a, b] = await Promise.all([
        fetch("http://localhost:8001/stats").then(r => r.json()).catch(() => null),
        fetch("http://localhost:8002/stats").then(r => r.json()).catch(() => null),
      ]);
      if (a) setSiteAStats(a);
      if (b) setSiteBStats(b);
    };
    siteStats();
  }, []);

  useEffect(() => {
    if (jobRunning) {
      pollRef.current = setInterval(refreshAll, 2000);
    } else {
      clearInterval(pollRef.current);
      if (resStatus && !resStatus.running) refreshAll();
    }
    return () => clearInterval(pollRef.current);
  }, [jobRunning, refreshAll]);

  // ── Load results ────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const d = await get(`/resolution/results?decision=${filterDecision}&page=${resultPage}&size=30`);
      if (d) { setResults(d.data || []); setResultTotal(d.total || 0); }
    };
    load();
  }, [filterDecision, resultPage, resStatus?.processed]);

  // ── Load papers ─────────────────────────────────────────────
  useEffect(() => {
    const base = paperSite === "a" ? "http://localhost:8001" : "http://localhost:8002";
    fetch(`${base}/papers?page=${paperPage}&size=30`)
      .then(r => r.json())
      .then(d => { setPapers(d.data || []); setPapersTotal(d.total || 0); })
      .catch(() => {});
  }, [paperSite, paperPage]);

  const startJob = async () => {
    const r = await post("/resolution/start", {
      years: [2018, 2019, 2020, 2021, 2022, 2023],
      limit_per_year: 80,
    });
    if (r?.job_id) { setJobRunning(true); refreshAll(); }
  };

  // ── RENDER ─────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#070c14", color: "#c0ccd8", fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes fadein { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#0a0f18}
        ::-webkit-scrollbar-thumb{background:#1e2d40;border-radius:4px}
        * { box-sizing: border-box; }
      `}</style>

      {/* STICKY HEADER & TABS WRAPPER */}
      <div style={{ position: "sticky", top: 0, zIndex: 1000, boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
        {/* HEADER */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 32px", borderBottom: "1px solid #131e2c",
          background: "rgba(10, 18, 30, 0.9)", backdropFilter: "blur(12px)",
        }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 600, color: "#4d9fff", letterSpacing: 3, marginBottom: 4 }}>
              DISTRIBUTED KNOWLEDGE GRAPH
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#ffffff", letterSpacing: -0.5 }}>
              Entity Resolution <span style={{ color: "#4d9fff" }}>Engine</span>
            </div>
          </div>

          {/* Site status */}
          <div style={{ display: "flex", gap: 24 }}>
            {[
              ["SITE A", sites.site_a?.status],
              ["SITE B", sites.site_b?.status],
              ["COORD", "online"],
            ].map(([label, status]) => (
              <div key={label} style={{ textAlign: "left" }}>
                <div style={{ color: "#4a6070", fontSize: 9, fontWeight: 700, letterSpacing: 1.5, marginBottom: 4 }}>{label}</div>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <StatusDot status={status || "offline"} />
                  <span style={{
                    color: status === "online" ? "#00e87a" : status === "offline" ? "#ff3d5a" : "#aaa",
                    fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace"
                  }}>{(status || "offline").toUpperCase()}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Start button */}
          <button
            onClick={startJob}
            disabled={jobRunning}
            style={{
              background: jobRunning ? "rgba(77,159,255,0.05)" : "linear-gradient(135deg, #00e87a 0%, #00c86a 100%)",
              border: "none",
              color: jobRunning ? "#4a6070" : "#0a121e",
              padding: "10px 24px", borderRadius: 8, cursor: jobRunning ? "not-allowed" : "pointer",
              fontSize: 13, fontWeight: 700, transition: "all 0.3s ease",
              boxShadow: jobRunning ? "none" : "0 4px 15px rgba(0,232,122,0.3)",
              display: "flex", alignItems: "center", gap: 8
            }}
          >
            {jobRunning ? (
              <>
                <span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid #4a6070", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                RUNNING...
              </>
            ) : "▶ START RESOLUTION"}
          </button>
        </div>

        {/* TABS */}
        <div style={{ 
          display: "flex", gap: 8, padding: "0 32px", 
          background: "rgba(10, 18, 30, 0.95)", backdropFilter: "blur(12px)",
          borderBottom: "1px solid #131e2c" 
        }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: "none", border: "none", 
              borderBottom: tab === t ? "3px solid #4d9fff" : "3px solid transparent",
              color: tab === t ? "#ffffff" : "#4a6070", 
              padding: "14px 20px", cursor: "pointer",
              fontSize: 12, fontWeight: tab === t ? 700 : 500, 
              letterSpacing: 0.5, transition: "all 0.2s",
            }}>{t}</button>
          ))}
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ padding: "20px 28px" }}>

        {/* ── DASHBOARD ── */}
        {tab === "Dashboard" && (
          <div style={{ animation: "fadein .3s ease" }}>
            {/* Stats row */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
              <StatCard label="SITE A PAPERS" value={siteAStats?.papers?.toLocaleString()} color="#4d9fff" />
              <StatCard label="SITE B PAPERS" value={siteBStats?.papers?.toLocaleString()} color="#ff4d88" />
              <StatCard label="PAIRS PROCESSED" value={resStats?.total_pairs?.toLocaleString()} color="#aabbcc" />
              <StatCard label="MERGED" value={resStats?.by_decision?.find(d => d.decision === "MERGE")?.cnt} color="#00e87a" />
              <StatCard label="REVIEW" value={resStats?.by_decision?.find(d => d.decision === "REVIEW")?.cnt} color="#ffcc00" />
              <StatCard label="SEPARATE" value={resStats?.by_decision?.find(d => d.decision === "SEPARATE")?.cnt} color="#ff3d5a" />
              <StatCard label="EDGE-CUT RATIO" value={resStats?.edge_cut_ratio} color="#bb88ff" sub={`${resStats?.cross_site_edges || 0} cross-site edges`} />
              <StatCard label="CLUSTERS" value={resStats?.cluster_count} color="#ff9944" sub={`${resStats?.mixed_clusters || 0} cross-site`} />
              <StatCard label="GRAPH" value={resStats?.graph_nodes} color="#00ccff" sub={`${resStats?.graph_edges || 0} edges`} />
              <StatCard label="F1 SCORE" value={f1?.f1} color="#00ccff" sub={`P:${f1?.precision} R:${f1?.recall}`} />
            </div>

            {/* Top merges */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: "#0d1520", border: "1px solid #1e2d40", borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 10, color: "#2a5080", letterSpacing: 2, marginBottom: 12 }}>◈ TOP MERGED PAIRS</div>
                {resStats?.top_merges?.slice(0, 6).map((m, i) => (
                  <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid #131e2c" }}>
                    <div style={{ fontSize: 11, color: "#4d9fff", marginBottom: 2 }}>{m.title_a}</div>
                    <div style={{ fontSize: 11, color: "#ff4d88" }}>{m.title_b}</div>
                    <ScoreBar score={m.score} decision="MERGE" />
                    <div style={{ fontSize: 10, color: "#00e87a", marginTop: 3 }}>{(m.score * 100).toFixed(1)}%</div>
                  </div>
                ))}
                {!resStats?.top_merges?.length && (
                  <div style={{ color: "#2a3a4a", fontSize: 12, textAlign: "center", padding: "20px 0" }}>
                    Run resolution to see results
                  </div>
                )}
              </div>

              {/* Pending queue */}
              <div style={{ background: "#0d1520", border: "1px solid #1e2d40", borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 10, color: "#2a5080", letterSpacing: 2, marginBottom: 12 }}>◈ PENDING QUEUE (FAILURE RECOVERY)</div>
                {queue.length === 0 ? (
                  <div style={{ color: "#2a3a4a", fontSize: 12, textAlign: "center", padding: "20px 0" }}>
                    No pending jobs — all sites healthy
                  </div>
                ) : queue.map((q, i) => (
                  <div key={i} style={{
                    padding: "8px 12px", marginBottom: 8, borderRadius: 7,
                    background: q.status === "retried" ? "rgba(0,232,122,.07)" : "rgba(255,204,0,.07)",
                    border: `1px solid ${q.status === "retried" ? "#00e87a22" : "#ffcc0022"}`,
                  }}>
                    <span style={{ color: "#ffcc00", fontSize: 11 }}>Year {q.year}</span>
                    <span style={{
                      float: "right", fontSize: 9, letterSpacing: 1,
                      color: q.status === "retried" ? "#00e87a" : "#ffcc00"
                    }}>{q.status.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── RESOLUTION ── */}
        {tab === "Resolution" && (
          <div style={{ animation: "fadein .3s ease" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16 }}>
              {/* Log */}
              <div style={{ background: "#0d1520", border: "1px solid #1e2d40", borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 10, color: "#2a5080", letterSpacing: 2, marginBottom: 12 }}>
                  ◈ COORDINATOR LOG
                  {jobRunning && <span style={{ float: "right", color: "#ffcc00", animation: "pulse 1s infinite" }}>● LIVE</span>}
                </div>
                <div style={{ height: 480, overflowY: "auto", fontSize: 11, lineHeight: 1.8 }}>
                  {resStatus?.log?.length === 0 && (
                    <div style={{ color: "#2a3a4a", textAlign: "center", padding: "60px 0" }}>
                      Press ▶ START RESOLUTION to begin
                    </div>
                  )}
                  {resStatus?.log?.map((l, i) => (
                    <div key={i} style={{
                      color: l.level === "system" ? "#99bbdd"
                           : l.level === "success" ? "#00e87a"
                           : l.level === "error" ? "#ff3d5a"
                           : l.level === "warn" ? "#ffcc00"
                           : l.level === "divider" ? "#1e2d40"
                           : "#4a6070",
                      animation: "fadein .2s ease",
                    }}>
                      <span style={{ color: "#1e2d40", marginRight: 8 }}>{l.ts}</span>
                      {l.msg}
                    </div>
                  ))}
                </div>
              </div>

              {/* Progress */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ background: "#0d1520", border: "1px solid #1e2d40", borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 10, color: "#2a5080", letterSpacing: 2, marginBottom: 12 }}>◈ PROGRESS</div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: "#4d9fff", textAlign: "center" }}>
                    {resStatus?.processed ?? 0}
                  </div>
                  <div style={{ fontSize: 10, color: "#2a4050", textAlign: "center", marginBottom: 12 }}>PAIRS PROCESSED</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      ["SITE A", resStatus?.site_a],
                      ["SITE B", resStatus?.site_b],
                    ].map(([label, status]) => (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "#4a6070" }}>{label}</span>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <StatusDot status={status || "unknown"} />
                          <span style={{ fontSize: 10, color: status === "online" ? "#00e87a" : "#ff3d5a" }}>
                            {(status || "unknown").toUpperCase()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Instructions */}
                <div style={{ background: "#0d1520", border: "1px solid #ffcc0022", borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 10, color: "#cc9900", letterSpacing: 2, marginBottom: 10 }}>◈ FAILURE DEMO</div>
                  <div style={{ fontSize: 11, color: "#4a6070", lineHeight: 1.8 }}>
                    While resolution is running, open a terminal and type:
                    <br /><br />
                    <code style={{ color: "#ff3d5a", background: "#0a0f18", padding: "4px 8px", borderRadius: 4, display: "block", marginBottom: 8 }}>
                      docker stop kg_site_b
                    </code>
                    Watch the coordinator detect the failure, queue jobs, then recover when you run:
                    <br /><br />
                    <code style={{ color: "#00e87a", background: "#0a0f18", padding: "4px 8px", borderRadius: 4, display: "block" }}>
                      docker start kg_site_b
                    </code>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {tab === "Results" && (
          <div style={{ animation: "fadein .3s ease" }}>
            {/* Filter */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {["", "MERGE", "REVIEW", "SEPARATE"].map(d => (
                <button key={d} onClick={() => { setFilterDecision(d); setResultPage(1); }}
                  style={{
                    background: filterDecision === d ? "rgba(77,159,255,.2)" : "transparent",
                    border: `1px solid ${filterDecision === d ? "#4d9fff" : "#1e2d40"}`,
                    color: filterDecision === d ? "#4d9fff" : "#2a4050",
                    padding: "5px 14px", borderRadius: 6, cursor: "pointer",
                    fontSize: 11, fontFamily: "Courier New",
                  }}>
                  {d || "ALL"} {resStats?.by_decision?.find(x => x.decision === d)?.cnt
                    ? `(${resStats.by_decision.find(x => x.decision === d).cnt})` : ""}
                </button>
              ))}
              <span style={{ marginLeft: "auto", color: "#2a4050", fontSize: 11, alignSelf: "center" }}>
                {resultTotal.toLocaleString()} total
              </span>
            </div>

            {/* Table */}
            <div style={{ background: "#0d1520", border: "1px solid #1e2d40", borderRadius: 10, overflow: "hidden" }}>
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 80px 90px",
                padding: "8px 16px", borderBottom: "1px solid #131e2c",
                fontSize: 9, color: "#2a4050", letterSpacing: 2,
              }}>
                <span>TITLE A (DBLP)</span>
                <span>TITLE B (SEMANTIC SCHOLAR)</span>
                <span>SCORE</span>
                <span>DECISION</span>
              </div>
              {results.map((r, i) => (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr 80px 90px",
                  padding: "10px 16px", borderBottom: "1px solid #0d1520",
                  fontSize: 11, animation: "fadein .2s ease",
                  background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,.01)",
                }}>
                  <span style={{ color: "#4d9fff", paddingRight: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.title_a}
                  </span>
                  <span style={{ color: "#ff4d88", paddingRight: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.title_b}
                  </span>
                  <span style={{ color: "#aabbcc" }}>{(r.score * 100).toFixed(1)}%</span>
                  <span><DecisionBadge decision={r.decision} /></span>
                </div>
              ))}
              {results.length === 0 && (
                <div style={{ padding: "40px", textAlign: "center", color: "#1e2d40" }}>
                  No results yet — run resolution first
                </div>
              )}
            </div>

            {/* Pagination */}
            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "center" }}>
              {[1, 2, 3, 4, 5].map(p => (
                <button key={p} onClick={() => setResultPage(p)}
                  style={{
                    background: resultPage === p ? "rgba(77,159,255,.2)" : "transparent",
                    border: `1px solid ${resultPage === p ? "#4d9fff" : "#1e2d40"}`,
                    color: resultPage === p ? "#4d9fff" : "#2a4050",
                    width: 32, height: 32, borderRadius: 6, cursor: "pointer",
                    fontSize: 11, fontFamily: "Courier New",
                  }}>{p}</button>
              ))}
            </div>
          </div>
        )}

        {/* ── METRICS ── */}
        {tab === "Metrics" && (
          <div style={{ animation: "fadein .3s ease" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

              {/* F1 */}
              <div style={{ background: "#0d1520", border: "1px solid #1e2d40", borderRadius: 10, padding: 20 }}>
                <div style={{ fontSize: 10, color: "#2a5080", letterSpacing: 2, marginBottom: 16 }}>◈ PRECISION / RECALL / F1</div>
                {f1 ? (
                  <>
                    {[
                      ["Precision", f1.precision, "#00e87a"],
                      ["Recall",    f1.recall,    "#4d9fff"],
                      ["F1 Score",  f1.f1,        "#bb88ff"],
                    ].map(([label, val, color]) => (
                      <div key={label} style={{ marginBottom: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                          <span style={{ fontSize: 12, color: "#4a6070" }}>{label}</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color }}>{val}</span>
                        </div>
                        <div style={{ height: 6, background: "#131e2c", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${val * 100}%`, height: "100%", background: color, borderRadius: 3, transition: "width .6s" }} />
                        </div>
                      </div>
                    ))}
                    <div style={{ marginTop: 16, fontSize: 11, color: "#2a4050", lineHeight: 1.8 }}>
                      <div>True Positives:  <span style={{ color: "#00e87a" }}>{f1.true_positives}</span></div>
                      <div>False Positives: <span style={{ color: "#ff3d5a" }}>{f1.false_positives}</span></div>
                      <div>False Negatives: <span style={{ color: "#ffcc00" }}>{f1.false_negatives}</span></div>
                      <div>GT Total:        <span style={{ color: "#aabbcc" }}>{f1.ground_truth_total}</span></div>
                    </div>
                  </>
                ) : <div style={{ color: "#1e2d40", fontSize: 12, textAlign: "center", padding: 30 }}>Run resolution first</div>}
              </div>

              {/* Topology */}
              <div style={{ background: "#0d1520", border: "1px solid #1e2d40", borderRadius: 10, padding: 20 }}>
                <div style={{ fontSize: 10, color: "#2a5080", letterSpacing: 2, marginBottom: 16 }}>◈ TOPOLOGY ANALYSIS</div>
                {resStats ? (
                  <>
                    {[
                      ["Edge-Cut Ratio", resStats.edge_cut_ratio, "#bb88ff",
                       "% of cross-site edges (Özsu & Valduriez Ch.4)"],
                      ["Avg Cluster Density", resStats.avg_cluster_density, "#00ccff",
                       "Density of connected components"],
                    ].map(([label, val, color, desc]) => (
                      <div key={label} style={{ marginBottom: 18 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                          <span style={{ fontSize: 12, color: "#4a6070" }}>{label}</span>
                          <span style={{ fontSize: 18, fontWeight: 700, color }}>{val}</span>
                        </div>
                        <div style={{ fontSize: 10, color: "#2a3a4a" }}>{desc}</div>
                        <div style={{ height: 4, background: "#131e2c", borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
                          <div style={{ width: `${Math.min((val || 0) * 100, 100)}%`, height: "100%", background: color }} />
                        </div>
                      </div>
                    ))}
                    <div style={{ marginTop: 12, fontSize: 11, color: "#4a6070", lineHeight: 1.8 }}>
                      <div>Graph: <span style={{ color: "#4d9fff" }}>{resStats.graph_nodes}</span> nodes, <span style={{ color: "#ff4d88" }}>{resStats.graph_edges}</span> edges</div>
                      <div>Cross-site: <span style={{ color: "#ff3d5a" }}>{resStats.cross_site_edges}</span> | Intra-site: <span style={{ color: "#00e87a" }}>{resStats.intra_site_edges}</span></div>
                      <div>Clusters: <span style={{ color: "#bb88ff" }}>{resStats.cluster_count}</span> (largest: {resStats.largest_cluster}, mixed: {resStats.mixed_clusters})</div>
                    </div>
                    <div style={{ marginTop: 16, borderTop: "1px solid #131e2c", paddingTop: 14 }}>
                      <div style={{ fontSize: 10, color: "#2a5080", letterSpacing: 2, marginBottom: 10 }}>BY DECISION</div>
                      {resStats.by_decision?.map(d => (
                        <div key={d.decision} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 6 }}>
                          <DecisionBadge decision={d.decision} />
                          <span style={{ color: "#4a6070" }}>{d.cnt} pairs</span>
                          <span style={{ color: "#2a4050" }}>avg {(d.avg_score * 100).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : <div style={{ color: "#1e2d40", fontSize: 12, textAlign: "center", padding: 30 }}>Run resolution first</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── GRAPH EXPLORER ── */}
        {tab === "Graph Explorer" && <GraphExplorerTab />}

        {/* ── GRAPH VISUALIZER ── */}
        {tab === "Graph Visualizer" && <GraphVisualizer />}

        {/* ── DATA EXPLORER ── */}
        {tab === "Data Explorer" && (
          <div style={{ animation: "fadein .3s ease" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {[["a", "Site A (DBLP)"], ["b", "Site B (Semantic Scholar)"]].map(([s, label]) => (
                <button key={s} onClick={() => { setPaperSite(s); setPaperPage(1); }}
                  style={{
                    background: paperSite === s ? "rgba(77,159,255,.2)" : "transparent",
                    border: `1px solid ${paperSite === s ? "#4d9fff" : "#1e2d40"}`,
                    color: paperSite === s ? "#4d9fff" : "#2a4050",
                    padding: "6px 16px", borderRadius: 6, cursor: "pointer",
                    fontSize: 11, fontFamily: "Courier New",
                  }}>{label}</button>
              ))}
              <span style={{ marginLeft: "auto", color: "#2a4050", fontSize: 11, alignSelf: "center" }}>
                {papersTotal.toLocaleString()} papers
              </span>
            </div>

            <div style={{ background: "#0d1520", border: "1px solid #1e2d40", borderRadius: 10, overflow: "hidden" }}>
              <div style={{
                display: "grid", gridTemplateColumns: "2fr 60px 100px 120px",
                padding: "8px 16px", borderBottom: "1px solid #131e2c",
                fontSize: 9, color: "#2a4050", letterSpacing: 2,
              }}>
                <span>TITLE</span><span>YEAR</span><span>VENUE</span><span>DOI</span>
              </div>
              {papers.map((p, i) => (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "2fr 60px 100px 120px",
                  padding: "9px 16px", borderBottom: "1px solid #0d1520",
                  fontSize: 11, background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,.01)",
                }}>
                  <span style={{ color: paperSite === "a" ? "#4d9fff" : "#ff4d88", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 12 }}>
                    {p.title}
                  </span>
                  <span style={{ color: "#4a6070" }}>{p.year}</span>
                  <span style={{ color: "#2a4050", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.venue}</span>
                  <span style={{ color: "#1e3040", fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.doi || "—"}</span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "center" }}>
              {[1,2,3,4,5,6,7,8,9,10].map(p => (
                <button key={p} onClick={() => setPaperPage(p)}
                  style={{
                    background: paperPage === p ? "rgba(77,159,255,.2)" : "transparent",
                    border: `1px solid ${paperPage === p ? "#4d9fff" : "#1e2d40"}`,
                    color: paperPage === p ? "#4d9fff" : "#2a4050",
                    width: 30, height: 30, borderRadius: 5, cursor: "pointer",
                    fontSize: 10, fontFamily: "Courier New",
                  }}>{p}</button>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
