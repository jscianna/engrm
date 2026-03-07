import { embedText } from "@/lib/embeddings";
import { countEntityOverlap, extractEntities } from "@/lib/entities";
import { semanticSearchVectors } from "@/lib/qdrant";
import { getAgentMemoriesByIds, recordMemorySearchHits, incrementAccessCounts, checkAndPromoteMemories } from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { isObject, normalizeIsoTimestamp, normalizeLimit, resolveNamespaceIdOrError } from "@/lib/api-v1";

export const runtime = "nodejs";

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
    const resolved = await resolveNamespaceIdOrError(identity.userId, namespace);
    if (resolved.error) {
      return resolved.error;
    }

    const vector = await embedText(body.query.trim());
    const hits = await semanticSearchVectors({
      userId: identity.userId,
      query: body.query.trim(),
      vector,
      since,
      topK: Math.max(topK * 5, 50),
    });

    const memories = await getAgentMemoriesByIds({
      userId: identity.userId,
      ids: hits.map((hit) => hit.item.id),
      namespaceId: resolved.namespaceId,
      since,
    });
    const memoryById = new Map(memories.map((memory) => [memory.id, memory]));
    const queryEntities = extractEntities(body.query);

    const allResults = hits
      .map((hit) => {
        const memory = memoryById.get(hit.item.id);
        if (!memory) {
          return null;
        }
        const entityOverlap = countEntityOverlap(queryEntities, memory.entities);
        const adjustedScore =
          hit.score +
          (memory.feedbackScore * 0.08) +
          (Math.min(memory.accessCount, 25) * 0.01) +
          (entityOverlap * 0.06);
        return {
          id: memory.id,
          score: adjustedScore,
          vectorScore: hit.score,
          provenance: buildProvenance(memory),
          memory,
        };
      })
      .filter((value): value is { id: string; score: number; vectorScore: number; provenance: ReturnType<typeof buildProvenance>; memory: (typeof memories)[number] } => Boolean(value))
      .sort((left, right) => right.score - left.score);

    // Separate sensitive memories (containing detected secrets) - excluded from LLM context
    const sensitiveResults = allResults.filter((result) => result.memory.sensitive);
    const safeResults = allResults.filter((result) => !result.memory.sensitive).slice(0, topK);

    // Non-blocking: increment access counts and record hits
    const retrievedIds = safeResults.map((result) => result.id);
    Promise.all([
      incrementAccessCounts(identity.userId, retrievedIds),
      recordMemorySearchHits(identity.userId, retrievedIds),
      checkAndPromoteMemories(identity.userId),
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
