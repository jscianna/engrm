import { validateApiKey } from "@/lib/api-auth";
import { errorResponse } from "@/lib/errors";
import { exportCognitiveUserData } from "@/lib/cognitive-db";
import { logCognitiveAuditEvent } from "@/lib/cognitive-audit";
import { enforceRequestThrottle } from "@/lib/request-throttle";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request, "cognitive.privacy.export");
    await enforceRequestThrottle({
      scope: "api.cognitive.privacy.export",
      actorKey: identity.userId.toLowerCase(),
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    const payload = await exportCognitiveUserData(identity.userId);
    await logCognitiveAuditEvent({
      request,
      userId: identity.userId,
      action: "cognitive.export",
      resourceType: "cognitive_data",
      resourceId: identity.userId,
      metadata: {
        traces: payload.traces.length,
        applications: payload.applications.length,
        patterns: payload.patterns.length,
        skills: payload.skills.length,
        benchmarkRuns: payload.benchmarkRuns.length,
      },
    });

    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename=\"fathippo-cognitive-export-${identity.userId}.json\"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
