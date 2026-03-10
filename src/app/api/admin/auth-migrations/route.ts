import { NextResponse } from "next/server";
import { assertAdminAccess } from "@/lib/admin-auth";
import {
  DEFAULT_AGENT_API_KEY_SCOPES,
  backfillApiKeyScopes,
  getApiKeyScopeMigrationStatus,
} from "@/lib/db";
import { extractRequestInfo, logAuditEvent } from "@/lib/audit-log";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await assertAdminAccess(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") || undefined;
  const status = await getApiKeyScopeMigrationStatus({ userId });
  return NextResponse.json({
    status,
    defaultScopes: [...DEFAULT_AGENT_API_KEY_SCOPES],
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
  const userId = typeof body.userId === "string" ? body.userId : undefined;
  const scopes = Array.isArray(body.scopes)
    ? body.scopes.filter((scope: unknown): scope is string => typeof scope === "string")
    : undefined;
  const dryRun = body.dryRun !== false;
  const includeWildcardKeys = body.includeWildcardKeys === true;

  const result = await backfillApiKeyScopes({
    userId,
    scopes,
    dryRun,
    includeWildcardKeys,
  });

  const requestInfo = extractRequestInfo(request);
  await logAuditEvent({
    userId: userId ?? identityUserId,
    action: "admin.migrate",
    resourceType: "api_keys",
    resourceId: userId ?? "all",
    metadata: {
      dryRun,
      includeWildcardKeys,
      appliedScopes: result.appliedScopes,
      updated: result.updated,
      candidates: result.candidates,
    },
    ...requestInfo,
  });

  return NextResponse.json({
    result,
    status: await getApiKeyScopeMigrationStatus({ userId }),
  });
}
