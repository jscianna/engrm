import os from "node:os";
import path from "node:path";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type CognitiveDbModule = typeof import("../../../src/lib/cognitive-db");
type TursoModule = typeof import("../../../src/lib/turso");

describe("tool workflow strategy end-to-end", () => {
  const dbFile = path.join(os.tmpdir(), `fathippo-workflow-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
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

  it("learns workflow hints only when the captured tool sequence matches the recommended workflow", async () => {
    const userId = "workflow-user";

    const application = await cognitiveDb.logCognitiveApplication({
      userId,
      sessionId: "workflow-session-1",
      problem: "Fix the Clerk auth redirect loop in Next.js middleware config",
      endpoint: "context-engine.assemble",
      repoProfile: {
        workspaceRoot: "/workspace/apps/web",
        workspaceType: "web-app",
        projectType: "nextjs",
        languages: ["typescript"],
      },
      workflow: {
        key: "inspect_config_first",
        contextKey: "workflow:context",
        rationale: "seed",
        exploration: false,
        score: 0.6,
        title: "Inspect config first",
        steps: ["Check middleware matcher first", "Verify config", "Run tests"],
      },
      traces: [],
      patterns: [],
      skills: [],
    });

    const trace = await cognitiveDb.createTrace({
      userId,
      sessionId: "workflow-session-1",
      type: "debugging",
      problem: "Fix the Clerk auth redirect loop in Next.js middleware config",
      context: {
        technologies: ["nextjs", "clerk", "typescript"],
        files: ["middleware.ts", "auth.ts"],
        errorMessages: ["ERR_TOO_MANY_REDIRECTS"],
        repoSignals: {
          filesModified: ["middleware.ts", "auth.ts"],
          languages: ["typescript"],
          diffSummary: "2 files modified across typescript",
        },
      },
      reasoning: "Inspected middleware config before rerunning tests.",
      approaches: [],
      solution: "Exclude callback routes from the middleware matcher.",
      outcome: "success",
      automatedOutcome: "success",
      automatedSignals: {
        toolCalls: [
          { toolName: "shell", category: "search", command: "rg middleware.ts auth.ts" },
          { toolName: "shell", category: "edit", command: "edit middleware.ts" },
          { toolName: "shell", category: "test", command: "npm test -- middleware" },
        ],
        toolResults: [
          { toolName: "shell", category: "test", command: "npm test -- middleware", success: true },
        ],
        resolutionKind: "tests_passed",
      },
      toolsUsed: ["shell"],
      filesModified: ["middleware.ts", "auth.ts"],
      durationMs: 180_000,
      sanitized: true,
      shareEligible: false,
      applicationId: application.application.id,
    });

    const updated = await cognitiveDb.updateApplicationOutcome({
      userId,
      applicationId: application.application.id,
      traceId: trace.id,
      finalOutcome: "success",
      retryCount: 1,
      timeToResolutionMs: 180_000,
      verificationSummary: {
        verified: true,
        resolutionKind: "tests_passed",
        passedChecks: ["npm test -- middleware"],
      },
    });

    expect(updated?.workflowObservedKey).toBe("inspect_config_first");
    expect(updated?.workflowReward).toBeGreaterThan(0.3);

    const summaries = await cognitiveDb.getToolWorkflowSummaries(userId);
    expect(summaries.find((summary) => summary.strategyKey === "inspect_config_first")?.avgReward).toBeGreaterThan(0.3);

    const recommendation = await cognitiveDb.recommendToolWorkflowForUser({
      userId,
      problem: "Fix the Clerk auth redirect loop in Next.js middleware config",
      endpoint: "context-engine.assemble",
      technologies: ["nextjs", "clerk", "typescript"],
      repoProfile: {
        workspaceRoot: "/workspace/apps/web",
        workspaceType: "web-app",
        projectType: "nextjs",
      },
    });

    expect(recommendation.key).toBe("inspect_config_first");
    expect(recommendation.exploration).toBe(false);
  });
});
