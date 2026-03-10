import os from "node:os";
import path from "node:path";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type CognitiveDbModule = typeof import("../../../src/lib/cognitive-db");
type TursoModule = typeof import("../../../src/lib/turso");

describe("cognitive privacy controls", () => {
  const dbFile = path.join(os.tmpdir(), `fathippo-cognitive-privacy-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
  let cognitiveDb: CognitiveDbModule;
  let turso: TursoModule;

  beforeAll(async () => {
    process.env.TURSO_DATABASE_URL = `file:${dbFile}`;
    delete process.env.TURSO_AUTH_TOKEN;
    vi.resetModules();
    cognitiveDb = await import("../../../src/lib/cognitive-db");
    turso = await import("../../../src/lib/turso");
  });

  afterAll(() => {
    turso.closeDb();
    rmSync(dbFile, { force: true });
  });

  it("exports data, revokes shared learning, and deletes cognitive data", async () => {
    const userId = "user-privacy";
    const initial = await cognitiveDb.getCognitiveUserSettings(userId);
    expect(initial.sharedLearningEnabled).toBe(false);
    expect(initial.benchmarkInclusionEnabled).toBe(false);
    expect(initial.traceRetentionDays).toBe(30);

    const updated = await cognitiveDb.updateCognitiveUserSettings({
      userId,
      sharedLearningEnabled: true,
      benchmarkInclusionEnabled: true,
      traceRetentionDays: 60,
    });
    expect(updated.sharedLearningEnabled).toBe(true);
    expect(updated.benchmarkInclusionEnabled).toBe(true);
    expect(updated.traceRetentionDays).toBe(60);

    const trace = await cognitiveDb.createTrace({
      userId,
      sessionId: "sess-privacy",
      type: "debugging",
      problem: "Build fails because of a Clerk middleware mismatch",
      context: {
        technologies: ["nextjs", "clerk", "typescript"],
        files: ["middleware.ts"],
      },
      reasoning: "Investigated middleware config and auth matcher.",
      approaches: [{ description: "Adjusted matcher", result: "worked" }],
      solution: "Updated middleware matcher to exclude static assets.",
      outcome: "success",
      automatedSignals: { resolutionKind: "tests_passed" },
      toolsUsed: ["bash"],
      filesModified: ["middleware.ts"],
      durationMs: 42000,
      sanitized: true,
    });
    expect(trace.shareEligible).toBe(true);
    expect(trace.sharedSignature).toBeNull();

    await cognitiveDb.recordBenchmarkRun({
      userId,
      dataset: "generated",
      fixtureCount: 1,
      result: { traceMrr: 1, successRate: 1 },
      gate: { passed: true, reasons: [] },
    });

    const exported = await cognitiveDb.exportCognitiveUserData(userId);
    expect(exported.traces).toHaveLength(1);
    expect(exported.benchmarkRuns).toHaveLength(1);
    expect(exported.settings.sharedLearningEnabled).toBe(true);
    expect(exported.settings.benchmarkInclusionEnabled).toBe(true);

    const revoked = await cognitiveDb.updateCognitiveUserSettings({
      userId,
      sharedLearningEnabled: false,
      benchmarkInclusionEnabled: false,
    });
    expect(revoked.sharedLearningEnabled).toBe(false);
    expect(revoked.benchmarkInclusionEnabled).toBe(false);

    const storedTrace = await cognitiveDb.getTraceById(trace.id, userId);
    expect(storedTrace?.shareEligible).toBe(false);
    expect(storedTrace?.sharedSignature).toBeNull();
    expect((await cognitiveDb.getRecentBenchmarkRuns(userId, 10))).toHaveLength(0);

    const deleted = await cognitiveDb.deleteCognitiveUserData(userId);
    expect(deleted.tracesDeleted).toBe(1);
    expect(deleted.benchmarkRunsDeleted).toBe(0);

    const afterDelete = await cognitiveDb.exportCognitiveUserData(userId);
    expect(afterDelete.traces).toHaveLength(0);
    expect(afterDelete.applications).toHaveLength(0);
    expect(afterDelete.patterns).toHaveLength(0);
    expect(afterDelete.skills).toHaveLength(0);
    expect(afterDelete.benchmarkRuns).toHaveLength(0);
    expect(afterDelete.settings.sharedLearningEnabled).toBe(false);
    expect(afterDelete.settings.benchmarkInclusionEnabled).toBe(false);
    expect(afterDelete.settings.traceRetentionDays).toBe(30);
  });

  it("cleans up expired traces, benchmarks, and orphaned local artifacts", async () => {
    const userId = "user-retention";
    await cognitiveDb.updateCognitiveUserSettings({
      userId,
      sharedLearningEnabled: false,
      benchmarkInclusionEnabled: true,
      traceRetentionDays: 30,
    });

    const trace = await cognitiveDb.createTrace({
      userId,
      sessionId: "sess-retention",
      type: "debugging",
      problem: "Qdrant collection mismatch causes retrieval failure",
      context: {
        technologies: ["qdrant", "nextjs"],
        files: ["src/lib/qdrant.ts"],
      },
      reasoning: "Matched collection name and index bootstrap flow.",
      approaches: [{ description: "Aligned collection naming", result: "worked" }],
      solution: "Use a single collection name across setup and query paths.",
      outcome: "success",
      toolsUsed: ["bash"],
      filesModified: ["src/lib/qdrant.ts"],
      durationMs: 18000,
      sanitized: true,
    });

    const pattern = await cognitiveDb.createPattern({
      userId,
      scope: "local",
      domain: "qdrant",
      trigger: {
        keywords: ["qdrant", "collection"],
        technologies: ["qdrant"],
      },
      approach: "Keep collection naming consistent between initialization and query code.",
      steps: ["Check configured collection names", "Verify bootstrap path"],
      pitfalls: ["Creating multiple collections with inconsistent names"],
      confidence: 0.92,
      successCount: 6,
      failCount: 0,
      sourceTraceIds: [trace.id],
      status: "active_local",
    });
    const skills = await cognitiveDb.synthesizeEligibleSkills({ userId });
    expect(skills.length).toBeGreaterThan(0);

    await cognitiveDb.recordBenchmarkRun({
      userId,
      dataset: "generated",
      fixtureCount: 2,
      result: { traceMrr: 0.9, successRate: 1 },
      gate: { passed: true, reasons: [] },
    });

    const client = turso.getDb();
    const oldIso = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const oldBenchIso = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
    await client.execute({
      sql: `
        UPDATE coding_traces
        SET created_at = ?, updated_at = ?, timestamp = ?
        WHERE id = ?
      `,
      args: [oldIso, oldIso, oldIso, trace.id],
    });
    await client.execute({
      sql: `
        UPDATE cognitive_benchmark_runs
        SET created_at = ?
        WHERE user_id = ?
      `,
      args: [oldBenchIso, userId],
    });

    const cleanup = await cognitiveDb.cleanupExpiredCognitiveData({
      userId,
      benchmarkRetentionDays: 90,
    });
    expect(cleanup.tracesDeleted).toBe(1);
    expect(cleanup.benchmarkRunsDeleted).toBe(1);
    expect(cleanup.localPatternsDeleted).toBeGreaterThanOrEqual(1);
    expect(cleanup.localSkillsDeleted).toBeGreaterThanOrEqual(1);

    const exported = await cognitiveDb.exportCognitiveUserData(userId);
    expect(exported.traces).toHaveLength(0);
    expect(exported.patterns.find((entry) => entry.id === pattern.id)).toBeUndefined();
    expect(exported.skills).toHaveLength(0);
    expect(exported.benchmarkRuns).toHaveLength(0);
  });
});
