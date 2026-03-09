import { applyMemoryFeedback, markRetrievalEvaluationAccepted } from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { isObject } from "@/lib/api-v1";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "feedback.create");
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body) || typeof body.memoryId !== "string" || !body.memoryId.trim()) {
      throw new MemryError("VALIDATION_ERROR", { field: "memoryId", reason: "required" });
    }

    if (body.rating !== "positive" && body.rating !== "negative") {
      throw new MemryError("VALIDATION_ERROR", { field: "rating", reason: "must be positive or negative" });
    }

    const evaluationId =
      typeof body.evaluationId === "string" && body.evaluationId.trim()
        ? body.evaluationId.trim()
        : typeof body.evalId === "string" && body.evalId.trim()
          ? body.evalId.trim()
          : undefined;

    const memory = await applyMemoryFeedback({
      userId: identity.userId,
      memoryId: body.memoryId.trim(),
      rating: body.rating,
    });

    if (!memory) {
      throw new MemryError("MEMORY_NOT_FOUND");
    }

    const evaluation = evaluationId
      ? await markRetrievalEvaluationAccepted({
          userId: identity.userId,
          evaluationId,
          acceptedId: memory.id,
        })
      : null;

    return Response.json({
      memory,
      feedback: {
        rating: body.rating,
        query: typeof body.query === "string" ? body.query : undefined,
        evaluationId,
      },
      evaluation,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
