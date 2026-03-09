#!/usr/bin/env npx tsx

import crypto from "node:crypto";
import { createClient } from "@libsql/client";
import { ensureCollection, getQdrantStatus } from "../src/lib/qdrant";

const OPENAI_MODEL = "text-embedding-3-large";
const OPENAI_DIMENSIONS = 3072;
const OPENAI_MAX_INPUT_CHARS = 8000;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_DELAY_MS = 200;
const MAX_RETRIES = 5;

type MemoryRow = {
  id: string;
  user_id: string;
  title: string;
  source_type: string;
  memory_type: string;
  importance: number;
  content_text: string;
  content_encrypted: number | null;
};

type Args = {
  apiKey?: string;
  userId?: string;
  batchSize: number;
  delayMs: number;
  limit?: number;
};

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--api-key" && next) {
      args.apiKey = next;
      i++;
      continue;
    }
    if (arg === "--user-id" && next) {
      args.userId = next;
      i++;
      continue;
    }
    if (arg === "--batch-size" && next) {
      args.batchSize = Number(next);
      i++;
      continue;
    }
    if (arg === "--delay-ms" && next) {
      args.delayMs = Number(next);
      i++;
      continue;
    }
    if (arg === "--limit" && next) {
      args.limit = Number(next);
      i++;
      continue;
    }
  }

  if (!args.apiKey && !args.userId) {
    throw new Error(
      "Usage: npx tsx scripts/migrate-embeddings-large.ts (--api-key <mem_...> | --user-id <user_...>) [--batch-size 10] [--delay-ms 200] [--limit N]"
    );
  }

  return {
    apiKey: args.apiKey,
    userId: args.userId,
    batchSize: Number.isFinite(args.batchSize) && (args.batchSize as number) > 0 ? Number(args.batchSize) : DEFAULT_BATCH_SIZE,
    delayMs: Number.isFinite(args.delayMs) && (args.delayMs as number) >= 0 ? Number(args.delayMs) : DEFAULT_DELAY_MS,
    limit: Number.isFinite(args.limit) && (args.limit as number) > 0 ? Number(args.limit) : undefined,
  };
}

function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key, "utf8").digest("hex");
}

function getMasterKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY is required");
  }

  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  const maybeBase64 = Buffer.from(trimmed, "base64");
  if (maybeBase64.length === 32) {
    return maybeBase64;
  }

  return crypto.createHash("sha256").update(trimmed, "utf8").digest();
}

function deriveUserKey(userId: string): Buffer {
  const master = getMasterKey();
  return crypto.createHash("sha256").update(Buffer.concat([master, Buffer.from(userId, "utf8")])).digest();
}

function decryptAesGcm(payload: { ciphertext: string; iv: string }, key: Buffer): Buffer {
  const [ciphertextB64, authTagB64] = payload.ciphertext.split(".");
  if (!ciphertextB64 || !authTagB64) {
    throw new Error("Invalid encrypted payload format");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]);
}

function decryptMemoryContent(contentText: string, userId: string): string {
  const payload = JSON.parse(contentText) as { ciphertext: string; iv: string };
  const key = deriveUserKey(userId);
  return decryptAesGcm(payload, key).toString("utf8");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function embedBatch(inputs: string[], attempt = 1): Promise<number[][]> {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    throw new Error("OPENAI_API_KEY is required");
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: inputs.map((input) => input.slice(0, OPENAI_MAX_INPUT_CHARS)),
      dimensions: OPENAI_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    const retryable = response.status === 429 || response.status >= 500;

    if (retryable && attempt < MAX_RETRIES) {
      const backoffMs = Math.min(1000 * 2 ** (attempt - 1), 10000);
      console.warn(`[Migration] OpenAI ${response.status}. Retry ${attempt}/${MAX_RETRIES - 1} in ${backoffMs}ms`);
      await sleep(backoffMs);
      return embedBatch(inputs, attempt + 1);
    }

    throw new Error(`OpenAI embeddings failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
  const embeddings = (data.data ?? []).map((entry) => entry.embedding ?? []);
  if (embeddings.length !== inputs.length) {
    throw new Error(`OpenAI returned ${embeddings.length} embeddings for ${inputs.length} inputs`);
  }
  return embeddings;
}

async function qdrantFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const qdrantUrl = process.env.QDRANT_URL;
  const qdrantApiKey = process.env.QDRANT_API_KEY;
  if (!qdrantUrl || !qdrantApiKey) {
    throw new Error("QDRANT_URL and QDRANT_API_KEY are required");
  }

  const response = await fetch(`${qdrantUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "api-key": qdrantApiKey,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "Unknown error");
    throw new Error(`Qdrant error (${response.status}): ${errorBody}`);
  }

  return response;
}

async function upsertOpenAIVector(params: {
  collection: string;
  memoryId: string;
  userId: string;
  title: string;
  sourceType: string;
  memoryType: string;
  importance: number;
  vector: number[];
}): Promise<void> {
  await qdrantFetch(`/collections/${params.collection}/points`, {
    method: "PUT",
    body: JSON.stringify({
      points: [
        {
          id: params.memoryId,
          vector: {
            openai: params.vector,
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

async function resolveUserIdByApiKey(client: ReturnType<typeof createClient>, apiKey: string): Promise<string> {
  const keyHash = hashApiKey(apiKey);
  const result = await client.execute({
    sql: `
      SELECT user_id, revoked_at, expires_at
      FROM api_keys
      WHERE key_hash = ?
      LIMIT 1
    `,
    args: [keyHash],
  });

  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    throw new Error("API key not found");
  }
  if (row.revoked_at) {
    throw new Error("API key is revoked");
  }
  if (row.expires_at && new Date(String(row.expires_at)) < new Date()) {
    throw new Error("API key is expired");
  }

  return String(row.user_id);
}

function toMemoryRow(row: Record<string, unknown>): MemoryRow {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    title: String(row.title ?? "Untitled Memory"),
    source_type: String(row.source_type ?? "text"),
    memory_type: String(row.memory_type ?? "episodic"),
    importance: Number(row.importance ?? 5),
    content_text: String(row.content_text ?? ""),
    content_encrypted: row.content_encrypted == null ? null : Number(row.content_encrypted),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const dbUrl = process.env.TURSO_DATABASE_URL;
  const dbToken = process.env.TURSO_AUTH_TOKEN;
  if (!dbUrl) {
    throw new Error("TURSO_DATABASE_URL is required");
  }

  const client = createClient({
    url: dbUrl,
    authToken: dbToken,
  });

  const userId = args.userId ?? await resolveUserIdByApiKey(client, args.apiKey!);
  console.log(`[Migration] Target user: ${userId}`);
  console.log(`[Migration] Resolution mode: ${args.userId ? "direct user_id" : "api_key lookup"}`);

  const qdrantStatus = getQdrantStatus();
  if (!qdrantStatus.enabled) {
    throw new Error("Qdrant is not configured in this environment. Set QDRANT_URL and QDRANT_API_KEY.");
  }

  await ensureCollection();
  const collectionName = qdrantStatus.collection;
  console.log(`[Migration] Qdrant collection: ${collectionName}`);

  const memoriesResult = await client.execute({
    sql: `
      SELECT id, user_id, title, source_type, memory_type, importance, content_text, content_encrypted
      FROM memories
      WHERE user_id = ? AND archived_at IS NULL
      ORDER BY created_at ASC
    `,
    args: [userId],
  });

  const allMemories = memoriesResult.rows.map((row) => toMemoryRow(row as Record<string, unknown>));
  const memories = args.limit ? allMemories.slice(0, args.limit) : allMemories;

  console.log(`[Migration] Found ${allMemories.length} memories (${memories.length} to process)`);

  let processed = 0;
  let migrated = 0;
  let failed = 0;
  let skipped = 0;
  const startedAt = Date.now();

  for (let i = 0; i < memories.length; i += args.batchSize) {
    const batch = memories.slice(i, i + args.batchSize);
    const embedInput: string[] = [];
    const toUpsert: MemoryRow[] = [];

    for (const memory of batch) {
      try {
        const plaintext = memory.content_encrypted === 1
          ? decryptMemoryContent(memory.content_text, memory.user_id)
          : memory.content_text;

        const normalized = plaintext.trim();
        if (!normalized) {
          skipped++;
          processed++;
          console.warn(`[Migration] Skipping empty memory: ${memory.id}`);
          continue;
        }

        embedInput.push(normalized);
        toUpsert.push(memory);
      } catch (error) {
        failed++;
        processed++;
        console.error(`[Migration] Failed to decode memory ${memory.id}:`, error);
      }
    }

    if (embedInput.length === 0) {
      continue;
    }

    try {
      const embeddings = await embedBatch(embedInput);

      for (let index = 0; index < embeddings.length; index++) {
        const vector = embeddings[index];
        const memory = toUpsert[index];
        if (!Array.isArray(vector) || vector.length !== OPENAI_DIMENSIONS) {
          failed++;
          processed++;
          console.error(
            `[Migration] Invalid embedding for ${memory.id}: expected ${OPENAI_DIMENSIONS}, got ${Array.isArray(vector) ? vector.length : "non-array"}`
          );
          continue;
        }

        await upsertOpenAIVector({
          collection: collectionName,
          memoryId: memory.id,
          userId: memory.user_id,
          title: memory.title,
          sourceType: memory.source_type,
          memoryType: memory.memory_type,
          importance: memory.importance,
          vector,
        });

        migrated++;
        processed++;
      }
    } catch (error) {
      failed += toUpsert.length;
      processed += toUpsert.length;
      console.error(
        `[Migration] Batch ${Math.floor(i / args.batchSize) + 1} failed for ${toUpsert.length} memories:`,
        error
      );
    }

    const elapsedMs = Date.now() - startedAt;
    const rate = processed > 0 ? (elapsedMs / 1000 / processed) : 0;
    console.log(
      `[Migration] Progress ${processed}/${memories.length} | migrated=${migrated} failed=${failed} skipped=${skipped} | avg=${rate.toFixed(2)}s/item`
    );

    if (args.delayMs > 0 && i + args.batchSize < memories.length) {
      await sleep(args.delayMs);
    }
  }

  const totalSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[Migration] Complete in ${totalSeconds}s`);
  console.log(`[Migration] Final stats: processed=${processed} migrated=${migrated} failed=${failed} skipped=${skipped}`);

  await client.close();
}

main().catch((error) => {
  console.error("[Migration] Fatal error:", error);
  process.exit(1);
});
