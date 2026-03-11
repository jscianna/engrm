import { NextResponse } from "next/server";
import { assertAdminAccess } from "@/lib/admin-auth";
import { extractRequestInfo, logAuditEvent } from "@/lib/audit-log";
import { deliverOperationalAlerts, getOperationalAlertDeliveryConfig } from "@/lib/alert-delivery";
import { getOperationalAlertsSummary } from "@/lib/operational-alerts";
import { buildThrottleActorKey, enforceRequestThrottle } from "@/lib/request-throttle";

export const runtime = "nodejs";

export async function GET(request: Request) {
  let identity;
  try {
    identity = await assertAdminAccess(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await enforceRequestThrottle({
      scope: "admin.operational-alerts.read",
      actorKey: buildThrottleActorKey({
        actorKey: identity.userId ?? identity.email,
        request,
        prefix: "admin",
      }),
      limit: 60,
      windowMs: 10 * 60 * 1000,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Too many requests" }, { status: 429 });
  }

  const [summary, delivery] = await Promise.all([
    getOperationalAlertsSummary(),
    Promise.resolve(getOperationalAlertDeliveryConfig()),
  ]);

  return NextResponse.json({
    delivery,
    summary,
  });
}

export async function POST(request: Request) {
  let identityUserId = "__admin__";
  let actorKey = "admin:__admin__";
  try {
    const identity = await assertAdminAccess(request);
    identityUserId = identity.userId ?? identity.email ?? "__admin__";
    actorKey = buildThrottleActorKey({
      actorKey: identity.userId ?? identity.email,
      request,
      prefix: "admin",
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await enforceRequestThrottle({
      scope: "admin.operational-alerts.send",
      actorKey,
      limit: 6,
      windowMs: 60 * 60 * 1000,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Too many requests" }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const force = body.force === true;
  const reason = typeof body.reason === "string" ? body.reason.trim() : undefined;
  const summary = await getOperationalAlertsSummary();

  const result = await deliverOperationalAlerts(summary, {
    force,
    reason,
    source: "admin_route",
  });

  await logAuditEvent({
    userId: identityUserId,
    action: "admin.maintenance",
    resourceType: "operational_alerts",
    resourceId: "delivery",
    metadata: {
      delivered: result.delivered,
      skipped: result.skipped,
      alertCount: result.alertCount,
      force,
      reason: reason ?? null,
      format: result.format,
      responseStatus: result.responseStatus ?? null,
    },
    ...extractRequestInfo(request),
  });

  return NextResponse.json({
    delivery: getOperationalAlertDeliveryConfig(),
    result,
    summary,
  });
}
