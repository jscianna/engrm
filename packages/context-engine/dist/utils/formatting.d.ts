/**
 * Memory formatting utilities
 */
import type { Memory, SynthesizedMemory, SearchResult } from "../types.js";
/**
 * Format memories for system prompt injection
 */
export declare function formatMemoriesForInjection(memories: Memory[], syntheses?: SynthesizedMemory[]): string;
/**
 * Format search results for injection
 */
export declare function formatSearchResults(results: SearchResult[]): string;
/**
 * Deduplicate memories by ID
 */
export declare function dedupeMemories(memories: Memory[]): Memory[];
/**
 * Estimate token count for text (rough approximation)
 */
export declare function estimateTokens(text: string): number;
//# sourceMappingURL=formatting.d.ts.map