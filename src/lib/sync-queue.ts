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

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

// Queue entry types
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

const DEFAULT_CONFIG: Omit<SyncQueueConfig, "encryptionKey"> = {
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  batchSize: 10,
};

// In-memory queue (would be persisted to IndexedDB/SQLite in production)
let syncQueue: SyncQueueEntry[] = [];
let deadLetterQueue: DeadLetterEntry[] = [];
let encryptionKey: Buffer | null = null;

// Metrics
let totalQueued = 0;
let totalSynced = 0;
let totalFailed = 0;
let totalDeadLettered = 0;

/**
 * Initialize the sync queue with an encryption key.
 * Key should be 32 bytes for AES-256-GCM.
 */
export function initSyncQueue(key: Buffer | string): void {
  if (typeof key === "string") {
    // Derive 32-byte key from string using SHA-256
    encryptionKey = createHash("sha256").update(key).digest();
  } else if (key.length === 32) {
    encryptionKey = key;
  } else {
    throw new Error("Encryption key must be 32 bytes for AES-256-GCM");
  }
}

/**
 * Encrypt data using AES-256-GCM.
 */
function encrypt(data: string): { encrypted: string; iv: string } {
  if (!encryptionKey) {
    throw new Error("Sync queue not initialized. Call initSyncQueue first.");
  }

  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  
  let encrypted = cipher.update(data, "utf8", "base64");
  encrypted += cipher.final("base64");
  
  // Append auth tag for integrity verification
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted: encrypted + "." + authTag.toString("base64"),
    iv: iv.toString("base64"),
  };
}

/**
 * Decrypt data using AES-256-GCM.
 */
function decrypt(encryptedData: string, ivBase64: string): string {
  if (!encryptionKey) {
    throw new Error("Sync queue not initialized. Call initSyncQueue first.");
  }

  const [encrypted, authTagBase64] = encryptedData.split(".");
  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");
  
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}

/**
 * Generate a unique ID for queue entries.
 */
function generateId(): string {
  return `sq_${Date.now()}_${randomBytes(8).toString("hex")}`;
}

/**
 * Calculate next retry delay with exponential backoff and jitter.
 */
function calculateBackoff(retryCount: number, config: Omit<SyncQueueConfig, "encryptionKey">): number {
  const baseDelay = config.baseDelayMs * Math.pow(2, retryCount);
  const jitter = Math.random() * 0.3 * baseDelay; // 0-30% jitter
  return Math.min(baseDelay + jitter, config.maxDelayMs);
}

/**
 * Queue a write operation for sync.
 */
export function queueWrite(
  userId: string,
  operation: SyncOperation,
  payload: Record<string, unknown>
): string {
  const { encrypted, iv } = encrypt(JSON.stringify(payload));
  
  const entry: SyncQueueEntry = {
    id: generateId(),
    userId,
    operation,
    encryptedPayload: encrypted,
    iv,
    queuedAt: Date.now(),
    retryCount: 0,
    nextRetryAt: Date.now(), // Ready immediately
  };
  
  syncQueue.push(entry);
  totalQueued++;
  
  return entry.id;
}

/**
 * Get pending entries ready for sync.
 */
export function getPendingEntries(
  limit: number = DEFAULT_CONFIG.batchSize
): SyncQueueEntry[] {
  const now = Date.now();
  return syncQueue
    .filter((entry) => entry.nextRetryAt !== null && entry.nextRetryAt <= now)
    .slice(0, limit);
}

/**
 * Decrypt and get the payload for an entry.
 */
export function getEntryPayload(entry: SyncQueueEntry): Record<string, unknown> {
  const decrypted = decrypt(entry.encryptedPayload, entry.iv);
  return JSON.parse(decrypted);
}

/**
 * Mark an entry as successfully synced (removes from queue).
 */
export function markSynced(entryId: string): void {
  const index = syncQueue.findIndex((e) => e.id === entryId);
  if (index !== -1) {
    syncQueue.splice(index, 1);
    totalSynced++;
  }
}

/**
 * Mark an entry as failed and schedule retry or dead-letter.
 */
export function markFailed(
  entryId: string,
  error: string,
  config: Omit<SyncQueueConfig, "encryptionKey"> = DEFAULT_CONFIG
): { deadLettered: boolean } {
  const entry = syncQueue.find((e) => e.id === entryId);
  if (!entry) {
    return { deadLettered: false };
  }

  entry.retryCount++;
  entry.lastError = error;
  totalFailed++;

  if (entry.retryCount >= config.maxRetries) {
    // Move to dead letter queue
    const deadEntry: DeadLetterEntry = {
      ...entry,
      deadLetteredAt: Date.now(),
      finalError: error,
      nextRetryAt: null,
    };
    deadLetterQueue.push(deadEntry);
    
    // Remove from main queue
    const index = syncQueue.findIndex((e) => e.id === entryId);
    if (index !== -1) {
      syncQueue.splice(index, 1);
    }
    
    totalDeadLettered++;
    return { deadLettered: true };
  }

  // Schedule retry with backoff
  entry.nextRetryAt = Date.now() + calculateBackoff(entry.retryCount, config);
  return { deadLettered: false };
}

/**
 * Get dead letter queue entries.
 */
export function getDeadLetterEntries(): DeadLetterEntry[] {
  return [...deadLetterQueue];
}

/**
 * Retry a dead-lettered entry (moves back to main queue).
 */
export function retryDeadLetter(entryId: string): boolean {
  const index = deadLetterQueue.findIndex((e) => e.id === entryId);
  if (index === -1) {
    return false;
  }

  const entry = deadLetterQueue[index];
  deadLetterQueue.splice(index, 1);

  // Reset retry count and add back to main queue
  const requeued: SyncQueueEntry = {
    id: entry.id,
    userId: entry.userId,
    operation: entry.operation,
    encryptedPayload: entry.encryptedPayload,
    iv: entry.iv,
    queuedAt: Date.now(),
    retryCount: 0,
    nextRetryAt: Date.now(),
  };
  syncQueue.push(requeued);
  
  return true;
}

/**
 * Purge a dead-lettered entry permanently.
 */
export function purgeDeadLetter(entryId: string): boolean {
  const index = deadLetterQueue.findIndex((e) => e.id === entryId);
  if (index === -1) {
    return false;
  }
  deadLetterQueue.splice(index, 1);
  return true;
}

/**
 * Get queue metrics.
 */
export function getSyncQueueMetrics(): {
  queueDepth: number;
  deadLetterDepth: number;
  totalQueued: number;
  totalSynced: number;
  totalFailed: number;
  totalDeadLettered: number;
  oldestPendingAge: number | null;
} {
  const now = Date.now();
  const pendingEntries = syncQueue.filter((e) => e.nextRetryAt !== null);
  const oldestPending = pendingEntries.length > 0
    ? Math.min(...pendingEntries.map((e) => e.queuedAt))
    : null;

  return {
    queueDepth: syncQueue.length,
    deadLetterDepth: deadLetterQueue.length,
    totalQueued,
    totalSynced,
    totalFailed,
    totalDeadLettered,
    oldestPendingAge: oldestPending ? now - oldestPending : null,
  };
}

/**
 * Clear all queues (for testing).
 */
export function clearQueues(): void {
  syncQueue = [];
  deadLetterQueue = [];
  totalQueued = 0;
  totalSynced = 0;
  totalFailed = 0;
  totalDeadLettered = 0;
}
