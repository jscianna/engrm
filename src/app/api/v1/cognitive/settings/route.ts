import { validateApiKey } from "@/lib/api-auth";
import { errorResponse } from "@/lib/errors";
import { getCognitiveUserSettings, updateCognitiveUserSettings } from "@/lib/cognitive-db";
import { logCognitiveAuditEvent } from "@/lib/cognitive-audit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request, "cognitive.settings.get");
    const settings = await getCognitiveUserSettings(identity.userId);
    return Response.json({ settings });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "cognitive.settings.update");
    const body = await request.json().catch(() => ({}));
    const settings = await updateCognitiveUserSettings({
      userId: identity.userId,
      sharedLearningEnabled:
        typeof body.sharedLearningEnabled === "boolean" ? body.sharedLearningEnabled : undefined,
      benchmarkInclusionEnabled:
        typeof body.benchmarkInclusionEnabled === "boolean" ? body.benchmarkInclusionEnabled : undefined,
      traceRetentionDays:
        typeof body.traceRetentionDays === "number" ? body.traceRetentionDays : undefined,
    });
    await logCognitiveAuditEvent({
      request,
      userId: identity.userId,
      action: "cognitive.settings.update",
      resourceType: "cognitive_settings",
      resourceId: identity.userId,
      metadata: {
        sharedLearningEnabled: settings.sharedLearningEnabled,
        benchmarkInclusionEnabled: settings.benchmarkInclusionEnabled,
        traceRetentionDays: settings.traceRetentionDays,
      },
    });
    return Response.json({ settings });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  return POST(request);
}
