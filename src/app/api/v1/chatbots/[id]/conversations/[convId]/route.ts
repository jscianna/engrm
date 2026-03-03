import { deleteConversation, getConversationTranscript } from "@/lib/chatbot";
import { validateApiKey } from "@/lib/api-auth";
import { errorResponse } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; convId: string }> },
) {
  try {
    const identity = await validateApiKey(request, "chatbots.conversations.get");
    const { id, convId } = await context.params;
    const transcript = await getConversationTranscript({
      userId: identity.userId,
      chatbotId: id,
      conversationId: convId,
    });

    return Response.json({
      conversation: transcript.conversation,
      messages: transcript.messages,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; convId: string }> },
) {
  try {
    const identity = await validateApiKey(request, "chatbots.conversations.delete");
    const { id, convId } = await context.params;
    await getConversationTranscript({
      userId: identity.userId,
      chatbotId: id,
      conversationId: convId,
    });

    const deleted = await deleteConversation(id, convId);
    return Response.json({ success: deleted });
  } catch (error) {
    return errorResponse(error);
  }
}
