/**
 * Git history analysis: commit stats, hotspots, branching model.
 */
import type { GitAnalysisResult } from "./types.js";
export declare function analyzeGitHistory(workspaceRoot: string): Promise<GitAnalysisResult>;
export declare function getHeadCommit(workspaceRoot: string): string | undefined;
//# sourceMappingURL=git-analysis.d.ts.map