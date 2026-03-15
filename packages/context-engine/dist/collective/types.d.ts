/**
 * Collective Intelligence — Shared Pattern Network Types
 */
export interface CollectivePattern {
    id: string;
    patternHash: string;
    category: string;
    trigger: {
        errorType: string;
        framework: string;
        context: string;
    };
    resolution: {
        approach: string;
        confidence: number;
        successCount: number;
        totalAttempts: number;
    };
    metadata: {
        contributorCount: number;
        firstSeen: string;
        lastConfirmed: string;
        difficulty: number;
    };
}
export interface SharedSignal {
    errorType: string;
    errorMessage: string;
    framework: string;
    resolution: string;
    success: boolean;
    attemptsBeforeFix: number;
}
export interface CollectiveApiConfig {
    apiKey: string;
    baseUrl: string;
}
export interface CollectiveUserSettings {
    sharedLearningEnabled: boolean;
}
/**
 * Trace data input for anonymization.
 * Compatible with the StructuredTracePayload from trace-capture.
 */
export interface TraceData {
    type: string;
    problem: string;
    context: {
        technologies: string[];
        errorMessages?: string[];
    };
    reasoning: string;
    solution?: string;
    outcome: string;
    retryCount: number;
    filesModified: string[];
}
//# sourceMappingURL=types.d.ts.map