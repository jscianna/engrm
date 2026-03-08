import { auth } from "@clerk/nextjs/server";
import { createApiKey } from "@/lib/db";
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
    const result = await createApiKey(userId, agentName);
    const requestInfo = extractRequestInfo(request);
    logAuditEvent({
      userId,
      action: "auth.api_key_create",
      resourceType: "api_key",
      resourceId: result.agentId,
      metadata: { agentName: agentName ?? null, route: "v1.auth" },
      ...requestInfo,
    }).catch(() => {});
    return Response.json({ key: result.apiKey, agentId: result.agentId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create API key";
    return jsonError(message, "API_KEY_CREATE_FAILED", 400);
  }
}
