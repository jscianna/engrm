/**
 * FatHippo Context Engine
 *
 * Implements OpenClaw's ContextEngine interface for encrypted agent memory.
 */
import type { FatHippoConfig } from "./types.js";
interface AgentMessage {
    id?: string;
    role: "user" | "assistant" | "system" | "tool";
    content?: string | unknown;
    text?: string;
    name?: string;
    timestamp?: string;
}
interface ContextEngineInfo {
    id: string;
    name: string;
    version?: string;
    ownsCompaction?: boolean;
}
interface BootstrapResult {
    bootstrapped: boolean;
    importedMessages?: number;
    reason?: string;
}
interface IngestResult {
    ingested: boolean;
}
interface IngestBatchResult {
    ingestedCount: number;
}
interface AssembleResult {
    messages: AgentMessage[];
    estimatedTokens: number;
    systemPromptAddition?: string;
}
interface CompactResult {
    ok: boolean;
    compacted: boolean;
    reason?: string;
    result?: {
        summary?: string;
        tokensBefore: number;
        tokensAfter?: number;
    };
}
interface SubagentSpawnPreparation {
    rollback: () => void | Promise<void>;
}
type SubagentEndReason = "deleted" | "completed" | "swept" | "released";
/**
 * FatHippo Context Engine implementation
 */
export declare class FatHippoContextEngine {
    readonly info: ContextEngineInfo;
    private client;
    private config;
    private cachedCritical;
    constructor(config: FatHippoConfig);
    /**
     * Initialize engine state for a session
     */
    bootstrap(params: {
        sessionId: string;
        sessionFile: string;
    }): Promise<BootstrapResult>;
    /**
     * Ingest a single message into FatHippo
     */
    ingest(params: {
        sessionId: string;
        message: AgentMessage;
        isHeartbeat?: boolean;
    }): Promise<IngestResult>;
    /**
     * Ingest a batch of messages
     */
    ingestBatch(params: {
        sessionId: string;
        messages: AgentMessage[];
        isHeartbeat?: boolean;
    }): Promise<IngestBatchResult>;
    /**
     * Post-turn lifecycle processing
     */
    afterTurn(params: {
        sessionId: string;
        sessionFile: string;
        messages: AgentMessage[];
        prePromptMessageCount: number;
        isHeartbeat?: boolean;
    }): Promise<void>;
    /**
     * Assemble context for the model
     */
    assemble(params: {
        sessionId: string;
        messages: AgentMessage[];
        tokenBudget?: number;
    }): Promise<AssembleResult>;
    /**
     * Handle compaction via Dream Cycle
     */
    compact(params: {
        sessionId: string;
        sessionFile: string;
        tokenBudget?: number;
        force?: boolean;
    }): Promise<CompactResult>;
    /**
     * Prepare context for subagent spawn
     */
    prepareSubagentSpawn(params: {
        parentSessionKey: string;
        childSessionKey: string;
        ttlMs?: number;
    }): Promise<SubagentSpawnPreparation | undefined>;
    /**
     * Handle subagent completion
     */
    onSubagentEnded(params: {
        childSessionKey: string;
        reason: SubagentEndReason;
    }): Promise<void>;
    /**
     * Cleanup resources
     */
    dispose(): Promise<void>;
    private extractContent;
    private findLastUserMessage;
}
export {};
//# sourceMappingURL=engine.d.ts.map