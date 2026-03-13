import { validateApiKey } from "@/lib/api-auth";
import { FatHippoError, errorResponse } from "@/lib/errors";
import { getSkillById } from "@/lib/cognitive-db";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await validateApiKey(request, "cognitive.skills.get");
    const { id } = await context.params;
    const skill = await getSkillById(identity.userId, id);

    if (!skill) {
      throw new FatHippoError("MEMORY_NOT_FOUND", { resource: "skill", id });
    }

    return Response.json({
      skill: {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        scope: skill.scope,
        markdown: skill.markdown,
        content: JSON.parse(skill.contentJson),
        status: skill.status,
        published: skill.published,
        publishedTo: skill.publishedTo,
        clawHubId: skill.clawHubId,
        successRate: skill.successRate,
        qualityScore: skill.qualityScore,
        acceptedApplicationCount: skill.acceptedApplicationCount,
        successfulApplicationCount: skill.successfulApplicationCount,
        medianTimeToResolutionMs: skill.medianTimeToResolutionMs,
        medianRetries: skill.medianRetries,
        verificationPassRate: skill.verificationPassRate,
        impactScore: skill.impactScore,
        promotionReason: skill.promotionReason,
        sourceTraceCount: skill.sourceTraceCount,
        sourcePatternIds: JSON.parse(skill.sourcePatternIdsJson),
        sourceTraceIds: JSON.parse(skill.sourceTraceIdsJson),
        createdAt: skill.createdAt,
        updatedAt: skill.updatedAt,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
