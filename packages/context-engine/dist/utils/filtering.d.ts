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
 * Check if content matches capture patterns
 */
export declare function matchesCapturePatterns(content: string): boolean;
/**
 * Clean content before storage
 */
export declare function sanitizeContent(content: string): string;
//# sourceMappingURL=filtering.d.ts.map