/**
 * Codebase Profiler — Main orchestrator (CLI-side).
 *
 * This module contains all profiling logic that requires child_process
 * (git commands, etc). It runs ONLY from the CLI, never from the
 * context-engine plugin at runtime.
 */
import type { CodebaseProfile, ProfileConfig } from "./types.js";
export type { CodebaseProfile, ProfileConfig, TechStack, ScanResult, GitAnalysis, ImportAnalysis, ScanOptions } from "./types.js";
export { scanFileTree } from "./scanner.js";
export { detectTechStack } from "./framework-detection.js";
export { analyzeGitHistory } from "./git-analysis.js";
export { analyzeImports } from "./import-analysis.js";
export { deriveWorkspaceId } from "./workspace-id.js";
/**
 * Profile a codebase. If a cached profile exists on disk and `force` is false,
 * returns the cached version. Only profiles git repositories.
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