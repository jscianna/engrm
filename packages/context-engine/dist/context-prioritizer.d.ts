/**
 * Dynamic Context Prioritizer
 *
 * Allocates token budgets and reorders context sections based on
 * what task the user is performing. Research finding: dynamic task-aware
 * injection scored 25% better than static ordering.
 */
import type { TaskType } from "./task-detection.js";
export interface ContextPriority {
    sectionId: string;
    basePriority: number;
    adjustedPriority: number;
    tokenBudget: number;
}
/**
 * Compute dynamic priorities and token budgets for context sections.
 *
 * For 'exploring' and 'general' task types, returns even distribution
 * (existing behavior). For recognized task types, reorders and allocates
 * budget according to research-backed rules.
 *
 * @param taskType - detected task type
 * @param totalBudget - total token budget available for context sections
 * @param availableSections - section IDs that are actually present
 * @returns ordered array of priorities (highest priority first)
 */
export declare function prioritizeForTask(taskType: TaskType, totalBudget: number, availableSections: string[]): ContextPriority[];
//# sourceMappingURL=context-prioritizer.d.ts.map