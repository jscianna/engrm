"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

// =============================================================================
// Types
// =============================================================================

interface MemoryNode {
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  type: string;
  strength: number;
  importance: number;
  title: string;
  radius: number;
}

interface MemoryEdge {
  source: string;
  target: string;
  weight: number;
  type: string;
}

interface BrainStats {
  nodes: number;
  connections: number;
  avgDecay: number;
  avgImportance: number;
}

// =============================================================================
// Constants
// =============================================================================

const TYPE_COLORS: Record<string, string> = {
  constraint: "#ef4444",   // red
  identity: "#a855f7",     // purple
  relationship: "#ec4899", // pink
  preference: "#22d3ee",   // cyan
  how_to: "#22c55e",       // green
  fact: "#3b82f6",         // blue
  event: "#f59e0b",        // amber
  episodic: "#f59e0b",
  semantic: "#3b82f6",
  procedural: "#22c55e",
  "self-model": "#a855f7",
};

const EDGE_COLORS: Record<string, string> = {
  similar: "#22d3ee",
  extends: "#22c55e",
  updates: "#f59e0b",
  contradicts: "#ef4444",
  derives_from: "#a855f7",
  references: "#3b82f6",
};

// =============================================================================
// 3D Brain Visualization Component
// =============================================================================

function Brain3D({ 
  nodes, 
  edges,
  onNodeHover,
  onNodeClick,
}: { 
  nodes: MemoryNode[];
  edges: MemoryEdge[];
  onNodeHover: (node: MemoryNode | null) => void;
  onNodeClick: (node: MemoryNode) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const rotationRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const nodesRef = useRef<MemoryNode[]>([]);
  const zoomRef = useRef(1);

  // Update nodes ref when nodes change
  useEffect(() => {
    nodesRef.current = nodes.map(n => ({ ...n }));
  }, [nodes]);

  // Physics simulation
  const simulate = useCallback(() => {
    const nodesCopy = nodesRef.current;
    const center = { x: 0, y: 0, z: 0 };
    const repulsion = 500;
    const attraction = 0.01;
    const damping = 0.95;
    const centerPull = 0.002;

    // Apply forces
    for (let i = 0; i < nodesCopy.length; i++) {
      const node = nodesCopy[i];
      
      // Repulsion from other nodes
      for (let j = 0; j < nodesCopy.length; j++) {
        if (i === j) continue;
        const other = nodesCopy[j];
        const dx = node.x - other.x;
        const dy = node.y - other.y;
        const dz = node.z - other.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const force = repulsion / (dist * dist);
        node.vx += (dx / dist) * force * 0.01;
        node.vy += (dy / dist) * force * 0.01;
        node.vz += (dz / dist) * force * 0.01;
      }

      // Center pull
      node.vx += (center.x - node.x) * centerPull;
      node.vy += (center.y - node.y) * centerPull;
      node.vz += (center.z - node.z) * centerPull;
    }

    // Edge attraction
    for (const edge of edges) {
      const source = nodesCopy.find(n => n.id === edge.source);
      const target = nodesCopy.find(n => n.id === edge.target);
      if (!source || !target) continue;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dz = target.z - source.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      
      const force = attraction * edge.weight;
      source.vx += dx * force;
      source.vy += dy * force;
      source.vz += dz * force;
      target.vx -= dx * force;
      target.vy -= dy * force;
      target.vz -= dz * force;
    }

    // Apply velocity and damping
    for (const node of nodesCopy) {
      node.vx *= damping;
      node.vy *= damping;
      node.vz *= damping;
      node.x += node.vx;
      node.y += node.vy;
      node.z += node.vz;
    }
  }, [edges]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      simulate();

      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;
      const scale = Math.min(width, height) / 4 * zoomRef.current;

      // Clear
      ctx.fillStyle = "#09090b";
      ctx.fillRect(0, 0, width, height);

      // Draw grid lines (subtle)
      ctx.strokeStyle = "rgba(39, 39, 42, 0.5)";
      ctx.lineWidth = 1;
      for (let i = -5; i <= 5; i++) {
        const y = centerY + i * 50;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      const rotation = rotationRef.current;
      const cosX = Math.cos(rotation.x);
      const sinX = Math.sin(rotation.x);
      const cosY = Math.cos(rotation.y);
      const sinY = Math.sin(rotation.y);

      // Project 3D to 2D with rotation
      const project = (node: MemoryNode) => {
        // Rotate around Y axis
        const x1 = node.x * cosY - node.z * sinY;
        const z1 = node.x * sinY + node.z * cosY;
        // Rotate around X axis
        const y1 = node.y * cosX - z1 * sinX;
        const z2 = node.y * sinX + z1 * cosX;
        
        // Perspective
        const perspective = 800;
        const factor = perspective / (perspective + z2);
        
        return {
          x: centerX + x1 * scale * factor,
          y: centerY + y1 * scale * factor,
          z: z2,
          scale: factor,
        };
      };

      // Sort nodes by z for proper rendering order
      const nodesCopy = nodesRef.current;
      const projected = nodesCopy.map(node => ({
        node,
        proj: project(node),
      })).sort((a, b) => a.proj.z - b.proj.z);

      // Draw edges
      ctx.lineWidth = 1;
      for (const edge of edges) {
        const sourceNode = nodesCopy.find(n => n.id === edge.source);
        const targetNode = nodesCopy.find(n => n.id === edge.target);
        if (!sourceNode || !targetNode) continue;

        const sourceProj = project(sourceNode);
        const targetProj = project(targetNode);
        
        const alpha = Math.min(0.6, edge.weight * 0.3) * ((sourceProj.scale + targetProj.scale) / 2);
        ctx.strokeStyle = `${EDGE_COLORS[edge.type] || "#22d3ee"}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
        
        ctx.beginPath();
        ctx.moveTo(sourceProj.x, sourceProj.y);
        ctx.lineTo(targetProj.x, targetProj.y);
        ctx.stroke();
      }

      // Draw nodes
      for (const { node, proj } of projected) {
        const baseRadius = node.radius * proj.scale;
        const color = TYPE_COLORS[node.type] || "#22d3ee";
        
        // Glow effect
        const gradient = ctx.createRadialGradient(
          proj.x, proj.y, 0,
          proj.x, proj.y, baseRadius * 3
        );
        gradient.addColorStop(0, `${color}40`);
        gradient.addColorStop(1, "transparent");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, baseRadius * 3, 0, Math.PI * 2);
        ctx.fill();

        // Node
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, baseRadius, 0, Math.PI * 2);
        ctx.fill();

        // Inner highlight
        ctx.fillStyle = `${color}80`;
        ctx.beginPath();
        ctx.arc(proj.x - baseRadius * 0.3, proj.y - baseRadius * 0.3, baseRadius * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [simulate, edges]);

  // Handle resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Mouse interaction
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      
      rotationRef.current.y += dx * 0.005;
      rotationRef.current.x += dy * 0.005;
      
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomRef.current = Math.max(0.5, Math.min(3, zoomRef.current - e.deltaY * 0.001));
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("mouseleave", handleMouseUp);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("mouseleave", handleMouseUp);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, []);

  // Auto-rotate when not dragging
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isDraggingRef.current) {
        rotationRef.current.y += 0.002;
      }
    }, 16);

    return () => clearInterval(interval);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full cursor-grab active:cursor-grabbing"
      style={{ background: "#09090b" }}
    />
  );
}

// =============================================================================
// Demo Data Generator
// =============================================================================

// Demo memories - generic mainstream content for demo purposes
const DEMO_MEMORIES = [
  // Identity
  { type: "identity", title: "Prefers coffee over tea", importance: 0.7 },
  { type: "identity", title: "Works in software engineering", importance: 0.9 },
  { type: "identity", title: "Lives in San Francisco", importance: 0.8 },
  { type: "identity", title: "Speaks English and Spanish", importance: 0.6 },
  
  // Preferences
  { type: "preference", title: "Likes action movies", importance: 0.5 },
  { type: "preference", title: "Prefers dark mode UI", importance: 0.8 },
  { type: "preference", title: "Morning person", importance: 0.6 },
  { type: "preference", title: "Prefers async communication", importance: 0.7 },
  { type: "preference", title: "Likes minimalist design", importance: 0.6 },
  { type: "preference", title: "Prefers walking over driving", importance: 0.4 },
  
  // Facts
  { type: "fact", title: "Python is a programming language", importance: 0.5 },
  { type: "fact", title: "The Earth orbits the Sun", importance: 0.3 },
  { type: "fact", title: "HTTP uses port 80 by default", importance: 0.6 },
  { type: "fact", title: "Water boils at 100°C", importance: 0.4 },
  { type: "fact", title: "JavaScript runs in browsers", importance: 0.7 },
  { type: "fact", title: "Git is version control software", importance: 0.8 },
  { type: "fact", title: "SQL queries databases", importance: 0.6 },
  { type: "fact", title: "JSON is a data format", importance: 0.5 },
  
  // Events
  { type: "event", title: "Had meeting about Q4 planning", importance: 0.6 },
  { type: "event", title: "Completed project milestone", importance: 0.8 },
  { type: "event", title: "Attended conference last month", importance: 0.5 },
  { type: "event", title: "Fixed critical production bug", importance: 0.9 },
  { type: "event", title: "Shipped v2.0 release", importance: 0.9 },
  { type: "event", title: "Team lunch on Friday", importance: 0.4 },
  
  // How-to
  { type: "how_to", title: "Deploy to production: git push main", importance: 0.8 },
  { type: "how_to", title: "Reset password via settings page", importance: 0.5 },
  { type: "how_to", title: "Create PR: branch, commit, push, open PR", importance: 0.7 },
  { type: "how_to", title: "Run tests: npm test", importance: 0.6 },
  { type: "how_to", title: "Check logs: docker logs -f app", importance: 0.7 },
  { type: "how_to", title: "Connect to database: psql $DATABASE_URL", importance: 0.6 },
  
  // Constraints
  { type: "constraint", title: "No deployments on Fridays", importance: 0.9 },
  { type: "constraint", title: "Max 100 API calls per minute", importance: 0.8 },
  { type: "constraint", title: "Password must be 12+ characters", importance: 0.7 },
  { type: "constraint", title: "Code review required before merge", importance: 0.9 },
  { type: "constraint", title: "Use UTC for all timestamps", importance: 0.6 },
  
  // Relationships
  { type: "relationship", title: "Works with design team", importance: 0.6 },
  { type: "relationship", title: "Reports to engineering manager", importance: 0.7 },
  { type: "relationship", title: "Mentors junior developers", importance: 0.5 },
  { type: "relationship", title: "Collaborates with product team", importance: 0.6 },
  { type: "relationship", title: "Part of platform squad", importance: 0.7 },
];

function generateDemoData(): { nodes: MemoryNode[]; edges: MemoryEdge[] } {
  const nodes: MemoryNode[] = [];
  const edges: MemoryEdge[] = [];

  // Create nodes from demo memories
  DEMO_MEMORIES.forEach((mem, i) => {
    nodes.push({
      id: `mem_${i}`,
      x: (Math.random() - 0.5) * 200,
      y: (Math.random() - 0.5) * 200,
      z: (Math.random() - 0.5) * 200,
      vx: 0,
      vy: 0,
      vz: 0,
      type: mem.type,
      strength: 0.5 + Math.random() * 0.5,
      importance: mem.importance,
      title: mem.title,
      radius: 4 + mem.importance * 8,
    });
  });

  // Generate meaningful edges (connect related memories)
  const edgeTypes = ["similar", "extends", "updates", "references"];
  
  // Connect memories of the same type
  const byType: Record<string, number[]> = {};
  nodes.forEach((node, i) => {
    if (!byType[node.type]) byType[node.type] = [];
    byType[node.type].push(i);
  });
  
  // Add edges within type groups
  Object.values(byType).forEach(indices => {
    for (let i = 0; i < indices.length - 1; i++) {
      edges.push({
        source: nodes[indices[i]].id,
        target: nodes[indices[i + 1]].id,
        weight: 0.8 + Math.random() * 0.5,
        type: "similar",
      });
    }
  });
  
  // Add some cross-type connections
  for (let i = 0; i < 30; i++) {
    const sourceIdx = Math.floor(Math.random() * nodes.length);
    let targetIdx = Math.floor(Math.random() * nodes.length);
    while (targetIdx === sourceIdx) {
      targetIdx = Math.floor(Math.random() * nodes.length);
    }

    edges.push({
      source: nodes[sourceIdx].id,
      target: nodes[targetIdx].id,
      weight: 0.3 + Math.random() * 0.7,
      type: edgeTypes[Math.floor(Math.random() * edgeTypes.length)],
    });
  }

  return { nodes, edges };
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function BrainPage() {
  const [nodes, setNodes] = useState<MemoryNode[]>([]);
  const [edges, setEdges] = useState<MemoryEdge[]>([]);
  const [stats, setStats] = useState<BrainStats>({
    nodes: 0,
    connections: 0,
    avgDecay: 0,
    avgImportance: 0,
  });
  const [hoveredNode, setHoveredNode] = useState<MemoryNode | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [latestThought, setLatestThought] = useState("Initializing neural network...");

  // Initialize with demo data
  useEffect(() => {
    const { nodes: demoNodes, edges: demoEdges } = generateDemoData();
    setNodes(demoNodes);
    setEdges(demoEdges);
    
    const avgImportance = demoNodes.reduce((sum, n) => sum + n.importance, 0) / demoNodes.length;
    const avgDecay = demoNodes.reduce((sum, n) => sum + n.strength, 0) / demoNodes.length;
    
    setStats({
      nodes: demoNodes.length,
      connections: demoEdges.length,
      avgDecay: Math.round(avgDecay * 100),
      avgImportance: Math.round(avgImportance * 100),
    });

    // Simulate neural activity
    const thoughts = [
      "Processing memory consolidation...",
      "Strengthening associative links...",
      "Decaying unused pathways...",
      "Forming new connections...",
      "Retrieving related memories...",
      "Reinforcing co-activated patterns...",
      "Pruning weak memories...",
      "Integrating new information...",
    ];

    let thoughtIndex = 0;
    const thoughtInterval = setInterval(() => {
      setLatestThought(thoughts[thoughtIndex % thoughts.length]);
      thoughtIndex++;
    }, 3000);

    return () => clearInterval(thoughtInterval);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white overflow-hidden">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold">MEMRY</Link>
            <span className="text-zinc-500">|</span>
            <span className="text-cyan-400 font-mono text-sm">THE BRAIN</span>
            <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${
              isLive ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-400"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"}`} />
              {isLive ? "LIVE" : "PAUSED"}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/docs" className="text-zinc-400 hover:text-white transition-colors text-sm">
              Docs
            </Link>
            <Link href="/dashboard" className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-medium rounded-lg transition-colors text-sm">
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* Main visualization */}
      <div className="pt-16 h-screen">
        <Brain3D
          nodes={nodes}
          edges={edges}
          onNodeHover={setHoveredNode}
          onNodeClick={(node) => console.log("Clicked:", node)}
        />
      </div>

      {/* Stats overlay - Top left */}
      <div className="fixed top-24 left-6 z-40">
        <div className="bg-zinc-900/90 backdrop-blur border border-zinc-800 rounded-xl p-4 space-y-3 min-w-[200px]">
          <div className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Neural Memory Network</div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-zinc-400 text-sm">Nodes</span>
              <span className="text-white font-mono">{stats.nodes}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400 text-sm">Connections</span>
              <span className="text-white font-mono">{stats.connections}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400 text-sm">Avg Strength</span>
              <span className="text-cyan-400 font-mono">{stats.avgDecay}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400 text-sm">Avg Importance</span>
              <span className="text-cyan-400 font-mono">{stats.avgImportance}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Memory types legend - Top right */}
      <div className="fixed top-24 right-6 z-40">
        <div className="bg-zinc-900/90 backdrop-blur border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Memory Types</div>
          
          <div className="space-y-1.5">
            {Object.entries(TYPE_COLORS).slice(0, 7).map(([type, color]) => (
              <div key={type} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-zinc-300 text-sm capitalize">{type.replace("_", " ")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Edge types legend - Bottom right */}
      <div className="fixed bottom-6 right-6 z-40">
        <div className="bg-zinc-900/90 backdrop-blur border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Bond Types</div>
          
          <div className="space-y-1.5">
            {Object.entries(EDGE_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-2">
                <span className="w-4 h-0.5" style={{ backgroundColor: color }} />
                <span className="text-zinc-300 text-sm capitalize">{type.replace("_", " ")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Neural activity - Bottom left */}
      <div className="fixed bottom-6 left-6 z-40">
        <div className="bg-zinc-900/90 backdrop-blur border border-zinc-800 rounded-xl p-4 space-y-3 max-w-xs">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Neural Activity</span>
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          </div>
          
          <div className="text-cyan-300 text-sm font-mono">
            {latestThought}
          </div>
          
          {/* Activity bars */}
          <div className="flex gap-0.5 h-8 items-end">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="w-1.5 bg-cyan-500/60 rounded-t transition-all duration-300"
                style={{
                  height: `${20 + Math.random() * 80}%`,
                  animationDelay: `${i * 50}ms`,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Instructions overlay - Center bottom */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
        <div className="bg-zinc-900/60 backdrop-blur border border-zinc-800 rounded-lg px-4 py-2 text-xs text-zinc-500">
          Drag to rotate • Scroll to zoom
        </div>
      </div>
    </div>
  );
}
