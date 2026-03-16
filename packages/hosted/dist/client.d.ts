/**
 * Shared FatHippo hosted API client.
 *
 * Runtime-specific adapters should depend on this package instead of
 * reimplementing hosted HTTP calls locally.
 */
export interface FatHippoClientOptions {
    apiKey?: string;
    baseUrl?: string;
    mode?: "auto" | "hosted" | "local";
    pluginVersion?: string;
    pluginId?: string;
    runtime?: string;
    namespace?: string;
    installationId?: string;
    workspaceId?: string;
    additionalHeaders?: Record<string, string>;
}
export interface Memory {
    id: string;
    title: string;
    content: string;
    userId: string;
    memoryType?: string;
    importanceTier?: "critical" | "high" | "normal" | "low";
    importance?: number;
    entities?: string[];
    createdAt: string;
    updatedAt: string;
    accessCount?: number;
    lastAccessedAt?: string;
    absorbed?: boolean;
    absorbedIntoSynthesisId?: string | null;
}
export interface SearchResult {
    memory: Memory;
    score: number;
    matchType?: "vector" | "bm25" | "hybrid";
}
export interface SynthesizedMemory {
    id: string;
    userId: string;
    title: string;
    content: string;
    sourceMemoryIds: string[];
    theme?: string;
    createdAt: string;
}
export interface CriticalMemoriesResponse {
    memories: Memory[];
    syntheses: SynthesizedMemory[];
}
export interface RememberParams {
    content: string;
    title?: string;
    conversationId?: string;
    metadata?: Record<string, unknown>;
}
export interface SearchParams {
    query: string;
    limit?: number;
    excludeAbsorbed?: boolean;
    conversationId?: string;
}
export interface DreamCycleParams {
    processCompleted?: boolean;
    processEphemeral?: boolean;
    synthesizeCritical?: boolean;
    applyDecay?: boolean;
    updateGraph?: boolean;
}
export interface IndexedMemory {
    index: string;
    summary: string;
    content?: string;
    contentType?: string;
    metadata?: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
    accessCount: number;
}
export interface IndexedMemoriesResponse {
    indices: IndexedMemory[];
    contextFormat: string;
    count: number;
}
export interface CognitiveTrace {
    id: string;
    type: string;
    problem: string;
    reasoning: string;
    solution?: string;
    outcome: string;
    context: {
        technologies?: string[];
    };
    createdAt?: string;
}
export interface CognitivePattern {
    id: string;
    scope: "local" | "global" | "org";
    domain: string;
    approach: string;
    confidence: number;
    score?: number;
}
export interface CognitiveSkill {
    id: string;
    name: string;
    description: string;
    scope: "local" | "global";
    status: string;
    successRate: number;
}
export interface CognitiveContextResponse {
    applicationId?: string;
    policy?: {
        key: string;
        contextKey: string;
        rationale: string;
        exploration: boolean;
        score: number;
        traceLimit: number;
        patternLimit: number;
        skillLimit: number;
        sectionOrder: Array<"local_patterns" | "global_patterns" | "traces" | "skills">;
    } | null;
    workflow?: {
        key: string;
        contextKey: string;
        rationale: string;
        exploration: boolean;
        score: number;
        title: string;
        steps: string[];
    } | null;
    traces: CognitiveTrace[];
    patterns: CognitivePattern[];
    skills?: CognitiveSkill[];
}
export interface ConstraintListResponse {
    constraints: Array<{
        id: string;
        rule: string;
        triggers: string[];
        severity: "critical" | "warning";
        createdAt: string;
    }>;
    count: number;
    contextFormat?: string;
}
export interface ConstraintCreateResponse {
    detected?: boolean;
    alreadyExists?: boolean;
    message?: string;
    rule?: string;
    constraint?: {
        id: string;
        rule: string;
        triggers: string[];
        severity: "critical" | "warning";
    };
}
export interface CognitiveTraceCaptureInput {
    sessionId: string;
    type: string;
    problem: string;
    context?: Record<string, unknown>;
    reasoning?: string;
    approaches?: Array<{
        description: string;
        result: "worked" | "failed" | "partial";
        learnings?: string;
    }>;
    solution?: string;
    outcome: string;
    heuristicOutcome?: string;
    automatedOutcome?: string;
    automatedSignals?: Record<string, unknown>;
    errorMessage?: string;
    toolsUsed?: string[];
    filesModified?: string[];
    durationMs?: number;
    sanitized: boolean;
    sanitizedAt?: string;
    shareEligible?: boolean;
    notes?: string;
    applicationId?: string | null;
    repoSignals?: Record<string, unknown>;
    resolutionKind?: string;
    toolCalls?: unknown[];
    toolResults?: unknown[];
    verificationCommands?: string[];
    retryCount?: number;
    verificationResults?: Record<string, unknown>;
    verificationSummary?: Record<string, unknown>;
    materializedPatternId?: string | null;
    materializedSkillId?: string | null;
    baselineGroupKey?: string | null;
    acceptedTraceId?: string | null;
}
export interface CognitiveTraceCaptureResponse {
    trace: {
        id: string;
        sessionId: string;
        type: string;
        problem: string;
        outcome: string;
        outcomeSource?: string;
        outcomeConfidence?: number;
        shareEligible?: boolean;
        context: Record<string, unknown>;
        automatedSignals: Record<string, unknown>;
        createdAt: string;
    };
    applicationId?: string | null;
    matchedPatterns?: Array<{
        id: string;
        domain: string;
        approach: string;
        confidence: number;
        score?: number;
        scope: "local" | "global" | "org";
    }>;
}
export interface CognitivePatternExtractionResponse {
    ran: boolean;
    reason?: string;
    localPatterns?: number;
    globalPatterns?: number;
    orgId?: string | null;
    orgPromotedPatterns?: number;
    touchedPatternIds?: string[];
    promotedPatternIds?: string[];
}
export interface CognitiveSkillSynthesisResponse {
    ran: boolean;
    reason?: string;
    count?: number;
    skills?: Array<{
        id: string;
        name: string;
        scope: "local" | "global";
        status: string;
        successRate: number;
    }>;
}
export declare class FatHippoClient {
    private apiKey;
    private baseUrl;
    private headers;
    constructor(options: FatHippoClientOptions);
    private request;
    remember(params: RememberParams): Promise<Memory>;
    search(params: SearchParams): Promise<SearchResult[]>;
    getCriticalMemories(options?: {
        limit?: number;
        excludeAbsorbed?: boolean;
    }): Promise<CriticalMemoriesResponse>;
    getRecentMemories(options?: {
        hours?: number;
        limit?: number;
    }): Promise<Memory[]>;
    runDreamCycle(params?: DreamCycleParams): Promise<{
        ok: boolean;
        synthesized?: number;
        decayed?: number;
    }>;
    getContext(query?: string): Promise<{
        memories: Memory[];
        syntheses?: Array<{
            id: string;
            title: string;
            content: string;
        }>;
        tokenEstimate?: number;
    }>;
    getIndexedSummaries(): Promise<IndexedMemoriesResponse>;
    dereferenceIndex(indexKey: string): Promise<IndexedMemory>;
    storeIndexed(params: {
        index: string;
        summary: string;
        content: string;
        contentType?: string;
        metadata?: Record<string, unknown>;
    }): Promise<{
        stored: boolean;
        index: string;
    }>;
    getConstraints(): Promise<ConstraintListResponse>;
    storeConstraint(params: {
        message: string;
    }): Promise<ConstraintCreateResponse>;
    getRelevantCognitiveContext(params: {
        sessionId: string;
        endpoint: string;
        problem: string;
        limit?: number;
        adaptivePolicy?: boolean;
        context?: {
            technologies?: string[];
            repoProfile?: Record<string, unknown> | null;
        };
    }): Promise<CognitiveContextResponse>;
    captureCognitiveTrace(params: CognitiveTraceCaptureInput): Promise<CognitiveTraceCaptureResponse>;
    extractCognitivePatterns(params?: {
        intervalMs?: number;
        leaseMs?: number;
    }): Promise<CognitivePatternExtractionResponse>;
    synthesizeCognitiveSkills(params?: {
        intervalMs?: number;
        leaseMs?: number;
    }): Promise<CognitiveSkillSynthesisResponse>;
    submitPatternFeedback(params: {
        patternId: string;
        traceId: string;
        outcome: 'success' | 'failure';
        notes?: string;
    }): Promise<{
        updated: boolean;
    }>;
}
//# sourceMappingURL=client.d.ts.map