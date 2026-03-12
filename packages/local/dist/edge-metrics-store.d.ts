type Snapshot = {
    ts: number;
    hitRate: number;
    shadowAvgOverlap: number;
    avgRiskScore: number;
    avgFlushQuality: number;
    missingConstraints: number;
};
export declare function appendEdgeSnapshot(snapshot: Snapshot): Promise<void>;
export declare function getEdgeSnapshotAggregate24h(): Promise<{
    count: number;
    avgHitRate: number;
    avgShadowOverlap: number;
    avgRiskScore: number;
    avgFlushQuality: number;
    totalMissingConstraints: number;
} | null>;
export {};
//# sourceMappingURL=edge-metrics-store.d.ts.map