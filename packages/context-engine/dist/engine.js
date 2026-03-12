/**
 * FatHippo Context Engine
 *
 * Implements OpenClaw's ContextEngine interface for encrypted agent memory.
 */
import { FatHippoClient } from "./api/client.js";
import { buildStructuredTrace, getMessageText, shouldCaptureCodingTrace } from "./cognitive/trace-capture.js";
import { formatMemoriesForInjection, dedupeMemories, estimateTokens, } from "./utils/formatting.js";
import { detectPromptInjection, matchesCapturePatterns, sanitizeContent, } from "./utils/filtering.js";
/**
 * FatHippo Context Engine implementation
 */
export class FatHippoContextEngine {
    info = {
        id: "fathippo-context-engine",
        name: "FatHippo Context Engine",
        version: "0.1.1",
        ownsCompaction: true, // We handle compaction via Dream Cycle
    };
    client;
    config;
    cachedCritical = null;
    // Cognitive engine state
    sessionStartTimes = new Map();
    sessionApplicationIds = new Map();
    sessionHippoNodState = new Map();
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
    static HIPPO_NOD_COOLDOWN_MS = 15 * 60 * 1000;
    static HIPPO_NOD_MIN_MESSAGE_GAP = 6;
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
            this.sessionStartTimes.set(params.sessionId, Date.now());
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
        if (this.cognitiveEnabled) {
            await this.captureStructuredTrace({
                sessionId: params.sessionId,
                sessionFile: params.sessionFile,
                messages: params.messages,
            });
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
        let memoryHippoCue = null;
        let hasRelevantCriticalMatch = false;
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
            hasRelevantCriticalMatch = results.some((r) => r.memory.importanceTier === "critical" &&
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
            if (hasRelevantCriticalMatch || syntheses.length > 0) {
                memoryHippoCue = {
                    kind: "memory",
                    reason: "Fathippo recalled relevant memory for this reply.",
                };
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
        let cognitiveHippoCue = null;
        if (this.cognitiveEnabled && this.looksLikeCodingQuery(lastUserMessage)) {
            try {
                const cognitive = await this.fetchCognitiveContext(params.sessionId, lastUserMessage);
                if (cognitive.context) {
                    cognitiveContext = cognitive.context;
                    cognitiveHippoCue = cognitive.hippoCue;
                }
            }
            catch (error) {
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
                    constraintsContext,
                    memoryBlock ? `${memoryBlock}\n` : "",
                    indexedContext,
                    cognitiveContext,
                    hippoNodInstruction,
                ],
                contextBudget: Math.max(0, params.tokenBudget - baseMessageTokens),
            })
            : constraintsContext + (memoryBlock ? memoryBlock + "\n" : "") + indexedContext + cognitiveContext + hippoNodInstruction;
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
        const baseUrl = this.getApiBaseUrl();
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
        const baseUrl = this.getApiBaseUrl();
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
    async fetchCognitiveContext(sessionId, problem) {
        const baseUrl = this.getApiBaseUrl();
        const response = await fetch(`${baseUrl}/v1/cognitive/traces/relevant`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                sessionId,
                endpoint: "context-engine.assemble",
                problem,
                limit: 3,
                adaptivePolicy: this.config.adaptivePolicyEnabled !== false,
            }),
        });
        if (!response.ok) {
            return { context: null, hippoCue: null };
        }
        const data = await response.json();
        if (data.applicationId) {
            this.sessionApplicationIds.set(sessionId, data.applicationId);
        }
        const sections = new Map();
        if (data.workflow && data.workflow.steps.length > 0) {
            const stepLines = data.workflow.steps.map((step) => `- ${step}`).join("\n");
            const explorationNote = data.workflow.exploration ? " exploratory" : "";
            sections.set("workflow", `## Recommended Workflow\n${stepLines}\n\nStrategy: ${data.workflow.title} (${data.workflow.rationale}${explorationNote})`);
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
        let hippoCue = null;
        if (data.workflow && data.workflow.steps.length > 0) {
            hippoCue = {
                kind: "workflow",
                reason: "Fathippo surfaced a learned workflow for this task.",
            };
        }
        else if ((data.skills?.length ?? 0) > 0) {
            hippoCue = {
                kind: "learned_fix",
                reason: "Fathippo surfaced a synthesized skill for this task.",
            };
        }
        else if ((localPatterns.length + globalPatterns.length + (data.traces?.length ?? 0)) >= 2) {
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
            .filter((section) => typeof section === "string" && section.length > 0);
        if (orderedSections.length === 0) {
            return { context: null, hippoCue: null };
        }
        return {
            context: '\n' + orderedSections.join('\n\n') + '\n',
            hippoCue,
        };
    }
    async captureStructuredTrace(params) {
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
            const baseUrl = this.getApiBaseUrl();
            const response = await fetch(`${baseUrl}/v1/cognitive/traces`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${this.config.apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    ...payload,
                    applicationId: this.sessionApplicationIds.get(params.sessionId) ?? null,
                    shareEligible: this.config.shareEligibleByDefault !== false && payload.shareEligible,
                }),
            });
            if (!response.ok) {
                throw new Error(`Trace capture failed with status ${response.status}`);
            }
            this.sessionStartTimes.delete(params.sessionId);
            this.sessionApplicationIds.delete(params.sessionId);
        }
        catch (error) {
            console.error("[FatHippo] Trace capture error:", error);
            this.sessionStartTimes.set(params.sessionId, Date.now());
        }
    }
    async runCognitiveHeartbeat() {
        const baseUrl = this.getApiBaseUrl();
        const headers = {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
        };
        try {
            const response = await fetch(`${baseUrl}/v1/cognitive/patterns/extract`, {
                method: "POST",
                headers,
                body: JSON.stringify({}),
            });
            if (!response.ok) {
                throw new Error(`Pattern extraction failed with status ${response.status}`);
            }
        }
        catch (error) {
            console.error("[FatHippo] Pattern extraction heartbeat error:", error);
        }
        try {
            const response = await fetch(`${baseUrl}/v1/cognitive/skills/synthesize`, {
                method: "POST",
                headers,
                body: JSON.stringify({}),
            });
            if (!response.ok) {
                throw new Error(`Skill synthesis failed with status ${response.status}`);
            }
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
        const normalized = sessionFile.replace(/\\/g, "/");
        const segments = normalized.split("/").filter(Boolean);
        if (segments.length <= 1) {
            return normalized;
        }
        return `/${segments.slice(0, -1).join("/")}`;
    }
    getApiBaseUrl() {
        const baseUrl = this.config.baseUrl || "https://www.fathippo.com/api";
        return baseUrl.replace(/\/v1$/, "");
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
    async onSubagentEnded(_params) {
        void _params;
        // Future: extract learnings from subagent session
        // and store them in parent's memory
    }
    /**
     * Cleanup resources
     */
    async dispose() {
        this.cachedCritical = null;
        this.sessionHippoNodState.clear();
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