/**
 * Explain Retrieval API
 * 
 * Provides debugging information about why memories were or weren't retrieved
 * for a given query. Shows similarity scores, threshold comparisons, and
 * token estimates.
 * 
 * POST /api/v1/explain
 * Request: { query: string, memoryId?: string }
 * Response: { query, threshold, results: [...], tokenEstimate }
 */

import { embedQuery } from "@/lib/embeddings";
import { countEntityOverlap, extractEntities } from "@/lib/entities";
import { semanticSearchVectors } from "@/lib/qdrant";
import { getAgentMemoriesByIds, getAgentMemoryById } from "@/lib/db";
import { validateApiKey } from "@/lib/api-auth";
import { FatHippoError, errorResponse } from "@/lib/errors";
import { isObject } from "@/lib/api-v1";

export const runtime = "nodejs";

// Default similarity threshold (same as used in search)
const DEFAULT_THRESHOLD = 0.7;

type ExplainResult = {
  memoryId: string;
  title: string;
  score: number;
  vectorScore: number;
  entityBonus: number;
  feedbackBonus: number;
  accessBonus: number;
  included: boolean;
  reason: string;
};

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "explain");
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body) || typeof body.query !== "string" || !body.query.trim()) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "query", reason: "required" });
    }

    const query = body.query.trim();
    const threshold = typeof body.threshold === "number" ? body.threshold : DEFAULT_THRESHOLD;
    const specificMemoryId = typeof body.memoryId === "string" ? body.memoryId : undefined;
    const topK = typeof body.topK === "number" ? Math.min(Math.max(body.topK, 1), 50) : 20;

    // Embed the query
    const vector = await embedQuery(query);
    const queryEntities = extractEntities(query);

    let results: ExplainResult[] = [];
    let tokenEstimate = 0;

    if (specificMemoryId) {
      // Explain a specific memory
      const memory = await getAgentMemoryById(identity.userId, specificMemoryId);
      if (!memory) {
        throw new FatHippoError("MEMORY_NOT_FOUND", { id: specificMemoryId });
      }

      // Search for this specific memory's score
      const hits = await semanticSearchVectors({
        userId: identity.userId,
        query,
        vector,
        topK: 100,
      });

      const hit = hits.find((h) => h.item.id === specificMemoryId);
      const vectorScore = hit?.score ?? 0;
      
      const entityOverlap = countEntityOverlap(queryEntities, memory.entities);
      const entityBonus = entityOverlap * 0.06;
      const feedbackBonus = memory.feedbackScore * 0.08;
      const accessBonus = Math.min(memory.accessCount, 25) * 0.01;
      const totalScore = vectorScore + entityBonus + feedbackBonus + accessBonus;
      const included = totalScore >= threshold;

      results = [{
        memoryId: memory.id,
        title: memory.title,
        score: Math.round(totalScore * 1000) / 1000,
        vectorScore: Math.round(vectorScore * 1000) / 1000,
        entityBonus: Math.round(entityBonus * 1000) / 1000,
        feedbackBonus: Math.round(feedbackBonus * 1000) / 1000,
        accessBonus: Math.round(accessBonus * 1000) / 1000,
        included,
        reason: included
          ? `Score ${totalScore.toFixed(3)} >= threshold ${threshold}`
          : `Score ${totalScore.toFixed(3)} < threshold ${threshold}`,
      }];

      tokenEstimate = included ? estimateTokens(memory.text) : 0;

    } else {
      // Explain top results
      const hits = await semanticSearchVectors({
        userId: identity.userId,
        query,
        vector,
        topK: topK * 5,
      });

      const memories = await getAgentMemoriesByIds({
        userId: identity.userId,
        ids: hits.map((h) => h.item.id),
      });
      const memoryById = new Map(memories.map((m) => [m.id, m]));

      const scored = hits
        .map((hit) => {
          const memory = memoryById.get(hit.item.id);
          if (!memory) return null;

          const vectorScore = hit.score;
          const entityOverlap = countEntityOverlap(queryEntities, memory.entities);
          const entityBonus = entityOverlap * 0.06;
          const feedbackBonus = memory.feedbackScore * 0.08;
          const accessBonus = Math.min(memory.accessCount, 25) * 0.01;
          const totalScore = vectorScore + entityBonus + feedbackBonus + accessBonus;

          return {
            memory,
            vectorScore,
            entityBonus,
            feedbackBonus,
            accessBonus,
            totalScore,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, topK);

      results = scored.map((item) => {
        const included = item.totalScore >= threshold;
        return {
          memoryId: item.memory.id,
          title: item.memory.title,
          score: Math.round(item.totalScore * 1000) / 1000,
          vectorScore: Math.round(item.vectorScore * 1000) / 1000,
          entityBonus: Math.round(item.entityBonus * 1000) / 1000,
          feedbackBonus: Math.round(item.feedbackBonus * 1000) / 1000,
          accessBonus: Math.round(item.accessBonus * 1000) / 1000,
          included,
          reason: included
            ? `Score ${item.totalScore.toFixed(3)} >= threshold ${threshold}`
            : `Score ${item.totalScore.toFixed(3)} < threshold ${threshold}`,
        };
      });

      // Estimate tokens for included results
      tokenEstimate = scored
        .filter((item) => item.totalScore >= threshold)
        .reduce((sum, item) => sum + estimateTokens(item.memory.text), 0);
    }

    return Response.json({
      query,
      threshold,
      results,
      tokenEstimate,
      breakdown: {
        vectorWeight: 1.0,
        entityWeight: 0.06,
        feedbackWeight: 0.08,
        accessWeight: 0.01,
        accessCap: 25,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function estimateTokens(text: string): number {
  // Rough estimate: 4 characters per token
  return Math.ceil(text.length / 4);
}
