import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { MemoryListItem, MemoryRecord, MemorySourceType } from "@/lib/types";

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
      source_url TEXT,
      file_name TEXT,
      content_text TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      arweave_tx_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memories_user_created_at
    ON memories(user_id, created_at DESC);
  `);

  initialized = true;
}

type MemoryRow = {
  id: string;
  user_id: string;
  title: string;
  source_type: MemorySourceType;
  source_url: string | null;
  file_name: string | null;
  content_text: string;
  content_hash: string;
  arweave_tx_id: string | null;
  created_at: string;
};

function mapRow(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    sourceType: row.source_type,
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
        source_url,
        file_name,
        content_text,
        content_hash,
        arweave_tx_id,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    memory.id,
    memory.userId,
    memory.title,
    memory.sourceType,
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
      SELECT id, user_id, title, source_type, source_url, file_name, content_text, content_hash, arweave_tx_id, created_at
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
      SELECT id, user_id, title, source_type, source_url, file_name, content_text, content_hash, arweave_tx_id, created_at
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
      sourceUrl: record.sourceUrl,
      fileName: record.fileName,
      contentHash: record.contentHash,
      arweaveTxId: record.arweaveTxId,
      createdAt: record.createdAt,
    };
  });
}
