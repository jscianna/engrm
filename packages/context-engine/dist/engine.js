/**
 * FatHippo Context Engine
 *
 * Implements OpenClaw's ContextEngine interface for hosted or local agent memory.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { createLocalMemoryStore, invalidateAllLocalResultsForUser, localRetrieve, localStoreResult, } from "@fathippo/local";
import { FatHippoClient, createFatHippoHostedRuntimeClient, } from "@fathippo/hosted";
import { buildStructuredTrace, getMessageText, shouldCaptureCodingTrace } from "./cognitive/trace-capture.js";
import { CONTEXT_ENGINE_ID, CONTEXT_ENGINE_VERSION } from "./version.js";
import { formatMemoriesForInjection, dedupeMemories, estimateTokens, } from "./utils/formatting.js";
import { detectPromptInjection, matchesCapturePatterns, sanitizeContent, } from "./utils/filtering.js";
import { profileCodebase, loadCodebaseProfile, formatCodebaseProfileForInjection } from "./profiler/index.js";
/**
 * FatHippo Context Engine implementation
 */
export class FatHippoContextEngine {
    info = {
        id: CONTEXT_ENGINE_ID,
        name: "FatHippo Context Engine",
        version: CONTEXT_ENGINE_VERSION,
        ownsCompaction: true, // We handle compaction via Dream Cycle
    };
    client;
    runtimeClient;
    config;
    mode;
    localStore;
    hostedSessions = new Map();
    // Cognitive engine state
    sessionStartTimes = new Map();
    sessionLocalProfiles = new Map();
    sessionHippoNodState = new Map();
    cognitiveEnabled;
    // Codebase profiling state
    sessionCodebaseProfiles = new Map();
    codebaseProfilingEnabled;
    static TRIVIAL_ACKS = new Set([
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
    static HIPPO_NOD_COOLDOWN_MS = 15 * 60 * 1000;
    static HIPPO_NOD_MIN_MESSAGE_GAP = 6;
    constructor(config) {
        this.config = config;
        this.mode = config.mode === "local" || (!config.apiKey && config.mode !== "hosted") ? "local" : "hosted";
        if (this.mode === "hosted" && !config.apiKey) {
            throw new Error("FatHippo hosted mode requires an API key. Pass apiKey or switch mode to local/auto.");
        }
        this.client = this.mode === "hosted" ? new FatHippoClient(config) : null;
        this.runtimeClient =
            this.mode === "hosted" && config.apiKey
                ? createFatHippoHostedRuntimeClient({
                    apiKey: config.apiKey,
                    baseUrl: config.baseUrl || "https://fathippo.ai/api",
                    runtime: this.buildHostedRuntimeMetadata(),
                })
                : null;
        this.localStore =
            this.mode === "local"
                ? createLocalMemoryStore({
                    storagePath: config.localStoragePath,
                })
                : null;
        // Enable cognitive features if configured (default: true)
        this.cognitiveEnabled = this.mode === "hosted" && config.cognitiveEnabled !== false;
        // Enable codebase profiling (default: true)
        this.codebaseProfilingEnabled = config.codebaseProfilingEnabled !== false;
    }
    /**
     * Initialize engine state for a session
     */
    async bootstrap(params) {
        try {
            this.sessionStartTimes.set(params.sessionId, Date.now());
            const workspaceRoot = this.detectWorkspaceRoot(params.sessionFile);
            // Trigger codebase profiling in background
            if (this.codebaseProfilingEnabled && workspaceRoot) {
                this.profileCodebaseAsync(workspaceRoot).catch((err) => {
                    console.error("[FatHippo] Background codebase profiling error:", err);
                });
            }
            if (this.mode === "local") {
                this.sessionLocalProfiles.set(params.sessionId, this.deriveLocalProfileId(params.sessionId, params.sessionFile));
                return {
                    bootstrapped: true,
                    importedMessages: 0,
                };
            }
            const runtimeClient = this.runtimeClient;
            if (!runtimeClient) {
                return {
                    bootstrapped: true,
                    importedMessages: 0,
                };
            }
            if (!this.hostedSessions.has(params.sessionId)) {
                const session = await runtimeClient.startSession({
                    firstMessage: "",
                    namespace: this.config.namespace,
                    metadata: {
                        openclawSessionId: params.sessionId,
                    },
                    runtime: this.buildHostedRuntimeMetadata({
                        sessionId: params.sessionId,
                        sessionFile: params.sessionFile,
                    }),
                });
                this.hostedSessions.set(params.sessionId, {
                    hostedSessionId: session.sessionId,
                    workspaceRoot,
                });
                return {
                    bootstrapped: true,
                    importedMessages: session.injectedMemories.length,
                };
            }
            return {
                bootstrapped: true,
                importedMessages: 0,
            };
        }
        catch (error) {
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
    async ingest(params) {
        void params;
        if (params.isHeartbeat) {
            return { ingested: false };
        }
        // Full-turn capture happens in afterTurn for both hosted and local modes.
        return { ingested: false };
    }
    /**
     * Ingest a batch of messages
     */
    async ingestBatch(params) {
        void params;
        if (params.isHeartbeat) {
            return { ingestedCount: 0 };
        }
        return { ingestedCount: 0 };
    }
    /**
     * Post-turn lifecycle processing
     */
    async afterTurn(params) {
        if (params.isHeartbeat) {
            if (this.cognitiveEnabled && this.config.cognitiveHeartbeatEnabled !== false) {
                await this.runCognitiveHeartbeat();
            }
            return;
        }
        const turnMessages = this.extractTurnMessages(params.messages, params.prePromptMessageCount);
        if (this.mode === "local") {
            await this.captureLocalTurnMemories({
                sessionId: params.sessionId,
                sessionFile: params.sessionFile,
                messages: turnMessages,
            });
            await this.captureLocalTrace({
                sessionId: params.sessionId,
                sessionFile: params.sessionFile,
                messages: params.messages,
            });
            return;
        }
        const runtimeClient = this.runtimeClient;
        const hostedSessionId = this.hostedSessions.get(params.sessionId)?.hostedSessionId;
        if (!runtimeClient || !hostedSessionId) {
            return;
        }
        try {
            await runtimeClient.recordTurn({
                sessionId: hostedSessionId,
                messages: turnMessages,
                memoriesUsed: [],
                captureUserOnly: this.config.captureUserOnly === true,
                captureConstraints: this.cognitiveEnabled,
                captureTrace: this.cognitiveEnabled,
                runtime: this.buildHostedRuntimeMetadata({
                    sessionId: params.sessionId,
                    sessionFile: params.sessionFile,
                }),
            });
        }
        catch (error) {
            console.error("[FatHippo] Record turn error:", error);
        }
    }
    detectToolsUsed(messages) {
        const tools = new Set();
        for (const message of messages) {
            // Check for tool result messages
            const msg = message;
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
    async assemble(params) {
        const lastUserMessage = this.findLastUserMessage(params.messages)?.trim() ?? "";
        const runtimeAwareness = this.buildRuntimeAwarenessInstruction();
        if (this.mode === "local") {
            return this.assembleLocalContext(params, lastUserMessage, runtimeAwareness);
        }
        const runtimeClient = this.runtimeClient;
        const hostedSession = this.hostedSessions.get(params.sessionId);
        if (!runtimeClient || !hostedSession) {
            return {
                messages: params.messages,
                estimatedTokens: this.estimateMessageTokens(params.messages),
            };
        }
        if (!lastUserMessage || this.isTrivialQuery(lastUserMessage)) {
            const baseTokens = this.estimateMessageTokens(params.messages);
            return {
                messages: params.messages,
                estimatedTokens: baseTokens + estimateTokens(runtimeAwareness),
                systemPromptAddition: runtimeAwareness.trim() || undefined,
            };
        }
        let hostedContext = "";
        let cue = null;
        try {
            const context = await runtimeClient.buildContext({
                sessionId: hostedSession.hostedSessionId,
                messages: this.toRuntimeMessages(params.messages),
                lastUserMessage,
                conversationId: this.config.conversationId || params.sessionId,
                includeIndexed: true,
                includeConstraints: this.cognitiveEnabled,
                includeCognitive: this.cognitiveEnabled,
                runtime: this.buildHostedRuntimeMetadata({
                    sessionId: params.sessionId,
                }),
            });
            hostedContext = context.systemPromptAddition ?? "";
            if (hostedContext.includes("## Recommended Workflow")) {
                cue = {
                    kind: "workflow",
                    reason: "Fathippo surfaced a learned workflow for this task.",
                };
            }
            else if (hostedContext.includes("## Learned Coding Patterns") ||
                hostedContext.includes("## Shared Global Patterns") ||
                hostedContext.includes("## Past Similar Problems")) {
                cue = {
                    kind: "learned_fix",
                    reason: "Fathippo surfaced learned fixes and similar past problems for this task.",
                };
            }
            else if (hostedContext.trim()) {
                cue = {
                    kind: "memory",
                    reason: "Fathippo recalled relevant memory for this reply.",
                };
            }
        }
        catch (error) {
            console.error("[FatHippo] Assemble error:", error);
        }
        const baseMessageTokens = this.estimateMessageTokens(params.messages);
        const hippoNodInstruction = this.buildHippoNodInstruction({
            sessionId: params.sessionId,
            messageCount: params.messages.length,
            lastUserMessage,
            cue,
        });
        const profileBlock = await this.getCodebaseProfileBlock(hostedSession.workspaceRoot);
        const fullContext = typeof params.tokenBudget === "number" && params.tokenBudget > 0
            ? this.fitContextToBudget({
                sections: [
                    runtimeAwareness,
                    profileBlock,
                    hostedContext,
                    hippoNodInstruction,
                ],
                contextBudget: Math.max(0, params.tokenBudget - baseMessageTokens),
            })
            : runtimeAwareness + profileBlock + hostedContext + hippoNodInstruction;
        const tokens = estimateTokens(fullContext) + baseMessageTokens;
        return {
            messages: params.messages,
            estimatedTokens: tokens,
            systemPromptAddition: fullContext.trim() || undefined,
        };
    }
    async assembleLocalContext(params, lastUserMessage, runtimeAwareness) {
        const profileId = this.getLocalProfileId(params.sessionId);
        const indexed = await this.localStore?.getIndexedSummaries({
            profileId,
            limit: 18,
        });
        const indexedContext = indexed && indexed.count > 0
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
        let memories = [];
        let localCognitiveContext = null;
        try {
            let localMemories = [];
            const cached = await localRetrieve(lastUserMessage, profileId);
            if (cached.hit) {
                localMemories = await this.localStore?.getMemoriesByIds(profileId, cached.memoryIds) ?? [];
            }
            if (localMemories.length === 0) {
                const searchResults = await this.localStore?.search({
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
        }
        catch (error) {
            console.error("[FatHippo] Local assemble error:", error);
        }
        const memoryBlock = formatMemoriesForInjection(memories, []);
        const workflowBlock = localCognitiveContext?.workflow
            ? `## Recommended Workflow\n${localCognitiveContext.workflow.steps.map((step) => `- ${step}`).join("\n")}\n\nStrategy: ${localCognitiveContext.workflow.title} (${localCognitiveContext.workflow.rationale})\n`
            : "";
        const patternBlock = localCognitiveContext && localCognitiveContext.patterns.length > 0
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
        const localProfileId = this.getLocalProfileId(params.sessionId);
        const profileBlock = await this.getCodebaseProfileBlock(localProfileId !== "openclaw-local-default" ? localProfileId : undefined);
        const fullContext = typeof params.tokenBudget === "number" && params.tokenBudget > 0
            ? this.fitContextToBudget({
                sections: [
                    runtimeAwareness,
                    profileBlock,
                    workflowBlock,
                    patternBlock,
                    memoryBlock ? `${memoryBlock}\n` : "",
                    indexedContext,
                    hippoNodInstruction,
                ],
                contextBudget: Math.max(0, params.tokenBudget - baseTokens),
            })
            : runtimeAwareness + profileBlock + workflowBlock + patternBlock + (memoryBlock ? memoryBlock + "\n" : "") + indexedContext + hippoNodInstruction;
        return {
            messages: params.messages,
            estimatedTokens: baseTokens + estimateTokens(fullContext),
            systemPromptAddition: fullContext.trim() || undefined,
        };
    }
    buildRuntimeAwarenessInstruction() {
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
    async runCognitiveHeartbeat() {
        if (!this.client) {
            return;
        }
        try {
            await this.client.extractCognitivePatterns({});
        }
        catch (error) {
            console.error("[FatHippo] Pattern extraction heartbeat error:", error);
        }
        try {
            await this.client.synthesizeCognitiveSkills({});
        }
        catch (error) {
            console.error("[FatHippo] Skill synthesis heartbeat error:", error);
        }
    }
    detectFilesModified(sessionFile, messages) {
        const files = new Set();
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
    detectWorkspaceRoot(sessionFile) {
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
    deriveLocalProfileId(sessionId, sessionFile) {
        if (this.config.localProfileId) {
            return this.config.localProfileId;
        }
        if (this.config.conversationId) {
            return this.config.conversationId;
        }
        const workspaceRoot = sessionFile ? this.detectWorkspaceRoot(sessionFile) : undefined;
        return workspaceRoot || this.sessionLocalProfiles.get(sessionId) || "openclaw-local-default";
    }
    getLocalProfileId(sessionId) {
        return this.sessionLocalProfiles.get(sessionId) || this.deriveLocalProfileId(sessionId);
    }
    buildLocalTitle(content) {
        const normalized = content.trim().replace(/\s+/g, " ");
        return normalized.length > 72 ? `${normalized.slice(0, 69)}...` : normalized;
    }
    mapLocalMemory(memory, profileId) {
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
    toLocalToolSignals(payload) {
        return [...payload.toolCalls, ...payload.toolResults]
            .filter((signal) => Boolean(signal) && typeof signal === "object" && !Array.isArray(signal))
            .map((signal) => ({
            category: typeof signal.category === "string" ? signal.category : undefined,
            command: typeof signal.command === "string" ? signal.command : undefined,
            success: typeof signal.success === "boolean" ? signal.success : undefined,
        }));
    }
    async captureLocalTrace(params) {
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
        }
        catch (error) {
            console.error("[FatHippo] Local trace capture error:", error);
            this.sessionStartTimes.set(params.sessionId, Date.now());
        }
    }
    buildHippoNodInstruction(params) {
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
    isHighUrgencyOrFormalMoment(message) {
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
    async compact(params) {
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
            return {
                ok: result.ok,
                compacted: true,
                reason: `Dream Cycle: ${result.synthesized || 0} synthesized, ${result.decayed || 0} decayed`,
            };
        }
        catch (error) {
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
    async prepareSubagentSpawn(_params) {
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
    async onSubagentEnded(params) {
        await this.endHostedSession(params.childSessionKey, this.mapHostedOutcomeFromReason(params.reason));
    }
    /**
     * Cleanup resources
     */
    async dispose() {
        await Promise.allSettled([...this.hostedSessions.keys()].map((sessionId) => this.endHostedSession(sessionId, "abandoned")));
        this.hostedSessions.clear();
        this.sessionLocalProfiles.clear();
        this.sessionStartTimes.clear();
        this.sessionHippoNodState.clear();
        this.sessionCodebaseProfiles.clear();
    }
    // --- Codebase profiling methods ---
    async profileCodebaseAsync(workspaceRoot) {
        if (!this.codebaseProfilingEnabled)
            return;
        if (this.sessionCodebaseProfiles.has(workspaceRoot))
            return;
        // Check for existing profile on disk first
        const existing = await loadCodebaseProfile(workspaceRoot);
        if (existing) {
            this.sessionCodebaseProfiles.set(workspaceRoot, existing);
            return;
        }
        // Profile in background
        try {
            const profile = await profileCodebase(workspaceRoot, { force: true });
            this.sessionCodebaseProfiles.set(workspaceRoot, profile);
        }
        catch (error) {
            console.error("[FatHippo] Codebase profiling failed:", error);
            this.sessionCodebaseProfiles.set(workspaceRoot, null);
        }
    }
    async getCodebaseProfileBlock(workspaceRoot) {
        if (!this.codebaseProfilingEnabled || !workspaceRoot)
            return "";
        // Check cache
        if (this.sessionCodebaseProfiles.has(workspaceRoot)) {
            const cached = this.sessionCodebaseProfiles.get(workspaceRoot);
            if (!cached)
                return "";
            return formatCodebaseProfileForInjection(cached);
        }
        // Try loading from disk
        const profile = await loadCodebaseProfile(workspaceRoot);
        if (profile) {
            this.sessionCodebaseProfiles.set(workspaceRoot, profile);
            return formatCodebaseProfileForInjection(profile);
        }
        return "";
    }
    // --- Helper methods ---
    extractContent(message) {
        const msg = message;
        if (typeof msg.content === "string") {
            return msg.content;
        }
        if (typeof msg.text === "string") {
            return msg.text;
        }
        if (Array.isArray(msg.content)) {
            // Handle multi-part content (text blocks)
            const textParts = msg.content
                .filter((p) => typeof p === "object" && p !== null && "type" in p && p.type === "text")
                .map((p) => p.text);
            return textParts.join("\n") || null;
        }
        return null;
    }
    buildHostedRuntimeMetadata(params) {
        const workspaceRoot = params?.sessionFile
            ? this.detectWorkspaceRoot(params.sessionFile)
            : params?.sessionId
                ? this.hostedSessions.get(params.sessionId)?.workspaceRoot
                : undefined;
        return {
            runtime: "openclaw",
            runtimeVersion: CONTEXT_ENGINE_VERSION,
            adapterVersion: CONTEXT_ENGINE_VERSION,
            namespace: this.config.namespace,
            installationId: this.config.installationId,
            workspaceId: this.config.workspaceId ?? workspaceRoot,
            workspaceRoot,
            conversationId: this.config.conversationId ?? params?.sessionId,
        };
    }
    toRuntimeMessages(messages) {
        return messages
            .map((message) => {
            const content = getMessageText(message).trim();
            if (!content) {
                return null;
            }
            const raw = message;
            const rawRole = typeof raw.role === "string"
                ? raw.role.toLowerCase()
                : typeof raw.type === "string"
                    ? raw.type.toLowerCase()
                    : "assistant";
            const role = rawRole === "system"
                ? "system"
                : rawRole === "user"
                    ? "user"
                    : rawRole === "tool" || rawRole === "toolresult"
                        ? "tool"
                        : "assistant";
            return {
                role,
                content,
                toolName: typeof raw.toolName === "string" ? raw.toolName : undefined,
            };
        })
            .filter((message) => message !== null);
    }
    extractTurnMessages(messages, prePromptMessageCount) {
        const sliced = Number.isFinite(prePromptMessageCount) && prePromptMessageCount >= 0
            ? messages.slice(prePromptMessageCount)
            : messages;
        const turnMessages = this.toRuntimeMessages(sliced);
        return turnMessages.length > 0 ? turnMessages : this.toRuntimeMessages(messages);
    }
    async captureLocalTurnMemories(params) {
        const profileId = this.deriveLocalProfileId(params.sessionId, params.sessionFile);
        this.sessionLocalProfiles.set(params.sessionId, profileId);
        const candidates = new Set();
        const durablePattern = /\b(decide|decided|decision|prefer|preference|always|never|must|remember|rule|workflow|process|plan|configured|set to|resolved|fixed|installed|created|updated)\b/i;
        const toolPattern = /\b(namespace|workspace|project|plugin|database|schema|endpoint|config|mode|version)\b/i;
        for (const message of params.messages) {
            if (this.config.captureUserOnly === true && message.role !== "user") {
                continue;
            }
            const segments = message.content
                .split(/\n{2,}|(?<=[.!?])\s+/)
                .map((segment) => segment.trim())
                .filter(Boolean);
            for (const segment of segments) {
                if (!segment || detectPromptInjection(segment) || !matchesCapturePatterns(segment)) {
                    continue;
                }
                if (message.role === "tool" &&
                    !(durablePattern.test(segment) && toolPattern.test(segment))) {
                    continue;
                }
                if (message.role === "assistant" && !durablePattern.test(segment)) {
                    continue;
                }
                candidates.add(sanitizeContent(segment));
            }
        }
        if (candidates.size === 0) {
            return;
        }
        for (const candidate of candidates) {
            await this.localStore?.remember({
                profileId,
                content: candidate,
                title: this.buildLocalTitle(candidate),
            });
        }
        invalidateAllLocalResultsForUser(profileId);
    }
    mapHostedOutcomeFromReason(reason) {
        const normalized = reason.toLowerCase();
        if (/success|completed|done|finished/.test(normalized)) {
            return "success";
        }
        if (/fail|error|crash/.test(normalized)) {
            return "failure";
        }
        return "abandoned";
    }
    async endHostedSession(sessionId, outcome) {
        const runtimeClient = this.runtimeClient;
        const hostedSession = this.hostedSessions.get(sessionId);
        if (!runtimeClient || !hostedSession) {
            return;
        }
        try {
            await runtimeClient.endSession({
                sessionId: hostedSession.hostedSessionId,
                outcome,
                runtime: this.buildHostedRuntimeMetadata({ sessionId }),
            });
        }
        catch (error) {
            console.error("[FatHippo] End session error:", error);
        }
        finally {
            this.hostedSessions.delete(sessionId);
            this.sessionStartTimes.delete(sessionId);
            this.sessionHippoNodState.delete(sessionId);
        }
    }
    findLastUserMessage(messages) {
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            if (this.isRoleMessage(msg) && msg.role === "user") {
                return this.extractContent(msg);
            }
        }
        return null;
    }
    isTrivialQuery(message) {
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
    isRoleMessage(message) {
        return (typeof message === "object" &&
            message !== null &&
            "role" in message &&
            typeof message.role === "string");
    }
    estimateMessageTokens(messages) {
        const plainText = messages
            .map((message) => this.extractContent(message))
            .filter((content) => Boolean(content))
            .join("\n");
        return estimateTokens(plainText);
    }
    constrainContextToBudget(memories, syntheses, contextBudget) {
        if (contextBudget <= 0) {
            return { memories: [], syntheses: [] };
        }
        let remaining = contextBudget;
        const selectedSyntheses = [];
        const selectedMemories = [];
        const pushIfFits = (tokens) => {
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
        const normal = memories.filter((memory) => memory.importanceTier === "normal" || !memory.importanceTier);
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
    fitContextToBudget(params) {
        if (params.contextBudget <= 0) {
            return "";
        }
        let remaining = params.contextBudget;
        const selected = [];
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
    truncateContextSection(section, tokenBudget) {
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
            }
            else {
                high = mid - 1;
            }
        }
        return best;
    }
}
//# sourceMappingURL=engine.js.map