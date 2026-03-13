/**
 * Context Injection Endpoint
 * 
 * Returns tiered memories for session start:
 * - All 'critical' memories (core principles, always injected)
 * - 'working' tier: synthetic summaries of related high memories (when synthesize=true)
 * - Top N 'high' memories matching the query (if relevant)
 * 
 * Tier hierarchy: critical > working > high > normal
 * 
 * Usage: Call once at session start with first user message
 */

import { embedQuery } from "@/lib/embeddings";
import { semanticSearchVectors } from "@/lib/qdrant";
import {
  filterSensitiveMemories,
  getCriticalMemories,
  getAgentMemoriesByIds,
  getHighTierMemories,
  listCriticalSynthesizedMemories,
} from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { FatHippoError, errorResponse } from "@/lib/errors";
import { isObject } from "@/lib/api-v1";
import { countEntityOverlap } from "@/lib/entities";
import { recordInjectionEvent } from "@/lib/memory-analytics";

export const runtime = "nodejs";

// Minimum number of high memories to trigger synthesis
const SYNTHESIS_THRESHOLD = 5;

type FormattedMemory = {
  id: string;
  title: string;
  text: string;
  type: string;
  tier: string;
  createdAt: string;
  synthesizedFrom?: string[];
};

type SynthesizedMemory = {
  id: string;
  title: string;
  text: string;
  synthesizedFrom: string[];
  tier: "working";
};

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "context");
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body)) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "body", reason: "required" });
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    const includeHigh = body.includeHigh !== false; // default true
    const highLimit = typeof body.highLimit === "number" ? Math.min(body.highLimit, 10) : 5;
    const synthesize = body.synthesize === true; // default false

    // 1. Always get critical memories
    const criticalMemories = filterSensitiveMemories(
      await getCriticalMemories(identity.userId, {
        excludeCompleted: true,
        excludeAbsorbed: true,
      }),
    );
    const criticalSyntheses = await listCriticalSynthesizedMemories(identity.userId, 8);
    const synthesizedAsCritical = criticalSyntheses.map((synthesis) => ({
      id: synthesis.id,
      title: synthesis.title,
      text: synthesis.synthesis,
      memoryType: "semantic",
      importanceTier: "critical",
      createdAt: synthesis.synthesizedAt,
    }));
    const criticalForInjection = [...synthesizedAsCritical, ...criticalMemories];

    // 2. If message provided and includeHigh, search for relevant high-importance memories
    let highMemories: typeof criticalMemories = [];
    
    if (message && includeHigh) {
      const vector = await embedQuery(message);
      const hits = await semanticSearchVectors({
        userId: identity.userId,
        query: message,
        vector,
        topK: highLimit * 5, // Get more, filter by tier in code
      });

      if (hits.length > 0) {
        const memories = filterSensitiveMemories(await getAgentMemoriesByIds({
          userId: identity.userId,
          ids: hits.map((hit) => hit.item.id),
          excludeAbsorbed: true,
        }));
        
        // Filter to high tier and limit
        highMemories = memories
          .filter((m) => m.importanceTier === "high")
          .slice(0, highLimit);
      }
    }

    // 3. Deduplicate (in case a critical memory also matched)
    const criticalIds = new Set(criticalForInjection.map((m) => m.id));
    let dedupedHigh = highMemories.filter((m) => !criticalIds.has(m.id));

    // 4. Handle synthesis of high memories into working tier
    let workingMemories: SynthesizedMemory[] = [];
    
    if (synthesize && dedupedHigh.length >= SYNTHESIS_THRESHOLD) {
      // Get all high-tier memories for grouping
      const allHighMemories = filterSensitiveMemories(
        await getHighTierMemories(identity.userId, { excludeAbsorbed: true }),
      );
      const filteredHigh = allHighMemories.filter((m) => !criticalIds.has(m.id));
      
      if (filteredHigh.length >= SYNTHESIS_THRESHOLD) {
        // Group related memories by entity overlap
        const groups = groupMemoriesByEntityOverlap(filteredHigh);
        
        // Synthesize each group into a working-tier summary
        workingMemories = groups.map((group, index) => synthesizeGroup(group, index));
        
        // Clear high memories since they're now synthesized
        dedupedHigh = [];
      }
    }

    // 5. Format response
    const response = {
      critical: criticalForInjection.map(formatMemory),
      working: workingMemories.map(formatSynthesizedMemory),
      high: dedupedHigh.map(formatMemory),
      stats: {
        criticalCount: criticalForInjection.length,
        workingCount: workingMemories.length,
        highCount: dedupedHigh.length,
        synthesized: workingMemories.length > 0,
        totalTokensEstimate: 
          estimateTokens(criticalForInjection) + 
          estimateTokensFromSynthesized(workingMemories) +
          estimateTokens(dedupedHigh),
      },
    };

    const injectedMemoryIds = Array.from(
      new Set([
        ...criticalForInjection.map((memory) => memory.id),
        ...dedupedHigh.map((memory) => memory.id),
        ...workingMemories.flatMap((memory) => memory.synthesizedFrom),
      ]),
    );

    if (injectedMemoryIds.length > 0) {
      recordInjectionEvent({
        userId: identity.userId,
        memoryIds: injectedMemoryIds,
        resultCount: injectedMemoryIds.length,
        conversationId: null,
      }).catch(() => {});
    }

    return Response.json(response);
  } catch (error) {
    return errorResponse(error);
  }
}

function formatMemory(memory: { id: string; title: string; text: string; memoryType: string; importanceTier?: string; createdAt: string }): FormattedMemory {
  return {
    id: memory.id,
    title: memory.title,
    text: memory.text,
    type: memory.memoryType,
    tier: memory.importanceTier || "normal",
    createdAt: memory.createdAt,
  };
}

function formatSynthesizedMemory(memory: SynthesizedMemory): FormattedMemory {
  return {
    id: memory.id,
    title: memory.title,
    text: memory.text,
    type: "synthesized",
    tier: memory.tier,
    createdAt: new Date().toISOString(),
    synthesizedFrom: memory.synthesizedFrom,
  };
}

function estimateTokens(memories: { text: string }[]): number {
  // Rough estimate: 4 chars per token
  return Math.ceil(memories.reduce((sum, m) => sum + m.text.length, 0) / 4);
}

function estimateTokensFromSynthesized(memories: SynthesizedMemory[]): number {
  return Math.ceil(memories.reduce((sum, m) => sum + m.text.length, 0) / 4);
}

/**
 * Group memories by entity overlap.
 * Memories sharing entities are grouped together.
 */
function groupMemoriesByEntityOverlap(
  memories: Array<{ id: string; title: string; text: string; entities: string[] }>
): Array<Array<typeof memories[number]>> {
  if (memories.length === 0) return [];

  const groups: Array<Array<typeof memories[number]>> = [];
  const assigned = new Set<string>();

  for (const memory of memories) {
    if (assigned.has(memory.id)) continue;

    // Start a new group with this memory
    const group = [memory];
    assigned.add(memory.id);

    // Find other memories with overlapping entities
    for (const other of memories) {
      if (assigned.has(other.id)) continue;
      
      // Check entity overlap with any memory already in the group
      const hasOverlap = group.some(
        (m) => countEntityOverlap(m.entities, other.entities) >= 1
      );
      
      if (hasOverlap) {
        group.push(other);
        assigned.add(other.id);
      }
    }

    groups.push(group);
  }

  return groups;
}

/**
 * Synthesize a group of memories into a single working-tier summary.
 * Uses simple concatenation with truncation (no LLM needed).
 */
function synthesizeGroup(
  memories: Array<{ id: string; title: string; text: string }>,
  groupIndex: number
): SynthesizedMemory {
  // Combine titles (truncated)
  const titles = memories.map((m) => m.title).join(", ");
  const truncatedTitles = titles.length > 60 ? titles.slice(0, 57) + "..." : titles;
  
  // Combine text snippets with separator
  const combinedText = memories
    .map((m) => m.text.slice(0, 200))
    .join(" | ");
  const truncatedText = combinedText.length > 500 ? combinedText.slice(0, 497) + "..." : combinedText;

  return {
    id: `synth_${groupIndex}_${Date.now()}`,
    title: `Summary: ${truncatedTitles}`,
    text: truncatedText,
    synthesizedFrom: memories.map((m) => m.id),
    tier: "working",
  };
}
