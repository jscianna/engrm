/**
 * Fetch memory titles by IDs
 * Used by injection log to show what was injected without full content
 */

import { getDb } from "@/lib/turso";
import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { isObject } from "@/lib/api-v1";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "memories.titles");
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body) || !Array.isArray(body.ids)) {
      throw new MemryError("VALIDATION_ERROR", { field: "ids", reason: "required array" });
    }

    const ids = body.ids as string[];
    if (ids.length === 0) {
      return Response.json({ memories: [] });
    }

    // Limit to prevent abuse
    const limitedIds = ids.slice(0, 100);

    const client = getDb();
    const placeholders = limitedIds.map(() => "?").join(",");
    const result = await client.execute({
      sql: `SELECT id, title FROM memories WHERE user_id = ? AND id IN (${placeholders})`,
      args: [identity.userId, ...limitedIds],
    });

    const memories = result.rows.map((row) => ({
      id: row.id as string,
      title: row.title as string,
    }));

    return Response.json({ memories });
  } catch (error) {
    return errorResponse(error);
  }
}
