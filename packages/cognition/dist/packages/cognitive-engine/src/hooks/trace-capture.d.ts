/**
 * Trace Capture Hook
 *
 * Captures reasoning traces from coding sessions for pattern extraction.
 */
import type { CodingTrace, TraceType, TraceOutcome, TraceContext, Approach, CognitiveEngineConfig } from '../types.js';
interface AgentMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string | ContentBlock[];
}
interface ContentBlock {
    type: string;
    text?: string;
    thinking?: string;
    name?: string;
}
interface CaptureParams {
    sessionId: string;
    messages: AgentMessage[];
    toolsUsed?: string[];
    filesModified?: string[];
    startTime: number;
    endTime: number;
}
export declare class TraceCapture {
    private config;
    constructor(config: CognitiveEngineConfig);
    /**
     * Extract reasoning from thinking blocks in messages
     */
    extractReasoning(messages: AgentMessage[]): string;
    /**
     * Detect problem type from conversation
     */
    detectProblemType(messages: AgentMessage[]): TraceType;
    /**
     * Detect outcome from conversation
     */
    detectOutcome(messages: AgentMessage[]): TraceOutcome;
    /**
     * Extract problem description from first user message
     */
    extractProblem(messages: AgentMessage[]): string;
    /**
     * Extract solution from last assistant message (if success)
     */
    extractSolution(messages: AgentMessage[], outcome: TraceOutcome): string | undefined;
    /**
     * Extract context (technologies, files, errors) from messages
     */
    extractContext(messages: AgentMessage[], filesModified?: string[]): TraceContext;
    /**
     * Extract approaches tried from conversation
     */
    extractApproaches(messages: AgentMessage[]): Approach[];
    /**
     * Capture a complete trace from a coding session
     */
    captureTrace(params: CaptureParams): Promise<CodingTrace>;
    /**
     * Check if a session should be captured (filtering)
     */
    shouldCapture(messages: AgentMessage[]): boolean;
    private getMessageText;
}
export {};
//# sourceMappingURL=trace-capture.d.ts.map