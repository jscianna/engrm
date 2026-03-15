/**
 * Model Adapters — Public API
 *
 * Detect model families, get adapter configs, and format context
 * in a model-aware way.
 */

export type {
  ModelAdapter,
  ModelDetectionResult,
  ContextSection,
  FormattingOptions,
} from "./types.js";
export { detectModelFamily } from "./detector.js";
export { getAdapter } from "./adapters.js";
export { formatContextForModel } from "./formatter.js";

import type { ModelDetectionResult } from "./types.js";
import type { ContextSection } from "./types.js";
import { detectModelFamily } from "./detector.js";
import { formatContextForModel } from "./formatter.js";

/**
 * Convenience: detect model family and return full adapter result.
 */
export function getModelAdapter(modelId: string): ModelDetectionResult {
  return detectModelFamily(modelId);
}

/**
 * Convenience: detect model and format sections in one call.
 */
export function formatForModel(sections: ContextSection[], modelId: string): string {
  const result = detectModelFamily(modelId);
  return formatContextForModel(sections, result.adapter);
}
