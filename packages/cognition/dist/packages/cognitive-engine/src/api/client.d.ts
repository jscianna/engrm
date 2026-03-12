/**
 * FatHippo Cognitive API Client
 *
 * Handles communication with the FatHippo API for trace storage and retrieval.
 */
import type { CognitiveDataDeletionResult, CognitivePrivacyExport, CognitiveUserSettings, CodingTrace, Pattern, RetrievalEvalDataset, SynthesizedSkill, StoreTraceResponse, GetRelevantTracesRequest, GetRelevantTracesResponse, PatternFeedbackRequest, CognitiveEngineConfig } from '../types.js';
export declare class CognitiveClient {
    private apiKey;
    private baseUrl;
    constructor(config: CognitiveEngineConfig);
    private request;
    /**
     * Store a coding trace
     */
    storeTrace(trace: CodingTrace): Promise<StoreTraceResponse>;
    /**
     * Get traces relevant to a problem
     */
    getRelevantTraces(request: GetRelevantTracesRequest): Promise<GetRelevantTracesResponse>;
    /**
     * Get recent traces
     */
    getRecentTraces(limit?: number): Promise<CodingTrace[]>;
    exportEvalFixtures(limit?: number, acceptedOnly?: boolean, dataset?: "generated" | "curated"): Promise<RetrievalEvalDataset>;
    runBenchmark(dataset: "generated" | "curated", predictions: unknown[], thresholds?: Record<string, unknown>): Promise<Record<string, unknown>>;
    getBenchmarkRuns(limit?: number): Promise<{
        runs: Record<string, unknown>[];
    }>;
    getPrivacySettings(): Promise<CognitiveUserSettings>;
    updatePrivacySettings(input: Partial<Pick<CognitiveUserSettings, "sharedLearningEnabled" | "benchmarkInclusionEnabled" | "traceRetentionDays">>): Promise<CognitiveUserSettings>;
    exportCognitiveData(): Promise<CognitivePrivacyExport>;
    deleteCognitiveData(): Promise<CognitiveDataDeletionResult>;
    /**
     * Get trace by ID
     */
    getTrace(traceId: string): Promise<CodingTrace | null>;
    /**
     * Get all patterns, optionally filtered by domain
     */
    getPatterns(domain?: string): Promise<Pattern[]>;
    /**
     * Find patterns that match a problem
     */
    matchPatterns(problem: string, technologies?: string[]): Promise<Pattern[]>;
    /**
     * Submit feedback on pattern effectiveness
     */
    submitPatternFeedback(feedback: PatternFeedbackRequest): Promise<void>;
    /**
     * Get patterns that are candidates for skill synthesis
     */
    getSkillCandidates(): Promise<Pattern[]>;
    /**
     * Get synthesized skills
     */
    getSkills(): Promise<SynthesizedSkill[]>;
    /**
     * Get a specific skill by ID
     */
    getSkill(skillId: string): Promise<SynthesizedSkill | null>;
    publishSkill(skillId: string): Promise<SynthesizedSkill | null>;
}
//# sourceMappingURL=client.d.ts.map