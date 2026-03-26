import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
const DEFAULT_CONFIG = {
    maxRetries: 5,
    baseDelayMs: 1000,
    maxDelayMs: 60000,
    batchSize: 10,
};
let syncQueue = [];
let deadLetterQueue = [];
let encryptionKey = null;
let totalQueued = 0;
let totalSynced = 0;
let totalFailed = 0;
let totalDeadLettered = 0;
export function initSyncQueue(key) {
    if (typeof key === "string") {
        encryptionKey = createHash("sha256").update(key).digest();
        return;
    }
    if (key.length !== 32) {
        throw new Error("Encryption key must be 32 bytes for AES-256-GCM");
    }
    encryptionKey = key;
}
function encrypt(data) {
    if (!encryptionKey) {
        throw new Error("Sync queue not initialized. Call initSyncQueue first.");
    }
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
    let encrypted = cipher.update(data, "utf8", "base64");
    encrypted += cipher.final("base64");
    const authTag = cipher.getAuthTag();
    return {
        encrypted: `${encrypted}.${authTag.toString("base64")}`,
        iv: iv.toString("base64"),
    };
}
function decrypt(encryptedData, ivBase64) {
    if (!encryptionKey) {
        throw new Error("Sync queue not initialized. Call initSyncQueue first.");
    }
    const parts = encryptedData.split(".");
    if (parts.length !== 2) {
        console.warn(`[sync-queue] Invalid encrypted data format: expected 2 parts, got ${parts.length}`);
        return "";
    }
    const [encrypted, authTagBase64] = parts;
    const iv = Buffer.from(ivBase64, "base64");
    const authTag = Buffer.from(authTagBase64, "base64");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "base64", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
}
function generateId() {
    return `sq_${Date.now()}_${randomBytes(8).toString("hex")}`;
}
function calculateBackoff(retryCount, config) {
    const baseDelay = config.baseDelayMs * Math.pow(2, retryCount);
    const jitter = Math.random() * 0.3 * baseDelay;
    return Math.min(baseDelay + jitter, config.maxDelayMs);
}
export function queueWrite(userId, operation, payload) {
    const { encrypted, iv } = encrypt(JSON.stringify(payload));
    const entry = {
        id: generateId(),
        userId,
        operation,
        encryptedPayload: encrypted,
        iv,
        queuedAt: Date.now(),
        retryCount: 0,
        nextRetryAt: Date.now(),
    };
    syncQueue.push(entry);
    totalQueued += 1;
    return entry.id;
}
export function getPendingEntries(limit = DEFAULT_CONFIG.batchSize) {
    const now = Date.now();
    return syncQueue
        .filter((entry) => entry.nextRetryAt !== null && entry.nextRetryAt <= now)
        .slice(0, limit);
}
export function getEntryPayload(entry) {
    return JSON.parse(decrypt(entry.encryptedPayload, entry.iv));
}
export function markSynced(entryId) {
    const index = syncQueue.findIndex((entry) => entry.id === entryId);
    if (index === -1)
        return;
    syncQueue.splice(index, 1);
    totalSynced += 1;
}
export function markFailed(entryId, error, config = DEFAULT_CONFIG) {
    const entry = syncQueue.find((candidate) => candidate.id === entryId);
    if (!entry)
        return { deadLettered: false };
    entry.retryCount += 1;
    entry.lastError = error;
    totalFailed += 1;
    if (entry.retryCount >= config.maxRetries) {
        const deadEntry = {
            ...entry,
            deadLetteredAt: Date.now(),
            finalError: error,
            nextRetryAt: null,
        };
        deadLetterQueue.push(deadEntry);
        syncQueue = syncQueue.filter((candidate) => candidate.id !== entryId);
        totalDeadLettered += 1;
        return { deadLettered: true };
    }
    entry.nextRetryAt = Date.now() + calculateBackoff(entry.retryCount, config);
    return { deadLettered: false };
}
export function getDeadLetterEntries() {
    return [...deadLetterQueue];
}
export function retryDeadLetter(entryId) {
    const index = deadLetterQueue.findIndex((entry) => entry.id === entryId);
    if (index === -1)
        return false;
    const [entry] = deadLetterQueue.splice(index, 1);
    syncQueue.push({
        ...entry,
        retryCount: 0,
        nextRetryAt: Date.now(),
    });
    return true;
}
export function purgeDeadLetter(entryId) {
    const index = deadLetterQueue.findIndex((entry) => entry.id === entryId);
    if (index === -1)
        return false;
    deadLetterQueue.splice(index, 1);
    return true;
}
export function getSyncQueueMetrics() {
    return {
        pending: syncQueue.length,
        deadLettered: deadLetterQueue.length,
        totalQueued,
        totalSynced,
        totalFailed,
        totalDeadLettered,
    };
}
export function clearQueues() {
    syncQueue = [];
    deadLetterQueue = [];
}
//# sourceMappingURL=sync-queue.js.map