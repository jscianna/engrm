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
 */
export async function storeZkMemory(params: {
  encryptedTitle: string;
  encryptedContent: string;
  vector: number[];
  metadata?: Record<string, unknown>;
}): Promise<{ id: string }> {
  return request("POST", "/api/v1/memories/zk", {
    encryptedTitle: params.encryptedTitle,
    encryptedContent: params.encryptedContent,
    vector: params.vector,
    metadata: params.metadata,
  });
}

/**
 * Search by vector only - server doesn't know what we're searching for
 */
export async function searchByVector(params: {
  vector: number[];
  topK?: number;
}): Promise<{ results: ZkSearchResult[] }> {
  return request("POST", "/api/v1/search/zk", {
    vector: params.vector,
    topK: params.topK || 5,
  });
}

/**
 * List recent memories (encrypted)
 */
export async function listMemories(params?: {
  limit?: number;
}): Promise<{ memories: ZkSearchResult[] }> {
  const limit = params?.limit || 10;
  return request("GET", `/api/v1/memories?limit=${limit}`);
}

/**
 * Delete a memory
 */
export async function deleteMemory(id: string): Promise<void> {
  await request("DELETE", `/api/v1/memories/${id}`);
}
