/**
 * Pattern Feedback API
 * 
 * POST /api/v1/cognitive/patterns/feedback - Submit feedback on pattern
 */

import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { updatePatternFeedback } from "@/lib/cognitive-db";

export const runtime = "nodejs";

/**
 * POST /api/v1/cognitive/patterns/feedback
 * Submit feedback on whether a pattern helped
 */
export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "cognitive.patterns.feedback");
    const body = await request.json();
    
    const patternId = typeof body.patternId === "string" ? body.patternId : "";
    const traceId = typeof body.traceId === "string" ? body.traceId : "";
    const outcome = body.outcome as 'success' | 'failure';
    
    if (!patternId) {
      throw new MemryError("VALIDATION_ERROR", { field: "patternId", reason: "required" });
    }
    if (!traceId) {
      throw new MemryError("VALIDATION_ERROR", { field: "traceId", reason: "required" });
    }
    if (outcome !== 'success' && outcome !== 'failure') {
      throw new MemryError("VALIDATION_ERROR", { field: "outcome", reason: "must be 'success' or 'failure'" });
    }
    
    await updatePatternFeedback({
      userId: identity.userId,
      patternId,
      traceId,
      outcome,
      notes: typeof body.notes === "string" ? body.notes : null,
    });
    
    return Response.json({
      updated: true,
      patternId,
      traceId,
      outcome,
    });
    
  } catch (error) {
    return errorResponse(error);
  }
}
