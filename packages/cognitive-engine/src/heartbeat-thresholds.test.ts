import { describe, expect, it } from "vitest";
import {
  classifyPatternStatus,
  isSkillSynthesisEligible,
  summarizePatternEvidence,
  type LearningTrace,
} from "../../../src/lib/cognitive-learning";

function makeTrace(overrides: Partial<LearningTrace> = {}): LearningTrace {
  return {
    id: overrides.id ?? "trace-1",
    userId: overrides.userId ?? "user-1",
    type: overrides.type ?? "debugging",
    problem: overrides.problem ?? "Recurring Next.js test failure",
    reasoning: overrides.reasoning ?? "Inspected the config and re-ran the tests.",
    solution: overrides.solution ?? "Adjust the config and rerun the tests.",
    outcome: overrides.outcome ?? "success",
    outcomeSource: overrides.outcomeSource ?? "tool",
    outcomeConfidence: overrides.outcomeConfidence ?? 0.9,
    context: overrides.context ?? {
      technologies: ["nextjs", "typescript"],
      errorMessages: ["Tests failed due to invalid config"],
    },
    automatedSignals: overrides.automatedSignals ?? {
      testSignals: { passed: 1, failed: 0 },
      commandsSucceeded: 1,
      strongestSuccess: "Tests passed",
    },
    sharedSignature: overrides.sharedSignature ?? "sig-heartbeat",
    shareEligible: overrides.shareEligible ?? true,
    embedding: overrides.embedding ?? [1, 0, 0],
  };
}

describe("heartbeat promotion thresholds", () => {
  it("promotes patterns to active once evidence and confidence clear the activation bar", () => {
    const traces = [
      makeTrace({ id: "trace-1" }),
      makeTrace({ id: "trace-2", embedding: [0.99, 0.01, 0] }),
      makeTrace({ id: "trace-3", embedding: [0.98, 0.02, 0] }),
    ];

    const summary = summarizePatternEvidence(traces);
    const status = classifyPatternStatus({
      effectiveEvidence: summary.effectiveEvidence,
      confidence: summary.confidence,
      scope: "local",
      activationEvidence: 3,
      activationConfidence: 0.7,
    });

    expect(summary.effectiveEvidence).toBeGreaterThanOrEqual(3);
    expect(summary.confidence).toBeGreaterThanOrEqual(0.7);
    expect(status).toBe("active_local");
  });

  it("deprecates patterns when the same evidence volume is strongly negative", () => {
    const traces = [
      makeTrace({
        id: "fail-1",
        outcome: "failed",
        automatedSignals: {
          buildSignals: { passed: 0, failed: 1 },
          commandsFailed: 1,
          strongestFailure: "Build failed",
          hadToolErrors: true,
        },
      }),
      makeTrace({
        id: "fail-2",
        outcome: "failed",
        automatedSignals: {
          testSignals: { passed: 0, failed: 1 },
          commandsFailed: 1,
          strongestFailure: "Tests failed",
          hadToolErrors: true,
        },
      }),
      makeTrace({
        id: "fail-3",
        outcome: "failed",
        automatedSignals: {
          lintSignals: { passed: 0, failed: 1 },
          commandsFailed: 1,
          strongestFailure: "Lint failed",
          hadToolErrors: true,
        },
      }),
    ];

    const summary = summarizePatternEvidence(traces);
    const status = classifyPatternStatus({
      effectiveEvidence: summary.effectiveEvidence,
      confidence: summary.confidence,
      scope: "global",
    });

    expect(summary.effectiveEvidence).toBeGreaterThanOrEqual(2.5);
    expect(summary.confidence).toBeLessThan(0.4);
    expect(status).toBe("deprecated");
  });

  it("keeps low-volume patterns as candidates even when confidence is high", () => {
    const traces = [
      makeTrace({ id: "trace-1" }),
      makeTrace({ id: "trace-2", embedding: [0.99, 0.01, 0] }),
    ];

    const summary = summarizePatternEvidence(traces);
    const status = classifyPatternStatus({
      effectiveEvidence: summary.effectiveEvidence,
      confidence: summary.confidence,
      scope: "local",
      activationEvidence: 3,
      activationConfidence: 0.7,
    });

    expect(summary.confidence).toBeGreaterThanOrEqual(0.7);
    expect(summary.effectiveEvidence).toBeLessThan(3);
    expect(status).toBe("candidate");
  });
});

describe("heartbeat skill synthesis thresholds", () => {
  it("requires active or synthesized status, high confidence, and at least five successes", () => {
    expect(
      isSkillSynthesisEligible({
        status: "active",
        confidence: 0.84,
        successCount: 5,
        failCount: 1,
      }),
    ).toBe(false);

    expect(
      isSkillSynthesisEligible({
        status: "active_local",
        confidence: 0.84,
        successCount: 5,
        failCount: 1,
      }),
    ).toBe(true);

    expect(
      isSkillSynthesisEligible({
        status: "synthesized_global",
        confidence: 0.84,
        successCount: 5,
        failCount: 2,
      }),
    ).toBe(true);
  });

  it("does not allow four successes plus one failure to synthesize a skill", () => {
    expect(
      isSkillSynthesisEligible({
        status: "active_local",
        confidence: 0.84,
        successCount: 4,
        failCount: 1,
      }),
    ).toBe(false);
  });

  it("rejects patterns that are not yet active or do not have enough signal", () => {
    expect(
      isSkillSynthesisEligible({
        status: "candidate",
        confidence: 0.91,
        successCount: 5,
        failCount: 0,
      }),
    ).toBe(false);

    expect(
      isSkillSynthesisEligible({
        status: "active_local",
        confidence: 0.79,
        successCount: 5,
        failCount: 0,
      }),
    ).toBe(false);

    expect(
      isSkillSynthesisEligible({
        status: "active_global",
        confidence: 0.88,
        successCount: 4,
        failCount: 1,
      }),
    ).toBe(false);
  });
});
