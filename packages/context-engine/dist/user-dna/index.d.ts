/**
 * User DNA — Automatic Behavioral Profiling
 *
 * Silently analyzes user behavior across sessions to build an adaptive profile
 * that tunes agent responses to match the user's preferences.
 */
export type { UserDNA, SessionAnalysisInput, SessionSignals } from "./types.js";
export { analyzeSession, mergeSignals, generateDirectives } from "./analyzer.js";
export { formatUserDNAForInjection } from "./serializer.js";
export { loadUserDNA, saveUserDNA } from "./storage.js";
import type { UserDNA } from "./types.js";
/**
 * Create a fresh User DNA profile with zero confidence.
 */
export declare function initializeUserDNA(userId: string): UserDNA;
//# sourceMappingURL=index.d.ts.map