import { validateApiKey } from "@/lib/api-auth";
import { isObject, normalizeIsoTimestamp, normalizeLimit } from "@/lib/api-v1";
import {
  archiveAgentMemoriesByIds,
  getNamespaceById,
  insertMemoryWithMetadata,
  listAgentMemories,
  listConsolidatedMemories,
} from "@/lib/db";
import { embedText } from "@/lib/embeddings";
import { extractEntities } from "@/lib/entities";
import { MemryError, errorResponse } from "@/lib/errors";
import { LLMError, callLLM } from "@/lib/llm";
import { upsertMemoryVector } from "@/lib/qdrant";
import type { MemoryKind } from "@/lib/types";

export const runtime = "nodejs";

const SOURCE_MEMORY_EXCLUDES: MemoryKind[] = ["reflected", "session_summary", "compacted"];

type ReflectionEntry = {
  title?: string;
  text?: string;
  importance?: number;
  metadata?: Record<string, unknown> | null;
};

function llmErrorResponse(error: LLMError): Response {
  return Response.json(
    {
      error: {
        code: error.code,
        message: "Reflection is temporarily unavailable.",
        details: { reason: error.message },
      },
    },
    { status: error.status },
  );
}

function parseReflectionEntries(raw: string): ReflectionEntry[] {
  const parsed = JSON.parse(raw) as { entries?: unknown };
  if (!Array.isArray(parsed.entries)) {
    return [];
  }

  return parsed.entries.filter(isObject).map((entry) => ({
    title: typeof entry.title === "string" ? entry.title.trim() : undefined,
    text: typeof entry.text === "string" ? entry.text.trim() : undefined,
    importance: typeof entry.importance === "number" ? entry.importance : undefined,
    metadata: isObject(entry.metadata) ? entry.metadata : null,
  }));
}

function clampImportance(value: number | undefined, fallback = 7): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.min(10, Math.round(value as number)));
}

async function resolveScopeNamespace(
  userId: string,
  scope: string,
  namespaceId: unknown,
): Promise<string | null> {
  if (scope === "global") {
    return null;
  }

  if (scope !== "namespace") {
    throw new MemryError("VALIDATION_ERROR", { field: "scope", reason: "must be 'global' or 'namespace'" });
  }

  if (typeof namespaceId !== "string" || !namespaceId.trim()) {
    throw new MemryError("VALIDATION_ERROR", { field: "namespaceId", reason: "required for namespace scope" });
  }

  const namespace = await getNamespaceById(userId, namespaceId);
  if (!namespace) {
    throw new MemryError("NAMESPACE_NOT_FOUND");
  }

  return namespace.id;
}

function buildReflectionPrompt(
  scope: "global" | "namespace",
  recentMemories: Array<{ id: string; title: string; text: string; createdAt: string; metadata: Record<string, unknown> | null }>,
  existingMemories: Array<{ id: string; title: string; text: string; createdAt: string; metadata: Record<string, unknown> | null }>,
): string {
  return JSON.stringify({
    task: "Consolidate recent memories into a fresh reflected memory set.",
    instructions: [
      "Identify durable preferences, recurring facts, patterns, and stable context.",
      "Merge redundant statements and strengthen entries that are reinforced by recent evidence.",
      "Remove stale or contradicted consolidated entries by omitting them from the result.",
      "Return only durable memories worth keeping. If none remain, return an empty entries array.",
      "Each entry must be self-contained and concise.",
    ],
    outputSchema: {
      entries: [
        {
          title: "short summary title",
          text: "durable consolidated memory text",
          importance: "integer 1-10",
          metadata: {
            category: "preference|pattern|fact|identity|relationship|other",
            confidence: "low|medium|high",
            sourceMemoryIds: ["memory ids that support this entry"],
          },
        },
      ],
    },
    scope,
    recentMemories,
    existingConsolidatedMemories: existingMemories,
  });
}

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "reflect.create");
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body)) {
      throw new MemryError("VALIDATION_ERROR", { field: "body", reason: "object required" });
    }

    const scope = body.scope;
    const namespaceId = await resolveScopeNamespace(identity.userId, typeof scope === "string" ? scope : "", body.namespaceId);
    const since = normalizeIsoTimestamp(body.since, "since");
    const limit = normalizeLimit(body.limit, 50, 100);

    const [recentMemories, existingMemories] = await Promise.all([
      listAgentMemories({
        userId: identity.userId,
        namespaceId,
        since,
        limit,
        excludeMemoryTypes: SOURCE_MEMORY_EXCLUDES,
      }),
      listConsolidatedMemories({
        userId: identity.userId,
        namespaceId,
        limit: 200,
      }),
    ]);

    if (recentMemories.length === 0) {
      return Response.json({
        memories: existingMemories,
        reflected: false,
        reason: "No recent memories found for reflection.",
      });
    }

    const prompt = buildReflectionPrompt(
      scope as "global" | "namespace",
      recentMemories.map((memory) => ({
        id: memory.id,
        title: memory.title,
        text: memory.text.slice(0, 2500),
        createdAt: memory.createdAt,
        metadata: memory.metadata,
      })),
      existingMemories.map((memory) => ({
        id: memory.id,
        title: memory.title,
        text: memory.text.slice(0, 2500),
        createdAt: memory.createdAt,
        metadata: memory.metadata,
      })),
    );

    const llmResponse = await callLLM(
      prompt,
      "You maintain an AI memory system. Respond with valid JSON only.",
    );
    const entries = parseReflectionEntries(llmResponse).filter((entry) => entry.text);

    const createdMemories = [];
    for (const entry of entries) {
      const text = entry.text?.trim();
      if (!text) {
        continue;
      }

      const vector = await embedText(text.slice(0, 6000));
      const memory = await insertMemoryWithMetadata({
        userId: identity.userId,
        title: entry.title,
        text,
        embedding: vector,
        memoryType: "reflected",
        importance: clampImportance(entry.importance, 7),
        entities: extractEntities(text),
        namespaceId,
        metadata: {
          ...(entry.metadata ?? {}),
          reflectedAt: new Date().toISOString(),
          scope,
          sourceRecentCount: recentMemories.length,
          sourceConsolidatedCount: existingMemories.length,
        },
      });

      await upsertMemoryVector({
        memoryId: memory.id,
        userId: memory.userId,
        title: memory.title,
        sourceType: memory.sourceType,
        memoryType: "reflected",
        importance: clampImportance(entry.importance, 7),
        vector,
      });

      createdMemories.push(memory);
    }

    const archived = await archiveAgentMemoriesByIds(
      identity.userId,
      existingMemories.map((memory) => memory.id),
    );

    return Response.json({
      memories: createdMemories,
      stats: {
        recentCount: recentMemories.length,
        previousConsolidatedCount: existingMemories.length,
        archivedPrevious: archived,
        created: createdMemories.length,
      },
    });
  } catch (error) {
    if (error instanceof LLMError) {
      return llmErrorResponse(error);
    }
    return errorResponse(error);
  }
}
