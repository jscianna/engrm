/**
 * Types for the document ingestion pipeline.
 * This replaces the chatbot-specific ingestion with a generic document → memory pipeline.
 */

export type ContentType = "text" | "markdown" | "url";

export interface IngestDocumentOptions {
  /** Raw document content */
  content: string;
  /** Content type for chunking strategy */
  contentType: ContentType;
  /** User who owns this ingestion */
  userId: string;
  /** Optional document title */
  title?: string;
  /** Arbitrary metadata to attach to each memory */
  metadata?: Record<string, string>;
}

export interface IngestResult {
  /** Number of chunks created from the document */
  chunks: number;
  /** Number of memories stored */
  memoriesCreated: number;
}

export interface ChunkOptions {
  /** Max tokens per chunk (default: 512) */
  chunkSize?: number;
  /** Overlap tokens between chunks (default: 50) */
  overlap?: number;
}
