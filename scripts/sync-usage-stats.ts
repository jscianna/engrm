#!/usr/bin/env npx ts-node
/**
 * Sync usage_stats counters with actual memory counts
 * Usage: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx ts-node scripts/sync-usage-stats.ts [userId]
 */

import { createClient } from "@libsql/client";

async function main() {
  const userId = process.argv[2];
  
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  
  if (!url) {
    console.error("TURSO_DATABASE_URL is required");
    process.exit(1);
  }

  const client = createClient({ url, authToken });

  // Get all users with usage stats if no specific user
  let userIds: string[] = [];
  
  if (userId) {
    userIds = [userId];
  } else {
    const usersResult = await client.execute("SELECT DISTINCT user_id FROM usage_stats");
    userIds = usersResult.rows.map(r => r.user_id as string);
  }

  console.log(`Syncing ${userIds.length} user(s)...`);

  for (const uid of userIds) {
    // Count actual active memories
    const memoriesResult = await client.execute({
      sql: `
        SELECT 
          COUNT(*) as memory_count,
          COALESCE(SUM(LENGTH(content_text)), 0) as storage_bytes
        FROM memories
        WHERE user_id = ? AND archived_at IS NULL
      `,
      args: [uid],
    });

    const row = memoriesResult.rows[0] as Record<string, unknown>;
    const actualMemoryCount = Number(row?.memory_count ?? 0);
    const actualStorageBytes = Number(row?.storage_bytes ?? 0);

    // Get current stats
    const statsResult = await client.execute({
      sql: "SELECT memories_this_month, storage_bytes FROM usage_stats WHERE user_id = ?",
      args: [uid],
    });
    const currentStats = statsResult.rows[0] as Record<string, unknown> | undefined;
    const currentMemories = Number(currentStats?.memories_this_month ?? 0);
    const currentStorage = Number(currentStats?.storage_bytes ?? 0);

    console.log(`\nUser: ${uid}`);
    console.log(`  Current counters: ${currentMemories} memories, ${(currentStorage / 1024).toFixed(1)} KB`);
    console.log(`  Actual values:    ${actualMemoryCount} memories, ${(actualStorageBytes / 1024).toFixed(1)} KB`);

    if (currentMemories !== actualMemoryCount || currentStorage !== actualStorageBytes) {
      const now = new Date().toISOString();
      await client.execute({
        sql: `
          UPDATE usage_stats 
          SET memories_this_month = ?, storage_bytes = ?, updated_at = ?
          WHERE user_id = ?
        `,
        args: [actualMemoryCount, actualStorageBytes, now, uid],
      });
      console.log(`  ✓ Updated!`);
    } else {
      console.log(`  ✓ Already in sync`);
    }
  }

  console.log("\nDone!");
  client.close();
}

main().catch(console.error);
