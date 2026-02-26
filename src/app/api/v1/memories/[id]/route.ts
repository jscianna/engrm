import { deleteAgentMemoryById, getAgentMemoryById } from "@/lib/db";
import { ApiAuthError, validateApiKey } from "@/lib/api-auth";
import { jsonError } from "@/lib/api-v1";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await validateApiKey(request);
    const { id } = await context.params;
    const memory = await getAgentMemoryById(identity.userId, id);

    if (!memory) {
      return jsonError("Memory not found", "MEMORY_NOT_FOUND", 404);
    }

    return Response.json({ memory });
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return jsonError(error.message, error.code, error.status);
    }
    const message = error instanceof Error ? error.message : "Failed to fetch memory";
    return jsonError(message, "MEMORY_FETCH_FAILED", 400);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await validateApiKey(request);
    const { id } = await context.params;
    const deleted = await deleteAgentMemoryById(identity.userId, id);

    if (!deleted) {
      return jsonError("Memory not found", "MEMORY_NOT_FOUND", 404);
    }

    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return jsonError(error.message, error.code, error.status);
    }
    const message = error instanceof Error ? error.message : "Failed to delete memory";
    return jsonError(message, "MEMORY_DELETE_FAILED", 400);
  }
}
