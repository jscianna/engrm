/**
 * Collective Intelligence — Shared Pattern Network
 *
 * Anonymized error→fix patterns shared across the FatHippo network.
 * Fully opt-in. Privacy-first.
 */
export type { CollectivePattern, SharedSignal, CollectiveApiConfig, CollectiveUserSettings, TraceData, } from "./types.js";
export { anonymizeTrace, isShareSafe } from "./anonymizer.js";
export { findMatchingPatterns, computePatternHash } from "./matcher.js";
export { submitSharedSignal, fetchCollectivePatterns } from "./client.js";
import type { TraceData, CollectiveApiConfig, CollectiveUserSettings } from "./types.js";
/**
 * Process a trace for collective sharing.
 * Checks opt-in, anonymizes, safety-checks, and submits.
 * Fire-and-forget — never blocks the session.
 */
export declare function processTraceForCollective(trace: TraceData, userSettings: CollectiveUserSettings, apiConfig: CollectiveApiConfig): Promise<void>;
/**
 * Get collective wisdom for an error.
 * Returns a formatted context block (max ~300 tokens) or empty string.
 */
export declare function getCollectiveWisdom(error: string, framework: string, apiConfig: CollectiveApiConfig): Promise<string>;
//# sourceMappingURL=index.d.ts.map