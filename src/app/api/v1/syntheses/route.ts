import { listSynthesizedMemoriesByUser } from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { errorResponse } from "@/lib/errors";
import { normalizeLimit } from "@/lib/api-v1";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request, "syntheses.list");
    const url = new URL(request.url);
    const limit = normalizeLimit(url.searchParams.get("limit"), 50, 200);
    const syntheses = await listSynthesizedMemoriesByUser(identity.userId, limit);
    return Response.json({ syntheses });
  } catch (error) {
    return errorResponse(error);
  }
}
