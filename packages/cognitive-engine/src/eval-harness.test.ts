import { describe, expect, it } from "vitest";
import { evaluateBenchmarkGate, evaluateRetrievalFixtures } from "./eval/harness.js";

describe("evaluateRetrievalFixtures", () => {
  it("computes MRR, recall, hit rate, and weak outcome lift from labeled fixtures", () => {
    const result = evaluateRetrievalFixtures({
      fixtures: [
        {
          problem: "Fix the failing Turso vector query",
          technologies: ["turso", "typescript"],
          baseline: {
            successRate: 0.4,
            medianTimeToResolutionMs: 600000,
            medianRetries: 4,
            verificationPassRate: 0.25,
            sampleSize: 8,
          },
          expectedTraceIds: ["trace-a"],
          expectedPatternIds: ["pattern-a"],
          expectedSkillIds: ["skill-a"],
          acceptedId: "trace-a",
          expectedOutcome: "success",
          targetResolutionKind: "tests_passed",
        },
        {
          problem: "Resolve the Next.js build failure",
          technologies: ["nextjs"],
          baseline: {
            successRate: 0.5,
            medianTimeToResolutionMs: 720000,
            medianRetries: 5,
            verificationPassRate: 0.4,
            sampleSize: 6,
          },
          expectedTraceIds: ["trace-b"],
          expectedPatternIds: ["pattern-b"],
          expectedSkillIds: [],
          expectedOutcome: "success",
          targetResolutionKind: "build_passed",
        },
      ],
      predictions: [
        {
          traces: [{ id: "trace-a" }, { id: "trace-x" }],
          patterns: [{ id: "pattern-a" }],
          skills: [{ id: "skill-a" }],
          finalOutcome: "success",
          acceptedTraceId: "trace-a",
          acceptedPatternId: "pattern-a",
          retryCount: 2,
          timeToResolutionMs: 300000,
          verificationResults: { verified: true, resolutionKind: "tests_passed" },
        },
        {
          traces: [{ id: "trace-x" }, { id: "trace-b" }],
          patterns: [{ id: "pattern-b" }],
          skills: [],
          finalOutcome: "success",
          retryCount: 3,
          timeToResolutionMs: 420000,
          verificationResults: { verified: true, resolutionKind: "build_passed" },
        },
      ],
    });

    expect(result.cases).toBe(2);
    expect(result.traceMrr).toBeCloseTo(0.75, 5);
    expect(result.patternRecallAtK).toBe(1);
    expect(result.skillHitRate).toBe(0.5);
    expect(result.weakOutcomeLift).toBe(1);
    expect(result.successRate).toBe(1);
    expect(result.retryDelta).toBe(2);
    expect(result.timeToResolutionDelta).toBe(300000);
    expect(result.verificationCompletionRate).toBe(1);
  });

  it("fails the benchmark gate when retrieval or outcome metrics regress beyond tolerance", () => {
    const gate = evaluateBenchmarkGate({
      current: {
        traceMrr: 0.3,
        patternRecallAtK: 0.4,
        skillHitRate: 0.2,
        weakOutcomeLift: 0.4,
        successRate: 0.45,
        retryDelta: -0.5,
        timeToResolutionDelta: -120000,
        verificationCompletionRate: 0.3,
        cases: 4,
      },
      baseline: {
        traceMrr: 0.6,
        patternRecallAtK: 0.7,
        skillHitRate: 0.5,
        weakOutcomeLift: 0.75,
        successRate: 0.7,
        retryDelta: 1.2,
        timeToResolutionDelta: 180000,
        verificationCompletionRate: 0.8,
        cases: 4,
      },
      thresholds: {
        maxTraceMrrRegression: 0.1,
        maxPatternRecallAtKRegression: 0.1,
        maxWeakOutcomeLiftRegression: 0.1,
        maxSuccessRateRegression: 0.1,
        maxVerificationCompletionRateRegression: 0.1,
      },
    });

    expect(gate.passed).toBe(false);
    expect(gate.reasons).toContain("trace MRR regressed beyond tolerance");
    expect(gate.reasons).toContain("pattern recall regressed beyond tolerance");
  });
});
