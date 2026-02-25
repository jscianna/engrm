import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { MemoryDashboardStats, MemoryKind, MemoryListItem, MemoryRecord, MemorySourceType } from "@/lib/types";

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "memry.sqlite");
const db = new Database(dbPath);

db.pragma("busy_timeout = 5000");

let initialized = false;

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
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memories_user_created_at
    ON memories(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      arweave_jwk TEXT,
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
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      FROM memories
      WHERE user_id = ?
      ORDER BY datetime(created_at) DESC
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
      createdAt: record.createdAt,
    };
  });
}

export function getMemoryById(id: string): MemoryRecord | null {
  ensureInitialized();
  const row = db
    .prepare(
      `
      SELECT id, user_id, title, source_type, source_url, file_name, content_text, content_hash, arweave_tx_id, created_at, memory_type, importance, tags_csv
      FROM memories
      WHERE id = ?
    `,
    )
    .get(id) as MemoryRow | undefined;

  return row ? mapRow(row) : null;
}

export function getMemoriesByIds(ids: string[]): MemoryListItem[] {
  ensureInitialized();
  if (ids.length === 0) {
    return [];
  }

  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `
      SELECT id, user_id, title, source_type, source_url, file_name, content_text, content_hash, arweave_tx_id, created_at, memory_type, importance, tags_csv
      FROM memories
      WHERE id IN (${placeholders})
    `,
    )
    .all(...ids) as MemoryRow[];

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
      SET arweave_tx_id = ?
      WHERE id = ? AND user_id = ?
    `,
  ).run(arweaveTxId, memoryId, userId);
}

export function setUserArweaveJwk(userId: string, jwkJson: string): void {
  ensureInitialized();
  db.prepare(
    `
      INSERT INTO user_settings (user_id, arweave_jwk, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        arweave_jwk = excluded.arweave_jwk,
        updated_at = excluded.updated_at
    `,
  ).run(userId, jwkJson, new Date().toISOString());
}

export function clearUserArweaveJwk(userId: string): void {
  ensureInitialized();
  db.prepare(
    `
      INSERT INTO user_settings (user_id, arweave_jwk, updated_at)
      VALUES (?, NULL, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        arweave_jwk = NULL,
        updated_at = excluded.updated_at
    `,
  ).run(userId, new Date().toISOString());
}

export function getUserArweaveJwk(userId: string): string | null {
  ensureInitialized();
  const row = db
    .prepare(
      `
      SELECT arweave_jwk
      FROM user_settings
      WHERE user_id = ?
    `,
    )
    .get(userId) as { arweave_jwk: string | null } | undefined;

  return row?.arweave_jwk ?? null;
}
