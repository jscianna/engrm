/**
 * Cognitive Patterns API
 * 
 * GET /api/v1/cognitive/patterns - List patterns
 * POST /api/v1/cognitive/patterns - Create pattern
 */

import { validateApiKey } from "@/lib/api-auth";
import { FatHippoError, errorResponse } from "@/lib/errors";
import { getPatterns, createPattern } from "@/lib/cognitive-db";
import { logCognitiveAuditEvent } from "@/lib/cognitive-audit";
import { assertGlobalCognitiveArtifactAccess } from "@/lib/cognitive-guards";

export const runtime = "nodejs";

/**
 * GET /api/v1/cognitive/patterns
 * List patterns for user
 */
export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request, "cognitive.patterns.list");
    
    const { searchParams } = new URL(request.url);
    const domain = searchParams.get("domain") || undefined;
    
    const patterns = await getPatterns(identity.userId, domain);
    
    return Response.json({
      patterns: patterns.map(p => ({
        id: p.id,
        domain: p.domain,
        scope: p.scope,
        orgId: p.orgId,
        sourcePatternId: p.sourcePatternId,
        provenance: JSON.parse(p.provenanceJson || "{}"),
        trigger: JSON.parse(p.triggerJson),
        approach: p.approach,
        steps: p.stepsJson ? JSON.parse(p.stepsJson) : undefined,
        pitfalls: p.pitfallsJson ? JSON.parse(p.pitfallsJson) : undefined,
        confidence: p.confidence,
        successCount: p.successCount,
        failCount: p.failCount,
        sourceTraceCount: p.sourceTraceCount,
        status: p.status,
        applicationCount: p.applicationCount,
        acceptedApplicationCount: p.acceptedApplicationCount,
        successfulApplicationCount: p.successfulApplicationCount,
        medianTimeToResolutionMs: p.medianTimeToResolutionMs,
        medianRetries: p.medianRetries,
        verificationPassRate: p.verificationPassRate,
        impactScore: p.impactScore,
        promotionReason: p.promotionReason,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
      count: patterns.length,
    });
    
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/v1/cognitive/patterns
 * Create a new pattern
 */
export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "cognitive.patterns.create");
    const body = await request.json();
    
    if (!body.domain) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "domain", reason: "required" });
    }
    if (!body.trigger) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "trigger", reason: "required" });
    }
    if (!body.approach) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "approach", reason: "required" });
    }
    
    if (body.scope === "global") {
      assertGlobalCognitiveArtifactAccess(identity.agentId);
    }

    const pattern = await createPattern({
      userId: body.scope === "global" ? null : identity.userId,
      scope: body.scope === "global" ? "global" : "local",
      patternKey: typeof body.patternKey === "string" ? body.patternKey : undefined,
      sharedSignature: typeof body.sharedSignature === "string" ? body.sharedSignature : undefined,
      domain: body.domain,
      trigger: body.trigger,
      approach: body.approach,
      steps: body.steps,
      pitfalls: body.pitfalls,
      confidence: body.confidence || 0.5,
      successCount: body.successCount || 0,
      failCount: body.failCount || 0,
      sourceTraceIds: body.sourceTraceIds || [],
      sourceTraceCount: body.sourceTraceCount,
      status: body.status,
    });

    await logCognitiveAuditEvent({
      request,
      userId: identity.userId,
      action: "cognitive.pattern.create",
      resourceType: "cognitive_pattern",
      resourceId: pattern.id,
      metadata: {
        scope: pattern.scope,
        domain: pattern.domain,
        status: pattern.status,
      },
    });
    
    return Response.json({
      pattern: {
        id: pattern.id,
        domain: pattern.domain,
        scope: pattern.scope,
        orgId: pattern.orgId,
        sourcePatternId: pattern.sourcePatternId,
        provenance: JSON.parse(pattern.provenanceJson || "{}"),
        approach: pattern.approach,
        confidence: pattern.confidence,
        status: pattern.status,
        applicationCount: pattern.applicationCount,
        acceptedApplicationCount: pattern.acceptedApplicationCount,
        successfulApplicationCount: pattern.successfulApplicationCount,
        medianTimeToResolutionMs: pattern.medianTimeToResolutionMs,
        medianRetries: pattern.medianRetries,
        verificationPassRate: pattern.verificationPassRate,
        impactScore: pattern.impactScore,
        promotionReason: pattern.promotionReason,
        createdAt: pattern.createdAt,
      },
    }, { status: 201 });
    
  } catch (error) {
    return errorResponse(error);
  }
}
