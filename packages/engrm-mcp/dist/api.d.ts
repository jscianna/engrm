/**
 * FatHippo API client for MCP operations.
 * Uses supported v1 endpoints only.
 */
export interface MemryConfig {
    apiKey: string;
    apiUrl: string;
}
export interface ZkMemory {
    id: string;
    title: string;
    content: string;
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
 * Priority: FATHIPPO_NAMESPACE > FATHIPPO_CHAT_ID > FATHIPPO_SESSION_ID > undefined
 *
 * For OpenClaw: set FATHIPPO_NAMESPACE=${chat_id} or FATHIPPO_NAMESPACE=${conversation_label}
 */
export declare function getRawNamespace(): string | undefined;
/**
 * Hash namespace with vault password for zero-knowledge.
 * Server sees opaque ID, can't know the actual chat/project name.
 */
export declare function hashNamespace(namespace: string, vaultPassword: string): string;
/**
 * Get hashed namespace for ZK operations
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
    query: string;
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
