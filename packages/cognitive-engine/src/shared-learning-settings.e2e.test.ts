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
    expect(sharedTrace.sharedSignature).toBeTruthy();
  });
});
