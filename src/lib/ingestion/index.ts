/**
 * Document ingestion pipeline.
 *
 * Chunks documents and stores each chunk as a memory in the core memory system.
 * This replaces the old chatbot-specific ingestion with a generic pipeline.
 */

import { chunkText } from "@/lib/ingestion/chunker";
import { createMemory } from "@/lib/memories";
import type { IngestDocumentOptions, IngestResult, ContentType } from "@/lib/ingestion/types";

function resolveChunkType(contentType: ContentType): "text" | "markdown" {
  return contentType === "markdown" ? "markdown" : "text";
}

/**
 * Ingest a document by chunking it and storing each chunk as a memory.
 *
 * Each chunk becomes a separate memory record with:
 * - sourceType: "document"
 * - memoryType: "semantic"
 * - Tags from metadata + "ingested" tag
 * - Title derived from the document title + chunk index
 */
export async function ingestDocument(
  options: IngestDocumentOptions,
): Promise<IngestResult> {
  const { content, contentType, userId, title, metadata } = options;

  if (!content || !content.trim()) {
    return { chunks: 0, memoriesCreated: 0 };
  }

  const chunks = chunkText(content, {
    type: resolveChunkType(contentType),
    chunkSize: 512,
    overlap: 50,
  });

  if (chunks.length === 0) {
    return { chunks: 0, memoriesCreated: 0 };
  }

  let memoriesCreated = 0;
  const baseTags = ["ingested"];
  if (metadata) {
    for (const [key, value] of Object.entries(metadata)) {
      baseTags.push(`${key}:${value}`);
    }
  }

  for (const chunk of chunks) {
    const chunkTitle = title
      ? `${title} [chunk ${chunk.chunkIndex + 1}/${chunks.length}]`
      : `Document chunk ${chunk.chunkIndex + 1}/${chunks.length}`;

    const tags = [...baseTags];
    if (chunk.metadata.sectionHeader) {
      tags.push(`section:${chunk.metadata.sectionHeader}`);
    }

    await createMemory({
      userId,
      title: chunkTitle,
      sourceType: "text",
      memoryType: "semantic",
      importance: 0.5,
      tags,
      text: chunk.content,
    });
    memoriesCreated += 1;
  }

  return { chunks: chunks.length, memoriesCreated };
}
