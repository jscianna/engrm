import os from "node:os";
import path from "node:path";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildAdaptivePolicyFeatures, buildAdaptivePolicyContextKey } from "../../../src/lib/cognitive-learning";

type CognitiveDbModule = typeof import("../../../src/lib/cognitive-db");
type TursoModule = typeof import("../../../src/lib/turso");

describe("adaptive policy end-to-end", () => {
  const dbFile = path.join(os.tmpdir(), `fathippo-policy-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
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

  it("learns a private per-user retrieval policy from successful outcomes", async () => {
    const userId = "policy-user";
    const features = buildAdaptivePolicyFeatures({
      problem: "Fix the failing Next.js build and get tests passing again",
      endpoint: "context-engine.assemble",
      technologies: ["nextjs", "typescript", "vitest"],
      repoProfile: {
        workspaceRoot: "/workspace/apps/web",
        workspaceType: "web-app",
        projectType: "nextjs",
      },
    });
    const contextKey = buildAdaptivePolicyContextKey(features);

    for (let index = 0; index < 3; index += 1) {
      const application = await cognitiveDb.logCognitiveApplication({
        userId,
        sessionId: `policy-session-${index}`,
        problem: "Fix the failing Next.js build and get tests passing again",
        endpoint: "context-engine.assemble",
        repoProfile: {
          workspaceRoot: "/workspace/apps/web",
          workspaceType: "web-app",
          projectType: "nextjs",
          languages: ["typescript"],
        },
        policy: {
          key: "trace_first",
          contextKey,
          rationale: "test_seed",
          exploration: false,
          score: 0.7,
          traceLimit: 5,
          patternLimit: 4,
          skillLimit: 2,
          sectionOrder: ["traces", "local_patterns", "global_patterns", "skills"],
          features,
        },
        traces: [{ id: `trace-${index}`, scope: "local", rank: 1 }],
        patterns: [{ id: "pattern-build-fix", scope: "local", rank: 1 }],
        skills: [],
      });

      await cognitiveDb.updateApplicationOutcome({
        userId,
        applicationId: application.application.id,
        acceptedPatternId: "pattern-build-fix",
        finalOutcome: "success",
        retryCount: 1,
        timeToResolutionMs: 120_000 + index * 15_000,
        verificationSummary: {
          verified: true,
          resolutionKind: "tests_passed",
          passedChecks: ["npm test"],
        },
      });
    }

    const summaries = await cognitiveDb.getAdaptivePolicySummaries(userId);
    const learned = summaries.find((policy) => policy.policyKey === "trace_first");

    expect(learned).toBeDefined();
    expect(learned?.sampleCount).toBe(3);
    expect(learned?.resolvedCount).toBe(3);
    expect(learned?.successCount).toBe(3);
    expect(learned?.verifiedSuccessCount).toBe(3);
    expect(learned?.avgReward).toBeGreaterThan(0.5);

    const recommendation = await cognitiveDb.recommendAdaptivePolicyForUser({
      userId,
      problem: "Fix the failing Next.js build and get tests passing again",
      endpoint: "context-engine.assemble",
      technologies: ["nextjs", "typescript", "vitest"],
      repoProfile: {
        workspaceRoot: "/workspace/apps/web",
        workspaceType: "web-app",
        projectType: "nextjs",
      },
      baseTraceLimit: 3,
    });

    expect(recommendation.exploration).toBe(false);
    expect(recommendation.key).toBe("trace_first");
    expect(recommendation.contextKey).toBe(contextKey);
  });
});
