export type LocalMemoryImportanceTier = "critical" | "high" | "normal";
export type LocalStoredMemory = {
    id: string;
    title: string;
    content: string;
    createdAt: string;
    updatedAt: string;
    accessCount: number;
    lastAccessedAt: string | null;
    importanceTier: LocalMemoryImportanceTier;
};
export type LocalMemorySearchResult = {
    memory: LocalStoredMemory;
    score: number;
};
export type LocalIndexedMemory = {
    index: string;
    summary: string;
    content?: string;
    createdAt: string;
    updatedAt: string;
    accessCount: number;
};
export type LocalIndexedMemoriesResponse = {
    indices: LocalIndexedMemory[];
    contextFormat: string;
    count: number;
};
export type LocalWorkflowStrategyKey = "verify_first" | "search_codebase_first" | "inspect_config_first" | "patch_then_verify";
export type LocalToolSignal = {
    category?: string;
    command?: string;
    success?: boolean;
};
export type LocalTraceInput = {
    profileId: string;
    type: string;
    problem: string;
    reasoning: string;
    solution?: string;
    outcome: "success" | "partial" | "failed";
    technologies?: string[];
    errorMessages?: string[];
    verificationCommands?: string[];
    filesModified?: string[];
    durationMs?: number;
    toolSignals?: LocalToolSignal[];
};
export type LocalStoredTrace = {
    id: string;
    type: string;
    problem: string;
    reasoning: string;
    solution: string | null;
    outcome: "success" | "partial" | "failed";
    technologies: string[];
    errorMessages: string[];
    verificationCommands: string[];
    filesModified: string[];
    durationMs: number;
    workflow: LocalWorkflowStrategyKey;
    createdAt: string;
};
export type LocalWorkflowRecommendation = {
    key: LocalWorkflowStrategyKey;
    title: string;
    steps: string[];
    rationale: string;
    sampleCount: number;
    score: number;
};
export type LocalPatternRecommendation = {
    title: string;
    approach: string;
    score: number;
};
export type LocalCognitiveContext = {
    workflow: LocalWorkflowRecommendation | null;
    patterns: LocalPatternRecommendation[];
};
export type LocalMemoryStoreOptions = {
    storagePath?: string;
    maxMemories?: number;
};
export interface LocalMemoryStore {
    remember(params: {
        profileId: string;
        content: string;
        title?: string;
    }): Promise<LocalStoredMemory>;
    search(params: {
        profileId: string;
        query: string;
        limit?: number;
    }): Promise<LocalMemorySearchResult[]>;
    getCriticalMemories(params: {
        profileId: string;
        limit?: number;
    }): Promise<LocalStoredMemory[]>;
    getIndexedSummaries(params: {
        profileId: string;
        limit?: number;
    }): Promise<LocalIndexedMemoriesResponse>;
    getMemoriesByIds(profileId: string, ids: string[]): Promise<LocalStoredMemory[]>;
    learnTrace(params: LocalTraceInput): Promise<LocalStoredTrace | null>;
    getCognitiveContext(params: {
        profileId: string;
        problem: string;
        limit?: number;
    }): Promise<LocalCognitiveContext>;
}
export declare function createLocalMemoryStore(options?: LocalMemoryStoreOptions): LocalMemoryStore;
//# sourceMappingURL=local-memory-store.d.ts.map