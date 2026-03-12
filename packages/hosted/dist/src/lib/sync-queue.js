"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSyncQueue = initSyncQueue;
exports.queueWrite = queueWrite;
exports.getPendingEntries = getPendingEntries;
exports.getEntryPayload = getEntryPayload;
exports.markSynced = markSynced;
exports.markFailed = markFailed;
exports.getDeadLetterEntries = getDeadLetterEntries;
exports.retryDeadLetter = retryDeadLetter;
exports.purgeDeadLetter = purgeDeadLetter;
exports.getSyncQueueMetrics = getSyncQueueMetrics;
exports.clearQueues = clearQueues;
const crypto_1 = require("crypto");
const DEFAULT_CONFIG = {
    maxRetries: 5,
    baseDelayMs: 1000,
    maxDelayMs: 60000,
    batchSize: 10,
};
// In-memory queue (would be persisted to IndexedDB/SQLite in production)
let syncQueue = [];
let deadLetterQueue = [];
let encryptionKey = null;
// Metrics
let totalQueued = 0;
let totalSynced = 0;
let totalFailed = 0;
let totalDeadLettered = 0;
/**
 * Initialize the sync queue with an encryption key.
 * Key should be 32 bytes for AES-256-GCM.
 */
function initSyncQueue(key) {
    if (typeof key === "string") {
        // Derive 32-byte key from string using SHA-256
        encryptionKey = (0, crypto_1.createHash)("sha256").update(key).digest();
    }
    else if (key.length === 32) {
        encryptionKey = key;
    }
    else {
        throw new Error("Encryption key must be 32 bytes for AES-256-GCM");
    }
}
/**
 * Encrypt data using AES-256-GCM.
 */
function encrypt(data) {
    if (!encryptionKey) {
        throw new Error("Sync queue not initialized. Call initSyncQueue first.");
    }
    const iv = (0, crypto_1.randomBytes)(16);
    const cipher = (0, crypto_1.createCipheriv)("aes-256-gcm", encryptionKey, iv);
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
function decrypt(encryptedData, ivBase64) {
    if (!encryptionKey) {
        throw new Error("Sync queue not initialized. Call initSyncQueue first.");
    }
    const [encrypted, authTagBase64] = encryptedData.split(".");
    const iv = Buffer.from(ivBase64, "base64");
    const authTag = Buffer.from(authTagBase64, "base64");
    const decipher = (0, crypto_1.createDecipheriv)("aes-256-gcm", encryptionKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "base64", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
}
/**
 * Generate a unique ID for queue entries.
 */
function generateId() {
    return `sq_${Date.now()}_${(0, crypto_1.randomBytes)(8).toString("hex")}`;
}
/**
 * Calculate next retry delay with exponential backoff and jitter.
 */
function calculateBackoff(retryCount, config) {
    const baseDelay = config.baseDelayMs * Math.pow(2, retryCount);
    const jitter = Math.random() * 0.3 * baseDelay; // 0-30% jitter
    return Math.min(baseDelay + jitter, config.maxDelayMs);
}
/**
 * Queue a write operation for sync.
 */
function queueWrite(userId, operation, payload) {
    const { encrypted, iv } = encrypt(JSON.stringify(payload));
    const entry = {
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
function getPendingEntries(limit = DEFAULT_CONFIG.batchSize) {
    const now = Date.now();
    return syncQueue
        .filter((entry) => entry.nextRetryAt !== null && entry.nextRetryAt <= now)
        .slice(0, limit);
}
/**
 * Decrypt and get the payload for an entry.
 */
function getEntryPayload(entry) {
    const decrypted = decrypt(entry.encryptedPayload, entry.iv);
    return JSON.parse(decrypted);
}
/**
 * Mark an entry as successfully synced (removes from queue).
 */
function markSynced(entryId) {
    const index = syncQueue.findIndex((e) => e.id === entryId);
    if (index !== -1) {
        syncQueue.splice(index, 1);
        totalSynced++;
    }
}
/**
 * Mark an entry as failed and schedule retry or dead-letter.
 */
function markFailed(entryId, error, config = DEFAULT_CONFIG) {
    const entry = syncQueue.find((e) => e.id === entryId);
    if (!entry) {
        return { deadLettered: false };
    }
    entry.retryCount++;
    entry.lastError = error;
    totalFailed++;
    if (entry.retryCount >= config.maxRetries) {
        // Move to dead letter queue
        const deadEntry = {
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
function getDeadLetterEntries() {
    return [...deadLetterQueue];
}
/**
 * Retry a dead-lettered entry (moves back to main queue).
 */
function retryDeadLetter(entryId) {
    const index = deadLetterQueue.findIndex((e) => e.id === entryId);
    if (index === -1) {
        return false;
    }
    const entry = deadLetterQueue[index];
    deadLetterQueue.splice(index, 1);
    // Reset retry count and add back to main queue
    const requeued = {
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
function purgeDeadLetter(entryId) {
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
function getSyncQueueMetrics() {
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
function clearQueues() {
    syncQueue = [];
    deadLetterQueue = [];
    totalQueued = 0;
    totalSynced = 0;
    totalFailed = 0;
    totalDeadLettered = 0;
}
//# sourceMappingURL=sync-queue.js.map