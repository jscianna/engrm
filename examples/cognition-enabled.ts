import {
  CognitiveClient,
  CognitiveEngine,
  evaluateBenchmarkGate,
  evaluateRetrievalFixtures,
  type CognitiveEngineConfig,
  type RetrievalEvalFixture,
  type RetrievalEvalPrediction,
} from "@fathippo/cognition";

const cognitionConfig: CognitiveEngineConfig = {
  apiKey: process.env.FATHIPPO_API_KEY ?? "demo-api-key",
  baseUrl: process.env.FATHIPPO_API_BASE_URL ?? "https://fathippo.ai/api/v1",
  captureEnabled: true,
  sanitizeSecrets: true,
  minTraceDurationMs: 60_000,
  patternExtractionEnabled: true,
  minTracesForPattern: 3,
  minSuccessRateForPattern: 0.7,
  skillSynthesisEnabled: true,
  minPatternsForSkill: 5,
  minSuccessRateForSkill: 0.8,
  autoPublishToClawHub: false,
  injectRelevantTraces: true,
  injectPatterns: true,
  maxInjectedTraces: 5,
  maxInjectedPatterns: 3,
};

export async function cognitionEnabledQuickstart() {
  const client = new CognitiveClient(cognitionConfig);
  const engine = new CognitiveEngine(cognitionConfig);

  const fixtures: RetrievalEvalFixture[] = [
    {
      problem: "Next.js auth middleware causes a redirect loop on callback routes",
      technologies: ["nextjs", "clerk"],
      expectedTraceIds: ["trace_auth_callback"],
      expectedPatternIds: ["pattern_auth_callback"],
      expectedSkillIds: [],
      acceptedId: "pattern_auth_callback",
      expectedOutcome: "success",
      targetResolutionKind: "tests_passed",
    },
  ];
  const predictions: RetrievalEvalPrediction[] = [
    {
      traces: [{ id: "trace_auth_callback" }],
      patterns: [{ id: "pattern_auth_callback" }],
      skills: [],
      acceptedPatternId: "pattern_auth_callback",
      finalOutcome: "success",
      retryCount: 1,
      timeToResolutionMs: 90_000,
      verificationResults: {
        verified: true,
        resolutionKind: "tests_passed",
        passedChecks: ["npm test"],
        failedChecks: [],
      },
    },
  ];

  const benchmark = evaluateRetrievalFixtures({ fixtures, predictions });
  const gate = evaluateBenchmarkGate({
    current: benchmark,
    thresholds: {
      minTraceMrr: 0.8,
      minPatternRecallAtK: 0.8,
      minSuccessRate: 0.8,
    },
  });

  return {
    client,
    engine,
    benchmark,
    gate,
  };
}
