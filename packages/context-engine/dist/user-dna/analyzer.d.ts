/**
 * User DNA Analyzer
 *
 * Heuristic-based session analysis to extract behavioral signals.
 * No LLM calls — lightweight pattern matching only.
 */
import type { UserDNA, SessionAnalysisInput, SessionSignals } from "./types.js";
/**
 * Analyze a single session to extract behavioral signals.
 */
export declare function analyzeSession(params: SessionAnalysisInput): SessionSignals;
/**
 * Merge new session signals into existing User DNA using exponential moving average.
 * alpha=0.3: new session = 30% weight, history = 70%.
 */
export declare function mergeSignals(existing: UserDNA, newSignals: SessionSignals): UserDNA;
/**
 * Generate agent tuning directives from the profile.
 * Max 5 directives, most impactful only.
 */
export declare function generateDirectives(dna: UserDNA): string[];
//# sourceMappingURL=analyzer.d.ts.map