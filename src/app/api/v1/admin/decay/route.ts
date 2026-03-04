/**
 * Memory Decay Admin Endpoint
 * 
 * Manually trigger decay of memory scores.
 * Memories not accessed in 7+ days have access_count reduced by 5%.
 * May also trigger auto-demotion when scores fall below thresholds.
 * 
 * POST /api/v1/admin/decay
 */

import { decayMemoryScores } from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { errorResponse } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "admin.decay");

    // Run decay for this user's memories
    const result = await decayMemoryScores(identity.userId);

    return Response.json({
      success: true,
      stats: {
        decayed: result.decayed,
        demotedToHigh: result.demotedToHigh,
        demotedToNormal: result.demotedToNormal,
        totalDemoted: result.demotedToHigh + result.demotedToNormal,
      },
      message: result.decayed > 0 
        ? `Applied decay to ${result.decayed} memories. ${result.demotedToHigh + result.demotedToNormal} memories demoted.`
        : "No memories required decay at this time.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
