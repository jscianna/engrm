/**
 * Memory Graph API (Agent API - v1)
 * 
 * GET /api/v1/memories/graph - Get full memory graph for visualization
 */

import { validateApiKey } from "@/lib/api-auth";
import { errorResponse } from "@/lib/errors";
import { getMemoryGraph } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/v1/memories/graph
 * Get the full knowledge graph for the user
 */
export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request, "graph.get");
    
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") || 100), 500);
    
    const graph = await getMemoryGraph(identity.userId, limit);
    
    return Response.json({
      nodes: graph.nodes,
      edges: graph.edges,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
