/**
 * Codebase Profiler — Reader-only module.
 *
 * This module provides read-only access to codebase profiles.
 * It does NOT use child_process or run any shell commands.
 * Profile generation is handled by @fathippo/connect CLI.
 *
 * To generate a profile: `npx @fathippo/connect profile .`
 */
import type { CodebaseProfile } from "./types.js";
export type { CodebaseProfile, ProfileConfig, TechStack, ScanResult, GitAnalysis, ImportAnalysis, ScanOptions } from "./types.js";
export { formatCodebaseProfileForInjection } from "./serializer.js";
/**
 * Load a cached profile from disk. Returns null if no profile exists.
 * This is the only function the context engine needs at runtime.
 */
export declare function loadCodebaseProfile(workspaceRoot: string): Promise<CodebaseProfile | null>;
/**
 * Check whether a profile is stale based on its generatedAt timestamp.
 * Returns true if the profile is older than the given threshold (default: 48 hours).
 */
export declare function isProfileStale(profile: CodebaseProfile, thresholdMs?: number): boolean;
/**
 * Format a human-readable staleness message for context injection.
 */
export declare function formatStalenessHint(profile: CodebaseProfile): string | null;
//# sourceMappingURL=index.d.ts.map