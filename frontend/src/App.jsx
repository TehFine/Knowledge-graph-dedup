import { useState, useEffect, useRef, useCallback } from "react";
import {
  LayoutDashboard, Play, ListChecks, BarChart3,
  GitFork, Network, Database, Loader2, ChevronRight,
  Activity, Server, Zap, Circle,
} from "lucide-react";
import { GraphExplorerTab } from "./GraphExplorer";
import { GraphVisualizer } from "./GraphVisualizer";

const API      = import.meta.env.VITE_API_URL  || "http://localhost:8000";
const SITE_A_URL = import.meta.env.VITE_SITE_A_URL || "http://localhost:8001";
const SITE_B_URL = import.meta.env.VITE_SITE_B_URL || "http://localhost:8002";

// ── API helpers ───────────────────────────────────────────────
const get = async (path) => {
  try {
    const r = await fetch(`${API}${path}`);
    if (!r.ok) throw new Error(r.statusText);
    return await r.json();
  } catch (e) { console.error(path, e.message); return null; }
};
const post = async (path, body) => {
  try {
    const r = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await r.json();
  } catch (e) { console.error(path, e.message); return null; }
};

// ── Small Components ──────────────────────────────────────────

function StatusPill({ label, status }) {
  const isOnline  = status === "online";
  const isOffline = status === "offline";
  const color = isOnline ? "#00e87a" : isOffline ? "#ff3d5a" : "#ffcc00";
  const bg    = isOnline ? "rgba(0,232,122,.1)" : isOffline ? "rgba(255,61,90,.1)" : "rgba(255,204,0,.1)";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "5px 10px", borderRadius: 20,
      background: bg, border: `1px solid ${color}33`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%", background: color,
        boxShadow: `0 0 6px ${color}`,
        animation: isOnline ? "pulse 2.5s infinite" : "none",
        flexShrink: 0,
      }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: "#7a9ab0", letterSpacing: 0.8 }}>{label}</span>
      <span style={{ fontSize: 10, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>
        {(status || "offline").toUpperCase()}
      </span>
    </div>
  );
}

function StatCard({ label, value, sub, color = "#4d9fff", icon: Icon }) {
  return (
    <div style={{
      background: "linear-gradient(135deg, #0d1520 0%, #0a1018 100%)",
      border: "1px solid #1e2d40",
      borderRadius: 12, padding: "16px 18px",
      boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: -10, right: -10,
        width: 60, height: 60, borderRadius: "50%",
        background: `${color}10`,
      }} />
      {Icon && <Icon size={14} color={color} style={{ opacity: 0.6, marginBottom: 8 }} />}
      <div style={{
        fontSize: 22, fontWeight: 700, color,
        fontFamily: "'JetBrains Mono', monospace", lineHeight: 1,
      }}>{value ?? "—"}</div>
      <div style={{
        fontSize: 9, fontWeight: 700, color: "#3a5060",
        marginTop: 6, letterSpacing: 1.4, textTransform: "uppercase",
      }}>{label}</div>
      {sub && <div style={{ fontSize: 9, color: "#2a3a4a", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function DecisionBadge({ decision }) {
  const map = {
    MERGE:    { bg: "rgba(0,232,122,0.12)",  border: "#00e87a44", color: "#00e87a" },
    REVIEW:   { bg: "rgba(255,204,0,0.12)",  border: "#ffcc0044", color: "#ffcc00" },
    SEPARATE: { bg: "rgba(255,61,90,0.12)",  border: "#ff3d5a44", color: "#ff3d5a" },
  };
  const s = map[decision] || map.SEPARATE;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
      padding: "3px 8px", borderRadius: 4,
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
      whiteSpace: "nowrap",
    }}>{decision}</span>
  );
}

function ScoreBar({ score, decision }) {
  const color = decision === "MERGE" ? "#00e87a" : decision === "REVIEW" ? "#ffcc00" : "#ff3d5a";
  return (
    <div style={{ height: 3, background: "#1a2533", borderRadius: 2, overflow: "hidden", marginTop: 6 }}>
      <div style={{ width: `${score * 100}%`, height: "100%", background: color, borderRadius: 2, transition: "width .4s" }} />
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, color: "#2a5080", letterSpacing: 2,
      marginBottom: 14, display: "flex", alignItems: "center", gap: 8,
    }}>
      <span style={{ width: 3, height: 12, borderRadius: 2, background: "#4d9fff", display: "inline-block" }} />
      {children}
    </div>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: "#0d1520", border: "1px solid #1e2d40",
      borderRadius: 12, padding: 18,
      boxShadow: "0 2px 16px rgba(0,0,0,0.2)",
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── Tab definitions ────────────────────────────────────────────
const TABS = [
  { id: "Dashboard",       icon: LayoutDashboard, label: "Dashboard",   short: "Home"    },
  { id: "Resolution",      icon: Play,            label: "Resolution",  short: "Run"     },
  { id: "Results",         icon: ListChecks,      label: "Results",     short: "Results" },
  { id: "Metrics",         icon: BarChart3,       label: "Metrics",     short: "Metrics" },
  { id: "Graph Explorer",  icon: GitFork,         label: "Graph Explorer", short: "Explore" },
  { id: "Graph Visualizer",icon: Network,         label: "Visualizer",  short: "Visual"  },
  { id: "Data Explorer",   icon: Database,        label: "Data",        short: "Data"    },
];

// ── Main App ──────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]             = useState("Dashboard");
  const [sites, setSites]         = useState({ site_a: {}, site_b: {}, coordinator: {} });
  const [resStatus, setResStatus] = useState(null);
  const [resStats, setResStats]   = useState(null);
  const [results, setResults]     = useState([]);
  const [resultTotal, setResultTotal] = useState(0);
  const [f1, setF1]               = useState(null);
  const [siteAStats, setSiteAStats] = useState(null);
  const [siteBStats, setSiteBStats] = useState(null);
  const [papers, setPapers]       = useState([]);
  const [papersTotal, setPapersTotal] = useState(0);
  const [paperSite, setPaperSite] = useState("a");
  const [paperPage, setPaperPage] = useState(1);
  const [filterDecision, setFilterDecision] = useState("");
  const [resultPage, setResultPage] = useState(1);
  const [jobRunning, setJobRunning] = useState(false);
  const [queue, setQueue]         = useState([]);
  const pollRef = useRef(null);

  const refreshAll = useCallback(async () => {
    const [s, rs, rstat, f, q] = await Promise.all([
      get("/sites/status"), get("/resolution/status"),
      get("/resolution/stats"), get("/metrics/f1"), get("/queue"),
    ]);
    if (s) setSites(s);
    if (rs) { setResStatus(rs); setJobRunning(rs.running); }
    if (rstat) setResStats(rstat);
    if (f) setF1(f);
    if (q) setQueue(q.queue || []);
  }, []);

  useEffect(() => {
    refreshAll();
    (async () => {
      const [a, b] = await Promise.all([
        fetch(`${SITE_A_URL}/stats`).then(r => r.json()).catch(() => null),
        fetch(`${SITE_B_URL}/stats`).then(r => r.json()).catch(() => null),
      ]);
      if (a) setSiteAStats(a);
      if (b) setSiteBStats(b);
    })();
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

  useEffect(() => {
    get(`/resolution/results?decision=${filterDecision}&page=${resultPage}&size=30`)
      .then(d => { if (d) { setResults(d.data || []); setResultTotal(d.total || 0); } });
  }, [filterDecision, resultPage, resStatus?.processed]);

  useEffect(() => {
    const base = paperSite === "a" ? SITE_A_URL : SITE_B_URL;
    fetch(`${base}/papers?page=${paperPage}&size=30`)
      .then(r => r.json())
      .then(d => { setPapers(d.data || []); setPapersTotal(d.total || 0); })
      .catch(() => {});
  }, [paperSite, paperPage]);

  const startJob = async () => {
    const r = await post("/resolution/start", { years: [2018,2019,2020,2021,2022,2023], limit_per_year: 80 });
    if (r?.job_id) { setJobRunning(true); refreshAll(); }
  };

  // ── RENDER ─────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#070c14", color: "#c0ccd8", fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap');
        @keyframes spin    { from{transform:rotate(0deg)}   to{transform:rotate(360deg)} }
        @keyframes pulse   { 0%,100%{opacity:1}             50%{opacity:.35} }
        @keyframes fadein  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
        @keyframes shimmer { from{background-position:-200% 0} to{background-position:200% 0} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #0a0f18; }
        ::-webkit-scrollbar-thumb { background: #1e2d40; border-radius: 4px; }

        /* ── Nav Tab bar ── */
        .nav-bar {
          display: flex; gap: 2px; padding: 0 24px;
          overflow-x: auto; overflow-y: hidden;
          -webkit-overflow-scrolling: touch; scrollbar-width: none;
          scroll-behavior: smooth;
          background: #090e18; border-bottom: 1px solid #111a28;
        }
        .nav-bar::-webkit-scrollbar { display: none; }
        .nav-tab {
          display: flex; align-items: center; gap: 8px;
          padding: 0 16px; height: 48px;
          border: none; background: transparent; cursor: pointer;
          color: #3a5468; font-size: 12px; font-weight: 500;
          white-space: nowrap; position: relative; flex-shrink: 0;
          transition: color 0.2s, background 0.2s;
          border-radius: 0; letter-spacing: 0.3px;
          font-family: 'Inter', sans-serif;
        }
        .nav-tab:hover { color: #7aa8cc; background: rgba(77,159,255,.04); }
        .nav-tab.active {
          color: #e8f0f8; font-weight: 700;
        }
        .nav-tab::after {
          content: ''; position: absolute; bottom: 0; left: 50%;
          width: 0; height: 2px;
          background: linear-gradient(90deg, #4d9fff, #6dbaff);
          border-radius: 2px 2px 0 0;
          transition: all 0.25s ease; transform: translateX(-50%);
        }
        .nav-tab.active::after { width: 70%; }
        .nav-tab:active { transform: scale(0.97); }
        .nav-tab-icon { opacity: 0.6; transition: opacity 0.2s; }
        .nav-tab.active .nav-tab-icon { opacity: 1; }

        /* Tab label visibility */
        .tab-label { display: inline; }
        .tab-label-short { display: none; }

        /* ── Content ── */
        .content-pad { padding: 24px; }

        /* ── Tables with horizontal scroll ── */
        .tbl-wrap {
          overflow-x: auto; -webkit-overflow-scrolling: touch;
          border-radius: 12px; border: 1px solid #1e2d40;
          background: #0d1520;
        }
        .tbl-inner { min-width: 560px; }

        /* ── Stat grids ── */
        .stat-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 12px; margin-bottom: 20px;
        }

        /* ── Responsive breakpoints ── */
        @media (max-width: 900px) {
          .header-sites-full { display: none !important; }
          .header-sites-pills { display: flex !important; }
        }
        @media (max-width: 768px) {
          /* Header */
          .app-header { padding: 10px 14px !important; }
          .header-title { font-size: 15px !important; }
          .header-sub   { font-size: 7px !important; letter-spacing: 2px !important; }
          .header-right { gap: 10px !important; }

          /* Start button — circular icon pill on mobile */
          .start-btn {
            width: 38px !important;
            height: 38px !important;
            padding: 0 !important;
            border-radius: 12px !important;
            justify-content: center !important;
          }
          .start-btn-text { display: none !important; }
          .start-btn-icon { display: flex !important; }

          /* Nav tabs */
          .nav-bar { padding: 0 8px; gap: 0; }
          .nav-tab  { padding: 0 12px; height: 44px; font-size: 11px; }
          .tab-label { display: none !important; }
          .tab-label-short { display: inline !important; }

          /* Content */
          .content-pad { padding: 12px; }
          .stat-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }

          /* Section cards: always full width */
          .section-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 420px) {
          .stat-grid { grid-template-columns: 1fr 1fr; }
          .nav-tab { padding: 0 10px; height: 42px; }
        }
      `}</style>

      {/* ═══ STICKY HEADER + NAV ═══ */}
      <div style={{ position: "sticky", top: 0, zIndex: 1000 }}>

        {/* ── APP HEADER ── */}
        <div className="app-header" style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 24px",
          background: "linear-gradient(180deg, #0a1220 0%, #080e1a 100%)",
          borderBottom: "1px solid #111a28",
          boxShadow: "0 1px 0 #111a28, 0 4px 24px rgba(0,0,0,0.4)",
        }}>
          {/* Left: brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: "linear-gradient(135deg, #1a3a6a 0%, #0f2040 100%)",
              border: "1px solid #2a4a7a",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Network size={18} color="#4d9fff" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="header-sub" style={{
                fontSize: 9, fontWeight: 700, color: "#2a6090",
                letterSpacing: 3, marginBottom: 2, textTransform: "uppercase",
              }}>
                Distributed Knowledge Graph
              </div>
              <div className="header-title" style={{
                fontSize: 18, fontWeight: 800, color: "#e8f0f8", letterSpacing: -0.3,
                lineHeight: 1, whiteSpace: "nowrap",
              }}>
                Entity Resolution <span style={{ color: "#4d9fff" }}>Engine</span>
              </div>
            </div>
          </div>

          {/* Right: status + button */}
          <div className="header-right" style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            {/* Status pills — desktop (≥ 900px) */}
            <div className="header-sites-full" style={{ display: "flex", gap: 8 }}>
              {[
                ["Site A", sites.site_a?.status],
                ["Site B", sites.site_b?.status],
                ["Coord",  "online"],
              ].map(([label, status]) => (
                <StatusPill key={label} label={label} status={status || "offline"} />
              ))}
            </div>

            {/* Status dots — mobile (< 900px) */}
            <div className="header-sites-pills" style={{ display: "none", gap: 6, alignItems: "center" }}>
              {[
                ["A", sites.site_a?.status],
                ["B", sites.site_b?.status],
                ["C", "online"],
              ].map(([label, status]) => {
                const color = status === "online" ? "#00e87a" : status === "offline" ? "#ff3d5a" : "#ffcc00";
                return (
                  <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: color, boxShadow: `0 0 6px ${color}`,
                      animation: status === "online" ? "pulse 2.5s infinite" : "none",
                    }} />
                    <span style={{ fontSize: 7, color: "#3a5468", fontWeight: 700 }}>{label}</span>
                  </div>
                );
              })}
            </div>

            {/* Start button */}
            <button
              className="start-btn"
              onClick={startJob}
              disabled={jobRunning}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                padding: "9px 20px", borderRadius: 10,
                border: "none", cursor: jobRunning ? "not-allowed" : "pointer",
                background: jobRunning
                  ? "rgba(20,32,50,0.9)"
                  : "linear-gradient(135deg, #00e87a 0%, #00c96a 100%)",
                color: jobRunning ? "#3a5468" : "#071510",
                fontSize: 12, fontWeight: 700,
                boxShadow: jobRunning
                  ? "inset 0 0 0 1px #1e2d40"
                  : "0 0 0 1px rgba(0,232,122,0.25), 0 4px 16px rgba(0,232,122,0.35)",
                transition: "all 0.25s",
                whiteSpace: "nowrap", flexShrink: 0,
              }}
            >
              {jobRunning ? (
                <>
                  <Loader2 size={14} style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />
                  <span className="start-btn-text" style={{ letterSpacing: 0.5 }}>RUNNING</span>
                </>
              ) : (
                <>
                  <Play size={15} fill="currentColor" style={{ flexShrink: 0 }} />
                  <span className="start-btn-text" style={{ letterSpacing: 0.5 }}>START</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── NAV TAB BAR ── */}
        <nav className="nav-bar">
          {TABS.map(({ id, icon: Icon, label, short }) => (
            <button
              key={id}
              className={`nav-tab${tab === id ? " active" : ""}`}
              onClick={() => setTab(id)}
            >
              <span className="nav-tab-icon">
                <Icon size={14} />
              </span>
              <span className="tab-label">{label}</span>
              <span className="tab-label-short">{short}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* ═══ CONTENT ═══ */}
      <div className="content-pad">

        {/* ── DASHBOARD ── */}
        {tab === "Dashboard" && (
          <div style={{ animation: "fadein .3s ease" }}>

            {/* Stat cards */}
            <div className="stat-grid">
              <StatCard icon={Database}  label="SITE A PAPERS"    value={siteAStats?.papers?.toLocaleString()}  color="#4d9fff" />
              <StatCard icon={Database}  label="SITE B PAPERS"    value={siteBStats?.papers?.toLocaleString()}  color="#ff4d88" />
              <StatCard icon={Activity}  label="PAIRS PROCESSED"  value={resStats?.total_pairs?.toLocaleString()} color="#aabbcc" />
              <StatCard icon={Circle}    label="MERGED"           value={resStats?.by_decision?.find(d => d.decision === "MERGE")?.cnt}     color="#00e87a" />
              <StatCard icon={Circle}    label="REVIEW"           value={resStats?.by_decision?.find(d => d.decision === "REVIEW")?.cnt}    color="#ffcc00" />
              <StatCard icon={Circle}    label="SEPARATE"         value={resStats?.by_decision?.find(d => d.decision === "SEPARATE")?.cnt}  color="#ff3d5a" />
              <StatCard icon={GitFork}   label="EDGE-CUT RATIO"   value={resStats?.edge_cut_ratio}  color="#bb88ff" sub={`${resStats?.cross_site_edges || 0} cross-site edges`} />
              <StatCard icon={Network}   label="CLUSTERS"         value={resStats?.cluster_count}   color="#ff9944" sub={`${resStats?.mixed_clusters || 0} cross-site`} />
              <StatCard icon={Network}   label="GRAPH NODES"      value={resStats?.graph_nodes}     color="#00ccff" sub={`${resStats?.graph_edges || 0} edges`} />
              <StatCard icon={BarChart3} label="F1 SCORE"         value={f1?.f1}                    color="#bb88ff" sub={`P:${f1?.precision ?? "—"}  R:${f1?.recall ?? "—"}`} />
            </div>

            {/* Two panels — stack vertically on mobile */}
            <div className="section-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {/* Top merges */}
              <Card>
                <SectionLabel>TOP MERGED PAIRS</SectionLabel>
                {resStats?.top_merges?.slice(0, 6).map((m, i) => (
                  <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #0f1c2c" }}>
                    <div style={{ fontSize: 11, color: "#4d9fff", marginBottom: 3, lineHeight: 1.4 }}>{m.title_a}</div>
                    <div style={{ fontSize: 11, color: "#ff4d88", lineHeight: 1.4 }}>{m.title_b}</div>
                    <ScoreBar score={m.score} decision="MERGE" />
                    <div style={{ fontSize: 10, color: "#00e87a", marginTop: 3 }}>{(m.score * 100).toFixed(1)}%</div>
                  </div>
                ))}
                {!resStats?.top_merges?.length && (
                  <div style={{ color: "#1e2d40", fontSize: 12, textAlign: "center", padding: "24px 0" }}>
                    Run resolution to see results
                  </div>
                )}
              </Card>

              {/* Queue */}
              <Card>
                <SectionLabel>PENDING QUEUE — FAILURE RECOVERY</SectionLabel>
                {queue.length === 0 ? (
                  <div style={{ color: "#1e2d40", fontSize: 12, textAlign: "center", padding: "24px 0" }}>
                    No pending jobs — all sites healthy ✓
                  </div>
                ) : queue.map((q, i) => (
                  <div key={i} style={{
                    padding: "8px 12px", marginBottom: 8, borderRadius: 8,
                    background: q.status === "retried" ? "rgba(0,232,122,.07)" : "rgba(255,204,0,.07)",
                    border: `1px solid ${q.status === "retried" ? "#00e87a22" : "#ffcc0022"}`,
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <span style={{ color: "#ffcc00", fontSize: 11 }}>Year {q.year}</span>
                    <span style={{
                      fontSize: 9, letterSpacing: 1,
                      color: q.status === "retried" ? "#00e87a" : "#ffcc00",
                    }}>{q.status.toUpperCase()}</span>
                  </div>
                ))}
              </Card>
            </div>
          </div>
        )}

        {/* ── RESOLUTION ── */}
        {tab === "Resolution" && (
          <div style={{ animation: "fadein .3s ease", display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Log — full width */}
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <SectionLabel>COORDINATOR LOG</SectionLabel>
                {jobRunning && (
                  <span style={{ fontSize: 10, color: "#ffcc00", animation: "pulse 1s infinite", display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ffcc00", display: "inline-block" }} />
                    LIVE
                  </span>
                )}
              </div>
              <div style={{ height: 320, overflowY: "auto", fontSize: 11, lineHeight: 1.9, fontFamily: "'JetBrains Mono', monospace" }}>
                {!resStatus?.log?.length && (
                  <div style={{ color: "#1e2d40", textAlign: "center", padding: "60px 0" }}>
                    Press ▶ START to begin
                  </div>
                )}
                {resStatus?.log?.map((l, i) => (
                  <div key={i} style={{
                    color: l.level === "system"  ? "#99bbdd"
                         : l.level === "success" ? "#00e87a"
                         : l.level === "error"   ? "#ff3d5a"
                         : l.level === "warn"    ? "#ffcc00"
                         : l.level === "divider" ? "#1e2d40"
                         : "#3a5468",
                    animation: "fadein .2s ease",
                  }}>
                    <span style={{ color: "#1e2d40", marginRight: 10 }}>{l.ts}</span>
                    {l.msg}
                  </div>
                ))}
              </div>
            </Card>

            {/* Progress + Instructions — side by side on desktop, stack on mobile */}
            <div className="section-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {/* Progress */}
              <Card>
                <SectionLabel>PROGRESS</SectionLabel>
                <div style={{ textAlign: "center", marginBottom: 16 }}>
                  <div style={{ fontSize: 48, fontWeight: 800, color: "#4d9fff", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>
                    {resStatus?.processed ?? 0}
                  </div>
                  <div style={{ fontSize: 10, color: "#2a4050", marginTop: 6, letterSpacing: 1.5 }}>PAIRS PROCESSED</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[["SITE A", resStatus?.site_a], ["SITE B", resStatus?.site_b]].map(([label, status]) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "#3a5468", fontWeight: 600 }}>{label}</span>
                      <StatusPill label="" status={status || "offline"} />
                    </div>
                  ))}
                </div>
              </Card>

              {/* Failure demo */}
              <Card style={{ borderColor: "#ffcc0018" }}>
                <SectionLabel>FAILURE RECOVERY DEMO</SectionLabel>
                <div style={{ fontSize: 12, color: "#3a5468", lineHeight: 1.8 }}>
                  While resolution is running, open a terminal:
                </div>
                <code style={{
                  display: "block", marginTop: 10, color: "#ff3d5a",
                  background: "#060a12", padding: "10px 14px", borderRadius: 8,
                  fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                  border: "1px solid #ff3d5a22",
                }}>
                  docker stop kg_site_b
                </code>
                <div style={{ fontSize: 12, color: "#3a5468", lineHeight: 1.8, marginTop: 12 }}>
                  Watch coordinator detect &amp; queue, then recover:
                </div>
                <code style={{
                  display: "block", marginTop: 10, color: "#00e87a",
                  background: "#060a12", padding: "10px 14px", borderRadius: 8,
                  fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                  border: "1px solid #00e87a22",
                }}>
                  docker start kg_site_b
                </code>
              </Card>
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {tab === "Results" && (
          <div style={{ animation: "fadein .3s ease" }}>

            {/* Filters */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              {["", "MERGE", "REVIEW", "SEPARATE"].map(d => (
                <button key={d}
                  onClick={() => { setFilterDecision(d); setResultPage(1); }}
                  style={{
                    background: filterDecision === d ? "rgba(77,159,255,.15)" : "transparent",
                    border: `1px solid ${filterDecision === d ? "#4d9fff" : "#1e2d40"}`,
                    color: filterDecision === d ? "#4d9fff" : "#2a4050",
                    padding: "6px 14px", borderRadius: 8, cursor: "pointer",
                    fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
                    transition: "all 0.2s",
                  }}
                >
                  {d || "ALL"}
                  {resStats?.by_decision?.find(x => x.decision === d)?.cnt
                    ? ` (${resStats.by_decision.find(x => x.decision === d).cnt})` : ""}
                </button>
              ))}
              <span style={{ marginLeft: "auto", color: "#2a4050", fontSize: 11 }}>
                {resultTotal.toLocaleString()} total
              </span>
            </div>

            {/* Table with horizontal scroll */}
            <div className="tbl-wrap">
              <div className="tbl-inner">
                {/* Header */}
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr 90px 100px",
                  padding: "10px 16px", borderBottom: "1px solid #111a28",
                  fontSize: 9, color: "#2a4050", letterSpacing: 2, fontWeight: 700,
                }}>
                  <span>TITLE A (DBLP)</span>
                  <span>TITLE B (SCHOLAR)</span>
                  <span>SCORE</span>
                  <span>DECISION</span>
                </div>
                {/* Rows */}
                {results.map((r, i) => (
                  <div key={i} style={{
                    display: "grid", gridTemplateColumns: "1fr 1fr 90px 100px",
                    padding: "10px 16px", borderBottom: "1px solid #090e18",
                    fontSize: 11, animation: "fadein .2s ease",
                    background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,.01)",
                    alignItems: "center",
                  }}>
                    <span style={{ color: "#4d9fff", paddingRight: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.title_a}
                    </span>
                    <span style={{ color: "#ff4d88", paddingRight: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.title_b}
                    </span>
                    <span style={{ color: "#aabbcc", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                      {(r.score * 100).toFixed(1)}%
                    </span>
                    <span><DecisionBadge decision={r.decision} /></span>
                  </div>
                ))}
                {results.length === 0 && (
                  <div style={{ padding: "48px", textAlign: "center", color: "#1e2d40", fontSize: 13 }}>
                    No results yet — run resolution first
                  </div>
                )}
              </div>
            </div>

            {/* Pagination */}
            <div style={{ display: "flex", gap: 6, marginTop: 14, justifyContent: "center", flexWrap: "wrap" }}>
              {[1, 2, 3, 4, 5].map(p => (
                <button key={p} onClick={() => setResultPage(p)} style={{
                  background: resultPage === p ? "rgba(77,159,255,.2)" : "transparent",
                  border: `1px solid ${resultPage === p ? "#4d9fff" : "#1e2d40"}`,
                  color: resultPage === p ? "#4d9fff" : "#2a4050",
                  width: 34, height: 34, borderRadius: 8, cursor: "pointer",
                  fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                  transition: "all 0.2s",
                }}>{p}</button>
              ))}
            </div>
          </div>
        )}

        {/* ── METRICS ── */}
        {tab === "Metrics" && (
          <div style={{ animation: "fadein .3s ease", display: "flex", flexDirection: "column", gap: 14 }}>

            {/* F1 Score */}
            <Card>
              <SectionLabel>PRECISION / RECALL / F1</SectionLabel>
              {f1 ? (
                <>
                  {[
                    ["Precision", f1.precision, "#00e87a"],
                    ["Recall",    f1.recall,    "#4d9fff"],
                    ["F1 Score",  f1.f1,        "#bb88ff"],
                  ].map(([label, val, color]) => (
                    <div key={label} style={{ marginBottom: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: "#4a6070" }}>{label}</span>
                        <span style={{ fontSize: 15, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>{val}</span>
                      </div>
                      <div style={{ height: 6, background: "#0f1c2c", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${val * 100}%`, height: "100%", background: color, borderRadius: 3, transition: "width .6s" }} />
                      </div>
                    </div>
                  ))}
                  <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 8, background: "#090e18", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[
                      ["True Positives",  f1.true_positives,   "#00e87a"],
                      ["False Positives", f1.false_positives,  "#ff3d5a"],
                      ["False Negatives", f1.false_negatives,  "#ffcc00"],
                      ["GT Total",        f1.ground_truth_total,"#aabbcc"],
                    ].map(([label, val, color]) => (
                      <div key={label} style={{ fontSize: 11 }}>
                        <span style={{ color: "#2a4050" }}>{label}: </span>
                        <span style={{ color, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{val}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ color: "#1e2d40", fontSize: 12, textAlign: "center", padding: 32 }}>Run resolution first</div>
              )}
            </Card>

            {/* Topology */}
            <Card>
              <SectionLabel>TOPOLOGY ANALYSIS</SectionLabel>
              {resStats ? (
                <>
                  {[
                    ["Edge-Cut Ratio",     resStats.edge_cut_ratio,       "#bb88ff", "% of cross-site edges (Özsu & Valduriez Ch.4)"],
                    ["Avg Cluster Density",resStats.avg_cluster_density,  "#00ccff", "Density of connected components"],
                  ].map(([label, val, color, desc]) => (
                    <div key={label} style={{ marginBottom: 20 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "#4a6070" }}>{label}</span>
                        <span style={{ fontSize: 18, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>{val}</span>
                      </div>
                      <div style={{ fontSize: 10, color: "#2a3a4a", marginBottom: 6 }}>{desc}</div>
                      <div style={{ height: 4, background: "#0f1c2c", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${Math.min((val || 0) * 100, 100)}%`, height: "100%", background: color }} />
                      </div>
                    </div>
                  ))}

                  {/* Graph stats */}
                  <div style={{ padding: "12px 14px", borderRadius: 8, background: "#090e18", fontSize: 11, color: "#3a5468", lineHeight: 1.9, marginBottom: 14 }}>
                    <div>Graph: <span style={{ color: "#4d9fff" }}>{resStats.graph_nodes}</span> nodes, <span style={{ color: "#ff4d88" }}>{resStats.graph_edges}</span> edges</div>
                    <div>Cross-site: <span style={{ color: "#ff3d5a" }}>{resStats.cross_site_edges}</span> · Intra-site: <span style={{ color: "#00e87a" }}>{resStats.intra_site_edges}</span></div>
                    <div>Clusters: <span style={{ color: "#bb88ff" }}>{resStats.cluster_count}</span> (largest: {resStats.largest_cluster}, mixed: {resStats.mixed_clusters})</div>
                  </div>

                  {/* By decision */}
                  <SectionLabel>BY DECISION</SectionLabel>
                  {resStats.by_decision?.map(d => (
                    <div key={d.decision} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, marginBottom: 8 }}>
                      <DecisionBadge decision={d.decision} />
                      <span style={{ color: "#4a6070" }}>{d.cnt} pairs</span>
                      <span style={{ color: "#2a4050", fontFamily: "'JetBrains Mono', monospace" }}>avg {(d.avg_score * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </>
              ) : (
                <div style={{ color: "#1e2d40", fontSize: 12, textAlign: "center", padding: 32 }}>Run resolution first</div>
              )}
            </Card>
          </div>
        )}

        {/* ── GRAPH EXPLORER ── */}
        {tab === "Graph Explorer" && <GraphExplorerTab />}

        {/* ── GRAPH VISUALIZER ── */}
        {tab === "Graph Visualizer" && <GraphVisualizer />}

        {/* ── DATA EXPLORER ── */}
        {tab === "Data Explorer" && (
          <div style={{ animation: "fadein .3s ease" }}>

            {/* Site selector */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              {[["a", "Site A — DBLP"], ["b", "Site B — Semantic Scholar"]].map(([s, label]) => (
                <button key={s}
                  onClick={() => { setPaperSite(s); setPaperPage(1); }}
                  style={{
                    background: paperSite === s ? (s === "a" ? "rgba(77,159,255,.15)" : "rgba(255,77,136,.15)") : "transparent",
                    border: `1px solid ${paperSite === s ? (s === "a" ? "#4d9fff" : "#ff4d88") : "#1e2d40"}`,
                    color: paperSite === s ? (s === "a" ? "#4d9fff" : "#ff4d88") : "#2a4050",
                    padding: "7px 16px", borderRadius: 8, cursor: "pointer",
                    fontSize: 12, fontWeight: 600, transition: "all 0.2s",
                    display: "flex", alignItems: "center", gap: 7,
                  }}
                >
                  <Database size={12} />
                  {label}
                </button>
              ))}
              <span style={{ marginLeft: "auto", color: "#2a4050", fontSize: 11 }}>
                {papersTotal.toLocaleString()} papers
              </span>
            </div>

            {/* Table with horizontal scroll */}
            <div className="tbl-wrap">
              <div className="tbl-inner" style={{ minWidth: 600 }}>
                {/* Header */}
                <div style={{
                  display: "grid", gridTemplateColumns: "3fr 55px 130px 150px",
                  padding: "10px 16px", borderBottom: "1px solid #111a28",
                  fontSize: 9, color: "#2a4050", letterSpacing: 2, fontWeight: 700,
                }}>
                  <span>TITLE</span>
                  <span>YEAR</span>
                  <span>VENUE</span>
                  <span>DOI</span>
                </div>
                {/* Rows */}
                {papers.map((p, i) => (
                  <div key={i} style={{
                    display: "grid", gridTemplateColumns: "3fr 55px 130px 150px",
                    padding: "10px 16px", borderBottom: "1px solid #090e18",
                    fontSize: 11, background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,.01)",
                    alignItems: "center",
                  }}>
                    <span style={{ color: paperSite === "a" ? "#4d9fff" : "#ff4d88", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 12 }}>
                      {p.title}
                    </span>
                    <span style={{ color: "#4a6070", fontFamily: "'JetBrains Mono', monospace" }}>{p.year}</span>
                    <span style={{ color: "#2a4050", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.venue}</span>
                    <span style={{ color: "#1e3040", fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'JetBrains Mono', monospace" }}>{p.doi || "—"}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pagination */}
            <div style={{ display: "flex", gap: 6, marginTop: 14, justifyContent: "center", flexWrap: "wrap" }}>
              {[1,2,3,4,5,6,7,8,9,10].map(p => (
                <button key={p} onClick={() => setPaperPage(p)} style={{
                  background: paperPage === p ? "rgba(77,159,255,.2)" : "transparent",
                  border: `1px solid ${paperPage === p ? "#4d9fff" : "#1e2d40"}`,
                  color: paperPage === p ? "#4d9fff" : "#2a4050",
                  width: 34, height: 34, borderRadius: 8, cursor: "pointer",
                  fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                  transition: "all 0.2s",
                }}>{p}</button>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
