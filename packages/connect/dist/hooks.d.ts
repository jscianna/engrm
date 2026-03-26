/**
 * Git hooks management for FatHippo.
 *
 * Installs/removes a post-commit hook that auto-captures
 * commit context and sends it to FatHippo's remember API.
 */
export declare function install_hooks(target_dir: string): Promise<void>;
export declare function remove_hooks(target_dir: string): Promise<void>;
//# sourceMappingURL=hooks.d.ts.map