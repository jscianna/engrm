/**
 * FatHippo API Client
 */
const DEFAULT_BASE_URL = "https://www.fathippo.com/api";
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
    constructor(config) {
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    }
    async request(path, options = {}) {
        const url = `${this.baseUrl}${path}`;
        const headers = {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            ...options.headers,
        };
        const response = await fetch(url, {
            ...options,
            headers,
        });
        if (!response.ok) {
            const error = await response.text().catch(() => "Unknown error");
            throw new Error(`FatHippo API error: ${response.status} - ${error}`);
        }
        return response.json();
    }
    /**
     * Store a memory
     */
    async remember(params) {
        const response = await this.request("/v1/memories", {
            method: "POST",
            body: JSON.stringify(params),
        });
        return mapMemoryRecord(response.memory);
    }
    /**
     * Search memories
     */
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
    /**
     * Get critical-tier memories (for injection)
     */
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
    /**
     * Get recent memories (for context)
     */
    async getRecentMemories(options) {
        const params = new URLSearchParams();
        if (options?.limit)
            params.set("limit", String(options.limit));
        const response = await this.request(`/v1/memories?${params}`);
        let memories = response.memories.map(mapMemoryRecord);
        if (options?.hours) {
            const cutoff = Date.now() - options.hours * 60 * 60 * 1000;
            memories = memories.filter((memory) => Date.parse(memory.createdAt) >= cutoff);
        }
        return memories;
    }
    /**
     * Run Dream Cycle (synthesis, decay, cleanup)
     */
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
    /**
     * Get context for injection (optimized endpoint)
     */
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
    /**
     * Get indexed memory summaries (compact, for agent context)
     */
    async getIndexedSummaries() {
        return this.request("/v1/indexed");
    }
    /**
     * Dereference an indexed memory to get full content
     */
    async dereferenceIndex(indexKey) {
        return this.request(`/v1/indexed/${encodeURIComponent(indexKey)}`);
    }
    /**
     * Store an indexed memory
     */
    async storeIndexed(params) {
        return this.request("/v1/indexed", {
            method: "POST",
            body: JSON.stringify(params),
        });
    }
}
//# sourceMappingURL=client.js.map