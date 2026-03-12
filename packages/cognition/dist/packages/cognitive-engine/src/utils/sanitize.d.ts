/**
 * Secret Sanitization
 *
 * CRITICAL: All traces must be sanitized before storage or sharing.
 * This catches API keys, tokens, passwords, connection strings, etc.
 */
import type { CodingTrace } from '../types.js';
/**
 * Sanitize a string by replacing detected secrets with [REDACTED]
 */
export declare function sanitizeString(input: string): string;
/**
 * Sanitize an array of strings
 */
export declare function sanitizeStringArray(input: string[]): string[];
/**
 * Sanitize a complete coding trace
 *
 * CRITICAL: Call this before ANY storage or sharing of traces.
 */
export declare function sanitizeTrace(trace: CodingTrace): CodingTrace;
/**
 * Check if a string contains potential secrets (for validation)
 */
export declare function containsSecrets(input: string): boolean;
/**
 * Get list of detected secret types in a string (for logging/debugging)
 */
export declare function detectSecretTypes(input: string): string[];
//# sourceMappingURL=sanitize.d.ts.map