import { embedText } from "@/lib/embeddings";
import { upsertMemoryVector } from "@/lib/vector";
import { getSessionById, insertAgentMemory, listAgentMemories } from "@/lib/db";
import { ApiAuthError, validateApiKey } from "@/lib/api-auth";
import { isObject, jsonError, normalizeLimit, resolveNamespaceIdOrError } from "@/lib/api-v1";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request);
    const url = new URL(request.url);
    const namespace = url.searchParams.get("namespace") ?? undefined;
    const limit = normalizeLimit(url.searchParams.get("limit"), 50, 200);
    const since = url.searchParams.get("since") ?? undefined;

    const resolved = await resolveNamespaceIdOrError(identity.userId, namespace);
    if (resolved.error) {
      return resolved.error;
    }

    const memories = await listAgentMemories({
      userId: identity.userId,
      namespaceId: resolved.namespaceId,
      limit,
      since,
    });

    return Response.json({ memories });
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return jsonError(error.message, error.code, error.status);
    }
    const message = error instanceof Error ? error.message : "Failed to list memories";
    return jsonError(message, "MEMORIES_LIST_FAILED", 400);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request);
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body) || typeof body.text !== "string" || !body.text.trim()) {
      return jsonError("'text' is required", "VALIDATION_ERROR", 400);
    }

    const namespace = typeof body.namespace === "string" ? body.namespace : undefined;
    const resolved = await resolveNamespaceIdOrError(identity.userId, namespace);
    if (resolved.error) {
      return resolved.error;
    }

    const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
    if (sessionId) {
      const session = await getSessionById(identity.userId, sessionId);
      if (!session) {
        return jsonError("Session not found", "SESSION_NOT_FOUND", 404);
      }
      if (resolved.namespaceId && session.namespaceId !== resolved.namespaceId) {
        return jsonError("Session namespace does not match request namespace", "SESSION_NAMESPACE_MISMATCH", 400);
      }
    }

    const metadata = isObject(body.metadata) ? body.metadata : null;
    const memory = await insertAgentMemory({
      userId: identity.userId,
      title: typeof body.title === "string" ? body.title : undefined,
      text: body.text,
      metadata,
      namespaceId: resolved.namespaceId,
      sessionId,
    });

    const vector = await embedText(memory.text.slice(0, 6000));
    await upsertMemoryVector({
      memoryId: memory.id,
      userId: memory.userId,
      title: memory.title,
      sourceType: "text",
      memoryType: "episodic",
      importance: 5,
      vector,
    });

    return Response.json({ memory }, { status: 201 });
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return jsonError(error.message, error.code, error.status);
    }
    const message = error instanceof Error ? error.message : "Failed to store memory";
    return jsonError(message, "MEMORY_CREATE_FAILED", 400);
  }
}
