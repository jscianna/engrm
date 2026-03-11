import { deleteAgentMemoryById, getAgentMemoryById, updateAgentMemory } from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { recordMemoryDeleted } from "@/lib/rate-limiter";
import { assertPreActionRecall } from "@/lib/pre-action-recall";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await validateApiKey(request, "memories.get");
    const { id } = await context.params;
    const memory = await getAgentMemoryById(identity.userId, id, { excludeSensitive: true });

    if (!memory) {
      throw new MemryError("MEMORY_NOT_FOUND");
    }

    return Response.json({ memory });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await validateApiKey(request, "memories.update");
    const { id } = await context.params;
    
    const body = await request.json().catch(() => ({}));
    const updates: { title?: string; text?: string } = {};
    
    if (typeof body.title === "string") {
      updates.title = body.title.trim();
    }
    if (typeof body.text === "string") {
      updates.text = body.text.trim();
    }
    
    if (Object.keys(updates).length === 0) {
      throw new MemryError("VALIDATION_ERROR", { reason: "No valid fields to update (title or text)" });
    }

    const updated = await updateAgentMemory(identity.userId, id, updates);
    if (!updated) {
      throw new MemryError("MEMORY_NOT_FOUND");
    }

    const memory = await getAgentMemoryById(identity.userId, id, { excludeSensitive: true });
    return Response.json({ memory });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await validateApiKey(request, "memories.delete");
    assertPreActionRecall(request, "memories.delete");
    const { id } = await context.params;
    
    // Get memory first to know the size
    const memory = await getAgentMemoryById(identity.userId, id, { excludeSensitive: true });
    if (!memory) {
      throw new MemryError("MEMORY_NOT_FOUND");
    }

    const deleted = await deleteAgentMemoryById(identity.userId, id);
    if (!deleted) {
      throw new MemryError("MEMORY_NOT_FOUND");
    }

    // Track storage reduction
    const sizeBytes = Buffer.byteLength(memory.text, "utf8");
    await recordMemoryDeleted(identity.userId, sizeBytes);

    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
