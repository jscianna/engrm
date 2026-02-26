import { embedText } from "@/lib/embeddings";
import { semanticSearchVectors } from "@/lib/vector";
import { getAgentMemoriesByIds } from "@/lib/db";
import { ApiAuthError, validateApiKey } from "@/lib/api-auth";
import { isObject, jsonError, normalizeLimit, resolveNamespaceIdOrError } from "@/lib/api-v1";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request);
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body) || typeof body.query !== "string" || !body.query.trim()) {
      return jsonError("'query' is required", "VALIDATION_ERROR", 400);
    }

    const topK = normalizeLimit(body.topK, 10, 50);
    const namespace = typeof body.namespace === "string" ? body.namespace : undefined;
    const resolved = await resolveNamespaceIdOrError(identity.userId, namespace);
    if (resolved.error) {
      return resolved.error;
    }

    const vector = await embedText(body.query.trim());
    const hits = await semanticSearchVectors({
      userId: identity.userId,
      query: body.query.trim(),
      vector,
      topK: Math.max(topK * 5, 50),
    });

    const memories = await getAgentMemoriesByIds({
      userId: identity.userId,
      ids: hits.map((hit) => hit.item.id),
      namespaceId: resolved.namespaceId,
    });
    const memoryById = new Map(memories.map((memory) => [memory.id, memory]));

    const results = hits
      .map((hit) => {
        const memory = memoryById.get(hit.item.id);
        if (!memory) {
          return null;
        }
        return {
          id: memory.id,
          score: hit.score,
          memory,
        };
      })
      .filter((value): value is { id: string; score: number; memory: (typeof memories)[number] } => Boolean(value))
      .slice(0, topK);

    return Response.json(results);
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return jsonError(error.message, error.code, error.status);
    }
    const message = error instanceof Error ? error.message : "Search failed";
    return jsonError(message, "SEARCH_FAILED", 400);
  }
}
