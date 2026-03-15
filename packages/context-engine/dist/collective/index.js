/**
 * Collective Intelligence — Shared Pattern Network
 *
 * Anonymized error→fix patterns shared across the FatHippo network.
 * Fully opt-in. Privacy-first.
 */
export { anonymizeTrace, isShareSafe } from "./anonymizer.js";
export { findMatchingPatterns, computePatternHash } from "./matcher.js";
export { submitSharedSignal, fetchCollectivePatterns } from "./client.js";
import { anonymizeTrace, isShareSafe } from "./anonymizer.js";
import { submitSharedSignal, fetchCollectivePatterns } from "./client.js";
import { findMatchingPatterns } from "./matcher.js";
/**
 * Process a trace for collective sharing.
 * Checks opt-in, anonymizes, safety-checks, and submits.
 * Fire-and-forget — never blocks the session.
 */
export async function processTraceForCollective(trace, userSettings, apiConfig) {
    // Only process if user has opted in
    if (!userSettings.sharedLearningEnabled) {
        return;
    }
    try {
        // Anonymize the trace
        const signal = anonymizeTrace(trace);
        if (!signal) {
            return; // Couldn't safely anonymize
        }
        // Double-check safety
        if (!isShareSafe(signal)) {
            return; // Failed safety check
        }
        // Submit to collective (fire-and-forget)
        await submitSharedSignal(signal, apiConfig.apiKey, apiConfig.baseUrl);
    }
    catch {
        // Never let collective sharing break the session
    }
}
/**
 * Get collective wisdom for an error.
 * Returns a formatted context block (max ~300 tokens) or empty string.
 */
export async function getCollectiveWisdom(error, framework, apiConfig) {
    try {
        const patterns = await fetchCollectivePatterns(error, framework, apiConfig.apiKey, apiConfig.baseUrl);
        if (patterns.length === 0) {
            return "";
        }
        const matches = findMatchingPatterns(error, framework, patterns);
        if (matches.length === 0) {
            return "";
        }
        // Format as compact context block
        const lines = [
            "## Known Fixes from the FatHippo Network",
        ];
        for (const match of matches.slice(0, 3)) {
            const confidence = Math.round(match.resolution.confidence * 100);
            const contributors = match.metadata.contributorCount;
            lines.push(`- **${match.trigger.errorType}** (${match.trigger.framework || "general"}): ` +
                `${match.resolution.approach} ` +
                `(${confidence}% confidence, ${contributors} contributor${contributors !== 1 ? "s" : ""})`);
        }
        lines.push("");
        return lines.join("\n");
    }
    catch {
        return "";
    }
}
//# sourceMappingURL=index.js.map