/**
 * Server-Side Salt Management
 * 
 * Each user gets a cryptographically random 32-byte salt stored server-side.
 * Combined with their vault password for namespace hashing.
 * 
 * Security benefits:
 * - Even if two users have the same vault password, their namespace hashes differ
 * - Attacker needs both DB access AND vault password to reverse hashes
 * - Salt is generated once and never changes (deterministic hashing)
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
  
  // Add salt column to user_settings if not exists
  await client.execute(`
    CREATE TABLE IF NOT EXISTS user_salts (
      user_id TEXT PRIMARY KEY,
      salt TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `).catch(() => {});

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
 * Hash a namespace using server salt + vault password
 * 
 * Process:
 * 1. Get server-side salt for user
 * 2. Combine: PBKDF2(vault_password, server_salt + namespace)
 * 3. Return deterministic hash
 */
export async function hashNamespaceWithServerSalt(
  userId: string,
  namespace: string,
  vaultPassword: string
): Promise<string> {
  if (!namespace) return "";

  const serverSalt = await getUserSalt(userId);
  
  // Combine server salt with namespace for the PBKDF2 salt
  const combinedSalt = `${serverSalt}:${namespace}`;
  
  // PBKDF2 with 100k iterations
  const key = crypto.pbkdf2Sync(
    vaultPassword,
    combinedSalt,
    100_000,
    16, // 16 bytes = 32 hex chars
    "sha256"
  );

  return `ns_${key.toString("hex")}`;
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
