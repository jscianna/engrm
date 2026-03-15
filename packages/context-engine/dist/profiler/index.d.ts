/**
 * Codebase Profiler — Main orchestrator.
 *
 * Profiles a workspace by scanning file tree, detecting frameworks,
 * analyzing git history, and computing import frequency. Stores the
 * result to `.fathippo/codebase-profile.json`.
 */
import type { CodebaseProfile, ProfileConfig } from "./types.js";
export type { CodebaseProfile, ProfileConfig, TechStack, ScanResult, GitAnalysis, ImportAnalysis, ScanOptions } from "./types.js";
export { scanFileTree } from "./scanner.js";
export { detectTechStack } from "./framework-detection.js";
export { analyzeGitHistory } from "./git-analysis.js";
export { analyzeImports } from "./import-analysis.js";
export { deriveWorkspaceId } from "./workspace-id.js";
export { formatCodebaseProfileForInjection } from "./serializer.js";
/**
 * Profile a codebase. If a cached profile exists on disk and `force` is false,
 * returns the cached version.
 */
export declare function profileCodebase(workspaceRoot: string, options?: ProfileConfig): Promise<CodebaseProfile>;
/**
 * Load a cached profile from disk.
 */
export declare function loadCodebaseProfile(workspaceRoot: string): Promise<CodebaseProfile | null>;
/**
 * Save a profile to disk at `.fathippo/codebase-profile.json`.
 */
export declare function saveCodebaseProfile(workspaceRoot: string, profile: CodebaseProfile): Promise<void>;
//# sourceMappingURL=index.d.ts.map