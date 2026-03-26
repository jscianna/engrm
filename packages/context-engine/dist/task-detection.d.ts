/**
 * Task Detection — lightweight keyword-based classifier
 *
 * Analyzes the last 3-5 messages to determine what the user is doing.
 * Pure heuristics, no LLM calls. Target: <1ms execution.
 */
export type TaskType = 'debugging' | 'building' | 'refactoring' | 'reviewing' | 'exploring' | 'general';
export interface TaskDetectionResult {
    taskType: TaskType;
    confidence: number;
    signals: string[];
}
/**
 * Detect what task the user is performing based on recent messages.
 *
 * Looks at the last 3-5 messages, counts keyword matches per task type,
 * and returns the highest-scoring type with a confidence score.
 */
export declare function detectTaskType(messages: Array<{
    role: string;
    content: string;
}>): TaskDetectionResult;
//# sourceMappingURL=task-detection.d.ts.map