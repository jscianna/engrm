import os from "node:os";
import path from "node:path";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type DbModule = typeof import("../../../src/lib/db");
type TursoModule = typeof import("../../../src/lib/turso");
type AlertsModule = typeof import("../../../src/lib/operational-alerts");
type AuditModule = typeof import("../../../src/lib/audit-log");
type CognitiveDbModule = typeof import("../../../src/lib/cognitive-db");

describe("operational hardening", () => {
  const dbFile = path.join(os.tmpdir(), `fathippo-operational-hardening-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
  let db: DbModule;
  let turso: TursoModule;
  let alerts: AlertsModule;
  let audit: AuditModule;
  let cognitiveDb: CognitiveDbModule;

  beforeAll(async () => {
    process.env.TURSO_DATABASE_URL = `file:${dbFile}`;
    delete process.env.TURSO_AUTH_TOKEN;
    vi.resetModules();
    db = await import("../../../src/lib/db");
    turso = await import("../../../src/lib/turso");
    alerts = await import("../../../src/lib/operational-alerts");
    audit = await import("../../../src/lib/audit-log");
    cognitiveDb = await import("../../../src/lib/cognitive-db");
  });

  afterAll(() => {
    turso.closeDb();
    rmSync(dbFile, { force: true });
  });

  it("reports and backfills legacy api key scopes", async () => {
    const { agentId } = await db.createApiKey("user-migration", "Legacy-ish key", ["memories.list"]);
    const client = turso.getDb();
    await client.execute({
      sql: `UPDATE api_keys SET scopes_json = '' WHERE agent_id = ?`,
      args: [agentId],
    });

    const before = await db.getApiKeyScopeMigrationStatus({ userId: "user-migration" });
    expect(before.totalKeys).toBe(1);
    expect(before.legacyKeysMissingScopes).toBe(1);
    expect(before.revocableWildcardKeys).toBe(1);

    const dryRun = await db.backfillApiKeyScopes({
      userId: "user-migration",
      scopes: ["memories.list", "search"],
      dryRun: true,
    });
    expect(dryRun.candidates).toBe(1);
    expect(dryRun.updated).toBe(0);

    const applied = await db.backfillApiKeyScopes({
      userId: "user-migration",
      scopes: ["memories.list", "search"],
      dryRun: false,
    });
    expect(applied.updated).toBe(1);

    const after = await db.getApiKeyScopeMigrationStatus({ userId: "user-migration" });
    expect(after.legacyKeysMissingScopes).toBe(0);
    expect(after.wildcardKeys).toBe(0);
    expect(after.scopedKeys).toBe(1);
  });

  it("surfaces stale jobs, failed benchmarks, suspicious activity, and wildcard keys as alerts", async () => {
    const { agentId } = await db.createApiKey("user-alerts", "Wildcard key", ["memories.list"]);
    await cognitiveDb.getCognitiveJobHealth();
    const client = turso.getDb();
    await client.execute({
      sql: `UPDATE api_keys SET scopes_json = '["*"]' WHERE agent_id = ?`,
      args: [agentId],
    });
    const staleAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    await client.execute({
      sql: `
        INSERT INTO cognitive_jobs (job_name, lease_token, lease_expires_at, last_run_at, last_success_at, checkpoint_json, updated_at)
        VALUES (?, NULL, NULL, ?, ?, NULL, ?)
      `,
      args: ["cognitive-pattern-extraction:user-alerts", staleAt, staleAt, staleAt],
    });
    await client.execute({
      sql: `
        INSERT INTO cognitive_benchmark_runs (id, user_id, dataset, fixture_count, result_json, gate_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        "bench-failed",
        "user-alerts",
        "curated",
        3,
        JSON.stringify({ traceMrr: 0.2 }),
        JSON.stringify({ passed: false, reasons: ["trace_mrr_below_min"] }),
        new Date().toISOString(),
      ],
    });
    await audit.logAuditEvent({
      userId: "user-alerts",
      action: "auth.login",
      metadata: { success: false },
    });
    const recent = new Date().toISOString();
    for (let index = 0; index < 110; index += 1) {
      await client.execute({
        sql: `
          INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, ip_address, user_agent, metadata_json, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          `audit-${index}`,
          "user-alerts",
          "auth.login",
          "auth",
          "login",
          `10.0.0.${index % 10}`,
          "vitest",
          JSON.stringify({ success: false }),
          recent,
        ],
      });
    }

    const summary = await alerts.getOperationalAlertsSummary();
    const ids = summary.alerts.map((alert) => alert.id);
    expect(ids).toContain("wildcard_api_keys");
    expect(ids).toContain("stale_cognitive_jobs");
    expect(ids).toContain("failed_benchmark_runs");
    expect(ids).toContain("suspicious_activity");
  });
});
