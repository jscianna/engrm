/**
 * Cognitive Traces API
 * 
 * POST /api/v1/cognitive/traces - Store a coding trace
 * GET /api/v1/cognitive/traces - List recent traces
 */

import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { createTrace, getMatchingPatterns, getRecentTraces, syncTracePatternMatches } from "@/lib/cognitive-db";

export const runtime = "nodejs";

/**
 * POST /api/v1/cognitive/traces
 * Store a coding trace
 */
export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "cognitive.traces.create");
    const body = await request.json();
    
    // Validate required fields
    if (!body.sessionId) {
      throw new MemryError("VALIDATION_ERROR", { field: "sessionId", reason: "required" });
    }
    if (!body.type) {
      throw new MemryError("VALIDATION_ERROR", { field: "type", reason: "required" });
    }
    if (!body.problem) {
      throw new MemryError("VALIDATION_ERROR", { field: "problem", reason: "required" });
    }
    if (!body.outcome) {
      throw new MemryError("VALIDATION_ERROR", { field: "outcome", reason: "required" });
    }
    if (!body.sanitized) {
      throw new MemryError("VALIDATION_ERROR", { field: "sanitized", reason: "trace must be sanitized before storage" });
    }
    
    const trace = await createTrace({
      userId: identity.userId,
      sessionId: body.sessionId,
      type: body.type,
      problem: body.problem,
      context: body.context || {},
      reasoning: body.reasoning || "",
      approaches: body.approaches || [],
      solution: body.solution,
      outcome: body.outcome,
      heuristicOutcome: body.heuristicOutcome,
      automatedOutcome: body.automatedOutcome,
      automatedSignals: body.automatedSignals,
      errorMessage: body.errorMessage,
      toolsUsed: body.toolsUsed || [],
      filesModified: body.filesModified || [],
      durationMs: body.durationMs || 0,
      sanitized: body.sanitized,
      sanitizedAt: body.sanitizedAt,
      shareEligible: body.shareEligible,
      explicitFeedbackNotes: body.notes,
    });
    
    const technologies = Array.isArray(body.context?.technologies)
      ? body.context.technologies.filter((value: unknown): value is string => typeof value === "string")
      : [];
    const matchedPatterns = await getMatchingPatterns({
      userId: identity.userId,
      problem: body.problem,
      technologies,
      limit: 5,
    });
    await syncTracePatternMatches({
      userId: identity.userId,
      traceId: trace.id,
      patterns: matchedPatterns.map((pattern) => ({ id: pattern.id, score: pattern.score })),
      matchSource: "trace_capture",
    });
    
    return Response.json({
      trace: {
        id: trace.id,
        sessionId: trace.sessionId,
        type: trace.type,
        problem: trace.problem,
        outcome: trace.outcome,
        outcomeSource: trace.outcomeSource,
        outcomeConfidence: trace.outcomeConfidence,
        shareEligible: trace.shareEligible,
        createdAt: trace.createdAt,
      },
      matchedPatterns: matchedPatterns.map(p => ({
        id: p.id,
        domain: p.domain,
        approach: p.approach,
        confidence: p.confidence,
        score: p.score,
        scope: p.scope,
      })),
    }, { status: 201 });
    
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * GET /api/v1/cognitive/traces
 * List recent traces
 */
export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request, "cognitive.traces.list");
    
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") || 20), 100);
    
    const traces = await getRecentTraces(identity.userId, limit);
    
    return Response.json({
      traces: traces.map(t => ({
        id: t.id,
        sessionId: t.sessionId,
        type: t.type,
        problem: t.problem,
        outcome: t.outcome,
        outcomeSource: t.outcomeSource,
        outcomeConfidence: t.outcomeConfidence,
        shareEligible: t.shareEligible,
        durationMs: t.durationMs,
        createdAt: t.createdAt,
      })),
      count: traces.length,
    });
    
  } catch (error) {
    return errorResponse(error);
  }
}
