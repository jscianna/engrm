/**
 * Stable workspace ID derivation from git remote URL or path hash.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
export function deriveWorkspaceId(workspaceRoot) {
    // Try git remote first
    const remoteUrl = getGitRemoteUrl(workspaceRoot);
    if (remoteUrl) {
        const parsed = parseRemoteUrl(remoteUrl);
        if (parsed)
            return parsed;
    }
    // Fallback: hash of workspace path basename + parent
    const basename = path.basename(workspaceRoot);
    const parent = path.basename(path.dirname(workspaceRoot));
    const hashInput = `${parent}/${basename}`;
    const hash = createHash("sha256").update(hashInput).digest("hex").slice(0, 12);
    return `local:${hash}`;
}
function getGitRemoteUrl(workspaceRoot) {
    if (!existsSync(path.join(workspaceRoot, ".git")))
        return null;
    try {
        return execSync(`git -C "${workspaceRoot}" remote get-url origin`, {
            encoding: "utf-8",
            timeout: 5000,
            stdio: ["pipe", "pipe", "pipe"],
        }).trim();
    }
    catch {
        return null;
    }
}
function parseRemoteUrl(url) {
    // SSH: git@github.com:user/repo.git
    const sshMatch = url.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
    if (sshMatch) {
        const host = sshMatch[1];
        const userRepo = sshMatch[2];
        return formatHostedId(host, userRepo);
    }
    // HTTPS: https://github.com/user/repo.git
    const httpsMatch = url.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/);
    if (httpsMatch) {
        const host = httpsMatch[1];
        const userRepo = httpsMatch[2];
        return formatHostedId(host, userRepo);
    }
    return null;
}
function formatHostedId(host, userRepo) {
    if (host.includes("github"))
        return `gh:${userRepo}`;
    if (host.includes("gitlab"))
        return `gl:${userRepo}`;
    if (host.includes("bitbucket"))
        return `bb:${userRepo}`;
    // For other hosts, use abbreviated host + path
    const shortHost = host.replace(/\.com$|\.org$|\.io$/, "");
    return `${shortHost}:${userRepo}`;
}
//# sourceMappingURL=workspace-id.js.map