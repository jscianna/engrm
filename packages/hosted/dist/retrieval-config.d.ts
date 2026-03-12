export interface RetrievalConfig {
    hostedHydeEnabled: boolean;
    hostedRerankEnabled: boolean;
    confidenceThreshold: number;
    confidenceMinSimilarity: number;
    confidenceRequiredCount: number;
}
export declare function getRetrievalConfig(): RetrievalConfig;
export declare function computeRetrievalConfidence(scores: number[], config?: RetrievalConfig): number;
export interface HostedServiceMetrics {
    usedHostedHyde: boolean;
    usedHostedRerank: boolean;
    hydeGated: boolean;
    rerankGated: boolean;
    retrievalConfidence: number;
    hydeLatencyMs: number;
    rerankLatencyMs: number;
}
export declare function createHostedMetrics(): HostedServiceMetrics;
//# sourceMappingURL=retrieval-config.d.ts.map