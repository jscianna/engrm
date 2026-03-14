/**
 * Simple Recall Endpoint
 * 
 * Search memories and return just the text content.
 * Auto-tracks access and reinforces retrieved memories.
 */

import { embedQuery } from "@/lib/embeddings";
import { semanticSearchVectors } from "@/lib/qdrant";
import { 
  getAgentMemoriesByIds, 
  incrementAccessCounts,
  checkAndPromoteMemories,
} from "@/lib/db";
import { recordInjectionEvent } from "@/lib/memory-analytics";
import { validateApiKey } from "@/lib/api-auth";
import { FatHippoError, errorResponse } from "@/lib/errors";
import { isObject, normalizeLimit } from "@/lib/api-v1";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "simple.recall");
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body)) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "body", reason: "Invalid request body" });
    }

    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "query", reason: "required" });
    }

    const limit = normalizeLimit(body.limit, 5, 20);

    // Search
    const vector = await embedQuery(query);
    const hits = await semanticSearchVectors({
      userId: identity.userId,
      query,
      vector,
      topK: limit * 2, // Get more to filter
    });

    if (hits.length === 0) {
      return Response.json({
        results: [],
        count: 0,
      });
    }

    // Get full memory records
    const memories = await getAgentMemoriesByIds({
      userId: identity.userId,
      ids: hits.map((h) => h.item.id),
    });

    const memoryById = new Map(memories.map((m) => [m.id, m]));

    // Build results with just text content
    const results = hits
      .map((hit) => {
        const memory = memoryById.get(hit.item.id);
        if (!memory) return null;
        return memory.text;
      })
      .filter((text): text is string => text !== null)
      .slice(0, limit);

    // Auto-track access (non-blocking)
    const accessedIds = hits
      .slice(0, limit)
      .map((h) => h.item.id)
      .filter((id) => memoryById.has(id));

    if (accessedIds.length > 0) {
      incrementAccessCounts(identity.userId, accessedIds).catch(() => {});
      checkAndPromoteMemories(identity.userId).catch(() => {});
      recordInjectionEvent({
        userId: identity.userId,
        memoryIds: accessedIds,
        resultCount: results.length,
        conversationId: null,
      }).catch(() => {});
    }

    return Response.json({
      results,
      count: results.length,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
