/**
 * Qdrant Vector Database Adapter
 * 
 * Drop-in replacement for Turso-based vector search.
 * Uses Qdrant Cloud free tier (1GB, ~100K vectors).
 * 
 * Environment:
 *   QDRANT_URL      - Cluster URL (e.g., https://xxx.us-east4-0.gcp.cloud.qdrant.io:6333)
 *   QDRANT_API_KEY  - API key from Qdrant Cloud dashboard
 *   QDRANT_COLLECTION - Optional override for the provider-specific default collection
 * 
 * Migration: Run migrateFromTurso() once to move existing vectors.
 */

import { createHash } from "node:crypto";
import { getDefaultQdrantCollectionName, getEmbeddingConfig } from "./embeddings";
import { getDb } from "./turso";

// =============================================================================
// Configuration
// =============================================================================

const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const EMBEDDING_CONFIG = getEmbeddingConfig();
const COLLECTION_NAME = process.env.QDRANT_COLLECTION || getDefaultQdrantCollectionName();
const ACTIVE_VECTOR_NAME = "embedding";

// =============================================================================
// Types
// =============================================================================

type QdrantPoint = {
  id: string;
  vector: number[];
  payload: {
    user_id: string;
    memory_id: string;
    title: string;
    source_type: string;
    memory_type: string;
    importance: number;
    created_at: string;
  };
};

type QdrantSearchResult = {
  id: string;
  score: number;
  payload: QdrantPoint["payload"];
};

type VectorSearchResult = {
  score: number;
  item: {
    id: string;
    metadata: {
      userId: string;
      memoryId: string;
      title: string;
      sourceType: string;
      memoryType: string;
      importance: number;
    };
  };
};

// =============================================================================
// Helpers
// =============================================================================

function isQdrantEnabled(): boolean {
  return Boolean(QDRANT_URL && QDRANT_API_KEY);
}

function toQdrantPointId(memoryId: string): string {
  const chars = createHash("sha256").update(memoryId).digest("hex").slice(0, 32).split("");
  chars[12] = "5";
  const variant = (Number.parseInt(chars[16] + chars[17], 16) & 0x3f) | 0x80;
  const variantHex = variant.toString(16).padStart(2, "0");
  chars[16] = variantHex[0];
  chars[17] = variantHex[1];
  const normalized = chars.join("");
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20, 32)}`;
}

async function qdrantFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  if (!QDRANT_URL || !QDRANT_API_KEY) {
    throw new Error("Qdrant not configured. Set QDRANT_URL and QDRANT_API_KEY.");
  }

  const url = `${QDRANT_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "api-key": QDRANT_API_KEY,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text().catch(() => "Unknown error");
    throw new Error(`Qdrant error (${response.status}): ${error}`);
  }

  return response;
}

// =============================================================================
// Collection Management
// =============================================================================

let collectionInitialized = false;

function collectionMatchesActiveSchema(collection: unknown): boolean {
  if (!collection || typeof collection !== "object") {
    return false;
  }

  const result = collection as {
    config?: { params?: { vectors?: { size?: number } | Record<string, { size?: number }> } };
  };
  const vectors = result.config?.params?.vectors;
  if (!vectors || typeof vectors !== "object") {
    return false;
  }

  if ("size" in vectors && typeof vectors.size === "number") {
    return vectors.size === EMBEDDING_CONFIG.dimension;
  }

  const named = vectors as Record<string, { size?: number }>;
  return named[ACTIVE_VECTOR_NAME]?.size === EMBEDDING_CONFIG.dimension;
}

/**
 * Ensure collection exists with correct schema
 */
export async function ensureCollection(): Promise<void> {
  if (!isQdrantEnabled() || collectionInitialized) return;

  try {
    // Check if collection exists
    const checkResponse = await qdrantFetch(`/collections/${COLLECTION_NAME}`);
    const checkData = await checkResponse.json();
    
    if (checkData.result) {
      if (!collectionMatchesActiveSchema(checkData.result)) {
        throw new Error(
          `[Qdrant] Collection "${COLLECTION_NAME}" does not match ${EMBEDDING_CONFIG.provider}/${EMBEDDING_CONFIG.model} (${EMBEDDING_CONFIG.dimension} dims). Use a fresh collection name or reindex into a new collection.`,
        );
      }
      collectionInitialized = true;
      return;
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("does not match")) {
      throw error;
    }
    if (!(error instanceof Error) || !error.message.includes("404")) {
      throw error;
    }
  }

  // Create a provider-specific collection for the active embedding config.
  await qdrantFetch(`/collections/${COLLECTION_NAME}`, {
    method: "PUT",
    body: JSON.stringify({
      vectors: {
        [ACTIVE_VECTOR_NAME]: { size: EMBEDDING_CONFIG.dimension, distance: "Cosine" },
      },
      // Optimize for filtering by user_id
      optimizers_config: {
        indexing_threshold: 1000,
      },
      // Create payload index for user_id filtering
      on_disk_payload: true,
    }),
  });

  // Create index on user_id for fast filtering
  await qdrantFetch(`/collections/${COLLECTION_NAME}/index`, {
    method: "PUT",
    body: JSON.stringify({
      field_name: "user_id",
      field_schema: "keyword",
    }),
  });

  collectionInitialized = true;
  console.log(`[Qdrant] Collection "${COLLECTION_NAME}" created`);
}

// =============================================================================
// Vector Operations
// =============================================================================

/**
 * Get vector name based on dimension
 */
function getVectorName(dimension: number): string {
  if (dimension === EMBEDDING_CONFIG.dimension) {
    return ACTIVE_VECTOR_NAME;
  }
  throw new Error(
    `Unsupported Qdrant vector dimension: ${dimension}. Expected ${EMBEDDING_CONFIG.dimension} for ${EMBEDDING_CONFIG.provider}/${EMBEDDING_CONFIG.model}.`,
  );
}

/**
 * Upsert a memory vector
 */
export async function upsertMemoryVector(params: {
  memoryId: string;
  userId: string;
  title: string;
  sourceType: string;
  memoryType: string;
  importance: number;
  vector: number[];
}): Promise<void> {
  if (!isQdrantEnabled()) {
    // Fallback to Turso if Qdrant not configured
    const { upsertMemoryVector: tursoUpsert } = await import("./vector");
    return tursoUpsert(params);
  }

  await ensureCollection();

  const vectorName = getVectorName(params.vector.length);

  await qdrantFetch(`/collections/${COLLECTION_NAME}/points`, {
    method: "PUT",
    body: JSON.stringify({
      points: [
        {
          id: toQdrantPointId(params.memoryId),
          vector: {
            [vectorName]: params.vector,
          },
          payload: {
            user_id: params.userId,
            memory_id: params.memoryId,
            title: params.title,
            source_type: params.sourceType,
            memory_type: params.memoryType,
            importance: params.importance,
            created_at: new Date().toISOString(),
          },
        },
      ],
    }),
  });

  try {
    const { upsertMemoryVector: tursoUpsert } = await import("./vector");
    await tursoUpsert(params);
  } catch (error) {
    console.warn("[Qdrant] Failed to mirror vector into Turso:", error);
  }
}

/**
 * Delete a memory vector
 */
export async function deleteMemoryVector(memoryId: string): Promise<void> {
  if (!isQdrantEnabled()) {
    const { deleteMemoryVector: tursoDelete } = await import("./vector");
    return tursoDelete(memoryId);
  }

  await ensureCollection();

  await qdrantFetch(`/collections/${COLLECTION_NAME}/points/delete`, {
    method: "POST",
    body: JSON.stringify({
      filter: {
        must: [{ key: "memory_id", match: { value: memoryId } }],
      },
    }),
  });

  try {
    const { deleteMemoryVector: tursoDelete } = await import("./vector");
    await tursoDelete(memoryId);
  } catch (error) {
    console.warn("[Qdrant] Failed to mirror vector delete into Turso:", error);
  }
}

/**
 * Delete all vectors for a user
 */
export async function deleteAllUserVectors(userId: string): Promise<number> {
  if (!isQdrantEnabled()) {
    const { deleteAllUserVectors: tursoDelete } = await import("./vector");
    return tursoDelete(userId);
  }

  await ensureCollection();

  // Count first
  const countResponse = await qdrantFetch(`/collections/${COLLECTION_NAME}/points/count`, {
    method: "POST",
    body: JSON.stringify({
      filter: {
        must: [{ key: "user_id", match: { value: userId } }],
      },
    }),
  });
  const countData = await countResponse.json();
  const count = countData.result?.count ?? 0;

  // Delete by filter
  await qdrantFetch(`/collections/${COLLECTION_NAME}/points/delete`, {
    method: "POST",
    body: JSON.stringify({
      filter: {
        must: [{ key: "user_id", match: { value: userId } }],
      },
    }),
  });

  try {
    const { deleteAllUserVectors: tursoDelete } = await import("./vector");
    await tursoDelete(userId);
  } catch (error) {
    console.warn("[Qdrant] Failed to mirror user vector delete into Turso:", error);
  }

  return count;
}

/**
 * Semantic search for similar vectors
 */
export async function semanticSearchVectors(params: {
  userId: string;
  query: string;
  vector: number[];
  topK?: number;
  since?: string;
}): Promise<VectorSearchResult[]> {
  if (!isQdrantEnabled()) {
    const { semanticSearchVectors: tursoSearch } = await import("./vector");
    return tursoSearch(params);
  }

  await ensureCollection();

  const vectorName = getVectorName(params.vector.length);
  const topK = params.topK ?? 10;
  const must: Array<Record<string, unknown>> = [{ key: "user_id", match: { value: params.userId } }];
  if (params.since) {
    must.push({ key: "created_at", range: { gte: params.since } });
  }

  const response = await qdrantFetch(`/collections/${COLLECTION_NAME}/points/search`, {
    method: "POST",
    body: JSON.stringify({
      vector: {
        name: vectorName,
        vector: params.vector,
      },
      filter: { must },
      limit: topK,
      with_payload: true,
    }),
  });

  const data = await response.json();
  const results: QdrantSearchResult[] = data.result ?? [];

  return results.map((hit) => ({
    score: hit.score,
    item: {
      id: hit.payload.memory_id,
      metadata: {
        userId: hit.payload.user_id,
        memoryId: hit.payload.memory_id,
        title: hit.payload.title,
        sourceType: hit.payload.source_type,
        memoryType: hit.payload.memory_type,
        importance: hit.payload.importance,
      },
    },
  }));
}

/**
 * Direct vector search using a caller-provided vector.
 */
export async function semanticSearchVectorsDirect(params: {
  userId: string;
  vector: number[];
  topK?: number;
  since?: string;
}): Promise<Array<{ id: string; score: number }>> {
  if (!isQdrantEnabled()) {
    const { semanticSearchVectorsDirect: tursoSearch } = await import("./vector");
    return tursoSearch(params);
  }

  const results = await semanticSearchVectors({
    userId: params.userId,
    query: "", // Not used in Qdrant
    vector: params.vector,
    topK: params.topK,
    since: params.since,
  });

  return results.map((r) => ({
    id: r.item.id,
    score: r.score,
  }));
}

// =============================================================================
// Migration
// =============================================================================

/**
 * Migrate vectors from Turso to Qdrant
 * Run once during setup, then switch to Qdrant
 */
export async function migrateFromTurso(userId?: string): Promise<{
  migrated: number;
  failed: number;
  skipped: number;
}> {
  if (!isQdrantEnabled()) {
    throw new Error("Qdrant not configured. Set QDRANT_URL and QDRANT_API_KEY.");
  }

  await ensureCollection();
  const client = getDb();

  const stats = { migrated: 0, failed: 0, skipped: 0 };

  // Fetch all vectors from Turso (vector_dimension may not exist in older schemas)
  const result = await client.execute({
    sql: userId
      ? `SELECT memory_id, user_id, title, source_type, memory_type, importance, vector_json
         FROM memory_vectors WHERE user_id = ?`
      : `SELECT memory_id, user_id, title, source_type, memory_type, importance, vector_json
         FROM memory_vectors`,
    args: userId ? [userId] : [],
  });

  console.log(`[Migration] Found ${result.rows.length} vectors to migrate`);

  // Batch upsert to Qdrant (100 at a time)
  const BATCH_SIZE = 100;
  const points: Array<{
    id: string;
    vector: Record<string, number[]>;
    payload: QdrantPoint["payload"];
  }> = [];

  for (const row of result.rows) {
    try {
      const vectorJson = row.vector_json as string;
      const vector = JSON.parse(vectorJson) as number[];
      const dimension = vector.length; // Infer from actual vector
      if (dimension !== EMBEDDING_CONFIG.dimension) {
        stats.skipped++;
        continue;
      }
      const vectorName = getVectorName(dimension);

      points.push({
        id: toQdrantPointId(row.memory_id as string),
        vector: { [vectorName]: vector },
        payload: {
          user_id: row.user_id as string,
          memory_id: row.memory_id as string,
          title: row.title as string,
          source_type: row.source_type as string,
          memory_type: row.memory_type as string,
          importance: row.importance as number,
          created_at: new Date().toISOString(),
        },
      });

      if (points.length >= BATCH_SIZE) {
        await qdrantFetch(`/collections/${COLLECTION_NAME}/points`, {
          method: "PUT",
          body: JSON.stringify({ points }),
        });
        stats.migrated += points.length;
        console.log(`[Migration] Migrated ${stats.migrated} vectors...`);
        points.length = 0;
      }
    } catch (error) {
      console.error(`[Migration] Failed to migrate ${row.memory_id}:`, error);
      stats.failed++;
    }
  }

  // Final batch
  if (points.length > 0) {
    await qdrantFetch(`/collections/${COLLECTION_NAME}/points`, {
      method: "PUT",
      body: JSON.stringify({ points }),
    });
    stats.migrated += points.length;
  }

  console.log(`[Migration] Complete: ${stats.migrated} migrated, ${stats.failed} failed`);
  return stats;
}

/**
 * Check if Qdrant is available and configured
 */
export function getQdrantStatus(): {
  enabled: boolean;
  url: string | null;
  collection: string;
  dimension: number;
  provider: string;
  model: string;
} {
  return {
    enabled: isQdrantEnabled(),
    url: QDRANT_URL ?? null,
    collection: COLLECTION_NAME,
    dimension: EMBEDDING_CONFIG.dimension,
    provider: EMBEDDING_CONFIG.provider,
    model: EMBEDDING_CONFIG.model,
  };
}
