/**
 * Model Adapters — Type definitions
 *
 * Describes per-model-family configuration for context formatting,
 * budget allocation, and tool call format detection.
 */
export interface ModelAdapter {
    modelFamily: string;
    contextWindowSize: number;
    prefersXml: boolean;
    prefersMarkdown: boolean;
    supportsSystemPrompt: boolean;
    optimalContextBudget: number;
    toolCallFormat: 'openai' | 'anthropic' | 'hermes' | 'native' | 'unknown';
}
export interface ModelDetectionResult {
    modelId: string;
    family: string;
    adapter: ModelAdapter;
    confidence: number;
}
export interface ContextSection {
    id: string;
    content: string;
    priority: number;
    minTokens: number;
    maxTokens: number;
}
export interface FormattingOptions {
    maxTokens: number;
    style: 'xml' | 'markdown' | 'terse';
    includeMetadata: boolean;
    sectionSeparator: string;
}
//# sourceMappingURL=types.d.ts.map