/**
 * Session End Endpoint
 * 
 * End a session and record outcome.
 * Returns summary, suggested memories to create, and analytics.
 */

import { 
  endSession, 
  getSessionTurns,
  getSessionMemoriesUsed,
  reinforceSessionMemories,
  getExtendedSessionById,
} from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { FatHippoError, errorResponse } from "@/lib/errors";
import { isObject } from "@/lib/api-v1";

export const runtime = "nodejs";

type Props = {
  params: Promise<{ id: string }>;
};

// Simple heuristic extraction patterns
const EXTRACT_PATTERNS = [
  { pattern: /\b(?:I prefer|I always|I never|I like|I love|I hate)\b/i, type: "preference" },
  { pattern: /\b(?:remember that|don't forget|keep in mind)\b/i, type: "fact" },
  { pattern: /\b(?:my name is|I am|I'm called|call me)\b/i, type: "identity" },
  { pattern: /\b(?:I work on|my project|I'm building)\b/i, type: "fact" },
  { pattern: /\b(?:I decided|we agreed|the plan is)\b/i, type: "decision" },
];

export async function POST(request: Request, props: Props) {
  try {
    const identity = await validateApiKey(request, "sessions.end");
    const { id: sessionId } = await props.params;
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body)) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "body", reason: "Invalid request body" });
    }

    // Validate session exists
    const existingSession = await getExtendedSessionById(identity.userId, sessionId);
    if (!existingSession) {
      throw new FatHippoError("SESSION_NOT_FOUND");
    }

    if (existingSession.endedAt) {
      throw new FatHippoError("VALIDATION_ERROR", { 
        field: "sessionId", 
        reason: "Session has already ended" 
      });
    }

    // Parse outcome
    const outcome = typeof body.outcome === "string" && 
      ["success", "failure", "abandoned"].includes(body.outcome)
      ? body.outcome as "success" | "failure" | "abandoned"
      : "success";

    const feedback = typeof body.feedback === "string" ? body.feedback.trim() : null;

    // End the session
    const session = await endSession({
      userId: identity.userId,
      sessionId,
      outcome,
      feedback,
    });

    if (!session) {
      throw new FatHippoError("SESSION_NOT_FOUND");
    }

    // Get session turns for analysis
    const turns = await getSessionTurns(identity.userId, sessionId);
    const memoriesUsed = await getSessionMemoriesUsed(identity.userId, sessionId);

    // Reinforce memories used in successful sessions
    let memoriesReinforced = 0;
    if (outcome === "success") {
      memoriesReinforced = await reinforceSessionMemories(identity.userId, sessionId);
    }

    // Generate summary from turn content
    const allMessages: Array<{ role: string; content: string }> = [];
    for (const turn of turns) {
      try {
        const messages = JSON.parse(turn.messagesJson) as Array<{ role: string; content: string }>;
        allMessages.push(...messages);
      } catch {
        // Skip malformed turn
      }
    }

    // Extract key points for summary
    const userMessages = allMessages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join(" ");

    // Simple summary: first 200 chars of combined user messages
    const summary = userMessages.length > 200 
      ? userMessages.slice(0, 197) + "..."
      : userMessages || "No conversation content";

    // Extract suggested memories using heuristic patterns
    const suggestedMemories: Array<{
      content: string;
      memoryType: string;
      confidence: number;
    }> = [];

    for (const msg of allMessages.filter((m) => m.role === "user")) {
      for (const { pattern, type } of EXTRACT_PATTERNS) {
        if (pattern.test(msg.content)) {
          // Extract the sentence containing the pattern
          const sentences = msg.content.split(/[.!?]+/).filter(Boolean);
          for (const sentence of sentences) {
            if (pattern.test(sentence)) {
              suggestedMemories.push({
                content: sentence.trim(),
                memoryType: type,
                confidence: 0.7,
              });
            }
          }
        }
      }
    }

    // Dedupe similar suggestions
    const uniqueSuggestions = suggestedMemories.filter((s, i) => 
      suggestedMemories.findIndex((other) => 
        other.content.toLowerCase() === s.content.toLowerCase()
      ) === i
    ).slice(0, 5);

    return Response.json({
      summary,
      suggestedMemories: uniqueSuggestions,
      memoriesReinforced,
      analytics: {
        turns: turns.length,
        memoriesUsed: memoriesUsed.length,
        outcome,
        duration: session.endedAt && session.createdAt
          ? new Date(session.endedAt).getTime() - new Date(session.createdAt).getTime()
          : null,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
