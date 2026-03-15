/**
 * User DNA Storage
 *
 * Persists User DNA to the filesystem.
 * Workspace-local with fallback to ~/.fathippo/user-dna.json.
 */
import type { UserDNA } from "./types.js";
/**
 * Load User DNA from storage.
 * Tries workspace-local first, then falls back to ~/.fathippo/user-dna.json.
 */
export declare function loadUserDNA(userId: string, storageDir: string): Promise<UserDNA | null>;
/**
 * Save User DNA to storage.
 * Writes to workspace-local path first. Falls back to ~/.fathippo/ if workspace write fails.
 */
export declare function saveUserDNA(dna: UserDNA, storageDir: string): Promise<void>;
//# sourceMappingURL=storage.d.ts.map