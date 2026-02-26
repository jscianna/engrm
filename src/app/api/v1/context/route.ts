import { embedText } from "@/lib/embeddings";
import { semanticSearchVectors } from "@/lib/vector";
import { getAgentMemoriesByIds, listAgentMemories } from "@/lib/db";
import { ApiAuthError, validateApiKey } from "@/lib/api-auth";
import { estimateTokens, isObject, jsonError, normalizeLimit, resolveNamespaceIdOrError } from "@/lib/api-v1";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request);
    const body = (await request.json().catch(() => null)) as unknown;
    if (!isObject(body) || typeof body.query !== "string") {
      return jsonError("'query' is required", "VALIDATION_ERROR", 400);
    }

    const namespace = typeof body.namespace === "string" ? body.namespace : undefined;
    const resolved = await resolveNamespaceIdOrError(identity.userId, namespace);
    if (resolved.error) {
      return resolved.error;
    }

    const maxTokens = normalizeLimit(body.maxTokens, 1200, 8000);
    const recentMemories = await listAgentMemories({
      userId: identity.userId,
      namespaceId: resolved.namespaceId,
      limit: 40,
    });

    const vector = await embedText(body.query.trim());
    const hits = await semanticSearchVectors({
      userId: identity.userId,
      query: body.query.trim(),
      vector,
      topK: 50,
    });
    const relevantMemories = await getAgentMemoriesByIds({
      userId: identity.userId,
      ids: hits.map((hit) => hit.item.id),
      namespaceId: resolved.namespaceId,
    });
    const relevantById = new Map(relevantMemories.map((memory) => [memory.id, memory]));

    const merged = new Map<string, { memory: (typeof recentMemories)[number]; score: number | null }>();
    for (const hit of hits) {
      const memory = relevantById.get(hit.item.id);
      if (memory && !merged.has(memory.id)) {
        merged.set(memory.id, { memory, score: hit.score });
      }
    }
    for (const memory of recentMemories) {
      if (!merged.has(memory.id)) {
        merged.set(memory.id, { memory, score: null });
      }
    }

    const selected: Array<{
      id: string;
      createdAt: string;
      text: string;
      title: string;
      tokenEstimate: number;
      score: number | null;
      metadata: Record<string, unknown> | null;
    }> = [];
    let usedTokens = 0;

    for (const entry of merged.values()) {
      const tokenEstimate = estimateTokens(entry.memory.text) + estimateTokens(entry.memory.title) + 8;
      if (usedTokens + tokenEstimate > maxTokens) {
        continue;
      }
      selected.push({
        id: entry.memory.id,
        createdAt: entry.memory.createdAt,
        text: entry.memory.text,
        title: entry.memory.title,
        tokenEstimate,
        score: entry.score,
        metadata: entry.memory.metadata,
      });
      usedTokens += tokenEstimate;
    }

    const contextText = selected
      .map((item, index) => {
        const metadata = item.metadata ? `\nmetadata: ${JSON.stringify(item.metadata)}` : "";
        const score = typeof item.score === "number" ? `\nrelevance: ${item.score.toFixed(4)}` : "";
        return `[${index + 1}] ${item.title}\nid: ${item.id}\ncreated_at: ${item.createdAt}${score}${metadata}\ncontent: ${item.text}`;
      })
      .join("\n\n");

    return Response.json({
      context: contextText,
      tokenEstimate: usedTokens,
      maxTokens,
      memories: selected,
    });
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return jsonError(error.message, error.code, error.status);
    }
    const message = error instanceof Error ? error.message : "Failed to build context";
    return jsonError(message, "CONTEXT_BUILD_FAILED", 400);
  }
}
