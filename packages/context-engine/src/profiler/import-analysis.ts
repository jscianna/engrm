/**
 * Import/require statement scanning across multiple languages.
 * Counts import frequency per module to identify actual dependency usage.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ImportAnalysis } from "./types.js";

// Regex patterns for import detection per language family
const JS_TS_IMPORT = /(?:import\s+(?:[\w{},*\s]+\s+from\s+)?['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;
const PYTHON_IMPORT = /(?:^from\s+([\w.]+)\s+import|^import\s+([\w.]+))/gm;
const GO_IMPORT = /(?:"([^"]+)")/g;
const RUST_USE = /^use\s+([\w:]+)/gm;
const C_INCLUDE = /^#include\s+[<"]([^>"]+)[>"]/gm;

const JS_TS_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs"]);
const PYTHON_EXTENSIONS = new Set(["py"]);
const GO_EXTENSIONS = new Set(["go"]);
const RUST_EXTENSIONS = new Set(["rs"]);
const C_EXTENSIONS = new Set(["c", "cpp", "h", "hpp"]);

/** Max file size to scan (skip very large files). */
const MAX_FILE_SIZE = 256 * 1024; // 256 KB

/** Max files to scan for imports. */
const MAX_FILES_TO_SCAN = 2000;

export async function analyzeImports(
  workspaceRoot: string,
  files: string[],
): Promise<ImportAnalysis> {
  const moduleCounts = new Map<string, number>();
  const fileImportCounts = new Map<string, number>();
  let scanned = 0;

  for (const file of files) {
    if (scanned >= MAX_FILES_TO_SCAN) break;

    const ext = file.split(".").pop()?.toLowerCase() ?? "";
    if (
      !JS_TS_EXTENSIONS.has(ext) &&
      !PYTHON_EXTENSIONS.has(ext) &&
      !GO_EXTENSIONS.has(ext) &&
      !RUST_EXTENSIONS.has(ext) &&
      !C_EXTENSIONS.has(ext)
    ) {
      continue;
    }

    const fullPath = path.join(workspaceRoot, file);
    let content: string;
    try {
      content = await readFile(fullPath, "utf-8");
      if (content.length > MAX_FILE_SIZE) continue;
    } catch {
      continue;
    }

    scanned++;
    const imports = extractImports(content, ext);
    let importCount = 0;

    for (const mod of imports) {
      const normalized = normalizeModule(mod, ext);
      if (!normalized) continue;
      moduleCounts.set(normalized, (moduleCounts.get(normalized) ?? 0) + 1);
      importCount++;
    }

    if (importCount > 0) {
      fileImportCounts.set(file, importCount);
    }
  }

  // Top imports by frequency
  const topImports = [...moduleCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([module, count]) => ({ module, count }));

  // Most imported files (files with most import statements referencing them)
  // Count how many times each local file is imported by others
  const localFileImports = new Map<string, number>();
  for (const [mod, count] of moduleCounts) {
    if (mod.startsWith("./") || mod.startsWith("../") || mod.startsWith("@/")) {
      localFileImports.set(mod, count);
    }
  }

  const mostImportedFiles = [...localFileImports.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([filePath, importCount]) => ({ path: filePath, importCount }));

  return {
    topImports,
    mostImportedFiles,
  };
}

function extractImports(content: string, ext: string): string[] {
  const imports: string[] = [];

  if (JS_TS_EXTENSIONS.has(ext)) {
    for (const match of content.matchAll(JS_TS_IMPORT)) {
      const mod = match[1] ?? match[2];
      if (mod) imports.push(mod);
    }
  } else if (PYTHON_EXTENSIONS.has(ext)) {
    for (const match of content.matchAll(PYTHON_IMPORT)) {
      const mod = match[1] ?? match[2];
      if (mod) imports.push(mod);
    }
  } else if (GO_EXTENSIONS.has(ext)) {
    // Find import blocks
    const importBlock = content.match(/import\s*\(([\s\S]*?)\)/);
    if (importBlock) {
      for (const match of importBlock[1].matchAll(GO_IMPORT)) {
        if (match[1]) imports.push(match[1]);
      }
    }
    // Single imports
    for (const match of content.matchAll(/^import\s+"([^"]+)"/gm)) {
      if (match[1]) imports.push(match[1]);
    }
  } else if (RUST_EXTENSIONS.has(ext)) {
    for (const match of content.matchAll(RUST_USE)) {
      if (match[1]) imports.push(match[1]);
    }
  } else if (C_EXTENSIONS.has(ext)) {
    for (const match of content.matchAll(C_INCLUDE)) {
      if (match[1]) imports.push(match[1]);
    }
  }

  return imports;
}

function normalizeModule(mod: string, ext: string): string | null {
  if (!mod || mod.length === 0) return null;

  if (JS_TS_EXTENSIONS.has(ext)) {
    // For relative imports, keep as-is
    if (mod.startsWith(".") || mod.startsWith("@/")) return mod;
    // For external deps, extract package name (handle scoped packages)
    if (mod.startsWith("@")) {
      const parts = mod.split("/");
      return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : mod;
    }
    // Plain module name
    return mod.split("/")[0] ?? mod;
  }

  if (PYTHON_EXTENSIONS.has(ext)) {
    // Return top-level package
    return mod.split(".")[0] ?? mod;
  }

  if (GO_EXTENSIONS.has(ext)) {
    // Return full module path but trim to meaningful prefix
    return mod;
  }

  if (RUST_EXTENSIONS.has(ext)) {
    // Return crate name (first part before ::)
    return mod.split("::")[0] ?? mod;
  }

  if (C_EXTENSIONS.has(ext)) {
    return mod;
  }

  return mod;
}
