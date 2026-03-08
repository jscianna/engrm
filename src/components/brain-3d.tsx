"use client";

import { useEffect, useRef, useCallback } from "react";

// =============================================================================
// Types
// =============================================================================

export interface BrainNode {
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  type: string;       // memory type or "synthesis"
  nodeType: "memory" | "synthesis";
  strength: number;
  importance: number;
  title: string;
  radius: number;
}

export interface BrainEdge {
  source: string;
  target: string;
  weight: number;
  type: string;
}

// =============================================================================
// Constants
// =============================================================================

const TYPE_COLORS: Record<string, string> = {
  // Memory types
  constraint: "#ef4444",
  identity: "#a855f7",
  relationship: "#ec4899",
  preference: "#22d3ee",
  how_to: "#22c55e",
  fact: "#22c55e",
  event: "#f59e0b",
  episodic: "#22c55e",
  semantic: "#22c55e",
  procedural: "#22d3ee",
  belief: "#06b6d4",
  decision: "#f59e0b",
  "self-model": "#a855f7",
  // Synthesis nodes - distinct pink
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
  abstracts: "#a855f7",
};

// =============================================================================
// Brain3D Component
// =============================================================================

export function Brain3D({
  nodes,
  edges,
  onNodeClick,
}: {
  nodes: BrainNode[];
  edges: BrainEdge[];
  onNodeClick?: (node: BrainNode) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const rotationRef = useRef({ x: 0.3, y: 0 });
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const nodesRef = useRef<BrainNode[]>([]);
  const zoomRef = useRef(3.5);
  const projectedNodesRef = useRef<Array<{ node: BrainNode; x: number; y: number; radius: number }>>([]);

  // Update nodes ref when nodes change
  useEffect(() => {
    nodesRef.current = nodes.map((n) => ({ ...n }));
  }, [nodes]);

  // Physics simulation - using REAL edges only, no artificial type clustering
  const simulate = useCallback(() => {
    const nodesCopy = nodesRef.current;
    const center = { x: 0, y: 0, z: 0 };
    const repulsion = 100;
    const attraction = 0.004;
    const damping = 0.88;
    const centerPull = 0.006;
    const maxVelocity = 2.5;

    // Repulsion between all nodes
    for (let i = 0; i < nodesCopy.length; i++) {
      const node = nodesCopy[i];

      for (let j = 0; j < nodesCopy.length; j++) {
        if (i === j) continue;
        const other = nodesCopy[j];
        const dx = node.x - other.x;
        const dy = node.y - other.y;
        const dz = node.z - other.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const minDist = 25;
        const safeDist = Math.max(dist, minDist);
        const force = repulsion / (safeDist * safeDist);
        node.vx += (dx / dist) * force * 0.01;
        node.vy += (dy / dist) * force * 0.01;
        node.vz += (dz / dist) * force * 0.01;
      }

      // Center pull
      node.vx += (center.x - node.x) * centerPull;
      node.vy += (center.y - node.y) * centerPull;
      node.vz += (center.z - node.z) * centerPull;
    }

    // Edge attraction - this is what creates meaningful structure
    for (const edge of edges) {
      const source = nodesCopy.find((n) => n.id === edge.source);
      const target = nodesCopy.find((n) => n.id === edge.target);
      if (!source || !target) continue;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dz = target.z - source.z;

      const force = attraction * edge.weight;
      source.vx += dx * force;
      source.vy += dy * force;
      source.vz += dz * force;
      target.vx -= dx * force;
      target.vy -= dy * force;
      target.vz -= dz * force;
    }

    // Apply velocity
    for (const node of nodesCopy) {
      node.vx *= damping;
      node.vy *= damping;
      node.vz *= damping;

      node.vx = Math.max(-maxVelocity, Math.min(maxVelocity, node.vx));
      node.vy = Math.max(-maxVelocity, Math.min(maxVelocity, node.vy));
      node.vz = Math.max(-maxVelocity, Math.min(maxVelocity, node.vz));

      node.x += node.vx;
      node.y += node.vy;
      node.z += node.vz;

      // Soft boundary
      const maxRange = 100;
      if (Math.abs(node.x) > maxRange) node.x *= 0.95;
      if (Math.abs(node.y) > maxRange) node.y *= 0.95;
      if (Math.abs(node.z) > maxRange) node.z *= 0.95;
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
      const scale = (Math.min(width, height) / 250) * zoomRef.current;

      ctx.fillStyle = "#09090b";
      ctx.fillRect(0, 0, width, height);

      const rotation = rotationRef.current;
      const cosX = Math.cos(rotation.x);
      const sinX = Math.sin(rotation.x);
      const cosY = Math.cos(rotation.y);
      const sinY = Math.sin(rotation.y);

      const project = (node: BrainNode) => {
        const x1 = node.x * cosY - node.z * sinY;
        const z1 = node.x * sinY + node.z * cosY;
        const y1 = node.y * cosX - z1 * sinX;
        const z2 = node.y * sinX + z1 * cosX;

        const perspective = 800;
        const factor = perspective / (perspective + z2);

        return {
          x: centerX + x1 * scale * factor,
          y: centerY + y1 * scale * factor,
          z: z2,
          scale: factor,
        };
      };

      const nodesCopy = nodesRef.current;
      const projected = nodesCopy
        .map((node) => ({
          node,
          proj: project(node),
        }))
        .sort((a, b) => a.proj.z - b.proj.z);

      // Draw edges
      ctx.lineWidth = 1;
      for (const edge of edges) {
        const sourceNode = nodesCopy.find((n) => n.id === edge.source);
        const targetNode = nodesCopy.find((n) => n.id === edge.target);
        if (!sourceNode || !targetNode) continue;

        const sourceProj = project(sourceNode);
        const targetProj = project(targetNode);

        const alpha = Math.min(0.6, edge.weight * 0.4) * ((sourceProj.scale + targetProj.scale) / 2);
        const color = EDGE_COLORS[edge.type] || "#6b7280";
        ctx.strokeStyle = `${color}${Math.round(alpha * 255)
          .toString(16)
          .padStart(2, "0")}`;

        ctx.beginPath();
        ctx.moveTo(sourceProj.x, sourceProj.y);
        ctx.lineTo(targetProj.x, targetProj.y);
        ctx.stroke();
      }

      // Draw nodes
      const clickableNodes: Array<{ node: BrainNode; x: number; y: number; radius: number }> = [];

      for (const { node, proj } of projected) {
        const baseRadius = Math.max(3, node.radius * proj.scale * 0.9);
        const color = TYPE_COLORS[node.nodeType === "synthesis" ? "synthesis" : node.type] || "#22d3ee";

        clickableNodes.push({ node, x: proj.x, y: proj.y, radius: baseRadius });

        // Glow for synthesis nodes
        if (node.nodeType === "synthesis") {
          const gradient = ctx.createRadialGradient(proj.x, proj.y, 0, proj.x, proj.y, baseRadius * 3);
          gradient.addColorStop(0, `${color}40`);
          gradient.addColorStop(1, "transparent");
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, baseRadius * 3, 0, Math.PI * 2);
          ctx.fill();
        }

        // Node
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, baseRadius, 0, Math.PI * 2);
        ctx.fill();

        // Ring for synthesis
        if (node.nodeType === "synthesis") {
          ctx.strokeStyle = "#fdf4ff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, baseRadius + 2, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      projectedNodesRef.current = clickableNodes.reverse();
      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
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

  // Mouse/touch interaction
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let dragStartPos = { x: 0, y: 0 };
    let hasDragged = false;

    const handleMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      dragStartPos = { x: e.clientX, y: e.clientY };
      hasDragged = false;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;

      const totalDx = e.clientX - dragStartPos.x;
      const totalDy = e.clientY - dragStartPos.y;
      if (Math.abs(totalDx) > 5 || Math.abs(totalDy) > 5) hasDragged = true;

      rotationRef.current.y += dx * 0.005;
      rotationRef.current.x += dy * 0.005;

      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = (e: MouseEvent) => {
      isDraggingRef.current = false;

      if (!hasDragged && onNodeClick) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left) * window.devicePixelRatio;
        const mouseY = (e.clientY - rect.top) * window.devicePixelRatio;

        for (const { node, x, y, radius } of projectedNodesRef.current) {
          const dx = mouseX - x;
          const dy = mouseY - y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < radius + 10) {
            onNodeClick(node);
            break;
          }
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomRef.current = Math.max(0.5, Math.min(8, zoomRef.current - e.deltaY * 0.001));
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
  }, [onNodeClick]);

  // Auto-rotate
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
