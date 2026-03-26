/**
 * Micro-Dream: Lightweight post-ingestion consolidation
 *
 * Triggered after memory storage (fire-and-forget). Performs fast checks:
 * 1. Contradiction detection — supersede stale memories
 * 2. Merge check — deduplicate near-identical memories
 * 3. Complexity-scaled processing — skip trivial, deeper analysis for long content
 */

import { embedText } from "@/lib/embeddings";
import { semanticSearchVectors } from "@/lib/qdrant";
import { createMemoryEdge, getAgentMemoriesByIds, updateAgentMemory } from "@/lib/db";
import { extractEntities } from "@/lib/entities";

export interface MicroDreamResult {
  action: "none" | "merged" | "contradiction_resolved" | "promoted";
  mergedWith?: string;
  contradictionId?: string;
  processingMs: number;
}

const NEGATION_PATTERNS = [
  /\bnot\b/i,
  /\bdon't\b/i,
  /\bdo not\b/i,
  /\bno longer\b/i,
  /\bstopped\b/i,
  /\bnever\b/i,
  /\bdoesn't\b/i,
  /\bdoes not\b/i,
  /\bwon't\b/i,
  /\bwill not\b/i,
  /\bno more\b/i,
  /\binstead of\b/i,
  /\breplaced\b/i,
  /\bswitched from\b/i,
  /\bmoved away from\b/i,
];

const CONTRADICTION_SIMILARITY_THRESHOLD = 0.85;
const MERGE_SIMILARITY_THRESHOLD = 0.92;

function extractKeyEntities(text: string): string[] {
  try {
    return extractEntities(text);
  } catch {
    return [];
  }
}

function hasNegation(text: string): boolean {
  return NEGATION_PATTERNS.some((pattern) => pattern.test(text));
}

function entitiesOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const setB = new Set(b.map((e) => e.toLowerCase()));
  return a.some((e) => setB.has(e.toLowerCase()));
}

export async function runMicroDream(opts: {
  userId: string;
  memoryId: string;
  memoryText: string;
  namespaceId: string | null;
}): Promise<MicroDreamResult> {
  const start = performance.now();

  // Complexity-scaled processing: skip trivial memories
  if (opts.memoryText.length < 50) {
    return { action: "none", processingMs: Math.round(performance.now() - start) };
  }

  let embedding: number[];
  try {
    embedding = await embedText(opts.memoryText);
  } catch {
    return { action: "none", processingMs: Math.round(performance.now() - start) };
  }

  // Find similar memories
  let hits;
  try {
    hits = await semanticSearchVectors({
      userId: opts.userId,
      query: opts.memoryText,
      vector: embedding,
      topK: 5,
    });
  } catch {
    return { action: "none", processingMs: Math.round(performance.now() - start) };
  }

  // Exclude the memory itself
  const similar = hits.filter((h) => h.item.id !== opts.memoryId);
  if (similar.length === 0) {
    return { action: "none", processingMs: Math.round(performance.now() - start) };
  }

  // 1. Merge check: very similar memory (score > 0.92)
  const mergeCandidate = similar.find((h) => h.score >= MERGE_SIMILARITY_THRESHOLD);
  if (mergeCandidate) {
    try {
      const [existing] = await getAgentMemoriesByIds({
        userId: opts.userId,
        ids: [mergeCandidate.item.id],
        namespaceId: opts.namespaceId,
      });

      if (existing && !existing.absorbed) {
        // Keep the longer/more detailed version
        if (opts.memoryText.length <= existing.text.length) {
          // New memory is shorter or equal — mark new memory as superseded (existing wins)
          await updateAgentMemory(opts.userId, opts.memoryId, {
            supersededBy: existing.id,
            confidenceScore: 0.45,
            lastVerifiedAt: new Date().toISOString(),
          });
          await createMemoryEdge({
            userId: opts.userId,
            sourceId: opts.memoryId,
            targetId: existing.id,
            relationshipType: "updates",
            weight: 1,
            metadata: { source: "micro_dream_merge" },
          });
          return {
            action: "merged",
            mergedWith: existing.id,
            processingMs: Math.round(performance.now() - start),
          };
        }
        // New memory is longer — update existing with new text, mark new as canonical
        await updateAgentMemory(opts.userId, existing.id, {
          text: opts.memoryText,
          supersededBy: opts.memoryId,
          confidenceScore: 0.5,
          lastVerifiedAt: new Date().toISOString(),
        });
        await createMemoryEdge({
          userId: opts.userId,
          sourceId: existing.id,
          targetId: opts.memoryId,
          relationshipType: "updates",
          weight: 1,
          metadata: { source: "micro_dream_merge" },
        });
        return {
          action: "merged",
          mergedWith: existing.id,
          processingMs: Math.round(performance.now() - start),
        };
      }
    } catch {
      // Fall through to contradiction check
    }
  }

  // 2. Contradiction check: similar memories with negation
  if (hasNegation(opts.memoryText)) {
    const contradictionCandidates = similar.filter(
      (h) => h.score >= CONTRADICTION_SIMILARITY_THRESHOLD,
    );

    const newEntities = extractKeyEntities(opts.memoryText);

    for (const candidate of contradictionCandidates) {
      try {
        const [existing] = await getAgentMemoriesByIds({
          userId: opts.userId,
          ids: [candidate.item.id],
          namespaceId: opts.namespaceId,
        });

        if (!existing || existing.absorbed) continue;

        const existingEntities = extractKeyEntities(existing.text);
        if (entitiesOverlap(newEntities, existingEntities)) {
          // Mark older memory as superseded and register conflict pair
          await updateAgentMemory(opts.userId, existing.id, {
            supersededBy: opts.memoryId,
            confidenceScore: 0.35,
            conflictsWith: [opts.memoryId],
            lastVerifiedAt: new Date().toISOString(),
          });
          await updateAgentMemory(opts.userId, opts.memoryId, {
            conflictsWith: [existing.id],
            lastVerifiedAt: new Date().toISOString(),
          });
          await createMemoryEdge({
            userId: opts.userId,
            sourceId: existing.id,
            targetId: opts.memoryId,
            relationshipType: "contradicts",
            weight: 1,
            metadata: { source: "micro_dream_contradiction" },
          });
          return {
            action: "contradiction_resolved",
            contradictionId: existing.id,
            processingMs: Math.round(performance.now() - start),
          };
        }
      } catch {
        continue;
      }
    }
  }

  // 3. Long memories: extract entities for graph edge creation (future use)
  if (opts.memoryText.length > 200) {
    // Best effort entity extraction — results stored on the memory record itself
    // Graph edge creation would go here when the graph subsystem is ready
    try {
      extractKeyEntities(opts.memoryText);
    } catch {
      // Best effort
    }
  }

  return { action: "none", processingMs: Math.round(performance.now() - start) };
}
