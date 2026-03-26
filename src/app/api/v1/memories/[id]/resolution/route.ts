import { getAgentMemoryById, updateAgentMemory } from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { FatHippoError, errorResponse } from "@/lib/errors";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await validateApiKey(request, "memories.update");
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));

    const updates: {
      confidenceScore?: number;
      supersededBy?: string | null;
      conflictsWith?: string[];
      lastVerifiedAt?: string | null;
    } = {};

    if (typeof body.confidenceScore === "number") {
      updates.confidenceScore = body.confidenceScore;
    }
    if (body.supersededBy === null || typeof body.supersededBy === "string") {
      updates.supersededBy = body.supersededBy;
    }
    if (
      Array.isArray(body.conflictsWith) &&
      body.conflictsWith.every((item: unknown) => typeof item === "string")
    ) {
      updates.conflictsWith = body.conflictsWith;
    }
    if (body.lastVerifiedAt === null || typeof body.lastVerifiedAt === "string") {
      updates.lastVerifiedAt = body.lastVerifiedAt;
    }

    if (Object.keys(updates).length === 0) {
      throw new FatHippoError("VALIDATION_ERROR", {
        reason: "No valid fields to update (confidenceScore, supersededBy, conflictsWith, lastVerifiedAt)",
      });
    }

    if (typeof updates.supersededBy === "string") {
      const successor = await getAgentMemoryById(identity.userId, updates.supersededBy, { excludeSensitive: false });
      if (!successor) {
        throw new FatHippoError("VALIDATION_ERROR", { field: "supersededBy", reason: "memory_not_found" });
      }
      if (updates.supersededBy === id) {
        throw new FatHippoError("VALIDATION_ERROR", { field: "supersededBy", reason: "cannot_self_supersede" });
      }
    }

    const updated = await updateAgentMemory(identity.userId, id, updates);
    if (!updated) {
      throw new FatHippoError("MEMORY_NOT_FOUND");
    }

    const memory = await getAgentMemoryById(identity.userId, id, { excludeSensitive: true });
    return Response.json({ memory });
  } catch (error) {
    return errorResponse(error);
  }
}
