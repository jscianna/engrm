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
export function evaluateRetrievalFixtures(params) {
    const cases = Math.min(params.fixtures.length, params.predictions.length);
    if (cases === 0) {
        return {
            traceMrr: 0,
            patternRecallAtK: 0,
            skillHitRate: 0,
            weakOutcomeLift: 0,
            cases: 0,
        };
    }
    let traceMrr = 0;
    let patternRecallAtK = 0;
    let skillHitRate = 0;
    let weakOutcomeLift = 0;
    for (let index = 0; index < cases; index += 1) {
        const fixture = params.fixtures[index];
        const prediction = params.predictions[index];
        traceMrr += reciprocalRank(prediction.traces.map((trace) => trace.id), fixture.expectedTraceIds);
        patternRecallAtK += recallAtK(prediction.patterns.map((pattern) => pattern.id), fixture.expectedPatternIds);
        skillHitRate += hitRate(prediction.skills.map((skill) => skill.id), fixture.expectedSkillIds);
        weakOutcomeLift += weakOutcomeScore(fixture, prediction);
    }
    return {
        traceMrr: traceMrr / cases,
        patternRecallAtK: patternRecallAtK / cases,
        skillHitRate: skillHitRate / cases,
        weakOutcomeLift: weakOutcomeLift / cases,
        cases,
    };
}
//# sourceMappingURL=harness.js.map