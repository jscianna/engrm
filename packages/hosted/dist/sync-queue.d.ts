export type SyncOperation = "create" | "update" | "delete";
export interface SyncQueueEntry {
    id: string;
    userId: string;
    operation: SyncOperation;
    encryptedPayload: string;
    iv: string;
    queuedAt: number;
    retryCount: number;
    nextRetryAt: number | null;
    lastError?: string;
}
export interface DeadLetterEntry extends SyncQueueEntry {
    deadLetteredAt: number;
    finalError: string;
}
export interface SyncQueueConfig {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    batchSize: number;
    encryptionKey: Buffer;
}
export declare function initSyncQueue(key: Buffer | string): void;
export declare function queueWrite(userId: string, operation: SyncOperation, payload: Record<string, unknown>): string;
export declare function getPendingEntries(limit?: number): SyncQueueEntry[];
export declare function getEntryPayload(entry: SyncQueueEntry): Record<string, unknown>;
export declare function markSynced(entryId: string): void;
export declare function markFailed(entryId: string, error: string, config?: Omit<SyncQueueConfig, "encryptionKey">): {
    deadLettered: boolean;
};
export declare function getDeadLetterEntries(): DeadLetterEntry[];
export declare function retryDeadLetter(entryId: string): boolean;
export declare function purgeDeadLetter(entryId: string): boolean;
export declare function getSyncQueueMetrics(): {
    pending: number;
    deadLettered: number;
    totalQueued: number;
    totalSynced: number;
    totalFailed: number;
    totalDeadLettered: number;
};
export declare function clearQueues(): void;
//# sourceMappingURL=sync-queue.d.ts.map