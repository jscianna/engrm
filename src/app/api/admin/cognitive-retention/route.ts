import { NextResponse } from "next/server";
import { assertAdminAccess } from "@/lib/admin-auth";
import { extractRequestInfo, logAuditEvent } from "@/lib/audit-log";
import { cleanupExpiredCognitiveData } from "@/lib/cognitive-db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let actor = "__admin__";
  try {
    const identity = await assertAdminAccess(request);
    actor = identity.userId ?? identity.email ?? "__admin__";
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const userId = typeof body.userId === "string" ? body.userId : undefined;
  const benchmarkRetentionDays =
    typeof body.benchmarkRetentionDays === "number" ? body.benchmarkRetentionDays : undefined;

  const result = await cleanupExpiredCognitiveData({
    userId,
    benchmarkRetentionDays,
  });

  await logAuditEvent({
    userId: actor,
    action: "cognitive.retention.cleanup",
    resourceType: "cognitive_data",
    resourceId: userId ?? "all",
    metadata: { ...result },
    ...extractRequestInfo(request),
  });

  return NextResponse.json({ result });
}
