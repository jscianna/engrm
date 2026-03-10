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
    toolCalls: Array<Record<string, unknown>>;
    toolResults: Array<Record<string, unknown>>;
    verificationCommands: string[];
    retryCount: number;
    repoSignals: {
        filesModified: string[];
        languages: string[];
        diffSummary: string;
        workspaceRoot?: string;
    };
    resolutionKind: "tests_passed" | "build_passed" | "lint_passed" | "manual_only" | "failed";
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
    workspaceRoot?: string;
    startTime: number;
    endTime: number;
}): StructuredTracePayload | null;
export declare function getMessageText(message: AgentMessage): string;
//# sourceMappingURL=trace-capture.d.ts.map