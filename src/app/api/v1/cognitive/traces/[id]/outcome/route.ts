import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { updateTraceOutcome } from "@/lib/cognitive-db";
import { logCognitiveAuditEvent } from "@/lib/cognitive-audit";

export const runtime = "nodejs";

async function updateOutcome(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await validateApiKey(request, "cognitive.traces.outcome");
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));

    const outcome = body.outcome;
    if (
      outcome !== "success" &&
      outcome !== "partial" &&
      outcome !== "failed" &&
      outcome !== "abandoned"
    ) {
      throw new MemryError("VALIDATION_ERROR", {
        field: "outcome",
        reason: "must be success, partial, failed, or abandoned",
      });
    }

    const trace = await updateTraceOutcome({
      userId: identity.userId,
      traceId: id,
      outcome,
      notes: typeof body.notes === "string" ? body.notes : null,
      automatedSignals:
        body.automatedSignals && typeof body.automatedSignals === "object" && !Array.isArray(body.automatedSignals)
          ? body.automatedSignals
          : null,
      applicationId: typeof body.applicationId === "string" ? body.applicationId : null,
      repoProfile:
        body.repoProfile && typeof body.repoProfile === "object" && !Array.isArray(body.repoProfile)
          ? body.repoProfile
          : null,
      materializedPatternId: typeof body.materializedPatternId === "string" ? body.materializedPatternId : null,
      materializedSkillId: typeof body.materializedSkillId === "string" ? body.materializedSkillId : null,
      retryCount: typeof body.retryCount === "number" ? body.retryCount : null,
      baselineGroupKey: typeof body.baselineGroupKey === "string" ? body.baselineGroupKey : null,
      acceptedTraceId: typeof body.acceptedTraceId === "string" ? body.acceptedTraceId : null,
      acceptedPatternId: typeof body.acceptedPatternId === "string" ? body.acceptedPatternId : null,
      acceptedSkillId: typeof body.acceptedSkillId === "string" ? body.acceptedSkillId : null,
      timeToResolutionMs: typeof body.timeToResolutionMs === "number" ? body.timeToResolutionMs : null,
      verificationSummary:
        body.verificationResults && typeof body.verificationResults === "object" && !Array.isArray(body.verificationResults)
          ? body.verificationResults
          : body.verificationSummary && typeof body.verificationSummary === "object" && !Array.isArray(body.verificationSummary)
            ? body.verificationSummary
          : null,
    });

    if (!trace) {
      throw new MemryError("MEMORY_NOT_FOUND", { resource: "trace", id });
    }

    await logCognitiveAuditEvent({
      request,
      userId: identity.userId,
      action: "cognitive.trace.outcome",
      resourceType: "cognitive_trace",
      resourceId: trace.id,
      metadata: {
        outcome: trace.outcome,
        applicationId: typeof body.applicationId === "string" ? body.applicationId : null,
        acceptedTraceId: typeof body.acceptedTraceId === "string" ? body.acceptedTraceId : null,
        acceptedPatternId: typeof body.acceptedPatternId === "string" ? body.acceptedPatternId : null,
        acceptedSkillId: typeof body.acceptedSkillId === "string" ? body.acceptedSkillId : null,
      },
    });

    return Response.json({
      trace: {
        id: trace.id,
        outcome: trace.outcome,
        outcomeSource: trace.outcomeSource,
        outcomeConfidence: trace.outcomeConfidence,
        updatedAt: trace.updatedAt,
      },
      applicationId: typeof body.applicationId === "string" ? body.applicationId : null,
      acceptedTraceId: typeof body.acceptedTraceId === "string" ? body.acceptedTraceId : null,
      acceptedPatternId: typeof body.acceptedPatternId === "string" ? body.acceptedPatternId : null,
      acceptedSkillId: typeof body.acceptedSkillId === "string" ? body.acceptedSkillId : null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return updateOutcome(request, context);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return updateOutcome(request, context);
}
