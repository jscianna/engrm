import { NextResponse } from "next/server";
import { assertAdminAccess } from "@/lib/admin-auth";
import { extractRequestInfo, logAuditEvent } from "@/lib/audit-log";
import { deliverOperationalAlerts, getOperationalAlertDeliveryConfig } from "@/lib/alert-delivery";
import { getOperationalAlertsSummary } from "@/lib/operational-alerts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await assertAdminAccess(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  try {
    const identity = await assertAdminAccess(request);
    identityUserId = identity.userId ?? identity.email ?? "__admin__";
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
