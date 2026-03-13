import { embedText } from "@/lib/embeddings";
import { upsertMemoryVector } from "@/lib/qdrant";
import { getSessionById, insertAgentMemory, listSessionMemories } from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { FatHippoError, errorResponse } from "@/lib/errors";
import { isObject } from "@/lib/api-v1";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await validateApiKey(request, "sessions.memories.list");
    const { id: sessionId } = await context.params;
    const session = await getSessionById(identity.userId, sessionId);
    
    if (!session) {
      throw new FatHippoError("SESSION_NOT_FOUND");
    }

    const memories = await listSessionMemories(identity.userId, sessionId);
    return Response.json({ session, memories });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await validateApiKey(request, "sessions.memories.create");
    const { id: sessionId } = await context.params;
    const session = await getSessionById(identity.userId, sessionId);
    
    if (!session) {
      throw new FatHippoError("SESSION_NOT_FOUND");
    }

    const body = (await request.json().catch(() => null)) as unknown;
    if (!isObject(body) || typeof body.text !== "string" || !body.text.trim()) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "text", reason: "required" });
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
    return errorResponse(error);
  }
}
