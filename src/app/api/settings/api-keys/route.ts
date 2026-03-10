import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { DEFAULT_AGENT_API_KEY_SCOPES, listApiKeys, createApiKey } from "@/lib/db";
import { extractRequestInfo, logAuditEvent } from "@/lib/audit-log";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const keys = await listApiKeys(userId);
    return NextResponse.json({ keys });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list API keys";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const agentName = typeof body.agentName === "string" ? body.agentName : undefined;
    const scopes =
      Array.isArray(body.scopes)
        ? body.scopes.filter((scope: unknown): scope is string => typeof scope === "string")
        : undefined;

    const { apiKey, agentId, scopes: grantedScopes } = await createApiKey(userId, agentName, scopes);
    const requestInfo = extractRequestInfo(request);
    logAuditEvent({
      userId,
      action: "auth.api_key_create",
      resourceType: "api_key",
      resourceId: agentId,
      metadata: {
        agentName: agentName ?? null,
        scopes: grantedScopes,
        usedDefaultScopes: scopes == null,
      },
      ...requestInfo,
    }).catch(() => {});

    return NextResponse.json({
      apiKey,
      agentId,
      scopes: grantedScopes,
      suggestedScopes: [...DEFAULT_AGENT_API_KEY_SCOPES],
      message: "API key created. Save it now — you won't see it again.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create API key";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
