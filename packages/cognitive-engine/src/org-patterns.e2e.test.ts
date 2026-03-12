import os from "node:os";
import path from "node:path";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type CognitiveDbModule = typeof import("../../../src/lib/cognitive-db");
type TursoModule = typeof import("../../../src/lib/turso");

describe("org-scoped cognition patterns", () => {
  const dbFile = path.join(os.tmpdir(), `fathippo-org-patterns-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
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

  it("promotes only validated local patterns into the same org", async () => {
    const authorId = "org-author";
    const peerId = "org-peer";
    const outsiderId = "other-org-user";
    const client = turso.getDb();

    await cognitiveDb.setCognitiveOrgMembership(authorId, "org-alpha");
    await cognitiveDb.setCognitiveOrgMembership(peerId, "org-alpha");
    await cognitiveDb.setCognitiveOrgMembership(outsiderId, "org-beta");
    await cognitiveDb.updateCognitiveOrgPolicy({
      orgId: "org-alpha",
      orgPatternSharingEnabled: true,
    });

    const promotedSource = await cognitiveDb.createPattern({
      userId: authorId,
      scope: "local",
      domain: "nextjs-auth",
      trigger: {
        keywords: ["middleware", "redirect loop"],
        technologies: ["nextjs", "clerk"],
        errorPatterns: ["auth loop"],
      },
      approach: "Exclude auth callback routes from the middleware matcher and re-run auth smoke tests.",
      steps: ["Inspect matcher", "Exclude auth callback routes", "Re-run auth smoke tests"],
      pitfalls: ["Protecting the callback route itself"],
      confidence: 0.91,
      successCount: 6,
      failCount: 0,
      sourceTraceIds: ["trace-a", "trace-b", "trace-c"],
      sourceTraceCount: 6,
      status: "active_local",
    });

    const notReadySource = await cognitiveDb.createPattern({
      userId: authorId,
      scope: "local",
      domain: "nextjs-auth",
      trigger: {
        keywords: ["middleware", "redirect loop"],
        technologies: ["nextjs", "clerk"],
      },
      approach: "A weaker pattern that should stay local.",
      steps: ["Try something"],
      pitfalls: ["Not enough validation"],
      confidence: 0.78,
      successCount: 2,
      failCount: 1,
      sourceTraceIds: ["trace-d"],
      sourceTraceCount: 1,
      status: "active_local",
    });

    await client.execute({
      sql: `
        UPDATE cognitive_patterns
        SET application_count = 4,
            accepted_application_count = 3,
            successful_application_count = 3,
            verification_pass_rate = 0.9,
            impact_score = 0.28,
            promotion_reason = 'verified_outcomes_above_baseline'
        WHERE id = ?
      `,
      args: [promotedSource.id],
    });
    await client.execute({
      sql: `
        UPDATE cognitive_patterns
        SET application_count = 4,
            accepted_application_count = 1,
            successful_application_count = 1,
            verification_pass_rate = 0.4,
            impact_score = 0.02,
            promotion_reason = 'shown_but_not_accepted'
        WHERE id = ?
      `,
      args: [notReadySource.id],
    });

    const promotion = await cognitiveDb.promoteEligiblePatternsToOrg(authorId);
    expect(promotion.orgId).toBe("org-alpha");
    expect(promotion.promotedPatterns).toBe(1);

    const promoted = await cognitiveDb.getOrgPromotedPatterns("org-alpha");
    expect(promoted).toHaveLength(1);
    expect(promoted[0]?.scope).toBe("org");
    expect(promoted[0]?.orgId).toBe("org-alpha");
    expect(promoted[0]?.sourcePatternId).toBe(promotedSource.id);
    expect(promoted[0]?.status).toBe("active_org");
    expect(promoted[0]?.sourceTraceIdsJson).toBe("[]");

    const peerPatterns = await cognitiveDb.getPatterns(peerId);
    expect(peerPatterns.some((pattern) => pattern.id === promoted[0]?.id)).toBe(true);

    const outsiderPatterns = await cognitiveDb.getPatterns(outsiderId);
    expect(outsiderPatterns.some((pattern) => pattern.id === promoted[0]?.id)).toBe(false);
  });

  it("rolls back an org-promoted pattern cleanly", async () => {
    const authorId = "org-author-rollback";
    const peerId = "org-peer-rollback";
    const client = turso.getDb();

    await cognitiveDb.setCognitiveOrgMembership(authorId, "org-rollback");
    await cognitiveDb.setCognitiveOrgMembership(peerId, "org-rollback");
    await cognitiveDb.updateCognitiveOrgPolicy({
      orgId: "org-rollback",
      orgPatternSharingEnabled: true,
    });

    const localPattern = await cognitiveDb.createPattern({
      userId: authorId,
      scope: "local",
      domain: "build-config",
      trigger: {
        keywords: ["vite", "missing alias"],
        technologies: ["vite", "typescript"],
        errorPatterns: ["module-resolution"],
      },
      approach: "Restore the missing alias mapping in Vite config and rerun the build.",
      steps: ["Inspect vite config", "Restore alias", "Re-run build"],
      pitfalls: ["Fixing tsconfig paths without Vite alias"],
      confidence: 0.94,
      successCount: 8,
      failCount: 0,
      sourceTraceIds: ["trace-r1", "trace-r2", "trace-r3"],
      sourceTraceCount: 8,
      status: "active_local",
    });
    await client.execute({
      sql: `
        UPDATE cognitive_patterns
        SET application_count = 5,
            accepted_application_count = 4,
            successful_application_count = 4,
            verification_pass_rate = 0.92,
            impact_score = 0.31,
            promotion_reason = 'verified_outcomes_above_baseline'
        WHERE id = ?
      `,
      args: [localPattern.id],
    });

    await cognitiveDb.promoteEligiblePatternsToOrg(authorId);
    const promoted = (await cognitiveDb.getOrgPromotedPatterns("org-rollback"))[0];
    expect(promoted).toBeTruthy();

    const beforeRollback = await cognitiveDb.getMatchingPatterns({
      userId: peerId,
      problem: "Vite build fails because the alias is missing during module resolution",
      technologies: ["vite", "typescript"],
      limit: 5,
    });
    expect(beforeRollback.some((pattern) => pattern.id === promoted.id)).toBe(true);

    const rolledBack = await cognitiveDb.rollbackOrgPromotedPattern({
      orgId: "org-rollback",
      patternId: promoted.id,
      reason: "false positive transfer",
    });
    expect(rolledBack?.status).toBe("deprecated");
    expect(rolledBack?.promotionReason).toContain("org_rollback");

    const afterRollback = await cognitiveDb.getMatchingPatterns({
      userId: peerId,
      problem: "Vite build fails because the alias is missing during module resolution",
      technologies: ["vite", "typescript"],
      limit: 5,
    });
    expect(afterRollback.some((pattern) => pattern.id === promoted.id)).toBe(false);
  });
});
