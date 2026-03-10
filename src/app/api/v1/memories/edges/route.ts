/**
 * Memory Edges API (Agent API - v1)
 * 
 * POST /api/v1/memories/edges - Create edge between memories
 * GET /api/v1/memories/edges - List all edges for user
 */

import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { createMemoryEdge, getMemoryById, listMemoryEdgesByUser } from "@/lib/db";
import type { MemoryRelationshipType } from "@/lib/types";

export const runtime = "nodejs";

const ALLOWED_RELATIONSHIP_TYPES: MemoryRelationshipType[] = [
  "similar",
  "same_entity",
  "updates",
  "contradicts",
  "extends",
  "derives_from",
  "references",
];

/**
 * GET /api/v1/memories/edges
 * List all edges for the authenticated user
 */
export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request, "edges.list");
    
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") || 250), 500);
    
    const edges = await listMemoryEdgesByUser(identity.userId, limit);
    
    return Response.json({ 
      edges,
      count: edges.length,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/v1/memories/edges
 * Create an edge between two memories
 */
export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "edges.create");
    const body = await request.json();
    
    const sourceId = typeof body.sourceId === "string" ? body.sourceId.trim() : null;
    const targetId = typeof body.targetId === "string" ? body.targetId.trim() : null;
    const relationshipType = typeof body.relationshipType === "string" 
      ? body.relationshipType.trim() as MemoryRelationshipType 
      : null;
    const weight = typeof body.weight === "number" ? body.weight : 1.0;
    const metadata = body.metadata || null;
    
    if (!sourceId) {
      throw new MemryError("VALIDATION_ERROR", { field: "sourceId", reason: "required" });
    }
    if (!targetId) {
      throw new MemryError("VALIDATION_ERROR", { field: "targetId", reason: "required" });
    }
    if (!relationshipType) {
      throw new MemryError("VALIDATION_ERROR", { field: "relationshipType", reason: "required" });
    }
    if (sourceId === targetId) {
      throw new MemryError("VALIDATION_ERROR", { reason: "sourceId and targetId must be different" });
    }
    if (!ALLOWED_RELATIONSHIP_TYPES.includes(relationshipType)) {
      throw new MemryError("VALIDATION_ERROR", { 
        field: "relationshipType", 
        reason: `must be one of: ${ALLOWED_RELATIONSHIP_TYPES.join(", ")}` 
      });
    }
    
    // Verify both memories exist and belong to user
    const [sourceMemory, targetMemory] = await Promise.all([
      getMemoryById(sourceId),
      getMemoryById(targetId),
    ]);
    
    if (!sourceMemory || sourceMemory.userId !== identity.userId) {
      throw new MemryError("MEMORY_NOT_FOUND", { resource: "source_memory", id: sourceId });
    }
    if (!targetMemory || targetMemory.userId !== identity.userId) {
      throw new MemryError("MEMORY_NOT_FOUND", { resource: "target_memory", id: targetId });
    }
    
    const edge = await createMemoryEdge({
      userId: identity.userId,
      sourceId,
      targetId,
      relationshipType,
      weight,
      metadata,
    });
    
    return Response.json({ edge }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
