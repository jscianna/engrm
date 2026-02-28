import crypto from "node:crypto";
import { createClient, type Client } from "@libsql/client";
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
      arweave_jwk TEXT,
      arweave_jwk_encrypted TEXT,
      arweave_jwk_iv TEXT,
      arweave_jwk_key_encrypted TEXT,
      arweave_jwk_key_iv TEXT,
      vault_salt TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      agent_id TEXT NOT NULL,
      agent_name TEXT,
      created_at TEXT NOT NULL,
      last_used TEXT
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
    await ensureUserSettingsColumns(client);

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
    { name: "halflife_days", ddl: "INTEGER DEFAULT 60" },
    { name: "last_accessed_at", ddl: "TEXT" },
    { name: "last_mentioned_at", ddl: "TEXT" },
    { name: "first_mentioned_at", ddl: "TEXT" },
    { name: "archived_at", ddl: "TEXT" },
    { name: "source_conversations", ddl: "TEXT" },  // JSON array
    { name: "entities_json", ddl: "TEXT" },  // JSON array
    { name: "embedding", ddl: "TEXT" },  // JSON array of floats
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

async function ensureUserSettingsColumns(client: Client): Promise<void> {
  const requiredColumns: Array<{ name: string; ddl: string }> = [
    { name: "vault_salt", ddl: "TEXT" },
    { name: "arweave_wallet_encrypted", ddl: "TEXT" },
    { name: "arweave_wallet_iv", ddl: "TEXT" },
    { name: "arweave_wallet_address", ddl: "TEXT" },
  ];

  const tableInfo = await client.execute("PRAGMA table_info(user_settings)");
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
    await client.execute(`ALTER TABLE user_settings ADD COLUMN ${column.name} ${column.ddl}`);
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
  metadata: Record<string, unknown> | null;
  namespaceId: string | null;
  sessionId: string | null;
  createdAt: string;
};

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
    contentIv: row.content_iv as string | null,
    isEncrypted: Number(row.content_encrypted ?? 0) === 1,
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
  const id = `edge_${crypto.randomUUID().replaceAll("-", "")}`;
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

export async function getUserVaultSalt(userId: string): Promise<string | null> {
  await ensureInitialized();
  const client = getDb();

  const result = await client.execute({
    sql: `
      SELECT vault_salt
      FROM user_settings
      WHERE user_id = ?
    `,
    args: [userId],
  });

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0] as Record<string, unknown>;
  return typeof row.vault_salt === "string" && row.vault_salt.length > 0 ? row.vault_salt : null;
}

export async function hasUserVaultSalt(userId: string): Promise<boolean> {
  const salt = await getUserVaultSalt(userId);
  return Boolean(salt);
}

export async function setUserVaultSalt(
  userId: string,
  vaultSalt: string,
  arweaveWallet?: { encrypted: string; iv: string; address: string }
): Promise<void> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();

  const existing = await getUserVaultSalt(userId);
  if (existing && existing !== vaultSalt) {
    throw new Error("Vault is already configured for this account.");
  }

  await client.execute({
    sql: `
      INSERT INTO user_settings (
        user_id, vault_salt, arweave_wallet_encrypted, arweave_wallet_iv, arweave_wallet_address, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        vault_salt = COALESCE(user_settings.vault_salt, excluded.vault_salt),
        arweave_wallet_encrypted = COALESCE(excluded.arweave_wallet_encrypted, user_settings.arweave_wallet_encrypted),
        arweave_wallet_iv = COALESCE(excluded.arweave_wallet_iv, user_settings.arweave_wallet_iv),
        arweave_wallet_address = COALESCE(excluded.arweave_wallet_address, user_settings.arweave_wallet_address),
        updated_at = excluded.updated_at
    `,
    args: [
      userId,
      vaultSalt,
      arweaveWallet?.encrypted ?? null,
      arweaveWallet?.iv ?? null,
      arweaveWallet?.address ?? null,
      now,
    ],
  });
}

export async function getUserArweaveWallet(userId: string): Promise<{
  encrypted: string;
  iv: string;
  address: string;
} | null> {
  await ensureInitialized();
  const client = getDb();

  const result = await client.execute({
    sql: `
      SELECT arweave_wallet_encrypted, arweave_wallet_iv, arweave_wallet_address
      FROM user_settings
      WHERE user_id = ?
    `,
    args: [userId],
  });

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0] as Record<string, unknown>;
  const encrypted = row.arweave_wallet_encrypted;
  const iv = row.arweave_wallet_iv;
  const address = row.arweave_wallet_address;

  if (typeof encrypted !== "string" || typeof iv !== "string" || typeof address !== "string") {
    return null;
  }

  return { encrypted, iv, address };
}

function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key, "utf8").digest("hex");
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
  return {
    id: row.id as string,
    userId: row.user_id as string,
    title: row.title as string,
    text: row.content_text as string,
    metadata: parseJsonObject(row.metadata_json),
    namespaceId: (row.namespace_id as string | null) ?? null,
    sessionId: (row.session_id as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function createApiKey(userId: string, agentName?: string): Promise<{ apiKey: string; agentId: string }> {
  await ensureInitialized();
  const client = getDb();
  const id = crypto.randomUUID();
  const agentId = `agent_${crypto.randomUUID().replaceAll("-", "")}`;
  const token = crypto.randomBytes(24).toString("hex");
  const apiKey = `mem_${token}`;
  const keyHash = hashApiKey(apiKey);
  const now = new Date().toISOString();

  await client.execute({
    sql: `
      INSERT INTO api_keys (id, user_id, key_hash, agent_id, agent_name, created_at, last_used)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    args: [id, userId, keyHash, agentId, agentName ?? null, now, now],
  });

  return { apiKey, agentId };
}

export async function validateApiKey(rawApiKey: string): Promise<ApiKeyIdentity | null> {
  await ensureInitialized();
  const client = getDb();
  const keyHash = hashApiKey(rawApiKey);

  const result = await client.execute({
    sql: `
      SELECT id, user_id, agent_id
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
  createdAt: string;
  lastUsed: string;
}>> {
  await ensureInitialized();
  const client = getDb();

  const result = await client.execute({
    sql: `
      SELECT id, agent_id, agent_name, created_at, last_used
      FROM api_keys
      WHERE user_id = ?
      ORDER BY created_at DESC
    `,
    args: [userId],
  });

  return result.rows.map((row) => ({
    id: row.id as string,
    agentId: row.agent_id as string,
    agentName: (row.agent_name as string) || "Unnamed Agent",
    keyPrefix: "mem_",
    createdAt: row.created_at as string,
    lastUsed: row.last_used as string,
  }));
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

export async function createNamespace(userId: string, name: string): Promise<NamespaceRecord> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();
  const cleaned = name.trim();
  if (!cleaned) {
    throw new Error("Namespace name is required.");
  }
  const id = `ns_${crypto.randomUUID().replaceAll("-", "")}`;

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
  const id = `sess_${crypto.randomUUID().replaceAll("-", "")}`;
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
  metadata?: Record<string, unknown> | null;
  namespaceId?: string | null;
  sessionId?: string | null;
}): Promise<AgentMemoryRecord> {
  await ensureInitialized();
  const client = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const text = params.text.trim();
  const title = (params.title?.trim() || text.slice(0, 80) || "Untitled Memory").trim();
  const metadataJson = params.metadata ? JSON.stringify(params.metadata) : null;
  const contentHash = crypto.createHash("sha256").update(text, "utf8").digest("hex");

  await client.execute({
    sql: `
      INSERT INTO memories (
        id, user_id, title, source_type, memory_type, importance, tags_csv,
        source_url, file_name, content_text, content_iv, content_encrypted, content_hash, arweave_tx_id,
        sync_status, sync_error, created_at, namespace_id, session_id, metadata_json
      ) VALUES (?, ?, ?, 'text', 'episodic', 5, '', NULL, NULL, ?, NULL, 0, ?, NULL, 'pending', NULL, ?, ?, ?, ?)
    `,
    args: [id, params.userId, title, text, contentHash, now, params.namespaceId ?? null, params.sessionId ?? null, metadataJson],
  });

  return {
    id,
    userId: params.userId,
    title,
    text,
    metadata: params.metadata ?? null,
    namespaceId: params.namespaceId ?? null,
    sessionId: params.sessionId ?? null,
    createdAt: now,
  };
}

export async function listAgentMemories(params: {
  userId: string;
  namespaceId?: string | null;
  limit?: number;
  since?: string;
}): Promise<AgentMemoryRecord[]> {
  await ensureInitialized();
  const client = getDb();
  const hasNamespaceFilter = typeof params.namespaceId !== "undefined";
  const hasSince = typeof params.since === "string" && params.since.length > 0;
  const limit = Math.max(1, Math.min(params.limit ?? 50, 200));
  const args: Array<string | number | null> = [params.userId];
  let where = "WHERE user_id = ? AND archived_at IS NULL";

  if (hasNamespaceFilter) {
    where += " AND namespace_id = ?";
    args.push(params.namespaceId ?? null);
  }
  if (hasSince) {
    where += " AND created_at >= ?";
    args.push(params.since as string);
  }
  args.push(limit);

  const result = await client.execute({
    sql: `
      SELECT id, user_id, title, content_text, metadata_json, namespace_id, session_id, created_at
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
      SELECT id, user_id, title, content_text, metadata_json, namespace_id, session_id, created_at
      FROM memories
      WHERE user_id = ? AND session_id = ?
      ORDER BY created_at ASC
    `,
    args: [userId, sessionId],
  });
  return result.rows.map((row) => mapAgentMemoryRow(row as Record<string, unknown>));
}

export async function getAgentMemoryById(userId: string, id: string): Promise<AgentMemoryRecord | null> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT id, user_id, title, content_text, metadata_json, namespace_id, session_id, created_at
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
}): Promise<AgentMemoryRecord[]> {
  await ensureInitialized();
  if (params.ids.length === 0) {
    return [];
  }

  const client = getDb();
  const placeholders = params.ids.map(() => "?").join(",");
  const hasNamespaceFilter = typeof params.namespaceId !== "undefined";
  const args: Array<string | number | null> = [params.userId, ...params.ids];
  if (hasNamespaceFilter) {
    args.push(params.namespaceId ?? null);
  }

  const result = await client.execute({
    sql: `
      SELECT id, user_id, title, content_text, metadata_json, namespace_id, session_id, created_at
      FROM memories
      WHERE user_id = ? AND id IN (${placeholders})
      ${hasNamespaceFilter ? "AND namespace_id = ?" : ""}
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
      await client.execute({
        sql: `DELETE FROM memory_vectors WHERE memory_id = ?`,
        args: [id],
      });
    } catch (e) {
      console.error(`Failed to delete vector for memory ${id}:`, e);
      // Don't fail the operation - main memory is deleted
    }
  }

  return deleted;
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

  // Get current values to merge
  const current = await client.execute({
    sql: `SELECT entities_json, source_conversations FROM memories WHERE id = ? AND user_id = ?`,
    args: [memoryId, userId],
  });
  
  const row = current.rows[0] as Record<string, unknown> | undefined;
  
  let existingEntities: string[] = [];
  let existingConversations: string[] = [];
  
  try {
    existingEntities = JSON.parse((row?.entities_json as string) || "[]") as string[];
  } catch { /* no-op */ }
  
  try {
    existingConversations = JSON.parse((row?.source_conversations as string) || "[]") as string[];
  } catch { /* no-op */ }

  // Merge entities (dedupe)
  const mergedEntities = [...new Set([...existingEntities, ...(update.entities || [])])];
  
  // Append conversation ID
  if (update.conversationId && !existingConversations.includes(update.conversationId)) {
    existingConversations.push(update.conversationId);
  }

  await client.execute({
    sql: `
      UPDATE memories
      SET strength = ?,
          mention_count = ?,
          entities_json = ?,
          source_conversations = ?,
          last_mentioned_at = ?
      WHERE id = ? AND user_id = ?
    `,
    args: [
      update.newStrength,
      update.mentionCount,
      JSON.stringify(mergedEntities),
      JSON.stringify(existingConversations),
      now,
      memoryId,
      userId,
    ],
  });
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

export async function getMemoriesForDecay(userId: string): Promise<Array<{
  id: string;
  strength: number;
  baseStrength: number;
  halflifeDays: number;
  lastAccessedAt: string | null;
  archivedAt: string | null;
}>> {
  await ensureInitialized();
  const client = getDb();

  const result = await client.execute({
    sql: `
      SELECT id, strength, base_strength, halflife_days, last_accessed_at, archived_at
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

  const result = await client.execute({
    sql: `
      DELETE FROM memories
      WHERE user_id = ? AND archived_at IS NOT NULL AND archived_at < ?
    `,
    args: [userId, cutoff],
  });

  return result.rowsAffected ?? 0;
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
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const text = params.text.trim();
  const title = (params.title?.trim() || text.slice(0, 80) || "Untitled Memory").trim();
  const metadataJson = params.metadata ? JSON.stringify(params.metadata) : null;
  const contentHash = crypto.createHash("sha256").update(text, "utf8").digest("hex");
  const embeddingJson = params.embedding ? JSON.stringify(params.embedding) : null;
  const entitiesJson = params.entities ? JSON.stringify(params.entities) : null;
  const conversationsJson = params.conversationId ? JSON.stringify([params.conversationId]) : null;

  await client.execute({
    sql: `
      INSERT INTO memories (
        id, user_id, title, source_type, memory_type, importance, tags_csv,
        source_url, file_name, content_text, content_iv, content_encrypted, content_hash, arweave_tx_id,
        sync_status, sync_error, created_at, namespace_id, session_id, metadata_json,
        embedding, strength, base_strength, halflife_days, entities_json, source_conversations,
        first_mentioned_at, last_mentioned_at, last_accessed_at
      ) VALUES (?, ?, ?, 'text', ?, ?, '', NULL, NULL, ?, NULL, 0, ?, NULL, 'pending', NULL, ?, ?, ?, ?,
                ?, 1.0, 1.0, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      id,
      params.userId,
      title,
      params.memoryType ?? 'episodic',
      params.importance ?? 5,
      text,
      contentHash,
      now,
      params.namespaceId ?? null,
      params.sessionId ?? null,
      metadataJson,
      embeddingJson,
      params.halflifeDays ?? 60,
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
    metadata: params.metadata ?? null,
    namespaceId: params.namespaceId ?? null,
    sessionId: params.sessionId ?? null,
    createdAt: now,
  };
}
