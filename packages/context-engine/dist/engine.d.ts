/**
 * FatHippo Context Engine
 *
 * Implements OpenClaw's ContextEngine interface for encrypted agent memory.
 */
import type { AssembleResult, BootstrapResult, CompactResult, ContextEngine, ContextEngineInfo, IngestBatchResult, IngestResult, SubagentEndReason, SubagentSpawnPreparation } from "openclaw/plugin-sdk";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { FatHippoConfig } from "./types.js";
/**
 * FatHippo Context Engine implementation
 */
export declare class FatHippoContextEngine implements ContextEngine {
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
        autoCompactionSummary?: string;
        isHeartbeat?: boolean;
        tokenBudget?: number;
        legacyCompactionParams?: Record<string, unknown>;
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
        currentTokenCount?: number;
        compactionTarget?: "budget" | "threshold";
        customInstructions?: string;
        legacyParams?: Record<string, unknown>;
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
    private isRoleMessage;
    private estimateMessageTokens;
}
//# sourceMappingURL=engine.d.ts.map