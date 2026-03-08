import {
  getAgentMemoriesByIds,
  getSynthesizedMemoryById,
  incrementSynthesizedMemoryAccess,
  updateSynthesizedMemory,
  deleteSynthesizedMemory,
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await validateApiKey(request, "syntheses.update");
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title : undefined;
    const content = typeof body.synthesis === "string" ? body.synthesis : undefined;

    const existing = await getSynthesizedMemoryById(identity.userId, id);
    if (!existing) {
      throw new MemryError("SYNTHESIS_NOT_FOUND");
    }

    const updated = await updateSynthesizedMemory(identity.userId, id, {
      title: title ?? existing.title,
      synthesis: content ?? existing.synthesis,
    });

    const sourceMemories = await getAgentMemoriesByIds({
      userId: identity.userId,
      ids: updated.sourceMemoryIds,
    });

    return Response.json({ synthesis: updated, sourceMemories });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await validateApiKey(request, "syntheses.delete");
    const { id } = await context.params;

    const existing = await getSynthesizedMemoryById(identity.userId, id);
    if (!existing) {
      throw new MemryError("SYNTHESIS_NOT_FOUND");
    }

    await deleteSynthesizedMemory(identity.userId, id);
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
