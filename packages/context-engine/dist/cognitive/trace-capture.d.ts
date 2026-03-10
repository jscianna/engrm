import type { AgentMessage } from "@mariozechner/pi-agent-core";
export type StructuredTracePayload = {
    sessionId: string;
    type: string;
    problem: string;
    context: {
        technologies: string[];
        errorMessages?: string[];
    };
    reasoning: string;
    approaches: Array<{
        description: string;
        result: "worked" | "failed" | "partial";
        learnings?: string;
    }>;
    solution?: string;
    outcome: "success" | "partial" | "failed";
    heuristicOutcome: "success" | "partial" | "failed";
    automatedOutcome?: "success" | "failed";
    automatedSignals: Record<string, unknown>;
    errorMessage?: string;
    toolsUsed: string[];
    filesModified: string[];
    durationMs: number;
    sanitized: true;
    sanitizedAt: string;
    shareEligible: boolean;
};
export declare function shouldCaptureCodingTrace(messages: AgentMessage[]): boolean;
export declare function buildStructuredTrace(params: {
    sessionId: string;
    messages: AgentMessage[];
    toolsUsed?: string[];
    filesModified?: string[];
    startTime: number;
    endTime: number;
}): StructuredTracePayload | null;
export declare function getMessageText(message: AgentMessage): string;
//# sourceMappingURL=trace-capture.d.ts.map