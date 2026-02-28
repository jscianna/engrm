/**
 * Server-Side Salt Management
 * 
 * Each user gets a cryptographically random 32-byte salt stored server-side.
 * Used for server-side secrets such as HMAC derivation.
 * 
 * Security benefits:
 * - Secrets are isolated per user
 * - Attacker needs database access to recover server-side salts
 * - Salt is generated once and never changes
 */

import crypto from "node:crypto";
import { getDb } from "./turso";

// =============================================================================
// Configuration
// =============================================================================

const SALT_LENGTH = 32; // 256 bits

// =============================================================================
// Initialization
// =============================================================================

let initialized = false;

async function ensureSaltTable(): Promise<void> {
  if (initialized) return;

  const client = getDb();
  
  // Create user_salts table with salt and hmac_secret
  await client.execute(`
    CREATE TABLE IF NOT EXISTS user_salts (
      user_id TEXT PRIMARY KEY,
      salt TEXT NOT NULL,
      hmac_secret TEXT,
      created_at TEXT NOT NULL
    )
  `).catch(() => {});
  
  // Add hmac_secret column if it doesn't exist (migration)
  await client.execute(`
    ALTER TABLE user_salts ADD COLUMN hmac_secret TEXT
  `).catch(() => {}); // Ignore if already exists

  initialized = true;
}

// =============================================================================
// Salt Operations
// =============================================================================

/**
 * Get or create a user's salt
 * Salt is generated once and stored permanently
 */
export async function getUserSalt(userId: string): Promise<string> {
  await ensureSaltTable();
  const client = getDb();

  // Try to get existing salt
  const result = await client.execute({
    sql: `SELECT salt FROM user_salts WHERE user_id = ?`,
    args: [userId],
  });

  if (result.rows.length > 0) {
    return result.rows[0].salt as string;
  }

  // Generate new salt
  const salt = crypto.randomBytes(SALT_LENGTH).toString("base64");
  const now = new Date().toISOString();

  await client.execute({
    sql: `INSERT INTO user_salts (user_id, salt, created_at) VALUES (?, ?, ?)`,
    args: [userId, salt, now],
  });

  return salt;
}

/**
 * Verify that a user has a salt (for migration checking)
 */
export async function userHasSalt(userId: string): Promise<boolean> {
  await ensureSaltTable();
  const client = getDb();

  const result = await client.execute({
    sql: `SELECT 1 FROM user_salts WHERE user_id = ?`,
    args: [userId],
  });

  return result.rows.length > 0;
}

/**
 * Get salt creation date (for audit)
 */
export async function getSaltInfo(userId: string): Promise<{
  exists: boolean;
  createdAt: string | null;
}> {
  await ensureSaltTable();
  const client = getDb();

  const result = await client.execute({
    sql: `SELECT created_at FROM user_salts WHERE user_id = ?`,
    args: [userId],
  });

  if (result.rows.length === 0) {
    return { exists: false, createdAt: null };
  }

  return {
    exists: true,
    createdAt: result.rows[0].created_at as string,
  };
}

/**
 * Get or create user's HMAC secret for content verification
 */
export async function getUserHMACSecret(userId: string): Promise<string> {
  await ensureSaltTable();
  const client = getDb();

  // First ensure user has a salt record
  await getUserSalt(userId);

  // Check if user has HMAC secret
  const result = await client.execute({
    sql: `SELECT hmac_secret FROM user_salts WHERE user_id = ?`,
    args: [userId],
  });

  const row = result.rows[0] as Record<string, unknown> | undefined;

  if (row?.hmac_secret) {
    return row.hmac_secret as string;
  }

  // Generate new HMAC secret
  const hmacSecret = crypto.randomBytes(32).toString("hex");

  await client.execute({
    sql: `UPDATE user_salts SET hmac_secret = ? WHERE user_id = ?`,
    args: [hmacSecret, userId],
  });

  return hmacSecret;
}
