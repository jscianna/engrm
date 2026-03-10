import { validateApiKey } from "@/lib/api-auth";
import { errorResponse } from "@/lib/errors";
import { generateRetrievalEvalDataset } from "@/lib/cognitive-db";
import { CURATED_COGNITIVE_BENCHMARKS } from "@/lib/cognitive-curated-benchmarks";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request, "cognitive.eval.fixtures");
    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit")) || 100, 500));
    const acceptedOnly = searchParams.get("acceptedOnly") === "1";
    const dataset = searchParams.get("dataset");

    if (dataset === "curated") {
      return Response.json({
        fixtures: CURATED_COGNITIVE_BENCHMARKS,
        predictions: [],
        records: CURATED_COGNITIVE_BENCHMARKS.map((fixture) => ({
          applicationId: fixture.applicationId,
          sessionId: fixture.sessionId,
          endpoint: fixture.endpoint,
          labelSource: "explicit" as const,
          fixture,
          prediction: {
            applicationId: fixture.applicationId,
            sessionId: fixture.sessionId,
            traces: [],
            patterns: [],
            skills: [],
          },
        })),
      });
    }

    const generated = await generateRetrievalEvalDataset({
      userId: identity.userId,
      limit,
      acceptedOnly,
    });

    return Response.json(generated);
  } catch (error) {
    return errorResponse(error);
  }
}
