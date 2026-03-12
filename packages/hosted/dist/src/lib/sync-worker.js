"use strict";
/**
 * Sync Worker
 *
 * Background worker that processes the sync queue.
 * Batches writes and syncs to hosted backend with retry logic.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSyncWorker = startSyncWorker;
exports.stopSyncWorker = stopSyncWorker;
exports.isWorkerRunning = isWorkerRunning;
exports.forceSyncCycle = forceSyncCycle;
exports.getSyncWorkerMetrics = getSyncWorkerMetrics;
const sync_queue_1 = require("./sync-queue");
const DEFAULT_CONFIG = {
    batchSize: 10,
    syncIntervalMs: 5000,
    maxRetries: 5,
    baseDelayMs: 1000,
    maxDelayMs: 60000,
};
let workerInterval = null;
let isProcessing = false;
let workerConfig = null;
// Worker metrics
let cyclesRun = 0;
let lastCycleAt = null;
let lastCycleResults = null;
/**
 * Sync a batch of entries to the hosted backend.
 */
async function syncBatch(entries, config) {
    const results = new Map();
    // Build batch payload
    const batchPayload = entries.map((entry) => {
        try {
            const payload = (0, sync_queue_1.getEntryPayload)(entry);
            return {
                id: entry.id,
                userId: entry.userId,
                operation: entry.operation,
                payload,
                queuedAt: entry.queuedAt,
            };
        }
        catch (error) {
            // Decryption failed - likely corruption
            results.set(entry.id, {
                success: false,
                error: `Decryption failed: ${error instanceof Error ? error.message : "unknown"}`,
            });
            return null;
        }
    }).filter((item) => item !== null);
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
        const responseData = await response.json();
        // Process individual results
        if (responseData.results && Array.isArray(responseData.results)) {
            for (const result of responseData.results) {
                results.set(result.id, {
                    success: result.success,
                    error: result.error,
                });
            }
        }
        else {
            // Assume all succeeded if no individual results
            for (const entry of entries) {
                if (!results.has(entry.id)) {
                    results.set(entry.id, { success: true });
                }
            }
        }
    }
    catch (error) {
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
async function runSyncCycle(config) {
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
        const pending = (0, sync_queue_1.getPendingEntries)(config.batchSize);
        if (pending.length === 0) {
            return;
        }
        const results = await syncBatch(pending, config);
        // Process results
        for (const entry of pending) {
            const result = results.get(entry.id);
            if (!result) {
                // No result for this entry - treat as failed
                const { deadLettered: dl } = (0, sync_queue_1.markFailed)(entry.id, "No result from sync", {
                    maxRetries: config.maxRetries,
                    baseDelayMs: config.baseDelayMs,
                    maxDelayMs: config.maxDelayMs,
                    batchSize: config.batchSize,
                });
                failed++;
                if (dl)
                    deadLettered++;
                continue;
            }
            if (result.success) {
                (0, sync_queue_1.markSynced)(entry.id);
                synced++;
            }
            else {
                const { deadLettered: dl } = (0, sync_queue_1.markFailed)(entry.id, result.error ?? "Unknown error", {
                    maxRetries: config.maxRetries,
                    baseDelayMs: config.baseDelayMs,
                    maxDelayMs: config.maxDelayMs,
                    batchSize: config.batchSize,
                });
                failed++;
                if (dl)
                    deadLettered++;
            }
        }
    }
    finally {
        lastCycleResults = { synced, failed, deadLettered };
        isProcessing = false;
    }
}
/**
 * Start the sync worker.
 */
function startSyncWorker(apiEndpoint, apiKey, options = {}) {
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
function stopSyncWorker() {
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
function isWorkerRunning() {
    return workerInterval !== null;
}
/**
 * Force an immediate sync cycle (for testing/debugging).
 */
async function forceSyncCycle() {
    if (!workerConfig) {
        throw new Error("Sync worker not started");
    }
    await runSyncCycle(workerConfig);
}
/**
 * Get sync worker metrics.
 */
function getSyncWorkerMetrics() {
    return {
        running: isWorkerRunning(),
        cyclesRun,
        lastCycleAt,
        lastCycleResults,
        queueMetrics: (0, sync_queue_1.getSyncQueueMetrics)(),
    };
}
//# sourceMappingURL=sync-worker.js.map