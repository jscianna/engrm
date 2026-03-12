/**
 * HyDE (Hypothetical Document Embeddings)
 *
 * Generates a hypothetical answer to the query using a fast LLM,
 * then embeds that hypothetical answer instead of (or in addition to) the raw query.
 * This improves semantic recall for indirect/vague queries.
 *
 * Based on: "Precise Zero-Shot Dense Retrieval without Relevance Labels" (Gao et al., 2022)
 * https://arxiv.org/abs/2212.10496
 */
export interface HyDEResult {
    /** The generated hypothetical document */
    hypotheticalDocument: string;
    /** The embedding of the hypothetical document */
    embedding: number[];
    /** Whether HyDE generation succeeded */
    success: boolean;
    /** Error message if generation failed */
    error?: string;
}
/**
 * Generate a hypothetical document and its embedding for a query.
 *
 * @param query The user's search query
 * @returns HyDEResult with hypothetical document and embedding
 */
export declare function generateHypotheticalDocument(query: string): Promise<HyDEResult>;
/**
 * Combine original query embedding with HyDE embedding using weighted average.
 * This provides the benefits of both: exact query matching + semantic expansion.
 *
 * @param queryEmbedding The original query embedding
 * @param hydeEmbedding The HyDE hypothetical document embedding
 * @param hydeWeight Weight for HyDE embedding (0-1). Higher = more reliance on HyDE.
 * @returns Combined embedding
 */
export declare function combineEmbeddings(queryEmbedding: number[], hydeEmbedding: number[], hydeWeight?: number): number[];
/**
 * Check if a query would benefit from HyDE.
 * HyDE is most helpful for vague, indirect, or complex queries.
 *
 * @param query The user query
 * @returns boolean indicating if HyDE should be used
 */
export declare function shouldUseHyDE(query: string): boolean;
/**
 * Confidence-gated HyDE embedding.
 *
 * Runs a cheap first-pass embedding. If retrieval confidence (computed
 * from the first-pass results) is below the threshold, re-embeds with
 * HyDE to improve recall. Saves the LLM call when results are already
 * strong.
 *
 * @param query User query
 * @param retrievalConfidence 0–1 confidence from first-pass results
 * @param confidenceThreshold Gate threshold (default 0.72)
 * @returns Embedding result with `gated` flag
 */
export declare function embedWithHyDEIfNeeded(query: string, retrievalConfidence: number, confidenceThreshold?: number): Promise<{
    embedding: number[];
    usedHyDE: boolean;
    hypotheticalDocument?: string;
    gated: boolean;
}>;
/**
 * Main HyDE function - generates embedding with optional HyDE enhancement.
 *
 * @param query The user query
 * @param enableHyDE Whether to enable HyDE generation
 * @returns Embedding (either query-only or query+HyDE combined)
 */
export declare function embedWithHyDE(query: string, enableHyDE?: boolean): Promise<{
    embedding: number[];
    usedHyDE: boolean;
    hypotheticalDocument?: string;
}>;
//# sourceMappingURL=hyde.d.ts.map