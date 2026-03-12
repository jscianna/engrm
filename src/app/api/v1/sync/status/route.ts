/**
 * Sync Status Endpoint
 * 
 * GET - Returns sync queue metrics and worker status
 * POST - Admin actions (retry dead letter, purge, force sync)
 */

import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { isObject } from "@/lib/api-v1";
import {
  getSyncQueueMetrics,
  getDeadLetterEntries,
  retryDeadLetter,
  purgeDeadLetter,
} from "@/lib/sync-queue";
import {
  getSyncWorkerMetrics,
  isWorkerRunning,
  forceSyncCycle,
} from "@/lib/sync-worker";

export const runtime = "nodejs";

/**
 * GET /api/v1/sync/status
 * 
 * Returns sync queue metrics and worker status.
 */
export async function GET(request: Request) {
  try {
    await validateApiKey(request, "sync.status");

    const workerMetrics = getSyncWorkerMetrics();
    const deadLetters = getDeadLetterEntries().map((entry) => ({
      id: entry.id,
      userId: entry.userId,
      operation: entry.operation,
      queuedAt: entry.queuedAt,
      deadLetteredAt: entry.deadLetteredAt,
      retryCount: entry.retryCount,
      finalError: entry.finalError,
    }));

    return Response.json({
      worker: {
        running: workerMetrics.running,
        cyclesRun: workerMetrics.cyclesRun,
        lastCycleAt: workerMetrics.lastCycleAt,
        lastCycleResults: workerMetrics.lastCycleResults,
      },
      queue: workerMetrics.queueMetrics,
      deadLetters: deadLetters.slice(0, 50), // Limit to 50 for response size
      deadLetterCount: deadLetters.length,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/v1/sync/status
 * 
 * Admin actions:
 * - { action: "retry", entryId: string } - Retry a dead-lettered entry
 * - { action: "purge", entryId: string } - Permanently remove a dead-lettered entry
 * - { action: "force_sync" } - Force an immediate sync cycle
 */
export async function POST(request: Request) {
  try {
    await validateApiKey(request, "sync.admin");

    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body)) {
      throw new MemryError("VALIDATION_ERROR", { field: "body", reason: "Invalid request body" });
    }

    const action = typeof body.action === "string" ? body.action : null;

    if (!action) {
      throw new MemryError("VALIDATION_ERROR", { field: "action", reason: "Action is required" });
    }

    switch (action) {
      case "retry": {
        const entryId = typeof body.entryId === "string" ? body.entryId : null;
        if (!entryId) {
          throw new MemryError("VALIDATION_ERROR", { field: "entryId", reason: "entryId is required" });
        }
        const success = retryDeadLetter(entryId);
        return Response.json({ success, action: "retry", entryId });
      }

      case "purge": {
        const entryId = typeof body.entryId === "string" ? body.entryId : null;
        if (!entryId) {
          throw new MemryError("VALIDATION_ERROR", { field: "entryId", reason: "entryId is required" });
        }
        const success = purgeDeadLetter(entryId);
        return Response.json({ success, action: "purge", entryId });
      }

      case "force_sync": {
        if (!isWorkerRunning()) {
          throw new MemryError("VALIDATION_ERROR", { 
            field: "worker", 
            reason: "Sync worker is not running" 
          });
        }
        await forceSyncCycle();
        const metrics = getSyncWorkerMetrics();
        return Response.json({ 
          success: true, 
          action: "force_sync",
          lastCycleResults: metrics.lastCycleResults,
        });
      }

      default:
        throw new MemryError("VALIDATION_ERROR", { 
          field: "action", 
          reason: `Unknown action: ${action}` 
        });
    }
  } catch (error) {
    return errorResponse(error);
  }
}
