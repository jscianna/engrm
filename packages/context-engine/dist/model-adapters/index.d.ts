/**
 * Model Adapters — Public API
 *
 * Detect model families, get adapter configs, and format context
 * in a model-aware way.
 */
export type { ModelAdapter, ModelDetectionResult, ContextSection, FormattingOptions, } from "./types.js";
export { detectModelFamily } from "./detector.js";
export { getAdapter } from "./adapters.js";
export { formatContextForModel } from "./formatter.js";
import type { ModelDetectionResult } from "./types.js";
import type { ContextSection } from "./types.js";
/**
 * Convenience: detect model family and return full adapter result.
 */
export declare function getModelAdapter(modelId: string): ModelDetectionResult;
/**
 * Convenience: detect model and format sections in one call.
 */
export declare function formatForModel(sections: ContextSection[], modelId: string): string;
//# sourceMappingURL=index.d.ts.map