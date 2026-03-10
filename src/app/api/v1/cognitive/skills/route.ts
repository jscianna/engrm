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
        successRate: skill.successRate,
        qualityScore: skill.qualityScore,
        createdAt: skill.createdAt,
        updatedAt: skill.updatedAt,
      })),
      count: skills.length,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
