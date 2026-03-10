/**
 * FatHippo Cognitive Engine
 *
 * Main engine that ties together trace capture, pattern extraction,
 * and context injection for AI coding agents.
 */
import type { CodingTrace, Pattern, SynthesizedSkill, CognitiveEngineConfig } from './types.js';
interface AgentMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string | Array<{
        type: string;
        text?: string;
        thinking?: string;
    }>;
}
interface RelevantContext {
    traces: CodingTrace[];
    patterns: Pattern[];
    skills: SynthesizedSkill[];
    formatted: string;
}
interface TurnCaptureParams {
    sessionId: string;
    messages: AgentMessage[];
    toolsUsed?: string[];
    filesModified?: string[];
    startTime: number;
    endTime: number;
}
export declare class CognitiveEngine {
    private config;
    private client;
    private traceCapture;
    private patternExtractor;
    private patternCache;
    private patternCacheTime;
    private readonly PATTERN_CACHE_TTL;
    constructor(config: CognitiveEngineConfig);
    /**
     * Get relevant context for a coding problem
     *
     * This is called during context assembly to inject relevant
     * traces, patterns, and skills into the agent's context.
     */
    getRelevantContext(problem: string, technologies?: string[]): Promise<RelevantContext>;
    /**
     * Capture a trace from a completed coding turn
     *
     * Called after a coding session/turn to capture what happened.
     */
    captureFromTurn(params: TurnCaptureParams): Promise<CodingTrace | null>;
    /**
     * Process traces and extract patterns (batch operation)
     *
     * Called during compaction/dream cycle to extract patterns from traces.
     */
    extractPatterns(): Promise<Pattern[]>;
    /**
     * Get patterns that are ready for skill synthesis
     */
    getSkillCandidates(): Promise<Pattern[]>;
    /**
     * Submit feedback on a pattern's effectiveness
     */
    submitPatternFeedback(patternId: string, traceId: string, outcome: 'success' | 'failure', notes?: string): Promise<void>;
    private formatContext;
    private refreshPatternCache;
}
export {};
//# sourceMappingURL=engine.d.ts.map