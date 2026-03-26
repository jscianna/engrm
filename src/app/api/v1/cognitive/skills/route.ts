import { validateApiKey } from "@/lib/api-auth";
import { errorResponse } from "@/lib/errors";
import { getSkills, createAgentSkill } from "@/lib/cognitive-db";
import { logCognitiveAuditEvent } from "@/lib/cognitive-audit";

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

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "cognitive.skills.create");
    const body = await request.json() as Record<string, unknown>;

    if (!body.name || !body.description || !Array.isArray(body.procedure) || body.procedure.length === 0) {
      return Response.json({ error: "name, description, and procedure are required" }, { status: 400 });
    }

    const content = {
      whenToUse: typeof body.whenToUse === "string" ? body.whenToUse : "",
      procedure: body.procedure as string[],
      commonPitfalls: Array.isArray(body.pitfalls) ? body.pitfalls : [],
      verification: typeof body.verification === "string" ? body.verification : "",
    };

    const skill = await createAgentSkill({
      userId: identity.userId,
      name: body.name as string,
      description: body.description as string,
      contentJson: JSON.stringify(content),
      category: typeof body.category === "string" ? body.category : "agent-created",
      technologies: Array.isArray(body.technologies) ? body.technologies as string[] : [],
      source: typeof body.source === "string" ? body.source : "agent-explicit",
      status: typeof body.status === "string" ? body.status : "pending_review",
    });

    await logCognitiveAuditEvent({
      request,
      userId: identity.userId,
      action: "cognitive.skill.synthesize",
      resourceType: "cognitive_skill",
      resourceId: skill.id,
      metadata: {
        name: skill.name,
        source: typeof body.source === "string" ? body.source : "agent-explicit",
        status: skill.status,
        category: typeof body.category === "string" ? body.category : "agent-created",
      },
    });

    return Response.json({ created: true, skill });
  } catch (error) {
    return errorResponse(error);
  }
}
