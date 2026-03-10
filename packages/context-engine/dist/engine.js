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
    // Cognitive engine state
    sessionStartTimes = new Map();
    cognitiveEnabled;
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
        // Enable cognitive features if configured (default: true)
        this.cognitiveEnabled = config.cognitiveEnabled !== false;
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
        // Auto-detect constraints from user messages
        if (this.cognitiveEnabled && this.isRoleMessage(params.message) && params.message.role === "user") {
            this.maybeStoreConstraint(content).catch(() => { }); // Fire and forget
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
        // Capture cognitive trace for coding sessions
        if (this.cognitiveEnabled) {
            await this.maybeCaptureTrace(params.sessionId, params.messages);
        }
    }
    /**
     * Capture a trace if this looks like a completed coding task
     */
    async maybeCaptureTrace(sessionId, messages) {
        // Need at least 4 messages (user, assistant, maybe more back-and-forth)
        if (messages.length < 4)
            return;
        // Check if this looks like a coding conversation
        const allText = messages.map(m => this.getMessageText(m)).join(' ').toLowerCase();
        if (!this.looksLikeCodingQuery(allText))
            return;
        // Extract problem from first user message
        const firstUserMsg = messages.find(m => m.role === 'user');
        if (!firstUserMsg)
            return;
        const problem = this.getMessageText(firstUserMsg).slice(0, 500);
        // Extract reasoning from assistant thinking blocks
        const reasoning = this.extractReasoning(messages);
        if (!reasoning || reasoning.length < 50)
            return; // Skip if no meaningful reasoning
        // Detect outcome from last messages
        const outcome = this.detectOutcome(messages);
        // Extract solution from last assistant message if success
        let solution;
        if (outcome === 'success') {
            const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
            if (lastAssistant) {
                solution = this.getMessageText(lastAssistant).slice(0, 1000);
            }
        }
        // Detect technologies
        const technologies = this.detectTechnologies(allText);
        // Get session start time or set it
        if (!this.sessionStartTimes.has(sessionId)) {
            this.sessionStartTimes.set(sessionId, Date.now() - 60000); // Estimate 1 min ago
        }
        const startTime = this.sessionStartTimes.get(sessionId);
        const durationMs = Date.now() - startTime;
        // Skip very short sessions
        if (durationMs < 10000)
            return; // Less than 10 seconds
        // Capture the trace
        try {
            const baseUrl = this.config.baseUrl?.replace('/v1', '') || 'https://fathippo.ai/api';
            await fetch(`${baseUrl}/v1/cognitive/traces`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sessionId,
                    type: this.detectProblemType(allText),
                    problem: this.sanitizeForStorage(problem),
                    context: { technologies },
                    reasoning: this.sanitizeForStorage(reasoning),
                    approaches: [],
                    solution: solution ? this.sanitizeForStorage(solution) : undefined,
                    outcome,
                    toolsUsed: this.detectToolsUsed(messages),
                    filesModified: [],
                    durationMs,
                    sanitized: true,
                    sanitizedAt: new Date().toISOString(),
                }),
            });
            // Reset session start time
            this.sessionStartTimes.delete(sessionId);
        }
        catch (error) {
            console.error('[FatHippo] Trace capture error:', error);
        }
    }
    extractReasoning(messages) {
        const thinkingBlocks = [];
        for (const message of messages) {
            if (message.role !== 'assistant')
                continue;
            const content = message.content;
            if (Array.isArray(content)) {
                for (const block of content) {
                    if (typeof block === 'object' && 'thinking' in block && block.thinking) {
                        thinkingBlocks.push(String(block.thinking));
                    }
                }
            }
        }
        return thinkingBlocks.join('\n\n').slice(0, 3000);
    }
    detectOutcome(messages) {
        const recentText = messages.slice(-3).map(m => this.getMessageText(m)).join(' ').toLowerCase();
        const successWords = ['fixed', 'works', 'done', 'complete', 'success', 'resolved', 'passing'];
        const failWords = ['still broken', 'not working', 'failed', 'error persists', 'stuck'];
        const successScore = successWords.filter(w => recentText.includes(w)).length;
        const failScore = failWords.filter(w => recentText.includes(w)).length;
        if (successScore > failScore)
            return 'success';
        if (failScore > successScore)
            return 'failed';
        return 'partial';
    }
    detectProblemType(text) {
        if (/debug|bug|error|fix|broken/.test(text))
            return 'debugging';
        if (/refactor|clean|reorganize/.test(text))
            return 'refactoring';
        if (/review|check|audit/.test(text))
            return 'reviewing';
        if (/config|setup|install/.test(text))
            return 'configuring';
        return 'building';
    }
    detectTechnologies(text) {
        const techs = [];
        const patterns = {
            typescript: /typescript|\.tsx?/i,
            javascript: /javascript|\.jsx?/i,
            react: /react|jsx|usestate/i,
            nextjs: /next\.?js|app router/i,
            turso: /turso|libsql/i,
            postgres: /postgres|psql/i,
            python: /python|\.py/i,
            docker: /docker|container/i,
        };
        for (const [tech, pattern] of Object.entries(patterns)) {
            if (pattern.test(text))
                techs.push(tech);
        }
        return techs;
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
    sanitizeForStorage(text) {
        // Basic secret sanitization
        const patterns = [
            /sk-[a-zA-Z0-9]{32,}/g,
            /ghp_[a-zA-Z0-9]{36,}/g,
            /mem_[a-zA-Z0-9]{32,}/g,
            /AKIA[A-Z0-9]{16}/g,
            /(['"]?)(?:api[_-]?key|secret|password|token)(['"]?\s*[:=]\s*)(['"]?)[\w\-\.]+\3/gi,
        ];
        let result = text;
        for (const pattern of patterns) {
            result = result.replace(pattern, '[REDACTED]');
        }
        return result;
    }
    getMessageText(message) {
        const msg = message;
        // Handle string content directly
        if (typeof msg.content === 'string')
            return msg.content;
        // Handle array content (with text blocks)
        if (Array.isArray(msg.content)) {
            return msg.content
                .filter(b => typeof b === 'object' && b !== null && typeof b.text === 'string')
                .map(b => String(b.text))
                .join('\n');
        }
        // Handle text field directly
        if (typeof msg.text === 'string')
            return msg.text;
        return '';
    }
    /**
     * Assemble context for the model
     */
    async assemble(params) {
        const lastUserMessage = this.findLastUserMessage(params.messages)?.trim() ?? "";
        // Always fetch indexed summaries (they're compact)
        let indexedContext = "";
        try {
            const indexed = await this.client.getIndexedSummaries();
            if (indexed.count > 0) {
                indexedContext = `\n## Indexed Memory (use GET /indexed/:key for full content)\n${indexed.contextFormat}\n`;
            }
        }
        catch {
            // Indexed memories are optional, don't fail on error
        }
        if (!lastUserMessage || this.isTrivialQuery(lastUserMessage)) {
            // Still include indexed summaries even for trivial queries
            const baseTokens = this.estimateMessageTokens(params.messages);
            return {
                messages: params.messages,
                estimatedTokens: baseTokens + estimateTokens(indexedContext),
                systemPromptAddition: indexedContext || undefined,
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
        // Format memories for injection, include indexed summaries
        const memoryBlock = formatMemoriesForInjection(memories, syntheses);
        // Fetch constraints (always inject - these are critical rules)
        let constraintsContext = "";
        if (this.cognitiveEnabled) {
            try {
                constraintsContext = await this.fetchConstraints();
            }
            catch (error) {
                console.error("[FatHippo] Constraints fetch error:", error);
            }
        }
        // Fetch cognitive context (traces + patterns) for coding sessions
        let cognitiveContext = "";
        if (this.cognitiveEnabled && this.looksLikeCodingQuery(lastUserMessage)) {
            try {
                const cognitive = await this.fetchCognitiveContext(lastUserMessage);
                if (cognitive) {
                    cognitiveContext = cognitive;
                }
            }
            catch (error) {
                console.error("[FatHippo] Cognitive context error:", error);
            }
        }
        const fullContext = constraintsContext + (memoryBlock ? memoryBlock + "\n" : "") + indexedContext + cognitiveContext;
        const tokens = estimateTokens(fullContext) + baseMessageTokens;
        return {
            messages: params.messages,
            estimatedTokens: tokens,
            systemPromptAddition: fullContext.trim() || undefined,
        };
    }
    /**
     * Check if query looks like a coding task
     */
    looksLikeCodingQuery(query) {
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
    async fetchConstraints() {
        const baseUrl = this.config.baseUrl?.replace('/v1', '') || 'https://fathippo.ai/api';
        const response = await fetch(`${baseUrl}/v1/cognitive/constraints`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
            },
        });
        if (!response.ok)
            return '';
        const data = await response.json();
        return data.contextFormat || '';
    }
    /**
     * Auto-detect and store constraints from user message
     */
    async maybeStoreConstraint(message) {
        const baseUrl = this.config.baseUrl?.replace('/v1', '') || 'https://fathippo.ai/api';
        try {
            await fetch(`${baseUrl}/v1/cognitive/constraints`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message }),
            });
        }
        catch {
            // Constraint detection is best-effort
        }
    }
    /**
     * Fetch relevant traces and patterns from cognitive API
     */
    async fetchCognitiveContext(problem) {
        const baseUrl = this.config.baseUrl?.replace('/v1', '') || 'https://fathippo.ai/api';
        const response = await fetch(`${baseUrl}/v1/cognitive/traces/relevant`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ problem, limit: 3 }),
        });
        if (!response.ok)
            return null;
        const data = await response.json();
        const sections = [];
        // Format patterns (most actionable)
        if (data.patterns && data.patterns.length > 0) {
            const patternLines = data.patterns.map(p => `• [${p.domain}] ${p.approach.slice(0, 200)} (${Math.round(p.confidence * 100)}% confidence)`).join('\n');
            sections.push(`## Learned Coding Patterns\n${patternLines}`);
        }
        // Format traces
        if (data.traces && data.traces.length > 0) {
            const traceLines = data.traces.map(t => {
                const icon = t.outcome === 'success' ? '✓' : t.outcome === 'failed' ? '✗' : '~';
                const solution = t.solution ? ` → ${t.solution.slice(0, 80)}...` : '';
                return `• ${icon} ${t.problem.slice(0, 80)}${solution}`;
            }).join('\n');
            sections.push(`## Past Similar Problems\n${traceLines}`);
        }
        if (sections.length === 0)
            return null;
        return '\n' + sections.join('\n\n') + '\n';
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