import { validateApiKey } from "@/lib/api-auth";
import { errorResponse } from "@/lib/errors";
import { generateRetrievalEvalDataset } from "@/lib/cognitive-db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request, "cognitive.eval.fixtures");
    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit")) || 100, 500));
    const acceptedOnly = searchParams.get("acceptedOnly") === "1";

    const dataset = await generateRetrievalEvalDataset({
      userId: identity.userId,
      limit,
      acceptedOnly,
    });

    return Response.json(dataset);
  } catch (error) {
    return errorResponse(error);
  }
}
