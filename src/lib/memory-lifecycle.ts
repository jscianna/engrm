/**
 * Memory Lifecycle Management
 * 
 * Three-tier system:
 * - Active: In working memory, auto-injected into context
 * - Archived: Searchable but dormant, requires explicit query
 * - Deleted: Purged permanently
 * 
 * Based on MoA synthesis for optimal thresholds.
 */

import { ensureDatabaseMigrations } from "./db-migrations";
import { getDb } from "./turso";
import { deleteMemoryVector } from "./qdrant";

// =============================================================================
// CONFIGURATION (MoA-recommended thresholds)
// =============================================================================

export const LIFECYCLE_CONFIG = {
  // Active memory limit per user
  activeMemoryLimit: 10_000,

  // Decay settings
  decay: {
    standardHalflifeDays: 60,
    identityHalflifeDays: 365,
  },

  // Archival triggers
  archival: {
    triggerDays: 90,              // Archive after 90 days no access
    identityTriggerDays: 180,     // Identity memories get longer grace
  },

  // Deletion thresholds
  deletion: {
    strengthThreshold: 0.20,      // Delete when strength < 0.20
    maxAgeDays: 270,              // Delete if older than this AND low mentions
    protection: {
      minMentions: 4,             // ≥4 mentions protects from deletion
      maxDormancyDays: 365,       // Protection expires after 1 year dormancy
    },
  },

  // Identity memory special rules
  identity: {
    patterns: [
      /\b(i am|i'm)\s+\w/i,
      /\bmy name is\b/i,
      /\bi live in\b/i,
      /\bi work (at|for)\b/i,
      /\bmy (wife|husband|partner|spouse)\b/i,
      /\bmy (birthday|age) is\b/i,
      /\bi was born\b/i,
      /\bmy email is\b/i,
      /\bmy phone is\b/i,
    ],
    strengthFloor: 1.0,           // Never decay below 1.0
    neverDelete: true,
  },

  // Auto-maintenance settings (MoA-recommended)
  autoMaintenance: {
    triggerProbability: 0.005,    // 0.5% of API calls
    cooldownMs: 60 * 60 * 1000,   // 1 hour per user
    batchSize: 100,               // Process 100 memories at a time
  },
} as const;

// =============================================================================
// TYPES
// =============================================================================

export type MemoryStatus = "active" | "archived" | "deleted";

export type MemoryLifecycleInfo = {
  id: string;
  strength: number;
  mentionCount: number;
  daysSinceAccess: number;
  daysSinceCreation: number;
  isIdentity: boolean;
  status: MemoryStatus;
  shouldArchive: boolean;
  shouldDelete: boolean;
  protectedBy: string | null;  // Reason for protection if any
};

// =============================================================================
// DETECTION
// =============================================================================

/**
 * Check if text contains identity patterns
 */
export function isIdentityMemory(text: string): boolean {
  return LIFECYCLE_CONFIG.identity.patterns.some(pattern => pattern.test(text));
}

// =============================================================================
// LIFECYCLE EVALUATION
// =============================================================================

/**
 * Evaluate a memory's lifecycle status and recommended action
 */
export function evaluateMemory(memory: {
  id: string;
  strength: number;
  mentionCount: number;
  lastAccessedAt: string | null;
  createdAt: string;
  isIdentity?: boolean;
  text?: string;
}): MemoryLifecycleInfo {
  const now = Date.now();
  const lastAccess = memory.lastAccessedAt 
    ? new Date(memory.lastAccessedAt).getTime() 
    : new Date(memory.createdAt).getTime();
  const created = new Date(memory.createdAt).getTime();
  
  const daysSinceAccess = Math.floor((now - lastAccess) / (1000 * 60 * 60 * 24));
  const daysSinceCreation = Math.floor((now - created) / (1000 * 60 * 60 * 24));
  
  // Check if identity memory
  const isIdentity = memory.isIdentity ?? (memory.text ? isIdentityMemory(memory.text) : false);
  
  // Determine protection
  let protectedBy: string | null = null;
  
  if (isIdentity && LIFECYCLE_CONFIG.identity.neverDelete) {
    protectedBy = "identity";
  } else if (
    memory.mentionCount >= LIFECYCLE_CONFIG.deletion.protection.minMentions &&
    daysSinceAccess < LIFECYCLE_CONFIG.deletion.protection.maxDormancyDays
  ) {
    protectedBy = `mention_count:${memory.mentionCount}`;
  }
  
  // Evaluate deletion
  let shouldDelete = false;
  if (!protectedBy) {
    if (memory.strength < LIFECYCLE_CONFIG.deletion.strengthThreshold) {
      shouldDelete = true;
    } else if (
      daysSinceAccess > LIFECYCLE_CONFIG.deletion.maxAgeDays &&
      memory.mentionCount < 2
    ) {
      shouldDelete = true;
    }
  }
  
  // Evaluate archival
  const archiveTrigger = isIdentity 
    ? LIFECYCLE_CONFIG.archival.identityTriggerDays 
    : LIFECYCLE_CONFIG.archival.triggerDays;
  const shouldArchive = !shouldDelete && daysSinceAccess >= archiveTrigger;
  
  // Determine current status
  let status: MemoryStatus = "active";
  if (shouldDelete) {
    status = "deleted";
  } else if (shouldArchive) {
    status = "archived";
  }
  
  return {
    id: memory.id,
    strength: memory.strength,
    mentionCount: memory.mentionCount,
    daysSinceAccess,
    daysSinceCreation,
    isIdentity,
    status,
    shouldArchive,
    shouldDelete,
    protectedBy,
  };
}

// =============================================================================
// DATABASE OPERATIONS
// =============================================================================

let initialized = false;

async function ensureLifecycleTable(): Promise<void> {
  if (initialized) return;
  
  await ensureDatabaseMigrations();
  const client = getDb();
  
  // Add archived_at and is_identity columns if not exist
  await client.executeMultiple(`
    -- Add lifecycle columns to memories table
    ALTER TABLE memories ADD COLUMN archived_at TEXT;
    ALTER TABLE memories ADD COLUMN is_identity INTEGER DEFAULT 0;
  `).catch(() => {
    // Columns may already exist, that's fine
  });
  
  // Create index for lifecycle queries
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_memories_lifecycle 
    ON memories(user_id, archived_at, strength, last_accessed_at)
  `).catch(() => {});
  
  initialized = true;
}

/**
 * Run lifecycle maintenance for a user
 * Returns stats about what was done
 */
export async function runLifecycleMaintenance(userId: string): Promise<{
  memoriesChecked: number;
  archived: number;
  deleted: number;
  protected: number;
}> {
  await ensureLifecycleTable();
  const client = getDb();
  
  const stats = {
    memoriesChecked: 0,
    archived: 0,
    deleted: 0,
    protected: 0,
  };
  
  // Fetch all active (non-archived) memories for user
  const result = await client.execute({
    sql: `
      SELECT id, strength, mention_count, last_accessed_at, created_at, 
             content_text, is_identity, archived_at
      FROM memories 
      WHERE user_id = ? AND archived_at IS NULL
    `,
    args: [userId],
  });
  
  stats.memoriesChecked = result.rows.length;
  
  const toArchive: string[] = [];
  const toDelete: string[] = [];
  
  for (const row of result.rows) {
    const memory = {
      id: row.id as string,
      strength: Number(row.strength ?? 1.0),
      mentionCount: Number(row.mention_count ?? 1),
      lastAccessedAt: row.last_accessed_at as string | null,
      createdAt: row.created_at as string,
      isIdentity: Boolean(row.is_identity),
      text: row.content_text as string,
    };
    
    const evaluation = evaluateMemory(memory);
    
    if (evaluation.shouldDelete) {
      toDelete.push(memory.id);
    } else if (evaluation.shouldArchive) {
      toArchive.push(memory.id);
    } else if (evaluation.protectedBy) {
      stats.protected++;
    }
  }
  
  // Archive memories
  if (toArchive.length > 0) {
    const now = new Date().toISOString();
    const placeholders = toArchive.map(() => "?").join(",");
    await client.execute({
      sql: `UPDATE memories SET archived_at = ? WHERE id IN (${placeholders})`,
      args: [now, ...toArchive],
    });
    stats.archived = toArchive.length;
  }
  
  // Delete memories (and their vectors)
  if (toDelete.length > 0) {
    const placeholders = toDelete.map(() => "?").join(",");

    // Then delete memories
    await client.execute({
      sql: `DELETE FROM memories WHERE id IN (${placeholders})`,
      args: toDelete,
    });

    await Promise.allSettled(toDelete.map(async (id) => deleteMemoryVector(id)));
    
    stats.deleted = toDelete.length;
  }
  
  return stats;
}

/**
 * Search archived memories explicitly
 */
export async function searchArchivedMemories(
  userId: string,
  query: string,
  limit: number = 10
): Promise<Array<{ id: string; title: string; archivedAt: string }>> {
  await ensureLifecycleTable();
  const client = getDb();
  
  const result = await client.execute({
    sql: `
      SELECT id, title, archived_at
      FROM memories
      WHERE user_id = ? AND archived_at IS NOT NULL
      ORDER BY archived_at DESC
      LIMIT ?
    `,
    args: [userId, limit],
  });
  
  return result.rows.map(row => ({
    id: row.id as string,
    title: row.title as string,
    archivedAt: row.archived_at as string,
  }));
}

/**
 * Restore a memory from archive
 */
export async function restoreFromArchive(userId: string, memoryId: string): Promise<boolean> {
  await ensureLifecycleTable();
  const client = getDb();
  
  const result = await client.execute({
    sql: `
      UPDATE memories 
      SET archived_at = NULL, 
          last_accessed_at = ?,
          strength = MAX(strength, 0.5)
      WHERE user_id = ? AND id = ? AND archived_at IS NOT NULL
    `,
    args: [new Date().toISOString(), userId, memoryId],
  });
  
  return (result.rowsAffected ?? 0) > 0;
}

// =============================================================================
// AUTO-MAINTENANCE (triggered probabilistically by API calls)
// =============================================================================

// In-memory cooldown cache (per-user last maintenance time)
const maintenanceCooldowns = new Map<string, number>();

/**
 * Maybe trigger auto-maintenance (0.5% probability, 1hr cooldown)
 * Call this from search/context endpoints. Runs async, never blocks.
 */
export function maybeAutoMaintenance(userId: string): void {
  // Probabilistic check (0.5%)
  if (Math.random() >= LIFECYCLE_CONFIG.autoMaintenance.triggerProbability) {
    return;
  }

  // Cooldown check (1 hour)
  const lastRun = maintenanceCooldowns.get(userId) ?? 0;
  const now = Date.now();
  if (now - lastRun < LIFECYCLE_CONFIG.autoMaintenance.cooldownMs) {
    return;
  }

  // Mark as running (prevents concurrent triggers)
  maintenanceCooldowns.set(userId, now);

  // Timeout cap: 10 seconds max to prevent DoS
  const MAINTENANCE_TIMEOUT_MS = 10_000;
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Maintenance timeout")), MAINTENANCE_TIMEOUT_MS);
  });

  // Run async with timeout - don't block the API response
  Promise.race([runLifecycleMaintenance(userId), timeoutPromise])
    .then((stats) => {
      if (stats.archived > 0 || stats.deleted > 0) {
        console.log(`[Lifecycle] Auto-maintenance for ${userId}: archived=${stats.archived}, deleted=${stats.deleted}`);
      }
    })
    .catch((err) => {
      console.error(`[Lifecycle] Auto-maintenance failed for ${userId}:`, err);
      // Reset cooldown on failure so it can retry sooner
      maintenanceCooldowns.delete(userId);
    });
}

/**
 * Get lifecycle stats for a user
 */
export async function getLifecycleStats(userId: string): Promise<{
  active: number;
  archived: number;
  identityMemories: number;
  protectedMemories: number;
  atRisk: number;  // Low strength, may be deleted soon
}> {
  await ensureLifecycleTable();
  const client = getDb();
  
  const result = await client.execute({
    sql: `
      SELECT 
        COUNT(CASE WHEN archived_at IS NULL THEN 1 END) as active,
        COUNT(CASE WHEN archived_at IS NOT NULL THEN 1 END) as archived,
        COUNT(CASE WHEN is_identity = 1 THEN 1 END) as identity,
        COUNT(CASE WHEN mention_count >= 4 THEN 1 END) as protected,
        COUNT(CASE WHEN strength < 0.3 AND archived_at IS NULL THEN 1 END) as at_risk
      FROM memories
      WHERE user_id = ?
    `,
    args: [userId],
  });
  
  const row = result.rows[0] as Record<string, unknown>;
  return {
    active: Number(row?.active ?? 0),
    archived: Number(row?.archived ?? 0),
    identityMemories: Number(row?.identity ?? 0),
    protectedMemories: Number(row?.protected ?? 0),
    atRisk: Number(row?.at_risk ?? 0),
  };
}
