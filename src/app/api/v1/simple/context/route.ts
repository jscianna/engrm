/**
 * Simple Context Endpoint
 * 
 * Get formatted context string ready to inject into prompts.
 * Returns human-readable text, not JSON.
 */

import { embedText } from "@/lib/embeddings";
import { semanticSearchVectors } from "@/lib/qdrant";
import { bm25Search, rrfFusion, ensureFtsInitialized } from "@/lib/fts";
import { 
  filterSensitiveMemories,
  getCriticalMemories, 
  getAgentMemoriesByIds,
  incrementAccessCounts,
  listCriticalSynthesizedMemories,
  logRetrievalEvaluation,
} from "@/lib/db";
import { recordInjectionEvent } from "@/lib/memory-analytics";
import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { isObject } from "@/lib/api-v1";
import { detectSecretQueryIntent, VAULT_HINT_MESSAGE } from "@/lib/secrets";
import { expandQuery, detectQueryIntent, mergeExpandedResults } from "@/lib/query-expansion";
import { calculateTypeBoost, type MemoryType } from "@/lib/memory-classifier";

export const runtime = "nodejs";

const TRIVIAL_ACKS = new Set([
  "ok",
  "thanks",
  "yes",
  "no",
  "sure",
  "cool",
  "nice",
  "got it",
  "k",
  "ty",
  "thx",
]);

// Default retrieval parameters (can be overridden via request body for testing)
// Tuned via autoresearch: sim=0.55 + topK=40 yields 84% MRR (vs 20% with old defaults)
const DEFAULT_MIN_VECTOR_SIMILARITY = 0.55;
const DEFAULT_MIN_CRITICAL_RELEVANCE = 0.5;
const DEFAULT_VECTOR_TOPK = 40;
const DEFAULT_RRF_K = 60;
const DEFAULT_BM25_WEIGHT = 1.2;

function isTrivialQuery(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) {
    return true;
  }

  if (trimmed.length < 3) {
    return true;
  }

  const normalized = trimmed.toLowerCase().replace(/\s+/g, " ");
  if (TRIVIAL_ACKS.has(normalized)) {
    return true;
  }

  if (/^[\p{P}\s]+$/u.test(trimmed)) {
    return true;
  }

  if (/^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\u200D|\uFE0F|\s)+$/u.test(trimmed)) {
    return true;
  }

  return false;
}

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "simple.context");
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body)) {
      throw new MemryError("VALIDATION_ERROR", { field: "body", reason: "Invalid request body" });
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
    const trivialQuery = isTrivialQuery(message);

    if (!message || trivialQuery) {
      return new Response("", {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    const secretQuery = detectSecretQueryIntent(message);
    if (secretQuery.isSecretQuery) {
      return Response.json({
        vault_hint: VAULT_HINT_MESSAGE,
        matched_categories: secretQuery.matchedCategories,
      });
    }
    
    // Limits for context window efficiency (default: 5 critical + 5 relevant = 10 total)
    const maxCritical = typeof body.maxCritical === "number" ? Math.min(body.maxCritical, 10) : 5;
    const maxRelevant = typeof body.maxRelevant === "number" ? Math.min(body.maxRelevant, 10) : 5;

    // Retrieval tuning params (for autoresearch experiments)
    const minVectorSimilarity = typeof body.minVectorSimilarity === "number" 
      ? Math.max(0.3, Math.min(0.95, body.minVectorSimilarity)) 
      : DEFAULT_MIN_VECTOR_SIMILARITY;
    const minCriticalRelevance = typeof body.minCriticalRelevance === "number"
      ? Math.max(0.3, Math.min(0.95, body.minCriticalRelevance))
      : DEFAULT_MIN_CRITICAL_RELEVANCE;
    const vectorTopK = typeof body.vectorTopK === "number"
      ? Math.max(5, Math.min(100, body.vectorTopK))
      : DEFAULT_VECTOR_TOPK;
    const rrfK = typeof body.rrfK === "number"
      ? Math.max(10, Math.min(200, body.rrfK))
      : DEFAULT_RRF_K;
    const bm25Weight = typeof body.bm25Weight === "number"
      ? Math.max(0.1, Math.min(5.0, body.bm25Weight))
      : DEFAULT_BM25_WEIGHT;
    
    // Type boost factor for intent-matched memories (1.0 = no boost, 1.3 = 30% boost)
    const typeBoostFactor = typeof body.typeBoostFactor === "number"
      ? Math.max(1.0, Math.min(2.0, body.typeBoostFactor))
      : 1.3; // Default: 30% boost for type match

    // Get critical memories
    const allCriticalMemories = filterSensitiveMemories(
      await getCriticalMemories(identity.userId, {
        excludeCompleted: true,
        excludeAbsorbed: true,
      }),
    );
    const criticalSyntheses = await listCriticalSynthesizedMemories(identity.userId, maxCritical);
    const synthesizedCritical = criticalSyntheses.map((synthesis) => ({
      id: synthesis.id,
      userId: synthesis.userId,
      title: synthesis.title,
      text: synthesis.synthesis,
      sourceType: "text" as const,
      memoryType: "semantic" as const,
      importanceTier: "critical" as const,
      sourceUrl: null,
      fileName: null,
      metadata: null,
      namespaceId: null,
      sessionId: null,
      entities: [],
      feedbackScore: 0,
      accessCount: synthesis.accessCount,
      sensitive: false,
      createdAt: synthesis.synthesizedAt,
    }));
    const allCritical = [...synthesizedCritical, ...allCriticalMemories];
    const criticalById = new Map(allCritical.map((memory) => [memory.id, memory]));
    
    // Rank critical memories by relevance and only inject when relevant.
    let criticalMemories: typeof allCritical = [];
    if (allCritical.length > 0 && maxCritical > 0) {
      const vector = await embedText(message);
      const criticalHits = await semanticSearchVectors({
        userId: identity.userId,
        query: message,
        vector,
        topK: maxCritical * 2,
      });
      
      criticalMemories = criticalHits
        .filter((h) => h.score > minCriticalRelevance)
        .map((h) => criticalById.get(h.item.id) ?? null)
        .filter((memory): memory is NonNullable<typeof memory> => Boolean(memory))
        .slice(0, maxCritical);
    }

    // Get relevant memories based on message (hybrid: vector + BM25)
    // Use query expansion for decision/technical queries to improve recall
    let relevantMemories: typeof criticalMemories = [];
    try {
      const queryIntent = detectQueryIntent(message);
      const queries = queryIntent !== 'general' ? expandQuery(message) : [message];
      
      // Run searches for all query variants in parallel
      const allSearchResults = await Promise.all(
        queries.map(async (queryText) => {
          const [vectorResults, bm25Results] = await Promise.all([
            (async () => {
              const vector = await embedText(queryText);
              const hits = await semanticSearchVectors({
                userId: identity.userId,
                query: queryText,
                vector,
                topK: vectorTopK,
              });
              return hits
                .map((h) => ({ id: h.item.id, score: h.score }))
                .filter((h) => h.score >= minVectorSimilarity);
            })(),
            (async () => {
              try {
                await ensureFtsInitialized();
                return await bm25Search({
                  userId: identity.userId,
                  query: queryText,
                  topK: vectorTopK,
                });
              } catch {
                return []; // FTS not ready
              }
            })(),
          ]);
          return { vectorResults, bm25Results };
        })
      );
      
      // Merge results from all query variants
      const allVectorResults = mergeExpandedResults(
        allSearchResults.map((r) => r.vectorResults)
      );
      const allBm25Results = allSearchResults.flatMap((r) => r.bm25Results);
      const vectorResults = allVectorResults;
      const bm25Results = allBm25Results;

      // Combine with RRF fusion, allowing BM25-only rescues for exact lexical matches.
      let memoryIds: string[] = [];
      if (vectorResults.length > 0 && bm25Results.length > 0) {
        const fused = rrfFusion(vectorResults, bm25Results, {
          k: rrfK,
          bm25Weight: bm25Weight,
        });
        memoryIds = fused.map((r) => r.memoryId).slice(0, 10);
      } else if (vectorResults.length > 0) {
        memoryIds = vectorResults.slice(0, 10).map((r) => r.id);
      } else if (bm25Results.length > 0) {
        memoryIds = bm25Results.slice(0, 10).map((r) => r.memoryId);
      }

      if (memoryIds.length > 0) {
        const memories = filterSensitiveMemories(await getAgentMemoriesByIds({
          userId: identity.userId,
          ids: memoryIds,
          excludeAbsorbed: true,
        }));

        relevantMemories = memories.filter(
          (m) => m.importanceTier === "high" || m.importanceTier === "normal"
        );

        // Apply type-based boost when query intent matches memory type
        if (queryIntent !== 'general' && relevantMemories.length > 1 && typeBoostFactor > 1.0) {
          // Score each memory based on type match (tunable via typeBoostFactor)
          const scoredMemories = relevantMemories.map((m, originalIndex) => {
            // Get classified type from metadata if available
            const metadata = m.metadata as Record<string, unknown> | null;
            const classifiedType = (metadata?.classified as Record<string, unknown>)?.type as MemoryType | undefined;
            
            // Calculate boost: apply typeBoostFactor if memory type matches query intent
            let boost = 1.0;
            if (classifiedType) {
              const baseBoost = calculateTypeBoost(queryIntent, classifiedType);
              // Scale the boost by the tunable factor (baseBoost is 1.0-1.3, we scale proportionally)
              boost = baseBoost > 1.0 ? 1.0 + (baseBoost - 1.0) * (typeBoostFactor / 1.3) : 1.0;
            }
            
            return { memory: m, score: boost * (1 / (originalIndex + 1)), originalIndex };
          });
          
          // Re-sort by boosted score
          scoredMemories.sort((a, b) => b.score - a.score);
          relevantMemories = scoredMemories.map((s) => s.memory);
        }

        // Track access
        const accessedIds = memories.map((m) => m.id);
        incrementAccessCounts(identity.userId, accessedIds).catch(() => {});
      }
    } catch {
      // Search failed, continue with critical only
    }

    // Dedupe and limit relevant memories
    const criticalIds = new Set(criticalMemories.map((m) => m.id));
    const dedupedRelevant = relevantMemories
      .filter((m) => !criticalIds.has(m.id))
      .slice(0, maxRelevant);

    // Build formatted context string
    const lines: string[] = [];
    
    if (criticalMemories.length > 0 || dedupedRelevant.length > 0) {
      lines.push("Here's what you know about this user:");
      lines.push("");
    }

    // Add critical memories
    if (criticalMemories.length > 0) {
      lines.push("## Core Information");
      for (const m of criticalMemories) {
        lines.push(`- ${m.text}`);
      }
      lines.push("");
    }

    // Add relevant memories
    if (dedupedRelevant.length > 0) {
      lines.push("## Relevant Context");
      for (const m of dedupedRelevant) {
        lines.push(`- ${m.text}`);
      }
      lines.push("");
    }

    // Add instruction if we have context
    if (lines.length > 0) {
      lines.push("Use this context to personalize your responses.");
    }

    const context = lines.join("\n");

    // Record injection event for analytics (non-blocking)
    const allInjectedIds = [
      ...criticalMemories.map((m) => m.id),
      ...dedupedRelevant.map((m) => m.id),
    ];
    const evaluation = await logRetrievalEvaluation({
      userId: identity.userId,
      query: message,
      endpoint: "/api/v1/simple/context",
      sessionId: conversationId ?? null,
      candidateIds: allInjectedIds,
    });
    if (allInjectedIds.length > 0) {
      recordInjectionEvent({
        userId: identity.userId,
        memoryIds: allInjectedIds,
        resultCount: allInjectedIds.length,
        conversationId: conversationId ?? undefined,
      }).catch(() => {});
    }

    // Return as plain text with content-type header
    return new Response(context, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        ...(evaluation ? { "X-FatHippo-Eval-Id": evaluation.id } : {}),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
