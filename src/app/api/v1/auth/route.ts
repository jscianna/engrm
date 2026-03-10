import { auth } from "@clerk/nextjs/server";
import { DEFAULT_AGENT_API_KEY_SCOPES, createApiKey } from "@/lib/db";
import { isObject, jsonError } from "@/lib/api-v1";
import { extractRequestInfo, logAuditEvent } from "@/lib/audit-log";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return jsonError("Unauthorized", "UNAUTHORIZED", 401);
  }

  try {
    const body = (await request.json().catch(() => ({}))) as unknown;
    const agentName = isObject(body) && typeof body.agentName === "string" ? body.agentName.trim() : undefined;
    const scopes =
      isObject(body) && Array.isArray(body.scopes)
        ? body.scopes.filter((scope): scope is string => typeof scope === "string")
        : undefined;
    const result = await createApiKey(userId, agentName, scopes);
    const requestInfo = extractRequestInfo(request);
    logAuditEvent({
      userId,
      action: "auth.api_key_create",
      resourceType: "api_key",
      resourceId: result.agentId,
      metadata: { agentName: agentName ?? null, route: "v1.auth", scopes: result.scopes },
      ...requestInfo,
    }).catch(() => {});
    return Response.json({
      key: result.apiKey,
      agentId: result.agentId,
      scopes: result.scopes,
      suggestedScopes: [...DEFAULT_AGENT_API_KEY_SCOPES],
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create API key";
    return jsonError(message, "API_KEY_CREATE_FAILED", 400);
  }
}
