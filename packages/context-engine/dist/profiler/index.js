/**
 * Codebase Profiler — Reader-only module.
 *
 * This module provides read-only access to codebase profiles.
 * It does NOT use child_process or run any shell commands.
 * Profile generation is handled by @fathippo/connect CLI.
 *
 * To generate a profile: `npx @fathippo/connect profile .`
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
export { formatCodebaseProfileForInjection } from "./serializer.js";
const PROFILE_DIR = ".fathippo";
const PROFILE_FILE = "codebase-profile.json";
/**
 * Load a cached profile from disk. Returns null if no profile exists.
 * This is the only function the context engine needs at runtime.
 */
export async function loadCodebaseProfile(workspaceRoot) {
    const profilePath = path.join(workspaceRoot, PROFILE_DIR, PROFILE_FILE);
    if (!existsSync(profilePath))
        return null;
    try {
        const content = await readFile(profilePath, "utf-8");
        const profile = JSON.parse(content);
        if (profile.version !== 1)
            return null;
        return profile;
    }
    catch {
        return null;
    }
}
/**
 * Check whether a profile is stale based on its generatedAt timestamp.
 * Returns true if the profile is older than the given threshold (default: 48 hours).
 */
export function isProfileStale(profile, thresholdMs) {
    if (!profile.generatedAt)
        return true;
    const ageMs = Date.now() - new Date(profile.generatedAt).getTime();
    const threshold = thresholdMs ?? 48 * 60 * 60 * 1000; // 48 hours default
    return ageMs > threshold;
}
/**
 * Format a human-readable staleness message for context injection.
 */
export function formatStalenessHint(profile) {
    if (!isProfileStale(profile))
        return null;
    const ageMs = Date.now() - new Date(profile.generatedAt).getTime();
    const ageHours = Math.floor(ageMs / (60 * 60 * 1000));
    const ageDays = Math.floor(ageHours / 24);
    const ageStr = ageDays > 0 ? `${ageDays} day${ageDays > 1 ? "s" : ""} ago` : `${ageHours} hour${ageHours > 1 ? "s" : ""} ago`;
    return `[FatHippo] Codebase profile was last updated ${ageStr}. Run \`npx @fathippo/connect profile .\` in your project to refresh it.`;
}
//# sourceMappingURL=index.js.map