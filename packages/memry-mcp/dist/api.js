/**
 * MEMRY API client for zero-knowledge operations
 * Only sends: vectors (not text) + encrypted blobs
 */
function getConfig() {
    const apiKey = process.env.MEMRY_API_KEY;
    const apiUrl = process.env.MEMRY_API_URL || "https://memry-sand.vercel.app";
    if (!apiKey) {
        throw new Error("MEMRY_API_KEY not set");
    }
    return { apiKey, apiUrl: apiUrl.replace(/\/$/, "") };
}
/**
 * Get auto-namespace from environment
 * Priority: MEMRY_NAMESPACE > MEMRY_CHAT_ID > MEMRY_SESSION_ID > undefined
 *
 * For OpenClaw: set MEMRY_NAMESPACE=${chat_id} or MEMRY_NAMESPACE=${conversation_label}
 */
export function getRawNamespace() {
    return process.env.MEMRY_NAMESPACE
        || process.env.MEMRY_CHAT_ID
        || process.env.MEMRY_SESSION_ID
        || undefined;
}
/**
 * Hash namespace with vault password for zero-knowledge.
 * Server sees opaque ID, can't know the actual chat/project name.
 */
export function hashNamespace(namespace, vaultPassword) {
    const crypto = require('crypto');
    const combined = `${namespace}:${vaultPassword}`;
    const hash = crypto.createHash('sha256').update(combined).digest('hex');
    return `ns_${hash.slice(0, 16)}`; // e.g., "ns_a3f2b8c1d4e5f6a7"
}
/**
 * Get hashed namespace for ZK operations
 */
export function getNamespace() {
    const raw = getRawNamespace();
    if (!raw)
        return undefined;
    const vaultPassword = process.env.MEMRY_VAULT_PASSWORD;
    if (!vaultPassword)
        return raw; // Fallback to raw if no password (shouldn't happen)
    return hashNamespace(raw, vaultPassword);
}
async function request(method, endpoint, data) {
    const { apiKey, apiUrl } = getConfig();
    const res = await fetch(`${apiUrl}${endpoint}`, {
        method,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: data ? JSON.stringify(data) : undefined,
    });
    if (!res.ok) {
        const error = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(error.error || `API error: ${res.status}`);
    }
    return res.json();
}
/**
 * Store memory with pre-computed vector and encrypted content
 * Server never sees plaintext
 * Auto-uses namespace from environment if set
 */
export async function storeZkMemory(params) {
    const namespace = params.namespace || getNamespace();
    return request("POST", "/api/v1/memories/zk", {
        encryptedTitle: params.encryptedTitle,
        encryptedContent: params.encryptedContent,
        vector: params.vector,
        metadata: params.metadata,
        ...(namespace && { namespace }),
    });
}
/**
 * Search by vector only - server doesn't know what we're searching for
 * Auto-uses namespace from environment if set
 */
export async function searchByVector(params) {
    const namespace = params.namespace || getNamespace();
    return request("POST", "/api/v1/search/zk", {
        vector: params.vector,
        topK: params.topK || 5,
        ...(namespace && { namespace }),
    });
}
/**
 * List recent memories (encrypted)
 * Auto-uses namespace from environment if set
 */
export async function listMemories(params) {
    const limit = params?.limit || 10;
    const namespace = params?.namespace || getNamespace();
    const nsParam = namespace ? `&namespace=${encodeURIComponent(namespace)}` : "";
    return request("GET", `/api/v1/memories?limit=${limit}${nsParam}`);
}
/**
 * Delete a memory
 */
export async function deleteMemory(id) {
    await request("DELETE", `/api/v1/memories/${id}`);
}
