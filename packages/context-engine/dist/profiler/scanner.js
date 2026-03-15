/**
 * File tree scanner with ignore patterns, LOC counting, and structure detection.
 */
import { readdir, readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
const DEFAULT_IGNORE = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    "__pycache__",
    ".venv",
    "target",
    "vendor",
    "coverage",
    ".turbo",
    ".cache",
    ".fathippo",
    ".DS_Store",
    ".idea",
    ".vscode",
]);
const EXTENSION_TO_LANGUAGE = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java",
    kt: "kotlin",
    rb: "ruby",
    php: "php",
    swift: "swift",
    c: "c",
    cpp: "c++",
    h: "c",
    hpp: "c++",
    cs: "c#",
    sql: "sql",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    css: "css",
    scss: "css",
    less: "css",
    html: "html",
    vue: "vue",
    svelte: "svelte",
    dart: "dart",
    lua: "lua",
    r: "r",
    R: "r",
    md: "markdown",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    xml: "xml",
    proto: "protobuf",
    graphql: "graphql",
    gql: "graphql",
    tf: "terraform",
    hcl: "terraform",
    sol: "solidity",
    zig: "zig",
    nim: "nim",
    ex: "elixir",
    exs: "elixir",
    erl: "erlang",
    hs: "haskell",
    ml: "ocaml",
    scala: "scala",
    clj: "clojure",
};
const MONOREPO_MARKERS = [
    "pnpm-workspace.yaml",
    "turbo.json",
    "nx.json",
    "lerna.json",
];
const WORKSPACE_MARKERS = [
    "pnpm-workspace.yaml",
    "lerna.json",
];
const ENTRY_POINT_DIRS = [
    "src",
    "app",
    "lib",
    "cmd",
    "pkg",
    "internal",
    "main",
    "server",
    "api",
];
export async function scanFileTree(workspaceRoot, options) {
    const maxFiles = options?.maxFiles ?? 5000;
    const maxDepth = options?.maxDepth ?? 4;
    const extraIgnore = new Set(options?.extraIgnorePatterns ?? []);
    const ignoreSet = new Set([...DEFAULT_IGNORE, ...extraIgnore]);
    const allFiles = [];
    const languageLOC = new Map();
    const filesByExtension = new Map();
    const largestFiles = [];
    let totalDirectories = 0;
    let fileCount = 0;
    async function walk(dir, depth) {
        if (fileCount >= maxFiles)
            return;
        let entries;
        try {
            entries = await readdir(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (fileCount >= maxFiles)
                break;
            if (ignoreSet.has(entry.name))
                continue;
            if (entry.name.startsWith(".") && entry.name !== ".github")
                continue;
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(workspaceRoot, fullPath);
            if (entry.isDirectory()) {
                totalDirectories++;
                await walk(fullPath, depth + 1);
            }
            else if (entry.isFile()) {
                fileCount++;
                allFiles.push(relativePath);
                const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
                const language = EXTENSION_TO_LANGUAGE[ext];
                if (language) {
                    // Count LOC
                    try {
                        const content = await readFile(fullPath, "utf-8");
                        const lines = content.split("\n").filter((line) => line.trim() && !line.trim().startsWith("//") && !line.trim().startsWith("#")).length;
                        languageLOC.set(language, (languageLOC.get(language) ?? 0) + lines);
                        const existing = filesByExtension.get(ext) ?? [];
                        existing.push(relativePath);
                        filesByExtension.set(ext, existing);
                        // Track largest files
                        if (lines > 100) {
                            largestFiles.push({ path: relativePath, loc: lines });
                        }
                    }
                    catch {
                        // Skip unreadable files
                    }
                }
            }
        }
    }
    await walk(workspaceRoot, 0);
    // Sort largest files
    largestFiles.sort((a, b) => b.loc - a.loc);
    // Detect structure type
    const structureType = detectStructureType(workspaceRoot);
    // Detect workspaces
    const workspaces = await detectWorkspaces(workspaceRoot);
    // Detect entry points
    const entryPoints = detectEntryPoints(workspaceRoot, allFiles);
    // Build file tree summary
    const fileTreeSummary = await buildFileTreeSummary(workspaceRoot, maxDepth, ignoreSet);
    // Compute language percentages
    const totalLOC = [...languageLOC.values()].reduce((sum, loc) => sum + loc, 0);
    const languageBreakdown = new Map();
    for (const [lang, loc] of languageLOC) {
        if (totalLOC > 0) {
            languageBreakdown.set(lang, Math.round((loc / totalLOC) * 100));
        }
    }
    return {
        totalFiles: fileCount,
        totalDirectories,
        languageBreakdown,
        filesByExtension,
        allFiles,
        structureType,
        workspaces,
        entryPoints,
        fileTreeSummary,
        largestFiles: largestFiles.slice(0, 20),
    };
}
function detectStructureType(workspaceRoot) {
    for (const marker of MONOREPO_MARKERS) {
        if (existsSync(path.join(workspaceRoot, marker))) {
            return "monorepo";
        }
    }
    // Check package.json workspaces field
    try {
        const pkgPath = path.join(workspaceRoot, "package.json");
        if (existsSync(pkgPath)) {
            const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
            if (pkg.workspaces) {
                return "workspace";
            }
        }
    }
    catch {
        // Not a problem
    }
    // Check for packages/ or apps/ directories
    if (existsSync(path.join(workspaceRoot, "packages")) ||
        existsSync(path.join(workspaceRoot, "apps"))) {
        // Has packages/apps dirs but no workspace config — probably monorepo
        if (existsSync(path.join(workspaceRoot, ".git"))) {
            return "monorepo";
        }
    }
    return "single";
}
async function detectWorkspaces(workspaceRoot) {
    const workspaces = [];
    // Check pnpm-workspace.yaml
    const pnpmWorkspacePath = path.join(workspaceRoot, "pnpm-workspace.yaml");
    if (existsSync(pnpmWorkspacePath)) {
        try {
            const content = await readFile(pnpmWorkspacePath, "utf-8");
            // Simple YAML parsing for packages list
            const matches = content.match(/- ['"]?([^'"*\n]+)/g);
            if (matches) {
                for (const match of matches) {
                    const wsPath = match.replace(/- ['"]?/, "").replace(/['"]$/, "").trim();
                    workspaces.push(wsPath);
                }
            }
        }
        catch {
            // Skip
        }
    }
    // Check package.json workspaces
    try {
        const pkgPath = path.join(workspaceRoot, "package.json");
        if (existsSync(pkgPath)) {
            const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
            const ws = Array.isArray(pkg.workspaces)
                ? pkg.workspaces
                : Array.isArray(pkg.workspaces?.packages)
                    ? pkg.workspaces.packages
                    : [];
            for (const w of ws) {
                if (typeof w === "string" && !w.includes("*")) {
                    workspaces.push(w);
                }
            }
        }
    }
    catch {
        // Skip
    }
    // If we have glob patterns, resolve actual directories
    if (workspaces.length === 0) {
        for (const dir of ["packages", "apps"]) {
            const dirPath = path.join(workspaceRoot, dir);
            if (existsSync(dirPath)) {
                try {
                    const entries = await readdir(dirPath, { withFileTypes: true });
                    for (const entry of entries) {
                        if (entry.isDirectory() && !entry.name.startsWith(".")) {
                            workspaces.push(`${dir}/${entry.name}`);
                        }
                    }
                }
                catch {
                    // Skip
                }
            }
        }
    }
    return workspaces;
}
function detectEntryPoints(workspaceRoot, allFiles) {
    const entryPoints = [];
    for (const dir of ENTRY_POINT_DIRS) {
        if (existsSync(path.join(workspaceRoot, dir))) {
            entryPoints.push(`${dir}/`);
        }
    }
    // Check for common entry files
    const entryFiles = [
        "index.ts",
        "index.js",
        "main.ts",
        "main.js",
        "main.go",
        "main.py",
        "main.rs",
        "App.tsx",
        "app.py",
        "manage.py",
    ];
    for (const file of entryFiles) {
        if (allFiles.some((f) => f === file || f.endsWith(`/${file}`))) {
            const found = allFiles.find((f) => f === file || f.endsWith(`/src/${file}`));
            if (found) {
                entryPoints.push(found);
            }
        }
    }
    return [...new Set(entryPoints)].slice(0, 10);
}
async function buildFileTreeSummary(workspaceRoot, maxDepth, ignoreSet) {
    const lines = [];
    async function walk(dir, depth, prefix) {
        if (depth > maxDepth || lines.length >= 40)
            return;
        let entries;
        try {
            entries = await readdir(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        // Sort: directories first, then files
        const dirs = entries.filter((e) => e.isDirectory() && !ignoreSet.has(e.name) && !e.name.startsWith("."));
        const files = entries.filter((e) => e.isFile() && !e.name.startsWith("."));
        for (const d of dirs.sort((a, b) => a.name.localeCompare(b.name))) {
            if (lines.length >= 40)
                break;
            const childPath = path.join(dir, d.name);
            let childEntries = [];
            try {
                childEntries = await readdir(childPath);
            }
            catch {
                childEntries = [];
            }
            const count = childEntries.filter((e) => !ignoreSet.has(e)).length;
            lines.push(`${prefix}${d.name}/ (${count} items)`);
            await walk(childPath, depth + 1, prefix + "  ");
        }
        // Only show files at top level or if few
        if (depth <= 1 && files.length > 0) {
            const configFiles = files.filter((f) => /\.(json|ya?ml|toml|lock|config\.\w+)$/.test(f.name) ||
                f.name.startsWith("."));
            if (configFiles.length > 0 && configFiles.length <= 5) {
                for (const f of configFiles) {
                    if (lines.length >= 40)
                        break;
                    lines.push(`${prefix}${f.name}`);
                }
            }
        }
    }
    await walk(workspaceRoot, 0, "");
    return lines.join("\n");
}
//# sourceMappingURL=scanner.js.map