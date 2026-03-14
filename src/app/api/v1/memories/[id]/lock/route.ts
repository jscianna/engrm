/**
 * Memory Tier Lock Endpoint
 * 
 * Lock a memory at a specific tier to prevent promotion past or demotion below.
 * Pass tier: null to unlock.
 * 
 * POST /api/v1/memories/{id}/lock
 * GET /api/v1/memories/{id}/lock - Get current lock status
 */

import { setMemoryLockedTier, getMemoryWithLockInfo, setMemoryDecayImmune } from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { FatHippoError, errorResponse } from "@/lib/errors";
import { isObject } from "@/lib/api-v1";
import type { MemoryImportanceTier } from "@/lib/types";

export const runtime = "nodejs";

const VALID_TIERS = ["critical", "working", "high", "normal"] as const;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await validateApiKey(request, "memories.get");
    const { id } = await context.params;

    const info = await getMemoryWithLockInfo(identity.userId, id);

    if (!info) {
      throw new FatHippoError("MEMORY_NOT_FOUND");
    }

    return Response.json({
      memoryId: info.id,
      importanceTier: info.importanceTier,
      lockedTier: info.lockedTier,
      promotionLocked: info.promotionLocked,
      decayImmune: info.decayImmune,
      accessCount: info.accessCount,
      feedbackScore: info.feedbackScore,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await validateApiKey(request, "memories.update");
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body)) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "body", reason: "required" });
    }

    // Handle tier locking
    let tierResult: { success: boolean; currentTier: MemoryImportanceTier | null } | null = null;
    
    if ("tier" in body) {
      const tier = body.tier;
      
      // Validate tier is valid or null (to unlock)
      if (tier !== null && !VALID_TIERS.includes(tier as (typeof VALID_TIERS)[number])) {
        throw new FatHippoError("VALIDATION_ERROR", { 
          field: "tier", 
          reason: `Must be one of: ${VALID_TIERS.join(", ")}, or null to unlock` 
        });
      }

      tierResult = await setMemoryLockedTier(
        identity.userId, 
        id, 
        tier as MemoryImportanceTier | null
      );

      if (!tierResult.success) {
        throw new FatHippoError("MEMORY_NOT_FOUND");
      }
    }

    // Handle decay immunity (optional)
    if ("decayImmune" in body) {
      const immune = body.decayImmune === true;
      const success = await setMemoryDecayImmune(identity.userId, id, immune);
      
      if (!success && !tierResult) {
        throw new FatHippoError("MEMORY_NOT_FOUND");
      }
    }

    // Get updated info
    const info = await getMemoryWithLockInfo(identity.userId, id);

    if (!info) {
      throw new FatHippoError("MEMORY_NOT_FOUND");
    }

    // Build response message
    let message = "";
    if ("tier" in body) {
      if (body.tier === null) {
        message = "Memory unlocked. Tier can now change based on access patterns.";
      } else {
        message = `Memory locked at ${body.tier} tier.`;
      }
    }
    if ("decayImmune" in body) {
      if (message) message += " ";
      message += body.decayImmune 
        ? "Decay immunity enabled." 
        : "Decay immunity disabled.";
    }

    return Response.json({
      memoryId: info.id,
      importanceTier: info.importanceTier,
      lockedTier: info.lockedTier,
      promotionLocked: info.promotionLocked,
      decayImmune: info.decayImmune,
      message: message || "Lock status retrieved.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
