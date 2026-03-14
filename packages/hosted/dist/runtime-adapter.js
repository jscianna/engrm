function normalizeApiBaseUrl(baseUrl) {
    const normalized = baseUrl.replace(/\/+$/, "");
    if (normalized.endsWith("/api/v1")) {
        return normalized.slice(0, -3);
    }
    if (normalized.endsWith("/api")) {
        return normalized;
    }
    return `${normalized}/api`;
}
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function pickLastUserMessage(messages) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message.role === "user" && isNonEmptyString(message.content)) {
            return message.content.trim();
        }
    }
    return "";
}
function formatMemoryList(memories) {
    return memories.map((memory) => {
        const title = memory.title.trim() || "Memory";
        const text = memory.text.trim();
        return text ? `- ${title}: ${text}` : `- ${title}`;
    });
}
function formatTieredContext(context) {
    const sections = [];
    if ((context.critical?.length ?? 0) > 0) {
        sections.push(`## Critical Memory\n${formatMemoryList(context.critical ?? []).join("\n")}`);
    }
    if ((context.working?.length ?? 0) > 0) {
        sections.push(`## Working Memory\n${formatMemoryList(context.working ?? []).join("\n")}`);
    }
    if ((context.high?.length ?? 0) > 0) {
        sections.push(`## Relevant Memory\n${formatMemoryList(context.high ?? []).join("\n")}`);
    }
    return sections.join("\n\n");
}
function mapInjectedMemories(memories, source) {
    return (memories ?? []).map((memory) => ({
        id: memory.id,
        title: memory.title,
        text: memory.text,
        type: memory.type,
        tier: memory.tier,
        source,
    }));
}
function parseNumberHeader(headers, name) {
    const value = headers.get(name);
    if (!value) {
        return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}
export class FatHippoHostedRuntimeClient {
    apiKey;
    baseUrl;
    fetchImpl;
    defaultRuntime;
    constructor(options) {
        this.apiKey = options.apiKey;
        this.baseUrl = normalizeApiBaseUrl(options.baseUrl);
        this.fetchImpl = options.fetchImpl ?? fetch;
        this.defaultRuntime = {
            runtime: "custom",
            ...options.runtime,
        };
    }
    async startSession(input) {
        const response = await this.requestJson("/v1/sessions/start", {
            method: "POST",
            runtime: input.runtime,
            body: JSON.stringify({
                firstMessage: input.firstMessage,
                namespace: input.namespace ?? this.resolveRuntime(input.runtime).namespace,
                metadata: input.metadata,
            }),
        });
        const injectedMemories = [
            ...mapInjectedMemories(response.context?.critical, "critical"),
            ...mapInjectedMemories(response.context?.high, "high"),
        ];
        return {
            sessionId: response.sessionId,
            systemPromptAddition: formatTieredContext(response.context ?? {}),
            injectedMemories,
            tokensInjected: response.stats?.tokensInjected,
            criticalCount: response.stats?.criticalCount,
            highCount: response.stats?.highCount,
        };
    }
    async buildContext(input) {
        const runtime = this.resolveRuntime(input.runtime);
        const message = input.lastUserMessage?.trim() || pickLastUserMessage(input.messages);
        const response = await this.requestText("/v1/simple/context", {
            method: "POST",
            runtime: input.runtime,
            body: JSON.stringify({
                message,
                conversationId: input.conversationId ?? runtime.conversationId,
                maxCritical: input.maxCritical,
                maxRelevant: input.maxRelevant,
            }),
        });
        return {
            systemPromptAddition: response.text,
            injectedMemories: [],
            sensitiveOmitted: parseNumberHeader(response.headers, "X-FatHippo-Sensitive-Omitted"),
            evaluationId: response.headers.get("X-FatHippo-Eval-Id") ?? undefined,
            retrievalConfidence: parseNumberHeader(response.headers, "X-FatHippo-Retrieval-Confidence"),
        };
    }
    async recordTurn(input) {
        const response = await this.requestJson(`/v1/sessions/${encodeURIComponent(input.sessionId)}/turn`, {
            method: "POST",
            runtime: input.runtime,
            body: JSON.stringify({
                turnNumber: input.turnNumber,
                messages: input.messages,
                memoriesUsed: input.memoriesUsed ?? [],
            }),
        });
        const injectedMemories = [
            ...mapInjectedMemories(response.newContext?.critical, "refresh"),
            ...mapInjectedMemories(response.newContext?.high, "refresh"),
        ];
        const systemPromptAddition = response.newContext
            ? formatTieredContext(response.newContext)
            : undefined;
        return {
            turnNumber: response.turnNumber,
            refreshNeeded: response.refreshNeeded,
            systemPromptAddition: systemPromptAddition || undefined,
            injectedMemories,
            memoriesUsed: response.memoriesUsed ?? input.memoriesUsed ?? [],
        };
    }
    async remember(input) {
        const response = await this.requestJson("/v1/simple/remember", {
            method: "POST",
            runtime: input.runtime,
            body: JSON.stringify({
                text: input.text,
                title: input.title,
            }),
        });
        return {
            memoryId: response.id,
            stored: response.stored !== false,
            consolidated: response.consolidated,
            warning: response.warning,
        };
    }
    async search(input) {
        const runtime = this.resolveRuntime(input.runtime);
        const response = await this.requestJson("/v1/search", {
            method: "POST",
            runtime: input.runtime,
            body: JSON.stringify({
                query: input.query,
                topK: input.limit,
                since: input.since,
                namespace: input.namespace ?? runtime.namespace,
            }),
        });
        return response.map((result) => ({
            id: result.memory.id || result.id,
            title: result.memory.title,
            text: result.memory.text,
            score: result.score,
            memoryType: result.memory.memoryType,
            provenance: result.provenance,
        }));
    }
    async endSession(input) {
        return this.requestJson(`/v1/sessions/${encodeURIComponent(input.sessionId)}/end`, {
            method: "POST",
            runtime: input.runtime,
            body: JSON.stringify({
                outcome: input.outcome,
                feedback: input.feedback,
            }),
        });
    }
    resolveRuntime(runtime) {
        return {
            ...this.defaultRuntime,
            ...runtime,
            runtime: runtime?.runtime ?? this.defaultRuntime.runtime,
        };
    }
    buildHeaders(runtime) {
        const resolved = this.resolveRuntime(runtime);
        const headers = {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            "X-Fathippo-Runtime": resolved.runtime,
        };
        if (resolved.runtimeVersion) {
            headers["X-Fathippo-Runtime-Version"] = resolved.runtimeVersion;
        }
        if (resolved.adapterVersion) {
            headers["X-Fathippo-Adapter-Version"] = resolved.adapterVersion;
        }
        if (resolved.namespace) {
            headers["X-Fathippo-Namespace"] = resolved.namespace;
        }
        if (resolved.workspaceId) {
            headers["X-Fathippo-Workspace-Id"] = resolved.workspaceId;
        }
        if (resolved.workspaceRoot) {
            headers["X-Fathippo-Workspace-Root"] = resolved.workspaceRoot;
        }
        if (resolved.installationId) {
            headers["X-Fathippo-Installation-Id"] = resolved.installationId;
        }
        if (resolved.conversationId) {
            headers["X-Fathippo-Conversation-Id"] = resolved.conversationId;
        }
        if (resolved.agentId) {
            headers["X-Fathippo-Agent-Id"] = resolved.agentId;
        }
        if (resolved.model) {
            headers["X-Fathippo-Model"] = resolved.model;
        }
        return headers;
    }
    async requestJson(path, init) {
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
            method: init.method,
            headers: this.buildHeaders(init.runtime),
            body: init.body,
        });
        if (!response.ok) {
            const error = await response.text().catch(() => "Unknown error");
            throw new Error(`FatHippo request failed with ${response.status}: ${error}`);
        }
        return response.json();
    }
    async requestText(path, init) {
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
            method: init.method,
            headers: this.buildHeaders(init.runtime),
            body: init.body,
        });
        if (!response.ok) {
            const error = await response.text().catch(() => "Unknown error");
            throw new Error(`FatHippo request failed with ${response.status}: ${error}`);
        }
        return {
            text: await response.text(),
            headers: response.headers,
        };
    }
}
export function createFatHippoHostedRuntimeClient(options) {
    return new FatHippoHostedRuntimeClient(options);
}
//# sourceMappingURL=runtime-adapter.js.map