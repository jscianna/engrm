/**
 * Shared FatHippo hosted API client.
 *
 * Runtime-specific adapters should depend on this package instead of
 * reimplementing hosted HTTP calls locally.
 */
const DEFAULT_BASE_URL = "https://fathippo.ai/api";
function mapMemoryRecord(record) {
    return {
        id: record.id,
        title: record.title,
        content: record.text,
        userId: record.userId ?? "",
        memoryType: record.memoryType ?? record.type,
        importanceTier: record.importanceTier ??
            record.tier ??
            "normal",
        createdAt: record.createdAt,
        updatedAt: record.createdAt,
        accessCount: record.accessCount,
        absorbed: record.absorbed,
        absorbedIntoSynthesisId: record.absorbedIntoSynthesisId,
    };
}
export class FatHippoClient {
    apiKey;
    baseUrl;
    headers;
    constructor(options) {
        this.apiKey = options.apiKey ?? "";
        this.baseUrl = options.baseUrl || DEFAULT_BASE_URL;
        const runtimeHeaders = {};
        if (options.runtime) {
            runtimeHeaders["X-Fathippo-Runtime"] = options.runtime;
        }
        if (options.namespace) {
            runtimeHeaders["X-Fathippo-Namespace"] = options.namespace;
        }
        if (options.installationId) {
            runtimeHeaders["X-Fathippo-Installation-Id"] = options.installationId;
        }
        if (options.workspaceId) {
            runtimeHeaders["X-Fathippo-Workspace-Id"] = options.workspaceId;
        }
        this.headers = {
            "X-Fathippo-Plugin-Id": options.pluginId ?? "fathippo-context-engine",
            "X-Fathippo-Plugin-Version": options.pluginVersion ?? "unknown",
            "X-Fathippo-Plugin-Mode": options.mode === "local" ? "local" : "hosted",
            ...runtimeHeaders,
            ...(options.additionalHeaders ?? {}),
        };
    }
    async request(path, options = {}) {
        const response = await fetch(`${this.baseUrl}${path}`, {
            ...options,
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
                ...this.headers,
                ...(options.headers ?? {}),
            },
        });
        if (!response.ok) {
            const error = await response.text().catch(() => "Unknown error");
            throw new Error(`FatHippo API error: ${response.status} - ${error}`);
        }
        return response.json();
    }
    async remember(params) {
        const response = await this.request("/v1/memories", {
            method: "POST",
            body: JSON.stringify(params),
        });
        return mapMemoryRecord(response.memory);
    }
    async search(params) {
        const response = await this.request("/v1/search", {
            method: "POST",
            body: JSON.stringify(params),
        });
        return response.map((result) => ({
            memory: mapMemoryRecord(result.memory),
            score: result.score,
            matchType: result.vectorScore && result.bm25Score
                ? "hybrid"
                : result.vectorScore
                    ? "vector"
                    : "bm25",
        }));
    }
    async getCriticalMemories(options) {
        const response = await this.request("/v1/context", {
            method: "POST",
            body: JSON.stringify({
                message: "",
                includeHigh: false,
                highLimit: 0,
            }),
        });
        const memories = response.critical
            .map(mapMemoryRecord)
            .filter((memory) => (options?.excludeAbsorbed ? !memory.absorbed : true))
            .slice(0, options?.limit ?? 30);
        const syntheses = response.working.slice(0, options?.limit ?? 30).map((item) => ({
            id: item.id,
            userId: "",
            title: item.title,
            content: item.text,
            sourceMemoryIds: item.synthesizedFrom ?? [],
            createdAt: new Date().toISOString(),
        }));
        return { memories, syntheses };
    }
    async getRecentMemories(options) {
        const params = new URLSearchParams();
        if (options?.limit) {
            params.set("limit", String(options.limit));
        }
        const response = await this.request(`/v1/memories?${params}`);
        let memories = response.memories.map(mapMemoryRecord);
        if (options?.hours) {
            const cutoff = Date.now() - options.hours * 60 * 60 * 1000;
            memories = memories.filter((memory) => Date.parse(memory.createdAt) >= cutoff);
        }
        return memories;
    }
    async runDreamCycle(params) {
        const response = await this.request("/v1/lifecycle", {
            method: "POST",
            body: JSON.stringify(params || {}),
        });
        return {
            ok: true,
            synthesized: 0,
            decayed: (response.maintenance?.archived ?? 0) + (response.maintenance?.deleted ?? 0),
        };
    }
    async getContext(query) {
        const response = await this.request("/v1/context", {
            method: "POST",
            body: JSON.stringify({ message: query || "" }),
        });
        return {
            memories: [...response.critical, ...response.high].map(mapMemoryRecord),
            syntheses: response.working?.map((item) => ({
                id: item.id,
                title: item.title,
                content: item.text,
            })),
            tokenEstimate: response.stats?.totalTokensEstimate,
        };
    }
    async getIndexedSummaries() {
        return this.request("/v1/indexed");
    }
    async dereferenceIndex(indexKey) {
        return this.request(`/v1/indexed/${encodeURIComponent(indexKey)}`);
    }
    async storeIndexed(params) {
        return this.request("/v1/indexed", {
            method: "POST",
            body: JSON.stringify(params),
        });
    }
    async getConstraints() {
        return this.request("/v1/cognitive/constraints", {
            method: "GET",
        });
    }
    async storeConstraint(params) {
        return this.request("/v1/cognitive/constraints", {
            method: "POST",
            body: JSON.stringify(params),
        });
    }
    async getRelevantCognitiveContext(params) {
        return this.request("/v1/cognitive/traces/relevant", {
            method: "POST",
            body: JSON.stringify(params),
        });
    }
    async captureCognitiveTrace(params) {
        return this.request("/v1/cognitive/traces", {
            method: "POST",
            body: JSON.stringify(params),
        });
    }
    async extractCognitivePatterns(params) {
        return this.request("/v1/cognitive/patterns/extract", {
            method: "POST",
            body: JSON.stringify(params ?? {}),
        });
    }
    async synthesizeCognitiveSkills(params) {
        return this.request("/v1/cognitive/skills/synthesize", {
            method: "POST",
            body: JSON.stringify(params ?? {}),
        });
    }
    async submitPatternFeedback(params) {
        return this.request("/v1/cognitive/patterns/feedback", {
            method: "POST",
            body: JSON.stringify({
                patternId: params.patternId,
                traceId: params.traceId,
                outcome: params.outcome,
                notes: params.notes,
            }),
        });
    }
}
//# sourceMappingURL=client.js.map