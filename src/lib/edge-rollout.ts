/**
 * Edge Rollout Helper
 *
 * Deterministic percentage-based rollout for edge-first retrieval.
 * Uses FNV-1a hash to deterministically bucket users for gradual rollouts.
 */

/**
 * Compute FNV-1a hash of a string (deterministic, fast, no deps)
 */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0; // Convert to unsigned 32-bit
}

/**
 * Check if a user is within the rollout percentage for edge-first retrieval.
 *
 * @param userId - The user ID to check
 * @param percent - Rollout percentage (0-100)
 * @param seed - Optional seed string for hash salting (allows independent rollouts)
 * @returns true if user is within the rollout percentage
 *
 * @example
 * // Check if user is in 10% rollout
 * const enabled = isInEdgeRollout('user-123', 10, 'v1');
 *
 * // Full rollout (default)
 * const enabled = isInEdgeRollout('user-123', 100);
 */
export function isInEdgeRollout(userId: string, percent: number, seed = ''): boolean {
  // Clamp percent to valid range
  const pct = Math.max(0, Math.min(100, percent));

  // Always include everyone at 100%
  if (pct >= 100) return true;

  // Always exclude everyone at 0%
  if (pct <= 0) return false;

  // Deterministic hash of userId + seed
  const hashInput = seed ? `${userId}:${seed}` : userId;
  const hash = fnv1a(hashInput);

  // Map hash to 0-99 range and check against percent
  const bucket = hash % 100;
  return bucket < pct;
}
