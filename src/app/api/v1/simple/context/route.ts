/**
 * Simple Context Endpoint
 * 
 * Get formatted context string ready to inject into prompts.
 * Returns human-readable text, not JSON.
 */

import { embedText } from "@/lib/embeddings";
import { semanticSearchVectors } from "@/lib/qdrant";
import { 
  getCriticalMemories, 
  getAgentMemoriesByIds,
  incrementAccessCounts,
} from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { isObject } from "@/lib/api-v1";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "simple.context");
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body)) {
      throw new MemryError("VALIDATION_ERROR", { field: "body", reason: "Invalid request body" });
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";

    // Get critical memories (always included)
    const criticalMemories = await getCriticalMemories(identity.userId);

    // Get relevant memories based on message
    let relevantMemories: typeof criticalMemories = [];
    
    if (message) {
      try {
        const vector = await embedText(message);
        const hits = await semanticSearchVectors({
          userId: identity.userId,
          query: message,
          vector,
          topK: 10,
        });

        if (hits.length > 0) {
          const memories = await getAgentMemoriesByIds({
            userId: identity.userId,
            ids: hits.map((h) => h.item.id),
          });
          
          relevantMemories = memories.filter(
            (m) => m.importanceTier === "high" || m.importanceTier === "normal"
          );

          // Track access
          const accessedIds = memories.map((m) => m.id);
          incrementAccessCounts(identity.userId, accessedIds).catch(() => {});
        }
      } catch {
        // Search failed, continue with critical only
      }
    }

    // Dedupe
    const criticalIds = new Set(criticalMemories.map((m) => m.id));
    const dedupedRelevant = relevantMemories
      .filter((m) => !criticalIds.has(m.id))
      .slice(0, 5);

    // Build formatted context string
    const lines: string[] = [];
    
    if (criticalMemories.length > 0 || dedupedRelevant.length > 0) {
      lines.push("Here's what you know about this user:");
      lines.push("");
    }

    // Add critical memories
    if (criticalMemories.length > 0) {
      lines.push("## Core Information");
      for (const m of criticalMemories) {
        lines.push(`- ${m.text}`);
      }
      lines.push("");
    }

    // Add relevant memories
    if (dedupedRelevant.length > 0) {
      lines.push("## Relevant Context");
      for (const m of dedupedRelevant) {
        lines.push(`- ${m.text}`);
      }
      lines.push("");
    }

    // Add instruction if we have context
    if (lines.length > 0) {
      lines.push("Use this context to personalize your responses.");
    }

    const context = lines.join("\n");

    // Return as plain text with content-type header
    return new Response(context || "No relevant context found.", {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
