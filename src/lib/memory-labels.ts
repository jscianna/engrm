import type { MemoryKind } from "@/lib/types";

// User-friendly labels for memory types
export const memoryTypeLabels: Record<MemoryKind, string> = {
  episodic: "Event",
  semantic: "Fact",
  procedural: "How-to",
  "self-model": "Preference",
};

export function getMemoryTypeLabel(type: MemoryKind): string {
  return memoryTypeLabels[type] ?? type;
}
