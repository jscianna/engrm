import { validateApiKey } from "@/lib/api-auth";
import { errorResponse } from "@/lib/errors";
import { getAnalyticsSummary } from "@/lib/analytics";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request, "analytics");
    const summary = await getAnalyticsSummary(identity.userId);
    return Response.json(summary);
  } catch (error) {
    return errorResponse(error);
  }
}
