import os from "node:os";
import path from "node:path";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type CognitiveDbModule = typeof import("../../../src/lib/cognitive-db");
type TursoModule = typeof import("../../../src/lib/turso");

describe("cognitive org governance", () => {
  const dbFile = path.join(os.tmpdir(), `fathippo-org-governance-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
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

  it("blocks org promotion and global contribution until org policy opts in", async () => {
    const authorId = "policy-author";
    const peerId = "policy-peer";
    const client = turso.getDb();

    await cognitiveDb.setCognitiveOrgMembership(authorId, "org-policy");
    await cognitiveDb.setCognitiveOrgMembership(peerId, "org-policy");
    await cognitiveDb.updateCognitiveUserSettings({
      userId: authorId,
      sharedLearningEnabled: true,
    });

    const blockedTrace = await cognitiveDb.createTrace({
      userId: authorId,
      sessionId: "blocked-global",
      type: "debugging",
      problem: "Shared auth regression in the internal repo",
      context: { technologies: ["nextjs", "clerk"] },
      reasoning: "This would have been shared before org policy blocked it.",
      approaches: [],
      solution: "Adjusted callback handling.",
      outcome: "success",
      automatedOutcome: "success",
      automatedSignals: { resolutionKind: "tests_passed" },
      toolsUsed: ["npm test"],
      filesModified: ["middleware.ts"],
      durationMs: 90_000,
      sanitized: true,
    });
    expect(blockedTrace.shareEligible).toBe(false);

    const localPattern = await cognitiveDb.createPattern({
      userId: authorId,
      scope: "local",
      domain: "nextjs-auth",
      trigger: {
        keywords: ["callback route", "redirect loop"],
        technologies: ["nextjs", "clerk"],
      },
      approach: "Exclude auth callback routes from the matcher.",
      steps: ["Inspect matcher", "Exclude callback routes", "Re-run tests"],
      pitfalls: ["Protecting the callback route itself"],
      confidence: 0.9,
      successCount: 5,
      failCount: 0,
      sourceTraceIds: ["trace-1", "trace-2", "trace-3"],
      sourceTraceCount: 5,
      status: "active_local",
    });
    await client.execute({
      sql: `
        UPDATE cognitive_patterns
        SET application_count = 4,
            accepted_application_count = 3,
            successful_application_count = 3,
            verification_pass_rate = 0.9,
            impact_score = 0.22
        WHERE id = ?
      `,
      args: [localPattern.id],
    });

    const blockedPromotion = await cognitiveDb.promoteEligiblePatternsToOrg(authorId);
    expect(blockedPromotion.promotedPatterns).toBe(0);
    expect((await cognitiveDb.getPatterns(peerId)).some((pattern) => pattern.sourcePatternId === localPattern.id)).toBe(false);

    await cognitiveDb.updateCognitiveOrgPolicy({
      orgId: "org-policy",
      orgPatternSharingEnabled: true,
      globalContributionEnabled: true,
    });

    const allowedTrace = await cognitiveDb.createTrace({
      userId: authorId,
      sessionId: "allowed-global",
      type: "debugging",
      problem: "Shared auth regression in the internal repo",
      context: { technologies: ["nextjs", "clerk"] },
      reasoning: "Now the org allows shared contribution.",
      approaches: [],
      solution: "Adjusted callback handling.",
      outcome: "success",
      automatedOutcome: "success",
      automatedSignals: { resolutionKind: "tests_passed" },
      toolsUsed: ["npm test"],
      filesModified: ["middleware.ts"],
      durationMs: 100_000,
      sanitized: true,
    });
    expect(allowedTrace.shareEligible).toBe(true);

    const promotion = await cognitiveDb.promoteEligiblePatternsToOrg(authorId);
    expect(promotion.promotedPatterns).toBe(1);
    expect((await cognitiveDb.getPatterns(peerId)).some((pattern) => pattern.sourcePatternId === localPattern.id)).toBe(true);
  });

  it("stores redacted provenance for shared patterns", async () => {
    const userId = "policy-provenance";
    const client = turso.getDb();

    await cognitiveDb.setCognitiveOrgMembership(userId, "org-provenance");
    await cognitiveDb.updateCognitiveOrgPolicy({
      orgId: "org-provenance",
      orgPatternSharingEnabled: true,
      globalContributionEnabled: true,
    });
    await cognitiveDb.updateCognitiveUserSettings({
      userId,
      sharedLearningEnabled: true,
    });

    for (const sessionId of ["prov-1", "prov-2", "prov-3"]) {
      await cognitiveDb.createTrace({
        userId,
        sessionId,
        type: "debugging",
        problem: "Build breaks after auth callback alias change",
        context: {
          technologies: ["nextjs", "typescript"],
          errorMessages: ["TypeError in /Users/internal/fathippo/app/auth/callback.tsx"],
        },
        reasoning: "Fix the callback alias after the build failure.",
        approaches: [],
        solution: "Restore alias and rerun tests.",
        outcome: "success",
        automatedOutcome: "success",
        automatedSignals: { resolutionKind: "tests_passed" },
        toolsUsed: ["npm test"],
        filesModified: ["app/auth/callback.tsx"],
        durationMs: 100_000,
        sanitized: true,
      });
    }

    const localPattern = await cognitiveDb.createPattern({
      userId,
      scope: "local",
      domain: "nextjs-auth",
      trigger: {
        keywords: ["callback.tsx", "alice@company.com", "https://internal.example/repo"],
        technologies: ["nextjs", "typescript"],
        errorPatterns: ["/Users/internal/fathippo/app/auth/callback.tsx", "sk-live-abcdef1234567890"],
      },
      approach: "Inspect /Users/internal/fathippo/app/auth/callback.tsx and rotate sk-live-abcdef1234567890 before reopening https://internal.example/repo.",
      steps: [
        "Open /Users/internal/fathippo/app/auth/callback.tsx",
        "Email alice@company.com about the fix",
      ],
      pitfalls: ["Do not paste sk-live-abcdef1234567890 into the repo."],
      confidence: 0.93,
      successCount: 6,
      failCount: 0,
      sourceTraceIds: ["trace-p1", "trace-p2", "trace-p3"],
      sourceTraceCount: 6,
      status: "active_local",
    });
    await client.execute({
      sql: `
        UPDATE cognitive_patterns
        SET application_count = 5,
            accepted_application_count = 4,
            successful_application_count = 4,
            verification_pass_rate = 0.91,
            impact_score = 0.24
        WHERE id = ?
      `,
      args: [localPattern.id],
    });

    await cognitiveDb.promoteEligiblePatternsToOrg(userId);
    const orgPattern = (await cognitiveDb.getOrgPromotedPatterns("org-provenance"))[0];
    expect(orgPattern).toBeTruthy();
    const orgProvenance = JSON.parse(orgPattern.provenanceJson) as Record<string, unknown>;
    expect(orgProvenance.kind).toBe("org_promoted_pattern");
    expect(orgProvenance.redacted).toBe(true);
    expect(orgPattern.approach).not.toContain("alice@company.com");
    expect(orgPattern.approach).not.toContain("https://internal.example/repo");
    expect(orgPattern.approach).not.toContain("/Users/internal");
    expect(orgPattern.approach).not.toContain("sk-live-abcdef1234567890");
    expect(orgPattern.stepsJson).toContain("[path]");
    expect(orgPattern.stepsJson).toContain("[email]");
    expect(orgPattern.pitfallsJson).toContain("[secret]");

    const extraction = await cognitiveDb.runPatternExtraction({
      userId,
      includeGlobal: true,
    });
    expect(extraction.globalPatterns).toBeGreaterThan(0);
    const visiblePatterns = await cognitiveDb.getPatterns(userId);
    const globalPattern = visiblePatterns.find((pattern) => pattern.scope === "global");
    expect(globalPattern).toBeTruthy();
    const globalProvenance = JSON.parse(globalPattern!.provenanceJson) as Record<string, unknown>;
    expect(globalProvenance.kind).toBe("shared_global_extraction");
    expect(globalProvenance.redacted).toBe(true);
    expect(globalProvenance.sourceTraceIds).toEqual([]);
  });
});
