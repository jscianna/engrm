/**
 * User DNA Storage
 *
 * Persists User DNA to the filesystem.
 * Workspace-local with fallback to ~/.fathippo/user-dna.json.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import type { UserDNA } from "./types.js";

const USER_DNA_FILENAME = "user-dna.json";
const FATHIPPO_DIR = ".fathippo";

function resolveStoragePath(storageDir: string): string {
  return path.join(storageDir, FATHIPPO_DIR, USER_DNA_FILENAME);
}

function fallbackPath(): string {
  return path.join(homedir(), FATHIPPO_DIR, USER_DNA_FILENAME);
}

/**
 * Load User DNA from storage.
 * Tries workspace-local first, then falls back to ~/.fathippo/user-dna.json.
 */
export async function loadUserDNA(userId: string, storageDir: string): Promise<UserDNA | null> {
  const paths = [
    resolveStoragePath(storageDir),
    fallbackPath(),
  ];

  for (const filePath of paths) {
    try {
      if (!existsSync(filePath)) {
        continue;
      }
      const raw = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw) as UserDNA;
      if (parsed && parsed.version === 1 && parsed.userId === userId) {
        return parsed;
      }
    } catch {
      // Ignore read/parse errors, try next path
    }
  }

  return null;
}

/**
 * Save User DNA to storage.
 * Writes to workspace-local path first. Falls back to ~/.fathippo/ if workspace write fails.
 */
export async function saveUserDNA(dna: UserDNA, storageDir: string): Promise<void> {
  const primaryPath = resolveStoragePath(storageDir);
  const data = JSON.stringify(dna, null, 2);

  try {
    const dir = path.dirname(primaryPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(primaryPath, data, "utf-8");
    return;
  } catch {
    // Fall back to home directory
  }

  try {
    const fallback = fallbackPath();
    const dir = path.dirname(fallback);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(fallback, data, "utf-8");
  } catch (error) {
    console.error("[FatHippo] Failed to save User DNA:", error);
  }
}
