import { z } from "zod";
import { deleteChatbot, getChatbotById, updateChatbot } from "@/lib/chatbot";
import { validateApiKey } from "@/lib/api-auth";
import { errorResponse, MemryError } from "@/lib/errors";

export const runtime = "nodejs";

const updateChatbotSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    systemPrompt: z.string().trim().min(1).optional().nullable(),
    model: z.string().trim().min(1).optional().nullable(),
    temperature: z.number().min(0).max(2).optional().nullable(),
    welcomeMessage: z.string().trim().min(1).optional().nullable(),
    theme: z.record(z.string(), z.unknown()).optional().nullable(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await validateApiKey(request, "chatbots.get");
    const { id } = await context.params;
    const chatbot = await getChatbotById(identity.userId, id);
    if (!chatbot) {
      throw new MemryError("CHATBOT_NOT_FOUND");
    }

    return Response.json({ chatbot });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await validateApiKey(request, "chatbots.update");
    const { id } = await context.params;
    const payload = updateChatbotSchema.safeParse(await request.json().catch(() => null));
    if (!payload.success) {
      throw new MemryError("VALIDATION_ERROR", {
        field: "body",
        reason: payload.error.flatten(),
      });
    }

    const chatbot = await updateChatbot(identity.userId, id, payload.data);
    if (!chatbot) {
      throw new MemryError("CHATBOT_NOT_FOUND");
    }

    return Response.json({ chatbot });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await validateApiKey(request, "chatbots.delete");
    const { id } = await context.params;
    const deleted = await deleteChatbot(identity.userId, id);
    if (!deleted) {
      throw new MemryError("CHATBOT_NOT_FOUND");
    }

    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
