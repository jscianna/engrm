import { describe, expect, it } from "vitest";
import {
  buildSharedSignature,
  classifyPatternLifecycle,
  coarsenSharedErrorFamily,
  coarsenSharedTechnologies,
  deriveSkillLifecycle,
  extractSharedProblemClasses,
  extractPatternCandidate,
  scoreTraceEvidence,
  summarizeEntityImpact,
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

  it("coarsens global trigger fields to avoid leaking rare identifiers", () => {
    const cluster: ClusteredTraceGroup = {
      key: "global:nextjs:auth",
      scope: "global",
      userId: null,
      domain: "nextjs",
      sharedSignature: null,
      successRate: 0,
      traces: [
        makeTrace({
          id: "global-1",
          userId: "user-a",
          problem: "AcmePayroll portal auth middleware blocks _next/static in production",
          context: {
            technologies: ["Next.js 15", "Clerk", "TypeScript"],
            errorMessages: ["Unauthorized session token rejected in AcmePayroll middleware"],
          },
        }),
        makeTrace({
          id: "global-2",
          userId: "user-b",
          problem: "AcmePayroll session routing breaks because middleware protects static assets",
          context: {
            technologies: ["nextjs", "clerk", "ts"],
            errorMessages: ["Forbidden auth session while fetching _next/static asset"],
          },
        }),
      ],
    };

    const candidate = extractPatternCandidate(cluster);

    expect(candidate).not.toBeNull();
    expect(candidate?.trigger.keywords).toEqual(expect.arrayContaining(["auth", "middleware", "session"]));
    expect(candidate?.trigger.keywords).not.toContain("acmepayroll");
    expect(candidate?.trigger.technologies).toEqual(expect.arrayContaining(["auth", "nextjs", "typescript"]));
    expect(candidate?.trigger.errorPatterns).toEqual(["auth"]);
  });
});

describe("shared fingerprint coarsening", () => {
  it("uses coarse shared classes instead of repo-specific identifiers", () => {
    expect(extractSharedProblemClasses("AcmePayroll portal auth middleware blocks _next/static in production"))
      .toEqual(expect.arrayContaining(["auth", "middleware"]));
    expect(coarsenSharedTechnologies(["Next.js 15", "Clerk", "packages/acmepayroll-ui"]))
      .toEqual(expect.arrayContaining(["auth", "nextjs"]));
    expect(coarsenSharedErrorFamily("Unauthorized session token rejected in AcmePayroll middleware")).toBe("auth");

    const left = buildSharedSignature({
      type: "debugging",
      problem: "AcmePayroll portal auth middleware blocks _next/static in production",
      technologies: ["Next.js 15", "Clerk", "packages/acmepayroll-ui"],
      errorMessages: ["Unauthorized session token rejected in AcmePayroll middleware"],
    });
    const right = buildSharedSignature({
      type: "debugging",
      problem: "Contoso portal auth middleware blocks static assets in production",
      technologies: ["nextjs", "auth0"],
      errorMessages: ["Unauthorized session token rejected during middleware auth"],
    });

    expect(left).toBe(right);
  });
});

describe("summarizeEntityImpact", () => {
  it("rewards accepted verified successes that beat baseline", () => {
    const impact = summarizeEntityImpact([
      {
        accepted: true,
        finalOutcome: "success",
        retryCount: 1,
        timeToResolutionMs: 180000,
        verificationPassed: true,
        baseline: {
          successRate: 0.5,
          medianTimeToResolutionMs: 420000,
          medianRetries: 4,
          verificationPassRate: 0.4,
          sampleSize: 10,
        },
      },
      {
        accepted: true,
        finalOutcome: "success",
        retryCount: 2,
        timeToResolutionMs: 240000,
        verificationPassed: true,
        baseline: {
          successRate: 0.5,
          medianTimeToResolutionMs: 420000,
          medianRetries: 4,
          verificationPassRate: 0.4,
          sampleSize: 10,
        },
      },
    ]);

    expect(impact.acceptedApplications).toBe(2);
    expect(impact.successfulApplications).toBe(2);
    expect(impact.verificationPassRate).toBe(1);
    expect(impact.impactScore).toBeGreaterThan(0.5);
    expect(impact.promotionReason).toBe("verified_outcomes_above_baseline");
  });
});

describe("impact-driven lifecycle", () => {
  it("keeps patterns as candidates until both evidence and impact thresholds are met", () => {
    const status = classifyPatternLifecycle({
      scope: "local",
      effectiveEvidence: 4,
      confidence: 0.85,
      impact: {
        applications: 1,
        acceptedApplications: 1,
        successfulApplications: 1,
        medianTimeToResolutionMs: 180000,
        medianRetries: 1,
        verificationPassRate: 1,
        impactScore: 0.7,
        promotionReason: "not_enough_apps",
      },
    });

    expect(status).toBe("candidate");
  });

  it("activates skills only after accepted, verified impact clears threshold", () => {
    const status = deriveSkillLifecycle({
      patternStatus: "active_local",
      confidence: 0.91,
      impact: {
        applications: 4,
        acceptedApplications: 3,
        successfulApplications: 3,
        medianTimeToResolutionMs: 210000,
        medianRetries: 1,
        verificationPassRate: 0.8,
        impactScore: 0.35,
        promotionReason: "verified_outcomes_above_baseline",
      },
    });

    expect(status).toBe("active");
  });
});
