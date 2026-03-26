/**
 * Model Adapters — Per-family adapter configurations
 *
 * Returns a ModelAdapter with sensible defaults for each known model family.
 */
import type { ModelAdapter } from "./types.js";
/**
 * Get the adapter configuration for a model family.
 * Falls back to 'unknown' for unrecognized families.
 */
export declare function getAdapter(family: string): ModelAdapter;
//# sourceMappingURL=adapters.d.ts.map