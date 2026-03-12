import { type BaselineSnapshot } from "@/lib/cognitive-learning";
export interface CodingTrace {
    id: string;
    userId: string;
    sessionId: string;
    timestamp: string;
    type: string;
    problem: string;
    contextJson: string;
    reasoning: string;
    approachesJson: string;
    solution: string | null;
    outcome: string;
    outcomeSource: "heuristic" | "tool" | "explicit";
    outcomeConfidence: number;
    automatedSignalsJson: string;
    errorMessage: string | null;
    toolsUsedJson: string;
    filesModifiedJson: string;
    durationMs: number;
    sanitized: boolean;
    sanitizedAt: string | null;
    shareEligible: boolean;
    sharedSignature: string | null;
    traceHash: string;
    embeddingJson: string | null;
    explicitFeedbackNotes: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface CognitiveApplication {
    id: string;
    userId: string;
    sessionId: string;
    traceId: string | null;
    problem: string;
    endpoint: string;
    repoProfileJson: string | null;
    materializedPatternId: string | null;
    materializedSkillId: string | null;
    retryCount: number | null;
    baselineGroupKey: string | null;
    baselineSnapshotJson: string | null;
    acceptedTraceId: string | null;
    acceptedPatternId: string | null;
    acceptedSkillId: string | null;
    finalOutcome: string | null;
    timeToResolutionMs: number | null;
    verificationSummaryJson: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface ApplicationMatch {
    id: string;
    applicationId: string;
    userId: string;
    sessionId: string;
    traceId: string | null;
    entityType: "trace" | "pattern" | "skill";
    entityId: string;
    entityScope: "local" | "global";
    rank: number;
    accepted: boolean;
    finalOutcome: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface Pattern {
    id: string;
    userId: string | null;
    scope: "local" | "global";
    patternKey: string;
    sharedSignature: string | null;
    domain: string;
    triggerJson: string;
    approach: string;
    stepsJson: string | null;
    pitfallsJson: string | null;
    confidence: number;
    successCount: number;
    failCount: number;
    sourceTraceCount: number;
    lastApplied: string | null;
    sourceTraceIdsJson: string;
    applicationCount: number;
    acceptedApplicationCount: number;
    successfulApplicationCount: number;
    medianTimeToResolutionMs: number | null;
    medianRetries: number | null;
    verificationPassRate: number;
    impactScore: number;
    promotionReason: string | null;
    status: string;
    synthesizedIntoSkill: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface TracePatternMatch {
    id: string;
    userId: string;
    traceId: string;
    patternId: string;
    score: number;
    matchSource: string;
    explicitOutcome?: "success" | "failure" | null;
    feedbackNotes?: string | null;
    createdAt: string;
}
export interface SynthesizedSkill {
    id: string;
    userId: string | null;
    scope: "local" | "global";
    patternId: string;
    patternKey: string;
    name: string;
    description: string;
    markdown: string;
    contentJson: string;
    qualityScore: number;
    usageCount: number;
    successRate: number;
    acceptedApplicationCount: number;
    successfulApplicationCount: number;
    medianTimeToResolutionMs: number | null;
    medianRetries: number | null;
    verificationPassRate: number;
    impactScore: number;
    promotionReason: string | null;
    status: string;
    published: boolean;
    publishedTo: string | null;
    clawHubId: string | null;
    sourceTraceCount: number;
    sourcePatternIdsJson: string;
    sourceTraceIdsJson: string;
    createdAt: string;
    updatedAt: string;
}
export interface CognitiveJobLease {
    jobName: string;
    leaseToken: string;
    leaseExpiresAt: string;
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    checkpointJson?: string | null;
}
export interface CreateTraceInput {
    userId: string;
    sessionId: string;
    type: string;
    problem: string;
    context: Record<string, unknown>;
    reasoning: string;
    approaches: Array<Record<string, unknown>>;
    solution?: string;
    outcome?: string;
    heuristicOutcome?: string;
    automatedOutcome?: string | null;
    automatedSignals?: Record<string, unknown>;
    errorMessage?: string;
    toolsUsed: string[];
    filesModified: string[];
    durationMs: number;
    sanitized: boolean;
    sanitizedAt?: string;
    shareEligible?: boolean;
    explicitFeedbackNotes?: string | null;
    applicationId?: string | null;
}
export interface CreatePatternInput {
    userId?: string | null;
    scope?: "local" | "global";
    patternKey?: string;
    sharedSignature?: string | null;
    domain: string;
    trigger: Record<string, unknown>;
    approach: string;
    steps?: string[];
    pitfalls?: string[];
    confidence: number;
    successCount: number;
    failCount: number;
    sourceTraceIds: string[];
    sourceTraceCount?: number;
    status?: string;
}
export interface ApplicationEntityInput {
    id: string;
    scope: "local" | "global";
    rank: number;
}
export interface RetrievalEvalDatasetRecord {
    applicationId: string;
    sessionId: string;
    endpoint: string;
    labelSource: "explicit" | "weak";
    fixture: {
        applicationId: string;
        sessionId: string;
        endpoint: string;
        problem: string;
        technologies: string[];
        repoProfile?: Record<string, unknown>;
        expectedTraceIds: string[];
        expectedPatternIds: string[];
        expectedSkillIds: string[];
        acceptedId?: string;
        expectedOutcome?: "success" | "partial" | "failed" | "abandoned";
        maxRetries?: number;
        targetResolutionKind?: "tests_passed" | "build_passed" | "lint_passed" | "manual_only" | "failed";
        baseline?: BaselineSnapshot;
    };
    prediction: {
        applicationId: string;
        sessionId: string;
        traces: Array<{
            id: string;
        }>;
        patterns: Array<{
            id: string;
        }>;
        skills: Array<{
            id: string;
        }>;
        finalOutcome?: "success" | "partial" | "failed" | "abandoned";
        acceptedTraceId?: string;
        acceptedPatternId?: string;
        acceptedSkillId?: string;
        retryCount?: number;
        timeToResolutionMs?: number;
        verificationResults?: {
            verified: boolean;
            resolutionKind?: "tests_passed" | "build_passed" | "lint_passed" | "manual_only" | "failed";
            passedChecks?: string[];
            failedChecks?: string[];
        };
    };
}
export interface RetrievalEvalDataset {
    fixtures: RetrievalEvalDatasetRecord["fixture"][];
    predictions: RetrievalEvalDatasetRecord["prediction"][];
    records: RetrievalEvalDatasetRecord[];
}
export interface CognitiveUserSettings {
    userId: string;
    sharedLearningEnabled: boolean;
    benchmarkInclusionEnabled: boolean;
    traceRetentionDays: number;
    updatedAt: string;
}
export interface CognitivePrivacyExport {
    exportedAt: string;
    settings: CognitiveUserSettings;
    traces: CodingTrace[];
    applications: Array<{
        application: CognitiveApplication;
        matches: ApplicationMatch[];
    }>;
    patterns: Pattern[];
    skills: SynthesizedSkill[];
    benchmarkRuns: Array<{
        id: string;
        dataset: string;
        fixtureCount: number;
        result: Record<string, unknown>;
        gate: Record<string, unknown> | null;
        createdAt: string;
    }>;
}
export interface CognitiveDataDeletionResult {
    deletedAt: string;
    tracesDeleted: number;
    applicationsDeleted: number;
    patternMatchesDeleted: number;
    applicationMatchesDeleted: number;
    localPatternsDeleted: number;
    localSkillsDeleted: number;
    benchmarkRunsDeleted: number;
    settingsDeleted: number;
    sharedLearningRevoked: boolean;
    globalPatternsRefreshed: number;
    globalSkillsRefreshed: number;
}
export interface CognitiveRetentionCleanupResult {
    cleanedAt: string;
    usersProcessed: number;
    tracesDeleted: number;
    applicationsDeleted: number;
    patternMatchesDeleted: number;
    applicationMatchesDeleted: number;
    benchmarkRunsDeleted: number;
    localPatternsDeleted: number;
    localSkillsDeleted: number;
    globalPatternsRefreshed: number;
    globalSkillsRefreshed: number;
}
export declare function getCognitiveUserSettings(userId: string): Promise<CognitiveUserSettings>;
export declare function updateCognitiveUserSettings(params: {
    userId: string;
    sharedLearningEnabled?: boolean;
    benchmarkInclusionEnabled?: boolean;
    traceRetentionDays?: number;
}): Promise<CognitiveUserSettings>;
export declare function revokeSharedLearningForUser(userId: string): Promise<{
    tracesUpdated: number;
    globalMatchesDeleted: number;
    globalPatternsRefreshed: number;
    globalSkillsRefreshed: number;
}>;
export declare function exportCognitiveUserData(userId: string): Promise<CognitivePrivacyExport>;
export declare function deleteCognitiveUserData(userId: string): Promise<CognitiveDataDeletionResult>;
export declare function cleanupExpiredCognitiveData(params?: {
    userId?: string;
    benchmarkRetentionDays?: number;
}): Promise<CognitiveRetentionCleanupResult>;
export declare function logCognitiveApplication(params: {
    userId: string;
    sessionId: string;
    problem: string;
    endpoint: string;
    repoProfile?: Record<string, unknown> | null;
    traces: ApplicationEntityInput[];
    patterns: ApplicationEntityInput[];
    skills: ApplicationEntityInput[];
}): Promise<{
    application: CognitiveApplication;
    matches: ApplicationMatch[];
}>;
export declare function createTrace(input: CreateTraceInput): Promise<CodingTrace>;
export declare function getTraceById(traceId: string, userId?: string): Promise<CodingTrace | null>;
export declare function getRecentTraces(userId: string, limit?: number): Promise<CodingTrace[]>;
export declare function getRelevantTraces(userId: string, problem: string, limit?: number): Promise<CodingTrace[]>;
export declare function updateTraceOutcome(params: {
    userId: string;
    traceId: string;
    outcome: "success" | "partial" | "failed" | "abandoned";
    notes?: string | null;
    automatedSignals?: Record<string, unknown> | null;
    applicationId?: string | null;
    repoProfile?: Record<string, unknown> | null;
    materializedPatternId?: string | null;
    materializedSkillId?: string | null;
    retryCount?: number | null;
    baselineGroupKey?: string | null;
    acceptedTraceId?: string | null;
    acceptedPatternId?: string | null;
    acceptedSkillId?: string | null;
    timeToResolutionMs?: number | null;
    verificationSummary?: Record<string, unknown> | null;
}): Promise<CodingTrace | null>;
export declare function createPattern(input: CreatePatternInput): Promise<Pattern>;
export declare function getPatterns(userId: string, domain?: string): Promise<Pattern[]>;
export declare function getMatchingPatterns(params: {
    userId: string;
    problem: string;
    technologies?: string[];
    limit?: number;
}): Promise<Array<Pattern & {
    score: number;
}>>;
export declare function getRelevantSkills(params: {
    userId: string;
    problem: string;
    technologies?: string[];
    limit?: number;
}): Promise<SynthesizedSkill[]>;
export declare function updatePatternFeedback(params: {
    userId: string;
    patternId: string;
    traceId: string;
    outcome: "success" | "failure";
    notes?: string | null;
}): Promise<boolean>;
export declare function getSkillCandidates(userId: string): Promise<Pattern[]>;
export declare function getTracePatternMatches(traceId: string, userId?: string): Promise<TracePatternMatch[]>;
export declare function syncTracePatternMatches(params: {
    userId: string;
    traceId: string;
    patterns: Array<{
        id: string;
        score: number;
    }>;
    matchSource?: string;
}): Promise<void>;
export declare function recomputePatternStats(patternIds: string[]): Promise<void>;
export declare function runPatternExtraction(params: {
    userId: string;
    includeGlobal?: boolean;
    minTraces?: number;
    minSuccessRate?: number;
}): Promise<{
    localPatterns: number;
    globalPatterns: number;
    touchedPatternIds: string[];
}>;
export declare function synthesizeEligibleSkills(params: {
    userId: string;
}): Promise<SynthesizedSkill[]>;
export declare function recomputeSkillStats(skillIds: string[]): Promise<void>;
export declare function updateApplicationOutcome(params: {
    userId: string;
    applicationId: string;
    traceId?: string | null;
    finalOutcome?: string | null;
    repoProfile?: Record<string, unknown> | null;
    materializedPatternId?: string | null;
    materializedSkillId?: string | null;
    retryCount?: number | null;
    baselineGroupKey?: string | null;
    acceptedTraceId?: string | null;
    acceptedPatternId?: string | null;
    acceptedSkillId?: string | null;
    timeToResolutionMs?: number | null;
    verificationSummary?: Record<string, unknown> | null;
}): Promise<CognitiveApplication | null>;
export declare function publishSkill(params: {
    userId: string;
    skillId: string;
    allowGlobal: boolean;
    publishedTo?: string;
}): Promise<SynthesizedSkill | null>;
export declare function setSkillPublicationDisabled(params: {
    userId: string;
    skillId: string;
}): Promise<void>;
export declare function setPatternStatus(params: {
    userId: string;
    patternId: string;
    status: string;
}): Promise<boolean>;
export declare function refreshSkillDraftById(params: {
    userId: string;
    skillId: string;
}): Promise<SynthesizedSkill | null>;
export declare function getSkills(userId: string): Promise<SynthesizedSkill[]>;
export declare function getSkillById(userId: string, skillId: string): Promise<SynthesizedSkill | null>;
export declare function getRecentApplications(userId: string, limit?: number): Promise<Array<{
    application: CognitiveApplication;
    matches: ApplicationMatch[];
}>>;
export declare function generateRetrievalEvalDataset(params: {
    userId: string;
    limit?: number;
    acceptedOnly?: boolean;
}): Promise<RetrievalEvalDataset>;
export declare function recordBenchmarkRun(params: {
    userId: string;
    dataset: string;
    fixtureCount: number;
    result: Record<string, unknown>;
    gate?: Record<string, unknown> | null;
}): Promise<void>;
export declare function getRecentBenchmarkRuns(userId: string, limit?: number): Promise<Array<{
    id: string;
    dataset: string;
    fixtureCount: number;
    result: Record<string, unknown>;
    gate: Record<string, unknown> | null;
    createdAt: string;
}>>;
export declare function getFailedBenchmarkRunsSince(since: string, limit?: number): Promise<Array<{
    id: string;
    userId: string;
    dataset: string;
    fixtureCount: number;
    gate: Record<string, unknown> | null;
    createdAt: string;
}>>;
export declare function getCognitiveJobHealth(): Promise<Array<{
    jobName: string;
    leaseExpiresAt: string | null;
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    checkpointJson: string | null;
}>>;
export declare function getCognitiveMetrics(userId: string, days?: number): Promise<{
    tracesCaptured: number;
    patternsCreated: number;
    patternsDeprecated: number;
    skillsCreated: number;
    staleSkills: number;
    sharedTraceOptInRate: number;
}>;
export declare function tryAcquireJobLease(params: {
    jobName: string;
    intervalMs: number;
    leaseMs: number;
}): Promise<CognitiveJobLease | null>;
export declare function releaseJobLease(params: {
    jobName: string;
    leaseToken: string;
    success: boolean;
    checkpoint?: Record<string, unknown> | null;
}): Promise<void>;
//# sourceMappingURL=cognitive-db.d.ts.map