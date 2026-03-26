import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

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

const DEFAULT_CONFIG: Omit<SyncQueueConfig, "encryptionKey"> = {
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  batchSize: 10,
};

let syncQueue: SyncQueueEntry[] = [];
let deadLetterQueue: DeadLetterEntry[] = [];
let encryptionKey: Buffer | null = null;

let totalQueued = 0;
let totalSynced = 0;
let totalFailed = 0;
let totalDeadLettered = 0;

export function initSyncQueue(key: Buffer | string): void {
  if (typeof key === "string") {
    encryptionKey = createHash("sha256").update(key).digest();
    return;
  }

  if (key.length !== 32) {
    throw new Error("Encryption key must be 32 bytes for AES-256-GCM");
  }

  encryptionKey = key;
}

function encrypt(data: string): { encrypted: string; iv: string } {
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

function decrypt(encryptedData: string, ivBase64: string): string {
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

function generateId(): string {
  return `sq_${Date.now()}_${randomBytes(8).toString("hex")}`;
}

function calculateBackoff(retryCount: number, config: Omit<SyncQueueConfig, "encryptionKey">): number {
  const baseDelay = config.baseDelayMs * Math.pow(2, retryCount);
  const jitter = Math.random() * 0.3 * baseDelay;
  return Math.min(baseDelay + jitter, config.maxDelayMs);
}

export function queueWrite(userId: string, operation: SyncOperation, payload: Record<string, unknown>): string {
  const { encrypted, iv } = encrypt(JSON.stringify(payload));
  const entry: SyncQueueEntry = {
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

export function getPendingEntries(limit: number = DEFAULT_CONFIG.batchSize): SyncQueueEntry[] {
  const now = Date.now();
  return syncQueue
    .filter((entry) => entry.nextRetryAt !== null && entry.nextRetryAt <= now)
    .slice(0, limit);
}

export function getEntryPayload(entry: SyncQueueEntry): Record<string, unknown> {
  return JSON.parse(decrypt(entry.encryptedPayload, entry.iv)) as Record<string, unknown>;
}

export function markSynced(entryId: string): void {
  const index = syncQueue.findIndex((entry) => entry.id === entryId);
  if (index === -1) return;
  syncQueue.splice(index, 1);
  totalSynced += 1;
}

export function markFailed(
  entryId: string,
  error: string,
  config: Omit<SyncQueueConfig, "encryptionKey"> = DEFAULT_CONFIG,
): { deadLettered: boolean } {
  const entry = syncQueue.find((candidate) => candidate.id === entryId);
  if (!entry) return { deadLettered: false };

  entry.retryCount += 1;
  entry.lastError = error;
  totalFailed += 1;

  if (entry.retryCount >= config.maxRetries) {
    const deadEntry: DeadLetterEntry = {
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

export function getDeadLetterEntries(): DeadLetterEntry[] {
  return [...deadLetterQueue];
}

export function retryDeadLetter(entryId: string): boolean {
  const index = deadLetterQueue.findIndex((entry) => entry.id === entryId);
  if (index === -1) return false;

  const [entry] = deadLetterQueue.splice(index, 1);
  syncQueue.push({
    ...entry,
    retryCount: 0,
    nextRetryAt: Date.now(),
  });
  return true;
}

export function purgeDeadLetter(entryId: string): boolean {
  const index = deadLetterQueue.findIndex((entry) => entry.id === entryId);
  if (index === -1) return false;
  deadLetterQueue.splice(index, 1);
  return true;
}

export function getSyncQueueMetrics(): {
  pending: number;
  deadLettered: number;
  totalQueued: number;
  totalSynced: number;
  totalFailed: number;
  totalDeadLettered: number;
} {
  return {
    pending: syncQueue.length,
    deadLettered: deadLetterQueue.length,
    totalQueued,
    totalSynced,
    totalFailed,
    totalDeadLettered,
  };
}

export function clearQueues(): void {
  syncQueue = [];
  deadLetterQueue = [];
}
