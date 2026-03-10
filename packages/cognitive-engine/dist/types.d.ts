/**
 * FatHippo Cognitive Engine Types
 *
 * Core types for trace capture, pattern extraction, and skill synthesis.
 */
export type TraceType = 'debugging' | 'building' | 'refactoring' | 'reviewing' | 'configuring';
export type TraceOutcome = 'success' | 'partial' | 'failed' | 'abandoned';
export interface Approach {
    description: string;
    result: 'worked' | 'failed' | 'partial';
    learnings?: string;
    toolsUsed?: string[];
    durationMs?: number;
}
export interface CodingTrace {
    id: string;
    userId: string;
    sessionId: string;
    timestamp: string;
    type: TraceType;
    problem: string;
    context: TraceContext;
    reasoning: string;
    approaches: Approach[];
    solution?: string;
    outcome: TraceOutcome;
    errorMessage?: string;
    toolsUsed: string[];
    toolCalls?: Array<Record<string, unknown>>;
    toolResults?: Array<Record<string, unknown>>;
    verificationCommands?: string[];
    retryCount?: number;
    repoSignals?: {
        filesModified: string[];
        languages: string[];
        diffSummary: string;
        workspaceRoot?: string;
    };
    resolutionKind?: 'tests_passed' | 'build_passed' | 'lint_passed' | 'manual_only' | 'failed';
    filesModified: string[];
    durationMs: number;
    relatedTraceIds?: string[];
    patternIds?: string[];
    sanitized: boolean;
    sanitizedAt?: string;
}
export interface TraceContext {
    technologies: string[];
    files: string[];
    errorMessages?: string[];
    stackTraces?: string[];
    environment?: string;
    projectType?: string;
}
export interface Pattern {
    id: string;
    userId?: string;
    domain: string;
    trigger: PatternTrigger;
    approach: string;
    steps?: string[];
    pitfalls?: string[];
    confidence: number;
    successCount: number;
    failCount: number;
    lastApplied?: string;
    sourceTraceIds: string[];
    createdAt: string;
    updatedAt: string;
    status: PatternStatus;
    synthesizedIntoSkill?: string;
}
export interface PatternTrigger {
    keywords: string[];
    errorPatterns?: string[];
    technologies?: string[];
    problemTypes?: TraceType[];
}
export type PatternStatus = 'candidate' | 'active_local' | 'active_global' | 'synthesized_local' | 'synthesized_global' | 'deprecated';
export interface SynthesizedSkill {
    id: string;
    name: string;
    description: string;
    version: string;
    content: SkillContent;
    sourcePatternIds: string[];
    sourceTraceIds: string[];
    sourceTraceCount?: number;
    generatedAt: string;
    generatedBy: 'auto' | 'manual';
    qualityScore: number;
    usageCount: number;
    successRate: number;
    lastUsed?: string;
    published: boolean;
    publishedTo?: 'clawhub' | 'local';
    clawHubId?: string;
    publishedAt?: string;
    status: SkillStatus;
}
export interface SkillContent {
    whenToUse: string;
    procedure: string[];
    commonPitfalls: string[];
    verification: string;
    examples?: string[];
    references?: string[];
}
export type SkillStatus = 'draft' | 'active' | 'stale' | 'deprecated';
export interface StoreTraceRequest {
    sessionId: string;
    type: TraceType;
    problem: string;
    context: TraceContext;
    reasoning: string;
    approaches: Approach[];
    solution?: string;
    outcome: TraceOutcome;
    toolsUsed: string[];
    filesModified: string[];
    durationMs: number;
}
export interface StoreTraceResponse {
    trace: CodingTrace;
    matchedPatterns: Pattern[];
    suggestedApproaches: string[];
}
export interface GetRelevantTracesRequest {
    problem: string;
    context?: Partial<TraceContext>;
    limit?: number;
}
export interface GetRelevantTracesResponse {
    applicationId?: string;
    traces: CodingTrace[];
    patterns: Pattern[];
    skills: SynthesizedSkill[];
}
export interface RetrievalEvalFixture {
    applicationId?: string;
    sessionId?: string;
    endpoint?: string;
    problem: string;
    technologies?: string[];
    expectedTraceIds: string[];
    expectedPatternIds: string[];
    expectedSkillIds: string[];
    acceptedId?: string;
}
export interface RetrievalEvalPrediction {
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
    finalOutcome?: TraceOutcome;
    acceptedTraceId?: string;
    acceptedPatternId?: string;
    acceptedSkillId?: string;
}
export interface RetrievalEvalDatasetRecord {
    applicationId: string;
    sessionId: string;
    endpoint: string;
    labelSource: 'explicit' | 'weak';
    fixture: RetrievalEvalFixture;
    prediction: RetrievalEvalPrediction;
}
export interface RetrievalEvalDataset {
    fixtures: RetrievalEvalFixture[];
    predictions: RetrievalEvalPrediction[];
    records: RetrievalEvalDatasetRecord[];
}
export interface RetrievalEvalResult {
    traceMrr: number;
    patternRecallAtK: number;
    skillHitRate: number;
    weakOutcomeLift: number;
    cases: number;
}
export interface PatternFeedbackRequest {
    patternId: string;
    traceId: string;
    outcome: 'success' | 'failure';
    notes?: string;
}
export interface SynthesizeSkillRequest {
    patternId: string;
    name?: string;
    publish?: boolean;
}
export interface CognitiveEngineConfig {
    apiKey: string;
    baseUrl?: string;
    captureEnabled: boolean;
    sanitizeSecrets: boolean;
    minTraceDurationMs?: number;
    patternExtractionEnabled: boolean;
    minTracesForPattern: number;
    minSuccessRateForPattern: number;
    skillSynthesisEnabled: boolean;
    minPatternsForSkill: number;
    minSuccessRateForSkill: number;
    autoPublishToClawHub: boolean;
    injectRelevantTraces: boolean;
    injectPatterns: boolean;
    maxInjectedTraces: number;
    maxInjectedPatterns: number;
}
//# sourceMappingURL=types.d.ts.map