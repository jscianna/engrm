import { randomUUID } from "node:crypto";
import { embedText } from "@/lib/embeddings";
import { cleanText, extractUrlContent, hashContent } from "@/lib/content";
import {
  getDashboardStatsByUser,
  getMemoriesByIds,
  getMemoryById,
  insertMemory,
  listMemoriesByUser,
  updateMemoryArweaveTx,
} from "@/lib/db";
import { resolveUserArweaveKey } from "@/lib/arweave";
import { uploadTextToArweave } from "@/lib/turbo";
import type {
  MemoryDashboardStats,
  MemoryKind,
  MemoryListItem,
  MemoryRecord,
  MemorySearchResult,
  MemorySourceType,
} from "@/lib/types";
import { semanticSearchVectors, upsertMemoryVector } from "@/lib/vector";

export function getMemory(id: string): MemoryRecord | null {
  return getMemoryById(id);
}

export function getMemories(userId: string): MemoryListItem[] {
  return listMemoriesByUser(userId, 200);
}

export function getMemoryStats(userId: string): MemoryDashboardStats {
  return getDashboardStatsByUser(userId);
}

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

export async function createMemory(params: {
  userId: string;
  title?: string;
  sourceType: MemorySourceType;
  memoryType?: MemoryKind;
  importance?: number;
  tags?: string[] | string;
  text?: string;
  url?: string;
  file?: File;
}): Promise<MemoryRecord> {
  const parsed = await parseMemoryContent({
    sourceType: params.sourceType,
    text: params.text,
    url: params.url,
    file: params.file,
  });

  const memoryId = randomUUID();
  const title = cleanText(params.title ?? "") || parsed.fileName || "Untitled Memory";
  const contentHash = hashContent(parsed.contentText);
  const memoryType = params.memoryType ?? "episodic";
  const importance = normalizeImportance(params.importance);
  const tags = normalizeTags(params.tags);
  let arweaveTxId: string | null = null;
  try {
    const wallet = resolveUserArweaveKey(params.userId);
    arweaveTxId = await uploadTextToArweave({
      title,
      content: parsed.contentText,
      sourceType: params.sourceType,
      memoryType,
      importance,
      tags,
      jwk: wallet.key,
    });
  } catch (error) {
    console.error("Arweave upload failed during create; memory will remain local", error);
  }

  const memory: MemoryRecord = {
    id: memoryId,
    userId: params.userId,
    title,
    sourceType: params.sourceType,
    memoryType,
    importance,
    tags,
    sourceUrl: parsed.sourceUrl,
    fileName: parsed.fileName,
    contentText: parsed.contentText,
    contentHash,
    arweaveTxId,
    createdAt: new Date().toISOString(),
  };

  insertMemory(memory);

  try {
    const vector = await embedText(memory.contentText.slice(0, 6000));
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

  return memory;
}

export async function searchMemories(userId: string, query: string): Promise<MemorySearchResult[]> {
  const cleaned = cleanText(query);
  if (!cleaned) {
    return [];
  }

  const vector = await embedText(cleaned);
  const hits = await semanticSearchVectors({
    userId,
    query: cleaned,
    vector,
    topK: 15,
  });

  const ids = hits.map((hit) => hit.item.id);
  const memories = getMemoriesByIds(ids);
  const memoryById = new Map(memories.map((memory) => [memory.id, memory]));

  return hits
    .map((hit) => ({
      score: hit.score,
      memory: memoryById.get(hit.item.id),
    }))
    .filter((result): result is { score: number; memory: MemoryListItem } => Boolean(result.memory));
}

export async function getRelatedMemories(params: {
  userId: string;
  memoryId: string;
  contentText: string;
  topK?: number;
}): Promise<MemorySearchResult[]> {
  const vector = await embedText(params.contentText.slice(0, 6000));
  const hits = await semanticSearchVectors({
    userId: params.userId,
    query: params.contentText.slice(0, 600),
    vector,
    topK: (params.topK ?? 5) + 1,
  });

  const filtered = hits.filter((hit) => hit.item.id !== params.memoryId).slice(0, params.topK ?? 5);
  const ids = filtered.map((hit) => hit.item.id);
  const memories = getMemoriesByIds(ids);
  const memoryById = new Map(memories.map((memory) => [memory.id, memory]));

  return filtered
    .map((hit) => ({
      score: hit.score,
      memory: memoryById.get(hit.item.id),
    }))
    .filter((result): result is { score: number; memory: MemoryListItem } => Boolean(result.memory));
}

export async function commitMemoryToArweave(params: {
  userId: string;
  memoryId: string;
}): Promise<MemoryRecord> {
  const memory = getMemoryById(params.memoryId);
  if (!memory || memory.userId !== params.userId) {
    throw new Error("Memory not found");
  }

  if (memory.arweaveTxId) {
    return memory;
  }

  const wallet = resolveUserArweaveKey(params.userId);
  if (!wallet.key) {
    throw new Error("No Arweave wallet configured. Add one in Settings.");
  }

  const txId = await uploadTextToArweave({
    title: memory.title,
    content: memory.contentText,
    sourceType: memory.sourceType,
    memoryType: memory.memoryType,
    importance: memory.importance,
    tags: memory.tags,
    jwk: wallet.key,
  });

  if (!txId) {
    throw new Error("Arweave upload failed");
  }

  updateMemoryArweaveTx(memory.id, params.userId, txId);
  const updated = getMemoryById(memory.id);
  if (!updated) {
    throw new Error("Memory update failed after Arweave commit");
  }

  return updated;
}
