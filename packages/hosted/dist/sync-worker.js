import { getEntryPayload, getPendingEntries, getSyncQueueMetrics, markFailed, markSynced, } from "./sync-queue.js";
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
let cyclesRun = 0;
let lastCycleAt = null;
let lastCycleResults = null;
async function syncBatch(entries, config) {
    const results = new Map();
    const batchPayload = entries
        .map((entry) => {
        try {
            return {
                id: entry.id,
                userId: entry.userId,
                operation: entry.operation,
                payload: getEntryPayload(entry),
                queuedAt: entry.queuedAt,
            };
        }
        catch (error) {
            results.set(entry.id, {
                success: false,
                error: `Decryption failed: ${error instanceof Error ? error.message : "unknown"}`,
            });
            return null;
        }
    })
        .filter((entry) => entry !== null);
    if (batchPayload.length === 0) {
        return results;
    }
    try {
        const response = await fetch(`${config.apiEndpoint}/api/v1/sync/batch`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({ operations: batchPayload }),
        });
        if (!response.ok) {
            const errorText = await response.text();
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
        const data = (await response.json());
        if (Array.isArray(data.results)) {
            for (const result of data.results) {
                results.set(result.id, { success: result.success, error: result.error });
            }
        }
        else {
            for (const entry of entries) {
                if (!results.has(entry.id)) {
                    results.set(entry.id, { success: true });
                }
            }
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Network error";
        for (const entry of entries) {
            if (!results.has(entry.id)) {
                results.set(entry.id, { success: false, error: errorMessage });
            }
        }
    }
    return results;
}
async function runSyncCycle(config) {
    if (isProcessing)
        return;
    isProcessing = true;
    cyclesRun += 1;
    lastCycleAt = Date.now();
    let synced = 0;
    let failed = 0;
    let deadLettered = 0;
    try {
        const pending = getPendingEntries(config.batchSize);
        if (pending.length === 0)
            return;
        const results = await syncBatch(pending, config);
        for (const entry of pending) {
            const result = results.get(entry.id);
            if (!result) {
                const failure = markFailed(entry.id, "No result from sync", config);
                failed += 1;
                if (failure.deadLettered) {
                    deadLettered += 1;
                }
                continue;
            }
            if (result.success) {
                markSynced(entry.id);
                synced += 1;
                continue;
            }
            const failure = markFailed(entry.id, result.error ?? "Unknown error", config);
            failed += 1;
            if (failure.deadLettered) {
                deadLettered += 1;
            }
        }
    }
    finally {
        lastCycleResults = { synced, failed, deadLettered };
        isProcessing = false;
    }
}
export function startSyncWorker(apiEndpoint, apiKey, options = {}) {
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
    runSyncCycle(workerConfig).catch(console.error);
    workerInterval = setInterval(() => {
        if (!workerConfig)
            return;
        runSyncCycle(workerConfig).catch(console.error);
    }, workerConfig.syncIntervalMs);
}
export function stopSyncWorker() {
    if (!workerInterval)
        return;
    clearInterval(workerInterval);
    workerInterval = null;
    workerConfig = null;
}
export function isWorkerRunning() {
    return workerInterval !== null;
}
export async function forceSyncCycle() {
    if (!workerConfig) {
        throw new Error("Sync worker is not running");
    }
    await runSyncCycle(workerConfig);
}
export function getSyncWorkerMetrics() {
    return {
        isRunning: isWorkerRunning(),
        isProcessing,
        cyclesRun,
        lastCycleAt,
        lastCycleResults,
        queue: getSyncQueueMetrics(),
    };
}
//# sourceMappingURL=sync-worker.js.map