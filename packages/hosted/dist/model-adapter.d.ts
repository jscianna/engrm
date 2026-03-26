/**
 * Model-aware context formatting for FatHippo.
 *
 * Adapts context output format and budget based on which model is consuming it.
 * Claude gets XML, GPT gets markdown, small models get ultra-compressed text.
 */
export type ModelFamily = "claude" | "gpt" | "deepseek" | "gemini" | "small" | "unknown";
export type ContextBudget = {
    max_tokens: number;
    max_memories: number;
    critical_only: boolean;
};
export type TieredMemory = {
    id: string;
    title: string;
    text: string;
    type?: string;
    tier?: string;
};
export type TieredContext = {
    critical?: TieredMemory[];
    working?: TieredMemory[];
    high?: TieredMemory[];
};
export declare function detectModelFamily(model?: string | null): ModelFamily;
export declare function getContextBudget(family: ModelFamily): ContextBudget;
/**
 * Format tiered context for a specific model family.
 * Enforces memory count and token budgets, then formats appropriately.
 */
export declare function formatTieredContextForModel(context: TieredContext, family: ModelFamily): string;
/**
 * Format a memory list for a specific model family.
 * Convenience function for simpler use cases.
 */
export declare function formatMemoryListForModel(memories: TieredMemory[], family: ModelFamily): string[];
//# sourceMappingURL=model-adapter.d.ts.map