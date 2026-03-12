function reciprocalRank(ids, expected) {
    if (expected.length === 0) {
        return 0;
    }
    for (let index = 0; index < ids.length; index += 1) {
        if (expected.includes(ids[index])) {
            return 1 / (index + 1);
        }
    }
    return 0;
}
function recallAtK(ids, expected) {
    if (expected.length === 0) {
        return 0;
    }
    const hits = expected.filter((id) => ids.includes(id)).length;
    return hits / expected.length;
}
function hitRate(ids, expected) {
    if (expected.length === 0) {
        return 0;
    }
    return expected.some((id) => ids.includes(id)) ? 1 : 0;
}
function weakOutcomeScore(fixture, prediction) {
    if (fixture.acceptedId) {
        return (prediction.acceptedTraceId === fixture.acceptedId ||
            prediction.acceptedPatternId === fixture.acceptedId ||
            prediction.acceptedSkillId === fixture.acceptedId)
            ? 1
            : 0;
    }
    if (prediction.finalOutcome !== "success") {
        return 0;
    }
    const matchedExpected = fixture.expectedPatternIds.some((id) => prediction.patterns.some((pattern) => pattern.id === id)) ||
        fixture.expectedSkillIds.some((id) => prediction.skills.some((skill) => skill.id === id));
    return matchedExpected ? 1 : 0;
}
function successScore(fixture, prediction) {
    const expectedOutcome = fixture.expectedOutcome ?? "success";
    return prediction.finalOutcome === expectedOutcome ? 1 : 0;
}
function retryDelta(fixture, prediction) {
    if (fixture.baseline?.medianRetries == null || typeof prediction.retryCount !== "number") {
        return 0;
    }
    return fixture.baseline.medianRetries - prediction.retryCount;
}
function timeToResolutionDelta(fixture, prediction) {
    if (fixture.baseline?.medianTimeToResolutionMs == null ||
        typeof prediction.timeToResolutionMs !== "number") {
        return 0;
    }
    return fixture.baseline.medianTimeToResolutionMs - prediction.timeToResolutionMs;
}
function verificationScore(fixture, prediction) {
    if (fixture.targetResolutionKind) {
        return prediction.verificationResults?.resolutionKind === fixture.targetResolutionKind ? 1 : 0;
    }
    return prediction.verificationResults?.verified ? 1 : 0;
}
export function evaluateRetrievalFixtures(params) {
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
    let retryDeltaTotal = 0;
    let timeToResolutionDeltaTotal = 0;
    let verificationCompletionRate = 0;
    for (let index = 0; index < cases; index += 1) {
        const fixture = params.fixtures[index];
        const prediction = params.predictions[index];
        traceMrr += reciprocalRank(prediction.traces.map((trace) => trace.id), fixture.expectedTraceIds);
        patternRecallAtK += recallAtK(prediction.patterns.map((pattern) => pattern.id), fixture.expectedPatternIds);
        skillHitRate += hitRate(prediction.skills.map((skill) => skill.id), fixture.expectedSkillIds);
        weakOutcomeLift += weakOutcomeScore(fixture, prediction);
        successRate += successScore(fixture, prediction);
        retryDeltaTotal += retryDelta(fixture, prediction);
        timeToResolutionDeltaTotal += timeToResolutionDelta(fixture, prediction);
        verificationCompletionRate += verificationScore(fixture, prediction);
    }
    return {
        traceMrr: traceMrr / cases,
        patternRecallAtK: patternRecallAtK / cases,
        skillHitRate: skillHitRate / cases,
        weakOutcomeLift: weakOutcomeLift / cases,
        successRate: successRate / cases,
        retryDelta: retryDeltaTotal / cases,
        timeToResolutionDelta: timeToResolutionDeltaTotal / cases,
        verificationCompletionRate: verificationCompletionRate / cases,
        cases,
    };
}
export function evaluateBenchmarkGate(params) {
    const thresholds = params.thresholds ?? {};
    const reasons = [];
    if (thresholds.minTraceMrr != null && params.current.traceMrr < thresholds.minTraceMrr) {
        reasons.push(`trace MRR ${params.current.traceMrr.toFixed(3)} below minimum ${thresholds.minTraceMrr.toFixed(3)}`);
    }
    if (thresholds.minPatternRecallAtK != null &&
        params.current.patternRecallAtK < thresholds.minPatternRecallAtK) {
        reasons.push(`pattern recall@k ${params.current.patternRecallAtK.toFixed(3)} below minimum ${thresholds.minPatternRecallAtK.toFixed(3)}`);
    }
    if (thresholds.minSkillHitRate != null && params.current.skillHitRate < thresholds.minSkillHitRate) {
        reasons.push(`skill hit-rate ${params.current.skillHitRate.toFixed(3)} below minimum ${thresholds.minSkillHitRate.toFixed(3)}`);
    }
    if (thresholds.minWeakOutcomeLift != null &&
        params.current.weakOutcomeLift < thresholds.minWeakOutcomeLift) {
        reasons.push(`outcome lift ${params.current.weakOutcomeLift.toFixed(3)} below minimum ${thresholds.minWeakOutcomeLift.toFixed(3)}`);
    }
    if (thresholds.minSuccessRate != null && params.current.successRate < thresholds.minSuccessRate) {
        reasons.push(`success rate ${params.current.successRate.toFixed(3)} below minimum ${thresholds.minSuccessRate.toFixed(3)}`);
    }
    if (thresholds.minVerificationCompletionRate != null &&
        params.current.verificationCompletionRate < thresholds.minVerificationCompletionRate) {
        reasons.push(`verification completion ${params.current.verificationCompletionRate.toFixed(3)} below minimum ${thresholds.minVerificationCompletionRate.toFixed(3)}`);
    }
    if (params.baseline) {
        if (thresholds.maxTraceMrrRegression != null &&
            params.current.traceMrr < params.baseline.traceMrr - thresholds.maxTraceMrrRegression) {
            reasons.push("trace MRR regressed beyond tolerance");
        }
        if (thresholds.maxPatternRecallAtKRegression != null &&
            params.current.patternRecallAtK <
                params.baseline.patternRecallAtK - thresholds.maxPatternRecallAtKRegression) {
            reasons.push("pattern recall regressed beyond tolerance");
        }
        if (thresholds.maxSkillHitRateRegression != null &&
            params.current.skillHitRate < params.baseline.skillHitRate - thresholds.maxSkillHitRateRegression) {
            reasons.push("skill hit-rate regressed beyond tolerance");
        }
        if (thresholds.maxWeakOutcomeLiftRegression != null &&
            params.current.weakOutcomeLift <
                params.baseline.weakOutcomeLift - thresholds.maxWeakOutcomeLiftRegression) {
            reasons.push("outcome lift regressed beyond tolerance");
        }
        if (thresholds.maxSuccessRateRegression != null &&
            params.current.successRate < params.baseline.successRate - thresholds.maxSuccessRateRegression) {
            reasons.push("success rate regressed beyond tolerance");
        }
        if (thresholds.maxVerificationCompletionRateRegression != null &&
            params.current.verificationCompletionRate <
                params.baseline.verificationCompletionRate - thresholds.maxVerificationCompletionRateRegression) {
            reasons.push("verification completion regressed beyond tolerance");
        }
        if (thresholds.maxRetryDeltaRegression != null &&
            params.current.retryDelta < params.baseline.retryDelta - thresholds.maxRetryDeltaRegression) {
            reasons.push("retry delta regressed beyond tolerance");
        }
        if (thresholds.maxTimeToResolutionDeltaRegressionMs != null &&
            params.current.timeToResolutionDelta <
                params.baseline.timeToResolutionDelta - thresholds.maxTimeToResolutionDeltaRegressionMs) {
            reasons.push("time-to-resolution delta regressed beyond tolerance");
        }
    }
    return {
        passed: reasons.length === 0,
        reasons,
    };
}
//# sourceMappingURL=harness.js.map