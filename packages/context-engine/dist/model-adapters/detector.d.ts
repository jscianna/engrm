/**
 * Model Adapters — Model family detection
 *
 * Detects model family from model ID strings using simple string matching.
 * Case-insensitive, handles provider/ prefixes (e.g. "openai/gpt-4o").
 */
import type { ModelDetectionResult } from "./types.js";
/**
 * Detect model family from a model ID string.
 *
 * Handles:
 * - Provider prefixes: "anthropic/claude-3.5-sonnet" → claude
 * - Direct model IDs: "gpt-4o" → gpt
 * - Edge cases: empty string, null, undefined → unknown
 */
export declare function detectModelFamily(modelId: string | null | undefined): ModelDetectionResult;
//# sourceMappingURL=detector.d.ts.map