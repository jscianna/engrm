/**
 * Collective Intelligence — Pattern Matcher
 *
 * Fuzzy matching of errors to collective patterns.
 * Content-addressed hashing for dedup.
 */
import type { CollectivePattern, SharedSignal } from "./types.js";
/**
 * Find matching collective patterns for an error.
 * Fuzzy match on error type + framework, ranked by confidence and recency.
 * Returns top 3 matches.
 */
export declare function findMatchingPatterns(error: string, framework: string, patterns: CollectivePattern[]): CollectivePattern[];
/**
 * Compute a content-addressed hash for deduplication.
 */
export declare function computePatternHash(signal: SharedSignal): string;
//# sourceMappingURL=matcher.d.ts.map