/**
 * Session Start Endpoint
 * 
 * Start a new session and get initial context for injection.
 * Returns critical and high-tier memories relevant to the first message.
 */

import { embedText } from "@/lib/embeddings";
import { semanticSearchVectors } from "@/lib/qdrant";
import { 
  startExtendedSession, 
  getCriticalMemories, 
  getAgentMemoriesByIds,
  getNamespaceByName,
} from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { isObject } from "@/lib/api-v1";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "sessions.start");
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body)) {
      throw new MemryError("VALIDATION_ERROR", { field: "body", reason: "Invalid request body" });
    }

    const firstMessage = typeof body.firstMessage === "string" ? body.firstMessage.trim() : "";
    const metadata = isObject(body.metadata) ? body.metadata : null;
    
    // Resolve namespace if provided
    let namespaceId: string | null = null;
    if (typeof body.namespace === "string" && body.namespace.trim()) {
      const ns = await getNamespaceByName(identity.userId, body.namespace.trim());
      if (ns) {
        namespaceId = ns.id;
      }
    }

    // Start the session
    const session = await startExtendedSession({
      userId: identity.userId,
      namespaceId,
      metadata,
    });

    // Get critical memories (always injected)
    const criticalMemories = await getCriticalMemories(identity.userId);

    // Get high-tier memories relevant to first message
    let highMemories: typeof criticalMemories = [];
    
    if (firstMessage) {
      try {
        const vector = await embedText(firstMessage);
        const hits = await semanticSearchVectors({
          userId: identity.userId,
          query: firstMessage,
          vector,
          topK: 25,
        });

        if (hits.length > 0) {
          const memories = await getAgentMemoriesByIds({
            userId: identity.userId,
            ids: hits.map((h) => h.item.id),
            namespaceId,
          });
          
          // Filter to high tier only
          highMemories = memories.filter((m) => m.importanceTier === "high");
        }
      } catch {
        // Search failed, continue without high memories
      }
    }

    // Dedupe
    const criticalIds = new Set(criticalMemories.map((m) => m.id));
    const dedupedHigh = highMemories.filter((m) => !criticalIds.has(m.id)).slice(0, 5);

    // Estimate tokens
    const estimateTokens = (texts: string[]) => 
      Math.ceil(texts.reduce((sum, t) => sum + t.length, 0) / 4);

    const tokensInjected = estimateTokens([
      ...criticalMemories.map((m) => m.text),
      ...dedupedHigh.map((m) => m.text),
    ]);

    return Response.json({
      sessionId: session.id,
      context: {
        critical: criticalMemories.map((m) => ({
          id: m.id,
          title: m.title,
          text: m.text,
          type: m.memoryType,
        })),
        high: dedupedHigh.map((m) => ({
          id: m.id,
          title: m.title,
          text: m.text,
          type: m.memoryType,
        })),
      },
      stats: {
        tokensInjected,
        criticalCount: criticalMemories.length,
        highCount: dedupedHigh.length,
      },
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
