import { validateApiKey } from "@/lib/api-auth";
import { errorResponse } from "@/lib/errors";
import { releaseJobLease, runPatternExtraction, tryAcquireJobLease } from "@/lib/cognitive-db";
import { logCognitiveAuditEvent } from "@/lib/cognitive-audit";

export const runtime = "nodejs";

const JOB_NAME = "cognitive-pattern-extraction";
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_LEASE_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "cognitive.patterns.extract");
    const body = await request.json().catch(() => ({}));
    const intervalMs = typeof body.intervalMs === "number" ? Math.max(60_000, body.intervalMs) : DEFAULT_INTERVAL_MS;
    const leaseMs = typeof body.leaseMs === "number" ? Math.max(60_000, body.leaseMs) : DEFAULT_LEASE_MS;
    const jobName = `${JOB_NAME}:${identity.userId}`;

    const lease = await tryAcquireJobLease({
      jobName,
      intervalMs,
      leaseMs,
    });

    if (!lease) {
      return Response.json({
        ran: false,
        reason: "lease_not_acquired_or_interval_not_elapsed",
      });
    }

    try {
      const result = await runPatternExtraction({
        userId: identity.userId,
        includeGlobal: true,
      });

      await releaseJobLease({
        jobName,
        leaseToken: lease.leaseToken,
        success: true,
        checkpoint: {
          userId: identity.userId,
          localPatterns: result.localPatterns,
          globalPatterns: result.globalPatterns,
        },
      });

      await logCognitiveAuditEvent({
        request,
        userId: identity.userId,
        action: "cognitive.pattern.extract",
        resourceType: "cognitive_job",
        resourceId: jobName,
        metadata: {
          localPatterns: result.localPatterns,
          globalPatterns: result.globalPatterns,
          touchedPatternIds: result.touchedPatternIds.length,
        },
      });

      return Response.json({
        ran: true,
        localPatterns: result.localPatterns,
        globalPatterns: result.globalPatterns,
        touchedPatternIds: result.touchedPatternIds,
      });
    } catch (error) {
      await releaseJobLease({
        jobName,
        leaseToken: lease.leaseToken,
        success: false,
      });
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}
