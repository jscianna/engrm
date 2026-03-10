/**
 * Indexed Memory Dereference API
 * 
 * GET /api/v1/indexed/:index - Dereference index to get full content
 * DELETE /api/v1/indexed/:index - Delete indexed memory
 */

import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { getDb } from "@/lib/turso";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ index: string }>;
}

/**
 * GET /api/v1/indexed/:index
 * Dereference an index to retrieve full content
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const identity = await validateApiKey(request, "indexed.dereference");
    const { index: indexKey } = await params;
    
    if (!indexKey) {
      throw new MemryError("VALIDATION_ERROR", { field: "index", reason: "required" });
    }
    
    
    const client = getDb();
    const now = new Date().toISOString();
    
    // Get the indexed memory
    const result = await client.execute({
      sql: `
        SELECT id, index_key, summary, full_content, content_type, metadata_json, created_at, updated_at, access_count
        FROM indexed_memories
        WHERE user_id = ? AND index_key = ?
      `,
      args: [identity.userId, indexKey],
    });
    
    const row = result.rows[0];
    if (!row) {
      throw new MemryError("MEMORY_NOT_FOUND", { resource: "indexed_memory", index: indexKey });
    }
    
    // Update access count and last accessed time
    await client.execute({
      sql: `
        UPDATE indexed_memories 
        SET access_count = access_count + 1, last_accessed_at = ?
        WHERE id = ?
      `,
      args: [now, row.id],
    });
    
    const metadata = row.metadata_json ? JSON.parse(row.metadata_json as string) : null;
    
    return Response.json({
      index: row.index_key,
      summary: row.summary,
      content: row.full_content,
      contentType: row.content_type,
      metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      accessCount: (row.access_count as number) + 1,
    });
    
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/v1/indexed/:index
 * Delete an indexed memory
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const identity = await validateApiKey(request, "indexed.delete");
    const { index: indexKey } = await params;
    
    if (!indexKey) {
      throw new MemryError("VALIDATION_ERROR", { field: "index", reason: "required" });
    }
    
    
    const client = getDb();
    
    const result = await client.execute({
      sql: `DELETE FROM indexed_memories WHERE user_id = ? AND index_key = ?`,
      args: [identity.userId, indexKey],
    });
    
    if (result.rowsAffected === 0) {
      throw new MemryError("MEMORY_NOT_FOUND", { resource: "indexed_memory", index: indexKey });
    }
    
    // Also remove from regular memories
    await client.execute({
      sql: `DELETE FROM memories WHERE user_id = ? AND content_hash = ?`,
      args: [identity.userId, `idx:${indexKey}`],
    });
    
    return Response.json({ deleted: true, index: indexKey });
    
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH /api/v1/indexed/:index
 * Update summary or content for an indexed memory
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const identity = await validateApiKey(request, "indexed.update");
    const { index: indexKey } = await params;
    const body = await request.json();
    
    if (!indexKey) {
      throw new MemryError("VALIDATION_ERROR", { field: "index", reason: "required" });
    }
    
    const updates: string[] = [];
    const args: (string | null)[] = [];
    
    if (typeof body.summary === "string") {
      updates.push("summary = ?");
      args.push(body.summary.trim());
    }
    if (typeof body.content === "string") {
      updates.push("full_content = ?");
      args.push(body.content.trim());
    }
    if (body.metadata !== undefined) {
      updates.push("metadata_json = ?");
      args.push(body.metadata ? JSON.stringify(body.metadata) : null);
    }
    
    if (updates.length === 0) {
      throw new MemryError("VALIDATION_ERROR", { reason: "No valid fields to update" });
    }
    
    updates.push("updated_at = ?");
    args.push(new Date().toISOString());
    
    args.push(identity.userId);
    args.push(indexKey);
    
    
    const client = getDb();
    
    const result = await client.execute({
      sql: `UPDATE indexed_memories SET ${updates.join(", ")} WHERE user_id = ? AND index_key = ?`,
      args,
    });
    
    if (result.rowsAffected === 0) {
      throw new MemryError("MEMORY_NOT_FOUND", { resource: "indexed_memory", index: indexKey });
    }
    
    return Response.json({ updated: true, index: indexKey });
    
  } catch (error) {
    return errorResponse(error);
  }
}
