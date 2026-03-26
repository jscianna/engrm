type FatHippoFetch = typeof fetch;
export type FatHippoRuntimeName = "openclaw" | "claude" | "codex" | "cursor" | "custom";
export type FatHippoMessageRole = "system" | "user" | "assistant" | "tool";
export interface FatHippoRuntimeMetadata {
    runtime: FatHippoRuntimeName;
    runtimeVersion?: string;
    adapterVersion?: string;
    namespace?: string;
    workspaceId?: string;
    workspaceRoot?: string;
    installationId?: string;
    conversationId?: string;
    agentId?: string;
    model?: string;
}
export interface FatHippoConversationMessage {
    role: FatHippoMessageRole;
    content: string;
    timestamp?: string;
    toolName?: string;
    toolCallId?: string;
}
export interface FatHippoInjectedMemoryRef {
    id: string;
    title: string;
    text: string;
    type?: string;
    tier?: string;
    source: "critical" | "high" | "working" | "refresh" | "search";
}
export interface FatHippoSessionStartInput {
    firstMessage?: string;
    namespace?: string;
    metadata?: Record<string, unknown>;
    runtime?: Partial<FatHippoRuntimeMetadata>;
}
export interface FatHippoSessionStartOutput {
    sessionId: string;
    systemPromptAddition: string;
    injectedMemories: FatHippoInjectedMemoryRef[];
    tokensInjected?: number;
    criticalCount?: number;
    highCount?: number;
}
export interface FatHippoBuildContextInput {
    messages: FatHippoConversationMessage[];
    lastUserMessage?: string;
    sessionId?: string;
    conversationId?: string;
    maxCritical?: number;
    maxRelevant?: number;
    includeIndexed?: boolean;
    includeConstraints?: boolean;
    includeCognitive?: boolean;
    runtime?: Partial<FatHippoRuntimeMetadata>;
}
export interface FatHippoBuildContextOutput {
    systemPromptAddition: string;
    injectedMemories: FatHippoInjectedMemoryRef[];
    sensitiveOmitted?: number;
    evaluationId?: string;
    retrievalConfidence?: number;
    /** IDs of cognitive patterns injected into this context */
    injectedPatternIds?: string[];
    /** IDs of synthesized skills injected into this context */
    injectedSkillIds?: string[];
    /** IDs of traces injected into this context */
    injectedTraceIds?: string[];
    /** Application ID for this cognitive context retrieval */
    cognitiveApplicationId?: string;
}
export interface FatHippoRecordTurnInput {
    sessionId: string;
    messages: FatHippoConversationMessage[];
    turnNumber?: number;
    memoriesUsed?: string[];
    captureUserOnly?: boolean;
    captureConstraints?: boolean;
    captureTrace?: boolean;
    runtime?: Partial<FatHippoRuntimeMetadata>;
}
export interface FatHippoTurnCaptureSummary {
    stored: number;
    updated: number;
    merged: number;
    constraintsDetected: number;
    traceCaptured: boolean;
}
export interface FatHippoRecordTurnOutput {
    turnNumber: number;
    refreshNeeded: boolean;
    systemPromptAddition?: string;
    injectedMemories: FatHippoInjectedMemoryRef[];
    memoriesUsed: string[];
    captureSummary?: FatHippoTurnCaptureSummary;
}
export interface FatHippoRememberInput {
    text: string;
    title?: string;
    runtime?: Partial<FatHippoRuntimeMetadata>;
}
export interface FatHippoRememberOutput {
    memoryId?: string;
    stored: boolean;
    consolidated?: boolean;
    warning?: string;
    /** Write-decision audit metadata */
    audit?: {
        reasonCode?: string;
        policyCode?: string;
        matchedRules?: string[];
    };
}
export interface FatHippoSearchInput {
    query: string;
    limit?: number;
    since?: string;
    namespace?: string;
    runtime?: Partial<FatHippoRuntimeMetadata>;
}
export interface FatHippoSearchResult {
    id: string;
    title: string;
    text: string;
    score: number;
    memoryType?: string;
    provenance?: {
        source?: string;
        fileName?: string;
        sourceUrl?: string;
        createdAt?: string;
    };
}
export interface FatHippoSessionEndInput {
    sessionId: string;
    outcome?: "success" | "failure" | "abandoned";
    feedback?: string;
    runtime?: Partial<FatHippoRuntimeMetadata>;
}
export interface FatHippoSessionEndOutput {
    summary: string;
    suggestedMemories: Array<{
        content: string;
        memoryType: string;
        confidence: number;
    }>;
    memoriesReinforced: number;
    analytics?: {
        turns: number;
        memoriesUsed: number;
        outcome: string;
        duration: number | null;
    };
}
export interface FatHippoHostedRuntimeClientContract {
    startSession(input: FatHippoSessionStartInput): Promise<FatHippoSessionStartOutput>;
    buildContext(input: FatHippoBuildContextInput): Promise<FatHippoBuildContextOutput>;
    recordTurn(input: FatHippoRecordTurnInput): Promise<FatHippoRecordTurnOutput>;
    remember(input: FatHippoRememberInput): Promise<FatHippoRememberOutput>;
    search(input: FatHippoSearchInput): Promise<FatHippoSearchResult[]>;
    endSession(input: FatHippoSessionEndInput): Promise<FatHippoSessionEndOutput>;
}
export interface FatHippoHostedRuntimeClientOptions {
    baseUrl: string;
    apiKey: string;
    fetchImpl?: FatHippoFetch;
    runtime?: FatHippoRuntimeMetadata;
}
export declare class FatHippoHostedRuntimeClient implements FatHippoHostedRuntimeClientContract {
    private readonly apiKey;
    private readonly baseUrl;
    private readonly fetchImpl;
    private readonly defaultRuntime;
    constructor(options: FatHippoHostedRuntimeClientOptions);
    startSession(input: FatHippoSessionStartInput): Promise<FatHippoSessionStartOutput>;
    buildContext(input: FatHippoBuildContextInput): Promise<FatHippoBuildContextOutput>;
    recordTurn(input: FatHippoRecordTurnInput): Promise<FatHippoRecordTurnOutput>;
    remember(input: FatHippoRememberInput): Promise<FatHippoRememberOutput>;
    search(input: FatHippoSearchInput): Promise<FatHippoSearchResult[]>;
    endSession(input: FatHippoSessionEndInput): Promise<FatHippoSessionEndOutput>;
    private resolveRuntime;
    private buildHeaders;
    private requestJson;
    private requestText;
}
export declare function createFatHippoHostedRuntimeClient(options: FatHippoHostedRuntimeClientOptions): FatHippoHostedRuntimeClient;
export {};
//# sourceMappingURL=runtime-adapter.d.ts.map