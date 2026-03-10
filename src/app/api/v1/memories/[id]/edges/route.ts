/**
 * Memory Edges by Memory ID API (Agent API - v1)
 * 
 * GET /api/v1/memories/:id/edges - Get all edges for a specific memory
 */

import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { getMemoryById, getMemoryEdgesForMemory } from "@/lib/db";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/memories/:id/edges
 * Get all incoming and outgoing edges for a memory
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const identity = await validateApiKey(request, "edges.listForMemory");
    const { id: memoryId } = await params;
    
    if (!memoryId) {
      throw new MemryError("VALIDATION_ERROR", { field: "id", reason: "required" });
    }
    
    // Verify memory exists and belongs to user
    const memory = await getMemoryById(memoryId);
    if (!memory || memory.userId !== identity.userId) {
      throw new MemryError("MEMORY_NOT_FOUND", { resource: "memory", id: memoryId });
    }
    
    const { incoming, outgoing } = await getMemoryEdgesForMemory(identity.userId, memoryId);
    
    return Response.json({
      memoryId,
      incoming,
      outgoing,
      totalEdges: incoming.length + outgoing.length,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
