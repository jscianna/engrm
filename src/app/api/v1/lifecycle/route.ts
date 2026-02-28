/**
 * Memory Lifecycle API
 * 
 * GET /api/v1/lifecycle - Get lifecycle stats
 * POST /api/v1/lifecycle/maintenance - Run maintenance (archive/delete old memories)
 * POST /api/v1/lifecycle/restore/:id - Restore memory from archive
 */

import { validateApiKey } from "@/lib/api-auth";
import { errorResponse } from "@/lib/errors";
import { 
  getLifecycleStats, 
  runLifecycleMaintenance,
  LIFECYCLE_CONFIG,
} from "@/lib/memory-lifecycle";

export const runtime = "nodejs";

/**
 * GET - Get lifecycle stats for user
 */
export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request, "lifecycle.stats");
    
    const stats = await getLifecycleStats(identity.userId);
    
    return Response.json({
      stats,
      config: {
        archiveAfterDays: LIFECYCLE_CONFIG.archival.triggerDays,
        deleteStrengthThreshold: LIFECYCLE_CONFIG.deletion.strengthThreshold,
        protectionMentions: LIFECYCLE_CONFIG.deletion.protection.minMentions,
        identityNeverDelete: LIFECYCLE_CONFIG.identity.neverDelete,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST - Run lifecycle maintenance
 */
export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "lifecycle.maintenance");
    
    const stats = await runLifecycleMaintenance(identity.userId);
    
    return Response.json({
      success: true,
      maintenance: stats,
      message: stats.deleted > 0 || stats.archived > 0
        ? `Archived ${stats.archived}, deleted ${stats.deleted} memories`
        : "No memories needed archival or deletion",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
