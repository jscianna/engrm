/**
 * Context Injection Endpoint
 * 
 * Returns tiered memories for session start:
 * - All 'critical' memories (core principles, always injected)
 * - Top N 'high' memories matching the query (if relevant)
 * 
 * Usage: Call once at session start with first user message
 */

import { embedText } from "@/lib/embeddings";
import { semanticSearchVectors } from "@/lib/qdrant";
import { getCriticalMemories, getAgentMemoriesByIds } from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { isObject } from "@/lib/api-v1";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "context");
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body)) {
      throw new MemryError("VALIDATION_ERROR", { field: "body", reason: "required" });
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    const includeHigh = body.includeHigh !== false; // default true
    const highLimit = typeof body.highLimit === "number" ? Math.min(body.highLimit, 10) : 5;

    // 1. Always get critical memories
    const criticalMemories = await getCriticalMemories(identity.userId);

    // 2. If message provided and includeHigh, search for relevant high-importance memories
    let highMemories: typeof criticalMemories = [];
    
    if (message && includeHigh) {
      const vector = await embedText(message);
      const hits = await semanticSearchVectors({
        userId: identity.userId,
        query: message,
        vector,
        topK: highLimit * 5, // Get more, filter by tier in code
      });

      if (hits.length > 0) {
        const memories = await getAgentMemoriesByIds({
          userId: identity.userId,
          ids: hits.map((hit) => hit.item.id),
        });
        
        // Filter to high tier and limit
        highMemories = memories
          .filter((m) => m.importanceTier === "high")
          .slice(0, highLimit);
      }
    }

    // 3. Deduplicate (in case a critical memory also matched)
    const criticalIds = new Set(criticalMemories.map((m) => m.id));
    const dedupedHigh = highMemories.filter((m) => !criticalIds.has(m.id));

    // 4. Format response
    const response = {
      critical: criticalMemories.map(formatMemory),
      high: dedupedHigh.map(formatMemory),
      stats: {
        criticalCount: criticalMemories.length,
        highCount: dedupedHigh.length,
        totalTokensEstimate: estimateTokens(criticalMemories) + estimateTokens(dedupedHigh),
      },
    };

    return Response.json(response);
  } catch (error) {
    return errorResponse(error);
  }
}

function formatMemory(memory: { id: string; title: string; text: string; memoryType: string; importanceTier?: string; createdAt: string }) {
  return {
    id: memory.id,
    title: memory.title,
    text: memory.text,
    type: memory.memoryType,
    tier: memory.importanceTier || "normal",
    createdAt: memory.createdAt,
  };
}

function estimateTokens(memories: { text: string }[]): number {
  // Rough estimate: 4 chars per token
  return Math.ceil(memories.reduce((sum, m) => sum + m.text.length, 0) / 4);
}
