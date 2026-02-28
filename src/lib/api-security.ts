/**
 * API Security Module
 * 
 * Provides:
 * 1. API Key rotation (revoke, expire, track usage)
 * 2. HMAC verification for memory content integrity
 * 3. Request signing to prevent replay attacks
 */

import crypto from "node:crypto";
import { getDb } from "./turso";

// =============================================================================
// 1. API Key Rotation & Management
// =============================================================================

/**
 * Revoke an API key (instant disable)
 */
export async function revokeApiKey(keyId: string, userId: string): Promise<boolean> {
  const client = getDb();
  const now = new Date().toISOString();
  
  const result = await client.execute({
    sql: `UPDATE api_keys SET revoked_at = ? WHERE id = ? AND user_id = ?`,
    args: [now, keyId, userId],
  });
  
  return (result.rowsAffected ?? 0) > 0;
}

/**
 * Set expiration date for an API key
 */
export async function setApiKeyExpiration(
  keyId: string, 
  userId: string, 
  expiresAt: Date
): Promise<boolean> {
  const client = getDb();
  
  const result = await client.execute({
    sql: `UPDATE api_keys SET expires_at = ? WHERE id = ? AND user_id = ?`,
    args: [expiresAt.toISOString(), keyId, userId],
  });
  
  return (result.rowsAffected ?? 0) > 0;
}

/**
 * Check if an API key is valid (not revoked, not expired)
 */
export async function isApiKeyValid(keyId: string): Promise<{
  valid: boolean;
  reason?: "revoked" | "expired";
}> {
  const client = getDb();
  
  const result = await client.execute({
    sql: `SELECT revoked_at, expires_at FROM api_keys WHERE id = ?`,
    args: [keyId],
  });
  
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    return { valid: false, reason: "revoked" };
  }
  
  if (row.revoked_at) {
    return { valid: false, reason: "revoked" };
  }
  
  if (row.expires_at) {
    const expiresAt = new Date(row.expires_at as string);
    if (expiresAt < new Date()) {
      return { valid: false, reason: "expired" };
    }
  }
  
  return { valid: true };
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
  const client = getDb();
  
  // Get key info
  const keyResult = await client.execute({
    sql: `SELECT created_at, last_used, revoked_at, expires_at FROM api_keys WHERE id = ?`,
    args: [keyId],
  });
  
  const row = keyResult.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  
  // Count requests from audit log
  const countResult = await client.execute({
    sql: `SELECT COUNT(*) as count FROM api_usage WHERE api_key_id = ?`,
    args: [keyId],
  });
  
  const count = Number((countResult.rows[0] as Record<string, unknown>)?.count ?? 0);
  
  return {
    createdAt: row.created_at as string,
    lastUsed: (row.last_used as string) ?? null,
    revokedAt: (row.revoked_at as string) ?? null,
    expiresAt: (row.expires_at as string) ?? null,
    requestCount: count,
  };
}

// =============================================================================
// 2. HMAC Content Verification
// =============================================================================

const HMAC_ALGORITHM = "sha256";

/**
 * Generate HMAC for memory content
 * Uses user's vault key derivation as the secret
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

/**
 * Get or create user's HMAC secret (derived from a server-side salt)
 */
export async function getUserHMACSecret(userId: string): Promise<string> {
  const client = getDb();
  
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
  
  // Try to update existing row, or it will be created with getUserSalt
  await client.execute({
    sql: `UPDATE user_salts SET hmac_secret = ? WHERE user_id = ?`,
    args: [hmacSecret, userId],
  }).catch(() => {
    // Row might not exist yet, that's fine
  });
  
  return hmacSecret;
}

// =============================================================================
// 3. Request Signing (Replay Attack Prevention)
// =============================================================================

const REQUEST_SIGNATURE_HEADER = "x-engrm-signature";
const REQUEST_TIMESTAMP_HEADER = "x-engrm-timestamp";
const MAX_REQUEST_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Generate request signature
 * Client should use: HMAC-SHA256(timestamp + "." + body, api_key)
 */
export function generateRequestSignature(
  timestamp: number,
  body: string,
  apiKey: string
): string {
  const payload = `${timestamp}.${body}`;
  const hmac = crypto.createHmac("sha256", apiKey);
  hmac.update(payload);
  return hmac.digest("hex");
}

/**
 * Verify request signature (for signed API requests)
 * Returns error message or null if valid
 */
export function verifyRequestSignature(
  request: Request,
  body: string,
  apiKey: string
): { valid: boolean; error?: string } {
  const signature = request.headers.get(REQUEST_SIGNATURE_HEADER);
  const timestampStr = request.headers.get(REQUEST_TIMESTAMP_HEADER);
  
  // If no signature headers, request is unsigned (allowed for now)
  if (!signature && !timestampStr) {
    return { valid: true }; // Unsigned requests allowed
  }
  
  // If one header present, both must be present
  if (!signature || !timestampStr) {
    return { 
      valid: false, 
      error: "Missing signature headers. Include both x-engrm-signature and x-engrm-timestamp" 
    };
  }
  
  // Parse timestamp
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) {
    return { valid: false, error: "Invalid timestamp" };
  }
  
  // Check timestamp age (replay protection)
  const now = Date.now();
  const age = Math.abs(now - timestamp);
  if (age > MAX_REQUEST_AGE_MS) {
    return { 
      valid: false, 
      error: `Request too old or too far in future. Max age: ${MAX_REQUEST_AGE_MS / 1000}s` 
    };
  }
  
  // Verify signature
  const expectedSignature = generateRequestSignature(timestamp, body, apiKey);
  
  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
    
    if (!isValid) {
      return { valid: false, error: "Invalid signature" };
    }
  } catch {
    return { valid: false, error: "Invalid signature format" };
  }
  
  return { valid: true };
}

/**
 * Middleware helper to verify signed requests
 */
export async function verifySignedRequest(
  request: Request,
  apiKey: string
): Promise<{ valid: boolean; error?: string }> {
  // Get body for signature verification
  const body = await request.clone().text();
  return verifyRequestSignature(request, body, apiKey);
}
