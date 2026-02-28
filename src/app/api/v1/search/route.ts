import { embedText } from "@/lib/embeddings";
import { semanticSearchVectors } from "@/lib/qdrant";
import { getAgentMemoriesByIds } from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { isObject, normalizeLimit, resolveNamespaceIdOrError } from "@/lib/api-v1";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "search");
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body) || typeof body.query !== "string" || !body.query.trim()) {
      throw new MemryError("VALIDATION_ERROR", { field: "query", reason: "required" });
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
    return errorResponse(error);
  }
}
