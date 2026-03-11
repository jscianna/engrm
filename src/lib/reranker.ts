/**
 * LLM Reranking for Memory Retrieval
 * 
 * Reranks retrieved memory candidates using a fast LLM to select
 * the most relevant memories based on query intent + memory fit.
 * 
 * This improves precision by having the LLM judge relevance directly,
 * rather than relying solely on embedding similarity.
 */

import { callLLM, LLMError } from "./llm";

interface RerankableMemory {
  id: string;
  text: string;
}

// Use a fast model for reranking
const RERANK_MODEL = "gpt-4o-mini";

export interface RerankResult<T extends RerankableMemory = RerankableMemory> {
  /** Reranked and filtered memories */
  memories: T[];
  /** Scores assigned by the LLM (0-100) */
  scores: Map<string, number>;
  /** Whether reranking succeeded */
  success: boolean;
  /** Error message if reranking failed */
  error?: string;
}

export interface RerankOptions {
  /** Number of top candidates to consider for reranking (default: 20) */
  topK?: number;
  /** Number of memories to return after reranking (default: 5) */
  returnK?: number;
  /** Minimum score threshold (0-100) for inclusion (default: 60) */
  minScore?: number;
  /** Whether to include explanation in output (default: false) */
  includeExplanation?: boolean;
}

/**
 * System prompt for the reranking LLM.
 * Instructs the LLM to score memories based on relevance to the query.
 */
const RERANK_SYSTEM_PROMPT = `You are a relevance scoring assistant for a memory retrieval system.
Your task is to evaluate how relevant each memory is to the user's query.

Score each memory from 0-100 based on:
- Semantic relevance: Does the memory content directly answer or relate to the query?
- Intent match: Does the memory address what the user is actually asking for?
- Information value: Would including this memory help answer the query?

Scoring guidelines:
- 90-100: Perfect match - directly answers the query
- 70-89: Highly relevant - strongly related and useful
- 50-69: Moderately relevant - somewhat related, may provide context
- 30-49: Weakly relevant - tangentially related
- 0-29: Not relevant - doesn't help answer the query

Respond ONLY with a JSON object in this exact format:
{
  "scores": [
    {"id": "memory_id_1", "score": 85, "reason": "brief explanation"},
    {"id": "memory_id_2", "score": 45, "reason": "brief explanation"}
  ]
}`;

/**
 * Rerank memories using an LLM to judge relevance.
 * 
 * @param query The user's search query
 * @param candidates The candidate memories to rerank (should be pre-filtered top candidates)
 * @param options Reranking options
 * @returns RerankResult with filtered/sorted memories
 */
export async function rerankMemories<T extends RerankableMemory>(
  query: string,
  candidates: T[],
  options: RerankOptions = {}
): Promise<RerankResult<T>> {
  const {
    topK = 20,
    returnK = 5,
    minScore = 60,
    includeExplanation = false,
  } = options;

  // Not enough candidates to rerank
  if (candidates.length === 0) {
    return { memories: [], scores: new Map(), success: true };
  }

  // If we have fewer candidates than returnK, just return them all
  if (candidates.length <= returnK) {
    const scores = new Map(candidates.map((m, i) => [m.id, 100 - i * 5]));
    return { memories: candidates, scores, success: true };
  }

  // Limit to topK candidates for reranking
  const candidatesToRerank = candidates.slice(0, topK);

  try {
    // Build the prompt with query and candidate memories
    const prompt = buildRerankPrompt(query, candidatesToRerank);

    // Call LLM for reranking
    const response = await callLLM(prompt, RERANK_SYSTEM_PROMPT, { model: RERANK_MODEL });

    // Parse the response
    const parsed = parseRerankResponse(response);

    // Create score map
    const scoreMap = new Map<string, { score: number; reason?: string }>();
    for (const item of parsed.scores) {
      scoreMap.set(item.id, { score: item.score, reason: item.reason });
    }

    // Filter and sort memories based on LLM scores
    const scoredMemories = candidatesToRerank
      .map((memory) => ({
        memory,
        score: scoreMap.get(memory.id)?.score ?? 0,
        reason: includeExplanation ? scoreMap.get(memory.id)?.reason : undefined,
      }))
      .filter((item) => item.score >= minScore)
      .sort((a, b) => b.score - a.score);

    // Return top returnK memories
    const finalMemories = scoredMemories.slice(0, returnK).map((item) => item.memory);
    const finalScores = new Map(scoredMemories.map((item) => [item.memory.id, item.score]));

    return {
      memories: finalMemories,
      scores: finalScores,
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof LLMError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Unknown error during reranking";

    console.warn("[Reranker] LLM reranking failed:", errorMessage);

    // Fall back to returning original top candidates
    return {
      memories: candidates.slice(0, returnK),
      scores: new Map(),
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Build the reranking prompt for the LLM.
 */
function buildRerankPrompt(query: string, candidates: RerankableMemory[]): string {
  const candidateList = candidates
    .map((m, i) => `\n[${i + 1}] ID: ${m.id}\nContent: ${m.text.slice(0, 500)}${m.text.length > 500 ? "..." : ""}`)
    .join("\n");

  return `Query: "${query}"\n\nEvaluate the relevance of each memory to this query:${candidateList}`;
}

/**
 * Parse the LLM reranking response.
 */
function parseRerankResponse(response: string): { scores: Array<{ id: string; score: number; reason?: string }> } {
  try {
    // Try to parse as JSON directly
    const parsed = JSON.parse(response);
    
    if (parsed.scores && Array.isArray(parsed.scores)) {
      return {
        scores: parsed.scores.map((s: { id?: string; score?: number; reason?: string }) => ({
          id: s.id ?? "",
          score: typeof s.score === "number" ? Math.max(0, Math.min(100, s.score)) : 0,
          reason: s.reason,
        })).filter((s: { id: string }) => s.id),
      };
    }

    // Alternative format: direct array
    if (Array.isArray(parsed)) {
      return {
        scores: parsed.map((s: { id?: string; score?: number; reason?: string }) => ({
          id: s.id ?? "",
          score: typeof s.score === "number" ? Math.max(0, Math.min(100, s.score)) : 0,
          reason: s.reason,
        })).filter((s: { id: string }) => s.id),
      };
    }

    throw new Error("Invalid response format: expected 'scores' array");
  } catch (error) {
    console.error("[Reranker] Failed to parse LLM response:", error, "Response:", response);
    throw new Error("Failed to parse reranking response");
  }
}

/**
 * Batch rerank memories for multiple queries.
 * Useful when using query expansion.
 */
export async function rerankMemoriesBatched(
  queries: string[],
  candidates: RerankableMemory[],
  options: RerankOptions = {}
): Promise<RerankResult> {
  // Deduplicate candidates across all queries
  const uniqueCandidates = [...new Map(candidates.map((m) => [m.id, m])).values()];

  // Use the most specific query (longest) for reranking
  const bestQuery = queries.reduce((a, b) => (a.length > b.length ? a : b));

  return rerankMemories(bestQuery, uniqueCandidates, options);
}

/**
 * Apply reranking scores as a boost to existing scores.
 * This combines the semantic search score with the LLM judgment.
 * 
 * @param memories Memories with existing scores
 * @param rerankScores LLM-assigned scores
 * @param rerankWeight How much weight to give reranking (0-1)
 * @returns Combined scores
 */
export function combineWithRerankScores<T extends { memory: RerankableMemory; score: number }>(
  memories: T[],
  rerankScores: Map<string, number>,
  rerankWeight: number = 0.6
): T[] {
  const semanticWeight = 1 - rerankWeight;

  return memories.map((item) => {
    const rerankScore = rerankScores.get(item.memory.id);
    if (rerankScore === undefined) {
      return item;
    }

    // Normalize rerank score (0-100) to match semantic score scale (typically 0.5-1.0)
    const normalizedRerank = rerankScore / 100;

    // Combine scores
    const combinedScore = item.score * semanticWeight + normalizedRerank * rerankWeight;

    return {
      ...item,
      score: combinedScore,
    };
  });
}
