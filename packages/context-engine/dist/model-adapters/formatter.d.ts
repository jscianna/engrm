/**
 * Model Adapters — Context formatter
 *
 * Pure function that formats context sections according to model adapter preferences.
 * Uses chars/4 as a rough token estimate (no external deps).
 */
import type { ContextSection, ModelAdapter } from "./types.js";
/**
 * Format context sections for a specific model adapter.
 *
 * @param sections - Context sections to format
 * @param adapter - Model adapter with formatting preferences
 * @param totalBudget - Optional total token budget override (defaults to adapter.optimalContextBudget)
 * @returns Formatted context string
 */
export declare function formatContextForModel(sections: ContextSection[], adapter: ModelAdapter, totalBudget?: number): string;
//# sourceMappingURL=formatter.d.ts.map