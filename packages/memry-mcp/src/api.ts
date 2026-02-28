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
  title: string; // encrypted
  content: string; // encrypted
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

function getConfig(): MemryConfig {
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
export function getNamespace(): string | undefined {
  return process.env.MEMRY_NAMESPACE 
    || process.env.MEMRY_CHAT_ID 
    || process.env.MEMRY_SESSION_ID
    || undefined;
}

async function request<T>(
  method: string,
  endpoint: string,
  data?: unknown
): Promise<T> {
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
export async function storeZkMemory(params: {
  encryptedTitle: string;
  encryptedContent: string;
  vector: number[];
  metadata?: Record<string, unknown>;
  namespace?: string;
}): Promise<{ id: string }> {
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
export async function searchByVector(params: {
  vector: number[];
  topK?: number;
  namespace?: string;
}): Promise<{ results: ZkSearchResult[] }> {
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
export async function listMemories(params?: {
  limit?: number;
  namespace?: string;
}): Promise<{ memories: ZkSearchResult[] }> {
  const limit = params?.limit || 10;
  const namespace = params?.namespace || getNamespace();
  const nsParam = namespace ? `&namespace=${encodeURIComponent(namespace)}` : "";
  return request("GET", `/api/v1/memories?limit=${limit}${nsParam}`);
}

/**
 * Delete a memory
 */
export async function deleteMemory(id: string): Promise<void> {
  await request("DELETE", `/api/v1/memories/${id}`);
}
