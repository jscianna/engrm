import { validateApiKey } from "@/lib/api-auth";
import { errorResponse } from "@/lib/errors";
import { getLocalRetrievalMetrics } from "@/lib/local-retrieval";
import { getCompactionSafetyMetrics } from "@/lib/compaction-safety";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await validateApiKey(request, "simple.context");

    return Response.json({
      ok: true,
      localRetrieval: getLocalRetrievalMetrics(),
      compactionSafety: getCompactionSafetyMetrics(),
      note: "Process-local metrics (resets on restart)",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
