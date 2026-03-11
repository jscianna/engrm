import { validateApiKey } from "@/lib/api-auth";
import { errorResponse } from "@/lib/errors";
import { deleteCognitiveUserData } from "@/lib/cognitive-db";
import { logCognitiveAuditEvent } from "@/lib/cognitive-audit";
import { enforceRequestThrottle } from "@/lib/request-throttle";

export const runtime = "nodejs";

export async function DELETE(request: Request) {
  try {
    const identity = await validateApiKey(request, "cognitive.privacy.delete");
    await enforceRequestThrottle({
      scope: "api.cognitive.privacy.delete",
      actorKey: identity.userId.toLowerCase(),
      limit: 2,
      windowMs: 24 * 60 * 60 * 1000,
    });
    const result = await deleteCognitiveUserData(identity.userId);
    await logCognitiveAuditEvent({
      request,
      userId: identity.userId,
      action: "cognitive.delete",
      resourceType: "cognitive_data",
      resourceId: identity.userId,
      metadata: { ...result },
    });
    return Response.json({ result });
  } catch (error) {
    return errorResponse(error);
  }
}
