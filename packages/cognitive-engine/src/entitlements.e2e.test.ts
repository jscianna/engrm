import os from "node:os";
import path from "node:path";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type DbModule = typeof import("../../../src/lib/db");
type ApiAuthModule = typeof import("../../../src/lib/api-auth");
type TursoModule = typeof import("../../../src/lib/turso");
type SyncBatchRouteModule = typeof import("../../../src/app/api/v1/sync/batch/route");
type SimpleContextRouteModule = typeof import("../../../src/app/api/v1/simple/context/route");

describe("entitlements", () => {
  const dbFile = path.join(os.tmpdir(), `fathippo-entitlements-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
  let db: DbModule;
  let apiAuth: ApiAuthModule;
  let turso: TursoModule;
  let syncBatchRoute: SyncBatchRouteModule;
  let simpleContextRoute: SimpleContextRouteModule;

  beforeAll(async () => {
    process.env.TURSO_DATABASE_URL = `file:${dbFile}`;
    delete process.env.TURSO_AUTH_TOKEN;
    vi.resetModules();
    db = await import("../../../src/lib/db");
    apiAuth = await import("../../../src/lib/api-auth");
    turso = await import("../../../src/lib/turso");
    syncBatchRoute = await import("../../../src/app/api/v1/sync/batch/route");
    simpleContextRoute = await import("../../../src/app/api/v1/simple/context/route");
  });

  afterAll(() => {
    turso.closeDb();
    rmSync(dbFile, { force: true });
  });

  it("blocks hosted sync without a hosted entitlement and allows it with one", async () => {
    const { apiKey: freeKey } = await db.createApiKey("user-free-sync", "Free sync", ["sync.batch"]);
    const freeResponse = await syncBatchRoute.POST(
      new Request("http://localhost/api/v1/sync/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${freeKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          operations: [
            {
              id: "op-free-sync",
              userId: "user-free-sync",
              operation: "delete",
              payload: { memoryId: "mem_123" },
              queuedAt: Date.now(),
            },
          ],
        }),
      }),
    );
    expect(freeResponse.status).toBe(403);
    await expect(freeResponse.json()).resolves.toMatchObject({
      error: {
        code: "ENTITLEMENT_REQUIRED",
        details: {
          feature: "hosted.sync",
          requiredPlan: "hosted",
        },
      },
    });

    const { apiKey: hostedKey } = await db.createApiKey("user-hosted-sync", "Hosted sync", ["sync.batch"]);
    await db.setUserEntitlementPlan("user-hosted-sync", "hosted");

    const hostedIdentity = await apiAuth.validateApiKey(
      new Request("http://localhost/api/v1/sync/batch", {
        headers: {
          Authorization: `Bearer ${hostedKey}`,
        },
      }),
      "sync.batch",
    );

    expect(hostedIdentity.userId).toBe("user-hosted-sync");
  });

  it("blocks cognition endpoints without a hosted entitlement", async () => {
    const { apiKey: freeKey } = await db.createApiKey("user-free-cognition", "Free cognition", [
      "cognitive.traces.list",
    ]);

    await expect(
      apiAuth.validateApiKey(
        new Request("http://localhost/api/v1/cognitive/traces", {
          headers: {
            Authorization: `Bearer ${freeKey}`,
          },
        }),
        "cognitive.traces.list",
      ),
    ).rejects.toMatchObject({
      code: "ENTITLEMENT_REQUIRED",
      details: {
        feature: "cognition",
        requiredPlan: "hosted",
      },
    });

    await db.setUserEntitlementPlan("user-free-cognition", "hosted");

    const identity = await apiAuth.validateApiKey(
      new Request("http://localhost/api/v1/cognitive/traces", {
        headers: {
          Authorization: `Bearer ${freeKey}`,
        },
      }),
      "cognitive.traces.list",
    );
    expect(identity.userId).toBe("user-free-cognition");
  });

  it("blocks hosted hyde/rerank flags through simple context for free users", async () => {
    const { apiKey } = await db.createApiKey("user-free-context", "Free context", ["simple.context"]);

    const response = await simpleContextRoute.POST(
      new Request("http://localhost/api/v1/simple/context", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "Find the auth regression in my repo",
          hostedHyde: true,
        }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "ENTITLEMENT_REQUIRED",
        details: {
          feature: "hosted.hyde",
          requiredPlan: "hosted",
        },
      },
    });
  });
});
