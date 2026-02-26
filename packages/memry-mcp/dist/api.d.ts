/**
 * MEMRY API client for zero-knowledge operations
 * Only sends: vectors (not text) + encrypted blobs
 */
export interface MemryConfig {
    apiKey: string;
    apiUrl: string;
}
export interface ZkMemory {
    id: string;
    title: string;
    content: string;
    vector: number[];
    metadata?: Record<string, unknown>;
    createdAt: string;
}
export interface ZkSearchResult {
    id: string;
    score: number;
    encryptedTitle: string;
    encryptedContent: string;
    metadata?: Record<string, unknown>;
}
/**
 * Store memory with pre-computed vector and encrypted content
 * Server never sees plaintext
 */
export declare function storeZkMemory(params: {
    encryptedTitle: string;
    encryptedContent: string;
    vector: number[];
    metadata?: Record<string, unknown>;
}): Promise<{
    id: string;
}>;
/**
 * Search by vector only - server doesn't know what we're searching for
 */
export declare function searchByVector(params: {
    vector: number[];
    topK?: number;
}): Promise<{
    results: ZkSearchResult[];
}>;
/**
 * List recent memories (encrypted)
 */
export declare function listMemories(params?: {
    limit?: number;
}): Promise<{
    memories: ZkSearchResult[];
}>;
/**
 * Delete a memory
 */
export declare function deleteMemory(id: string): Promise<void>;
