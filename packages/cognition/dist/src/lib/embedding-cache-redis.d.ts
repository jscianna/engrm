/**
 * Persistent Embedding Cache using Upstash Redis
 *
 * Why this matters for agents:
 * - Repeat queries skip OpenAI entirely (~0ms vs ~300ms)
 * - Common patterns get faster over time
 * - Agents feel more responsive = smarter UX
 *
 * Cache key: hash of normalized query text
 * TTL: 7 days (embeddings don't change for same text)
 */
export declare function getCachedEmbeddingPersistent(text: string): Promise<number[] | null>;
export declare function setCachedEmbeddingPersistent(text: string, embedding: number[]): Promise<void>;
export declare function getEmbeddingCacheStats(): Promise<{
    enabled: boolean;
    keyCount?: number;
}>;
//# sourceMappingURL=embedding-cache-redis.d.ts.map