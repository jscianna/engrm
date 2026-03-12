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
 *
 * Privacy model note:
 * This service currently uses a server-trust architecture for embeddings.
 * Raw text is sent from our server to embedding providers (OpenAI/Cohere).
 * True zero-knowledge requires generating embeddings locally on the client.
 */

import { getCachedEmbedding, setCachedEmbedding } from "./embedding-cache";
import { getCachedEmbeddingPersistent, setCachedEmbeddingPersistent } from "./embedding-cache-redis";

const EMBEDDING_DIMENSION = 384; // Standardized output dimension

function normalizeEmbedding(vector: unknown, source: string): number[] | null {
  if (!Array.isArray(vector)) {
    return null;
  }

  const numeric = vector.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numeric.length === 0) {
    return null;
  }

  if (numeric.length === EMBEDDING_DIMENSION) {
    return numeric;
  }

  if (numeric.length > EMBEDDING_DIMENSION) {
    console.warn(
      `[Embeddings] Normalizing ${source} vector from ${numeric.length} to ${EMBEDDING_DIMENSION} dimensions`,
    );
    return numeric.slice(0, EMBEDDING_DIMENSION);
  }

  console.warn(
    `[Embeddings] Padding ${source} vector from ${numeric.length} to ${EMBEDDING_DIMENSION} dimensions`,
  );
  return [...numeric, ...new Array(EMBEDDING_DIMENSION - numeric.length).fill(0)];
}

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
      console.error("[Embeddings] OpenAI error:", response.status);
      return null;
    }

    const data = await response.json();
    return normalizeEmbedding(data.data?.[0]?.embedding ?? null, "OpenAI");
  } catch (error) {
    console.error("[Embeddings] OpenAI failed:", error);
    return null;
  }
}

// OpenRouter embeddings (same models as OpenAI, different endpoint for load distribution)
async function embedWithOpenRouter(input: string): Promise<number[] | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://fathippo.ai",
        "X-Title": "FatHippo Memory",
      },
      body: JSON.stringify({
        model: "openai/text-embedding-3-small",
        input: input.slice(0, 8000),
        dimensions: EMBEDDING_DIMENSION,
      }),
    });

    if (!response.ok) {
      console.error("[Embeddings] OpenRouter error:", response.status);
      return null;
    }

    const data = await response.json();
    return normalizeEmbedding(data.data?.[0]?.embedding ?? null, "OpenRouter");
  } catch (error) {
    console.error("[Embeddings] OpenRouter failed:", error);
    return null;
  }
}

// Load balancing counter (simple round-robin)
let loadBalanceCounter = 0;

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
        "X-Client-Name": "fathippo",
      },
      body: JSON.stringify({
        texts: [input.slice(0, 4096)],
        model: "embed-english-v3.0",
        input_type: "search_document",
        truncate: "END",
      }),
    });

    if (!response.ok) {
      console.error("[Embeddings] Cohere error:", response.status);
      return null;
    }

    const data = await response.json();
    return normalizeEmbedding(data.embeddings?.[0] ?? null, "Cohere");
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
  const memoryCached = normalizeEmbedding(getCachedEmbedding(input), "memory cache");
  if (memoryCached) {
    return memoryCached;
  }

  // 2. Check persistent cache (Upstash Redis - survives cold starts)
  const persistentCached = normalizeEmbedding(await getCachedEmbeddingPersistent(input), "persistent cache");
  if (persistentCached) {
    // Warm the in-memory cache too
    setCachedEmbedding(input, persistentCached);
    return persistentCached;
  }

  // 3. Try OpenAI with load balancing (alternate between direct and OpenRouter)
  // This distributes load and provides redundancy if one endpoint is rate-limited
  loadBalanceCounter = (loadBalanceCounter + 1) % 2;
  const useOpenRouterFirst = loadBalanceCounter === 1;
  
  let result: number[] | null = null;
  
  if (useOpenRouterFirst) {
    // Try OpenRouter first, then direct OpenAI
    result = await embedWithOpenRouter(input);
    if (!result) {
      result = await embedWithOpenAI(input);
    }
  } else {
    // Try direct OpenAI first, then OpenRouter
    result = await embedWithOpenAI(input);
    if (!result) {
      result = await embedWithOpenRouter(input);
    }
  }
  
  if (result) {
    // Cache in both layers
    setCachedEmbedding(input, result);
    setCachedEmbeddingPersistent(input, result).catch(() => {}); // Non-blocking
    return result;
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
