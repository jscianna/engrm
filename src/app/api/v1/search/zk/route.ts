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
import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { isObject, normalizeLimit, resolveNamespaceIdOrError } from "@/lib/api-v1";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "search.zk");
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body)) {
      throw new MemryError("VALIDATION_ERROR", { reason: "Invalid request body" });
    }

    if (!Array.isArray(body.vector) || body.vector.length === 0) {
      throw new MemryError("VALIDATION_ERROR", { field: "vector", reason: "must be a non-empty array of numbers" });
    }

    if (!body.vector.every((v: unknown) => typeof v === "number" && !isNaN(v))) {
      throw new MemryError("VALIDATION_ERROR", { field: "vector", reason: "must contain only valid numbers" });
    }

    const namespace = typeof body.namespace === "string" ? body.namespace : undefined;
    const resolved = await resolveNamespaceIdOrError(identity.userId, namespace);
    if (resolved.error) {
      return resolved.error;
    }

    const topK = normalizeLimit(body.topK, 5, 50);

    const hits = await semanticSearchVectorsDirect({
      userId: identity.userId,
      vector: body.vector,
      topK,
    });

    if (hits.length === 0) {
      return Response.json({ results: [] });
    }

    const memories = await getAgentMemoriesByIds({
      userId: identity.userId,
      ids: hits.map((h) => h.id),
      namespaceId: resolved.namespaceId,
    });

    const memoryById = new Map(memories.map((m) => [m.id, m]));

    const results = hits
      .map((hit) => {
        const memory = memoryById.get(hit.id);
        if (!memory) return null;

        return {
          id: memory.id,
          score: hit.score,
          encryptedTitle: memory.title,
          encryptedContent: memory.text,
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
    return errorResponse(error);
  }
}
