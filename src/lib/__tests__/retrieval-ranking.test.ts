import { describe, expect, it } from "vitest";
import { computeWave2Rank } from "@/lib/retrieval-ranking";

describe("computeWave2Rank", () => {
  it("rewards fresher memories for same relevance and quality", () => {
    const fresh = computeWave2Rank({
      relevance_score: 0.82,
      feedback_score: 2,
      access_count: 8,
      entity_overlap: 1,
      created_at: "2026-03-24T00:00:00.000Z",
      confidence_score: 0.7,
    });

    const stale = computeWave2Rank({
      relevance_score: 0.82,
      feedback_score: 2,
      access_count: 8,
      entity_overlap: 1,
      created_at: "2025-01-24T00:00:00.000Z",
      confidence_score: 0.7,
    });

    expect(fresh.score).toBeGreaterThan(stale.score);
  });

  it("penalizes low confidence", () => {
    const high = computeWave2Rank({
      relevance_score: 0.9,
      feedback_score: 0,
      access_count: 1,
      entity_overlap: 0,
      created_at: "2026-03-24T00:00:00.000Z",
      confidence_score: 0.9,
    });

    const low = computeWave2Rank({
      relevance_score: 0.9,
      feedback_score: 0,
      access_count: 1,
      entity_overlap: 0,
      created_at: "2026-03-24T00:00:00.000Z",
      confidence_score: 0.2,
    });

    expect(high.score).toBeGreaterThan(low.score);
  });
});
