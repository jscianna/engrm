/**
 * Cognitive Traces API
 * 
 * POST /api/v1/cognitive/traces - Store a coding trace
 * GET /api/v1/cognitive/traces - List recent traces
 */

import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { createTrace, getRecentTraces, getPatterns } from "@/lib/cognitive-db";

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
      errorMessage: body.errorMessage,
      toolsUsed: body.toolsUsed || [],
      filesModified: body.filesModified || [],
      durationMs: body.durationMs || 0,
      sanitized: body.sanitized,
      sanitizedAt: body.sanitizedAt,
    });
    
    // Find matching patterns for response
    const patterns = await getPatterns(identity.userId);
    const problem = body.problem.toLowerCase();
    const matchedPatterns = patterns.filter(p => {
      const trigger = JSON.parse(p.triggerJson);
      return trigger.keywords?.some((k: string) => problem.includes(k.toLowerCase()));
    }).slice(0, 3);
    
    return Response.json({
      trace: {
        id: trace.id,
        sessionId: trace.sessionId,
        type: trace.type,
        problem: trace.problem,
        outcome: trace.outcome,
        createdAt: trace.createdAt,
      },
      matchedPatterns: matchedPatterns.map(p => ({
        id: p.id,
        domain: p.domain,
        approach: p.approach,
        confidence: p.confidence,
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
        durationMs: t.durationMs,
        createdAt: t.createdAt,
      })),
      count: traces.length,
    });
    
  } catch (error) {
    return errorResponse(error);
  }
}
