/**
 * FatHippo Context Engine
 *
 * Implements OpenClaw's ContextEngine interface for encrypted agent memory.
 */
import { FatHippoClient } from "./api/client.js";
import { formatMemoriesForInjection, dedupeMemories, estimateTokens, } from "./utils/formatting.js";
import { detectPromptInjection, matchesCapturePatterns, sanitizeContent, } from "./utils/filtering.js";
/**
 * FatHippo Context Engine implementation
 */
export class FatHippoContextEngine {
    info = {
        id: "fathippo-context-engine",
        name: "FatHippo Context Engine",
        version: "0.1.0",
        ownsCompaction: true, // We handle compaction via Dream Cycle
    };
    client;
    config;
    cachedCritical = null;
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
    static MIN_VECTOR_SIMILARITY = 0.75;
    static MIN_CRITICAL_RELEVANCE = 0.7;
    constructor(config) {
        this.config = config;
        this.client = new FatHippoClient(config);
    }
    /**
     * Initialize engine state for a session
     */
    async bootstrap(params) {
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
        // Skip heartbeat messages
        if (params.isHeartbeat) {
            return { ingested: false };
        }
        // Only capture user messages (configurable)
        if (this.config.captureUserOnly !== false &&
            (!this.isRoleMessage(params.message) || params.message.role !== "user")) {
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
        }
        catch (error) {
            console.error("[FatHippo] Ingest error:", error);
            return { ingested: false };
        }
    }
    /**
     * Ingest a batch of messages
     */
    async ingestBatch(params) {
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
            if (result.ingested)
                ingestedCount++;
        }
        return { ingestedCount };
    }
    /**
     * Post-turn lifecycle processing
     */
    async afterTurn(params) {
        // Don't process heartbeat turns
        if (params.isHeartbeat)
            return;
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
    async assemble(params) {
        const lastUserMessage = this.findLastUserMessage(params.messages)?.trim() ?? "";
        if (!lastUserMessage || this.isTrivialQuery(lastUserMessage)) {
            return {
                messages: params.messages,
                estimatedTokens: this.estimateMessageTokens(params.messages),
            };
        }
        // Fetch relevant memories based on last user message
        let memories = [];
        let syntheses = [];
        try {
            // Search for relevant memories based on query
            const results = await this.client.search({
                query: lastUserMessage,
                limit: this.config.injectLimit || 20,
                excludeAbsorbed: true,
            });
            const qualifyingResults = results.filter((r) => r.score >= FatHippoContextEngine.MIN_VECTOR_SIMILARITY);
            const searchedMemories = qualifyingResults.map((r) => r.memory);
            memories = dedupeMemories(searchedMemories);
            // Inject critical only for non-trivial queries with critical relevance.
            const hasRelevantCriticalMatch = results.some((r) => r.memory.importanceTier === "critical" &&
                r.score > FatHippoContextEngine.MIN_CRITICAL_RELEVANCE);
            if (this.config.injectCritical !== false && hasRelevantCriticalMatch) {
                let criticalMemories;
                let criticalSyntheses;
                if (this.cachedCritical &&
                    Date.now() - this.cachedCritical.fetchedAt < 5 * 60 * 1000) {
                    criticalMemories = this.cachedCritical.memories;
                    criticalSyntheses = this.cachedCritical.syntheses;
                }
                else {
                    const critical = await this.client.getCriticalMemories({
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
        }
        catch (error) {
            console.error("[FatHippo] Assemble error:", error);
        }
        const baseMessageTokens = this.estimateMessageTokens(params.messages);
        if (typeof params.tokenBudget === "number" && params.tokenBudget > 0) {
            const contextBudget = Math.max(0, params.tokenBudget - baseMessageTokens);
            const constrained = this.constrainContextToBudget(memories, syntheses, contextBudget);
            memories = constrained.memories;
            syntheses = constrained.syntheses;
        }
        // Format memories for injection
        const memoryBlock = formatMemoriesForInjection(memories, syntheses);
        const tokens = estimateTokens(memoryBlock) + baseMessageTokens;
        return {
            messages: params.messages,
            estimatedTokens: tokens,
            systemPromptAddition: memoryBlock || undefined,
        };
    }
    /**
     * Handle compaction via Dream Cycle
     */
    async compact(params) {
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
    async prepareSubagentSpawn(params) {
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
        // Future: extract learnings from subagent session
        // and store them in parent's memory
    }
    /**
     * Cleanup resources
     */
    async dispose() {
        this.cachedCritical = null;
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
}
//# sourceMappingURL=engine.js.map