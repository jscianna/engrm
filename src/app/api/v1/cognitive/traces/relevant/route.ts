/**
 * Relevant Traces API
 * 
 * POST /api/v1/cognitive/traces/relevant - Get traces relevant to a problem
 */

import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { getRelevantTraces, getPatterns, getSkillCandidates } from "@/lib/cognitive-db";

export const runtime = "nodejs";

/**
 * POST /api/v1/cognitive/traces/relevant
 * Get traces relevant to a problem
 */
export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "cognitive.traces.relevant");
    const body = await request.json();
    
    const problem = typeof body.problem === "string" ? body.problem : "";
    const limit = Math.min(Number(body.limit) || 5, 20);
    
    if (!problem) {
      throw new MemryError("VALIDATION_ERROR", { field: "problem", reason: "required" });
    }
    
    // Get relevant traces via vector similarity
    const traces = await getRelevantTraces(identity.userId, problem, limit);
    
    // Get matching patterns
    const allPatterns = await getPatterns(identity.userId);
    const problemLower = problem.toLowerCase();
    const technologies = body.context?.technologies || [];
    
    const matchedPatterns = allPatterns.filter(p => {
      if (p.status === 'deprecated') return false;
      
      const trigger = JSON.parse(p.triggerJson);
      
      // Check keyword matches
      const keywordMatch = trigger.keywords?.some((k: string) => 
        problemLower.includes(k.toLowerCase())
      );
      
      // Check technology matches
      const techMatch = trigger.technologies?.some((t: string) =>
        technologies.some((ut: string) => ut.toLowerCase() === t.toLowerCase())
      );
      
      return keywordMatch || techMatch;
    }).slice(0, 5);
    
    // Get synthesized skills (placeholder for now)
    const skills: unknown[] = [];
    
    return Response.json({
      traces: traces.map(t => ({
        id: t.id,
        type: t.type,
        problem: t.problem,
        reasoning: t.reasoning.slice(0, 500),
        solution: t.solution?.slice(0, 500),
        outcome: t.outcome,
        context: JSON.parse(t.contextJson),
        createdAt: t.createdAt,
      })),
      patterns: matchedPatterns.map(p => ({
        id: p.id,
        domain: p.domain,
        approach: p.approach,
        confidence: p.confidence,
        trigger: JSON.parse(p.triggerJson),
      })),
      skills,
    });
    
  } catch (error) {
    return errorResponse(error);
  }
}
