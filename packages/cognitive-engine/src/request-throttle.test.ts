import os from "node:os";
import path from "node:path";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type RequestThrottleModule = typeof import("../../../src/lib/request-throttle");
type TursoModule = typeof import("../../../src/lib/turso");

describe("request throttle", () => {
  const dbFile = path.join(os.tmpdir(), `fathippo-request-throttle-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
  let throttle: RequestThrottleModule;
  let turso: TursoModule;

  beforeAll(async () => {
    process.env.TURSO_DATABASE_URL = `file:${dbFile}`;
    delete process.env.TURSO_AUTH_TOKEN;
    vi.resetModules();
    throttle = await import("../../../src/lib/request-throttle");
    turso = await import("../../../src/lib/turso");
  });

  afterAll(() => {
    turso.closeDb();
    rmSync(dbFile, { force: true });
  });

  it("enforces fixed-window limits per actor and scope", async () => {
    await throttle.enforceRequestThrottle({
      scope: "admin.operational-alerts.send",
      actorKey: "user-1",
      limit: 2,
      windowMs: 60 * 60 * 1000,
    });
    await throttle.enforceRequestThrottle({
      scope: "admin.operational-alerts.send",
      actorKey: "user-1",
      limit: 2,
      windowMs: 60 * 60 * 1000,
    });

    await expect(
      throttle.enforceRequestThrottle({
        scope: "admin.operational-alerts.send",
        actorKey: "user-1",
        limit: 2,
        windowMs: 60 * 60 * 1000,
      }),
    ).rejects.toMatchObject({
      code: "RATE_LIMIT_ACTION",
    });
  });

  it("does not mix counters across actors or scopes", async () => {
    await throttle.enforceRequestThrottle({
      scope: "admin.operational-alerts.send",
      actorKey: "user-2",
      limit: 1,
      windowMs: 60 * 60 * 1000,
    });

    const otherScope = await throttle.enforceRequestThrottle({
      scope: "admin.security-status.read",
      actorKey: "user-2",
      limit: 1,
      windowMs: 60 * 60 * 1000,
    });
    expect(otherScope.remaining).toBe(0);

    const otherActor = await throttle.enforceRequestThrottle({
      scope: "admin.operational-alerts.send",
      actorKey: "user-3",
      limit: 1,
      windowMs: 60 * 60 * 1000,
    });
    expect(otherActor.remaining).toBe(0);
  });
});
