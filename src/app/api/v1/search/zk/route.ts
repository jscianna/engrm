/**
 * Zero-Knowledge Vector Search
 * 
 * Accepts pre-computed query vector.
 * Server never knows what you're searching for - only receives vector.
 * Returns encrypted content that client decrypts locally.
 */

import { semanticSearchVectorsDirect } from "@/lib/vector";
import { strengthenCoRetrievedMemories } from "@/lib/memories";
import { getAgentMemoriesByIds } from "@/lib/db";
import { ApiAuthError, validateApiKey } from "@/lib/api-auth";
import { isObject, jsonError, normalizeLimit, resolveNamespaceIdOrError } from "@/lib/api-v1";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request);
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body)) {
      return jsonError("Invalid request body", "VALIDATION_ERROR", 400);
    }

    if (!Array.isArray(body.vector) || body.vector.length === 0) {
      return jsonError("'vector' must be a non-empty array of numbers", "VALIDATION_ERROR", 400);
    }

    // Validate vector contains only numbers
    if (!body.vector.every((v: unknown) => typeof v === "number" && !isNaN(v))) {
      return jsonError("'vector' must contain only valid numbers", "VALIDATION_ERROR", 400);
    }

    const namespace = typeof body.namespace === "string" ? body.namespace : undefined;
    const resolved = await resolveNamespaceIdOrError(identity.userId, namespace);
    if (resolved.error) {
      return resolved.error;
    }

    const topK = normalizeLimit(body.topK, 5, 50);

    // Search by vector - we don't know what the query was
    const hits = await semanticSearchVectorsDirect({
      userId: identity.userId,
      vector: body.vector,
      topK,
    });

    if (hits.length === 0) {
      return Response.json({ results: [] });
    }

    // Get the encrypted memories
    const memories = await getAgentMemoriesByIds({
      userId: identity.userId,
      ids: hits.map((h) => h.id),
      namespaceId: resolved.namespaceId,
    });

    const memoryById = new Map(memories.map((m) => [m.id, m]));

    // Return encrypted content - client will decrypt locally
    const results = hits
      .map((hit) => {
        const memory = memoryById.get(hit.id);
        if (!memory) return null;

        return {
          id: memory.id,
          score: hit.score,
          encryptedTitle: memory.title, // Client encrypted this, we can't read it
          encryptedContent: memory.text, // Client encrypted this, we can't read it
          metadata: memory.metadata,
          createdAt: memory.createdAt,
        };
      })
      .filter(Boolean);

    // "Memories that fire together, wire together"
    const activatedIds = results.slice(0, 5).map((r) => r?.id).filter(Boolean) as string[];
    if (activatedIds.length >= 2) {
      strengthenCoRetrievedMemories(identity.userId, activatedIds, 0.02).catch(() => {});
    }

    return Response.json({ results });
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return jsonError(error.message, error.code, error.status);
    }
    const message = error instanceof Error ? error.message : "Search failed";
    return jsonError(message, "SEARCH_FAILED", 400);
  }
}
