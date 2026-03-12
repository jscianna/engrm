import { describe, expect, it } from "vitest";
import {
  buildAdaptivePolicyContextKey,
  buildAdaptivePolicyFeatures,
  computeAdaptivePolicyReward,
  recommendAdaptivePolicy,
  type AdaptivePolicyStat,
} from "../../../src/lib/cognitive-learning";

describe("adaptive policy learning", () => {
  it("scores accepted verified successes above baseline positively", () => {
    const reward = computeAdaptivePolicyReward({
      acceptedEntity: true,
      materializedEntity: true,
      finalOutcome: "success",
      verificationPassed: true,
      retryCount: 1,
      timeToResolutionMs: 120_000,
      baseline: {
        successRate: 0.35,
        medianRetries: 3,
        medianTimeToResolutionMs: 420_000,
        verificationPassRate: 0.4,
        sampleSize: 6,
      },
    });

    expect(reward).not.toBeNull();
    expect(reward!).toBeGreaterThan(0.6);
  });

  it("explores an unseen safe policy deterministically for a new context", () => {
    const features = buildAdaptivePolicyFeatures({
      problem: "Fix the failing auth middleware test loop in Next.js",
      endpoint: "context-engine.assemble",
      technologies: ["nextjs", "typescript", "clerk"],
      repoProfile: {
        workspaceRoot: "/workspace/apps/web",
        workspaceType: "web-app",
        projectType: "nextjs",
      },
    });

    const first = recommendAdaptivePolicy({ features, baseTraceLimit: 3 });
    const second = recommendAdaptivePolicy({ features, baseTraceLimit: 3 });

    expect(first.exploration).toBe(true);
    expect(first.key).toBe(second.key);
    expect(first.contextKey).toBe(buildAdaptivePolicyContextKey(features));
    expect(first.traceLimit).toBeGreaterThanOrEqual(2);
    expect(first.traceLimit).toBeLessThanOrEqual(8);
  });

  it("prefers trace-first for verification-heavy problems when local reward data supports it", () => {
    const features = buildAdaptivePolicyFeatures({
      problem: "Build is failing and tests need to pass again",
      endpoint: "context-engine.assemble",
      technologies: ["nextjs", "typescript", "vitest"],
      repoProfile: {
        workspaceRoot: "/workspace/apps/web",
        workspaceType: "web-app",
        projectType: "nextjs",
      },
    });
    const contextKey = buildAdaptivePolicyContextKey(features);
    const contextStats: AdaptivePolicyStat[] = [
      {
        policyKey: "trace_first",
        contextKey,
        sampleCount: 4,
        resolvedCount: 4,
        successCount: 4,
        verifiedSuccessCount: 4,
        acceptedCount: 3,
        avgReward: 0.74,
        avgRetries: 1.2,
        avgTimeToResolutionMs: 180_000,
      },
      {
        policyKey: "balanced_default",
        contextKey,
        sampleCount: 4,
        resolvedCount: 4,
        successCount: 2,
        verifiedSuccessCount: 1,
        acceptedCount: 1,
        avgReward: 0.09,
        avgRetries: 2.8,
        avgTimeToResolutionMs: 400_000,
      },
    ];

    const recommendation = recommendAdaptivePolicy({
      features,
      baseTraceLimit: 3,
      contextStats,
      globalStats: contextStats,
    });

    expect(recommendation.exploration).toBe(false);
    expect(recommendation.key).toBe("trace_first");
    expect(recommendation.rationale).toBe("verification_heavy_problem_prefers_more_traces");
    expect(recommendation.traceLimit).toBeGreaterThan(3);
  });
});
