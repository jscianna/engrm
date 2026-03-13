import { ensureDatabaseMigrations } from "@/lib/db-migrations";
import { getDb } from "@/lib/turso";
import { FatHippoError } from "@/lib/errors";
import { extractRequestInfo } from "@/lib/audit-log";

let initialized = false;

async function ensureRequestThrottleTable(): Promise<void> {
  if (initialized) {
    return;
  }

  await ensureDatabaseMigrations();
  const client = getDb();
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS request_throttles (
      scope TEXT NOT NULL,
      actor_key TEXT NOT NULL,
      bucket_start TEXT NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      PRIMARY KEY (scope, actor_key, bucket_start)
    );

    CREATE INDEX IF NOT EXISTS idx_request_throttles_expires_at
    ON request_throttles(expires_at);
  `);

  initialized = true;
}

function bucketStartIso(nowMs: number, windowMs: number): string {
  return new Date(Math.floor(nowMs / windowMs) * windowMs).toISOString();
}

function cleanupProbability(): number {
  return 0.02;
}

export function buildThrottleActorKey(params: {
  actorKey?: string | null;
  request?: Request;
  prefix?: string;
}): string {
  const prefix = params.prefix ? `${params.prefix}:` : "";
  if (params.actorKey && params.actorKey.trim().length > 0) {
    return `${prefix}${params.actorKey.trim().toLowerCase()}`;
  }

  if (params.request) {
    const { ipAddress } = extractRequestInfo(params.request);
    if (ipAddress) {
      return `${prefix}ip:${ipAddress}`;
    }
  }

  return `${prefix}anonymous`;
}

export async function enforceRequestThrottle(params: {
  scope: string;
  actorKey: string;
  limit: number;
  windowMs: number;
}): Promise<{
  allowed: boolean;
  count: number;
  remaining: number;
  resetAt: string;
}> {
  await ensureRequestThrottleTable();

  const client = getDb();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const startIso = bucketStartIso(nowMs, params.windowMs);
  const resetAt = new Date(new Date(startIso).getTime() + params.windowMs).toISOString();
  const expiresAt = new Date(new Date(startIso).getTime() + params.windowMs * 2).toISOString();
  const tx = await client.transaction("write");

  try {
    await tx.execute({
      sql: `
        INSERT INTO request_throttles (
          scope, actor_key, bucket_start, request_count, updated_at, expires_at
        ) VALUES (?, ?, ?, 1, ?, ?)
        ON CONFLICT(scope, actor_key, bucket_start) DO UPDATE SET
          request_count = request_count + 1,
          updated_at = excluded.updated_at,
          expires_at = excluded.expires_at
      `,
      args: [params.scope, params.actorKey, startIso, nowIso, expiresAt],
    });

    const result = await tx.execute({
      sql: `
        SELECT request_count
        FROM request_throttles
        WHERE scope = ? AND actor_key = ? AND bucket_start = ?
        LIMIT 1
      `,
      args: [params.scope, params.actorKey, startIso],
    });

    const count = Number((result.rows[0] as Record<string, unknown> | undefined)?.request_count ?? 0);
    if (count > params.limit) {
      throw new FatHippoError("RATE_LIMIT_ACTION", {
        scope: params.scope,
        limit: params.limit,
        retryAfterSeconds: Math.max(1, Math.ceil((new Date(resetAt).getTime() - nowMs) / 1000)),
      });
    }

    await tx.commit();

    if (Math.random() < cleanupProbability()) {
      cleanupExpiredRequestThrottles().catch(() => {});
    }

    return {
      allowed: true,
      count,
      remaining: Math.max(0, params.limit - count),
      resetAt,
    };
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  } finally {
    tx.close();
  }
}

export async function cleanupExpiredRequestThrottles(beforeIso = new Date().toISOString()): Promise<number> {
  await ensureRequestThrottleTable();
  const client = getDb();
  const result = await client.execute({
    sql: `DELETE FROM request_throttles WHERE expires_at <= ?`,
    args: [beforeIso],
  });
  return result.rowsAffected ?? 0;
}
