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

// Default configuration
const DEFAULT_CONFIG: RetrievalConfig = {
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
export function getRetrievalConfig(): RetrievalConfig {
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
export function computeRetrievalConfidence(
  scores: number[],
  config: RetrievalConfig = getRetrievalConfig()
): number {
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
export function createHostedMetrics(): HostedServiceMetrics {
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
