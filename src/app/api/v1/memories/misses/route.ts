/**
 * Memory Misses List Endpoint
 * 
 * Retrieve logged memory misses to understand what information is missing.
 */

import { getMisses } from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { errorResponse } from "@/lib/errors";
import { normalizeLimit } from "@/lib/api-v1";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request, "memories.misses");
    const url = new URL(request.url);
    const limit = normalizeLimit(url.searchParams.get("limit"), 50, 200);

    const misses = await getMisses(identity.userId, limit);

    return Response.json({
      misses,
      count: misses.length,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
