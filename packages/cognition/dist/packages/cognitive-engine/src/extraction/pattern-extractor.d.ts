/**
 * Pattern Extractor
 *
 * Extracts patterns from clusters of similar traces.
 * MVP: Simple keyword-based clustering. Later: embedding-based.
 */
import type { CodingTrace, Pattern, CognitiveEngineConfig } from '../types.js';
interface TraceCluster {
    id: string;
    domain: string;
    traces: CodingTrace[];
    keywords: string[];
    successRate: number;
}
export declare class PatternExtractor {
    private config;
    constructor(config: CognitiveEngineConfig);
    /**
     * Cluster similar traces using keyword overlap
     *
     * MVP approach: Group by technology + problem type + key error messages
     * Future: Use embeddings for semantic similarity
     */
    clusterTraces(traces: CodingTrace[]): TraceCluster[];
    /**
     * Extract a pattern from a cluster of similar traces
     */
    extractPattern(cluster: TraceCluster): Pattern | null;
    /**
     * Update pattern confidence based on new trace feedback
     */
    updatePatternConfidence(pattern: Pattern, outcome: 'success' | 'failure'): Pattern;
    /**
     * Find patterns that match a given problem
     */
    matchPatterns(problem: string, technologies: string[], patterns: Pattern[]): Pattern[];
    /**
     * Check if a pattern is ready for skill synthesis
     */
    isReadyForSynthesis(pattern: Pattern): boolean;
    private generateClusterKey;
    private extractDomain;
    private extractKeywords;
    private findBestApproach;
    private buildTrigger;
}
export {};
//# sourceMappingURL=pattern-extractor.d.ts.map