/**
 * Model Adapters — Public API
 *
 * Detect model families, get adapter configs, and format context
 * in a model-aware way.
 */
export { detectModelFamily } from "./detector.js";
export { getAdapter } from "./adapters.js";
export { formatContextForModel } from "./formatter.js";
import { detectModelFamily } from "./detector.js";
import { formatContextForModel } from "./formatter.js";
/**
 * Convenience: detect model family and return full adapter result.
 */
export function getModelAdapter(modelId) {
    return detectModelFamily(modelId);
}
/**
 * Convenience: detect model and format sections in one call.
 */
export function formatForModel(sections, modelId) {
    const result = detectModelFamily(modelId);
    return formatContextForModel(sections, result.adapter);
}
//# sourceMappingURL=index.js.map