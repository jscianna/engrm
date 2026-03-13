/**
 * Constraint by ID API
 * 
 * DELETE /api/v1/cognitive/constraints/:id - Deactivate constraint
 * PATCH /api/v1/cognitive/constraints/:id - Update constraint
 */

import { validateApiKey } from "@/lib/api-auth";
import { FatHippoError, errorResponse } from "@/lib/errors";
import { deactivateConstraint } from "@/lib/constraints-db";
import { getDb } from "@/lib/turso";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * DELETE /api/v1/cognitive/constraints/:id
 * Deactivate a constraint
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const identity = await validateApiKey(request, "cognitive.constraints.delete");
    const { id } = await params;
    
    if (!id) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "id", reason: "required" });
    }
    
    // Verify constraint belongs to user
    const client = getDb();
    const result = await client.execute({
      sql: `SELECT id FROM user_constraints WHERE id = ? AND user_id = ?`,
      args: [id, identity.userId],
    });
    
    if (result.rows.length === 0) {
      throw new FatHippoError("MEMORY_NOT_FOUND", { resource: "constraint", id });
    }
    
    await deactivateConstraint(id);
    
    return Response.json({
      deactivated: true,
      id,
    });
    
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH /api/v1/cognitive/constraints/:id
 * Update a constraint (rule, triggers, severity)
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const identity = await validateApiKey(request, "cognitive.constraints.update");
    const { id } = await params;
    const body = await request.json();
    
    if (!id) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "id", reason: "required" });
    }
    
    const client = getDb();
    
    // Verify constraint belongs to user
    const existing = await client.execute({
      sql: `SELECT * FROM user_constraints WHERE id = ? AND user_id = ?`,
      args: [id, identity.userId],
    });
    
    if (existing.rows.length === 0) {
      throw new FatHippoError("MEMORY_NOT_FOUND", { resource: "constraint", id });
    }
    
    // Build update based on what's provided
    const now = new Date().toISOString();
    
    // Simple approach: update individual fields
    if (body.rule !== undefined) {
      await client.execute({
        sql: `UPDATE user_constraints SET rule = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
        args: [body.rule, now, id, identity.userId],
      });
    }
    if (body.triggers !== undefined) {
      await client.execute({
        sql: `UPDATE user_constraints SET triggers_json = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
        args: [JSON.stringify(body.triggers), now, id, identity.userId],
      });
    }
    if (body.severity !== undefined) {
      await client.execute({
        sql: `UPDATE user_constraints SET severity = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
        args: [body.severity, now, id, identity.userId],
      });
    }
    if (body.active !== undefined) {
      await client.execute({
        sql: `UPDATE user_constraints SET active = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
        args: [body.active ? 1 : 0, now, id, identity.userId],
      });
    }
    
    const hasUpdates = body.rule !== undefined || body.triggers !== undefined || 
                       body.severity !== undefined || body.active !== undefined;
    
    if (!hasUpdates) {
      return Response.json({ updated: false, reason: "no fields to update" });
    }
    
    return Response.json({
      updated: true,
      id,
    });
    
  } catch (error) {
    return errorResponse(error);
  }
}
