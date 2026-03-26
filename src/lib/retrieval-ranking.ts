import { calculateFreshnessScore } from "@/lib/retrieval-explainability";

type RankInput = {
  relevance_score: number;
  feedback_score: number;
  access_count: number;
  entity_overlap: number;
  created_at: string;
  confidence_score?: number;
};

export type RankBreakdown = {
  score: number;
  quality_score: number;
  freshness_score: number;
  confidence_score: number;
};

export function computeWave2Rank(input: RankInput): RankBreakdown {
  const relevance_score = Math.max(0.0001, input.relevance_score);
  const quality_raw =
    (input.feedback_score * 0.08) +
    (Math.min(input.access_count, 25) * 0.01) +
    (input.entity_overlap * 0.06);
  const quality_score = clamp(0.5 + quality_raw, 0.2, 1);
  const freshness_score = clamp(calculateFreshnessScore(input.created_at), 0.2, 1);
  const confidence_score = clamp(input.confidence_score ?? 0.6, 0.2, 1);

  return {
    score: relevance_score * quality_score * freshness_score * confidence_score,
    quality_score,
    freshness_score,
    confidence_score,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
