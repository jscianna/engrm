"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { Brain3D, type BrainNode, type BrainEdge } from "@/components/brain-3d";
import type { FullGraphNode, FullGraphEdge } from "@/components/memory-graph";

const TYPE_COLORS: Record<string, string> = {
  constraint: "#ef4444",
  identity: "#a855f7",
  relationship: "#ec4899",
  preference: "#22d3ee",
  how_to: "#22c55e",
  fact: "#22c55e",
  event: "#f59e0b",
  belief: "#06b6d4",
  decision: "#f59e0b",
  synthesis: "#ec4899",
};

const EDGE_COLORS: Record<string, string> = {
  similar: "#6b7280",
  same_entity: "#e5e7eb",
  extends: "#22c55e",
  updates: "#f59e0b",
  contradicts: "#ef4444",
  derives_from: "#ec4899",
  references: "#6b7280",
  relates_to: "#22d3ee",
};

export default function DashboardBrainPage() {
  const [nodes, setNodes] = useState<BrainNode[]>([]);
  const [edges, setEdges] = useState<BrainEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<BrainNode | null>(null);
  const [stats, setStats] = useState({ nodes: 0, connections: 0, syntheses: 0 });

  useEffect(() => {
    async function loadGraph() {
      try {
        setLoading(true);
        const response = await fetch("/api/memories/graph?limit=200&full=true");
        const payload = (await response.json()) as {
          error?: string;
          nodes?: FullGraphNode[];
          edges?: FullGraphEdge[];
        };

        if (!response.ok) {
          throw new Error(payload.error || "Failed to load graph");
        }

        const apiNodes = payload.nodes || [];
        const apiEdges = payload.edges || [];

        // Convert to Brain3D format with sphere distribution
        const brainNodes: BrainNode[] = apiNodes.map((n, i) => {
          // Fibonacci sphere distribution for even spread
          const phi = Math.acos(-1 + (2 * i) / apiNodes.length);
          const theta = Math.sqrt(apiNodes.length * Math.PI) * phi;
          const radius = 60 + Math.random() * 40;

          const isSynthesis = n.nodeType === "synthesis";

          return {
            id: n.id,
            x: radius * Math.sin(phi) * Math.cos(theta),
            y: radius * Math.sin(phi) * Math.sin(theta),
            z: radius * Math.cos(phi),
            vx: 0,
            vy: 0,
            vz: 0,
            type: n.memoryType || "fact",
            nodeType: n.nodeType,
            strength: 0.7 + Math.random() * 0.3,
            importance: (n.importance ?? 5) / 10,
            title: n.title,
            radius: isSynthesis ? 8 + (n.sourceCount ?? 0) * 0.5 : 4 + ((n.importance ?? 5) / 10) * 4,
          };
        });

        const brainEdges: BrainEdge[] = apiEdges.map((e) => ({
          source: e.source,
          target: e.target,
          weight: e.weight,
          type: e.edgeType,
        }));

        setNodes(brainNodes);
        setEdges(brainEdges);
        setStats({
          nodes: brainNodes.length,
          connections: brainEdges.length,
          syntheses: brainNodes.filter((n) => n.nodeType === "synthesis").length,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }

    void loadGraph();
  }, []);

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="text-rose-400">{error}</div>
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100vh-4rem)] -mx-6 -mt-6">
      {/* Main visualization */}
      <Brain3D nodes={nodes} edges={edges} onNodeClick={setSelectedNode} />

      {/* Stats overlay - Top left */}
      <div className="absolute top-4 left-4 z-10">
        <div className="bg-zinc-900/90 backdrop-blur border border-zinc-800 rounded-xl p-4 space-y-2 min-w-[180px]">
          <div className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Your Memory Network</div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-zinc-400 text-sm">Memories</span>
              <span className="text-white font-mono">{stats.nodes - stats.syntheses}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400 text-sm">Syntheses</span>
              <span className="text-pink-400 font-mono">{stats.syntheses}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400 text-sm">Connections</span>
              <span className="text-cyan-400 font-mono">{stats.connections}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Legend - Top right */}
      <div className="absolute top-4 right-4 z-10">
        <div className="bg-zinc-900/90 backdrop-blur border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Node Types</div>

          <div className="space-y-1.5">
            {Object.entries(TYPE_COLORS).slice(0, 8).map(([type, color]) => (
              <div key={type} className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${type === "synthesis" ? "ring-2 ring-pink-300" : ""}`}
                  style={{ backgroundColor: color }}
                />
                <span className="text-zinc-300 text-xs capitalize">{type.replace("_", " ")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Edge legend - Bottom right */}
      <div className="absolute bottom-4 right-4 z-10">
        <div className="bg-zinc-900/90 backdrop-blur border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Bond Types</div>

          <div className="space-y-1.5">
            {Object.entries(EDGE_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-2">
                <span className="w-4 h-0.5" style={{ backgroundColor: color }} />
                <span className="text-zinc-300 text-xs capitalize">{type.replace("_", " ")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Instructions - Bottom center */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
        <div className="bg-zinc-900/60 backdrop-blur border border-zinc-800 rounded-lg px-4 py-2 text-xs text-zinc-500">
          Drag to rotate • Scroll to zoom • Click nodes for details
        </div>
      </div>

      {/* Selected node detail */}
      {selectedNode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setSelectedNode(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-4 h-4 rounded-full ${selectedNode.nodeType === "synthesis" ? "ring-2 ring-pink-300" : ""}`}
                  style={{ backgroundColor: TYPE_COLORS[selectedNode.nodeType === "synthesis" ? "synthesis" : selectedNode.type] || "#22d3ee" }}
                />
                <span className="text-sm font-mono text-zinc-400 capitalize">
                  {selectedNode.nodeType === "synthesis" ? "Synthesis" : selectedNode.type.replace("_", " ")}
                </span>
              </div>
              <button onClick={() => setSelectedNode(null)} className="text-zinc-500 hover:text-white">
                ✕
              </button>
            </div>

            <h3 className="text-xl font-semibold text-white mb-4">{selectedNode.title}</h3>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-zinc-800/50 rounded-lg p-3">
                <div className="text-xs text-zinc-500 mb-1">Strength</div>
                <div className="text-lg font-mono text-cyan-400">{Math.round(selectedNode.strength * 100)}%</div>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-3">
                <div className="text-xs text-zinc-500 mb-1">Importance</div>
                <div className="text-lg font-mono text-amber-400">{Math.round(selectedNode.importance * 100)}%</div>
              </div>
            </div>

            <div className="bg-zinc-800/50 rounded-lg p-3 mb-4">
              <div className="text-xs text-zinc-500 mb-2">Connected Memories</div>
              <div className="text-sm text-zinc-300">
                {edges.filter((e) => e.source === selectedNode.id || e.target === selectedNode.id).length} connections
              </div>
            </div>

            <Link
              href={selectedNode.nodeType === "synthesis" 
                ? `/dashboard/synthesis/${selectedNode.id}` 
                : `/dashboard/memory/${selectedNode.id}`}
              className="block w-full text-center bg-cyan-500 hover:bg-cyan-400 text-black font-medium rounded-lg py-2 transition-colors"
              onClick={() => setSelectedNode(null)}
            >
              {selectedNode.nodeType === "synthesis" ? "View Synthesis" : "View Memory"}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
