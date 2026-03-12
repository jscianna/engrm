import { getSyncQueueMetrics } from "./sync-queue.js";
export interface SyncWorkerConfig {
    apiEndpoint: string;
    apiKey: string;
    batchSize: number;
    syncIntervalMs: number;
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
}
export declare function startSyncWorker(apiEndpoint: string, apiKey: string, options?: Partial<Omit<SyncWorkerConfig, "apiEndpoint" | "apiKey">>): void;
export declare function stopSyncWorker(): void;
export declare function isWorkerRunning(): boolean;
export declare function forceSyncCycle(): Promise<void>;
export declare function getSyncWorkerMetrics(): {
    isRunning: boolean;
    isProcessing: boolean;
    cyclesRun: number;
    lastCycleAt: number | null;
    lastCycleResults: {
        synced: number;
        failed: number;
        deadLettered: number;
    } | null;
    queue: ReturnType<typeof getSyncQueueMetrics>;
};
//# sourceMappingURL=sync-worker.d.ts.map