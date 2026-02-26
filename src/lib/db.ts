import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import type { MemoryDashboardStats, MemoryKind, MemoryListItem, MemoryRecord, MemorySourceType, MemorySyncStatus } from "@/lib/types";

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "memry.sqlite");
const db = new Database(dbPath);
const ENCRYPTION_ALGORITHM = "aes-256-gcm";

db.pragma("busy_timeout = 5000");

let initialized = false;

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

function ensureInitialized() {
  if (initialized) {
    return;
  }

  db.exec(`
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

  const columns = db.prepare("PRAGMA table_info(memories)").all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has("memory_type")) {
    db.exec("ALTER TABLE memories ADD COLUMN memory_type TEXT NOT NULL DEFAULT 'episodic'");
  }
  if (!columnNames.has("importance")) {
    db.exec("ALTER TABLE memories ADD COLUMN importance INTEGER NOT NULL DEFAULT 5");
  }
  if (!columnNames.has("tags_csv")) {
    db.exec("ALTER TABLE memories ADD COLUMN tags_csv TEXT NOT NULL DEFAULT ''");
  }
  if (!columnNames.has("sync_status")) {
    db.exec("ALTER TABLE memories ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending'");
  }
  if (!columnNames.has("sync_error")) {
    db.exec("ALTER TABLE memories ADD COLUMN sync_error TEXT");
  }

  const userSettingsColumns = db.prepare("PRAGMA table_info(user_settings)").all() as Array<{ name: string }>;
  const userSettingsColumnNames = new Set(userSettingsColumns.map((column) => column.name));
  if (!userSettingsColumnNames.has("arweave_jwk_encrypted")) {
    db.exec("ALTER TABLE user_settings ADD COLUMN arweave_jwk_encrypted TEXT");
  }
  if (!userSettingsColumnNames.has("arweave_jwk_iv")) {
    db.exec("ALTER TABLE user_settings ADD COLUMN arweave_jwk_iv TEXT");
  }
  if (!userSettingsColumnNames.has("arweave_jwk_key_encrypted")) {
    db.exec("ALTER TABLE user_settings ADD COLUMN arweave_jwk_key_encrypted TEXT");
  }
  if (!userSettingsColumnNames.has("arweave_jwk_key_iv")) {
    db.exec("ALTER TABLE user_settings ADD COLUMN arweave_jwk_key_iv TEXT");
  }

  initialized = true;
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

function mapRow(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    sourceType: row.source_type,
    memoryType: row.memory_type,
    importance: row.importance,
    tags: parseTags(row.tags_csv),
    sourceUrl: row.source_url,
    fileName: row.file_name,
    contentText: row.content_text,
    contentHash: row.content_hash,
    arweaveTxId: row.arweave_tx_id,
    syncStatus: row.sync_status,
    syncError: row.sync_error,
    createdAt: row.created_at,
  };
}

export function insertMemory(memory: MemoryRecord): void {
  ensureInitialized();
  db.prepare(
    `
      INSERT INTO memories (
        id,
        user_id,
        title,
        source_type,
        memory_type,
        importance,
        tags_csv,
        source_url,
        file_name,
        content_text,
        content_hash,
        arweave_tx_id,
        sync_status,
        sync_error,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
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
  );
}

export function listMemoriesByUser(userId: string, limit = 100): MemoryListItem[] {
  ensureInitialized();
  const rows = db
    .prepare(
      `
      SELECT id, user_id, title, source_type, source_url, file_name, content_text, content_hash, arweave_tx_id, created_at
      , memory_type, importance, tags_csv
      , sync_status, sync_error
      FROM memories
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `,
    )
    .all(userId, limit) as MemoryRow[];

  return rows.map((row) => {
    const record = mapRow(row);
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

export function listMemoryRecordsByUser(userId: string, limit = 100): MemoryRecord[] {
  ensureInitialized();
  const rows = db
    .prepare(
      `
      SELECT id, user_id, title, source_type, source_url, file_name, content_text, content_hash, arweave_tx_id, created_at, memory_type, importance, tags_csv, sync_status, sync_error
      FROM memories
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `,
    )
    .all(userId, limit) as MemoryRow[];

  return rows.map((row) => mapRow(row));
}

export function getMemoryById(id: string): MemoryRecord | null {
  ensureInitialized();
  const row = db
    .prepare(
      `
      SELECT id, user_id, title, source_type, source_url, file_name, content_text, content_hash, arweave_tx_id, created_at, memory_type, importance, tags_csv, sync_status, sync_error
      FROM memories
      WHERE id = ?
    `,
    )
    .get(id) as MemoryRow | undefined;

  return row ? mapRow(row) : null;
}

export function getMemoriesByIds(userId: string, ids: string[]): MemoryListItem[] {
  ensureInitialized();
  if (ids.length === 0) {
    return [];
  }

  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `
      SELECT id, user_id, title, source_type, source_url, file_name, content_text, content_hash, arweave_tx_id, created_at, memory_type, importance, tags_csv, sync_status, sync_error
      FROM memories
      WHERE user_id = ? AND id IN (${placeholders})
    `,
    )
    .all(userId, ...ids) as MemoryRow[];

  return rows.map((row) => {
    const record = mapRow(row);
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

export function getDashboardStatsByUser(userId: string): MemoryDashboardStats {
  ensureInitialized();
  const row = db
    .prepare(
      `
      SELECT
        COUNT(*) AS total_memories,
        SUM(CASE WHEN arweave_tx_id IS NOT NULL AND arweave_tx_id != '' THEN 1 ELSE 0 END) AS committed_memories,
        SUM(LENGTH(content_text)) AS storage_bytes
      FROM memories
      WHERE user_id = ?
    `,
    )
    .get(userId) as
    | {
        total_memories: number;
        committed_memories: number;
        storage_bytes: number | null;
      }
    | undefined;

  const totalMemories = row?.total_memories ?? 0;
  const committedMemories = row?.committed_memories ?? 0;

  return {
    totalMemories,
    committedMemories,
    pendingMemories: Math.max(totalMemories - committedMemories, 0),
    storageBytes: row?.storage_bytes ?? 0,
  };
}

export function updateMemoryArweaveTx(memoryId: string, userId: string, arweaveTxId: string): void {
  ensureInitialized();
  db.prepare(
    `
      UPDATE memories
      SET arweave_tx_id = ?, sync_status = 'synced', sync_error = NULL
      WHERE id = ? AND user_id = ?
    `,
  ).run(arweaveTxId, memoryId, userId);
}

export function updateMemorySyncFailure(memoryId: string, userId: string, errorMessage: string): void {
  ensureInitialized();
  db.prepare(
    `
      UPDATE memories
      SET sync_status = 'failed', sync_error = ?
      WHERE id = ? AND user_id = ?
    `,
  ).run(errorMessage.slice(0, 1000), memoryId, userId);
}

export function setUserArweaveJwk(userId: string, jwkJson: string): void {
  ensureInitialized();
  const encrypted = encryptSecretEnvelope(jwkJson);
  db.prepare(
    `
      INSERT INTO user_settings (
        user_id,
        arweave_jwk,
        arweave_jwk_encrypted,
        arweave_jwk_iv,
        arweave_jwk_key_encrypted,
        arweave_jwk_key_iv,
        updated_at
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
  ).run(
    userId,
    encrypted.encryptedBlob,
    encrypted.iv,
    encrypted.encryptedDataKey,
    encrypted.dataKeyIv,
    new Date().toISOString(),
  );
}

export function clearUserArweaveJwk(userId: string): void {
  ensureInitialized();
  db.prepare(
    `
      INSERT INTO user_settings (
        user_id,
        arweave_jwk,
        arweave_jwk_encrypted,
        arweave_jwk_iv,
        arweave_jwk_key_encrypted,
        arweave_jwk_key_iv,
        updated_at
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
  ).run(userId, new Date().toISOString());
}

export function getUserArweaveJwk(userId: string): string | null {
  ensureInitialized();
  const row = db
    .prepare(
      `
      SELECT arweave_jwk, arweave_jwk_encrypted, arweave_jwk_iv, arweave_jwk_key_encrypted, arweave_jwk_key_iv
      FROM user_settings
      WHERE user_id = ?
    `,
    )
    .get(userId) as
    | {
        arweave_jwk: string | null;
        arweave_jwk_encrypted: string | null;
        arweave_jwk_iv: string | null;
        arweave_jwk_key_encrypted: string | null;
        arweave_jwk_key_iv: string | null;
      }
    | undefined;

  if (!row) {
    return null;
  }
  if (row.arweave_jwk_encrypted && row.arweave_jwk_iv && row.arweave_jwk_key_encrypted && row.arweave_jwk_key_iv) {
    return decryptSecretEnvelope({
      encryptedBlob: row.arweave_jwk_encrypted,
      iv: row.arweave_jwk_iv,
      encryptedDataKey: row.arweave_jwk_key_encrypted,
      dataKeyIv: row.arweave_jwk_key_iv,
    });
  }

  if (row.arweave_jwk) {
    try {
      setUserArweaveJwk(userId, row.arweave_jwk);
    } catch {
      // Keep serving legacy plaintext if ENCRYPTION_KEY is not configured yet.
    }
  }

  return row.arweave_jwk ?? null;
}
