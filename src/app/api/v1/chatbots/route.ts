import { z } from "zod";
import { createChatbot, listChatbotsByUser } from "@/lib/chatbot";
import { validateApiKey } from "@/lib/api-auth";
import { errorResponse, MemryError } from "@/lib/errors";

export const runtime = "nodejs";

const createChatbotSchema = z.object({
  name: z.string().trim().min(1),
  systemPrompt: z.string().trim().min(1).optional().nullable(),
  model: z.string().trim().min(1).optional().nullable(),
  temperature: z.number().min(0).max(2).optional().nullable(),
  welcomeMessage: z.string().trim().min(1).optional().nullable(),
  theme: z.record(z.string(), z.unknown()).optional().nullable(),
});

export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request, "chatbots.list");
    const chatbots = await listChatbotsByUser(identity.userId);
    return Response.json({ chatbots });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "chatbots.create");
    const payload = createChatbotSchema.safeParse(await request.json().catch(() => null));
    if (!payload.success) {
      throw new MemryError("VALIDATION_ERROR", {
        field: "body",
        reason: payload.error.flatten(),
      });
    }

    const chatbot = await createChatbot({
      userId: identity.userId,
      ...payload.data,
    });
    return Response.json({ chatbot }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
