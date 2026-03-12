"use strict";
/**
 * Working Memory Refresh System
 *
 * Manages automatic promotion/demotion of memories to/from 'working' tier:
 * - Promote memories with >= 5 accesses from non-working/critical tiers
 * - Demote 'working' tier memories not accessed in 14+ days
 *
 * This keeps the working memory fresh with actively used information.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshWorkingMemory = refreshWorkingMemory;
exports.previewWorkingMemoryRefresh = previewWorkingMemoryRefresh;
const turso_1 = require("@/lib/turso");
let initialized = false;
async function ensureInitialized() {
    if (initialized)
        return;
    await import("@/lib/db").then((mod) => mod.ensureCoreMemoryTables());
    initialized = true;
}
/**
 * Refresh working memory tier based on access patterns.
 *
 * Promotion criteria:
 * - access_count >= 5
 * - importance_tier is NOT 'working' or 'critical' (i.e., 'high' or 'normal')
 * - NOT promotion_locked
 *
 * Demotion criteria:
 * - importance_tier = 'working'
 * - last_accessed_at is 14+ days ago (or never accessed)
 * - NOT promotion_locked
 *
 * @param userId - The user to refresh working memory for
 * @returns Stats about promoted and demoted memories
 */
async function refreshWorkingMemory(userId) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
    const stats = {
        promoted: 0,
        demoted: 0,
    };
    // Calculate the cutoff date (14 days ago)
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const cutoffDate = fourteenDaysAgo.toISOString();
    // PROMOTION: Find memories with >= 5 accesses that are not 'working' or 'critical'
    const promoteResult = await client.execute({
        sql: `
      UPDATE memories
      SET importance_tier = 'working'
      WHERE user_id = ?
        AND access_count >= 5
        AND importance_tier NOT IN ('working', 'critical')
        AND promotion_locked = 0
    `,
        args: [userId],
    });
    stats.promoted = promoteResult.rowsAffected ?? 0;
    // DEMOTION: Find 'working' tier memories not accessed in 14+ days
    // Handle both accessed (last_accessed_at) and never accessed (created_at check)
    const demoteResult = await client.execute({
        sql: `
      UPDATE memories
      SET importance_tier = 'high'
      WHERE user_id = ?
        AND importance_tier = 'working'
        AND promotion_locked = 0
        AND (
          last_accessed_at IS NULL 
          OR last_accessed_at < ?
        )
    `,
        args: [userId, cutoffDate],
    });
    stats.demoted = demoteResult.rowsAffected ?? 0;
    return stats;
}
/**
 * Get a preview of what would be promoted/demoted without making changes.
 *
 * @param userId - The user to preview working memory refresh for
 * @returns Preview stats with counts and sample memory IDs
 */
async function previewWorkingMemoryRefresh(userId) {
    await ensureInitialized();
    const client = (0, turso_1.getDb)();
    // Calculate the cutoff date (14 days ago)
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const cutoffDate = fourteenDaysAgo.toISOString();
    // Preview promotions: find memories that would be promoted
    const promoteResult = await client.execute({
        sql: `
      SELECT id
      FROM memories
      WHERE user_id = ?
        AND access_count >= 5
        AND importance_tier NOT IN ('working', 'critical')
        AND promotion_locked = 0
      LIMIT 10
    `,
        args: [userId],
    });
    // Count all promotions
    const promoteCountResult = await client.execute({
        sql: `
      SELECT COUNT(*) as count
      FROM memories
      WHERE user_id = ?
        AND access_count >= 5
        AND importance_tier NOT IN ('working', 'critical')
        AND promotion_locked = 0
    `,
        args: [userId],
    });
    // Preview demotions: find memories that would be demoted
    const demoteResult = await client.execute({
        sql: `
      SELECT id
      FROM memories
      WHERE user_id = ?
        AND importance_tier = 'working'
        AND promotion_locked = 0
        AND (
          last_accessed_at IS NULL 
          OR last_accessed_at < ?
        )
      LIMIT 10
    `,
        args: [userId, cutoffDate],
    });
    // Count all demotions
    const demoteCountResult = await client.execute({
        sql: `
      SELECT COUNT(*) as count
      FROM memories
      WHERE user_id = ?
        AND importance_tier = 'working'
        AND promotion_locked = 0
        AND (
          last_accessed_at IS NULL 
          OR last_accessed_at < ?
        )
    `,
        args: [userId, cutoffDate],
    });
    return {
        promoted: {
            count: Number(promoteCountResult.rows[0]?.count ?? 0),
            sampleIds: promoteResult.rows.map((row) => row.id),
        },
        demoted: {
            count: Number(demoteCountResult.rows[0]?.count ?? 0),
            sampleIds: demoteResult.rows.map((row) => row.id),
        },
    };
}
//# sourceMappingURL=working-memory-refresh.js.map