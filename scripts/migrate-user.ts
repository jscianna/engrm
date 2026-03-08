/**
 * FatHippo User Migration Script
 * 
 * Migrates all data from old Clerk userId (test) to new Clerk userId (production)
 * 
 * Usage:
 *   npx tsx scripts/migrate-user.ts <NEW_USER_ID>
 * 
 * Example:
 *   npx tsx scripts/migrate-user.ts user_2abc123xyz
 */

import { createClient } from "@libsql/client";

const OLD_USER_ID = "user_39b7Bzrd5LLE2qQspDj0uSlM0lZ";

async function migrate() {
  const newUserId = process.argv[2];
  
  if (!newUserId) {
    console.error("Usage: npx tsx scripts/migrate-user.ts <NEW_USER_ID>");
    console.error("Example: npx tsx scripts/migrate-user.ts user_2abc123xyz");
    process.exit(1);
  }
  
  if (!newUserId.startsWith("user_")) {
    console.error("Error: New user ID should start with 'user_'");
    process.exit(1);
  }
  
  if (newUserId === OLD_USER_ID) {
    console.error("Error: New user ID is the same as old user ID");
    process.exit(1);
  }

  const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  console.log(`\nMigrating from: ${OLD_USER_ID}`);
  console.log(`Migrating to:   ${newUserId}\n`);

  // Count before
  const before = await db.execute({
    sql: "SELECT COUNT(*) as count FROM memories WHERE user_id = ?",
    args: [OLD_USER_ID],
  });
  console.log(`Memories to migrate: ${before.rows[0].count}`);

  // Migrate memories
  const memoriesResult = await db.execute({
    sql: "UPDATE memories SET user_id = ? WHERE user_id = ?",
    args: [newUserId, OLD_USER_ID],
  });
  console.log(`✓ Migrated ${memoriesResult.rowsAffected} memories`);

  // Migrate syntheses
  try {
    const synthesesResult = await db.execute({
      sql: "UPDATE syntheses SET user_id = ? WHERE user_id = ?",
      args: [newUserId, OLD_USER_ID],
    });
    console.log(`✓ Migrated ${synthesesResult.rowsAffected} syntheses`);
  } catch (e) {
    console.log(`- Syntheses table not found or empty (skipping)`);
  }

  // Migrate injection_events
  try {
    const eventsResult = await db.execute({
      sql: "UPDATE injection_events SET user_id = ? WHERE user_id = ?",
      args: [newUserId, OLD_USER_ID],
    });
    console.log(`✓ Migrated ${eventsResult.rowsAffected} injection events`);
  } catch (e) {
    console.log(`- Injection events table not found or empty (skipping)`);
  }

  // Migrate search_hits
  try {
    const hitsResult = await db.execute({
      sql: "UPDATE search_hits SET user_id = ? WHERE user_id = ?",
      args: [newUserId, OLD_USER_ID],
    });
    console.log(`✓ Migrated ${hitsResult.rowsAffected} search hits`);
  } catch (e) {
    console.log(`- Search hits table not found or empty (skipping)`);
  }

  // Verify
  const after = await db.execute({
    sql: "SELECT COUNT(*) as count FROM memories WHERE user_id = ?",
    args: [newUserId],
  });
  console.log(`\n✅ Migration complete! ${after.rows[0].count} memories now under ${newUserId}`);
  
  // Check if any orphans remain
  const orphans = await db.execute({
    sql: "SELECT COUNT(*) as count FROM memories WHERE user_id = ?",
    args: [OLD_USER_ID],
  });
  if (Number(orphans.rows[0].count) > 0) {
    console.log(`⚠️  ${orphans.rows[0].count} memories still under old user ID`);
  }

  await db.close();
}

migrate().catch(console.error);
