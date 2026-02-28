/**
 * Local embeddings using transformers.js
 * Queries NEVER leave the user's device - only vectors are sent to API
 */
/**
 * Initialize the local embedding model (downloads on first use)
 */
export declare function initEmbeddings(): Promise<void>;
/**
 * Generate embedding vector locally - text never leaves device
 */
export declare function embedLocal(text: string): Promise<number[]>;
/**
 * Get embedding dimensions
 */
export declare function getEmbeddingDimensions(): number;
