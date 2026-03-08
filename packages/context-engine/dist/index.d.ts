/**
 * FatHippo Context Engine for OpenClaw
 *
 * Encrypted agent memory with semantic search, Dream Cycle synthesis,
 * and tiered intelligence.
 *
 * Usage:
 *   openclaw plugins install @fathippo/context-engine
 *
 * Config:
 *   plugins:
 *     slots:
 *       contextEngine: "fathippo-context-engine"
 *     entries:
 *       fathippo-context-engine:
 *         enabled: true
 *         config:
 *           apiKey: "${FATHIPPO_API_KEY}"
 */
import { FatHippoContextEngine } from "./engine.js";
import type { FatHippoConfig } from "./types.js";
interface PluginAPI {
    registerContextEngine: (id: string, factory: () => FatHippoContextEngine | Promise<FatHippoContextEngine>) => void;
    getPluginConfig: () => FatHippoConfig | undefined;
    logger?: {
        info: (msg: string) => void;
        error: (msg: string) => void;
    };
}
/**
 * Plugin entry point
 */
export default function register(api: PluginAPI): void;
export { FatHippoContextEngine } from "./engine.js";
export type { FatHippoConfig, Memory, SearchResult } from "./types.js";
//# sourceMappingURL=index.d.ts.map