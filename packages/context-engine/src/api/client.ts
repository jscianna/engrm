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
  IndexedMemory,
  IndexedMemoriesResponse,
} from "../types.js";

const DEFAULT_BASE_URL = "https://fathippo.ai/api";

function mapMemoryRecord(record: {
  id: string;
  title: string;
  text: string;
  userId?: string;
  type?: string;
  memoryType?: string;
  tier?: string;
  importanceTier?: string;
  createdAt: string;
  accessCount?: number;
  absorbed?: boolean;
  absorbedIntoSynthesisId?: string | null;
}): Memory {
  return {
    id: record.id,
    title: record.title,
    content: record.text,
    userId: record.userId ?? "",
    memoryType: record.memoryType ?? record.type,
    importanceTier:
      (record.importanceTier as Memory["importanceTier"]) ??
      (record.tier as Memory["importanceTier"]) ??
      "normal",
    createdAt: record.createdAt,
    updatedAt: record.createdAt,
    accessCount: record.accessCount,
    absorbed: record.absorbed,
    absorbedIntoSynthesisId: record.absorbedIntoSynthesisId,
  };
}

export class FatHippoClient {
  private apiKey: string;
  private baseUrl: string;
  private pluginHeaders: Record<string, string>;

  constructor(config: FatHippoConfig) {
    this.apiKey = config.apiKey ?? "";
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this.pluginHeaders = {
      "X-Fathippo-Plugin-Id": config.pluginId ?? "fathippo-context-engine",
      "X-Fathippo-Plugin-Version": config.pluginVersion ?? "unknown",
      "X-Fathippo-Plugin-Mode": config.mode === "local" ? "local" : "hosted",
    };
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      ...this.pluginHeaders,
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
    const response = await this.request<{ memory: { id: string; title: string; text: string; userId: string; memoryType?: string; importanceTier?: string; createdAt: string; accessCount?: number; absorbed?: boolean; absorbedIntoSynthesisId?: string | null } }>("/v1/memories", {
      method: "POST",
      body: JSON.stringify(params),
    });
    return mapMemoryRecord(response.memory);
  }

  /**
   * Search memories
   */
  async search(params: SearchParams): Promise<SearchResult[]> {
    const response = await this.request<
      Array<{
        score: number;
        vectorScore?: number;
        bm25Score?: number;
        memory: {
          id: string;
          title: string;
          text: string;
          userId: string;
          memoryType?: string;
          importanceTier?: string;
          createdAt: string;
          accessCount?: number;
          absorbed?: boolean;
          absorbedIntoSynthesisId?: string | null;
        };
      }>
    >(
      "/v1/search",
      {
        method: "POST",
        body: JSON.stringify(params),
      }
    );
    return response.map((result) => ({
      memory: mapMemoryRecord(result.memory),
      score: result.score,
      matchType:
        result.vectorScore && result.bm25Score
          ? "hybrid"
          : result.vectorScore
            ? "vector"
            : "bm25",
    }));
  }

  /**
   * Get critical-tier memories (for injection)
   */
  async getCriticalMemories(options?: {
    limit?: number;
    excludeAbsorbed?: boolean;
  }): Promise<CriticalMemoriesResponse> {
    const response = await this.request<{
      critical: Array<{ id: string; title: string; text: string; type: string; tier: string; createdAt: string }>;
      working: Array<{ id: string; title: string; text: string; synthesizedFrom?: string[] }>;
    }>("/v1/context", {
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
  async getRecentMemories(options?: {
    hours?: number;
    limit?: number;
  }): Promise<Memory[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));

    const response = await this.request<{ memories: Array<{ id: string; title: string; text: string; userId: string; memoryType?: string; importanceTier?: string; createdAt: string; accessCount?: number; absorbed?: boolean; absorbedIntoSynthesisId?: string | null }> }>(
      `/v1/memories?${params}`
    );
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
  async runDreamCycle(params?: DreamCycleParams): Promise<{
    ok: boolean;
    synthesized?: number;
    decayed?: number;
  }> {
    const response = await this.request<{ maintenance?: { archived?: number; deleted?: number } }>("/v1/lifecycle", {
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
  async getContext(query?: string): Promise<{
    memories: Memory[];
    syntheses?: Array<{ id: string; title: string; content: string }>;
    tokenEstimate?: number;
  }> {
    const response = await this.request<{
      critical: Array<{ id: string; title: string; text: string; type: string; tier: string; createdAt: string }>;
      high: Array<{ id: string; title: string; text: string; type: string; tier: string; createdAt: string }>;
      working: Array<{ id: string; title: string; text: string }>;
      stats?: { totalTokensEstimate?: number };
    }>("/v1/context", {
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
  async getIndexedSummaries(): Promise<IndexedMemoriesResponse> {
    return this.request<IndexedMemoriesResponse>("/v1/indexed");
  }

  /**
   * Dereference an indexed memory to get full content
   */
  async dereferenceIndex(indexKey: string): Promise<IndexedMemory> {
    return this.request<IndexedMemory>(`/v1/indexed/${encodeURIComponent(indexKey)}`);
  }

  /**
   * Store an indexed memory
   */
  async storeIndexed(params: {
    index: string;
    summary: string;
    content: string;
    contentType?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ stored: boolean; index: string }> {
    return this.request<{ stored: boolean; index: string }>("/v1/indexed", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }
}
