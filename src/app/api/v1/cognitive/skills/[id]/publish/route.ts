import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { publishSkill } from "@/lib/cognitive-db";

export const runtime = "nodejs";

function canPublishGlobal(agentId: string): boolean {
  const allowed = (process.env.COGNITIVE_GLOBAL_PUBLISH_AGENT_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowed.includes(agentId);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await validateApiKey(request, "cognitive.skills.publish");
    const { id } = await context.params;
    const skill = await publishSkill({
      userId: identity.userId,
      skillId: id,
      allowGlobal: canPublishGlobal(identity.agentId),
    });

    if (!skill) {
      throw new MemryError("MEMORY_NOT_FOUND", { resource: "skill", id });
    }

    return Response.json({
      skill: {
        id: skill.id,
        status: skill.status,
        published: skill.published,
        publishedTo: skill.publishedTo,
        clawHubId: skill.clawHubId,
        updatedAt: skill.updatedAt,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
