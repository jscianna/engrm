/**
 * Simple LRU cache for embeddings.
 * Persists in warm serverless functions, reducing OpenAI calls.
 */

interface CacheEntry {
  vector: number[];
  timestamp: number;
}

const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const MAX_CACHE_SIZE = 500;

const cache = new Map<string, CacheEntry>();

function hashQuery(query: string): string {
  // Simple hash for cache key
  const normalized = query.toLowerCase().trim();
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `emb_${hash.toString(36)}`;
}

export function getCachedEmbedding(query: string): number[] | null {
  const key = hashQuery(query);
  const entry = cache.get(key);
  
  if (!entry) return null;
  
  // Check TTL
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  
  return entry.vector;
}

export function setCachedEmbedding(query: string, vector: number[]): void {
  const key = hashQuery(query);
  
  // Evict oldest entries if cache is full
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  
  cache.set(key, {
    vector,
    timestamp: Date.now(),
  });
}

export function getCacheStats(): { size: number; maxSize: number } {
  return { size: cache.size, maxSize: MAX_CACHE_SIZE };
}
