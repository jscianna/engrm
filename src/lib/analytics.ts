import { getDb } from "@/lib/turso";
import type { MemoryImportanceTier } from "@/lib/types";

// Estimated tokens per character (rough approximation)
const TOKENS_PER_CHAR = 0.25;

// Average context window size without memory
const AVG_CONTEXT_WITHOUT_MEMORY = 4000;

export type AnalyticsPeriod = "7d" | "30d" | "90d";

export type AnalyticsMetric = 
  | "token_savings" 
  | "memory_growth" 
  | "tier_distribution" 
  | "access_patterns";

export type AnalyticsParams = {
  userId: string;
  period: AnalyticsPeriod;
  metrics: AnalyticsMetric[];
};

export type TokenSavingsData = {
  withFatHippo: number;
  withoutFatHippo: number;
  savedPercent: number;
};

export type MemoryGrowthData = {
  start: number;
  end: number;
  netNew: number;
  consolidated: number;
  archived: number;
};

export type TierDistributionData = {
  critical: number;
  working: number;
  high: number;
  normal: number;
};

export type AccessPatternsData = {
  totalSearches: number;
  avgResultsPerSearch: number;
  topAccessedMemories: Array<{ id: string; title: string; accessCount: number }>;
  promotions: number;
  demotions: number;
};

export type ReinforcementsData = {
  positive: number;
  negative: number;
};

export type AnalyticsResponse = {
  period: AnalyticsPeriod;
  tokenSavings?: TokenSavingsData;
  memoryGrowth?: MemoryGrowthData;
  tierDistribution?: TierDistributionData;
  accessPatterns?: AccessPatternsData;
  reinforcements?: ReinforcementsData;
};

export type AnalyticsSummary = {
  totalMemories: number;
  memoriesThisWeek: number;
  totalSearches: number;
  avgAccessCount: number;
  tierDistribution: TierDistributionData;
  topMemory: { id: string; title: string; accessCount: number } | null;
};

function getPeriodDays(period: AnalyticsPeriod): number {
  switch (period) {
    case "7d": return 7;
    case "30d": return 30;
    case "90d": return 90;
    default: return 7;
  }
}

function getPeriodCutoff(period: AnalyticsPeriod): string {
  const days = getPeriodDays(period);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return cutoff.toISOString();
}

export async function getAnalytics(params: AnalyticsParams): Promise<AnalyticsResponse> {
  const client = getDb();
  const cutoff = getPeriodCutoff(params.period);
  const result: AnalyticsResponse = { period: params.period };

  // Token Savings
  if (params.metrics.includes("token_savings")) {
    const memorySizeResult = await client.execute({
      sql: `
        SELECT 
          SUM(LENGTH(content_text)) as total_chars,
          COUNT(*) as memory_count,
          SUM(access_count) as total_accesses
        FROM memories 
        WHERE user_id = ? AND archived_at IS NULL
      `,
      args: [params.userId],
    });
    const row = memorySizeResult.rows[0] as Record<string, unknown> | undefined;
    const totalChars = Number(row?.total_chars ?? 0);
    const totalAccesses = Number(row?.total_accesses ?? 0);

    // Estimate tokens saved: each access would have needed full context
    // With fathippo, we only inject relevant memories (estimated ~10% of total)
    const tokensWithoutFatHippo = Math.round(totalAccesses * AVG_CONTEXT_WITHOUT_MEMORY);
    const avgMemoryTokens = Math.round((totalChars * TOKENS_PER_CHAR) / Math.max(1, Number(row?.memory_count ?? 1)));
    const tokensWithFatHippo = Math.round(totalAccesses * avgMemoryTokens * 3); // Assume 3 memories per context
    const savedPercent = tokensWithoutFatHippo > 0 
      ? Math.round((1 - tokensWithFatHippo / tokensWithoutFatHippo) * 100) 
      : 0;

    result.tokenSavings = {
      withFatHippo: tokensWithFatHippo,
      withoutFatHippo: tokensWithoutFatHippo,
      savedPercent: Math.max(0, savedPercent),
    };
  }

  // Memory Growth
  if (params.metrics.includes("memory_growth")) {
    const growthResult = await client.execute({
      sql: `
        SELECT
          (SELECT COUNT(*) FROM memories WHERE user_id = ? AND created_at < ? AND archived_at IS NULL) as start_count,
          (SELECT COUNT(*) FROM memories WHERE user_id = ? AND archived_at IS NULL) as end_count,
          (SELECT COUNT(*) FROM memories WHERE user_id = ? AND created_at >= ? AND archived_at IS NULL) as new_count,
          (SELECT COUNT(*) FROM memories WHERE user_id = ? AND memory_type = 'compacted' AND created_at >= ?) as consolidated_count,
          (SELECT COUNT(*) FROM memories WHERE user_id = ? AND archived_at IS NOT NULL AND archived_at >= ?) as archived_count
      `,
      args: [
        params.userId, cutoff,
        params.userId,
        params.userId, cutoff,
        params.userId, cutoff,
        params.userId, cutoff,
      ],
    });
    const growth = growthResult.rows[0] as Record<string, unknown> | undefined;
    
    result.memoryGrowth = {
      start: Number(growth?.start_count ?? 0),
      end: Number(growth?.end_count ?? 0),
      netNew: Number(growth?.new_count ?? 0),
      consolidated: Number(growth?.consolidated_count ?? 0),
      archived: Number(growth?.archived_count ?? 0),
    };
  }

  // Tier Distribution
  if (params.metrics.includes("tier_distribution")) {
    const tierResult = await client.execute({
      sql: `
        SELECT importance_tier, COUNT(*) as count
        FROM memories
        WHERE user_id = ? AND archived_at IS NULL
        GROUP BY importance_tier
      `,
      args: [params.userId],
    });

    const distribution: TierDistributionData = { critical: 0, working: 0, high: 0, normal: 0 };
    for (const row of tierResult.rows) {
      const tier = (row as Record<string, unknown>).importance_tier as MemoryImportanceTier;
      const count = Number((row as Record<string, unknown>).count ?? 0);
      if (tier in distribution) {
        distribution[tier] = count;
      }
    }
    result.tierDistribution = distribution;
  }

  // Access Patterns
  if (params.metrics.includes("access_patterns")) {
    // Total accesses as proxy for searches
    const accessResult = await client.execute({
      sql: `
        SELECT 
          SUM(access_count) as total_accesses,
          AVG(access_count) as avg_access
        FROM memories
        WHERE user_id = ? AND archived_at IS NULL
      `,
      args: [params.userId],
    });
    const accessRow = accessResult.rows[0] as Record<string, unknown> | undefined;

    // Top accessed memories
    const topResult = await client.execute({
      sql: `
        SELECT id, title, access_count
        FROM memories
        WHERE user_id = ? AND archived_at IS NULL
        ORDER BY access_count DESC
        LIMIT 5
      `,
      args: [params.userId],
    });

    // Estimate promotions/demotions from tier changes (using feedback score as proxy)
    const feedbackResult = await client.execute({
      sql: `
        SELECT 
          SUM(CASE WHEN feedback_score > 0 THEN 1 ELSE 0 END) as positive,
          SUM(CASE WHEN feedback_score < 0 THEN 1 ELSE 0 END) as negative
        FROM memories
        WHERE user_id = ? AND archived_at IS NULL AND last_accessed_at >= ?
      `,
      args: [params.userId, cutoff],
    });
    const fbRow = feedbackResult.rows[0] as Record<string, unknown> | undefined;

    result.accessPatterns = {
      totalSearches: Math.round(Number(accessRow?.total_accesses ?? 0) / 3), // Estimate 3 results per search
      avgResultsPerSearch: 3.0,
      topAccessedMemories: topResult.rows.map((r) => ({
        id: (r as Record<string, unknown>).id as string,
        title: (r as Record<string, unknown>).title as string,
        accessCount: Number((r as Record<string, unknown>).access_count ?? 0),
      })),
      promotions: Number(fbRow?.positive ?? 0),
      demotions: Number(fbRow?.negative ?? 0),
    };
  }

  // Reinforcements (always include if available)
  const reinforcementResult = await client.execute({
    sql: `
      SELECT 
        SUM(CASE WHEN feedback_score > 0 THEN feedback_score ELSE 0 END) as positive,
        SUM(CASE WHEN feedback_score < 0 THEN ABS(feedback_score) ELSE 0 END) as negative
      FROM memories
      WHERE user_id = ? AND archived_at IS NULL
    `,
    args: [params.userId],
  });
  const rfRow = reinforcementResult.rows[0] as Record<string, unknown> | undefined;
  result.reinforcements = {
    positive: Number(rfRow?.positive ?? 0),
    negative: Number(rfRow?.negative ?? 0),
  };

  return result;
}

export async function getAnalyticsSummary(userId: string): Promise<AnalyticsSummary> {
  const client = getDb();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Get counts
  const countResult = await client.execute({
    sql: `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as this_week,
        SUM(access_count) as total_accesses,
        AVG(access_count) as avg_access
      FROM memories
      WHERE user_id = ? AND archived_at IS NULL
    `,
    args: [weekAgo, userId],
  });
  const countRow = countResult.rows[0] as Record<string, unknown> | undefined;

  // Tier distribution
  const tierResult = await client.execute({
    sql: `
      SELECT importance_tier, COUNT(*) as count
      FROM memories
      WHERE user_id = ? AND archived_at IS NULL
      GROUP BY importance_tier
    `,
    args: [userId],
  });

  const distribution: TierDistributionData = { critical: 0, working: 0, high: 0, normal: 0 };
  for (const row of tierResult.rows) {
    const tier = (row as Record<string, unknown>).importance_tier as MemoryImportanceTier;
    const count = Number((row as Record<string, unknown>).count ?? 0);
    if (tier in distribution) {
      distribution[tier] = count;
    }
  }

  // Top memory
  const topResult = await client.execute({
    sql: `
      SELECT id, title, access_count
      FROM memories
      WHERE user_id = ? AND archived_at IS NULL
      ORDER BY access_count DESC
      LIMIT 1
    `,
    args: [userId],
  });
  const topRow = topResult.rows[0] as Record<string, unknown> | undefined;

  return {
    totalMemories: Number(countRow?.total ?? 0),
    memoriesThisWeek: Number(countRow?.this_week ?? 0),
    totalSearches: Math.round(Number(countRow?.total_accesses ?? 0) / 3),
    avgAccessCount: Math.round(Number(countRow?.avg_access ?? 0) * 10) / 10,
    tierDistribution: distribution,
    topMemory: topRow ? {
      id: topRow.id as string,
      title: topRow.title as string,
      accessCount: Number(topRow.access_count ?? 0),
    } : null,
  };
}
