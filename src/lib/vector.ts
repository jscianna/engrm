import type { LocalIndex } from "vectra";

type MemoryVectorMetadata = {
  userId: string;
  memoryId: string;
  title: string;
  sourceType: string;
  memoryType: string;
  importance: number;
};

let indexPromise: Promise<LocalIndex<MemoryVectorMetadata> | null> | null = null;

async function getIndex(): Promise<LocalIndex<MemoryVectorMetadata> | null> {
  if (!indexPromise) {
    indexPromise = (async () => {
      try {
        // Dynamic imports to avoid crashes on serverless
        const fs = await import("node:fs");
        const path = await import("node:path");
        const { LocalIndex } = await import("vectra");
        
        const indexPath = path.join(process.cwd(), "data", "vectra");
        fs.mkdirSync(indexPath, { recursive: true });
        
        const index = new LocalIndex<MemoryVectorMetadata>(indexPath);
        if (!(await index.isIndexCreated())) {
          await index.createIndex({
            version: 2,
            metadata_config: {
              indexed: ["userId", "memoryId", "sourceType"],
            },
          });
        }
        return index;
      } catch (error) {
        console.warn("Vector index unavailable (likely serverless environment):", error);
        return null;
      }
    })();
  }

  return indexPromise;
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
    const index = await getIndex();
    if (!index) {
      console.warn("Skipping vector upsert: index unavailable");
      return;
    }
    await index.upsertItem({
      id: params.memoryId,
      vector: params.vector,
      metadata: {
        memoryId: params.memoryId,
        userId: params.userId,
        title: params.title,
        sourceType: params.sourceType,
        memoryType: params.memoryType,
        importance: params.importance,
      },
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
    const index = await getIndex();
    if (!index) {
      console.warn("Skipping vector search: index unavailable");
      return [];
    }
    return await index.queryItems(params.vector, params.query, params.topK ?? 10, {
      userId: { $eq: params.userId },
    });
  } catch (error) {
    console.error("Vector search failed:", error);
    return [];
  }
}
