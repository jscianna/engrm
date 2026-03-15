/**
 * User DNA — Automatic Behavioral Profiling
 *
 * Silently analyzes user behavior across sessions to build an adaptive profile
 * that tunes agent responses to match the user's preferences.
 */
export { analyzeSession, mergeSignals, generateDirectives } from "./analyzer.js";
export { formatUserDNAForInjection } from "./serializer.js";
export { loadUserDNA, saveUserDNA } from "./storage.js";
/**
 * Create a fresh User DNA profile with zero confidence.
 */
export function initializeUserDNA(userId) {
    return {
        version: 1,
        userId,
        updatedAt: new Date().toISOString(),
        sessionCount: 0,
        communication: {
            verbosity: "balanced",
            style: "collaborative",
            preferredResponseLength: "medium",
        },
        workPatterns: {
            averageSessionMinutes: 0,
            sessionType: "mixed",
            primaryFocus: [],
            peakHours: [],
        },
        qualitySignals: {
            requestsTests: 0,
            requestsTypeChecking: 0,
            overrideRate: 0,
            refactorFrequency: 0,
        },
        conventions: {
            namingStyle: "mixed",
            preferredPatterns: [],
            avoidPatterns: [],
        },
        agentDirectives: [],
        confidence: {
            communication: 0,
            workPatterns: 0,
            qualitySignals: 0,
            conventions: 0,
        },
    };
}
//# sourceMappingURL=index.js.map