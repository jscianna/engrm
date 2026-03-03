/**
 * API Security Module
 * 
 * Provides:
 * 1. API Key rotation (revoke, expire, track usage)
 * 2. HMAC verification for memory content integrity
 */

import crypto from "node:crypto";
import {
  revokeApiKey as revokeApiKeyInDb,
  setApiKeyExpiration as setApiKeyExpirationInDb,
  getApiKeyStats as getApiKeyStatsFromDb,
  isApiKeyValid as isApiKeyValidInDb,
} from "./db";
import { getUserHMACSecret } from "./user-salt";

// =============================================================================
// 1. API Key Rotation & Management
// =============================================================================

/**
 * Revoke an API key (instant disable)
 */
export async function revokeApiKey(keyId: string, userId: string): Promise<boolean> {
  return revokeApiKeyInDb(userId, keyId);
}

/**
 * Set expiration date for an API key
 */
export async function setApiKeyExpiration(
  keyId: string, 
  userId: string, 
  expiresAt: Date
): Promise<boolean> {
  return setApiKeyExpirationInDb(userId, keyId, expiresAt);
}

/**
 * Check if an API key is valid (not revoked, not expired)
 */
export async function isApiKeyValid(keyId: string): Promise<{
  valid: boolean;
  reason?: "revoked" | "expired";
}> {
  return isApiKeyValidInDb(keyId);
}

/**
 * Get API key usage stats
 */
export async function getApiKeyStats(keyId: string): Promise<{
  createdAt: string;
  lastUsed: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  requestCount: number;
} | null> {
  return getApiKeyStatsFromDb(keyId);
}

// =============================================================================
// 2. HMAC Content Verification
// =============================================================================

const HMAC_ALGORITHM = "sha256";

/**
 * Generate HMAC for memory content
 * Uses the user's derived secret as the HMAC key.
 */
export function generateContentHMAC(content: string, userSecret: string): string {
  const hmac = crypto.createHmac(HMAC_ALGORITHM, userSecret);
  hmac.update(content);
  return hmac.digest("hex");
}

/**
 * Verify HMAC for memory content
 */
export function verifyContentHMAC(
  content: string, 
  expectedMAC: string, 
  userSecret: string
): boolean {
  const actualMAC = generateContentHMAC(content, userSecret);
  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(actualMAC, "hex"),
      Buffer.from(expectedMAC, "hex")
    );
  } catch {
    return false;
  }
}
