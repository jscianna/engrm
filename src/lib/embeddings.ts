/**
 * Embeddings with provider-aware caching and query/document modes.
 *
 * Default behavior:
 * - Prefer Voyage when VOYAGE_API_KEY is configured
 * - Fall back to OpenAI/OpenRouter/Cohere when explicitly selected
 * - Scope caches by provider/model/dimension/purpose to avoid stale vector reuse
 */

import { getCachedEmbedding, setCachedEmbedding } from "./embedding-cache";
import { getCachedEmbeddingPersistent, setCachedEmbeddingPersistent } from "./embedding-cache-redis";

const VOYAGE_EMBEDDINGS_URL = "https://api.voyageai.com/v1/embeddings";
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";
const COHERE_EMBEDDINGS_URL = "https://api.cohere.ai/v1/embed";

const DEFAULT_VOYAGE_MODEL = "voyage-4-lite";
const DEFAULT_VOYAGE_DIMENSION = 1024;
const DEFAULT_OPENAI_MODEL = "text-embedding-3-small";
const DEFAULT_OPENAI_DIMENSION = 384;
const DEFAULT_OPENROUTER_MODEL = "openai/text-embedding-3-small";
const DEFAULT_COHERE_MODEL = "embed-english-v3.0";
const DEFAULT_COHERE_DIMENSION = 1024;

export type EmbeddingPurpose = "document" | "query";
export type EmbeddingProvider = "voyage" | "openai" | "openrouter" | "cohere";

type EmbeddingConfig = {
  provider: EmbeddingProvider;
  model: string;
  dimension: number;
};

function normalizeProvider(value: string | undefined): EmbeddingProvider | null {
  if (!value) {
    return null;
  }

  switch (value.trim().toLowerCase()) {
    case "voyage":
      return "voyage";
    case "openai":
      return "openai";
    case "openrouter":
      return "openrouter";
    case "cohere":
      return "cohere";
    default:
      return null;
  }
}

function parseDimension(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitizeSegment(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

let activeEmbeddingConfig: EmbeddingConfig | null = null;

function resolveEmbeddingConfig(): EmbeddingConfig {
  if (activeEmbeddingConfig) {
    return activeEmbeddingConfig;
  }

  const explicitProvider = normalizeProvider(process.env.EMBEDDING_PROVIDER);
  const provider =
    explicitProvider ??
    (process.env.VOYAGE_API_KEY
      ? "voyage"
      : process.env.OPENAI_API_KEY
        ? "openai"
        : process.env.OPENROUTER_API_KEY
          ? "openrouter"
          : process.env.COHERE_API_KEY
            ? "cohere"
            : "openai");

  if (provider === "voyage") {
    activeEmbeddingConfig = {
      provider,
      model: process.env.EMBEDDING_MODEL || process.env.VOYAGE_EMBEDDING_MODEL || DEFAULT_VOYAGE_MODEL,
      dimension: parseDimension(
        process.env.EMBEDDING_DIMENSION || process.env.VOYAGE_EMBEDDING_DIMENSION,
        DEFAULT_VOYAGE_DIMENSION,
      ),
    };
    return activeEmbeddingConfig;
  }

  if (provider === "openrouter") {
    activeEmbeddingConfig = {
      provider,
      model: process.env.EMBEDDING_MODEL || process.env.OPENROUTER_EMBEDDING_MODEL || DEFAULT_OPENROUTER_MODEL,
      dimension: parseDimension(
        process.env.EMBEDDING_DIMENSION || process.env.OPENAI_EMBEDDING_DIMENSION,
        DEFAULT_OPENAI_DIMENSION,
      ),
    };
    return activeEmbeddingConfig;
  }

  if (provider === "cohere") {
    activeEmbeddingConfig = {
      provider,
      model: process.env.EMBEDDING_MODEL || process.env.COHERE_EMBEDDING_MODEL || DEFAULT_COHERE_MODEL,
      dimension: parseDimension(
        process.env.EMBEDDING_DIMENSION || process.env.COHERE_EMBEDDING_DIMENSION,
        DEFAULT_COHERE_DIMENSION,
      ),
    };
    return activeEmbeddingConfig;
  }

  activeEmbeddingConfig = {
    provider: "openai",
    model: process.env.EMBEDDING_MODEL || process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_OPENAI_MODEL,
    dimension: parseDimension(
      process.env.EMBEDDING_DIMENSION || process.env.OPENAI_EMBEDDING_DIMENSION,
      DEFAULT_OPENAI_DIMENSION,
    ),
  };
  return activeEmbeddingConfig;
}

function getCacheNamespace(purpose: EmbeddingPurpose): string {
  const config = resolveEmbeddingConfig();
  return [
    "provider",
    config.provider,
    sanitizeSegment(config.model),
    String(config.dimension),
    purpose,
  ].join(":");
}

function normalizeEmbedding(vector: unknown, source: string, expectedDimension: number): number[] | null {
  if (!Array.isArray(vector)) {
    return null;
  }

  const numeric = vector.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numeric.length === 0) {
    return null;
  }

  if (numeric.length === expectedDimension) {
    return numeric;
  }

  if (numeric.length > expectedDimension) {
    console.warn(
      `[Embeddings] Normalizing ${source} vector from ${numeric.length} to ${expectedDimension} dimensions`,
    );
    return numeric.slice(0, expectedDimension);
  }

  console.warn(
    `[Embeddings] Padding ${source} vector from ${numeric.length} to ${expectedDimension} dimensions`,
  );
  return [...numeric, ...new Array(expectedDimension - numeric.length).fill(0)];
}

async function embedWithVoyage(
  input: string,
  purpose: EmbeddingPurpose,
  config: EmbeddingConfig,
): Promise<number[] | null> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch(VOYAGE_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        input: [input.slice(0, 16_000)],
        input_type: purpose === "query" ? "query" : "document",
        output_dimension: config.dimension,
      }),
    });

    if (!response.ok) {
      console.error("[Embeddings] Voyage error:", response.status, await response.text());
      return null;
    }

    const data = await response.json();
    const embedding =
      data.data?.[0]?.embedding ??
      data.embeddings?.[0] ??
      data.output?.[0]?.embedding ??
      null;
    return normalizeEmbedding(embedding, "Voyage", config.dimension);
  } catch (error) {
    console.error("[Embeddings] Voyage failed:", error);
    return null;
  }
}

async function embedWithOpenAI(input: string, config: EmbeddingConfig): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(OPENAI_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        input: input.slice(0, 8000),
        dimensions: config.dimension,
      }),
    });

    if (!response.ok) {
      console.error("[Embeddings] OpenAI error:", response.status);
      return null;
    }

    const data = await response.json();
    return normalizeEmbedding(data.data?.[0]?.embedding ?? null, "OpenAI", config.dimension);
  } catch (error) {
    console.error("[Embeddings] OpenAI failed:", error);
    return null;
  }
}

async function embedWithOpenRouter(input: string, config: EmbeddingConfig): Promise<number[] | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(OPENROUTER_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://fathippo.ai",
        "X-Title": "FatHippo Memory",
      },
      body: JSON.stringify({
        model: config.model,
        input: input.slice(0, 8000),
        dimensions: config.dimension,
      }),
    });

    if (!response.ok) {
      console.error("[Embeddings] OpenRouter error:", response.status);
      return null;
    }

    const data = await response.json();
    return normalizeEmbedding(data.data?.[0]?.embedding ?? null, "OpenRouter", config.dimension);
  } catch (error) {
    console.error("[Embeddings] OpenRouter failed:", error);
    return null;
  }
}

async function embedWithCohere(
  input: string,
  purpose: EmbeddingPurpose,
  config: EmbeddingConfig,
): Promise<number[] | null> {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(COHERE_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Client-Name": "fathippo",
      },
      body: JSON.stringify({
        texts: [input.slice(0, 4096)],
        model: config.model,
        input_type: purpose === "query" ? "search_query" : "search_document",
        truncate: "END",
      }),
    });

    if (!response.ok) {
      console.error("[Embeddings] Cohere error:", response.status);
      return null;
    }

    const data = await response.json();
    return normalizeEmbedding(data.embeddings?.[0] ?? null, "Cohere", config.dimension);
  } catch (error) {
    console.error("[Embeddings] Cohere failed:", error);
    return null;
  }
}

async function embedWithConfiguredProvider(
  input: string,
  purpose: EmbeddingPurpose,
  config: EmbeddingConfig,
): Promise<number[] | null> {
  switch (config.provider) {
    case "voyage":
      return embedWithVoyage(input, purpose, config);
    case "openrouter":
      return embedWithOpenRouter(input, config);
    case "cohere":
      return embedWithCohere(input, purpose, config);
    case "openai":
    default:
      return embedWithOpenAI(input, config);
  }
}

export async function embedText(
  input: string,
  options: { purpose?: EmbeddingPurpose } = {},
): Promise<number[]> {
  const purpose = options.purpose ?? "document";
  const config = resolveEmbeddingConfig();
  const cacheNamespace = getCacheNamespace(purpose);

  if (!input?.trim()) {
    return new Array(config.dimension).fill(0);
  }

  const memoryCached = normalizeEmbedding(
    getCachedEmbedding(input, cacheNamespace),
    "memory cache",
    config.dimension,
  );
  if (memoryCached) {
    return memoryCached;
  }

  const persistentCached = normalizeEmbedding(
    await getCachedEmbeddingPersistent(input, cacheNamespace),
    "persistent cache",
    config.dimension,
  );
  if (persistentCached) {
    setCachedEmbedding(input, persistentCached, cacheNamespace);
    return persistentCached;
  }

  const result = await embedWithConfiguredProvider(input, purpose, config);
  if (result) {
    setCachedEmbedding(input, result, cacheNamespace);
    setCachedEmbeddingPersistent(input, result, cacheNamespace).catch(() => {});
    return result;
  }

  console.warn(
    `[Embeddings] ${config.provider}/${config.model} failed, returning zero vector with ${config.dimension} dimensions`,
  );
  return new Array(config.dimension).fill(0);
}

export async function embedQuery(input: string): Promise<number[]> {
  return embedText(input, { purpose: "query" });
}

export async function embedDocument(input: string): Promise<number[]> {
  return embedText(input, { purpose: "document" });
}

export function getEmbeddingConfig(): { provider: EmbeddingProvider; model: string; dimension: number } {
  const config = resolveEmbeddingConfig();
  return { ...config };
}

export function getEmbeddingDimension(): number {
  return resolveEmbeddingConfig().dimension;
}

export function getDefaultQdrantCollectionName(): string {
  const config = resolveEmbeddingConfig();
  return `memories-${sanitizeSegment(config.provider)}-${sanitizeSegment(config.model)}-${config.dimension}`;
}
