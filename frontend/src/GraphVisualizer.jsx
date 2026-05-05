import { useState, useEffect, useRef } from "react";
import ForceGraph3D from "react-force-graph-3d";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const STAGES = [
  { id: "raw", label: "RAW (Separate Sites)", desc: "Initial state: data exists in isolated silos with internal connections only." },
  { id: "linked", label: "LINKED (Identities Found)", desc: "Entity Resolution active: Cross-site 'SAME_AS' links connect duplicates." },
  { id: "merged", label: "MERGED (Clean Graph)", desc: "Deduplicated state: Duplicate nodes are physically collapsed into Super-Nodes." }
];

export function GraphVisualizer() {
  const [stage, setStage] = useState("linked");
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);
  const [unifiedData, setUnifiedData] = useState(null);
  const fgRef = useRef();

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/graph/data?mode=${stage}`)
      .then(r => r.json())
      .then(data => {
        setGraphData(data);
        setLoading(false);
      })
      .catch(e => {
        console.error("Failed to fetch graph data", e);
        setLoading(false);
      });
  }, [stage]);

  useEffect(() => {
    if (selectedNode) {
      // If merged node, fetch first source ID for detail (or we could fetch a combined view)
      const fetchId = selectedNode.source_ids ? selectedNode.source_ids[0] : selectedNode.id;
      fetch(`${API}/unified/paper/${fetchId}`)
        .then(r => r.json())
        .then(setUnifiedData)
        .catch(() => setUnifiedData(null));
    } else {
      setUnifiedData(null);
    }
  }, [selectedNode]);

  const handleNodeClick = (node) => {
    const distance = 120;
    const distRatio = 1 + distance/Math.hypot(node.x, node.y, node.z);

    fgRef.current.cameraPosition(
      { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
      node,
      2000
    );
    setSelectedNode(node);
  };

  const S = {
    controls: {
      position: "absolute", top: 20, left: 20, zIndex: 100,
      background: "rgba(10, 18, 30, 0.8)", backdropFilter: "blur(8px)",
      border: "1px solid rgba(77, 159, 255, 0.2)", borderRadius: 10, padding: 12, width: 280
    },
    stageBtn: (active) => ({
      width: "100%", textAlign: "left", padding: "8px 12px", marginBottom: 6, borderRadius: 6,
      background: active ? "rgba(77, 159, 255, 0.2)" : "transparent",
      border: `1px solid ${active ? "#4d9fff" : "#1e2d40"}`,
      color: active ? "#ffffff" : "#4a6070",
      cursor: "pointer", fontSize: 11, fontWeight: 700, transition: "0.2s"
    }),
    panel: {
      position: "absolute", top: 20, right: 20, bottom: 20, width: 340,
      background: "rgba(10, 18, 30, 0.85)", backdropFilter: "blur(12px)",
      border: "1px solid rgba(77, 159, 255, 0.2)", borderRadius: 12,
      padding: 20, overflowY: "auto", zIndex: 100,
      boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
      animation: "fadein .3s ease"
    },
    label: { fontSize: 9, color: "#2a5080", letterSpacing: 2, marginBottom: 12, fontWeight: 700 },
    val: { fontSize: 16, fontWeight: 700, color: "#ffffff", marginBottom: 4 },
    small: { fontSize: 10, color: "#4a6070" },
    close: { position: "absolute", top: 12, right: 12, cursor: "pointer", color: "#4a6070", fontSize: 18 }
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "calc(100vh - 160px)", background: "#05080c", borderRadius: 12, overflow: "hidden" }}>
      
      {/* Stage Selector */}
      <div style={S.controls}>
        <div style={S.label}>◈ VISUALIZATION STAGE</div>
        {STAGES.map(s => (
          <div key={s.id}>
            <button style={S.stageBtn(stage === s.id)} onClick={() => { setStage(s.id); setSelectedNode(null); }}>
              {stage === s.id ? "● " : "○ "}{s.label}
            </button>
            {stage === s.id && <div style={{ fontSize: 9, color: "#2a5080", padding: "0 12px 10px 12px", lineHeight: 1.4 }}>{s.desc}</div>}
          </div>
        ))}
      </div>

      {loading && (
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 10 }}>
          <div style={{ fontSize: 14, color: "#4d9fff", letterSpacing: 2, animation: "pulse 1.5s infinite" }}>SYNCING GRAPH STATE...</div>
        </div>
      )}

      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        nodeLabel={node => `<div style="background: #0d1520; padding: 8px; border: 1px solid #1e2d40; border-radius: 4px; color: #fff;">
          <div style="font-size: 10px; color: #4d9fff;">${(node.site || "").toUpperCase()}</div>
          <div style="font-weight: 700;">${node.id}</div>
          ${node.source_ids ? `<div style="font-size: 9px; color: #00e87a;">Merged: ${node.source_ids.length} sources</div>` : ""}
        </div>`}
        nodeColor={node => {
          if (node.site === "merged") return "#ffcc00"; // Gold for super nodes
          return node.site === "site_a" ? "#4d9fff" : "#ff4d88";
        }}
        nodeRelSize={4}
        linkWidth={link => link.type === "same_as" ? 3 : 1}
        linkColor={link => link.type === "same_as" ? "#00e87a" : "#1e2d40"}
        linkDirectionalParticles={link => link.type === "same_as" ? 4 : 0}
        linkDirectionalParticleSpeed={0.01}
        linkDirectionalParticleColor={() => "#00e87a"}
        linkDirectionalParticleWidth={4}
        onNodeClick={handleNodeClick}
        backgroundColor="#05080c"
        showNavInfo={false}
      />

      {/* Details Panel */}
      {selectedNode && (
        <div style={S.panel}>
          <div style={S.close} onClick={() => setSelectedNode(null)}>×</div>
          <div style={S.label}>◈ NODE IDENTITY</div>
          <div style={S.val}>{selectedNode.id}</div>
          <div style={{ ...S.small, color: selectedNode.site === "site_a" ? "#4d9fff" : selectedNode.site === "site_b" ? "#ff4d88" : "#ffcc00", fontWeight: 700 }}>
            STATUS: {selectedNode.site?.toUpperCase()}
          </div>

          {selectedNode.source_ids && (
            <div style={{ marginTop: 10 }}>
              <div style={S.label}>◈ SOURCE ENTITIES</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {selectedNode.source_ids.map(id => (
                  <span key={id} style={{ fontSize: 9, background: "#0a121e", padding: "2px 6px", borderRadius: 4, border: "1px solid #1e2d40" }}>{id}</span>
                ))}
              </div>
            </div>
          )}

          <div style={{ margin: "20px 0", height: 1, background: "rgba(77,159,255,0.1)" }} />

          {!unifiedData ? <div style={S.small}>Loading unified view...</div> : (
            <div>
              <div style={S.label}>◈ RELATIONAL DATA</div>
              <div style={{ fontSize: 13, color: "#ffffff", fontWeight: 600, marginBottom: 4 }}>
                {unifiedData.models?.relational?.data?.title}
              </div>
              <div style={{ fontSize: 11, color: "#c0ccd8", marginBottom: 12 }}>
                {unifiedData.models?.relational?.data?.venue} ({unifiedData.models?.relational?.data?.year})
              </div>

              <div style={S.label}>◈ GRAPH CONTEXT</div>
              <div style={{ display: "flex", gap: 10, marginBottom: 15 }}>
                <div><span style={{ fontSize: 16, fontWeight: 800, color: "#00e87a" }}>{unifiedData.models?.graph?.data?.degree}</span> <span style={S.small}>Degree</span></div>
              </div>

              <div style={S.label}>◈ DOCUMENT ABSTRACT</div>
              <div style={{ fontSize: 10, color: "#4a6070", lineHeight: 1.5, background: "rgba(0,0,0,0.2)", padding: 10, borderRadius: 8 }}>
                "{unifiedData.models?.document?.data?.abstract?.substring(0, 400)}..."
              </div>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div style={{ position: "absolute", bottom: 20, left: 20, zIndex: 10, display: "flex", gap: 20, background: "rgba(0,0,0,0.5)", padding: "8px 16px", borderRadius: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#4d9fff" }} />
          <span style={S.small}>DBLP</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff4d88" }} />
          <span style={S.small}>S. SCHOLAR</span>
        </div>
        {stage === "merged" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ffcc00" }} />
            <span style={S.small}>MERGED</span>
          </div>
        )}
        {stage === "linked" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 20, height: 2, background: "#00e87a" }} />
            <span style={S.small}>SAME_AS</span>
          </div>
        )}
      </div>
    </div>
  );
}
