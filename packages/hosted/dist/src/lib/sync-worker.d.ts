/**
 * Sync Worker
 *
 * Background worker that processes the sync queue.
 * Batches writes and syncs to hosted backend with retry logic.
 */
import { getSyncQueueMetrics } from "./sync-queue";
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
/**
 * Start the sync worker.
 */
export declare function startSyncWorker(apiEndpoint: string, apiKey: string, options?: Partial<Omit<SyncWorkerConfig, "apiEndpoint" | "apiKey">>): void;
/**
 * Stop the sync worker.
 */
export declare function stopSyncWorker(): void;
/**
 * Check if worker is running.
 */
export declare function isWorkerRunning(): boolean;
/**
 * Force an immediate sync cycle (for testing/debugging).
 */
export declare function forceSyncCycle(): Promise<void>;
/**
 * Get sync worker metrics.
 */
export declare function getSyncWorkerMetrics(): {
    running: boolean;
    cyclesRun: number;
    lastCycleAt: number | null;
    lastCycleResults: {
        synced: number;
        failed: number;
        deadLettered: number;
    } | null;
    queueMetrics: ReturnType<typeof getSyncQueueMetrics>;
};
//# sourceMappingURL=sync-worker.d.ts.map