/**
 * Import/require statement scanning across multiple languages.
 * Counts import frequency per module to identify actual dependency usage.
 */
import type { ImportAnalysis } from "./types.js";
export declare function analyzeImports(workspaceRoot: string, files: string[]): Promise<ImportAnalysis>;
//# sourceMappingURL=import-analysis.d.ts.map