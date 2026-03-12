/**
 * Sync Queue
 *
 * Encrypted write queue for local-first memory operations.
 * Queues writes locally, syncs to hosted backend in background with retry.
 *
 * Features:
 * - AES-256-GCM encryption at rest
 * - Exponential backoff with jitter
 * - Dead-letter queue for failed writes
 * - Batch processing for efficiency
 */
export type SyncOperation = "create" | "update" | "delete";
export interface SyncQueueEntry {
    id: string;
    userId: string;
    operation: SyncOperation;
    /** Encrypted payload (base64) */
    encryptedPayload: string;
    /** IV for decryption (base64) */
    iv: string;
    /** Timestamp when queued */
    queuedAt: number;
    /** Number of retry attempts */
    retryCount: number;
    /** Next retry timestamp (null if not scheduled) */
    nextRetryAt: number | null;
    /** Last error message if failed */
    lastError?: string;
}
export interface DeadLetterEntry extends SyncQueueEntry {
    /** When moved to dead letter */
    deadLetteredAt: number;
    /** Final error that caused dead-lettering */
    finalError: string;
}
export interface SyncQueueConfig {
    /** Max retry attempts before dead-lettering (default: 5) */
    maxRetries: number;
    /** Base delay in ms for exponential backoff (default: 1000) */
    baseDelayMs: number;
    /** Max delay in ms for backoff cap (default: 60000) */
    maxDelayMs: number;
    /** Batch size for sync operations (default: 10) */
    batchSize: number;
    /** Encryption key (32 bytes for AES-256) */
    encryptionKey: Buffer;
}
/**
 * Initialize the sync queue with an encryption key.
 * Key should be 32 bytes for AES-256-GCM.
 */
export declare function initSyncQueue(key: Buffer | string): void;
/**
 * Queue a write operation for sync.
 */
export declare function queueWrite(userId: string, operation: SyncOperation, payload: Record<string, unknown>): string;
/**
 * Get pending entries ready for sync.
 */
export declare function getPendingEntries(limit?: number): SyncQueueEntry[];
/**
 * Decrypt and get the payload for an entry.
 */
export declare function getEntryPayload(entry: SyncQueueEntry): Record<string, unknown>;
/**
 * Mark an entry as successfully synced (removes from queue).
 */
export declare function markSynced(entryId: string): void;
/**
 * Mark an entry as failed and schedule retry or dead-letter.
 */
export declare function markFailed(entryId: string, error: string, config?: Omit<SyncQueueConfig, "encryptionKey">): {
    deadLettered: boolean;
};
/**
 * Get dead letter queue entries.
 */
export declare function getDeadLetterEntries(): DeadLetterEntry[];
/**
 * Retry a dead-lettered entry (moves back to main queue).
 */
export declare function retryDeadLetter(entryId: string): boolean;
/**
 * Purge a dead-lettered entry permanently.
 */
export declare function purgeDeadLetter(entryId: string): boolean;
/**
 * Get queue metrics.
 */
export declare function getSyncQueueMetrics(): {
    queueDepth: number;
    deadLetterDepth: number;
    totalQueued: number;
    totalSynced: number;
    totalFailed: number;
    totalDeadLettered: number;
    oldestPendingAge: number | null;
};
/**
 * Clear all queues (for testing).
 */
export declare function clearQueues(): void;
//# sourceMappingURL=sync-queue.d.ts.map