/**
 * FatHippo API Client
 */
import type { FatHippoConfig, Memory, SearchResult, CriticalMemoriesResponse, RememberParams, SearchParams, DreamCycleParams } from "../types.js";
export declare class FatHippoClient {
    private apiKey;
    private baseUrl;
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
}
//# sourceMappingURL=client.d.ts.map