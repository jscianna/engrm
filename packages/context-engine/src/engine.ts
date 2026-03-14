/**
 * FatHippo Context Engine
 *
 * Implements OpenClaw's ContextEngine interface for hosted or local agent memory.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import {
  createLocalMemoryStore,
  invalidateAllLocalResultsForUser,
  localRetrieve,
  localStoreResult,
  type LocalCognitiveContext,
  type LocalMemoryStore,
  type LocalMemorySearchResult,
  type LocalToolSignal,
  type LocalStoredMemory,
} from "@fathippo/local";
import {
  FatHippoClient,
  type CognitiveContextResponse,
  type CognitivePattern,
  type CognitiveSkill,
  type CognitiveTrace,
} from "@fathippo/hosted";
import type {
  AssembleResult,
  BootstrapResult,
  CompactResult,
  ContextEngine,
  ContextEngineInfo,
  IngestBatchResult,
  IngestResult,
  SubagentEndReason,
  SubagentSpawnPreparation,
} from "openclaw/plugin-sdk";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { FatHippoConfig, Memory, SynthesizedMemory } from "./types.js";
import { buildStructuredTrace, getMessageText, shouldCaptureCodingTrace } from "./cognitive/trace-capture.js";
import { CONTEXT_ENGINE_ID, CONTEXT_ENGINE_VERSION } from "./version.js";
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

type RuntimeMode = "hosted" | "local";

type HippoHelpCue =
  | { kind: "workflow"; reason: string }
  | { kind: "learned_fix"; reason: string }
  | { kind: "memory"; reason: string };

type CognitiveContextBundle = {
  context: string | null;
  hippoCue: HippoHelpCue | null;
};

/**
 * FatHippo Context Engine implementation
 */
export class FatHippoContextEngine implements ContextEngine {
  readonly info: ContextEngineInfo = {
    id: CONTEXT_ENGINE_ID,
    name: "FatHippo Context Engine",
    version: CONTEXT_ENGINE_VERSION,
    ownsCompaction: true, // We handle compaction via Dream Cycle
  };

  private client: FatHippoClient | null;
  private config: FatHippoConfig;
  private mode: RuntimeMode;
  private localStore: LocalMemoryStore | null;
  private cachedCritical: {
    memories: Memory[];
    syntheses: SynthesizedMemory[];
    fetchedAt: number;
  } | null = null;
  
  // Cognitive engine state
  private sessionStartTimes: Map<string, number> = new Map();
  private sessionApplicationIds: Map<string, string> = new Map();
  private sessionLocalProfiles: Map<string, string> = new Map();
  private sessionHippoNodState: Map<string, { lastOfferedAt: number; lastMessageCount: number }> = new Map();
  private cognitiveEnabled: boolean;
  
  private static readonly TRIVIAL_ACKS = new Set([
    "ok",
    "thanks",
    "yes",
    "no",
    "sure",
    "cool",
    "nice",
    "got it",
    "k",
    "ty",
    "thx",
  ]);
  private static readonly MIN_VECTOR_SIMILARITY = 0.75;
  private static readonly MIN_CRITICAL_RELEVANCE = 0.7;
  private static readonly HIPPO_NOD_COOLDOWN_MS = 15 * 60 * 1000;
  private static readonly HIPPO_NOD_MIN_MESSAGE_GAP = 6;

  constructor(config: FatHippoConfig) {
    this.config = config;
    this.mode = config.mode === "local" || (!config.apiKey && config.mode !== "hosted") ? "local" : "hosted";
    if (this.mode === "hosted" && !config.apiKey) {
      throw new Error(
        "FatHippo hosted mode requires an API key. Pass apiKey or switch mode to local/auto.",
      );
    }
    this.client = this.mode === "hosted" ? new FatHippoClient(config) : null;
    this.localStore =
      this.mode === "local"
        ? createLocalMemoryStore({
            storagePath: config.localStoragePath,
          })
        : null;
    // Enable cognitive features if configured (default: true)
    this.cognitiveEnabled = this.mode === "hosted" && config.cognitiveEnabled !== false;
  }

  /**
   * Initialize engine state for a session
   */
  async bootstrap(params: {
    sessionId: string;
    sessionFile: string;
  }): Promise<BootstrapResult> {
    try {
      this.sessionStartTimes.set(params.sessionId, Date.now());

      if (this.mode === "local") {
        this.sessionLocalProfiles.set(
          params.sessionId,
          this.deriveLocalProfileId(params.sessionId, params.sessionFile),
        );
        return {
          bootstrapped: true,
          importedMessages: 0,
        };
      }

      // Prefetch critical memories for this session
      const critical = await this.client?.getCriticalMemories({
        limit: 30,
        excludeAbsorbed: true,
      });
      if (!critical) {
        return {
          bootstrapped: true,
          importedMessages: 0,
        };
      }

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
    if (
      this.config.captureUserOnly !== false &&
      (!this.isRoleMessage(params.message) || params.message.role !== "user")
    ) {
      return { ingested: false };
    }

    const content = this.extractContent(params.message);
    if (!content) {
      return { ingested: false };
    }

    // Auto-detect constraints from user messages
    if (this.cognitiveEnabled && this.isRoleMessage(params.message) && params.message.role === "user") {
      this.maybeStoreConstraint(content).catch(() => {}); // Fire and forget
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
      if (this.mode === "local") {
        const profileId = this.getLocalProfileId(params.sessionId);
        await this.localStore?.remember({
          profileId,
          content: sanitizeContent(content),
          title: this.buildLocalTitle(content),
        });
        invalidateAllLocalResultsForUser(profileId);
      } else {
        await this.client?.remember({
          content: sanitizeContent(content),
          conversationId: this.config.conversationId || params.sessionId,
        });
      }
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
    autoCompactionSummary?: string;
    isHeartbeat?: boolean;
    tokenBudget?: number;
    legacyCompactionParams?: Record<string, unknown>;
  }): Promise<void> {
    if (params.isHeartbeat) {
      if (this.cognitiveEnabled && this.config.cognitiveHeartbeatEnabled !== false) {
        await this.runCognitiveHeartbeat();
      }
      return;
    }

    // Invalidate critical cache after turns (may have new memories)
    const cacheAge = this.cachedCritical
      ? Date.now() - this.cachedCritical.fetchedAt
      : Infinity;
    if (cacheAge > 5 * 60 * 1000) {
      // 5 minute cache
      this.cachedCritical = null;
    }
    
    // Capture cognitive trace for coding sessions
    if (this.mode === "local") {
      await this.captureLocalTrace({
        sessionId: params.sessionId,
        sessionFile: params.sessionFile,
        messages: params.messages,
      });
    } else if (this.cognitiveEnabled) {
      await this.captureStructuredTrace({
        sessionId: params.sessionId,
        sessionFile: params.sessionFile,
        messages: params.messages,
      });
    }
  }
  
  private detectToolsUsed(messages: AgentMessage[]): string[] {
    const tools = new Set<string>();
    
    for (const message of messages) {
      // Check for tool result messages
      const msg = message as unknown as Record<string, unknown>;
      if (msg.role === 'toolResult' || msg.type === 'toolResult') {
        if (typeof msg.toolName === 'string') {
          tools.add(msg.toolName);
        }
      }
    }
    
    return [...tools];
  }

  /**
   * Assemble context for the model
   */
  async assemble(params: {
    sessionId: string;
    messages: AgentMessage[];
    tokenBudget?: number;
  }): Promise<AssembleResult> {
    const lastUserMessage = this.findLastUserMessage(params.messages)?.trim() ?? "";
    const runtimeAwareness = this.buildRuntimeAwarenessInstruction();

    if (this.mode === "local") {
      return this.assembleLocalContext(params, lastUserMessage, runtimeAwareness);
    }

    const client = this.client;
    if (!client) {
      return {
        messages: params.messages,
        estimatedTokens: this.estimateMessageTokens(params.messages),
      };
    }

    // Always fetch indexed summaries (they're compact)
    let indexedContext = "";
    try {
      const indexed = await client.getIndexedSummaries();
      if (indexed.count > 0) {
        indexedContext = `\n## Indexed Memory (use GET /indexed/:key for full content)\n${indexed.contextFormat}\n`;
      }
    } catch {
      // Indexed memories are optional, don't fail on error
    }

    if (!lastUserMessage || this.isTrivialQuery(lastUserMessage)) {
      // Still include indexed summaries even for trivial queries
      const baseTokens = this.estimateMessageTokens(params.messages);
      const systemPromptAddition = runtimeAwareness + indexedContext;
      return {
        messages: params.messages,
        estimatedTokens: baseTokens + estimateTokens(systemPromptAddition),
        systemPromptAddition: systemPromptAddition.trim() || undefined,
      };
    }

    // Fetch relevant memories based on last user message
    let memories: Memory[] = [];
    let syntheses: SynthesizedMemory[] = [];
    let memoryHippoCue: HippoHelpCue | null = null;
    let hasRelevantCriticalMatch = false;

    try {
      // Search for relevant memories based on query
      const results = await client.search({
        query: lastUserMessage,
        limit: this.config.injectLimit || 20,
        excludeAbsorbed: true,
      });

      const qualifyingResults = results.filter(
        (r) => r.score >= FatHippoContextEngine.MIN_VECTOR_SIMILARITY
      );
      const searchedMemories = qualifyingResults.map((r) => r.memory);
      memories = dedupeMemories(searchedMemories);

      // Inject critical only for non-trivial queries with critical relevance.
      hasRelevantCriticalMatch = results.some(
        (r) =>
          r.memory.importanceTier === "critical" &&
          r.score > FatHippoContextEngine.MIN_CRITICAL_RELEVANCE
      );

      if (this.config.injectCritical !== false && hasRelevantCriticalMatch) {
        let criticalMemories: Memory[];
        let criticalSyntheses: SynthesizedMemory[];
        if (
          this.cachedCritical &&
          Date.now() - this.cachedCritical.fetchedAt < 5 * 60 * 1000
        ) {
          criticalMemories = this.cachedCritical.memories;
          criticalSyntheses = this.cachedCritical.syntheses;
        } else {
          const critical = await client.getCriticalMemories({
            limit: 15,
            excludeAbsorbed: true,
          });
          criticalMemories = critical.memories;
          criticalSyntheses = critical.syntheses;
          this.cachedCritical = {
            memories: criticalMemories,
            syntheses: criticalSyntheses,
            fetchedAt: Date.now(),
          };
        }

        memories = dedupeMemories([...criticalMemories, ...memories]);
        syntheses = criticalSyntheses;
      }

      if (hasRelevantCriticalMatch || syntheses.length > 0) {
        memoryHippoCue = {
          kind: "memory",
          reason: "Fathippo recalled relevant memory for this reply.",
        };
      }
    } catch (error) {
      console.error("[FatHippo] Assemble error:", error);
    }

    const baseMessageTokens = this.estimateMessageTokens(params.messages);
    if (typeof params.tokenBudget === "number" && params.tokenBudget > 0) {
      const contextBudget = Math.max(0, params.tokenBudget - baseMessageTokens);
      const constrained = this.constrainContextToBudget(memories, syntheses, contextBudget);
      memories = constrained.memories;
      syntheses = constrained.syntheses;
    }

    // Format memories for injection, include indexed summaries
    const memoryBlock = formatMemoriesForInjection(memories, syntheses);
    
    // Fetch constraints (always inject - these are critical rules)
    let constraintsContext = "";
    if (this.cognitiveEnabled) {
      try {
        constraintsContext = await this.fetchConstraints();
      } catch (error) {
        console.error("[FatHippo] Constraints fetch error:", error);
      }
    }
    
    // Fetch cognitive context (traces + patterns) for coding sessions
    let cognitiveContext = "";
    let cognitiveHippoCue: HippoHelpCue | null = null;
    if (this.cognitiveEnabled && this.looksLikeCodingQuery(lastUserMessage)) {
      try {
        const cognitive = await this.fetchCognitiveContext(params.sessionId, lastUserMessage);
        if (cognitive.context) {
          cognitiveContext = cognitive.context;
          cognitiveHippoCue = cognitive.hippoCue;
        }
      } catch (error) {
        console.error("[FatHippo] Cognitive context error:", error);
      }
    }

    const hippoNodInstruction = this.buildHippoNodInstruction({
      sessionId: params.sessionId,
      messageCount: params.messages.length,
      lastUserMessage,
      cue: cognitiveHippoCue ?? memoryHippoCue,
    });
    
    const fullContext = typeof params.tokenBudget === "number" && params.tokenBudget > 0
      ? this.fitContextToBudget({
          sections: [
            runtimeAwareness,
            constraintsContext,
            memoryBlock ? `${memoryBlock}\n` : "",
            indexedContext,
            cognitiveContext,
            hippoNodInstruction,
          ],
          contextBudget: Math.max(0, params.tokenBudget - baseMessageTokens),
        })
      : runtimeAwareness + constraintsContext + (memoryBlock ? memoryBlock + "\n" : "") + indexedContext + cognitiveContext + hippoNodInstruction;
    const tokens = estimateTokens(fullContext) + baseMessageTokens;

    return {
      messages: params.messages,
      estimatedTokens: tokens,
      systemPromptAddition: fullContext.trim() || undefined,
    };
  }

  private async assembleLocalContext(
    params: { sessionId: string; messages: AgentMessage[]; tokenBudget?: number },
    lastUserMessage: string,
    runtimeAwareness: string,
  ): Promise<AssembleResult> {
    const profileId = this.getLocalProfileId(params.sessionId);
    const indexed = await this.localStore?.getIndexedSummaries({
      profileId,
      limit: 18,
    });
    const indexedContext =
      indexed && indexed.count > 0
        ? `\n## Indexed Local Memory\n${indexed.contextFormat}\n`
        : "";
    const baseTokens = this.estimateMessageTokens(params.messages);

    if (!lastUserMessage || this.isTrivialQuery(lastUserMessage)) {
      const systemPromptAddition = runtimeAwareness + indexedContext;
      return {
        messages: params.messages,
        estimatedTokens: baseTokens + estimateTokens(systemPromptAddition),
        systemPromptAddition: systemPromptAddition.trim() || undefined,
      };
    }

    let memories: Memory[] = [];
    let localCognitiveContext: LocalCognitiveContext | null = null;
    try {
      let localMemories: LocalStoredMemory[] = [];
      const cached = await localRetrieve(lastUserMessage, profileId);
      if (cached.hit) {
        localMemories = await this.localStore?.getMemoriesByIds(profileId, cached.memoryIds) ?? [];
      }

      if (localMemories.length === 0) {
        const searchResults: LocalMemorySearchResult[] = await this.localStore?.search({
          profileId,
          query: lastUserMessage,
          limit: Math.max(3, Math.min(this.config.injectLimit || 12, 12)),
        }) ?? [];
        localMemories = searchResults.map((result) => result.memory);
        if (searchResults.length > 0) {
          const avgScore = searchResults.reduce((sum, result) => sum + result.score, 0) / searchResults.length;
          localStoreResult(profileId, lastUserMessage, searchResults.map((result) => result.memory.id), avgScore);
        }
      }

      const critical = this.config.injectCritical !== false
        ? await this.localStore?.getCriticalMemories({ profileId, limit: 10 }) ?? []
        : [];

      localCognitiveContext = await this.localStore?.getCognitiveContext({
        profileId,
        problem: lastUserMessage,
        limit: 3,
      }) ?? null;

      memories = dedupeMemories([
        ...critical.map((memory) => this.mapLocalMemory(memory, profileId)),
        ...localMemories.map((memory) => this.mapLocalMemory(memory, profileId)),
      ]).slice(0, this.config.injectLimit || 20);
    } catch (error) {
      console.error("[FatHippo] Local assemble error:", error);
    }

    const memoryBlock = formatMemoriesForInjection(memories, []);
    const workflowBlock =
      localCognitiveContext?.workflow
        ? `## Recommended Workflow\n${localCognitiveContext.workflow.steps.map((step) => `- ${step}`).join("\n")}\n\nStrategy: ${localCognitiveContext.workflow.title} (${localCognitiveContext.workflow.rationale})\n`
        : "";
    const patternBlock =
      localCognitiveContext && localCognitiveContext.patterns.length > 0
        ? `## Local Learned Fixes\n${localCognitiveContext.patterns
            .map((pattern) => `- ${pattern.title}: ${pattern.approach}`)
            .join("\n")}\n`
        : "";
    const hippoNodInstruction = this.buildHippoNodInstruction({
      sessionId: params.sessionId,
      messageCount: params.messages.length,
      lastUserMessage,
      cue: localCognitiveContext?.workflow
        ? {
            kind: "workflow",
            reason: "Fathippo reused a locally learned workflow for this reply.",
          }
        : (localCognitiveContext?.patterns.length ?? 0) > 0
          ? {
              kind: "learned_fix",
              reason: "Fathippo reused a locally learned fix for this reply.",
            }
          : memories.length > 0
        ? {
            kind: "memory",
            reason: "Fathippo recalled local memory for this reply.",
          }
        : null,
    });

    const fullContext = typeof params.tokenBudget === "number" && params.tokenBudget > 0
        ? this.fitContextToBudget({
          sections: [
            runtimeAwareness,
            workflowBlock,
            patternBlock,
            memoryBlock ? `${memoryBlock}\n` : "",
            indexedContext,
            hippoNodInstruction,
          ],
          contextBudget: Math.max(0, params.tokenBudget - baseTokens),
        })
      : runtimeAwareness + workflowBlock + patternBlock + (memoryBlock ? memoryBlock + "\n" : "") + indexedContext + hippoNodInstruction;

    return {
      messages: params.messages,
      estimatedTokens: baseTokens + estimateTokens(fullContext),
      systemPromptAddition: fullContext.trim() || undefined,
    };
  }

  private buildRuntimeAwarenessInstruction(): string {
    return [
      "## FatHippo Runtime",
      "FatHippo context engine is active for this session.",
      "If asked whether FatHippo is active or configured for this chat, answer yes.",
      "Only attribute a specific fact to FatHippo when it appears in a FatHippo-labeled section of this prompt.",
      "If a fact appears in another source such as a workspace file, say FatHippo is active but that specific fact came from the other source.",
      "Do not claim access to runtime traces, logs, dashboards, or hook internals unless they are provided in the conversation.",
      "",
    ].join("\n");
  }
  
  /**
   * Check if query looks like a coding task
   */
  private looksLikeCodingQuery(query: string): boolean {
    const codingKeywords = [
      'bug', 'error', 'fix', 'debug', 'implement', 'build', 'create', 'refactor',
      'function', 'class', 'api', 'endpoint', 'database', 'query', 'test',
      'deploy', 'config', 'install', 'code', 'script', 'compile', 'run'
    ];
    const queryLower = query.toLowerCase();
    return codingKeywords.some(kw => queryLower.includes(kw));
  }
  
  /**
   * Fetch active constraints (always injected)
   */
  private async fetchConstraints(): Promise<string> {
    if (!this.client) {
      return "";
    }

    try {
      const data = await this.client.getConstraints();
      return data.contextFormat || "";
    } catch {
      return "";
    }
  }
  
  /**
   * Auto-detect and store constraints from user message
   */
  private async maybeStoreConstraint(message: string): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client.storeConstraint({ message });
    } catch {
      // Constraint detection is best-effort
    }
  }
  
  /**
   * Fetch relevant traces and patterns from cognitive API
   */
  private async fetchCognitiveContext(sessionId: string, problem: string): Promise<CognitiveContextBundle> {
    if (!this.client) {
      return { context: null, hippoCue: null };
    }

    let data: CognitiveContextResponse;
    try {
      data = await this.client.getRelevantCognitiveContext({
        sessionId,
        endpoint: "context-engine.assemble",
        problem,
        limit: 3,
        adaptivePolicy: this.config.adaptivePolicyEnabled !== false,
      });
    } catch {
      return { context: null, hippoCue: null };
    }

    if (data.applicationId) {
      this.sessionApplicationIds.set(sessionId, data.applicationId);
    }

    const sections = new Map<string, string>();
    if (data.workflow && data.workflow.steps.length > 0) {
      const stepLines = data.workflow.steps.map((step) => `- ${step}`).join("\n");
      const explorationNote = data.workflow.exploration ? " exploratory" : "";
      sections.set(
        "workflow",
        `## Recommended Workflow\n${stepLines}\n\nStrategy: ${data.workflow.title} (${data.workflow.rationale}${explorationNote})`,
      );
    }

    const localPatterns = (data.patterns ?? []).filter((pattern) => pattern.scope !== "global");
    const globalPatterns = (data.patterns ?? []).filter((pattern) => pattern.scope === "global");

    if (localPatterns.length > 0) {
      const patternLines = localPatterns
        .map((pattern) => {
          const score = typeof pattern.score === "number" ? `, score ${pattern.score.toFixed(1)}` : "";
          return `- [${pattern.domain}] ${pattern.approach.slice(0, 200)} (${Math.round(pattern.confidence * 100)}% confidence${score})`;
        })
        .join("\n");
      sections.set("local_patterns", `## Learned Coding Patterns\n${patternLines}`);
    }

    if (globalPatterns.length > 0) {
      const patternLines = globalPatterns
        .map((pattern) => {
          const score = typeof pattern.score === "number" ? `, score ${pattern.score.toFixed(1)}` : "";
          return `- [${pattern.domain}] ${pattern.approach.slice(0, 200)} (${Math.round(pattern.confidence * 100)}% confidence${score})`;
        })
        .join("\n");
      sections.set("global_patterns", `## Shared Global Patterns\n${patternLines}`);
    }
    
    if (data.traces && data.traces.length > 0) {
      const traceLines = data.traces.map(t => {
        const icon = t.outcome === 'success' ? '✓' : t.outcome === 'failed' ? '✗' : '~';
        const solution = t.solution ? ` → ${t.solution.slice(0, 80)}...` : '';
        return `- ${icon} ${t.problem.slice(0, 80)}${solution}`;
      }).join('\n');
      sections.set("traces", `## Past Similar Problems\n${traceLines}`);
    }

    if (data.skills && data.skills.length > 0) {
      const skillLines = data.skills
        .map((skill) => `- [${skill.scope}] ${skill.name}: ${skill.description} (${Math.round(skill.successRate * 100)}% success)`)
        .join("\n");
      sections.set("skills", `## Synthesized Skills\n${skillLines}`);
    }
    
    let hippoCue: HippoHelpCue | null = null;
    if (data.workflow && data.workflow.steps.length > 0) {
      hippoCue = {
        kind: "workflow",
        reason: "Fathippo surfaced a learned workflow for this task.",
      };
    } else if ((data.skills?.length ?? 0) > 0) {
      hippoCue = {
        kind: "learned_fix",
        reason: "Fathippo surfaced a synthesized skill for this task.",
      };
    } else if ((localPatterns.length + globalPatterns.length + (data.traces?.length ?? 0)) >= 2) {
      hippoCue = {
        kind: "learned_fix",
        reason: "Fathippo surfaced learned fixes and similar past problems for this task.",
      };
    }

    if (sections.size === 0) {
      return { context: null, hippoCue: null };
    }

    const orderedSections = [
      sections.get("workflow"),
      ...(data.policy?.sectionOrder ?? ["local_patterns", "global_patterns", "traces", "skills"]).map((key) => sections.get(key)),
    ]
      .filter((section): section is string => typeof section === "string" && section.length > 0);

    if (orderedSections.length === 0) {
      return { context: null, hippoCue: null };
    }

    return {
      context: '\n' + orderedSections.join('\n\n') + '\n',
      hippoCue,
    };
  }

  private async captureStructuredTrace(params: {
    sessionId: string;
    sessionFile: string;
    messages: AgentMessage[];
  }): Promise<void> {
    if (!shouldCaptureCodingTrace(params.messages)) {
      return;
    }

    if (!this.sessionStartTimes.has(params.sessionId)) {
      this.sessionStartTimes.set(params.sessionId, Date.now() - 60_000);
    }

    const payload = buildStructuredTrace({
      sessionId: params.sessionId,
      messages: params.messages,
      toolsUsed: this.detectToolsUsed(params.messages),
      filesModified: this.detectFilesModified(params.sessionFile, params.messages),
      workspaceRoot: this.detectWorkspaceRoot(params.sessionFile),
      startTime: this.sessionStartTimes.get(params.sessionId) ?? Date.now() - 60_000,
      endTime: Math.min(Date.now(), (this.sessionStartTimes.get(params.sessionId) ?? Date.now()) + 30 * 60 * 1000),
    });

    if (!payload) {
      this.sessionStartTimes.set(params.sessionId, Date.now());
      return;
    }

    try {
      if (!this.client) {
        return;
      }

      await this.client.captureCognitiveTrace({
          ...payload,
          applicationId: this.sessionApplicationIds.get(params.sessionId) ?? null,
          shareEligible: this.config.shareEligibleByDefault !== false && payload.shareEligible,
      });
      this.sessionStartTimes.delete(params.sessionId);
      this.sessionApplicationIds.delete(params.sessionId);
    } catch (error) {
      console.error("[FatHippo] Trace capture error:", error);
      this.sessionStartTimes.set(params.sessionId, Date.now());
    }
  }

  private async runCognitiveHeartbeat(): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client.extractCognitivePatterns({});
    } catch (error) {
      console.error("[FatHippo] Pattern extraction heartbeat error:", error);
    }

    try {
      await this.client.synthesizeCognitiveSkills({});
    } catch (error) {
      console.error("[FatHippo] Skill synthesis heartbeat error:", error);
    }
  }

  private detectFilesModified(sessionFile: string, messages: AgentMessage[]): string[] {
    const files = new Set<string>();
    if (sessionFile) {
      files.add(sessionFile);
    }

    const filePattern = /(?:^|[\s("'`])((?:[\w.-]+\/)*[\w.-]+\.(?:ts|tsx|js|jsx|json|md|sql|py|go|rs|java|rb|sh|yaml|yml))(?:$|[\s)"'`:,])/g;
    for (const message of messages) {
      const text = getMessageText(message);
      for (const match of text.matchAll(filePattern)) {
        if (match[1]) {
          files.add(match[1]);
        }
      }
    }

    return [...files].slice(0, 25);
  }

  private detectWorkspaceRoot(sessionFile: string): string | undefined {
    if (!sessionFile) {
      return undefined;
    }
    const resolved = path.resolve(sessionFile);
    let candidate = path.extname(resolved) ? path.dirname(resolved) : resolved;
    const markers = [
      ".git",
      "package.json",
      "pnpm-workspace.yaml",
      "yarn.lock",
      "package-lock.json",
      "bun.lockb",
      "turbo.json",
      "nx.json",
      "deno.json",
    ];

    while (candidate && candidate !== path.dirname(candidate)) {
      if (markers.some((marker) => existsSync(path.join(candidate, marker)))) {
        return candidate;
      }
      candidate = path.dirname(candidate);
    }

    return path.extname(resolved) ? path.dirname(resolved) : resolved;
  }

  private deriveLocalProfileId(sessionId: string, sessionFile?: string): string {
    if (this.config.localProfileId) {
      return this.config.localProfileId;
    }
    if (this.config.conversationId) {
      return this.config.conversationId;
    }
    const workspaceRoot = sessionFile ? this.detectWorkspaceRoot(sessionFile) : undefined;
    return workspaceRoot || this.sessionLocalProfiles.get(sessionId) || "openclaw-local-default";
  }

  private getLocalProfileId(sessionId: string): string {
    return this.sessionLocalProfiles.get(sessionId) || this.deriveLocalProfileId(sessionId);
  }

  private buildLocalTitle(content: string): string {
    const normalized = content.trim().replace(/\s+/g, " ");
    return normalized.length > 72 ? `${normalized.slice(0, 69)}...` : normalized;
  }

  private mapLocalMemory(memory: LocalStoredMemory, profileId: string): Memory {
    return {
      id: memory.id,
      title: memory.title,
      content: memory.content,
      userId: profileId,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt,
      accessCount: memory.accessCount,
      importanceTier: memory.importanceTier,
    };
  }

  private toLocalToolSignals(payload: NonNullable<ReturnType<typeof buildStructuredTrace>>): LocalToolSignal[] {
    return [...payload.toolCalls, ...payload.toolResults]
      .filter((signal): signal is Record<string, unknown> => Boolean(signal) && typeof signal === "object" && !Array.isArray(signal))
      .map((signal) => ({
        category: typeof signal.category === "string" ? signal.category : undefined,
        command: typeof signal.command === "string" ? signal.command : undefined,
        success: typeof signal.success === "boolean" ? signal.success : undefined,
      }));
  }

  private async captureLocalTrace(params: {
    sessionId: string;
    sessionFile: string;
    messages: AgentMessage[];
  }): Promise<void> {
    if (!shouldCaptureCodingTrace(params.messages)) {
      return;
    }

    if (!this.sessionStartTimes.has(params.sessionId)) {
      this.sessionStartTimes.set(params.sessionId, Date.now() - 60_000);
    }

    const payload = buildStructuredTrace({
      sessionId: params.sessionId,
      messages: params.messages,
      toolsUsed: this.detectToolsUsed(params.messages),
      filesModified: this.detectFilesModified(params.sessionFile, params.messages),
      workspaceRoot: this.detectWorkspaceRoot(params.sessionFile),
      startTime: this.sessionStartTimes.get(params.sessionId) ?? Date.now() - 60_000,
      endTime: Math.min(Date.now(), (this.sessionStartTimes.get(params.sessionId) ?? Date.now()) + 30 * 60 * 1000),
    });

    if (!payload) {
      this.sessionStartTimes.set(params.sessionId, Date.now());
      return;
    }

    const profileId = this.deriveLocalProfileId(params.sessionId, params.sessionFile);
    this.sessionLocalProfiles.set(params.sessionId, profileId);

    try {
      await this.localStore?.learnTrace({
        profileId,
        type: payload.type,
        problem: payload.problem,
        reasoning: payload.reasoning,
        solution: payload.solution,
        outcome: payload.outcome,
        technologies: payload.context.technologies,
        errorMessages: payload.context.errorMessages,
        verificationCommands: payload.verificationCommands,
        filesModified: payload.filesModified,
        durationMs: payload.durationMs,
        toolSignals: this.toLocalToolSignals(payload),
      });
      this.sessionStartTimes.delete(params.sessionId);
    } catch (error) {
      console.error("[FatHippo] Local trace capture error:", error);
      this.sessionStartTimes.set(params.sessionId, Date.now());
    }
  }

  private buildHippoNodInstruction(params: {
    sessionId: string;
    messageCount: number;
    lastUserMessage: string;
    cue: HippoHelpCue | null;
  }): string {
    if (this.config.hippoNodsEnabled === false || !params.cue) {
      return "";
    }

    if (this.isHighUrgencyOrFormalMoment(params.lastUserMessage)) {
      return "";
    }

    const prior = this.sessionHippoNodState.get(params.sessionId);
    if (prior) {
      const withinCooldown = Date.now() - prior.lastOfferedAt < FatHippoContextEngine.HIPPO_NOD_COOLDOWN_MS;
      const withinMessageGap = params.messageCount - prior.lastMessageCount < FatHippoContextEngine.HIPPO_NOD_MIN_MESSAGE_GAP;
      if (withinCooldown || withinMessageGap) {
        return "";
      }
    }

    this.sessionHippoNodState.set(params.sessionId, {
      lastOfferedAt: Date.now(),
      lastMessageCount: params.messageCount,
    });

    return [
      "## Optional Fathippo Cue",
      params.cue.reason,
      'If it fits naturally, you may include one very brief acknowledgement such as "🦛 Noted." or end one short sentence with "🦛".',
      "Rules:",
      "- This is optional, not required.",
      "- Use it at most once in this reply.",
      "- Only use it if the tone is friendly, calm, or neutral.",
      "- Skip it for urgent, frustrated, highly formal, or sensitive situations.",
      "- Do not mention internal scoring, retrieval policies, or training.",
      "- Keep the rest of the reply normal, direct, and useful.",
      "",
    ].join("\n");
  }

  private isHighUrgencyOrFormalMoment(message: string): boolean {
    const normalized = message.toLowerCase();
    return [
      "urgent",
      "asap",
      "immediately",
      "prod down",
      "production down",
      "sev1",
      "sev 1",
      "security incident",
      "breach",
      "privacy request",
      "gdpr",
      "legal",
      "compliance",
    ].some((token) => normalized.includes(token));
  }

  /**
   * Handle compaction via Dream Cycle
   */
  async compact(params: {
    sessionId: string;
    sessionFile: string;
    tokenBudget?: number;
    force?: boolean;
    currentTokenCount?: number;
    compactionTarget?: "budget" | "threshold";
    customInstructions?: string;
    legacyParams?: Record<string, unknown>;
  }): Promise<CompactResult> {
    void params;
    if (this.mode === "local") {
      return { ok: true, compacted: false, reason: "local mode has no hosted Dream Cycle" };
    }

    if (this.config.dreamCycleOnCompact === false) {
      // Fall back to default compaction
      return { ok: true, compacted: false, reason: "dreamCycleOnCompact disabled" };
    }

    try {
      const result = await this.client?.runDreamCycle({
        processCompleted: true,
        processEphemeral: true,
        synthesizeCritical: true,
        applyDecay: true,
        updateGraph: true,
      });
      if (!result) {
        return { ok: false, compacted: false, reason: "hosted client unavailable" };
      }

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
  async prepareSubagentSpawn(_params: {
    parentSessionKey: string;
    childSessionKey: string;
    ttlMs?: number;
  }): Promise<SubagentSpawnPreparation | undefined> {
    void _params;
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
  async onSubagentEnded(_params: {
    childSessionKey: string;
    reason: SubagentEndReason;
  }): Promise<void> {
    void _params;
    // Future: extract learnings from subagent session
    // and store them in parent's memory
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    this.cachedCritical = null;
    this.sessionApplicationIds.clear();
    this.sessionLocalProfiles.clear();
    this.sessionStartTimes.clear();
    this.sessionHippoNodState.clear();
  }

  // --- Helper methods ---

  private extractContent(message: AgentMessage): string | null {
    const msg = message as {
      content?: unknown;
      text?: unknown;
    };

    if (typeof msg.content === "string") {
      return msg.content;
    }
    if (typeof msg.text === "string") {
      return msg.text;
    }
    if (Array.isArray(msg.content)) {
      // Handle multi-part content (text blocks)
      const textParts = msg.content
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
      if (this.isRoleMessage(msg) && msg.role === "user") {
        return this.extractContent(msg);
      }
    }
    return null;
  }

  private isTrivialQuery(message: string): boolean {
    const trimmed = message.trim();
    if (!trimmed) {
      return true;
    }

    if (trimmed.length < 3) {
      return true;
    }

    const normalized = trimmed.toLowerCase().replace(/\s+/g, " ");
    if (FatHippoContextEngine.TRIVIAL_ACKS.has(normalized)) {
      return true;
    }

    if (/^[\p{P}\s]+$/u.test(trimmed)) {
      return true;
    }

    if (/^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\u200D|\uFE0F|\s)+$/u.test(trimmed)) {
      return true;
    }

    return false;
  }

  private isRoleMessage(
    message: AgentMessage
  ): message is AgentMessage & { role: string } {
    return (
      typeof message === "object" &&
      message !== null &&
      "role" in message &&
      typeof (message as { role?: unknown }).role === "string"
    );
  }

  private estimateMessageTokens(messages: AgentMessage[]): number {
    const plainText = messages
      .map((message) => this.extractContent(message))
      .filter((content): content is string => Boolean(content))
      .join("\n");
    return estimateTokens(plainText);
  }

  private constrainContextToBudget(
    memories: Memory[],
    syntheses: SynthesizedMemory[],
    contextBudget: number,
  ): { memories: Memory[]; syntheses: SynthesizedMemory[] } {
    if (contextBudget <= 0) {
      return { memories: [], syntheses: [] };
    }

    let remaining = contextBudget;
    const selectedSyntheses: SynthesizedMemory[] = [];
    const selectedMemories: Memory[] = [];

    const pushIfFits = (tokens: number): boolean => {
      if (tokens > remaining) {
        return false;
      }
      remaining -= tokens;
      return true;
    };

    for (const synthesis of syntheses) {
      const tokens = estimateTokens(`${synthesis.title}\n${synthesis.content}`);
      if (!pushIfFits(tokens)) {
        continue;
      }
      selectedSyntheses.push(synthesis);
    }

    const critical = memories.filter((memory) => memory.importanceTier === "critical");
    const high = memories.filter((memory) => memory.importanceTier === "high");
    const normal = memories.filter(
      (memory) => memory.importanceTier === "normal" || !memory.importanceTier,
    );

    for (const group of [critical, high, normal]) {
      for (const memory of group) {
        const tokens = estimateTokens(`${memory.title}\n${memory.content}`);
        if (!pushIfFits(tokens)) {
          continue;
        }
        selectedMemories.push(memory);
      }
    }

    return {
      memories: selectedMemories,
      syntheses: selectedSyntheses,
    };
  }

  private fitContextToBudget(params: {
    sections: string[];
    contextBudget: number;
  }): string {
    if (params.contextBudget <= 0) {
      return "";
    }

    let remaining = params.contextBudget;
    const selected: string[] = [];

    for (const section of params.sections.map((value) => value.trim()).filter(Boolean)) {
      const sectionTokens = estimateTokens(section);
      if (sectionTokens <= remaining) {
        selected.push(section);
        remaining -= sectionTokens;
        continue;
      }

      if (remaining <= 16) {
        break;
      }

      const truncated = this.truncateContextSection(section, remaining);
      if (truncated) {
        selected.push(truncated);
      }
      break;
    }

    return selected.join("\n\n");
  }

  private truncateContextSection(section: string, tokenBudget: number): string {
    let low = 0;
    let high = section.length;
    let best = "";

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = `${section.slice(0, mid).trimEnd()}\n...`;
      const tokens = estimateTokens(candidate);
      if (tokens <= tokenBudget) {
        best = candidate;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return best;
  }
}
