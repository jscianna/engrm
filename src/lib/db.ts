import crypto from "node:crypto";
import { createClient, type Client } from "@libsql/client";
import type { MemoryDashboardStats, MemoryKind, MemoryListItem, MemoryRecord, MemorySourceType, MemorySyncStatus } from "@/lib/types";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";

let db: Client | null = null;

function getDb(): Client {
  if (!db) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    
    if (!url) {
      throw new Error("TURSO_DATABASE_URL is required");
    }
    
    db = createClient({
      url,
      authToken,
    });
  }
  return db;
}

function getMasterKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY is required to store/retrieve Arweave keys.");
  }

  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  try {
    const maybeBase64 = Buffer.from(trimmed, "base64");
    if (maybeBase64.length === 32) {
      return maybeBase64;
    }
  } catch {
    // no-op
  }

  return crypto.createHash("sha256").update(trimmed, "utf8").digest();
}

function encryptAesGcm(plaintext: Buffer, key: Buffer): { ciphertext: string; iv: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: `${ciphertext.toString("base64")}.${authTag.toString("base64")}`,
    iv: iv.toString("base64"),
  };
}

function decryptAesGcm(payload: { ciphertext: string; iv: string }, key: Buffer): Buffer {
  const [ciphertextB64, authTagB64] = payload.ciphertext.split(".");
  if (!ciphertextB64 || !authTagB64) {
    throw new Error("Encrypted payload format is invalid.");
  }
  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGORITHM,
    key,
    Buffer.from(payload.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]);
}

function encryptSecretEnvelope(plaintext: string): {
  encryptedBlob: string;
  iv: string;
  encryptedDataKey: string;
  dataKeyIv: string;
} {
  const masterKey = getMasterKey();
  const dataKey = crypto.randomBytes(32);
  const encryptedPayload = encryptAesGcm(Buffer.from(plaintext, "utf8"), dataKey);
  const encryptedDataKey = encryptAesGcm(dataKey, masterKey);

  return {
    encryptedBlob: encryptedPayload.ciphertext,
    iv: encryptedPayload.iv,
    encryptedDataKey: encryptedDataKey.ciphertext,
    dataKeyIv: encryptedDataKey.iv,
  };
}

function decryptSecretEnvelope(payload: {
  encryptedBlob: string;
  iv: string;
  encryptedDataKey: string;
  dataKeyIv: string;
}): string {
  const masterKey = getMasterKey();
  const dataKey = decryptAesGcm(
    {
      ciphertext: payload.encryptedDataKey,
      iv: payload.dataKeyIv,
    },
    masterKey,
  );

  const plaintext = decryptAesGcm(
    {
      ciphertext: payload.encryptedBlob,
      iv: payload.iv,
    },
    dataKey,
  );
  return plaintext.toString("utf8");
}

let initialized = false;

async function ensureInitialized(): Promise<void> {
  if (initialized) {
    return;
  }

  const client = getDb();

  try {
    await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      source_type TEXT NOT NULL,
      memory_type TEXT NOT NULL DEFAULT 'episodic',
      importance INTEGER NOT NULL DEFAULT 5,
      tags_csv TEXT NOT NULL DEFAULT '',
      source_url TEXT,
      file_name TEXT,
      content_text TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      arweave_tx_id TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      sync_error TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memories_user_created_at
    ON memories(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      arweave_jwk TEXT,
      arweave_jwk_encrypted TEXT,
      arweave_jwk_iv TEXT,
      arweave_jwk_key_encrypted TEXT,
      arweave_jwk_key_iv TEXT,
      updated_at TEXT NOT NULL
    );
  `);

    initialized = true;
  } catch (error) {
    console.error("[DB] ensureInitialized failed:", error);
    throw error;
  }
}

type MemoryRow = {
  id: string;
  user_id: string;
  title: string;
  source_type: MemorySourceType;
  memory_type: MemoryKind;
  importance: number;
  tags_csv: string;
  source_url: string | null;
  file_name: string | null;
  content_text: string;
  content_hash: string;
  arweave_tx_id: string | null;
  sync_status: MemorySyncStatus;
  sync_error: string | null;
  created_at: string;
};

function parseTags(tagsCsv: string): string[] {
  return tagsCsv
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function mapRow(row: Record<string, unknown>): MemoryRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    title: row.title as string,
    sourceType: row.source_type as MemorySourceType,
    memoryType: (row.memory_type as MemoryKind) ?? "episodic",
    importance: (row.importance as number) ?? 5,
    tags: parseTags((row.tags_csv as string) ?? ""),
    sourceUrl: row.source_url as string | null,
    fileName: row.file_name as string | null,
    contentText: row.content_text as string,
    contentHash: row.content_hash as string,
    arweaveTxId: row.arweave_tx_id as string | null,
    syncStatus: (row.sync_status as MemorySyncStatus) ?? "pending",
    syncError: row.sync_error as string | null,
    createdAt: row.created_at as string,
  };
}

export async function insertMemory(memory: MemoryRecord): Promise<void> {
  await ensureInitialized();
  const client = getDb();
  
  await client.execute({
    sql: `
      INSERT INTO memories (
        id, user_id, title, source_type, memory_type, importance, tags_csv,
        source_url, file_name, content_text, content_hash, arweave_tx_id,
        sync_status, sync_error, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      memory.id,
      memory.userId,
      memory.title,
      memory.sourceType,
      memory.memoryType,
      memory.importance,
      memory.tags.join(","),
      memory.sourceUrl,
      memory.fileName,
      memory.contentText,
      memory.contentHash,
      memory.arweaveTxId,
      memory.syncStatus,
      memory.syncError,
      memory.createdAt,
    ],
  });
}

export async function listMemoriesByUser(userId: string, limit = 100): Promise<MemoryListItem[]> {
  await ensureInitialized();
  const client = getDb();
  
  const result = await client.execute({
    sql: `
      SELECT id, user_id, title, source_type, source_url, file_name, content_text, content_hash, arweave_tx_id, created_at,
             memory_type, importance, tags_csv, sync_status, sync_error
      FROM memories
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `,
    args: [userId, limit],
  });

  return result.rows.map((row) => {
    const record = mapRow(row as Record<string, unknown>);
    return {
      id: record.id,
      userId: record.userId,
      title: record.title,
      sourceType: record.sourceType,
      memoryType: record.memoryType,
      importance: record.importance,
      tags: record.tags,
      sourceUrl: record.sourceUrl,
      fileName: record.fileName,
      contentHash: record.contentHash,
      arweaveTxId: record.arweaveTxId,
      syncStatus: record.syncStatus,
      syncError: record.syncError,
      createdAt: record.createdAt,
    };
  });
}

export async function listMemoryRecordsByUser(userId: string, limit = 100): Promise<MemoryRecord[]> {
  await ensureInitialized();
  const client = getDb();
  
  const result = await client.execute({
    sql: `
      SELECT id, user_id, title, source_type, source_url, file_name, content_text, content_hash, arweave_tx_id, created_at,
             memory_type, importance, tags_csv, sync_status, sync_error
      FROM memories
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `,
    args: [userId, limit],
  });

  return result.rows.map((row) => mapRow(row as Record<string, unknown>));
}

export async function getMemoryById(id: string): Promise<MemoryRecord | null> {
  await ensureInitialized();
  const client = getDb();
  
  const result = await client.execute({
    sql: `
      SELECT id, user_id, title, source_type, source_url, file_name, content_text, content_hash, arweave_tx_id, created_at,
             memory_type, importance, tags_csv, sync_status, sync_error
      FROM memories
      WHERE id = ?
    `,
    args: [id],
  });

  if (result.rows.length === 0) {
    return null;
  }

  return mapRow(result.rows[0] as Record<string, unknown>);
}

export async function getMemoriesByIds(userId: string, ids: string[]): Promise<MemoryListItem[]> {
  await ensureInitialized();
  if (ids.length === 0) {
    return [];
  }

  const client = getDb();
  const placeholders = ids.map(() => "?").join(",");
  
  const result = await client.execute({
    sql: `
      SELECT id, user_id, title, source_type, source_url, file_name, content_text, content_hash, arweave_tx_id, created_at,
             memory_type, importance, tags_csv, sync_status, sync_error
      FROM memories
      WHERE user_id = ? AND id IN (${placeholders})
    `,
    args: [userId, ...ids],
  });

  return result.rows.map((row) => {
    const record = mapRow(row as Record<string, unknown>);
    return {
      id: record.id,
      userId: record.userId,
      title: record.title,
      sourceType: record.sourceType,
      memoryType: record.memoryType,
      importance: record.importance,
      tags: record.tags,
      sourceUrl: record.sourceUrl,
      fileName: record.fileName,
      contentHash: record.contentHash,
      arweaveTxId: record.arweaveTxId,
      syncStatus: record.syncStatus,
      syncError: record.syncError,
      createdAt: record.createdAt,
    };
  });
}

export async function getDashboardStatsByUser(userId: string): Promise<MemoryDashboardStats> {
  await ensureInitialized();
  const client = getDb();
  
  const result = await client.execute({
    sql: `
      SELECT
        COUNT(*) AS total_memories,
        SUM(CASE WHEN arweave_tx_id IS NOT NULL AND arweave_tx_id != '' THEN 1 ELSE 0 END) AS committed_memories,
        SUM(LENGTH(content_text)) AS storage_bytes
      FROM memories
      WHERE user_id = ?
    `,
    args: [userId],
  });

  const row = result.rows[0] as Record<string, unknown> | undefined;
  const totalMemories = Number(row?.total_memories ?? 0);
  const committedMemories = Number(row?.committed_memories ?? 0);

  return {
    totalMemories,
    committedMemories,
    pendingMemories: Math.max(totalMemories - committedMemories, 0),
    storageBytes: Number(row?.storage_bytes ?? 0),
  };
}

export async function updateMemoryArweaveTx(memoryId: string, userId: string, arweaveTxId: string): Promise<void> {
  await ensureInitialized();
  const client = getDb();
  
  await client.execute({
    sql: `
      UPDATE memories
      SET arweave_tx_id = ?, sync_status = 'synced', sync_error = NULL
      WHERE id = ? AND user_id = ?
    `,
    args: [arweaveTxId, memoryId, userId],
  });
}

export async function updateMemorySyncFailure(memoryId: string, userId: string, errorMessage: string): Promise<void> {
  await ensureInitialized();
  const client = getDb();
  
  await client.execute({
    sql: `
      UPDATE memories
      SET sync_status = 'failed', sync_error = ?
      WHERE id = ? AND user_id = ?
    `,
    args: [errorMessage.slice(0, 1000), memoryId, userId],
  });
}

export async function setUserArweaveJwk(userId: string, jwkJson: string): Promise<void> {
  await ensureInitialized();
  const client = getDb();
  const encrypted = encryptSecretEnvelope(jwkJson);
  
  await client.execute({
    sql: `
      INSERT INTO user_settings (
        user_id, arweave_jwk, arweave_jwk_encrypted, arweave_jwk_iv,
        arweave_jwk_key_encrypted, arweave_jwk_key_iv, updated_at
      )
      VALUES (?, NULL, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        arweave_jwk = NULL,
        arweave_jwk_encrypted = excluded.arweave_jwk_encrypted,
        arweave_jwk_iv = excluded.arweave_jwk_iv,
        arweave_jwk_key_encrypted = excluded.arweave_jwk_key_encrypted,
        arweave_jwk_key_iv = excluded.arweave_jwk_key_iv,
        updated_at = excluded.updated_at
    `,
    args: [
      userId,
      encrypted.encryptedBlob,
      encrypted.iv,
      encrypted.encryptedDataKey,
      encrypted.dataKeyIv,
      new Date().toISOString(),
    ],
  });
}

export async function clearUserArweaveJwk(userId: string): Promise<void> {
  await ensureInitialized();
  const client = getDb();
  
  await client.execute({
    sql: `
      INSERT INTO user_settings (
        user_id, arweave_jwk, arweave_jwk_encrypted, arweave_jwk_iv,
        arweave_jwk_key_encrypted, arweave_jwk_key_iv, updated_at
      )
      VALUES (?, NULL, NULL, NULL, NULL, NULL, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        arweave_jwk = NULL,
        arweave_jwk_encrypted = NULL,
        arweave_jwk_iv = NULL,
        arweave_jwk_key_encrypted = NULL,
        arweave_jwk_key_iv = NULL,
        updated_at = excluded.updated_at
    `,
    args: [userId, new Date().toISOString()],
  });
}

export async function getUserArweaveJwk(userId: string): Promise<string | null> {
  await ensureInitialized();
  const client = getDb();
  
  const result = await client.execute({
    sql: `
      SELECT arweave_jwk, arweave_jwk_encrypted, arweave_jwk_iv, arweave_jwk_key_encrypted, arweave_jwk_key_iv
      FROM user_settings
      WHERE user_id = ?
    `,
    args: [userId],
  });

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0] as Record<string, unknown>;

  if (row.arweave_jwk_encrypted && row.arweave_jwk_iv && row.arweave_jwk_key_encrypted && row.arweave_jwk_key_iv) {
    return decryptSecretEnvelope({
      encryptedBlob: row.arweave_jwk_encrypted as string,
      iv: row.arweave_jwk_iv as string,
      encryptedDataKey: row.arweave_jwk_key_encrypted as string,
      dataKeyIv: row.arweave_jwk_key_iv as string,
    });
  }

  if (row.arweave_jwk) {
    try {
      await setUserArweaveJwk(userId, row.arweave_jwk as string);
    } catch {
      // Keep serving legacy plaintext if ENCRYPTION_KEY is not configured yet.
    }
  }

  return (row.arweave_jwk as string) ?? null;
}
