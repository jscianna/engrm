import { embedText } from "@/lib/embeddings";
import { upsertMemoryVector } from "@/lib/vector";
import { getSessionById, insertAgentMemory, listSessionMemories } from "@/lib/db";
import { ApiAuthError, validateApiKey } from "@/lib/api-auth";
import { isObject, jsonError } from "@/lib/api-v1";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const identity = await validateApiKey(request);
    const { sessionId } = await context.params;
    const session = await getSessionById(identity.userId, sessionId);
    if (!session) {
      return jsonError("Session not found", "SESSION_NOT_FOUND", 404);
    }

    const memories = await listSessionMemories(identity.userId, sessionId);
    return Response.json({ session, memories });
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return jsonError(error.message, error.code, error.status);
    }
    const message = error instanceof Error ? error.message : "Failed to list session memories";
    return jsonError(message, "SESSION_MEMORIES_LIST_FAILED", 400);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const identity = await validateApiKey(request);
    const { sessionId } = await context.params;
    const session = await getSessionById(identity.userId, sessionId);
    if (!session) {
      return jsonError("Session not found", "SESSION_NOT_FOUND", 404);
    }

    const body = (await request.json().catch(() => null)) as unknown;
    if (!isObject(body) || typeof body.text !== "string" || !body.text.trim()) {
      return jsonError("'text' is required", "VALIDATION_ERROR", 400);
    }

    const metadata = isObject(body.metadata) ? body.metadata : null;
    const memory = await insertAgentMemory({
      userId: identity.userId,
      title: typeof body.title === "string" ? body.title : undefined,
      text: body.text,
      metadata,
      namespaceId: session.namespaceId,
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
    const message = error instanceof Error ? error.message : "Failed to add memory to session";
    return jsonError(message, "SESSION_MEMORY_CREATE_FAILED", 400);
  }
}
