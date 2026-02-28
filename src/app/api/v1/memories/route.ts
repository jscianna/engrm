import { embedText } from "@/lib/embeddings";
import { upsertMemoryVector } from "@/lib/qdrant";
import { getSessionById, insertAgentMemory, listAgentMemories } from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { isObject, jsonError, normalizeLimit, resolveNamespaceIdOrError } from "@/lib/api-v1";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request, "memories.list");
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
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "memories.create");
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body) || typeof body.text !== "string" || !body.text.trim()) {
      throw new MemryError("VALIDATION_ERROR", { field: "text", reason: "required" });
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
        throw new MemryError("SESSION_NOT_FOUND");
      }
      if (resolved.namespaceId && session.namespaceId !== resolved.namespaceId) {
        throw new MemryError("VALIDATION_ERROR", {
          field: "sessionId",
          reason: "Session namespace does not match request namespace",
        });
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
    return errorResponse(error);
  }
}
