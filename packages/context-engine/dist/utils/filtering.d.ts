/**
 * Content filtering utilities
 */
/**
 * Detect prompt injection attempts in content
 */
export declare function detectPromptInjection(content: string): boolean;
/**
 * Detect noise/low-value content
 */
export declare function detectNoise(content: string): boolean;
/**
 * Detect terminal/error output
 */
export declare function detectTerminalOutput(content: string): boolean;
/**
 * Detect source code content
 */
export declare function detectCodeSnippet(content: string): boolean;
/**
 * Detect system/runtime metadata
 */
export declare function detectSystemMetadata(content: string): boolean;
export type MemoryCaptureDecision = {
    keep: boolean;
    score: number;
    reason: "denylist" | "noise" | "code" | "metadata" | "json" | "low_signal" | "assistant_not_explicit" | "accepted";
};
/**
 * Check if content matches capture patterns
 */
export declare function matchesCapturePatterns(content: string): boolean;
export declare function isHighSignalMemory(content: string): boolean;
export declare function evaluateMemoryCandidate(content: string, role: "user" | "assistant" | "tool" | "system" | string): MemoryCaptureDecision;
/**
 * Clean content before storage
 */
export declare function sanitizeContent(content: string): string;
//# sourceMappingURL=filtering.d.ts.map