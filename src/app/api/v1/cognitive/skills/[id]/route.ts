import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
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
      throw new MemryError("MEMORY_NOT_FOUND", { resource: "skill", id });
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
        successRate: skill.successRate,
        qualityScore: skill.qualityScore,
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
