/**
 * FatHippo API Client
 */
const DEFAULT_BASE_URL = "https://www.fathippo.com/api";
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
        return this.request("/v1/memories", {
            method: "POST",
            body: JSON.stringify(params),
        });
    }
    /**
     * Search memories
     */
    async search(params) {
        const response = await this.request("/v1/search", {
            method: "POST",
            body: JSON.stringify(params),
        });
        return response.results;
    }
    /**
     * Get critical-tier memories (for injection)
     */
    async getCriticalMemories(options) {
        const params = new URLSearchParams();
        if (options?.limit)
            params.set("limit", String(options.limit));
        if (options?.excludeAbsorbed)
            params.set("excludeAbsorbed", "true");
        return this.request(`/v1/memories/critical?${params}`);
    }
    /**
     * Get recent memories (for context)
     */
    async getRecentMemories(options) {
        const params = new URLSearchParams();
        if (options?.hours)
            params.set("hours", String(options.hours));
        if (options?.limit)
            params.set("limit", String(options.limit));
        const response = await this.request(`/v1/memories/recent?${params}`);
        return response.memories;
    }
    /**
     * Run Dream Cycle (synthesis, decay, cleanup)
     */
    async runDreamCycle(params) {
        return this.request("/v1/dream-cycle/run", {
            method: "POST",
            body: JSON.stringify(params || {}),
        });
    }
    /**
     * Get context for injection (optimized endpoint)
     */
    async getContext(query) {
        return this.request("/v1/simple/context", {
            method: "POST",
            body: JSON.stringify({ message: query || "" }),
        });
    }
}
//# sourceMappingURL=client.js.map