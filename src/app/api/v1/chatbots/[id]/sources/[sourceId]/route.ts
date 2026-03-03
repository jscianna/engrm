import { deleteSource, getChatbotById, getOwnedSource } from "@/lib/chatbot";
import { validateApiKey } from "@/lib/api-auth";
import { errorResponse, MemryError } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; sourceId: string }> },
) {
  try {
    const identity = await validateApiKey(request, "chatbots.sources.get");
    const { id, sourceId } = await context.params;
    const chatbot = await getChatbotById(identity.userId, id);
    if (!chatbot) {
      throw new MemryError("CHATBOT_NOT_FOUND");
    }

    const source = await getOwnedSource({
      userId: identity.userId,
      chatbotId: id,
      sourceId,
    });
    return Response.json({ source });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; sourceId: string }> },
) {
  try {
    const identity = await validateApiKey(request, "chatbots.sources.delete");
    const { id, sourceId } = await context.params;
    const chatbot = await getChatbotById(identity.userId, id);
    if (!chatbot) {
      throw new MemryError("CHATBOT_NOT_FOUND");
    }

    const deleted = await deleteSource(id, sourceId);
    if (!deleted) {
      throw new MemryError("SOURCE_NOT_FOUND");
    }

    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
