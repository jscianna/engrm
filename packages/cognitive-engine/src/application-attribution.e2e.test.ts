import os from "node:os";
import path from "node:path";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { evaluateRetrievalFixtures } from "./eval/harness.js";

type CognitiveDbModule = typeof import("../../../src/lib/cognitive-db");
type TursoModule = typeof import("../../../src/lib/turso");

describe("application attribution end-to-end", () => {
  const dbFile = path.join(os.tmpdir(), `fathippo-cognitive-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
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

  it("links relevant retrieval, accepted feedback, and generated eval fixtures", async () => {
    const userId = "user-e2e";
    const sessionId = "session-e2e";

    const historicalTrace = await cognitiveDb.createTrace({
      userId,
      sessionId: "historical-session",
      type: "debugging",
      problem: "Fix Next.js auth middleware redirect loop",
      context: {
        technologies: ["nextjs", "clerk"],
        files: ["middleware.ts"],
        errorMessages: ["ERR_TOO_MANY_REDIRECTS"],
      },
      reasoning: "Previous successful fix for the auth redirect loop.",
      approaches: [],
      solution: "Exclude public auth routes from the middleware matcher.",
      outcome: "success",
      automatedOutcome: "success",
      automatedSignals: { strongestSuccessSignal: "tests passed" },
      toolsUsed: ["rg", "npm test"],
      filesModified: ["middleware.ts"],
      durationMs: 180000,
      sanitized: true,
      shareEligible: true,
    });

    const localPattern = await cognitiveDb.createPattern({
      userId,
      scope: "local",
      domain: "nextjs-auth",
      trigger: {
        keywords: ["redirect loop", "middleware", "clerk"],
        technologies: ["nextjs", "clerk"],
      },
      approach: "Audit the middleware matcher and exempt auth callback routes.",
      steps: ["Inspect matcher", "Exclude public routes", "Re-run middleware tests"],
      pitfalls: ["Do not guard the auth callback itself"],
      confidence: 0.92,
      successCount: 6,
      failCount: 1,
      sourceTraceIds: [historicalTrace.id],
      status: "active_local",
    });

    const application = await cognitiveDb.logCognitiveApplication({
      userId,
      sessionId,
      problem: "Fix Next.js auth middleware redirect loop",
      endpoint: "context-engine.assemble",
      traces: [{ id: historicalTrace.id, scope: "local", rank: 1 }],
      patterns: [{ id: localPattern.id, scope: "local", rank: 1 }],
      skills: [{ id: "skill-auth-loop", scope: "local", rank: 1 }],
    });

    const currentTrace = await cognitiveDb.createTrace({
      userId,
      sessionId,
      type: "debugging",
      problem: "Fix Next.js auth middleware redirect loop",
      context: {
        technologies: ["nextjs", "clerk"],
        files: ["middleware.ts", "auth.ts"],
        errorMessages: ["ERR_TOO_MANY_REDIRECTS"],
      },
      reasoning: "Compared the current middleware to the known redirect-loop failure mode.",
      approaches: [],
      solution: "Adjusted the matcher and verified the login callback stays public.",
      outcome: "success",
      automatedOutcome: "success",
      automatedSignals: { strongestSuccessSignal: "tests passed", commandSignals: { test: { success: 1, failure: 0 } } },
      toolsUsed: ["rg", "npm test"],
      filesModified: ["middleware.ts", "auth.ts"],
      durationMs: 240000,
      sanitized: true,
      shareEligible: true,
      applicationId: application.application.id,
    });

    await cognitiveDb.syncTracePatternMatches({
      userId,
      traceId: currentTrace.id,
      patterns: [{ id: localPattern.id, score: 0.97 }],
      matchSource: "trace_capture",
    });

    const updatedTrace = await cognitiveDb.updateTraceOutcome({
      userId,
      traceId: currentTrace.id,
      outcome: "success",
      applicationId: application.application.id,
      acceptedTraceId: historicalTrace.id,
      acceptedPatternId: localPattern.id,
      acceptedSkillId: "skill-auth-loop",
      timeToResolutionMs: 240000,
      verificationSummary: {
        testsPassed: ["middleware.spec.ts"],
        notes: "Redirect loop resolved",
      },
    });

    expect(updatedTrace?.outcome).toBe("success");

    const applications = await cognitiveDb.getRecentApplications(userId, 5);
    expect(applications).toHaveLength(1);
    const bundle = applications[0];
    expect(bundle.application.id).toBe(application.application.id);
    expect(bundle.application.traceId).toBe(currentTrace.id);
    expect(bundle.application.acceptedTraceId).toBe(historicalTrace.id);
    expect(bundle.application.acceptedPatternId).toBe(localPattern.id);
    expect(bundle.application.acceptedSkillId).toBe("skill-auth-loop");
    expect(bundle.application.finalOutcome).toBe("success");

    const acceptedTraceMatch = bundle.matches.find((match) => match.entityType === "trace" && match.entityId === historicalTrace.id);
    const acceptedPatternMatch = bundle.matches.find((match) => match.entityType === "pattern" && match.entityId === localPattern.id);
    const acceptedSkillMatch = bundle.matches.find((match) => match.entityType === "skill" && match.entityId === "skill-auth-loop");
    expect(acceptedTraceMatch?.accepted).toBe(true);
    expect(acceptedPatternMatch?.accepted).toBe(true);
    expect(acceptedSkillMatch?.accepted).toBe(true);
    expect(acceptedPatternMatch?.finalOutcome).toBe("success");

    const tracePatternMatches = await cognitiveDb.getTracePatternMatches(currentTrace.id);
    const explicitPatternFeedback = tracePatternMatches.find((match) => match.patternId === localPattern.id);
    expect(explicitPatternFeedback?.explicitOutcome).toBe("success");

    const dataset = await cognitiveDb.generateRetrievalEvalDataset({
      userId,
      limit: 10,
      acceptedOnly: true,
    });

    expect(dataset.records).toHaveLength(1);
    expect(dataset.fixtures[0]).toMatchObject({
      applicationId: application.application.id,
      sessionId,
      endpoint: "context-engine.assemble",
      expectedTraceIds: [historicalTrace.id],
      expectedPatternIds: [localPattern.id],
      expectedSkillIds: ["skill-auth-loop"],
      acceptedId: historicalTrace.id,
    });
    expect(dataset.predictions[0]).toMatchObject({
      applicationId: application.application.id,
      sessionId,
      traces: [{ id: historicalTrace.id }],
      patterns: [{ id: localPattern.id }],
      skills: [{ id: "skill-auth-loop" }],
      finalOutcome: "success",
      acceptedTraceId: historicalTrace.id,
      acceptedPatternId: localPattern.id,
      acceptedSkillId: "skill-auth-loop",
    });

    const result = evaluateRetrievalFixtures(dataset);
    expect(result.cases).toBe(1);
    expect(result.traceMrr).toBe(1);
    expect(result.patternRecallAtK).toBe(1);
    expect(result.skillHitRate).toBe(1);
    expect(result.weakOutcomeLift).toBe(1);
  });
});
