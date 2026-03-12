/**
 * Embeddings with fallback chain:
 * 1. Persistent cache (Upstash Redis) - survives deployments
 * 2. In-memory cache (warm lambda) - fast for hot queries
 * 3. OpenAI text-embedding-3-small (primary)
 * 4. Cohere embed-english-v3.0 (fallback)
 * 5. Zero vector (last resort)
 *
 * Speed goal: Make agents feel smarter by being faster.
 * Repeat queries should be near-instant.
 *
 * Privacy model note:
 * This service currently uses a server-trust architecture for embeddings.
 * Raw text is sent from our server to embedding providers (OpenAI/Cohere).
 * True zero-knowledge requires generating embeddings locally on the client.
 */
export declare function embedText(input: string): Promise<number[]>;
export declare function getEmbeddingDimension(): number;
//# sourceMappingURL=embeddings.d.ts.map