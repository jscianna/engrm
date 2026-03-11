/**
 * Working Memory Refresh API Endpoint
 * 
 * POST /api/v1/lifecycle/refresh-working
 * Refreshes working memory tier by promoting/demoting memories based on access patterns.
 */

import { validateApiKey } from "@/lib/api-auth";
import { errorResponse } from "@/lib/errors";
import { refreshWorkingMemory } from "@/lib/working-memory-refresh";

export const runtime = "nodejs";

/**
 * POST - Refresh working memory tier for the authenticated user
 * 
 * This endpoint:
 * 1. Promotes memories with >= 5 accesses to 'working' tier (if not already 'working' or 'critical')
 * 2. Demotes 'working' tier memories not accessed in 14+ days back to 'high' tier
 * 
 * Returns stats: { promoted: number, demoted: number }
 */
export async function POST(request: Request) {
  try {
    // Validate API key (uses lifecycle scope)
    const identity = await validateApiKey(request, "lifecycle.refresh");

    // Execute the working memory refresh
    const stats = await refreshWorkingMemory(identity.userId);

    return Response.json({
      success: true,
      stats: {
        promoted: stats.promoted,
        demoted: stats.demoted,
      },
      message: stats.promoted > 0 || stats.demoted > 0
        ? `Refreshed working memory: promoted ${stats.promoted}, demoted ${stats.demoted} memories`
        : "Working memory tier is already optimized",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
