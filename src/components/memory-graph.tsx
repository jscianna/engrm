"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { forceCenter, forceLink, forceManyBody, forceSimulation, type SimulationNodeDatum } from "d3-force";
import { ExternalLink, Loader2, X } from "lucide-react";
import Link from "next/link";
import type { MemoryGraphEdge, MemoryGraphNode, MemoryRecord, MemoryRelationshipType } from "@/lib/types";

type GraphNode = MemoryGraphNode & SimulationNodeDatum;

type GraphLink = {
  id: string;
  source: string;
  target: string;
  relationshipType: MemoryRelationshipType;
  weight: number;
};

const MEMORY_TYPE_COLORS: Record<string, string> = {
  episodic: "#67e8f9",
  semantic: "#86efac",
  procedural: "#f9a8d4",
  "self-model": "#fca5a5",
};

const RELATION_COLORS: Record<MemoryRelationshipType, string> = {
  similar: "#67e8f9",
  updates: "#fbbf24",
  contradicts: "#fb7185",
  extends: "#34d399",
  derives_from: "#818cf8",
  references: "#a1a1aa",
};

function nodeRadius(node: MemoryGraphNode): number {
  return 6 + Math.max(0, Math.min(10, node.importance)) * 1.1;
}

function MemoryDetailCard({
  memoryId,
  onClose,
}: {
  memoryId: string;
  onClose: () => void;
}) {
  const [memory, setMemory] = useState<MemoryRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMemory() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/memories/${memoryId}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to load memory");
        }
        setMemory(data.memory);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    void fetchMemory();
  }, [memoryId]);

  return (
    <div className="absolute right-4 top-4 z-10 w-80 rounded-lg border border-zinc-700 bg-zinc-900/95 shadow-xl backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <h3 className="text-sm font-medium text-zinc-100 truncate pr-2">
          {memory?.title || "Memory Details"}
        </h3>
        <button
          onClick={onClose}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : error ? (
          <div className="text-sm text-rose-400">{error}</div>
        ) : memory ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: MEMORY_TYPE_COLORS[memory.memoryType] + "20",
                  color: MEMORY_TYPE_COLORS[memory.memoryType],
                }}
              >
                {memory.memoryType}
              </span>
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                importance: {memory.importance}
              </span>
            </div>

            {memory.contentText && (
              <div className="max-h-40 overflow-y-auto rounded bg-zinc-950 p-3 text-xs text-zinc-300">
                {memory.isEncrypted ? (
                  <span className="italic text-zinc-500">🔒 Encrypted content</span>
                ) : (
                  memory.contentText.length > 400
                    ? memory.contentText.slice(0, 400) + "..."
                    : memory.contentText
                )}
              </div>
            )}

            {memory.tags && memory.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {memory.tags.slice(0, 5).map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400"
                  >
                    {tag}
                  </span>
                ))}
                {memory.tags.length > 5 && (
                  <span className="text-xs text-zinc-500">+{memory.tags.length - 5}</span>
                )}
              </div>
            )}

            <div className="text-xs text-zinc-500">
              Created {new Date(memory.createdAt).toLocaleDateString()}
            </div>

            <Link
              href={`/dashboard/memory/${memoryId}`}
              className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300"
            >
              View full details <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function MemoryGraph({
  nodes,
  edges,
  activeTypes,
}: {
  nodes: MemoryGraphNode[];
  edges: MemoryGraphEdge[];
  activeTypes: MemoryRelationshipType[];
}) {
  const [positions, setPositions] = useState<GraphNode[]>([]);
  const [hoverText, setHoverText] = useState<string>("");
  const [transform, setTransform] = useState({ x: 520, y: 320, scale: 1 });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const simulationRef = useRef<ReturnType<typeof forceSimulation<GraphNode, GraphLink>> | null>(null);

  const filteredEdges = useMemo(
    () => edges.filter((edge) => activeTypes.includes(edge.relationshipType)),
    [activeTypes, edges],
  );

  useEffect(() => {
    const nextNodes: GraphNode[] = nodes.map((node) => ({
      ...node,
      x: undefined,
      y: undefined,
      vx: 0,
      vy: 0,
      fx: null,
      fy: null,
    }));

    const nextEdges: GraphLink[] = filteredEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      relationshipType: edge.relationshipType,
      weight: edge.weight,
    }));

    const linkForce = forceLink<GraphNode, GraphLink>(nextEdges)
      .id((node) => node.id)
      .distance(100)
      .strength(0.06);

    const simulation = forceSimulation<GraphNode, GraphLink>(nextNodes)
      .force("link", linkForce)
      .force("charge", forceManyBody<GraphNode, GraphLink>().strength(-180))
      .force("center", forceCenter<GraphNode, GraphLink>(0, 0))
      .setLinks(nextEdges)
      .alphaDecay(0.04)
      .velocityDecay(0.3)
      .on("tick", () => {
        setPositions([...nextNodes]);
      });

    simulation.restart();
    simulationRef.current = simulation;

    return () => {
      simulation.stop();
      simulationRef.current = null;
    };
  }, [filteredEdges, nodes]);

  function onWheel(event: React.WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const nextScale = Math.max(0.4, Math.min(2.3, transform.scale - event.deltaY * 0.0012));
    setTransform((current) => ({ ...current, scale: nextScale }));
  }

  function onBackgroundDragStart(event: React.PointerEvent<SVGSVGElement>) {
    const target = event.target as SVGElement;
    if (target.dataset.role === "node") {
      return;
    }

    // Close detail card when clicking background
    setSelectedNodeId(null);

    const startX = event.clientX;
    const startY = event.clientY;
    const initial = { ...transform };

    const onMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      setTransform({ ...initial, x: initial.x + deltaX, y: initial.y + deltaY });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function startNodeDrag(event: React.PointerEvent<SVGCircleElement>, nodeId: string) {
    event.preventDefault();
    event.stopPropagation();
    setDraggingId(nodeId);

    const node = positions.find((entry) => entry.id === nodeId);
    if (!node || !wrapperRef.current) {
      return;
    }

    const bounds = wrapperRef.current.getBoundingClientRect();
    const simulation = simulationRef.current;
    if (!simulation) {
      return;
    }

    const pointerToGraph = (clientX: number, clientY: number) => {
      const localX = clientX - bounds.left;
      const localY = clientY - bounds.top;
      return {
        x: (localX - transform.x) / transform.scale,
        y: (localY - transform.y) / transform.scale,
      };
    };

    const onMove = (moveEvent: PointerEvent) => {
      const point = pointerToGraph(moveEvent.clientX, moveEvent.clientY);
      node.fx = point.x;
      node.fy = point.y;
      simulation.alpha(0.4);
      simulation.restart();
    };
    const onUp = () => {
      node.fx = null;
      node.fy = null;
      setDraggingId(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const nodeById = new Map(positions.map((node) => [node.id, node]));

  return (
    <div ref={wrapperRef} className="space-y-2">
      <div className="relative h-[620px] w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
        {selectedNodeId && (
          <MemoryDetailCard
            memoryId={selectedNodeId}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
        <svg viewBox="0 0 1040 640" className="h-full w-full" onWheel={onWheel} onPointerDown={onBackgroundDragStart}>
          <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}>
            {filteredEdges.map((edge) => {
              const source = nodeById.get(edge.source);
              const target = nodeById.get(edge.target);
              if (!source || !target) {
                return null;
              }

              return (
                <line
                  key={edge.id}
                  x1={source.x ?? 0}
                  y1={source.y ?? 0}
                  x2={target.x ?? 0}
                  y2={target.y ?? 0}
                  stroke={RELATION_COLORS[edge.relationshipType]}
                  strokeWidth={Math.max(1, edge.weight * 2)}
                  strokeOpacity={0.7}
                  onMouseEnter={() => setHoverText(`${edge.relationshipType} • weight ${edge.weight.toFixed(2)}`)}
                  onMouseLeave={() => setHoverText("")}
                />
              );
            })}

            {positions.map((node) => (
              <g key={node.id} transform={`translate(${node.x ?? 0} ${node.y ?? 0})`}>
                <circle
                  data-role="node"
                  r={nodeRadius(node)}
                  fill={MEMORY_TYPE_COLORS[node.memoryType] ?? "#67e8f9"}
                  fillOpacity={draggingId === node.id ? 0.95 : 0.85}
                  stroke="#18181b"
                  strokeWidth={1.5}
                  onPointerDown={(event) => startNodeDrag(event, node.id)}
                  onMouseEnter={() => setHoverText(`${node.title} (${node.memoryType})`)}
                  onMouseLeave={() => setHoverText("")}
                  onClick={() => setSelectedNodeId(node.id)}
                />
              </g>
            ))}
          </g>
        </svg>
      </div>
      <p className="h-5 text-xs text-zinc-400">{hoverText || "Hover a node or edge for details."}</p>
    </div>
  );
}
