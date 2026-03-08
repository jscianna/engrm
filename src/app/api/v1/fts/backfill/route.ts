/**
 * FTS Backfill Endpoint
 * 
 * Populates the FTS5 index from existing memories.
 * Run once after deploying hybrid search.
 */

import { backfillFtsIndex, getFtsStats } from "@/lib/fts";
import { validateApiKey } from "@/lib/api-auth";
import { errorResponse } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "fts.backfill");

    const result = await backfillFtsIndex(identity.userId);

    return Response.json({
      success: true,
      indexed: result.indexed,
      message: `Indexed ${result.indexed} memories for full-text search`,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request, "fts.stats");

    const stats = await getFtsStats(identity.userId);

    return Response.json({
      fts: {
        enabled: stats.tableExists,
        indexed: stats.indexed,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
