/**
 * Retrieval Confidence Scoring
 *
 * Computes a confidence score for a set of retrieval results so that
 * expensive hosted operations (LLM rerank, HyDE re-query) can be
 * skipped when local/hybrid search already produces strong results.
 *
 * Score range: 0–1
 *   >= threshold → skip hosted upgrade (results are good enough)
 *   <  threshold → escalate to hosted rerank / HyDE
 */

export interface RetrievalConfidenceInput {
  /** Top-K vector similarity scores, descending order */
  vectorScores: number[];
  /** Number of BM25 results that overlap with vector results */
  bm25Overlap: number;
  /** Desired result count (e.g. maxRelevant) */
  desiredK: number;
}

export interface RetrievalConfidenceResult {
  /** Overall confidence 0–1 */
  score: number;
  /** Individual signal values for debugging / metrics */
  signals: {
    peakScore: number;
    scoreDensity: number;
    candidateDepth: number;
  };
}

/**
 * Compute retrieval confidence from search result quality signals.
 *
 * Signals:
 *  - peakScore (40%): highest vector similarity — strong single match
 *  - scoreDensity (30%): avg of top-K scores — overall result quality
 *  - candidateDepth (30%): fraction of desired results above min similarity
 */
export function computeRetrievalConfidence(
  input: RetrievalConfidenceInput,
  minSimilarity = 0.55,
): RetrievalConfidenceResult {
  const { vectorScores, desiredK } = input;

  if (vectorScores.length === 0) {
    return { score: 0, signals: { peakScore: 0, scoreDensity: 0, candidateDepth: 0 } };
  }

  // 1. Peak score — best single match quality
  const peakScore = vectorScores[0];

  // 2. Score density — average of top desiredK scores (clamped to available)
  const topSlice = vectorScores.slice(0, desiredK);
  const scoreDensity = topSlice.reduce((s, v) => s + v, 0) / topSlice.length;

  // 3. Candidate depth — do we have enough good results?
  const aboveThreshold = vectorScores.filter((s) => s >= minSimilarity).length;
  const candidateDepth = Math.min(1, aboveThreshold / Math.max(1, desiredK));

  const score = peakScore * 0.4 + scoreDensity * 0.3 + candidateDepth * 0.3;

  return {
    score: Number(Math.max(0, Math.min(1, score)).toFixed(4)),
    signals: {
      peakScore: Number(peakScore.toFixed(4)),
      scoreDensity: Number(scoreDensity.toFixed(4)),
      candidateDepth: Number(candidateDepth.toFixed(4)),
    },
  };
}

// --------------- process-local metrics ---------------

const gatingMetrics = {
  evaluations: 0,
  gatedSkips: 0,    // skipped hosted ops due to high confidence
  escalations: 0,   // escalated to hosted ops due to low confidence
  hydeEscalations: 0,
  rerankEscalations: 0,
  totalConfidence: 0,
};

export function recordGatingDecision(
  confidence: number,
  escalated: boolean,
  op: "rerank" | "hyde" | "both",
): void {
  gatingMetrics.evaluations += 1;
  gatingMetrics.totalConfidence += confidence;
  if (escalated) {
    gatingMetrics.escalations += 1;
    if (op === "hyde" || op === "both") gatingMetrics.hydeEscalations += 1;
    if (op === "rerank" || op === "both") gatingMetrics.rerankEscalations += 1;
  } else {
    gatingMetrics.gatedSkips += 1;
  }
}

export interface GatingMetrics {
  evaluations: number;
  gatedSkips: number;
  escalations: number;
  hydeEscalations: number;
  rerankEscalations: number;
  avgConfidence: number;
  skipRate: number;
}

export function getGatingMetrics(): GatingMetrics {
  return {
    ...gatingMetrics,
    avgConfidence: gatingMetrics.evaluations > 0
      ? Number((gatingMetrics.totalConfidence / gatingMetrics.evaluations).toFixed(4))
      : 0,
    skipRate: gatingMetrics.evaluations > 0
      ? Number((gatingMetrics.gatedSkips / gatingMetrics.evaluations).toFixed(4))
      : 0,
  };
}
