/**
 * Working Memory Refresh System
 *
 * Manages automatic promotion/demotion of memories to/from 'working' tier:
 * - Promote memories with >= 5 accesses from non-working/critical tiers
 * - Demote 'working' tier memories not accessed in 14+ days
 *
 * This keeps the working memory fresh with actively used information.
 */
export type WorkingMemoryRefreshStats = {
    promoted: number;
    demoted: number;
};
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
export declare function refreshWorkingMemory(userId: string): Promise<WorkingMemoryRefreshStats>;
/**
 * Get a preview of what would be promoted/demoted without making changes.
 *
 * @param userId - The user to preview working memory refresh for
 * @returns Preview stats with counts and sample memory IDs
 */
export declare function previewWorkingMemoryRefresh(userId: string): Promise<{
    promoted: {
        count: number;
        sampleIds: string[];
    };
    demoted: {
        count: number;
        sampleIds: string[];
    };
}>;
//# sourceMappingURL=working-memory-refresh.d.ts.map