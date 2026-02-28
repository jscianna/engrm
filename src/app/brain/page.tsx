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
  const zoomRef = useRef(4.5); // Large zoom for prominent brain visualization

  // Update nodes ref when nodes change
  useEffect(() => {
    nodesRef.current = nodes.map(n => ({ ...n }));
  }, [nodes]);

  // Physics simulation
  const simulate = useCallback(() => {
    const nodesCopy = nodesRef.current;
    const center = { x: 0, y: 0, z: 0 };
    const repulsion = 80;        // Reduced from 500
    const attraction = 0.003;    // Reduced from 0.01
    const damping = 0.85;        // More damping (was 0.95)
    const centerPull = 0.008;    // Stronger center pull (was 0.002)
    const maxVelocity = 2;       // Clamp velocity

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
        const minDist = 20; // Minimum distance to prevent explosion
        const safeDist = Math.max(dist, minDist);
        const force = repulsion / (safeDist * safeDist);
        node.vx += (dx / dist) * force * 0.01;
        node.vy += (dy / dist) * force * 0.01;
        node.vz += (dz / dist) * force * 0.01;
      }

      // Center pull (keeps graph centered)
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

    // Apply velocity with damping and clamping
    for (const node of nodesCopy) {
      node.vx *= damping;
      node.vy *= damping;
      node.vz *= damping;
      
      // Clamp velocity to prevent runaway
      node.vx = Math.max(-maxVelocity, Math.min(maxVelocity, node.vx));
      node.vy = Math.max(-maxVelocity, Math.min(maxVelocity, node.vy));
      node.vz = Math.max(-maxVelocity, Math.min(maxVelocity, node.vz));
      
      node.x += node.vx;
      node.y += node.vy;
      node.z += node.vz;
      
      // Soft boundary to keep nodes in view
      const maxRange = 80;
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
      const scale = Math.min(width, height) / 250 * zoomRef.current;

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

      // Draw nodes and store positions for click detection
      const clickableNodes: Array<{ node: MemoryNode; x: number; y: number; radius: number }> = [];
      
      for (const { node, proj } of projected) {
        const baseRadius = Math.max(2, node.radius * proj.scale * 0.8);
        const color = TYPE_COLORS[node.type] || "#22d3ee";
        
        // Store for click detection
        clickableNodes.push({ node, x: proj.x, y: proj.y, radius: baseRadius });
        
        // Subtle glow effect
        if (baseRadius > 3) {
          const gradient = ctx.createRadialGradient(
            proj.x, proj.y, 0,
            proj.x, proj.y, baseRadius * 2
          );
          gradient.addColorStop(0, `${color}30`);
          gradient.addColorStop(1, "transparent");
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, baseRadius * 2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Node
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, baseRadius, 0, Math.PI * 2);
        ctx.fill();

        // Inner highlight
        if (baseRadius > 3) {
          ctx.fillStyle = `${color}60`;
          ctx.beginPath();
          ctx.arc(proj.x - baseRadius * 0.2, proj.y - baseRadius * 0.2, baseRadius * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      
      // Store projected positions for click detection (reverse so front nodes checked first)
      projectedNodesRef.current = clickableNodes.reverse();

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
  // Store projected positions for click detection
  const projectedNodesRef = useRef<Array<{ node: MemoryNode; x: number; y: number; radius: number }>>([]);

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
      
      // Check if we've moved enough to count as a drag
      const totalDx = e.clientX - dragStartPos.x;
      const totalDy = e.clientY - dragStartPos.y;
      if (Math.abs(totalDx) > 5 || Math.abs(totalDy) > 5) {
        hasDragged = true;
      }
      
      rotationRef.current.y += dx * 0.005;
      rotationRef.current.x += dy * 0.005;
      
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = (e: MouseEvent) => {
      isDraggingRef.current = false;
      
      // If we didn't drag, check for node click
      if (!hasDragged) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left) * window.devicePixelRatio;
        const mouseY = (e.clientY - rect.top) * window.devicePixelRatio;
        
        // Check if we clicked on a node
        for (const { node, x, y, radius } of projectedNodesRef.current) {
          const dx = mouseX - x;
          const dy = mouseY - y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < radius + 10) { // Add some padding for easier clicking
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

    // Touch support for mobile
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDraggingRef.current = true;
        const touch = e.touches[0];
        dragStartPos = { x: touch.clientX, y: touch.clientY };
        hasDragged = false;
        lastMouseRef.current = { x: touch.clientX, y: touch.clientY };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current || e.touches.length !== 1) return;
      
      const touch = e.touches[0];
      const dx = touch.clientX - lastMouseRef.current.x;
      const dy = touch.clientY - lastMouseRef.current.y;
      
      const totalDx = touch.clientX - dragStartPos.x;
      const totalDy = touch.clientY - dragStartPos.y;
      if (Math.abs(totalDx) > 5 || Math.abs(totalDy) > 5) {
        hasDragged = true;
      }
      
      rotationRef.current.y += dx * 0.005;
      rotationRef.current.x += dy * 0.005;
      
      lastMouseRef.current = { x: touch.clientX, y: touch.clientY };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      isDraggingRef.current = false;
      
      if (!hasDragged && e.changedTouches.length === 1) {
        const touch = e.changedTouches[0];
        const rect = canvas.getBoundingClientRect();
        const touchX = (touch.clientX - rect.left) * window.devicePixelRatio;
        const touchY = (touch.clientY - rect.top) * window.devicePixelRatio;
        
        for (const { node, x, y, radius } of projectedNodesRef.current) {
          const dx = touchX - x;
          const dy = touchY - y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < radius + 20) { // Larger tap target for touch
            onNodeClick(node);
            break;
          }
        }
      }
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("mouseleave", handleMouseUp);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("touchstart", handleTouchStart, { passive: true });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: true });
    canvas.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("mouseleave", handleMouseUp);
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
    };
  }, [onNodeClick]);

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

// Demo memories - fictional example data for visualization (120+ nodes)
const DEMO_MEMORIES = [
  // Identity (fictional user "Alex Chen")
  { type: "identity", title: "Name is Alex Chen", importance: 0.95 },
  { type: "identity", title: "Senior Product Designer at TechCorp", importance: 0.9 },
  { type: "identity", title: "Based in Austin, Texas", importance: 0.8 },
  { type: "identity", title: "Birthday is March 15th", importance: 0.6 },
  { type: "identity", title: "Speaks English and Mandarin", importance: 0.7 },
  { type: "identity", title: "University of Texas alumni", importance: 0.5 },
  { type: "identity", title: "10 years in product design", importance: 0.8 },
  { type: "identity", title: "Remote worker since 2022", importance: 0.6 },
  { type: "identity", title: "Timezone is CST (UTC-6)", importance: 0.7 },
  { type: "identity", title: "Prefers they/them pronouns", importance: 0.8 },
  
  // Preferences (expanded)
  { type: "preference", title: "Morning standup at 9am CST", importance: 0.7 },
  { type: "preference", title: "Uses Figma for design work", importance: 0.9 },
  { type: "preference", title: "Likes bullet-point summaries", importance: 0.6 },
  { type: "preference", title: "Prefers Slack over email", importance: 0.7 },
  { type: "preference", title: "Tea over coffee", importance: 0.5 },
  { type: "preference", title: "Outdoor meetings when possible", importance: 0.4 },
  { type: "preference", title: "Dark mode in all applications", importance: 0.8 },
  { type: "preference", title: "Keyboard shortcuts over mouse", importance: 0.6 },
  { type: "preference", title: "Async communication preferred", importance: 0.7 },
  { type: "preference", title: "Lo-fi music while working", importance: 0.4 },
  { type: "preference", title: "Standing desk in afternoons", importance: 0.5 },
  { type: "preference", title: "No meetings on Wednesdays", importance: 0.8 },
  { type: "preference", title: "Notion for personal notes", importance: 0.6 },
  { type: "preference", title: "Linear for task tracking", importance: 0.7 },
  { type: "preference", title: "Weekly 1:1 on Thursdays", importance: 0.6 },
  
  // Facts (expanded)
  { type: "fact", title: "Project Horizon deadline: April 1st", importance: 0.95 },
  { type: "fact", title: "Design team has 5 members", importance: 0.6 },
  { type: "fact", title: "Q2 budget is $50,000", importance: 0.8 },
  { type: "fact", title: "Main competitor is DesignFlow", importance: 0.7 },
  { type: "fact", title: "Frontend uses React 19", importance: 0.6 },
  { type: "fact", title: "API rate limit is 1000/min", importance: 0.5 },
  { type: "fact", title: "Database is PostgreSQL 16", importance: 0.5 },
  { type: "fact", title: "Staging: staging.techcorp.io", importance: 0.6 },
  { type: "fact", title: "Production: app.techcorp.io", importance: 0.7 },
  { type: "fact", title: "AWS region is us-east-1", importance: 0.5 },
  { type: "fact", title: "Design system version 4.2", importance: 0.6 },
  { type: "fact", title: "Mobile app has 50k users", importance: 0.7 },
  { type: "fact", title: "NPS score is 72", importance: 0.6 },
  { type: "fact", title: "Churn rate at 3.2%", importance: 0.7 },
  { type: "fact", title: "Series B raised $25M", importance: 0.8 },
  { type: "fact", title: "Founded in 2019", importance: 0.5 },
  { type: "fact", title: "HQ in San Francisco", importance: 0.4 },
  { type: "fact", title: "120 employees total", importance: 0.5 },
  { type: "fact", title: "Engineering is 40 people", importance: 0.5 },
  { type: "fact", title: "Slack workspace: techcorp.slack.com", importance: 0.4 },
  
  // Events (expanded)
  { type: "event", title: "Q4 planning meeting completed", importance: 0.7 },
  { type: "event", title: "Project milestone achieved", importance: 0.8 },
  { type: "event", title: "Attended Config 2026", importance: 0.6 },
  { type: "event", title: "Fixed critical auth bug", importance: 0.9 },
  { type: "event", title: "Shipped v2.0 release", importance: 0.95 },
  { type: "event", title: "Team offsite in Denver", importance: 0.5 },
  { type: "event", title: "Design review approved", importance: 0.7 },
  { type: "event", title: "User research completed", importance: 0.8 },
  { type: "event", title: "A/B test concluded", importance: 0.6 },
  { type: "event", title: "Onboarded new designer", importance: 0.5 },
  { type: "event", title: "Presented at all-hands", importance: 0.7 },
  { type: "event", title: "Customer interview done", importance: 0.6 },
  { type: "event", title: "Shipped mobile redesign", importance: 0.8 },
  { type: "event", title: "Won design award", importance: 0.7 },
  { type: "event", title: "Launched dark mode", importance: 0.8 },
  { type: "event", title: "Performance review done", importance: 0.6 },
  { type: "event", title: "Budget approved for Q3", importance: 0.7 },
  { type: "event", title: "Accessibility audit passed", importance: 0.8 },
  
  // How-to (expanded)
  { type: "how_to", title: "Deploy: git push origin main", importance: 0.8 },
  { type: "how_to", title: "Reset password in settings", importance: 0.5 },
  { type: "how_to", title: "Create PR: branch → commit → push", importance: 0.7 },
  { type: "how_to", title: "Run tests: npm run test", importance: 0.6 },
  { type: "how_to", title: "Check logs: docker logs -f app", importance: 0.6 },
  { type: "how_to", title: "Connect DB: psql $DATABASE_URL", importance: 0.5 },
  { type: "how_to", title: "Update design tokens in Figma", importance: 0.7 },
  { type: "how_to", title: "Export assets: File → Export", importance: 0.5 },
  { type: "how_to", title: "Create prototype: P shortcut", importance: 0.6 },
  { type: "how_to", title: "Share design: Get link button", importance: 0.5 },
  { type: "how_to", title: "Request review in Linear", importance: 0.6 },
  { type: "how_to", title: "Schedule user interview", importance: 0.6 },
  { type: "how_to", title: "Submit expense report", importance: 0.4 },
  { type: "how_to", title: "Book meeting room via Calendly", importance: 0.4 },
  { type: "how_to", title: "Access VPN: connect to corp-vpn", importance: 0.6 },
  { type: "how_to", title: "File PTO in Workday", importance: 0.5 },
  
  // Constraints (expanded)
  { type: "constraint", title: "No deployments on Fridays", importance: 0.95 },
  { type: "constraint", title: "Max 1000 API calls per minute", importance: 0.8 },
  { type: "constraint", title: "Password minimum 12 characters", importance: 0.7 },
  { type: "constraint", title: "Code review required for merge", importance: 0.9 },
  { type: "constraint", title: "Use UTC for all timestamps", importance: 0.6 },
  { type: "constraint", title: "No PII in logs", importance: 0.9 },
  { type: "constraint", title: "WCAG 2.1 AA compliance", importance: 0.8 },
  { type: "constraint", title: "48-hour SLA for bug fixes", importance: 0.8 },
  { type: "constraint", title: "Two-factor auth required", importance: 0.9 },
  { type: "constraint", title: "Data retention: 7 years", importance: 0.7 },
  { type: "constraint", title: "GDPR compliant storage", importance: 0.9 },
  { type: "constraint", title: "Max 5MB image uploads", importance: 0.5 },
  { type: "constraint", title: "Support response within 4h", importance: 0.7 },
  { type: "constraint", title: "Weekly security scans", importance: 0.8 },
  
  // Relationships (expanded)
  { type: "relationship", title: "Works with design team", importance: 0.7 },
  { type: "relationship", title: "Reports to Sarah (VP Design)", importance: 0.8 },
  { type: "relationship", title: "Mentors Jamie (junior designer)", importance: 0.6 },
  { type: "relationship", title: "Collaborates with product team", importance: 0.7 },
  { type: "relationship", title: "Part of platform squad", importance: 0.6 },
  { type: "relationship", title: "Partners with Mike (eng lead)", importance: 0.7 },
  { type: "relationship", title: "Works with Lisa (PM)", importance: 0.8 },
  { type: "relationship", title: "Coordinates with QA team", importance: 0.5 },
  { type: "relationship", title: "Presents to exec team", importance: 0.6 },
  { type: "relationship", title: "Member of design guild", importance: 0.5 },
  { type: "relationship", title: "Slack DM with Tom (CEO)", importance: 0.7 },
  { type: "relationship", title: "Weekly sync with Karen (UXR)", importance: 0.6 },
  { type: "relationship", title: "Design system committee", importance: 0.6 },
  { type: "relationship", title: "Hiring committee member", importance: 0.5 },
  { type: "relationship", title: "Buddies with new hires", importance: 0.4 },
];

function generateDemoData(): { nodes: MemoryNode[]; edges: MemoryEdge[] } {
  const nodes: MemoryNode[] = [];
  const edges: MemoryEdge[] = [];

  // Create nodes from demo memories - spread out for visibility
  DEMO_MEMORIES.forEach((mem, i) => {
    // Arrange in a sphere-like distribution
    const phi = Math.acos(-1 + (2 * i) / DEMO_MEMORIES.length);
    const theta = Math.sqrt(DEMO_MEMORIES.length * Math.PI) * phi;
    const radius = 80 + Math.random() * 60; // Large spread for 120+ nodes
    
    nodes.push({
      id: `mem_${i}`,
      x: radius * Math.sin(phi) * Math.cos(theta),
      y: radius * Math.sin(phi) * Math.sin(theta),
      z: radius * Math.cos(phi),
      vx: 0,
      vy: 0,
      vz: 0,
      type: mem.type,
      strength: 0.5 + Math.random() * 0.5,
      importance: mem.importance,
      title: mem.title,
      radius: 3 + mem.importance * 5,
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
  const [selectedNode, setSelectedNode] = useState<MemoryNode | null>(null);
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
            <Link href="/" className="text-xl font-bold">Engrm</Link>
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
          onNodeClick={setSelectedNode}
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
          Drag to rotate • Scroll to zoom • Click nodes for details
        </div>
      </div>

      {/* Selected Node Detail Panel */}
      {selectedNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setSelectedNode(null)}>
          <div 
            className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div 
                  className="w-4 h-4 rounded-full" 
                  style={{ backgroundColor: TYPE_COLORS[selectedNode.type] || "#22d3ee" }} 
                />
                <span className="text-sm font-mono text-zinc-400 capitalize">{selectedNode.type.replace("_", " ")}</span>
              </div>
              <button 
                onClick={() => setSelectedNode(null)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <h3 className="text-xl font-semibold text-white mb-4">{selectedNode.title}</h3>
            
            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-zinc-800/50 rounded-lg p-3">
                <div className="text-xs text-zinc-500 mb-1">Strength</div>
                <div className="text-lg font-mono text-cyan-400">{Math.round(selectedNode.strength * 100)}%</div>
                <div className="h-1 bg-zinc-700 rounded-full mt-2">
                  <div 
                    className="h-full bg-cyan-500 rounded-full" 
                    style={{ width: `${selectedNode.strength * 100}%` }} 
                  />
                </div>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-3">
                <div className="text-xs text-zinc-500 mb-1">Importance</div>
                <div className="text-lg font-mono text-amber-400">{Math.round(selectedNode.importance * 100)}%</div>
                <div className="h-1 bg-zinc-700 rounded-full mt-2">
                  <div 
                    className="h-full bg-amber-500 rounded-full" 
                    style={{ width: `${selectedNode.importance * 100}%` }} 
                  />
                </div>
              </div>
            </div>

            {/* Connections info */}
            <div className="bg-zinc-800/50 rounded-lg p-3 mb-4">
              <div className="text-xs text-zinc-500 mb-2">Connected Memories</div>
              <div className="text-sm text-zinc-300">
                {edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id).length} connections
              </div>
            </div>

            {/* Demo note */}
            <div className="text-xs text-zinc-600 text-center">
              This is demo data • Sign in to see your real memories
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
