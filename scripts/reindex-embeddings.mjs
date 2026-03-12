import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const VOYAGE_EMBEDDINGS_URL = "https://api.voyageai.com/v1/embeddings";
const DEFAULT_VOYAGE_MODEL = "voyage-4-lite";
const DEFAULT_VOYAGE_DIMENSION = 1024;
const ACTIVE_VECTOR_NAME = "embedding";

function sanitizeSegment(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function parseDimension(value, fallback) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv) {
  const options = {
    userId: null,
    limit: null,
    batchSize: 32,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--user-id") {
      options.userId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--limit") {
      options.limit = Number.parseInt(argv[index + 1] ?? "", 10) || null;
      index += 1;
      continue;
    }
    if (arg === "--batch-size") {
      options.batchSize = Math.max(1, Number.parseInt(argv[index + 1] ?? "", 10) || options.batchSize);
      index += 1;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
    }
  }

  return options;
}

function resolveEmbeddingConfig() {
  const provider = (process.env.EMBEDDING_PROVIDER || (process.env.VOYAGE_API_KEY ? "voyage" : "openai")).trim().toLowerCase();
  if (provider !== "voyage") {
    throw new Error(
      `This reindex script currently targets Voyage embeddings. Set EMBEDDING_PROVIDER=voyage or configure VOYAGE_API_KEY. Current provider: ${provider}`,
    );
  }

  const model = process.env.EMBEDDING_MODEL || process.env.VOYAGE_EMBEDDING_MODEL || DEFAULT_VOYAGE_MODEL;
  const dimension = parseDimension(
    process.env.EMBEDDING_DIMENSION || process.env.VOYAGE_EMBEDDING_DIMENSION,
    DEFAULT_VOYAGE_DIMENSION,
  );
  return { provider, model, dimension };
}

function getCollectionName(config) {
  return process.env.QDRANT_COLLECTION || `memories-${sanitizeSegment(config.provider)}-${sanitizeSegment(config.model)}-${config.dimension}`;
}

function getDb() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) {
    throw new Error("TURSO_DATABASE_URL is required");
  }
  return createClient({ url, authToken });
}

async function qdrantFetch(path, options = {}) {
  const qdrantUrl = process.env.QDRANT_URL;
  const qdrantApiKey = process.env.QDRANT_API_KEY;
  if (!qdrantUrl || !qdrantApiKey) {
    throw new Error("QDRANT_URL and QDRANT_API_KEY are required to reindex Qdrant");
  }

  const response = await fetch(`${qdrantUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "api-key": qdrantApiKey,
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Qdrant error ${response.status}: ${await response.text()}`);
  }

  return response;
}

function collectionMatchesActiveSchema(collection, expectedDimension) {
  const vectors = collection?.config?.params?.vectors;
  if (!vectors || typeof vectors !== "object") {
    return false;
  }

  if (typeof vectors.size === "number") {
    return vectors.size === expectedDimension;
  }

  return vectors[ACTIVE_VECTOR_NAME]?.size === expectedDimension;
}

async function ensureQdrantCollection(collectionName, config) {
  try {
    const response = await qdrantFetch(`/collections/${collectionName}`);
    const data = await response.json();
    if (data.result) {
      if (!collectionMatchesActiveSchema(data.result, config.dimension)) {
        throw new Error(
          `Collection "${collectionName}" does not match ${config.provider}/${config.model} (${config.dimension} dims). Point QDRANT_COLLECTION at a fresh collection before reindexing.`,
        );
      }
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

  await qdrantFetch(`/collections/${collectionName}`, {
    method: "PUT",
    body: JSON.stringify({
      vectors: {
        [ACTIVE_VECTOR_NAME]: { size: config.dimension, distance: "Cosine" },
      },
      optimizers_config: {
        indexing_threshold: 1000,
      },
      on_disk_payload: true,
    }),
  });

  await qdrantFetch(`/collections/${collectionName}/index`, {
    method: "PUT",
    body: JSON.stringify({
      field_name: "user_id",
      field_schema: "keyword",
    }),
  });
}

async function fetchVoyageEmbeddings(inputs, config) {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error("VOYAGE_API_KEY is required");
  }

  const response = await fetch(VOYAGE_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      input: inputs,
      input_type: "document",
      output_dimension: config.dimension,
    }),
  });

  if (!response.ok) {
    throw new Error(`Voyage embeddings failed with ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const embeddings = Array.isArray(data.data)
    ? data.data.map((item) => item.embedding)
    : Array.isArray(data.embeddings)
      ? data.embeddings
      : [];

  if (embeddings.length !== inputs.length) {
    throw new Error(`Voyage returned ${embeddings.length} embeddings for ${inputs.length} inputs`);
  }

  return embeddings;
}

async function ensureVectorTable(db) {
  await db.execute(`
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
  try {
    await db.execute(`
      ALTER TABLE memory_vectors ADD COLUMN vector_dimension INTEGER NOT NULL DEFAULT 384
    `);
  } catch {
    // Column already exists.
  }
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_vectors_user_id ON memory_vectors(user_id)`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const config = resolveEmbeddingConfig();
  const collectionName = getCollectionName(config);
  const db = getDb();

  await ensureVectorTable(db);
  await ensureQdrantCollection(collectionName, config);

  const conditions = ["content_encrypted = 0", "archived_at IS NULL"];
  const args = [];
  if (options.userId) {
    conditions.push("user_id = ?");
    args.push(options.userId);
  }

  let sql = `
    SELECT id, user_id, title, source_type, memory_type, importance, content_text
    FROM memories
    WHERE ${conditions.join(" AND ")}
    ORDER BY created_at ASC
  `;
  if (options.limit) {
    sql += " LIMIT ?";
    args.push(options.limit);
  }

  const result = await db.execute({ sql, args });
  const rows = result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    sourceType: row.source_type,
    memoryType: row.memory_type,
    importance: Number(row.importance ?? 5),
    contentText: String(row.content_text ?? "").slice(0, 6000),
  }));

  if (rows.length === 0) {
    console.log("No non-encrypted memories found for reindexing.");
    return;
  }

  console.log(
    `Reindexing ${rows.length} memories with ${config.provider}/${config.model} (${config.dimension} dims) into ${collectionName}${options.dryRun ? " [dry run]" : ""}`,
  );

  let processed = 0;
  for (let offset = 0; offset < rows.length; offset += options.batchSize) {
    const batch = rows.slice(offset, offset + options.batchSize);
    const embeddings = await fetchVoyageEmbeddings(
      batch.map((row) => row.contentText),
      config,
    );

    if (!options.dryRun) {
      await qdrantFetch(`/collections/${collectionName}/points`, {
        method: "PUT",
        body: JSON.stringify({
          points: batch.map((row, index) => ({
            id: row.id,
            vector: {
              [ACTIVE_VECTOR_NAME]: embeddings[index],
            },
            payload: {
              user_id: row.userId,
              memory_id: row.id,
              title: row.title,
              source_type: row.sourceType,
              memory_type: row.memoryType,
              importance: row.importance,
              created_at: new Date().toISOString(),
            },
          })),
        }),
      });

      for (let index = 0; index < batch.length; index += 1) {
        const row = batch[index];
        await db.execute({
          sql: `
            INSERT INTO memory_vectors (
              memory_id, user_id, title, source_type, memory_type, importance, vector_json, vector_dimension
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(memory_id) DO UPDATE SET
              user_id = excluded.user_id,
              title = excluded.title,
              source_type = excluded.source_type,
              memory_type = excluded.memory_type,
              importance = excluded.importance,
              vector_json = excluded.vector_json,
              vector_dimension = excluded.vector_dimension
          `,
          args: [
            row.id,
            row.userId,
            row.title,
            row.sourceType,
            row.memoryType,
            row.importance,
            JSON.stringify(embeddings[index]),
            config.dimension,
          ],
        });
      }
    }

    processed += batch.length;
    console.log(`Processed ${processed}/${rows.length}`);
  }

  console.log("Reindex complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
