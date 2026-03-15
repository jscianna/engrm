/**
 * Codebase Profiler — Main orchestrator.
 *
 * Profiles a workspace by scanning file tree, detecting frameworks,
 * analyzing git history, and computing import frequency. Stores the
 * result to `.fathippo/codebase-profile.json`.
 */
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { scanFileTree } from "./scanner.js";
import { detectTechStack } from "./framework-detection.js";
import { analyzeGitHistory, getHeadCommit } from "./git-analysis.js";
import { analyzeImports } from "./import-analysis.js";
export { scanFileTree } from "./scanner.js";
export { detectTechStack } from "./framework-detection.js";
export { analyzeGitHistory } from "./git-analysis.js";
export { analyzeImports } from "./import-analysis.js";
export { deriveWorkspaceId } from "./workspace-id.js";
export { formatCodebaseProfileForInjection } from "./serializer.js";
const PROFILE_DIR = ".fathippo";
const PROFILE_FILE = "codebase-profile.json";
/**
 * Profile a codebase. If a cached profile exists on disk and `force` is false,
 * returns the cached version.
 */
export async function profileCodebase(workspaceRoot, options) {
    // Check for cached profile unless force
    if (!options?.force) {
        const cached = await loadCodebaseProfile(workspaceRoot);
        if (cached)
            return cached;
    }
    // Run all analyses in parallel
    const [scanResult, techStack, gitResult, headCommit] = await Promise.all([
        scanFileTree(workspaceRoot, {
            maxFiles: options?.maxFiles ?? 5000,
            maxDepth: options?.maxDepth ?? 4,
            extraIgnorePatterns: options?.extraIgnorePatterns,
        }),
        detectTechStack(workspaceRoot),
        analyzeGitHistory(workspaceRoot).catch(() => ({
            totalCommits: 0,
            activeContributors: 0,
            mostActiveDirectories: [],
            branchingModel: "unknown",
            hotspots: [],
        })),
        Promise.resolve(getHeadCommit(workspaceRoot)),
    ]);
    // Import analysis depends on scan result
    const importResult = await analyzeImports(workspaceRoot, scanResult.allFiles).catch(() => ({
        topImports: [],
        mostImportedFiles: [],
    }));
    // Merge language breakdown into tech stack
    techStack.languages = [...scanResult.languageBreakdown.entries()]
        .sort((a, b) => b[1] - a[1])
        .filter(([, pct]) => pct >= 1)
        .map(([name, percentage]) => ({ name, percentage }));
    // Build hotspots
    const hotspots = [];
    // Git hotspots (most changed)
    for (const hs of gitResult.hotspots.slice(0, 8)) {
        hotspots.push({
            path: hs.path,
            reason: "most-changed",
            metric: hs.commits,
        });
    }
    // Size hotspots (largest files not already listed)
    const hotspotPaths = new Set(hotspots.map((h) => h.path));
    for (const file of scanResult.largestFiles.slice(0, 5)) {
        if (!hotspotPaths.has(file.path)) {
            hotspots.push({
                path: file.path,
                reason: "largest",
                metric: file.loc,
            });
            hotspotPaths.add(file.path);
        }
    }
    // Import hotspots (most imported local files)
    for (const file of importResult.mostImportedFiles.slice(0, 3)) {
        if (!hotspotPaths.has(file.path)) {
            hotspots.push({
                path: file.path,
                reason: "most-imported",
                metric: file.importCount,
            });
            hotspotPaths.add(file.path);
        }
    }
    // Top direct dependencies by actual import usage
    const topDirect = importResult.topImports
        .filter((imp) => !imp.module.startsWith(".") && !imp.module.startsWith("@/") && !imp.module.startsWith("node:"))
        .slice(0, 10)
        .map((imp) => imp.module);
    // Peer projects (monorepo cross-package deps)
    const peerProjects = importResult.topImports
        .filter((imp) => imp.module.startsWith("@") && scanResult.workspaces.some((ws) => imp.module.includes(path.basename(ws))))
        .map((imp) => imp.module);
    // Assemble profile
    const profile = {
        version: 1,
        generatedAt: new Date().toISOString(),
        generatedFromCommit: headCommit,
        workspaceRoot,
        techStack,
        structure: {
            type: scanResult.structureType,
            entryPoints: scanResult.entryPoints,
            workspaces: scanResult.workspaces.length > 0 ? scanResult.workspaces : undefined,
            totalFiles: scanResult.totalFiles,
            totalDirectories: scanResult.totalDirectories,
            fileTreeSummary: scanResult.fileTreeSummary,
        },
        hotspots: hotspots.slice(0, 15),
        dependencies: {
            topDirect,
            peerProjects: peerProjects.length > 0 ? peerProjects : undefined,
        },
        git: {
            totalCommits: gitResult.totalCommits,
            activeContributors: gitResult.activeContributors,
            mostActiveDirectories: gitResult.mostActiveDirectories,
            branchingModel: gitResult.branchingModel,
        },
        architecture: {
            summary: "Profile generated with free-data analysis. Run with LLM summarization for architectural insights.",
            patterns: [],
            conventions: [],
        },
    };
    // Save to disk
    await saveCodebaseProfile(workspaceRoot, profile);
    return profile;
}
/**
 * Load a cached profile from disk.
 */
export async function loadCodebaseProfile(workspaceRoot) {
    const profilePath = getProfilePath(workspaceRoot);
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
 * Save a profile to disk at `.fathippo/codebase-profile.json`.
 */
export async function saveCodebaseProfile(workspaceRoot, profile) {
    const dir = path.join(workspaceRoot, PROFILE_DIR);
    try {
        if (!existsSync(dir)) {
            await mkdir(dir, { recursive: true });
        }
        const profilePath = path.join(dir, PROFILE_FILE);
        await writeFile(profilePath, JSON.stringify(profile, null, 2), "utf-8");
    }
    catch (error) {
        console.error("[FatHippo Profiler] Failed to save profile:", error);
    }
}
function getProfilePath(workspaceRoot) {
    return path.join(workspaceRoot, PROFILE_DIR, PROFILE_FILE);
}
//# sourceMappingURL=index.js.map