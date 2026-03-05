/**
 * Embeddings with fallback chain:
 * 1. Persistent cache (Upstash Redis) - survives deployments
 * 2. In-memory cache (warm lambda) - fast for hot queries  
 * 3. OpenAI text-embedding-3-small (primary)
 * 4. Cohere embed-english-v3.0 (fallback)
 * 5. Zero vector (last resort)
 * 
 * Speed goal: Make agents feel smarter by being faster.
 * Repeat queries should be near-instant.
 */

import { getCachedEmbedding, setCachedEmbedding } from "./embedding-cache";
import { getCachedEmbeddingPersistent, setCachedEmbeddingPersistent } from "./embedding-cache-redis";

const EMBEDDING_DIMENSION = 384; // Standardized output dimension

// OpenAI embeddings
async function embedWithOpenAI(input: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: input.slice(0, 8000),
        dimensions: EMBEDDING_DIMENSION,
      }),
    });

    if (!response.ok) {
      console.error("[Embeddings] OpenAI error:", response.status, await response.text());
      return null;
    }

    const data = await response.json();
    return data.data?.[0]?.embedding ?? null;
  } catch (error) {
    console.error("[Embeddings] OpenAI failed:", error);
    return null;
  }
}

// Cohere embeddings
async function embedWithCohere(input: string): Promise<number[] | null> {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.cohere.ai/v1/embed", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Client-Name": "memry",
      },
      body: JSON.stringify({
        texts: [input.slice(0, 4096)],
        model: "embed-english-v3.0",
        input_type: "search_document",
        truncate: "END",
      }),
    });

    if (!response.ok) {
      console.error("[Embeddings] Cohere error:", response.status, await response.text());
      return null;
    }

    const data = await response.json();
    const embedding = data.embeddings?.[0];
    
    if (!embedding) return null;
    
    // Cohere returns 1024 dims, truncate/pad to our standard dimension
    if (embedding.length > EMBEDDING_DIMENSION) {
      return embedding.slice(0, EMBEDDING_DIMENSION);
    }
    if (embedding.length < EMBEDDING_DIMENSION) {
      return [...embedding, ...new Array(EMBEDDING_DIMENSION - embedding.length).fill(0)];
    }
    return embedding;
  } catch (error) {
    console.error("[Embeddings] Cohere failed:", error);
    return null;
  }
}

export async function embedText(input: string): Promise<number[]> {
  if (!input?.trim()) {
    return new Array(EMBEDDING_DIMENSION).fill(0);
  }

  // 1. Check in-memory cache (fastest - same lambda instance)
  const memoryCached = getCachedEmbedding(input);
  if (memoryCached) {
    return memoryCached;
  }

  // 2. Check persistent cache (Upstash Redis - survives cold starts)
  const persistentCached = await getCachedEmbeddingPersistent(input);
  if (persistentCached) {
    // Warm the in-memory cache too
    setCachedEmbedding(input, persistentCached);
    return persistentCached;
  }

  // 3. Try OpenAI (primary)
  const openaiResult = await embedWithOpenAI(input);
  if (openaiResult) {
    // Cache in both layers
    setCachedEmbedding(input, openaiResult);
    setCachedEmbeddingPersistent(input, openaiResult).catch(() => {}); // Non-blocking
    return openaiResult;
  }

  // 4. Fallback to Cohere
  const cohereResult = await embedWithCohere(input);
  if (cohereResult) {
    setCachedEmbedding(input, cohereResult);
    setCachedEmbeddingPersistent(input, cohereResult).catch(() => {}); // Non-blocking
    return cohereResult;
  }

  // 5. Last resort: zero vector (search won't work but app won't crash)
  console.warn("[Embeddings] All providers failed, returning zero vector");
  return new Array(EMBEDDING_DIMENSION).fill(0);
}

export function getEmbeddingDimension(): number {
  return EMBEDDING_DIMENSION;
}
