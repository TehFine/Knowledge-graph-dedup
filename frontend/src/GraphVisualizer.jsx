import { useState, useEffect, useRef } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

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

  // Gesture Controls State
  const [gestureEnabled, setGestureEnabled] = useState(false);
  const [handDetected, setHandDetected] = useState(false);
  const [targetScreenPos, setTargetScreenPos] = useState(null);
  const [gestureStatus, setGestureStatus] = useState("Inactive");

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const landmarkerRef = useRef(null);
  const streamRef = useRef(null);
  const animationIdRef = useRef(null);
  const prevPinchDistRef = useRef(null);

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
      const fetchId = selectedNode.source_ids ? selectedNode.source_ids[0] : selectedNode.id;
      fetch(`${API}/unified/paper/${fetchId}`)
        .then(r => r.json())
        .then(setUnifiedData)
        .catch(() => setUnifiedData(null));
    } else {
      setUnifiedData(null);
    }
  }, [selectedNode]);

  // Gesture controls lifecycle
  useEffect(() => {
    let active = true;

    async function initMediaPipe() {
      if (!gestureEnabled) return;
      
      try {
        setGestureStatus("Loading model...");
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm"
        );
        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU"
          },
          runningMode: "video",
          numHands: 1
        });
        
        if (!active) {
          landmarker.close();
          return;
        }

        landmarkerRef.current = landmarker;
        setGestureStatus("Starting camera...");
        
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, frameRate: { ideal: 30 } }
        });
        
        if (!active) {
          stream.getTracks().forEach(t => t.stop());
          landmarker.close();
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            if (active && gestureEnabled) {
              startDetection();
            }
          };
        }
        setGestureStatus("Gesture Active");
      } catch (e) {
        console.error("MediaPipe initialization failed:", e);
        setGestureStatus("Error: Camera/Model failed");
        setGestureEnabled(false);
      }
    }

    initMediaPipe();

    return () => {
      active = false;
      cleanupGesture();
    };
  }, [gestureEnabled]);

  const cleanupGesture = () => {
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (landmarkerRef.current) {
      landmarkerRef.current.close();
      landmarkerRef.current = null;
    }
    setHandDetected(false);
    setTargetScreenPos(null);
    setGestureStatus("Inactive");
    prevPinchDistRef.current = null;
  };

  const startDetection = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d");
    let lastVideoTime = -1;

    const run = () => {
      if (!gestureEnabled || !landmarkerRef.current || !video || !canvas) return;

      let now = performance.now();
      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const results = landmarkerRef.current.detectForVideo(video, now);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (results && results.landmarks && results.landmarks.length > 0) {
          setHandDetected(true);
          const landmarks = results.landmarks[0];
          drawHandSkeleton(ctx, landmarks, canvas.width, canvas.height);
          handleGraphGesture(landmarks);
        } else {
          setHandDetected(false);
          setTargetScreenPos(null);
          prevPinchDistRef.current = null;
        }
      }

      animationIdRef.current = requestAnimationFrame(run);
    };

    animationIdRef.current = requestAnimationFrame(run);
  };

  const drawHandSkeleton = (ctx, landmarks, w, h) => {
    const CONNECTIONS = [
      [0, 1], [1, 2], [2, 3], [3, 4], // thumb
      [0, 5], [5, 6], [6, 7], [7, 8], // index
      [5, 9], [9, 10], [10, 11], [11, 12], // middle
      [9, 13], [13, 14], [14, 15], [15, 16], // ring
      [13, 17], [17, 18], [18, 19], [19, 20], // pinky
      [0, 17], [5, 9], [9, 13], [13, 17] // palm
    ];

    ctx.strokeStyle = "rgba(77, 159, 255, 0.7)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    
    CONNECTIONS.forEach(([i, j]) => {
      const p1 = landmarks[i];
      const p2 = landmarks[j];
      if (p1 && p2) {
        ctx.beginPath();
        ctx.moveTo((1 - p1.x) * w, p1.y * h);
        ctx.lineTo((1 - p2.x) * w, p2.y * h);
        ctx.stroke();
      }
    });

    landmarks.forEach((p, idx) => {
      ctx.beginPath();
      ctx.arc((1 - p.x) * w, p.y * h, idx === 4 || idx === 8 ? 6 : 4, 0, 2 * Math.PI);
      ctx.fillStyle = idx === 4 || idx === 8 ? "#00e87a" : "#ff4d88";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  };

  const handleGraphGesture = (landmarks) => {
    if (!fgRef.current) return;

    const camera = fgRef.current.camera();
    const renderer = fgRef.current.renderer();
    if (!camera || !renderer) return;

    const canvasEl = renderer.domElement;
    const canvasWidth = canvasEl.clientWidth;
    const canvasHeight = canvasEl.clientHeight;

    const indexTip = landmarks[8];
    const fingerX = (1 - indexTip.x) * canvasWidth;
    const fingerY = indexTip.y * canvasHeight;

    let closestNode = null;
    let minDistance = Infinity;
    let closestScreenPos = null;

    if (graphData && graphData.nodes) {
      graphData.nodes.forEach(node => {
        if (node.x === undefined || node.y === undefined || node.z === undefined) return;
        
        const vec = new THREE.Vector3(node.x, node.y, node.z);
        vec.project(camera);
        
        const screenX = (vec.x * 0.5 + 0.5) * canvasWidth;
        const screenY = (-(vec.y * 0.5) + 0.5) * canvasHeight;
        
        const dist = Math.hypot(screenX - fingerX, screenY - fingerY);
        if (dist < minDistance) {
          minDistance = dist;
          closestNode = node;
          closestScreenPos = { x: screenX, y: screenY };
        }
      });
    }

    let currentTargetNode = null;
    if (minDistance < 80 && closestNode) {
      currentTargetNode = closestNode;
      setTargetScreenPos(closestScreenPos);
      
      if (!selectedNode || selectedNode.id !== closestNode.id) {
        setSelectedNode(closestNode);
      }
    } else {
      setTargetScreenPos(null);
    }

    // Zoom Pinch
    const thumbTip = landmarks[4];
    const rawPinch = Math.hypot(
      thumbTip.x - indexTip.x,
      thumbTip.y - indexTip.y,
      thumbTip.z - indexTip.z
    );

    const wrist = landmarks[0];
    const middleBase = landmarks[9];
    const handSize = Math.hypot(
      wrist.x - middleBase.x,
      wrist.y - middleBase.y,
      wrist.z - middleBase.z
    ) || 1;
    const normPinch = rawPinch / handSize;

    if (prevPinchDistRef.current !== null) {
      const pinchDelta = normPinch - prevPinchDistRef.current;
      
      if (Math.abs(pinchDelta) > 0.02) {
        const controls = fgRef.current.controls();
        if (controls) {
          const tx = currentTargetNode ? currentTargetNode.x : controls.target.x;
          const ty = currentTargetNode ? currentTargetNode.y : controls.target.y;
          const tz = currentTargetNode ? currentTargetNode.z : controls.target.z;

          const cx = camera.position.x;
          const cy = camera.position.y;
          const cz = camera.position.z;

          const vx = tx - cx;
          const vy = ty - cy;
          const vz = tz - cz;
          const currentDist = Math.hypot(vx, vy, vz) || 1;

          const zoomFactor = pinchDelta * 400; 
          let newDist = currentDist - zoomFactor;
          newDist = Math.max(50, Math.min(800, newDist));

          const dirX = vx / currentDist;
          const dirY = vy / currentDist;
          const dirZ = vz / currentDist;

          const newCx = tx - dirX * newDist;
          const newCy = ty - dirY * newDist;
          const newCz = tz - dirZ * newDist;

          fgRef.current.cameraPosition(
            { x: newCx, y: newCy, z: newCz },
            { x: tx, y: ty, z: tz }
          );
        }
      }
    }

    prevPinchDistRef.current = normPinch;
  };

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

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const S = {
    controls: {
      position: "absolute", top: isMobile ? 10 : 20, left: isMobile ? 8 : 20, zIndex: 100,
      background: "rgba(10, 18, 30, 0.8)", backdropFilter: "blur(8px)",
      border: "1px solid rgba(77, 159, 255, 0.2)", borderRadius: 10,
      padding: isMobile ? 8 : 12, width: isMobile ? 180 : 280,
      fontSize: isMobile ? 9 : 11,
    },
    stageBtn: (active) => ({
      width: "100%", textAlign: "left", padding: isMobile ? "4px 8px" : "8px 12px",
      marginBottom: 4, borderRadius: 4,
      background: active ? "rgba(77, 159, 255, 0.2)" : "transparent",
      border: `1px solid ${active ? "#4d9fff" : "#1e2d40"}`,
      color: active ? "#ffffff" : "#4a6070",
      cursor: "pointer", fontSize: isMobile ? 9 : 11, fontWeight: 700, transition: "0.2s"
    }),
    panel: {
      position: "absolute",
      top: isMobile ? 'auto' : 20,
      bottom: isMobile ? 0 : 20,
      left: isMobile ? 0 : 'auto',
      right: 0,
      width: isMobile ? '100%' : 340,
      maxHeight: isMobile ? '50%' : 'auto',
      background: "rgba(10, 18, 30, 0.85)", backdropFilter: "blur(12px)",
      border: "1px solid rgba(77, 159, 255, 0.2)", borderRadius: isMobile ? "12px 12px 0 0" : 12,
      padding: isMobile ? 14 : 20, overflowY: "auto", zIndex: 100,
      boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
      animation: "fadein .3s ease"
    },
    label: { fontSize: 9, color: "#2a5080", letterSpacing: 2, marginBottom: 12, fontWeight: 700 },
    val: { fontSize: isMobile ? 14 : 16, fontWeight: 700, color: "#ffffff", marginBottom: 4 },
    small: { fontSize: isMobile ? 9 : 10, color: "#4a6070" },
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

        {/* Gesture Toggle Button */}
        <div style={{ marginTop: 15, borderTop: "1px solid rgba(77, 159, 255, 0.15)", paddingTop: 12 }}>
          <div style={S.label}>◈ GESTURE CAMERA CONTROL</div>
          <button 
            style={{
              ...S.stageBtn(gestureEnabled),
              background: gestureEnabled ? "rgba(0, 232, 122, 0.15)" : "transparent",
              border: `1px solid ${gestureEnabled ? "#00e87a" : "#1e2d40"}`,
              color: gestureEnabled ? "#00e87a" : "#4a6070",
              boxShadow: gestureEnabled ? "0 0 10px rgba(0, 232, 122, 0.2)" : "none"
            }} 
            onClick={() => setGestureEnabled(!gestureEnabled)}
          >
            {gestureEnabled ? "🖐 GESTURE CONTROL: ACTIVE" : "🖐 ENABLE GESTURE ZOOM"}
          </button>
          {gestureEnabled && (
            <div style={{ fontSize: 9, color: "#4d9fff", padding: "0 10px", lineHeight: 1.4 }}>
              • Move hand to point/select nodes<br />
              • Spread/Pinch fingers to Zoom In/Out
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 10 }}>
          <div style={{ fontSize: 14, color: "#4d9fff", letterSpacing: 2, animation: "pulse 1.5s infinite" }}>SYNCING GRAPH STATE...</div>
        </div>
      )}

      {/* Target Reticle Overlay */}
      {targetScreenPos && (
        <div style={{
          position: "absolute",
          left: targetScreenPos.x - 20,
          top: targetScreenPos.y - 20,
          width: 40,
          height: 40,
          border: "2px dashed #00e87a",
          borderRadius: "50%",
          boxShadow: "0 0 10px #00e87a, inset 0 0 10px #00e87a",
          pointerEvents: "none",
          animation: "spin 4s linear infinite",
          zIndex: 10
        }} />
      )}

      {/* Gesture HUD Floating Widget */}
      {gestureEnabled && (
        <div style={{
          position: "absolute",
          bottom: isMobile ? 60 : 80,
          right: isMobile ? 8 : 20,
          width: isMobile ? 160 : 240,
          background: "rgba(10, 18, 30, 0.85)",
          backdropFilter: "blur(12px)",
          border: "2px solid #00e87a",
          borderRadius: 12,
          padding: 10,
          boxShadow: "0 0 20px rgba(0, 232, 122, 0.3)",
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          animation: "fadein .3s ease"
        }}>
          <div style={{ ...S.label, margin: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>🖐 GESTURE HUD</span>
            <span style={{ 
              color: handDetected ? "#00e87a" : "#ff4d88", 
              fontWeight: 800,
              fontSize: 8,
              background: handDetected ? "rgba(0, 232, 122, 0.1)" : "rgba(255, 77, 136, 0.1)",
              padding: "1px 6px",
              borderRadius: 4,
              border: `1px solid ${handDetected ? "#00e87a" : "#ff4d88"}`
            }}>
              {handDetected ? "ACTIVE" : "NO HAND"}
            </span>
          </div>

          <div style={{ position: "relative", width: "100%", height: isMobile ? 100 : 160, background: "#05080c", borderRadius: 8, overflow: "hidden", border: "1px solid #1e2d40" }}>
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} 
            />
            <canvas 
              ref={canvasRef} 
              width={isMobile ? 140 : 220} 
              height={isMobile ? 100 : 160} 
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }} 
            />
          </div>

          <div style={{ fontSize: 9, color: "#c0ccd8", lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
            <div>STATUS: {gestureStatus}</div>
            {handDetected ? (
              <div style={{ color: "#00e87a", marginTop: 4 }}>
                {targetScreenPos ? "🎯 LOCK: Snap active!" : "🖐 SCAN: Point at nodes"}
              </div>
            ) : (
              <div style={{ color: "#4a6070", marginTop: 4 }}>🖐 Position hand in frame</div>
            )}
          </div>
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
