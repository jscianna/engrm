/**
 * Context Refresh Endpoint
 * 
 * For mid-conversation context updates when topic drifts.
 * Compares recent message embeddings with currently loaded memories
 * to detect when context should be refreshed.
 * 
 * POST /api/v1/context/refresh
 */

import { embedQuery } from "@/lib/embeddings";
import { semanticSearchVectors } from "@/lib/qdrant";
import { getAgentMemoriesByIds } from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { FatHippoError, errorResponse } from "@/lib/errors";
import { isObject } from "@/lib/api-v1";

export const runtime = "nodejs";

// Threshold for suggesting context refresh (50% difference in high-tier memories)
const REFRESH_THRESHOLD = 0.5;

// Minimum similarity for memory to be considered relevant
const RELEVANCE_THRESHOLD = 0.7;

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "context.refresh");
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body)) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "body", reason: "required" });
    }

    // Validate recentMessages
    const recentMessages = Array.isArray(body.recentMessages) 
      ? body.recentMessages.filter((m): m is string => typeof m === "string" && m.trim().length > 0)
      : [];

    if (recentMessages.length === 0) {
      throw new FatHippoError("VALIDATION_ERROR", { 
        field: "recentMessages", 
        reason: "At least one recent message is required" 
      });
    }

    // Validate currentHighIds
    const currentHighIds = Array.isArray(body.currentHighIds)
      ? body.currentHighIds.filter((id): id is string => typeof id === "string")
      : [];

    // Combine recent messages for embedding
    const combinedMessages = recentMessages.join(" ");
    const vector = await embedQuery(combinedMessages);

    // Search for relevant high-tier memories based on recent conversation
    const hits = await semanticSearchVectors({
      userId: identity.userId,
      query: combinedMessages,
      vector,
      topK: 20, // Get more than we need to filter by tier
    });

    // Get full memory records to filter by tier
    const memories = await getAgentMemoriesByIds({
      userId: identity.userId,
      ids: hits.map((hit) => hit.item.id),
      excludeAbsorbed: true,
      excludeSensitive: true,
    });

    // Filter to high-tier memories and those above relevance threshold
    const relevantHighMemories = memories
      .filter((m) => m.importanceTier === "high")
      .filter((m) => {
        const hit = hits.find((h) => h.item.id === m.id);
        return hit && hit.score >= RELEVANCE_THRESHOLD;
      })
      .slice(0, 10); // Limit to top 10

    const newHighIds = new Set(relevantHighMemories.map((m) => m.id));
    const currentHighSet = new Set(currentHighIds);

    // Calculate overlap between current and suggested memories
    const overlap = [...newHighIds].filter((id) => currentHighSet.has(id)).length;
    const totalUnique = new Set([...newHighIds, ...currentHighIds]).size;
    const overlapRatio = totalUnique > 0 ? overlap / totalUnique : 1;

    // Determine if refresh is needed
    const shouldRefresh = overlapRatio < (1 - REFRESH_THRESHOLD);

    // Find IDs to remove (in current but not relevant anymore)
    const remove = currentHighIds.filter((id) => !newHighIds.has(id));

    // Build reason message
    let reason = "Context is still relevant";
    if (shouldRefresh) {
      const currentTitles = await getAgentMemoriesByIds({
        userId: identity.userId,
        ids: currentHighIds.slice(0, 3),
        excludeAbsorbed: true,
        excludeSensitive: true,
      });
      const newTitles = relevantHighMemories.slice(0, 3);

      const oldTopics = currentTitles.map((m) => m.title).join(", ") || "previous context";
      const newTopics = newTitles.map((m) => m.title).join(", ") || "new topics";
      
      reason = `Topic shifted from '${oldTopics.slice(0, 50)}' to '${newTopics.slice(0, 50)}'`;
    }

    const response = {
      action: shouldRefresh ? "refresh" : "keep",
      newHigh: shouldRefresh ? relevantHighMemories.map((m) => ({
        id: m.id,
        title: m.title,
        text: m.text,
        type: m.memoryType,
        tier: m.importanceTier,
        createdAt: m.createdAt,
      })) : [],
      remove,
      reason,
      stats: {
        currentCount: currentHighIds.length,
        suggestedCount: newHighIds.size,
        overlapCount: overlap,
        overlapRatio: Math.round(overlapRatio * 100) / 100,
      },
    };

    return Response.json(response);
  } catch (error) {
    return errorResponse(error);
  }
}
