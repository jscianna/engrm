/**
 * FatHippo API Client
 */

import type {
  FatHippoConfig,
  Memory,
  SearchResult,
  CriticalMemoriesResponse,
  RememberParams,
  SearchParams,
  DreamCycleParams,
} from "../types.js";

const DEFAULT_BASE_URL = "https://www.fathippo.com/api";

export class FatHippoClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: FatHippoConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
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

    return response.json() as Promise<T>;
  }

  /**
   * Store a memory
   */
  async remember(params: RememberParams): Promise<Memory> {
    return this.request<Memory>("/v1/memories", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  /**
   * Search memories
   */
  async search(params: SearchParams): Promise<SearchResult[]> {
    const response = await this.request<{ results: SearchResult[] }>(
      "/v1/search",
      {
        method: "POST",
        body: JSON.stringify(params),
      }
    );
    return response.results;
  }

  /**
   * Get critical-tier memories (for injection)
   */
  async getCriticalMemories(options?: {
    limit?: number;
    excludeAbsorbed?: boolean;
  }): Promise<CriticalMemoriesResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.excludeAbsorbed) params.set("excludeAbsorbed", "true");

    return this.request<CriticalMemoriesResponse>(
      `/v1/memories/critical?${params}`
    );
  }

  /**
   * Get recent memories (for context)
   */
  async getRecentMemories(options?: {
    hours?: number;
    limit?: number;
  }): Promise<Memory[]> {
    const params = new URLSearchParams();
    if (options?.hours) params.set("hours", String(options.hours));
    if (options?.limit) params.set("limit", String(options.limit));

    const response = await this.request<{ memories: Memory[] }>(
      `/v1/memories/recent?${params}`
    );
    return response.memories;
  }

  /**
   * Run Dream Cycle (synthesis, decay, cleanup)
   */
  async runDreamCycle(params?: DreamCycleParams): Promise<{
    ok: boolean;
    synthesized?: number;
    decayed?: number;
  }> {
    return this.request("/v1/dream-cycle/run", {
      method: "POST",
      body: JSON.stringify(params || {}),
    });
  }

  /**
   * Get context for injection (optimized endpoint)
   */
  async getContext(query?: string): Promise<{
    memories: Memory[];
    syntheses?: Array<{ id: string; title: string; content: string }>;
    tokenEstimate?: number;
  }> {
    return this.request("/v1/simple/context", {
      method: "POST",
      body: JSON.stringify({ message: query || "" }),
    });
  }
}
