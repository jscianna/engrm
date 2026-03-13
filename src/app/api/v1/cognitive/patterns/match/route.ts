/**
 * Pattern Match API
 * 
 * POST /api/v1/cognitive/patterns/match - Find patterns matching a problem
 */

import { validateApiKey } from "@/lib/api-auth";
import { FatHippoError, errorResponse } from "@/lib/errors";
import { getMatchingPatterns } from "@/lib/cognitive-db";

export const runtime = "nodejs";

/**
 * POST /api/v1/cognitive/patterns/match
 * Find patterns that match a given problem
 */
export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "cognitive.patterns.match");
    const body = await request.json();
    
    const problem = typeof body.problem === "string" ? body.problem : "";
    const technologies = Array.isArray(body.technologies) ? body.technologies : [];
    
    if (!problem) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "problem", reason: "required" });
    }
    
    const scored = await getMatchingPatterns({
      userId: identity.userId,
      problem,
      technologies: technologies.filter((value: unknown): value is string => typeof value === "string"),
      limit: 5,
    });
    
    return Response.json({
      patterns: scored.map((p) => ({
        id: p.id,
        domain: p.domain,
        trigger: JSON.parse(p.triggerJson),
        approach: p.approach,
        confidence: p.confidence,
        scope: p.scope,
        status: p.status,
        score: p.score,
      })),
    });
    
  } catch (error) {
    return errorResponse(error);
  }
}
