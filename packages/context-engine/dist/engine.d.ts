/**
 * FatHippo Context Engine
 *
 * Implements OpenClaw's ContextEngine interface for hosted or local agent memory.
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
    private runtimeClient;
    private config;
    private mode;
    private localStore;
    private hostedSessions;
    private sessionStartTimes;
    private sessionLocalProfiles;
    private sessionHippoNodState;
    private cognitiveEnabled;
    private static readonly TRIVIAL_ACKS;
    private static readonly HIPPO_NOD_COOLDOWN_MS;
    private static readonly HIPPO_NOD_MIN_MESSAGE_GAP;
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
    private detectToolsUsed;
    /**
     * Assemble context for the model
     */
    assemble(params: {
        sessionId: string;
        messages: AgentMessage[];
        tokenBudget?: number;
    }): Promise<AssembleResult>;
    private assembleLocalContext;
    private buildRuntimeAwarenessInstruction;
    private runCognitiveHeartbeat;
    private detectFilesModified;
    private detectWorkspaceRoot;
    private deriveLocalProfileId;
    private getLocalProfileId;
    private buildLocalTitle;
    private mapLocalMemory;
    private toLocalToolSignals;
    private captureLocalTrace;
    private buildHippoNodInstruction;
    private isHighUrgencyOrFormalMoment;
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
    prepareSubagentSpawn(_params: {
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
    private buildHostedRuntimeMetadata;
    private toRuntimeMessages;
    private extractTurnMessages;
    private captureLocalTurnMemories;
    private mapHostedOutcomeFromReason;
    private endHostedSession;
    private findLastUserMessage;
    private isTrivialQuery;
    private isRoleMessage;
    private estimateMessageTokens;
    private constrainContextToBudget;
    private fitContextToBudget;
    private truncateContextSection;
}
//# sourceMappingURL=engine.d.ts.map