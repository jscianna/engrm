/**
 * FatHippo Context Engine
 *
 * Implements OpenClaw's ContextEngine interface for encrypted agent memory.
 */

import { FatHippoClient } from "./api/client.js";
import type { FatHippoConfig, Memory, SynthesizedMemory } from "./types.js";
import {
  formatMemoriesForInjection,
  dedupeMemories,
  estimateTokens,
} from "./utils/formatting.js";
import {
  detectPromptInjection,
  matchesCapturePatterns,
  sanitizeContent,
} from "./utils/filtering.js";

// Types from OpenClaw's plugin SDK (we can't import directly, so we define compatible types)
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
export class FatHippoContextEngine {
  readonly info: ContextEngineInfo = {
    id: "fathippo-context-engine",
    name: "FatHippo Context Engine",
    version: "0.1.0",
    ownsCompaction: true, // We handle compaction via Dream Cycle
  };

  private client: FatHippoClient;
  private config: FatHippoConfig;
  private cachedCritical: {
    memories: Memory[];
    syntheses: SynthesizedMemory[];
    fetchedAt: number;
  } | null = null;

  constructor(config: FatHippoConfig) {
    this.config = config;
    this.client = new FatHippoClient(config);
  }

  /**
   * Initialize engine state for a session
   */
  async bootstrap(params: {
    sessionId: string;
    sessionFile: string;
  }): Promise<BootstrapResult> {
    try {
      // Prefetch critical memories for this session
      const critical = await this.client.getCriticalMemories({
        limit: 30,
        excludeAbsorbed: true,
      });

      this.cachedCritical = {
        memories: critical.memories,
        syntheses: critical.syntheses,
        fetchedAt: Date.now(),
      };

      return {
        bootstrapped: true,
        importedMessages: critical.memories.length + critical.syntheses.length,
      };
    } catch (error) {
      console.error("[FatHippo] Bootstrap error:", error);
      return {
        bootstrapped: false,
        reason: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Ingest a single message into FatHippo
   */
  async ingest(params: {
    sessionId: string;
    message: AgentMessage;
    isHeartbeat?: boolean;
  }): Promise<IngestResult> {
    // Skip heartbeat messages
    if (params.isHeartbeat) {
      return { ingested: false };
    }

    // Only capture user messages (configurable)
    if (this.config.captureUserOnly !== false && params.message.role !== "user") {
      return { ingested: false };
    }

    const content = this.extractContent(params.message);
    if (!content) {
      return { ingested: false };
    }

    // Filter prompt injection attempts
    if (detectPromptInjection(content)) {
      console.warn("[FatHippo] Blocked prompt injection attempt");
      return { ingested: false };
    }

    // Check if content matches capture patterns
    if (!matchesCapturePatterns(content)) {
      return { ingested: false };
    }

    try {
      await this.client.remember({
        content: sanitizeContent(content),
        conversationId: this.config.conversationId || params.sessionId,
      });
      return { ingested: true };
    } catch (error) {
      console.error("[FatHippo] Ingest error:", error);
      return { ingested: false };
    }
  }

  /**
   * Ingest a batch of messages
   */
  async ingestBatch(params: {
    sessionId: string;
    messages: AgentMessage[];
    isHeartbeat?: boolean;
  }): Promise<IngestBatchResult> {
    if (params.isHeartbeat) {
      return { ingestedCount: 0 };
    }

    let ingestedCount = 0;
    for (const message of params.messages) {
      const result = await this.ingest({
        sessionId: params.sessionId,
        message,
        isHeartbeat: params.isHeartbeat,
      });
      if (result.ingested) ingestedCount++;
    }

    return { ingestedCount };
  }

  /**
   * Post-turn lifecycle processing
   */
  async afterTurn(params: {
    sessionId: string;
    sessionFile: string;
    messages: AgentMessage[];
    prePromptMessageCount: number;
    isHeartbeat?: boolean;
  }): Promise<void> {
    // Don't process heartbeat turns
    if (params.isHeartbeat) return;

    // Invalidate critical cache after turns (may have new memories)
    const cacheAge = this.cachedCritical
      ? Date.now() - this.cachedCritical.fetchedAt
      : Infinity;
    if (cacheAge > 5 * 60 * 1000) {
      // 5 minute cache
      this.cachedCritical = null;
    }
  }

  /**
   * Assemble context for the model
   */
  async assemble(params: {
    sessionId: string;
    messages: AgentMessage[];
    tokenBudget?: number;
  }): Promise<AssembleResult> {
    const lastUserMessage = this.findLastUserMessage(params.messages);

    // Fetch relevant memories based on last user message
    let memories: Memory[] = [];
    let syntheses: SynthesizedMemory[] = [];

    try {
      // Get critical memories (from cache or fresh)
      if (this.config.injectCritical !== false) {
        if (
          this.cachedCritical &&
          Date.now() - this.cachedCritical.fetchedAt < 5 * 60 * 1000
        ) {
          memories = this.cachedCritical.memories;
          syntheses = this.cachedCritical.syntheses;
        } else {
          const critical = await this.client.getCriticalMemories({
            limit: 15,
            excludeAbsorbed: true,
          });
          memories = critical.memories;
          syntheses = critical.syntheses;
          this.cachedCritical = {
            memories,
            syntheses,
            fetchedAt: Date.now(),
          };
        }
      }

      // Search for relevant memories based on query
      if (lastUserMessage) {
        const results = await this.client.search({
          query: lastUserMessage,
          limit: this.config.injectLimit || 20,
          excludeAbsorbed: true,
        });

        const searchedMemories = results.map((r) => r.memory);
        memories = dedupeMemories([...memories, ...searchedMemories]);
      }
    } catch (error) {
      console.error("[FatHippo] Assemble error:", error);
    }

    // Format memories for injection
    const memoryBlock = formatMemoriesForInjection(memories, syntheses);
    const tokens = estimateTokens(memoryBlock);

    return {
      messages: params.messages,
      estimatedTokens: tokens,
      systemPromptAddition: memoryBlock || undefined,
    };
  }

  /**
   * Handle compaction via Dream Cycle
   */
  async compact(params: {
    sessionId: string;
    sessionFile: string;
    tokenBudget?: number;
    force?: boolean;
  }): Promise<CompactResult> {
    if (this.config.dreamCycleOnCompact === false) {
      // Fall back to default compaction
      return { ok: true, compacted: false, reason: "dreamCycleOnCompact disabled" };
    }

    try {
      const result = await this.client.runDreamCycle({
        processCompleted: true,
        processEphemeral: true,
        synthesizeCritical: true,
        applyDecay: true,
        updateGraph: true,
      });

      // Invalidate cache after dream cycle
      this.cachedCritical = null;

      return {
        ok: result.ok,
        compacted: true,
        reason: `Dream Cycle: ${result.synthesized || 0} synthesized, ${result.decayed || 0} decayed`,
      };
    } catch (error) {
      console.error("[FatHippo] Dream Cycle error:", error);
      return {
        ok: false,
        compacted: false,
        reason: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Prepare context for subagent spawn
   */
  async prepareSubagentSpawn(params: {
    parentSessionKey: string;
    childSessionKey: string;
    ttlMs?: number;
  }): Promise<SubagentSpawnPreparation | undefined> {
    // For now, subagents inherit parent's memory scope
    // Future: could create isolated memory scope for subagent
    return {
      rollback: async () => {
        // Nothing to rollback currently
      },
    };
  }

  /**
   * Handle subagent completion
   */
  async onSubagentEnded(params: {
    childSessionKey: string;
    reason: SubagentEndReason;
  }): Promise<void> {
    // Future: extract learnings from subagent session
    // and store them in parent's memory
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    this.cachedCritical = null;
  }

  // --- Helper methods ---

  private extractContent(message: AgentMessage): string | null {
    if (typeof message.content === "string") {
      return message.content;
    }
    if (typeof message.text === "string") {
      return message.text;
    }
    if (Array.isArray(message.content)) {
      // Handle multi-part content (text blocks)
      const textParts = message.content
        .filter((p): p is { type: "text"; text: string } =>
          typeof p === "object" && p !== null && "type" in p && p.type === "text"
        )
        .map((p) => p.text);
      return textParts.join("\n") || null;
    }
    return null;
  }

  private findLastUserMessage(messages: AgentMessage[]): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "user") {
        return this.extractContent(msg);
      }
    }
    return null;
  }
}
