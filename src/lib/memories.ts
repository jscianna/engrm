import { randomUUID } from "node:crypto";
import { cache } from "react";
import { embedDocument, embedQuery } from "@/lib/embeddings";
import { cleanText, extractUrlContent, hashContent } from "@/lib/content";
import { containsSecrets } from "@/lib/secrets";
import {
  createMemoryEdge,
  getDashboardStatsByUser,
  getMemoriesByIds,
  getMemoryById,
  insertMemory,
  listMemoriesByUser,
} from "@/lib/db";
import type {
  MemoryDashboardStats,
  MemoryKind,
  MemoryListItem,
  MemoryRecord,
  MemorySearchResult,
  MemorySourceType,
} from "@/lib/types";
import { semanticSearchVectors, upsertMemoryVector } from "@/lib/qdrant";

const MAX_FILE_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function getMemory(id: string): Promise<MemoryRecord | null> {
  return getMemoryById(id);
}

export async function getMemories(userId: string): Promise<MemoryListItem[]> {
  return listMemoriesByUser(userId, 200);
}

export async function getMemoryStats(userId: string): Promise<MemoryDashboardStats> {
  return getDashboardStatsByUser(userId);
}

export const getCachedMemory = cache(async (id: string): Promise<MemoryRecord | null> => getMemoryById(id));

export const getCachedMemories = cache(async (userId: string): Promise<MemoryListItem[]> => listMemoriesByUser(userId, 200));

export const getCachedMemoryStats = cache(async (userId: string): Promise<MemoryDashboardStats> => getDashboardStatsByUser(userId));

export const getCachedRelatedMemories = cache(async (
  userId: string,
  memoryId: string,
  contentText: string,
  topK = 5,
): Promise<MemorySearchResult[]> => {
  return getRelatedMemories({
    userId,
    memoryId,
    contentText,
    topK,
  });
});

function normalizeImportance(input: number | undefined): number {
  const value = Number.isFinite(input) ? Math.round(input as number) : 5;
  return Math.max(1, Math.min(10, value));
}

function normalizeTags(tags?: string[] | string): string[] {
  if (!tags) {
    return [];
  }

  const raw = Array.isArray(tags) ? tags : tags.split(",");
  const unique = new Set<string>();
  for (const tag of raw) {
    const cleaned = cleanText(tag).toLowerCase();
    if (cleaned) {
      unique.add(cleaned);
    }
  }
  return Array.from(unique).slice(0, 12);
}

async function parseMemoryContent(input: {
  sourceType: MemorySourceType;
  text?: string;
  url?: string;
  file?: File;
}): Promise<{ contentText: string; sourceUrl: string | null; fileName: string | null }> {
  if (input.sourceType === "text") {
    const content = cleanText(input.text ?? "");
    if (!content) {
      throw new Error("Text memory cannot be empty.");
    }
    return { contentText: content, sourceUrl: null, fileName: null };
  }

  if (input.sourceType === "url") {
    const url = cleanText(input.url ?? "");
    if (!url) {
      throw new Error("URL is required for URL memories.");
    }

    const content = await extractUrlContent(url);
    if (!content) {
      throw new Error("No readable content was extracted from this URL.");
    }

    return { contentText: content, sourceUrl: url, fileName: null };
  }

  const file = input.file;
  if (!file) {
    throw new Error("File is required for file memories.");
  }
  if (file.size > MAX_FILE_UPLOAD_BYTES) {
    throw new Error("File exceeds 10MB upload limit.");
  }

  const rawText = cleanText(await file.text());
  if (!rawText) {
    const bytes = Buffer.from(await file.arrayBuffer());
    return {
      contentText: `[binary:${file.type || "application/octet-stream"}] ${bytes.toString("base64")}`,
      sourceUrl: null,
      fileName: file.name,
    };
  }

  return { contentText: rawText, sourceUrl: null, fileName: file.name };
}

type CreateMemoryParams = {
  userId: string;
  title?: string;
  sourceType: MemorySourceType;
  memoryType?: MemoryKind;
  importance?: number;
  tags?: string[] | string;
  text?: string;
  url?: string;
  file?: File;
  encryptedContent?: string;
  iv?: string;
};

async function parseInput(params: CreateMemoryParams) {
  if (params.encryptedContent) {
    const title = cleanText(params.title ?? "") || "Untitled Memory";
    return {
      parsed: { contentText: "", sourceUrl: null, fileName: null },
      title,
    };
  }

  const parsed = await parseMemoryContent({
    sourceType: params.sourceType,
    text: params.text,
    url: params.url,
    file: params.file,
  });
  const title = cleanText(params.title ?? "") || parsed.fileName || "Untitled Memory";
  return { parsed, title };
}

async function persistToDb(params: {
  userId: string;
  sourceType: MemorySourceType;
  memoryType: MemoryKind;
  importance: number;
  tags: string[];
  title: string;
  parsed: { contentText: string; sourceUrl: string | null; fileName: string | null };
  encryptedContent?: string;
  iv?: string;
}): Promise<MemoryRecord> {
  const contentText = params.encryptedContent ?? params.parsed.contentText;
  const isEncrypted = Boolean(params.encryptedContent && params.iv);
  const contentHashInput = isEncrypted
    ? JSON.stringify({
        encrypted: true,
        iv: params.iv,
        data: params.encryptedContent,
      })
    : contentText;

  const memory: MemoryRecord = {
    id: randomUUID(),
    userId: params.userId,
    title: params.title,
    sourceType: params.sourceType,
    memoryType: params.memoryType,
    importance: params.importance,
    importanceTier: "normal",
    tags: params.tags,
    sourceUrl: params.parsed.sourceUrl,
    fileName: params.parsed.fileName,
    contentText,
    contentIv: params.iv ?? null,
    isEncrypted,
    contentHash: hashContent(contentHashInput),
    sensitive: containsSecrets(contentText),
    syncStatus: "pending",
    syncError: null,
    createdAt: new Date().toISOString(),
  };
  await insertMemory(memory);
  return memory;
}

async function generateEmbedding(memory: MemoryRecord) {
  try {
    if (memory.isEncrypted) {
      return;
    }

    const vector = await embedDocument(memory.contentText.slice(0, 6000));
    await upsertMemoryVector({
      memoryId: memory.id,
      userId: memory.userId,
      title: memory.title,
      sourceType: memory.sourceType,
      memoryType: memory.memoryType,
      importance: memory.importance,
      vector,
    });
  } catch (error) {
    console.error("Failed to generate/store embeddings", error);
  }
}

// Auto-link: "memories that fire together, wire together"
// Creates edges between a new memory and similar existing memories
const AUTO_LINK_THRESHOLD = 0.75; // Minimum similarity to auto-link
const AUTO_LINK_TOP_K = 5; // Max memories to auto-link

async function autoLinkSimilarMemories(memory: MemoryRecord) {
  try {
    // Skip encrypted memories (can't compute similarity without plaintext)
    if (memory.isEncrypted) {
      return;
    }

    // Find similar memories
    const similar = await getRelatedMemories({
      userId: memory.userId,
      memoryId: memory.id,
      contentText: memory.contentText,
      topK: AUTO_LINK_TOP_K,
    });

    // Create edges for sufficiently similar memories
    for (const result of similar) {
      if (result.score >= AUTO_LINK_THRESHOLD) {
        await createMemoryEdge({
          userId: memory.userId,
          sourceId: memory.id,
          targetId: result.memory.id,
          relationshipType: "similar",
          weight: result.score, // Higher similarity = stronger initial bond
          metadata: { autoLinked: true, initialScore: result.score },
        });
      }
    }
  } catch (error) {
    // Non-fatal: don't fail memory creation if auto-linking fails
    console.error("Failed to auto-link similar memories", error);
  }
}

// Strengthen bonds between memories retrieved together
// "Neurons that fire together, wire together"
export async function strengthenCoRetrievedMemories(
  userId: string,
  memoryIds: string[],
  boostAmount = 0.05
): Promise<void> {
  if (memoryIds.length < 2) {
    return;
  }

  try {
    // Create/strengthen edges between all pairs
    for (let i = 0; i < memoryIds.length; i++) {
      for (let j = i + 1; j < memoryIds.length; j++) {
        await createMemoryEdge({
          userId,
          sourceId: memoryIds[i],
          targetId: memoryIds[j],
          relationshipType: "similar",
          weight: boostAmount, // Will add to existing weight on conflict
          metadata: { coRetrieved: true, timestamp: new Date().toISOString() },
        });
      }
    }
  } catch (error) {
    // Non-fatal
    console.error("Failed to strengthen co-retrieved memories", error);
  }
}

export async function createMemory(params: CreateMemoryParams): Promise<MemoryRecord> {
  const { parsed, title } = await parseInput(params);

  const memoryType = params.memoryType ?? "episodic";
  const importance = normalizeImportance(params.importance);
  const tags = normalizeTags(params.tags);

  const memory = await persistToDb({
    userId: params.userId,
    sourceType: params.sourceType,
    memoryType,
    importance,
    tags,
    title,
    parsed,
    encryptedContent: params.encryptedContent,
    iv: params.iv,
  });
  await generateEmbedding(memory);

  // "Memories that fire together, wire together"
  // Auto-link to similar existing memories
  await autoLinkSimilarMemories(memory);

  const persisted = await getMemoryById(memory.id);
  if (!persisted) {
    throw new Error("Memory was created but could not be reloaded.");
  }
  return persisted;
}

export async function searchMemories(userId: string, query: string): Promise<MemorySearchResult[]> {
  const cleaned = cleanText(query);
  if (!cleaned) {
    return [];
  }

  const vector = await embedQuery(cleaned);
  const hits = await semanticSearchVectors({
    userId,
    query: cleaned,
    vector,
    topK: 15,
  });

  const ids = hits.map((hit) => hit.item.id);
  const memories = await getMemoriesByIds(userId, ids);
  const memoryById = new Map(memories.map((memory) => [memory.id, memory]));

  // Filter out low-relevance results so search only shows meaningful matches
  const MIN_SEARCH_SIMILARITY = 0.55;
  const results = hits
    .filter((hit) => hit.score >= MIN_SEARCH_SIMILARITY)
    .map((hit) => ({
      score: hit.score,
      memory: memoryById.get(hit.item.id),
    }))
    .filter((result): result is { score: number; memory: MemoryListItem } => Boolean(result.memory));

  // "Memories that fire together, wire together"
  // Strengthen bonds between top co-retrieved results
  const topResultIds = results.slice(0, 5).map((r) => r.memory.id);
  if (topResultIds.length >= 2) {
    // Fire and forget - don't block search response
    strengthenCoRetrievedMemories(userId, topResultIds, 0.02).catch(() => {});
  }

  return results;
}

export async function getRelatedMemories(params: {
  userId: string;
  memoryId: string;
  contentText: string;
  topK?: number;
}): Promise<MemorySearchResult[]> {
  const vector = await embedQuery(params.contentText.slice(0, 6000));
  const hits = await semanticSearchVectors({
    userId: params.userId,
    query: params.contentText.slice(0, 600),
    vector,
    topK: (params.topK ?? 5) + 1,
  });

  const filtered = hits.filter((hit) => hit.item.id !== params.memoryId).slice(0, params.topK ?? 5);
  const ids = filtered.map((hit) => hit.item.id);
  const memories = await getMemoriesByIds(params.userId, ids);
  const memoryById = new Map(memories.map((memory) => [memory.id, memory]));

  return filtered
    .map((hit) => ({
      score: hit.score,
      memory: memoryById.get(hit.item.id),
    }))
    .filter((result): result is { score: number; memory: MemoryListItem } => Boolean(result.memory));
}
