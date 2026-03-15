/**
 * Codebase Profiler Types
 *
 * Data model for the "Codebase DNA" feature — a compact structural
 * summary of the user's codebase injected into every agent session.
 */
export interface CodebaseProfile {
    version: 1;
    generatedAt: string;
    generatedFromCommit?: string;
    workspaceRoot: string;
    techStack: TechStack;
    structure: {
        type: "monorepo" | "single" | "workspace";
        entryPoints: string[];
        workspaces?: string[];
        totalFiles: number;
        totalDirectories: number;
        fileTreeSummary: string;
    };
    hotspots: Array<{
        path: string;
        reason: "most-changed" | "largest" | "most-imported" | "entry-point";
        metric?: number;
    }>;
    dependencies: {
        topDirect: string[];
        peerProjects?: string[];
    };
    git: GitAnalysis;
    architecture: {
        summary: string;
        patterns: string[];
        conventions: string[];
    };
}
export interface TechStack {
    languages: Array<{
        name: string;
        percentage: number;
    }>;
    frameworks: string[];
    runtime: string;
    packageManager: string;
    buildTools: string[];
    testing: string[];
    database: string[];
    deployment: string[];
}
export interface ScanResult {
    totalFiles: number;
    totalDirectories: number;
    languageBreakdown: Map<string, number>;
    filesByExtension: Map<string, string[]>;
    allFiles: string[];
    structureType: "monorepo" | "single" | "workspace";
    workspaces: string[];
    entryPoints: string[];
    fileTreeSummary: string;
    largestFiles: Array<{
        path: string;
        loc: number;
    }>;
}
export interface GitAnalysis {
    totalCommits: number;
    activeContributors: number;
    mostActiveDirectories: string[];
    branchingModel?: "trunk" | "gitflow" | "unknown";
}
export interface GitAnalysisResult extends GitAnalysis {
    hotspots: Array<{
        path: string;
        commits: number;
    }>;
}
export interface ImportAnalysis {
    topImports: Array<{
        module: string;
        count: number;
    }>;
    mostImportedFiles: Array<{
        path: string;
        importCount: number;
    }>;
}
export interface ProfileConfig {
    /** Skip LLM summarization. Default: true (MVP has no LLM). */
    skipLLM?: boolean;
    /** Max files to scan. Default: 5000 */
    maxFiles?: number;
    /** Max depth for tree summary. Default: 4 */
    maxDepth?: number;
    /** Additional ignore patterns (gitignore-style). */
    extraIgnorePatterns?: string[];
    /** Force full rescan even if cached profile exists. */
    force?: boolean;
}
export interface ScanOptions {
    maxFiles?: number;
    maxDepth?: number;
    extraIgnorePatterns?: string[];
}
//# sourceMappingURL=types.d.ts.map