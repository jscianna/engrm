"use strict";
/**
 * Retrieval Configuration
 *
 * Feature flags and configuration for retrieval pipeline components.
 * Controls when to use hosted services (HyDE, reranking) vs local-only paths.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRetrievalConfig = getRetrievalConfig;
exports.computeRetrievalConfidence = computeRetrievalConfidence;
exports.createHostedMetrics = createHostedMetrics;
// Default configuration
const DEFAULT_CONFIG = {
    hostedHydeEnabled: false,
    hostedRerankEnabled: false,
    confidenceThreshold: 0.72,
    confidenceMinSimilarity: 0.6,
    confidenceRequiredCount: 3,
};
/**
 * Get retrieval config from environment variables.
 * Falls back to defaults if not set.
 */
function getRetrievalConfig() {
    return {
        hostedHydeEnabled: process.env.FATHIPPO_HOSTED_HYDE === "true",
        hostedRerankEnabled: process.env.FATHIPPO_HOSTED_RERANK === "true",
        confidenceThreshold: parseFloat(process.env.FATHIPPO_CONFIDENCE_THRESHOLD ?? "") || DEFAULT_CONFIG.confidenceThreshold,
        confidenceMinSimilarity: parseFloat(process.env.FATHIPPO_CONFIDENCE_MIN_SIMILARITY ?? "") || DEFAULT_CONFIG.confidenceMinSimilarity,
        confidenceRequiredCount: parseInt(process.env.FATHIPPO_CONFIDENCE_REQUIRED_COUNT ?? "", 10) || DEFAULT_CONFIG.confidenceRequiredCount,
    };
}
/**
 * Compute retrieval confidence from search results.
 *
 * Confidence is based on:
 * 1. Number of results above similarity threshold
 * 2. Top result score
 * 3. Score distribution (tighter cluster = higher confidence)
 *
 * @param scores Array of similarity scores from retrieval
 * @param config Retrieval configuration
 * @returns Confidence score 0-1
 */
function computeRetrievalConfidence(scores, config = getRetrievalConfig()) {
    if (scores.length === 0) {
        return 0;
    }
    // Sort descending
    const sorted = [...scores].sort((a, b) => b - a);
    // Factor 1: Top score (0-0.4 contribution)
    const topScore = sorted[0];
    const topFactor = Math.min(topScore, 1) * 0.4;
    // Factor 2: Count of high-quality results (0-0.4 contribution)
    const highQualityCount = sorted.filter(s => s >= config.confidenceMinSimilarity).length;
    const countFactor = Math.min(highQualityCount / config.confidenceRequiredCount, 1) * 0.4;
    // Factor 3: Score consistency (0-0.2 contribution)
    // If top results are clustered together, more confident
    const top3 = sorted.slice(0, 3);
    const avgTop3 = top3.reduce((a, b) => a + b, 0) / top3.length;
    const variance = top3.reduce((acc, s) => acc + Math.pow(s - avgTop3, 2), 0) / top3.length;
    const consistencyFactor = Math.max(0, 0.2 - variance); // Low variance = high consistency
    const confidence = topFactor + countFactor + consistencyFactor;
    return Math.min(Math.max(confidence, 0), 1);
}
/**
 * Create empty metrics object.
 */
function createHostedMetrics() {
    return {
        usedHostedHyde: false,
        usedHostedRerank: false,
        hydeGated: false,
        rerankGated: false,
        retrievalConfidence: 0,
        hydeLatencyMs: 0,
        rerankLatencyMs: 0,
    };
}
//# sourceMappingURL=retrieval-config.js.map