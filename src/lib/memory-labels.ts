import type { MemoryKind } from "@/lib/types";

// User-friendly labels for memory types
export const memoryTypeLabels: Record<MemoryKind, string> = {
  // Legacy types (still supported)
  episodic: "Event",
  semantic: "Fact",
  procedural: "How-to",
  "self-model": "Preference",
  reflected: "Reflected",
  session_summary: "Session Summary",
  compacted: "Compacted",
  // New types from auto-memory spec v2
  constraint: "Constraint",
  identity: "Identity",
  relationship: "Relationship",
  preference: "Preference",
  how_to: "How-to",
  fact: "Fact",
  event: "Event",
  // Enhanced classification types
  belief: "Belief",
  decision: "Decision",
};

// Color scheme for memory types (used in cards and graph)
export const memoryTypeColors: Record<MemoryKind, string> = {
  // Legacy types
  episodic: "#22c55e",      // green (maps to fact/event)
  semantic: "#22c55e",      // green (maps to fact)
  procedural: "#3b82f6",    // blue (maps to preference)
  "self-model": "#a855f7",  // purple (maps to identity)
  reflected: "#6b7280",     // gray
  session_summary: "#6b7280", // gray
  compacted: "#6b7280",     // gray
  // Core classification types
  identity: "#a855f7",      // purple
  preference: "#3b82f6",    // blue
  belief: "#06b6d4",        // cyan
  decision: "#f59e0b",      // amber
  fact: "#22c55e",          // green
  // Supporting types
  constraint: "#ef4444",    // red (constraints are important/restrictive)
  relationship: "#a855f7",  // purple (identity-adjacent)
  how_to: "#3b82f6",        // blue (preference-adjacent)
  event: "#22c55e",         // green (fact-adjacent)
};

export function getMemoryTypeLabel(type: MemoryKind): string {
  return memoryTypeLabels[type] ?? type;
}

export function getMemoryTypeColor(type: MemoryKind): string {
  return memoryTypeColors[type] ?? "#6b7280";
}
