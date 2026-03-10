/**
 * Memory Edge by ID API (Agent API - v1)
 * 
 * DELETE /api/v1/memories/edges/:edgeId - Delete edge
 */

import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { deleteMemoryEdge } from "@/lib/db";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ edgeId: string }>;
}

/**
 * DELETE /api/v1/memories/edges/:edgeId
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const identity = await validateApiKey(request, "edges.delete");
    const { edgeId } = await params;
    
    if (!edgeId) {
      throw new MemryError("VALIDATION_ERROR", { field: "edgeId", reason: "required" });
    }
    
    const deleted = await deleteMemoryEdge(identity.userId, edgeId);
    
    if (!deleted) {
      throw new MemryError("MEMORY_NOT_FOUND", { resource: "edge", id: edgeId });
    }
    
    return Response.json({ deleted: true, edgeId });
  } catch (error) {
    return errorResponse(error);
  }
}
