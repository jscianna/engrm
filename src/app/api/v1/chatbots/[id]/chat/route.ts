import { z } from "zod";
import { getChatbotById, streamChatReply } from "@/lib/chatbot";
import { validateApiKey } from "@/lib/api-auth";
import { errorResponse, MemryError } from "@/lib/errors";
import {
  createAnalyticsConversationId,
  detectQualitySignals,
  recordQualitySignals,
} from "@/lib/memory-analytics";

export const runtime = "nodejs";

const chatSchema = z.object({
  message: z.string().trim().min(1),
  conversationId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional().nullable(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await validateApiKey(request, "chatbots.chat");
    const { id } = await context.params;
    const chatbot = await getChatbotById(identity.userId, id);
    if (!chatbot) {
      throw new MemryError("CHATBOT_NOT_FOUND");
    }

    const payload = chatSchema.safeParse(await request.json().catch(() => null));
    if (!payload.success) {
      throw new MemryError("VALIDATION_ERROR", {
        field: "body",
        reason: payload.error.flatten(),
      });
    }

    const result = await streamChatReply({
      userId: identity.userId,
      chatbotId: id,
      ...payload.data,
    });

    const qualitySignals = detectQualitySignals(payload.data.message);
    if (qualitySignals.length > 0) {
      recordQualitySignals({
        userId: identity.userId,
        conversationId: createAnalyticsConversationId("chatbot", result.conversation.id),
        signals: qualitySignals,
      }).catch(() => {});
    }

    return new Response(result.stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Conversation-Id": result.conversation.id,
        "X-Sources-Used": JSON.stringify(result.sourcesUsed),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
