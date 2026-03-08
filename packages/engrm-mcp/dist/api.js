/**
 * FatHippo API client for MCP operations.
 * Uses supported v1 endpoints only.
 */
import { pbkdf2Sync } from "node:crypto";
function getConfig() {
    const apiKey = process.env.FATHIPPO_API_KEY;
    const apiUrl = process.env.FATHIPPO_API_URL || "https://fathippo.ai";
    if (!apiKey) {
        throw new Error("FATHIPPO_API_KEY not set");
    }
    return { apiKey, apiUrl: apiUrl.replace(/\/$/, "") };
}
/**
 * Get auto-namespace from environment
 * Priority: FATHIPPO_NAMESPACE > FATHIPPO_CHAT_ID > FATHIPPO_SESSION_ID > undefined
 *
 * For OpenClaw: set FATHIPPO_NAMESPACE=${chat_id} or FATHIPPO_NAMESPACE=${conversation_label}
 */
export function getRawNamespace() {
    return process.env.FATHIPPO_NAMESPACE
        || process.env.FATHIPPO_CHAT_ID
        || process.env.FATHIPPO_SESSION_ID
        || undefined;
}
/**
 * Hash namespace with vault password for zero-knowledge.
 * Server sees opaque ID, can't know the actual chat/project name.
 */
export function hashNamespace(namespace, vaultPassword) {
    const key = pbkdf2Sync(vaultPassword, namespace, 100_000, 16, "sha256");
    return `ns_${key.toString("hex")}`;
}
/**
 * Get hashed namespace for ZK operations
 */
export function getNamespace() {
    const raw = getRawNamespace();
    if (!raw)
        return undefined;
    const vaultPassword = process.env.FATHIPPO_VAULT_PASSWORD;
    if (!vaultPassword) {
        throw new Error("FATHIPPO_VAULT_PASSWORD is required when namespace is set");
    }
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
    const response = await request("POST", "/api/v1/memories", {
        title: params.encryptedTitle,
        content: params.encryptedContent,
        metadata: params.metadata,
        ...(namespace && { namespace }),
    });
    return { id: response.memory.id };
}
/**
 * Search by vector only - server doesn't know what we're searching for
 * Auto-uses namespace from environment if set
 */
export async function searchByVector(params) {
    const namespace = params.namespace || getNamespace();
    const response = await request("POST", "/api/v1/search", {
        query: params.query,
        topK: params.topK || 5,
        ...(namespace && { namespace }),
    });
    return {
        results: response.map((item) => ({
            id: item.id,
            score: item.score,
            encryptedTitle: item.memory.title,
            encryptedContent: item.memory.text,
            metadata: item.memory.metadata,
        })),
    };
}
/**
 * List recent memories (encrypted)
 * Auto-uses namespace from environment if set
 */
export async function listMemories(params) {
    const limit = params?.limit || 10;
    const namespace = params?.namespace || getNamespace();
    const query = new URLSearchParams();
    query.set("limit", String(limit));
    if (namespace) {
        query.set("namespace", namespace);
    }
    const response = await request("GET", `/api/v1/memories?${query.toString()}`);
    return {
        memories: response.memories.map((memory) => ({
            id: memory.id,
            score: 1,
            encryptedTitle: memory.title,
            encryptedContent: memory.text,
            metadata: memory.metadata,
        })),
    };
}
/**
 * Delete a memory
 */
export async function deleteMemory(id) {
    await request("DELETE", `/api/v1/memories/${id}`);
}
