/**
 * Qdrant Vector Database Adapter
 * 
 * Drop-in replacement for Turso-based vector search.
 * Uses Qdrant Cloud free tier (1GB, ~100K vectors).
 * 
 * Environment:
 *   QDRANT_URL      - Cluster URL (e.g., https://xxx.us-east4-0.gcp.cloud.qdrant.io:6333)
 *   QDRANT_API_KEY  - API key from Qdrant Cloud dashboard
 *   QDRANT_COLLECTION - Collection name (default: "memories")
 * 
 * Migration: Run migrateFromTurso() once to move existing vectors.
 */

import { getDb } from "./turso";

// =============================================================================
// Configuration
// =============================================================================

const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const COLLECTION_NAME = process.env.QDRANT_COLLECTION || "memories";

// Supported embedding dimensions
export const EMBEDDING_DIMENSIONS = {
  "all-MiniLM-L6-v2": 384,
  "text-embedding-ada-002": 1536,
  "text-embedding-3-small": 1536,
} as const;

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

/**
 * Ensure collection exists with correct schema
 * Supports multi-vector (384 + 1536 dim) via named vectors
 */
export async function ensureCollection(): Promise<void> {
  if (!isQdrantEnabled() || collectionInitialized) return;

  try {
    // Check if collection exists
    const checkResponse = await qdrantFetch(`/collections/${COLLECTION_NAME}`);
    const checkData = await checkResponse.json();
    
    if (checkData.result) {
      collectionInitialized = true;
      return;
    }
  } catch {
    // Collection doesn't exist, create it
  }

  // Create collection with named vectors for both dimensions
  await qdrantFetch(`/collections/${COLLECTION_NAME}`, {
    method: "PUT",
    body: JSON.stringify({
      vectors: {
        // Named vectors for different embedding models
        "minilm": { size: 384, distance: "Cosine" },
        "openai": { size: 1536, distance: "Cosine" },
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
function getVectorName(dimension: number): "minilm" | "openai" {
  if (dimension === 384) {
    return "minilm";
  }
  if (dimension === 1536) {
    return "openai";
  }
  throw new Error(
    `Unsupported Qdrant vector dimension: ${dimension}. Expected 384 or 1536.`,
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
          id: params.memoryId, // Use memory ID as point ID (UUID)
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
      points: [memoryId],
    }),
  });
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
      const vectorName = getVectorName(dimension);

      points.push({
        id: row.memory_id as string,
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
} {
  return {
    enabled: isQdrantEnabled(),
    url: QDRANT_URL ?? null,
    collection: COLLECTION_NAME,
  };
}
