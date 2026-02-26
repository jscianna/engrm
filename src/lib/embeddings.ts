/**
 * Embeddings with fallback chain:
 * 1. OpenAI text-embedding-3-small (primary)
 * 2. Cohere embed-english-v3.0 (fallback)
 * 3. Zero vector (last resort)
 */

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

  // Try OpenAI first
  const openaiResult = await embedWithOpenAI(input);
  if (openaiResult) {
    return openaiResult;
  }

  // Fallback to Cohere
  const cohereResult = await embedWithCohere(input);
  if (cohereResult) {
    return cohereResult;
  }

  // Last resort: zero vector (search won't work but app won't crash)
  console.warn("[Embeddings] All providers failed, returning zero vector");
  return new Array(EMBEDDING_DIMENSION).fill(0);
}

export function getEmbeddingDimension(): number {
  return EMBEDDING_DIMENSION;
}
