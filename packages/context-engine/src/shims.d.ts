declare module "@mariozechner/pi-agent-core" {
  export type AgentMessage = {
    role?: string;
    content?: unknown;
    text?: string;
    type?: string;
    toolName?: string;
  };
}

declare module "openclaw/plugin-sdk" {
  import type { AgentMessage } from "@mariozechner/pi-agent-core";

  export type BootstrapResult = {
    bootstrapped: boolean;
    importedMessages?: number;
    reason?: string;
  };

  export type IngestResult = { ingested: boolean };
  export type IngestBatchResult = { ingestedCount: number };

  export type AssembleResult = {
    messages: AgentMessage[];
    estimatedTokens: number;
    systemPromptAddition?: string;
  };

  export type CompactResult = {
    ok: boolean;
    compacted: boolean;
    reason?: string;
  };

  export type SubagentEndReason = string;

  export type SubagentSpawnPreparation = {
    rollback?: () => Promise<void>;
  };

  export type ContextEngineInfo = {
    id: string;
    name: string;
    version: string;
    ownsCompaction?: boolean;
  };

  export interface ContextEngine {
    info: ContextEngineInfo;
    bootstrap(params: { sessionId: string; sessionFile: string }): Promise<BootstrapResult>;
    ingest(params: { sessionId: string; message: AgentMessage; isHeartbeat?: boolean }): Promise<IngestResult>;
    ingestBatch(params: { sessionId: string; messages: AgentMessage[]; isHeartbeat?: boolean }): Promise<IngestBatchResult>;
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
    assemble(params: { sessionId: string; messages: AgentMessage[]; tokenBudget?: number }): Promise<AssembleResult>;
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
    prepareSubagentSpawn(params: {
      parentSessionKey: string;
      childSessionKey: string;
      ttlMs?: number;
    }): Promise<SubagentSpawnPreparation | undefined>;
    onSubagentEnded(params: {
      childSessionKey: string;
      reason: SubagentEndReason;
    }): Promise<void>;
    dispose(): Promise<void>;
  }

  export interface OpenClawPluginApi {
    pluginConfig?: unknown;
    logger?: {
      info: (...args: unknown[]) => void;
      warn: (...args: unknown[]) => void;
      error: (...args: unknown[]) => void;
    };
    registerContextEngine(id: string, factory: () => ContextEngine): void;
  }
}
