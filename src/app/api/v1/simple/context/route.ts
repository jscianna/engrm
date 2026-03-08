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
} from "@/lib/db";
import { recordInjectionEvent } from "@/lib/memory-analytics";
import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { isObject } from "@/lib/api-v1";
import { detectSecretQueryIntent, VAULT_HINT_MESSAGE } from "@/lib/secrets";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "simple.context");
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body)) {
      throw new MemryError("VALIDATION_ERROR", { field: "body", reason: "Invalid request body" });
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;

    if (message) {
      const secretQuery = detectSecretQueryIntent(message);
      if (secretQuery.isSecretQuery) {
        return Response.json({
          vault_hint: VAULT_HINT_MESSAGE,
          matched_categories: secretQuery.matchedCategories,
        });
      }
    }
    
    // Limits for context window efficiency (default: 5 critical + 5 relevant = 10 total)
    const maxCritical = typeof body.maxCritical === "number" ? Math.min(body.maxCritical, 10) : 5;
    const maxRelevant = typeof body.maxRelevant === "number" ? Math.min(body.maxRelevant, 10) : 5;

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
    
    // If we have a message, rank critical memories by relevance to it
    let criticalMemories: typeof allCritical;
    if (message && allCritical.length > maxCritical) {
      // Get embeddings and rank critical memories by relevance
      const vector = await embedText(message);
      const criticalHits = await semanticSearchVectors({
        userId: identity.userId,
        query: message,
        vector,
        topK: maxCritical * 2, // Get more to filter
      });
      
      // Filter to only critical memories, preserve ranking
      const criticalHitIds = new Set(criticalHits.map((h) => h.item.id));
      const rankedCritical = allCritical
        .filter((m) => criticalHitIds.has(m.id))
        .slice(0, maxCritical);
      
      // If not enough matches, fill with remaining critical (most recent first)
      if (rankedCritical.length < maxCritical) {
        const rankedIds = new Set(rankedCritical.map((m) => m.id));
        const remaining = allCritical
          .filter((m) => !rankedIds.has(m.id))
          .slice(0, maxCritical - rankedCritical.length);
        criticalMemories = [...rankedCritical, ...remaining];
      } else {
        criticalMemories = rankedCritical;
      }
    } else {
      criticalMemories = allCritical.slice(0, maxCritical);
    }

    // Get relevant memories based on message (hybrid: vector + BM25)
    let relevantMemories: typeof criticalMemories = [];
    
    if (message) {
      try {
        // Run vector and BM25 search in parallel
        const [vectorResults, bm25Results] = await Promise.all([
          (async () => {
            const vector = await embedText(message);
            const hits = await semanticSearchVectors({
              userId: identity.userId,
              query: message,
              vector,
              topK: 20,
            });
            return hits.map((h) => ({ id: h.item.id, score: h.score }));
          })(),
          (async () => {
            try {
              await ensureFtsInitialized();
              return await bm25Search({
                userId: identity.userId,
                query: message,
                topK: 20,
              });
            } catch {
              return []; // FTS not ready
            }
          })(),
        ]);

        // Combine with RRF fusion
        let memoryIds: string[];
        if (vectorResults.length > 0 && bm25Results.length > 0) {
          const fused = rrfFusion(vectorResults, bm25Results, {
            k: 60,
            bm25Weight: 1.2,
          });
          memoryIds = fused.slice(0, 10).map((r) => r.memoryId);
        } else if (vectorResults.length > 0) {
          memoryIds = vectorResults.slice(0, 10).map((r) => r.id);
        } else {
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

          // Track access
          const accessedIds = memories.map((m) => m.id);
          incrementAccessCounts(identity.userId, accessedIds).catch(() => {});
        }
      } catch {
        // Search failed, continue with critical only
      }
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
    if (allInjectedIds.length > 0) {
      recordInjectionEvent({
        userId: identity.userId,
        memoryIds: allInjectedIds,
        resultCount: allInjectedIds.length,
        conversationId: conversationId ?? undefined,
      }).catch(() => {});
    }

    // Return as plain text with content-type header
    return new Response(context || "No relevant context found.", {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
