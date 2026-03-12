/**
 * FatHippo API Client
 */
import type { FatHippoConfig, Memory, SearchResult, CriticalMemoriesResponse, RememberParams, SearchParams, DreamCycleParams, IndexedMemory, IndexedMemoriesResponse } from "../types.js";
export declare class FatHippoClient {
    private apiKey;
    private baseUrl;
    private pluginHeaders;
    constructor(config: FatHippoConfig);
    private request;
    /**
     * Store a memory
     */
    remember(params: RememberParams): Promise<Memory>;
    /**
     * Search memories
     */
    search(params: SearchParams): Promise<SearchResult[]>;
    /**
     * Get critical-tier memories (for injection)
     */
    getCriticalMemories(options?: {
        limit?: number;
        excludeAbsorbed?: boolean;
    }): Promise<CriticalMemoriesResponse>;
    /**
     * Get recent memories (for context)
     */
    getRecentMemories(options?: {
        hours?: number;
        limit?: number;
    }): Promise<Memory[]>;
    /**
     * Run Dream Cycle (synthesis, decay, cleanup)
     */
    runDreamCycle(params?: DreamCycleParams): Promise<{
        ok: boolean;
        synthesized?: number;
        decayed?: number;
    }>;
    /**
     * Get context for injection (optimized endpoint)
     */
    getContext(query?: string): Promise<{
        memories: Memory[];
        syntheses?: Array<{
            id: string;
            title: string;
            content: string;
        }>;
        tokenEstimate?: number;
    }>;
    /**
     * Get indexed memory summaries (compact, for agent context)
     */
    getIndexedSummaries(): Promise<IndexedMemoriesResponse>;
    /**
     * Dereference an indexed memory to get full content
     */
    dereferenceIndex(indexKey: string): Promise<IndexedMemory>;
    /**
     * Store an indexed memory
     */
    storeIndexed(params: {
        index: string;
        summary: string;
        content: string;
        contentType?: string;
        metadata?: Record<string, unknown>;
    }): Promise<{
        stored: boolean;
        index: string;
    }>;
}
//# sourceMappingURL=client.d.ts.map