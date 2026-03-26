/**
 * Batch Sync Endpoint
 * 
 * Receives batched sync operations from edge clients.
 * Processes creates, updates, and deletes in a single request.
 */

import { validateApiKey } from "@/lib/api-auth";
import { FatHippoError, errorResponse } from "@/lib/errors";
import { isObject } from "@/lib/api-v1";
import { updateAgentMemory, deleteAgentMemoryById, insertAgentMemory } from "@/lib/db";
import { invalidateAllLocalResultsForUser, invalidateLocalResultsByMemoryIds } from "@/lib/local-retrieval";
import {
  assertClientWritableMemoryType,
  MemoryWritePolicyError,
  assessMemoryWritePolicy,
} from "@/lib/memory-write-policy";
import type { MemoryImportanceTier, MemoryKind } from "@/lib/types";

export const runtime = "nodejs";

interface SyncOperation {
  id: string;
  userId: string;
  operation: "create" | "update" | "delete";
  payload: Record<string, unknown>;
  queuedAt: number;
}

interface SyncResult {
  id: string;
  success: boolean;
  error?: string;
  reasonCode?: string;
  policyCode?: string;
}

/**
 * POST /api/v1/sync/batch
 * 
 * Process a batch of sync operations.
 * 
 * Request body:
 * {
 *   operations: [
 *     { id: "sq_123", userId: "user_1", operation: "create", payload: {...}, queuedAt: 1234567890 },
 *     { id: "sq_124", userId: "user_1", operation: "update", payload: {...}, queuedAt: 1234567891 },
 *     { id: "sq_125", userId: "user_1", operation: "delete", payload: { memoryId: "mem_123" }, queuedAt: 1234567892 }
 *   ]
 * }
 * 
 * Response:
 * {
 *   results: [
 *     { id: "sq_123", success: true },
 *     { id: "sq_124", success: false, error: "Memory not found" }
 *   ]
 * }
 */
export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "sync.batch");

    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body)) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "body", reason: "Invalid request body" });
    }

    const operations = Array.isArray(body.operations) ? body.operations : null;

    if (!operations || operations.length === 0) {
      throw new FatHippoError("VALIDATION_ERROR", { 
        field: "operations", 
        reason: "Operations array is required and must not be empty" 
      });
    }

    if (operations.length > 100) {
      throw new FatHippoError("VALIDATION_ERROR", { 
        field: "operations", 
        reason: "Maximum 100 operations per batch" 
      });
    }

    const results: SyncResult[] = [];

    for (const op of operations) {
      if (!isValidOperation(op)) {
        results.push({
          id: op?.id ?? "unknown",
          success: false,
          error: "Invalid operation format",
        });
        continue;
      }

      // Verify user ownership
      if (op.userId !== identity.userId) {
        results.push({
          id: op.id,
          success: false,
          error: "User ID mismatch",
        });
        continue;
      }

      try {
        switch (op.operation) {
          case "create": {
            await processCreate(op);
            results.push({ id: op.id, success: true });
            break;
          }
          case "update": {
            await processUpdate(op);
            results.push({ id: op.id, success: true });
            break;
          }
          case "delete": {
            await processDelete(op);
            results.push({ id: op.id, success: true });
            break;
          }
          default:
            results.push({
              id: op.id,
              success: false,
              error: `Unknown operation: ${op.operation}`,
            });
        }
      } catch (error) {
        results.push({
          id: op.id,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          reasonCode: error instanceof MemoryWritePolicyError ? error.reasonCode : undefined,
          policyCode: error instanceof MemoryWritePolicyError ? error.policyCode : undefined,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    return Response.json({
      results,
      summary: {
        total: results.length,
        success: successCount,
        failed: failureCount,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function isValidOperation(op: unknown): op is SyncOperation {
  if (!isObject(op)) return false;
  if (typeof op.id !== "string") return false;
  if (typeof op.userId !== "string") return false;
  if (!["create", "update", "delete"].includes(op.operation as string)) return false;
  if (!isObject(op.payload)) return false;
  return true;
}

async function processCreate(op: SyncOperation): Promise<void> {
  const payload = op.payload;
  
  // Extract required fields for memory creation
  const text = typeof payload.text === "string" ? payload.text : null;
  if (!text) {
    throw new Error("Missing required field: text");
  }

  const requestedMemoryType =
    typeof payload.memoryType === "string" && payload.memoryType.trim()
      ? payload.memoryType.trim()
      : undefined;
  assertClientWritableMemoryType(requestedMemoryType);

  const quality = assessMemoryWritePolicy(text);
  if (!quality.allow) {
    throw new MemoryWritePolicyError(quality);
  }

  await insertAgentMemory({
    userId: op.userId,
    text,
    title: typeof payload.title === "string" ? payload.title : undefined,
    sourceType: typeof payload.sourceType === "string" ? payload.sourceType as "text" | "url" | "file" | "pdf" : "text",
    memoryType: (requestedMemoryType as MemoryKind | undefined) ?? "episodic",
    importanceTier: typeof payload.importanceTier === "string" && ["critical", "working", "high", "normal"].includes(payload.importanceTier) 
      ? payload.importanceTier as MemoryImportanceTier 
      : "normal",
    sourceUrl: typeof payload.sourceUrl === "string" ? payload.sourceUrl : null,
    fileName: typeof payload.fileName === "string" ? payload.fileName : null,
    namespaceId: typeof payload.namespaceId === "string" ? payload.namespaceId : null,
    sessionId: typeof payload.sessionId === "string" ? payload.sessionId : null,
    metadata: isObject(payload.metadata) ? payload.metadata as Record<string, unknown> : null,
  });

  // New memory can change retrieval top-K ordering.
  invalidateAllLocalResultsForUser(op.userId);
}

async function processUpdate(op: SyncOperation): Promise<void> {
  const payload = op.payload;
  
  const memoryId = typeof payload.memoryId === "string" ? payload.memoryId : null;
  if (!memoryId) {
    throw new Error("Missing required field: memoryId");
  }

  // Build update object with only provided fields
  const updates: Record<string, unknown> = {};
  
  if (typeof payload.text === "string") {
    const quality = assessMemoryWritePolicy(payload.text);
    if (!quality.allow) {
      throw new MemoryWritePolicyError(quality);
    }
    updates.text = payload.text;
  }
  if (typeof payload.title === "string") updates.title = payload.title;
  if (typeof payload.importanceTier === "string") updates.importanceTier = payload.importanceTier;
  if (typeof payload.durabilityClass === "string") updates.durabilityClass = payload.durabilityClass;
  if (isObject(payload.metadata)) updates.metadata = payload.metadata;

  if (Object.keys(updates).length === 0) {
    throw new Error("No fields to update");
  }

  await updateAgentMemory(op.userId, memoryId, updates);

  // Updated memory text/title can stale local retrieval cache.
  invalidateLocalResultsByMemoryIds(op.userId, [memoryId]);
}

async function processDelete(op: SyncOperation): Promise<void> {
  const payload = op.payload;
  
  const memoryId = typeof payload.memoryId === "string" ? payload.memoryId : null;
  if (!memoryId) {
    throw new Error("Missing required field: memoryId");
  }

  await deleteAgentMemoryById(op.userId, memoryId);

  // Remove stale cache entries that referenced deleted memory.
  invalidateLocalResultsByMemoryIds(op.userId, [memoryId]);
}
