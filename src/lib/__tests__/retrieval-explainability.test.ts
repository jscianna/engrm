import { describe, expect, it } from "vitest";
import {
  buildProvenanceSnippet,
  calculateFreshnessScore,
  deriveMatchReason,
} from "@/lib/retrieval-explainability";

describe("retrieval explainability helpers", () => {
  it("decays freshness score with age", () => {
    const now = Date.parse("2026-03-25T00:00:00.000Z");
    const fresh = calculateFreshnessScore("2026-03-24T00:00:00.000Z", now);
    const old = calculateFreshnessScore("2025-12-01T00:00:00.000Z", now);

    expect(fresh).toBeGreaterThan(old);
    expect(fresh).toBeLessThanOrEqual(1);
    expect(old).toBeGreaterThanOrEqual(0);
  });

  it("builds compact provenance snippet", () => {
    const snippet = buildProvenanceSnippet("alpha beta gamma delta", 10);
    expect(snippet.endsWith("…")).toBe(true);
    expect(snippet.length).toBe(10);
  });

  it("derives match reason from strongest components", () => {
    const reason = deriveMatchReason({
      vector_score: 0.82,
      entity_bonus: 0.12,
      feedback_bonus: 0.01,
      access_bonus: 0,
      freshness_score: 0.75,
    });

    expect(reason).toContain("semantic");
  });
});
