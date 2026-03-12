/**
 * LLM Reranking for Memory Retrieval
 *
 * Reranks retrieved memory candidates using a fast LLM to select
 * the most relevant memories based on query intent + memory fit.
 *
 * This improves precision by having the LLM judge relevance directly,
 * rather than relying solely on embedding similarity.
 */
interface RerankableMemory {
    id: string;
    text: string;
}
export interface RerankResult<T extends RerankableMemory = RerankableMemory> {
    /** Reranked and filtered memories */
    memories: T[];
    /** Scores assigned by the LLM (0-100) */
    scores: Map<string, number>;
    /** Whether reranking succeeded */
    success: boolean;
    /** Error message if reranking failed */
    error?: string;
}
export interface RerankOptions {
    /** Number of top candidates to consider for reranking (default: 20) */
    topK?: number;
    /** Number of memories to return after reranking (default: 5) */
    returnK?: number;
    /** Minimum score threshold (0-100) for inclusion (default: 60) */
    minScore?: number;
    /** Whether to include explanation in output (default: false) */
    includeExplanation?: boolean;
}
/**
 * Rerank memories using an LLM to judge relevance.
 *
 * @param query The user's search query
 * @param candidates The candidate memories to rerank (should be pre-filtered top candidates)
 * @param options Reranking options
 * @returns RerankResult with filtered/sorted memories
 */
export declare function rerankMemories<T extends RerankableMemory>(query: string, candidates: T[], options?: RerankOptions): Promise<RerankResult<T>>;
/**
 * Batch rerank memories for multiple queries.
 * Useful when using query expansion.
 */
export declare function rerankMemoriesBatched(queries: string[], candidates: RerankableMemory[], options?: RerankOptions): Promise<RerankResult>;
/**
 * Confidence-gated reranking.
 *
 * Only invokes the hosted LLM reranker when retrieval confidence is
 * below `confidenceThreshold`. When confidence is sufficient the
 * original candidates are returned as-is, saving latency and cost.
 *
 * @param query The user query
 * @param candidates Candidate memories from local/hybrid search
 * @param retrievalConfidence 0–1 confidence from computeRetrievalConfidence
 * @param confidenceThreshold Gate threshold (default 0.72)
 * @param options Standard RerankOptions
 * @returns RerankResult – with `gated: true` when reranking was skipped
 */
export declare function rerankIfNeeded<T extends RerankableMemory>(query: string, candidates: T[], retrievalConfidence: number, confidenceThreshold?: number, options?: RerankOptions): Promise<RerankResult<T> & {
    gated: boolean;
}>;
/**
 * Apply reranking scores as a boost to existing scores.
 * This combines the semantic search score with the LLM judgment.
 *
 * @param memories Memories with existing scores
 * @param rerankScores LLM-assigned scores
 * @param rerankWeight How much weight to give reranking (0-1)
 * @returns Combined scores
 */
export declare function combineWithRerankScores<T extends {
    memory: RerankableMemory;
    score: number;
}>(memories: T[], rerankScores: Map<string, number>, rerankWeight?: number): T[];
export {};
//# sourceMappingURL=reranker.d.ts.map