import { NextResponse } from "next/server";
import { assertAdminAccess } from "@/lib/admin-auth";
import { extractRequestInfo, logAuditEvent } from "@/lib/audit-log";
import { getOrgPromotedPatterns, rollbackOrgPromotedPattern } from "@/lib/cognitive-db";
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
      scope: "admin.cognitive.org-patterns.read",
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
  const orgId = searchParams.get("orgId") || undefined;
  const patterns = await getOrgPromotedPatterns(orgId);

  return NextResponse.json({
    orgId: orgId ?? null,
    count: patterns.length,
    patterns: patterns.map((pattern) => ({
      id: pattern.id,
      orgId: pattern.orgId,
      sourcePatternId: pattern.sourcePatternId,
      domain: pattern.domain,
      scope: pattern.scope,
      trigger: JSON.parse(pattern.triggerJson),
      approach: pattern.approach,
      confidence: pattern.confidence,
      successCount: pattern.successCount,
      failCount: pattern.failCount,
      sourceTraceCount: pattern.sourceTraceCount,
      status: pattern.status,
      impactScore: pattern.impactScore,
      verificationPassRate: pattern.verificationPassRate,
      promotionReason: pattern.promotionReason,
      updatedAt: pattern.updatedAt,
    })),
  });
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
      scope: "admin.cognitive.org-patterns.write",
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
  if (body.action !== "rollback") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const orgId = typeof body.orgId === "string" ? body.orgId : "";
  const patternId = typeof body.patternId === "string" ? body.patternId : "";
  const reason = typeof body.reason === "string" ? body.reason : null;
  if (!orgId || !patternId) {
    return NextResponse.json({ error: "orgId and patternId are required" }, { status: 400 });
  }

  const pattern = await rollbackOrgPromotedPattern({
    orgId,
    patternId,
    reason,
  });
  if (!pattern) {
    return NextResponse.json({ error: "Pattern not found" }, { status: 404 });
  }

  const requestInfo = extractRequestInfo(request);
  await logAuditEvent({
    userId: identity.userId ?? identity.email ?? "__admin__",
    action: "admin.maintenance",
    resourceType: "cognitive_pattern",
    resourceId: pattern.id,
    metadata: {
      action: "org_pattern_rollback",
      orgId,
      sourcePatternId: pattern.sourcePatternId,
      status: pattern.status,
      reason,
    },
    ...requestInfo,
  });

  return NextResponse.json({
    pattern: {
      id: pattern.id,
      orgId: pattern.orgId,
      sourcePatternId: pattern.sourcePatternId,
      scope: pattern.scope,
      status: pattern.status,
      promotionReason: pattern.promotionReason,
      updatedAt: pattern.updatedAt,
    },
  });
}
