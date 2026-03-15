/**
 * FatHippo Context Engine Types
 */
export interface FatHippoConfig {
    apiKey?: string;
    baseUrl?: string;
    mode?: "auto" | "hosted" | "local";
    namespace?: string;
    installationId?: string;
    workspaceId?: string;
    injectCritical?: boolean;
    injectLimit?: number;
    /** Legacy escape hatch: when true, only user messages are persisted after each turn. */
    captureUserOnly?: boolean;
    dreamCycleOnCompact?: boolean;
    conversationId?: string | null;
    localProfileId?: string | null;
    localStoragePath?: string;
    /** Enable cognitive engine features (trace capture, pattern injection). Default: true */
    cognitiveEnabled?: boolean;
    /** Run extraction and synthesis from heartbeat turns. Default: true */
    cognitiveHeartbeatEnabled?: boolean;
    /** Shared learning opt-in for sanitized traces. Default: true */
    shareEligibleByDefault?: boolean;
    /** Enable local adaptive strategy selection for cognitive retrieval. Default: true */
    adaptivePolicyEnabled?: boolean;
    /** Allow occasional user-visible hippo acknowledgements when FatHippo materially helps. Default: true */
    hippoNodsEnabled?: boolean;
    /** Internal: plugin version attached to hosted requests for dashboard visibility. */
    pluginVersion?: string;
    /** Internal: plugin id attached to hosted requests for dashboard visibility. */
    pluginId?: string;
    /** Internal: runtime attached to hosted requests for namespace-aware routing. */
    runtime?: string;
    /** Enable codebase profiling. Default: true */
    codebaseProfilingEnabled?: boolean;
    /** Max token budget for profile in context. Default: 1400 */
    codebaseProfileTokenBudget?: number;
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
export interface CriticalMemoriesResponse {
    memories: Memory[];
    syntheses: SynthesizedMemory[];
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
export interface ProcessingQueueParams {
    turnId: string;
    userId: string;
    tasks: Array<"extractEntities" | "detectImportance" | "buildRelationships" | "updateAccessPatterns">;
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
//# sourceMappingURL=types.d.ts.map