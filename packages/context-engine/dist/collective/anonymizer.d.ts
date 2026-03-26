/**
 * Collective Intelligence — Anonymizer
 *
 * Two-phase anonymization:
 *   Phase 1 — deterministic strip of always-dangerous patterns (URLs, IPs, emails, secrets)
 *   Phase 2 — frequency-based generalization via TokenFrequencyTracker
 *
 * Research finding (Exp 3): frequency-based generalization outperforms
 * strip-everything in diverse multi-project environments (0.649 vs 0.608
 * matching accuracy, 3× better privacy preservation).
 */
import type { TraceData, SharedSignal } from "./types.js";
/** Tokens that appear fewer than this many times across all traces → [RARE_TOKEN] */
export declare const FREQUENCY_THRESHOLD = 5;
/**
 * ~50 common programming terms that should never be generalized regardless
 * of how rarely they appear in the accumulated trace set.
 */
export declare const PRESERVED_TOKENS: Set<string>;
/**
 * Accumulates token frequencies across all processed traces.
 * Singleton instance — resets on engine restart, which is fine
 * because it warms up quickly after a few dozen traces.
 */
export declare class TokenFrequencyTracker {
    private counts;
    readonly k: number;
    constructor(k?: number);
    /** Increment the frequency count for a token (case-insensitive). */
    track(token: string): void;
    /**
     * Returns true if a token has appeared fewer than k times AND is not
     * in the PRESERVED_TOKENS set.
     */
    is_rare(token: string): boolean;
    /**
     * Walk whitespace-separated words in `text`.
     * For each word, split on common delimiters to get sub-tokens and check
     * whether every sub-token is rare (and none is in PRESERVED_TOKENS).
     * Rare words are replaced with [RARE_TOKEN]; others are left intact.
     */
    generalize(text: string): string;
}
/** Module-level singleton — accumulates frequencies across the process lifetime. */
export declare const token_tracker: TokenFrequencyTracker;
/**
 * Anonymize a trace into a SharedSignal.
 * Returns null if the trace cannot be safely anonymized.
 *
 * Pipeline:
 *   1. Extract error type + framework (needed for signal metadata)
 *   2. anonymizeText() — phase 1 strip + phase 2 frequency-generalize
 *   3. isShareSafe() — final paranoid safety check
 */
export declare function anonymizeTrace(trace: TraceData): SharedSignal | null;
/**
 * Double-check that nothing leaked through anonymization.
 * PARANOID: reject anything that looks even slightly suspicious.
 */
export declare function isShareSafe(signal: SharedSignal): boolean;
//# sourceMappingURL=anonymizer.d.ts.map