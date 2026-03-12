/**
 * Sync Worker
 * 
 * Background worker that processes the sync queue.
 * Batches writes and syncs to hosted backend with retry logic.
 */

import {
  getPendingEntries,
  getEntryPayload,
  markSynced,
  markFailed,
  getSyncQueueMetrics,
  type SyncQueueEntry,
} from "./sync-queue";

export interface SyncWorkerConfig {
  /** Hosted API endpoint for sync */
  apiEndpoint: string;
  /** API key for authentication */
  apiKey: string;
  /** Batch size for sync operations (default: 10) */
  batchSize: number;
  /** Interval in ms between sync cycles (default: 5000) */
  syncIntervalMs: number;
  /** Max retries per entry (default: 5) */
  maxRetries: number;
  /** Base delay for exponential backoff (default: 1000) */
  baseDelayMs: number;
  /** Max delay for backoff cap (default: 60000) */
  maxDelayMs: number;
}

const DEFAULT_CONFIG: Omit<SyncWorkerConfig, "apiEndpoint" | "apiKey"> = {
  batchSize: 10,
  syncIntervalMs: 5000,
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
};

let workerInterval: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;
let workerConfig: SyncWorkerConfig | null = null;

// Worker metrics
let cyclesRun = 0;
let lastCycleAt: number | null = null;
let lastCycleResults: { synced: number; failed: number; deadLettered: number } | null = null;

/**
 * Sync a batch of entries to the hosted backend.
 */
async function syncBatch(
  entries: SyncQueueEntry[],
  config: SyncWorkerConfig
): Promise<Map<string, { success: boolean; error?: string }>> {
  const results = new Map<string, { success: boolean; error?: string }>();

  // Build batch payload
  const batchPayload = entries.map((entry) => {
    try {
      const payload = getEntryPayload(entry);
      return {
        id: entry.id,
        userId: entry.userId,
        operation: entry.operation,
        payload,
        queuedAt: entry.queuedAt,
      };
    } catch (error) {
      // Decryption failed - likely corruption
      results.set(entry.id, {
        success: false,
        error: `Decryption failed: ${error instanceof Error ? error.message : "unknown"}`,
      });
      return null;
    }
  }).filter((item): item is NonNullable<typeof item> => item !== null);

  if (batchPayload.length === 0) {
    return results;
  }

  try {
    const response = await fetch(`${config.apiEndpoint}/api/v1/sync/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ operations: batchPayload }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Mark all as failed with same error
      for (const entry of entries) {
        if (!results.has(entry.id)) {
          results.set(entry.id, {
            success: false,
            error: `HTTP ${response.status}: ${errorText.slice(0, 200)}`,
          });
        }
      }
      return results;
    }

    const responseData = await response.json() as {
      results?: Array<{ id: string; success: boolean; error?: string }>;
    };

    // Process individual results
    if (responseData.results && Array.isArray(responseData.results)) {
      for (const result of responseData.results) {
        results.set(result.id, {
          success: result.success,
          error: result.error,
        });
      }
    } else {
      // Assume all succeeded if no individual results
      for (const entry of entries) {
        if (!results.has(entry.id)) {
          results.set(entry.id, { success: true });
        }
      }
    }
  } catch (error) {
    // Network error - mark all as failed
    const errorMessage = error instanceof Error ? error.message : "Network error";
    for (const entry of entries) {
      if (!results.has(entry.id)) {
        results.set(entry.id, {
          success: false,
          error: errorMessage,
        });
      }
    }
  }

  return results;
}

/**
 * Run a single sync cycle.
 */
async function runSyncCycle(config: SyncWorkerConfig): Promise<void> {
  if (isProcessing) {
    return; // Skip if already processing
  }

  isProcessing = true;
  cyclesRun++;
  lastCycleAt = Date.now();

  let synced = 0;
  let failed = 0;
  let deadLettered = 0;

  try {
    const pending = getPendingEntries(config.batchSize);
    
    if (pending.length === 0) {
      return;
    }

    const results = await syncBatch(pending, config);

    // Process results
    for (const entry of pending) {
      const result = results.get(entry.id);
      
      if (!result) {
        // No result for this entry - treat as failed
        const { deadLettered: dl } = markFailed(entry.id, "No result from sync", {
          maxRetries: config.maxRetries,
          baseDelayMs: config.baseDelayMs,
          maxDelayMs: config.maxDelayMs,
          batchSize: config.batchSize,
        });
        failed++;
        if (dl) deadLettered++;
        continue;
      }

      if (result.success) {
        markSynced(entry.id);
        synced++;
      } else {
        const { deadLettered: dl } = markFailed(entry.id, result.error ?? "Unknown error", {
          maxRetries: config.maxRetries,
          baseDelayMs: config.baseDelayMs,
          maxDelayMs: config.maxDelayMs,
          batchSize: config.batchSize,
        });
        failed++;
        if (dl) deadLettered++;
      }
    }
  } finally {
    lastCycleResults = { synced, failed, deadLettered };
    isProcessing = false;
  }
}

/**
 * Start the sync worker.
 */
export function startSyncWorker(
  apiEndpoint: string,
  apiKey: string,
  options: Partial<Omit<SyncWorkerConfig, "apiEndpoint" | "apiKey">> = {}
): void {
  if (workerInterval) {
    console.warn("[SyncWorker] Already running");
    return;
  }

  workerConfig = {
    apiEndpoint,
    apiKey,
    ...DEFAULT_CONFIG,
    ...options,
  };

  // Run immediately, then on interval
  runSyncCycle(workerConfig).catch(console.error);

  workerInterval = setInterval(() => {
    if (workerConfig) {
      runSyncCycle(workerConfig).catch(console.error);
    }
  }, workerConfig.syncIntervalMs);

  console.log(`[SyncWorker] Started with interval ${workerConfig.syncIntervalMs}ms`);
}

/**
 * Stop the sync worker.
 */
export function stopSyncWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    workerConfig = null;
    console.log("[SyncWorker] Stopped");
  }
}

/**
 * Check if worker is running.
 */
export function isWorkerRunning(): boolean {
  return workerInterval !== null;
}

/**
 * Force an immediate sync cycle (for testing/debugging).
 */
export async function forceSyncCycle(): Promise<void> {
  if (!workerConfig) {
    throw new Error("Sync worker not started");
  }
  await runSyncCycle(workerConfig);
}

/**
 * Get sync worker metrics.
 */
export function getSyncWorkerMetrics(): {
  running: boolean;
  cyclesRun: number;
  lastCycleAt: number | null;
  lastCycleResults: { synced: number; failed: number; deadLettered: number } | null;
  queueMetrics: ReturnType<typeof getSyncQueueMetrics>;
} {
  return {
    running: isWorkerRunning(),
    cyclesRun,
    lastCycleAt,
    lastCycleResults,
    queueMetrics: getSyncQueueMetrics(),
  };
}
