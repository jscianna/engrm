/**
 * Skill Candidates API
 * 
 * GET /api/v1/cognitive/patterns/skill-candidates - Get patterns ready for skill synthesis
 */

import { validateApiKey } from "@/lib/api-auth";
import { errorResponse } from "@/lib/errors";
import { getSkillCandidates } from "@/lib/cognitive-db";

export const runtime = "nodejs";

/**
 * GET /api/v1/cognitive/patterns/skill-candidates
 * Get patterns that are ready to be synthesized into skills
 */
export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request, "cognitive.patterns.skill-candidates");
    
    const candidates = await getSkillCandidates(identity.userId);
    
    return Response.json({
      patterns: candidates.map(p => ({
        id: p.id,
        domain: p.domain,
        trigger: JSON.parse(p.triggerJson),
        approach: p.approach,
        steps: p.stepsJson ? JSON.parse(p.stepsJson) : undefined,
        pitfalls: p.pitfallsJson ? JSON.parse(p.pitfallsJson) : undefined,
        confidence: p.confidence,
        successCount: p.successCount,
        failCount: p.failCount,
        sourceTraceIds: JSON.parse(p.sourceTraceIdsJson),
        createdAt: p.createdAt,
      })),
      count: candidates.length,
    });
    
  } catch (error) {
    return errorResponse(error);
  }
}
