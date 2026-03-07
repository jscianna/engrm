/**
 * Rate limiting for FatHippo API
 * Uses atomic operations to prevent race conditions
 * Self-cleaning with probabilistic TTL cleanup
 */

import crypto from "node:crypto";
import type { Transaction } from "@libsql/client";
import { getDb } from "./turso";
import { MemryError } from "./errors";

// Beta limits - generous but protective
export const LIMITS = {
  REQUESTS_PER_MINUTE: 60,
  REQUESTS_PER_DAY: 10_000,
  MEMORIES_PER_MONTH: 5_000,
  STORAGE_BYTES: 100 * 1024 * 1024, // 100MB
} as const;

// TTL settings
const USAGE_RECORD_TTL_DAYS = 7;
const CLEANUP_PROBABILITY = 0.01; // 1% of requests trigger cleanup

let initialized = false;

export async function ensureRateLimiterInitialized(): Promise<void> {
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
 * Check rate limits and record API call (atomic)
 * Throws MemryError if limits exceeded
 */
export async function checkRateLimit(
  userId: string,
  apiKeyId: string,
  endpoint: string
): Promise<void> {
  await ensureRateLimiterInitialized();
  const client = getDb();
  const now = new Date();
  const nowIso = now.toISOString();
  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000).toISOString();

  // Atomic: Insert the usage record first, then check limits
  // This prevents race conditions where multiple requests slip through
  const id = crypto.randomUUID();
  
  // Use a transaction for atomicity
  const batch = await client.batch([
    // 1. Insert the new usage record
    {
      sql: `INSERT INTO api_usage (id, user_id, api_key_id, endpoint, timestamp) VALUES (?, ?, ?, ?, ?)`,
      args: [id, userId, apiKeyId, endpoint, nowIso],
    },
    // 2. Count requests in last minute (including the one we just inserted)
    {
      sql: `SELECT COUNT(*) as count FROM api_usage WHERE api_key_id = ? AND timestamp > ?`,
      args: [apiKeyId, oneMinuteAgo],
    },
    // 3. Upsert and increment daily stats atomically
    {
      sql: `
        INSERT INTO usage_stats (user_id, api_calls_today, api_calls_this_month, memories_this_month, storage_bytes, last_reset_day, last_reset_month, updated_at)
        VALUES (?, 1, 1, 0, 0, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          api_calls_today = CASE 
            WHEN last_reset_day != ? THEN 1 
            ELSE api_calls_today + 1 
          END,
          api_calls_this_month = CASE 
            WHEN last_reset_month != ? THEN 1 
            ELSE api_calls_this_month + 1 
          END,
          last_reset_day = ?,
          last_reset_month = ?,
          updated_at = ?
      `,
      args: [
        userId,
        nowIso.slice(0, 10), // today
        nowIso.slice(0, 7),  // this month
        nowIso,
        nowIso.slice(0, 10), // for CASE comparison
        nowIso.slice(0, 7),  // for CASE comparison
        nowIso.slice(0, 10), // new last_reset_day
        nowIso.slice(0, 7),  // new last_reset_month
        nowIso,
      ],
    },
    // 4. Get current stats
    {
      sql: `SELECT api_calls_today, api_calls_this_month FROM usage_stats WHERE user_id = ?`,
      args: [userId],
    },
  ], "write");

  // Check per-minute limit
  const minuteCount = Number((batch[1].rows[0] as Record<string, unknown>)?.count ?? 0);
  if (minuteCount > LIMITS.REQUESTS_PER_MINUTE) {
    // Delete the record we just inserted since we're over limit
    await client.execute({
      sql: `DELETE FROM api_usage WHERE id = ?`,
      args: [id],
    });
    throw new MemryError("RATE_LIMIT_MINUTE", {
      limit: LIMITS.REQUESTS_PER_MINUTE,
      window: "1 minute",
      retryAfter: 60,
    });
  }

  // Check daily limit
  const stats = batch[3].rows[0] as Record<string, unknown> | undefined;
  const apiCallsToday = Number(stats?.api_calls_today ?? 0);
  if (apiCallsToday > LIMITS.REQUESTS_PER_DAY) {
    throw new MemryError("RATE_LIMIT_DAILY", {
      limit: LIMITS.REQUESTS_PER_DAY,
      resetAt: getTomorrowMidnightUTC(),
    });
  }

  // Probabilistic cleanup - self-healing, no cron needed
  if (Math.random() < CLEANUP_PROBABILITY) {
    cleanupOldUsageRecords(USAGE_RECORD_TTL_DAYS).catch(() => {});
  }
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
  await ensureRateLimiterInitialized();
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
  await ensureRateLimiterInitialized();
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
  await ensureRateLimiterInitialized();
  const client = getDb();
  const now = new Date();
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);
  const thisMonth = nowIso.slice(0, 7);

  // Upsert with date reset logic
  await client.execute({
    sql: `
      INSERT INTO usage_stats (user_id, memories_this_month, storage_bytes, api_calls_today, api_calls_this_month, last_reset_day, last_reset_month, updated_at)
      VALUES (?, 0, 0, 0, 0, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        api_calls_today = CASE WHEN last_reset_day != ? THEN 0 ELSE api_calls_today END,
        api_calls_this_month = CASE WHEN last_reset_month != ? THEN 0 ELSE api_calls_this_month END,
        memories_this_month = CASE WHEN last_reset_month != ? THEN 0 ELSE memories_this_month END,
        last_reset_day = ?,
        last_reset_month = ?,
        updated_at = ?
    `,
    args: [userId, today, thisMonth, nowIso, today, thisMonth, thisMonth, today, thisMonth, nowIso],
  });

  const result = await client.execute({
    sql: `SELECT api_calls_today, api_calls_this_month, memories_this_month, storage_bytes FROM usage_stats WHERE user_id = ?`,
    args: [userId],
  });

  const row = result.rows[0] as Record<string, unknown> | undefined;
  return {
    apiCallsToday: Number(row?.api_calls_today ?? 0),
    apiCallsThisMonth: Number(row?.api_calls_this_month ?? 0),
    memoriesThisMonth: Number(row?.memories_this_month ?? 0),
    storageBytes: Number(row?.storage_bytes ?? 0),
  };
}

function getTomorrowMidnightUTC(): string {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return tomorrow.toISOString();
}

/**
 * Clean up old usage records (TTL-based)
 * Called probabilistically on each request - self-healing, no cron needed
 */
export async function cleanupOldUsageRecords(olderThanDays: number = USAGE_RECORD_TTL_DAYS): Promise<number> {
  await ensureRateLimiterInitialized();
  const client = getDb();
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();

  const result = await client.execute({
    sql: `DELETE FROM api_usage WHERE timestamp < ?`,
    args: [cutoff],
  });

  return result.rowsAffected ?? 0;
}

export async function reserveMemoryQuotaInTransaction(
  tx: Transaction,
  userId: string,
  sizeBytes: number,
): Promise<void> {
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);
  const thisMonth = nowIso.slice(0, 7);

  await tx.execute({
    sql: `
      INSERT INTO usage_stats (
        user_id,
        memories_this_month,
        storage_bytes,
        api_calls_today,
        api_calls_this_month,
        last_reset_day,
        last_reset_month,
        updated_at
      )
      VALUES (?, 0, 0, 0, 0, ?, ?, ?)
      ON CONFLICT(user_id) DO NOTHING
    `,
    args: [userId, today, thisMonth, nowIso],
  });

  const updateResult = await tx.execute({
    sql: `
      UPDATE usage_stats
      SET
        memories_this_month = CASE
          WHEN last_reset_month != ? THEN 1
          ELSE memories_this_month + 1
        END,
        storage_bytes = storage_bytes + ?,
        last_reset_day = ?,
        last_reset_month = ?,
        updated_at = ?
      WHERE user_id = ?
        AND storage_bytes + ? <= ?
        AND (
          last_reset_month != ?
          OR memories_this_month < ?
        )
    `,
    args: [
      thisMonth,
      sizeBytes,
      today,
      thisMonth,
      nowIso,
      userId,
      sizeBytes,
      LIMITS.STORAGE_BYTES,
      thisMonth,
      LIMITS.MEMORIES_PER_MONTH,
    ],
  });

  if ((updateResult.rowsAffected ?? 0) > 0) {
    return;
  }

  const statsResult = await tx.execute({
    sql: `
      SELECT memories_this_month, storage_bytes, last_reset_month
      FROM usage_stats
      WHERE user_id = ?
      LIMIT 1
    `,
    args: [userId],
  });

  const row = statsResult.rows[0] as Record<string, unknown> | undefined;
  const storedMonth = typeof row?.last_reset_month === "string" ? row.last_reset_month : null;
  const effectiveMemories = storedMonth === thisMonth ? Number(row?.memories_this_month ?? 0) : 0;
  const effectiveStorage = Number(row?.storage_bytes ?? 0);

  if (effectiveStorage + sizeBytes > LIMITS.STORAGE_BYTES) {
    throw new MemryError("QUOTA_STORAGE", {
      limit: LIMITS.STORAGE_BYTES,
      current: effectiveStorage,
      requested: sizeBytes,
    });
  }

  throw new MemryError("QUOTA_MEMORIES", {
    limit: LIMITS.MEMORIES_PER_MONTH,
    current: effectiveMemories,
  });
}
