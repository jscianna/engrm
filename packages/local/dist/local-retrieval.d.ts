export type LocalRetrievalResult = {
    hit: boolean;
    memoryIds: string[];
    confidence: number;
};
export type LocalRetrievalMetrics = {
    lookups: number;
    hits: number;
    misses: number;
    directHits: number;
    fuzzyHits: number;
    stores: number;
    evictions: number;
    invalidations: number;
    hitRate: number;
    users: number;
    entries: number;
    shadowSamples: number;
    shadowOverlapSum: number;
    shadowAvgOverlap: number;
};
export declare function localRetrieve(query: string, userId: string): Promise<LocalRetrievalResult>;
export declare function localStoreResult(userId: string, query: string, memoryIds: string[], confidence?: number): void;
export declare function invalidateLocalResultsByMemoryIds(userId: string, memoryIds: string[]): number;
export declare function invalidateAllLocalResultsForUser(userId: string): void;
export declare function recordShadowSample(overlapAtK: number): void;
export declare function getLocalRetrievalMetrics(): LocalRetrievalMetrics;
//# sourceMappingURL=local-retrieval.d.ts.map