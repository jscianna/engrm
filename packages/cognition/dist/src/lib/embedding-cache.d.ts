/**
 * Simple LRU cache for embeddings.
 * Persists in warm serverless functions, reducing OpenAI calls.
 */
export declare function getCachedEmbedding(query: string): number[] | null;
export declare function setCachedEmbedding(query: string, vector: number[]): void;
export declare function getCacheStats(): {
    size: number;
    maxSize: number;
};
//# sourceMappingURL=embedding-cache.d.ts.map