/**
 * Pattern Match API
 * 
 * POST /api/v1/cognitive/patterns/match - Find patterns matching a problem
 */

import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { getPatterns } from "@/lib/cognitive-db";

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
      throw new MemryError("VALIDATION_ERROR", { field: "problem", reason: "required" });
    }
    
    const allPatterns = await getPatterns(identity.userId);
    const problemLower = problem.toLowerCase();
    
    // Score each pattern
    const scored = allPatterns
      .filter(p => p.status !== 'deprecated')
      .map(p => {
        const trigger = JSON.parse(p.triggerJson);
        let score = 0;
        
        // Keyword matches
        for (const keyword of (trigger.keywords || [])) {
          if (problemLower.includes(keyword.toLowerCase())) {
            score += 2;
          }
        }
        
        // Technology matches
        for (const tech of (trigger.technologies || [])) {
          if (technologies.some((t: string) => t.toLowerCase() === tech.toLowerCase())) {
            score += 3;
          }
        }
        
        // Error pattern matches
        for (const errorPattern of (trigger.errorPatterns || [])) {
          try {
            const regex = new RegExp(errorPattern, 'i');
            if (regex.test(problem)) {
              score += 5;
            }
          } catch {
            // Invalid regex, skip
          }
        }
        
        // Factor in confidence
        score *= p.confidence;
        
        return { pattern: p, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    
    return Response.json({
      patterns: scored.map(({ pattern: p, score }) => ({
        id: p.id,
        domain: p.domain,
        trigger: JSON.parse(p.triggerJson),
        approach: p.approach,
        confidence: p.confidence,
        score,
      })),
    });
    
  } catch (error) {
    return errorResponse(error);
  }
}
