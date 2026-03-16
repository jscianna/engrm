"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { listMemoryRecordsByUser } from "@/lib/db";
import { createClient } from "@libsql/client";

const CRITICAL_PATTERNS = [
  "critical", "principle", "never", "always", "security", "milestone",
  "published", "product vision", "positioning", "identity", "thesis",
  "philosophy", "competitive", "portfolio", "venture", "credential",
  "password", "strategy", "naming decision", "api key", "must not",
  "founders watch", "deal evaluation", "tech stack", "feature set",
  "market", "investment",
];

const HIGH_PATTERNS = [
  "preference", "built", "shipped", "architecture", "decision",
  "project", "work", "career", "company", "business", "partner",
  "important", "goal", "plan", "relationship", "family", "team",
  "deadline", "bookmark", "plugin", "dashboard", "billing",
  "optimization", "redesign", "latency", "colleague", "friend",
];

const LOW_PATTERNS = [
  "test", "pre-compaction", "memory flush", "weather", "recipe",
  "restaurant", "food", "plant", "music", "movie", "cost", "price",
  "subscription", "fertilize", "nachos", "peace lily", "guisados",
  "amazon music", "water the", "tv show", "game",
];

function scoreFromTitle(title: string): { score: number; tier: string } {
  const t = (title || "").toLowerCase();
  if (LOW_PATTERNS.some((p) => t.includes(p))) return { score: 3, tier: "normal" };
  if (CRITICAL_PATTERNS.some((p) => t.includes(p))) return { score: 9, tier: "critical" };
  if (HIGH_PATTERNS.some((p) => t.includes(p))) return { score: 7, tier: "high" };
  return { score: 5, tier: "normal" };
}

export async function rescoreAllMemories(): Promise<{
  updated: number;
  total: number;
  distribution: Record<string, number>;
  error?: string;
}> {
  const { userId } = await auth();
  if (!userId) redirect("/");

  try {
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });

    const result = await client.execute({
      sql: "SELECT id, title, importance FROM memories WHERE user_id = ?",
      args: [userId],
    });

    const total = result.rows.length;
    const distribution: Record<string, number> = {};
    const batches: Array<Array<{ id: string; score: number; tier: string }>> = [];
    let batch: Array<{ id: string; score: number; tier: string }> = [];

    for (const row of result.rows) {
      const { score, tier } = scoreFromTitle(row.title as string);
      const key = `${score}/${tier}`;
      distribution[key] = (distribution[key] || 0) + 1;

      if (score !== (row.importance as number)) {
        batch.push({ id: row.id as string, score, tier });
        if (batch.length >= 50) {
          batches.push(batch);
          batch = [];
        }
      }
    }
    if (batch.length) batches.push(batch);

    let updated = 0;
    for (const b of batches) {
      const stmts = b.map((item) => ({
        sql: "UPDATE memories SET importance = ?, importance_tier = ? WHERE id = ? AND user_id = ?",
        args: [item.score, item.tier, item.id, userId],
      }));
      await client.batch(stmts);

      const vecStmts = b.map((item) => ({
        sql: "UPDATE memory_vectors SET importance = ? WHERE memory_id = ? AND user_id = ?",
        args: [item.score, item.id, userId],
      }));
      await client.batch(vecStmts);

      updated += b.length;
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/settings");

    return { updated, total, distribution };
  } catch (error) {
    return {
      updated: 0,
      total: 0,
      distribution: {},
      error: error instanceof Error ? error.message : "Failed to re-score",
    };
  }
}
