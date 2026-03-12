type ResolutionKind = "tests_passed" | "build_passed" | "lint_passed" | "manual_only" | "failed";
type BaselineSnapshot = {
    successRate: number;
    medianTimeToResolutionMs: number | null;
    medianRetries: number | null;
    verificationPassRate: number;
    sampleSize: number;
};
type Fixture = {
    applicationId?: string;
    sessionId?: string;
    endpoint?: string;
    problem?: string;
    technologies?: readonly string[];
    repoProfile?: Record<string, unknown>;
    expectedTraceIds: readonly string[];
    expectedPatternIds: readonly string[];
    expectedSkillIds: readonly string[];
    acceptedId?: string;
    expectedOutcome?: string;
    maxRetries?: number;
    targetResolutionKind?: ResolutionKind;
    baseline?: BaselineSnapshot;
};
type Prediction = {
    applicationId?: string;
    sessionId?: string;
    traces: Array<{
        id: string;
    }>;
    patterns: Array<{
        id: string;
    }>;
    skills: Array<{
        id: string;
    }>;
    finalOutcome?: string;
    acceptedTraceId?: string;
    acceptedPatternId?: string;
    acceptedSkillId?: string;
    retryCount?: number;
    timeToResolutionMs?: number;
    verificationResults?: {
        verified: boolean;
        resolutionKind?: ResolutionKind;
    };
};
export type BenchmarkResult = {
    traceMrr: number;
    patternRecallAtK: number;
    skillHitRate: number;
    weakOutcomeLift: number;
    successRate: number;
    retryDelta: number;
    timeToResolutionDelta: number;
    verificationCompletionRate: number;
    cases: number;
};
export type BenchmarkGateThresholds = {
    minTraceMrr?: number;
    minPatternRecallAtK?: number;
    minSkillHitRate?: number;
    minWeakOutcomeLift?: number;
    minSuccessRate?: number;
    minVerificationCompletionRate?: number;
    maxTraceMrrRegression?: number;
    maxPatternRecallAtKRegression?: number;
    maxSkillHitRateRegression?: number;
    maxWeakOutcomeLiftRegression?: number;
    maxSuccessRateRegression?: number;
    maxVerificationCompletionRateRegression?: number;
    maxRetryDeltaRegression?: number;
    maxTimeToResolutionDeltaRegressionMs?: number;
};
export type BenchmarkGate = {
    passed: boolean;
    reasons: string[];
};
export declare function evaluateBenchmark(params: {
    fixtures: readonly Fixture[];
    predictions: readonly Prediction[];
}): BenchmarkResult;
export declare function evaluateBenchmarkGate(params: {
    current: BenchmarkResult;
    baseline?: BenchmarkResult;
    thresholds?: BenchmarkGateThresholds;
}): BenchmarkGate;
export {};
//# sourceMappingURL=cognitive-benchmark.d.ts.map