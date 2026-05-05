import { useState, useEffect, useRef, useMemo } from "react";
import ForceGraph3D from "react-force-graph-3d";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

export function GraphVisualizer() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);
  const [unifiedData, setUnifiedData] = useState(null);
  const fgRef = useRef();

  useEffect(() => {
    fetch(`${API}/graph/data`)
      .then(r => r.json())
      .then(data => {
        setGraphData(data);
        setLoading(false);
      })
      .catch(e => {
        console.error("Failed to fetch graph data", e);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (selectedNode) {
      fetch(`${API}/unified/paper/${selectedNode.id}`)
        .then(r => r.json())
        .then(setUnifiedData)
        .catch(() => setUnifiedData(null));
    } else {
      setUnifiedData(null);
    }
  }, [selectedNode]);

  const handleNodeClick = (node) => {
    // Aim at node from outside it
    const distance = 100;
    const distRatio = 1 + distance/Math.hypot(node.x, node.y, node.z);

    fgRef.current.cameraPosition(
      { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }, // new pos
      node, // lookAt pos
      2000  // ms transition duration
    );
    setSelectedNode(node);
  };

  const S = {
    panel: {
      position: "absolute", top: 80, right: 20, bottom: 20, width: 340,
      background: "rgba(10, 18, 30, 0.85)", backdropFilter: "blur(12px)",
      border: "1px solid rgba(77, 159, 255, 0.2)", borderRadius: 12,
      padding: 20, overflowY: "auto", zIndex: 100,
      boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
      animation: "fadein .3s ease"
    },
    label: { fontSize: 9, color: "#2a5080", letterSpacing: 2, marginBottom: 12, fontWeight: 700 },
    val: { fontSize: 18, fontWeight: 700, color: "#ffffff", marginBottom: 4 },
    small: { fontSize: 10, color: "#4a6070" },
    close: { position: "absolute", top: 12, right: 12, cursor: "pointer", color: "#4a6070", fontSize: 18 }
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "calc(100vh - 160px)", background: "#05080c", borderRadius: 12, overflow: "hidden" }}>
      {loading && (
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 10 }}>
          <div style={{ fontSize: 14, color: "#4d9fff", letterSpacing: 2, animation: "pulse 1.5s infinite" }}>INITIALIZING NEURAL ENGINE...</div>
        </div>
      )}

      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        nodeLabel={node => `<div style="background: #0d1520; padding: 8px; border: 1px solid #1e2d40; border-radius: 4px; color: #fff;">
          <div style="font-size: 10px; color: #4d9fff;">${node.site.toUpperCase()}</div>
          <div style="font-weight: 700;">${node.id}</div>
        </div>`}
        nodeColor={node => node.site === "site_a" ? "#4d9fff" : "#ff4d88"}
        nodeRelSize={4}
        linkWidth={link => link.type === "same_as" ? 2 : 1}
        linkColor={link => link.type === "same_as" ? "#00e87a" : "#1e2d40"}
        linkDirectionalParticles={link => link.type === "same_as" ? 4 : 0}
        linkDirectionalParticleSpeed={0.01}
        linkDirectionalParticleColor={() => "#00e87a"}
        linkDirectionalParticleWidth={3}
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
          <div style={{ ...S.small, color: selectedNode.site === "site_a" ? "#4d9fff" : "#ff4d88", fontWeight: 700 }}>
            ORIGIN: {selectedNode.site.toUpperCase()}
          </div>

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
                <div><span style={{ fontSize: 16, fontWeight: 800, color: "#bb88ff" }}>{unifiedData.models?.graph?.data?.same_as_links?.length || 0}</span> <span style={S.small}>Identities</span></div>
              </div>

              <div style={S.label}>◈ DOCUMENT ABSTRACT</div>
              <div style={{ fontSize: 11, color: "#4a6070", lineHeight: 1.6, fontStyle: "italic", background: "rgba(0,0,0,0.2)", padding: 12, borderRadius: 8 }}>
                "{unifiedData.models?.document?.data?.abstract?.substring(0, 300)}..."
              </div>
              
              <div style={{ marginTop: 20, textAlign: "right" }}>
                <div style={{ fontSize: 9, color: "#2a5080" }}>INTEGRATION: {unifiedData.integration?.method}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div style={{ position: "absolute", bottom: 20, left: 20, zIndex: 10, display: "flex", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#4d9fff" }} />
          <span style={S.small}>SITE A (DBLP)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff4d88" }} />
          <span style={S.small}>SITE B (S. SCHOLAR)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 20, height: 2, background: "#00e87a" }} />
          <span style={S.small}>SAME_AS LINK</span>
        </div>
      </div>
    </div>
  );
}
