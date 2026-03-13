import { z } from "zod";
import { getChatbotById, ingestSource, listSourcesByChatbot } from "@/lib/chatbot";
import { validateApiKey } from "@/lib/api-auth";
import { errorResponse, FatHippoError } from "@/lib/errors";

export const runtime = "nodejs";

const createSourceSchema = z.object({
  type: z.enum(["text", "url", "pdf", "markdown"]),
  name: z.string().trim().min(1),
  url: z.string().url().optional().nullable(),
  content: z.string().min(1),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await validateApiKey(request, "chatbots.sources.list");
    const { id } = await context.params;
    const chatbot = await getChatbotById(identity.userId, id);
    if (!chatbot) {
      throw new FatHippoError("CHATBOT_NOT_FOUND");
    }

    const sources = await listSourcesByChatbot(id);
    return Response.json({ sources });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await validateApiKey(request, "chatbots.sources.create");
    const { id } = await context.params;
    const payload = createSourceSchema.safeParse(await request.json().catch(() => null));
    if (!payload.success) {
      throw new FatHippoError("VALIDATION_ERROR", {
        field: "body",
        reason: payload.error.flatten(),
      });
    }

    const result = await ingestSource({
      userId: identity.userId,
      chatbotId: id,
      ...payload.data,
    });

    return Response.json({ source: result.source }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
