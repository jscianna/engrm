/**
 * Audit Logging System
 * 
 * Logs all security-relevant actions for compliance and breach detection.
 * Designed for SOC2/GDPR readiness.
 */

// Active: memory.write_decision events are logged via turn-capture.ts / storeAutoMemory.
// Cognitive actions (trace, pattern, skill) are logged by their respective API routes.

import crypto from "node:crypto";
import { ensureDatabaseMigrations } from "./db-migrations";
import { getDb } from "./turso";

// =============================================================================
// Types
// =============================================================================

export type AuditAction =
  | "memory.create"
  | "memory.read"
  | "memory.update"
  | "memory.delete"
  | "memory.search"
  | "memory.write_decision"
  | "auth.login"
  | "auth.logout"
  | "auth.api_key_create"
  | "auth.api_key_delete"
  | "auth.api_key_revoke"
  | "auth.api_key_expire"
  | "auth.api_key_expiration_clear"
  | "vault.read"
  | "vault.create"
  | "vault.update"
  | "vault.delete"
  | "settings.update"
  | "admin.migrate"
  | "admin.maintenance"
  | "cognitive.settings.update"
  | "cognitive.trace.create"
  | "cognitive.trace.outcome"
  | "cognitive.pattern.create"
  | "cognitive.pattern.extract"
  | "cognitive.pattern.feedback"
  | "cognitive.skill.synthesize"
  | "cognitive.skill.publish"
  | "cognitive.export"
  | "cognitive.delete"
  | "cognitive.retention.cleanup"
  | "cognitive.eval.benchmark_run";

export type AuditLogEntry = {
  id: string;
  userId: string;
  action: AuditAction;
  resourceType: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  timestamp: string;
};

// =============================================================================
// Initialization
// =============================================================================

let initialized = false;

async function ensureAuditTable(): Promise<void> {
  if (initialized) return;

  await ensureDatabaseMigrations();
  const client = getDb();
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      ip_address TEXT,
      user_agent TEXT,
      metadata_json TEXT,
      timestamp TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_user_time
    ON audit_logs(user_id, timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_audit_action_time
    ON audit_logs(action, timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_audit_timestamp
    ON audit_logs(timestamp DESC);
  `);

  initialized = true;
}

// =============================================================================
// Logging Functions
// =============================================================================

/**
 * Log an audit event
 */
export async function logAuditEvent(params: {
  userId: string;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await ensureAuditTable();
    const client = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await client.execute({
      sql: `
        INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, ip_address, user_agent, metadata_json, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        id,
        params.userId,
        params.action,
        params.resourceType ?? null,
        params.resourceId ?? null,
        params.ipAddress ?? null,
        params.userAgent ?? null,
        params.metadata ? JSON.stringify(params.metadata) : null,
        now,
      ],
    });
  } catch (error) {
    // Audit logging should never break the main flow
    console.error("[Audit] Failed to log event:", error);
  }
}

/**
 * Extract IP and User-Agent from request headers
 */
export function extractRequestInfo(request: Request): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  // Vercel/Cloudflare headers for real IP
  const ipAddress =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;

  const userAgent = request.headers.get("user-agent") ?? null;

  return { ipAddress, userAgent };
}

/**
 * Query audit logs for a user
 */
export async function getAuditLogs(params: {
  userId?: string;
  action?: AuditAction;
  since?: string;
  limit?: number;
}): Promise<AuditLogEntry[]> {
  await ensureAuditTable();
  const client = getDb();

  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (params.userId) {
    conditions.push("user_id = ?");
    args.push(params.userId);
  }

  if (params.action) {
    conditions.push("action = ?");
    args.push(params.action);
  }

  if (params.since) {
    conditions.push("timestamp > ?");
    args.push(params.since);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = params.limit ?? 100;

  const result = await client.execute({
    sql: `SELECT * FROM audit_logs ${whereClause} ORDER BY timestamp DESC LIMIT ?`,
    args: [...args, limit],
  });

  return result.rows.map((row) => ({
    id: row.id as string,
    userId: row.user_id as string,
    action: row.action as AuditAction,
    resourceType: row.resource_type as string | null,
    resourceId: row.resource_id as string | null,
    ipAddress: row.ip_address as string | null,
    userAgent: row.user_agent as string | null,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json as string) : null,
    timestamp: row.timestamp as string,
  }));
}

/**
 * Get suspicious activity indicators
 */
export async function getSuspiciousActivity(userId: string, windowMinutes = 60): Promise<{
  rapidRequests: number;
  uniqueIps: number;
  failedAuths: number;
  isSuspicious: boolean;
}> {
  await ensureAuditTable();
  const client = getDb();
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  const result = await client.execute({
    sql: `
      SELECT 
        COUNT(*) as total_requests,
        COUNT(DISTINCT ip_address) as unique_ips,
        SUM(CASE WHEN action LIKE 'auth.%' AND metadata_json LIKE '%"success":false%' THEN 1 ELSE 0 END) as failed_auths
      FROM audit_logs
      WHERE user_id = ? AND timestamp > ?
    `,
    args: [userId, since],
  });

  const row = result.rows[0] as Record<string, unknown>;
  const rapidRequests = Number(row?.total_requests ?? 0);
  const uniqueIps = Number(row?.unique_ips ?? 0);
  const failedAuths = Number(row?.failed_auths ?? 0);

  // Suspicious if: >100 requests/hour, >5 unique IPs, or >3 failed auths
  const isSuspicious = rapidRequests > 100 || uniqueIps > 5 || failedAuths > 3;

  return { rapidRequests, uniqueIps, failedAuths, isSuspicious };
}

// =============================================================================
// Decision Ledger (memory write decisions)
// =============================================================================

export type DecisionLedgerEntry = {
  id: string;
  userId: string;
  timestamp: string;
  decision: string;
  reasonCode: string;
  policyCode: string | null;
  sourceType: string | null;
  memoryType: string | null;
  matchedRules: string[];
  qualityScore: number | null;
  sessionId: string | null;
  namespaceId: string | null;
  mcpRelated: boolean;
  textPreview: string;
  runtime: string | null;
  platform: string | null;
};

export type DecisionLedgerSummary = {
  entries: DecisionLedgerEntry[];
  totals: Record<string, number>;
  decisionTotals: Record<string, number>;
  mcpCount: number;
  directCount: number;
  window: { since: string; until: string };
};

/**
 * Query memory write decisions with filters for reason_code, MCP origin, and time window.
 */
export async function getDecisionLedger(params: {
  userId?: string;
  reasonCode?: string;
  mcpOnly?: boolean;
  since?: string;
  until?: string;
  limit?: number;
}): Promise<DecisionLedgerSummary> {
  await ensureAuditTable();
  const client = getDb();

  const conditions: string[] = ["action = 'memory.write_decision'"];
  const args: (string | number)[] = [];

  if (params.userId) {
    conditions.push("user_id = ?");
    args.push(params.userId);
  }

  const since = params.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  conditions.push("timestamp > ?");
  args.push(since);

  const until = params.until ?? new Date().toISOString();
  conditions.push("timestamp <= ?");
  args.push(until);

  if (params.reasonCode) {
    conditions.push("json_extract(metadata_json, '$.reason_code') = ?");
    args.push(params.reasonCode);
  }

  if (params.mcpOnly) {
    conditions.push("json_extract(metadata_json, '$.mcp_related') = 1");
  }

  const limit = params.limit ?? 200;
  const whereClause = conditions.join(" AND ");

  const result = await client.execute({
    sql: `SELECT * FROM audit_logs WHERE ${whereClause} ORDER BY timestamp DESC LIMIT ?`,
    args: [...args, limit],
  });

  const entries: DecisionLedgerEntry[] = result.rows.map((row) => {
    const meta = row.metadata_json ? JSON.parse(row.metadata_json as string) : {};
    const qualitySignals = (meta.quality_signals ?? {}) as Record<string, unknown>;
    return {
      id: row.id as string,
      userId: row.user_id as string,
      timestamp: row.timestamp as string,
      decision: (meta.decision as string | undefined) ?? "unknown",
      reasonCode: (meta.reason_code as string | undefined) ?? "unknown",
      policyCode: (meta.policy_code as string | undefined) ?? null,
      sourceType: (meta.source_type as string | undefined) ?? null,
      memoryType: (meta.memory_type as string | undefined) ?? null,
      matchedRules: Array.isArray(meta.matched_rules)
        ? (meta.matched_rules as unknown[]).filter((v): v is string => typeof v === "string")
        : [],
      qualityScore: typeof qualitySignals.score === "number" ? qualitySignals.score : null,
      sessionId: (meta.session_id as string | undefined) ?? null,
      namespaceId: (meta.namespace_id as string | undefined) ?? null,
      mcpRelated: Boolean(meta.mcp_related),
      textPreview: (meta.text_preview as string | undefined) ?? "",
      runtime: (meta.runtime as string | undefined) ?? null,
      platform: (meta.platform as string | undefined) ?? null,
    };
  });

  // Compute totals by reason_code and decision
  const totals: Record<string, number> = {};
  const decisionTotals: Record<string, number> = {};
  let mcpCount = 0;
  let directCount = 0;
  for (const entry of entries) {
    totals[entry.reasonCode] = (totals[entry.reasonCode] ?? 0) + 1;
    decisionTotals[entry.decision] = (decisionTotals[entry.decision] ?? 0) + 1;
    if (entry.mcpRelated) {
      mcpCount++;
    } else {
      directCount++;
    }
  }

  return { entries, totals, decisionTotals, mcpCount, directCount, window: { since, until } };
}

/**
 * Cleanup old audit logs (retention policy)
 * Default: 90 days for compliance
 */
export async function cleanupOldAuditLogs(retentionDays = 90): Promise<number> {
  await ensureAuditTable();
  const client = getDb();
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  const result = await client.execute({
    sql: `DELETE FROM audit_logs WHERE timestamp < ?`,
    args: [cutoff],
  });

  return result.rowsAffected ?? 0;
}
