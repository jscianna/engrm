/**
 * Relevant Traces API
 * 
 * POST /api/v1/cognitive/traces/relevant - Get traces relevant to a problem
 */

import { validateApiKey } from "@/lib/api-auth";
import { FatHippoError, errorResponse } from "@/lib/errors";
import {
  getMatchingPatterns,
  getRelevantSkills,
  getRelevantTraces,
  logCognitiveApplication,
  recommendAdaptivePolicyForUser,
  recommendToolWorkflowForUser,
} from "@/lib/cognitive-db";

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
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : `session_${Date.now()}`;
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "context-engine";
    const adaptivePolicyEnabled = body.adaptivePolicy !== false;
    const repoProfile =
      body.context?.repoProfile && typeof body.context.repoProfile === "object" && !Array.isArray(body.context.repoProfile)
        ? body.context.repoProfile
        : null;
    
    if (!problem) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "problem", reason: "required" });
    }
    
    const technologies = Array.isArray(body.context?.technologies)
      ? body.context.technologies.filter((value: unknown): value is string => typeof value === "string")
      : [];
    const policy = adaptivePolicyEnabled
      ? await recommendAdaptivePolicyForUser({
          userId: identity.userId,
          problem,
          endpoint,
          technologies,
          repoProfile,
          baseTraceLimit: limit,
        })
      : null;
    const workflow = adaptivePolicyEnabled
      ? await recommendToolWorkflowForUser({
          userId: identity.userId,
          problem,
          endpoint,
          technologies,
          repoProfile,
        })
      : null;

    // Get relevant traces via vector similarity
    const traces = await getRelevantTraces(identity.userId, problem, policy?.traceLimit ?? limit);
    const matchedPatterns = await getMatchingPatterns({
      userId: identity.userId,
      problem,
      technologies,
      limit: policy?.patternLimit ?? 5,
    });
    const skills = await getRelevantSkills({
      userId: identity.userId,
      problem,
      technologies,
      limit: policy?.skillLimit ?? 3,
    });
    const application = await logCognitiveApplication({
      userId: identity.userId,
      sessionId,
      problem,
      endpoint,
      repoProfile,
      policy,
      workflow,
      traces: traces.map((trace, index) => ({
        id: trace.id,
        scope: "local",
        rank: index + 1,
      })),
      patterns: matchedPatterns.map((pattern, index) => ({
        id: pattern.id,
        scope: pattern.scope,
        rank: index + 1,
      })),
      skills: skills.map((skill, index) => ({
        id: skill.id,
        scope: skill.scope,
        rank: index + 1,
      })),
    });
    
    return Response.json({
      applicationId: application.application.id,
      policy: policy
        ? {
            key: policy.key,
            contextKey: policy.contextKey,
            rationale: policy.rationale,
            exploration: policy.exploration,
            score: policy.score,
            traceLimit: policy.traceLimit,
            patternLimit: policy.patternLimit,
            skillLimit: policy.skillLimit,
            sectionOrder: policy.sectionOrder,
          }
        : null,
      workflow: workflow
        ? {
            key: workflow.key,
            contextKey: workflow.contextKey,
            rationale: workflow.rationale,
            exploration: workflow.exploration,
            score: workflow.score,
            title: workflow.title,
            steps: workflow.steps,
          }
        : null,
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
        scope: p.scope,
        score: p.score,
      })),
      skills: skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        status: skill.status,
        successRate: skill.successRate,
        scope: skill.scope,
      })),
    });
    
  } catch (error) {
    return errorResponse(error);
  }
}
