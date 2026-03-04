/**
 * Edge-compatible database operations
 * No node:crypto - uses Web Crypto API + Turso infra encryption
 */
import type { Client } from "@libsql/client";
import type {
  MemoryDashboardStats,
  MemoryEdgeRecord,
  MemoryGraphEdge,
  MemoryGraphNode,
  MemoryKind,
  MemoryListItem,
  MemoryRecord,
  MemoryRelationshipType,
  MemorySourceType,
  MemorySyncStatus,
} from "@/lib/types";
import { getDb } from "@/lib/turso";
import { deleteMemoryVector } from "@/lib/qdrant";
import {
  ensureRateLimiterInitialized,
  reserveMemoryQuotaInTransaction,
} from "@/lib/rate-limiter";

// =============================================================================
// Edge-compatible crypto helpers
// =============================================================================

function edgeRandomUUID(): string {
  return globalThis.crypto.randomUUID();
}

function edgeRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function edgeRandomHex(length: number): string {
  const bytes = edgeRandomBytes(length);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Simple hash for content deduplication (not cryptographic security)
 * Uses djb2 algorithm - fast and good distribution
 */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Content hash for deduplication - uses multiple simple hashes for collision resistance
 */
function contentHash(text: string): string {
  const h1 = simpleHash(text);
  const h2 = simpleHash(text.split("").reverse().join(""));
  const h3 = simpleHash(text + text.length.toString());
  return `${h1}${h2}${h3}`.slice(0, 32);
}

/**
 * No-op encryption - Turso handles encryption at rest
 * New data stored as plaintext, Turso encrypts at infrastructure level
 */
function encryptMemoryContent(plaintext: string, _userId: string): string {
  return plaintext;
}

/**
 * Decrypt memory content - handles both legacy encrypted and new plaintext
 */
function decryptMemoryContent(storedContent: string, _userId: string): string {
  // Try to detect if this is old encrypted format (JSON with ciphertext/iv)
  if (storedContent.startsWith("{") && storedContent.includes('"ciphertext"')) {
    // Legacy encrypted data - return as-is, will need migration
    // For now, just return a placeholder
    console.warn("[DB] Found legacy encrypted content, needs migration");
    return "[encrypted - needs migration]";
  }
  // New plaintext format
  return storedContent;
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
      content_iv TEXT,
      content_encrypted INTEGER NOT NULL DEFAULT 0,
      content_hash TEXT NOT NULL,
      arweave_tx_id TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      sync_error TEXT,
      namespace_id TEXT,
      session_id TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memories_user_created_at
    ON memories(user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_memories_user_namespace_created_at
    ON memories(user_id, namespace_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_memories_user_session_created_at
    ON memories(user_id, session_id, created_at);

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      agent_id TEXT NOT NULL,
      agent_name TEXT,
      created_at TEXT NOT NULL,
      last_used TEXT,
      revoked_at TEXT,
      expires_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_api_keys_user_created_at
    ON api_keys(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS namespaces (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, name)
    );

    CREATE INDEX IF NOT EXISTS idx_namespaces_user_created_at
    ON namespaces(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      namespace_id TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_created_at
    ON sessions(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS memory_edges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      relationship_type TEXT NOT NULL,
      weight REAL DEFAULT 1.0,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (source_id) REFERENCES memories(id) ON DELETE CASCADE,
      FOREIGN KEY (target_id) REFERENCES memories(id) ON DELETE CASCADE,
      UNIQUE(source_id, target_id, relationship_type)
    );

    CREATE INDEX IF NOT EXISTS idx_edges_user
    ON memory_edges(user_id);

    CREATE INDEX IF NOT EXISTS idx_edges_source
    ON memory_edges(source_id);

    CREATE INDEX IF NOT EXISTS idx_edges_target
    ON memory_edges(target_id);
  `);
    await ensureMemoriesColumns(client);
    await ensureMemoriesIndexes(client);

    initialized = true;
  } catch (error) {
    console.error("[DB] ensureInitialized failed:", error);
    throw error;
  }
}

async function ensureMemoriesIndexes(client: Client): Promise<void> {
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_memories_user_namespace_created_at
    ON memories(user_id, namespace_id, created_at DESC)
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_memories_user_session_created_at
    ON memories(user_id, session_id, created_at)
  `);
  await client.execute(`
    DROP INDEX IF EXISTS idx_memories_user_embedding_hash
  `);
  await client.execute(`
    DELETE FROM memories
    WHERE rowid IN (
      SELECT duplicate.rowid
      FROM memories duplicate
      JOIN memories canonical
        ON canonical.user_id = duplicate.user_id
       AND canonical.embedding_hash = duplicate.embedding_hash
       AND canonical.rowid < duplicate.rowid
      WHERE duplicate.embedding_hash IS NOT NULL
    )
  `);
  await client.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_memories_user_embedding_hash
    ON memories(user_id, embedding_hash)
    WHERE embedding_hash IS NOT NULL
  `);
}

async function ensureMemoriesColumns(client: Client): Promise<void> {
  const requiredColumns: Array<{ name: string; ddl: string }> = [
    { name: "content_iv", ddl: "TEXT" },
    { name: "content_encrypted", ddl: "INTEGER NOT NULL DEFAULT 0" },
    { name: "namespace_id", ddl: "TEXT" },
    { name: "session_id", ddl: "TEXT" },
    { name: "metadata_json", ddl: "TEXT" },
    // Reinforcement & decay columns
    { name: "strength", ddl: "REAL DEFAULT 1.0" },
    { name: "base_strength", ddl: "REAL DEFAULT 1.0" },
    { name: "mention_count", ddl: "INTEGER DEFAULT 1" },
    { name: "access_count", ddl: "INTEGER DEFAULT 0" },
    { name: "feedback_score", ddl: "INTEGER DEFAULT 0" },
    { name: "halflife_days", ddl: "INTEGER DEFAULT 60" },
    { name: "last_accessed_at", ddl: "TEXT" },
    { name: "last_mentioned_at", ddl: "TEXT" },
    { name: "first_mentioned_at", ddl: "TEXT" },
    { name: "archived_at", ddl: "TEXT" },
    { name: "source_conversations", ddl: "TEXT" },  // JSON array
    { name: "entities", ddl: "TEXT" },  // JSON array for API-facing entity extraction
    { name: "entities_json", ddl: "TEXT" },  // JSON array
    { name: "embedding", ddl: "TEXT" },  // JSON array of floats
    { name: "embedding_hash", ddl: "TEXT" },  // SHA256 hash of embedding for dedup
    { name: "content_mac", ddl: "TEXT" },  // HMAC-SHA256 for content integrity
    { name: "tags_json", ddl: "TEXT" },  // JSON array of user tags
  ];

  const tableInfo = await client.execute("PRAGMA table_info(memories)");
  const existing = new Set(
    tableInfo.rows
      .map((row) => {
        const record = row as Record<string, unknown>;
        return typeof record.name === "string" ? record.name : null;
      })
      .filter((name): name is string => Boolean(name)),
  );

  for (const column of requiredColumns) {
    if (existing.has(column.name)) {
      continue;
    }
    await client.execute(`ALTER TABLE memories ADD COLUMN ${column.name} ${column.ddl}`);
  }
}

function parseTags(tagsCsv: string): string[] {
  return tagsCsv
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export type ApiKeyIdentity = {
  userId: string;
  agentId: string;
  keyId: string;
};

export type NamespaceRecord = {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
};

export type SessionRecord = {
  id: string;
  userId: string;
  namespaceId: string | null;
  namespaceName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type AgentMemoryRecord = {
  id: string;
  userId: string;
  title: string;
  text: string;
  sourceType: MemorySourceType;
  memoryType: MemoryKind;
  sourceUrl: string | null;
  fileName: string | null;
  metadata: Record<string, unknown> | null;
  namespaceId: string | null;
  sessionId: string | null;
  entities: string[];
  feedbackScore: number;
  accessCount: number;
  isEncrypted?: boolean;
  createdAt: string;
};

function mapRow(row: Record<string, unknown>): MemoryRecord {
  const entities = parseJsonStringArray((row.entities as string | null) ?? row.entities_json);
  const userId = row.user_id as string;
  const encryptedText = row.content_text as string;
  // Decrypt content at rest (handles both encrypted and legacy plaintext)
  const decryptedText = decryptMemoryContent(encryptedText, userId);
  
  return {
    id: row.id as string,
    userId,
    title: row.title as string,
    sourceType: row.source_type as MemorySourceType,
    memoryType: (row.memory_type as MemoryKind) ?? "episodic",
    importance: (row.importance as number) ?? 5,
    tags: parseTags((row.tags_csv as string) ?? ""),
    sourceUrl: row.source_url as string | null,
    fileName: row.file_name as string | null,
    contentText: decryptedText,
    contentIv: row.content_iv as string | null,
    isEncrypted: Number(row.content_encrypted ?? 0) === 1,
    contentHash: row.content_hash as string,
    arweaveTxId: row.arweave_tx_id as string | null,
    syncStatus: (row.sync_status as MemorySyncStatus) ?? "pending",
    syncError: row.sync_error as string | null,
    entities,
    feedbackScore: Number(row.feedback_score ?? 0),
    accessCount: Number(row.access_count ?? 0),
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
        source_url, file_name, content_text, content_iv, content_encrypted, content_hash, arweave_tx_id,
        sync_status, sync_error, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      memory.contentIv,
      memory.isEncrypted ? 1 : 0,
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
      SELECT id, user_id, title, source_type, source_url, file_name, content_hash, arweave_tx_id, created_at,
             memory_type, importance, tags_csv, sync_status, sync_error, content_iv, content_encrypted,
             (
               SELECT COUNT(*)
               FROM memory_edges e
               WHERE e.user_id = memories.user_id
               AND (e.source_id = memories.id OR e.target_id = memories.id)
             ) AS relationship_count,
             (
               SELECT COUNT(*)
               FROM memory_edges e
               WHERE e.user_id = memories.user_id
               AND e.source_id = memories.id
               AND e.relationship_type = 'updates'
             ) AS superseded_by_count
      FROM memories
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `,
    args: [userId, limit],
  });

  return result.rows.map((row) => ({
    id: row.id as string,
    userId: row.user_id as string,
    title: row.title as string,
    sourceType: row.source_type as MemorySourceType,
    memoryType: (row.memory_type as MemoryKind) ?? "episodic",
    importance: (row.importance as number) ?? 5,
    tags: parseTags((row.tags_csv as string) ?? ""),
    sourceUrl: row.source_url as string | null,
    fileName: row.file_name as string | null,
    contentIv: row.content_iv as string | null,
    isEncrypted: Number(row.content_encrypted ?? 0) === 1,
    contentHash: row.content_hash as string,
    arweaveTxId: row.arweave_tx_id as string | null,
    syncStatus: (row.sync_status as MemorySyncStatus) ?? "pending",
    syncError: row.sync_error as string | null,
    createdAt: row.created_at as string,
    relationshipCount: Number(row.relationship_count ?? 0),
    supersededByCount: Number(row.superseded_by_count ?? 0),
  }));
}

export async function listMemoryRecordsByUser(userId: string, limit = 100): Promise<MemoryRecord[]> {
  await ensureInitialized();
  const client = getDb();
  
  const result = await client.execute({
    sql: `
      SELECT id, user_id, title, source_type, source_url, file_name, content_text, content_hash, arweave_tx_id, created_at,
             memory_type, importance, tags_csv, sync_status, sync_error, content_iv, content_encrypted
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
             memory_type, importance, tags_csv, sync_status, sync_error, content_iv, content_encrypted
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
      SELECT id, user_id, title, source_type, source_url, file_name, content_hash, arweave_tx_id, created_at,
             memory_type, importance, tags_csv, sync_status, sync_error, content_iv, content_encrypted,
             (
               SELECT COUNT(*)
               FROM memory_edges e
               WHERE e.user_id = memories.user_id
               AND (e.source_id = memories.id OR e.target_id = memories.id)
             ) AS relationship_count,
             (
               SELECT COUNT(*)
               FROM memory_edges e
               WHERE e.user_id = memories.user_id
               AND e.source_id = memories.id
               AND e.relationship_type = 'updates'
             ) AS superseded_by_count
      FROM memories
      WHERE user_id = ? AND id IN (${placeholders})
    `,
    args: [userId, ...ids],
  });

  return result.rows.map((row) => ({
    id: row.id as string,
    userId: row.user_id as string,
    title: row.title as string,
    sourceType: row.source_type as MemorySourceType,
    memoryType: (row.memory_type as MemoryKind) ?? "episodic",
    importance: (row.importance as number) ?? 5,
    tags: parseTags((row.tags_csv as string) ?? ""),
    sourceUrl: row.source_url as string | null,
    fileName: row.file_name as string | null,
    contentIv: row.content_iv as string | null,
    isEncrypted: Number(row.content_encrypted ?? 0) === 1,
    contentHash: row.content_hash as string,
    arweaveTxId: row.arweave_tx_id as string | null,
    syncStatus: (row.sync_status as MemorySyncStatus) ?? "pending",
    syncError: row.sync_error as string | null,
    createdAt: row.created_at as string,
    relationshipCount: Number(row.relationship_count ?? 0),
    supersededByCount: Number(row.superseded_by_count ?? 0),
  }));
}

export async function createMemoryEdge(input: CreateMemoryEdgeInput): Promise<MemoryEdgeRecord> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();
  const id = `edge_${edgeRandomUUID().replaceAll("-", "")}`;
  const weight = Number.isFinite(input.weight) ? Number(input.weight) : 1;
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

  await client.execute({
    sql: `
      INSERT INTO memory_edges (
        id, user_id, source_id, target_id, relationship_type, weight, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_id, target_id, relationship_type) DO UPDATE SET
        weight = MIN(memory_edges.weight + excluded.weight, 10.0),
        metadata_json = excluded.metadata_json
    `,
    args: [
      id,
      input.userId,
      input.sourceId,
      input.targetId,
      input.relationshipType,
      weight,
      metadataJson,
      now,
    ],
  });

  const result = await client.execute({
    sql: `
      SELECT id, user_id, source_id, target_id, relationship_type, weight, metadata_json, created_at
      FROM memory_edges
      WHERE user_id = ? AND source_id = ? AND target_id = ? AND relationship_type = ?
      LIMIT 1
    `,
    args: [input.userId, input.sourceId, input.targetId, input.relationshipType],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    throw new Error("Failed to create memory edge");
  }
  return mapMemoryEdgeRow(row);
}

export async function getMemoryEdgesForMemory(userId: string, memoryId: string): Promise<MemoryEdgesForMemory> {
  await ensureInitialized();
  const client = getDb();
  const [incomingResult, outgoingResult] = await Promise.all([
    client.execute({
      sql: `
        SELECT id, user_id, source_id, target_id, relationship_type, weight, metadata_json, created_at
        FROM memory_edges
        WHERE user_id = ? AND target_id = ?
        ORDER BY created_at DESC
      `,
      args: [userId, memoryId],
    }),
    client.execute({
      sql: `
        SELECT id, user_id, source_id, target_id, relationship_type, weight, metadata_json, created_at
        FROM memory_edges
        WHERE user_id = ? AND source_id = ?
        ORDER BY created_at DESC
      `,
      args: [userId, memoryId],
    }),
  ]);

  return {
    incoming: incomingResult.rows.map((row) => mapMemoryEdgeRow(row as Record<string, unknown>)),
    outgoing: outgoingResult.rows.map((row) => mapMemoryEdgeRow(row as Record<string, unknown>)),
  };
}

export async function deleteMemoryEdge(userId: string, edgeId: string): Promise<boolean> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      DELETE FROM memory_edges
      WHERE user_id = ? AND id = ?
    `,
    args: [userId, edgeId],
  });
  return (result.rowsAffected ?? 0) > 0;
}

export async function listMemoryEdgesByUser(userId: string, limit = 250): Promise<MemoryEdgeRecord[]> {
  await ensureInitialized();
  const client = getDb();
  const boundedLimit = Math.max(1, Math.min(limit, 1000));
  const result = await client.execute({
    sql: `
      SELECT id, user_id, source_id, target_id, relationship_type, weight, metadata_json, created_at
      FROM memory_edges
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `,
    args: [userId, boundedLimit],
  });
  return result.rows.map((row) => mapMemoryEdgeRow(row as Record<string, unknown>));
}

export async function getMemoryGraph(userId: string, limit = 100): Promise<{ nodes: MemoryGraphNode[]; edges: MemoryGraphEdge[] }> {
  await ensureInitialized();
  const client = getDb();
  const boundedLimit = Math.max(1, Math.min(limit, 300));
  const nodeResult = await client.execute({
    sql: `
      SELECT id, title, memory_type, importance
      FROM memories
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `,
    args: [userId, boundedLimit],
  });

  const nodes: MemoryGraphNode[] = nodeResult.rows.map((row) => ({
    id: row.id as string,
    title: row.title as string,
    memoryType: ((row.memory_type as MemoryKind) ?? "episodic") as MemoryKind,
    importance: Number(row.importance ?? 5),
  }));
  const nodeIds = nodes.map((node) => node.id);
  if (nodeIds.length === 0) {
    return { nodes: [], edges: [] };
  }

  const placeholders = nodeIds.map(() => "?").join(",");
  const edgeResult = await client.execute({
    sql: `
      SELECT id, source_id, target_id, relationship_type, weight
      FROM memory_edges
      WHERE user_id = ?
      AND source_id IN (${placeholders})
      AND target_id IN (${placeholders})
    `,
    args: [userId, ...nodeIds, ...nodeIds],
  });

  const edges: MemoryGraphEdge[] = edgeResult.rows.map((row) => ({
    id: row.id as string,
    source: row.source_id as string,
    target: row.target_id as string,
    relationshipType: row.relationship_type as MemoryRelationshipType,
    weight: Number(row.weight ?? 1),
  }));

  return { nodes, edges };
}

export async function getDashboardStatsByUser(userId: string): Promise<MemoryDashboardStats> {
  await ensureInitialized();
  const client = getDb();
  
  const result = await client.execute({
    sql: `
      SELECT
        COUNT(*) AS total_memories,
        SUM(LENGTH(content_text)) AS storage_bytes
      FROM memories
      WHERE user_id = ?
    `,
    args: [userId],
  });

  const row = result.rows[0] as Record<string, unknown> | undefined;
  const totalMemories = Number(row?.total_memories ?? 0);

  return {
    totalMemories,
    committedMemories: 0,
    pendingMemories: 0,
    storageBytes: Number(row?.storage_bytes ?? 0),
  };
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

function hashApiKey(key: string): string {
  return contentHash(key);
}

function parseJsonObject(input: unknown): Record<string, unknown> | null {
  if (typeof input !== "string" || !input) {
    return null;
  }

  try {
    const parsed = JSON.parse(input) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // no-op
  }

  return null;
}

function parseJsonStringArray(input: unknown): string[] {
  if (typeof input !== "string" || !input) {
    return [];
  }

  try {
    const parsed = JSON.parse(input) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    }
  } catch {
    // no-op
  }

  return [];
}

export type CreateMemoryEdgeInput = {
  userId: string;
  sourceId: string;
  targetId: string;
  relationshipType: MemoryRelationshipType;
  weight?: number;
  metadata?: Record<string, unknown> | null;
};

export type MemoryEdgesForMemory = {
  incoming: MemoryEdgeRecord[];
  outgoing: MemoryEdgeRecord[];
};

function mapMemoryEdgeRow(row: Record<string, unknown>): MemoryEdgeRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    sourceId: row.source_id as string,
    targetId: row.target_id as string,
    relationshipType: row.relationship_type as MemoryRelationshipType,
    weight: Number(row.weight ?? 1),
    metadata: parseJsonObject(row.metadata_json),
    createdAt: row.created_at as string,
  };
}

function mapAgentMemoryRow(row: Record<string, unknown>): AgentMemoryRecord {
  const userId = row.user_id as string;
  const encryptedText = row.content_text as string;
  // Decrypt content at rest (handles both encrypted and legacy plaintext)
  const decryptedText = decryptMemoryContent(encryptedText, userId);
  
  return {
    id: row.id as string,
    userId,
    title: row.title as string,
    text: decryptedText,
    sourceType: (row.source_type as MemorySourceType) ?? "text",
    memoryType: (row.memory_type as MemoryKind) ?? "episodic",
    sourceUrl: (row.source_url as string | null) ?? null,
    fileName: (row.file_name as string | null) ?? null,
    metadata: parseJsonObject(row.metadata_json),
    namespaceId: (row.namespace_id as string | null) ?? null,
    sessionId: (row.session_id as string | null) ?? null,
    entities: parseJsonStringArray((row.entities as string | null) ?? row.entities_json),
    feedbackScore: Number(row.feedback_score ?? 0),
    accessCount: Number(row.access_count ?? 0),
    createdAt: row.created_at as string,
  };
}

export async function createApiKey(userId: string, agentName?: string): Promise<{ apiKey: string; agentId: string }> {
  await ensureInitialized();
  const client = getDb();
  const id = edgeRandomUUID();
  const agentId = `agent_${edgeRandomUUID().replaceAll("-", "")}`;
  const token = edgeRandomHex(24);
  const apiKey = `mem_${token}`;
  const keyHash = hashApiKey(apiKey);
  const keySuffix = apiKey.slice(-3); // Store last 3 chars for identification
  const now = new Date().toISOString();

  await client.execute({
    sql: `
      INSERT INTO api_keys (id, user_id, key_hash, key_suffix, agent_id, agent_name, created_at, last_used)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [id, userId, keyHash, keySuffix, agentId, agentName ?? null, now, now],
  });

  return { apiKey, agentId };
}

export async function validateApiKey(rawApiKey: string): Promise<ApiKeyIdentity | null> {
  await ensureInitialized();
  const client = getDb();
  const keyHash = hashApiKey(rawApiKey);

  const result = await client.execute({
    sql: `
      SELECT id, user_id, agent_id, revoked_at, expires_at
      FROM api_keys
      WHERE key_hash = ?
      LIMIT 1
    `,
    args: [keyHash],
  });

  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    return null;
  }

  // Check if key is revoked
  if (row.revoked_at) {
    return null;
  }

  // Check if key is expired
  if (row.expires_at) {
    const expiresAt = new Date(row.expires_at as string);
    if (expiresAt < new Date()) {
      return null;
    }
  }

  await client.execute({
    sql: `
      UPDATE api_keys
      SET last_used = ?
      WHERE key_hash = ?
    `,
    args: [new Date().toISOString(), keyHash],
  });

  return {
    userId: row.user_id as string,
    agentId: row.agent_id as string,
    keyId: row.id as string,
  };
}

export async function listApiKeys(userId: string): Promise<Array<{
  id: string;
  agentId: string;
  agentName: string;
  keyPrefix: string;
  keySuffix: string;
  createdAt: string;
  lastUsed: string;
  revokedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
}>> {
  await ensureInitialized();
  const client = getDb();

  const result = await client.execute({
    sql: `
      SELECT id, agent_id, agent_name, key_suffix, created_at, last_used, revoked_at, expires_at
      FROM api_keys
      WHERE user_id = ?
      ORDER BY created_at DESC
    `,
    args: [userId],
  });

  const now = new Date();
  
  return result.rows.map((row) => {
    const revokedAt = (row.revoked_at as string) || null;
    const expiresAt = (row.expires_at as string) || null;
    const isExpired = expiresAt ? new Date(expiresAt) < now : false;
    const isActive = !revokedAt && !isExpired;
    
    return {
      id: row.id as string,
      agentId: row.agent_id as string,
      agentName: (row.agent_name as string) || "Unnamed Agent",
      keyPrefix: "mem_",
      keySuffix: (row.key_suffix as string) || "???",
      createdAt: row.created_at as string,
      lastUsed: row.last_used as string,
      revokedAt,
      expiresAt,
      isActive,
    };
  });
}

export async function deleteApiKey(userId: string, keyId: string): Promise<boolean> {
  await ensureInitialized();
  const client = getDb();

  const result = await client.execute({
    sql: `
      DELETE FROM api_keys
      WHERE user_id = ? AND id = ?
    `,
    args: [userId, keyId],
  });

  return (result.rowsAffected ?? 0) > 0;
}

export async function revokeApiKey(userId: string, keyId: string): Promise<boolean> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();

  const result = await client.execute({
    sql: `
      UPDATE api_keys
      SET revoked_at = ?
      WHERE user_id = ? AND id = ? AND revoked_at IS NULL
    `,
    args: [now, userId, keyId],
  });

  return (result.rowsAffected ?? 0) > 0;
}

export async function setApiKeyExpiration(
  userId: string, 
  keyId: string, 
  expiresAt: Date | null
): Promise<boolean> {
  await ensureInitialized();
  const client = getDb();

  const result = await client.execute({
    sql: `
      UPDATE api_keys
      SET expires_at = ?
      WHERE user_id = ? AND id = ?
    `,
    args: [expiresAt?.toISOString() ?? null, userId, keyId],
  });

  return (result.rowsAffected ?? 0) > 0;
}

export async function isApiKeyValid(keyId: string): Promise<{
  valid: boolean;
  reason?: "revoked" | "expired";
}> {
  await ensureInitialized();
  const client = getDb();

  const result = await client.execute({
    sql: `SELECT revoked_at, expires_at FROM api_keys WHERE id = ? LIMIT 1`,
    args: [keyId],
  });

  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    return { valid: false, reason: "revoked" };
  }

  if (row.revoked_at) {
    return { valid: false, reason: "revoked" };
  }

  if (row.expires_at && new Date(row.expires_at as string) < new Date()) {
    return { valid: false, reason: "expired" };
  }

  return { valid: true };
}

export async function getApiKeyStats(keyId: string): Promise<{
  createdAt: string;
  lastUsed: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  requestCount: number;
} | null> {
  await ensureInitialized();
  await ensureRateLimiterInitialized();
  const client = getDb();

  const keyResult = await client.execute({
    sql: `SELECT created_at, last_used, revoked_at, expires_at FROM api_keys WHERE id = ? LIMIT 1`,
    args: [keyId],
  });

  const row = keyResult.rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    return null;
  }

  const countResult = await client.execute({
    sql: `SELECT COUNT(*) as count FROM api_usage WHERE api_key_id = ?`,
    args: [keyId],
  });

  return {
    createdAt: row.created_at as string,
    lastUsed: (row.last_used as string) ?? null,
    revokedAt: (row.revoked_at as string) ?? null,
    expiresAt: (row.expires_at as string) ?? null,
    requestCount: Number((countResult.rows[0] as Record<string, unknown> | undefined)?.count ?? 0),
  };
}

export async function createNamespace(userId: string, name: string): Promise<NamespaceRecord> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();
  const cleaned = name.trim();
  if (!cleaned) {
    throw new Error("Namespace name is required.");
  }
  const id = `ns_${edgeRandomUUID().replaceAll("-", "")}`;

  await client.execute({
    sql: `
      INSERT INTO namespaces (id, user_id, name, created_at)
      VALUES (?, ?, ?, ?)
    `,
    args: [id, userId, cleaned, now],
  });

  return {
    id,
    userId,
    name: cleaned,
    createdAt: now,
  };
}

export async function listNamespaces(userId: string): Promise<NamespaceRecord[]> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT id, user_id, name, created_at
      FROM namespaces
      WHERE user_id = ?
      ORDER BY created_at DESC
    `,
    args: [userId],
  });

  return result.rows.map((row) => {
    const record = row as Record<string, unknown>;
    return {
      id: record.id as string,
      userId: record.user_id as string,
      name: record.name as string,
      createdAt: record.created_at as string,
    };
  });
}

export async function getNamespaceByName(userId: string, name: string): Promise<NamespaceRecord | null> {
  await ensureInitialized();
  const client = getDb();
  const cleaned = name.trim();
  if (!cleaned) {
    return null;
  }

  const result = await client.execute({
    sql: `
      SELECT id, user_id, name, created_at
      FROM namespaces
      WHERE user_id = ? AND name = ?
      LIMIT 1
    `,
    args: [userId, cleaned],
  });

  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    return null;
  }

  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    createdAt: row.created_at as string,
  };
}

export async function getNamespaceById(userId: string, id: string): Promise<NamespaceRecord | null> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT id, user_id, name, created_at
      FROM namespaces
      WHERE user_id = ? AND id = ?
      LIMIT 1
    `,
    args: [userId, id],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    return null;
  }
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    createdAt: row.created_at as string,
  };
}

export async function createSession(params: {
  userId: string;
  namespaceId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<SessionRecord> {
  await ensureInitialized();
  const client = getDb();
  const id = `sess_${edgeRandomUUID().replaceAll("-", "")}`;
  const now = new Date().toISOString();
  const metadataJson = params.metadata ? JSON.stringify(params.metadata) : null;

  await client.execute({
    sql: `
      INSERT INTO sessions (id, user_id, namespace_id, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    args: [id, params.userId, params.namespaceId ?? null, metadataJson, now],
  });

  const namespaceName = params.namespaceId
    ? (await getNamespaceById(params.userId, params.namespaceId))?.name ?? null
    : null;

  return {
    id,
    userId: params.userId,
    namespaceId: params.namespaceId ?? null,
    namespaceName,
    metadata: params.metadata ?? null,
    createdAt: now,
  };
}

export async function listSessions(params: {
  userId: string;
  namespaceId?: string | null;
}): Promise<SessionRecord[]> {
  await ensureInitialized();
  const client = getDb();
  const hasNamespaceFilter = typeof params.namespaceId !== "undefined";
  const result = await client.execute({
    sql: `
      SELECT s.id, s.user_id, s.namespace_id, s.metadata_json, s.created_at, n.name AS namespace_name
      FROM sessions s
      LEFT JOIN namespaces n ON n.id = s.namespace_id
      WHERE s.user_id = ?
      ${hasNamespaceFilter ? "AND s.namespace_id = ?" : ""}
      ORDER BY s.created_at DESC
    `,
    args: hasNamespaceFilter ? [params.userId, params.namespaceId ?? null] : [params.userId],
  });

  return result.rows.map((row) => {
    const record = row as Record<string, unknown>;
    return {
      id: record.id as string,
      userId: record.user_id as string,
      namespaceId: (record.namespace_id as string | null) ?? null,
      namespaceName: (record.namespace_name as string | null) ?? null,
      metadata: parseJsonObject(record.metadata_json),
      createdAt: record.created_at as string,
    };
  });
}

export async function getSessionById(userId: string, sessionId: string): Promise<SessionRecord | null> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT s.id, s.user_id, s.namespace_id, s.metadata_json, s.created_at, n.name AS namespace_name
      FROM sessions s
      LEFT JOIN namespaces n ON n.id = s.namespace_id
      WHERE s.user_id = ? AND s.id = ?
      LIMIT 1
    `,
    args: [userId, sessionId],
  });

  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    return null;
  }

  return {
    id: row.id as string,
    userId: row.user_id as string,
    namespaceId: (row.namespace_id as string | null) ?? null,
    namespaceName: (row.namespace_name as string | null) ?? null,
    metadata: parseJsonObject(row.metadata_json),
    createdAt: row.created_at as string,
  };
}

export async function insertAgentMemory(params: {
  userId: string;
  title?: string;
  text: string;
  sourceType?: MemorySourceType;
  memoryType?: MemoryKind;
  sourceUrl?: string | null;
  fileName?: string | null;
  entities?: string[];
  metadata?: Record<string, unknown> | null;
  namespaceId?: string | null;
  sessionId?: string | null;
  isEncrypted?: boolean;
}): Promise<AgentMemoryRecord> {
  await ensureInitialized();
  await ensureRateLimiterInitialized();
  const client = getDb();
  const id = edgeRandomUUID();
  const now = new Date().toISOString();
  const text = params.text.trim();
  const title = (params.title?.trim() || text.slice(0, 80) || "Untitled Memory").trim();
  const metadataJson = params.metadata ? JSON.stringify(params.metadata) : null;
  const sourceType = params.sourceType ?? "text";
  const memoryType = params.memoryType ?? "episodic";
  const entities = params.entities ?? [];
  const entitiesJson = JSON.stringify(entities);
  const textHash = contentHash(text);
  const sizeBytes = Buffer.byteLength(text, "utf8");

  // Encrypt content at rest unless the payload is already encrypted.
  const storedText = params.isEncrypted ? text : encryptMemoryContent(text, params.userId);

  const tx = await client.transaction("write");

  try {
    await reserveMemoryQuotaInTransaction(tx, params.userId, sizeBytes);
    await tx.execute({
      sql: `
        INSERT INTO memories (
          id, user_id, title, source_type, memory_type, importance, tags_csv,
          source_url, file_name, content_text, content_iv, content_encrypted, content_hash, arweave_tx_id,
          sync_status, sync_error, created_at, namespace_id, session_id, metadata_json, entities, entities_json
        ) VALUES (?, ?, ?, ?, ?, 5, '', ?, ?, ?, NULL, ?, ?, NULL, 'pending', NULL, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        id,
        params.userId,
        title,
        sourceType,
        memoryType,
        params.sourceUrl ?? null,
        params.fileName ?? null,
        storedText,
        params.isEncrypted ? 1 : 0,
        textHash,
        now,
        params.namespaceId ?? null,
        params.sessionId ?? null,
        metadataJson,
        entitiesJson,
        entitiesJson,
      ],
    });
    await tx.commit();
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  } finally {
    tx.close();
  }

  return {
    id,
    userId: params.userId,
    title,
    text,
    sourceType,
    memoryType,
    sourceUrl: params.sourceUrl ?? null,
    fileName: params.fileName ?? null,
    metadata: params.metadata ?? null,
    namespaceId: params.namespaceId ?? null,
    sessionId: params.sessionId ?? null,
    entities,
    feedbackScore: 0,
    accessCount: 0,
    isEncrypted: params.isEncrypted ?? false,
    createdAt: now,
  };
}

export async function listAgentMemories(params: {
  userId: string;
  namespaceId?: string | null;
  sessionId?: string | null;
  limit?: number;
  since?: string;
  memoryTypes?: MemoryKind[];
  excludeMemoryTypes?: MemoryKind[];
}): Promise<AgentMemoryRecord[]> {
  await ensureInitialized();
  const client = getDb();
  const hasNamespaceFilter = typeof params.namespaceId !== "undefined";
  const hasSessionFilter = typeof params.sessionId !== "undefined";
  const hasSince = typeof params.since === "string" && params.since.length > 0;
  const limit = Math.max(1, Math.min(params.limit ?? 50, 200));
  const args: Array<string | number | null> = [params.userId];
  let where = "WHERE user_id = ? AND archived_at IS NULL";

  if (hasNamespaceFilter) {
    where += " AND namespace_id = ?";
    args.push(params.namespaceId ?? null);
  }
  if (hasSessionFilter) {
    where += " AND session_id = ?";
    args.push(params.sessionId ?? null);
  }
  if (hasSince) {
    where += " AND created_at >= ?";
    args.push(params.since as string);
  }
  if (params.memoryTypes?.length) {
    where += ` AND memory_type IN (${params.memoryTypes.map(() => "?").join(",")})`;
    args.push(...params.memoryTypes);
  }
  if (params.excludeMemoryTypes?.length) {
    where += ` AND memory_type NOT IN (${params.excludeMemoryTypes.map(() => "?").join(",")})`;
    args.push(...params.excludeMemoryTypes);
  }
  args.push(limit);

  const result = await client.execute({
    sql: `
      SELECT id, user_id, title, source_type, memory_type, source_url, file_name, content_text, metadata_json,
             namespace_id, session_id, entities, entities_json, feedback_score, access_count, created_at
      FROM memories
      ${where}
      ORDER BY created_at DESC
      LIMIT ?
    `,
    args,
  });

  return result.rows.map((row) => mapAgentMemoryRow(row as Record<string, unknown>));
}

export async function listConsolidatedMemories(params: {
  userId: string;
  namespaceId?: string | null;
  limit?: number;
}): Promise<AgentMemoryRecord[]> {
  await ensureInitialized();
  const client = getDb();
  const hasNamespaceFilter = typeof params.namespaceId !== "undefined";
  const limit = Math.max(1, Math.min(params.limit ?? 200, 500));
  const args: Array<string | number | null> = [params.userId];
  let where = `
    WHERE user_id = ?
      AND archived_at IS NULL
      AND (memory_type = 'reflected' OR instr(',' || tags_csv || ',', ',consolidated,') > 0)
  `;

  if (hasNamespaceFilter) {
    where += " AND namespace_id = ?";
    args.push(params.namespaceId ?? null);
  }
  args.push(limit);

  const result = await client.execute({
    sql: `
      SELECT id, user_id, title, source_type, memory_type, source_url, file_name, content_text, metadata_json,
             namespace_id, session_id, entities, entities_json, feedback_score, access_count, created_at
      FROM memories
      ${where}
      ORDER BY created_at DESC
      LIMIT ?
    `,
    args,
  });

  return result.rows.map((row) => mapAgentMemoryRow(row as Record<string, unknown>));
}

export async function listSessionMemories(userId: string, sessionId: string): Promise<AgentMemoryRecord[]> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT id, user_id, title, source_type, memory_type, source_url, file_name, content_text, metadata_json,
             namespace_id, session_id, entities, entities_json, feedback_score, access_count, created_at
      FROM memories
      WHERE user_id = ? AND session_id = ? AND archived_at IS NULL
      ORDER BY created_at ASC
    `,
    args: [userId, sessionId],
  });
  return result.rows.map((row) => mapAgentMemoryRow(row as Record<string, unknown>));
}

/**
 * Find memories that have overlapping entities with the given entity list.
 * Used for auto-linking memories based on shared entities.
 * Returns up to `limit` memories (excluding the given memoryId).
 */
export async function findMemoriesWithSharedEntities(
  userId: string,
  entities: string[],
  excludeMemoryId?: string,
  limit: number = 20
): Promise<Array<{ id: string; entities: string[] }>> {
  if (entities.length === 0) {
    return [];
  }

  await ensureInitialized();
  const client = getDb();

  // Query recent memories that have entities
  const result = await client.execute({
    sql: `
      SELECT id, entities, entities_json
      FROM memories
      WHERE user_id = ?
        AND archived_at IS NULL
        ${excludeMemoryId ? "AND id != ?" : ""}
        AND (entities IS NOT NULL OR entities_json IS NOT NULL)
      ORDER BY created_at DESC
      LIMIT ?
    `,
    args: excludeMemoryId 
      ? [userId, excludeMemoryId, Math.min(limit * 5, 100)] 
      : [userId, Math.min(limit * 5, 100)],
  });

  // Filter for memories with actual entity overlap
  const normalizedInputEntities = new Set(
    entities.map(e => e.trim().toLowerCase())
  );

  const matches: Array<{ id: string; entities: string[] }> = [];

  for (const row of result.rows) {
    const memoryEntities = parseJsonStringArray(
      (row.entities as string | null) ?? (row.entities_json as string | null)
    );

    if (memoryEntities.length === 0) continue;

    // Check for overlap
    const hasOverlap = memoryEntities.some(e => 
      normalizedInputEntities.has(e.trim().toLowerCase())
    );

    if (hasOverlap) {
      matches.push({
        id: row.id as string,
        entities: memoryEntities,
      });

      if (matches.length >= limit) break;
    }
  }

  return matches;
}

export async function getAgentMemoryById(userId: string, id: string): Promise<AgentMemoryRecord | null> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT id, user_id, title, source_type, memory_type, source_url, file_name, content_text, metadata_json,
             namespace_id, session_id, entities, entities_json, feedback_score, access_count, created_at
      FROM memories
      WHERE user_id = ? AND id = ?
      LIMIT 1
    `,
    args: [userId, id],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? mapAgentMemoryRow(row) : null;
}

export async function getAgentMemoriesByIds(params: {
  userId: string;
  ids: string[];
  namespaceId?: string | null;
  since?: string;
  memoryTypes?: MemoryKind[];
  excludeMemoryTypes?: MemoryKind[];
}): Promise<AgentMemoryRecord[]> {
  await ensureInitialized();
  if (params.ids.length === 0) {
    return [];
  }

  const client = getDb();
  const placeholders = params.ids.map(() => "?").join(",");
  const hasNamespaceFilter = typeof params.namespaceId !== "undefined";
  const hasSince = typeof params.since === "string" && params.since.length > 0;
  const args: Array<string | number | null> = [params.userId, ...params.ids];
  if (hasNamespaceFilter) {
    args.push(params.namespaceId ?? null);
  }
  if (hasSince) {
    args.push(params.since ?? null);
  }
  if (params.memoryTypes?.length) {
    args.push(...params.memoryTypes);
  }
  if (params.excludeMemoryTypes?.length) {
    args.push(...params.excludeMemoryTypes);
  }

  const result = await client.execute({
    sql: `
      SELECT id, user_id, title, source_type, memory_type, source_url, file_name, content_text, metadata_json,
             namespace_id, session_id, entities, entities_json, feedback_score, access_count, created_at
      FROM memories
      WHERE user_id = ? AND id IN (${placeholders}) AND archived_at IS NULL
      ${hasNamespaceFilter ? "AND namespace_id = ?" : ""}
      ${hasSince ? "AND created_at >= ?" : ""}
      ${params.memoryTypes?.length ? `AND memory_type IN (${params.memoryTypes.map(() => "?").join(",")})` : ""}
      ${params.excludeMemoryTypes?.length ? `AND memory_type NOT IN (${params.excludeMemoryTypes.map(() => "?").join(",")})` : ""}
    `,
    args,
  });

  return result.rows.map((row) => mapAgentMemoryRow(row as Record<string, unknown>));
}

export async function deleteAgentMemoryById(userId: string, id: string): Promise<boolean> {
  await ensureInitialized();
  const client = getDb();
  
  // Delete memory from main table
  const result = await client.execute({
    sql: `
      DELETE FROM memories
      WHERE user_id = ? AND id = ?
    `,
    args: [userId, id],
  });

  const deleted = (result.rowsAffected ?? 0) > 0;
  
  // Cascade: delete vector (best-effort, don't fail if vector missing)
  if (deleted) {
    try {
      await deleteMemoryVector(id);
    } catch (e) {
      console.error(`Failed to delete vector for memory ${id}:`, e);
      // Don't fail the operation - main memory is deleted
    }
  }

  return deleted;
}

export async function archiveAgentMemoriesByIds(userId: string, ids: string[]): Promise<number> {
  await ensureInitialized();
  if (ids.length === 0) {
    return 0;
  }

  const client = getDb();
  const now = new Date().toISOString();
  const placeholders = ids.map(() => "?").join(",");
  const result = await client.execute({
    sql: `
      UPDATE memories
      SET archived_at = ?
      WHERE user_id = ? AND id IN (${placeholders}) AND archived_at IS NULL
    `,
    args: [now, userId, ...ids],
  });

  return result.rowsAffected ?? 0;
}

export async function deleteAgentMemoriesByIds(userId: string, ids: string[]): Promise<number> {
  await ensureInitialized();
  if (ids.length === 0) {
    return 0;
  }

  const client = getDb();
  const placeholders = ids.map(() => "?").join(",");
  const result = await client.execute({
    sql: `
      DELETE FROM memories
      WHERE user_id = ? AND id IN (${placeholders})
    `,
    args: [userId, ...ids],
  });

  return result.rowsAffected ?? 0;
}

export type MemoryCompactionCandidate = AgentMemoryRecord & {
  embedding: number[];
  strength: number;
  mentionCount: number;
  archivedAt: string | null;
};

export async function listMemoryCompactionCandidates(params: {
  userId: string;
  namespaceId?: string | null;
  excludeMemoryTypes?: MemoryKind[];
  limit?: number;
}): Promise<MemoryCompactionCandidate[]> {
  await ensureInitialized();
  const client = getDb();
  const hasNamespaceFilter = typeof params.namespaceId !== "undefined";
  const limit = Math.max(1, Math.min(params.limit ?? 1000, 5000));
  const args: Array<string | number | null> = [params.userId];
  let where = "WHERE user_id = ? AND archived_at IS NULL";

  if (hasNamespaceFilter) {
    where += " AND namespace_id = ?";
    args.push(params.namespaceId ?? null);
  }
  if (params.excludeMemoryTypes?.length) {
    where += ` AND memory_type NOT IN (${params.excludeMemoryTypes.map(() => "?").join(",")})`;
    args.push(...params.excludeMemoryTypes);
  }
  args.push(limit);

  const result = await client.execute({
    sql: `
      SELECT id, user_id, title, source_type, memory_type, source_url, file_name, content_text, metadata_json,
             namespace_id, session_id, entities, entities_json, feedback_score, access_count, created_at,
             embedding, strength, mention_count, archived_at
      FROM memories
      ${where}
      ORDER BY created_at DESC
      LIMIT ?
    `,
    args,
  });

  return result.rows.map((row) => {
    const record = row as Record<string, unknown>;
    let embedding: number[] = [];
    try {
      embedding = JSON.parse((record.embedding as string) || "[]") as number[];
    } catch {
      // no-op
    }

    return {
      ...mapAgentMemoryRow(record),
      embedding,
      strength: Number(record.strength ?? 1),
      mentionCount: Number(record.mention_count ?? 1),
      archivedAt: (record.archived_at as string | null) ?? null,
    };
  });
}

// =============================================================================
// Reinforcement & Decay Functions
// =============================================================================

export type MemoryWithEmbedding = {
  id: string;
  embedding: number[];
  strength: number;
  mentionCount: number;
  entities: string[];
  sourceConversations: string[];
  halflifeDays: number;
  lastAccessedAt: string | null;
  lastMentionedAt: string | null;
};

export async function getMemoriesWithEmbeddings(
  userId: string,
  namespaceId?: string | null,
  limit = 500
): Promise<MemoryWithEmbedding[]> {
  await ensureInitialized();
  const client = getDb();
  const hasNamespace = typeof namespaceId !== "undefined";
  
  const result = await client.execute({
    sql: `
      SELECT id, embedding, strength, mention_count, entities_json, 
             source_conversations, halflife_days, last_accessed_at, last_mentioned_at
      FROM memories
      WHERE user_id = ? 
      ${hasNamespace ? "AND namespace_id = ?" : ""}
      AND embedding IS NOT NULL
      AND archived_at IS NULL
      ORDER BY created_at DESC
      LIMIT ?
    `,
    args: hasNamespace ? [userId, namespaceId ?? null, limit] : [userId, limit],
  });

  return result.rows.map((row) => {
    const record = row as Record<string, unknown>;
    let embedding: number[] = [];
    try {
      embedding = JSON.parse((record.embedding as string) || "[]") as number[];
    } catch {
      // no-op
    }
    
    let entities: string[] = [];
    try {
      entities = JSON.parse((record.entities_json as string) || "[]") as string[];
    } catch {
      // no-op
    }
    
    let sourceConversations: string[] = [];
    try {
      sourceConversations = JSON.parse((record.source_conversations as string) || "[]") as string[];
    } catch {
      // no-op
    }

    return {
      id: record.id as string,
      embedding,
      strength: Number(record.strength ?? 1.0),
      mentionCount: Number(record.mention_count ?? 1),
      entities,
      sourceConversations,
      halflifeDays: Number(record.halflife_days ?? 60),
      lastAccessedAt: (record.last_accessed_at as string | null) ?? null,
      lastMentionedAt: (record.last_mentioned_at as string | null) ?? null,
    };
  });
}

/**
 * Check if a memory with the given embedding hash already exists
 * Used to prevent race-condition duplicates during embedding-based storage
 */
export async function checkEmbeddingHashExists(
  userId: string,
  embeddingHash: string
): Promise<{ id: string; strength: number; mentionCount: number } | null> {
  await ensureInitialized();
  const client = getDb();

  const result = await client.execute({
    sql: `
      SELECT id, strength, mention_count
      FROM memories
      WHERE user_id = ? AND embedding_hash = ?
      LIMIT 1
    `,
    args: [userId, embeddingHash],
  });

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0] as Record<string, unknown>;
  return {
    id: row.id as string,
    strength: Number(row.strength ?? 1.0),
    mentionCount: Number(row.mention_count ?? 1),
  };
}

export async function reinforceMemory(
  memoryId: string,
  userId: string,
  update: {
    newStrength: number;
    mentionCount: number;
    entities?: string[];
    conversationId?: string;
  }
): Promise<void> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();

  // Use atomic transaction to prevent race conditions
  // "Atomic reinforcement" - read and update in single transaction
  await client.batch([
    // First: read current values and update atomically
    // We use SQL-level JSON operations to avoid read-modify-write race
    {
      sql: `
        UPDATE memories
        SET 
          strength = MAX(?, 0.1),
          mention_count = MAX(mention_count, ?),
          entities = CASE
            WHEN entities IS NULL OR entities = '[]' THEN ?
            ELSE (
              SELECT json_group_array(DISTINCT value)
              FROM (
                SELECT value FROM json_each(entities)
                UNION ALL
                SELECT value FROM json_each(?)
              )
            )
          END,
          entities_json = CASE 
            WHEN entities_json IS NULL OR entities_json = '[]' THEN ?
            ELSE (
              SELECT json_group_array(DISTINCT value)
              FROM (
                SELECT value FROM json_each(entities_json)
                UNION ALL
                SELECT value FROM json_each(?)
              )
            )
          END,
          source_conversations = CASE
            WHEN ? IS NULL THEN source_conversations
            WHEN source_conversations IS NULL OR source_conversations = '[]' THEN json_array(?)
            WHEN instr(source_conversations, ?) > 0 THEN source_conversations
            ELSE json_insert(source_conversations, '$[#]', ?)
          END,
          last_mentioned_at = ?,
          last_accessed_at = ?
        WHERE id = ? AND user_id = ?
      `,
      args: [
        update.newStrength,
        update.mentionCount,
        JSON.stringify(update.entities || []),
        JSON.stringify(update.entities || []),
        JSON.stringify(update.entities || []),
        JSON.stringify(update.entities || []),
        update.conversationId || null,
        update.conversationId || "",
        update.conversationId || "",
        update.conversationId || "",
        now,
        now,
        memoryId,
        userId,
      ],
    },
  ], "write");
}

export async function updateMemoryAccess(memoryId: string, userId: string): Promise<void> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();

  await client.execute({
    sql: `
      UPDATE memories
      SET access_count = access_count + 1,
          last_accessed_at = ?
      WHERE id = ? AND user_id = ?
    `,
    args: [now, memoryId, userId],
  });
}

export async function updateAgentMemory(
  userId: string,
  memoryId: string,
  updates: { title?: string; text?: string }
): Promise<boolean> {
  await ensureInitialized();
  const client = getDb();

  const setClauses: string[] = [];
  const args: (string | number)[] = [];

  if (updates.title !== undefined) {
    setClauses.push("title = ?");
    args.push(updates.title);
  }
  if (updates.text !== undefined) {
    setClauses.push("content_text = ?");
    args.push(updates.text);
    // Update content hash when text changes
    const textHash = contentHash(updates.text);
    setClauses.push("content_hash = ?");
    args.push(textHash);
  }

  if (setClauses.length === 0) {
    return false;
  }

  args.push(memoryId, userId);

  const result = await client.execute({
    sql: `
      UPDATE memories
      SET ${setClauses.join(", ")}
      WHERE id = ? AND user_id = ? AND archived_at IS NULL
    `,
    args,
  });

  return (result.rowsAffected ?? 0) > 0;
}

export async function recordMemorySearchHits(userId: string, memoryIds: string[]): Promise<void> {
  await ensureInitialized();
  if (memoryIds.length === 0) {
    return;
  }

  const client = getDb();
  const now = new Date().toISOString();
  const placeholders = memoryIds.map(() => "?").join(",");

  await client.execute({
    sql: `
      UPDATE memories
      SET access_count = access_count + 1,
          last_accessed_at = ?
      WHERE user_id = ? AND id IN (${placeholders})
    `,
    args: [now, userId, ...memoryIds],
  });
}

export async function applyMemoryFeedback(params: {
  userId: string;
  memoryId: string;
  rating: "positive" | "negative";
}): Promise<AgentMemoryRecord | null> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();
  const delta = params.rating === "positive" ? 1 : -1;

  await client.execute({
    sql: `
      UPDATE memories
      SET feedback_score = feedback_score + ?,
          strength = CASE
            WHEN ? > 0 THEN MIN(COALESCE(strength, 1.0) + 0.15, 4.0)
            ELSE MAX(COALESCE(strength, 1.0) - 0.2, 0.1)
          END,
          base_strength = CASE
            WHEN ? > 0 THEN MIN(COALESCE(base_strength, 1.0) + 0.05, 3.0)
            ELSE MAX(COALESCE(base_strength, 1.0) - 0.05, 0.1)
          END,
          halflife_days = CASE
            WHEN ? > 0 THEN MIN(COALESCE(halflife_days, 60) + 7, 365)
            ELSE MAX(COALESCE(halflife_days, 60) - 7, 7)
          END,
          last_accessed_at = ?
      WHERE id = ? AND user_id = ?
    `,
    args: [delta, delta, delta, delta, now, params.memoryId, params.userId],
  });

  return getAgentMemoryById(params.userId, params.memoryId);
}

export async function getMemoriesForDecay(userId: string): Promise<Array<{
  id: string;
  strength: number;
  baseStrength: number;
  halflifeDays: number;
  accessCount: number;
  feedbackScore: number;
  lastAccessedAt: string | null;
  archivedAt: string | null;
}>> {
  await ensureInitialized();
  const client = getDb();

  const result = await client.execute({
    sql: `
      SELECT id, strength, base_strength, halflife_days, access_count, feedback_score, last_accessed_at, archived_at
      FROM memories
      WHERE user_id = ?
    `,
    args: [userId],
  });

  return result.rows.map((row) => {
    const record = row as Record<string, unknown>;
    return {
      id: record.id as string,
      strength: Number(record.strength ?? 1.0),
      baseStrength: Number(record.base_strength ?? 1.0),
      halflifeDays: Number(record.halflife_days ?? 60),
      accessCount: Number(record.access_count ?? 0),
      feedbackScore: Number(record.feedback_score ?? 0),
      lastAccessedAt: (record.last_accessed_at as string | null) ?? null,
      archivedAt: (record.archived_at as string | null) ?? null,
    };
  });
}

export async function updateMemoryStrength(memoryId: string, userId: string, newStrength: number): Promise<void> {
  await ensureInitialized();
  const client = getDb();

  await client.execute({
    sql: `UPDATE memories SET strength = ? WHERE id = ? AND user_id = ?`,
    args: [newStrength, memoryId, userId],
  });
}

export async function archiveMemory(memoryId: string, userId: string): Promise<void> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();

  await client.execute({
    sql: `UPDATE memories SET archived_at = ? WHERE id = ? AND user_id = ?`,
    args: [now, memoryId, userId],
  });
}

export async function deleteArchivedMemories(userId: string, olderThanDays: number = 30): Promise<number> {
  await ensureInitialized();
  const client = getDb();
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  const staleResult = await client.execute({
    sql: `
      SELECT id
      FROM memories
      WHERE user_id = ? AND archived_at IS NOT NULL AND archived_at < ?
    `,
    args: [userId, cutoff],
  });
  const ids = staleResult.rows.map((row) => row.id as string);

  if (ids.length === 0) {
    return 0;
  }

  const result = await client.execute({
    sql: `
      DELETE FROM memories
      WHERE user_id = ? AND archived_at IS NOT NULL AND archived_at < ?
    `,
    args: [userId, cutoff],
  });

  await Promise.allSettled(ids.map(async (id) => deleteMemoryVector(id)));

  return result.rowsAffected ?? 0;
}

/**
 * Hash embedding vector for deduplication
 * Quantizes to reduce floating point noise, then hashes
 */
function hashEmbedding(vector: number[]): string {
  const quantized = vector.map(v => Math.round(v * 10000) / 10000);
  const data = JSON.stringify(quantized);
  return contentHash(data).slice(0, 32);
}

export async function insertMemoryWithMetadata(params: {
  userId: string;
  title?: string;
  text: string;
  embedding?: number[];
  memoryType?: string;
  importance?: number;
  halflifeDays?: number;
  entities?: string[];
  conversationId?: string;
  namespaceId?: string | null;
  sessionId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<AgentMemoryRecord> {
  await ensureInitialized();
  const client = getDb();
  const id = edgeRandomUUID();
  const now = new Date().toISOString();
  const text = params.text.trim();
  const title = (params.title?.trim() || text.slice(0, 80) || "Untitled Memory").trim();
  const metadataJson = params.metadata ? JSON.stringify(params.metadata) : null;
  const textHash = contentHash(text);
  const embeddingJson = params.embedding ? JSON.stringify(params.embedding) : null;
  const embeddingHashValue = params.embedding ? hashEmbedding(params.embedding) : null;
  const entities = params.entities ?? [];
  const entitiesJson = JSON.stringify(entities);
  const conversationsJson = params.conversationId ? JSON.stringify([params.conversationId]) : null;

  await client.execute({
    sql: `
      INSERT INTO memories (
        id, user_id, title, source_type, memory_type, importance, tags_csv,
        source_url, file_name, content_text, content_iv, content_encrypted, content_hash, arweave_tx_id,
        sync_status, sync_error, created_at, namespace_id, session_id, metadata_json,
        embedding, embedding_hash, strength, base_strength, halflife_days, entities, entities_json, source_conversations,
        first_mentioned_at, last_mentioned_at, last_accessed_at
      ) VALUES (?, ?, ?, 'text', ?, ?, '', NULL, NULL, ?, NULL, 0, ?, NULL, 'pending', NULL, ?, ?, ?, ?,
                ?, ?, 1.0, 1.0, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      id,
      params.userId,
      title,
      params.memoryType ?? 'episodic',
      params.importance ?? 5,
      text,
      textHash,
      now,
      params.namespaceId ?? null,
      params.sessionId ?? null,
      metadataJson,
      embeddingJson,
      embeddingHashValue,
      params.halflifeDays ?? 60,
      entitiesJson,
      entitiesJson,
      conversationsJson,
      now,  // first_mentioned_at
      now,  // last_mentioned_at
      now,  // last_accessed_at
    ],
  });

  return {
    id,
    userId: params.userId,
    title,
    text,
    sourceType: "text",
    memoryType: (params.memoryType as MemoryKind) ?? "episodic",
    sourceUrl: null,
    fileName: null,
    metadata: params.metadata ?? null,
    namespaceId: params.namespaceId ?? null,
    sessionId: params.sessionId ?? null,
    entities,
    feedbackScore: 0,
    accessCount: 0,
    createdAt: now,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && /unique constraint failed/i.test(error.message);
}

export async function insertMemoryWithMetadataAndQuota(params: {
  userId: string;
  title?: string;
  text: string;
  embedding?: number[];
  memoryType?: string;
  importance?: number;
  halflifeDays?: number;
  entities?: string[];
  conversationId?: string;
  namespaceId?: string | null;
  sessionId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<{ memory: AgentMemoryRecord; created: boolean }> {
  await ensureInitialized();
  await ensureRateLimiterInitialized();

  const client = getDb();
  const id = edgeRandomUUID();
  const now = new Date().toISOString();
  const text = params.text.trim();
  const title = (params.title?.trim() || text.slice(0, 80) || "Untitled Memory").trim();
  const metadataJson = params.metadata ? JSON.stringify(params.metadata) : null;
  const textHash = contentHash(text);
  const embeddingJson = params.embedding ? JSON.stringify(params.embedding) : null;
  const embeddingHashValue = params.embedding ? hashEmbedding(params.embedding) : null;
  const entities = params.entities ?? [];
  const entitiesJson = JSON.stringify(entities);
  const conversationsJson = params.conversationId ? JSON.stringify([params.conversationId]) : null;
  const sizeBytes = Buffer.byteLength(text, "utf8");
  const tx = await client.transaction("write");

  try {
    await reserveMemoryQuotaInTransaction(tx, params.userId, sizeBytes);
    await tx.execute({
      sql: `
        INSERT INTO memories (
          id, user_id, title, source_type, memory_type, importance, tags_csv,
          source_url, file_name, content_text, content_iv, content_encrypted, content_hash, arweave_tx_id,
          sync_status, sync_error, created_at, namespace_id, session_id, metadata_json,
          embedding, embedding_hash, strength, base_strength, halflife_days, entities, entities_json, source_conversations,
          first_mentioned_at, last_mentioned_at, last_accessed_at
        ) VALUES (?, ?, ?, 'text', ?, ?, '', NULL, NULL, ?, NULL, 0, ?, NULL, 'pending', NULL, ?, ?, ?, ?,
                  ?, ?, 1.0, 1.0, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        id,
        params.userId,
        title,
        params.memoryType ?? "episodic",
        params.importance ?? 5,
        text,
        textHash,
        now,
        params.namespaceId ?? null,
        params.sessionId ?? null,
        metadataJson,
        embeddingJson,
        embeddingHashValue,
        params.halflifeDays ?? 60,
        entitiesJson,
        entitiesJson,
        conversationsJson,
        now,
        now,
        now,
      ],
    });
    await tx.commit();
  } catch (error) {
    await tx.rollback().catch(() => {});
    if (embeddingHashValue && isUniqueConstraintError(error)) {
      const existing = await checkEmbeddingHashExists(params.userId, embeddingHashValue);
      if (existing) {
        const memory = await getAgentMemoryById(params.userId, existing.id);
        if (!memory) {
          throw error;
        }
        return { memory, created: false };
      }
    }
    throw error;
  } finally {
    tx.close();
  }

  return {
    memory: {
      id,
      userId: params.userId,
      title,
      text,
      sourceType: "text",
      memoryType: (params.memoryType as MemoryKind) ?? "episodic",
      sourceUrl: null,
      fileName: null,
      metadata: params.metadata ?? null,
      namespaceId: params.namespaceId ?? null,
      sessionId: params.sessionId ?? null,
      entities,
      feedbackScore: 0,
      accessCount: 0,
      createdAt: now,
    },
    created: true,
  };
}
