import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { assertAdminAccess } from "@/lib/admin-auth";
import { extractRequestInfo, logAuditEvent } from "@/lib/audit-log";
import { dispatchOperationalAlertsIfDue, getOperationalAlertDeliveryConfig } from "@/lib/alert-delivery";
import { enforceRequestThrottle, buildThrottleActorKey } from "@/lib/request-throttle";

export const runtime = "nodejs";

function hasDispatchSecret(request: Request): boolean {
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!provided) {
    return false;
  }

  const secrets = [
    process.env.OPS_ALERT_DISPATCH_SECRET,
    process.env.CRON_SECRET,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  return secrets.some((secret) => {
    const providedBuffer = Buffer.from(provided, "utf8");
    const expectedBuffer = Buffer.from(secret, "utf8");
    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  });
}

async function authorizeDispatch(request: Request): Promise<{
  actor: string;
  source: "admin" | "secret";
}> {
  try {
    const identity = await assertAdminAccess(request);
    return {
      actor: identity.userId ?? identity.email ?? "admin",
      source: "admin",
    };
  } catch {
    if (hasDispatchSecret(request)) {
      return {
        actor: buildThrottleActorKey({ request, prefix: "ops-dispatch" }),
        source: "secret",
      };
    }
    throw new Error("Unauthorized");
  }
}

async function handleDispatch(request: Request) {
  let authorization;
  try {
    authorization = await authorizeDispatch(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await enforceRequestThrottle({
      scope: "admin.operational-alerts.dispatch",
      actorKey: authorization.actor,
      limit: 12,
      windowMs: 60 * 60 * 1000,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Too many dispatch attempts",
      },
      { status: 429 },
    );
  }

  const body =
    request.method === "POST"
      ? await request.json().catch(() => ({}))
      : {};
  const force = body.force === true;
  const reason = typeof body.reason === "string" ? body.reason.trim() : undefined;
  try {
    const result = await dispatchOperationalAlertsIfDue({
      force,
      reason,
      source: authorization.source === "secret" ? "scheduled_route" : "admin_dispatch_route",
    });

    await logAuditEvent({
      userId: authorization.actor,
      action: "admin.maintenance",
      resourceType: "operational_alerts",
      resourceId: "scheduled_dispatch",
      metadata: {
        force,
        delivered: result.delivered,
        skipped: result.skipped,
        alertCount: result.alertCount,
        reason: result.reason ?? null,
        source: authorization.source,
        acquiredLease: result.acquiredLease,
        fingerprint: result.fingerprint,
        responseStatus: result.responseStatus ?? null,
      },
      ...extractRequestInfo(request),
    });

    return NextResponse.json({
      delivery: getOperationalAlertDeliveryConfig(),
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to dispatch operational alerts",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return handleDispatch(request);
}

export async function POST(request: Request) {
  return handleDispatch(request);
}
