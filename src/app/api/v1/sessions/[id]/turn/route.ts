/**
 * Session Turn Endpoint
 * 
 * Record a turn in an ongoing session.
 * Returns whether context refresh is needed and tracks memory usage.
 */

import { embedText } from "@/lib/embeddings";
import { semanticSearchVectors } from "@/lib/qdrant";
import { 
  recordSessionTurn, 
  getExtendedSessionById,
  getCriticalMemories,
  getAgentMemoriesByIds,
  incrementAccessCounts,
  listCriticalSynthesizedMemories,
} from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { isObject } from "@/lib/api-v1";
import {
  createAnalyticsConversationId,
  detectQualitySignals,
  recordInjectionEvent,
  recordQualitySignals,
} from "@/lib/memory-analytics";

export const runtime = "nodejs";

type Props = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, props: Props) {
  try {
    const identity = await validateApiKey(request, "sessions.turn");
    const { id: sessionId } = await props.params;
    const analyticsConversationId = createAnalyticsConversationId("session", sessionId);
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body)) {
      throw new MemryError("VALIDATION_ERROR", { field: "body", reason: "Invalid request body" });
    }

    // Validate session exists
    const session = await getExtendedSessionById(identity.userId, sessionId);
    if (!session) {
      throw new MemryError("SESSION_NOT_FOUND");
    }

    if (session.endedAt) {
      throw new MemryError("VALIDATION_ERROR", { 
        field: "sessionId", 
        reason: "Session has already ended" 
      });
    }

    // Parse messages
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) {
      throw new MemryError("VALIDATION_ERROR", { field: "messages", reason: "required" });
    }

    const turnNumber = typeof body.turnNumber === "number" 
      ? body.turnNumber 
      : session.turnCount + 1;

    const lastUserMessage = [...messages]
      .reverse()
      .find((m: { role?: string; content?: string }) => m.role === "user" && typeof m.content === "string")
      ?.content?.trim() ?? "";

    // Track which memories are being used this turn
    const memoriesUsed = Array.isArray(body.memoriesUsed) 
      ? body.memoriesUsed.filter((id): id is string => typeof id === "string")
      : [];

    // Record the turn
    await recordSessionTurn({
      userId: identity.userId,
      sessionId,
      turnNumber,
      messages,
      memoriesUsed,
    });

    // Increment access counts for used memories
    if (memoriesUsed.length > 0) {
      await incrementAccessCounts(identity.userId, memoriesUsed);
    }

    if (lastUserMessage) {
      const qualitySignals = detectQualitySignals(lastUserMessage);
      if (qualitySignals.length > 0) {
        recordQualitySignals({
          userId: identity.userId,
          conversationId: analyticsConversationId,
          signals: qualitySignals,
        }).catch(() => {});
      }
    }

    // Determine if refresh is needed (every 5 turns or topic drift)
    const refreshNeeded = turnNumber % 5 === 0;

    // Get new context if refresh needed
    let newContext = null;
    if (refreshNeeded) {
      // Get most recent user message for context search
      if (lastUserMessage) {
        try {
          const criticalMemories = await getCriticalMemories(identity.userId, {
            excludeCompleted: true,
            excludeAbsorbed: true,
          });
          const criticalSyntheses = await listCriticalSynthesizedMemories(identity.userId, 5);
          const criticalForInjection = [
            ...criticalSyntheses.map((synthesis) => ({
              id: synthesis.id,
              title: synthesis.title,
              text: synthesis.synthesis,
              memoryType: "semantic",
            })),
            ...criticalMemories,
          ];
          const vector = await embedText(lastUserMessage);
          const hits = await semanticSearchVectors({
            userId: identity.userId,
            query: lastUserMessage,
            vector,
            topK: 10,
          });

          const relevantMemories = hits.length > 0 
            ? await getAgentMemoriesByIds({
                userId: identity.userId,
                ids: hits.map((h) => h.item.id),
                namespaceId: session.namespaceId,
                excludeAbsorbed: true,
              })
            : [];

          const highMemories = relevantMemories.filter(
            (m) => m.importanceTier === "high" || m.importanceTier === "critical"
          );

          const criticalIds = new Set(criticalForInjection.map((m) => m.id));
          const dedupedHigh = highMemories.filter((m) => !criticalIds.has(m.id)).slice(0, 5);

          newContext = {
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
          };

          const refreshedMemoryIds = Array.from(
            new Set([
              ...criticalMemories.map((memory) => memory.id),
              ...criticalSyntheses.map((memory) => memory.id),
              ...dedupedHigh.map((memory) => memory.id),
            ]),
          );

          if (refreshedMemoryIds.length > 0) {
            recordInjectionEvent({
              userId: identity.userId,
              memoryIds: refreshedMemoryIds,
              resultCount: refreshedMemoryIds.length,
              conversationId: analyticsConversationId,
            }).catch(() => {});
          }
        } catch {
          // Refresh failed, continue without new context
        }
      }
    }

    return Response.json({
      turnNumber,
      refreshNeeded,
      ...(newContext ? { newContext } : {}),
      memoriesUsed,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
