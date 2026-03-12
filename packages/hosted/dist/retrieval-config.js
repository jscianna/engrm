const DEFAULT_CONFIG = {
    hostedHydeEnabled: false,
    hostedRerankEnabled: false,
    confidenceThreshold: 0.72,
    confidenceMinSimilarity: 0.6,
    confidenceRequiredCount: 3,
};
export function getRetrievalConfig() {
    return {
        hostedHydeEnabled: process.env.FATHIPPO_HOSTED_HYDE === "true",
        hostedRerankEnabled: process.env.FATHIPPO_HOSTED_RERANK === "true",
        confidenceThreshold: parseFloat(process.env.FATHIPPO_CONFIDENCE_THRESHOLD ?? "") || DEFAULT_CONFIG.confidenceThreshold,
        confidenceMinSimilarity: parseFloat(process.env.FATHIPPO_CONFIDENCE_MIN_SIMILARITY ?? "") || DEFAULT_CONFIG.confidenceMinSimilarity,
        confidenceRequiredCount: parseInt(process.env.FATHIPPO_CONFIDENCE_REQUIRED_COUNT ?? "", 10) || DEFAULT_CONFIG.confidenceRequiredCount,
    };
}
export function computeRetrievalConfidence(scores, config = getRetrievalConfig()) {
    if (scores.length === 0)
        return 0;
    const sorted = [...scores].sort((left, right) => right - left);
    const topScore = sorted[0];
    const topFactor = Math.min(topScore, 1) * 0.4;
    const highQualityCount = sorted.filter((score) => score >= config.confidenceMinSimilarity).length;
    const countFactor = Math.min(highQualityCount / config.confidenceRequiredCount, 1) * 0.4;
    const topThree = sorted.slice(0, 3);
    const averageTopThree = topThree.reduce((sum, score) => sum + score, 0) / topThree.length;
    const variance = topThree.reduce((sum, score) => sum + Math.pow(score - averageTopThree, 2), 0) / topThree.length;
    const consistencyFactor = Math.max(0, 0.2 - variance);
    return Math.min(Math.max(topFactor + countFactor + consistencyFactor, 0), 1);
}
export function createHostedMetrics() {
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