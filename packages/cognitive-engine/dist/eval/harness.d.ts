import type { BenchmarkGateResult, BenchmarkGateThresholds, RetrievalEvalFixture, RetrievalEvalPrediction, RetrievalEvalResult } from "../types.js";
export declare function evaluateRetrievalFixtures(params: {
    fixtures: RetrievalEvalFixture[];
    predictions: RetrievalEvalPrediction[];
}): RetrievalEvalResult;
export declare function evaluateBenchmarkGate(params: {
    current: RetrievalEvalResult;
    baseline?: RetrievalEvalResult;
    thresholds?: BenchmarkGateThresholds;
}): BenchmarkGateResult;
//# sourceMappingURL=harness.d.ts.map