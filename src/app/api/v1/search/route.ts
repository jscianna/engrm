import { embedText } from "@/lib/embeddings";
import { countEntityOverlap, extractEntities } from "@/lib/entities";
import { semanticSearchVectors } from "@/lib/qdrant";
import { bm25Search, rrfFusion, ensureFtsInitialized } from "@/lib/fts";
import { getAgentMemoriesByIds, recordMemorySearchHits, incrementAccessCounts, checkAndPromoteMemories } from "@/lib/db";
import { recordInjectionEvent } from "@/lib/memory-analytics";
import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { isObject, normalizeIsoTimestamp, normalizeLimit, resolveNamespaceIdOrError } from "@/lib/api-v1";

export const runtime = "nodejs";

type SearchMode = "hybrid" | "vector" | "keyword";

function buildProvenance(memory: {
  sourceType: string;
  fileName: string | null;
  sourceUrl: string | null;
  createdAt: string;
}) {
  return {
    source: memory.sourceType === "pdf" ? "pdf" : memory.sourceType === "url" ? "url" : "api",
    fileName: memory.fileName ?? undefined,
    sourceUrl: memory.sourceUrl ?? undefined,
    createdAt: memory.createdAt,
  };
}

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "search");
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body) || typeof body.query !== "string" || !body.query.trim()) {
      throw new MemryError("VALIDATION_ERROR", { field: "query", reason: "required" });
    }

    const topK = normalizeLimit(body.topK, 10, 50);
    const since = normalizeIsoTimestamp(body.since, "since");
    const namespace = typeof body.namespace === "string" ? body.namespace : undefined;
    const mode: SearchMode = body.mode === "vector" || body.mode === "keyword" ? body.mode : "hybrid";
    
    const resolved = await resolveNamespaceIdOrError(identity.userId, namespace);
    if (resolved.error) {
      return resolved.error;
    }

    // Run searches based on mode
    const queryText = body.query.trim();
    const retrievalLimit = Math.max(topK * 5, 50);

    let vectorHits: Array<{ id: string; score: number }> = [];
    let bm25Hits: Array<{ memoryId: string; score: number }> = [];

    if (mode === "hybrid" || mode === "vector") {
      // Vector search
      const vector = await embedText(queryText);
      const hits = await semanticSearchVectors({
        userId: identity.userId,
        query: queryText,
        vector,
        since,
        topK: retrievalLimit,
      });
      vectorHits = hits.map((h) => ({ id: h.item.id, score: h.score }));
    }

    if (mode === "hybrid" || mode === "keyword") {
      // BM25 keyword search
      try {
        await ensureFtsInitialized();
        bm25Hits = await bm25Search({
          userId: identity.userId,
          query: queryText,
          topK: retrievalLimit,
        });
      } catch (err) {
        // FTS not available or failed - continue with vector only
        console.warn("[Search] BM25 search failed:", err);
      }
    }

    // Combine results using RRF fusion (or just use single source if mode != hybrid)
    let rankedIds: Array<{ memoryId: string; score: number; vectorScore?: number; bm25Score?: number }>;
    
    if (mode === "hybrid" && vectorHits.length > 0 && bm25Hits.length > 0) {
      rankedIds = rrfFusion(vectorHits, bm25Hits, {
        k: 60,
        vectorWeight: 1.0,
        bm25Weight: 1.2, // Slight boost to exact matches
        topRankBonus: 0.05,
      });
    } else if (vectorHits.length > 0) {
      rankedIds = vectorHits.map((h) => ({ memoryId: h.id, score: h.score, vectorScore: h.score }));
    } else if (bm25Hits.length > 0) {
      rankedIds = bm25Hits.map((h) => ({ memoryId: h.memoryId, score: h.score, bm25Score: h.score }));
    } else {
      rankedIds = [];
    }

    // Fetch full memory records
    const memories = await getAgentMemoriesByIds({
      userId: identity.userId,
      ids: rankedIds.map((r) => r.memoryId),
      namespaceId: resolved.namespaceId,
      since,
    });
    const memoryById = new Map(memories.map((memory) => [memory.id, memory]));
    const queryEntities = extractEntities(body.query);

    // Build final results with quality adjustments
    const allResults = rankedIds
      .map((ranked) => {
        const memory = memoryById.get(ranked.memoryId);
        if (!memory) {
          return null;
        }
        const entityOverlap = countEntityOverlap(queryEntities, memory.entities);
        const adjustedScore =
          ranked.score +
          (memory.feedbackScore * 0.08) +
          (Math.min(memory.accessCount, 25) * 0.01) +
          (entityOverlap * 0.06);
        return {
          id: memory.id,
          score: adjustedScore,
          vectorScore: ranked.vectorScore,
          bm25Score: ranked.bm25Score,
          provenance: buildProvenance(memory),
          memory,
        };
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value))
      .sort((left, right) => right.score - left.score);

    // Separate sensitive memories (containing detected secrets) - excluded from LLM context
    const sensitiveResults = allResults.filter((result) => result.memory.sensitive);
    const safeResults = allResults.filter((result) => !result.memory.sensitive).slice(0, topK);

    // Non-blocking: increment access counts, record hits, and log injection event
    const retrievedIds = safeResults.map((result) => result.id);
    Promise.all([
      incrementAccessCounts(identity.userId, retrievedIds),
      recordMemorySearchHits(identity.userId, retrievedIds),
      checkAndPromoteMemories(identity.userId),
      retrievedIds.length > 0
        ? recordInjectionEvent({
            userId: identity.userId,
            memoryIds: retrievedIds,
            resultCount: retrievedIds.length,
          })
        : Promise.resolve(),
    ]).catch((err) => {
      console.error("[Search] Background tasks failed:", err);
    });

    // If sensitive memories were filtered, add header so agent can inform user
    const headers: Record<string, string> = {};
    if (sensitiveResults.length > 0) {
      headers["X-FatHippo-Sensitive-Omitted"] = String(sensitiveResults.length);
      headers["X-FatHippo-Sensitive-Hint"] = `${sensitiveResults.length} memory(ies) containing credentials were found but excluded for security. View them in your FatHippo dashboard.`;
    }

    return Response.json(safeResults, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}
