import { NextResponse } from "next/server";
import { assertAdminAccess } from "@/lib/admin-auth";
import { getAuditLogs, type AuditAction } from "@/lib/audit-log";
import { buildThrottleActorKey, enforceRequestThrottle } from "@/lib/request-throttle";

export const runtime = "nodejs";

function isCognitiveAuditAction(value: string): value is AuditAction {
  return (
    value.startsWith("cognitive.") ||
    value === "admin.maintenance"
  );
}

export async function GET(request: Request) {
  let identity;
  try {
    identity = await assertAdminAccess(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await enforceRequestThrottle({
      scope: "admin.cognitive.audit.read",
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

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") || undefined;
  const actionParam = searchParams.get("action");
  const action = actionParam && isCognitiveAuditAction(actionParam) ? actionParam : undefined;
  const since = searchParams.get("since") || undefined;
  const limit = Math.max(1, Math.min(Number(searchParams.get("limit") || 100), 200));

  const logs = await getAuditLogs({
    userId,
    action,
    since,
    limit,
  });

  const filtered = action
    ? logs
    : logs.filter((entry) => isCognitiveAuditAction(entry.action));

  return NextResponse.json({
    count: filtered.length,
    logs: filtered,
  });
}
