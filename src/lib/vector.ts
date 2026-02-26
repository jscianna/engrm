import { createClient, type Client } from "@libsql/client";

type MemoryVectorMetadata = {
  userId: string;
  memoryId: string;
  title: string;
  sourceType: string;
  memoryType: string;
  importance: number;
};

let db: Client | null = null;

function getDb(): Client {
  if (!db) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    
    if (!url) {
      throw new Error("TURSO_DATABASE_URL is required");
    }
    
    db = createClient({ url, authToken });
  }
  return db;
}

let initialized = false;

async function ensureVectorTable(): Promise<void> {
  if (initialized) return;
  
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
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
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

export async function upsertMemoryVector(params: {
  memoryId: string;
  userId: string;
  title: string;
  sourceType: string;
  memoryType: string;
  importance: number;
  vector: number[];
}): Promise<void> {
  try {
    await ensureVectorTable();
    const client = getDb();
    
    await client.execute({
      sql: `
        INSERT INTO memory_vectors (memory_id, user_id, title, source_type, memory_type, importance, vector_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(memory_id) DO UPDATE SET
          title = excluded.title,
          source_type = excluded.source_type,
          memory_type = excluded.memory_type,
          importance = excluded.importance,
          vector_json = excluded.vector_json
      `,
      args: [
        params.memoryId,
        params.userId,
        params.title,
        params.sourceType,
        params.memoryType,
        params.importance,
        JSON.stringify(params.vector),
      ],
    });
  } catch (error) {
    console.error("Vector upsert failed:", error);
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
}): Promise<VectorSearchResult[]> {
  try {
    await ensureVectorTable();
    const client = getDb();
    
    // Fetch all vectors for user (works fine for <10K memories)
    const result = await client.execute({
      sql: `
        SELECT memory_id, user_id, title, source_type, memory_type, importance, vector_json
        FROM memory_vectors
        WHERE user_id = ?
      `,
      args: [params.userId],
    });
    
    // Calculate similarities in-memory
    const scored = result.rows.map((row) => {
      const storedVector = JSON.parse(row.vector_json as string) as number[];
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
    });
    
    // Sort by score descending and take topK
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, params.topK ?? 10);
  } catch (error) {
    console.error("Vector search failed:", error);
    return [];
  }
}
