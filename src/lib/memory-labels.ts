import type { MemoryKind } from "@/lib/types";

// User-friendly labels for memory types
export const memoryTypeLabels: Record<MemoryKind, string> = {
  // Legacy types (still supported)
  episodic: "Event",
  semantic: "Fact",
  procedural: "How-to",
  "self-model": "Preference",
  // New types from auto-memory spec v2
  constraint: "Constraint",
  identity: "Identity",
  relationship: "Relationship",
  preference: "Preference",
  how_to: "How-to",
  fact: "Fact",
  event: "Event",
};

export function getMemoryTypeLabel(type: MemoryKind): string {
  return memoryTypeLabels[type] ?? type;
}
