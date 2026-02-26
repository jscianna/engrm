import { createSession, listSessions } from "@/lib/db";
import { ApiAuthError, validateApiKey } from "@/lib/api-auth";
import { isObject, jsonError, resolveNamespaceIdOrError } from "@/lib/api-v1";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request);
    const url = new URL(request.url);
    const namespace = url.searchParams.get("namespace") ?? undefined;

    const resolved = await resolveNamespaceIdOrError(identity.userId, namespace);
    if (resolved.error) {
      return resolved.error;
    }

    const sessions = await listSessions({
      userId: identity.userId,
      namespaceId: resolved.namespaceId,
    });

    return Response.json({ sessions });
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return jsonError(error.message, error.code, error.status);
    }
    const message = error instanceof Error ? error.message : "Failed to list sessions";
    return jsonError(message, "SESSION_LIST_FAILED", 400);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request);
    const body = (await request.json().catch(() => ({}))) as unknown;
    if (!isObject(body)) {
      return jsonError("Invalid JSON body", "VALIDATION_ERROR", 400);
    }

    const namespace = typeof body.namespace === "string" ? body.namespace : undefined;
    const resolved = await resolveNamespaceIdOrError(identity.userId, namespace);
    if (resolved.error) {
      return resolved.error;
    }

    const metadata = isObject(body.metadata) ? body.metadata : null;
    const session = await createSession({
      userId: identity.userId,
      namespaceId: resolved.namespaceId,
      metadata,
    });

    return Response.json({ session }, { status: 201 });
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return jsonError(error.message, error.code, error.status);
    }
    const message = error instanceof Error ? error.message : "Failed to create session";
    return jsonError(message, "SESSION_CREATE_FAILED", 400);
  }
}
