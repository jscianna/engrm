/**
 * Git history analysis: commit stats, hotspots, branching model.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { GitAnalysisResult } from "./types.js";

const GIT_TIMEOUT = 10_000; // 10 seconds max per git command

function git(workspaceRoot: string, args: string): string | null {
  try {
    return execSync(`git -C "${workspaceRoot}" ${args}`, {
      encoding: "utf-8",
      timeout: GIT_TIMEOUT,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

export async function analyzeGitHistory(workspaceRoot: string): Promise<GitAnalysisResult> {
  const emptyResult: GitAnalysisResult = {
    totalCommits: 0,
    activeContributors: 0,
    mostActiveDirectories: [],
    branchingModel: "unknown",
    hotspots: [],
  };

  // Check if it's a git repo
  if (!existsSync(path.join(workspaceRoot, ".git"))) {
    return emptyResult;
  }

  // Total commits
  const commitCountStr = git(workspaceRoot, "rev-list --count HEAD");
  const totalCommits = commitCountStr ? parseInt(commitCountStr, 10) : 0;
  if (!totalCommits || isNaN(totalCommits)) {
    return emptyResult;
  }

  // Active contributors (last 90 days)
  const contributorsStr = git(workspaceRoot, 'shortlog -sn --since="90 days ago" HEAD');
  const activeContributors = contributorsStr
    ? contributorsStr.split("\n").filter((line) => line.trim()).length
    : 0;

  // Most changed files (hotspots)
  const hotspotStr = git(
    workspaceRoot,
    "log --format= --name-only --diff-filter=ACMR -n 500 HEAD",
  );
  const hotspots = computeHotspots(hotspotStr);

  // Most active directories
  const mostActiveDirectories = computeActiveDirectories(hotspotStr);

  // Branching model
  const branchingModel = detectBranchingModel(workspaceRoot);

  // HEAD SHA
  const headSha = git(workspaceRoot, "rev-parse HEAD");

  return {
    totalCommits,
    activeContributors,
    mostActiveDirectories,
    branchingModel,
    hotspots,
  };
}

export function getHeadCommit(workspaceRoot: string): string | undefined {
  if (!existsSync(path.join(workspaceRoot, ".git"))) return undefined;
  const sha = git(workspaceRoot, "rev-parse HEAD");
  return sha ?? undefined;
}

function computeHotspots(
  logOutput: string | null,
): Array<{ path: string; commits: number }> {
  if (!logOutput) return [];

  const fileCounts = new Map<string, number>();
  for (const line of logOutput.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Skip binary files and node_modules
    if (trimmed.includes("node_modules/") || trimmed.includes(".git/")) continue;
    fileCounts.set(trimmed, (fileCounts.get(trimmed) ?? 0) + 1);
  }

  return [...fileCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([filePath, commits]) => ({ path: filePath, commits }));
}

function computeActiveDirectories(logOutput: string | null): string[] {
  if (!logOutput) return [];

  const dirCounts = new Map<string, number>();
  for (const line of logOutput.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.includes("node_modules/") || trimmed.includes(".git/")) continue;

    const dir = path.dirname(trimmed);
    if (dir === ".") continue;

    // Use top-level directory grouping
    const topDir = trimmed.split("/").slice(0, 2).join("/");
    if (topDir) {
      dirCounts.set(topDir + "/", (dirCounts.get(topDir + "/") ?? 0) + 1);
    }
  }

  return [...dirCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([dir]) => dir);
}

function detectBranchingModel(workspaceRoot: string): "trunk" | "gitflow" | "unknown" {
  const branchesStr = git(workspaceRoot, "branch -a --format='%(refname:short)'");
  if (!branchesStr) return "unknown";

  const branches = branchesStr.split("\n").map((b) => b.trim().replace(/^'|'$/g, ""));

  const hasMain = branches.some((b) => b === "main" || b === "master" || b.endsWith("/main") || b.endsWith("/master"));
  const hasDevelop = branches.some((b) => b === "develop" || b === "dev" || b.endsWith("/develop") || b.endsWith("/dev"));
  const hasRelease = branches.some((b) => b.startsWith("release/") || b.includes("/release/"));
  const hasFeature = branches.some((b) => b.startsWith("feature/") || b.includes("/feature/"));

  if (hasDevelop && (hasRelease || hasFeature)) {
    return "gitflow";
  }
  if (hasMain) {
    return "trunk";
  }
  return "unknown";
}
