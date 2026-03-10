import { validateApiKey } from "@/lib/api-auth";
import { errorResponse } from "@/lib/errors";
import { releaseJobLease, synthesizeEligibleSkills, tryAcquireJobLease } from "@/lib/cognitive-db";

export const runtime = "nodejs";

const JOB_NAME = "cognitive-skill-synthesis";
const DEFAULT_INTERVAL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_LEASE_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "cognitive.skills.synthesize");
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
      const skills = await synthesizeEligibleSkills({ userId: identity.userId });
      await releaseJobLease({
        jobName,
        leaseToken: lease.leaseToken,
        success: true,
        checkpoint: {
          userId: identity.userId,
          synthesized: skills.length,
        },
      });

      return Response.json({
        ran: true,
        skills: skills.map((skill) => ({
          id: skill.id,
          name: skill.name,
          scope: skill.scope,
          status: skill.status,
          successRate: skill.successRate,
        })),
        count: skills.length,
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
