import crypto from "node:crypto";
import type { Client } from "@libsql/client";
import type {
  MemoryDashboardStats,
  MemoryEdgeRecord,
  MemoryGraphEdge,
  MemoryGraphNode,
  MemoryImportanceTier,
  MemoryDurabilityClass,
  MemoryKind,
  MemoryListItem,
  MemoryPeer,
  MemoryRecord,
  MemoryRelationshipType,
  MemorySourceType,
  MemorySyncStatus,
  SynthesizedMemoryRecord,
  GraphEdgeRecord,
  GraphEdgeType,
  GraphNodeType,
} from "@/lib/types";
import { getDb } from "@/lib/turso";
import { deleteMemoryVector } from "@/lib/qdrant";
import {
  ensureRateLimiterInitialized,
  reserveMemoryQuotaInTransaction,
} from "@/lib/rate-limiter";
import { ensureDatabaseMigrations } from "@/lib/db-migrations";
import { containsSecrets } from "@/lib/secrets";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";

function parseCanonicalBase64Key(input: string): Buffer | null {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input)) {
    return null;
  }

  const decoded = Buffer.from(input, "base64");
  if (decoded.length !== 32) {
    return null;
  }

  return decoded.toString("base64") === input ? decoded : null;
}

function getMasterKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY is required to encrypt and decrypt stored data.");
  }

  const trimmed = raw.trim();

  // Accept 64-char hex string (32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  // Accept canonical 32-byte base64 string
  const base64Key = parseCanonicalBase64Key(trimmed);
  if (base64Key) {
    return base64Key;
  }

  console.error(
    "[FATAL] ENCRYPTION_KEY is not a valid format. " +
    "Weak passphrases are no longer accepted. " +
    "If you relied on the legacy SHA-256 fallback, derive the replacement " +
    "64-char hex key offline from the previous value before restarting."
  );
  throw new Error(
    `ENCRYPTION_KEY is not a valid 64-char hex or 32-byte base64 key. ` +
    `Weak keys are no longer accepted. Check server logs for migration instructions.`
  );
}

/**
 * Derive a per-user encryption key from master key + userId.
 * This ensures each user's data is encrypted with a unique key.
 */
function deriveUserKey(userId: string): Buffer {
  const master = getMasterKey();
  return Buffer.from(crypto.hkdfSync("sha256", master, Buffer.alloc(0), `fathippo:memory:${userId}`, 32));
}

/**
 * Encrypt memory content for at-rest storage.
 * Returns the encrypted content as a JSON string containing ciphertext and iv.
 */
function encryptMemoryContent(plaintext: string, userId: string): string {
  const key = deriveUserKey(userId);
  const encrypted = encryptAesGcm(Buffer.from(plaintext, "utf8"), key);
  return JSON.stringify(encrypted);
}

/**
 * Decrypt memory content from at-rest storage.
 * Expects the encrypted content as a JSON string containing ciphertext and iv.
 */
export function decryptMemoryContent(encryptedJson: string, userId: string): string {
  const key = deriveUserKey(userId);

  try {
    const payload = JSON.parse(encryptedJson) as { ciphertext: string; iv: string };
    return decryptAesGcm(payload, key).toString("utf8");
  } catch (error) {
    console.error("[DB] Failed to decrypt memory content:", error);
    throw new Error("Failed to decrypt memory content.");
  }
}

function hashMemoryContent(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Safely decrypt memory content. Returns fallback text on failure instead of throwing,
 * so one bad memory doesn't crash the entire listing.
 */
function safeDecrypt(encryptedJson: string, userId: string, memoryId?: string): string {
  try {
    return decryptMemoryContent(encryptedJson, userId);
  } catch (e) {
    console.error(`[DB] Decrypt failed for memory ${memoryId ?? "unknown"}:`, e);
    return "[encrypted — unable to decrypt]";
  }
}

function looksLikeOpaqueEncryptedPayload(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as { ciphertext?: unknown; iv?: unknown };
    return typeof parsed.ciphertext === "string" && typeof parsed.iv === "string";
  } catch {
    return false;
  }
}

function prepareMemoryContentForStorage(params: {
  content: string;
  userId: string;
  contentHash?: string;
  sensitive?: boolean;
}): {
  contentText: string;
  contentIv: null;
  contentEncrypted: number;
  contentHash: string;
  sensitive: number;
} {
  return {
    contentText: encryptMemoryContent(params.content, params.userId),
    contentIv: null,
    contentEncrypted: 1,
    contentHash: params.contentHash ?? hashMemoryContent(params.content),
    sensitive: params.sensitive ? 1 : 0,
  };
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

let initialized = false;
let initializingPromise: Promise<void> | null = null;

async function ensureInitialized(): Promise<void> {
  if (initialized) {
    return;
  }
  
  // Prevent concurrent initialization - wait for existing init
  if (initializingPromise) {
    await initializingPromise;
    return;
  }

  // Start initialization
  initializingPromise = (async () => {
    await ensureDatabaseMigrations();
    const client = getDb();

    try {
    await client.executeMultiple(`
    -- TODO: Keep this bootstrap DDL aligned with the runtime column guards below.
    -- A single schema source of truth would remove this drift risk.
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
      sensitive INTEGER NOT NULL DEFAULT 0,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      sync_error TEXT,
      namespace_id TEXT,
      session_id TEXT,
      metadata_json TEXT,
      completed INTEGER DEFAULT 0,
      completed_at TEXT,
      ephemeral INTEGER DEFAULT 0,
      absorbed INTEGER DEFAULT 0,
      absorbed_into_synthesis_id TEXT,
      absorbed_by TEXT,
      absorbed_at TEXT,
      peer TEXT NOT NULL DEFAULT 'user',
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

    CREATE TABLE IF NOT EXISTS stripe_customers (
      user_id TEXT PRIMARY KEY,
      stripe_customer_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_entitlements (
      user_id TEXT PRIMARY KEY,
      plan TEXT NOT NULL DEFAULT 'free',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      key_suffix TEXT,
      scopes_json TEXT NOT NULL DEFAULT '["*"]',
      agent_id TEXT NOT NULL,
      agent_name TEXT,
      created_at TEXT NOT NULL,
      last_used TEXT,
      last_plugin_id TEXT,
      last_plugin_version TEXT,
      last_plugin_mode TEXT,
      last_plugin_seen_at TEXT,
      last_seen_runtimes TEXT,
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

    CREATE TABLE IF NOT EXISTS vault_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      value_encrypted TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_vault_user
    ON vault_entries(user_id);

    CREATE INDEX IF NOT EXISTS idx_vault_user_category
    ON vault_entries(user_id, category);

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

    CREATE TABLE IF NOT EXISTS synthesized_memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      synthesis TEXT NOT NULL,
      title TEXT NOT NULL,
      source_memory_ids TEXT NOT NULL,
      source_count INTEGER NOT NULL,
      cluster_id TEXT NOT NULL,
      cluster_topic TEXT NOT NULL,
      compression_ratio REAL,
      confidence REAL,
      synthesized_at TEXT NOT NULL,
      last_validated_at TEXT NOT NULL,
      stale INTEGER DEFAULT 0,
      importance_tier TEXT DEFAULT 'normal',
      access_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_synth_user
    ON synthesized_memories(user_id);

    CREATE INDEX IF NOT EXISTS idx_synth_cluster
    ON synthesized_memories(cluster_id);

    CREATE INDEX IF NOT EXISTS idx_synth_importance
    ON synthesized_memories(user_id, importance_tier);

    -- Decentralized memory graph: polymorphic edges for any-to-any connections
    -- Enables: memory↔memory, memory↔synthesis, synthesis↔synthesis links
    CREATE TABLE IF NOT EXISTS graph_edges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_type TEXT NOT NULL,  -- 'memory' | 'synthesis'
      target_id TEXT NOT NULL,
      target_type TEXT NOT NULL,  -- 'memory' | 'synthesis'
      edge_type TEXT NOT NULL,    -- 'derives_from' | 'relates_to' | 'abstracts' | 'contradicts'
      weight REAL DEFAULT 1.0,
      bidirectional INTEGER DEFAULT 0,  -- 1 if edge goes both ways
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      UNIQUE(source_id, target_id, edge_type)
    );

    CREATE INDEX IF NOT EXISTS idx_graph_edges_user
    ON graph_edges(user_id);

    CREATE INDEX IF NOT EXISTS idx_graph_edges_source
    ON graph_edges(source_id, source_type);

    CREATE INDEX IF NOT EXISTS idx_graph_edges_target
    ON graph_edges(target_id, target_type);

    CREATE INDEX IF NOT EXISTS idx_graph_edges_type
    ON graph_edges(user_id, edge_type);
  `);
    await ensureMemoriesColumns(client);
    await ensureApiKeysColumns(client);
    await ensureMemoriesIndexes(client);
    await ensureSynthesizedMemoriesColumns(client);
    await ensureSynthesizedMemoriesIndexes(client);
    await ensureVaultEntriesColumns(client);
    await ensureVaultEntriesIndexes(client);

      initialized = true;
    } catch (error) {
      console.error("[DB] ensureInitialized failed:", error);
      initializingPromise = null;  // Allow retry on next request
      throw error;
    }
  })();

  await initializingPromise;
}

export async function ensureCoreMemoryTables(): Promise<void> {
  await ensureInitialized();
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
    CREATE INDEX IF NOT EXISTS idx_memories_user_access_count_desc
    ON memories(user_id, access_count DESC)
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_memories_user_peer
    ON memories(user_id, peer)
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
  // TODO: This ALTER-based bootstrap duplicates the CREATE TABLE definition above.
  // Consolidate schema ownership so new columns only need to be declared once.
  const requiredColumns: Array<{ name: string; ddl: string }> = [
    { name: "content_iv", ddl: "TEXT" },
    { name: "content_encrypted", ddl: "INTEGER NOT NULL DEFAULT 0" },
    { name: "sensitive", ddl: "INTEGER NOT NULL DEFAULT 0" },
    { name: "namespace_id", ddl: "TEXT" },
    { name: "session_id", ddl: "TEXT" },
    { name: "metadata_json", ddl: "TEXT" },
    { name: "peer", ddl: "TEXT NOT NULL DEFAULT 'user'" },
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
    { name: "importance_tier", ddl: "TEXT DEFAULT 'normal'" },  // critical/working/high/normal
    { name: "durability_class", ddl: "TEXT DEFAULT 'working'" },  // ephemeral/working/durable
    { name: "promotion_locked", ddl: "INTEGER DEFAULT 0" },  // Prevents auto-demotion of manually set tiers
    { name: "locked_tier", ddl: "TEXT" },  // Lock memory at specific tier (prevents promotion/demotion)
    { name: "decay_immune", ddl: "INTEGER DEFAULT 0" },  // If 1, memory is immune to automatic decay
    // Ephemeral/completed task tracking
    { name: "completed", ddl: "INTEGER DEFAULT 0" },  // Task-like memory is done (demote from critical)
    { name: "completed_at", ddl: "TEXT" },  // When task was marked complete
    { name: "ephemeral", ddl: "INTEGER DEFAULT 0" },  // Short-lived memory (design changes, etc)
    { name: "absorbed", ddl: "INTEGER DEFAULT 0" },  // If 1, memory has been absorbed into synthesis
    { name: "absorbed_into_synthesis_id", ddl: "TEXT" },  // Canonical synthesis ID replacing this memory
    // Synthesis absorption tracking
    { name: "absorbed_by", ddl: "TEXT" },  // ID of synthesis that absorbed this memory
    { name: "absorbed_at", ddl: "TEXT" },  // When memory was absorbed into synthesis
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

async function ensureApiKeysColumns(client: Client): Promise<void> {
  const requiredColumns: Array<{ name: string; ddl: string }> = [
    { name: "key_suffix", ddl: "TEXT" },
    { name: "scopes_json", ddl: `TEXT NOT NULL DEFAULT '["*"]'` },
    { name: "last_plugin_id", ddl: "TEXT" },
    { name: "last_plugin_version", ddl: "TEXT" },
    { name: "last_plugin_mode", ddl: "TEXT" },
    { name: "last_plugin_seen_at", ddl: "TEXT" },
    { name: "last_seen_runtimes", ddl: "TEXT DEFAULT '{}'" },
  ];

  const tableInfo = await client.execute("PRAGMA table_info(api_keys)");
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
    await client.execute(`ALTER TABLE api_keys ADD COLUMN ${column.name} ${column.ddl}`);
  }
}

async function ensureSynthesizedMemoriesColumns(client: Client): Promise<void> {
  const requiredColumns: Array<{ name: string; ddl: string }> = [
    { name: "synthesis", ddl: "TEXT NOT NULL DEFAULT ''" },
    { name: "title", ddl: "TEXT NOT NULL DEFAULT ''" },
    { name: "source_memory_ids", ddl: "TEXT NOT NULL DEFAULT '[]'" },
    { name: "source_count", ddl: "INTEGER NOT NULL DEFAULT 0" },
    { name: "cluster_id", ddl: "TEXT NOT NULL DEFAULT ''" },
    { name: "cluster_topic", ddl: "TEXT NOT NULL DEFAULT ''" },
    { name: "compression_ratio", ddl: "REAL" },
    { name: "confidence", ddl: "REAL" },
    { name: "synthesized_at", ddl: "TEXT NOT NULL DEFAULT ''" },
    { name: "last_validated_at", ddl: "TEXT NOT NULL DEFAULT ''" },
    { name: "stale", ddl: "INTEGER DEFAULT 0" },
    { name: "importance_tier", ddl: "TEXT DEFAULT 'normal'" },
    { name: "access_count", ddl: "INTEGER DEFAULT 0" },
    { name: "created_at", ddl: "TEXT NOT NULL DEFAULT ''" },
    // Decentralized graph model: abstraction level (1=first-order synthesis, 2+=meta-synthesis)
    { name: "abstraction_level", ddl: "INTEGER DEFAULT 1" },
    { name: "synthesis_quality_score", ddl: "REAL" },
    { name: "synthesis_metadata", ddl: "TEXT" },
  ];

  const tableInfo = await client.execute("PRAGMA table_info(synthesized_memories)");
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
    await client.execute(`ALTER TABLE synthesized_memories ADD COLUMN ${column.name} ${column.ddl}`);
  }
}

async function ensureSynthesizedMemoriesIndexes(client: Client): Promise<void> {
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_synth_user
    ON synthesized_memories(user_id)
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_synth_cluster
    ON synthesized_memories(cluster_id)
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_synth_importance
    ON synthesized_memories(user_id, importance_tier)
  `);
}

async function ensureVaultEntriesColumns(client: Client): Promise<void> {
  const requiredColumns: Array<{ name: string; ddl: string }> = [
    { name: "name", ddl: "TEXT NOT NULL DEFAULT ''" },
    { name: "category", ddl: "TEXT NOT NULL DEFAULT 'token'" },
    { name: "value_encrypted", ddl: "TEXT NOT NULL DEFAULT ''" },
    { name: "metadata_json", ddl: "TEXT" },
    { name: "created_at", ddl: "TEXT NOT NULL DEFAULT ''" },
    { name: "updated_at", ddl: "TEXT NOT NULL DEFAULT ''" },
  ];

  const tableInfo = await client.execute("PRAGMA table_info(vault_entries)");
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
    await client.execute(`ALTER TABLE vault_entries ADD COLUMN ${column.name} ${column.ddl}`);
  }
}

async function ensureVaultEntriesIndexes(client: Client): Promise<void> {
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_vault_user
    ON vault_entries(user_id)
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_vault_user_category
    ON vault_entries(user_id, category)
  `);
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
  scopes: string[];
};

export type EntitlementPlan = "free" | "hosted";

export type UserEntitlement = {
  userId: string;
  plan: EntitlementPlan;
  source: "default" | "env" | "db";
  createdAt: string | null;
  updatedAt: string | null;
};

export const DEFAULT_AGENT_API_KEY_SCOPES = [
  "analytics",
  // chatbot tables deprecated — see migration notes
  // "chatbots.*",
  "compact.create",
  "context",
  "context.refresh",
  "cognitive.constraints.*",
  "cognitive.eval.fixtures",
  "cognitive.patterns.feedback",
  "cognitive.patterns.list",
  "cognitive.patterns.match",
  "cognitive.patterns.skill-candidates",
  "cognitive.settings.get",
  "cognitive.skills.get",
  "cognitive.skills.list",
  "cognitive.traces.*",
  "edges.*",
  "edges.listForMemory",
  "explain",
  "extract",
  "feedback.create",
  "fts.stats",
  "graph.get",
  "indexed.*",
  "lifecycle.restore",
  "lifecycle.stats",
  "memories.*",
  "namespaces.*",
  "reflect.create",
  "search",
  "sessions.*",
  "simple.*",
  "syntheses.*",
] as const;

function normalizeEntitlementPlan(value: unknown): EntitlementPlan {
  // Backward compatibility: old cognition rows now map to hosted.
  if (value === "hosted" || value === "cognition") {
    return "hosted";
  }
  return "free";
}

function planFromEnv(userId: string): EntitlementPlan | null {
  const cognitionUsers = new Set(
    (process.env.FATHIPPO_COGNITION_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (cognitionUsers.has(userId)) {
    return "hosted";
  }

  const hostedUsers = new Set(
    (process.env.FATHIPPO_HOSTED_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (hostedUsers.has(userId)) {
    return "hosted";
  }

  return null;
}

function normalizeApiKeyScopes(scopes?: string[] | null): string[] {
  const source = Array.isArray(scopes) ? scopes : [...DEFAULT_AGENT_API_KEY_SCOPES];
  const normalized = Array.from(
    new Set(
      source
        .filter((scope): scope is string => typeof scope === "string")
        .map((scope) => scope.trim())
        .filter(Boolean),
    ),
  );
  return normalized.length > 0 ? normalized : [...DEFAULT_AGENT_API_KEY_SCOPES];
}

function parseApiKeyScopes(raw: unknown): string[] {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return ["*"];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return ["*"];
    }
    const scopes = parsed.filter((scope): scope is string => typeof scope === "string" && scope.trim().length > 0);
    return scopes.length > 0 ? scopes : ["*"];
  } catch {
    return ["*"];
  }
}

export async function getUserEntitlement(userId: string): Promise<UserEntitlement> {
  await ensureInitialized();
  const envPlan = planFromEnv(userId);
  if (envPlan) {
    return {
      userId,
      plan: envPlan,
      source: "env",
      createdAt: null,
      updatedAt: null,
    };
  }

  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT user_id, plan, created_at, updated_at
      FROM user_entitlements
      WHERE user_id = ?
      LIMIT 1
    `,
    args: [userId],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    return {
      userId,
      plan: "free",
      source: "default",
      createdAt: null,
      updatedAt: null,
    };
  }

  return {
    userId,
    plan: normalizeEntitlementPlan(row.plan),
    source: "db",
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

export async function getUserEntitlementPlan(userId: string): Promise<EntitlementPlan> {
  const entitlement = await getUserEntitlement(userId);
  return entitlement.plan;
}

export async function setUserEntitlementPlan(userId: string, plan: EntitlementPlan): Promise<UserEntitlement> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();
  const normalizedPlan = normalizeEntitlementPlan(plan);
  await client.execute({
    sql: `
      INSERT INTO user_entitlements (user_id, plan, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        plan = excluded.plan,
        updated_at = excluded.updated_at
    `,
    args: [userId, normalizedPlan, now, now],
  });

  return {
    userId,
    plan: normalizedPlan,
    source: "db",
    createdAt: now,
    updatedAt: now,
  };
}

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

export type VaultEntryCategory =
  | "api_key"
  | "password"
  | "token"
  | "connection_string"
  | "private_key";

export type VaultEntryListItem = {
  id: string;
  userId: string;
  name: string;
  category: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type VaultEntryRecord = VaultEntryListItem & {
  value: string;
};

export type AgentMemoryRecord = {
  id: string;
  userId: string;
  title: string;
  text: string;
  sourceType: MemorySourceType;
  memoryType: MemoryKind;
  importanceTier: MemoryImportanceTier;
  durabilityClass?: MemoryDurabilityClass;
  sourceUrl: string | null;
  fileName: string | null;
  metadata: Record<string, unknown> | null;
  namespaceId: string | null;
  sessionId: string | null;
  entities: string[];
  feedbackScore: number;
  accessCount: number;
  isEncrypted?: boolean;
  /** If true, memory contains detected secrets and is excluded from LLM context */
  sensitive: boolean;
  /** Peer dimension: "user" (about the human), "agent" (about the environment), "shared" (cross-cutting) */
  peer?: MemoryPeer;
  completed?: boolean;
  completedAt?: string | null;
  ephemeral?: boolean;
  absorbed?: boolean;
  absorbedIntoSynthesisId?: string | null;
  absorbedBy?: string | null;
  absorbedAt?: string | null;
  createdAt: string;
};

export type RetrievalEvaluationRecord = {
  id: string;
  userId: string;
  query: string;
  endpoint: string;
  namespaceId: string | null;
  sessionId: string | null;
  candidateIds: string[];
  acceptedId: string | null;
  acceptedRank: number | null;
  createdAt: string;
  updatedAt: string | null;
};

function deriveDurabilityClass(row: Record<string, unknown>): MemoryDurabilityClass {
  const explicit = row.durability_class as MemoryDurabilityClass | undefined;
  if (explicit === "ephemeral" || explicit === "working" || explicit === "durable") {
    return explicit;
  }
  const tier = (row.importance_tier as MemoryImportanceTier) ?? "normal";
  if (tier === "critical") return "durable";
  if (tier === "normal") return "ephemeral";
  return "working";
}

function mapRow(row: Record<string, unknown>): MemoryRecord {
  const entities = parseJsonStringArray((row.entities as string | null) ?? row.entities_json);
  const userId = row.user_id as string;
  const storedText = row.content_text as string;
  const storageEncrypted = Number(row.content_encrypted ?? 0) === 1;
  const decryptedText = storageEncrypted ? safeDecrypt(storedText, userId, row.id as string) : storedText;
  
  return {
    id: row.id as string,
    userId,
    title: row.title as string,
    sourceType: row.source_type as MemorySourceType,
    memoryType: (row.memory_type as MemoryKind) ?? "episodic",
    importance: (row.importance as number) ?? 5,
    importanceTier: (row.importance_tier as MemoryImportanceTier) ?? "normal",
    durabilityClass: deriveDurabilityClass(row),
    tags: parseTags((row.tags_csv as string) ?? ""),
    sourceUrl: row.source_url as string | null,
    fileName: row.file_name as string | null,
    contentText: decryptedText,
    contentIv: row.content_iv as string | null,
    isEncrypted: looksLikeOpaqueEncryptedPayload(decryptedText),
    contentHash: row.content_hash as string,
    sensitive: Number(row.sensitive ?? 0) === 1,
    syncStatus: (row.sync_status as MemorySyncStatus) ?? "pending",
    syncError: row.sync_error as string | null,
    entities,
    feedbackScore: Number(row.feedback_score ?? 0),
    accessCount: Number(row.access_count ?? 0),
    promotionLocked: Number(row.promotion_locked ?? 0) === 1,
    lockedTier: (row.locked_tier as MemoryImportanceTier | null) ?? null,
    decayImmune: Number(row.decay_immune ?? 0) === 1,
    completed: Number(row.completed ?? 0) === 1,
    completedAt: (row.completed_at as string | null) ?? null,
    ephemeral: Number(row.ephemeral ?? 0) === 1,
    absorbed: Number(row.absorbed ?? 0) === 1,
    absorbedBy: (row.absorbed_by as string | null) ?? null,
    absorbedIntoSynthesisId:
      (row.absorbed_into_synthesis_id as string | null) ??
      ((row.absorbed_by as string | null) ?? null),
    absorbedAt: (row.absorbed_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

function mapVaultListItemRow(row: Record<string, unknown>): VaultEntryListItem {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    category: row.category as string,
    metadata: parseJsonObject(row.metadata_json),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function insertMemory(memory: MemoryRecord): Promise<void> {
  await ensureInitialized();
  const client = getDb();
  const preparedContent = prepareMemoryContentForStorage({
    content: memory.contentText,
    userId: memory.userId,
    contentHash: memory.contentHash,
    sensitive: memory.sensitive,
  });
  
  await client.execute({
    sql: `
      INSERT INTO memories (
        id, user_id, title, source_type, memory_type, importance, tags_csv,
        source_url, file_name, content_text, content_iv, content_encrypted, content_hash,
        sensitive, sync_status, sync_error, created_at
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
      preparedContent.contentText,
      preparedContent.contentIv,
      preparedContent.contentEncrypted,
      preparedContent.contentHash,
      preparedContent.sensitive,
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
      SELECT id, user_id, title, source_type, source_url, file_name, content_text, content_hash, created_at,
             memory_type, importance, importance_tier, tags_csv, sensitive, sync_status, sync_error, content_iv, content_encrypted,
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

  return result.rows.map((row) => {
    const storedText = row.content_text as string;
    const storageEncrypted = Number(row.content_encrypted ?? 0) === 1;
    const decryptedText = storageEncrypted ? safeDecrypt(storedText, userId, row.id as string) : storedText;

    return {
      id: row.id as string,
      userId: row.user_id as string,
      title: row.title as string,
      sourceType: row.source_type as MemorySourceType,
      memoryType: (row.memory_type as MemoryKind) ?? "episodic",
      importance: (row.importance as number) ?? 5,
      importanceTier: (row.importance_tier as MemoryImportanceTier) ?? "normal",
      tags: parseTags((row.tags_csv as string) ?? ""),
      sourceUrl: row.source_url as string | null,
      fileName: row.file_name as string | null,
      contentIv: row.content_iv as string | null,
      isEncrypted: looksLikeOpaqueEncryptedPayload(decryptedText),
      contentHash: row.content_hash as string,
      sensitive: Number(row.sensitive ?? 0) === 1,
      syncStatus: (row.sync_status as MemorySyncStatus) ?? "pending",
      syncError: row.sync_error as string | null,
      createdAt: row.created_at as string,
      relationshipCount: Number(row.relationship_count ?? 0),
      supersededByCount: Number(row.superseded_by_count ?? 0),
    };
  });
}

export async function listMemoryRecordsByUser(userId: string, limit = 100): Promise<MemoryRecord[]> {
  await ensureInitialized();
  const client = getDb();
  
  const result = await client.execute({
    sql: `
      SELECT id, user_id, title, source_type, source_url, file_name, content_text, content_hash, created_at,
             memory_type, importance, tags_csv, sensitive, sync_status, sync_error, content_iv, content_encrypted
      FROM memories
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `,
    args: [userId, limit],
  });

  return result.rows.map((row) => mapRow(row as Record<string, unknown>));
}

export async function getMemoryById(id: string, userId?: string): Promise<MemoryRecord | null> {
  await ensureInitialized();
  const client = getDb();
  
  const args: string[] = [id];
  const user_clause = userId ? " AND user_id = ?" : "";
  if (userId) args.push(userId);

  const result = await client.execute({
    sql: `
      SELECT id, user_id, title, source_type, source_url, file_name, content_text, content_hash, created_at,
             memory_type, importance, tags_csv, sensitive, sync_status, sync_error, content_iv, content_encrypted
      FROM memories
      WHERE id = ?${user_clause}
    `,
    args,
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
      SELECT id, user_id, title, source_type, source_url, file_name, content_text, content_hash, created_at,
             memory_type, importance, importance_tier, tags_csv, sensitive, sync_status, sync_error, content_iv, content_encrypted,
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

  return result.rows.map((row) => {
    const storedText = row.content_text as string;
    const storageEncrypted = Number(row.content_encrypted ?? 0) === 1;
    const decryptedText = storageEncrypted ? safeDecrypt(storedText, userId, row.id as string) : storedText;

    return {
      id: row.id as string,
      userId: row.user_id as string,
      title: row.title as string,
      sourceType: row.source_type as MemorySourceType,
      memoryType: (row.memory_type as MemoryKind) ?? "episodic",
      importance: (row.importance as number) ?? 5,
      importanceTier: (row.importance_tier as MemoryImportanceTier) ?? "normal",
      tags: parseTags((row.tags_csv as string) ?? ""),
      sourceUrl: row.source_url as string | null,
      fileName: row.file_name as string | null,
      contentIv: row.content_iv as string | null,
      isEncrypted: looksLikeOpaqueEncryptedPayload(decryptedText),
      contentHash: row.content_hash as string,
      sensitive: Number(row.sensitive ?? 0) === 1,
      syncStatus: (row.sync_status as MemorySyncStatus) ?? "pending",
      syncError: row.sync_error as string | null,
      createdAt: row.created_at as string,
      relationshipCount: Number(row.relationship_count ?? 0),
      supersededByCount: Number(row.superseded_by_count ?? 0),
    };
  });
}

/**
 * Text-based search: find memory IDs where title or content contains the query (case-insensitive).
 */
export async function textSearchMemoryIds(userId: string, query: string, limit = 10): Promise<string[]> {
  await ensureInitialized();
  const client = getDb();
  const escaped_query = query.replace(/[%_\\]/g, "\\$&");
  const like_pattern = `%${escaped_query}%`;
  const result = await client.execute({
    sql: `
      SELECT id FROM memories
      WHERE user_id = ? AND (LOWER(title) LIKE ? OR LOWER(content_text) LIKE ?)
      ORDER BY created_at DESC
      LIMIT ?
    `,
    args: [userId, like_pattern, like_pattern, limit],
  });
  return result.rows.map((row) => row.id as string);
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

export type FullGraphNode = {
  id: string;
  title: string;
  nodeType: "memory" | "synthesis";
  memoryType?: MemoryKind;
  importance?: number;
  abstractionLevel?: number;
  sourceCount?: number;
};

export type FullGraphEdge = {
  id: string;
  source: string;
  target: string;
  edgeType: string;
  weight: number;
};

/**
 * Get full memory graph including syntheses and graph_edges.
 * Returns nodes (memories + syntheses) and edges (memory_edges + graph_edges).
 */
export async function getFullMemoryGraph(
  userId: string,
  limit = 100
): Promise<{ nodes: FullGraphNode[]; edges: FullGraphEdge[] }> {
  await ensureInitialized();
  const client = getDb();
  const boundedLimit = Math.max(1, Math.min(limit, 300));

  // Fetch memories
  const memoryResult = await client.execute({
    sql: `
      SELECT id, title, memory_type, importance
      FROM memories
      WHERE user_id = ? AND archived_at IS NULL
      ORDER BY access_count DESC, created_at DESC
      LIMIT ?
    `,
    args: [userId, boundedLimit],
  });

  const memoryNodes: FullGraphNode[] = memoryResult.rows.map((row) => ({
    id: row.id as string,
    title: row.title as string,
    nodeType: "memory" as const,
    memoryType: (row.memory_type as MemoryKind) ?? "episodic",
    importance: Number(row.importance ?? 5),
  }));

  // Fetch syntheses
  const synthResult = await client.execute({
    sql: `
      SELECT id, title, abstraction_level, source_count
      FROM synthesized_memories
      WHERE user_id = ? AND stale = 0
      ORDER BY access_count DESC, created_at DESC
      LIMIT ?
    `,
    args: [userId, Math.floor(boundedLimit / 3)],
  });

  const synthNodes: FullGraphNode[] = synthResult.rows.map((row) => ({
    id: row.id as string,
    title: row.title as string,
    nodeType: "synthesis" as const,
    abstractionLevel: Number(row.abstraction_level ?? 1),
    sourceCount: Number(row.source_count ?? 0),
  }));

  const nodes = [...memoryNodes, ...synthNodes];
  const nodeIds = nodes.map((n) => n.id);
  if (nodeIds.length === 0) {
    return { nodes: [], edges: [] };
  }

  // Fetch memory_edges (memory↔memory)
  const memoryIds = memoryNodes.map((n) => n.id);
  let memEdges: FullGraphEdge[] = [];
  if (memoryIds.length > 0) {
    const placeholders = memoryIds.map(() => "?").join(",");
    const memEdgeResult = await client.execute({
      sql: `
        SELECT id, source_id, target_id, relationship_type, weight
        FROM memory_edges
        WHERE user_id = ?
        AND source_id IN (${placeholders})
        AND target_id IN (${placeholders})
      `,
      args: [userId, ...memoryIds, ...memoryIds],
    });
    memEdges = memEdgeResult.rows.map((row) => ({
      id: row.id as string,
      source: row.source_id as string,
      target: row.target_id as string,
      edgeType: row.relationship_type as string,
      weight: Number(row.weight ?? 1),
    }));
  }

  // Fetch graph_edges (synthesis↔memory, synthesis↔synthesis)
  const nodeIdSet = new Set(nodeIds);
  const graphEdgeResult = await client.execute({
    sql: `
      SELECT id, source_id, target_id, edge_type, weight
      FROM graph_edges
      WHERE user_id = ?
      ORDER BY weight DESC
      LIMIT 500
    `,
    args: [userId],
  });

  const graphEdges: FullGraphEdge[] = graphEdgeResult.rows
    .filter((row) => nodeIdSet.has(row.source_id as string) || nodeIdSet.has(row.target_id as string))
    .map((row) => ({
      id: row.id as string,
      source: row.source_id as string,
      target: row.target_id as string,
      edgeType: row.edge_type as string,
      weight: Number(row.weight ?? 1),
    }));

  return { nodes, edges: [...memEdges, ...graphEdges] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Graph Edges (Decentralized Memory Web)
// Polymorphic edges: memory↔memory, memory↔synthesis, synthesis↔synthesis
// ─────────────────────────────────────────────────────────────────────────────

export type CreateGraphEdgeInput = {
  userId: string;
  sourceId: string;
  sourceType: GraphNodeType;
  targetId: string;
  targetType: GraphNodeType;
  edgeType: GraphEdgeType;
  weight?: number;
  bidirectional?: boolean;
  metadata?: Record<string, unknown>;
};

function mapGraphEdgeRow(row: Record<string, unknown>): GraphEdgeRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    sourceId: row.source_id as string,
    sourceType: row.source_type as GraphNodeType,
    targetId: row.target_id as string,
    targetType: row.target_type as GraphNodeType,
    edgeType: row.edge_type as GraphEdgeType,
    weight: Number(row.weight ?? 1),
    bidirectional: Number(row.bidirectional ?? 0) === 1,
    metadata: parseJsonObject(row.metadata_json),
    createdAt: row.created_at as string,
    updatedAt: (row.updated_at as string) || null,
  };
}

export async function createGraphEdge(input: CreateGraphEdgeInput): Promise<GraphEdgeRecord> {
  await ensureInitialized();
  const client = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await client.execute({
    sql: `
      INSERT INTO graph_edges (
        id, user_id, source_id, source_type, target_id, target_type,
        edge_type, weight, bidirectional, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      id,
      input.userId,
      input.sourceId,
      input.sourceType,
      input.targetId,
      input.targetType,
      input.edgeType,
      input.weight ?? 1.0,
      input.bidirectional ? 1 : 0,
      input.metadata ? JSON.stringify(input.metadata) : null,
      now,
    ],
  });

  return {
    id,
    userId: input.userId,
    sourceId: input.sourceId,
    sourceType: input.sourceType,
    targetId: input.targetId,
    targetType: input.targetType,
    edgeType: input.edgeType,
    weight: input.weight ?? 1.0,
    bidirectional: input.bidirectional ?? false,
    metadata: input.metadata ?? null,
    createdAt: now,
    updatedAt: null,
  };
}

export async function getGraphEdgesForNode(
  userId: string,
  nodeId: string,
  nodeType: GraphNodeType
): Promise<{ incoming: GraphEdgeRecord[]; outgoing: GraphEdgeRecord[] }> {
  await ensureInitialized();
  const client = getDb();

  const [outgoingResult, incomingResult] = await Promise.all([
    client.execute({
      sql: `
        SELECT * FROM graph_edges
        WHERE user_id = ? AND source_id = ? AND source_type = ?
        ORDER BY weight DESC, created_at DESC
      `,
      args: [userId, nodeId, nodeType],
    }),
    client.execute({
      sql: `
        SELECT * FROM graph_edges
        WHERE user_id = ? AND target_id = ? AND target_type = ?
        ORDER BY weight DESC, created_at DESC
      `,
      args: [userId, nodeId, nodeType],
    }),
  ]);

  return {
    outgoing: outgoingResult.rows.map((r) => mapGraphEdgeRow(r as Record<string, unknown>)),
    incoming: incomingResult.rows.map((r) => mapGraphEdgeRow(r as Record<string, unknown>)),
  };
}

export async function traverseGraphFromNode(
  userId: string,
  startId: string,
  startType: GraphNodeType,
  maxDepth = 2,
  maxNodes = 50
): Promise<GraphEdgeRecord[]> {
  await ensureInitialized();
  
  const visited = new Set<string>();
  const edges: GraphEdgeRecord[] = [];
  const queue: Array<{ id: string; type: GraphNodeType; depth: number }> = [
    { id: startId, type: startType, depth: 0 },
  ];

  while (queue.length > 0 && edges.length < maxNodes) {
    const current = queue.shift()!;
    const nodeKey = `${current.type}:${current.id}`;
    
    if (visited.has(nodeKey) || current.depth > maxDepth) continue;
    visited.add(nodeKey);

    const { outgoing, incoming } = await getGraphEdgesForNode(userId, current.id, current.type);
    
    for (const edge of [...outgoing, ...incoming]) {
      if (edges.length >= maxNodes) break;
      edges.push(edge);
      
      // Queue connected nodes for next depth
      if (current.depth < maxDepth) {
        const nextId = edge.sourceId === current.id ? edge.targetId : edge.sourceId;
        const nextType = edge.sourceId === current.id ? edge.targetType : edge.sourceType;
        queue.push({ id: nextId, type: nextType, depth: current.depth + 1 });
      }
    }
  }

  return edges;
}

export async function deleteGraphEdge(userId: string, edgeId: string): Promise<boolean> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `DELETE FROM graph_edges WHERE id = ? AND user_id = ?`,
    args: [edgeId, userId],
  });
  return (result.rowsAffected ?? 0) > 0;
}

export async function updateGraphEdgeWeight(
  userId: string,
  edgeId: string,
  weight: number
): Promise<boolean> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `UPDATE graph_edges SET weight = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
    args: [weight, new Date().toISOString(), edgeId, userId],
  });
  return (result.rowsAffected ?? 0) > 0;
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

export async function listVaultEntriesByUser(
  userId: string,
  category?: string,
): Promise<VaultEntryListItem[]> {
  await ensureInitialized();
  const client = getDb();
  const normalizedCategory = typeof category === "string" ? category.trim() : "";
  const hasCategory = normalizedCategory.length > 0;
  const result = await client.execute({
    sql: hasCategory
      ? `
        SELECT id, user_id, name, category, metadata_json, created_at, updated_at
        FROM vault_entries
        WHERE user_id = ? AND category = ?
        ORDER BY updated_at DESC, created_at DESC
      `
      : `
        SELECT id, user_id, name, category, metadata_json, created_at, updated_at
        FROM vault_entries
        WHERE user_id = ?
        ORDER BY updated_at DESC, created_at DESC
      `,
    args: hasCategory ? [userId, normalizedCategory] : [userId],
  });

  return result.rows.map((row) => mapVaultListItemRow(row as Record<string, unknown>));
}

export async function getVaultEntryById(userId: string, id: string): Promise<VaultEntryRecord | null> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT id, user_id, name, category, value_encrypted, metadata_json, created_at, updated_at
      FROM vault_entries
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
    ...mapVaultListItemRow(row),
    value: safeDecrypt(row.value_encrypted as string, userId, row.id as string),
  };
}

export async function createVaultEntry(params: {
  userId: string;
  name: string;
  category: string;
  value: string;
  metadata?: Record<string, unknown> | null;
}): Promise<VaultEntryListItem> {
  await ensureInitialized();
  const client = getDb();
  const id = `vault_${crypto.randomUUID().replaceAll("-", "")}`;
  const now = new Date().toISOString();

  await client.execute({
    sql: `
      INSERT INTO vault_entries (
        id, user_id, name, category, value_encrypted, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      id,
      params.userId,
      params.name.trim(),
      params.category.trim(),
      encryptMemoryContent(params.value, params.userId),
      params.metadata ? JSON.stringify(params.metadata) : null,
      now,
      now,
    ],
  });

  return {
    id,
    userId: params.userId,
    name: params.name.trim(),
    category: params.category.trim(),
    metadata: params.metadata ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateVaultEntry(
  userId: string,
  id: string,
  params: {
    name?: string;
    category?: string;
    value?: string;
    metadata?: Record<string, unknown> | null;
  },
): Promise<VaultEntryListItem | null> {
  await ensureInitialized();
  const existing = await getVaultEntryById(userId, id);
  if (!existing) {
    return null;
  }

  const nextName = typeof params.name === "string" ? params.name.trim() : existing.name;
  const nextCategory = typeof params.category === "string" ? params.category.trim() : existing.category;
  const nextValue = typeof params.value === "string" ? params.value : existing.value;
  const nextMetadata = typeof params.metadata === "undefined" ? existing.metadata : params.metadata;
  const now = new Date().toISOString();

  const client = getDb();
  await client.execute({
    sql: `
      UPDATE vault_entries
      SET name = ?, category = ?, value_encrypted = ?, metadata_json = ?, updated_at = ?
      WHERE user_id = ? AND id = ?
    `,
    args: [
      nextName,
      nextCategory,
      encryptMemoryContent(nextValue, userId),
      nextMetadata ? JSON.stringify(nextMetadata) : null,
      now,
      userId,
      id,
    ],
  });

  return {
    id,
    userId,
    name: nextName,
    category: nextCategory,
    metadata: nextMetadata,
    createdAt: existing.createdAt,
    updatedAt: now,
  };
}

export async function deleteVaultEntryById(userId: string, id: string): Promise<boolean> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `DELETE FROM vault_entries WHERE user_id = ? AND id = ?`,
    args: [userId, id],
  });
  return (result.rowsAffected ?? 0) > 0;
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

function mapSynthesizedMemoryRow(row: Record<string, unknown>): SynthesizedMemoryRecord {
  const userId = row.user_id as string;
  const storedSynthesis = row.synthesis as string;
  return {
    id: row.id as string,
    userId,
    synthesis: looksLikeOpaqueEncryptedPayload(storedSynthesis)
      ? safeDecrypt(storedSynthesis, userId, row.id as string)
      : storedSynthesis,
    title: row.title as string,
    sourceMemoryIds: parseJsonStringArray(row.source_memory_ids),
    sourceCount: Number(row.source_count ?? 0),
    clusterId: row.cluster_id as string,
    clusterTopic: row.cluster_topic as string,
    compressionRatio:
      row.compression_ratio === null || typeof row.compression_ratio === "undefined"
        ? null
        : Number(row.compression_ratio),
    confidence:
      row.confidence === null || typeof row.confidence === "undefined"
        ? null
        : Number(row.confidence),
    synthesizedAt: row.synthesized_at as string,
    lastValidatedAt: row.last_validated_at as string,
    stale: Number(row.stale ?? 0) === 1,
    importanceTier: ((row.importance_tier as SynthesizedMemoryRecord["importanceTier"]) ?? "normal"),
    accessCount: Number(row.access_count ?? 0),
    createdAt: row.created_at as string,
    abstractionLevel: Number(row.abstraction_level ?? 1),
    synthesisQualityScore: row.synthesis_quality_score === null ? undefined : Number(row.synthesis_quality_score),
    synthesisMetadata: row.synthesis_metadata ? (parseJsonObject(row.synthesis_metadata as string) ?? undefined) : undefined,
  };
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
  const storedText = row.content_text as string;
  const storageEncrypted = Number(row.content_encrypted ?? 0) === 1;
  const decryptedText = storageEncrypted ? safeDecrypt(storedText, userId, row.id as string) : storedText;
  
  return {
    id: row.id as string,
    userId,
    title: row.title as string,
    text: decryptedText,
    sourceType: (row.source_type as MemorySourceType) ?? "text",
    memoryType: (row.memory_type as MemoryKind) ?? "episodic",
    importanceTier: (row.importance_tier as MemoryImportanceTier) ?? "normal",
    durabilityClass: deriveDurabilityClass(row),
    sourceUrl: (row.source_url as string | null) ?? null,
    fileName: (row.file_name as string | null) ?? null,
    metadata: parseJsonObject(row.metadata_json),
    namespaceId: (row.namespace_id as string | null) ?? null,
    sessionId: (row.session_id as string | null) ?? null,
    entities: parseJsonStringArray((row.entities as string | null) ?? row.entities_json),
    feedbackScore: Number(row.feedback_score ?? 0),
    accessCount: Number(row.access_count ?? 0),
    isEncrypted: looksLikeOpaqueEncryptedPayload(decryptedText),
    sensitive: Number(row.sensitive ?? 0) === 1,
    completed: Number(row.completed ?? 0) === 1,
    completedAt: (row.completed_at as string | null) ?? null,
    ephemeral: Number(row.ephemeral ?? 0) === 1,
    absorbed: Number(row.absorbed ?? 0) === 1,
    absorbedIntoSynthesisId:
      (row.absorbed_into_synthesis_id as string | null) ??
      ((row.absorbed_by as string | null) ?? null),
    absorbedBy: (row.absorbed_by as string | null) ?? null,
    absorbedAt: (row.absorbed_at as string | null) ?? null,
    peer: ((row.peer as string | null) ?? "user") as MemoryPeer,
    createdAt: row.created_at as string,
  };
}

export function filterSensitiveMemories<T extends { sensitive: boolean }>(memories: T[]): T[] {
  return memories.filter((memory) => !memory.sensitive);
}

export async function createApiKey(
  userId: string,
  agentName?: string,
  scopes?: string[],
): Promise<{ apiKey: string; agentId: string; scopes: string[] }> {
  await ensureInitialized();
  const client = getDb();
  const id = crypto.randomUUID();
  const agentId = `agent_${crypto.randomUUID().replaceAll("-", "")}`;
  const token = crypto.randomBytes(24).toString("hex");
  const apiKey = `mem_${token}`;
  const keyHash = hashApiKey(apiKey);
  const keySuffix = apiKey.slice(-3); // Store last 3 chars for identification
  const normalizedScopes = normalizeApiKeyScopes(scopes);
  const now = new Date().toISOString();

  await client.execute({
    sql: `
      INSERT INTO api_keys (id, user_id, key_hash, key_suffix, scopes_json, agent_id, agent_name, created_at, last_used)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [id, userId, keyHash, keySuffix, JSON.stringify(normalizedScopes), agentId, agentName ?? null, now, now],
  });

  return { apiKey, agentId, scopes: normalizedScopes };
}

export async function validateApiKey(rawApiKey: string): Promise<ApiKeyIdentity | null> {
  await ensureInitialized();
  const client = getDb();
  const keyHash = hashApiKey(rawApiKey);

  const result = await client.execute({
    sql: `
      SELECT id, user_id, agent_id, scopes_json, revoked_at, expires_at
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
    scopes: parseApiKeyScopes(row.scopes_json),
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
  lastPluginId: string | null;
  lastPluginVersion: string | null;
  lastPluginMode: string | null;
  lastPluginSeenAt: string | null;
  lastSeenRuntimes: Record<string, string>;
  revokedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  scopes: string[];
}>> {
  await ensureInitialized();
  const client = getDb();

  const result = await client.execute({
    sql: `
      SELECT id, agent_id, agent_name, key_suffix, scopes_json, created_at, last_used, last_plugin_id, last_plugin_version, last_plugin_mode, last_plugin_seen_at, last_seen_runtimes, revoked_at, expires_at
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
      lastPluginId: (row.last_plugin_id as string | null) ?? null,
      lastPluginVersion: (row.last_plugin_version as string | null) ?? null,
      lastPluginMode: (row.last_plugin_mode as string | null) ?? null,
      lastPluginSeenAt: (row.last_plugin_seen_at as string | null) ?? null,
      lastSeenRuntimes: (() => {
        const raw = row.last_seen_runtimes;
        if (typeof raw === "string" && raw.trim().length > 0) {
          try { return JSON.parse(raw) as Record<string, string>; } catch { return {}; }
        }
        return {};
      })(),
      revokedAt,
      expiresAt,
      isActive,
      scopes: parseApiKeyScopes(row.scopes_json),
    };
  });
}

export async function recordApiKeyPluginMetadata(params: {
  keyId: string;
  userId: string;
  pluginId?: string | null;
  pluginVersion?: string | null;
  pluginMode?: string | null;
}): Promise<void> {
  const pluginId = typeof params.pluginId === "string" && params.pluginId.trim().length > 0 ? params.pluginId.trim().slice(0, 120) : null;
  const pluginVersion =
    typeof params.pluginVersion === "string" && params.pluginVersion.trim().length > 0
      ? params.pluginVersion.trim().slice(0, 64)
      : null;
  const pluginMode =
    typeof params.pluginMode === "string" && params.pluginMode.trim().length > 0
      ? params.pluginMode.trim().slice(0, 32)
      : null;

  if (!pluginId && !pluginVersion && !pluginMode) {
    return;
  }

  await ensureInitialized();
  const client = getDb();
  const seenAt = new Date().toISOString();
  await client.execute({
    sql: `
      UPDATE api_keys
      SET last_plugin_id = ?, last_plugin_version = ?, last_plugin_mode = ?, last_plugin_seen_at = ?
      WHERE id = ? AND user_id = ?
    `,
    args: [pluginId, pluginVersion, pluginMode, seenAt, params.keyId, params.userId],
  });
}

/**
 * Record which runtime platform (codex, claude, cursor, etc.) was seen calling this API key.
 * Stores a JSON map of { runtime_name: last_seen_iso } in last_seen_runtimes column.
 */
const ALLOWED_RUNTIMES = new Set([
  "codex", "claude", "cursor", "windsurf", "zed", "vscode",
  "opencode", "antigravity", "trae", "qoder", "hermes", "openclaw",
]);

export async function recordApiKeyRuntime(keyId: string, runtime: string): Promise<void> {
  const trimmed = runtime.trim().toLowerCase().slice(0, 32);
  if (!trimmed || trimmed === "custom") return;
  if (!ALLOWED_RUNTIMES.has(trimmed)) return;

  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();

  // Atomic single-query update using json_set to avoid read-modify-write race
  await client.execute({
    sql: `
      UPDATE api_keys
      SET last_seen_runtimes = json_set(
        COALESCE(last_seen_runtimes, '{}'),
        '$.' || ?,
        ?
      )
      WHERE id = ?
    `,
    args: [trimmed, now, keyId],
  });
}

export async function setApiKeyScopes(userId: string, keyId: string, scopes: string[]): Promise<boolean> {
  await ensureInitialized();
  const client = getDb();
  const normalizedScopes = normalizeApiKeyScopes(scopes);
  const result = await client.execute({
    sql: `
      UPDATE api_keys
      SET scopes_json = ?
      WHERE user_id = ? AND id = ?
    `,
    args: [JSON.stringify(normalizedScopes), userId, keyId],
  });
  return (result.rowsAffected ?? 0) > 0;
}

function isLegacyApiKeyScopeValue(raw: unknown): boolean {
  return typeof raw !== "string" || raw.trim().length === 0;
}

function isWildcardScopeSet(scopes: string[]): boolean {
  return scopes.includes("*");
}

export async function getApiKeyScopeMigrationStatus(params?: {
  userId?: string;
}): Promise<{
  totalKeys: number;
  activeKeys: number;
  scopedKeys: number;
  wildcardKeys: number;
  legacyKeysMissingScopes: number;
  revocableWildcardKeys: number;
}> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT id, scopes_json, revoked_at, expires_at
      FROM api_keys
      ${params?.userId ? "WHERE user_id = ?" : ""}
    `,
    args: params?.userId ? [params.userId] : [],
  });
  const now = Date.now();
  let activeKeys = 0;
  let scopedKeys = 0;
  let wildcardKeys = 0;
  let legacyKeysMissingScopes = 0;
  let revocableWildcardKeys = 0;

  for (const row of result.rows as Array<Record<string, unknown>>) {
    const revoked = typeof row.revoked_at === "string" && row.revoked_at.length > 0;
    const expired =
      typeof row.expires_at === "string" && row.expires_at.length > 0
        ? new Date(row.expires_at).getTime() < now
        : false;
    const active = !revoked && !expired;
    if (active) {
      activeKeys += 1;
    }

    const legacy = isLegacyApiKeyScopeValue(row.scopes_json);
    if (legacy) {
      legacyKeysMissingScopes += 1;
    }
    const scopes = parseApiKeyScopes(row.scopes_json);
    if (isWildcardScopeSet(scopes)) {
      wildcardKeys += 1;
      if (active) {
        revocableWildcardKeys += 1;
      }
    } else {
      scopedKeys += 1;
    }
  }

  return {
    totalKeys: result.rows.length,
    activeKeys,
    scopedKeys,
    wildcardKeys,
    legacyKeysMissingScopes,
    revocableWildcardKeys,
  };
}

export async function backfillApiKeyScopes(params: {
  userId?: string;
  scopes?: string[];
  dryRun?: boolean;
  includeWildcardKeys?: boolean;
}): Promise<{
  candidates: number;
  updated: number;
  appliedScopes: string[];
  keyIds: string[];
}> {
  await ensureInitialized();
  const client = getDb();
  const appliedScopes = normalizeApiKeyScopes(params.scopes);
  const result = await client.execute({
    sql: `
      SELECT id, scopes_json
      FROM api_keys
      ${params.userId ? "WHERE user_id = ?" : ""}
      ORDER BY created_at ASC
    `,
    args: params.userId ? [params.userId] : [],
  });

  const candidateIds = (result.rows as Array<Record<string, unknown>>)
    .filter((row) => {
      const legacy = isLegacyApiKeyScopeValue(row.scopes_json);
      if (legacy) {
        return true;
      }
      return params.includeWildcardKeys === true && isWildcardScopeSet(parseApiKeyScopes(row.scopes_json));
    })
    .map((row) => row.id as string);

  if (params.dryRun !== false || candidateIds.length === 0) {
    return {
      candidates: candidateIds.length,
      updated: 0,
      appliedScopes,
      keyIds: candidateIds,
    };
  }

  for (const keyId of candidateIds) {
    await client.execute({
      sql: `UPDATE api_keys SET scopes_json = ? WHERE id = ?`,
      args: [JSON.stringify(appliedScopes), keyId],
    });
  }

  return {
    candidates: candidateIds.length,
    updated: candidateIds.length,
    appliedScopes,
    keyIds: candidateIds,
  };
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

export async function getOrCreateNamespace(userId: string, name: string): Promise<NamespaceRecord> {
  const cleaned = name.trim();
  if (!cleaned) {
    throw new Error("Namespace name is required.");
  }

  const existing = await getNamespaceByName(userId, cleaned);
  if (existing) {
    return existing;
  }

  try {
    return await createNamespace(userId, cleaned);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const namespace = await getNamespaceByName(userId, cleaned);
      if (namespace) {
        return namespace;
      }
    }
    throw error;
  }
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
  sourceType?: MemorySourceType;
  memoryType?: MemoryKind;
  importanceTier?: MemoryImportanceTier;
  sourceUrl?: string | null;
  fileName?: string | null;
  entities?: string[];
  metadata?: Record<string, unknown> | null;
  namespaceId?: string | null;
  sessionId?: string | null;
  isEncrypted?: boolean;
  peer?: MemoryPeer;
}): Promise<AgentMemoryRecord> {
  await ensureInitialized();
  await ensureRateLimiterInitialized();
  const client = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const text = params.text.trim();
  const title = (params.title?.trim() || text.slice(0, 80) || "Untitled Memory").trim();
  const metadataJson = params.metadata ? JSON.stringify(params.metadata) : null;
  const sourceType = params.sourceType ?? "text";
  const memoryType = params.memoryType ?? "episodic";
  const importanceTier = params.importanceTier ?? "normal";
  const peer = params.peer ?? "user";
  const entities = params.entities ?? [];
  const entitiesJson = JSON.stringify(entities);
  const sizeBytes = Buffer.byteLength(text, "utf8");
  const preparedContent = prepareMemoryContentForStorage({
    content: text,
    userId: params.userId,
    sensitive: containsSecrets(text),
  });

  const tx = await client.transaction("write");

  try {
    await reserveMemoryQuotaInTransaction(tx, params.userId, sizeBytes);
    await tx.execute({
      sql: `
        INSERT INTO memories (
          id, user_id, title, source_type, memory_type, importance, importance_tier, tags_csv,
          source_url, file_name, content_text, content_iv, content_encrypted, content_hash, sensitive,
          sync_status, sync_error, created_at, namespace_id, session_id, metadata_json, entities, entities_json, peer
        ) VALUES (?, ?, ?, ?, ?, 5, ?, '', ?, ?, ?, NULL, ?, ?, ?, 'pending', NULL, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        id,
        params.userId,
        title,
        sourceType,
        memoryType,
        importanceTier,
        params.sourceUrl ?? null,
        params.fileName ?? null,
        preparedContent.contentText,
        preparedContent.contentEncrypted,
        preparedContent.contentHash,
        preparedContent.sensitive,
        now,
        params.namespaceId ?? null,
        params.sessionId ?? null,
        metadataJson,
        entitiesJson,
        entitiesJson,
        peer,
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
    importanceTier,
    sourceUrl: params.sourceUrl ?? null,
    fileName: params.fileName ?? null,
    metadata: params.metadata ?? null,
    namespaceId: params.namespaceId ?? null,
    sessionId: params.sessionId ?? null,
    entities,
    feedbackScore: 0,
    accessCount: 0,
    isEncrypted: params.isEncrypted ?? false,
    sensitive: preparedContent.sensitive === 1,
    peer,
    createdAt: now,
  };
}

export async function listAgentMemories(params: {
  userId: string;
  namespaceId?: string | null;
  sessionId?: string | null;
  limit?: number;
  since?: string;
  before?: string;
  memoryTypes?: MemoryKind[];
  excludeMemoryTypes?: MemoryKind[];
  excludeSensitive?: boolean;
}): Promise<AgentMemoryRecord[]> {
  await ensureInitialized();
  const client = getDb();
  const hasNamespaceFilter = typeof params.namespaceId !== "undefined";
  const hasSessionFilter = typeof params.sessionId !== "undefined";
  const hasSince = typeof params.since === "string" && params.since.length > 0;
  const hasBefore = typeof params.before === "string" && params.before.length > 0;
  const excludeSensitive = params.excludeSensitive !== false;
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
  if (hasBefore) {
    where += " AND created_at < ?";
    args.push(params.before as string);
  }
  if (params.memoryTypes?.length) {
    where += ` AND memory_type IN (${params.memoryTypes.map(() => "?").join(",")})`;
    args.push(...params.memoryTypes);
  }
  if (params.excludeMemoryTypes?.length) {
    where += ` AND memory_type NOT IN (${params.excludeMemoryTypes.map(() => "?").join(",")})`;
    args.push(...params.excludeMemoryTypes);
  }
  if (excludeSensitive) {
    where += " AND sensitive = 0";
  }
  args.push(limit);

  const result = await client.execute({
    sql: `
      SELECT id, user_id, title, source_type, memory_type, importance, importance_tier, source_url, file_name, content_text, content_encrypted, metadata_json,
             namespace_id, session_id, entities, entities_json, feedback_score, access_count, sensitive, created_at
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
      SELECT id, user_id, title, source_type, memory_type, importance, importance_tier, source_url, file_name, content_text, content_encrypted, metadata_json,
             namespace_id, session_id, entities, entities_json, feedback_score, access_count, sensitive, created_at
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
      SELECT id, user_id, title, source_type, memory_type, importance, importance_tier, source_url, file_name, content_text, content_encrypted, metadata_json,
             namespace_id, session_id, entities, entities_json, feedback_score, access_count, sensitive, created_at
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

export async function getAgentMemoryById(
  userId: string,
  id: string,
  options?: { excludeSensitive?: boolean },
): Promise<AgentMemoryRecord | null> {
  await ensureInitialized();
  const client = getDb();
  const excludeSensitive = options?.excludeSensitive !== false;
  const result = await client.execute({
    sql: `
      SELECT id, user_id, title, source_type, memory_type, importance, importance_tier, source_url, file_name, content_text, content_encrypted, metadata_json,
             namespace_id, session_id, entities, entities_json, feedback_score, access_count, sensitive, created_at
      FROM memories
      WHERE user_id = ? AND id = ?
      ${excludeSensitive ? "AND sensitive = 0" : ""}
      LIMIT 1
    `,
    args: [userId, id],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? mapAgentMemoryRow(row) : null;
}

export async function listSynthesizedMemoriesByUser(
  userId: string,
  limit = 100,
): Promise<SynthesizedMemoryRecord[]> {
  await ensureInitialized();
  const client = getDb();
  const boundedLimit = Math.max(1, Math.min(limit, 500));
  const result = await client.execute({
    sql: `
      SELECT id, user_id, synthesis, title, source_memory_ids, source_count, cluster_id, cluster_topic,
             compression_ratio, confidence, synthesized_at, last_validated_at, stale,
             importance_tier, access_count, created_at
      FROM synthesized_memories
      WHERE user_id = ?
      ORDER BY synthesized_at DESC, created_at DESC
      LIMIT ?
    `,
    args: [userId, boundedLimit],
  });

  return result.rows.map((row) => mapSynthesizedMemoryRow(row as Record<string, unknown>));
}

export async function getSynthesizedMemoryById(
  userId: string,
  id: string,
): Promise<SynthesizedMemoryRecord | null> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT id, user_id, synthesis, title, source_memory_ids, source_count, cluster_id, cluster_topic,
             compression_ratio, confidence, synthesized_at, last_validated_at, stale,
             importance_tier, access_count, created_at
      FROM synthesized_memories
      WHERE user_id = ? AND id = ?
      LIMIT 1
    `,
    args: [userId, id],
  });

  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? mapSynthesizedMemoryRow(row) : null;
}

export async function getSynthesizedMemoryByClusterId(
  userId: string,
  clusterId: string,
): Promise<SynthesizedMemoryRecord | null> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT id, user_id, synthesis, title, source_memory_ids, source_count, cluster_id, cluster_topic,
             compression_ratio, confidence, synthesized_at, last_validated_at, stale,
             importance_tier, access_count, created_at
      FROM synthesized_memories
      WHERE user_id = ? AND cluster_id = ?
      ORDER BY synthesized_at DESC
      LIMIT 1
    `,
    args: [userId, clusterId],
  });

  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? mapSynthesizedMemoryRow(row) : null;
}

export async function upsertSynthesizedMemory(params: {
  id?: string;
  userId: string;
  synthesis: string;
  title: string;
  sourceMemoryIds: string[];
  sourceCount: number;
  clusterId: string;
  clusterTopic: string;
  compressionRatio?: number | null;
  confidence?: number | null;
  synthesizedAt?: string;
  lastValidatedAt?: string;
  stale?: boolean;
  importanceTier?: SynthesizedMemoryRecord["importanceTier"];
  accessCount?: number;
  createdAt?: string;
  synthesisQualityScore?: number | null;
  synthesisMetadata?: Record<string, unknown> | null;
}): Promise<SynthesizedMemoryRecord> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();
  const id = params.id ?? `synth_${crypto.randomUUID().replaceAll("-", "")}`;
  const synthesis = encryptMemoryContent(params.synthesis, params.userId);
  const sourceMemoryIdsJson = JSON.stringify(params.sourceMemoryIds);

  const synthesisMetadataJson = params.synthesisMetadata ? JSON.stringify(params.synthesisMetadata) : null;

  await client.execute({
    sql: `
      INSERT INTO synthesized_memories (
        id, user_id, synthesis, title, source_memory_ids, source_count, cluster_id, cluster_topic,
        compression_ratio, confidence, synthesized_at, last_validated_at, stale,
        importance_tier, access_count, created_at, synthesis_quality_score, synthesis_metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        synthesis = excluded.synthesis,
        title = excluded.title,
        source_memory_ids = excluded.source_memory_ids,
        source_count = excluded.source_count,
        cluster_id = excluded.cluster_id,
        cluster_topic = excluded.cluster_topic,
        compression_ratio = excluded.compression_ratio,
        confidence = excluded.confidence,
        synthesized_at = excluded.synthesized_at,
        last_validated_at = excluded.last_validated_at,
        stale = excluded.stale,
        importance_tier = excluded.importance_tier,
        access_count = excluded.access_count,
        synthesis_quality_score = excluded.synthesis_quality_score,
        synthesis_metadata = excluded.synthesis_metadata
    `,
    args: [
      id,
      params.userId,
      synthesis,
      params.title,
      sourceMemoryIdsJson,
      params.sourceCount,
      params.clusterId,
      params.clusterTopic,
      params.compressionRatio ?? null,
      params.confidence ?? null,
      params.synthesizedAt ?? now,
      params.lastValidatedAt ?? now,
      params.stale ? 1 : 0,
      params.importanceTier ?? "normal",
      params.accessCount ?? 0,
      params.createdAt ?? now,
      params.synthesisQualityScore ?? null,
      synthesisMetadataJson,
    ],
  });

  const record = await getSynthesizedMemoryById(params.userId, id);
  if (!record) {
    throw new Error("Failed to upsert synthesized memory");
  }
  return record;
}

export async function markSynthesizedMemoryStale(
  userId: string,
  id: string,
  stale: boolean,
): Promise<void> {
  await ensureInitialized();
  const client = getDb();
  await client.execute({
    sql: `
      UPDATE synthesized_memories
      SET stale = ?, last_validated_at = ?
      WHERE user_id = ? AND id = ?
    `,
    args: [stale ? 1 : 0, new Date().toISOString(), userId, id],
  });
}

export async function incrementSynthesizedMemoryAccess(
  userId: string,
  id: string,
): Promise<void> {
  await ensureInitialized();
  const client = getDb();
  await client.execute({
    sql: `
      UPDATE synthesized_memories
      SET access_count = access_count + 1
      WHERE user_id = ? AND id = ?
    `,
    args: [userId, id],
  });
}

export async function updateSynthesizedMemory(
  userId: string,
  id: string,
  updates: { title?: string; synthesis?: string },
): Promise<SynthesizedMemoryRecord> {
  await ensureInitialized();
  const client = getDb();

  const setClauses: string[] = [];
  const args: (string | number)[] = [];

  if (updates.title !== undefined) {
    const encrypted = prepareMemoryContentForStorage({ content: updates.title, userId });
    setClauses.push("title = ?");
    args.push(encrypted.contentText);
  }
  if (updates.synthesis !== undefined) {
    const encrypted = prepareMemoryContentForStorage({ content: updates.synthesis, userId });
    setClauses.push("synthesis = ?");
    args.push(encrypted.contentText);
  }

  if (setClauses.length === 0) {
    const existing = await getSynthesizedMemoryById(userId, id);
    if (!existing) throw new Error("Synthesis not found");
    return existing;
  }

  setClauses.push("last_validated_at = ?");
  args.push(new Date().toISOString());

  args.push(userId, id);

  await client.execute({
    sql: `
      UPDATE synthesized_memories
      SET ${setClauses.join(", ")}
      WHERE user_id = ? AND id = ?
    `,
    args,
  });

  const record = await getSynthesizedMemoryById(userId, id);
  if (!record) throw new Error("Failed to update synthesis");
  return record;
}

export async function deleteSynthesizedMemory(
  userId: string,
  id: string,
): Promise<boolean> {
  await ensureInitialized();
  const client = getDb();

  // Also delete any graph_edges that reference this synthesis
  await client.execute({
    sql: `DELETE FROM graph_edges WHERE user_id = ? AND (source_id = ? OR target_id = ?)`,
    args: [userId, id, id],
  });

  const result = await client.execute({
    sql: `DELETE FROM synthesized_memories WHERE user_id = ? AND id = ?`,
    args: [userId, id],
  });

  return (result.rowsAffected ?? 0) > 0;
}

export async function validateSynthesizedMemories(userId: string): Promise<SynthesizedMemoryRecord[]> {
  await ensureInitialized();
  const syntheses = await listSynthesizedMemoriesByUser(userId, 500);
  const touched: SynthesizedMemoryRecord[] = [];

  for (const synthesis of syntheses) {
    const sourceMemories = await getAgentMemoriesByIds({
      userId,
      ids: synthesis.sourceMemoryIds,
    });
    const liveIds = new Set(sourceMemories.map((memory) => memory.id));
    const missingSource = synthesis.sourceMemoryIds.some((id) => !liveIds.has(id));
    const sourceCountMismatch = sourceMemories.length !== synthesis.sourceMemoryIds.length;
    const shouldBeStale = synthesis.stale || missingSource || sourceCountMismatch;

    await markSynthesizedMemoryStale(userId, synthesis.id, shouldBeStale);
    touched.push({
      ...synthesis,
      stale: shouldBeStale,
      lastValidatedAt: new Date().toISOString(),
    });
  }

  return touched;
}

export async function getAgentMemoriesByIds(params: {
  userId: string;
  ids: string[];
  namespaceId?: string | null;
  since?: string;
  memoryTypes?: MemoryKind[];
  excludeMemoryTypes?: MemoryKind[];
  excludeAbsorbed?: boolean;
  excludeSensitive?: boolean;
  peer?: MemoryPeer;
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
  const hasPeerFilter = typeof params.peer === "string";
  if (hasPeerFilter) {
    args.push(params.peer!);
  }
  const excludeAbsorbed = params.excludeAbsorbed === true;
  const excludeSensitive = params.excludeSensitive !== false;

  // When namespace is specified, include both namespace-scoped AND global (null namespace) memories
  // This follows the spec: "Search defaults to current namespace + global"
  // Note: We only add one placeholder, the arg was already pushed above
  const namespaceClause = hasNamespaceFilter
    ? (params.namespaceId ? "AND (namespace_id = ? OR namespace_id IS NULL)" : "AND namespace_id IS NULL")
    : "";

  const result = await client.execute({
    sql: `
      SELECT id, user_id, title, source_type, memory_type, importance_tier, source_url, file_name, content_text, content_encrypted, metadata_json,
             namespace_id, session_id, entities, entities_json, feedback_score, access_count, sensitive,
             completed, completed_at, ephemeral, absorbed, absorbed_into_synthesis_id, absorbed_by, absorbed_at, peer, created_at
      FROM memories
      WHERE user_id = ? AND id IN (${placeholders}) AND archived_at IS NULL
      ${excludeAbsorbed ? "AND (absorbed = 0 OR absorbed IS NULL)" : ""}
      ${excludeSensitive ? "AND sensitive = 0" : ""}
      ${namespaceClause}
      ${hasSince ? "AND created_at >= ?" : ""}
      ${params.memoryTypes?.length ? `AND memory_type IN (${params.memoryTypes.map(() => "?").join(",")})` : ""}
      ${params.excludeMemoryTypes?.length ? `AND memory_type NOT IN (${params.excludeMemoryTypes.map(() => "?").join(",")})` : ""}
      ${hasPeerFilter ? "AND peer = ?" : ""}
    `,
    args,
  });

  const rankById = new Map(params.ids.map((id, index) => [id, index]));

  return result.rows
    .map((row) => mapAgentMemoryRow(row as Record<string, unknown>))
    .sort((left, right) => {
      const leftRank = rankById.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = rankById.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank;
    });
}

/**
 * Get all critical-tier memories for a user (always injected at session start)
 */
export async function getCriticalMemories(
  userId: string,
  options?: {
    excludeCompleted?: boolean;
    excludeAbsorbed?: boolean;
    excludeSensitive?: boolean;
    limit?: number;
  },
): Promise<AgentMemoryRecord[]> {
  await ensureInitialized();
  const client = getDb();
  const args: Array<string | number> = [userId];
  const whereClauses = ["user_id = ?", "importance_tier = 'critical'", "archived_at IS NULL"];

  if (options?.excludeCompleted) {
    whereClauses.push("(completed = 0 OR completed IS NULL)");
  }
  if (options?.excludeAbsorbed) {
    whereClauses.push("(absorbed = 0 OR absorbed IS NULL)");
  }
  if (options?.excludeSensitive !== false) {
    whereClauses.push("sensitive = 0");
  }
  if (typeof options?.limit === "number") {
    args.push(Math.max(1, Math.min(options.limit, 500)));
  }

  const result = await client.execute({
    sql: `
      SELECT id, user_id, title, source_type, memory_type, importance_tier, source_url, file_name, 
             content_text, content_encrypted, metadata_json, namespace_id, session_id, entities, entities_json, 
             feedback_score, access_count, sensitive, completed, completed_at, ephemeral, absorbed,
             absorbed_into_synthesis_id, absorbed_by, absorbed_at, created_at
      FROM memories
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY created_at DESC
      ${typeof options?.limit === "number" ? "LIMIT ?" : ""}
    `,
    args,
  });

  return result.rows.map((row) => mapAgentMemoryRow(row as Record<string, unknown>));
}

export async function listCriticalSynthesizedMemories(
  userId: string,
  limit = 8,
): Promise<SynthesizedMemoryRecord[]> {
  await ensureInitialized();
  const client = getDb();
  const boundedLimit = Math.max(1, Math.min(limit, 100));
  const result = await client.execute({
    sql: `
      SELECT id, user_id, synthesis, title, source_memory_ids, source_count, cluster_id, cluster_topic,
             compression_ratio, confidence, synthesized_at, last_validated_at, stale,
             importance_tier, access_count, created_at, abstraction_level
      FROM synthesized_memories
      WHERE user_id = ? AND stale = 0 AND importance_tier = 'critical'
      ORDER BY synthesized_at DESC, created_at DESC
      LIMIT ?
    `,
    args: [userId, boundedLimit],
  });

  return result.rows.map((row) => mapSynthesizedMemoryRow(row as Record<string, unknown>));
}

export async function markMemoryCompleted(
  userId: string,
  memoryId: string,
): Promise<boolean> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();
  const result = await client.execute({
    sql: `
      UPDATE memories
      SET completed = 1,
          completed_at = ?,
          importance_tier = 'normal'
      WHERE user_id = ? AND id = ?
    `,
    args: [now, userId, memoryId],
  });
  return (result.rowsAffected ?? 0) > 0;
}

export async function absorbMemoriesByIds(
  userId: string,
  synthesisId: string,
  memoryIds: string[],
): Promise<number> {
  await ensureInitialized();
  if (memoryIds.length === 0) {
    return 0;
  }
  const client = getDb();
  const now = new Date().toISOString();
  const placeholders = memoryIds.map(() => "?").join(",");
  const result = await client.execute({
    sql: `
      UPDATE memories
      SET absorbed = 1,
          absorbed_into_synthesis_id = ?,
          absorbed_by = ?,
          absorbed_at = ?,
          importance_tier = 'normal'
      WHERE user_id = ? AND id IN (${placeholders})
    `,
    args: [synthesisId, synthesisId, now, userId, ...memoryIds],
  });
  return result.rowsAffected ?? 0;
}

export async function demoteMemoryToNormal(userId: string, memoryId: string): Promise<boolean> {
  await ensureInitialized();
  const client = getDb();
  const result = await client.execute({
    sql: `
      UPDATE memories
      SET importance_tier = 'normal'
      WHERE user_id = ? AND id = ?
    `,
    args: [userId, memoryId],
  });
  return (result.rowsAffected ?? 0) > 0;
}

export async function listEphemeralMemoriesOlderThan(
  userId: string,
  olderThanDays: number,
  limit = 100,
): Promise<AgentMemoryRecord[]> {
  await ensureInitialized();
  const client = getDb();
  const boundedLimit = Math.max(1, Math.min(limit, 500));
  const result = await client.execute({
    sql: `
      SELECT id, user_id, title, source_type, memory_type, importance_tier, source_url, file_name,
             content_text, content_encrypted, metadata_json, namespace_id, session_id, entities, entities_json,
             feedback_score, access_count, sensitive, completed, completed_at, ephemeral, absorbed,
             absorbed_into_synthesis_id, absorbed_by, absorbed_at, created_at
      FROM memories
      WHERE user_id = ?
        AND ephemeral = 1
        AND archived_at IS NULL
        AND julianday(created_at) <= julianday('now') - ?
      ORDER BY created_at ASC
      LIMIT ?
    `,
    args: [userId, Math.max(1, Math.floor(olderThanDays)), boundedLimit],
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
      SELECT id, user_id, title, source_type, memory_type, importance, importance_tier, source_url, file_name, content_text, metadata_json,
             content_encrypted, namespace_id, session_id, entities, entities_json, feedback_score, access_count, sensitive, created_at,
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
  updates: { title?: string; text?: string; absorbed?: boolean; absorbedBy?: string }
): Promise<boolean> {
  await ensureInitialized();
  const client = getDb();

  const setClauses: string[] = [];
  const args: (string | number)[] = [];

  if (updates.absorbed !== undefined) {
    setClauses.push("absorbed = ?");
    args.push(updates.absorbed ? 1 : 0);
    if (updates.absorbed) {
      setClauses.push("absorbed_at = ?");
      args.push(new Date().toISOString());
      if (updates.absorbedBy) {
        setClauses.push("absorbed_by = ?");
        args.push(updates.absorbedBy);
      }
    }
  }
  if (updates.title !== undefined) {
    setClauses.push("title = ?");
    args.push(updates.title);
  }
  if (updates.text !== undefined) {
    const preparedContent = prepareMemoryContentForStorage({
      content: updates.text,
      userId,
      sensitive: containsSecrets(updates.text),
    });
    setClauses.push("content_text = ?");
    args.push(preparedContent.contentText);
    setClauses.push("content_iv = ?");
    args.push(preparedContent.contentIv ?? "");
    setClauses.push("content_encrypted = ?");
    args.push(preparedContent.contentEncrypted);
    setClauses.push("content_hash = ?");
    args.push(preparedContent.contentHash);
    setClauses.push("sensitive = ?");
    args.push(preparedContent.sensitive);
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
  return crypto.createHash("sha256").update(data).digest("hex").slice(0, 32);
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
  const embeddingJson = params.embedding ? JSON.stringify(params.embedding) : null;
  const embeddingHashValue = params.embedding ? hashEmbedding(params.embedding) : null;
  const entities = params.entities ?? [];
  const entitiesJson = JSON.stringify(entities);
  const conversationsJson = params.conversationId ? JSON.stringify([params.conversationId]) : null;
  const preparedContent = prepareMemoryContentForStorage({
    content: text,
    userId: params.userId,
    sensitive: containsSecrets(text),
  });

  await client.execute({
    sql: `
      INSERT INTO memories (
        id, user_id, title, source_type, memory_type, importance, tags_csv,
        source_url, file_name, content_text, content_iv, content_encrypted, content_hash, sensitive,
        sync_status, sync_error, created_at, namespace_id, session_id, metadata_json,
        embedding, embedding_hash, strength, base_strength, halflife_days, entities, entities_json, source_conversations,
        first_mentioned_at, last_mentioned_at, last_accessed_at
      ) VALUES (?, ?, ?, 'text', ?, ?, '', NULL, NULL, ?, NULL, ?, ?, ?, 'pending', NULL, ?, ?, ?, ?,
                ?, ?, 1.0, 1.0, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      id,
      params.userId,
      title,
      params.memoryType ?? 'episodic',
      params.importance ?? 5,
      preparedContent.contentText,
      preparedContent.contentEncrypted,
      preparedContent.contentHash,
      preparedContent.sensitive,
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
    importanceTier: "normal" as MemoryImportanceTier,
    sourceUrl: null,
    fileName: null,
    metadata: params.metadata ?? null,
    namespaceId: params.namespaceId ?? null,
    sessionId: params.sessionId ?? null,
    entities,
    feedbackScore: 0,
    accessCount: 0,
    sensitive: preparedContent.sensitive === 1,
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
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const text = params.text.trim();
  const title = (params.title?.trim() || text.slice(0, 80) || "Untitled Memory").trim();
  const metadataJson = params.metadata ? JSON.stringify(params.metadata) : null;
  const embeddingJson = params.embedding ? JSON.stringify(params.embedding) : null;
  const embeddingHashValue = params.embedding ? hashEmbedding(params.embedding) : null;
  const entities = params.entities ?? [];
  const entitiesJson = JSON.stringify(entities);
  const conversationsJson = params.conversationId ? JSON.stringify([params.conversationId]) : null;
  const sizeBytes = Buffer.byteLength(text, "utf8");
  const preparedContent = prepareMemoryContentForStorage({
    content: text,
    userId: params.userId,
    sensitive: containsSecrets(text),
  });
  const tx = await client.transaction("write");

  try {
    await reserveMemoryQuotaInTransaction(tx, params.userId, sizeBytes);
    await tx.execute({
      sql: `
      INSERT INTO memories (
        id, user_id, title, source_type, memory_type, importance, tags_csv,
        source_url, file_name, content_text, content_iv, content_encrypted, content_hash, sensitive,
        sync_status, sync_error, created_at, namespace_id, session_id, metadata_json,
        embedding, embedding_hash, strength, base_strength, halflife_days, entities, entities_json, source_conversations,
        first_mentioned_at, last_mentioned_at, last_accessed_at
        ) VALUES (?, ?, ?, 'text', ?, ?, '', NULL, NULL, ?, NULL, ?, ?, ?, 'pending', NULL, ?, ?, ?, ?,
                  ?, ?, 1.0, 1.0, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        id,
        params.userId,
        title,
        params.memoryType ?? "episodic",
        params.importance ?? 5,
        preparedContent.contentText,
        preparedContent.contentEncrypted,
        preparedContent.contentHash,
        preparedContent.sensitive,
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
      importanceTier: "normal" as MemoryImportanceTier,
      sourceUrl: null,
      fileName: null,
      metadata: params.metadata ?? null,
      namespaceId: params.namespaceId ?? null,
      sessionId: params.sessionId ?? null,
      entities,
      feedbackScore: 0,
      accessCount: 0,
      sensitive: preparedContent.sensitive === 1,
      createdAt: now,
    },
    created: true,
  };
}

// =============================================================================
// Auto-Promotion System
// =============================================================================

/**
 * Promotion thresholds for access-based tier upgrades
 */
const PROMOTION_THRESHOLDS = {
  normalToHigh: 5,   // access_count >= 5 promotes normal → high
  highToCritical: 15, // access_count >= 15 promotes high → critical
} as const;

/**
 * Check and auto-promote memories based on access frequency.
 * - normal → high when access_count >= 5
 * - high → critical when access_count >= 15
 * 
 * Respects promotion_locked flag: locked memories won't be auto-promoted.
 * Returns the count of promoted memories.
 */
export async function checkAndPromoteMemories(userId: string): Promise<{
  promotedToHigh: number;
  promotedToCritical: number;
}> {
  await ensureInitialized();
  const client = getDb();

  // Promote normal → high (access_count >= 5, not locked)
  const highResult = await client.execute({
    sql: `
      UPDATE memories
      SET importance_tier = 'high'
      WHERE user_id = ?
        AND importance_tier = 'normal'
        AND access_count >= ?
        AND (promotion_locked IS NULL OR promotion_locked = 0)
        AND archived_at IS NULL
    `,
    args: [userId, PROMOTION_THRESHOLDS.normalToHigh],
  });

  // Promote high → critical (access_count >= 15, not locked)
  const criticalResult = await client.execute({
    sql: `
      UPDATE memories
      SET importance_tier = 'critical'
      WHERE user_id = ?
        AND importance_tier = 'high'
        AND access_count >= ?
        AND (promotion_locked IS NULL OR promotion_locked = 0)
        AND archived_at IS NULL
    `,
    args: [userId, PROMOTION_THRESHOLDS.highToCritical],
  });

  return {
    promotedToHigh: highResult.rowsAffected ?? 0,
    promotedToCritical: criticalResult.rowsAffected ?? 0,
  };
}

/**
 * Set the promotion_locked flag on a memory to prevent auto-demotion.
 * Use this when manually setting importance tiers.
 */
export async function setPromotionLocked(
  userId: string,
  memoryId: string,
  locked: boolean
): Promise<boolean> {
  await ensureInitialized();
  const client = getDb();

  const result = await client.execute({
    sql: `
      UPDATE memories
      SET promotion_locked = ?
      WHERE user_id = ? AND id = ?
    `,
    args: [locked ? 1 : 0, userId, memoryId],
  });

  return (result.rowsAffected ?? 0) > 0;
}

/**
 * Get all high-tier memories for a user (for context synthesis)
 */
export async function getHighTierMemories(
  userId: string,
  options?: { excludeAbsorbed?: boolean; limit?: number },
): Promise<AgentMemoryRecord[]> {
  await ensureInitialized();
  const client = getDb();
  const args: Array<string | number> = [userId];
  const whereClauses = [
    "user_id = ?",
    "importance_tier = 'high'",
    "archived_at IS NULL",
  ];
  if (options?.excludeAbsorbed) {
    whereClauses.push("(absorbed = 0 OR absorbed IS NULL)");
  }
  const hasLimit = typeof options?.limit === "number";
  if (hasLimit) {
    args.push(Math.max(1, Math.min(options.limit ?? 100, 500)));
  }

  const result = await client.execute({
    sql: `
      SELECT id, user_id, title, source_type, memory_type, importance_tier, source_url, file_name, 
             content_text, content_encrypted, metadata_json, namespace_id, session_id, entities, entities_json, 
             feedback_score, access_count, sensitive, completed, completed_at, ephemeral, absorbed,
             absorbed_into_synthesis_id, absorbed_by, absorbed_at, created_at
      FROM memories
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY access_count DESC, created_at DESC
      ${hasLimit ? "LIMIT ?" : ""}
    `,
    args,
  });

  return result.rows.map((row) => mapAgentMemoryRow(row as Record<string, unknown>));
}

/**
 * Increment access count for multiple memories (batch operation).
 * Used when search returns results to track retrieval frequency.
 */
export async function incrementAccessCounts(userId: string, memoryIds: string[]): Promise<void> {
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

  await client.execute({
    sql: `
      UPDATE memories
      SET durability_class = CASE
        WHEN access_count >= 10 OR importance_tier = 'critical' THEN 'durable'
        WHEN access_count >= 3 OR importance_tier IN ('working','high') THEN 'working'
        ELSE 'ephemeral'
      END
      WHERE user_id = ? AND id IN (${placeholders})
        AND archived_at IS NULL
    `,
    args: [userId, ...memoryIds],
  });
}

// =============================================================================
// Memory Decay System
// =============================================================================

/**
 * Demotion thresholds for score-based tier downgrades
 */
const DEMOTION_THRESHOLDS = {
  criticalToHigh: 3,   // access_count < 3 demotes critical → high
  highToNormal: 1,     // access_count < 1 demotes high → normal
} as const;

/**
 * Apply decay to memory access scores.
 * Memories not accessed in the last 7 days have their access_count reduced by 5%.
 * Respects decay_immune and locked_tier flags.
 * 
 * Returns statistics about the decay operation.
 */
export async function decayMemoryScores(userId?: string): Promise<{
  decayed: number;
  demotedToHigh: number;
  demotedToNormal: number;
}> {
  await ensureInitialized();
  const client = getDb();

  const userFilter = userId ? "AND user_id = ?" : "";
  const userArgs = userId ? [userId] : [];

  // Apply 5% decay to access_count for memories not accessed in 7 days
  const decayResult = await client.execute({
    sql: `
      UPDATE memories
      SET access_count = CAST(access_count * 0.95 AS INTEGER)
      WHERE last_accessed_at < datetime('now', '-7 days')
        AND (promotion_locked IS NULL OR promotion_locked = 0)
        AND (decay_immune IS NULL OR decay_immune = 0)
        AND (locked_tier IS NULL)
        AND access_count > 0
        AND archived_at IS NULL
        ${userFilter}
    `,
    args: userArgs,
  });

  // Demote critical → high when score falls below threshold
  const demoteHighResult = await client.execute({
    sql: `
      UPDATE memories
      SET importance_tier = 'high'
      WHERE importance_tier = 'critical'
        AND access_count < ?
        AND (promotion_locked IS NULL OR promotion_locked = 0)
        AND (locked_tier IS NULL OR locked_tier != 'critical')
        AND archived_at IS NULL
        ${userFilter}
    `,
    args: [DEMOTION_THRESHOLDS.criticalToHigh, ...userArgs],
  });

  // Demote high → normal when score falls below threshold
  const demoteNormalResult = await client.execute({
    sql: `
      UPDATE memories
      SET importance_tier = 'normal'
      WHERE importance_tier = 'high'
        AND access_count < ?
        AND (promotion_locked IS NULL OR promotion_locked = 0)
        AND (locked_tier IS NULL OR (locked_tier != 'critical' AND locked_tier != 'high'))
        AND archived_at IS NULL
        ${userFilter}
    `,
    args: [DEMOTION_THRESHOLDS.highToNormal, ...userArgs],
  });

  return {
    decayed: decayResult.rowsAffected ?? 0,
    demotedToHigh: demoteHighResult.rowsAffected ?? 0,
    demotedToNormal: demoteNormalResult.rowsAffected ?? 0,
  };
}

// =============================================================================
// Reinforcement System
// =============================================================================

/**
 * Apply explicit reinforcement to a memory.
 * Positive reinforcement (+1) adds +5 to effective access_count.
 * Negative reinforcement (-1) subtracts 3 from effective access_count.
 * 
 * Returns the updated memory with new feedback score and potentially new tier.
 */
export async function reinforceMemoryExplicit(
  userId: string,
  memoryId: string,
  value: 1 | -1
): Promise<{
  feedbackScore: number;
  accessCount: number;
  newTier: MemoryImportanceTier;
  promoted: boolean;
  demoted: boolean;
} | null> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();

  // Calculate the access_count delta based on reinforcement
  // +1 reinforcement = +5 to access_count equivalent
  // -1 reinforcement = -3 to access_count equivalent
  const accessDelta = value === 1 ? 5 : -3;

  // Get current state
  const current = await client.execute({
    sql: `SELECT importance_tier, access_count, feedback_score, locked_tier FROM memories WHERE id = ? AND user_id = ?`,
    args: [memoryId, userId],
  });

  if (current.rows.length === 0) {
    return null;
  }

  const row = current.rows[0] as Record<string, unknown>;
  const currentTier = (row.importance_tier as MemoryImportanceTier) ?? "normal";
  const currentAccess = Number(row.access_count ?? 0);
  const currentFeedback = Number(row.feedback_score ?? 0);
  const lockedTier = row.locked_tier as MemoryImportanceTier | null;

  const newAccess = Math.max(0, currentAccess + accessDelta);
  const newFeedback = currentFeedback + value;

  // Update the memory
  await client.execute({
    sql: `
      UPDATE memories
      SET access_count = ?,
          feedback_score = ?,
          last_accessed_at = ?
      WHERE id = ? AND user_id = ?
    `,
    args: [newAccess, newFeedback, now, memoryId, userId],
  });

  // Calculate new tier based on updated access_count
  let newTier: MemoryImportanceTier = currentTier;
  let promoted = false;
  let demoted = false;

  // Check for promotion (respects locked_tier)
  if (newAccess >= PROMOTION_THRESHOLDS.highToCritical) {
    // Can promote to critical if not already critical and lock allows
    if (currentTier !== "critical" && (!lockedTier || lockedTier === "critical")) {
      newTier = "critical";
      promoted = true;
    }
  } else if (newAccess >= PROMOTION_THRESHOLDS.normalToHigh) {
    // Can promote to high if currently normal and lock allows
    if (currentTier === "normal" && (!lockedTier || lockedTier === "high" || lockedTier === "critical")) {
      newTier = "high";
      promoted = true;
    }
  }

  // Check for demotion (respects locked_tier)
  if (newAccess < DEMOTION_THRESHOLDS.highToNormal) {
    // Demote high to normal if lock allows
    if (currentTier === "high" && (!lockedTier || lockedTier === "normal")) {
      newTier = "normal";
      demoted = true;
    }
  } else if (newAccess < DEMOTION_THRESHOLDS.criticalToHigh) {
    // Demote critical to high if lock allows
    if (currentTier === "critical" && (!lockedTier || lockedTier === "high" || lockedTier === "normal")) {
      newTier = "high";
      demoted = true;
    }
  }

  // Apply tier change if needed
  if (newTier !== currentTier) {
    await client.execute({
      sql: `UPDATE memories SET importance_tier = ? WHERE id = ? AND user_id = ?`,
      args: [newTier, memoryId, userId],
    });
  }

  return {
    feedbackScore: newFeedback,
    accessCount: newAccess,
    newTier,
    promoted,
    demoted,
  };
}

// =============================================================================
// Tier Locking System
// =============================================================================

/**
 * Lock a memory at a specific tier.
 * Once locked, the memory cannot be promoted past or demoted below this tier.
 * Pass null to unlock.
 */
export async function setMemoryLockedTier(
  userId: string,
  memoryId: string,
  tier: MemoryImportanceTier | null
): Promise<{ success: boolean; currentTier: MemoryImportanceTier | null }> {
  await ensureInitialized();
  const client = getDb();

  // If locking to a tier, also set the importance_tier to that tier
  if (tier) {
    const result = await client.execute({
      sql: `
        UPDATE memories
        SET locked_tier = ?,
            importance_tier = ?,
            promotion_locked = 1
        WHERE id = ? AND user_id = ?
      `,
      args: [tier, tier, memoryId, userId],
    });
    return {
      success: (result.rowsAffected ?? 0) > 0,
      currentTier: tier,
    };
  } else {
    // Unlocking
    const result = await client.execute({
      sql: `
        UPDATE memories
        SET locked_tier = NULL,
            promotion_locked = 0
        WHERE id = ? AND user_id = ?
      `,
      args: [memoryId, userId],
    });

    // Get current tier
    const current = await client.execute({
      sql: `SELECT importance_tier FROM memories WHERE id = ? AND user_id = ?`,
      args: [memoryId, userId],
    });
    const row = current.rows[0] as Record<string, unknown> | undefined;

    return {
      success: (result.rowsAffected ?? 0) > 0,
      currentTier: row ? (row.importance_tier as MemoryImportanceTier) : null,
    };
  }
}

/**
 * Set decay immunity for a memory.
 */
export async function setMemoryDecayImmune(
  userId: string,
  memoryId: string,
  immune: boolean
): Promise<boolean> {
  await ensureInitialized();
  const client = getDb();

  const result = await client.execute({
    sql: `
      UPDATE memories
      SET decay_immune = ?
      WHERE id = ? AND user_id = ?
    `,
    args: [immune ? 1 : 0, memoryId, userId],
  });

  return (result.rowsAffected ?? 0) > 0;
}

/**
 * Get memory with tier lock info
 */
export async function getMemoryWithLockInfo(
  userId: string,
  memoryId: string
): Promise<{
  id: string;
  importanceTier: MemoryImportanceTier;
  lockedTier: MemoryImportanceTier | null;
  promotionLocked: boolean;
  decayImmune: boolean;
  accessCount: number;
  feedbackScore: number;
} | null> {
  await ensureInitialized();
  const client = getDb();

  const result = await client.execute({
    sql: `
      SELECT id, importance_tier, locked_tier, promotion_locked, decay_immune, access_count, feedback_score
      FROM memories
      WHERE id = ? AND user_id = ?
    `,
    args: [memoryId, userId],
  });

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0] as Record<string, unknown>;
  return {
    id: row.id as string,
    importanceTier: (row.importance_tier as MemoryImportanceTier) ?? "normal",
    lockedTier: (row.locked_tier as MemoryImportanceTier | null) ?? null,
    promotionLocked: Number(row.promotion_locked ?? 0) === 1,
    decayImmune: Number(row.decay_immune ?? 0) === 1,
    accessCount: Number(row.access_count ?? 0),
    feedbackScore: Number(row.feedback_score ?? 0),
  };
}

// =============================================================================
// Memory Misses System
// =============================================================================

export type MemoryMissRecord = {
  id: string;
  userId: string;
  query: string;
  context: string | null;
  sessionId: string | null;
  createdAt: string;
};

async function ensureMissesTable(): Promise<void> {
  const client = getDb();
  await client.execute(`
    CREATE TABLE IF NOT EXISTS memory_misses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      query TEXT NOT NULL,
      context TEXT,
      session_id TEXT,
      created_at TEXT NOT NULL
    )
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_memory_misses_user_created_at
    ON memory_misses(user_id, created_at DESC)
  `);
}

async function ensureRetrievalEvaluationTable(): Promise<void> {
  await ensureInitialized();
  const client = getDb();
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS retrieval_evaluations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      query TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      namespace_id TEXT,
      session_id TEXT,
      candidate_ids_json TEXT NOT NULL,
      accepted_id TEXT,
      accepted_rank INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_retrieval_evaluations_user_created_at
    ON retrieval_evaluations(user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_retrieval_evaluations_user_endpoint_created_at
    ON retrieval_evaluations(user_id, endpoint, created_at DESC);
  `);
}

function mapRetrievalEvaluationRow(row: Record<string, unknown>): RetrievalEvaluationRecord {
  const candidateIds = parseJsonStringArray(row.candidate_ids_json);

  return {
    id: row.id as string,
    userId: row.user_id as string,
    query: row.query as string,
    endpoint: row.endpoint as string,
    namespaceId: (row.namespace_id as string | null) ?? null,
    sessionId: (row.session_id as string | null) ?? null,
    candidateIds,
    acceptedId: (row.accepted_id as string | null) ?? null,
    acceptedRank: row.accepted_rank == null ? null : Number(row.accepted_rank),
    createdAt: row.created_at as string,
    updatedAt: (row.updated_at as string | null) ?? null,
  };
}

export async function logRetrievalEvaluation(params: {
  userId: string;
  query: string;
  endpoint: string;
  candidateIds: string[];
  namespaceId?: string | null;
  sessionId?: string | null;
}): Promise<RetrievalEvaluationRecord | null> {
  await ensureRetrievalEvaluationTable();

  const query = params.query.trim();
  const candidateIds = params.candidateIds.filter(Boolean);
  if (!query || candidateIds.length === 0) {
    return null;
  }

  const client = getDb();
  const id = `eval_${crypto.randomUUID().replaceAll("-", "")}`;
  const now = new Date().toISOString();

  await client.execute({
    sql: `
      INSERT INTO retrieval_evaluations (
        id, user_id, query, endpoint, namespace_id, session_id,
        candidate_ids_json, accepted_id, accepted_rank, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL)
    `,
    args: [
      id,
      params.userId,
      query,
      params.endpoint,
      params.namespaceId ?? null,
      params.sessionId ?? null,
      JSON.stringify(candidateIds),
      now,
    ],
  });

  return {
    id,
    userId: params.userId,
    query,
    endpoint: params.endpoint,
    namespaceId: params.namespaceId ?? null,
    sessionId: params.sessionId ?? null,
    candidateIds,
    acceptedId: null,
    acceptedRank: null,
    createdAt: now,
    updatedAt: null,
  };
}

export async function markRetrievalEvaluationAccepted(params: {
  userId: string;
  evaluationId: string;
  acceptedId: string;
}): Promise<RetrievalEvaluationRecord | null> {
  await ensureRetrievalEvaluationTable();

  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT id, user_id, query, endpoint, namespace_id, session_id,
             candidate_ids_json, accepted_id, accepted_rank, created_at, updated_at
      FROM retrieval_evaluations
      WHERE id = ? AND user_id = ?
      LIMIT 1
    `,
    args: [params.evaluationId, params.userId],
  });

  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    return null;
  }

  const existing = mapRetrievalEvaluationRow(row);
  const acceptedRankIndex = existing.candidateIds.findIndex((id) => id === params.acceptedId);
  const acceptedRank = acceptedRankIndex >= 0 ? acceptedRankIndex + 1 : null;
  const now = new Date().toISOString();

  await client.execute({
    sql: `
      UPDATE retrieval_evaluations
      SET accepted_id = ?, accepted_rank = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `,
    args: [params.acceptedId, acceptedRank, now, params.evaluationId, params.userId],
  });

  return {
    ...existing,
    acceptedId: params.acceptedId,
    acceptedRank,
    updatedAt: now,
  };
}

/**
 * Log a memory miss - when agent searched but didn't find what it needed
 */
export async function logMemoryMiss(params: {
  userId: string;
  query: string;
  context?: string | null;
  sessionId?: string | null;
}): Promise<MemoryMissRecord> {
  await ensureInitialized();
  await ensureMissesTable();
  const client = getDb();
  const id = `miss_${crypto.randomUUID().replaceAll("-", "")}`;
  const now = new Date().toISOString();

  await client.execute({
    sql: `
      INSERT INTO memory_misses (id, user_id, query, context, session_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    args: [
      id,
      params.userId,
      params.query.trim(),
      params.context?.trim() ?? null,
      params.sessionId ?? null,
      now,
    ],
  });

  return {
    id,
    userId: params.userId,
    query: params.query.trim(),
    context: params.context?.trim() ?? null,
    sessionId: params.sessionId ?? null,
    createdAt: now,
  };
}

/**
 * Get memory misses for a user
 */
export async function getMisses(userId: string, limit: number = 50): Promise<MemoryMissRecord[]> {
  await ensureInitialized();
  await ensureMissesTable();
  const client = getDb();
  const boundedLimit = Math.max(1, Math.min(limit, 200));

  const result = await client.execute({
    sql: `
      SELECT id, user_id, query, context, session_id, created_at
      FROM memory_misses
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `,
    args: [userId, boundedLimit],
  });

  return result.rows.map((row) => {
    const record = row as Record<string, unknown>;
    return {
      id: record.id as string,
      userId: record.user_id as string,
      query: record.query as string,
      context: (record.context as string | null) ?? null,
      sessionId: (record.session_id as string | null) ?? null,
      createdAt: record.created_at as string,
    };
  });
}

/**
 * Generate suggestion text based on query patterns
 */
export function generateMissSuggestion(query: string): string {
  const lowerQuery = query.toLowerCase();
  
  if (lowerQuery.includes("timezone") || lowerQuery.includes("time zone")) {
    return "Consider storing timezone preferences when learned";
  }
  if (lowerQuery.includes("preference") || lowerQuery.includes("prefer")) {
    return "Consider storing user preferences when expressed";
  }
  if (lowerQuery.includes("name") || lowerQuery.includes("called")) {
    return "Consider storing names and identities when introduced";
  }
  if (lowerQuery.includes("project") || lowerQuery.includes("working on")) {
    return "Consider storing project context when discussed";
  }
  if (lowerQuery.includes("how to") || lowerQuery.includes("how do")) {
    return "Consider storing procedural knowledge when explained";
  }
  
  return "Consider storing this type of information when learned";
}

// =============================================================================
// Extended Session System
// =============================================================================

export type ExtendedSessionRecord = {
  id: string;
  userId: string;
  namespaceId: string | null;
  namespaceName: string | null;
  metadata: Record<string, unknown> | null;
  turnCount: number;
  outcome: "success" | "failure" | "abandoned" | null;
  feedback: string | null;
  createdAt: string;
  endedAt: string | null;
};

export type SessionTurnRecord = {
  id: string;
  sessionId: string;
  turnNumber: number;
  messagesJson: string;
  memoriesUsed: string[];
  createdAt: string;
};

async function ensureExtendedSessionsTables(): Promise<void> {
  const client = getDb();
  
  // Add columns to sessions table if not present
  const tableInfo = await client.execute("PRAGMA table_info(sessions)");
  const existing = new Set(
    tableInfo.rows
      .map((row) => (row as Record<string, unknown>).name as string)
      .filter(Boolean)
  );

  const columnsToAdd: Array<{ name: string; ddl: string }> = [
    { name: "turn_count", ddl: "INTEGER DEFAULT 0" },
    { name: "outcome", ddl: "TEXT" },
    { name: "feedback", ddl: "TEXT" },
    { name: "ended_at", ddl: "TEXT" },
  ];

  for (const col of columnsToAdd) {
    if (!existing.has(col.name)) {
      await client.execute(`ALTER TABLE sessions ADD COLUMN ${col.name} ${col.ddl}`);
    }
  }

  // Create session_turns table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS session_turns (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      turn_number INTEGER NOT NULL,
      messages_json TEXT NOT NULL,
      memories_used TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_session_turns_session_turn
    ON session_turns(session_id, turn_number)
  `);
}

/**
 * Start a new session with extended tracking
 */
export async function startExtendedSession(params: {
  userId: string;
  namespaceId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<ExtendedSessionRecord> {
  await ensureInitialized();
  await ensureExtendedSessionsTables();
  const client = getDb();
  const id = `sess_${crypto.randomUUID().replaceAll("-", "")}`;
  const now = new Date().toISOString();
  const metadataJson = params.metadata ? JSON.stringify(params.metadata) : null;

  await client.execute({
    sql: `
      INSERT INTO sessions (id, user_id, namespace_id, metadata_json, turn_count, created_at)
      VALUES (?, ?, ?, ?, 0, ?)
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
    turnCount: 0,
    outcome: null,
    feedback: null,
    createdAt: now,
    endedAt: null,
  };
}

/**
 * Record a turn in a session
 */
export async function recordSessionTurn(params: {
  userId: string;
  sessionId: string;
  turnNumber: number;
  messages: Array<{ role: string; content: string }>;
  memoriesUsed?: string[];
}): Promise<SessionTurnRecord> {
  await ensureInitialized();
  await ensureExtendedSessionsTables();
  const client = getDb();
  const id = `turn_${crypto.randomUUID().replaceAll("-", "")}`;
  const now = new Date().toISOString();
  const messagesJson = JSON.stringify(params.messages);
  const memoriesUsedJson = params.memoriesUsed ? JSON.stringify(params.memoriesUsed) : "[]";

  // Verify session exists and belongs to user
  const session = await client.execute({
    sql: "SELECT id FROM sessions WHERE id = ? AND user_id = ?",
    args: [params.sessionId, params.userId],
  });
  if (session.rows.length === 0) {
    throw new Error("Session not found");
  }

  await client.execute({
    sql: `
      INSERT INTO session_turns (id, session_id, turn_number, messages_json, memories_used, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    args: [id, params.sessionId, params.turnNumber, messagesJson, memoriesUsedJson, now],
  });

  // Update session turn count
  await client.execute({
    sql: "UPDATE sessions SET turn_count = ? WHERE id = ?",
    args: [params.turnNumber, params.sessionId],
  });

  return {
    id,
    sessionId: params.sessionId,
    turnNumber: params.turnNumber,
    messagesJson,
    memoriesUsed: params.memoriesUsed ?? [],
    createdAt: now,
  };
}

/**
 * End a session and record outcome
 */
export async function endSession(params: {
  userId: string;
  sessionId: string;
  outcome: "success" | "failure" | "abandoned";
  feedback?: string | null;
}): Promise<ExtendedSessionRecord | null> {
  await ensureInitialized();
  await ensureExtendedSessionsTables();
  const client = getDb();
  const now = new Date().toISOString();

  const result = await client.execute({
    sql: `
      UPDATE sessions
      SET outcome = ?, feedback = ?, ended_at = ?
      WHERE id = ? AND user_id = ?
    `,
    args: [
      params.outcome,
      params.feedback ?? null,
      now,
      params.sessionId,
      params.userId,
    ],
  });

  if ((result.rowsAffected ?? 0) === 0) {
    return null;
  }

  return getExtendedSessionById(params.userId, params.sessionId);
}

/**
 * Get extended session by ID
 */
export async function getExtendedSessionById(
  userId: string,
  sessionId: string
): Promise<ExtendedSessionRecord | null> {
  await ensureInitialized();
  await ensureExtendedSessionsTables();
  const client = getDb();

  const result = await client.execute({
    sql: `
      SELECT s.id, s.user_id, s.namespace_id, s.metadata_json, s.turn_count, 
             s.outcome, s.feedback, s.created_at, s.ended_at, n.name AS namespace_name
      FROM sessions s
      LEFT JOIN namespaces n ON n.id = s.namespace_id
      WHERE s.user_id = ? AND s.id = ?
      LIMIT 1
    `,
    args: [userId, sessionId],
  });

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0] as Record<string, unknown>;
  return {
    id: row.id as string,
    userId: row.user_id as string,
    namespaceId: (row.namespace_id as string | null) ?? null,
    namespaceName: (row.namespace_name as string | null) ?? null,
    metadata: parseJsonObject(row.metadata_json),
    turnCount: Number(row.turn_count ?? 0),
    outcome: (row.outcome as "success" | "failure" | "abandoned" | null) ?? null,
    feedback: (row.feedback as string | null) ?? null,
    createdAt: row.created_at as string,
    endedAt: (row.ended_at as string | null) ?? null,
  };
}

/**
 * Get all turns for a session
 */
export async function getSessionTurns(
  userId: string,
  sessionId: string
): Promise<SessionTurnRecord[]> {
  await ensureInitialized();
  await ensureExtendedSessionsTables();
  const client = getDb();

  // Verify session belongs to user
  const session = await client.execute({
    sql: "SELECT id FROM sessions WHERE id = ? AND user_id = ?",
    args: [sessionId, userId],
  });
  if (session.rows.length === 0) {
    return [];
  }

  const result = await client.execute({
    sql: `
      SELECT id, session_id, turn_number, messages_json, memories_used, created_at
      FROM session_turns
      WHERE session_id = ?
      ORDER BY turn_number ASC
    `,
    args: [sessionId],
  });

  return result.rows.map((row) => {
    const record = row as Record<string, unknown>;
    let memoriesUsed: string[] = [];
    try {
      memoriesUsed = JSON.parse((record.memories_used as string) || "[]") as string[];
    } catch {
      // no-op
    }
    return {
      id: record.id as string,
      sessionId: record.session_id as string,
      turnNumber: Number(record.turn_number),
      messagesJson: record.messages_json as string,
      memoriesUsed,
      createdAt: record.created_at as string,
    };
  });
}

/**
 * Get all unique memory IDs used across all turns in a session
 */
export async function getSessionMemoriesUsed(
  userId: string,
  sessionId: string
): Promise<string[]> {
  const turns = await getSessionTurns(userId, sessionId);
  const usedSet = new Set<string>();
  for (const turn of turns) {
    for (const id of turn.memoriesUsed) {
      usedSet.add(id);
    }
  }
  return Array.from(usedSet);
}

/**
 * Reinforce memories that were used in a successful session
 */
export async function reinforceSessionMemories(
  userId: string,
  sessionId: string
): Promise<number> {
  const memoryIds = await getSessionMemoriesUsed(userId, sessionId);
  if (memoryIds.length === 0) {
    return 0;
  }

  await incrementAccessCounts(userId, memoryIds);
  return memoryIds.length;
}
