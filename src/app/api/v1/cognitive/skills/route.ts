import { validateApiKey } from "@/lib/api-auth";
import { errorResponse } from "@/lib/errors";
import { getSkills } from "@/lib/cognitive-db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request, "cognitive.skills.list");
    const skills = await getSkills(identity.userId);

    return Response.json({
      skills: skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        scope: skill.scope,
        status: skill.status,
        published: skill.published,
        publishedTo: skill.publishedTo,
        sourceTraceCount: skill.sourceTraceCount,
        successRate: skill.successRate,
        qualityScore: skill.qualityScore,
        acceptedApplicationCount: skill.acceptedApplicationCount,
        successfulApplicationCount: skill.successfulApplicationCount,
        medianTimeToResolutionMs: skill.medianTimeToResolutionMs,
        medianRetries: skill.medianRetries,
        verificationPassRate: skill.verificationPassRate,
        impactScore: skill.impactScore,
        promotionReason: skill.promotionReason,
        createdAt: skill.createdAt,
        updatedAt: skill.updatedAt,
      })),
      count: skills.length,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
