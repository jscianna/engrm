import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/turso";
import { decryptMemoryContent } from "@/lib/db";
import type { MemoryImportanceTier, MemoryKind } from "@/lib/types";

export const runtime = "nodejs";

// Estimated tokens per character
const TOKENS_PER_CHAR = 0.25;

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = getDb();

    // Fetch memories with full details for browser
    const memoriesResult = await client.execute({
      sql: `
        SELECT 
          id, title, content_text, memory_type, importance_tier,
          access_count, feedback_score, last_accessed_at,
          promotion_locked, decay_immune, locked_tier, created_at
        FROM memories
        WHERE user_id = ? AND archived_at IS NULL
        ORDER BY created_at DESC
        LIMIT 500
      `,
      args: [userId],
    });

    const memories = memoriesResult.rows.map((row) => {
      const r = row as Record<string, unknown>;
      const rawText = r.content_text as string;
      const decryptedText = decryptMemoryContent(rawText, userId);
      return {
        id: r.id as string,
        title: r.title as string,
        text: decryptedText.slice(0, 500), // Truncate for display
        memoryType: (r.memory_type as MemoryKind) ?? "episodic",
        importanceTier: (r.importance_tier as MemoryImportanceTier) ?? "normal",
        accessCount: Number(r.access_count ?? 0),
        feedbackScore: Number(r.feedback_score ?? 0),
        lastAccessedAt: (r.last_accessed_at as string | null) ?? null,
        promotionLocked: Number(r.promotion_locked ?? 0) === 1,
        decayImmune: Number(r.decay_immune ?? 0) === 1,
        lockedTier: (r.locked_tier as MemoryImportanceTier | null) ?? null,
        createdAt: r.created_at as string,
      };
    });

    // Calculate stats
    const statsResult = await client.execute({
      sql: `
        SELECT 
          COUNT(*) as total,
          SUM(LENGTH(content_text)) as total_chars,
          AVG(access_count) as avg_access,
          SUM(CASE WHEN importance_tier = 'critical' THEN 1 ELSE 0 END) as critical,
          SUM(CASE WHEN importance_tier = 'working' THEN 1 ELSE 0 END) as working,
          SUM(CASE WHEN importance_tier = 'high' THEN 1 ELSE 0 END) as high,
          SUM(CASE WHEN importance_tier = 'normal' THEN 1 ELSE 0 END) as normal
        FROM memories
        WHERE user_id = ? AND archived_at IS NULL
      `,
      args: [userId],
    });

    const statsRow = statsResult.rows[0] as Record<string, unknown> | undefined;
    const stats = {
      totalMemories: Number(statsRow?.total ?? 0),
      totalTokens: Math.round(Number(statsRow?.total_chars ?? 0) * TOKENS_PER_CHAR),
      avgAccessCount: Math.round((Number(statsRow?.avg_access ?? 0)) * 10) / 10,
      tierDistribution: {
        critical: Number(statsRow?.critical ?? 0),
        working: Number(statsRow?.working ?? 0),
        high: Number(statsRow?.high ?? 0),
        normal: Number(statsRow?.normal ?? 0),
      },
    };

    return NextResponse.json({ memories, stats });
  } catch (error) {
    console.error("[Browser API] Error:", error);
    return NextResponse.json(
      { error: "Failed to load browser data" },
      { status: 500 }
    );
  }
}
