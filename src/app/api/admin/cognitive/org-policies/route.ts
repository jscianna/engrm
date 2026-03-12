import { NextResponse } from "next/server";
import { assertAdminAccess } from "@/lib/admin-auth";
import { extractRequestInfo, logAuditEvent } from "@/lib/audit-log";
import { getCognitiveOrgPolicy, updateCognitiveOrgPolicy } from "@/lib/cognitive-db";
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
      scope: "admin.cognitive.org-policies.read",
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
  const orgId = searchParams.get("orgId") || "";
  if (!orgId) {
    return NextResponse.json({ error: "orgId is required" }, { status: 400 });
  }

  const policy = await getCognitiveOrgPolicy(orgId);
  return NextResponse.json({ policy });
}

export async function POST(request: Request) {
  let identity;
  try {
    identity = await assertAdminAccess(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await enforceRequestThrottle({
      scope: "admin.cognitive.org-policies.write",
      actorKey: buildThrottleActorKey({
        actorKey: identity.userId ?? identity.email,
        request,
        prefix: "admin",
      }),
      limit: 20,
      windowMs: 60 * 60 * 1000,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Too many requests" }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const orgId = typeof body.orgId === "string" ? body.orgId : "";
  if (!orgId) {
    return NextResponse.json({ error: "orgId is required" }, { status: 400 });
  }

  const policy = await updateCognitiveOrgPolicy({
    orgId,
    orgPatternSharingEnabled:
      typeof body.orgPatternSharingEnabled === "boolean" ? body.orgPatternSharingEnabled : undefined,
    globalContributionEnabled:
      typeof body.globalContributionEnabled === "boolean" ? body.globalContributionEnabled : undefined,
  });

  const requestInfo = extractRequestInfo(request);
  await logAuditEvent({
    userId: identity.userId ?? identity.email ?? "__admin__",
    action: "admin.maintenance",
    resourceType: "cognitive_org_policy",
    resourceId: orgId,
    metadata: {
      action: "cognitive_org_policy_update",
      policy,
    },
    ...requestInfo,
  });

  return NextResponse.json({ policy });
}
