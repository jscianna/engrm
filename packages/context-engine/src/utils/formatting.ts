/**
 * Memory formatting utilities
 */

import type { Memory, SynthesizedMemory, SearchResult } from "../types.js";

/**
 * Format memories for system prompt injection
 */
export function formatMemoriesForInjection(
  memories: Memory[],
  syntheses?: SynthesizedMemory[]
): string {
  if (!memories.length && !syntheses?.length) {
    return "";
  }

  const lines: string[] = [];
  lines.push("# Agent Memory (FatHippo)");
  lines.push("");

  // Critical principles (synthesized) first
  if (syntheses?.length) {
    lines.push("## Core Principles");
    for (const s of syntheses) {
      lines.push(`- **${s.title}**: ${s.content}`);
    }
    lines.push("");
  }

  // Group memories by importance tier
  const critical = memories.filter((m) => m.importanceTier === "critical");
  const high = memories.filter((m) => m.importanceTier === "high");
  const normal = memories.filter(
    (m) => m.importanceTier === "normal" || !m.importanceTier
  );

  if (critical.length) {
    lines.push("## Critical Context");
    for (const m of critical) {
      lines.push(`- ${m.title || m.content.slice(0, 100)}`);
      if (m.title && m.content !== m.title) {
        lines.push(`  ${m.content.slice(0, 200)}${m.content.length > 200 ? "..." : ""}`);
      }
    }
    lines.push("");
  }

  if (high.length) {
    lines.push("## Important Context");
    for (const m of high) {
      lines.push(`- ${m.title || m.content.slice(0, 100)}`);
    }
    lines.push("");
  }

  if (normal.length) {
    lines.push("## Relevant Context");
    for (const m of normal) {
      lines.push(`- ${m.title || m.content.slice(0, 80)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format search results for injection
 */
export function formatSearchResults(results: SearchResult[]): string {
  if (!results.length) return "";

  const lines: string[] = [];
  lines.push("## Relevant Memories");

  for (const r of results) {
    const m = r.memory;
    const confidence = Math.round(r.score * 100);
    lines.push(`- [${confidence}%] ${m.title || m.content.slice(0, 80)}`);
  }

  return lines.join("\n");
}

/**
 * Deduplicate memories by ID
 */
export function dedupeMemories(memories: Memory[]): Memory[] {
  const seen = new Set<string>();
  return memories.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

/**
 * Estimate token count for text (rough approximation)
 */
export function estimateTokens(text: string): number {
  // Rough approximation: ~4 chars per token for English
  return Math.ceil(text.length / 4);
}
