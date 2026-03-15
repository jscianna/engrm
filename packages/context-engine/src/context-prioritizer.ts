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
  basePriority: number;     // the default/static priority (lower = higher priority)
  adjustedPriority: number; // after task-based adjustment
  tokenBudget: number;      // allocated tokens for this section
}

/**
 * Budget allocation percentages per task type.
 * Keys are section IDs; values are fraction of total budget (0-1).
 */
const TASK_BUDGETS: Record<string, Record<string, number>> = {
  debugging: {
    traces: 0.40,
    collective: 0.20,
    codebaseProfile: 0.15,
    userDNA: 0.10,
    memories: 0.10,
    runtime: 0.05,
  },
  building: {
    codebaseProfile: 0.30,
    userDNA: 0.20,
    memories: 0.20,
    traces: 0.15,
    collective: 0.10,
    runtime: 0.05,
  },
  refactoring: {
    codebaseProfile: 0.35,
    traces: 0.25,
    userDNA: 0.20,
    memories: 0.10,
    collective: 0.05,
    runtime: 0.05,
  },
  reviewing: {
    codebaseProfile: 0.30,
    userDNA: 0.25,
    traces: 0.20,
    memories: 0.15,
    collective: 0.05,
    runtime: 0.05,
  },
};

/** Default static priority order (lower number = higher priority) */
const DEFAULT_PRIORITY: Record<string, number> = {
  runtime: 1,
  codebaseProfile: 2,
  userDNA: 3,
  traces: 4,
  memories: 5,
  collective: 6,
};

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
export function prioritizeForTask(
  taskType: TaskType,
  totalBudget: number,
  availableSections: string[],
): ContextPriority[] {
  const budgetMap = TASK_BUDGETS[taskType];

  // For exploring/general or unknown task types, use even distribution
  if (!budgetMap) {
    const evenShare = availableSections.length > 0
      ? Math.floor(totalBudget / availableSections.length)
      : 0;
    return availableSections.map((sectionId, index) => ({
      sectionId,
      basePriority: DEFAULT_PRIORITY[sectionId] ?? index + 1,
      adjustedPriority: DEFAULT_PRIORITY[sectionId] ?? index + 1,
      tokenBudget: evenShare,
    }));
  }

  // Build priorities from the budget map
  // Sections listed in the budget map get their allocated share;
  // unlisted sections that are available get a minimal allocation.
  const entries: Array<{ sectionId: string; fraction: number; adjustedPriority: number }> = [];
  let allocatedFraction = 0;
  let priority = 1;

  // First pass: sections that have explicit budget allocation (in order)
  for (const [sectionId, fraction] of Object.entries(budgetMap)) {
    if (availableSections.includes(sectionId)) {
      entries.push({ sectionId, fraction, adjustedPriority: priority++ });
      allocatedFraction += fraction;
    }
  }

  // Second pass: available sections not in the budget map get remaining budget
  const remainingFraction = Math.max(0, 1 - allocatedFraction);
  const unmapped = availableSections.filter(
    (s) => !entries.some((e) => e.sectionId === s),
  );
  const unmappedShare = unmapped.length > 0
    ? remainingFraction / unmapped.length
    : 0;
  for (const sectionId of unmapped) {
    entries.push({
      sectionId,
      fraction: unmappedShare,
      adjustedPriority: priority++,
    });
  }

  return entries.map((entry) => ({
    sectionId: entry.sectionId,
    basePriority: DEFAULT_PRIORITY[entry.sectionId] ?? 99,
    adjustedPriority: entry.adjustedPriority,
    tokenBudget: Math.floor(totalBudget * entry.fraction),
  }));
}
