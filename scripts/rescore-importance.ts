#!/usr/bin/env npx ts-node
/**
 * Re-score memory importance based on content heuristics
 * 
 * Scoring factors:
 * 1. Memory type (decision/preference > fact/belief > event/quantity)
 * 2. Content signals (identity info, strong preferences, decisions)
 * 3. Engagement (access count, feedback)
 */

import { createClient } from "@libsql/client";

const TYPE_SCORES: Record<string, number> = {
  decision: 8,
  preference: 8,
  identity: 9,
  fact: 6,
  belief: 6,
  reflected: 7,
  compacted: 7,
  event: 5,
  quantity: 4,
  date: 4,
  duration: 4,
  episodic: 5,
};

const IDENTITY_PATTERNS = [
  /\b(my name is|i am called|email is|phone is|address is|birthday is|born on)\b/i,
  /\b(user'?s? (name|email|phone|address|birthday))\b/i,
];

const STRONG_PREFERENCE_PATTERNS = [
  /\b(always|never|love|hate|can't stand|favorite|prefer|must have)\b/i,
  /\b(allergic to|intolerant|vegetarian|vegan|gluten.free)\b/i,
];

const DECISION_PATTERNS = [
  /\b(decided|chose|will always|commitment|goal is|priority is|plan to)\b/i,
  /\b(switching to|started using|stopped using|quit|adopted)\b/i,
];

function scoreMemory(memory: {
  title: string;
  content: string;
  memoryType: string;
  accessCount: number;
  feedbackScore: number;
}): number {
  let score = TYPE_SCORES[memory.memoryType] ?? 5;
  
  const text = `${memory.title} ${memory.content}`.toLowerCase();
  
  // Identity info boost
  if (IDENTITY_PATTERNS.some(p => p.test(text))) {
    score += 2;
  }
  
  // Strong preference boost
  if (STRONG_PREFERENCE_PATTERNS.some(p => p.test(text))) {
    score += 1;
  }
  
  // Decision language boost
  if (DECISION_PATTERNS.some(p => p.test(text))) {
    score += 1;
  }
  
  // Engagement boosts
  if (memory.accessCount > 0) {
    score += Math.min(memory.accessCount / 5, 2); // Max +2 from access
  }
  if (memory.feedbackScore > 0) {
    score += 1;
  } else if (memory.feedbackScore < 0) {
    score -= 1;
  }
  
  // Clamp to 1-10
  return Math.max(1, Math.min(10, Math.round(score)));
}

async function main() {
  const userId = process.argv[2] || "user_39gfFMkIhHmos9ZF0aUqwIx9z9l";
  
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  
  if (!url) {
    console.error("TURSO_DATABASE_URL required");
    process.exit(1);
  }

  const client = createClient({ url, authToken });
  
  // Fetch all memories
  const result = await client.execute({
    sql: `SELECT id, title, content_text, memory_type, access_count, feedback_score, importance 
          FROM memories WHERE user_id = ? AND archived_at IS NULL`,
    args: [userId],
  });
  
  console.log(`Scoring ${result.rows.length} memories...`);
  
  const distribution: Record<number, number> = {};
  const updates: Array<{ id: string; oldScore: number; newScore: number }> = [];
  
  for (const row of result.rows) {
    const r = row as Record<string, unknown>;
    const newScore = scoreMemory({
      title: (r.title as string) || "",
      content: (r.content_text as string) || "",
      memoryType: (r.memory_type as string) || "episodic",
      accessCount: Number(r.access_count ?? 0),
      feedbackScore: Number(r.feedback_score ?? 0),
    });
    
    const oldScore = Number(r.importance ?? 5);
    if (newScore !== oldScore) {
      updates.push({ id: r.id as string, oldScore, newScore });
    }
    
    distribution[newScore] = (distribution[newScore] || 0) + 1;
  }
  
  console.log("\nNew distribution:");
  for (let i = 1; i <= 10; i++) {
    const count = distribution[i] || 0;
    const bar = "█".repeat(Math.ceil(count / 20));
    console.log(`  ${i}: ${bar} ${count}`);
  }
  
  console.log(`\n${updates.length} memories need updating...`);
  
  // Batch update
  const batchSize = 100;
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    await Promise.all(batch.map(u => 
      client.execute({
        sql: "UPDATE memories SET importance = ? WHERE id = ?",
        args: [u.newScore, u.id],
      })
    ));
    process.stdout.write(`\rUpdated ${Math.min(i + batchSize, updates.length)}/${updates.length}`);
  }
  
  console.log("\n✓ Done!");
  client.close();
}

main().catch(console.error);
