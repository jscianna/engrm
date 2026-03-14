/**
 * Memory Reinforcement Endpoint
 * 
 * Explicit feedback that weighs more than passive access.
 * +1 reinforcement = +5 to access_count equivalent
 * -1 reinforcement = -3 to access_count equivalent
 * 
 * POST /api/v1/memories/{id}/reinforce
 */

import { markRetrievalEvaluationAccepted, reinforceMemoryExplicit } from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { FatHippoError, errorResponse } from "@/lib/errors";
import { isObject } from "@/lib/api-v1";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await validateApiKey(request, "memories.reinforce");
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body)) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "body", reason: "required" });
    }

    // Validate value is 1 or -1
    const value = body.value;
    if (value !== 1 && value !== -1) {
      throw new FatHippoError("VALIDATION_ERROR", { 
        field: "value", 
        reason: "Must be 1 (positive) or -1 (negative)" 
      });
    }

    const evaluationId =
      typeof body.evaluationId === "string" && body.evaluationId.trim()
        ? body.evaluationId.trim()
        : typeof body.evalId === "string" && body.evalId.trim()
          ? body.evalId.trim()
          : undefined;

    // Apply reinforcement
    const result = await reinforceMemoryExplicit(identity.userId, id, value);

    if (!result) {
      throw new FatHippoError("MEMORY_NOT_FOUND");
    }

    const evaluation = evaluationId
      ? await markRetrievalEvaluationAccepted({
          userId: identity.userId,
          evaluationId,
          acceptedId: id,
        })
      : null;

    // Build response message
    let message = `Memory ${value === 1 ? "reinforced" : "weakened"}.`;
    if (result.promoted) {
      message += ` Promoted to ${result.newTier} tier.`;
    } else if (result.demoted) {
      message += ` Demoted to ${result.newTier} tier.`;
    }

    return Response.json({
      memoryId: id,
      feedbackScore: result.feedbackScore,
      accessCount: result.accessCount,
      newTier: result.newTier,
      promoted: result.promoted,
      demoted: result.demoted,
      evaluation,
      message,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
