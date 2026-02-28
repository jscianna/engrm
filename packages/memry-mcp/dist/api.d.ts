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
 * Get auto-namespace from environment
 * Priority: MEMRY_NAMESPACE > MEMRY_CHAT_ID > MEMRY_SESSION_ID > undefined
 *
 * For OpenClaw: set MEMRY_NAMESPACE=${chat_id} or MEMRY_NAMESPACE=${conversation_label}
 */
export declare function getNamespace(): string | undefined;
/**
 * Store memory with pre-computed vector and encrypted content
 * Server never sees plaintext
 * Auto-uses namespace from environment if set
 */
export declare function storeZkMemory(params: {
    encryptedTitle: string;
    encryptedContent: string;
    vector: number[];
    metadata?: Record<string, unknown>;
    namespace?: string;
}): Promise<{
    id: string;
}>;
/**
 * Search by vector only - server doesn't know what we're searching for
 * Auto-uses namespace from environment if set
 */
export declare function searchByVector(params: {
    vector: number[];
    topK?: number;
    namespace?: string;
}): Promise<{
    results: ZkSearchResult[];
}>;
/**
 * List recent memories (encrypted)
 * Auto-uses namespace from environment if set
 */
export declare function listMemories(params?: {
    limit?: number;
    namespace?: string;
}): Promise<{
    memories: ZkSearchResult[];
}>;
/**
 * Delete a memory
 */
export declare function deleteMemory(id: string): Promise<void>;
