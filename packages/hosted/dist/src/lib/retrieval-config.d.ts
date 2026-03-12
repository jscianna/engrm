/**
 * Retrieval Configuration
 *
 * Feature flags and configuration for retrieval pipeline components.
 * Controls when to use hosted services (HyDE, reranking) vs local-only paths.
 */
export interface RetrievalConfig {
    /**
     * Enable confidence-gated hosted HyDE.
     * When enabled and retrieval confidence is below threshold,
     * falls back to hosted HyDE for better semantic recall.
     */
    hostedHydeEnabled: boolean;
    /**
     * Enable confidence-gated hosted reranking.
     * When enabled and retrieval confidence is below threshold,
     * uses LLM reranker to improve precision.
     */
    hostedRerankEnabled: boolean;
    /**
     * Confidence threshold for gating hosted services.
     * If retrieval confidence >= threshold, skip hosted calls (saves latency/cost).
     * Range: 0.5 - 0.95, default: 0.72
     */
    confidenceThreshold: number;
    /**
     * Minimum similarity score for a result to count toward confidence.
     * Range: 0.3 - 0.9, default: 0.6
     */
    confidenceMinSimilarity: number;
    /**
     * Number of high-quality results needed for high confidence.
     * If we have >= this many results above confidenceMinSimilarity, confidence is high.
     * Range: 1 - 10, default: 3
     */
    confidenceRequiredCount: number;
}
/**
 * Get retrieval config from environment variables.
 * Falls back to defaults if not set.
 */
export declare function getRetrievalConfig(): RetrievalConfig;
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
export declare function computeRetrievalConfidence(scores: number[], config?: RetrievalConfig): number;
/**
 * Metrics for hosted service usage.
 */
export interface HostedServiceMetrics {
    /** Whether HyDE was used (hosted LLM call) */
    usedHostedHyde: boolean;
    /** Whether reranking was used (hosted LLM call) */
    usedHostedRerank: boolean;
    /** Whether services were gated (skipped due to high confidence) */
    hydeGated: boolean;
    rerankGated: boolean;
    /** Computed retrieval confidence before gating decision */
    retrievalConfidence: number;
    /** Latency in ms for hosted HyDE (0 if not used) */
    hydeLatencyMs: number;
    /** Latency in ms for hosted rerank (0 if not used) */
    rerankLatencyMs: number;
}
/**
 * Create empty metrics object.
 */
export declare function createHostedMetrics(): HostedServiceMetrics;
//# sourceMappingURL=retrieval-config.d.ts.map