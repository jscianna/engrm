/**
 * Persistent Embedding Cache using Upstash Redis
 * 
 * Why this matters for agents:
 * - Repeat queries skip OpenAI entirely (~0ms vs ~300ms)
 * - Common patterns get faster over time
 * - Agents feel more responsive = smarter UX
 * 
 * Cache key: hash of normalized query text
 * TTL: 7 days (embeddings don't change for same text)
 */

import { Redis } from "@upstash/redis";
import crypto from "crypto";

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const CACHE_PREFIX = "emb:v3:";

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  
  if (!url || !token) {
    return null;
  }
  
  redis = new Redis({ url, token });
  return redis;
}

function hashKey(text: string, namespace: string): string {
  const normalized = text.trim().toLowerCase();
  return `${CACHE_PREFIX}${namespace}:${crypto.createHash("sha256").update(normalized).digest("hex")}`;
}

export async function getCachedEmbeddingPersistent(text: string, namespace = "default"): Promise<number[] | null> {
  try {
    const client = getRedis();
    if (!client) return null;
    
    const key = hashKey(text, namespace);
    const cached = await client.get<number[]>(key);
    
    if (cached) {
      console.log("[EmbeddingCache] HIT");
      return cached;
    }
    
    return null;
  } catch (error) {
    console.error("[EmbeddingCache] Get error:", error);
    return null;
  }
}

export async function setCachedEmbeddingPersistent(text: string, embedding: number[], namespace = "default"): Promise<void> {
  try {
    const client = getRedis();
    if (!client) return;
    
    const key = hashKey(text, namespace);
    await client.set(key, embedding, { ex: CACHE_TTL_SECONDS });
  } catch (error) {
    console.error("[EmbeddingCache] Set error:", error);
  }
}

export async function getEmbeddingCacheStats(): Promise<{ enabled: boolean; keyCount?: number }> {
  try {
    const client = getRedis();
    if (!client) return { enabled: false };
    
    // Count embedding keys (approximate)
    const info = await client.dbsize();
    return { enabled: true, keyCount: info };
  } catch {
    return { enabled: false };
  }
}
