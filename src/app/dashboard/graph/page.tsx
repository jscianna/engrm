"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { MemoryGraph } from "@/components/memory-graph";
import { RelationshipBadge } from "@/components/relationship-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MemoryGraphEdge, MemoryGraphNode, MemoryRelationshipType } from "@/lib/types";

const ALL_RELATIONSHIP_TYPES: MemoryRelationshipType[] = [
  "similar",
  "updates",
  "contradicts",
  "extends",
  "derives_from",
  "references",
];

export default function GraphPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes] = useState<MemoryGraphNode[]>([]);
  const [edges, setEdges] = useState<MemoryGraphEdge[]>([]);
  const [activeTypes, setActiveTypes] = useState<MemoryRelationshipType[]>(ALL_RELATIONSHIP_TYPES);

  useEffect(() => {
    async function loadGraph() {
      try {
        setLoading(true);
        const response = await fetch("/api/memories/graph?limit=200");
        const payload = (await response.json()) as {
          error?: string;
          nodes?: MemoryGraphNode[];
          edges?: MemoryGraphEdge[];
        };

        if (!response.ok) {
          throw new Error(payload.error || "Failed to load graph");
        }

        setNodes(payload.nodes || []);
        setEdges(payload.edges || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load graph";
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    void loadGraph();
  }, []);

  const relationshipCounts = useMemo(() => {
    const counts = new Map<MemoryRelationshipType, number>();
    for (const type of ALL_RELATIONSHIP_TYPES) {
      counts.set(type, 0);
    }
    for (const edge of edges) {
      counts.set(edge.relationshipType, (counts.get(edge.relationshipType) || 0) + 1);
    }
    return counts;
  }, [edges]);

  function toggleType(type: MemoryRelationshipType) {
    setActiveTypes((current) => {
      if (current.includes(type)) {
        return current.filter((entry) => entry !== type);
      }
      return [...current, type];
    });
  }

  return (
    <div className="space-y-6">
      <Card className="border-zinc-800 bg-zinc-900/70">
        <CardHeader>
          <CardTitle className="text-zinc-100">Memory Graph</CardTitle>
          <p className="text-sm text-zinc-400">Force-directed view of how your memories connect over time.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {ALL_RELATIONSHIP_TYPES.map((type) => {
              const active = activeTypes.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleType(type)}
                  className={`rounded-full border px-2 py-1 text-xs transition ${
                    active ? "border-cyan-700/80 bg-zinc-800 text-zinc-100" : "border-zinc-700 bg-zinc-900 text-zinc-400"
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    <RelationshipBadge type={type} />
                    {relationshipCounts.get(type) || 0}
                  </span>
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="flex h-64 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading graph...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-800/60 bg-rose-950/20 p-4 text-sm text-rose-300">{error}</div>
          ) : nodes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950 p-8 text-sm text-zinc-400">
              No memories yet to visualize.
            </div>
          ) : (
            <MemoryGraph nodes={nodes} edges={edges} activeTypes={activeTypes} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
