import { describe, expect, it } from "vitest";
import {
  extractPatternCandidate,
  scoreTraceEvidence,
  summarizePatternEvidence,
  type ClusteredTraceGroup,
  type LearningTrace,
} from "../../../src/lib/cognitive-learning";

function makeTrace(overrides: Partial<LearningTrace> = {}): LearningTrace {
  return {
    id: overrides.id ?? "trace-1",
    userId: overrides.userId ?? "user-1",
    type: overrides.type ?? "debugging",
    problem: overrides.problem ?? "Tests fail in Next.js build",
    reasoning: overrides.reasoning ?? "Investigated the failing path and updated the config.",
    solution: overrides.solution ?? "Run the tests again after fixing the config.",
    outcome: overrides.outcome ?? "success",
    outcomeSource: overrides.outcomeSource ?? "heuristic",
    outcomeConfidence: overrides.outcomeConfidence ?? 0.55,
    context: overrides.context ?? {
      technologies: ["nextjs", "typescript"],
      errorMessages: ["TypeError: Cannot read properties of undefined"],
    },
    automatedSignals: overrides.automatedSignals ?? {},
    sharedSignature: overrides.sharedSignature ?? "sig-1",
    shareEligible: overrides.shareEligible ?? true,
    embedding: overrides.embedding ?? [1, 0, 0],
  };
}

describe("scoreTraceEvidence", () => {
  it("prioritizes passed tests over a heuristic partial outcome", () => {
    const trace = makeTrace({
      outcome: "partial",
      outcomeSource: "tool",
      outcomeConfidence: 0.9,
      automatedSignals: {
        testSignals: { passed: 1, failed: 0 },
        commandsSucceeded: 1,
        strongestSuccess: "Tests passed",
      },
    });

    const score = scoreTraceEvidence(trace);

    expect(score.rationale).toBe("tests_passed");
    expect(score.positive).toBe(1);
    expect(score.negative).toBeLessThan(score.positive);
  });

  it("treats tool-backed failures as stronger than a heuristic success", () => {
    const trace = makeTrace({
      outcome: "success",
      outcomeSource: "heuristic",
      automatedSignals: {
        buildSignals: { passed: 0, failed: 1 },
        commandsFailed: 1,
        strongestFailure: "Build failed",
        hadToolErrors: true,
      },
    });

    const score = scoreTraceEvidence(trace);

    expect(score.rationale).toBe("build_failed");
    expect(score.negative).toBeGreaterThan(score.positive);
    expect(score.negative).toBeGreaterThanOrEqual(0.97);
  });
});

describe("summarizePatternEvidence", () => {
  it("uses weighted evidence rather than flat success/fail counts", () => {
    const traces = [
      makeTrace({
        id: "trace-pass",
        outcome: "partial",
        outcomeSource: "tool",
        outcomeConfidence: 0.9,
        automatedSignals: {
          testSignals: { passed: 1, failed: 0 },
          commandsSucceeded: 1,
          strongestSuccess: "Tests passed",
        },
      }),
      makeTrace({
        id: "trace-heuristic",
        automatedSignals: {},
      }),
      makeTrace({
        id: "trace-fail",
        outcome: "failed",
        outcomeSource: "tool",
        outcomeConfidence: 0.9,
        automatedSignals: {
          buildSignals: { passed: 0, failed: 1 },
          commandsFailed: 1,
          strongestFailure: "Build failed",
          hadToolErrors: true,
        },
      }),
    ];

    const summary = summarizePatternEvidence(traces);

    expect(summary.successCount).toBe(2);
    expect(summary.failCount).toBe(1);
    expect(summary.effectiveEvidence).toBeGreaterThan(2.5);
    expect(summary.confidence).toBeGreaterThan(0.5);
    expect(summary.confidence).toBeLessThan(0.7);
  });
});

describe("extractPatternCandidate", () => {
  it("bases candidate confidence and pitfalls on weighted evidence", () => {
    const cluster: ClusteredTraceGroup = {
      key: "local:user-1:nextjs:sig-1",
      scope: "local",
      userId: "user-1",
      domain: "nextjs",
      sharedSignature: "sig-1",
      successRate: 0,
      traces: [
        makeTrace({
          id: "success-trace",
          outcome: "partial",
          outcomeSource: "tool",
          outcomeConfidence: 0.9,
          automatedSignals: {
            testSignals: { passed: 1, failed: 0 },
            commandsSucceeded: 1,
            strongestSuccess: "Tests passed",
          },
        }),
        makeTrace({
          id: "failed-trace",
          outcome: "failed",
          solution: null,
          automatedSignals: {
            buildSignals: { passed: 0, failed: 1 },
            commandsFailed: 1,
            strongestFailure: "Build failed",
            hadToolErrors: true,
          },
          context: {
            technologies: ["nextjs", "typescript"],
            errorMessages: ["Build failed because env vars were missing"],
          },
        }),
      ],
    };

    const candidate = extractPatternCandidate(cluster);

    expect(candidate).not.toBeNull();
    expect(candidate?.confidence).toBeGreaterThan(0.35);
    expect(candidate?.confidence).toBeLessThan(0.5);
    expect(candidate?.sourceTraceCount).toBe(2);
    expect(candidate?.pitfalls).toContain("Build failed because env vars were missing");
  });
});
