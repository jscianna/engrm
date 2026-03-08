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
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
/**
 * Plugin entry point
 */
export default function register(api: OpenClawPluginApi): void;
export { FatHippoContextEngine } from "./engine.js";
export type { FatHippoConfig, Memory, SearchResult } from "./types.js";
//# sourceMappingURL=index.d.ts.map