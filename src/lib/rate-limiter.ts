/**
 * Rate limiting for MEMRY API
 * Uses sliding window counters stored in Turso
 */

import { createClient, type Client } from "@libsql/client";
import { MemryError } from "./errors";

// Beta limits - generous but protective
export const LIMITS = {
  REQUESTS_PER_MINUTE: 60,
  REQUESTS_PER_DAY: 10_000,
  MEMORIES_PER_MONTH: 5_000,
  STORAGE_BYTES: 100 * 1024 * 1024, // 100MB
} as const;

let db: Client | null = null;

function getDb(): Client {
  if (!db) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    if (!url) throw new Error("TURSO_DATABASE_URL is required");
    db = createClient({ url, authToken });
  }
  return db;
}

let initialized = false;

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  
  const client = getDb();
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS api_usage (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      api_key_id TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_usage_user_time
    ON api_usage(user_id, timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_usage_key_time
    ON api_usage(api_key_id, timestamp DESC);

    CREATE TABLE IF NOT EXISTS usage_stats (
      user_id TEXT PRIMARY KEY,
      memories_this_month INTEGER DEFAULT 0,
      storage_bytes INTEGER DEFAULT 0,
      api_calls_today INTEGER DEFAULT 0,
      api_calls_this_month INTEGER DEFAULT 0,
      last_reset_day TEXT,
      last_reset_month TEXT,
      updated_at TEXT NOT NULL
    );
  `);
  
  initialized = true;
}

export type UsageStats = {
  apiCallsToday: number;
  apiCallsThisMonth: number;
  memoriesThisMonth: number;
  storageBytes: number;
  limits: {
    requestsPerMinute: number;
    requestsPerDay: number;
    memoriesPerMonth: number;
    storageBytes: number;
  };
};

/**
 * Check rate limits and record API call
 * Throws MemryError if limits exceeded
 */
export async function checkRateLimit(
  userId: string,
  apiKeyId: string,
  endpoint: string
): Promise<void> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date();
  const nowIso = now.toISOString();
  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000).toISOString();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  // Check per-minute limit (fast path using recent records)
  const minuteResult = await client.execute({
    sql: `SELECT COUNT(*) as count FROM api_usage WHERE api_key_id = ? AND timestamp > ?`,
    args: [apiKeyId, oneMinuteAgo],
  });
  const minuteCount = Number((minuteResult.rows[0] as Record<string, unknown>)?.count ?? 0);
  
  if (minuteCount >= LIMITS.REQUESTS_PER_MINUTE) {
    throw new MemryError("RATE_LIMIT_MINUTE", {
      limit: LIMITS.REQUESTS_PER_MINUTE,
      window: "1 minute",
      retryAfter: 60,
    });
  }

  // Check daily limit from stats table
  const stats = await getOrCreateStats(userId);
  if (stats.apiCallsToday >= LIMITS.REQUESTS_PER_DAY) {
    throw new MemryError("RATE_LIMIT_DAILY", {
      limit: LIMITS.REQUESTS_PER_DAY,
      resetAt: getTomorrowMidnightUTC(),
    });
  }

  // Record the API call
  const id = crypto.randomUUID();
  await client.execute({
    sql: `INSERT INTO api_usage (id, user_id, api_key_id, endpoint, timestamp) VALUES (?, ?, ?, ?, ?)`,
    args: [id, userId, apiKeyId, endpoint, nowIso],
  });

  // Increment stats
  await client.execute({
    sql: `UPDATE usage_stats SET api_calls_today = api_calls_today + 1, api_calls_this_month = api_calls_this_month + 1, updated_at = ? WHERE user_id = ?`,
    args: [nowIso, userId],
  });
}

/**
 * Check memory quota before creating
 */
export async function checkMemoryQuota(userId: string): Promise<void> {
  const stats = await getOrCreateStats(userId);
  if (stats.memoriesThisMonth >= LIMITS.MEMORIES_PER_MONTH) {
    throw new MemryError("QUOTA_MEMORIES", {
      limit: LIMITS.MEMORIES_PER_MONTH,
      current: stats.memoriesThisMonth,
    });
  }
}

/**
 * Check storage quota before storing
 */
export async function checkStorageQuota(userId: string, additionalBytes: number): Promise<void> {
  const stats = await getOrCreateStats(userId);
  if (stats.storageBytes + additionalBytes > LIMITS.STORAGE_BYTES) {
    throw new MemryError("QUOTA_STORAGE", {
      limit: LIMITS.STORAGE_BYTES,
      current: stats.storageBytes,
      requested: additionalBytes,
    });
  }
}

/**
 * Increment memory count after successful creation
 */
export async function recordMemoryCreated(userId: string, sizeBytes: number): Promise<void> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();
  
  await client.execute({
    sql: `UPDATE usage_stats SET memories_this_month = memories_this_month + 1, storage_bytes = storage_bytes + ?, updated_at = ? WHERE user_id = ?`,
    args: [sizeBytes, now, userId],
  });
}

/**
 * Decrement storage after memory deletion
 */
export async function recordMemoryDeleted(userId: string, sizeBytes: number): Promise<void> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date().toISOString();
  
  await client.execute({
    sql: `UPDATE usage_stats SET storage_bytes = MAX(0, storage_bytes - ?), updated_at = ? WHERE user_id = ?`,
    args: [sizeBytes, now, userId],
  });
}

/**
 * Get usage stats for a user
 */
export async function getUsageStats(userId: string): Promise<UsageStats> {
  const stats = await getOrCreateStats(userId);
  return {
    ...stats,
    limits: {
      requestsPerMinute: LIMITS.REQUESTS_PER_MINUTE,
      requestsPerDay: LIMITS.REQUESTS_PER_DAY,
      memoriesPerMonth: LIMITS.MEMORIES_PER_MONTH,
      storageBytes: LIMITS.STORAGE_BYTES,
    },
  };
}

async function getOrCreateStats(userId: string): Promise<{
  apiCallsToday: number;
  apiCallsThisMonth: number;
  memoriesThisMonth: number;
  storageBytes: number;
}> {
  await ensureInitialized();
  const client = getDb();
  const now = new Date();
  const nowIso = now.toISOString();
  const today = now.toISOString().slice(0, 10);
  const thisMonth = now.toISOString().slice(0, 7);

  // Try to get existing stats
  const result = await client.execute({
    sql: `SELECT * FROM usage_stats WHERE user_id = ?`,
    args: [userId],
  });

  if (result.rows.length === 0) {
    // Create new stats record
    await client.execute({
      sql: `INSERT INTO usage_stats (user_id, memories_this_month, storage_bytes, api_calls_today, api_calls_this_month, last_reset_day, last_reset_month, updated_at) VALUES (?, 0, 0, 0, 0, ?, ?, ?)`,
      args: [userId, today, thisMonth, nowIso],
    });
    return { apiCallsToday: 0, apiCallsThisMonth: 0, memoriesThisMonth: 0, storageBytes: 0 };
  }

  const row = result.rows[0] as Record<string, unknown>;
  let apiCallsToday = Number(row.api_calls_today ?? 0);
  let apiCallsThisMonth = Number(row.api_calls_this_month ?? 0);
  let memoriesThisMonth = Number(row.memories_this_month ?? 0);
  const storageBytes = Number(row.storage_bytes ?? 0);
  const lastResetDay = row.last_reset_day as string | null;
  const lastResetMonth = row.last_reset_month as string | null;

  // Reset daily counter if needed
  if (lastResetDay !== today) {
    apiCallsToday = 0;
    await client.execute({
      sql: `UPDATE usage_stats SET api_calls_today = 0, last_reset_day = ?, updated_at = ? WHERE user_id = ?`,
      args: [today, nowIso, userId],
    });
  }

  // Reset monthly counters if needed
  if (lastResetMonth !== thisMonth) {
    apiCallsThisMonth = 0;
    memoriesThisMonth = 0;
    await client.execute({
      sql: `UPDATE usage_stats SET api_calls_this_month = 0, memories_this_month = 0, last_reset_month = ?, updated_at = ? WHERE user_id = ?`,
      args: [thisMonth, nowIso, userId],
    });
  }

  return { apiCallsToday, apiCallsThisMonth, memoriesThisMonth, storageBytes };
}

function getTomorrowMidnightUTC(): string {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return tomorrow.toISOString();
}

/**
 * Clean up old usage records (run periodically)
 */
export async function cleanupOldUsageRecords(olderThanDays: number = 7): Promise<number> {
  await ensureInitialized();
  const client = getDb();
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  
  const result = await client.execute({
    sql: `DELETE FROM api_usage WHERE timestamp < ?`,
    args: [cutoff],
  });
  
  return result.rowsAffected ?? 0;
}
