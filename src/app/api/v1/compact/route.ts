import { validateApiKey } from "@/lib/api-auth";
import { isObject } from "@/lib/api-v1";
import {
  archiveAgentMemoriesByIds,
  getNamespaceById,
  insertMemoryWithMetadata,
  listMemoryCompactionCandidates,
} from "@/lib/db";
import { embedText } from "@/lib/embeddings";
import { extractEntities } from "@/lib/entities";
import { MemryError, errorResponse } from "@/lib/errors";
import { LLMError, callLLM } from "@/lib/llm";
import { upsertMemoryVector } from "@/lib/qdrant";
import type { MemoryKind } from "@/lib/types";

export const runtime = "nodejs";

const EXCLUDED_MEMORY_TYPES: MemoryKind[] = ["reflected", "session_summary", "compacted"];

type CompactEntry = {
  title?: string;
  text?: string;
  importance?: number;
  metadata?: Record<string, unknown> | null;
};

type Candidate = Awaited<ReturnType<typeof listMemoryCompactionCandidates>>[number];

function llmErrorResponse(error: LLMError): Response {
  return Response.json(
    {
      error: {
        code: error.code,
        message: "Memory compaction is temporarily unavailable.",
        details: { reason: error.message },
      },
    },
    { status: error.status },
  );
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dot / denominator;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3),
  );
}

function lexicalSimilarity(a: string, b: string): number {
  const left = tokenize(a);
  const right = tokenize(b);
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(left.size, right.size);
}

function similarityScore(a: Candidate, b: Candidate): number {
  if (a.embedding.length > 0 && b.embedding.length > 0 && a.embedding.length === b.embedding.length) {
    return cosineSimilarity(a.embedding, b.embedding);
  }
  return lexicalSimilarity(a.text, b.text);
}

function buildGroups(memories: Candidate[], threshold: number): Candidate[][] {
  const groups: Candidate[][] = [];
  const assigned = new Set<string>();

  for (const memory of memories) {
    if (assigned.has(memory.id)) {
      continue;
    }

    const group = [memory];
    assigned.add(memory.id);

    for (const candidate of memories) {
      if (assigned.has(candidate.id)) {
        continue;
      }
      if (similarityScore(memory, candidate) >= threshold) {
        group.push(candidate);
        assigned.add(candidate.id);
      }
    }

    if (group.length > 1) {
      groups.push(group);
    }
  }

  return groups;
}

function pickBaseMemory(group: Candidate[]): Candidate {
  return [...group].sort((left, right) => {
    const leftScore = left.strength + left.accessCount + left.mentionCount;
    const rightScore = right.strength + right.accessCount + right.mentionCount;
    return rightScore - leftScore;
  })[0];
}

function parseCompactEntry(raw: string): CompactEntry | null {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
  if (!text) {
    return null;
  }

  return {
    title: typeof parsed.title === "string" ? parsed.title.trim() : undefined,
    text,
    importance: typeof parsed.importance === "number" ? parsed.importance : undefined,
    metadata: isObject(parsed.metadata) ? parsed.metadata : null,
  };
}

function clampImportance(value: number | undefined, fallback = 7): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.min(10, Math.round(value as number)));
}

function buildCompactPrompt(baseMemory: Candidate, group: Candidate[]): string {
  return JSON.stringify({
    task: "Merge a group of similar memories into one compacted memory.",
    instructions: [
      "Preserve important distinct details while removing repetition.",
      "Prefer the strongest and most-accessed memory as the conceptual base.",
      "Return exactly one merged memory as JSON.",
    ],
    outputSchema: {
      title: "short compacted title",
      text: "merged memory text",
      importance: "integer 1-10",
      metadata: {
        retainedSourceIds: ["memory ids"],
        droppedRedundantIds: ["memory ids"],
      },
    },
    baseMemory: {
      id: baseMemory.id,
      title: baseMemory.title,
      text: baseMemory.text,
      accessCount: baseMemory.accessCount,
      strength: baseMemory.strength,
      mentionCount: baseMemory.mentionCount,
    },
    similarMemories: group.map((memory) => ({
      id: memory.id,
      title: memory.title,
      text: memory.text.slice(0, 2500),
      accessCount: memory.accessCount,
      strength: memory.strength,
      mentionCount: memory.mentionCount,
      createdAt: memory.createdAt,
    })),
  });
}

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "compact.create");
    const body = (await request.json().catch(() => ({}))) as unknown;
    if (!isObject(body)) {
      throw new MemryError("VALIDATION_ERROR", { field: "body", reason: "object required" });
    }

    const namespaceIdRaw = body.namespaceId;
    let namespaceId: string | null | undefined;
    if (typeof namespaceIdRaw === "string" && namespaceIdRaw.trim()) {
      const namespace = await getNamespaceById(identity.userId, namespaceIdRaw);
      if (!namespace) {
        throw new MemryError("NAMESPACE_NOT_FOUND");
      }
      namespaceId = namespace.id;
    }

    const similarityThreshold =
      typeof body.similarityThreshold === "number" && Number.isFinite(body.similarityThreshold)
        ? Math.min(0.99, Math.max(0.1, body.similarityThreshold))
        : 0.8;
    const dryRun = body.dryRun === true;

    const candidates = await listMemoryCompactionCandidates({
      userId: identity.userId,
      namespaceId,
      excludeMemoryTypes: EXCLUDED_MEMORY_TYPES,
      limit: 2000,
    });

    const groups = buildGroups(candidates, similarityThreshold);
    if (dryRun || groups.length === 0) {
      return Response.json({
        dryRun,
        stats: {
          groupsFound: groups.length,
          memoriesCompacted: dryRun ? groups.reduce((count, group) => count + group.length, 0) : 0,
          memoriesArchived: 0,
        },
      });
    }

    let memoriesCompacted = 0;
    let memoriesArchived = 0;

    for (const group of groups) {
      const baseMemory = pickBaseMemory(group);
      const payload = parseCompactEntry(
        await callLLM(
          buildCompactPrompt(baseMemory, group),
          "You maintain an AI memory system. Respond with valid JSON only.",
        ),
      );

      if (!payload?.text) {
        continue;
      }

      const vector = await embedText(payload.text.slice(0, 6000));
      const compactedMemory = await insertMemoryWithMetadata({
        userId: identity.userId,
        title: payload.title ?? baseMemory.title,
        text: payload.text,
        embedding: vector,
        memoryType: "compacted",
        importance: clampImportance(payload.importance, 7),
        entities: extractEntities(payload.text),
        namespaceId,
        metadata: {
          ...(payload.metadata ?? {}),
          compactedAt: new Date().toISOString(),
          baseMemoryId: baseMemory.id,
          sourceMemoryIds: group.map((memory) => memory.id),
          similarityThreshold,
        },
      });

      await upsertMemoryVector({
        memoryId: compactedMemory.id,
        userId: compactedMemory.userId,
        title: compactedMemory.title,
        sourceType: compactedMemory.sourceType,
        memoryType: "compacted",
        importance: clampImportance(payload.importance, 7),
        vector,
      });

      memoriesCompacted += group.length;
      memoriesArchived += await archiveAgentMemoriesByIds(
        identity.userId,
        group.map((memory) => memory.id),
      );
    }

    return Response.json({
      dryRun: false,
      stats: {
        groupsFound: groups.length,
        memoriesCompacted,
        memoriesArchived,
      },
    });
  } catch (error) {
    if (error instanceof LLMError) {
      return llmErrorResponse(error);
    }
    return errorResponse(error);
  }
}
