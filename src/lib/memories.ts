import { randomUUID } from "node:crypto";
import { embedText } from "@/lib/embeddings";
import { cleanText, extractUrlContent, hashContent } from "@/lib/content";
import { getMemoriesByIds, getMemoryById, insertMemory, listMemoriesByUser } from "@/lib/db";
import { uploadTextToArweave } from "@/lib/turbo";
import type { MemoryListItem, MemoryRecord, MemorySearchResult, MemorySourceType } from "@/lib/types";
import { semanticSearchVectors, upsertMemoryVector } from "@/lib/vector";

export function getMemory(id: string): MemoryRecord | null {
  return getMemoryById(id);
}

export function getMemories(userId: string): MemoryListItem[] {
  return listMemoriesByUser(userId, 200);
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

  const arweaveTxId = await uploadTextToArweave({
    title,
    content: parsed.contentText,
    sourceType: params.sourceType,
  });

  const memory: MemoryRecord = {
    id: memoryId,
    userId: params.userId,
    title,
    sourceType: params.sourceType,
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
