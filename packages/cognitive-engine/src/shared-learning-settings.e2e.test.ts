import os from "node:os";
import path from "node:path";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type CognitiveDbModule = typeof import("../../../src/lib/cognitive-db");
type TursoModule = typeof import("../../../src/lib/turso");

describe("shared learning settings", () => {
  const dbFile = path.join(os.tmpdir(), `fathippo-cognitive-settings-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
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

  it("defaults shared learning off and only marks traces share-eligible after opt-in", async () => {
    const userId = "user-settings";

    const initial = await cognitiveDb.getCognitiveUserSettings(userId);
    expect(initial.sharedLearningEnabled).toBe(false);

    const privateTrace = await cognitiveDb.createTrace({
      userId,
      sessionId: "settings-private",
      type: "debugging",
      problem: "Fix an internal build break",
      context: { technologies: ["typescript"] },
      reasoning: "Private trace before opting in.",
      approaches: [],
      solution: "Updated tsconfig.",
      outcome: "success",
      automatedOutcome: "success",
      automatedSignals: {},
      toolsUsed: ["npm run build"],
      filesModified: ["tsconfig.json"],
      durationMs: 120000,
      sanitized: true,
    });
    expect(privateTrace.shareEligible).toBe(false);

    const updated = await cognitiveDb.updateCognitiveUserSettings({
      userId,
      sharedLearningEnabled: true,
    });
    expect(updated.sharedLearningEnabled).toBe(true);

    const sharedTrace = await cognitiveDb.createTrace({
      userId,
      sessionId: "settings-shared",
      type: "debugging",
      problem: "Fix a reusable auth middleware issue",
      context: { technologies: ["nextjs", "typescript"] },
      reasoning: "Trace after opting into shared learning.",
      approaches: [],
      solution: "Adjusted middleware matcher.",
      outcome: "success",
      automatedOutcome: "success",
      automatedSignals: {},
      toolsUsed: ["npm test"],
      filesModified: ["middleware.ts"],
      durationMs: 180000,
      sanitized: true,
    });
    expect(sharedTrace.shareEligible).toBe(true);
    expect(sharedTrace.sharedSignature).toBeNull();
  });

  it("builds global patterns without persisting reusable shared signatures", async () => {
    const userId = "user-global";
    await cognitiveDb.updateCognitiveUserSettings({
      userId,
      sharedLearningEnabled: true,
    });

    for (const sessionId of ["global-1", "global-2", "global-3"]) {
      const trace = await cognitiveDb.createTrace({
        userId,
        sessionId,
        type: "debugging",
        problem: "Next.js middleware matcher breaks auth on static assets",
        context: { technologies: ["nextjs", "typescript"], errorMessages: ["Auth middleware blocks _next/static"] },
        reasoning: "Reviewed matcher configuration and narrowed the auth middleware scope.",
        approaches: [],
        solution: "Exclude static assets from the middleware matcher.",
        outcome: "success",
        automatedOutcome: "success",
        automatedSignals: { resolutionKind: "tests_passed" },
        toolsUsed: ["npm test"],
        filesModified: ["middleware.ts"],
        durationMs: 90000,
        sanitized: true,
      });
      expect(trace.shareEligible).toBe(true);
      expect(trace.sharedSignature).toBeNull();
    }

    const extraction = await cognitiveDb.runPatternExtraction({
      userId,
      includeGlobal: true,
    });
    expect(extraction.globalPatterns).toBeGreaterThan(0);

    const patterns = await cognitiveDb.getPatterns(userId);
    const globalPattern = patterns.find((pattern) => pattern.scope === "global");
    expect(globalPattern).toBeTruthy();
    expect(globalPattern?.sharedSignature).toBeNull();
    expect(globalPattern?.sourceTraceIdsJson).toBe("[]");
  });
});
