/**
 * Vector storage and search
 * Uses shared Turso client
 * 
 * Note: Current implementation loads all vectors for search.
 * For >10K memories, migrate to a vector DB (Pinecone, Qdrant, etc.)
 * Data is portable - vectors stored as JSON, easy to export.
 */

import { ensureDatabaseMigrations } from "./db-migrations";
import { getDb } from "./turso";

// Expected embedding dimensions by model
export const EMBEDDING_DIMENSIONS = {
  "all-MiniLM-L6-v2": 384,
  "text-embedding-ada-002": 1536,
  "text-embedding-3-small": 1536,
} as const;

// Default dimension for validation
const DEFAULT_DIMENSION = 384; // MiniLM

type MemoryVectorMetadata = {
  userId: string;
  memoryId: string;
  title: string;
  sourceType: string;
  memoryType: string;
  importance: number;
};

let initialized = false;

async function ensureVectorTable(): Promise<void> {
  if (initialized) return;

  await ensureDatabaseMigrations();
  const client = getDb();
  await client.execute(`
    CREATE TABLE IF NOT EXISTS memory_vectors (
      memory_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      source_type TEXT NOT NULL,
      memory_type TEXT NOT NULL,
      importance INTEGER NOT NULL,
      vector_json TEXT NOT NULL,
      vector_dimension INTEGER NOT NULL DEFAULT 384,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migrate: Add vector_dimension column if it doesn't exist (backward compatibility)
  try {
    await client.execute(`
      ALTER TABLE memory_vectors ADD COLUMN vector_dimension INTEGER NOT NULL DEFAULT 384
    `);
  } catch {
    // Column already exists or table is new - either is fine
  }

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_vectors_user_id ON memory_vectors(user_id)
  `);

  initialized = true;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Validate vector dimensions
 */
export function validateVector(vector: number[], expectedDimension?: number): { valid: boolean; error?: string } {
  const dim = expectedDimension ?? DEFAULT_DIMENSION;
  
  if (!Array.isArray(vector)) {
    return { valid: false, error: "Vector must be an array" };
  }
  
  if (vector.length === 0) {
    return { valid: false, error: "Vector cannot be empty" };
  }
  
  if (vector.length !== dim) {
    return { valid: false, error: `Vector dimension mismatch: expected ${dim}, got ${vector.length}` };
  }
  
  if (!vector.every((v) => typeof v === "number" && !isNaN(v) && isFinite(v))) {
    return { valid: false, error: "Vector must contain only valid finite numbers" };
  }
  
  return { valid: true };
}

export async function upsertMemoryVector(params: {
  memoryId: string;
  userId: string;
  title: string;
  sourceType: string;
  memoryType: string;
  importance: number;
  vector: number[];
}): Promise<void> {
  // Validate vector
  const validation = validateVector(params.vector);
  if (!validation.valid) {
    console.error(`Vector validation failed: ${validation.error}`);
    throw new Error(validation.error);
  }

  try {
    await ensureVectorTable();
    const client = getDb();

    await client.execute({
      sql: `
        INSERT INTO memory_vectors (memory_id, user_id, title, source_type, memory_type, importance, vector_json, vector_dimension)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(memory_id) DO UPDATE SET
          title = excluded.title,
          source_type = excluded.source_type,
          memory_type = excluded.memory_type,
          importance = excluded.importance,
          vector_json = excluded.vector_json,
          vector_dimension = excluded.vector_dimension
      `,
      args: [
        params.memoryId,
        params.userId,
        params.title,
        params.sourceType,
        params.memoryType,
        params.importance,
        JSON.stringify(params.vector),
        params.vector.length,
      ],
    });
  } catch (error) {
    console.error("Vector upsert failed:", error);
    throw error;
  }
}

/**
 * Delete vector when memory is deleted
 */
export async function deleteMemoryVector(memoryId: string): Promise<void> {
  try {
    await ensureVectorTable();
    const client = getDb();

    await client.execute({
      sql: `DELETE FROM memory_vectors WHERE memory_id = ?`,
      args: [memoryId],
    });
  } catch (error) {
    console.error("Vector delete failed:", error);
    // Don't throw - vector deletion is best-effort cleanup
  }
}

/**
 * Delete all vectors for a user (account deletion)
 */
export async function deleteAllUserVectors(userId: string): Promise<number> {
  try {
    await ensureVectorTable();
    const client = getDb();

    const result = await client.execute({
      sql: `DELETE FROM memory_vectors WHERE user_id = ?`,
      args: [userId],
    });
    
    return result.rowsAffected ?? 0;
  } catch (error) {
    console.error("User vector deletion failed:", error);
    return 0;
  }
}

type VectorSearchResult = {
  score: number;
  item: { id: string; metadata: MemoryVectorMetadata };
};

export async function semanticSearchVectors(params: {
  userId: string;
  query: string;
  vector: number[];
  topK?: number;
  since?: string;
}): Promise<VectorSearchResult[]> {
  // Validate query vector
  const validation = validateVector(params.vector);
  if (!validation.valid) {
    console.error(`Search vector validation failed: ${validation.error}`);
    return [];
  }

  try {
    await ensureVectorTable();
    const client = getDb();

    // Fetch all vectors for user
    // TODO: For >10K memories, migrate to vector DB
    const result = await client.execute({
      sql: `
        SELECT v.memory_id, v.user_id, v.title, v.source_type, v.memory_type, v.importance, v.vector_json, v.vector_dimension
        FROM memory_vectors v
        JOIN memories m ON m.id = v.memory_id
        WHERE v.user_id = ?
        AND m.archived_at IS NULL
        ${params.since ? "AND m.created_at >= ?" : ""}
      `,
      args: params.since ? [params.userId, params.since] : [params.userId],
    });

    // Calculate similarities in-memory
    const scored = result.rows
      .map((row) => {
        const storedVector = JSON.parse(row.vector_json as string) as number[];
        const storedDimension = Number(row.vector_dimension ?? storedVector.length);
        
        // Skip vectors with mismatched dimensions
        if (storedDimension !== params.vector.length) {
          console.warn(`Skipping vector ${row.memory_id}: dimension mismatch (${storedDimension} vs ${params.vector.length})`);
          return null;
        }
        
        const score = cosineSimilarity(params.vector, storedVector);

        return {
          score,
          item: {
            id: row.memory_id as string,
            metadata: {
              memoryId: row.memory_id as string,
              userId: row.user_id as string,
              title: row.title as string,
              sourceType: row.source_type as string,
              memoryType: row.memory_type as string,
              importance: row.importance as number,
            },
          },
        };
      })
      .filter((item): item is VectorSearchResult => item !== null);

    // Sort by score descending and take topK
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, params.topK ?? 10);
  } catch (error) {
    console.error("Vector search failed:", error);
    return [];
  }
}

/**
 * Search vectors directly when the client provides a pre-computed vector.
 */
export async function semanticSearchVectorsDirect(params: {
  userId: string;
  vector: number[];
  topK?: number;
  since?: string;
}): Promise<Array<{ id: string; score: number }>> {
  // Validate query vector
  const validation = validateVector(params.vector);
  if (!validation.valid) {
    console.error(`Search vector validation failed: ${validation.error}`);
    return [];
  }

  try {
    await ensureVectorTable();
    const client = getDb();

    const result = await client.execute({
      sql: `
        SELECT v.memory_id, v.vector_json, v.vector_dimension
        FROM memory_vectors v
        JOIN memories m ON m.id = v.memory_id
        WHERE v.user_id = ?
        AND m.archived_at IS NULL
        ${params.since ? "AND m.created_at >= ?" : ""}
      `,
      args: params.since ? [params.userId, params.since] : [params.userId],
    });

    const scored = result.rows
      .map((row) => {
        const storedVector = JSON.parse(row.vector_json as string) as number[];
        const storedDimension = Number(row.vector_dimension ?? storedVector.length);
        
        // Skip vectors with mismatched dimensions
        if (storedDimension !== params.vector.length) {
          return null;
        }
        
        const score = cosineSimilarity(params.vector, storedVector);
        return {
          id: row.memory_id as string,
          score,
        };
      })
      .filter((item): item is { id: string; score: number } => item !== null);

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, params.topK ?? 10);
  } catch (error) {
    console.error("Vector search failed:", error);
    return [];
  }
}
