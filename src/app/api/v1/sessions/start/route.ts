/**
 * Session Start Endpoint
 * 
 * Start a new session and get initial context for injection.
 * Returns critical and high-tier memories relevant to the first message.
 */

import { embedQuery } from "@/lib/embeddings";
import { semanticSearchVectors } from "@/lib/qdrant";
import {
  filterSensitiveMemories,
  startExtendedSession, 
  getCriticalMemories, 
  getAgentMemoriesByIds,
  listCriticalSynthesizedMemories,
} from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { FatHippoError, errorResponse } from "@/lib/errors";
import { getRequestedNamespace, isObject, resolveNamespaceIdOrError } from "@/lib/api-v1";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "sessions.start");
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body)) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "body", reason: "Invalid request body" });
    }

    const firstMessage = typeof body.firstMessage === "string" ? body.firstMessage.trim() : "";
    const metadata = isObject(body.metadata) ? body.metadata : null;
    const requestedNamespace = getRequestedNamespace(
      request,
      typeof body.namespace === "string" ? body.namespace : undefined,
    );
    const resolved = await resolveNamespaceIdOrError(identity.userId, requestedNamespace.name, {
      createIfMissing: requestedNamespace.autoCreateIfMissing,
    });

    if (resolved.error) {
      return resolved.error;
    }

    const namespaceId = resolved.namespaceId ?? null;

    // Start the session
    const session = await startExtendedSession({
      userId: identity.userId,
      namespaceId,
      metadata,
    });

    // Get critical memories (always injected)
    const criticalMemories = filterSensitiveMemories(
      await getCriticalMemories(identity.userId, {
        excludeCompleted: true,
        excludeAbsorbed: true,
      }),
    );
    const criticalSyntheses = await listCriticalSynthesizedMemories(identity.userId, 5);
    const synthesizedCritical = criticalSyntheses.map((s) => ({
      id: s.id,
      title: s.title,
      text: s.synthesis,
      memoryType: "semantic",
    }));
    const criticalForInjection = [...synthesizedCritical, ...criticalMemories];

    // Get high-tier memories relevant to first message
    let highMemories: typeof criticalMemories = [];
    
    if (firstMessage) {
      try {
        const vector = await embedQuery(firstMessage);
        const hits = await semanticSearchVectors({
          userId: identity.userId,
          query: firstMessage,
          vector,
          topK: 25,
        });

        if (hits.length > 0) {
          const memories = filterSensitiveMemories(await getAgentMemoriesByIds({
            userId: identity.userId,
            ids: hits.map((h) => h.item.id),
            namespaceId,
            excludeAbsorbed: true,
          }));
          
          // Filter to high tier only
          highMemories = memories.filter((m) => m.importanceTier === "high");
        }
      } catch {
        // Search failed, continue without high memories
      }
    }

    // Dedupe
    const criticalIds = new Set(criticalForInjection.map((m) => m.id));
    const dedupedHigh = highMemories.filter((m) => !criticalIds.has(m.id)).slice(0, 5);

    // Estimate tokens
    const estimateTokens = (texts: string[]) => 
      Math.ceil(texts.reduce((sum, t) => sum + t.length, 0) / 4);

    const tokensInjected = estimateTokens([
      ...criticalMemories.map((m) => m.text),
      ...synthesizedCritical.map((m) => m.text),
      ...dedupedHigh.map((m) => m.text),
    ]);

    return Response.json({
      sessionId: session.id,
      context: {
        critical: criticalForInjection.map((m) => ({
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
        criticalCount: criticalForInjection.length,
        highCount: dedupedHigh.length,
      },
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
