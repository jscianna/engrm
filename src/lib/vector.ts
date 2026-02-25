import fs from "node:fs";
import path from "node:path";
import { LocalIndex } from "vectra";

type MemoryVectorMetadata = {
  userId: string;
  memoryId: string;
  title: string;
  sourceType: string;
};

const indexPath = path.join(process.cwd(), "data", "vectra");
fs.mkdirSync(indexPath, { recursive: true });

let indexPromise: Promise<LocalIndex<MemoryVectorMetadata>> | null = null;

async function getIndex(): Promise<LocalIndex<MemoryVectorMetadata>> {
  if (!indexPromise) {
    indexPromise = (async () => {
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
    })();
  }

  return indexPromise;
}

export async function upsertMemoryVector(params: {
  memoryId: string;
  userId: string;
  title: string;
  sourceType: string;
  vector: number[];
}) {
  const index = await getIndex();
  await index.upsertItem({
    id: params.memoryId,
    vector: params.vector,
    metadata: {
      memoryId: params.memoryId,
      userId: params.userId,
      title: params.title,
      sourceType: params.sourceType,
    },
  });
}

export async function semanticSearchVectors(params: {
  userId: string;
  query: string;
  vector: number[];
  topK?: number;
}) {
  const index = await getIndex();
  return index.queryItems(params.vector, params.query, params.topK ?? 10, {
    userId: { $eq: params.userId },
  });
}
