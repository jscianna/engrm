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
    const outcome = body.outcome as 'success' | 'failure';
    
    if (!patternId) {
      throw new MemryError("VALIDATION_ERROR", { field: "patternId", reason: "required" });
    }
    if (outcome !== 'success' && outcome !== 'failure') {
      throw new MemryError("VALIDATION_ERROR", { field: "outcome", reason: "must be 'success' or 'failure'" });
    }
    
    await updatePatternFeedback(patternId, outcome);
    
    return Response.json({
      updated: true,
      patternId,
      outcome,
    });
    
  } catch (error) {
    return errorResponse(error);
  }
}
