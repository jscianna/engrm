import os from "node:os";
import path from "node:path";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type DbModule = typeof import("../../../src/lib/db");
type ApiAuthModule = typeof import("../../../src/lib/api-auth");
type TursoModule = typeof import("../../../src/lib/turso");

describe("api key scopes", () => {
  const dbFile = path.join(os.tmpdir(), `fathippo-api-key-scopes-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
  let db: DbModule;
  let apiAuth: ApiAuthModule;
  let turso: TursoModule;

  beforeAll(async () => {
    process.env.TURSO_DATABASE_URL = `file:${dbFile}`;
    delete process.env.TURSO_AUTH_TOKEN;
    vi.resetModules();
    db = await import("../../../src/lib/db");
    apiAuth = await import("../../../src/lib/api-auth");
    turso = await import("../../../src/lib/turso");
  });

  afterAll(() => {
    turso.closeDb();
    rmSync(dbFile, { force: true });
  });

  it("allows scoped endpoints and forbids unscoped ones", async () => {
    const { apiKey } = await db.createApiKey("user-scope-test", "Scoped agent", [
      "memories.list",
      "cognitive.traces.*",
    ]);

    const allowedRequest = new Request("http://localhost/api/v1/memories", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const identity = await apiAuth.validateApiKey(allowedRequest, "memories.list");
    expect(identity.userId).toBe("user-scope-test");
    expect(identity.scopes).toContain("memories.list");

    const wildcardRequest = new Request("http://localhost/api/v1/cognitive/traces", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const wildcardIdentity = await apiAuth.validateApiKey(wildcardRequest, "cognitive.traces.outcome");
    expect(wildcardIdentity.userId).toBe("user-scope-test");

    const forbiddenRequest = new Request("http://localhost/api/v1/search", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    await expect(apiAuth.validateApiKey(forbiddenRequest, "search")).rejects.toMatchObject({
      code: "AUTH_FORBIDDEN",
    });
  });

  it("does not include destructive privacy scopes in default API keys", async () => {
    const { apiKey, scopes } = await db.createApiKey("user-default-scope-test", "Default agent");

    expect(scopes).not.toContain("cognitive.privacy.export");
    expect(scopes).not.toContain("cognitive.privacy.delete");
    expect(scopes).not.toContain("cognitive.settings.update");
    expect(scopes).not.toContain("cognitive.settings.*");
    expect(scopes).toContain("cognitive.settings.get");

    const exportRequest = new Request("http://localhost/api/v1/cognitive/privacy/export", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    await expect(apiAuth.validateApiKey(exportRequest, "cognitive.privacy.export")).rejects.toMatchObject({
      code: "AUTH_FORBIDDEN",
    });

    const updateSettingsRequest = new Request("http://localhost/api/v1/cognitive/settings", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    await expect(apiAuth.validateApiKey(updateSettingsRequest, "cognitive.settings.update")).rejects.toMatchObject({
      code: "AUTH_FORBIDDEN",
    });
  });
});
