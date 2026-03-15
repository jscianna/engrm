/**
 * Session Turn Endpoint
 *
 * Record a turn in an ongoing session.
 * This is the canonical per-turn persistence path.
 */

import {
  recordSessionTurn,
  getExtendedSessionById,
  incrementAccessCounts,
} from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { FatHippoError, errorResponse } from "@/lib/errors";
import { isObject } from "@/lib/api-v1";
import {
  captureCodingTraceFromTurn,
  captureTurnMemories,
  type TurnCaptureMessage,
} from "@/lib/turn-capture";
import { storeDetectedConstraints } from "@/lib/constraint-detection";
import {
  createAnalyticsConversationId,
  detectQualitySignals,
  recordQualitySignals,
} from "@/lib/memory-analytics";

export const runtime = "nodejs";

type Props = {
  params: Promise<{ id: string }>;
};

function normalizeMessageRole(rawRole: unknown): string {
  if (typeof rawRole !== "string") {
    return "assistant";
  }
  const role = rawRole.toLowerCase();
  if (role === "toolresult") {
    return "tool";
  }
  return role;
}

function normalizeMessage(input: unknown): TurnCaptureMessage | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const record = input as Record<string, unknown>;
  const content =
    typeof record.content === "string"
      ? record.content.trim()
      : typeof record.text === "string"
        ? record.text.trim()
        : "";
  if (!content) {
    return null;
  }

  return {
    role: normalizeMessageRole(record.role ?? record.type),
    content,
    toolName: typeof record.toolName === "string" ? record.toolName : null,
  };
}

export async function POST(request: Request, props: Props) {
  try {
    const identity = await validateApiKey(request, "sessions.turn");
    const { id: sessionId } = await props.params;
    const analyticsConversationId = createAnalyticsConversationId("session", sessionId);
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body)) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "body", reason: "Invalid request body" });
    }

    // Validate session exists
    const session = await getExtendedSessionById(identity.userId, sessionId);
    if (!session) {
      throw new FatHippoError("SESSION_NOT_FOUND");
    }

    if (session.endedAt) {
      throw new FatHippoError("VALIDATION_ERROR", { 
        field: "sessionId", 
        reason: "Session has already ended" 
      });
    }

    // Parse messages
    const messages = Array.isArray(body.messages)
      ? body.messages.map(normalizeMessage).filter((message): message is TurnCaptureMessage => Boolean(message))
      : [];
    if (messages.length === 0) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "messages", reason: "required" });
    }

    const turnNumber = typeof body.turnNumber === "number" 
      ? body.turnNumber 
      : session.turnCount + 1;

    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === "user" && typeof m.content === "string")
      ?.content?.trim() ?? "";

    const captureUserOnly = body.captureUserOnly === true;
    const captureConstraints = body.captureConstraints !== false;
    const captureTrace = body.captureTrace !== false;

    // Track which memories are being used this turn
    const memoriesUsed = Array.isArray(body.memoriesUsed) 
      ? body.memoriesUsed.filter((id): id is string => typeof id === "string")
      : [];

    // Record the turn
    await recordSessionTurn({
      userId: identity.userId,
      sessionId,
      turnNumber,
      messages: messages.map((message) => ({
        role: message.role ?? "assistant",
        content: message.content ?? "",
      })),
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

    const memoryCapture = await captureTurnMemories({
      userId: identity.userId,
      namespaceId: session.namespaceId,
      sessionId,
      messages,
      captureUserOnly,
    });

    const constraintMessages = messages
      .filter((message) => message.role === "user" && typeof message.content === "string")
      .map((message) => message.content as string);
    const constraintCapture = captureConstraints
      ? await storeDetectedConstraints({
          userId: identity.userId,
          messages: constraintMessages,
        })
      : { constraints: [], created: 0 };

    const traceCaptured = captureTrace
      ? await captureCodingTraceFromTurn({
          userId: identity.userId,
          sessionId,
          messages,
        })
      : false;

    return Response.json({
      turnNumber,
      refreshNeeded: false,
      memoriesUsed,
      captureSummary: {
        stored: memoryCapture.stored,
        updated: memoryCapture.updated,
        merged: memoryCapture.merged,
        constraintsDetected: constraintCapture.created,
        traceCaptured,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
