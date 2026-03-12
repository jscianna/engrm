export type LearningTrace = {
    id: string;
    userId: string;
    type: string;
    problem: string;
    reasoning: string;
    solution: string | null;
    outcome: string;
    outcomeSource?: "heuristic" | "tool" | "explicit";
    outcomeConfidence?: number;
    context: {
        technologies?: string[];
        errorMessages?: string[];
    };
    automatedSignals?: Record<string, unknown>;
    sharedSignature: string | null;
    shareEligible: boolean;
    embedding?: number[] | null;
};
export type ClusteredTraceGroup = {
    key: string;
    scope: "local" | "global";
    userId: string | null;
    domain: string;
    traces: LearningTrace[];
    successRate: number;
    sharedSignature: string | null;
};
export type ExtractedPatternCandidate = {
    key: string;
    scope: "local" | "global";
    userId: string | null;
    domain: string;
    trigger: {
        keywords: string[];
        technologies?: string[];
        errorPatterns?: string[];
        problemTypes?: string[];
    };
    approach: string;
    steps: string[];
    pitfalls: string[];
    confidence: number;
    successCount: number;
    failCount: number;
    sourceTraceIds: string[];
    sourceTraceCount: number;
};
export type SkillDraft = {
    name: string;
    description: string;
    markdown: string;
};
export type PatternEvidenceSummary = {
    successCount: number;
    failCount: number;
    confidence: number;
    effectiveEvidence: number;
};
export type BaselineSnapshot = {
    successRate: number;
    medianTimeToResolutionMs: number | null;
    medianRetries: number | null;
    verificationPassRate: number;
    sampleSize: number;
};
export type ImpactObservation = {
    accepted: boolean;
    explicitNegative?: boolean;
    finalOutcome?: string | null;
    timeToResolutionMs?: number | null;
    retryCount?: number | null;
    verificationPassed?: boolean;
    baseline?: BaselineSnapshot | null;
};
export type EntityImpactSummary = {
    applications: number;
    acceptedApplications: number;
    successfulApplications: number;
    medianTimeToResolutionMs: number | null;
    medianRetries: number | null;
    verificationPassRate: number;
    impactScore: number;
    promotionReason: string;
};
export type PatternLifecycleStatus = "candidate" | "active_local" | "active_global" | "synthesized_local" | "synthesized_global" | "deprecated";
export type SkillLifecycleStatus = "draft" | "active" | "stale" | "deprecated";
type TraceEvidenceScore = {
    positive: number;
    negative: number;
    rationale: string;
};
export declare function normalizeForFingerprint(value: string): string;
export declare function extractProblemKeywords(problem: string, limit?: number): string[];
export declare function extractSharedProblemClasses(problem: string, limit?: number): string[];
export declare function coarsenSharedTechnologies(technologies?: string[]): string[];
export declare function buildSharedSignature(params: {
    type: string;
    problem: string;
    technologies?: string[];
    errorMessages?: string[];
}): string;
export declare function normalizeErrorPattern(errorMessage: string): string;
export declare function coarsenSharedErrorFamily(errorMessage: string): string;
export declare function cosineSimilarity(left: number[] | null | undefined, right: number[] | null | undefined): number;
export declare function clusterLearningTraces(params: {
    traces: LearningTrace[];
    scope: "local" | "global";
    similarityThreshold?: number;
}): ClusteredTraceGroup[];
export declare function extractPatternCandidate(cluster: ClusteredTraceGroup): ExtractedPatternCandidate | null;
export declare function buildSkillDraft(params: {
    patternId: string;
    domain: string;
    trigger: {
        keywords?: string[];
        technologies?: string[];
        errorPatterns?: string[];
    };
    approach: string;
    steps?: string[];
    pitfalls?: string[];
    confidence: number;
}): SkillDraft;
export declare function resolveOutcome(params: {
    explicitOutcome?: string | null;
    automatedOutcome?: string | null;
    heuristicOutcome?: string | null;
}): {
    outcome: string;
    source: "explicit" | "tool" | "heuristic";
    confidence: number;
};
export declare function summarizePatternEvidence(traces: LearningTrace[]): PatternEvidenceSummary;
export declare function classifyPatternStatus(params: {
    effectiveEvidence: number;
    confidence: number;
    scope?: "local" | "global";
    activationEvidence?: number;
    activationConfidence?: number;
    deprecationConfidence?: number;
}): PatternLifecycleStatus;
export declare function synthesizedPatternStatus(scope: "local" | "global"): PatternLifecycleStatus;
export declare function isInjectablePatternStatus(status: string): boolean;
export declare function isActivePatternStatus(status: string): boolean;
export declare function isSkillSynthesisEligible(params: {
    status: string;
    confidence: number;
    successCount: number;
    failCount: number;
    minConfidence?: number;
    minSuccesses?: number;
}): boolean;
export declare function deriveSkillStatus(params: {
    patternStatus: string;
    confidence: number;
    minConfidence?: number;
}): SkillLifecycleStatus;
export declare function isInjectableSkillStatus(status: string): boolean;
export declare function scoreTraceEvidence(trace: LearningTrace): TraceEvidenceScore;
export declare function summarizeEntityImpact(observations: ImpactObservation[]): EntityImpactSummary;
export declare function classifyPatternLifecycle(params: {
    scope: "local" | "global";
    effectiveEvidence: number;
    confidence: number;
    impact: EntityImpactSummary;
}): PatternLifecycleStatus;
export declare function deriveSkillLifecycle(params: {
    patternStatus: string;
    confidence: number;
    impact: EntityImpactSummary;
    minConfidence?: number;
}): SkillLifecycleStatus;
export {};
//# sourceMappingURL=cognitive-learning.d.ts.map