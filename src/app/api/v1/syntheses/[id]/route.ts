import {
  getAgentMemoriesByIds,
  getSynthesizedMemoryById,
  incrementSynthesizedMemoryAccess,
} from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await validateApiKey(request, "syntheses.get");
    const { id } = await context.params;
    const synthesis = await getSynthesizedMemoryById(identity.userId, id);

    if (!synthesis) {
      throw new MemryError("SYNTHESIS_NOT_FOUND");
    }

    await incrementSynthesizedMemoryAccess(identity.userId, synthesis.id);

    const sourceMemories = await getAgentMemoriesByIds({
      userId: identity.userId,
      ids: synthesis.sourceMemoryIds,
    });

    return Response.json({
      synthesis: {
        ...synthesis,
        accessCount: synthesis.accessCount + 1,
      },
      sourceMemories,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
