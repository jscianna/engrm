"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateBenchmark = evaluateBenchmark;
exports.evaluateBenchmarkGate = evaluateBenchmarkGate;
function reciprocalRank(ids, expected) {
    if (expected.length === 0)
        return 0;
    for (let index = 0; index < ids.length; index += 1) {
        if (expected.includes(ids[index]))
            return 1 / (index + 1);
    }
    return 0;
}
function recallAtK(ids, expected) {
    if (expected.length === 0)
        return 0;
    const hits = expected.filter((id) => ids.includes(id)).length;
    return hits / expected.length;
}
function hitRate(ids, expected) {
    if (expected.length === 0)
        return 0;
    return expected.some((id) => ids.includes(id)) ? 1 : 0;
}
function evaluateBenchmark(params) {
    const cases = Math.min(params.fixtures.length, params.predictions.length);
    if (cases === 0) {
        return {
            traceMrr: 0,
            patternRecallAtK: 0,
            skillHitRate: 0,
            weakOutcomeLift: 0,
            successRate: 0,
            retryDelta: 0,
            timeToResolutionDelta: 0,
            verificationCompletionRate: 0,
            cases: 0,
        };
    }
    let traceMrr = 0;
    let patternRecallAtK = 0;
    let skillHitRate = 0;
    let weakOutcomeLift = 0;
    let successRate = 0;
    let retryDelta = 0;
    let timeToResolutionDelta = 0;
    let verificationCompletionRate = 0;
    for (let index = 0; index < cases; index += 1) {
        const fixture = params.fixtures[index];
        const prediction = params.predictions[index];
        traceMrr += reciprocalRank(prediction.traces.map((trace) => trace.id), fixture.expectedTraceIds);
        patternRecallAtK += recallAtK(prediction.patterns.map((pattern) => pattern.id), fixture.expectedPatternIds);
        skillHitRate += hitRate(prediction.skills.map((skill) => skill.id), fixture.expectedSkillIds);
        weakOutcomeLift += fixture.acceptedId
            ? prediction.acceptedTraceId === fixture.acceptedId ||
                prediction.acceptedPatternId === fixture.acceptedId ||
                prediction.acceptedSkillId === fixture.acceptedId
                ? 1
                : 0
            : prediction.finalOutcome === "success"
                ? 1
                : 0;
        successRate += prediction.finalOutcome === (fixture.expectedOutcome ?? "success") ? 1 : 0;
        retryDelta += fixture.baseline?.medianRetries != null && prediction.retryCount != null
            ? fixture.baseline.medianRetries - prediction.retryCount
            : 0;
        timeToResolutionDelta +=
            fixture.baseline?.medianTimeToResolutionMs != null && prediction.timeToResolutionMs != null
                ? fixture.baseline.medianTimeToResolutionMs - prediction.timeToResolutionMs
                : 0;
        verificationCompletionRate += fixture.targetResolutionKind
            ? prediction.verificationResults?.resolutionKind === fixture.targetResolutionKind
                ? 1
                : 0
            : prediction.verificationResults?.verified
                ? 1
                : 0;
    }
    return {
        traceMrr: traceMrr / cases,
        patternRecallAtK: patternRecallAtK / cases,
        skillHitRate: skillHitRate / cases,
        weakOutcomeLift: weakOutcomeLift / cases,
        successRate: successRate / cases,
        retryDelta: retryDelta / cases,
        timeToResolutionDelta: timeToResolutionDelta / cases,
        verificationCompletionRate: verificationCompletionRate / cases,
        cases,
    };
}
function evaluateBenchmarkGate(params) {
    const thresholds = params.thresholds ?? {};
    const reasons = [];
    const current = params.current;
    if (thresholds.minTraceMrr != null && current.traceMrr < thresholds.minTraceMrr)
        reasons.push("trace_mrr_below_min");
    if (thresholds.minPatternRecallAtK != null && current.patternRecallAtK < thresholds.minPatternRecallAtK)
        reasons.push("pattern_recall_below_min");
    if (thresholds.minSkillHitRate != null && current.skillHitRate < thresholds.minSkillHitRate)
        reasons.push("skill_hit_rate_below_min");
    if (thresholds.minWeakOutcomeLift != null && current.weakOutcomeLift < thresholds.minWeakOutcomeLift)
        reasons.push("outcome_lift_below_min");
    if (thresholds.minSuccessRate != null && current.successRate < thresholds.minSuccessRate)
        reasons.push("success_rate_below_min");
    if (thresholds.minVerificationCompletionRate != null && current.verificationCompletionRate < thresholds.minVerificationCompletionRate)
        reasons.push("verification_rate_below_min");
    if (params.baseline) {
        const baseline = params.baseline;
        if (thresholds.maxTraceMrrRegression != null && current.traceMrr < baseline.traceMrr - thresholds.maxTraceMrrRegression)
            reasons.push("trace_mrr_regressed");
        if (thresholds.maxPatternRecallAtKRegression != null && current.patternRecallAtK < baseline.patternRecallAtK - thresholds.maxPatternRecallAtKRegression)
            reasons.push("pattern_recall_regressed");
        if (thresholds.maxSkillHitRateRegression != null && current.skillHitRate < baseline.skillHitRate - thresholds.maxSkillHitRateRegression)
            reasons.push("skill_hit_rate_regressed");
        if (thresholds.maxWeakOutcomeLiftRegression != null && current.weakOutcomeLift < baseline.weakOutcomeLift - thresholds.maxWeakOutcomeLiftRegression)
            reasons.push("outcome_lift_regressed");
        if (thresholds.maxSuccessRateRegression != null && current.successRate < baseline.successRate - thresholds.maxSuccessRateRegression)
            reasons.push("success_rate_regressed");
        if (thresholds.maxVerificationCompletionRateRegression != null && current.verificationCompletionRate < baseline.verificationCompletionRate - thresholds.maxVerificationCompletionRateRegression)
            reasons.push("verification_rate_regressed");
        if (thresholds.maxRetryDeltaRegression != null && current.retryDelta < baseline.retryDelta - thresholds.maxRetryDeltaRegression)
            reasons.push("retry_delta_regressed");
        if (thresholds.maxTimeToResolutionDeltaRegressionMs != null && current.timeToResolutionDelta < baseline.timeToResolutionDelta - thresholds.maxTimeToResolutionDeltaRegressionMs)
            reasons.push("time_delta_regressed");
    }
    return { passed: reasons.length === 0, reasons };
}
//# sourceMappingURL=cognitive-benchmark.js.map