import { validateApiKey } from "@/lib/api-auth";
import { errorResponse } from "@/lib/errors";
import { getLocalRetrievalMetrics } from "@/lib/local-retrieval";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await validateApiKey(request, "simple.context");

    return Response.json({
      ok: true,
      localRetrieval: getLocalRetrievalMetrics(),
      note: "Process-local metrics (resets on restart)",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
