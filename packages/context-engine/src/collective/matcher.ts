/**
 * Collective Intelligence — Pattern Matcher
 *
 * Fuzzy matching of errors to collective patterns.
 * Content-addressed hashing for dedup.
 */

import { createHash } from "node:crypto";
import type { CollectivePattern, SharedSignal } from "./types.js";

/**
 * Find matching collective patterns for an error.
 * Fuzzy match on error type + framework, ranked by confidence and recency.
 * Returns top 3 matches.
 */
export function findMatchingPatterns(
  error: string,
  framework: string,
  patterns: CollectivePattern[],
): CollectivePattern[] {
  const errorLower = error.toLowerCase();
  const frameworkLower = framework.toLowerCase();

  const scored = patterns
    .map((pattern) => {
      let score = 0;

      // Exact error type match = high score
      if (pattern.trigger.errorType.toLowerCase() === errorLower) {
        score += 10;
      }
      // Partial error type match
      else if (errorLower.includes(pattern.trigger.errorType.toLowerCase()) ||
               pattern.trigger.errorType.toLowerCase().includes(errorLower)) {
        score += 5;
      }

      // Framework match
      if (frameworkLower && pattern.trigger.framework.toLowerCase() === frameworkLower) {
        score += 5;
      } else if (frameworkLower && pattern.trigger.framework.toLowerCase().includes(frameworkLower)) {
        score += 2;
      }

      // Context similarity (simple keyword overlap)
      if (pattern.trigger.context) {
        const contextWords = pattern.trigger.context.toLowerCase().split(/\s+/);
        const errorWords = errorLower.split(/\s+/);
        const overlap = contextWords.filter((w) => errorWords.includes(w)).length;
        score += Math.min(overlap, 3);
      }

      // Boost by confidence
      score *= pattern.resolution.confidence;

      // Recency boost (last confirmed within 30 days = bonus)
      const daysSinceConfirmed = daysBetween(pattern.metadata.lastConfirmed, new Date().toISOString());
      if (daysSinceConfirmed < 30) {
        score *= 1.2;
      } else if (daysSinceConfirmed > 180) {
        score *= 0.8;
      }

      return { pattern, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 3).map((item) => item.pattern);
}

/**
 * Compute a content-addressed hash for deduplication.
 */
export function computePatternHash(signal: SharedSignal): string {
  const normalized = JSON.stringify({
    errorType: signal.errorType.toLowerCase().trim(),
    errorMessage: normalizeForHash(signal.errorMessage),
    framework: signal.framework.toLowerCase().trim(),
    resolution: normalizeForHash(signal.resolution),
  });
  return createHash("sha256").update(normalized).digest("hex");
}

// --- Internal helpers ---

function normalizeForHash(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim()
    .slice(0, 200);
}

function daysBetween(dateStr1: string, dateStr2: string): number {
  try {
    const d1 = new Date(dateStr1).getTime();
    const d2 = new Date(dateStr2).getTime();
    return Math.abs(d2 - d1) / (1000 * 60 * 60 * 24);
  } catch {
    return 999;
  }
}
