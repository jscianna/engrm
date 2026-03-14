import { getChatbotById, listConversationsByChatbot } from "@/lib/chatbot";
import { validateApiKey } from "@/lib/api-auth";
import { errorResponse, FatHippoError } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await validateApiKey(request, "chatbots.conversations.list");
    const { id } = await context.params;
    const chatbot = await getChatbotById(identity.userId, id);
    if (!chatbot) {
      throw new FatHippoError("CHATBOT_NOT_FOUND");
    }

    const conversations = await listConversationsByChatbot(id);
    return Response.json({ conversations });
  } catch (error) {
    return errorResponse(error);
  }
}
