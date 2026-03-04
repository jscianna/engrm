/**
 * Memory Miss Logging Endpoint
 * 
 * Log when an agent searched but didn't find what it needed.
 * This informs what memories are missing for future improvement.
 */

import { logMemoryMiss, generateMissSuggestion } from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { isObject } from "@/lib/api-v1";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "memories.miss");
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body)) {
      throw new MemryError("VALIDATION_ERROR", { field: "body", reason: "Invalid request body" });
    }

    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      throw new MemryError("VALIDATION_ERROR", { field: "query", reason: "required" });
    }

    const context = typeof body.context === "string" ? body.context.trim() : null;
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;

    const miss = await logMemoryMiss({
      userId: identity.userId,
      query,
      context,
      sessionId,
    });

    const suggestion = generateMissSuggestion(query);

    return Response.json({
      logged: true,
      id: miss.id,
      suggestion,
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
